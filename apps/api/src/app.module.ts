import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';

// Epic-01 Components
import { HealthController } from './health/health.controller';
import { ManualsController } from './manuals/manuals.controller';
import { PrismaService } from './prisma/prisma.service';
import { ManualsService } from './manuals/manuals.service';
import { DiffEngineService } from './diff-engine/diff-engine.service';

// Epic-02 Components  
import { WorkflowsController } from './workflows/workflows.controller';
import { WorkflowsService } from './workflows/workflows.service';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { CommentsController } from './comments/comments.controller';
import { CommentsService } from './comments/comments.service';
import { NotificationService } from './notifications/notification.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [
    HealthController,
    ManualsController,
    WorkflowsController,
    TasksController,
    CommentsController,
  ],
  providers: [
    PrismaService,
    ManualsService,
    DiffEngineService,
    WorkflowsService,
    TasksService,
    CommentsService,
    NotificationService,
  ],
})
export class AppModule {}
