import { describe, expect, it } from 'vitest';
import { assertTransition, canStudentAccessAppointment, canTransition, isCancellationReasonValid } from '../src/appointment-status.policy';

describe('machine d’états des rendez-vous', () => {
  it('autorise le parcours nominal', () => {
    expect(canTransition('BOOKED', 'CONFIRMED')).toBe(true);
    expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(true);
  });
  it('rend un statut terminal immuable', () => {
    expect(canTransition('COMPLETED', 'CONFIRMED')).toBe(false);
    expect(() => assertTransition('CANCELLED_BY_STUDENT', 'BOOKED')).toThrow('Transition de statut interdite');
  });
  it('interdit de terminer un rendez-vous non confirmé', () => {
    expect(canTransition('BOOKED', 'COMPLETED')).toBe(false);
  });
  it('masque à l’étudiant la fiche annulée par le conseiller', () => {
    expect(canStudentAccessAppointment('CANCELLED_BY_ADVISOR')).toBe(false);
    expect(canStudentAccessAppointment('CANCELLED_BY_ADMIN')).toBe(false);
    expect(canStudentAccessAppointment('CANCELLED_BY_STUDENT')).toBe(true);
    expect(canStudentAccessAppointment('CONFIRMED')).toBe(true);
  });
  it('exige un motif exploitable pour une annulation conseiller', () => {
    expect(isCancellationReasonValid('Indisponibilité exceptionnelle')).toBe(true);
    expect(isCancellationReasonValid('  ')).toBe(false);
    expect(isCancellationReasonValid()).toBe(false);
    expect(canTransition('BOOKED', 'CANCELLED_BY_ADMIN')).toBe(true);
  });
});
