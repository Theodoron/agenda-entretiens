import { Controller, ForbiddenException, Get, Injectable, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireUserId } from './current-user';
import { PrismaService } from './prisma.service';

type AnalyticsRow = { studentId: string; status: string; startsAt: Date; createdAt: Date; reason: string; component: string; degree: string; academicYear: string };
const countBy = (rows: AnalyticsRow[], key: (row: AnalyticsRow) => string) => Object.entries(rows.reduce<Record<string, number>>((result, row) => { const value = key(row); result[value] = (result[value] ?? 0) + 1; return result; }, {})).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));

export function buildStatistics(rows: AnalyticsRow[]) {
  const byStudent = rows.reduce<Record<string, AnalyticsRow[]>>((result, row) => { (result[row.studentId] ??= []).push(row); return result; }, {});
  const students = Object.values(byStudent);
  const uniqueStudents = students.flatMap(items => items[0] ? [items[0]] : []);
  const repeated = students.filter(items => items.length > 1);
  const repeatByComponent = Object.entries(students.reduce<Record<string, { students: number; appointments: number; repeated: number }>>((result, items) => { const component = items[0]?.component ?? 'Non renseignée'; const value = result[component] ??= { students: 0, appointments: 0, repeated: 0 }; value.students++; value.appointments += items.length; if (items.length > 1) value.repeated++; return result; }, {})).map(([label, value]) => ({ label, ...value, average: value.appointments / value.students }));
  const reasonByMonth = Object.entries(rows.reduce<Record<string, Record<string, number>>>((result, row) => { const month = row.startsAt.toISOString().slice(0, 7); const reasons = result[month] ??= {}; reasons[row.reason] = (reasons[row.reason] ?? 0) + 1; return result; }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([month, reasons]) => ({ month, reasons }));
  const delays = rows.map(row => Math.max(0, (row.startsAt.getTime() - row.createdAt.getTime()) / 86_400_000)).sort((a, b) => a - b);
  const medianDelay = delays.length ? (delays[Math.floor((delays.length - 1) / 2)]! + delays[Math.ceil((delays.length - 1) / 2)]!) / 2 : 0;
  const cancelledStatuses = new Set(['CANCELLED_BY_STUDENT', 'CANCELLED_BY_ADVISOR', 'RESCHEDULED']);
  const noShowStatuses = new Set(['STUDENT_NO_SHOW', 'ADVISOR_NO_SHOW']);
  const repeatedRows = rows.filter(row => (byStudent[row.studentId]?.length ?? 0) > 1);
  return {
    totals: { appointments: rows.length, students: students.length, repeatStudents: repeated.length, averagePerStudent: students.length ? rows.length / students.length : 0 },
    monthly: countBy(rows, row => row.startsAt.toISOString().slice(0, 7)).sort((a, b) => a.label.localeCompare(b.label)),
    statuses: countBy(rows, row => row.status), reasons: countBy(rows, row => row.reason), reasonByMonth,
    origins: { components: countBy(uniqueStudents, row => row.component), degrees: countBy(uniqueStudents, row => row.degree), academicYears: countBy(uniqueStudents, row => row.academicYear) },
    repeatByComponent,
    accessDelay: { averageDays: delays.length ? delays.reduce((sum, value) => sum + value, 0) / delays.length : 0, medianDays: medianDelay },
    cancellations: { cancelled: rows.filter(row => cancelledStatuses.has(row.status)).length, noShows: rows.filter(row => noShowStatuses.has(row.status)).length, rate: rows.length ? rows.filter(row => cancelledStatuses.has(row.status) || noShowStatuses.has(row.status)).length / rows.length : 0 },
    demand: { weekdays: countBy(rows, row => ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][row.startsAt.getDay()]!), hours: countBy(rows, row => `${String(row.startsAt.getHours()).padStart(2, '0')} h`) },
    repeatReasons: countBy(repeatedRows, row => row.reason),
  };
}

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}
  async overview(userId: string) {
    const roles = await this.prisma.userRole.findMany({ where: { userId }, select: { role: { select: { code: true } } } });
    const codes = roles.map(item => item.role.code);
    if (!codes.includes('ADVISOR') && !codes.includes('ADMIN')) throw new ForbiddenException();
    const [appointments, availabilities] = await Promise.all([this.prisma.appointment.findMany({ include: { availability: true, request: { include: { reason: true } }, student: { include: { component: true, degree: true, academicYear: true } } } }), this.prisma.availability.findMany({ select: { startsAt: true, status: true } })]);
    const rows: AnalyticsRow[] = appointments.map(item => ({ studentId: item.studentId, status: item.status, startsAt: item.availability.startsAt, createdAt: item.createdAt, reason: item.request.reason.label, component: item.student.component?.name ?? 'Non renseignée', degree: item.student.degree?.name ?? 'Non renseigné', academicYear: item.student.academicYear?.label ?? 'Non renseignée' }));
    const statistics = buildStatistics(rows);
    const occupancyByMonth = Object.entries(availabilities.filter(item => item.status !== 'CANCELLED').reduce<Record<string, { total: number; booked: number }>>((result, item) => { const month = item.startsAt.toISOString().slice(0, 7); const value = result[month] ??= { total: 0, booked: 0 }; value.total++; if (item.status === 'BOOKED') value.booked++; return result; }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, ...value, rate: value.total ? value.booked / value.total : 0 }));
    const totalSlots = occupancyByMonth.reduce((sum, item) => sum + item.total, 0), bookedSlots = occupancyByMonth.reduce((sum, item) => sum + item.booked, 0);
    const thresholdSetting = await this.prisma.setting.findUnique({ where: { key: 'smallCohortThreshold' } });
    return { ...statistics, occupancy: { totalSlots, bookedSlots, rate: totalSlots ? bookedSlots / totalSlots : 0, monthly: occupancyByMonth }, privacy: { smallCohortThreshold: Number(thresholdSetting?.value ?? process.env.SMALL_COHORT_THRESHOLD ?? 5), aggregatedOnly: true } };
  }
}

@Controller('v1/statistics')
export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}
  @Get('overview') overview(@Req() req: Request) { return this.statistics.overview(requireUserId(req)); }
}
