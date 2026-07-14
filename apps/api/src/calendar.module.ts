import { Module } from '@nestjs/common';
import { CalendarController, CalendarService } from './calendar';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
