import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();
const permissions = {
  STUDENT: ['profile:self:write', 'appointment:self:create', 'appointment:self:cancel', 'message:participant:write', 'file:participant:read'],
  ADVISOR: ['profile:self:write', 'availability:self:write', 'appointment:assigned:read', 'appointment:assigned:manage', 'internal-note:assigned:write', 'shared-content:assigned:write', 'message:participant:write', 'file:participant:read', 'stats:self:read'],
  ADMIN: ['user:manage', 'reference:manage', 'stats:global:read', 'export:run', 'audit:read', 'retention:manage'],
};

const demoUuid = (group, index) =>
  `${group}0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;

async function seedStatisticsDemo({ advisorId, studentRoleId, components, degrees, academicYears, reasons }) {
  const origins = [
    ...Array.from({ length: 7 }, () => ['UFR Sciences', 'Licence Informatique']),
    ...Array.from({ length: 5 }, () => ['UFR Sciences', 'Licence Mathématiques']),
    ...Array.from({ length: 5 }, () => ['IUT', 'BUT Informatique']),
    ...Array.from({ length: 3 }, () => ['IUT', 'BUT GEA']),
    ...Array.from({ length: 6 }, () => ['UFR Lettres', 'Licence Lettres modernes']),
    ...Array.from({ length: 6 }, () => ['UFR Droit', 'Licence Droit']),
  ];
  const statuses = [
    ...Array.from({ length: 16 }, () => 'COMPLETED'),
    ...Array.from({ length: 8 }, () => 'CONFIRMED'),
    ...Array.from({ length: 6 }, () => 'CANCELLED_BY_STUDENT'),
    ...Array.from({ length: 5 }, () => 'CANCELLED_BY_ADVISOR'),
    ...Array.from({ length: 5 }, () => 'STUDENT_NO_SHOW'),
    ...Array.from({ length: 3 }, () => 'RESCHEDULED'),
  ];
  const firstNames = ['Camille', 'Nora', 'Lucas', 'Inès', 'Hugo', 'Lina', 'Adam', 'Sarah'];
  const lastNames = ['Martin', 'Bernard', 'Thomas', 'Robert', 'Petit', 'Durand', 'Moreau', 'Simon'];
  let appointmentIndex = 0;

  for (const [studentIndex, [componentName, degreeName]] of origins.entries()) {
    const userId = demoUuid('1', studentIndex);
    const email = `stats.etudiant.${String(studentIndex + 1).padStart(2, '0')}@example.test`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        firstName: firstNames[studentIndex % firstNames.length],
        lastName: lastNames[Math.floor(studentIndex / firstNames.length) % lastNames.length],
      },
      create: {
        id: userId,
        email,
        firstName: firstNames[studentIndex % firstNames.length],
        lastName: lastNames[Math.floor(studentIndex / firstNames.length) % lastNames.length],
      },
    });
    const academicYear = academicYears[studentIndex % academicYears.length];
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: studentRoleId } },
      update: {},
      create: { userId: user.id, roleId: studentRoleId },
    });
    await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: {
        componentId: components.get(componentName).id,
        degreeId: degrees.get(`${componentName}:${degreeName}`).id,
        academicYearId: academicYear.id,
      },
      create: {
        userId: user.id,
        universityId: `USTATS${String(studentIndex + 1).padStart(4, '0')}`,
        componentId: components.get(componentName).id,
        degreeId: degrees.get(`${componentName}:${degreeName}`).id,
        academicYearId: academicYear.id,
        gender: ['WOMAN', 'MAN', 'NON_BINARY', 'PREFER_NOT_TO_SAY'][studentIndex % 4],
      },
    });

    const appointmentCount = studentIndex % 3 === 0 ? 2 : 1;
    for (let studentAppointmentIndex = 0; studentAppointmentIndex < appointmentCount; studentAppointmentIndex++) {
      const month = appointmentIndex % 7;
      const startsAt = new Date(Date.UTC(2026, month, 5 + (appointmentIndex % 20), 8 + (appointmentIndex % 8), 0));
      const createdAt = new Date(startsAt.getTime() - (3 + (appointmentIndex % 18)) * 86_400_000);
      const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
      const status = statuses[appointmentIndex % statuses.length];
      const availabilityId = demoUuid('2', appointmentIndex);
      const requestId = demoUuid('3', appointmentIndex);
      const appointmentId = demoUuid('4', appointmentIndex);
      const selectedReasons = [
        reasons[appointmentIndex % reasons.length],
        ...(appointmentIndex % 4 === 0 ? [reasons[(appointmentIndex + 2) % reasons.length]] : []),
      ];

      await prisma.availability.upsert({
        where: { id: availabilityId },
        update: {
          advisorId,
          startsAt,
          endsAt,
          mode: ['IN_PERSON', 'PHONE', 'VIDEO'][appointmentIndex % 3],
          status: status.startsWith('CANCELLED') || status === 'RESCHEDULED' ? 'CANCELLED' : 'BOOKED',
        },
        create: {
          id: availabilityId,
          advisorId,
          startsAt,
          endsAt,
          mode: ['IN_PERSON', 'PHONE', 'VIDEO'][appointmentIndex % 3],
          status: status.startsWith('CANCELLED') || status === 'RESCHEDULED' ? 'CANCELLED' : 'BOOKED',
        },
      });
      await prisma.interviewRequest.upsert({
        where: { id: requestId },
        update: {
          studentId: user.id,
          subject: 'Demande de démonstration statistique',
          description: 'Donnée simulée pour illustrer les indicateurs du tableau de bord.',
          createdAt,
        },
        create: {
          id: requestId,
          studentId: user.id,
          subject: 'Demande de démonstration statistique',
          description: 'Donnée simulée pour illustrer les indicateurs du tableau de bord.',
          preferredMode: ['IN_PERSON', 'PHONE', 'VIDEO'][appointmentIndex % 3],
          createdAt,
        },
      });
      await prisma.interviewRequestReason.deleteMany({
        where: { requestId, reasonId: { notIn: selectedReasons.map(reason => reason.id) } },
      });
      await prisma.interviewRequestReason.createMany({
        data: selectedReasons.map(reason => ({ requestId, reasonId: reason.id })),
        skipDuplicates: true,
      });
      await prisma.appointment.upsert({
        where: { id: appointmentId },
        update: {
          availabilityId,
          requestId,
          studentId: user.id,
          advisorId,
          status,
          kind: studentAppointmentIndex === 0 ? 'FIRST_WITH_SERVICE' : 'FOLLOW_UP_SAME_ADVISOR',
          createdAt,
        },
        create: {
          id: appointmentId,
          availabilityId,
          requestId,
          studentId: user.id,
          advisorId,
          status,
          kind: studentAppointmentIndex === 0 ? 'FIRST_WITH_SERVICE' : 'FOLLOW_UP_SAME_ADVISOR',
          createdAt,
        },
      });
      appointmentIndex++;
    }
  }

  for (let slotIndex = 0; slotIndex < 21; slotIndex++) {
    const startsAt = new Date(Date.UTC(2026, slotIndex % 7, 6 + (slotIndex % 18), 9 + (slotIndex % 7), 0));
    await prisma.availability.upsert({
      where: { id: demoUuid('5', slotIndex) },
      update: {
        advisorId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 45 * 60_000),
        status: 'AVAILABLE',
      },
      create: {
        id: demoUuid('5', slotIndex),
        advisorId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 45 * 60_000),
        mode: ['IN_PERSON', 'PHONE', 'VIDEO'][slotIndex % 3],
        status: 'AVAILABLE',
      },
    });
  }
}

async function main() {
  await prisma.availability.updateMany({
    where: { status: 'HELD' },
    data: {
      status: 'AVAILABLE',
      heldByUserId: null,
      heldUntil: null,
      version: { increment: 1 },
    },
  });
  const interviewReasons = [
    'Orientation-réorientation',
    'Poursuite d’étude',
    'Projet professionnel, débouchés',
    'Candidature formation',
    'Information césure',
    'Dossier césure',
    'Autre (précisez dans l’objet ou la description de votre demande)',
  ];
  await prisma.interviewReason.updateMany({
    where: { label: { notIn: interviewReasons } },
    data: { active: false },
  });
  for (const [sortOrder, label] of interviewReasons.entries()) {
    await prisma.interviewReason.upsert({
      where: { label },
      update: { active: true, sortOrder },
      create: { label, sortOrder },
    });
  }
  const referenceDegrees = [
    ['UFR Sciences', 'Licence Informatique'],
    ['UFR Sciences', 'Licence Mathématiques'],
    ['IUT', 'BUT Informatique'],
    ['IUT', 'BUT GEA'],
    ['UFR Lettres', 'Licence Lettres modernes'],
    ['UFR Droit', 'Licence Droit'],
  ];
  const components = new Map();
  const degrees = new Map();
  for (const componentName of [...new Set(referenceDegrees.map(([name]) => name))]) {
    const component = await prisma.component.upsert({
      where: { name: componentName },
      update: { active: true },
      create: { name: componentName },
    });
    components.set(componentName, component);
  }
  for (const [componentName, degreeName] of referenceDegrees) {
    const component = components.get(componentName);
    const degree = await prisma.degree.upsert({
      where: { componentId_name: { componentId: component.id, name: degreeName } },
      update: {},
      create: { componentId: component.id, name: degreeName },
    });
    degrees.set(`${componentName}:${degreeName}`, degree);
  }
  const academicYears = [];
  for (const label of ['2026-2027', '2025-2026', '2024-2025']) {
    academicYears.push(await prisma.academicYear.upsert({
      where: { label },
      update: {},
      create: { label },
    }));
  }
  for (const [code, codes] of Object.entries(permissions)) {
    const role = await prisma.role.upsert({ where: { code }, update: {}, create: { code } });
    for (const permissionCode of codes) {
      const permission = await prisma.permission.upsert({ where: { code: permissionCode }, update: {}, create: { code: permissionCode } });
      await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
    }
  }
  const passwordHash = await hash('Demo-Agenda-2026!', { memoryCost: 19456, timeCost: 2 });
  const demos = [
    ['etudiant@example.test', 'Rayan', 'Cherki', 'STUDENT'],
    ['conseiller@example.test', 'Didier', 'Deschamps', 'ADVISOR'],
    ['admin@example.test', 'Alex', 'Robert', 'ADMIN'],
  ];
  let advisorId;
  let studentRoleId;
  for (const [email, firstName, lastName, code] of demos) {
    const notificationEmail = code === 'STUDENT' ? process.env.DEMO_STUDENT_EMAIL?.trim().toLowerCase() || email : email;
    const existingIdentity = await prisma.authIdentity.findUnique({ where: { provider_subject: { provider: 'DEV', subject: email } }, select: { userId: true } });
    const user = existingIdentity
      ? await prisma.user.update({ where: { id: existingIdentity.userId }, data: { email: notificationEmail, firstName, lastName } })
      : await prisma.user.upsert({ where: { email: notificationEmail }, update: { firstName, lastName }, create: { email: notificationEmail, firstName, lastName } });
    const role = await prisma.role.findUniqueOrThrow({ where: { code } });
    if (code === 'STUDENT') studentRoleId = role.id;
    if (code === 'ADVISOR') advisorId = user.id;
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
    await prisma.authIdentity.upsert({ where: { provider_subject: { provider: 'DEV', subject: email } }, update: { passwordHash, userId: user.id }, create: { provider: 'DEV', subject: email, passwordHash, userId: user.id } });
    if (code === 'STUDENT') await prisma.studentProfile.upsert({ where: { userId: user.id }, update: { gender: 'MAN' }, create: { userId: user.id, universityId: 'U20260001', gender: 'MAN' } });
    if (code === 'ADVISOR') await prisma.advisorProfile.upsert({ where: { userId: user.id }, update: { title: 'Conseiller en orientation' }, create: { userId: user.id, title: 'Conseiller en orientation' } });
  }
  const reasons = await prisma.interviewReason.findMany({
    where: { label: { in: interviewReasons } },
    orderBy: { sortOrder: 'asc' },
  });
  await seedStatisticsDemo({ advisorId, studentRoleId, components, degrees, academicYears, reasons });
}

main().finally(() => prisma.$disconnect());
