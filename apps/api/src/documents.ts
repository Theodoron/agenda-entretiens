import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Req, ServiceUnavailableException, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { AttachmentScanStatus, Visibility } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { IsEnum } from 'class-validator';
import type { Request } from 'express';
import { requireUserId } from './current-user';
import { PrismaService } from './prisma.service';
import { canStudentAccessAppointment } from './appointment-status.policy';

const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/plain']);
export const isAllowedDocumentType = (mimeType: string) => allowedTypes.has(mimeType);

class ScanResultDto { @IsEnum(AttachmentScanStatus) status!: AttachmentScanStatus; }

@Injectable()
export class DocumentsService {
  private readonly storageEnabled = Boolean(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);
  private readonly bucket = process.env.S3_BUCKET ?? 'agenda-private';
  private readonly s3 = new S3Client({ region: process.env.S3_REGION ?? 'eu-west-3', endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' } });
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (!this.storageEnabled) return;
    try { await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket })); }
    catch { await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket })); }
  }

  private requireStorage() {
    if (!this.storageEnabled) throw new ServiceUnavailableException('Le stockage de documents n’est pas configuré sur cette démonstration');
  }

  private async access(userId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id: appointmentId }, select: { studentId: true, advisorId: true, status: true } });
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable');
    const isAdmin = !!await this.prisma.userRole.findFirst({ where: { userId, role: { code: 'ADMIN' } } });
    const isAdvisor = appointment.advisorId === userId;
    const isStudent = appointment.studentId === userId;
    if (!isAdmin && !isAdvisor && !isStudent) throw new NotFoundException('Rendez-vous introuvable');
    if (isStudent && !canStudentAccessAppointment(appointment.status)) throw new NotFoundException('Fiche entretien indisponible');
    return { isAdmin, isAdvisor, isStudent };
  }

  async upload(userId: string, appointmentId: string, file?: Express.Multer.File) {
    this.requireStorage();
    await this.access(userId, appointmentId);
    if (!file) throw new BadRequestException('Fichier requis');
    if (!isAllowedDocumentType(file.mimetype)) throw new BadRequestException('Type de fichier non autorisé');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('Le fichier dépasse 10 Mo');
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `quarantine/${appointmentId}/${randomUUID()}`;
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, Body: file.buffer, ContentType: file.mimetype, Metadata: { checksum } }));
    const attachment = await this.prisma.attachment.create({ data: { appointmentId, uploaderId: userId, storageKey, originalName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size, visibility: Visibility.SHARED, checksum } });
    await this.prisma.outboxEvent.create({ data: { aggregateType: 'Attachment', aggregateId: attachment.id, type: 'attachment.scan_requested', payload: { attachmentId: attachment.id, storageKey } } });
    return attachment;
  }

  async list(userId: string, appointmentId: string) {
    const access = await this.access(userId, appointmentId);
    return this.prisma.attachment.findMany({ where: { appointmentId, ...(access.isStudent ? { scanStatus: 'CLEAN' } : {}) }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true, scanStatus: true, scannedAt: true, createdAt: true, uploaderId: true }, orderBy: { createdAt: 'asc' } });
  }

  async scan(userId: string, id: string, status: AttachmentScanStatus) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundException('Document introuvable');
    const access = await this.access(userId, attachment.appointmentId);
    if (!access.isAdmin) throw new ForbiddenException('Validation réservée au service d’analyse');
    if (status === 'PENDING') throw new BadRequestException('Résultat d’analyse invalide');
    return this.prisma.attachment.update({ where: { id }, data: { scanStatus: status, scannedAt: new Date() } });
  }

  async download(userId: string, id: string) {
    this.requireStorage();
    const attachment = await this.prisma.attachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundException('Document introuvable');
    await this.access(userId, attachment.appointmentId);
    if (attachment.scanStatus !== 'CLEAN') throw new ForbiddenException('Le document n’est pas disponible avant la fin de son analyse');
    const object = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: attachment.storageKey }));
    if (!object.Body) throw new NotFoundException('Fichier introuvable dans le stockage');
    return { attachment, body: object.Body.transformToWebStream() };
  }
}

@Controller('v1')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}
  @Post('appointments/:appointmentId/documents') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(@Req() req: Request, @Param('appointmentId') id: string, @UploadedFile() file?: Express.Multer.File) { return this.documents.upload(requireUserId(req), id, file); }
  @Get('appointments/:appointmentId/documents') list(@Req() req: Request, @Param('appointmentId') id: string) { return this.documents.list(requireUserId(req), id); }
  @Post('documents/:id/scan-result') scan(@Req() req: Request, @Param('id') id: string, @Body() dto: ScanResultDto) { return this.documents.scan(requireUserId(req), id, dto.status); }
  @Get('documents/:id/download') async download(@Req() req: Request, @Param('id') id: string) { const result = await this.documents.download(requireUserId(req), id); return new StreamableFile(result.body as any, { type: result.attachment.mimeType, disposition: `attachment; filename*=UTF-8''${encodeURIComponent(result.attachment.originalName)}` }); }
}
