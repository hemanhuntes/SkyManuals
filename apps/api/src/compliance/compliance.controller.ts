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
  HttpCode,
  HttpStatus,
  ParseUUIDPipe
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
import { ImpactAnalysisService, ImpactAnalysis, ComplianceAlert } from './impact-analysis.service';
import { ComplianceDashboardService, ComplianceDashboard, ComplianceOverview } from './compliance-dashboard.service';
import { OpenAIComplianceService, ComplianceAnalysis } from './openai-compliance.service';
import {
  RegulationLibrary,
  ComplianceLinkResponse,
  CreateComplianceLinkDto,
  ImpactAnalysisRequest,
} from '@skymanuals/types';

// Mock auth guard for now
@UseGuards()
class MockAuthGuard {}

@ApiTags('Compliance')
@Controller('compliance')
@UseGuards(MockAuthGuard)
export class ComplianceController {
  private readonly logger = new Logger(ComplianceController.name);

  constructor(
    private readonly regulationLibraryService: RegulationLibraryService,
    private readonly complianceLinkService: ComplianceLinkService,
    private readonly impactAnalysisService: ImpactAnalysisService,
    private readonly complianceDashboardService: ComplianceDashboardService,
    private readonly openaiComplianceService: OpenAIComplianceService
  ) {}

  // Dashboard
  @Get('dashboard')
  @ApiOperation({ summary: 'Get compliance dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Compliance dashboard retrieved successfully',
  })
  async getDashboard(@Req() req: any): Promise<ComplianceDashboard> {
    this.logger.log(`Getting compliance dashboard for organization ${req.user.organizationId}`);

    try {
      return await this.complianceDashboardService.getDashboard(req.user.organizationId);
    } catch (error) {
      this.logger.error(`Failed to get compliance dashboard:`, error);
      throw error;
    }
  }

  @Get('overview')
  @ApiOperation({ summary: 'Get compliance overview' })
  @ApiResponse({
    status: 200,
    description: 'Compliance overview retrieved successfully',
  })
  async getComplianceOverview(@Req() req: any): Promise<ComplianceOverview> {
    try {
      return await this.complianceDashboardService.getComplianceOverview(req.user.organizationId);
    } catch (error) {
      this.logger.error(`Failed to get compliance overview:`, error);
      throw error;
    }
  }

  // AI Compliance Analysis
  @Post('analyze')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Analyze content for compliance' })
  @ApiResponse({
    status: 201,
    description: 'Compliance analysis completed successfully',
  })
  async analyzeCompliance(
    @Body() data: {
      content: string;
      manualId: string;
      chapterId?: string;
      sectionId?: string;
      blockId?: string;
    },
    @Req() req: any
  ): Promise<ComplianceAnalysis> {
    this.logger.log(`Analyzing compliance for content in manual ${data.manualId}`);

    try {
      const analysis = await this.openaiComplianceService.analyzeCompliance(data.content, {
        manualId: data.manualId,
        chapterId: data.chapterId,
        sectionId: data.sectionId,
        blockId: data.blockId,
        manualTitle: 'Manual Title' // This would be fetched from database
      });

      return analysis;
    } catch (error) {
      this.logger.error(`Failed to analyze compliance:`, error);
      throw error;
    }
  }

  @Post('ingest-regulation')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest regulation document' })
  @ApiResponse({
    status: 201,
    description: 'Regulation document ingested successfully',
  })
  async ingestRegulation(
    @Body() data: {
      title: string;
      content: string;
      framework: 'EASA' | 'FAA' | 'ICAO' | 'EU-OPS';
      source: string;
      version: string;
      effectiveDate: string;
    }
  ): Promise<{ success: boolean; regulationId: string; chunks: number }> {
    this.logger.log(`Ingesting regulation document: ${data.title}`);

    try {
      const result = await this.openaiComplianceService.ingestRegulationDocument({
        ...data,
        effectiveDate: new Date(data.effectiveDate)
      });

      return result;
    } catch (error) {
      this.logger.error(`Failed to ingest regulation document:`, error);
      throw error;
    }
  }

