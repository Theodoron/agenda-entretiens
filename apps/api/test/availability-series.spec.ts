import { describe, expect, it } from 'vitest';
import { slotsInRange, weeklySlots } from '../src/availabilities';

describe('séries de disponibilités', () => {
  it('crée le nombre demandé de créneaux espacés de sept jours', () => {
    const slots = weeklySlots(new Date('2026-09-01T08:00:00.000Z'), 45, 4);
    expect(slots).toHaveLength(4);
    expect(slots[0]?.endsAt.toISOString()).toBe('2026-09-01T08:45:00.000Z');
    expect(slots[3]?.startsAt.toISOString()).toBe('2026-09-22T08:00:00.000Z');
  });
});

describe('créneaux dans une plage', () => {
  it('produit quatre rendez-vous d’une heure entre 8 h et 12 h', () => expect(slotsInRange(new Date('2026-09-02T08:00:00Z'), new Date('2026-09-02T12:00:00Z'), 60)).toHaveLength(4));
  it('produit trois rendez-vous de 45 minutes entre 14 h et 16 h 15', () => expect(slotsInRange(new Date('2026-09-03T14:00:00Z'), new Date('2026-09-03T16:15:00Z'), 45)).toHaveLength(3));
});
