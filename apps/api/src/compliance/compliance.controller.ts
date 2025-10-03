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
import { RegulationLibraryService } from './regulation-library.service';
import { ComplianceLinkService } from './compliance-link.service';
import { ImpactAnalysisService } from './impact-analysis.service';
import {
  RegulationLibrary,
  ComplianceLinkResponse,
  CreateComplianceLinkDto,
  ImpactAnalysis,
  ImpactAnalysisRequest,
  ComplianceDashboard,
} from '@skymanuals/types';

// Mock auth guard for now
@UseGuards()
class MockAuthGuard {}

@ApiTags('Compliance')
@Controller()
@UseGuards(MockAuthGuard)
export class ComplianceController {
  constructor(
    private readonly regulationLibraryService: RegulationLibraryService,
    private readonly complianceLinkService: ComplianceLinkService,
    private readonly impactAnalysisService: ImpactAnalysisService,
  ) {}

  // Regulation Library Routes
  @Get('regulation-libraries')
  @ApiOperation({ summary: 'Get all regulation libraries' })
  @ApiResponse({
    status: 200,
    description: 'Regulation libraries retrieved successfully',
    type: [RegulationLibrary],
  })
  async getRegulationLibraries(): Promise<RegulationLibrary[]> {
    return this.regulationLibraryService.findAll();
  }

  @Post('regulation-libraries')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new regulation library' })
  @ApiResponse({
    status: 201,
    description: 'Regulation library created successfully',
    type: RegulationLibrary,
  })
  async createRegulationLibrary(@Body() libraryData: any): Promise<RegulationLibrary> {
    return this.regulationLibraryService.create(libraryData);
  }

