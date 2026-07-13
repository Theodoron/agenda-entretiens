import { Controller, Get, Injectable, Param, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireUserId } from './current-user';
import { PrismaService } from './prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}
  list(userId: string) { return this.prisma.notification.findMany({ where: { userId }, orderBy: { scheduledAt: 'desc' }, take: 100 }); }
  read(userId: string, id: string) { return this.prisma.notification.updateMany({ where: { id, userId, channel: 'IN_APP' }, data: { status: 'READ' } }); }
}
@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() list(@Req() req: Request) { return this.notifications.list(requireUserId(req)); }
  @Patch(':id/read') read(@Req() req: Request, @Param('id') id: string) { return this.notifications.read(requireUserId(req), id); }
}
