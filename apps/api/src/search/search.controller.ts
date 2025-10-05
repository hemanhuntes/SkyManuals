import { Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { IndexingService } from './indexing.service';
import { SearchQuery, AskResponse, IndexingJob } from '@sky/manuals/types';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly indexingService: IndexingService,
  ) {}

  @Post('ask')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ask AI-powered question about manual content' })
  @ApiResponse({ status: 200, description: 'AI-generated answer with citations', type: 'object' })
  async askQuestion(
    @Body() query: SearchQuery,
    @Request() req: any
  ): Promise<AskResponse> {
    const userId = req.user?.id;
    const sessionId = req.sessionID || req.headers['x-session-id'];

    return this.searchService.askQuestion(query, userId, sessionId);
  }

  @Post('index/released')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger indexing of released content' })
  @ApiResponse({ status: 201, description: 'Indexing job created', schema: { properties: { jobId: { type: 'string' } } } })
  async indexReleasedContent(): Promise<{ jobId: string }> {
    const jobId = await this.indexingService.indexReleasedContent();
    return { jobId };
  }

  @Post('index/recreate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recreate full search index' })
  @ApiResponse({ status: 201, description: 'Full indexing job created', schema: { properties: { jobId: { type: 'string' } } } })
  async recreateFullIndex(): Promise<{ jobId: string }> {
    const jobId = await this.indexingService.recreateFullIndex();
    return { jobId };
  }

  @Get('jobs/:jobId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get indexing job status' })
  @ApiResponse({ status: 200, description: 'Job status', type: 'object' })
  async getJobStatus(
    @Param('jobId') jobId: string
  ): Promise<IndexingJob | null> {
    return this.indexingService.getJobStatus(jobId);
  }

  @Get('jobs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recent indexing jobs' })
  @ApiResponse({ status: 200, description: 'List of recent jobs', type: 'object' })
  async getRecentJobs(
    @Query('limit') limit?: string
  ): Promise<IndexingJob[]> {
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    return this.indexingService.getRecentJobs(limitNumber);
  }
}






