import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, Param, Post, Query, Req } from '@nestjs/common';
import { AppointmentMode } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, IsUrl, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { requireRole, requireUserId } from './current-user';
import { PrismaService } from './prisma.service';

class CreateAvailabilityDto {
  @IsDateString() startsAt!: string;
  @IsInt() @Min(15) @Max(240) durationMinutes!: number;
  @IsEnum(AppointmentMode) mode!: AppointmentMode;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUrl({ require_tld: false }) videoUrl?: string;
  @IsOptional() @IsInt() @Min(0) @Max(120) bufferMinutes?: number;
}

class CreateSeriesDto extends CreateAvailabilityDto {
  @IsInt() @Min(2) @Max(52) occurrences!: number;
}

class CreateBatchDto {
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsInt() @Min(15) @Max(240) durationMinutes!: number;
  @IsEnum(AppointmentMode) mode!: AppointmentMode;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUrl({ require_tld: false }) videoUrl?: string;
  @IsOptional() @IsInt() @Min(0) @Max(120) bufferMinutes?: number;
}

export function weeklySlots(first: Date, durationMinutes: number, occurrences: number) {
  return Array.from({ length: occurrences }, (_, index) => {
    const startsAt = new Date(first.getTime() + index * 7 * 24 * 60 * 60_000);
    return { startsAt, endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000) };
  });
}

export function slotsInRange(first: Date, rangeEnd: Date, durationMinutes: number, bufferMinutes = 0) {
  const slots: { startsAt: Date; endsAt: Date }[] = [];
  const duration = durationMinutes * 60_000;
  const step = (durationMinutes + bufferMinutes) * 60_000;
  for (let startsAt = first.getTime(); startsAt + duration <= rangeEnd.getTime(); startsAt += step) slots.push({ startsAt: new Date(startsAt), endsAt: new Date(startsAt + duration) });
  return slots;
}

