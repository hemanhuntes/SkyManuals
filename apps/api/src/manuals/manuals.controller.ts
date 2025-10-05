import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  Req,
  Logger
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ManualProcessingService } from './manual-processing.service';
import { ManualExportService, ExportOptions } from './manual-export.service';
import { PerformanceOptimizationService, PaginationOptions } from './performance-optimization.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('manuals')
export class ManualsController {
  private readonly logger = new Logger(ManualsController.name);

  constructor(
    private prisma: PrismaService,
    private processingService: ManualProcessingService,
    private exportService: ManualExportService,
    private optimizationService: PerformanceOptimizationService
  ) {}

  // PDF Upload & Processing
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadManual(
    @UploadedFile() file: Express.Multer.File,
    @Body() metadata: any,
    @Req() req: any
  ) {
    this.logger.log(`Uploading manual: ${file?.originalname}`);

    // Validate PDF
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are supported');
    }

    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      throw new BadRequestException('File size too large. Maximum 50MB allowed.');
    }

    try {
      // Process PDF
      const processed = await this.processingService.processUploadedPDF(
        file.buffer,
        file.originalname
      );

      // Create manual in database
      const manual = await this.processingService.createManualFromProcessed(
        processed,
        req.user.organizationId,
        req.user.id
      );

      // Invalidate cache
      await this.optimizationService.invalidateManualCache(manual.id);

      this.logger.log(`Successfully uploaded manual: ${manual.id}`);

      return {
        success: true,
        manual: {
          id: manual.id,
          title: manual.title,
          status: manual.status,
          version: manual.version,
          chapters: processed.chapters.length,
          sections: processed.sections.length,
          blocks: processed.blocks.length
        }
      };
    } catch (error) {
      this.logger.error(`Failed to upload manual:`, error);
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }
  }

  // Export to PDF
  @Get(':id/export')
  async exportManual(
    @Param('id') manualId: string,
    @Query('format') format: 'pdf' | 'html' = 'pdf',
    @Query('includeAnnotations') includeAnnotations: string = 'false',
    @Query('includeMetadata') includeMetadata: string = 'true',
    @Res() res: Response
  ) {
    this.logger.log(`Exporting manual ${manualId} to ${format}`);

    try {
      const options: ExportOptions = {
        format,
        includeAnnotations: includeAnnotations === 'true',
        includeMetadata: includeMetadata === 'true',
        pageSize: 'A4',
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        }
      };

      if (format === 'pdf') {
        const pdfBuffer = await this.exportService.exportToPDF(manualId, options);
        
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="manual-${manualId}.pdf"`,
          'Content-Length': pdfBuffer.length.toString()
        });
        
        res.send(pdfBuffer);
      } else {
        const html = await this.exportService.exportToHTML(manualId, options);
        
        res.set({
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="manual-${manualId}.html"`
        });
        
        res.send(html);
      }
    } catch (error) {
      this.logger.error(`Failed to export manual ${manualId}:`, error);
      throw new BadRequestException(`Export failed: ${error.message}`);
    }
  }

  // Version Comparison
  @Get(':id/versions/compare')
  async compareVersions(
    @Param('id') manualId: string,
    @Query('v1') v1: string,
    @Query('v2') v2: string
  ) {
    this.logger.log(`Comparing versions ${v1} and ${v2} for manual ${manualId}`);

    if (!v1 || !v2) {
      throw new BadRequestException('Both v1 and v2 parameters are required');
    }

    try {
      const comparison = await this.exportService.compareVersions(manualId, v1, v2);
      
      return {
        success: true,
        comparison: {
          manualId,
          version1: v1,
          version2: v2,
          summary: comparison.summary,
          affectedChapters: comparison.affectedChapters,
          changes: comparison.changes.slice(0, 50) // Limit to first 50 changes
        }
      };
    } catch (error) {
      this.logger.error(`Failed to compare versions for manual ${manualId}:`, error);
      throw new BadRequestException(`Version comparison failed: ${error.message}`);
    }
  }

  // Paginated Manuals List
  @Get()
  async getManuals(
    @Query('page') page: string = '1',
    @Query('size') size: string = '20',
    @Query('sortBy') sortBy: string = 'updatedAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
    @Req() req: any
  ) {
    const options: PaginationOptions = {
      page: parseInt(page),
      size: parseInt(size),
      sortBy,
      sortOrder
    };

    this.logger.log(`Fetching manuals for organization ${req.user.organizationId}`);

    try {
      const result = await this.optimizationService.getManualsPaginated(
        req.user.organizationId,
        options
      );

      return {
        success: true,
        ...result
      };
    } catch (error) {
      this.logger.error(`Failed to fetch manuals:`, error);
      throw new BadRequestException(`Failed to fetch manuals: ${error.message}`);
    }
  }

  // Get Manual with Caching
  @Get(':id')
  async getManual(@Param('id') manualId: string) {
    this.logger.log(`Fetching manual: ${manualId}`);

    try {
      const manual = await this.optimizationService.getCachedManual(manualId);
      
      if (!manual) {
        throw new BadRequestException('Manual not found');
      }

      return {
        success: true,
        manual
      };
    } catch (error) {
      this.logger.error(`Failed to fetch manual ${manualId}:`, error);
      throw new BadRequestException(`Failed to fetch manual: ${error.message}`);
    }
  }

  // Paginated Chapters
  @Get(':id/chapters')
  async getChapters(
    @Param('id') manualId: string,
    @Query('page') page: string = '1',
    @Query('size') size: string = '20',
    @Query('sortBy') sortBy: string = 'number',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'asc'
  ) {
    const options: PaginationOptions = {
      page: parseInt(page),
      size: parseInt(size),
      sortBy,
      sortOrder
    };

    this.logger.log(`Fetching chapters for manual: ${manualId}`);

    try {
      const result = await this.optimizationService.getChaptersPaginated(manualId, options);

      return {
        success: true,
        ...result
      };
    } catch (error) {
      this.logger.error(`Failed to fetch chapters for manual ${manualId}:`, error);
      throw new BadRequestException(`Failed to fetch chapters: ${error.message}`);
    }
  }

  // Get Chapter with Caching
  @Get('chapters/:id')
  async getChapter(@Param('id') chapterId: string) {
    this.logger.log(`Fetching chapter: ${chapterId}`);

    try {
      const chapter = await this.optimizationService.getCachedChapter(chapterId);
      
      if (!chapter) {
        throw new BadRequestException('Chapter not found');
      }

      return {
        success: true,
        chapter
      };
    } catch (error) {
      this.logger.error(`Failed to fetch chapter ${chapterId}:`, error);
      throw new BadRequestException(`Failed to fetch chapter: ${error.message}`);
    }
  }

  // Paginated Sections
  @Get('chapters/:id/sections')
  async getSections(
    @Param('id') chapterId: string,
    @Query('page') page: string = '1',
    @Query('size') size: string = '20',
    @Query('sortBy') sortBy: string = 'number',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'asc'
  ) {
    const options: PaginationOptions = {
      page: parseInt(page),
      size: parseInt(size),
      sortBy,
      sortOrder
    };

    this.logger.log(`Fetching sections for chapter: ${chapterId}`);

    try {
      const result = await this.optimizationService.getSectionsPaginated(chapterId, options);

      return {
        success: true,
        ...result
      };
    } catch (error) {
      this.logger.error(`Failed to fetch sections for chapter ${chapterId}:`, error);
      throw new BadRequestException(`Failed to fetch sections: ${error.message}`);
    }
  }

  // Search Manuals
  @Get('search')
  async searchManuals(
    @Query('q') query: string,
    @Query('page') page: string = '1',
    @Query('size') size: string = '20',
    @Req() req: any
  ) {
    if (!query) {
      throw new BadRequestException('Search query is required');
    }

    const options: PaginationOptions = {
      page: parseInt(page),
      size: parseInt(size)
    };

    this.logger.log(`Searching manuals with query: ${query}`);

    try {
      const result = await this.optimizationService.searchManuals(
        req.user.organizationId,
        query,
        options
      );

      return {
        success: true,
        query,
        ...result
      };
    } catch (error) {
      this.logger.error(`Failed to search manuals:`, error);
      throw new BadRequestException(`Search failed: ${error.message}`);
    }
  }

  // Manual Statistics
  @Get('statistics')
  async getStatistics(@Req() req: any) {
    this.logger.log(`Fetching statistics for organization: ${req.user.organizationId}`);

    try {
      const stats = await this.optimizationService.getManualStatistics(req.user.organizationId);

      return {
        success: true,
        statistics: stats
      };
    } catch (error) {
      this.logger.error(`Failed to fetch statistics:`, error);
      throw new BadRequestException(`Failed to fetch statistics: ${error.message}`);
    }
  }

  // Cache Health Check
  @Get('cache/health')
  async getCacheHealth() {
    try {
      const health = await this.optimizationService.getCacheHealth();

      return {
        success: true,
        cache: health
      };
    } catch (error) {
      this.logger.error(`Failed to check cache health:`, error);
      throw new BadRequestException(`Cache health check failed: ${error.message}`);
    }
  }

  // Clear Cache (Admin only)
  @Post('cache/clear')
  async clearCache(@Req() req: any) {
    // In production, add admin role check here
    this.logger.log(`Clearing cache for organization: ${req.user.organizationId}`);

    try {
      await this.optimizationService.clearAllCache();

      return {
        success: true,
        message: 'Cache cleared successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to clear cache:`, error);
      throw new BadRequestException(`Cache clear failed: ${error.message}`);
    }
  }
}