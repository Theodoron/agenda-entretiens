import { describe, expect, it, vi } from 'vitest';
import { assertTransition, canReactivateAppointment, canStudentAccessAppointment, canStudentCancel, canTransition, isCancellationReasonValid, shouldRepublishAvailability } from '../src/appointment-status.policy';
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

  it('réactive uniquement une annulation conseiller ou administrateur encore future', () => {
    const now = new Date('2026-07-13T10:00:00Z');
    const future = new Date('2026-07-14T10:00:00Z');
    expect(canReactivateAppointment('CANCELLED_BY_ADVISOR', future, now)).toBe(true);
    expect(canReactivateAppointment('CANCELLED_BY_ADMIN', future, now)).toBe(true);
    expect(canReactivateAppointment('CANCELLED_BY_STUDENT', future, now)).toBe(false);
    expect(canReactivateAppointment('CANCELLED_BY_ADVISOR', new Date('2026-07-12T10:00:00Z'), now)).toBe(false);
  });

  it('réactive un entretien conseiller et restaure son créneau dans une transaction', async () => {
    const startsAt = new Date(Date.now() + 48 * 60 * 60_000);
    const appointment = {
      id: 'appointment-1',
      studentId: 'student-1',
      advisorId: 'advisor-1',
      availabilityId: 'availability-1',
      status: 'CANCELLED_BY_ADVISOR',
      version: 2,
      availability: {
        id: 'availability-1',
        advisorId: 'advisor-1',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60_000),
        status: 'CANCELLED',
        version: 2,
      },
    };
    const historyCreate = vi.fn();
    const availabilityUpdate = vi.fn(async () => ({ count: 1 }));
    const appointmentUpdate = vi.fn(async () => ({ count: 1 }));
    const tx = {
      availability: { count: async () => 0, updateMany: availabilityUpdate },
      appointment: { updateMany: appointmentUpdate },
      appointmentStatusHistory: { create: historyCreate },
      outboxEvent: { create: async () => ({ id: 'event-1' }) },
    };
    const prisma = {
      appointment: { findUnique: async () => appointment },
      userRole: { findFirst: async () => null },
      user: { findUnique: async () => null },
      notification: { upsert: async () => ({ id: 'notification-1', status: 'PENDING' }) },
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    };

    const service = new AppointmentsService(prisma as never);
    await expect(service.reactivate('advisor-1', 'appointment-1')).resolves.toEqual({
      id: 'appointment-1',
      status: 'CONFIRMED',
    });
    expect(availabilityUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'BOOKED' }),
    }));
    expect(appointmentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CONFIRMED', archivedAt: null }),
    }));
    expect(historyCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fromStatus: 'CANCELLED_BY_ADVISOR', toStatus: 'CONFIRMED' }),
    }));
  });

  it('empêche le conseiller de réactiver une annulation administrative', async () => {
    const startsAt = new Date(Date.now() + 48 * 60 * 60_000);
    const prisma = {
      appointment: {
        findUnique: async () => ({
          id: 'appointment-1',
          studentId: 'student-1',
          advisorId: 'advisor-1',
          availabilityId: 'availability-1',
          status: 'CANCELLED_BY_ADMIN',
          version: 2,
          availability: { startsAt, status: 'CANCELLED' },
        }),
      },
      userRole: { findFirst: async () => null },
    };
    const service = new AppointmentsService(prisma as never);
    await expect(service.reactivate('advisor-1', 'appointment-1')).rejects.toThrow(
      'uniquement réactiver un entretien qu’il a annulé',
    );
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
