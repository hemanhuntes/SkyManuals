import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { 
  XmlExportRequest,
  XmlExportConfiguration,
  XmlDocument
} from '@sky/manuals/types';
import * as Builder from 'fast-xml-parser';

@Injectable()
export class XmlExporterService {
  private readonly logger = new Logger(XmlExporterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Export manual to XML format
   */
  async exportManualToXml(request: XmlExportRequest): Promise<string> {
    try {
      const { manualId, exportConfigurationId, exportOptions } = request;

      // Get export configuration
      const config = await this.prisma.xmlExportConfiguration.findUnique({
        where: { id: exportConfigurationId },
      });

      if (!config) {
        throw new Error(`Export configuration with ID ${exportConfigurationId} not found`);
      }

      // Get manual data
      const manual = await this.prisma.manual.findUnique({
        where: { id: manualId },
        include: {
          chapters: {
            include: {
              sections: {
                include: {
                  blocks: true,
                },
              },
            },
          },
          organization: true,
        },
      });

      if (!manual) {
        throw new Error(`Manual with ID ${manualId} not found`);
      }

      // Create XML structure from manual
      const xmlData = await this.createXmlFromManual(manual, config.fieldMappings as Record<string, string>, exportOptions);

      // Generate XML using template
      const xmlOutput = await this.generateXmlFromTemplate(xmlData, config.templateXml, exportOptions);

      // Validate against XSD if requested
      if (exportOptions.validateAgainstXsd) {
        const validationResult = await this.validateXmlAgainstXsd(xmlOutput, config.xsdSchema);
        if (!validationResult.isValid) {
          throw new Error(`Generated XML is not valid against XSD schema: ${validationResult.errors?.join(', ')}`);
        }
      }

      // Create XML document record for tracking
      const xmlDocument = await this.createXmlDocumentRecord(xmlOutput, manual, config, exportOptions);

      return xmlOutput;
    } catch (error) {
      this.logger.error('Failed to export manual to XML:', error);
      throw error;
    }
  }

  /**
   * Create XML structure from manual data
   */
  private async createXmlFromManual(
    manual: any,
    fieldMappings: Record<string, string>,
    exportOptions: any
  ): Promise<any> {
    try {
      const xmlData: any = {
        Manual: {
          ...this.applyFieldMappings(manual, fieldMappings.manual || {}),
          chapters: []
        }
      };

      // Process chapters
      for (const chapter of manual.chapters) {
        const chapterData = {
          ...this.applyFieldMappings(chapter, fieldMappings.chapter || {}),
          sections: []
        };

        // Process sections
        for (const section of chapter.sections) {
          const sectionData = {
            ...this.applyFieldMappings(section, fieldMappings.section || {}),
            blocks: []
          };

          // Process blocks
          for (const block of section.blocks) {
            const blockData = this.applyFieldMappings(block, fieldMappings.block || {});
            
            // Transform content based on block type
            if (block.content) {
              blockData.content = await this.transformContentForXml(block.content, exportOptions);
            }

            sectionData.blocks.push(blockData);
          }

          chapterData.sections.push(sectionData);
        }

        xmlData.Manual.chapters.push(chapterData);
      }

      // Add metadata
      if (exportOptions.includeMetadata) {
        xmlData.Manual.metadata = {
          exportedAt: new Date().toISOString(),
          version: '1.0',
          exportedBy: 'system',
          exportOptions,
        };
      }

      return xmlData;
    } catch (error) {
      this.logger.error('Failed to create XML from manual:', error);
      throw error;
    }
  }

  /**
   * Apply field mappings to entity data
   */
  private applyFieldMappings(entity: any, mappings: Record<string, string>): any {
    try {
      const result: any = {};

      for (const [xmlField, manualField] of Object.entries(mappings)) {
        const value = this.getValueFromObject(entity, manualField);
        if (value !== undefined && value !== null) {
          result[xmlField] = value;
        }
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to apply field mappings:', error);
      return entity;
    }
  }

  /**
   * Get value from object using dot notation
   */
  private getValueFromObject(obj: any, path: string): any {
    try {
      return path.split('.').reduce((current, key) => {
        if (current && (key in current)) {
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
   * Transform content for XML output
   */
  private async transformContentForXml(content: any, exportOptions: any): Promise<string> {
    try {
      if (!content) return '';

      // Handle TipTap JSON content
      if (typeof content === 'object') {
        return await this.transformTipTapToXml(content, exportOptions);
      }

      // Handle string content
      if (typeof content === 'string') {
        // Clean HTML for XML output
        return content
          .replace(/&lt;/g, '&amp;lt;')
          .replace(/&gt;/g, '&amp;gt;')
          .replace(/&amp;/g, '&amp;amp;');
      }

      return String(content);
    } catch (error) {
      this.logger.error('Failed to transform content for XML:', error);
      return '';
    }
  }

  /**
   * Transform TipTap JSON to XML string
   */
  private async transformTipTapToXml(content: any, exportOptions: any): Promise<string> {
    try {
      if (!content || !content.content) return '';

      let xmlContent = '';

      for (const node of content.content) {
        xmlContent += await this.transformNodeToXml(node, exportOptions);
      }

      return xmlContent.trim();
    } catch (error) {
      this.logger.error('Failed to transform TipTap to XML:', error);
      return '';
    }
  }

  /**
   * Transform individual TipTap node to XML
   */
  private async transformNodeToXml(node: any, exportOptions: any): Promise<string> {
    try {
      switch (node.type) {
        case 'paragraph':
          const paragraphContent = node.content?.map((child: any) => 
            this.transformChildNodeToXml(child)
          ).join('') || '';
          return `<p>${paragraphContent}</p>\n`;

        case 'heading':
          const headingContent = node.content?.map((child: any) => 
            this.transformChildNodeToXml(child)
          ).join('') || '';
          const level = node.attrs?.level || 1;
          return `<h${level}>${headingContent}</h${level}>\n`;

        case 'bulletList':
          const bulletContent = node.content?.map((item: any) => 
            `<li>${item.content?.map((child: any) => 
              this.transformChildNodeToXml(child)
            ).join('') || ''}</li>`
          ).join('') || '';
          return `<ul>\n${bulletContent}</ul>\n`;

        case 'orderedList':
          const orderedContent = node.content?.map((item: any) => 
            `<li>${item.content?.map((child: any) => 
              this.transformChildNodeToXml(child)
            ).join('') || ''}</li>`
          ).join('') || '';
          return `<ol>\n${orderedContent}</ol>\n`;

        case 'codeBlock':
          const codeContent = node.content?.map((child: any) => 
            this.transformChildNodeToXml(child)
          ).join('') || '';
          return `<pre><code>${codeContent}</code></pre>\n`;

        default:
          const defaultContent = node.content?.map((child: any) => 
            this.transformChildNodeToXml(child)
          ).join('') || '';
          return defaultContent;
      }
    } catch (error) {
      this.logger.error('Failed to transform node to XML:', error);
      return '';
    }
  }

  /**
   * Transform child node (usually text nodes) to XML
   */
  private transformChildNodeToXml(node: any): string {
    try {
      switch (node.type) {
        case 'text':
          let text = node.text || '';
          
          // Apply marks (formatting)
          if (node.marks) {
            for (const mark of node.marks) {
              switch (mark.type) {
                case 'bold':
                  text = `<strong>${text}</strong>`;
                  break;
                case 'italic':
                  text = `<em>${text}</em>`;
                  break;
                case 'code':
                  text = `<code>${text}</code>`;
                  break;
                case 'link':
                  const href = mark.attrs?.href || '#';
                  text = `<a href="${href}">${text}</a>`;
                  break;
              }
            }
          }

          return text;

        default:
          return node.text || '';
      }
    } catch (error) {
      this.logger.error('Failed to transform child node to XML:', error);
      return '';
    }
  }

  /**
 implemented') {
    try {
      // Create XML builder
      const builder = new Builder.Builder({
        rootName: 'Manual',
        xmldec: { version: '1.0', encoding: 'UTF-8' },
        renderOpts: { pretty: exportOptions.exportFormat === 'PRETTY_PRINT', indent: '  ' },
      });

      // Build XML from data
      const xml = builder.buildObject(xmlData);

      return xml;
    } catch (error) {
      this.logger.error('Failed to generate XML from template:', error);
      throw error;
    }
  }

  /**
   * Generate XML from template structure
   */
  private async generateXmlFromTemplate(xmlData: any, templateXml: string, exportOptions: any): Promise<string> {
    try {
      // Create XML builder (using fast-xml-parser)
      const parser = new Builder.XMLBuilder({
        ignoreAttributes: false,
        format: exportOptions.exportFormat === 'PRETTY_PRINT',
        indentBy: '  ',
      });

      // Build XML from data
      const xml = parser.build(xmlData);

      return xml;
    } catch (error) {
      this.logger.error('Failed to generate XML from template:', error);
      throw error;
    }
  }

  /**
   * Validate XML against XSD schema
   */
  private async validateXmlAgainstXsd(xmlContent: string, xsdSchema: string): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    try {
      // For this demo, we'll do basic validation
      const errors: string[] = [];

      // Check if XML is well-formed (basic check)
      try {
        // Basic XML well-formedness check
        const openTags = xmlContent.match(/<[^\/][^>]*>/g) || [];
        const closeTags = xmlContent.match(/<\/[^>]*>/g) || [];
        
        if (openTags.length !== closeTags.length) {
          errors.push('XML structure is not well-formed');
        }
      } catch (error) {
        errors.push(`XML parsing error: ${error.message}`);
      }

      // Basic XSD validation checks
      if (xsdSchema) {
        if (!xmlContent.includes('<Manual>')) {
          errors.push('XML must contain Manual root element');
        }

        // Add more validation rules based on XSD schema
        const schemaErrors = this.validateBasicSchema(xmlContent, xsdSchema);
        errors.push(...schemaErrors);
      }

      return {
        isValid: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logger.error('Failed to validate XML against XSD:', error);
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`],
      };
    }
  }

  /**
   * Basic schema validation
   */
  private validateBasicSchema(xmlContent: string, xsdSchema: string): string[] {
    const errors: string[] = [];

    try {
      // Check for required elements based on XSD
      if (xsdSchema.includes('title')) {
        if (!xmlContent.includes('<title>')) {
          errors.push('Missing required title element');
        }
      }

      if (xsdSchema.includes('version')) {
        if (!xmlContent.includes('<version>')) {
          errors.push('Missing required version element');
        }
      }

      // Check for proper nesting
      const openTags = xmlContent.match(/<[^\/][^>]*>/g) || [];
      const closeTags = xmlContent.match(/<\/[^>]*>/g) || [];

      if (openTags.length !== closeTags.length) {
        errors.push('Mismatched opening and closing tags');
      }

      return errors;
    } catch (error) {
      this.logger.error('Failed to validate basic schema:', error);
      return [`Schema validation error: ${error.message}`];
    }
  }

  /**
   * Create XML document record for tracking
   */
  private async createXmlDocumentRecord(
    xmlContent: string,
    manual: any,
    config: any,
    exportOptions: any
  ): Promise<XmlDocument> {
    try {
      const xmlDocument = await this.prisma.xmlDocument.create({
        data: {
          fileName: `${manual.title}_${new Date().toISOString().split('T')[0]}.xml`,
          originalXml: xmlContent,
          parsedXml: {},
          xsdSchema: exportOptions.validateAgainstXsd ? config.xsdSchema : null,
          validationErrors: [],
          status: 'VALIDATION_SUCCESS',
          organizationId: manual.organizationId,
          uploadedBy: 'system',
          processedAt: new Date(),
        },
      });

      return xmlDocument;
    } catch (error) {
      this.logger.error('Failed to create XML document record:', error);
      throw error;
    }
  }

  /**
   * Get export configuration by ID
   */
  async getExportConfiguration(id: string): Promise<XmlExportConfiguration | null> {
    try {
      return await this.prisma.xmlExportConfiguration.findUnique({
        where: { id },
        include: {
          createdUser: true,
          organization: true,
        },
      });
    } catch (error) {
      this.logger.error('Failed to get export configuration:', error);
      throw error;
    }
  }

  /**
   * Update export configuration
   */
  async updateExportConfiguration(
    id: string,
    updates: Partial<XmlExportConfiguration>
  ): Promise<XmlExportConfiguration> {
    try {
      return await this.prisma.xmlExportConfiguration.update({
        where: { id },
        data: updates,
      });
    } catch (error) {
      this.logger.error('Failed to update export configuration:', error);
      throw error;
    }
  }

  /**
   * Delete export configuration
   */
  async deleteExportConfiguration(id: string): Promise<void> {
    try {
      await this.prisma.xmlExportConfiguration.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error('Failed to delete export configuration:', error);
      throw error;
    }
  }

  /**
   * Validate XML content against multiple configurations
   */
  async validateXmlAgainstConfigurations(
    xmlContent: string,
    organizationId: string
  ): Promise<{ configuration: string; isValid: boolean; errors: string[] }[]> {
    try {
      const configurations = await this.prisma.xmlExportConfiguration.findMany({
        where: { 
          organizationId,
          isActive: true,
        },
      });

      const results = [];

      for (const config of configurations) {
        const validation = await this.validateXmlAgainstXsd(xmlContent, config.xsdSchema);
        
        results.push({
          configuration: config.name,
          isValid: validation.isValid,
          errors: validation.errors,
        });
      }

      return results;
    } catch (error) {
      this.logger.error('Failed to validate XML against configurations:', error);
      throw error;
    }
  }

  /**
   * Generate sample template XML
   */
  async generateSampleTemplate(
    organizationId: string,
    name: string,
    userId: string
  ): Promise<XmlExportConfiguration> {
    try {
      const sampleTemplate = `<Manual xmlns="http://example.com/manual/schema" version="1.0">
  <title>Sample Manual Title</title>
  <version>1.0.0</version>
  <organization>${organizationId}</organization>
  <chapters>
    <chapter number="01" title="Sample Chapter">
      <sections>
        <section number="01-01" title="Sample Section">
          <blocks>
            <block type="paragraph">
              <content>Sample paragraph content with <strong>formatting</strong> and <em>emphasis</em>.</content>
            </block>
          </blocks>
        </section>
      </sections>
    </chapter>
  </chapters>
</Manual>`;

      const sampleXsd = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/manual/schema">
  <xs:element name="Manual">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="title" type="xs:string"/>
        <xs:element name="version" type="xs:string"/>
        <xs:element name="organization" type="xs:string"/>
        <xs:element name="chapters">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="chapter" maxOccurs="unbounded">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="sections">
                      <xs:complexType>
                        <xs:sequence>
                          <xs:element name="section" maxOccurs="unbounded">
                            <xs:complexType>
                              <xs:sequence>
                                <xs:element name="blocks">
                                  <xs:complexType>
                                    <xs:sequence>
                                      <xs:element name="block" maxOccurs="unbounded">
                                        <xs:complexType>
                                          <xs:sequence>
                                            <xs:element name="content" type="xs:string"/>
                                          </xs:sequence>
                                          <xs:attribute name="type" type="xs:string"/>
                                        </xs:complexType>
                                      </xs:element>
                                    </xs:sequence>
                                  </xs:complexType>
                                </xs:element>
                              </xs:sequence>
                              <xs:attribute name="number" type="xs:string"/>
                              <xs:attribute name="title" type="xs:string"/>
                            </xs:complexType>
                          </xs:element>
                        </xs:sequence>
                      </xs:complexType>
                    </xs:element>
                  </xs:sequence>
                  <xs:attribute name="number" type="xs:string"/>
                  <xs:attribute name="title" type="xs:string"/>
                </xs:complexType>
              </xs:element>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;

      const sampleFieldMappings = {
        manual: {
          title: 'manual.title',
          version: 'manual.version',
          organization: 'manual.organization.id',
        },
        chapter: {
          number: 'chapter.number',
          title: 'chapter.title',
        },
        section: {
          number: 'section.number',
          title: 'section.title',
        },
        block: {
          type: 'block.smartBlockType',
          content: 'block.content',
        },
      };

      const sampleExportRules = [
        {
          manualElement: 'manual.title',
          xmlPath: 'Manual.title',
          required: true,
          transformFunction: 'DIRECT_COPY',
        },
        {
          manualElement: 'block.content',
          xmlPath: 'Manual.chapters[].sections[].blocks[].content',
          required: true,
          transformFunction: 'HTML_TO_XML',
          parameters: { preserveFormatting: true },
        },
      ];

      const config = await this.prisma.xmlExportConfiguration.create({
        data: {
          name: `${name} - Sample`,
          description: 'Sample XML export configuration',
          organizationId,
          templateXml: sampleTemplate,
          xsdSchema: sampleXsd,
          fieldMappings: sampleFieldMappings,
          exportRules: sampleExportRules,
          createdBy: userId,
          isActive: true,
        },
      });

      return config;
    } catch (error) {
      this.logger.error('Failed to generate sample template:', error);
      throw error;
    }
  }
}
