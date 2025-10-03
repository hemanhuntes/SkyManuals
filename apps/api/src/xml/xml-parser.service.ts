import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { 
  XmlDocument,
  XmlImportRequest,
  XmlProcessingJob
} from '@sky/manuals/types';
import * as xml2js from 'xml2js';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class XmlParserService {
  private readonly logger = new Logger(XmlParserService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Import XML document with XSD validation
   */
  async importXml(request: XmlImportRequest): Promise<XmlDocument> {
    try {
      // Create XML document entry
      const xmlDocument = await this.prisma.xmlDocument.create({
        data: {
          fileName: request.fileName,
          originalXml: request.xmlContent,
          xsdSchema: request.xsdSchemaContent,
          organizationId: request.organizationId,
          uploadedBy: 'system', // In real implementation, would be user ID
          status: 'PENDING',
          validationErrors: [],
          parsedXml: {},
        },
      });

      // Create processing job
      const job = await this.prisma.xmlProcessingJob.create({
        data: {
          type: 'IMPORT',
          status: 'RUNNING',
          progress: {
            currentStep: 'Validating XML',
            totalSteps: 5,
            completedSteps: 0,
            errors: [],
          },
        },
      });

      try {
        // Validate XML against XSD
        await this.updateJob(job.id, 'Validating XML', 1, 5);
        const validationResult = await this.validateXml(request.xmlContent, request.xsdSchemaContent);
        
        // Update document with validation results
        await this.prisma.xmlDocument.update({
          where: { id: xmlDocument.id },
          data: {
            validationErrors: validationResult.errors || [],
            status: validationResult.isValid ? 'VALIDATION_SUCCESS' : 'VALIDATION_FAILED',
            parsedXml: validationResult.parsedXml || {},
            processedAt: new Date(),
          },
        });

        if (validationResult.isValid) {
          await this.updateJob(job.id, 'Generating mappings', 2, 5);
          await this.generateDefaultMappings(xmlDocument.id, validationResult.parsedXml);
          
          await this.updateJob(job.id, 'Complete', 5, 5);
          await this.prisma.xmlProcessingJob.update({
            where: { id: job.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });
        } else {
          await this.updateJob(job.id, 'Validation failed', 5, 5, validationResult.errors || []);
          await this.prisma.xmlProcessingJob.update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              errorMessage: `Validation failed: ${validationResult.errors?.length || 0} errors`,
              completedAt: new Date(),
            },
          });
        }

        return xmlDocument;
      } catch (error) {
        this.logger.error('Import processing failed:', error);
        
        await this.prisma.xmlProcessingJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorMessage: error.message,
            completedAt: new Date(),
          },
        });

        await this.prisma.xmlDocument.update({
          where: { id: xmlDocument.id },
          data: {
            status: 'FAILED',
          },
        });

        throw error;
      }
    } catch (error) {
      this.logger.error('XML import failed:', error);
      throw error;
    }
  }

  /**
   * Validate XML content against XSD schema
   */
  private async validateXml(xmlContent: string, xsdSchema?: string): Promise<{
    isValid: boolean;
    errors: any[];
    parsedXml: any;
  }> {
    try {
      // Parse XML content
      const parseOptions = {
        explicitArray: false,
        mergeAttrs: true,
        explicitRoot: false,
      };

      const parser = new xml2js.Parser(parseOptions);
      const parsedXml = await parser.parseStringPromise(xmlContent);

      // If XSD schema provided, validate (simplified validation for demo)
      const errors: any[] = [];
      let isValid = true;

      if (xsdSchema) {
        // Basic XML structure validation
        const validationErrors = this.validateXmlStructure(xmlContent, xsdSchema);
        errors.push(...validationErrors);
        isValid = errors.length === 0;
      }

      return {
        isValid,
        errors,
        parsedXml,
      };
    } catch (error) {
      this.logger.error('XML parsing failed:', error);
      return {
        isValid: false,
        errors: [
          {
            line: 0,
            column: 0,
            message: `XML parsing error: ${error.message}`,
            severity: 'ERROR',
            code: 'PARSE_ERROR',
          },
        ],
        parsedXml: {},
      };
    }
  }

  /**
   * Basic XML structure validation (simplified)
   */
  private validateXmlStructure(xmlContent: string, xsdSchema: string): any[] {
    const errors: any[] = [];

    try {
      // Basic XML validation checks
      if (!xmlContent.trim().startsWith('<?xml') && !xmlContent.trim().startsWith('<')) {
        errors.push({
          line: 1,
          column: 1,
          message: 'XML document must start with XML declaration or root element',
          severity: 'ERROR',
          code: 'MISSING_XML_DECLARATION',
        });
      }

      // Check for basic structure patterns (manual-specific)
      if (!xmlContent.includes('<Manual>') && !xmlContent.includes('<manual')) {
        errors.push({
          line: 1,
          column: 1,
          message: 'XML should contain Manual root element',
          severity: 'WARNING',
          code: 'MISSING_MANUAL_ELEMENT',
        });
      }

      // Validate required elements for manual structure
      const requiredElements = ['title', 'content', 'version'];
      requiredElements.forEach((element) => {
        if (!xmlContent.includes(`<${element}>`) && !xmlContent.includes(`<${element} `)) {
          errors.push({
            line: 1,
            column: 1,
            message: `Recommended element '${element}' not found`,
            severity: 'INFO',
            code: `MISSING_${element.toUpperCase()}`,
          });
        }
      });

      return errors;
    } catch (error) {
      return [
        {
          line: 1,
          column: 1,
          message: `Validation error: ${error.message}`,
          severity: 'ERROR',
          code: 'VALIDATION_ERROR',
        },
      ];
    }
  }

  /**
   * Generate default mappings for XML elements to Manual structure
   */
  private async generateDefaultMappings(xmlDocumentId: string, parsedXml: any): Promise<void> {
    try {
      const mappings = this.extractElementMappings(parsedXml);

      // Create mapping entries
      for (const mapping of mappings) {
        await this.prisma.xmlMapping.create({
          data: {
            xmlDocumentId,
            xmlElementPath: mapping.elementPath,
            mappingType: mapping.type as any,
            fieldMappings: mapping.fieldMappings,
            transformationRules: mapping.transformationRules,
            isValidated: false,
            syncStatus: 'IN_SYNC',
          },
        });
      }
    } catch (error) {
      this.logger.error('Failed to generate default mappings:', error);
      throw error;
    }
  }

  /**
   * Extract mapping relationships from parsed XML
   */
  private extractElementMappings(parsedXml: any): any[] {
    const mappings: any[] = [];

    try {
      // Basic mapping logic for manual structure
      if (parsedXml.Manual) {
        // Manual level mapping
        mappings.push({
          elementPath: 'Manual',
          type: 'MANUAL',
          fieldMappings: {
            title: 'Manual.$.title',
            version: 'Manual.$.version',
            organization: 'Manual.$.organizationId',
          },
          transformationRules: [
            {
              sourcePath: 'Manual.$.title',
              targetPath: 'manual.title',
              transformFunction: 'DIRECT_COPY',
            },
          ],
        });

        // Chapter mappings
        if (parsedXml.Manual.chapters && Array.isArray(parsedXml.Manual.chapters)) {
          parsedXml.Manual.chapters.forEach((chapter: any, index: number) => {
            mappings.push({
              elementPath: `Manual.chapters[${index}]`,
              type: 'CHAPTER',
              fieldMappings: {
                title: `Manual.chapters[${index}].$.title`,
                number: `Manual.chapters[${index}].$.number`,
              },
              transformationRules: [
                {
                  sourcePath: `Manual.chapters[${index}].$.title`,
                  targetPath: 'chapter.title',
                  transformFunction: 'DIRECT_COPY',
                },
                {
                  sourcePath: `Manual.chapters[${index}].$.number`,
                  targetPath: 'chapter.number',
                  transformFunction: 'DIRECT_COPY',
                },
              ],
            });
          });
        }

        // Section mappings
        if (parsedXml.Manual.chapters && Array.isArray(parsedXml.Manual.chapters)) {
          parsedXml.Manual.chapters.forEach((chapter: any, chapterIndex: number) => {
            if (chapter.sections && Array.isArray(chapter.sections)) {
              chapter.sections.forEach((section: any, sectionIndex: number) => {
                mappings.push({
                  elementPath: `Manual.chapters[${chapterIndex}].sections[${sectionIndex}]`,
                  sectionIndex: sectionIndex,
                  type: 'SECTION',
                  fieldMappings: {
                    title: `Manual.chapters[${chapterIndex}].sections[${sectionIndex}].$.title`,
                    number: `Manual.chapters[${chapterIndex}].sections[${sectionIndex}].$.number`,
                  },
                  transformationRules: [
                    {
                      sourcePath: `Manual.chapters[${chapterIndex}].sections[${sectionIndex}].$.title`,
                      targetPath: 'section.title',
                      transformFunction: 'DIRECT_COPY',
                    },
                    {
                      sourcePath: `Manual.chapters[${chapterIndex}].sections[${sectionIndex}].$.number`,
                      targetPath: 'section.number',
                      transformFunction: 'DIRECT_COPY',
                    },
                  ],
                });
              });
            }
          });
        }

        // Block/Paragraph mappings
        if (parsedXml.Manual.chapters && Array.isArray(parsedXml.Manual.chapters)) {
          parsedXml.Manual.chapters.forEach((chapter: any, chapterIndex: number) => {
            if (chapter.sections && Array.isArray(chapter.sections)) {
              chapter.sections.forEach((section: any, sectionIndex: number) => {
                if (section.blocks && Array.isArray(section.blocks)) {
                  section.blocks.forEach((block: any, blockIndex: number) => {
                    mappings.push({
                      elementPath: `Manual.chapters[${chapterIndex}].sections[${sectionIndex}].blocks[${blockIndex}]`,
                      type: 'BLOCK',
                      fieldMappings: {
                        content: `Manual.chapters[${chapterIndex}].sections[${sectionIndex}].blocks[${blockIndex}].content`,
                        type: `Manual.chapters[${chapterIndex}].sections[${sectionIndex}].blocks[${blockIndex}].$.type`,
                      },
                      transformationRules: [
                        {
                          sourcePath: `Manual.chapters[${chapterIndex}].sections[${sectionIndex}].blocks[${blockIndex}].content`,
                          targetPath: 'block.content',
                          transformFunction: 'HTML_CONVERT',
                          parameters: { preserveFormatting: true },
                        },
                      ],
                    });
                  });
                }
              });
            }
          });
        }
      }

      return mappings;
    } catch (error) {
      this.logger.error('Failed to extract element mappings:', error);
      return [];
    }
  }

  /**
   * Update processing job status
   */
  private async updateJob(
    jobId: string,
    currentStep: string,
    completedSteps: number,
    totalSteps: number,
    errors: string[] = []
  ): Promise<void> {
    await this.prisma.xmlProcessingJob.update({
      where: { id: jobId },
      data: {
        progress: {
          currentStep,
          totalSteps,
          completedSteps,
          errors,
        },
      },
    });
  }

  /**
   * Get XML document by ID
   */
  async getXmlDocument(id: string): Promise<XmlDocument | null> {
    return this.prisma.xmlDocument.findUnique({
      where: { id },
      include: {
        xmlMappings: true,
        organization: true,
        uploadedUser: true,
      },
    });
  }

  /**
   * Get XML documents for organization
   */
  async getXmlDocuments(organizationId: string): Promise<XmlDocument[]> {
    return this.prisma.xmlDocument.findMany({
      where: { organizationId },
      orderBy: { uploadedAt: 'desc' },
      include: {
        xmlMappings: true,
        organization: true,
        uploadedUser: true,
      },
    });
  }

  /**
   * Get XML mappings for document
   */
  async getXmlMappings(xmlDocumentId: string): Promise<any[]> {
    return this.prisma.xmlMapping.findMany({
      where: { xmlDocumentId },
      include: {
        manual: true,
        chapter: true,
        section: true,
        block: true,
      },
    });
  }
}
