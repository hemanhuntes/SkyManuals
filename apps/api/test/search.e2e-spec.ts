import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { IndexingService } from '../search/indexing.service';
import { GuardrailsService } from '../search/guardrails.service';

describe('Search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let searchService: SearchService;
  let indexingService: IndexingService;
  let guardrailsService: GuardrailsService;

  // Test data
  let testOrganization: any;
  let testUser: any;
  let testManual: any;
  let testChapter: any;
  let testSection: any;
  let testBlocks: any[];
  let testReleaseSnapshot: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    searchService = moduleFixture.get<SearchService>(SearchService);
    indexingService = moduleFixture.get<IndexingService>(IndexingService);
    guardrailsService = moduleFixture.get<GuardrailsService>(GuardrailsService);
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupDatabase();
    await app.close();
  });

  const cleanupDatabase = async () => {
    // Clean up Epic-05 tables
    await prisma.searchAnalytics.deleteMany();
    await prisma.indexingJob.deleteMany();
    await prisma.searchIndex.deleteMany();
    
    // Clean up Epic-04 tables
    await prisma.complianceAnalytics.deleteMany();
    await prisma.libraryUpdateJob.deleteMany();
    await prisma.impactAnalysis.deleteMany();
    await prisma.coverageAnalysis.deleteMany();
    await prisma.auditChecklistItem.deleteMany();
    await prisma.auditChecklist.deleteMany();
    await prisma.complianceAlert.deleteMany();
    await prisma.complianceLink.deleteMany();
    await prisma.regulationItem.deleteMany();
    await prisma.regulationLibrary.deleteMany();

    // Clean up Epic-01, Epic-02, Epic-03 tables
    await prisma.readerAnalytics.deleteMany();
    await prisma.offlineCache.deleteMany();
    await prisma.operationallyCriticalFlag.deleteMany();
    await prisma.featureFlag.deleteMany();
    await prisma.revisionBar.deleteMany();
    await prisma.suggestEdit.deleteMany();
    await prisma.readerSession.deleteMany();
    await prisma.annotation.deleteMany();
    await prisma.searchIndex.deleteMany();
    await prisma.accessPermission.deleteMany();
    await prisma.readerBundle.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.checklist.deleteMany();
    await prisma.checklistTemplate.deleteMany();
    await prisma.workflowInstance.deleteMany();
    await prisma.workflowDefinition.deleteMany();
    await prisma.approvalTask.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.approvalSignature.deleteMany();
    await prisma.releaseSnapshot.deleteMany();
    await prisma.changeSet.deleteMany();
    await prisma.editorSession.deleteMany();
    await prisma.template.deleteMany();
    await prisma.attachment.deleteMany();
    await prisma.block.deleteMany();
    await prisma.section.deleteMany();
    await prisma.chapter.deleteMany();
    await prisma.manual.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  };

  const setupTestData = async () => {
    // Create test organization
    testOrganization = await prisma.organization.create({
      data: {
        id: 'test-org-epic-05',
        name: 'Epic-05 Test Airlines',
        slug: 'epic-05-test-airlines',
        logoUrl: 'https://example.com/logo.png',
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        id: 'test-user-epic-05',
        email: 'search@epic05test.com',
        firstName: 'Search',
        lastName: 'Tester',
        organizationId: testOrganization.id,
      },
    });

    // Create membership
    await prisma.membership.create({
      data: {
        userId: testUser.id,
        organizationId: testOrganization.id,
        role: 'EDITOR',
      },
    });

    // Create test manual
    testManual = await prisma.manual.create({
      data: {
        id: 'test-manual-epic-05',
        title: 'Epic-05 Test Manual',
        organizationId: testOrganization.id,
        status: 'RELEASED',
      },
    });

    // Create test chapter
    testChapter = await prisma.chapter.create({
      data: {
        id: 'test-chapter-epic-05',
        manualId: testManual.id,
        title: 'Epic-05 Test Chapter',
        number: '01',
      },
    });

    // Create test section
    testSection = await prisma.section.create({
      data: {
        id: 'test-section-epic-05',
        chapterId: testChapter.id,
        title: 'Epic-05 Test Section',
        number: '01-01',
        status: 'RELEASED',
      },
    });

    // Create test blocks
    testBlocks = await prisma.block.createMany({
      data: [
        {
          id: 'test-block-epic-05-1',
          sectionId: testSection.id,
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Aircraft safety procedures require pre-flight inspection of all systems including fuel, hydraulic, and electrical components.',
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'test-block-epic-05-2',
          sectionId: testSection.id,
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Maintenance schedules must follow manufacturer guidelines for engine overhauls and component replacements.',
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'test-block-epic-05-3',
          sectionId: testSection.id,
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Emergency procedures include fuel leak detection, electrical system failure response, and communication protocols.',
                  },
                ],
              },
            ],
          },
        },
      ],
    });

    // Create test release snapshot
    testReleaseSnapshot = await prisma.releaseSnapshot.create({
      data: {
        id: 'test-snapshot-epic-05',
        manualId: testManual.id,
        version: '1.0.0',
        contentHash: 'test-hash-epic-05',
        publishedAt: new Date(),
        publishedBy: testUser.id,
      },
    });
  };

  // Ask API Tests
  describe('/search/ask (POST)', () => {
    it('should answer questions about manual content', async () => {
      // First index the content
      await indexingService.indexReleaseSnapshot(testReleaseSnapshot.id);

      const query = {
        query: 'What safety procedures are required?',
        limit: 3,
      };

      return request(app.getHttpServer())
        .post('/search/ask')
        .send(query)
        .expect(200)
        .expect((res) => {
          expect(res.body.answer).toBeDefined();
          expect(res.body.citations).toBeDefined();
          expect(res.body.query).toBe(query.query);
          expect(res.body.totalResults).toBeGreaterThan(0);
          expect(res.body.searchTimeMs).toBeDefined();
          expect(res.body.searchTechniques).toContain('HYBRID');
        });
    });

    it('should filter results by organization', async () => {
      await indexingService.indexReleaseSnapshot(testReleaseSnapshot.id);

      const query = {
        query: 'safety procedures',
        filters: {
          organizationId: testOrganization.id,
        },
        limit: 5,
      };

      return request(app.getHttpServer())
        .post('/search/ask')
        .send(query)
        .expect(200)
        .expect((res) => {
          expect(res.body.citations).toBeDefined();
          expect(res.body.citations.length).toBeGreaterThan(0);
          // All citations should be from the filtered organization
          res.body.citations.forEach((citation: any) => {
            expect(citation.manualId).toBe(testManual.id);
          });
        });
    });

    it('should enforce query length limits', async () => {
      const shortQuery = { query: 'ab', limit: 5 };
      
      await request(app.getHttpServer())
        .post('/search/ask')
        .send(shortQuery)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('Query must be at least 3 characters');
        });
    });

    it('should enforce query content restrictions', async () => {
      const maliciousQuery = { 
        query: 'DROP TABLE users; SELECT * FROM passwords', 
        limit: 5 
      };
      
      await request(app.getHttpServer())
        .post('/search/ask')
        .send(maliciousQuery)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('potentially harmful');
        });
    });

    it('should enforce rate limiting', async () => {
      await indexingService.indexReleaseSnapshot(testReleaseSnapshot.id);

      const query = { query: 'safety procedures', limit: 3 };

      // Make multiple rapid requests
      const promises = Array.from({ length: 15 }, () => 
        request(app.getHttpServer())
          .post('/search/ask')
          .send(query)
      );

      const responses = await Promise.allSettled(promises);
      
      // Should have some rate-limited responses
      const rateLimited = responses.filter(result => 
        result.status === 'rejected' || 
        (result.status === 'fulfilled' && result.value.status === 429)
      );
      
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  // Indexing API Tests
  describe('/search/index/released (POST)', () => {
    it('should trigger indexing of released content', async () => {
      return request(app.getHttpServer())
        .post('/search/index/released')
        .expect(201)
        .expect((res) => {
          expect(res.body.jobId).toBeDefined();
        });
    });
  });

  describe('/search/index/recreate (POST)', () => {
    it('should recreate full search index', async () => {
      return request(app.getHttpServer())
        .post('/search/index/recreate')
        .expect(201)
        .expect((res) => {
          expect(res.body.jobId).toBeDefined();
        });
    });
  });

  describe('/search/jobs/:jobId (GET)', () => {
    it('should return indexing job status', async () => {
      // Create a job manually
      const job = await prisma.indexingJob.create({
        data: {
          type: 'INCREMENTAL',
          status: 'RUNNING',
          progress: {
            totalItems: 10,
            processedItems: 5,
            failedItems: 0,
            currentPhase: 'Indexing content',
          },
          triggeredBy: 'TEST',
          startedAt: new Date(),
        },
      });

      return request(app.getHttpServer())
        .get(`/search/jobs/${job.id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(job.id);
          expect(res.body.type).toBe('INCREMENTAL');
          expect(res.body.status).toBe('RUNNING');
          expect(res.body.progress.totalItems).toBe(10);
        });
    });
  });

  describe('/search/jobs (GET)', () => {
    it('should return recent indexing jobs', async () => {
      // Create some test jobs
      await prisma.indexingJob.createMany({
        data: [
          {
            type: 'INCREMENTAL',
            status: 'COMPLETED',
            progress: {
              totalItems: 5,
              processedItems: 5,
              failedItems: 0,
              currentPhase: 'Completed',
            },
            triggeredBy: 'TEST_1',
            startedAt: new Date(Date.now() - 1000),
            completedAt: new Date(),
          },
          {
            type: 'FULL_RECREATE',
            status: 'RUNNING',
            progress: {
              totalItems: 10,
              processedItems: 3,
              failedItems: 0,
              currentPhase: 'Indexing',
            },
            triggeredBy: 'TEST_2',
            startedAt: new Date(),
          },
        ],
      });

      return request(app.getHttpServer())
        .get('/search/jobs')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThanOrEqual(2);
          
          // Should be ordered by most recent first
          expect(res.body[0].triggeredBy).toBe('TEST_2');
        });
    });

    it('should respect limit parameter', async () => {
      return request(app.getHttpServer())
        .get('/search/jobs?limit=1')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeLessThanOrEqual(1);
        });
    });
  });

  // Guardrails Tests
  describe('Access Control', () => {
    it('should restrict draft content access based on user role', async () => {
      // Create a user with READER role
      const readerUser = await prisma.user.create({
        data: {
          id: 'test-reader-epic-05',
          email: 'reader@epic05test.com',
          firstName: 'Reader',
          lastName: 'User',
          organizationId: testOrganization.id,
        },
      });

      await prisma.membership.create({
        data: {
          userId: readerUser.id,
          organizationId: testOrganization.id,
          role: 'READER',
        },
      });

      // Test access control for READER
      const canAccessDrafts = await guardrailsService.canAccessDraftContent(
        readerUser.id,
        testOrganization.id
      );
      expect(canAccessDrafts).toBe(false);

      // Test access control for EDITOR
      const canEditDrafts = await guardrailsService.canAccessDraftContent(
        testUser.id,
        testOrganization.id
      );
      expect(canEditDrafts).toBe(true);
    });

    it('should validate search queries', async () => {
      // Valid query
      const validQuery = { query: 'aircraft safety', limit: 5 };
      const validation = guardrailsService.validateQuery(validQuery);
      expect(validation.valid).toBe(true);

      // Invalid queries
      const emptyQuery = { query: '', limit: 5 };
      const emptyValidation = guardrailsService.validateQuery(emptyQuery);
      expect(emptyValidation.valid).toBe(false);
      expect(emptyValidation.error).toContain('Query is required');

      const shortQuery = { query: 'ab', limit: 5 };
      const shortValidation = guardrailsService.validateQuery(shortQuery);
      expect(shortValidation.valid).toBe(false);
      expect(shortValidation.error).toContain('at least 3 characters');

      const longQuery = { query: 'a'.repeat(501), limit: 5 };
      const longValidation = guardrailsService.validateQuery(longQuery);
      expect(longValidation.valid).toBe(false);
      expect(longValidation.error).toContain('too long');
    });

    it('should apply rate limiting', async () => {
      const userId = testUser.id;
      const sessionId = 'test-session';

      // Check initial rate limit
      const initialCheck = await guardrailsService.checkRateLimit(userId, sessionId);
      expect(initialCheck.allowed).toBe(true);

      // Create multiple search analytics entries to simulate rate limiting
      await prisma.searchAnalytics.createMany({
        data: Array.from({ length: 15 }, (_, i) => ({
          query: `test query ${i}`,
          userId,
          sessionId,
          responseTimeMs: 100,
          resultCount: 3,
          resultScores: [0.8, 0.7, 0.6],
          timestamp: new Date(),
        })),
      });

      // Check rate limit after simulating many requests
      const rateLimitedCheck = await guardrailsService.checkRateLimit(userId, sessionId);
      expect(rateLimitedCheck.allowed).toBe(false);
      expect(rateLimitedCheck.resetTime).toBeDefined();
    });
  });

  // Integration Tests
  describe('Complete search workflow', () => {
    it('should support complete search workflow', async () => {
      // 1. Index manual content
      await indexingService.indexReleaseSnapshot(testReleaseSnapshot.id);

      // 2. Verify indexing worked
      const searchIndexes = await prisma.searchIndex.findMany({
        where: {
          manualId: testManual.id,
        },
      });
      expect(searchIndexes.length).toBeGreaterThan(0);

      // 3. Search for content
      const searchQuery = {
        query: 'aircraft maintenance procedures',
        filters: {
          manualId: testManual.id,
        },
        limit: 3,
      };

      const response = await request(app.getHttpServer())
        .post('/search/ask')
        .send(searchQuery)
        .expect(200);

      // 4. Verify answer contains relevant information
      expect(response.body.answer).toContain('maintenance');
      expect(response.body.citations.length).toBeGreaterThan(0);

      // 5. Check analytics were logged
      const analytics = await prisma.searchAnalytics.findFirst({
        query: searchQuery.query,
      });
      expect(analytics).toBeDefined();
      expect(analytics?.query).toBe(searchQuery.query);

      console.log('✅ Complete search workflow test passed');
    });
  });

  // Load Tests
  describe('Performance Tests', () => {
    it('should handle concurrent search requests', async () => {
      await indexingService.indexReleaseSnapshot(testReleaseSnapshot.id);

      const query = {
        query: 'safety procedures',
        filters: {
          manualId: testManual.id,
        },
        limit: 3,
      };

      // Simulate concurrent requests
      const startTime = Date.now();
      const promises = Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .post('/search/ask')
          .send(query)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();

      // All requests should succeed
      responses.forEach(res => {
        expect(res.status).toBe(200);
        expect(res.body.searchTimeMs).toBeDefined();
      });

      // Should complete within reasonable time
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(10000); // 10 seconds max

      console.log(`✅ Concurrent search test: ${responses.length} requests in ${totalTime}ms`);
    });

    it('should maintain response time under load', async () => {
        await indexingService.indexReleaseSnapshot(testReleaseSnapshot.id);

      const query = {
        query: 'maintenance overhead',
        limit: 5,
      };

      const responseTimes: number[] = [];
      const numRequests = 20;

      for (let i = 0; i < numRequests; i++) {
        const startTime = Date.now();
        const response = await request(app.getHttpServer())
          .post('/search/ask')
          .send(query)
          .expect(200);
        
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }

      // Calculate statistics
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      expect(avgResponseTime).toBeLessThan(2000); // Average < 2 seconds
      expect(maxResponseTime).toBeLessThan(5000); // Max < 5 seconds

      console.log(`✅ Load test: avg ${avgResponseTime.toFixed(0)}ms, max ${maxResponseTime}ms`);
    });
  });
});






