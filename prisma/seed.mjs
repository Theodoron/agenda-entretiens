import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();
const permissions = {
  STUDENT: ['profile:self:write', 'appointment:self:create', 'appointment:self:cancel', 'message:participant:write', 'file:participant:read'],
  ADVISOR: ['profile:self:write', 'availability:self:write', 'appointment:assigned:read', 'appointment:assigned:manage', 'internal-note:assigned:write', 'shared-content:assigned:write', 'message:participant:write', 'file:participant:read', 'stats:self:read'],
  ADMIN: ['user:manage', 'reference:manage', 'stats:global:read', 'export:run', 'audit:read', 'retention:manage'],
};

async function main() {
  const interviewReasons = [
    'Orientation-réorientation',
    'Poursuite d’étude',
    'Projet professionnel, débouchés',
    'Candidature formation',
    'Information césure',
    'Dossier césure',
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
  const component = await prisma.component.upsert({ where: { name: 'UFR Sciences' }, update: {}, create: { name: 'UFR Sciences' } });
  await prisma.degree.upsert({ where: { componentId_name: { componentId: component.id, name: 'Licence Informatique' } }, update: {}, create: { componentId: component.id, name: 'Licence Informatique' } });
  await prisma.academicYear.upsert({ where: { label: '2026-2027' }, update: {}, create: { label: '2026-2027' } });
  for (const [code, codes] of Object.entries(permissions)) {
    const role = await prisma.role.upsert({ where: { code }, update: {}, create: { code } });
    for (const permissionCode of codes) {
      const permission = await prisma.permission.upsert({ where: { code: permissionCode }, update: {}, create: { code: permissionCode } });
      await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
    }
  }
  const passwordHash = await hash('Demo-Agenda-2026!', { memoryCost: 19456, timeCost: 2 });
  const demos = [
    ['etudiant@example.test', 'Camille', 'Martin', 'STUDENT'],
    ['conseiller@example.test', 'Sophie', 'Bernard', 'ADVISOR'],
    ['admin@example.test', 'Alex', 'Robert', 'ADMIN'],
  ];
  for (const [email, firstName, lastName, code] of demos) {
    const notificationEmail = code === 'STUDENT' ? process.env.DEMO_STUDENT_EMAIL?.trim().toLowerCase() || email : email;
    const existingIdentity = await prisma.authIdentity.findUnique({ where: { provider_subject: { provider: 'DEV', subject: email } }, select: { userId: true } });
    const user = existingIdentity
      ? await prisma.user.update({ where: { id: existingIdentity.userId }, data: { email: notificationEmail, firstName, lastName } })
      : await prisma.user.upsert({ where: { email: notificationEmail }, update: { firstName, lastName }, create: { email: notificationEmail, firstName, lastName } });
    const role = await prisma.role.findUniqueOrThrow({ where: { code } });
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
    await prisma.authIdentity.upsert({ where: { provider_subject: { provider: 'DEV', subject: email } }, update: { passwordHash, userId: user.id }, create: { provider: 'DEV', subject: email, passwordHash, userId: user.id } });
    if (code === 'STUDENT') await prisma.studentProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, universityId: 'U20260001' } });
    if (code === 'ADVISOR') await prisma.advisorProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, title: 'Conseillère en orientation' } });
  }
}

main().finally(() => prisma.$disconnect());
