import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  ComplianceController,
} from '../compliance/compliance.controller';
import {
  RegulationLibraryService,
} from '../compliance/regulation-library.service';
import {
  ComplianceLinkService,
} from '../compliance/compliance-link.service';
import {
  ImpactAnalysisService,
} from '../compliance/impact-analysis.service';

describe('Compliance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let regulationLibraryService: RegulationLibraryService;
  let complianceLinkService: ComplianceLinkService;
  let impactAnalysisService: ImpactAnalysisService;

  // Test data
  let testOrganization: any;
  let testUser: any;
  let testManual: any;
  let testChapter: any;
  let testSection: any;
  let testBlock: any;
  let testRegulationLibrary: any;
  let testRegulationItem: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    regulationLibraryService = moduleFixture.get<RegulationLibraryService>(RegulationLibraryService);
    complianceLinkService = moduleFixture.get<ComplianceLinkService>(ComplianceLinkService);
    impactAnalysisService = moduleFixture.get<ImpactAnalysisService>(ImpactAnalysisService);
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
        id: 'test-org-epic-04',
        name: 'Epic-04 Test Airlines',
        slug: 'epic-04-test-airlines',
        logoUrl: 'https://example.com/logo.png',
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        id: 'test-user-epic-04',
        email: 'compliance@epic04test.com',
        firstName: 'Compliance',
        lastName: 'Tester',
        organizationId: testOrganization.id,
      },
    });

    // Create test manual
    testManual = await prisma.manual.create({
      data: {
        id: 'test-manual-epic-04',
        title: 'Epic-04 Test Manual',
        organizationId: testOrganization.id,
        status: 'RELEASED',
      },
    });

    // Create test chapter
    testChapter = await prisma.chapter.create({
      data: {
        id: 'test-chapter-epic-04',
        manualId: testManual.id,
        title: 'Epic-04 Test Chapter',
        number: '01',
        status: 'RELEASED',
      },
    });

    // Create test section
    testSection = await prisma.section.create({
      data: {
        id: 'test-section-epic-04',
        chapterId: testChapter.id,
        title: 'Epic-04 Test Section',
        number: '01-01',
        status: 'RELEASED',
      },
    });

    // Create test block
    testBlock = await prisma.block.create({
      data: {
        id: 'test-block-epic-04',
        sectionId: testSection.id,
        content: {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'This is test content for Epic-04 compliance functionality with maintenance procedures.',
            },
          ],
        },
      },
    });

    // Create test regulation library
    testRegulationLibrary = await prisma.regulationLibrary.create({
      data: {
        id: 'test-regulation-library-epic-04',
        source: 'EASA',
        region: 'EU',
        title: 'EASA Part-ML Testing',
        description: 'Test regulation library for Epic-04',
        version: '2024.01',
        effectiveDate: new Date(),
        metadata: { testCase: 'epic-04' },
      },
    });

    // Create test regulation item
    testRegulationItem = await prisma.regulationItem.create({
      data: {
        id: 'test-regulation-item-epic-04',
        regulationLibraryId: testRegulationLibrary.id,
        regulationType: 'ARTICLE',
        reference: 'MLR.001',
        title: 'Aircraft Maintenance Requirements',
        content: 'All aircraft maintenance must comply with applicable regulatory requirements.',
        category: 'MAINTENANCE',
        priority: 'CRITICAL',
        applicability: {
          aircraftTypes: ['Commercial'],
          operators: ['All'],
        },
        relatedRegulations: [],
        metadata: { testCase: 'epic-04' },
      },
    });
  };

  // Regulation Library Tests
  describe('/regulation-libraries (GET)', () => {
    it('should return all regulation libraries', async () => {
      return request(app.getHttpServer())
        .get('/regulation-libraries')
        .expect(200).expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0].source).toBeDefined();
          expect(res.body[0].region).toBeDefined();
          expect(res.body[0].title).toBeDefined();
          expect(res.body[0].version).toBeDefined();
        });
    });
  });

  describe('/regulation-libraries (POST)', () => {
    it('should create a new regulation library', async () => {
      const libraryData = {
        source: 'ICAO',
        region: 'GLOBAL',
        title: 'ICAO Annex Testing',
        description: 'Test regulation library',
        version: '2024.01',
        effectiveDate: new Date().toISOString(),
        url: 'https://example.com/test-regulations',
      };

      return request(app.getHttpServer())
        .post('/regulation-libraries')
        .send(libraryData)
        .expect(201).expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.source).toBe('ICAO');
          expect(res.body.region).toBe('GLOBAL');
          expect(res.body.title).toBe('ICAO Annex Testing');
          expect(res.body.version).toBe('2024.01');
        });
    });
  });

  describe('/regulation-libraries/:libraryId/items (GET)', () => {
    it('should return regulation items for a library', async () => {
      return request(app.getHttpServer())
        .get(`/regulation-libraries/${testRegulationLibrary.id}/items`)
        .expect(200).expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0].reference).toBe('MLR.001');
          expect(res.body[0].title).toBe('Aircraft Maintenance Requirements');
        });
    });

    it('should filter regulation items by category', async () => {
      return request(app.getHttpServer())
        .get(`/regulation-libraries/${testRegulationLibrary.id}/items?category=MAINTENANCE`)
        .expect(200).expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          res.body.forEach((item: any) => {
            expect(item.category).toBe('MAINTENANCE');
          });
        });
    });
  });

  // Compliance Link Tests
  describe('/manuals/:manualId/compliance-links (POST)', () => {
    it('should create a new compliance link', async () => {
      const linkData = {
        blockId: testBlock.id,
        regulationItemId: testRegulationItem.id,
        linkType: 'REQUIREMENT',
        relationship: 'COMPLIES_WITH',
        confidence: 85,
        notes: 'Test compliance link',
        evidence: ['https://example.com/evidence'],
      };

      return request(app.getHttpServer())
        .post(`/manuals/${testManual.id}/compliance-links`)
        .send(linkData)
        .expect(201).expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.manualId).toBe(testManual.id);
          expect(res.body.regulationItemId).toBe(testRegulationItem.id);
          expect(res.body.linkType).toBe('REQUIREMENT');
          expect(res.body.confidence).toBe(85);
          expect(res.body.status).toBe('DRAFT');
        });
    });

    it('should reject duplicate compliance links', async () => {
      const linkData = {
        blockId: testBlock.id,
        regulationItemId: testRegulationItem.id,
        linkType: 'REQUIREMENT',
        relationship: 'COMPLIES_WITH',
        confidence: 90,
      };

      // Create first link
      await request(app.getHttpServer())
        .post(`/manuals/${testManual.id}/compliance-links`)
        .send(linkData)
        .expect(201);

      // Try to create duplicate
      await request(app.getHttpServer())
        .post(`/manuals/${testManual.id}/compliance-links`)
        .send(linkData)
        .expect(400);
    });
  });

  describe('/manuals/compliance-links (GET)', () => {
    it('should return compliance links with filters', async () => {
      // Create a test compliance link
      await prisma.complianceLink.create({
        data: {
          id: 'test-link-epic-04',
          manualId: testManual.id,
          chapterId: testChapter.id,
          sectionId: testSection.id,
          blockId: testBlock.id,
          regulationItemId: testRegulationItem.id,
          regulationLibraryId: testRegulationLibrary.id,
          linkType: 'DIRECT',
          relationship: 'IMPLEMENTS',
          confidence: 95,
          createdBy: testUser.id,
          status: 'ACTIVE',
        },
      });

      return request(app.getHttpServer())
        .get('/manuals/compliance-links')
        .query({ manualId: testManual.id })
        .expect(200).expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0].id).toBeDefined();
          expect(res.body[0].regulation.reference).toBe('MLR.001');
          expect(res.body[0].linkType).toBe('DIRECT');
        });
    });
  });

  describe('/blocks/:blockId/compliance-links (GET)', () => {
    it('should return compliance links for a specific block', async () => {
      return request(app.getHttpServer())
        .get(`/blocks/${testBlock.id}/compliance-links`)
        .expect(200).expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          if (res.body.length > 0) {
            expect(res.body[0].block.id).toBe(testBlock.id);
          }
        });
    });
  });

  describe('/blocks/:blockId/suggest-links (GET)', () => {
    it('should return suggested compliance links for a block', async () => {
      return request(app.getHttpServer())
        .get(`/blocks/${testBlock.id}/suggest-links`)
        .expect(200).expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          if (res.body.length > 0) {
            expect(res.body[0].regulationItem).toBeDefined();
            expect(res.body[0].matchReason).toBeDefined();
            expect(res.body[0].confidence).toBeDefined();
          }
        });
    });
  });

  describe('/compliance-links/:linkId/status (POST)', () => {
    it('should update compliance link status', async () => {
      // Create a test compliance link
      const complianceLink = await prisma.complianceLink.create({
        data: {
          id: 'test-status-link-epic-04',
          manualId: testManual.id,
          chapterId: testChapter.id,
          sectionId: testSection.id,
          blockId: testBlock.id,
          regulationItemId: testRegulationItem.id,
          regulationLibraryId: testRegulationLibrary.id,
          linkType: 'DIRECT',
          relationship: 'COMPLIES_WITH',
          confidence: 80,
          createdBy: testUser.id,
          status: 'DRAFT',
        },
      });

      return request(app.getHttpServer())
        .post(`/compliance-links/${complianceLink.id}/status`)
        .send({ status: 'ACTIVE', reviewedBy: testUser.id })
        .expect(200).expect((res) => {
          expect(res.body.status).toBe('ACTIVE');
          expect(res.body.reviewedBy).toBe(testUser.id);
          expect(res.body.reviewedAt).toBeDefined();
        });
    });
  });

  // Impact Analysis Tests
  describe('/impact-analyses (POST)', () => {
    it('should create a new impact analysis', async () => {
      const analysisRequest = {
        regulationLibraryId: testRegulationLibrary.id,
        newVersion: '2024.02',
        analysisScope: {
          manualIds: [testManual.id],
          organizationIds: [testOrganization.id],
        },
      };

      return request(app.getHttpServer())
        .post('/impact-analyses')
        .send(analysisRequest)
        .expect(201).expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.regulationLibraryId).toBe(testRegulationLibrary.id);
          expect(res.body.newVersion).toBe('2024.02');
          expect(res.body.status).toBe('PENDING');
        });
    });
  });

  describe('/impact-analyses/:analysisId (GET)', () => {
    it('should return impact analysis by ID', async () => {
      // Create a test impact analysis
      const impactAnalysis = await prisma.impactAnalysis.create({
        data: {
          id: 'test-analysis-epic-04',
          triggerType: 'REGULATION_UPDATE',
          regulationLibraryId: testRegulationLibrary.id,
          oldVersion: '2024.01',
          newVersion: '2024.02',
          analysisScope: {
            organizationIds: [testOrganization.id],
            manualIds: [testManual.id],
            regulationItemIds: [testRegulationItem.id],
          },
          status: 'COMPLETED',
          results: {
            affectedParagraphs: 25,
            newRequirements: 3,
            modifiedRequirements: 5,
            obsoleteRequirements: 1,
            conflictCount: 2,
            riskAssessment: {
              highRisk: 1,
              mediumRisk: 1,
              lowRisk: 0,
            },
            estimatedEffort: {
              hours: 40,
              resources: ['Compliance Team'],
              timeline: '2 weeks',
            },
          },
          recommendations: [
            {
              priority: 'HIGH',
              action: 'Review affected compliance links',
              responsible: 'Compliance Manager',
              deadline: '2024-03-01',
              estimatedEffort: '8 hours',
            },
          ],
        },
      });

      return request(app.getHttpServer())
        .get(`/impact-analyses/${impactAnalysis.id}`)
        .expect(200).expect((res) => {
          expect(res.body.id).toBe(impactAnalysis.id);
          expect(res.body.triggerType).toBe('REGULATION_UPDATE');
          expect(res.body.status).toBe('COMPLETED');
          expect(res.body.results).toBeDefined();
          expect(res.body.recommendations).toBeDefined();
        });
    });
  });

  describe('/impact-analyses (GET)', () => {
    it('should return recent impact analyses', async () => {
      return request(app.getHttpServer())
        .get('/impact-analyses')
        .expect(200).expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should limit results when limit parameter provided', async () => {
      return request(app.getHttpServer())
        .get('/impact-analises?limit=5')
        .expect(200).expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeLessThanOrEqual(5);
        });
    });
  });

  describe('/impact-analyses/:analysisId/acknowledge (POST)', () => {
    it('should review impact analysis', async () => {
      // Create a test impact analysis
      const impactAnalysis = await prisma.impactAnalysis.create({
        data: {
          id: 'test-review-analysis-epic-04',
          triggerType: 'REGULATION_UPDATE',
          regulationLibraryId: testRegulationLibrary.id,
          newVersion: '2024.02',
          analysisScope: {
            organizationIds: [testOrganization.id],
            manualIds: [testManual.id],
            regulationItemIds: [testRegulationItem.id],
          },
          status: 'COMPLETED',
        },
      });

      return request(app.getHttpServer())
        .post(`/impact-analyses/${impactAnalysis.id}/acknowledge`)
        .expect(200).expect((res) => {
          expect(res.body.reviewedBy).toBe(testUser.id);
          expect(res.body.reviewedAt).toBeDefined();
          expect(res.body.status).toBe('REQUIRES_REVIEW');
        });
    });
  });

  // Coverage Report Tests
  describe('/manuals/:manualId/coverage-report (GET)', () => {
    it('should return coverage report for manual', async () => {
      // Create test compliance links
      await prisma.complianceLink.createMany({
        data: [
          {
            id: 'test-coverage-link-1',
            manualId: testManual.id,
            chapterId: testChapter.id,
            sectionId: testSection.id,
            blockId: testBlock.id,
            regulationItemId: testRegulationItem.id,
            regulationLibraryId: testRegulationLibrary.id,
            linkType: 'DIRECT',
            relationship: 'IMPLEMENTS',
            confidence: 90,
            createdBy: testUser.id,
            status: 'ACTIVE',
          },
          {
            id: 'test-coverage-link-2',
            manualId: testManual.id,
            chapterId: testChapter.id,
            sectionId: testSection.id,
            blockId: 'test-block-epic-04-2',
            regulationItemId: testRegulationItem.id,
            regulationLibraryId: testRegulationLibrary.id,
            linkType: 'REFERENCE',
            relationship: 'COMPLIANCE',
            confidence: 75,
            createdBy: testUser.id,
            status: 'ACTIVE',
          },
        ],
      });

      return request(app.getHttpServer())
        .get(`/manuals/${testManual.id}/coverage-report`)
        .expect(200).expect((res) => {
          expect(res.body.manual).toBeDefined();
          expect(res.body.coverage).toBeDefined();
          expect(res.body.coverage.totalBlocks).toBeDefined();
          expect(res.body.coverage.linkedBlocks).toBeDefined();
          expect(res.body.coverage.globalCoveragePercentage).toBeDefined();
          expect(res.body.byLibrary).toBeDefined();
          expect(res.body.summary).toBeDefined();
        });
    });
  });

  // Dashboard Tests
  describe('/compliance/dashboard (GET)', () => {
    it('should return compliance dashboard data', async () => {
      return request(app.getHttpServer())
        .get('/compliance/dashboard')
        .expect(200).expect((res) => {
          expect(res.body.organizationId).toBeDefined();
          expect(res.body.lastUpdateDate).toBeDefined();
          expect(res.body.overview).toBeDefined();
          expect(res.body.alerts).toBeDefined();
          expect(res.body.upcomingDeadlines).toBeDefined();
          expect(res.body.recentActivities).toBeDefined();
          expect(res.body.trends).toBeDefined();
        });
    });
  });

  // Library Update Jobs Tests
  describe('/regulation-libraries/:libraryId/update (POST)', () => {
    it('should create library update job', async () => {
      const updateData = {
        updateType: 'MINOR',
        newVersion: '2024.02',
        description: 'Minor update for testing',
        effectiveDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        implementationDeadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      };

      return request(app.getHttpServer())
        .post(`/regulation-libraries/${testRegulationLibrary.id}/update`)
        .send(updateData)
        .expect(201).expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.regulationLibraryId).toBe(testRegulationLibrary.id);
          expect(res.body.updateType).toBe('MINOR');
          expect(res.body.newVersion).toBe('2024.02');
          expect(res.body.status).toBe('PENDING');
        });
    });
  });

  // Integration Tests
  describe('Complete compliance workflow', () => {
    it('should support complete compliance workflow', async () => {
      // 1. Create regulation library
      const libraryResponse = await request(app.getHttpServer())
        .post('/regulation-libraries')
        .send({
          source: 'EASA',
          region: 'EU',
          title: 'EASA Part-ML Integration Test',
          version: '2024.01',
          effectiveDate: new Date().toISOString(),
        })
        .expect(201);

      const libraryId = libraryResponse.body.id;

      // 2. Add regulation items
      await request(app.getHttpServer())
        .post(`/regulation-libraries/${libraryId}/items`)
        .send([
          {
            regulationType: 'ARTICLE',
            reference: 'MLR.INT.001',
            title: 'Integration Test Article',
            content: 'Test content for integration testing',
            category: 'MAINTENANCE',
            priority: 'HIGH',
          },
        ])
        .expect(201);

      // 3. Create compliance link
      const linkResponse = await request(app.getHttpServer())
        .post(`/manuals/${testManual.id}/compliance-links`)
        .send({
          blockId: testBlock.id,
          regulationItemId: testRegulationItem.id,
          linkType: 'REQUIREMENT',
          relationship: 'COMPLIES_WITH',
          confidence: 85,
        })
        .expect(201);

      // 4. Update library version
      await request(app.getHttpServer())
        .post(`/regulation-libraries/${libraryId}/update`)
        .send({
          updateType: 'MINOR',
          newVersion: '2024.02',
          description: 'Integration test update',
          effectiveDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);

      // 5. Run impact analysis
      const impactResponse = await request(app.getHttpServer())
        .post('/impact-analyses')
        .send({
          regulationLibraryId: libraryId,
          newVersion: '2024.02',
          analysisScope: {
            manualIds: [testManual.id],
          },
        })
        .expect(201);

      // 6. Get coverage report
      await request(app.getHttpServer())
        .get(`/manuals/${testManual.id}/coverage-report`)
        .expect(200);

      // 7. Get dashboard data
      await request(app.getHttpServer())
        .get('/compliance/dashboard')
        .expect(200);

      console.log('✅ Complete compliance workflow test passed');
    });
  });
});
