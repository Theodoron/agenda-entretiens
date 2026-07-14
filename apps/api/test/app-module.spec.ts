import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { CalendarController, CalendarService } from '../src/calendar';
import { CalendarModule } from '../src/calendar.module';
import { PrismaModule } from '../src/prisma.module';
import { PrismaService } from '../src/prisma.service';
import { StatisticsController, StatisticsService } from '../src/statistics';
import { StatisticsModule } from '../src/statistics.module';

const metadata = <T>(key: string, target: object): T[] => Reflect.getMetadata(key, target) ?? [];

describe('assemblage des modules Nest', () => {
  it('partage Prisma avec les modules fonctionnels', () => {
    expect(metadata(MODULE_METADATA.PROVIDERS, PrismaModule)).toContain(PrismaService);
    expect(metadata(MODULE_METADATA.EXPORTS, PrismaModule)).toContain(PrismaService);
  });

  it('isole le calendrier et le raccorde au module racine', () => {
    expect(metadata(MODULE_METADATA.IMPORTS, CalendarModule)).toContain(PrismaModule);
    expect(metadata(MODULE_METADATA.CONTROLLERS, CalendarModule)).toContain(CalendarController);
    expect(metadata(MODULE_METADATA.PROVIDERS, CalendarModule)).toContain(CalendarService);
    expect(metadata(MODULE_METADATA.IMPORTS, AppModule)).toEqual(expect.arrayContaining([PrismaModule, CalendarModule]));
  });

  it('isole les statistiques et les raccorde au module racine', () => {
    expect(metadata(MODULE_METADATA.IMPORTS, StatisticsModule)).toContain(PrismaModule);
    expect(metadata(MODULE_METADATA.CONTROLLERS, StatisticsModule)).toContain(StatisticsController);
    expect(metadata(MODULE_METADATA.PROVIDERS, StatisticsModule)).toContain(StatisticsService);
    expect(metadata(MODULE_METADATA.IMPORTS, AppModule)).toContain(StatisticsModule);
  });
});
