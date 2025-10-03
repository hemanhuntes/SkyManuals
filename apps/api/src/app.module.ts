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

// Epic-03 Components
import { ReaderController } from './reader/reader.controller';
import { ReaderService } from './reader/reader.service';
import { PublishPipelineService } from './publish-pipeline/publish-pipeline.service';
import { SearchIndexService } from './search-engine/search-index.service';

// Epic-04 Components
import { ComplianceController } from './compliance/compliance.controller';
import { RegulationLibraryService } from './compliance/regulation-library.service';
import { ComplianceLinkService } from './compliance/compliance-link.service';
import { ImpactAnalysisService } from './compliance/impact-analysis.service';

// Epic-05 Components
import { SearchController } from './search/search.controller';
import { SearchService } from './search/search.service';
import { IndexingService } from './search/indexing.service';
import { GuardrailsService } from './search/guardrails.service';

// Epic-06 Components
import { XmlController, XmlParserService, XmlMapperService, XmlExporterService, XmlDiffService } from './xml/xml.controller';

// Epic-07 Components
import { EFBController, DeviceService, OfflineCacheService } from './efb/efb.controller';

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
    ReaderController,
    ComplianceController,
    SearchController,
    XmlController,
    EFBController,
  ],
  providers: [
    PrismaService,
    ManualsService,
    DiffEngineService,
    WorkflowsService,
    TasksService,
    CommentsService,
    NotificationService,
    ReaderService,
    PublishPipelineService,
    SearchIndexService,
    RegulationLibraryService,
    ComplianceLinkService,
    ImpactAnalysisService,
    SearchService,
    IndexingService,
    GuardrailsService,
    XmlParserService,
    XmlMapperService,
    XmlExporterService,
    XmlDiffService,
    DeviceService,
    OfflineCacheService,
  ],
})
export class AppModule {}
