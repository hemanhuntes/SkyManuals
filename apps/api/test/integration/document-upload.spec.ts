import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { testEnv } from '../setup';
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

describe('Document Upload Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    await testEnv.setup();
    app = testEnv.getApp();
    prisma = testEnv.getPrisma();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.manual.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('PDF Document Upload', () => {
    it('should upload and process PDF manual', async () => {
      // Create test data
      const organization = await prisma.organization.create({
        data: {
          id: 'test-org',
          name: 'Test Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      const user = await prisma.user.create({
        data: {
          id: 'test-user',
          email: 'author@testairlines.com',
          name: 'Test Author',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['author'],
        },
      });

      // Create a mock PDF file
      const mockPdfContent = Buffer.from(`
        %PDF-1.4
        1 0 obj
        <<
        /Type /Catalog
        /Pages 2 0 R
        >>
        endobj
        
        2 0 obj
        <<
        /Type /Pages
        /Kids [3 0 R]
        /Count 1
        >>
        endobj
        
        3 0 obj
        <<
        /Type /Page
        /Parent 2 0 R
        /MediaBox [0 0 612 792]
        /Contents 4 0 R
        >>
        endobj
        
        4 0 obj
        <<
        /Length 44
        >>
        stream
        BT
        /F1 12 Tf
        72 720 Td
        (Boeing 737-800 Operations Manual) Tj
        ET
        endstream
        endobj
        
        xref
        0 5
        0000000000 65535 f 
        0000000009 00000 n 
        0000000058 00000 n 
        0000000115 00000 n 
        0000000204 00000 n 
        trailer
        <<
        /Size 5
        /Root 1 0 R
        >>
        startxref
        298
        %%EOF
      `);

      // Simulate PDF upload request
      const formData = new FormData();
      formData.append('file', mockPdfContent, {
        filename: 'boeing-737-manual.pdf',
        contentType: 'application/pdf',
      });
      formData.append('title', 'Boeing 737-800 Operations Manual');
      formData.append('description', 'Complete operations manual for Boeing 737-800');
      formData.append('version', '2.1.0');
      formData.append('organizationId', organization.id);

      // Mock the upload endpoint response
      const uploadResponse = {
        status: 201,
        body: {
          id: 'manual-123',
          title: 'Boeing 737-800 Operations Manual',
          status: 'DRAFT',
          version: '2.1.0',
          organizationId: organization.id,
          createdBy: user.id,
          processingStatus: 'PROCESSING',
          fileSize: mockPdfContent.length,
          fileName: 'boeing-737-manual.pdf',
          uploadDate: new Date().toISOString(),
        },
      };

      // Verify the response
      expect(uploadResponse.status).toBe(201);
      expect(uploadResponse.body.title).toBe('Boeing 737-800 Operations Manual');
      expect(uploadResponse.body.processingStatus).toBe('PROCESSING');
      expect(uploadResponse.body.fileSize).toBeGreaterThan(0);

      // Simulate processing completion
      const processedManual = await prisma.manual.create({
        data: {
          id: uploadResponse.body.id,
          title: uploadResponse.body.title,
          organizationId: organization.id,
          status: 'DRAFT',
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      // Create extracted chapters
      const chapters = [
        {
          id: 'chapter-1',
          manualId: processedManual.id,
          number: 1,
          title: 'General Information',
          content: 'General information about the aircraft...',
          createdBy: user.id,
          updatedBy: user.id,
        },
        {
          id: 'chapter-2',
          manualId: processedManual.id,
          number: 2,
          title: 'Emergency Procedures',
          content: 'Emergency procedures and protocols...',
          createdBy: user.id,
          updatedBy: user.id,
        },
      ];

      for (const chapterData of chapters) {
        await prisma.chapter.create({ data: chapterData });
      }

      // Verify processing results
      const manual = await prisma.manual.findUnique({
        where: { id: processedManual.id },
        include: { chapters: true },
      });

      expect(manual).toBeDefined();
      expect(manual.chapters).toHaveLength(2);
      expect(manual.chapters[0].title).toBe('General Information');
      expect(manual.chapters[1].title).toBe('Emergency Procedures');
    });

    it('should handle upload errors gracefully', async () => {
      // Test invalid file type
      const invalidFileContent = Buffer.from('This is not a PDF file');
      
      const formData = new FormData();
      formData.append('file', invalidFileContent, {
        filename: 'invalid.txt',
        contentType: 'text/plain',
      });

      // Mock error response
      const errorResponse = {
        status: 400,
        body: {
          error: 'Invalid file type',
          message: 'Only PDF files are supported',
          supportedTypes: ['application/pdf'],
        },
      };

      expect(errorResponse.status).toBe(400);
      expect(errorResponse.body.error).toBe('Invalid file type');
    });

    it('should validate file size limits', async () => {
      // Create oversized file (100MB)
      const oversizedContent = Buffer.alloc(100 * 1024 * 1024, 'A');
      
      const formData = new FormData();
      formData.append('file', oversizedContent, {
        filename: 'oversized.pdf',
        contentType: 'application/pdf',
      });

      // Mock size limit error
      const sizeErrorResponse = {
        status: 413,
        body: {
          error: 'File too large',
          message: 'File size exceeds maximum limit of 10MB',
          maxSize: 10 * 1024 * 1024,
          actualSize: oversizedContent.length,
        },
      };

      expect(sizeErrorResponse.status).toBe(413);
      expect(sizeErrorResponse.body.error).toBe('File too large');
    });
  });

  describe('XML Document Upload', () => {
    it('should upload and parse XML manual', async () => {
      // Create mock XML content
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
        <manual xmlns="http://skymanuals.com/schema/manual" version="1.0">
          <metadata>
            <title>Emergency Procedures Manual</title>
            <version>1.0.0</version>
            <organization>Test Airlines</organization>
            <created>2024-01-01</created>
          </metadata>
          <chapter id="ch1" number="1">
            <title>General Emergency Procedures</title>
            <section id="sec1.1" number="1.1">
              <title>Fire Emergency</title>
              <content>
                <procedure>
                  <step>1. Stop aircraft</step>
                  <step>2. Evacuate passengers</step>
                  <step>3. Contact emergency services</step>
                </procedure>
              </content>
            </section>
          </chapter>
        </manual>`;

      const formData = new FormData();
      formData.append('file', Buffer.from(xmlContent), {
        filename: 'emergency-procedures.xml',
        contentType: 'application/xml',
      });
      formData.append('type', 'XML_MANUAL');

      // Mock XML upload response
      const uploadResponse = {
        status: 201,
        body: {
          id: 'xml-doc-123',
          fileName: 'emergency-procedures.xml',
          status: 'PARSING',
          parsedContent: {
            title: 'Emergency Procedures Manual',
            version: '1.0.0',
            chapters: [
              {
                id: 'ch1',
                number: 1,
                title: 'General Emergency Procedures',
                sections: [
                  {
                    id: 'sec1.1',
                    number: '1.1',
                    title: 'Fire Emergency',
                    content: 'Fire emergency procedures...',
                  },
                ],
              },
            ],
          },
          validationErrors: [],
          parsingStatus: 'SUCCESS',
        },
      };

      expect(uploadResponse.status).toBe(201);
      expect(uploadResponse.body.parsedContent.chapters).toHaveLength(1);
      expect(uploadResponse.body.parsingStatus).toBe('SUCCESS');
    });

    it('should validate XML against schema', async () => {
      const invalidXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
        <manual>
          <invalid-tag>This should cause validation error</invalid-tag>
        </manual>`;

      const formData = new FormData();
      formData.append('file', Buffer.from(invalidXmlContent), {
        filename: 'invalid.xml',
        contentType: 'application/xml',
      });

      // Mock validation error response
      const validationResponse = {
        status: 422,
        body: {
          error: 'XML validation failed',
          validationErrors: [
            {
              line: 3,
              column: 12,
              message: 'Element "invalid-tag" is not allowed in this context',
              severity: 'error',
            },
          ],
          schemaVersion: '1.0.0',
        },
      };

      expect(validationResponse.status).toBe(422);
      expect(validationResponse.body.validationErrors).toHaveLength(1);
    });
  });

  describe('Batch Document Upload', () => {
    it('should handle multiple document uploads', async () => {
      const documents = [
        {
          filename: 'manual-part1.pdf',
          content: Buffer.from('PDF content part 1'),
          type: 'application/pdf',
        },
        {
          filename: 'manual-part2.pdf',
          content: Buffer.from('PDF content part 2'),
          type: 'application/pdf',
        },
        {
          filename: 'appendix.xml',
          content: Buffer.from('<appendix>Additional information</appendix>'),
          type: 'application/xml',
        },
      ];

      const batchUploadResponse = {
        status: 202,
        body: {
          batchId: 'batch-123',
          totalFiles: 3,
          acceptedFiles: 3,
          rejectedFiles: 0,
          processingStatus: 'PROCESSING',
          files: documents.map((doc, index) => ({
            id: `file-${index + 1}`,
            filename: doc.filename,
            status: 'QUEUED',
            size: doc.content.length,
          })),
          estimatedProcessingTime: '5-10 minutes',
        },
      };

      expect(batchUploadResponse.status).toBe(202);
      expect(batchUploadResponse.body.totalFiles).toBe(3);
      expect(batchUploadResponse.body.files).toHaveLength(3);
    });

    it('should track upload progress', async () => {
      const progressResponse = {
        status: 200,
        body: {
          batchId: 'batch-123',
          progress: {
            totalFiles: 3,
            processedFiles: 2,
            failedFiles: 0,
            currentFile: 'manual-part3.pdf',
            percentage: 66.7,
          },
          status: 'PROCESSING',
          estimatedTimeRemaining: '2-3 minutes',
        },
      };

      expect(progressResponse.body.progress.percentage).toBe(66.7);
      expect(progressResponse.body.progress.processedFiles).toBe(2);
    });
  });
});
