import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController, AuthService } from './auth';
import { PrismaService } from './prisma.service';
import { ProfilesController, ProfilesService } from './profiles';
import { AvailabilitiesController, AvailabilitiesService } from './availabilities';
import { AppointmentsController, AppointmentsService } from './appointments';
import { ReferencesController } from './references';
import { CommunicationsController, CommunicationsService } from './communications';
import { DocumentsController, DocumentsService } from './documents';
import { NotificationsController, NotificationsService } from './notifications';
import { AdminController, AdminService } from './admin';
import { StatisticsController, StatisticsService } from './statistics';
import { HealthController } from './health';
import { CalendarController, CalendarService } from './calendar';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' })],
  controllers: [HealthController, AuthController, ProfilesController, AvailabilitiesController, AppointmentsController, ReferencesController, CommunicationsController, DocumentsController, NotificationsController, AdminController, StatisticsController, CalendarController],
  providers: [PrismaService, AuthService, ProfilesService, AvailabilitiesService, AppointmentsService, CommunicationsService, DocumentsService, NotificationsService, AdminService, StatisticsService, CalendarService],
})
export class AppModule {}
