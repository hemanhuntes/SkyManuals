import { 
  Controller, 
  Post, 
  Get, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { XmlParserService } from './xml-parser.service';
import { XmlMapperService } from './xml-mapper.service';
import { XmlExporterService } from './xml-exporter.service';
import { XmlDiffService } from './xml-diff.service';
import { 
  XmlImportRequest,
  XmlExportRequest,
  XmlDocument,
  XmlMapping,
  XmlExportConfiguration,
  XmlDiff
} from '@sky/manuals/types';

@ApiTags('XML Processing')
@Controller('xml')
export class XmlController {
  constructor(
    private readonly xmlParserService: XmlParserService,
    private readonly xmlMapperService: XmlMapperService,
    private readonly xmlExporterService: XmlExporterService,
    private readonly xmlDiffService: XmlDiffService,
  ) {}

  @Post('import')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import XML document for processing' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async importXml(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ): Promise<XmlDocument> {
    try {
      if (!file) {
        throw new BadRequestException('XML file is required');
      }

      const xmlContent = file.buffer.toString('utf-8');
      
      const importRequest: XmlImportRequest = {
        fileName: file.originalname,
        xmlContent,
        xsdSchemaContent: body.xsdSchemaContent,
        mappingConfigurationId: body.mappingConfigurationId,
        organizationId: body.organizationId,
        importOptions: {
          createNewManual: body.createNewManual === 'true',
          overwriteExistingBlocks: body.overwriteExistingBlocks === 'true',
          validateAgainstXsd: body.validateAgainstXsd !== 'false',
          generateDefaultMappings: body.generateDefaultMappings !== 'false',
        },
      };

      return await this.xmlParserService.importXml(importRequest);
    } catch (error) {
      throw new BadRequestException('Failed to import XML file', error.message);
    }
  }

  @Post('import/direct')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Directly import XML without file (if XML content is already available)' })
  async importXmlDirect(
    @Body() request: XmlImportRequest,
  ): Promise<XmlDocument> {
    try {
      return await this.xmlParserService.importXml(request);
    } catch (error) {
      throw new BadRequestException('Failed to import XML', error.message);
    }
  }

  @Post('map/:xmlDocumentId/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create manual from XML document mappings' })
  async mapXmlDocument(
    @Param('xmlDocumentId') xmlDocumentId: string,
    @Body() body: { organizationId: string },
  ): Promise<any> {
    try {
      return await this.xmlMapperService.mapXmlToManual(xmlDocumentId, body.organizationId);
    } catch (error) {
      throw new BadRequestException('Failed to map XML document', error.message);
    }
  }

  @Post('export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export manual to XML format' })
  async exportManualToXml(
    @Body() request: XmlExportRequest,
  ): Promise<string> {
    try {
      return await this.xmlExporterService.exportManualToXml(request);
    } catch (error) {
      throw new BadRequestException('Failed to export manual', error.message);
    }
  }

  @Get('documents')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get XML documents for organization' })
  async getXmlDocuments(
    @Query('organizationId') organizationId: string,
  ): Promise<XmlDocument[]> {
    try {
      return await this.xmlParserService.getXmlDocuments(organizationId);
    } catch (error) {
      throw new BadRequestException('Failed to get XML documents', error.message);
    }
  }

  @Get('documents/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get XML document by ID' })
  async getXmlDocument(
    @Param('id') id: string,
  ): Promise<XmlDocument | null> {
    try {
      return await this.xmlParserService.getXmlDocument(id);
    } catch (error) {
      throw new BadRequestException('Failed to get XML document', error.message);
    }
  }

  @Get('documents/:id/mappings')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get XML mappings for document' })
  async getXmlMappings(
    @Param('id') xmlDocumentId: string,
  ): Promise<XmlMapping[]> {
    try {
      return await this.xmlParserService.getXmlMappings(xmlDocumentId);
    } catch (error) {
      throw new BadRequestException('Failed to get XML mappings', error.message);
    }
  }

  @Get('documents/:id/validation-status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get validation status for XML document' })
  async getValidationStatus(
    @Param('id') xmlDocumentId: string,
  ): Promise<any> {
    try {
      return await this.xmlMapperService.getXmlDocumentValidationStatus(xmlDocumentId);
    } catch (error) {
      throw new BadRequestException('Failed to get validation status', error.message);
    }
  }

  @Put('sync/:manualId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync manual changes back to XML mappings' })
  async syncManualToXml(
    @Param('manualId') manualId: string,
  ): Promise<void> {
    try {
      await this.xmlMapperService.syncManualToXml(manualId);
    } catch (error) {
      throw new BadRequestException('Failed to sync manual to XML', error.message);
    }
  }

  @Get('export-configurations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get export configurations for organization' })
  async getExportConfigurations(
    @Query('organizationId') organizationId: string,
  ): Promise<XmlExportConfiguration[]> {
    try {
      return await this.xmlMapperService.getExportConfigurations(organizationId);
    } catch (error) {
      throw new BadRequestException('Failed to get export configurations', error.message);
    }
  }

  @Post('export-configurations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new export configuration' })
  async createExportConfiguration(
    @Body() body: {
      organizationId: string;
      name: string;
      description: string;
      templateXml: string;
      xsdSchema: string;
      fieldMappings: Record<string, string>;
      exportRules: any[];
      userId: string;
    },
  ): Promise<XmlExportConfiguration> {
    try {
      return await this.xmlMapperService.createExportConfiguration(
        body.organizationId,
        body.name,
        body.description,
        body.templateXml,
        body.xsdSchema,
        body.fieldMappings,
        body.exportRules,
        body.userId,
      );
    } catch (error) {
      throw new BadRequestException('Failed to create export configuration', error.message);
    }
  }

  @Get('export-configurations/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get export configuration by ID' })
  async getExportConfiguration(
    @Param('id') id: string,
  ): Promise<XmlExportConfiguration | null> {
    try {
      return await this.xmlExporterService.getExportConfiguration(id);
    } catch (error) {
      throw new BadRequestException('Failed to get export configuration', error.message);
    }
  }

  @Put('export-configurations/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update export configuration' })
  async updateExportConfiguration(
    @Param('id') id: string,
    @Body() updates: Partial<XmlExportConfiguration>,
  ): Promise<XmlExportConfiguration> {
    try {
      return await this.xmlExporterService.updateExportConfiguration(id, updates);
    } catch (error) {
      throw new BadRequestException('Failed to update export configuration', error.message);
    }
  }

  @Delete('export-configurations/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete export configuration' })
  async deleteExportConfiguration(
    @Param('id') id: string,
  ): Promise<void> {
    try {
      await this.xmlExporterService.deleteExportConfiguration(id);
    } catch (error) {
      throw new BadRequestException('Failed to delete export configuration', error.message);
    }
  }

  @Post('export-configurations/sample')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate sample export configuration' })
  async generateSampleTemplate(
    @Body() body: {
      organizationId: string;
      name: string;
      userId: string;
    },
  ): Promise<XmlExportConfiguration> {
    try {
      return await this.xmlExporterService.generateSampleTemplate(
        body.organizationId,
        body.name,
        body.userId,
      );
    } catch (error) {
      throw new BadRequestException('Failed to generate sample template', error.message);
    }
  }

  @Post('diff')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate diff between two XML documents' })
  async generateXmlDiff(
    @Body() body: {
      sourceXmlDocumentId: string;
      targetXmlDocumentId: string;
      diffType: 'IMPORT_EXPORT' | 'VERSION_COMPARISON' | 'MANUAL_XML_SYNC';
      userId: string;
    },
  ): Promise<XmlDiff> {
    try {
      return await this.xmlDiffService.generateXmlDiff(
        body.sourceXmlDocumentId,
        body.targetXmlDocumentId,
        body.diffType,
        body.userId,
      );
    } catch (error) {
      throw new BadRequestException('Failed to generate XML diff', error.message);
    }
  }

  @Get('diff/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get diff by ID' })
  async getDiff(
    @Param('id') id: string,
  ): Promise<XmlDiff | null> {
    try {
      return await this.xmlDiffService.getDiff(id);
    } catch (error) {
      throw new BadRequestException('Failed to get diff', error.message);
    }
  }

  @Get('diff/document/:xmlDocumentId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get diffs for XML document' })
  async getDiffsForDocument(
    @Param('xmlDocumentId') xmlDocumentId: string,
  ): Promise<XmlDiff[]> {
    try {
      return await this.xmlDiffService.getDiffsForDocument(xmlDocumentId);
    } catch (error) {
      throw new BadRequestException('Failed to get document diffs', error.message);
    }
  }

  @Get('diff/visual/:sourceId/:targetId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate visual diff between XML documents' })
  async generateVisualDiff(
    @Param('sourceId') sourceId: string,
    @Param('targetId') targetId: string,
    @Query('showUnchanged') showUnchanged: string,
    @Query('contextLines') contextLines: string,
    @Query('maxDiffLength') maxDiffLength: string,
  ): Promise<string> {
    try {
      const options = {
        showUnchanged: showUnchanged === 'true',
        contextLines: parseInt(contextLines, 10) || 3,
        maxDiffLength: parseInt(maxDiffLength, 10) || 1000,
      };

      return await this.xmlDiffService.generateVisualDiff(sourceId, targetId, options);
    } catch (error) {
      throw new BadRequestException('Failed to generate visual diff', error.message);
    }
  }

  @Delete('diff/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete diff' })
  async deleteDiff(
    @Param('id') id: string,
  ): Promise<void> {
    try {
      await this.xmlDiffService.deleteDiff(id);
    } catch (error) {
      throw new BadRequestException('Failed to delete diff', error.message);
    }
  }

  @Post('diff/auto-resolve/:xmlDocumentId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Auto-resolve differences for XML document' })
  async autoResolveDifferences(
    @Param('xmlDocumentId') xmlDocumentId: string,
    @Body() body: { userId: string },
  ): Promise<{ resolvedCount: number; failedCount: number }> {
    try {
      return await this.xmlDiffService.autoResolveDifferences(xmlDocumentId, body.userId);
    } catch (error) {
      throw new BadRequestException('Failed to auto-resolve differences', error.message);
    }
  }

  @Get('statistics')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get XML processing statistics' })
  async getXmlStatistics(
    @Query('organizationId') organizationId: string,
  ): Promise<any> {
    try {
      const diffStats = await this.xmlDiffService.generateDiffStatistics(organizationId);
      
      // Add other statistics here
      return {
        diffStatistics: diffStats,
        // Additional statistics can be added
      };
    } catch (error) {
      throw new BadRequestException('Failed to get XML statistics', error.message);
    }
  }

  @Post('validate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate XML content against multiple configurations' })
  async validateXmlContent(
    @Body() body: {
      xmlContent: string;
      organizationId: string;
    },
  ): Promise<{ configuration: string; isValid: string; errors: boolean[] }[]> {
    try {
      return await this.xmlExporterService.validateXmlAgainstConfigurations(
        body.xmlContent,
        body.organizationId,
      );
    } catch (error) {
      throw new BadRequestException('Failed to validate XML content', error.message);
    }
  }
}
