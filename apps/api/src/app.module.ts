import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { ManualsController } from './manuals/manuals.controller';
import { PrismaService } from './prisma/prisma.service';
import { ManualsService } from './manuals/manuals.service';
import { DiffEngineService } from './diff-engine/diff-engine.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [HealthController, ManualsController],
  providers: [PrismaService, ManualsService, DiffEngineService],
})
export class AppModule {}
