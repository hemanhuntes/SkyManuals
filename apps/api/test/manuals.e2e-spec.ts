import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Manuals Controller (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    // Clean up database for each test
    await prisma.change.deleteMany({});
    await prisma.version.deleteMany({});
    await prisma.changeSet.deleteMany({});
    await prisma.block.deleteMany({});
    await prisma.section.deleteMany({});
    await prisma.chapter.deleteMany({});
    await prisma.manual.deleteMany({});
    await prisma.membership.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.organization.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Manual CRUD Operations', () => {
    it('should create a manual', async () => {
      // Create organization and user for test
      const organization = await prisma.organization.create({
        data: {
          name: 'Test Org',
          slug: 'test-org',
        },
      });

      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/manuals')
        .set('x-user-id', user.id)
        .send({
          title: 'Test Manual',
          organizationId: organization.id,
        })
        .expect(201);

      expect(response.body.manual).toBeDefined();
      expect(response.body.manual.title).toBe('Test Manual');
      expect(response.body.changeSet).toBeDefined();
      expect(response.body.etag).toBeDefined();

      // Verify in database
      const createdManual = await prisma.manual.findUnique({
        where: { id: response.body.manual.id },
      });
      expect(createdManual).toBeTruthy();
      expect(createdManual.title).toBe('Test Manual');
    });

    it('should get a manual', async () => {
      // Create test data
      const organization = await prisma.organization.create({
        data: {
          name: 'Test Org',
          slug: 'test-org',
        },
      });

      const manual = await prisma.manual.create({
        data: {
          organizationId: organization.id,
          title: 'Test Manual',
          status: 'DRAFT',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/manuals/${manual.id}`)
        .expect(200);

      expect(response.body.manual.id).toBe(manual.id);
      expect(response.body.manual.title).toBe('Test Manual');
      expect(response.body.etag).toBeDefined();
    });

    it('should update a manual', async () => {
      // Create test data
      const organization = await prisma.organization.create({
        data: {
          name: 'Test Org',
          slug: 'test-org',
        },
      });

      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });

      const manual = await prisma.manual.create({
        data: {
          organizationId: organization.id,
          title: 'Original Manual',
          status: 'DRAFT',
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/manuals/${manual.id}`)
        .set('x-user-id', user.id)
        .send({
          title: 'Updated Manual',
        })
        .expect(200);

      expect(response.body.manual.title).toBe('Updated Manual');
      expect(response.body.changeSet).toBeDefined();
    });

    it('should return 404 for non-existent manual', async () => {
      await request(app.getHttpServer())
        .get('/api/manuals/non-existent-id')
        .expect(404);
    });
  });

  describe('Chapter Operations', () => {
    it('should create a chapter', async () => {
      // Create test data
      const organization = await prisma.organization.create({
        data: {
          name: 'Test Org',
          slug: 'test-org',
        },
      });

      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });

      const manual = await prisma.manual.create({
        data: {
          organizationId: organization.id,
          title: 'Test Manual',
          status: 'DRAFT',
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/manuals/${manual.id}/chapters`)
        .set('x-user-id', user.id)
        .send({
          title: 'Chapter 1',
          number: '1.0',
        })
        .expect(201);

      expect(response.body.chapter.title).toBe('Chapter 1');
      expect(response.body.chapter.number).toBe('1.0');
      expect(response.body.changeSet).toBeDefined();
    });
  });

  describe('Section Operations', () => {
    it('should create a section', async () => {
      // Create test data
      const organization = await prisma.organization.create({
        data: {
          name: 'Test Org',
          slug: 'test-org',
        },
      });

      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });

      const manual = await prisma.manual.create({
        data: {
          organizationId: organization.id,
          title: 'Test Manual',
          status: 'DRAFT',
        },
      });

      const chapter = await prisma.chapter.create({
        data: {
          manualId: manual.id,
          title: 'Chapter 1',
          number: '1.0',
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/manuals/${manual.id}/chapters/${chapter.id}/sections`)
        .set('x-user-id', user.id)
        .send({
          title: 'Section 1.1',
          number: '1.1',
        })
        .expect(201);

      expect(response.body.section.title).toBe('Section 1.1');
      expect(response.body.section.number).toBe('1.1');
      expect(response.body.changeSet).toBeDefined();
    });
  });

  describe('Block Content Operations', () => {
    it('should update block content', async () => {
      // Create test data
      const organization = await prisma.organization.create({
        data: {
          name: 'Test Org',
          slug: 'test-org',
        },
      });

      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });

      const manual = await prisma.manual.create({
        data: {
          organizationId: organization.id,
          title: 'Test Manual',
          status: 'DRAFT',
        },
      });

      const chapter = await prisma.chapter.create({
        data: {
          manualId: manual.id,
          title: 'Chapter 1',
          number: '1.0',
        },
      });

      const section = await prisma.section.create({
        data: {
          chapterId: chapter.id,
          title: 'Section 1.1',
          number: '1.1',
        },
      });

      const block = await prisma.block.create({
        data: {
          sectionId: section.id,
          content: { type: 'doc', content: [] },
          attachments: [],
        },
      });

      const newContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Updated content' }],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .patch(`/api/manuals/blocks/${block.id}/content`)
        .set('x-user-id', user.id)
        .send({ content: newContent })
        .expect(200);

      expect(response.body.block).toBeDefined();
      expect(response.body.changeSet).toBeDefined();
      expect(response.body.version).toBeDefined();
      expect(response.body.etag).toBeDefined();
    });
  });

  describe('Smart Block Operations', () => {
    it('should insert a smart block', async () => {
      // Create test data
      const organization = await prisma.organization.create({
        data: {
          name: 'Test Org',
          slug: 'test-org',
        },
      });

      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });

      const manual = await prisma.manual.create({
        data: {
          organizationId: organization.id,
          title: 'Test Manual',
          status: 'DRAFT',
        },
      });

      const chapter = await prisma.chapter.create({
        data: {
          manualId: manual.id,
          title: 'Chapter 1',
          number: '1.0',
        },
      });

      const section = await prisma.section.create({
        data: {
          chapterId: chapter.id,
          title: 'Section 1.1',
          number: '1.1',
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/manuals/sections/${section.id}/blocks/smart`)
        .set('x-user-id', user.id)
        .send({
          smartBlockType: 'LEP',
          position: 0,
        })
        .expect(201);

      expect(response.body.block).toBeDefined();
      expect(response.body.block.smartBlockType).toBe('LEP');
      expect(response.body.changeSet).toBeDefined();
    });
  });

  describe('ChangeSet Operations', () => {
    it('should approve a change set', async () => {
      // Create test data with change set
      const organization = await prisma.organization.create({
        data: {
          name: 'Test Org',
          slug: 'test-org',
        },
      });

      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });

      const manual = await prisma.manual.create({
        data: {
          organizationId: organization.id,
          title: 'Test Manual',
          status: 'DRAFT',
        },
      });

      const changeSet = await prisma.changeSet.create({
        data: {
          manualId: manual.id,
          title: 'Test Change',
          authorId: user.id,
          status: 'PENDING',
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/manuals/changesets/${changeSet.id}/approve`)
        .expect(200);

      expect(response.body.status).toBe('APPROVED');
    });
  });

  describe('Export Operations', () => {
    it('should export manual as HTML', async () => {
      // Create test data
      const organization = await prisma.organization.create({
        data: {
          name: 'Test Org',
          slug: 'test-org',
        },
      });

      const manual = await prisma.manual.create({
        data: {
          organizationId: organization.id,
          title: 'Test Manual',
          status: 'DRAFT',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/manuals/${manual.id}/export/html`)
        .expect(200);

      expect(response.text).toContain('Test Manual');
      expect(response.text).toContain('<html>');
    });

    it('should export manual as PDF', async () => {
      // Create test data
      const organization = await prisma.organization.create({
        data: {
          name: 'Test Org',
          slug: 'test-org',
        },
      });

      const manual = await prisma.manual.create({
        data: {
          organizationId: organization.id,
          title: 'Test Manual',
          status: 'DRAFT',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/manuals/${manual.id}/export/pdf`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });
});






