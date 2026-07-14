import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppointmentsService } from '../src/appointments';
import { CommunicationsService } from '../src/communications';
import { requireRole, requireUserId } from '../src/current-user';
import { DocumentsService } from '../src/documents';

describe('authentification et autorisations', () => {
  it('refuse une requête sans utilisateur en session', () => {
    expect(() => requireUserId({ session: {} } as never)).toThrow(UnauthorizedException);
  });

  it('retourne uniquement l’utilisateur authentifié en session', () => {
    expect(requireUserId({ session: { userId: 'user-1' } } as never)).toBe('user-1');
  });

  it('vérifie le rôle demandé et refuse un rôle absent', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(requireRole({ userRole: { findFirst } } as never, 'user-1', 'ADMIN')).rejects.toBeInstanceOf(ForbiddenException);
    expect(findFirst).toHaveBeenCalledWith({ where: { userId: 'user-1', role: { code: 'ADMIN' } } });
  });
});

describe('protection contre les accès horizontaux', () => {
  it('ne révèle pas un entretien à un utilisateur extérieur', async () => {
    const prisma = {
      appointment: { findUnique: vi.fn().mockResolvedValue({ id: 'appointment-1', studentId: 'student-1', advisorId: 'advisor-1', status: 'CONFIRMED' }) },
      userRole: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    await expect(new AppointmentsService(prisma as never).one('outsider-1', 'appointment-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('limite l’historique étudiant aux entretiens du conseiller connecté', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      userRole: { findFirst: vi.fn().mockResolvedValue({ id: 'role-1' }) },
      appointment: { findMany },
    };

    await new AppointmentsService(prisma as never).studentHistory('advisor-1', 'student-1');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { advisorId: 'advisor-1', studentId: 'student-1' } }));
  });

  it('ne révèle ni messages ni existence d’un entretien à un utilisateur extérieur', async () => {
    const messages = vi.fn();
    const prisma = {
      appointment: { findUnique: vi.fn().mockResolvedValue({ id: 'appointment-1', studentId: 'student-1', advisorId: 'advisor-1', status: 'CONFIRMED' }) },
      userRole: { findFirst: vi.fn().mockResolvedValue(null) },
      message: { findMany: messages },
    };

    await expect(new CommunicationsService(prisma as never).messages('outsider-1', 'appointment-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(messages).not.toHaveBeenCalled();
  });

  it('ne révèle aucun document à un utilisateur extérieur', async () => {
    const attachments = vi.fn();
    const prisma = {
      appointment: { findUnique: vi.fn().mockResolvedValue({ studentId: 'student-1', advisorId: 'advisor-1', status: 'CONFIRMED' }) },
      userRole: { findFirst: vi.fn().mockResolvedValue(null) },
      attachment: { findMany: attachments },
    };

    await expect(new DocumentsService(prisma as never).list('outsider-1', 'appointment-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(attachments).not.toHaveBeenCalled();
  });

  it('ne présente à l’étudiant que les documents déclarés sûrs', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      appointment: { findUnique: vi.fn().mockResolvedValue({ studentId: 'student-1', advisorId: 'advisor-1', status: 'CONFIRMED' }) },
      userRole: { findFirst: vi.fn().mockResolvedValue(null) },
      attachment: { findMany },
    };

    await new DocumentsService(prisma as never).list('student-1', 'appointment-1');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { appointmentId: 'appointment-1', scanStatus: 'CLEAN' } }));
  });
});
