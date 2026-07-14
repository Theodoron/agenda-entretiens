import { Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { requireUserId } from './current-user';
import { PrismaService } from './prisma.service';

type CalendarEvent = {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description: string[];
  location?: string | null;
  url?: string | null;
  transparent?: boolean;
  sequence: number;
  updatedAt?: Date;
};

const activeAppointmentStatuses = ['BOOKED', 'CONFIRMED'] as const;

function secret() {
  const value = process.env.CALENDAR_SECRET ?? process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new ServiceUnavailableException('Configuration du calendrier indisponible');
  return value;
}

function signature(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createCalendarToken(userId: string, version: number) {
  const payload = Buffer.from(`${userId}:${version}`, 'utf8').toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export function readCalendarToken(token: string) {
  const [payload, receivedSignature, extra] = token.split('.');
  if (!payload || !receivedSignature || extra) return null;
  const expectedSignature = signature(payload);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const separator = decoded.lastIndexOf(':');
    const userId = decoded.slice(0, separator);
    const version = Number(decoded.slice(separator + 1));
    if (!userId || separator < 1 || !Number.isSafeInteger(version) || version < 0) return null;
    return { userId, version };
  } catch {
    return null;
  }
}

export function escapeIcsText(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\r\n', '\\n')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}

function formatIcsDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function foldIcsLine(line: string) {
  const lines: string[] = [];
  let current = '';
  for (const character of line) {
    if (Buffer.byteLength(current + character, 'utf8') > 75) {
      lines.push(current);
      current = ` ${character}`;
    } else {
      current += character;
    }
  }
  lines.push(current);
  return lines.join('\r\n');
}

export function renderCalendar(name: string, events: CalendarEvent[], generatedAt = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Agenda Entretiens//CIDO//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(name)}`,
    'X-WR-TIMEZONE:Europe/Paris',
  ];
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(event.uid)}`,
      `DTSTAMP:${formatIcsDate(event.updatedAt ?? generatedAt)}`,
      `DTSTART:${formatIcsDate(event.startsAt)}`,
      `DTEND:${formatIcsDate(event.endsAt)}`,
      `SEQUENCE:${event.sequence}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
      `DESCRIPTION:${escapeIcsText(event.description.join('\n'))}`,
      `TRANSP:${event.transparent ? 'TRANSPARENT' : 'OPAQUE'}`,
      'STATUS:CONFIRMED',
    );
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

function modeLabel(mode: string) {
  return ({ IN_PERSON: 'Présentiel', PHONE: 'Téléphone', VIDEO: 'Visioconférence' } as Record<string, string>)[mode] ?? mode;
}

function eventLocation(availability: { mode: string; videoUrl: string | null; location: { name: string; address: string | null } | null }) {
  if (availability.mode === 'VIDEO') return 'Visioconférence';
  if (availability.mode === 'PHONE') return 'Téléphone';
  return availability.location ? [availability.location.name, availability.location.address].filter(Boolean).join(' — ') : 'Présentiel';
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  private async subscribableUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        calendarTokenVersion: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    const roles = user?.roles.map(item => item.role.code) ?? [];
    if (!user || user.status !== 'ACTIVE' || (!roles.includes('ADVISOR') && !roles.includes('STUDENT'))) throw new ForbiddenException('Abonnement calendrier indisponible');
    return { ...user, roles };
  }

  async subscription(userId: string) {
    const user = await this.subscribableUser(userId);
    return { url: `/api/v1/calendar/${createCalendarToken(user.id, user.calendarTokenVersion)}.ics` };
  }

  async rotate(userId: string) {
    await this.subscribableUser(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { calendarTokenVersion: { increment: 1 } },
      select: { id: true, calendarTokenVersion: true },
    });
    return { url: `/api/v1/calendar/${createCalendarToken(user.id, user.calendarTokenVersion)}.ics` };
  }

  private async advisorCalendar(userId: string, now: Date) {
    const slots = await this.prisma.availability.findMany({
      where: { advisorId: userId, startsAt: { gte: now }, status: { in: ['AVAILABLE', 'HELD', 'BOOKED'] } },
      orderBy: { startsAt: 'asc' },
      include: {
        location: true,
        appointment: {
          include: {
            request: { include: { reason: true } },
            student: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
      take: 500,
    });
    const events: CalendarEvent[] = [];
    for (const slot of slots) {
      const appointment = slot.appointment;
      if (appointment && activeAppointmentStatuses.includes(appointment.status as (typeof activeAppointmentStatuses)[number])) {
        const studentName = `${appointment.student.user.firstName} ${appointment.student.user.lastName}`;
        const description = [
          `Étudiant : ${studentName}`,
          `Numéro étudiant : ${appointment.student.universityId}`,
          `Objet : ${appointment.request.subject}`,
          `Motif : ${appointment.request.reason.label}`,
          `Modalité : ${modeLabel(slot.mode)}`,
        ];
        if (slot.videoUrl) description.push(`Visioconférence : ${slot.videoUrl}`);
        events.push({
          uid: `appointment-${appointment.id}@agenda-entretiens`,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          summary: `Entretien — ${studentName} (${appointment.student.universityId})`,
          description,
          location: eventLocation(slot),
          url: slot.videoUrl,
          sequence: appointment.version,
          updatedAt: appointment.updatedAt,
        });
      } else if (!appointment && (slot.status === 'AVAILABLE' || (slot.status === 'HELD' && (!slot.heldUntil || slot.heldUntil < now)))) {
        events.push({
          uid: `availability-${slot.id}@agenda-entretiens`,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          summary: 'Créneau libre',
          description: [`Créneau disponible`, `Modalité : ${modeLabel(slot.mode)}`],
          location: eventLocation(slot),
          url: slot.videoUrl,
          transparent: true,
          sequence: slot.version,
        });
      }
    }
    return renderCalendar('Entretiens et créneaux libres', events, now);
  }

  private async studentCalendar(userId: string, now: Date) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        studentId: userId,
        status: { in: [...activeAppointmentStatuses] },
        availability: { startsAt: { gte: now } },
      },
      orderBy: { availability: { startsAt: 'asc' } },
      include: {
        availability: { include: { location: true } },
        request: { include: { reason: true } },
        advisor: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      take: 20,
    });
    const events = appointments.map<CalendarEvent>(appointment => {
      const advisorName = `${appointment.advisor.user.firstName} ${appointment.advisor.user.lastName}`;
      const description = [
        `Conseiller : ${advisorName}`,
        `Objet : ${appointment.request.subject}`,
        `Motif : ${appointment.request.reason.label}`,
        `Modalité : ${modeLabel(appointment.availability.mode)}`,
      ];
      if (appointment.availability.videoUrl) description.push(`Visioconférence : ${appointment.availability.videoUrl}`);
      return {
        uid: `appointment-${appointment.id}@agenda-entretiens`,
        startsAt: appointment.availability.startsAt,
        endsAt: appointment.availability.endsAt,
        summary: `Entretien avec ${advisorName}`,
        description,
        location: eventLocation(appointment.availability),
        url: appointment.availability.videoUrl,
        sequence: appointment.version,
        updatedAt: appointment.updatedAt,
      };
    });
    return renderCalendar('Mes entretiens', events, now);
  }

  async feed(rawToken: string) {
    const token = rawToken.endsWith('.ics') ? rawToken.slice(0, -4) : rawToken;
    const decoded = readCalendarToken(token);
    if (!decoded) throw new NotFoundException('Calendrier introuvable');
    const user = await this.subscribableUser(decoded.userId);
    if (user.calendarTokenVersion !== decoded.version) throw new NotFoundException('Calendrier introuvable');
    const now = new Date();
    return user.roles.includes('ADVISOR') ? this.advisorCalendar(user.id, now) : this.studentCalendar(user.id, now);
  }
}

@Controller('v1/calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('subscription')
  subscription(@Req() request: Request) {
    return this.calendar.subscription(requireUserId(request));
  }

  @Post('subscription/rotate')
  rotate(@Req() request: Request) {
    return this.calendar.rotate(requireUserId(request));
  }

  @Get(':token')
  async feed(@Param('token') token: string, @Res({ passthrough: true }) response: Response) {
    const calendar = await this.calendar.feed(token);
    response.type('text/calendar; charset=utf-8');
    response.setHeader('Content-Disposition', 'inline; filename="agenda-entretiens.ics"');
    response.setHeader('Cache-Control', 'private, max-age=300');
    return calendar;
  }
}
