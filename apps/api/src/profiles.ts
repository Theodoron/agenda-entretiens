import { Body, Controller, Get, Injectable, Patch, Req } from '@nestjs/common';
import { Gender } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { requireRole, requireUserId } from './current-user';
import { PrismaService } from './prisma.service';

class StudentProfileDto {
  @IsOptional() @IsUUID() componentId?: string;
  @IsOptional() @IsUUID() degreeId?: string;
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
}

class AdvisorProfileDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
}

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}
  async student(userId: string) {
    await requireRole(this.prisma, userId, 'STUDENT');
    return this.prisma.studentProfile.findUniqueOrThrow({ where: { userId }, include: { user: { select: { email: true, firstName: true, lastName: true } }, component: true, degree: true, academicYear: true } });
  }
  async updateStudent(userId: string, dto: StudentProfileDto) {
    await this.student(userId);
    if (dto.degreeId && dto.componentId) {
      const degree = await this.prisma.degree.findFirst({ where: { id: dto.degreeId, componentId: dto.componentId } });
      if (!degree) throw new Error('Le diplôme ne dépend pas de la composante sélectionnée');
    }
    return this.prisma.studentProfile.update({ where: { userId }, data: dto });
  }
  async advisor(userId: string) {
    await requireRole(this.prisma, userId, 'ADVISOR');
    return this.prisma.advisorProfile.findUniqueOrThrow({ where: { userId }, include: { user: { select: { email: true, firstName: true, lastName: true } } } });
  }
  async updateAdvisor(userId: string, dto: AdvisorProfileDto) { await this.advisor(userId); return this.prisma.advisorProfile.update({ where: { userId }, data: dto }); }
}

@Controller('v1/profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}
  @Get('student/me') student(@Req() req: Request) { return this.profiles.student(requireUserId(req)); }
  @Patch('student/me') updateStudent(@Req() req: Request, @Body() dto: StudentProfileDto) { return this.profiles.updateStudent(requireUserId(req), dto); }
  @Get('advisor/me') advisor(@Req() req: Request) { return this.profiles.advisor(requireUserId(req)); }
  @Patch('advisor/me') updateAdvisor(@Req() req: Request, @Body() dto: AdvisorProfileDto) { return this.profiles.updateAdvisor(requireUserId(req), dto); }
}