@Injectable()
export class AvailabilitiesService {
  constructor(private readonly prisma: PrismaService) {}
  list(from?: string, to?: string) {
    const now = new Date();
    const startsAt = { gte: from ? new Date(from) : now, ...(to ? { lte: new Date(to) } : {}) };
    return this.prisma.availability.findMany({ where: { OR: [{ status: 'AVAILABLE' }, { status: 'HELD', heldUntil: { lt: now } }], startsAt }, orderBy: { startsAt: 'asc' }, take: 100, include: { advisor: { include: { user: { select: { firstName: true, lastName: true } } } }, location: true } });
  }
  async create(userId: string, dto: CreateAvailabilityDto) {
    await requireRole(this.prisma, userId, 'ADVISOR');
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + dto.durationMinutes * 60_000);
    if (startsAt <= new Date()) throw new BadRequestException('Le créneau doit être dans le futur');
    if (dto.mode === 'VIDEO' && !dto.videoUrl) throw new BadRequestException('Un lien est requis pour la visioconférence');
    const conflict = await this.prisma.availability.findFirst({ where: { advisorId: userId, status: { in: ['AVAILABLE', 'HELD', 'BOOKED'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
    if (conflict) throw new BadRequestException('Ce créneau chevauche une disponibilité existante');
    return this.prisma.availability.create({ data: { advisorId: userId, startsAt, endsAt, mode: dto.mode, locationId: dto.locationId ?? null, videoUrl: dto.videoUrl ?? null, bufferMinutes: dto.bufferMinutes ?? 0 } });
  }
  async createSeries(userId: string, dto: CreateSeriesDto) {
    await requireRole(this.prisma, userId, 'ADVISOR');
    const first = new Date(dto.startsAt);
    if (first <= new Date()) throw new BadRequestException('Le premier créneau doit être dans le futur');
    const slots = weeklySlots(first, dto.durationMinutes, dto.occurrences);
    const conflict = await this.prisma.availability.findFirst({ where: { advisorId: userId, status: { in: ['AVAILABLE', 'HELD', 'BOOKED'] }, OR: slots.map(slot => ({ startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.startsAt } })) } });
    if (conflict) throw new ConflictException('Un créneau de la série chevauche une disponibilité existante');
    return this.prisma.$transaction(async tx => {
      const series = await tx.availabilitySeries.create({ data: { advisorId: userId, recurrenceRule: `FREQ=WEEKLY;COUNT=${dto.occurrences}`, startsOn: first, endsOn: slots.at(-1)!.startsAt } });
      await tx.availability.createMany({ data: slots.map(slot => ({ ...slot, advisorId: userId, seriesId: series.id, mode: dto.mode, locationId: dto.locationId ?? null, videoUrl: dto.videoUrl ?? null, bufferMinutes: dto.bufferMinutes ?? 0 })) });
      return tx.availabilitySeries.findUniqueOrThrow({ where: { id: series.id }, include: { slots: { orderBy: { startsAt: 'asc' } } } });
    });
  }
  async advisorSchedule(userId: string) {
    await requireRole(this.prisma, userId, 'ADVISOR');
    const slots = await this.prisma.availability.findMany({ where: { advisorId: userId, startsAt: { gte: new Date() }, status: { in: ['AVAILABLE', 'HELD', 'BOOKED'] } }, orderBy: { startsAt: 'asc' }, include: { appointment: { include: { request: true, student: { include: { user: { select: { firstName: true, lastName: true } } } } } } } });
    const studentIds = [...new Set(slots.flatMap(slot => slot.appointment ? [slot.appointment.studentId] : []))];
    const counts = studentIds.length ? await this.prisma.appointment.groupBy({ by: ['studentId'], where: { studentId: { in: studentIds } }, _count: { _all: true } }) : [];
    const byStudent = new Map(counts.map(item => [item.studentId, item._count._all]));
    return slots.map(slot => ({ ...slot, appointment: slot.appointment ? { ...slot.appointment, historyCount: byStudent.get(slot.appointment.studentId) ?? 1 } : null }));
  }
  async createBatch(userId: string, dto: CreateBatchDto) {
    await requireRole(this.prisma, userId, 'ADVISOR');
    const startsAt = new Date(dto.startsAt), rangeEnd = new Date(dto.endsAt);
    if (startsAt <= new Date() || rangeEnd <= startsAt) throw new BadRequestException('La plage horaire est invalide');
    if (dto.mode === 'VIDEO' && !dto.videoUrl) throw new BadRequestException('Un lien est requis pour la visioconférence');
    const slots = slotsInRange(startsAt, rangeEnd, dto.durationMinutes, dto.bufferMinutes ?? 0);
    if (!slots.length) throw new BadRequestException('La plage est trop courte pour cette durée');
    const conflict = await this.prisma.availability.findFirst({ where: { advisorId: userId, status: { in: ['AVAILABLE', 'HELD', 'BOOKED'] }, OR: slots.map(slot => ({ startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.startsAt } })) } });
    if (conflict) throw new ConflictException('Cette plage chevauche des créneaux existants');
    await this.prisma.availability.createMany({ data: slots.map(slot => ({ ...slot, advisorId: userId, mode: dto.mode, locationId: dto.locationId ?? null, videoUrl: dto.videoUrl ?? null, bufferMinutes: dto.bufferMinutes ?? 0 })) });
    return { count: slots.length, slots };
  }
  async cancelFree(userId: string, id: string) {
    await requireRole(this.prisma, userId, 'ADVISOR');
    const cancelled = await this.prisma.availability.updateMany({ where: { id, advisorId: userId, status: 'AVAILABLE' }, data: { status: 'CANCELLED', version: { increment: 1 } } });
    if (cancelled.count !== 1) throw new ConflictException('Seul un créneau encore libre peut être annulé');
    return { id, status: 'CANCELLED' };
  }
}

@Controller('v1/availabilities')
export class AvailabilitiesController {
  constructor(private readonly availabilities: AvailabilitiesService) {}
  @Get() list(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) { requireUserId(req); return this.availabilities.list(from, to); }
  @Post() create(@Req() req: Request, @Body() dto: CreateAvailabilityDto) { return this.availabilities.create(requireUserId(req), dto); }
  @Post('series') createSeries(@Req() req: Request, @Body() dto: CreateSeriesDto) { return this.availabilities.createSeries(requireUserId(req), dto); }
  @Get('advisor/mine') advisorSchedule(@Req() req: Request) { return this.availabilities.advisorSchedule(requireUserId(req)); }
  @Post('batch') createBatch(@Req() req: Request, @Body() dto: CreateBatchDto) { return this.availabilities.createBatch(requireUserId(req), dto); }
  @Delete(':id') cancelFree(@Req() req: Request, @Param('id') id: string) { return this.availabilities.cancelFree(requireUserId(req), id); }
}
