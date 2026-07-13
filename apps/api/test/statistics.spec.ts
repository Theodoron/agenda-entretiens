import { describe, expect, it } from 'vitest';
import { buildStatistics } from '../src/statistics';

describe('statistiques des entretiens', () => {
  it('calcule moyenne, récurrence et motifs mensuels', () => {
    const base = { status: 'BOOKED', reason: 'Orientation', component: 'Sciences', degree: 'Licence', academicYear: '2026-2027', createdAt: new Date('2026-01-01') };
    const result = buildStatistics([
      { ...base, studentId: 'a', startsAt: new Date('2026-01-10') }, { ...base, studentId: 'a', startsAt: new Date('2026-02-10') }, { ...base, studentId: 'b', startsAt: new Date('2026-02-11') },
    ]);
    expect(result.totals).toMatchObject({ appointments: 3, students: 2, repeatStudents: 1, averagePerStudent: 1.5 });
    expect(result.monthly).toEqual([{ label: '2026-01', count: 1 }, { label: '2026-02', count: 2 }]);
    expect(result.accessDelay.averageDays).toBeGreaterThan(0);
    expect(result.repeatReasons).toEqual([{ label: 'Orientation', count: 2 }]);
  });
});
