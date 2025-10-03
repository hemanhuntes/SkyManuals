import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@skymanuals/prisma';
import { XmlParserService } from '../src/xml/xml-parser.service';
import { XmlMapperService } from '../src/xml/xml-mapper.service';
import { XmlExporterService } from '../src/xml/xml-exporter.service';
import { XmlDiffService } from '../src/xml/xml-diff.service';

describe('XML Services Unit Tests', () => {
  let xmlParserService: XmlParserService;
  let xmlMapperService: XmlMapperService;
  let xmlExporterService: XmlExporterService;
  let xmlDiffService: XmlDiffService;
  let prismaService: PrismaService;

  const validXmlContent = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Manual xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xmlns:xsd="http://www.w3.org/2001/XMLSchema"
            xsi:schemaLocation="http://company.com/schema manual.xsd"
            version="1.0"
            title="Test Manual">
      <Metadata>
        <Title>Test Manual</Title>
        <Version>1.0.0</Version>
        <LastUpdate>2024-01-01</LastUpdate>
        <OrganizationId>org-123</OrganizationId>
      </Metadata>
      
      <Chapters>
        <Chapter id="ch01">
          <Number>01</Number>
          <Title>Introduction</Title>
          <Sections>
            <Section id="sec01-01">
              <Number>01-01</Number>
              <Title>General Info</Title>
              <Blocks>
                <Block id="blk01-01-01" type="paragraph">
                  <Content>
                    <p>This is a test paragraph.</p>
                  </Content>
                </Block>
                <Block id="blk01-01-02" type="warning">
                  <Content>
                    <div class="warning">
                      <strong>WARNING:</strong> This is a test warning.
                    </div>
                  </Content>
                </Block>
              </Blocks>
            </Section>
          </Sections>
        </Chapter>
      </Chapters>
    </Manual>
  `;

  const invalidXmlContent = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Manual version="1.0">
      <Chapters>
        <Chapter id="ch01">
          <!-- Missing closing tag -->
        </Chapters>
    </Manual>
  `;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XmlParserService,
        XmlMapperService,
        XmlExporterService,
        XmlDiffService,
        {
          provide: PrismaService,
          useValue: {
            xmlDocument: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              findMany: jest.fn(),
            },
            xmlMapping: {
              create: jest.fn(),
              createMany: jest.fn(),
              findMany: jest.fn(),
              deleteMany: jest.fn(),
              update: jest.fn(),
            },
            xmlExportConfiguration: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            manual: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            chapter: {
              findMany: jest.fn(),
            },
            section: {
              findMany: jest.fn(),
            },
            block: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    xmlParserService = module.get<XmlParserService>(XmlParserService);
    xmlMapperService = module.get<XmlMapperService>(XmlMapperService);
    xmlExporterService = module.get<XmlExporterService>(XmlExporterService);
    xmlDiffService = module.get<XmlDiffService>(XmlDiffService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('XmlParserService', () => {
    describe('parseXmlDocument', () => {
      it('should parse valid XML successfully', async () => {
        const result = await xmlParserService.parseXmlDocument(validXmlContent);
        
        expect(result).toBeDefined();
        expect(result.Manual).toBeDefined();
        expect(result.Manual.Metadata).toBeDefined();
        expect(result.Manual.Chapters).toBeDefined();
        expect(result.Manual.Chapters.Chapter).toBeDefined();
        expect(result.Manual.Chapters.Chapter.Number).toBe('01');
        expect(result.Manual.Chapters.Chapter.Title).toBe('Introduction');
      });

      it('should extract metadata correctly', async () => {
        const result = await xmlParserService.extractMetadata(validXmlContent);
        
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('version');
        expect(result).toHaveProperty('nsmap');
        expect(result.title).toBe('Test Manual');
        expect(result.version).toBe('1.0');
      });

      it('should throw error for invalid XML', async () => {
        await expect(xmlParserService.parseXmlDocument(invalidXmlContent))
          .rejects
          .toThrow();
      });
    });

    describe('validateXmlWithXsd', () => {
      const validXsdSchema = `
        <?xml version="1.0" encoding="UTF-8"?>
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
          <xs:element name="Manual">
            <xs:complexType>
              <xs:sequence>
                <xs:element name="Metadata" type="xs:string" />
                <xs:element name="Chapters" type="xs:string" />
              </xs:sequence>
              <xs:attribute name="version" type="xs:string" use="required" />
              <xs:attribute name="title" type="xs:string" use="required" />
            </xs:complexType>
          </xs:element>
        </xs:schema>
      `;

      it('should validate XML against XSD successfully', async () => {
        const result = await xmlParserService.validateXmlWithXsd(validXmlContent, validXsdSchema);
        
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      });

      it('should detect XSD validation errors', async () => {
        const invalidXsdXml = `
          <Manual version="1.0" title="Test">
            <!-- Missing required Metadata element -->
            <OtherElement>Invalid content</OtherElement>
          </Manual>
        `;

        const result = await xmlParserService.validateXmlWithXsd(invalidXsdXml, validXsdSchema);
        
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toHaveProperty('message');
        expect(result.errors[0]).toHaveProperty('line');
      });

      it('should handle invalid XSD schema gracefully', async () => {
        const invalidXsd = `<xs:schema xmlns:xs="invalid">`; // Invalid XSD

        await expect(xmlParserService.validateXmlWithXsd(validXmlContent, invalidXsd))
          .rejects
          .toThrow();
      });
    });
  });

  describe('XmlMapperService', () => {
    const organizationId = 'org-123';
    const userId = 'user-123';
    const xmlDocumentId = 'xml-doc-123';

    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('createXmlMapping', () => {
      it('should create XML mapping successfully', async () => {
        const mockMapping = {
          id: 'mapping-123',
          xmlDocumentId,
          sourceElementPath: '/Manual/Chapters/Chapter',
          targetEntityType: 'Chapter',
          targetEntityId: 'chapter-123',
          mappingRules: { attributeMapping: { id: 'externalId' } },
          confidenceScore: 0.95,
        };

        (prismaService.xmlMapping.create as jest.Mock).mock ResolvedValue(mockMapping);

        const result = await xmlMapperService.createXmlMapping({
          xmlDocumentId,
          sourceElementPath: '/Manual/Chapters/Chapter',
          targetEntityType: 'Chapter',
          targetEntityId: 'chapter-123',
          mappingRules: { attributeMapping: { id: 'externalId' } },
          confidenceScore: 0.95,
        });

        expect(result).toEqual(mockMapping);
        expect(prismaService.xmlMapping.create).toHaveBeenCalledWith({
          data: {
            xmlDocumentId,
            sourceElementPath: '/Manual/Chapters/Chapter',
            targetEntityType: 'Chapter',
            targetEntityId: 'chapter-123',
            mappingRules: { attributeMapping: { id: 'externalId' } },
            confidenceScore: 0.95,
          },
        });
      });

      it('should generate default mappings for XML document', async () => {
        const mockDocument = {
          id: xmlDocumentId,
          xmlContent: validXmlContent,
          organizationId,
        };

        const mockMappings = [
          {
            xmlDocumentId,
            sourceElementPath: '/Manual/Chapters/Chapter',
            targetEntityType: 'Chapter',
            mappingRules: {},
            confidenceScore: 0.8,
          },
          {
            xmlDocumentId,
            sourceElementPath: '/Manual/Chapters/Chapter/Sections/Section',
            targetEntityType: 'Section',
            mappingRules: {},
            confidenceScore: 0.7,
          },
        ];

        (prismaService.xmlDocument.findUnique as jest.Mock).mock.ReturnedValue(mockDocument);
        (prismaService.xmlMapping.createMany as jest.Mock).mock.ResolvedValue({ count: 2 });

        await xmlMapperService.generateDefaultMappings(xmlDocumentId);

        expect(prismaService.xmlMapping.createMany).toHaveBeenCalledWith({
          data: expect.arrayContaining([
            expect.objectContaining({
              xmlDocumentId,
              sourceElementPath: '/Manual/Chapters/Chapter',
              targetEntityType: 'Chapter',
            }),
            expect.objectContaining({
              xmlDocumentId,
              sourceElementPath: '/Manual/Chapters/Chapter/Sections/Section',
              targetEntityType: 'Section',
            }),
          ]),
        });
      });
    });

    describe('syncManualToXml', () => {
      it('should sync manual changes to XML structure', async () => {
        const mockManualData = {
          id: 'manual-123',
          title: 'Updated Manual',
          version: '2.0.0',
          chapters: [
            {
              id: 'chapter-123',
              number: '01',
              title: 'Updated Chapter',
              sections: [
                {
                  id: 'section-123',
                  number: '01-01',
                  title: 'Updated Section',
                  blocks: [
                    {
                      id: 'block-123',
                      type: 'paragraph',
                      content: '<p>Updated content</p>',
                    },
                  ],
                },
              ],
            },
          ],
        };

        const result = await xmlMapperService.syncManualToXml(mockManualData);

        expect(result).toBeDefined();
        expect(result).toContain('Updated Manual');
        expect(result).toContain('version="2.0.0"');
        expect(result).toContain('Updated Chapter');
        expect(result).toContain('Updated Section');
        expect(result).toContain('Updated content');
      });
    });
  });

  describe('XmlExporterService', () => {
    const mockManualId = 'manual-123';
    const mockOrganizationId = 'org-123';

    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('exportManualToXml', () => {
      it('should export manual to XML successfully', async () => {
        const mockManual = {
          id: mockManualId,
          title: 'Test Manual',
          version: '1.0.0',
          content: { summary: 'Test manual content' },
          chapters: [
            {
              id: 'chapter-123',
              number: '01',
              title: 'Introduction',
              sections: [
                {
                  id: 'section-123',
                  number: '01-01',
                  title: 'General Info',
                  blocks: [
                    {
                      id: 'block-123',
                      type: 'paragraph',
                      content: '<p>Test content</p>',
                    },
                  ],
                },
              ],
            },
          ],
        };

        const mockXmlMappings = [
          {
            sourceElementPath: '/Manual/Chapters/Chapter',
            targetEntityType: 'Chapter',
            mappingRules: { attributeMapping: { id: 'externalId', Title: 'title' } },
            confidenceScore: 0.9,
          },
          {
            sourceElementPath: '/Manual/Chapters/Chapter/Sections/Section',
            targetEntityType: 'Section',
            mappingRules: { attributeMapping: { id: 'externalId', Title: 'title' } },
            confidenceScore: 0.85,
          },
        ];

        (prismaService.manual.findUnique as jest.Mock).mockResolvedValue(mockManual);
        (prismaService.xmlMapping.findMany as jest.Mock).mockResolvedValue(mockXmlMappings);

        const result = await xmlExporterService.exportManualToXml({
          manualId: mockManualId,
          xmlTemplateId: undefined,
          xmlMappingId: undefined,
          xmlVersion: '1.0',
          formatOptions: {
            indented: true,
            includeMetadata: true,
            includeComments: false,
            collapseEmptyElements: false,
          },
          targetElement: undefined,
        });

        expect(result).toBeDefined();
        expect(result.xmlContent).toContain('<Manual');
        expect(result.xmlContent).toContain('Test Manual');
        expect(result.xmlContent).toContain('Introduction');
        expect(result.validationStatus).toBe('VALID');
      });

      it('should validate exported XML', async () => {
        const mockManual = {
          id: mockManualId,
          title: 'Test Manual',
          version: '1.0.0',
          chapters: [],
        };

        const mockXsdSchema = '<?xml version="1.0"?><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="Manual"/></xs:schema>';

        (prismaService.manual.findUnique as jest.Mock).mockResolvedValue(mockManual);
        (prismaService.xmlMapping.findMany as jest.Mock).mockResolvedValue([]);
        (prismaService.xmlExportConfiguration.findUnique as jest.Mock).mockResolvedValue({
          id: 'template-123',
          xmlTemplate: '<Manual><Title>Template</Title></Manual>',
          xsdSchema: mockXsdSchema,
        });

        const result = await xmlExporterService.validateExportedXml('<Manual><Title>Test</Title></Manual>', mockXsdSchema);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('transformManualToXmlData', () => {
      it('should transform manual data to XML structure', async () => {
        const mockManual = {
          id: mockManualId,
          title: 'Transformation Test',
          version: '1.5.0',
          chapters: [
            {
              id: 'chapter-123',
              number: '01',
              title: 'Test Chapter',
              sections: [
                {
                  id: 'section-123',
                  number: '01-01',
                  title: 'Test Section',
                  blocks: [
                    {
                      id: 'block-123',
                      type: 'paragraph',
                      content: '<p>Test paragraph</p>',
                    },
                  ],
                },
              ],
            },
          ],
        };

        const result = xmlExporterService.transformManualToXmlData(mockManual, {
          indented: true,
          includeMetadata: true,
          includeComments: false,
          collapseEmptyElements: false,
        });

        expect(result).toBeDefined();
        expect(result.title).toBe('Transformation Test');
        expect(result.version).toBe('1.5.0');
        expect(result.chapters).toHaveLength(1);
        expect(result.chapters[0].title).toBe('Test Chapter');
        expect(result.chapters[0].sections).toHaveLength(1);
        expect(result.chapters[0].sections[0].title).toBe('Test Section');
        expect(result.сhapters[0].sections[0].blocks).toHaveLength(1);
      });
    });
  });

  describe('XmlDiffService', () => {
    describe('generateXmlDiff', () => {
      it('should generate diff for modified XML', async () => {
        const sourceXml = `
          <Manual version="1.0" title="Original">
            <Chapters>
              <Chapter id="ch01">
                <Title>Old Title</Title>
              </Chapter>
            </Chapters>
          </Manual>
        `;

        const targetXml = `
          <Manual version="1.1" title="Updated">
            <Chapters>
              <Chapter id="ch01">
                <Title>New Title</Title>
              </Chapter>
              <Chapter id="ch02">
                <Title>Added Chapter</Title>
              </Chapter>
            </Chapters>
          </Manual>
        `;

        const result = await xmlDiffService.generateXmlDiff({
          sourceXmlDocumentId: 'xml-1',
          targetXmlDocumentId: 'xml-2',
          sourceXmlContent: sourceXml,
          targetXmlContent: targetXml,
        });

        expect(result.changesSummary.totalChanges).toBeGreaterThan(0);
        expect(result.changesSummary.modifications).toBeGreaterThan(0);
        expect(result.changesSummary.additions).toBeGreaterThan(0);
        expect(result.changes).toBeDefined();
        expect(result.changes.length).toBeGreaterThan(0);
      });

      it('should identify minor version changes', async () => {
        const sourceXml = '<Manual version="1.0"><Title>Test</Title></Manual>';
        const targetXml = '<Manual version="1.1"><Title>Test</Title></Manual>';

        const result = await xmlDiffService.generateXmlDiff({
          sourceXmlDocumentId: 'xml-1',
          targetXmlDocumentId: 'xml-2',
          sourceXmlContent: sourceXml,
          targetXmlContent: targetXml,
        });

        expect(result.isMinorVersion).toBe(true);
        expect(result.isMajorVersion).toBe(false);
      });

      it('should identify major version changes', async () => {
        const sourceXml = '<Manual version="1.0"><Title>Old Structure</Title></Manual>';
        const targetXml = '<Manual version="2.0"><NewTitle>New Structure</NewTitle></Manual>';

        const result = await xmlDiffService.generateXmlDiff({
          sourceXmlDocumentId: 'xml-1',
          targetXmlDocumentId: 'xml-2',
          sourceXmlContent: sourceXml,
          targetXmlContent: targetXml,
        });

        expect(result.isMajorVersion).toBe(true);
        expect(result.isMinorVersion).toBe(false);
      });

      it('should detect trivial changes', async () => {
        const sourceXml = '<Manual><Title>Test</Title></Manual>';
        const targetXml = '<Manual><Title>Test </Title></Manual>'; // Extra whitespace

        const diff = await xmlDiffService.generateXmlDiff({
          sourceXmlDocumentId: 'xml-1',
          targetXmlDocumentId: 'xml-2',
          sourceXmlContent: sourceXml,
          targetXmlContent: targetXml,
        });

        const trivialChange = diff.changes.find((change: any) => 
          change.sourceElementPath === '/Manual/Title' || 
          (change.changeType === 'modified' && change.isTrivial)
        );

        expect(trivialChange).toBeDefined();
      });
    });

    describe('compareXmlNodes', () => {
      it('should compare identical nodes', async () => {
        const node1 = '<Chapter id="ch01"><Title>Test</Title></Chapter>';
        const node2 = '<Chapter id="ch01"><Title>Test</Title></Chapter>';

        const result = xmlDiffService.compareXmlNodes(node1, node2);

        expect(result.hasChanges).toBe(false);
        expect(result.changes).toHaveLength(0);
      });

      it('should detect node differences', async () => {
        const node1 = '<Chapter id="ch01"><Title>Old Title</Title></Chapter>';
        const node2 = '<Chapter id="ch01"><Title>New Title</Title></Chapter>';

        const result = xmlDiffService.compareXmlNodes(node1, node2);

        expect(result.hasChanges).toBe(true);
        expect(result.changes.length).toBeGreaterThan(0);
        
        const titleChange = result.changes.find((change: any) => 
          change.sourceElementPath.includes('Title')
        );
        expect(titleChange).toBeDefined();
        expect(titleChange.changeElement).toBe('text');
        expect(titleChange.changeType).toBe('modified');
        expect(titleChange.oldValue).toBe('Old Title');
        expect(titleChange.newValue).toBe('New Title');
      });
    });

    describe('isTrivialChange', () => {
      it('should identify whitespace-only changes as trivial', () => {
        const oldContent = '<p>Test content</p>';
        const newContent = '<p>Test content </p>'; // Extra whitespace

        const result = xmlDiffService.isTrivialChange(oldContent, newContent);

        expect(result).toBe(true);
      });

      it('should identify HTML tag normalization as trivial', () => {
        const oldContent = '<p>Test <b>bold</b> content</p>';
        const newContent = '<p>Test <strong>bold</strong> content</p>';

        const result = xmlDiffService.isTrivialChange(oldContent, newContent);

        expect(result).toBe(true);
      });

      it('should identify content changes as non-trivial', () => {
        const oldContent = '<p>Original content</p>';
        const newContent = '<p>Modified content</p>';

        const result = xmlDiffService.isTrivialChange(oldContent, newContent);

        expect(result).toBe(false);
      });

      it('should identify structural changes as non-trivial', () => {
        const oldContent = '<p>Simple paragraph</p>';
        const newContent = '<div><p>Paragraph in div</p></div>';

        const result = xmlDiffService.isTrivialChange(oldContent, newContent);

        expect(result).toBe(false);
      });
    });

    describe('isMinorVersionChange', () => {
      it('should identify minor version compatible changes', () => {
        const changes = [
          { sourceElement: 'text', changeType: 'modified', isTrivial: true },
          { sourceElement: 'comment', changeType: 'added', isTrivial: true },
        ];

        const result = xmlDiffService.isMinorVersionChange(changes);

        expect(result).toBe(true);
      });

      it('should identify major version changes', () => {
        const changes = [
          { sourceElement: 'Chapter', changeType: 'removed', isTrivial: false },
          { sourceElement: 'NewStructure', changeType: 'added', isTrivial: false },
        ];

        const result = xmlDiffService.isMinorVersionChange(changes);

        expect(result).toBe(false);
      });
    });

    describe('findUnique', () => {
      it('should handle XML document lookup', async () => {
        const mockDoc = {
          id: 'xml-doc-123',
          fileName: 'test.xml',
          xmlContent: validXmlContent,
          organizationId: 'org-123',
        };

        (prismaService.xmlDocument.findUnique as jest.Mock).mockResolvedValue(mockDoc);

        const result = await xmlDiffService.findUnique('xml-doc-123');

        expect(result).toEqual(mockDoc);
        expect(prismaService.xmlDocument.findUnique).toHaveBeenCalledWith({
          where: { id: 'xml-doc-123' },
        });
      });

      it('should handle missing XML document', async () => {
        (prismaService.xmlDocument.findUnique as jest.Mock).mockResolvedValue(null);

        const result = await xmlDiffService.findUnique('nonexistent-id');

        expect(result).toBeNull();
      });
    });

    describe('findUniqueByIds', () => {
      it('should find XML documents by multiple IDs', async () => {
        const mockDocs = [
          { id: 'xml-doc-1', fileName: 'doc1.xml' },
          { id: 'xml-doc-2', fileName: 'doc2.xml' },
        ];

        (prismaService.xmlDocument.findMany as jest.Mock).mockResolvedValue(mockDocs);

        const result = await xmlDiffService.findUniqueByIds(['xml-doc-1', 'xml-doc-2']);

        expect(result).toEqual(mockDocs);
        expect(prismaService.xmlDocument.findMany).toHaveBeenCalledWith({
          where: { id: { in: ['xml-doc-1', 'xml-doc-2'] } },
        });
      });
    });

    describe('createUniqueXmlDiffJob', () => {
      it('should create XML diff job', async () => {
        const mockJob = {
          id: 'job-123',
          sourceXmlDocumentId: 'xml-doc-1',
          targetXmlDocumentId: 'xml-doc-2',
          status: 'PENDING',
        };

        (prismaService.xmlProcessingJob.create as jest.Mock).mockResolvedValue(mockJob);

        const result = await xmlDiffService.createUniqueXmlDiffJob({
          sourceXmlDocumentId: 'xml-doc-1',
          targetXmlDocumentId: 'xml-doc-2',
          createdBy: 'user-123',
          organizationId: 'org-123',
        });

        expect(result).toEqual(mockJob);
        expect(prismaService.xmlProcessingJob.create).toHaveBeenCalledWith({
          data: {
            sourceXmlDocumentId: 'xml-doc-1',
            targetXmlDocumentId: 'xml-doc-2',
            status: 'PENDING',
            jobType: 'DIFF',
            createdBy: 'user-123',
            organizationId: 'org-123',
          },
        });
                  });
              });
          });
      });
  
      describe('Integration Tests', () => {
        describe('import-export-roundtrip', () => {
          it('should maintain data fidelity through complete cycle', async () => {
            // Import
            const importResult = await xmlParserService.parseXmlDocument(validXmlContent);
            expect(importResult.Manual).toBeDefined();
  
            // Export simulation
            const mockManual = {
              id: 'manual-123',
              title: 'Test Manual',
              version: '1.0.0',
              chapters: [],
            };
  
            (prismaService.manual.findUnique as jest.Mock).mockResolvedValue(mockManual);
            (prismaService.xmlMapping.findMany as jest.Mock).mockResolvedValue([]);
  
            const exportResult = await xmlExporterService.exportManualToXml({
              manualId: 'manual-123',
              xmlTemplateId: undefined,
              xmlMappingId: undefined,
              xmlVersion: '1.0',
              formatOptions: {
                indented: true,
                includeMetadata: true,
                includeComments: false,
                collapseEmptyElements: false,
              },
              targetElement: undefined,
            });
  
            expect(exportResult.xmlContent).toBeDefined();
  
            // Diff comparison
            const diffResult = await xmlDiffService.generateXmlDiff({
              sourceXmlDocumentId: 'xml-doc-1',
              targetXmlDocumentId: 'xml-doc-2',
              sourceXmlContent: validXmlContent,
              targetXmlContent: exportResult.xmlContent,
            });
  
            // Should have minimal differences
            expect(diffResult.changesSummary.totalChanges).toBeLessThan(20);
            expect(diffResult.isMinorVersion).toBe(true);
          });
        });
      });
  });
