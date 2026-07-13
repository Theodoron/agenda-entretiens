import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { requireUserId } from './current-user';
import { PrismaService } from './prisma.service';

class ContentDto {
  @IsString() @MinLength(1) @MaxLength(4000) content!: string;
}

export function canReadInternalNote(isAdvisor: boolean, isAdmin: boolean): boolean {
  return isAdvisor || isAdmin;
}

function contentOf(dto: ContentDto) {
  const content = dto.content.trim();
  if (!content) throw new BadRequestException('Le contenu ne peut pas être vide');
  return content;
}

@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async access(userId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id: appointmentId }, select: { id: true, studentId: true, advisorId: true } });
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable');
    const isAdmin = !!await this.prisma.userRole.findFirst({ where: { userId, role: { code: 'ADMIN' } } });
    const isStudent = appointment.studentId === userId;
    const isAdvisor = appointment.advisorId === userId;
    if (!isStudent && !isAdvisor && !isAdmin) throw new NotFoundException('Rendez-vous introuvable');
    return { appointment, isStudent, isAdvisor, isAdmin };
  }

  async messages(userId: string, appointmentId: string) {
    await this.access(userId, appointmentId);
    return this.prisma.message.findMany({ where: { appointmentId, visibility: 'SHARED' }, orderBy: { createdAt: 'asc' } });
  }

  async addMessage(userId: string, appointmentId: string, dto: ContentDto) {
    await this.access(userId, appointmentId);
    return this.prisma.$transaction(async tx => {
      const message = await tx.message.create({ data: { appointmentId, authorId: userId, content: contentOf(dto), visibility: 'SHARED' } });
      await tx.outboxEvent.create({ data: { aggregateType: 'Appointment', aggregateId: appointmentId, type: 'appointment.message_added', payload: { appointmentId, messageId: message.id, authorId: userId } } });
      return message;
    });
  }

  async notes(userId: string, appointmentId: string) {
    const access = await this.access(userId, appointmentId);
    if (!canReadInternalNote(access.isAdvisor, access.isAdmin)) throw new ForbiddenException('Les notes internes sont réservées aux conseillers');
    return this.prisma.internalNote.findMany({ where: { appointmentId }, orderBy: { createdAt: 'asc' } });
  }

  async addNote(userId: string, appointmentId: string, dto: ContentDto) {
    const access = await this.access(userId, appointmentId);
    if (!canReadInternalNote(access.isAdvisor, access.isAdmin)) throw new ForbiddenException('Les notes internes sont réservées aux conseillers');
    return this.prisma.internalNote.create({ data: { appointmentId, authorId: userId, content: contentOf(dto) } });
  }

  async sharedContents(userId: string, appointmentId: string) {
    await this.access(userId, appointmentId);
    return this.prisma.sharedContent.findMany({ where: { appointmentId }, orderBy: { createdAt: 'asc' } });
  }

  async addSharedContent(userId: string, appointmentId: string, dto: ContentDto) {
    const access = await this.access(userId, appointmentId);
    if (!access.isAdvisor && !access.isAdmin) throw new ForbiddenException('Seul un conseiller peut publier une synthèse');
    return this.prisma.$transaction(async tx => {
      const sharedContent = await tx.sharedContent.create({ data: { appointmentId, authorId: userId, content: contentOf(dto) } });
      await tx.outboxEvent.create({ data: { aggregateType: 'Appointment', aggregateId: appointmentId, type: 'appointment.shared_content_added', payload: { appointmentId, sharedContentId: sharedContent.id, authorId: userId } } });
      return sharedContent;
    });
  }
}

@Controller('v1/appointments/:appointmentId')
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}
  @Get('messages') messages(@Req() req: Request, @Param('appointmentId') id: string) { return this.communications.messages(requireUserId(req), id); }
  @Post('messages') addMessage(@Req() req: Request, @Param('appointmentId') id: string, @Body() dto: ContentDto) { return this.communications.addMessage(requireUserId(req), id, dto); }
  @Get('internal-notes') notes(@Req() req: Request, @Param('appointmentId') id: string) { return this.communications.notes(requireUserId(req), id); }
  @Post('internal-notes') addNote(@Req() req: Request, @Param('appointmentId') id: string, @Body() dto: ContentDto) { return this.communications.addNote(requireUserId(req), id, dto); }
  @Get('shared-contents') sharedContents(@Req() req: Request, @Param('appointmentId') id: string) { return this.communications.sharedContents(requireUserId(req), id); }
  @Post('shared-contents') addSharedContent(@Req() req: Request, @Param('appointmentId') id: string, @Body() dto: ContentDto) { return this.communications.addSharedContent(requireUserId(req), id, dto); }
}
