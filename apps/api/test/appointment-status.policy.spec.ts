import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition } from '../src/appointment-status.policy';

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
});
