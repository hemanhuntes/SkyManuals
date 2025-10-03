import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { 
  XmlMapping,
  XmlDocument,
  XmlExportConfiguration
} from '@sky/manuals/types';

@Injectable()
export class XmlMapperService {
  private readonly logger = new Logger(XmlMapperService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Map XML document to Manual structure
   */
  async mapXmlToManual(xmlDocumentId: string, organizationId: string): Promise<any> {
    try {
      const xmlDocument = await this.prisma.xmlDocument.findUnique({
        where: { id: xmlDocumentId },
        include: { xmlMappings: true },
      });

      if (!xmlDocument) {
        throw new Error(`XML document with ID ${xmlDocumentId} not found`);
      }

      const parsedXml = xmlDocument.parsedXml as any;
      const mappings = xmlDocument.xmlMappings;

      // Create manual structure based on mappings
      const manual = await this.createManualFromMappings(parsedXml, mappings, organizationId);
      
      return manual;
    } catch (error) {
      this.logger.error('Failed to map XML to Manual:', error);
      throw error;
    }
  }

  /**
   * Create manual structure from XML mappings
   */
  private async createManualFromMappings(
    parsedXml: any,
    mappings: XmlMapping[],
    organizationId: string
  ): Promise<any> {
    try {
      // Extract manual mapping
      const manualMapping = mappings.find(m => m.mappingType === 'MANUAL');
      if (!manualMapping) {
        throw new Error('No manual-level mapping found');
      }

      // Create manual
      const manualData = this.extractDataFromPath(parsedXml, manualMapping.fieldMappings);
      const manual = await this.prisma.manual.create({
        data: {
          title: manualData.title || 'Imported Manual',
          status: 'DRAFT',
          organizationId,
        },
      });

      // Process chapters
      const chapterMappings = mappings.filter(m => m.mappingType === 'CHAPTER');
      for (const chapterMapping of chapterMappings) {
        await this.processChapterMapping(parsedXml, chapterMapping, manual.id);
      }

      // Update mappings with created structure IDs
      await this.updateMappingsWithCreatedIds(mappings, manual.id);

      return {
        manual,
        chaptersCreated: chapterMappings.length,
      };
    } catch (error) {
      this.logger.error('Failed to create manual from mappings:', error);
      throw error;
    }
  }

  /**
   * Process chapter mapping and create chapter
   */
  private async processChapterMapping(parsedXml: any, mapping: XmlMapping, manualId: string): Promise<void> {
    try {
      const chapterData = this.extractDataFromPath(parsedXml, mapping.fieldMappings);
      
      const chapter = await this.prisma.chapter.create({
        data: {
          // Get chapter index from XML element path regex
          number: chapterData.number || '01',
          title: chapterData.title || 'Imported Chapter',
          manualId,
        },
      });

      // Update mapping with chapter ID
      await this.prisma.xmlMapping.update({
        where: { id: mapping.id },
        data: { chapterId: chapter.id },
      });

      // Process sections for this chapter
      await this.processSectionsForChapter(parsedXml, mapping, chapter.id);
    } catch (error) {
      this.logger.error('Failed to process chapter mapping:', error);
      throw error;
    }
  }

  /**
   * Process sections for a chapter
   */
  private async processSectionsForChapter(
    parsedXml: any,
    chapterMapping: XmlMapping,
    chapterId: string
  ): Promise<void> {
    try {
      // Find section mappings that belong to this chapter
      const sectionMappings = await this.prisma.xmlMapping.findMany({
        where: {
          xmlDocumentId: chapterMapping.xmlDocumentId,
          mappingType: 'SECTION',
        },
      });

      for (const sectionMapping of sectionMappings) {
        // Check if this section mapping belongs to the current chapter
        if (this.isMappingForChapter(sectionMapping.xmlElementPath, chapterMapping.xmlElementPath)) {
          const sectionData = this.extractDataFromPath(parsedXml, sectionMapping.fieldMappings);
          
          const section = await this.prisma.section.create({
            data: {
              number: sectionData.number || '01',
              title: sectionData.title || 'Imported Section',
              chapterId,
              status: 'DRAFT',
            },
          });

          // Update mapping with section ID
          await this.prisma.xmlMapping.update({
            where: { id: sectionMapping.id },
            data: { sectionId: section.id },
          });

          // Process blocks for this section
          await this.processBlocksForSection(parsedXml, sectionMapping, section.id);
        }
      }
    } catch (error) {
      this.logger.error('Failed to process sections for chapter:', error);
      throw error;
    }
  }

  /**
   * Process blocks for a section
   */
  private async processBlocksForSection(
    parsedXml: any,
    sectionMapping: XmlMapping,
    sectionId: string
  ): Promise<void> {
    try {
      // Find block mappings that belong to this section
      const blockMappings = await this.prisma.xmlMapping.findMany({
        where: {
          xmlDocumentId: sectionMapping.xmlDocumentId,
          mappingType: 'BLOCK',
        },
      });

      for (const blockMapping of blockMappings) {
        // Check if this block mapping belongs to the current section
        if (this.isMappingForSection(blockMapping.xmlElementPath, sectionMapping.xmlElementPath)) {
          const blockData = this.extractDataFromPath(parsedXml, blockMapping.fieldMappings);
          
          // Transform content based on transformation rules
          const transformedContent = await this.transformContent(
            blockData.content,
            blockMapping.transformationRules as any[]
          );

          const block = await this.prisma.block.create({
            data: {
              sectionId,
              content: transformedContent,
              smartBlockType: blockData.type || null,
            },
          });

          // Update mapping with block ID
          await this.prisma.xmlMapping.update({
            where: { id: blockMapping.id },
            data: { blockId: block.id },
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to process blocks for section:', error);
      throw error;
    }
  }

  /**
   * Extract data from XML path using field mappings
   */
  private extractDataFromPath(parsedXml: any, fieldMappings: Record<string, string>): any {
    const result: any = {};

    try {
      for (const [targetField, sourcePath] of Object.entries(fieldMappings)) {
        const value = this.getValueFromPath(parsedXml, sourcePath);
        if (value !== undefined) {
          result[targetField] = value;
        }
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to extract data from XML path:', error);
      return {};
    }
  }

  /**
   * Get value from XML using dot notation path
   */
  private getValueFromPath(obj: any, path: string): any {
    try {
      return path.split('.').reduce((current, key) => {
        if (current && (key in current)) {
          if (key.startsWith('$')) {
            return current.attributes?.[key.substring(1)];
          }
          return current[key];
        }
        return undefined;
      }, obj);
    } catch (error) {
      this.logger.warn(`Failed to get value from path ${path}:`, error.message);
      return undefined;
    }
  }

  /**
   * Check if mapping belongs to chapter
   */
  private isMappingForChapter(elementPath: string, chapterPath: string): boolean {
    // Simple path comparison logic
    return elementPath.startsWith(chapterPath) || 
           elementPath.includes(chapterPath.split('[')[0]);
  }
  /**
   * Check if mapping belongs to section
   */
  private isMappingForSection(elementPath: string, sectionPath: string): boolean {
    // Simple path comparison logic
    return elementPath.startsWith(sectionPath) || 
           elementPath.includes(sectionPath.split('[')[0]);
  }

  /**
   * Transform content based on transformation rules
   */
  private async transformContent(content: any, rules: any[]): Promise<any> {
    try {
      let transformedContent = content;

      for (const rule of rules) {
        switch (rule.transformFunction) {
          case 'DIRECT_COPY':
            transformedContent = content;
            break;
          case 'HTML_CONVERT':
            transformedContent = this.convertToTipTapFormat(content);
            break;
          case 'TEXT_EXTRACT':
            transformedContent = this.extractTextContent(content);
            break;
          case 'STRUCTURED_PARSE':
            transformedContent = this.parseStructuredContent(content, rule.parameters);
            break;
          default:
            transformedContent = content;
        }
      }

      return transformedContent;
    } catch (error) {
      this.logger.error('Failed to transform content:', error);
      return content;
    }
  }

  /**
   * Convert XML/HTML content to TipTap format
   */
  private convertToTipTapFormat(content: string): any {
    try {
      // Basic HTML to TipTap conversion
      if (typeof content === 'string') {
        return {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: content.replace(/<[^>]*>/g, ' '), // Strip HTML tags
                },
              ],
            },
          ],
        };
      }
      
      return {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Imported content',
              },
            ],
          },
        ],
      };
    } catch (error) {
      this.logger.error('Failed to convert to TipTap format:', error);
      return content;
    }
  }

  /**
   * Extract plain text from content
   */
  private extractTextContent(content: any): string {
    try {
      if (typeof content === 'string') {
        return content.replace(/<[^>]*>/g, '').trim();
      }
      return JSON.stringify(content);
    } catch (error) {
      this.logger.error('Failed to extract text content:', error);
      return '';
    }
  }

  /**
   * Parse structured content
   */
  private parseStructuredContent(content: any, parameters: any): any {
    try {
      // Implement custom parsing logic based on parameters
      if (parameters?.format === 'nested') {
        return { structured: true, ...content };
      }
      return content;
    } catch (error) {
      this.logger.error('Failed to parse structured content:', error);
      return content;
    }
  }

  /**
   * Update mappings with created structure IDs
   */
  private async updateMappingsWithCreatedIds(mappings: XmlMapping[], manualId: string): Promise<void> {
    try {
      // Update manual-level mappings
      for (const mapping of mappings.filter(m => m.mappingType === 'MANUAL')) {
        await this.prisma.xmlMapping.update({
          where: { id: mapping.id },
          data: { manualId },
        });
      }

      // Set mappings as validated
      await this.prisma.xmlMapping.updateMany({
        where: {
          id: { in: mappings.map(m => m.id) },
        },
        data: {
          isValidated: true,
          lastSyncedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Failed to update mappings with created IDs:', error);
      throw error;
    }
  }

  /**
   * Sync changes from Manual back to XML mappings
   */
  async syncManualToXml(manualId: string): Promise<void> {
    try {
      const mappings = await this.prisma.xmlMapping.findMany({
        where: {
          manualId,
        },
        include: {
          manual: true,
          chapter: true,
          section: true,
          block: true,
        },
      });

      for (const mapping of mappings) {
        const entityData = this.getEntityData(mapping);
        await this.updateXmlMappingWithEntityData(mapping, entityData);
      }
    } catch (error) {
      this.logger.error('Failed to sync manual to XML:', error);
      throw error;
    }
  }

  /**
   * Get entity data for mapping
   */
  private getEntityData(mapping: any): any {
    try {
      if (mapping.block) {
        return {
          title: mapping.block.section?.chapter?.manual?.title,
          number: mapping.block.section?.chapter?.number,
          content: mapping.block.content,
        };
      }
      
      if (mapping.section) {
        return {
          title: mapping.section.chapter?.manual?.title,
          number: mapping.section.number,
          content: mapping.section.title,
        };
      }
      
      if (mapping.chapter) {
        return {
          title: mapping.chapter.manual?.title,
          number: mapping.chapter.number,
          content: mapping.chapter.title,
        };
      }
      
      if (mapping.manual) {
        return {
          title: mapping.manual.title,
          content: mapping.manual.title,
        };
      }

      return {};
    } catch (error) {
      this.logger.error('Failed to get entity data:', error);
      return {};
    }
  }

  /**
   * Update XML mapping with entity data
   */
  private async updateXmlMappingWithEntityData(mapping: any, entityData: any): Promise<void> {
    try {
      // Update mapping sync status
      await this.prisma.xmlMapping.update({
        where: { id: mapping.id },
        data: {
          syncStatus: 'MANUAL_MODIFIED',
          lastSyncedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Failed to update XML mapping with entity data:', error);
      throw error;
    }
  }

  /**
   * Create export configuration
   */
  async createExportConfiguration(
    organizationId: string,
    name: string,
    description: string,
    templateXml: string,
    xsdSchema: string,
    fieldMappings: Record<string, string>,
    exportRules: any[],
    userId: string
  ): Promise<XmlExportConfiguration> {
    try {
      const config = await this.prisma.xmlExportConfiguration.create({
        data: {
          name,
          description,
          organizationId,
          templateXml,
          xsdSchema,
          fieldMappings,
          exportRules,
          createdBy: userId,
          isActive: true,
        },
      });

      return config;
    } catch (error) {
      this.logger.error('Failed to create export configuration:', error);
      throw error;
    }
  }

  /**
   * Get export configurations for organization
   */
  async getExportConfigurations(organizationId: string): Promise<XmlExportConfiguration[]> {
    return this.prisma.xmlExportConfiguration.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdUser: true,
        organization: true,
      },
    });
  }

  /**
   * Get validation status for XML document
   */
  async getXmlDocumentValidationStatus(xmlDocumentId: string): Promise<any> {
    try {
      const xmlDocument = await this.prisma.xmlDocument.findUnique({
        where: { id: xmlDocumentId },
        include: {
          xmlMappings: true,
        },
      });

      if (!xmlDocument) {
        throw new Error(`XML document with ID ${xmlDocumentId} not found`);
      }

      const validationStatus = {
        documentStatus: xmlDocument.status,
        validationErrors: xmlDocument.validationErrors,
        mappingCount: xmlDocument.xmlMappings.length,
        mappedElements: xmlDocument.xmlMappings.filter(mapping => 
          mapping.manualId || mapping.chapterId || mapping.sectionId || mapping.blockId
        ).length,
        syncStatus: this.calculateSyncStatus(xmlDocument.xmlMappings),
      };

      return validationStatus;
    } catch (error) {
      this.logger.error('Failed to get validation status:', error);
      throw error;
    }
  }

  /**
   * Calculate overall sync status
   */
  private calculateSyncStatus(mappings: any[]): string {
    if (mappings.length === 0) return 'NO_MAPPINGS';
    
    const statuses = mappings.map(m => m.syncStatus);
    if (statuses.every(s => s === 'IN_SYNC')) return 'IN_SYNC';
    if (statuses.some(s => s === 'CONFLICTED')) return 'CONFLICTED';
    if (statuses.some(s => s === 'MANUAL_MODIFIED')) return 'MANUAL_MODIFIED';
    if (statuses.some(s => s === 'XML_MODIFIED')) return 'XML_MODIFIED';
    
    return 'UNKNOWN';
  }
}
