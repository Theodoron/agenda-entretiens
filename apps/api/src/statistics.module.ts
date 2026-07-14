import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module';
import { StatisticsController, StatisticsService } from './statistics';

@Module({
  imports: [PrismaModule],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
