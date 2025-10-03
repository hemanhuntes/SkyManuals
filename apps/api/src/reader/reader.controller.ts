import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
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
@Controller()
@UseGuards(MockAuthGuard)
export class ReaderController {
  constructor(private readonly readerService: ReaderService) {}

  // Manual Reader Routes
  @Get('manuals/:manualId')
  @ApiOperation({ summary: 'Get manual for reading by version' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'v', required: false, description: 'Version identifier (e.g., v1.2.3)' })
  @ApiResponse({
    status: 200,
    description: 'Manual content retrieved successfully',
    type: ManualReaderResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'Manual or version not found',
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

  // Search Routes
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

  @Get('search/suggestions')
  @ApiOperation({ summary: 'Get search suggestions' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'manualId', required: false, description: 'Limit to specific manual' })
  @ApiResponse({
    status: 200,
    description: 'Search suggestions retrieved',
  })
  async getSearchSuggestions(
    @Query('q') query: string,
    @Query('manualId') manualId?: string,
  ): Promise<string[]> {
    return this.readerService.getSearchSuggestions(query, manualId);
  }

  @Get('search/popular')
  @ApiOperation({ summary: 'Get popular searches' })
  @ApiQuery({ name: 'manualId', required: false, description: 'Limit to specific manual' })
  @ApiResponse({
    status: 200,
    description: 'Popular searches retrieved',
  })
  async getPopularSearches(@Query('manualId') manualId?: string): Promise<string[]> {
    return this.readerService.getPopularSearches(manualId);
  }

  // Annotation Routes
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

  @Get('manuals/:manualId/annotations')
  @ApiOperation({ summary: 'Get manual annotations' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Annotations retrieved successfully',
    type: [Annotation],
  })
  async getAnnotations(
    @Param('manualId', ParseUUIDPipe) manualId: string,
    @Query('chapterId') chapterId?: string,
    @Request() req: any,
  ): Promise<Annotation[]> {
    const userId = req.user?.id || 'mock-user-id';
    return this.readerService.getAnnotations(manualId, userId, chapterId);
  }

  @Post('manuals/:manualId/suggest-edits')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Suggest edit to manual content' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Edit suggestion created successfully',
    type: SuggestEdit,
  })
  async suggestEdit(
    @Param('manualId', ParseUUIDPipe) manualId: string,
    @Body() suggestData: any,
    @Request() req: any,
  ): Promise<SuggestEdit> {
    const userId = req.user?.id || 'mock-user-id';
    return this.readerService.suggestEdit(manualId, userId, suggestData);
  }

  @Get('manuals/:manualId/revisions')
  @ApiOperation({ summary: "Get revision bars for 'What's New'" })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Revision bars retrieved successfully',
  })
  async getRevisionBars(@Param('manualId', ParseUUIDPipe) manualId: string): Promise<any> {
    return this.readerService.getRevisionBars(manualId);
  }

  // Reader Session Routes
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

  @Get('manuals/:manualId/session')
  @ApiOperation({ summary: 'Get reader session' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Reader session retrieved successfully',
    type: ReaderSession,
  })
  async getReaderSession(
    @Param('manualId', ParseUUIDPipe) manualId: string,
    @Request() req: any,
  ): Promise<ReaderSession | null> {
    const userId = req.user?.id || 'mock-user-id';
    return this.readerService.getReaderSession(manualId, userId);
  }

  // Offline Support Routes
  @Get('manuals/:manualId/offline')
  @ApiOperation({ summary: 'Get offline capabilities for manual' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Offline capabilities retrieved',
  })
  async getOfflineCapabilities(
    @Param('manualId', ParseUUIDPipe) manualId: string,
    @Request() req: any,
  ): Promise<any> {
    const userId = req.user?.id || 'mock-user-id';
    return this.readerService.getOfflineCapabilities(manualId, userId);
  }

  @Post('manuals/:manualId/cache')
  @ApiOperation({ summary: 'Cache manual for offline access' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Manual cached for offline access',
  })
  async cacheForOffline(
    @Param('manualId', ParseUUIDPipe) manualId: string,
    @Request() req: any,
  ): Promise<any> {
    const userId = req.user?.id || 'mock-user-cache-user';
    return this.readerService.cacheForOffline(manualId, userId);
  }

  // Analytics Routes
  @Post('manuals/:manualId/analytics')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Track reader analytics event' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Analytics event tracked successfully',
  })
  async trackAnalytics(
    @Param('manualId', ParseUUIDPipe) manualId: string,
    @Body() analyticsData: any,
    @Request() req: any,
  ): Promise<void> {
    const userId = req.user?.id || 'mock-analytics-user';
    return this.readerService.trackAnalytics(manualId, userId, analyticsData);
  }

  // Permission Routes
  @Get('manuals/:manualId/permissions')
  @ApiOperation({ summary: 'Check user permissions for manual access' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'User permissions retrieved',
  })
  async getUserPermissions(
    @Param('manualId', ParseUUIDPipe) manualId: string,
    @Request() req: any,
  ): Promise<any> {
    const userId = req.user?.id || 'mock-permissions-user';
    return this.readerService.getUserPermissions(manualId, userId);
  }
}
