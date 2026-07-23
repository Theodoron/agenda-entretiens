import { beforeAll, describe, expect, it } from 'vitest';
import { CalendarService, createCalendarToken, escapeIcsText, readCalendarToken, renderCalendar } from '../src/calendar';

beforeAll(() => {
  process.env.CALENDAR_SECRET = 'calendar-test-secret-with-more-than-32-characters';
});

describe('abonnement calendrier', () => {
  it('signe les liens et refuse un jeton modifié', () => {
    const token = createCalendarToken('user-1', 3);
    expect(readCalendarToken(token)).toEqual({ userId: 'user-1', version: 3 });
    expect(readCalendarToken(`${token}x`)).toBeNull();
  });

  it('échappe le contenu et produit un calendrier iCalendar', () => {
    const calendar = renderCalendar('Mes entretiens', [{
      uid: 'appointment-1@agenda-entretiens',
      startsAt: new Date('2026-07-20T08:00:00.000Z'),
      endsAt: new Date('2026-07-20T08:45:00.000Z'),
      summary: 'Entretien, orientation',
      description: ['Objet du rendez-vous : projet; mobilité'],
      sequence: 1,
    }], new Date('2026-07-14T12:00:00.000Z'));
    expect(escapeIcsText('a,b;c\nd')).toBe('a\\,b\\;c\\nd');
    expect(calendar).toContain('BEGIN:VCALENDAR\r\n');
    expect(calendar).toContain('SUMMARY:Entretien\\, orientation');
    expect(calendar).toContain('DESCRIPTION:Objet du rendez-vous : projet\\; mobilité');
    expect(calendar).toContain('DTSTART:20260720T080000Z');
    expect(calendar.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('réserve les données étudiantes au flux du conseiller', async () => {
    const advisorId = 'advisor-1';
    const studentId = 'student-1';
    const user = {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        status: 'ACTIVE',
        calendarTokenVersion: 0,
        roles: [{ role: { code: where.id === advisorId ? 'ADVISOR' : 'STUDENT' } }],
      }),
    };
    const bookedAvailability = {
      id: 'availability-1',
      advisorId,
      startsAt: new Date('2099-07-20T08:00:00.000Z'),
      endsAt: new Date('2099-07-20T08:45:00.000Z'),
      mode: 'VIDEO',
      videoUrl: 'https://visio.example.test/room',
      status: 'BOOKED',
      version: 2,
      location: null,
      appointment: {
        id: 'appointment-1',
        status: 'CONFIRMED',
        version: 1,
        updatedAt: new Date('2026-07-14T12:00:00.000Z'),
        request: {
          description: 'Mon projet',
          reasons: [
            { reason: { label: 'Orientation-réorientation' } },
            { reason: { label: 'Projet professionnel, débouchés' } },
          ],
        },
        student: { universityId: 'E12345', user: { firstName: 'Alice', lastName: 'Martin' } },
      },
    };
    const prisma = {
      user,
      availability: {
        findMany: async () => [
          bookedAvailability,
          {
            ...bookedAvailability,
            id: 'availability-2',
            status: 'AVAILABLE',
            appointment: null,
            startsAt: new Date('2099-07-20T09:00:00.000Z'),
            endsAt: new Date('2099-07-20T09:45:00.000Z'),
          },
        ],
      },
      appointment: {
        findMany: async () => [{
          ...bookedAvailability.appointment,
          studentId,
          availability: { ...bookedAvailability, appointment: undefined },
          advisor: { user: { firstName: 'Paul', lastName: 'Durand' } },
        }],
      },
    };
    const service = new CalendarService(prisma as never);

    const advisorFeed = await service.feed(`${createCalendarToken(advisorId, 0)}.ics`);
    const unfoldedAdvisorFeed = advisorFeed.replaceAll('\r\n ', '');
    expect(advisorFeed).toContain('Alice Martin');
    expect(advisorFeed).toContain('E12345');
    expect(unfoldedAdvisorFeed).toContain('Motif(s) : Orientation-réorientation\\, Projet professionnel\\, débouchés');
    expect(advisorFeed).toContain('SUMMARY:Créneau libre');

    const studentFeed = await service.feed(`${createCalendarToken(studentId, 0)}.ics`);
    expect(studentFeed).toContain('Entretien avec Paul Durand');
    expect(studentFeed).toContain('Mon projet');
    expect(studentFeed).toContain('https://visio.example.test/room');
    expect(studentFeed).not.toContain('E12345');
    expect(studentFeed).not.toContain('Créneau libre');
  });
});
