import { Body, Controller, Get, HttpCode, Injectable, Post, Req, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { verify } from 'argon2';
import type { Request } from 'express';

declare module 'express-session' { interface SessionData { userId: string } }

class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(12) password!: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}
  async login(email: string, password: string) {
    const devLoginEnabled = process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEV_LOGIN === 'true';
    if (!devLoginEnabled) throw new UnauthorizedException('Connexion de développement désactivée');
    const identity = await this.prisma.authIdentity.findUnique({ where: { provider_subject: { provider: 'DEV', subject: email.toLowerCase() } }, include: { user: true } });
    if (!identity?.passwordHash || !(await verify(identity.passwordHash, password)) || identity.user.status !== 'ACTIVE') throw new UnauthorizedException('Identifiants incorrects');
    return identity.user;
  }
  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, firstName: true, lastName: true, roles: { select: { role: { select: { code: true } } } }, student: true, advisor: true } });
  }
}

@Controller('v1')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('auth/dev/login') @HttpCode(200)
  async login(@Body() body: LoginDto, @Req() request: Request) {
    const user = await this.auth.login(body.email, body.password);
    await new Promise<void>((resolve, reject) => request.session.regenerate(error => error ? reject(error) : resolve()));
    request.session.userId = user.id;
    return this.auth.me(user.id);
  }
  @Post('auth/logout') @HttpCode(204)
  async logout(@Req() request: Request) { await new Promise<void>(resolve => request.session.destroy(() => resolve())); }
  @Get('me')
  me(@Req() request: Request) { if (!request.session.userId) throw new UnauthorizedException(); return this.auth.me(request.session.userId); }
}
