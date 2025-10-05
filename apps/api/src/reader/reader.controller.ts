import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Logger,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ReaderService } from './reader.service';
import { BundleGenerationService } from './bundle-generation.service';
import { CloudFrontService } from './cloudfront.service';
import { ProgressTrackingService, ReadingProgress } from './progress-tracking.service';
import {
  ManualReaderResponse,
  SearchResult,
  Annotation,
  SuggestEdit,
  ReaderSession,
  BundleMetadata,
} from '@skymanuals/types';

// Mock auth guard for now
@UseGuards()
class MockAuthGuard {}

@ApiTags('Reader')
@Controller('reader')
@UseGuards(MockAuthGuard)
export class ReaderController {
  private readonly logger = new Logger(ReaderController.name);

  constructor(
    private readonly readerService: ReaderService,
    private bundleGenerationService: BundleGenerationService,
    private cloudFrontService: CloudFrontService,
    private progressTrackingService: ProgressTrackingService
  ) {}

  // Bundle Generation
  @Post('bundles/generate/:manualId')
  @ApiOperation({ summary: 'Generate bundle for manual' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Bundle generated successfully',
  })
  async generateBundle(
    @Param('manualId', ParseUUIDPipe) manualId: string,
    @Body() options: {
      includeAnnotations?: boolean;
      includeMetadata?: boolean;
      chunkSize?: number;
    },
    @Req() req: any
  ) {
    this.logger.log(`Generating bundle for manual ${manualId}`);

    try {
      const bundle = await this.bundleGenerationService.generateBundle(manualId, options);

      return {
        success: true,
        bundle,
        message: 'Bundle generated successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to generate bundle for manual ${manualId}:`, error);
      return {
        success: false,
        message: 'Bundle generation failed',
        error: error.message
      };
    }
  }

  @Get('bundles/:id')
  @ApiOperation({ summary: 'Get bundle by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Bundle retrieved successfully',
  })
  async getBundle(@Param('id', ParseUUIDPipe) id: string) {
    this.logger.log(`Retrieving bundle ${id}`);

    try {
      const result = await this.bundleGenerationService.getBundle(id);

      return {
        success: true,
        ...result
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve bundle ${id}:`, error);
      return {
        success: false,
        message: 'Bundle retrieval failed',
        error: error.message
      };
    }
  }

  @Delete('bundles/:id')
  @ApiOperation({ summary: 'Delete bundle by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Bundle deleted successfully',
  })
  async deleteBundle(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    this.logger.log(`Deleting bundle ${id}`);

    try {
      const result = await this.bundleGenerationService.deleteBundle(id);

      return {
        success: result.success,
        message: result.success ? 'Bundle deleted successfully' : 'Bundle deletion failed',
        error: result.error
      };
    } catch (error) {
      this.logger.error(`Failed to delete bundle ${id}:`, error);
      return {
        success: false,
        message: 'Bundle deletion failed',
        error: error.message
      };
    }
  }

  // CloudFront URLs
  @Get('bundles/:id/urls')
  @ApiOperation({ summary: 'Get bundle URLs with optional signing' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'signed', required: false, description: 'Generate signed URLs' })
  @ApiQuery({ name: 'expires', required: false, description: 'URL expiration time in seconds' })
  @ApiResponse({
    status: 200,
    description: 'Bundle URLs retrieved successfully',
  })
  async getBundleUrls(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('signed') signed: string = 'false',
    @Query('expires') expires: string = '86400'
  ) {
    this.logger.log(`Getting bundle URLs for ${id}`);

    try {
      const bundle = await this.bundleGenerationService.getBundle(id);
      const urls: { [key: string]: string } = {};

      if (signed === 'true') {
        for (const chunk of bundle.manifest.chunks) {
          urls[chunk.key] = await this.cloudFrontService.generateSignedUrl(
            await this.cloudFrontService.getBundleUrl(id, chunk.index),
            { expiresIn: parseInt(expires) }
          );
        }
      } else {
        for (const chunk of bundle.manifest.chunks) {
          urls[chunk.key] = await this.cloudFrontService.getBundleUrl(id, chunk.index);
        }
      }

      return {
        success: true,
        bundleId: id,
        urls,
        manifest: bundle.manifest
      };
    } catch (error) {
      this.logger.error(`Failed to get bundle URLs for ${id}:`, error);
      return {
        success: false,
        message: 'Failed to get bundle URLs',
        error: error.message
      };
    }
  }

  // Cache Invalidation
  @Post('bundles/:id/invalidate')
  @ApiOperation({ summary: 'Invalidate bundle cache' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Bundle invalidated successfully',
  })
  async invalidateBundle(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    this.logger.log(`Invalidating bundle ${id}`);

    try {
      const result = await this.cloudFrontService.invalidateBundle(id);

      return {
        success: true,
        invalidation: result,
        message: 'Bundle invalidated successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to invalidate bundle ${id}:`, error);
      return {
        success: false,
        message: 'Bundle invalidation failed',
        error: error.message
      };
    }
  }

  @Post('bundles/:id/invalidate-manifest')
  @ApiOperation({ summary: 'Invalidate bundle manifest cache' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Manifest invalidated successfully',
  })
  async invalidateManifest(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    this.logger.log(`Invalidating manifest for bundle ${id}`);

    try {
      const result = await this.cloudFrontService.invalidateManifest(id);

      return {
        success: true,
        invalidation: result,
        message: 'Manifest invalidated successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to invalidate manifest for bundle ${id}:`, error);
      return {
        success: false,
        message: 'Manifest invalidation failed',
        error: error.message
      };
    }
  }

  // Progress Tracking
  @Post('progress')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Update reading progress' })
  @ApiResponse({
    status: 201,
    description: 'Progress updated successfully',
  })
  async updateProgress(
    @Body() progressData: {
      bundleId: string;
      currentChapter?: string;
      currentSection?: string;
      currentBlock?: string;
      progress?: number;
      readingTime?: number;
      action: 'start' | 'update' | 'complete' | 'pause';
    },
    @Req() req: any
  ) {
    this.logger.log(`Updating progress for user ${req.user.id}`);

    try {
      const progress = await this.progressTrackingService.updateProgress(
        req.user.id,
        progressData.bundleId,
        progressData
      );

      return {
        success: true,
        progress,
        message: 'Progress updated successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to update progress for user ${req.user.id}:`, error);
      return {
        success: false,
        message: 'Progress update failed',
        error: error.message
      };
    }
  }

  @Get('progress/:bundleId')
  @ApiOperation({ summary: 'Get reading progress' })
  @ApiParam({ name: 'bundleId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Progress retrieved successfully',
  })
  async getProgress(@Param('bundleId', ParseUUIDPipe) bundleId: string, @Req() req: any) {
    try {
      const progress = await this.progressTrackingService.getProgress(req.user.id, bundleId);

      return {
        success: true,
        progress
      };
    } catch (error) {
      this.logger.error(`Failed to get progress for user ${req.user.id}:`, error);
      return {
        success: false,
        message: 'Progress retrieval failed',
        error: error.message
      };
    }
  }

  // Highlights
  @Post('highlights')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add highlight' })
  @ApiResponse({
    status: 201,
    description: 'Highlight added successfully',
  })
  async addHighlight(
    @Body() highlightData: {
      bundleId: string;
      blockId: string;
      text: string;
      startOffset: number;
      endOffset: number;
      color: string;
    },
    @Req() req: any
  ) {
    this.logger.log(`Adding highlight for user ${req.user.id}`);

    try {
      const highlight = await this.progressTrackingService.addHighlight(
        req.user.id,
        highlightData.bundleId,
        highlightData
      );

      return {
        success: true,
        highlight,
        message: 'Highlight added successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to add highlight for user ${req.user.id}:`, error);
      return {
        success: false,
        message: 'Highlight creation failed',
        error: error.message
      };
    }
  }

  // Notes
  @Post('notes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add note' })
  @ApiResponse({
    status: 201,
    description: 'Note added successfully',
  })
  async addNote(
    @Body() noteData: {
      bundleId: string;
      blockId: string;
      text: string;
      position: number;
    },
    @Req() req: any
  ) {
    this.logger.log(`Adding note for user ${req.user.id}`);

    try {
      const note = await this.progressTrackingService.addNote(
        req.user.id,
        noteData.bundleId,
        noteData
      );

      return {
        success: true,
        note,
        message: 'Note added successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to add note for user ${req.user.id}:`, error);
      return {
        success: false,
        message: 'Note creation failed',
        error: error.message
      };
    }
  }

  // Bookmarks
  @Post('bookmarks')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add bookmark' })
  @ApiResponse({
    status: 201,
    description: 'Bookmark added successfully',
  })
  async addBookmark(
    @Body() bookmarkData: {
      bundleId: string;
      chapterId: string;
      sectionId?: string;
      blockId?: string;
      title: string;
      description?: string;
    },
    @Req() req: any
  ) {
    this.logger.log(`Adding bookmark for user ${req.user.id}`);

    try {
      const bookmarkId = await this.progressTrackingService.addBookmark(
        req.user.id,
        bookmarkData.bundleId,
        bookmarkData
      );

      return {
        success: true,
        bookmarkId,
        message: 'Bookmark added successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to add bookmark for user ${req.user.id}:`, error);
      return {
        success: false,
        message: 'Bookmark creation failed',
        error: error.message
      };
    }
  }

  // Analytics
  @Get('analytics')
  @ApiOperation({ summary: 'Get reading analytics' })
  @ApiQuery({ name: 'bundleId', required: false, description: 'Filter by bundle ID' })
  @ApiResponse({
    status: 200,
    description: 'Analytics retrieved successfully',
  })
  async getReadingAnalytics(
    @Query('bundleId') bundleId?: string,
    @Req() req: any
  ) {
    this.logger.log(`Getting reading analytics for user ${req.user.id}`);

    try {
      const analytics = await this.progressTrackingService.getReadingAnalytics(
        req.user.id,
        bundleId
      );

      return {
        success: true,
        analytics
      };
    } catch (error) {
      this.logger.error(`Failed to get analytics for user ${req.user.id}:`, error);
      return {
        success: false,
        message: 'Analytics retrieval failed',
        error: error.message
      };
    }
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Get reading sessions' })
  @ApiQuery({ name: 'bundleId', required: false, description: 'Filter by bundle ID' })
  @ApiResponse({
    status: 200,
    description: 'Sessions retrieved successfully',
  })
  async getReadingSessions(
    @Query('bundleId') bundleId?: string,
    @Req() req: any
  ) {
    this.logger.log(`Getting reading sessions for user ${req.user.id}`);

    try {
      const sessions = await this.progressTrackingService.getReadingSessions(
        req.user.id,
        bundleId
      );

      return {
        success: true,
        sessions
      };
    } catch (error) {
      this.logger.error(`Failed to get sessions for user ${req.user.id}:`, error);
      return {
        success: false,
        message: 'Sessions retrieval failed',
        error: error.message
      };
    }
  }

  // Health Checks
  @Get('health')
  @ApiOperation({ summary: 'Get reader service health status' })
  @ApiResponse({
    status: 200,
    description: 'Health status retrieved successfully',
  })
  async getHealth() {
    try {
      const [bundleHealth, cloudFrontHealth, progressHealth] = await Promise.all([
        this.bundleGenerationService.healthCheck(),
        this.cloudFrontService.healthCheck(),
        this.progressTrackingService.healthCheck()
      ]);

      const allHealthy = bundleHealth.status === 'healthy' && 
                        cloudFrontHealth.status === 'healthy' && 
                        progressHealth.status === 'healthy';

      return {
        success: true,
        status: allHealthy ? 'healthy' : 'unhealthy',
        services: {
          bundleGeneration: bundleHealth,
          cloudFront: cloudFrontHealth,
          progressTracking: progressHealth
        }
      };
    } catch (error) {
      this.logger.error(`Health check failed:`, error);
      return {
        success: false,
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Statistics
  @Get('statistics')
  @ApiOperation({ summary: 'Get reader statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getStatistics(@Req() req: any) {
    try {
      const [bundleStats, analytics] = await Promise.all([
        this.bundleGenerationService.getBundleStatistics(req.user.organizationId),
        this.progressTrackingService.getReadingAnalytics(req.user.id)
      ]);

      return {
        success: true,
        statistics: {
          bundles: bundleStats,
          analytics
        }
      };
    } catch (error) {
      this.logger.error(`Failed to get statistics:`, error);
      return {
        success: false,
        message: 'Statistics retrieval failed',
        error: error.message
      };
    }
  }

  // Cost Estimation
  @Get('cost-estimate')
  @ApiOperation({ summary: 'Get cost estimation' })
  @ApiResponse({
    status: 200,
    description: 'Cost estimate retrieved successfully',
  })
  async getCostEstimate() {
    try {
      const costEstimate = await this.cloudFrontService.getCostEstimate();

      return {
        success: true,
        costEstimate
      };
    } catch (error) {
      this.logger.error(`Failed to get cost estimate:`, error);
      return {
        success: false,
        message: 'Cost estimate retrieval failed',
        error: error.message
      };
    }
  }

  // Legacy endpoints for backward compatibility
  @Get('manuals/:manualId')
  @ApiOperation({ summary: 'Get manual for reading by version' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'v', required: false, description: 'Version identifier (e.g., v1.2.3)' })
  @ApiResponse({
    status: 200,
    description: 'Manual content retrieved successfully',
    type: ManualReaderResponse,
  })
  async getManual(
    @Param('manualId', ParseUUIDPipe) manualId: string,
    @Query('v') version?: string,
    @Request() req: any,
  ): Promise<ManualReaderResponse> {
    const userId = req.user?.id || 'mock-user-id';
    return this.readerService.getManualForReading(manualId, userId, version);
  }

  @Get('manuals/:manualId/bundles')
  @ApiOperation({ summary: 'Get available bundles for a manual' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Available bundles retrieved',
    type: [BundleMetadata],
  })
  async getAvailableBundles(@Param('manualId', ParseUUIDPipe) manualId: string): Promise<BundleMetadata[]> {
    return this.readerService.getAvailableBundles(manualId);
  }

  @Post('search')
  @ApiOperation({ summary: 'Search across manuals' })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved',
    type: SearchResult,
  })
  async searchManuals(@Body() searchQuery: any): Promise<SearchResult> {
    return this.readerService.search(searchQuery);
  }

  @Post('manuals/:manualId/annotations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create annotation' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Annotation created successfully',
    type: Annotation,
  })
  async createAnnotation(
    @Param('manualId', ParseUUIDPipe) manualId: string,
    @Body() annotationData: any,
    @Request() req: any,
  ): Promise<Annotation> {
    const userId = req.user?.id || 'mock-user-id';
    return this.readerService.createAnnotation(manualId, userId, annotationData);
  }

  @Post('manuals/:manualId/session')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create or update reader session' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Reader session created/updated successfully',
    type: ReaderSession,
  })
  async updateReadingSession(
    @Param('manualId', ParseUUIDPipe) manualId: string,
    @Body() sessionData: any,
    @Request() req: any,
  ): Promise<ReaderSession> {
    const userId = req.user?.id || 'mock-user-id';
    return this.readerService.updateReadingSession(manualId, userId, sessionData);
  }
}