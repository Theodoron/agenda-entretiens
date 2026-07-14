import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController, AuthService } from './auth';
import { PrismaModule } from './prisma.module';
import { ProfilesController, ProfilesService } from './profiles';
import { ReferencesController } from './references';
import { CommunicationsController, CommunicationsService } from './communications';
import { DocumentsController, DocumentsService } from './documents';
import { NotificationsController, NotificationsService } from './notifications';
import { AdminController, AdminService } from './admin';
import { StatisticsModule } from './statistics.module';
import { HealthController } from './health';
import { CalendarModule } from './calendar.module';
import { SchedulingModule } from './scheduling.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }), PrismaModule, CalendarModule, SchedulingModule, StatisticsModule],
  controllers: [HealthController, AuthController, ProfilesController, ReferencesController, CommunicationsController, DocumentsController, NotificationsController, AdminController],
  providers: [AuthService, ProfilesService, CommunicationsService, DocumentsService, NotificationsService, AdminService],
})
export class AppModule {}
