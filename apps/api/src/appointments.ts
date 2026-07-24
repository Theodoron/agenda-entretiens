import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { AppointmentMode, AppointmentStatus, Prisma } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import nodemailer from 'nodemailer';
import { requireRole, requireUserId } from './current-user';
import { PrismaService } from './prisma.service';
import { canReactivateAppointment, canStudentAccessAppointment, canStudentCancel, canTransition, isCancellationReasonValid, shouldRepublishAvailability } from './appointment-status.policy';

class BookAppointmentDto {
  @IsUUID() availabilityId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @ArrayUnique() @IsUUID(undefined, { each: true }) reasonIds!: string[];
  @IsString() @MinLength(10) @MaxLength(4000) description!: string;
  @IsOptional() @IsEnum(AppointmentMode) preferredMode?: AppointmentMode;
  @IsOptional() @IsString() @MaxLength(1000) accessibilityNeeds?: string;
}
class ChangeStatusDto {
  @IsEnum(AppointmentStatus) status!: AppointmentStatus;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(500) reason?: string;
}
class ArchiveAppointmentsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsUUID(undefined, { each: true }) ids!: string[];
  @IsBoolean() archived!: boolean;
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async notifyCancellation(eventId: string, studentId: string, appointmentId: string, startsAt: Date, reason: string, cancelledBy: 'votre conseiller' | 'un administrateur') {
    const student = await this.prisma.user.findUnique({ where: { id: studentId }, select: { email: true, firstName: true } });
    if (!student) return;
    const deduplicationKey = `${eventId}:${studentId}:email`;
    const notification = await this.prisma.notification.upsert({
      where: { deduplicationKey },
      update: {},
      create: { userId: studentId, channel: 'EMAIL', type: 'appointment.cancelled', status: 'PENDING', payload: { appointmentId, reason, cancelledBy }, scheduledAt: new Date(), deduplicationKey },
    });
    if (notification.status === 'SENT') return;
    const host = process.env.SMTP_HOST;
    if (!host) {
      await this.prisma.notification.update({ where: { id: notification.id }, data: { status: 'FAILED' } });
      return;
    }
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    const mailer = nodemailer.createTransport({ host, port, secure: port === 465, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000, ...(user && pass ? { auth: { user, pass } } : {}) });
    try {
      const formattedDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(startsAt);
      await mailer.sendMail({
        from: process.env.MAIL_FROM ?? 'Service orientation <orientation@example.test>',
        to: student.email,
        subject: 'Annulation de votre entretien',
        text: `Bonjour ${student.firstName},\n\nVotre entretien prévu le ${formattedDate} a été annulé par ${cancelledBy}.\n\nMotif : ${reason}\n\nVous pouvez réserver un nouveau créneau depuis votre espace CIDO.`,
      });
      await this.prisma.notification.update({ where: { id: notification.id }, data: { status: 'SENT', sentAt: new Date() } });
    } catch {
      await this.prisma.notification.update({ where: { id: notification.id }, data: { status: 'FAILED' } });
    }
  }

  private async notifyReactivation(eventId: string, studentId: string, appointmentId: string, startsAt: Date) {
    await this.prisma.notification.upsert({
      where: { deduplicationKey: `${eventId}:${studentId}:in-app` },
      update: {},
      create: { userId: studentId, channel: 'IN_APP', type: 'appointment.reactivated', status: 'PENDING', payload: { appointmentId }, scheduledAt: new Date(), deduplicationKey: `${eventId}:${studentId}:in-app` },
    });
    const student = await this.prisma.user.findUnique({ where: { id: studentId }, select: { email: true, firstName: true } });
    if (!student) return;
    const deduplicationKey = `${eventId}:${studentId}:email`;
    const notification = await this.prisma.notification.upsert({
      where: { deduplicationKey },
      update: {},
      create: { userId: studentId, channel: 'EMAIL', type: 'appointment.reactivated', status: 'PENDING', payload: { appointmentId }, scheduledAt: new Date(), deduplicationKey },
    });
    if (notification.status === 'SENT') return;
    const host = process.env.SMTP_HOST;
    if (!host) {
      await this.prisma.notification.update({ where: { id: notification.id }, data: { status: 'FAILED' } });
      return;
    }
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    const mailer = nodemailer.createTransport({ host, port, secure: port === 465, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000, ...(user && pass ? { auth: { user, pass } } : {}) });
    try {
      const formattedDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(startsAt);
      await mailer.sendMail({
        from: process.env.MAIL_FROM ?? 'Service orientation <orientation@example.test>',
        to: student.email,
        subject: 'Réactivation de votre entretien',
        text: `Bonjour ${student.firstName},\n\nVotre entretien prévu le ${formattedDate} est de nouveau confirmé.\n\nVous le retrouverez dans votre espace CIDO.`,
      });
      await this.prisma.notification.update({ where: { id: notification.id }, data: { status: 'SENT', sentAt: new Date() } });
    } catch {
      await this.prisma.notification.update({ where: { id: notification.id }, data: { status: 'FAILED' } });
    }
  }

  async book(studentId: string, dto: BookAppointmentDto) {
    await requireRole(this.prisma, studentId, 'STUDENT');
    try {
      return await this.prisma.$transaction(async tx => {
        const reasonCount = await tx.interviewReason.count({ where: { id: { in: dto.reasonIds }, active: true } });
        if (reasonCount !== dto.reasonIds.length) throw new BadRequestException('Veuillez sélectionner au moins un motif valide');
        const slot = await tx.availability.findUnique({ where: { id: dto.availabilityId } });
        if (!slot || slot.startsAt <= new Date()) throw new BadRequestException('Ce créneau n’est plus disponible');
        const claimed = await tx.availability.updateMany({ where: { id: slot.id, version: slot.version, OR: [{ status: 'AVAILABLE' }, { status: 'HELD', heldByUserId: studentId, heldUntil: { gt: new Date() } }] }, data: { status: 'BOOKED', heldByUserId: null, heldUntil: null, version: { increment: 1 } } });
        if (claimed.count !== 1) throw new ConflictException('Ce créneau vient d’être réservé');
        const previous = await tx.appointment.findFirst({ where: { studentId, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } });
        const kind = !previous ? 'FIRST_WITH_SERVICE' : previous.advisorId === slot.advisorId ? 'FOLLOW_UP_SAME_ADVISOR' : 'SEEN_OTHER_ADVISOR';
        const request = await tx.interviewRequest.create({ data: { studentId, subject: dto.description, description: dto.description, preferredMode: dto.preferredMode ?? null, accessibilityNeeds: dto.accessibilityNeeds ?? null, reasons: { create: dto.reasonIds.map(reasonId => ({ reasonId })) } } });
        const appointment = await tx.appointment.create({ data: { availabilityId: slot.id, requestId: request.id, studentId, advisorId: slot.advisorId, kind, status: 'CONFIRMED' } });
        await tx.appointmentStatusHistory.create({ data: { appointmentId: appointment.id, toStatus: 'CONFIRMED', actorId: studentId } });
        await tx.outboxEvent.create({ data: { aggregateType: 'Appointment', aggregateId: appointment.id, type: 'appointment.booked', payload: { appointmentId: appointment.id, studentId, advisorId: slot.advisorId } } });
        return appointment;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ConflictException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) throw new ConflictException('Ce créneau vient d’être réservé');
      throw error;
    }
  }

  async changeStatus(userId: string, id: string, dto: ChangeStatusDto) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id }, include: { availability: true } });
    if (!appointment) throw new BadRequestException('Rendez-vous introuvable');
    const isStudent = appointment.studentId === userId;
    const isAdvisor = appointment.advisorId === userId;
    const isAdmin = !!await this.prisma.userRole.findFirst({ where: { userId, role: { code: 'ADMIN' } } });
    if (!isStudent && !isAdvisor && !isAdmin) throw new ForbiddenException();
    if (isStudent && dto.status !== 'CANCELLED_BY_STUDENT') throw new ForbiddenException('Un étudiant peut uniquement annuler son rendez-vous');
    const configuredCancellationHours = Number(process.env.STUDENT_CANCELLATION_HOURS ?? 24);
    const cancellationHours = Number.isFinite(configuredCancellationHours) && configuredCancellationHours >= 0 ? configuredCancellationHours : 24;
    if (isStudent && dto.status === 'CANCELLED_BY_STUDENT' && !canStudentCancel(appointment.availability.startsAt, cancellationHours)) {
      throw new BadRequestException(`L’annulation étudiante est possible jusqu’à ${cancellationHours} h avant l’entretien`);
    }
    if (isAdvisor && (dto.status === 'CANCELLED_BY_STUDENT' || dto.status === 'CANCELLED_BY_ADMIN')) throw new ForbiddenException();
    if (isAdmin && !isStudent && !isAdvisor && dto.status.startsWith('CANCELLED') && dto.status !== 'CANCELLED_BY_ADMIN') throw new ForbiddenException('Un administrateur doit utiliser le statut d’annulation administrateur');
    const reason = dto.reason?.trim();
    if (dto.status.startsWith('CANCELLED') && !isCancellationReasonValid(reason)) throw new BadRequestException('Le motif d’annulation est obligatoire');
    if (!canTransition(appointment.status, dto.status)) throw new BadRequestException(`Transition interdite : ${appointment.status} vers ${dto.status}`);
    const result = await this.prisma.$transaction(async tx => {
      const updated = await tx.appointment.update({ where: { id, version: appointment.version }, data: { status: dto.status, version: { increment: 1 } } });
      let replacementAvailabilityId: string | undefined;
      if (dto.status.startsWith('CANCELLED')) {
        await tx.availability.update({ where: { id: appointment.availabilityId }, data: { status: 'CANCELLED', heldByUserId: null, heldUntil: null, version: { increment: 1 } } });
        if (shouldRepublishAvailability(dto.status, appointment.availability.startsAt)) {
          const replacement = await tx.availability.create({
            data: {
              advisorId: appointment.availability.advisorId,
              seriesId: appointment.availability.seriesId,
              locationId: appointment.availability.locationId,
              startsAt: appointment.availability.startsAt,
              endsAt: appointment.availability.endsAt,
              mode: appointment.availability.mode,
              videoUrl: appointment.availability.videoUrl,
              bufferMinutes: appointment.availability.bufferMinutes,
              status: 'AVAILABLE',
            },
          });
          replacementAvailabilityId = replacement.id;
        }
      }
      await tx.appointmentStatusHistory.create({ data: { appointmentId: id, fromStatus: appointment.status, toStatus: dto.status, actorId: userId, reason: reason ?? null } });
      const event = await tx.outboxEvent.create({ data: { aggregateType: 'Appointment', aggregateId: id, type: 'appointment.status_changed', payload: { appointmentId: id, studentId: appointment.studentId, advisorId: appointment.advisorId, fromStatus: appointment.status, toStatus: dto.status, ...(reason ? { reason } : {}), ...(replacementAvailabilityId ? { replacementAvailabilityId } : {}) } } });
      return { updated, eventId: event.id };
    });
    if ((dto.status === 'CANCELLED_BY_ADVISOR' || dto.status === 'CANCELLED_BY_ADMIN') && reason) {
      await this.notifyCancellation(result.eventId, appointment.studentId, id, appointment.availability.startsAt, reason, dto.status === 'CANCELLED_BY_ADMIN' ? 'un administrateur' : 'votre conseiller');
    }
    return result.updated;
  }

  async reactivate(userId: string, id: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id }, include: { availability: true } });
    if (!appointment) throw new BadRequestException('Rendez-vous introuvable');
    const isAdvisor = appointment.advisorId === userId;
    const isAdmin = !!await this.prisma.userRole.findFirst({ where: { userId, role: { code: 'ADMIN' } } });
    if (!isAdvisor && !isAdmin) throw new ForbiddenException();
    if (isAdvisor && !isAdmin && appointment.status !== 'CANCELLED_BY_ADVISOR') {
      throw new ForbiddenException('Un conseiller peut uniquement réactiver un entretien qu’il a annulé');
    }
    if (!canReactivateAppointment(appointment.status, appointment.availability.startsAt)) {
      throw new BadRequestException('Seul un entretien futur annulé par un conseiller ou un administrateur peut être réactivé');
    }
    if (appointment.availability.status !== 'CANCELLED') {
      throw new ConflictException('Le créneau de cet entretien n’est plus récupérable');
    }

    try {
      const result = await this.prisma.$transaction(async tx => {
        const overlappingAvailability = await tx.availability.count({
          where: {
            id: { not: appointment.availabilityId },
            advisorId: appointment.advisorId,
            status: { in: ['AVAILABLE', 'HELD', 'BOOKED'] },
            startsAt: { lt: appointment.availability.endsAt },
            endsAt: { gt: appointment.availability.startsAt },
          },
        });
        if (overlappingAvailability > 0) {
          throw new ConflictException('Le créneau est désormais occupé ou chevauche une autre disponibilité');
        }

        const restoredSlot = await tx.availability.updateMany({
          where: { id: appointment.availabilityId, version: appointment.availability.version, status: 'CANCELLED' },
          data: { status: 'BOOKED', heldByUserId: null, heldUntil: null, version: { increment: 1 } },
        });
        const restoredAppointment = await tx.appointment.updateMany({
          where: { id, version: appointment.version, status: appointment.status },
          data: { status: 'CONFIRMED', archivedAt: null, archivedById: null, version: { increment: 1 } },
        });
        if (restoredSlot.count !== 1 || restoredAppointment.count !== 1) {
          throw new ConflictException('L’entretien a été modifié entre-temps');
        }

        await tx.appointmentStatusHistory.create({
          data: { appointmentId: id, fromStatus: appointment.status, toStatus: 'CONFIRMED', actorId: userId, reason: 'Réactivation après annulation' },
        });
        const event = await tx.outboxEvent.create({
          data: {
            aggregateType: 'Appointment',
            aggregateId: id,
            type: 'appointment.reactivated',
            payload: { appointmentId: id, studentId: appointment.studentId, advisorId: appointment.advisorId, fromStatus: appointment.status, toStatus: 'CONFIRMED' },
          },
        });
        return { eventId: event.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      await this.notifyReactivation(result.eventId, appointment.studentId, id, appointment.availability.startsAt);
      return { id, status: AppointmentStatus.CONFIRMED };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof ForbiddenException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('L’entretien a été modifié entre-temps');
      }
      throw error;
    }
  }

  async mine(userId: string) {
    const roles = await this.prisma.userRole.findMany({ where: { userId }, select: { role: { select: { code: true } } } });
    const codes = roles.map(item => item.role.code);
    const where = codes.includes('ADMIN') ? {} : codes.includes('ADVISOR') ? { advisorId: userId } : { studentId: userId };
    return this.prisma.appointment.findMany({ where, orderBy: { availability: { startsAt: 'asc' } }, include: { availability: { include: { location: true } }, request: { include: { reasons: { include: { reason: true }, orderBy: { reason: { sortOrder: 'asc' } } } } }, advisor: { include: { user: { select: { firstName: true, lastName: true } } } }, student: { include: { user: { select: { firstName: true, lastName: true } } } } }, take: 100 });
  }

  async one(userId: string, id: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id }, include: { availability: { include: { location: true } }, request: { include: { reasons: { include: { reason: true }, orderBy: { reason: { sortOrder: 'asc' } } } } }, advisor: { include: { user: { select: { firstName: true, lastName: true } } } }, student: { include: { user: { select: { firstName: true, lastName: true } }, component: true, degree: true, academicYear: true } }, history: { orderBy: { createdAt: 'asc' } }, messages: { where: { visibility: 'SHARED' }, orderBy: { createdAt: 'asc' } }, sharedContents: true } });
    if (!appointment) throw new BadRequestException('Rendez-vous introuvable');
    const isAdmin = !!await this.prisma.userRole.findFirst({ where: { userId, role: { code: 'ADMIN' } } });
    if (!isAdmin && appointment.studentId !== userId && appointment.advisorId !== userId) throw new BadRequestException('Rendez-vous introuvable');
    if (!isAdmin && appointment.studentId === userId && !canStudentAccessAppointment(appointment.status)) throw new NotFoundException('Fiche entretien indisponible');
    return appointment;
  }
  async studentHistory(userId: string, studentId: string) {
    await requireRole(this.prisma, userId, 'ADVISOR');
    return this.prisma.appointment.findMany({ where: { advisorId: userId, studentId }, orderBy: { availability: { startsAt: 'asc' } }, include: { availability: true, request: true, history: { orderBy: { createdAt: 'asc' } } }, take: 100 });
  }

  async updateArchive(userId: string, dto: ArchiveAppointmentsDto) {
    await requireRole(this.prisma, userId, 'ADVISOR');
    const now = new Date();
    const archiveState = dto.archived ? { archivedAt: null } : { archivedAt: { not: null } };
    const where = {
      id: { in: dto.ids },
      advisorId: userId,
      ...archiveState,
      OR: [
        { status: { notIn: [AppointmentStatus.BOOKED, AppointmentStatus.CONFIRMED] } },
        { availability: { startsAt: { lt: now } } },
      ],
    };
    return this.prisma.$transaction(async tx => {
      const result = await tx.appointment.updateMany({
        where,
        data: dto.archived
          ? { archivedAt: now, archivedById: userId }
          : { archivedAt: null, archivedById: null },
      });
      if (result.count !== dto.ids.length) {
        throw new BadRequestException('La sélection contient un entretien introuvable, à venir ou déjà traité');
      }
      return { count: result.count };
    });
  }
}

@Controller('v1/appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}
  @Post() book(@Req() req: Request, @Body() dto: BookAppointmentDto) { return this.appointments.book(requireUserId(req), dto); }
  @Get() mine(@Req() req: Request) { return this.appointments.mine(requireUserId(req)); }
  @Get('student/:studentId/history') history(@Req() req: Request, @Param('studentId') studentId: string) { return this.appointments.studentHistory(requireUserId(req), studentId); }
  @Patch('archive') archive(@Req() req: Request, @Body() dto: ArchiveAppointmentsDto) { return this.appointments.updateArchive(requireUserId(req), dto); }
  @Get(':id') one(@Req() req: Request, @Param('id') id: string) { return this.appointments.one(requireUserId(req), id); }
  @Patch(':id/reactivate') reactivate(@Req() req: Request, @Param('id') id: string) { return this.appointments.reactivate(requireUserId(req), id); }
  @Patch(':id/status') changeStatus(@Req() req: Request, @Param('id') id: string, @Body() dto: ChangeStatusDto) { return this.appointments.changeStatus(requireUserId(req), id, dto); }
}
