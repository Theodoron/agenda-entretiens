import { describe, expect, it } from 'vitest';
import { buildStatistics, protectSmallCohorts, StatisticsService } from '../src/statistics';

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

  it('compte chaque motif sélectionné sans dupliquer le nombre de rendez-vous', () => {
    const result = buildStatistics([{
      studentId: 'a',
      status: 'BOOKED',
      reasons: ['Orientation-réorientation', 'Candidature formation'],
      component: 'Sciences',
      degree: 'Licence',
      academicYear: '2026-2027',
      createdAt: new Date('2026-01-01'),
      startsAt: new Date('2026-01-10'),
    }]);
    expect(result.totals.appointments).toBe(1);
    expect(result.reasons).toEqual([
      { label: 'Candidature formation', count: 1 },
      { label: 'Orientation-réorientation', count: 1 },
    ]);
  });

  it('masque les ventilations sous le seuil de confidentialité', () => {
    const base = { studentId: 'a', status: 'BOOKED', component: 'Sciences', degree: 'Licence', academicYear: '2026-2027', createdAt: new Date('2026-01-01'), startsAt: new Date('2026-01-10') };
    const statistics = buildStatistics([
      { ...base, reason: 'Orientation' },
      { ...base, studentId: 'b', reason: 'Orientation' },
      { ...base, studentId: 'c', reason: 'Santé' },
    ]);
    const protectedStatistics = protectSmallCohorts(statistics, 2);
    expect(protectedStatistics.reasons).toEqual([{ label: 'Orientation', count: 2 }]);
    expect(protectedStatistics.reasonByMonth[0]?.reasons).toEqual({ Orientation: 2 });
    expect(protectedStatistics.totals.appointments).toBe(3);
  });

  it('compte les entretiens par année dans chaque composante sans exposer les petites cohortes', () => {
    const base = { status: 'BOOKED', reason: 'Orientation', component: 'Faculté de Droit', degree: 'Licence — Droit', createdAt: new Date('2026-01-01'), startsAt: new Date('2026-01-10') };
    const statistics = buildStatistics([
      { ...base, studentId: 'a', academicYear: 'L1' },
      { ...base, studentId: 'a', academicYear: 'L1' },
      { ...base, studentId: 'b', academicYear: 'L1' },
      { ...base, studentId: 'c', academicYear: 'L2' },
    ]);
    const protectedStatistics = protectSmallCohorts(statistics, 2);

    expect(protectedStatistics.origins.academicYearsByComponent).toEqual([{
      component: 'Faculté de Droit',
      years: [{ label: 'L1', count: 3 }],
    }]);
  });

  it('limite les requêtes du conseiller à son propre périmètre', async () => {
    const calls: unknown[] = [];
    const prisma = {
      userRole: { findMany: async () => [{ role: { code: 'ADVISOR' } }] },
      appointment: { findMany: async (query: unknown) => { calls.push(query); return []; } },
      availability: { findMany: async (query: unknown) => { calls.push(query); return []; } },
      setting: { findUnique: async () => ({ value: 5 }) },
    };
    const result = await new StatisticsService(prisma as never).overview('advisor-1');
    expect(calls).toHaveLength(2);
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ where: { advisorId: 'advisor-1' } }),
      expect.objectContaining({ where: { advisorId: 'advisor-1' } }),
    ]));
    expect(result.privacy.scope).toBe('ADVISOR');
  });
});
