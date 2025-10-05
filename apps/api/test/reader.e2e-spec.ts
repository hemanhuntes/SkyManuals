import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReaderController,
} from '../reader/reader.controller';
import {
  ReaderService,
} from '../reader/reader.service';
import {
  SearchIndexService,
} from '../search-engine/search-index.service';
import {
  PublishPipelineService,
} from '../publish-pipeline/publish-pipeline.service';

describe('Reader (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let readerService: ReaderService;
  let publishPipeline: PublishPipelineService;

  // Test data
  let testOrganization: any;
  let testUser: any;
  let testManual: any;
  let testBundle: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    readerService = moduleFixture.get<ReaderService>(ReaderService);
    publishPipeline = moduleFixture.get<PublishPipelineService>(PublishPipelineService);
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
    // Clean up Epic-03 tables
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

    // Clean up Epic-01 & Epic-02 tables
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
        id: 'test-org-epic-03',
        name: 'Epic-03 Test Airlines',
        slug: 'epic-03-test-airlines',
        logoUrl: 'https://example.com/logo.png',
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        id: 'test-user-epic-03',
        email: 'reader@epic03test.com',
        firstName: 'Reader',
        lastName: 'Tester',
        organizationId: testOrganization.id,
      },
    });

    // Create test manual
    testManual = await prisma.manual.create({
      data: {
        id: 'test-manual-epic-03',
        title: 'Epic-03 Test Manual',
        organizationId: testOrganization.id,
        status: 'RELEASED',
      },
    });

    // Create test release snapshot
    const releaseSnapshot = await prisma.releaseSnapshot.create({
      data: {
        id: 'test-snapshot-epic-03',
        manualId: testManual.id,
        changeSetId: 'test-changeset-epic-03',
        version: '2.0.0',
        contentSnapshot: {
          chapters: [
            {
              id: 'test-chapter',
              title: 'Test Chapter',
              sections: [
                {
                  id: 'test-section',
                  title: 'Test Section',
                  blocks: [
                    {
                      id: 'test-block',
                      content: {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: 'This is test content for Epic-03 reader functionality.',
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    // Create test bundle
    testBundle = await prisma.readerBundle.create({
      data: {
        id: 'test-bundle-epic-03',
        manualId: testManual.id,
        releaseSnapshotId: releaseSnapshot.id,
        version: '2.0.0',
        bundleUrl: 'https://cdn.skymanuals.com/bundles/epic-03-test-bundle.json',
        bundleSize: 1024,
      },
    });

    // Create access permission for test user
    await prisma.accessPermission.create({
      data: {
        id: 'test-permission-epic-03',
        userId: testUser.id,
        manualId: testManual.id,
        bundleId: testBundle.id,
        permission: 'ANNOTATE',
        grantedBy: testUser.id,
      },
    });
  };

  // Manual Reader Tests
  describe('/manuals/:manualId (GET)', () => {
    it('should return manual reader data', async () => {
      return request(app.getHttpServer())
        .get('/manuals/test-manual-epic-03')
        .expect(200).expect((res) => {
          expect(res.body.bundle).toBeDefined();
          expect(res.body.bundle.manualId).toBe('test-manual-epic-03');
          expect(res.body.manual).toBeDefined();
          expect(res.body.manual.title).toBe('Epic-03 Test Manual');
          expect(res.body.userPermissions).toBeDefined();
          expect(res.body.userPermissions.canRead).toBe(true);
        });
    });

    it('should return manual reader data for specific version', async () => {
      return request(app.getHttpServer())
        .get('/manuals/test-manual-epic-03?v=2.0.0')
        .expect(200).expect((res) => {
          expect(res.body.bundle.version).toBe('2.0.0');
        });
    });

    it('should return 404 for non-existent manual', async () => {
      return request(app.getHttpServer())
        .get('/manuals/non-existent-manual')
        .expect(404);
    });
  });

  // Available Bundles Tests
  describe('/manuals/:manualId/bundles (GET)', () => {
    it('should return available bundles for manual', async () => {
      return request(app.getHttpServer())
        .get('/manuals/test-manual-epic-03/bundles')
        .expect(200).expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0].manualId).toBe('test-manual-epic-03');
          expect(res.body[0].version).toBe('2.0.0');
        });
    });
  });

  // Search Tests
  describe('/search (POST)', () => {
    it('should perform search across manuals', async () => {
      // Create search index first
      await prisma.searchIndex.create({
        data: {
          id: 'test-search-index-epic-03',
          manualId: testManual.id,
          bundleId: testBundle.id,
          searchableText: 'This is test content for Epic-03 reader functionality.',
          indexes: {
            keywords: ['test', 'content', 'epic-03', 'reader', 'functionality'],
            phrases: ['test content', 'reader functionality'],
            entities: ['Epic-03'],
            sections: [
              {
                chapterId: 'test-chapter',
                sectionId: 'test-section',
                blockId: 'test-block',
                text: 'This is test content for Epic-03 reader functionality.',
                position: 0,
              },
            ],
          },
        },
      });

      return request(app.getHttpServer())
        .post('/search')
        .send({
          query: 'test content',
          manualId: testManual.id,
          page: 1,
          limit: 10,
        })
        .expect(200).expect((res) => {
          expect(res.body.results).toBeDefined();
          expect(Array.isArray(res.body.results)).toBe(true);
          expect(res.body.totalResults).toBeGreaterThanOrEqual(0);
          expect(res.body.query).toBe('test content');
          expect(res.body.processingTimeMs).toBeDefined();
        });
    });

    it('should return empty results for no matches', async () => {
      return request(app.getHttpServer())
        .post('/search')
        .send({
          query: 'nonexistent-content',
          manualId: testManual.id,
          page: 1,
          limit: 10,
        })
        .expect(200).expect((res) => {
          expect(res.body.results).toBeDefined();
          expect(res.body.totalResults).toBe(0);
        });
    });
  });

  // Search Suggestions Tests
  describe('/search/suggestions (GET)', () => {
    it('should return search suggestions', async () => {
      return request(app.getHttpServer())
        .get('/search/suggestions?q=test')
        .expect(200).expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should limit suggestions to specific manual', async () => {
      return request(app.getHttpServer())
        .get(`/search/suggestions?q=test&manualId=${testManual.id}`)
        .expect(200).expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  // Annotations Tests
  describe('/manuals/:manualId/annotations (POST)', () => {
    it('should create annotation', async () => {
      return request(app.getHttpServer())
        .post('/manuals/test-manual-epic-03/annotations')
        .send({
          chapterId: 'test-chapter',
          sectionId: 'test-section',
          blockId: 'test-block',
          selector: '#test-block',
          type: 'NOTE',
          content: 'This is a test annotation.',
          color: '#ffeb3b',
          isPrivate: false,
        })
        .expect(201).expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.userId).toBe('test-user-epic-03');
          expect(res.body.type).toBe('NOTE');
          expect(res.body.content).toBe('This is a test annotation.');
        });
    });

    it('should create highlight annotation', async () => {
      return request(app.getHttpServer())
        .post('/manuals/test-manual-epic-03/annotations')
        .send({
          chapterId: 'test-chapter',
          sectionId: 'test-section',
          blockId: 'test-block',
          selector: '#test-block',
          type: 'HIGHLIGHT',
          content: 'Important text highlighted',
          color: '#ffff00',
          isPrivate: true,
        })
        .expect(201).expect((res) => {
          expect(res.body.type).toBe('HIGHLIGHT');
          expect(res.body.color).toBe('#ffff00');
          expect(res.body.isPrivate).toBe(true);
        });
    });
  });

  describe('/manuals/:manualId/annotations (GET)', () => {
    it('should retrieve annotations', async () => {
      // Create test annotation first
      await prisma.annotation.create({
        data: {
          id: 'test-annotation-epic-03',
          userId: testUser.id,
          manualId: testManual.id,
          bundleId: testBundle.id,
          chapterId: 'test-chapter',
          sectionId: 'test-section',
          blockId: 'test-block',
          selector: '#test-block',
          type: 'NOTE',
          content: 'Test annotation content',
          color: '#000000',
          isPrivate: false,
        },
      });

      return request(app.getHttpServer())
        .get('/manuals/test-manual-epic-03/annotations')
        .expect(200).expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0].content).toBe('Test annotation content');
        });
    });
  });

  // Suggest Edit Tests
  describe('/manuals/:manualId/suggest-edits (POST)', () => {
    it('should create suggest edit', async () => {
      return request(app.getHttpServer())
        .post('/manuals/test-manual-epic-03/suggest-edits')
        .send({
          chapterId: 'test-chapter',
          sectionId: 'test-section',
          blockId: 'test-block',
          selector: '#test-block',
          currentText: 'Original text',
          suggestedText: 'Improved text',
          reason: 'Better clarity and accuracy',
          priority: 'MEDIUM',
        })
        .expect(201).expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.currentText).toBe('Original text');
          expect(res.body.suggestedText).toBe('Improved text');
          expect(res.body.reason).toBe('Better clarity and accuracy');
          expect(res.body.priority).toBe('MEDIUM');
          expect(res.body.status).toBe('PENDING');
        });
    });
  });

  // Revision Bars Tests
  describe('/manuals/:manualId/revisions (GET)', () => {
    it('should return revision bars', async () => {
      // Create test revision bar
      await prisma.revisionBar.create({
        data: {
          id: 'test-revision-bar-epic-03',
          manualId: testManual.id,
          bundleId: testBundle.id,
          chapterId: 'test-chapter',
          sectionId: 'test-section',
          blockId: 'test-block',
          revisionType: 'NEW',
          newVersion: '2.0.0',
          description: 'Added new test section',
          authorName: 'Test Author',
          changedAt: new Date(),
        },
      });

      return request(app.getHttpServer())
        .get('/manuals/test-manual-epic-03/revisions')
        .expect(200).expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0].revisionType).toBe('NEW');
          expect(res.body[0].description).toBe('Added new test section');
        });
    });
  });

  // Reader Session Tests
  describe('/manuals/:manualId/session (POST)', () => {
    it('should create/update reading session', async () => {
      return request(app.getHttpServer())
        .post('/manuals/test-manual-epic-03/session')
        .send({
          blockId: 'test-block',
          chapterId: 'test-chapter',
          sectionId: 'test-section',
          readingProgress: 75,
          readingTimeSeconds: 300,
        })
        .expect(201).expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.readingProgress).toBe(75);
          expect(res.body.readingTimeSeconds).toBe(300);
          expect(res.body.currentChapterId).toBe('test-chapter');
        });
    });
  });

  describe('/manuals/:manualId/session (GET)', () => {
    it('should retrieve reading session', async () => {
      // Create test session first
      await prisma.readerSession.create({
        data: {
          id: 'test-session-epic-03',
          userId: testUser.id,
          manualId: testManual.id,
          bundleId: testBundle.id,
          currentChapterId: 'test-chapter',
          currentSectionId: 'test-section',
          readingProgress: 50,
          readingTimeSeconds: 180,
          bookmarks: [],
          annotations: [],
          notes: [],
        },
      });

      return request(app.getHttpServer())
        .get('/manuals/test-manual-epic-03/session')
        .expect(200).expect((res) => {
          expect(res.body.readingProgress).toBe(50);
          expect(res.body.readingTimeSeconds).toBe(180);
          expect(res.body.currentChapterId).toBe('test-chapter');
        });
    });
  });

  // Offline Capabilities Tests
  describe('/manuals/:manualId/offline (GET)', () => {
    it('should return offline capabilities', async () => {
      return request(app.getHttpServer())
        .get('/manuals/test-manual-epic-03/offline')
        .expect(200).expect((res) => {
          expect(res.body.bundleId).toBeDefined();
          expect(res.body.canCache).toBeDefined();
          expect(res.body.estimatedSizeMB).toBeDefined();
          expect(res.body.includesSearchIndex).toBe(true);
        });
    });
  });

  describe('/manuals/:manualId/cache (POST)', () => {
    it('should cache manual for offline access', async () => {
      return request(app.getHttpServer())
        .post('/manuals/test-manual-epic-03/cache')
        .expect(200).expect((res) => {
          expect(res.body.cacheId).toBeDefined();
          expect(res.body.cacheKey).toBeDefined();
          expect(res.body.cachedAt).toBeDefined();
          expect(res.body.expiresAt).toBeDefined();
        });
    });
  });

  // Analytics Tests
  describe('/manuals/:manualId/analytics (POST)', () => {
    it('should track reader analytics event', async () => {
      return request(app.getHttpServer())
        .post('/manuals/test-manual-epic-03/analytics')
        .send({
          event: 'SEARCH',
          metadata: {
            query: 'test search',
            resultCount: 5,
          },
          sessionId: 'test-session-id',
        })
        .expect(201);

      // Verify analytics record was created
      const analytics = await prisma.readerAnalytics.findFirst({
        where: {
          manualId: testManual.id,
          event: 'SEARCH',
        },
      });

      expect(analytics).toBeDefined();
      expect(analytics?.metadata).toBeDefined();
    });
  });

  // Permissions Tests
  describe('/manuals/:manualId/permissions (GET)', () => {
    it('should return user permissions', async () => {
      return request(app.getHttpServer())
        .get('/manuals/test-manual-epic-03/permissions')
        .expect(200).expect((res) => {
          expect(res.body.canRead).toBeDefined();
          expect(res.body.canAnnotate).toBeDefined();
          expect(res.body.canSuggestEdit).toBeDefined();
          expect(res.body.canDownloadOffline).toBeDefined();
        });
    });
  });

  // Integration Tests
  describe('Reader workflow integration', () => {
    it('should support complete reader workflow', async () => {
      // 1. Load manual
      await request(app.getHttpServer())
        .get('/manuals/test-manual-epic-03')
        .expect(200);

      // 2. Search for content
      await request(app.getHttpServer())
        .post('/search')
        .send({
          query: 'test',
          manualId: testManual.id,
        })
        .expect(200);

      // 3. Create annotation
      const annotationResponse = await request(app.getHttpServer())
        .post('/manuals/test-manual-epic-03/annotations')
        .send({
          chapterId: 'test-chapter',
          sectionId: 'test-section',
          blockId: 'test-block',
          selector: '#test-block',
          type: 'HIGHLIGHT',
          content: 'Important test content',
        })
        .expect(201);

      // 4. Suggest edit
      await request(app.getHttpServer())
        .post('/manuals/test-manual-epic-03/suggest-edits')
        .send({
          chapterId: 'test-chapter',
          sectionId: 'test-section',
          blockId: 'test-block',
          selector: '#test-block',
          currentText: 'Original',
          suggestedText: 'Improved',
          reason: 'Better clarity',
        })
        .expect(201);

      // 5. Track analytics
      await request(app.getHttpServer())
        .post('/manuals/test-manual-epic-03/analytics')
        .send({
          event: 'ANNOTATE',
          metadata: {
            annotationId: annotationResponse.body.id,
          },
        })
        .expect(201);

      // 6. Cache for offline
      await request(app.getHttpServer())
        .post('/manuals/test-manual-epic-03/cache')
        .expect(200);

      console.log('✅ Complete reader workflow test passed');
    });
  });
});