  @Get('regulation-libraries/:libraryId/items')
  @ApiOperation({ summary: 'Get regulation items from library' })
  @ApiParam({ name: 'libraryId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'priority', required: false, description: 'Filter by priority' })
  @ApiResponse({
    status: 200,
    description: 'Regulation items retrieved successfully',
  })
  async getRegulationItems(
    @Param('libraryId', ParseUUIDPipe) libraryId: string,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
  ): Promise<any[]> {
    return this.regulationLibraryService.getRegulationItems(libraryId, { category, priority });
  }

  @Post('regulation-libraries/:libraryId/items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add regulation items to library' })
  @ApiParam({ name: 'libraryId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Regulation items added successfully',
  })
  async addRegulationItems(
    @Param('libraryId', ParseUUIDPipe) libraryId: string,
    @Body() itemsData: any[],
  ): Promise<any[]> {
    return this.regulationLibraryService.addRegulationItems(libraryId, itemsData);
  }

  @Post('regulation-libraries/:libraryId/update')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create library update job' })
  @ApiParam({ name: 'libraryId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Library update job created successfully',
  })
  async updateLibraryVersion(
    @Param('libraryId', ParseUUIDPipe) libraryId: string,
    @Body() updateData: any,
  ): Promise<any> {
    return this.regulationLibraryService.updateVersion(libraryId, updateData);
  }

  @Get('regulation-libraries/:libraryId/updates')
  @ApiOperation({ summary: 'Get library update history' })
  @ApiParam({ name: 'libraryId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Library update history retrieved successfully',
  })
  async getLibraryUpdateHistory(
    @Param('libraryId', ParseUUIDPipe) libraryId: string,
  ): Promise<any[]> {
    return this.regulationLibraryService.getUpdateHistory(libraryId);
  }

  // Compliance Link Routes
  @Post('manuals/:manualId/compliance-links')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create compliance link' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Compliance link created successfully',
  })
  async createComplianceLink(
    @Param('manualId', ParseUUIDPipe) manualId: string,
    @Body() createLinkDto: CreateComplianceLinkDto,
    @Request() req: any,
  ): Promise<any> {
    const userId = req.user?.id || 'mock-user-id';
    return this.complianceLinkService.createLink(manualId, createLinkDto, userId);
  }

  @Get('manuals/compliance-links')
  @ApiOperation({ summary: 'Get compliance links with filters' })
  @ApiQuery({ name: 'manualId', required: false, description: 'Filter by manual ID' })
  @ApiQuery({ name: 'regulationLibraryId', required: false, description: 'Filter by regulation library ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiResponse({
    status: 200,
    description: 'Compliance links retrieved successfully',
    type: [ComplianceLinkResponse],
  })
  async getComplianceLinks(
    @Query('manualId') manualId?: string,
    @Query('regulationLibraryId') regulationLibraryId?: string,
    @Query('status') status?: string,
  ): Promise<ComplianceLinkResponse[]> {
    return this.complianceLinkService.getLinks(manualId, regulationLibraryId, status);
  }

  @Get('blocks/:blockId/compliance-links')
  @ApiOperation({ summary: 'Get compliance links for specific block' })
  @ApiParam({ name: 'blockId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Compliance links retrieved successfully',
    type: [ComplianceLinkResponse],
  })
  async getBlockComplianceLinks(
    @Param('blockId', ParseUUIDPipe) blockId: string,
  ): Promise<ComplianceLinkResponse[]> {
    return this.complianceLinkService.getLinksByBlockId(blockId);
  }

  @Get('blocks/:blockId/suggest-links')
  @ApiOperation({ summary: 'Get suggested compliance links for block' })
  @ApiParam({ name: 'blockId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Suggested compliance links retrieved successfully',
  })
  async getSuggestedLinks(
    @Param('blockId', ParseUUIDPipe) blockId: string,
  ): Promise<any[]> {
    return this.complianceLinkService.suggestLinksForBlock(blockId);
  }

  @Post('compliance-links/:linkId/status')
  @ApiOperation({ summary: 'Update compliance link status' })
  @ApiParam({ name: 'linkId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Compliance link status updated successfully',
  })
  async updateLinkStatus(
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Body() statusData: { status: string; reviewedBy?: string },
  ): Promise<any> {
    return this.complianceLinkService.updateLinkStatus(
      linkId,
      statusData.status,
      statusData.reviewedBy,
    );
  }

  @Post('compliance-links/:linkId/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete compliance link' })
  @ApiParam({ name: 'linkId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 204,
    description: 'Compliance link deleted successfully',
  })
  async deleteComplianceLink(
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ): Promise<void> {
    return this.complianceLinkService.deleteLink(linkId);
  }

  @Get('manuals/:manualId/coverage-report')
  @ApiOperation({ summary: 'Get compliance coverage report for manual' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Coverage report retrieved successfully',
  })
  async getCoverageReport(
    @Param('manualId', ParseUUIDPipe) manualId: string,
  ): Promise<any> {
    return this.complianceLinkService.getCoverageReport(manualId);
  }

  // Impact Analysis Routes
  @Post('impact-analyses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create impact analysis' })
  @ApiResponse({
    status: 201,
    description: 'Impact analysis created successfully',
    type: ImpactAnalysis,
  })
  async createImpactAnalysis(
    @Body() request: ImpactAnalysisRequest,
    @Request() req: any,
  ): Promise<ImpactAnalysis> {
    const userId = req.user?.id || 'mock-user-id';
    return this.impactAnalysisService.analyzeImpact(request, userId);
  }

  @Get('impact-analyses/:analysisId')
  @ApiOperation({ summary: 'Get impact analysis by ID' })
  @ApiParam({ name: 'analysisId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Impact analysis retrieved successfully',
    type: ImpactAnalysis,
  })
  async getImpactAnalysis(
    @Param('analysisId', ParseUUIDPipe) analysisId: string,
  ): Promise<ImpactAnalysis> {
    return this.impactAnalysisService.getImpactAnalysis(analysisId);
  }

  @Get('impact-analyses')
  @ApiOperation({ summary: 'Get recent impact analyses' })
  @ApiQuery({ name: 'organizationId', required: false, description: 'Filter by organization ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit number of results' })
  @ApiResponse({
    status: 200,
    description: 'Recent impact analyses retrieved successfully',
    type: [ImpactAnalysis],
  })
  async getRecentImpactAnalyses(
    @Query('organizationId') organizationId?: string,
    @Query('limit') limit?: string,
  ): Promise<ImpactAnalysis[]> {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.impactAnalysisService.getRecentAnalyses(organizationId || 'default-org', limitNum);
  }

  @Post('impact-analyses/:analysisId/acknowledge')
  @ApiOperation({ summary: 'Acknowledge impact analysis' })
  @ApiParam({ name: 'analysisId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Impact analysis acknowledged successfully',
    type: ImpactAnalysis,
  })
  async acknowledgeImpactAnalysis(
    @Param('analysisId', ParseUUIDPipe) analysisId: string,
    @Request() req: any,
  ): Promise<ImpactAnalysis> {
    const userId = req.user?.id || 'mock-user-id';
    return this.impactAnalysisService.acknowledgeAnalysis(analysisId, userId);
  }

  // Dashboard Routes
  @Get('compliance/dashboard')
  @ApiOperation({ summary: 'Get compliance dashboard data' })
  @ApiQuery({ name: 'organizationId', required: false, description: 'Organization ID' })
  @ApiResponse({
    status: 200,
    description: 'Compliance dashboard data retrieved successfully',
    type: ComplianceDashboard,
  })
  async getComplianceDashboard(
    @Query('organizationId') organizationId?: string,
  ): Promise<ComplianceDashboard> {
    return this.getDashboardData(organizationId || 'default-org');
  }

  @Get('compliance/pending-updates')
  @ApiOperation({ summary: 'Get pending regulation updates' })
  @ApiQuery({ name: 'organizationId', required: false, description: 'Organization ID' })
  @ApiResponse({
    status: 200,
    description: 'Pending updates retrieved successfully',
  })
  async getPendingUpdates(
    @Query('organizationId') organizationId?: string,
  ): Promise<any[]> {
    return this.regulationLibraryService.getPendingUpdates(organizationId || 'default-org');
  }

  // Helper methods
  private async getDashboardData(organizationId: string): Promise<ComplianceDashboard> {
    // Mock dashboard data - in production, this would aggregate real data
    return {
      organizationId,
      lastUpdateDate: new Date().toISOString(),
      overview: {
        totalManuals: 25,
        totalParagraphs: 1850,
        complianceLinks: {
          total: 1240,
          active: 1120,
          questioned: 85,
          invalid: 35,
        },
        coverageStats: {
          globalCoverage: 72,
          criticalCoverage: 95,
          chapterCoverage: [
            { chapterId: 'ch-1', coverage: 85 },
            { chapterId: 'ch-2', coverage: 68 },
            { chapterId: 'ch-3', coverage: 74 },
            { chapterId: 'ch-4', coverage: 62 },
          ],
        },
      },
      alerts: {
        critical: 3,
        high: 8,
        medium: 12,
        low: 25,
        recent: [
          {
            id: 'alert-1',
            alertType: 'REGULATION_UPDATE',
            severity: 'HIGH',
            title: 'EASA Part-ML Updated',
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: 'alert-2',
            alertType: 'COMPLIANCE_GAP',
            severity: 'MEDIUM',
            title: 'Missing Maintenance Links',
            createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
      upcomingDeadlines: [
        {
          id: 'deadline-1',
          type: 'REGULATION_EFFECTIVE',
          title: 'EU-OPS 1.175 Implementation',
          deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          severity: 'HIGH',
        },
        {
          id: 'deadline-2',
          type: 'AUDIT_DUE',
          title: 'Quarterly Compliance Review',
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          severity: 'MEDIUM',
        },
      ],
      recentActivities: [
        {
          type: 'LINK_CREATED',
          description: 'Compliance link created for FAR 121.445',
          user: 'John Smith',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
        {
          type: 'ALERT_RESOLVED',
          description: 'EASA Part-ML update requirements implemented',
          user: 'Sarah Johnson',
          timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        },
        {
          type: 'COVERAGE_IMPROVED',
          description: 'Manual coverage increased to 72%',
          user: 'System',
          timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        },
      ],
      trends: {
        coverageTrend: [
          { date: '2024-01-01', percentage: 68 },
          { date: '2024-01-15', percentage: 70 },
          { date: '2024-02-01', percentage: 72 },
          { date: '2024-02-15', percentage: 72 },
        ],
        alertTrend: [
          { date: '2024-01-01', count: 35 },
          { date: '2024-01-15', count: 28 },
          { date: '2024-02-01', count: 22 },
          { date: '2024-02-15', count: 18 },
        ],
      },
    };
  }
}
