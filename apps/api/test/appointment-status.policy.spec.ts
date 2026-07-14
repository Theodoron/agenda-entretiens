import { describe, expect, it } from 'vitest';
import { assertTransition, canStudentAccessAppointment, canStudentCancel, canTransition, isCancellationReasonValid, shouldRepublishAvailability } from '../src/appointment-status.policy';
import { AppointmentsService } from '../src/appointments';

describe('machine d’états des rendez-vous', () => {
  it('autorise le parcours nominal', () => {
    expect(canTransition('BOOKED', 'CONFIRMED')).toBe(true);
    expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(true);
  });
  it('rend un statut terminal immuable', () => {
    expect(canTransition('COMPLETED', 'CONFIRMED')).toBe(false);
    expect(() => assertTransition('CANCELLED_BY_STUDENT', 'BOOKED')).toThrow('Transition de statut interdite');
  });
  it('permet de terminer une ancienne réservation considérée comme confirmée', () => {
    expect(canTransition('BOOKED', 'COMPLETED')).toBe(true);
  });
  it('masque à l’étudiant la fiche annulée par le conseiller', () => {
    expect(canStudentAccessAppointment('CANCELLED_BY_ADVISOR')).toBe(false);
    expect(canStudentAccessAppointment('CANCELLED_BY_ADMIN')).toBe(false);
    expect(canStudentAccessAppointment('CANCELLED_BY_STUDENT')).toBe(false);
    expect(canStudentAccessAppointment('CONFIRMED')).toBe(true);
  });
  it('exige un motif exploitable pour une annulation conseiller', () => {
    expect(isCancellationReasonValid('Indisponibilité exceptionnelle')).toBe(true);
    expect(isCancellationReasonValid('  ')).toBe(false);
    expect(isCancellationReasonValid()).toBe(false);
    expect(canTransition('BOOKED', 'CANCELLED_BY_ADMIN')).toBe(true);
  });
  it('remet uniquement un futur créneau annulé par l’étudiant à disposition', () => {
    const now = new Date('2026-07-13T10:00:00Z');
    expect(shouldRepublishAvailability('CANCELLED_BY_STUDENT', new Date('2026-07-14T10:00:00Z'), now)).toBe(true);
    expect(shouldRepublishAvailability('CANCELLED_BY_ADVISOR', new Date('2026-07-14T10:00:00Z'), now)).toBe(false);
    expect(shouldRepublishAvailability('CANCELLED_BY_STUDENT', new Date('2026-07-12T10:00:00Z'), now)).toBe(false);
  });

  it('respecte la limite de vingt-quatre heures pour une annulation étudiante', () => {
    const now = new Date('2026-07-13T10:00:00Z');
    expect(canStudentCancel(new Date('2026-07-14T10:00:00Z'), 24, now)).toBe(true);
    expect(canStudentCancel(new Date('2026-07-14T09:59:59Z'), 24, now)).toBe(false);
  });

  it('bloque côté service une annulation étudiante trop tardive', async () => {
    const startsAt = new Date(Date.now() + 23 * 60 * 60_000);
    const prisma = {
      appointment: {
        findUnique: async () => ({
          id: 'appointment-1', studentId: 'student-1', advisorId: 'advisor-1', availabilityId: 'availability-1',
          status: 'CONFIRMED', version: 1, availability: { startsAt },
        }),
      },
      userRole: { findFirst: async () => null },
    };
    const service = new AppointmentsService(prisma as never);
    await expect(service.changeStatus('student-1', 'appointment-1', {
      status: 'CANCELLED_BY_STUDENT', reason: 'Empêchement tardif',
    })).rejects.toThrow('24 h avant');
  });
});
