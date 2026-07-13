import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Param, Patch, Post, Req } from '@nestjs/common';
import { AppointmentMode, AppointmentStatus, Prisma } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { requireRole, requireUserId } from './current-user';
import { PrismaService } from './prisma.service';
import { canTransition } from './appointment-status.policy';

class BookAppointmentDto {
  @IsUUID() availabilityId!: string;
  @IsUUID() reasonId!: string;
  @IsString() @MinLength(3) @MaxLength(160) subject!: string;
  @IsString() @MinLength(10) @MaxLength(4000) description!: string;
  @IsOptional() @IsEnum(AppointmentMode) preferredMode?: AppointmentMode;
  @IsOptional() @IsString() @MaxLength(1000) accessibilityNeeds?: string;
}
class ChangeStatusDto {
  @IsEnum(AppointmentStatus) status!: AppointmentStatus;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async book(studentId: string, dto: BookAppointmentDto) {
    await requireRole(this.prisma, studentId, 'STUDENT');
    try {
      return await this.prisma.$transaction(async tx => {
        const slot = await tx.availability.findUnique({ where: { id: dto.availabilityId } });
        if (!slot || slot.startsAt <= new Date()) throw new BadRequestException('Ce créneau n’est plus disponible');
        const claimed = await tx.availability.updateMany({ where: { id: slot.id, version: slot.version, OR: [{ status: 'AVAILABLE' }, { status: 'HELD', heldByUserId: studentId, heldUntil: { gt: new Date() } }] }, data: { status: 'BOOKED', heldByUserId: null, heldUntil: null, version: { increment: 1 } } });
        if (claimed.count !== 1) throw new ConflictException('Ce créneau vient d’être réservé');
        const previous = await tx.appointment.findFirst({ where: { studentId, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } });
        const kind = !previous ? 'FIRST_WITH_SERVICE' : previous.advisorId === slot.advisorId ? 'FOLLOW_UP_SAME_ADVISOR' : 'SEEN_OTHER_ADVISOR';
        const request = await tx.interviewRequest.create({ data: { studentId, reasonId: dto.reasonId, subject: dto.subject, description: dto.description, preferredMode: dto.preferredMode ?? null, accessibilityNeeds: dto.accessibilityNeeds ?? null } });
        const appointment = await tx.appointment.create({ data: { availabilityId: slot.id, requestId: request.id, studentId, advisorId: slot.advisorId, kind } });
        await tx.appointmentStatusHistory.create({ data: { appointmentId: appointment.id, toStatus: 'BOOKED', actorId: studentId } });
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
    const appointment = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) throw new BadRequestException('Rendez-vous introuvable');
    const isStudent = appointment.studentId === userId;
    const isAdvisor = appointment.advisorId === userId;
    const isAdmin = !!await this.prisma.userRole.findFirst({ where: { userId, role: { code: 'ADMIN' } } });
    if (!isStudent && !isAdvisor && !isAdmin) throw new ForbiddenException();
    if (isStudent && dto.status !== 'CANCELLED_BY_STUDENT') throw new ForbiddenException('Un étudiant peut uniquement annuler son rendez-vous');
    if (isAdvisor && dto.status === 'CANCELLED_BY_STUDENT') throw new ForbiddenException();
    if (!canTransition(appointment.status, dto.status)) throw new BadRequestException(`Transition interdite : ${appointment.status} vers ${dto.status}`);
    return this.prisma.$transaction(async tx => {
      const updated = await tx.appointment.update({ where: { id, version: appointment.version }, data: { status: dto.status, version: { increment: 1 } } });
      if (dto.status.startsWith('CANCELLED')) await tx.availability.update({ where: { id: appointment.availabilityId }, data: { status: 'CANCELLED', version: { increment: 1 } } });
      await tx.appointmentStatusHistory.create({ data: { appointmentId: id, fromStatus: appointment.status, toStatus: dto.status, actorId: userId, reason: dto.reason ?? null } });
      await tx.outboxEvent.create({ data: { aggregateType: 'Appointment', aggregateId: id, type: 'appointment.status_changed', payload: { appointmentId: id, fromStatus: appointment.status, toStatus: dto.status } } });
      return updated;
    });
  }

  async mine(userId: string) {
    const roles = await this.prisma.userRole.findMany({ where: { userId }, select: { role: { select: { code: true } } } });
    const codes = roles.map(item => item.role.code);
    const where = codes.includes('ADMIN') ? {} : codes.includes('ADVISOR') ? { advisorId: userId } : { studentId: userId };
    return this.prisma.appointment.findMany({ where, orderBy: { availability: { startsAt: 'asc' } }, include: { availability: { include: { location: true } }, request: { include: { reason: true } }, advisor: { include: { user: { select: { firstName: true, lastName: true } } } }, student: { include: { user: { select: { firstName: true, lastName: true } } } } }, take: 100 });
  }

  async one(userId: string, id: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id }, include: { availability: { include: { location: true } }, request: { include: { reason: true } }, advisor: { include: { user: { select: { firstName: true, lastName: true } } } }, student: { include: { user: { select: { firstName: true, lastName: true } } } }, history: { orderBy: { createdAt: 'asc' } }, messages: { where: { visibility: 'SHARED' }, orderBy: { createdAt: 'asc' } }, sharedContents: true } });
    if (!appointment) throw new BadRequestException('Rendez-vous introuvable');
    const isAdmin = await this.prisma.userRole.findFirst({ where: { userId, role: { code: 'ADMIN' } } });
    if (!isAdmin && appointment.studentId !== userId && appointment.advisorId !== userId) throw new BadRequestException('Rendez-vous introuvable');
    return appointment;
  }
  async studentHistory(userId: string, studentId: string) {
    await requireRole(this.prisma, userId, 'ADVISOR');
    return this.prisma.appointment.findMany({ where: { advisorId: userId, studentId }, orderBy: { availability: { startsAt: 'asc' } }, include: { availability: true, request: true }, take: 100 });
  }
}

@Controller('v1/appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}
  @Post() book(@Req() req: Request, @Body() dto: BookAppointmentDto) { return this.appointments.book(requireUserId(req), dto); }
  @Get() mine(@Req() req: Request) { return this.appointments.mine(requireUserId(req)); }
  @Get('student/:studentId/history') history(@Req() req: Request, @Param('studentId') studentId: string) { return this.appointments.studentHistory(requireUserId(req), studentId); }
  @Get(':id') one(@Req() req: Request, @Param('id') id: string) { return this.appointments.one(requireUserId(req), id); }
  @Patch(':id/status') changeStatus(@Req() req: Request, @Param('id') id: string, @Body() dto: ChangeStatusDto) { return this.appointments.changeStatus(requireUserId(req), id, dto); }
}