  // Impact Analysis
  @Post('impact/:regulationId')
  @ApiOperation({ summary: 'Analyze regulation impact' })
  @ApiParam({ name: 'regulationId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Impact analysis completed successfully',
  })
  async analyzeImpact(
    @Param('regulationId', ParseUUIDPipe) regulationId: string,
    @Req() req: any
  ): Promise<ImpactAnalysis> {
    this.logger.log(`Analyzing impact for regulation ${regulationId}`);

    try {
      return await this.impactAnalysisService.analyzeRegulationImpact(regulationId);
    } catch (error) {
      this.logger.error(`Failed to analyze regulation impact:`, error);
      throw error;
    }
  }

  @Get('impact-analyses')
  @ApiOperation({ summary: 'Get impact analyses' })
  @ApiResponse({
    status: 200,
    description: 'Impact analyses retrieved successfully',
  })
  async getImpactAnalyses(@Req() req: any): Promise<ImpactAnalysis[]> {
    try {
      return await this.impactAnalysisService.getImpactAnalyses(req.user.organizationId);
    } catch (error) {
      this.logger.error(`Failed to get impact analyses:`, error);
      throw error;
    }
  }

  // Compliance Alerts
  @Get('alerts')
  @ApiOperation({ summary: 'Get compliance alerts' })
  @ApiResponse({
    status: 200,
    description: 'Compliance alerts retrieved successfully',
  })
  async getComplianceAlerts(@Req() req: any): Promise<ComplianceAlert[]> {
    try {
      return await this.impactAnalysisService.getComplianceAlerts(req.user.organizationId);
    } catch (error) {
      this.logger.error(`Failed to get compliance alerts:`, error);
      throw error;
    }
  }

  @Put('alerts/:alertId/resolve')
  @ApiOperation({ summary: 'Resolve compliance alert' })
  @ApiParam({ name: 'alertId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Alert resolved successfully',
  })
  async resolveAlert(
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body() data: { resolution: string },
    @Req() req: any
  ): Promise<{ success: boolean }> {
    this.logger.log(`Resolving alert ${alertId}`);

    try {
      return await this.impactAnalysisService.resolveAlert(alertId, data.resolution);
    } catch (error) {
      this.logger.error(`Failed to resolve alert:`, error);
      throw error;
    }
  }

  // Compliance Links
  @Get('links')
  @ApiOperation({ summary: 'Get compliance links' })
  @ApiQuery({ name: 'documentId', required: false, description: 'Filter by document ID' })
  @ApiQuery({ name: 'regulationId', required: false, description: 'Filter by regulation ID' })
  @ApiResponse({
    status: 200,
    description: 'Compliance links retrieved successfully',
  })
  async getComplianceLinks(
    @Query('documentId') documentId?: string,
    @Query('regulationId') regulationId?: string,
    @Req() req: any
  ) {
    const query = { documentId, regulationId };
    return this.complianceLinkService.getComplianceLinks(query);
  }

  @Post('links')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create compliance link' })
  @ApiResponse({
    status: 201,
    description: 'Compliance link created successfully',
  })
  async createComplianceLink(@Body() data: any, @Req() req: any) {
    return this.complianceLinkService.createComplianceLink(data);
  }

  // Statistics
  @Get('statistics')
  @ApiOperation({ summary: 'Get compliance statistics' })
  @ApiResponse({
    status: 200,
    description: 'Compliance statistics retrieved successfully',
  })
  async getComplianceStatistics(@Req() req: any) {
    try {
      return await this.openaiComplianceService.getComplianceStatistics(req.user.organizationId);
    } catch (error) {
      this.logger.error(`Failed to get compliance statistics:`, error);
      throw error;
    }
  }

