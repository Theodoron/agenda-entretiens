import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { PrismaService } from './prisma.service';

export function requireUserId(request: Request): string {
  if (!request.session.userId) throw new UnauthorizedException('Authentification requise');
  return request.session.userId;
}

export async function requireRole(prisma: PrismaService, userId: string, role: 'STUDENT' | 'ADVISOR' | 'ADMIN') {
  const found = await prisma.userRole.findFirst({ where: { userId, role: { code: role } } });
  if (!found) throw new ForbiddenException('Droits insuffisants');
}
