import { Module } from '@nestjs/common';
import { AppointmentsController, AppointmentsService } from './appointments';
import { AvailabilitiesController, AvailabilitiesService } from './availabilities';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AvailabilitiesController, AppointmentsController],
  providers: [AvailabilitiesService, AppointmentsService],
})
export class SchedulingModule {}
