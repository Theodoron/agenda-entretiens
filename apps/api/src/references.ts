import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireUserId } from './current-user';
import { PrismaService } from './prisma.service';

@Controller('v1/references')
export class ReferencesController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('reasons') reasons(@Req() req: Request) { requireUserId(req); return this.prisma.interviewReason.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] }); }
  @Get('profile-options') async profileOptions(@Req() req: Request) {
    requireUserId(req);
    const [components, degrees, academicYears] = await Promise.all([this.prisma.component.findMany({ where: { active: true }, orderBy: { name: 'asc' } }), this.prisma.degree.findMany({ where: { component: { active: true } }, orderBy: { name: 'asc' } }), this.prisma.academicYear.findMany({ orderBy: { label: 'desc' } })]);
    return { components, degrees, academicYears };
  }
}
