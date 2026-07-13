import { Body, Controller, Get, Injectable, Param, Patch, Req } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';
import type { Request } from 'express';
import { requireRole, requireUserId } from './current-user';
import { PrismaService } from './prisma.service';

class UserStatusDto { @IsEnum(UserStatus) status!: UserStatus; }

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}
  private authorize(userId: string) { return requireRole(this.prisma, userId, 'ADMIN'); }
  async overview(userId: string) {
    await this.authorize(userId);
    const [users, appointments, pendingDocuments, failedNotifications] = await Promise.all([
      this.prisma.user.count(), this.prisma.appointment.count(), this.prisma.attachment.count({ where: { scanStatus: 'PENDING' } }), this.prisma.notification.count({ where: { status: 'FAILED' } }),
    ]);
    return { users, appointments, pendingDocuments, failedNotifications };
  }
  async users(userId: string) { await this.authorize(userId); return this.prisma.user.findMany({ select: { id: true, firstName: true, lastName: true, email: true, status: true, roles: { select: { role: { select: { code: true } } } } }, orderBy: { lastName: 'asc' }, take: 200 }); }
  async status(userId: string, id: string, status: UserStatus) { await this.authorize(userId); const user = await this.prisma.user.update({ where: { id }, data: { status } }); await this.prisma.auditLog.create({ data: { actorId: userId, action: 'user.status_changed', resourceType: 'User', resourceId: id, metadata: { status } } }); return user; }
}

@Controller('v1/admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Get('overview') overview(@Req() req: Request) { return this.admin.overview(requireUserId(req)); }
  @Get('users') users(@Req() req: Request) { return this.admin.users(requireUserId(req)); }
  @Patch('users/:id/status') status(@Req() req: Request, @Param('id') id: string, @Body() dto: UserStatusDto) { return this.admin.status(requireUserId(req), id, dto.status); }
}
