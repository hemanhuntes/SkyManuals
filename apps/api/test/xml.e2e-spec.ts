import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@skymanuals/prisma';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('XML E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let organizationId: string;
  let manualId: string;
  let userId: string;

  const sampleXmlContent = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Manual xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xmlns:xsd="http://www.w3.org/2001/XMLSchema"
            xsi:schemaLocation="http://company.com/schema manual.xsd"
            version="1.0"
            title="Sample Aircraft Manual">
      
      <Metadata>
        <Title>Boeing 737 Operators Manual</Title>
        <Version>1.2.0</Version>
        <LastUpdate>2024-01-15</LastUpdate>
        <OrganizationId>org-123</OrganizationId>
      </Metadata>
      
      <Chapters>
        <Chapter id="ch01">
          <Number>01</Number>
          <Title>Introduction</Title>
          <Sections>
            <Section id="sec01-01">
              <Number>01-01</Number>
              <Title>General Information</Title>
              <Blocks>
                <Block id="blk01-01-01" type="paragraph">
                  <Content>
                    <p><strong>Purpose:</strong> This manual provides essential information for aircraft operation.</p>
                  </Content>
                </Block>
                <Block id="blk01-01-02" type="warning">
                  <Content>
                    <div class="warning">
                      <strong>WARNING:</strong> Always follow safety procedures.
                    </div>
                  </Content>
                </Block>
              </Blocks>
            </Section>
          </Sections>
        </Chapter>
        
        <Chapter id="ch02">
          <Number>02</Number>
          <Title>Safety Procedures</Title>
          <Sections>
            <Section id="sec02-01">
              <Number>02-01</Number>
              <Title>Basic Safety Rules</Title>
              <Blocks>
                <Block id="blk02-01-01" type="procedure">
                  <Content>
                    <ol>
                      <li>Perform pre-flight inspection</li>
                      <li>Check weather conditions</li>
                      <li>Verify flight documentation</li>
                    </ol>
                  </Content>
                </Block>
              </Blocks>
            </Section>
          </Sections>
        </Chapter>
      </Chapters>
      
      <Appendix>
        <Item>A.1 - Emergency Procedures Checklist</Item>
        <Item>A.2 - Contact Information</Item>
      </Appendix>
    </Manual>
  `;

  const sampleXsdSchema = `
    <?xml version="1.0" encoding="UTF-8"?>
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" 
               targetNamespace="http://company.com/schema"
               xmlns:tns="http://company.com/schema">
      
      <xs:element name="Manual">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="Metadata" type="tns:MetadataType" />
            <xs:element name="Chapters" type="tns:ChaptersType" />
            <xs:element name="Appendix" type="tns:AppendixType" minOccurs="0" />
          </xs:sequence>
          <xs:attribute name="version" type="xs:string" use="required" />
          <xs:attribute name="title" type="xs:string" use="required" />
        </xs:complexType>
      </xs:element>
      
      <xs:complexType name="MetadataType">
        <xs:sequence>
          <xs:element name="Title" type="xs:string" />
          <xs:element name="Version" type="xs:string" />
          <xs:element name="LastUpdate" type="xs:date" />
          <xs:element name="OrganizationId" type="xs:string" />
        </xs:sequence>
      </xs:complexType>
      
      <xs:complexType name="ChaptersType">
        <xs:sequence>
          <xs:element name="Chapter" type="tns:ChapterType" maxOccurs="unbounded" />
        </xs:sequence>
      </xs:complexType>
      
      <xs:complexType name="ChapterType">
        <xs:sequence>
          <xs:element name="Number" type="xs:string" />
          <xs:element name="Title" type="xs:string" />
          <xs:element name="Sections" type="tns:SectionsType" />
        </xs:sequence>
        <xs:attribute name="id" type="xs:string" use="required" />
      </xs:complexType>
      
      <xs:complexType name="SectionsType">
        <xs:sequence>
          <xs:element name="Section" type="tns:SectionType" maxOccurs="unbounded" />
        </xs:sequence>
      </xs:complexType>
      
      <xs:complexType name="SectionType">
        <xs:sequence>
          <xs:element name="Number" type="xs:string" />
          <xs:element name="Title" type="xs:string" />
          <xs:element name="Blocks" type="tns:BlocksType" />
        </xs:sequence>
        <xs:attribute name="id" type="xs:string" use="required" />
      </xs:complexType>
      
      <xs:complexType name="BlocksType">
        <xs:sequence>
          <xs:element name="Block" type="tns:BlockType" maxOccurs="unbounded" />
        </xs:sequence>
      </xs:complexType>
      
      <xs:complexType name="BlockType">
        <xs:sequence>
          <xs:element name="Content" type="xs:string" />
        </xs:sequence>
        <xs:attribute name="id" type="xs:string" use="required" />
        <xs:attribute name="type" type="xs:string" use="required" />
      </xs:complexType>
      
      <xs:complexType name="AppendixType">
        <xs:sequence>
          <xs:element name="Item" type="xs:string" maxOccurs="unbounded" />
        </xs:sequence>
      </xs:complexType>
    </xs:schema>
  `;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    
    await app.init();

    // Create test data
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Aviation Corp',
        domain: 'testav.com',
        settings: {},
      },
    });
    organizationId = organization.id;

    const user = await prisma.user.create({
      data: {
        email: 'test@testav.com',
        name: 'Test User',
        externalId: 'test-user-123',
        organizationId: organization.id,
      },
    });
    userId = user.id;

    // Mock auth token (in real test, would use actual auth system)
    authToken = 'test-token-123';
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up XML documents before each test
    await prisma.xmlDocument.deleteMany({});
    await prisma.xmlMapping.deleteMany({});
    await prisma.xmlExportConfiguration.deleteMany({});
    
    // Clean up manuals
    await prisma.manual.deleteMany({});
    
    const manual = await prisma.manual.create({
      data: {
        title: 'Test Manual',
        version: '1.0.0',
        status: 'DRAFT',
        organizationId,
        createdBy: userId,
      },
    });
    manualId = manual.id;
  });

  describe('POST /xml/import', () => {
    it('should import XML with valid content', async () => {
      const response = await request(app.getHttpServer())
        .post('/xml/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'sample-manual.xml',
          xmlContent: sampleXmlContent,
          organizationId,
          importOptions: {
            createNewManual: false,
            overwriteExistingBlocks: true,
            validateAgainstXsd: true,
            generateDefaultMappings: true,
          },
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.fileName).toBe('sample-manual.xml');
      expect(response.body.status).toBe('VALIDATION_SUCCESS');
      expect(response.body.parsedXml).toBeDefined();
      expect(response.body.parsedXml.Manual).toBeDefined();
      expect(response.body.validationErrors).toEqual([]);
      expect(response.body.mappingsGenerated).toBeGreaterThan(0);
    });

    it('should validate XML against XSD schema', async () => {
      const response = await request(app.getHttpServer())
        .post('/xml/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'sample-manual.xml',
          xmlContent: sampleXmlContent,
          xsdSchemaContent: sampleXsdSchema,
          organizationId,
          importOptions: {
            createNewManual: false,
            overwriteExistingBlocks: true,
            validateAgainstXsd: true,
            generateDefaultMappings: true,
          },
        })
        .expect(201);

      expect(response.body.status).toBe('VALIDATION_SUCCESS');
      expect(response.body.validationErrors).toEqual([]);
    });

    it('should fail with invalid XML', async () => {
      const invalidXml = `
        <Manual>
          <Chapters>
            <Chapter>
              <!-- Missing closing tag -->
          </Chapters>
        </Manual>
      `;

      await request(app.getHttpServer())
        .post('/xml/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'invalid-manual.xml',
          xmlContent: invalidXml,
          organizationId,
          importOptions: {
            createNewManual: false,
            overwriteExistingBlocks: false,
            validateAgainstXsd: true,
            generateDefaultMappings: false,
          },
        })
        .expect(400);

      // Verify that no XML document was created
      const xmlDocs = await prisma.xmlDocument.findMany();
      expect(xmlDocs).toHaveLength(0);
    });

    it('should handle XSD validation errors', async () => {
      const invalidXml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <Manual version="1.0" title="Invalid Manual">
          <Metadata>
            <Title>Missing Required Fields</Title>
            <!-- Missing Version, LastUpdate, OrganizationId -->
          </Metadata>
          <Chapters>
            <Chapter id="ch01">
              <Number>01</Number>
              <Title>Chapter without Sections</Title>
              <!-- Missing Sections element -->
            </Chapter>
          </Chapters>
        </Manual>
      `;

      const response = await request(app.getHttpServer())
        .post('/xml/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'invalid-schema.xml',
          xmlContent: invalidXml,
          xsdSchemaContent: sampleXsdSchema,
          organizationId,
          importOptions: {
            createNewManual: false,
            overwriteExistingBlocks: false,
            validateAgainstXsd: true,
            generateDefaultMappings: false,
          },
        });

      expect(response.status).toBe(201); // Should still be accepted but with errors
      expect(response.body.validationErrors).toHaveLength(4); // Missing Version, LastUpdate, OrganizationId, Sections
      expect(response.body.validationErrors[0]).toHaveProperty('message');
      expect(response.body.validationErrors[0]).toHaveProperty('line');
      expect(response.body.validationErrors[0]).toHaveProperty('column');
    });

    it('should generate default mappings when enabled', async () => {
      const response = await request(app.getHttpServer())
        .post('/xml/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'sample-manual.xml',
          xmlContent: sampleXmlContent,
          organizationId,
          importOptions: {
            createNewManual: false,
            overwriteExistingBlocks: false,
            validateAgainstXsd: false,
            generateDefaultMappings: true,
          },
        })
        .expect(201);

      expect(response body.mappingsGenerated).toBeGreaterThan(5);
      
      // Verify mappings were created in database
      const mappings = await prisma.xmlMapping.findMany({
        where: { xmlDocumentId: response.body.id }
      });
      expect(mappings).toHaveLength(response.body.mappingsGenerated);
      
      // Check for specific mappings
      const chapterMapping = mappings.find(m => m.sourceElementPath === '/Manual/Chapters/Chapter');
      expect(chapterMapping).toBeDefined();
      expect(chapterMapping?.targetEntityType).toBe('Chapter');
      
      const sectionMapping = mappings.find(m => m.sourceElementPath === '/Manual/Chapters/Chapter/Sections/Section');
      expect(sectionMapping).toBeDefined();
      expect(sectionMapping?.targetEntityType).toBe('Section');
    });
  });

  describe('POST /xml/export', () => {
    let xmlDocumentId: string;

    beforeEach(async () => {
      // Create a test XML document
      const xmlDoc = await prisma.xmlDocument.create({
        data: {
          fileName: 'sample-manual.xml',
          xmlContent: sampleXmlContent,
          schemaContent: sampleXsdSchema,
          status: 'VALIDATION_SUCCESS',
          organizationId,
          createdBy: userId,
        },
      });
      xmlDocumentId = xmlDoc.id;

      // Create mappings
      await prisma.xmlMapping.createMany({
        data: [
          {
            xmlDocumentId,
            sourceElementPath: '/Manual/Chapters/Chapter',
            targetEntityType: 'Chapter',
            targetEntityId: null,
            mappingRules: { attributeMapping: { id: 'externalId', Number: 'number', Title: 'title' } },
            confidenceScore: 0.95,
          },
          {
            xmlDocumentId,
            sourceElementPath: '/Manual/Chapters/Chapter/Sections/Section',
            targetEntityType: 'Section',
            targetEntityId: null,
            mappingRules: { attributeMapping: { id: 'externalId', Number: 'number', Title: 'title' } },
            confidenceScore: 0.90,
          },
          {
            xmlDocumentId,
            sourceElementPath: '/Manual/Chapters/Chapter/Sections/Section/Blocks/Block',
            targetEntityType: 'Block',
            targetEntityId: null,
            mappingRules: { 
              attributeMapping: { id: 'externalId', type: 'type' },
              contentMapping: { htmlContent: 'Content' }
            },
            confidenceScore: 0.85,
          },
        ],
      });
    });

    it('should export manual to XML format', async () => {
      const response = await request(app.getHttpServer())
        .post('/xml/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          manualId,
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
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.manualId).toBe(manualId);
      expect(response.body.xmlContent).toBeDefined();
      expect(response.body.validationStatus).toBe('VALID');
      expect(response.body.statistics).toBeDefined();
      expect(response.body.statistics.chaptersExported).toBeGreaterThanOrEqual(0);
      expect(response.body.statistics.sectionsExported).toBeGreaterThanOrEqual(0);
      expect(response.body.statistics BloсksExported).toBeGreaterThanOrEqual(0);
    });

    it('should validate exported XML', async () => {
      const response = await request(app.getHttpServer())
        .post('/xml/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          manualId,
          xmlTemplateId: undefined,
          xmlMappingId: undefined,
          xmlVersion: '1.0',
          formatOptions: {
            indented: true,
            includeMetadata: true,
            includeComments: true,
            collapseEmptyElements: false,
          },
        })
        .expect(201);

      expect(response.body.validationStatus).toBe('VALID');
      expect(response.body.warnings).toBeDefined();
      expect(Array.isArray(response.body.warnings)).toBe(true);
      
      // Verify XML structure
      expect(response.body.xmlContent).toContain('<Manual');
      expect(response.body.xmlContent).toContain('<Metadata');
      expect(response.body.xmlContent).toContain('<Chapters');
    });

    it('should handle specific element export', async () => {
      const response = await request(app.getHttpServer())
        .post('/xml/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          manualId,
          targetElement: 'Chapter',
          formatOptions: {
            indented: true,
            includeMetadata: false,
            includeComments: false,
            collapseEmptyElements: true,
          },
        })
        .expect(201);

      expect(response.body.xmlContent).toBeDefined();
      // Should not include full Manual structure for specific element
      expect(response.body.xmlContent).not.toContain('<Manual');
      expect(response.body.xmlContent).not.toContain('<Metadata');
    });

    it('should use XML template if provided', async () => {
      // Create XML template
      const template = await prisma.xmlExportConfiguration.create({
        data: {
          name: 'Aircraft Manual Template',
          xmlTemplate: `
            <Manual version="2.0" schema="aircraft">
              <Metadata template="custom" />
              <Chapters />
            </Manual>
          `,
          xs dSchema: '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">',
          mappingConfiguration: {
            chapterMapping: { customRule: true },
            sectionMapping: { customRule: true },
          },
          organizationId,
          createdBy: userId,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/xml/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          manualId,
          xmlTemplateId: template.id,
          formatOptions: {
            indented: true,
            includeMetadata: true,
            includeComments: false,
            collapseEmptyElements: false,
          },
        })
        .expect(201);

      expect(response.body.xmlContent).toContain('version="2.0"');
      expect(response.body.xmlContent).toContain('schema="aircraft"');
      expect(response.body.xmlContent).toContain('template="custom"');
    });
  });

  describe('POST /xml/diff', () => {
    it('should generate XML diff between two documents', async () => {
      const leftXml = `
        <Manual version="1.0" title="Original Manual">
          <Chapters>
            <Chapter id="ch01">
              <Title>Old Chapter</Title>
            </Chapter>
          </Chapters>
        </Manual>
      `;

      const rightXml = `
        <Manual version="2.0" title="Updated Manual">
          <Chapters>
            <Chapter id="ch01">
              <Title>New Chapter</Title>
            </Chapter>
            <Chapter id="ch02">
              <Title>Added Chapter</Title>
            </Chapter>
          </Chapters>
        </Manual>
      `;

      const response = await request(app.getHttpServer())
        .post('/xml/diff')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceXmlContent: leftXml,
          targetXmlContent: rightXml,
        })
        .expect(201);

      expect(response.body.changesSummary).toHaveProperty('totalChanges');
      expect(response.body.changesSummary.totalChanges).toBeGreaterThan(0);
      expect(response.body.changesSummary).toHaveProperty('additions');
      expect(response.body.changesSummary).toHaveProperty('modifications');
      
      expect(response.body.changes).toBeDefined();
      expect(response.body.changes.length).toBeGreaterThan(0);
      
      // Check for specific changes
      const versionChange = response.body.changes.find((change: any) => 
        change.sourceElementPath === '/Manual@version'
      );
      expect(versionChange).toBeDefined();
      expect(versionChange.changeType).toBe('modified');
      expect(versionChange.oldValue).toBe('1.0');
      exрect(versionChange.newValue).toBe('2.0');
    });

    it('should detect trivial changes correctly', async () => {
      const leftXml = '<Manual version="1.0"><Title>Test</Title></Manual>';
      const rightXml = '<Manual version="1.0"><Title>Test </Title></Manual>'; // Extra whitespace

      const response = await request(app.getHttpServer())
        .post('/xml/diff')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceXmlContent: leftXml,
          targetXmlContent: rightXml,
        })
        .expect(201);

      expect(response.body.changesSummary.trivialChanges).toBeGreaterThan(0);
      expect(response.body.isMinorVersion).toBe(true);
    });

    it('should identify major version changes', async () => {
      const leftXml = '<Manual version="1.0"><Title>Original Structure</Title></Manual>';
      const rightXml = `
        <Manual version="2.0">
          <NewStructure>
            <CompletelyNewElement>Completely new content</CompletelyNewElement>
          </NewStructure>
        </Manual>
      `;

      const response = await request(app.getHttpServer())
        .post('/xml/diff')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceXmlContent: leftXml,
          targetXmlContent: rightXml,
        })
        .expect(201);

      expect(response.body.isMinorVersion).toBe(false);
      expect(response.body.changesSummary.majorChanges).toBeGreaterThan(0);
    });
  });

  describe('Round-trip fidelity tests', () => {
    it('should maintain fidelity through import-export cycle', async () => {
      // Import original XML
      const importResponse = await request(app.getHttpServer())
        .post('/xml/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'roundtrip-test.xml',
          xmlContent: sampleXmlContent,
          organizationId,
          importOptions: {
            createNewManual: false,
            overwriteExistingBlocks: false,
            validateAgainstXsd: false,
            generateDefaultMappings: true,
          },
        })
        .expect(201);

      const xmlDocumentId = importResponse.body.id;

      // Apply mappings to create manual structure
      await request(app.getHttpServer())
        .post(`/xml/mappings/${xmlDocumentId}/apply`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          manualId,
          preserveOriginalStructure: true,
        })
        .expect(201);

      // Export back to XML
      const exportResponse = await request(app.getHttpServer())
        .post('/xml/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          manualId,
          formatOptions: {
            indented: true,
            includeMetadata: true,
            includeComments: false,
            collapseEmptyElements: false,
          },
        })
        .expect(201);

      // Compare original and exported XML using diff
      const diffResponse = await request(app.getHttpServer())
        .post('/xml/diff')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceXmlContent: sampleXmlContent,
          targetXmlContent: exportResponse.body.xmlContent,
        })
        .expect(201);

      // Should have minimal differences (maybe just formatting)
      expect(diffResponse.body.changesSummary.totalChanges).toBeLessThan(10);
      expect(diffResponse.body.isMinorVersion).toBe(true);
      
      // Critical structural elements should be preserved
      const structuralChanges = diffResponse.body.changes.filter((change: any) => 
        change.sourceElementPath.includes('/Manual/Chapters/Chapter') ||
        change.sourceElementPath.includes('/Manual/Chapters/Chapter/Sections/Section')
      );
      expect(structuralChanges.length).toBeLessThan(3);
    });

    it('should preserve XSD compliance through round-trip', async () => {
      // Import with XSD validation
      const importResponse = await request(app.getHttpServer())
        .post('/xml/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'xsd-roundtrip-test.xml',
          xmlContent: sampleXmlContent,
          xsdSchemaContent: sampleXsdSchema,
          organizationId,
          importOptions: {
            createNewManual: false,
            overwriteExistingBlocks: false,
            validateAgainstXsd: true,
            generateDefaultMappings: true,
          },
        })
        .expect(201);

      expect(importResponse.body.status).toBe('VALIDATION_SUCCESS');
      expect(importResponse.body.validationErrors).toEqual([]);

      // Export and validate against same XSD
      const exportResponse = await request(app.getHttpServer())
        .post('/xml/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          manualId,
          formatOptions: {
            indented: false, // Test with non-indented format
            includeMetadata: true,
            includeComments: false,
            collapseEmptyElements: true,
          },
        })
        .expect(201);

      expect(exportResponse.body.validationStatus).toBe('VALID');
      
      // Verify exported XML can be re-imported successfully
      const reimportResponse = await request(app.getHttpServer())
        .post('/xml/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: 'reimported-export.xml',
          xmlContent: exportResponse.body.xmlContent,
          xsdSchemaContent: sampleXsdSchema,
          organizationId,
          importOptions: {
            createNewManual: false,
            overwriteExistingBlocks: false,
            validateAgainstXsd: true,
            generateDefaultMappings: false,
          },
        })
        .expect(201);

      expect(reimportResponse.body.status).toBe('VALIDATION_SUCCESS');
      expect(reimportResponse.body.validationErrors).toEqual([]);
    });
  });
});