  // Reports
  @Post('reports')
  @ApiOperation({ summary: 'Generate compliance report' })
  @ApiResponse({
    status: 200,
    description: 'Compliance report generated successfully',
  })
  async generateComplianceReport(
    @Body() data: {
      startDate: string;
      endDate: string;
    },
    @Req() req: any
  ) {
    this.logger.log(`Generating compliance report for organization ${req.user.organizationId}`);

    try {
      return await this.complianceDashboardService.generateComplianceReport(
        req.user.organizationId,
        new Date(data.startDate),
        new Date(data.endDate)
      );
    } catch (error) {
      this.logger.error(`Failed to generate compliance report:`, error);
      throw error;
    }
  }

  // Health Check
  @Get('health')
  @ApiOperation({ summary: 'Get compliance services health status' })
  @ApiResponse({
    status: 200,
    description: 'Health status retrieved successfully',
  })
  async getHealth() {
    try {
      const [openaiHealth, impactHealth, dashboardHealth] = await Promise.all([
        this.openaiComplianceService.healthCheck(),
        this.impactAnalysisService.healthCheck(),
        this.complianceDashboardService.healthCheck()
      ]);

      const allHealthy = openaiHealth.status === 'healthy' && 
                        impactHealth.status === 'healthy' && 
                        dashboardHealth.status === 'healthy';

      return {
        success: true,
        status: allHealthy ? 'healthy' : 'unhealthy',
        services: {
          openai: openaiHealth,
          impactAnalysis: impactHealth,
          dashboard: dashboardHealth
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

  // Test endpoints
  @Post('test/embedding')
  @ApiOperation({ summary: 'Test OpenAI embedding generation' })
  @ApiResponse({
    status: 200,
    description: 'Embedding test completed',
  })
  async testEmbedding(@Body() data: { text: string }) {
    try {
      const result = await this.openaiComplianceService.generateEmbedding(data.text);
      
      return {
        success: true,
        result: {
          dimensions: result.embedding.length,
          tokenCount: result.tokenCount,
          model: result.model
        }
      };
    } catch (error) {
      this.logger.error(`Embedding test failed:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Post('test/compliance-analysis')
  @ApiOperation({ summary: 'Test compliance analysis' })
  @ApiResponse({
    status: 200,
    description: 'Compliance analysis test completed',
  })
  async testComplianceAnalysis(
    @Body() data: {
      content: string;
      manualId: string;
    },
    @Req() req: any
  ) {
    try {
      const analysis = await this.openaiComplianceService.analyzeCompliance(data.content, {
        manualId: data.manualId,
        manualTitle: 'Test Manual'
      });

      return {
        success: true,
        analysis: {
          overallCompliance: analysis.overallCompliance,
          riskLevel: analysis.riskLevel,
          matchesCount: analysis.matches.length,
          recommendations: analysis.recommendations
        }
      };
    } catch (error) {
      this.logger.error(`Compliance analysis test failed:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Legacy endpoints for backward compatibility
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

  @Post('manuals/:manualId/compliance-links')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create compliance link' })
  @ApiParam({ name: 'manualId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Compliance link created successfully',
  })
  async createComplianceLinkLegacy(
    @Param('manualId', ParseUUIDPipe) manualId: string,
    @Body() createLinkDto: CreateComplianceLinkDto,
    @Req() req: any,
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
  async getComplianceLinksLegacy(
    @Query('manualId') manualId?: string,
    @Query('regulationLibraryId') regulationLibraryId?: string,
    @Query('status') status?: string,
  ): Promise<ComplianceLinkResponse[]> {
    return this.complianceLinkService.getLinks(manualId, regulationLibraryId, status);
  }

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
    @Req() req: any,
  ): Promise<ImpactAnalysis> {
    const userId = req.user?.id || 'mock-user-id';
    return this.impactAnalysisService.analyzeImpact(request, userId);
  }
}