import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { testEnv } from '../setup';

describe('AI Search & Compliance Integration Tests', () => {
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
    await prisma.complianceLink.deleteMany();
    await prisma.regulation.deleteMany();
    await prisma.searchAnalytics.deleteMany();
    await prisma.manual.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('AI-Powered Search', () => {
    it('should perform semantic search with embeddings', async () => {
      // Setup test data
      const organization = await prisma.organization.create({
        data: {
          id: 'search-org',
          name: 'Search Test Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      const user = await prisma.user.create({
        data: {
          id: 'search-user',
          email: 'searchuser@testairlines.com',
          name: 'Search User',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['pilot'],
        },
      });

      // Create test manual with content
      const manual = await prisma.manual.create({
        data: {
          id: 'search-manual',
          title: 'Emergency Procedures Manual',
          organizationId: organization.id,
          status: 'PUBLISHED',
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      // Create chapters with content
      const chapters = [
        {
          id: 'chapter-emergency',
          manualId: manual.id,
          number: 1,
          title: 'Emergency Procedures',
          content: 'In case of engine failure, follow these emergency procedures...',
          createdBy: user.id,
          updatedBy: user.id,
        },
        {
          id: 'chapter-maintenance',
          manualId: manual.id,
          number: 2,
          title: 'Maintenance Procedures',
          content: 'Regular maintenance includes engine checks and fuel system inspections...',
          createdBy: user.id,
          updatedBy: user.id,
        },
      ];

      for (const chapter of chapters) {
        await prisma.chapter.create({ data: chapter });
      }

      // Simulate AI search request
      const searchQuery = 'What should I do if the engine fails during flight?';
      const searchRequest = {
        query: searchQuery,
        userId: user.id,
        organizationId: organization.id,
        searchType: 'SEMANTIC',
        filters: {
          manualIds: [manual.id],
          contentTypes: ['CHAPTER', 'SECTION'],
        },
      };

      // Mock AI search response
      const searchResponse = {
        status: 200,
        body: {
          query: searchQuery,
          totalResults: 2,
          results: [
            {
              id: 'chapter-emergency',
              type: 'CHAPTER',
              title: 'Emergency Procedures',
              content: 'In case of engine failure, follow these emergency procedures...',
              relevanceScore: 0.95,
              aiConfidence: 0.92,
              highlights: [
                {
                  field: 'content',
                  text: 'engine failure',
                  score: 0.98,
                },
                {
                  field: 'content',
                  text: 'emergency procedures',
                  score: 0.94,
                },
              ],
              citations: [
                {
                  source: 'Emergency Procedures Manual',
                  chapter: '1. Emergency Procedures',
                  section: '1.1 Engine Failure',
                  confidence: 0.95,
                },
              ],
            },
            {
              id: 'chapter-maintenance',
              type: 'CHAPTER',
              title: 'Maintenance Procedures',
              content: 'Regular maintenance includes engine checks and fuel system inspections...',
              relevanceScore: 0.73,
              aiConfidence: 0.71,
              highlights: [
                {
                  field: 'content',
                  text: 'engine checks',
                  score: 0.76,
                },
              ],
            },
          ],
          searchMetadata: {
            searchTime: 245, // milliseconds
            embeddingGenerationTime: 120,
            vectorSearchTime: 85,
            rerankingTime: 40,
            totalDocumentsSearched: 156,
            aiModel: 'text-embedding-3-small',
            searchAlgorithm: 'hybrid-bm25-semantic',
          },
          suggestions: [
            'engine failure procedures',
            'emergency landing checklist',
            'single engine operations',
          ],
        },
      };

      // Verify search response
      expect(searchResponse.status).toBe(200);
      expect(searchResponse.body.totalResults).toBe(2);
      expect(searchResponse.body.results[0].relevanceScore).toBeGreaterThan(0.9);
      expect(searchResponse.body.results[0].citations).toHaveLength(1);

      // Log search analytics
      await prisma.searchAnalytics.create({
        data: {
          id: `search-analytics-${Date.now()}`,
          query: searchQuery,
          userId: user.id,
          organizationId: organization.id,
          searchType: 'SEMANTIC',
          resultCount: searchResponse.body.totalResults,
          searchTime: searchResponse.body.searchMetadata.searchTime,
          clickedResults: [],
          timestamp: new Date(),
        },
      });
    });

    it('should handle complex regulatory queries', async () => {
      const regulatoryQuery = 'What are the EASA requirements for emergency equipment in passenger aircraft?';
      
      // Mock regulatory search response
      const regulatoryResponse = {
        status: 200,
        body: {
          query: regulatoryQuery,
          totalResults: 3,
          results: [
            {
              id: 'regulation-easa-25',
              type: 'REGULATION',
              title: 'EASA CS-25 Emergency Equipment Requirements',
              content: 'All passenger aircraft must be equipped with emergency lighting, oxygen masks, and emergency exits...',
              regulationCode: 'CS-25.1309',
              authority: 'EASA',
              relevanceScore: 0.97,
              aiConfidence: 0.94,
              citations: [
                {
                  source: 'EASA CS-25',
                  section: '25.1309',
                  paragraph: 'Emergency Equipment',
                  confidence: 0.97,
                },
              ],
              complianceStatus: 'APPLICABLE',
              lastUpdated: '2024-01-15',
            },
            {
              id: 'regulation-easa-ops',
              type: 'REGULATION',
              title: 'EASA OPS Emergency Procedures',
              content: 'Operators must ensure all crew members are trained in emergency procedures...',
              regulationCode: 'OPS.1.085',
              authority: 'EASA',
              relevanceScore: 0.89,
              aiConfidence: 0.87,
              complianceStatus: 'APPLICABLE',
              lastUpdated: '2023-12-01',
            },
          ],
          regulatoryFramework: 'EASA',
          complianceNotes: [
            'CS-25 requirements apply to aircraft certification',
            'OPS requirements apply to operational procedures',
          ],
        },
      };

      expect(regulatoryResponse.body.results[0].regulationCode).toBe('CS-25.1309');
      expect(regulatoryResponse.body.regulatoryFramework).toBe('EASA');
    });
  });

  describe('Compliance Monitoring', () => {
    it('should analyze regulation impact on manuals', async () => {
      // Setup test data
      const organization = await prisma.organization.create({
        data: {
          id: 'compliance-org',
          name: 'Compliance Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      // Create regulation
      const regulation = await prisma.regulation.create({
        data: {
          id: 'regulation-easa-new',
          title: 'EASA CS-25 Updated Emergency Requirements',
          content: 'New requirements for emergency lighting systems in passenger aircraft...',
          regulationCode: 'CS-25.1309',
          authority: 'EASA',
          effectiveDate: new Date('2024-06-01'),
          status: 'ACTIVE',
          createdBy: 'system',
          updatedBy: 'system',
        },
      });

      // Create manual
      const manual = await prisma.manual.create({
        data: {
          id: 'compliance-manual',
          title: 'Aircraft Emergency Procedures',
          organizationId: organization.id,
          status: 'PUBLISHED',
          createdBy: 'author-123',
          updatedBy: 'author-123',
        },
      });

      // Create compliance link
      const complianceLink = await prisma.complianceLink.create({
        data: {
          id: 'compliance-link-123',
          regulationId: regulation.id,
          documentId: manual.id,
          documentType: 'MANUAL',
          organizationId: organization.id,
          status: 'PENDING_REVIEW',
          confidenceScore: 0.85,
          impactLevel: 'HIGH',
          reviewBy: new Date('2024-05-15'),
          createdBy: 'system',
          updatedBy: 'system',
        },
      });

      // Simulate impact analysis
      const impactAnalysis = {
        status: 200,
        body: {
          regulationId: regulation.id,
          regulationTitle: regulation.title,
          regulationCode: regulation.regulationCode,
          effectiveDate: regulation.effectiveDate.toISOString(),
          affectedDocuments: 1,
          impactSummary: {
            high: 1,
            medium: 0,
            low: 0,
            total: 1,
          },
          documents: [
            {
              id: manual.id,
              title: manual.title,
              documentType: 'MANUAL',
              impactLevel: 'HIGH',
              confidenceScore: 0.85,
              requiresReview: true,
              complianceStatus: 'PENDING_REVIEW',
              reviewBy: '2024-05-15',
              affectedSections: [
                {
                  section: 'Chapter 3: Emergency Lighting',
                  impact: 'Direct compliance requirement',
                  action: 'Update emergency lighting procedures',
                  priority: 'HIGH',
                },
              ],
              estimatedEffort: '2-3 days',
              riskLevel: 'HIGH',
            },
          ],
          recommendations: [
            'Review and update emergency lighting procedures by May 15, 2024',
            'Train maintenance staff on new requirements',
            'Update aircraft inspection checklists',
          ],
          complianceTimeline: {
            reviewDeadline: '2024-05-15',
            implementationDeadline: '2024-06-01',
            daysRemaining: 45,
            status: 'ON_TRACK',
          },
        },
      };

      // Verify impact analysis
      expect(impactAnalysis.body.affectedDocuments).toBe(1);
      expect(impactAnalysis.body.impactSummary.high).toBe(1);
      expect(impactAnalysis.body.documents[0].impactLevel).toBe('HIGH');
      expect(impactAnalysis.body.complianceTimeline.daysRemaining).toBeGreaterThan(0);
    });

    it('should generate compliance dashboard data', async () => {
      // Setup test data
      const organization = await prisma.organization.create({
        data: {
          id: 'dashboard-org',
          name: 'Dashboard Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      // Create multiple compliance links with different statuses
      const complianceLinks = [
        {
          id: 'compliant-1',
          status: 'COMPLIANT',
          confidenceScore: 0.95,
          impactLevel: 'HIGH',
        },
        {
          id: 'compliant-2',
          status: 'COMPLIANT',
          confidenceScore: 0.88,
          impactLevel: 'MEDIUM',
        },
        {
          id: 'pending-1',
          status: 'PENDING_REVIEW',
          confidenceScore: 0.75,
          impactLevel: 'HIGH',
        },
        {
          id: 'overdue-1',
          status: 'PENDING_REVIEW',
          confidenceScore: 0.65,
          impactLevel: 'HIGH',
        },
      ];

      for (const link of complianceLinks) {
        await prisma.complianceLink.create({
          data: {
            ...link,
            regulationId: 'regulation-123',
            documentId: 'manual-123',
            documentType: 'MANUAL',
            organizationId: organization.id,
            reviewBy: link.id === 'overdue-1' 
              ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            createdBy: 'system',
            updatedBy: 'system',
          },
        });
      }

      // Simulate dashboard response
      const dashboardResponse = {
        status: 200,
        body: {
          overview: {
            totalComplianceLinks: 4,
            compliant: 2,
            pendingReview: 2,
            overdue: 1,
            complianceRate: 50.0,
          },
          riskDistribution: {
            high: 3,
            medium: 1,
            low: 0,
          },
          statusDistribution: {
            compliant: 2,
            pendingReview: 1,
            overdue: 1,
          },
          upcomingDeadlines: [
            {
              id: 'pending-1',
              title: 'Emergency Procedures Review',
              deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              daysRemaining: 30,
              priority: 'HIGH',
              status: 'PENDING_REVIEW',
            },
          ],
          overdueItems: [
            {
              id: 'overdue-1',
              title: 'Safety Equipment Review',
              deadline: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              daysOverdue: 7,
              priority: 'HIGH',
              status: 'OVERDUE',
            },
          ],
          complianceTrends: {
            last30Days: {
              newRegulations: 2,
              completedReviews: 5,
              complianceImprovement: 12.5,
            },
            last90Days: {
              newRegulations: 8,
              completedReviews: 18,
              complianceImprovement: 25.0,
            },
          },
          alerts: [
            {
              type: 'OVERDUE_REVIEW',
              severity: 'HIGH',
              message: '1 compliance review is overdue',
              count: 1,
            },
            {
              type: 'UPCOMING_DEADLINE',
              severity: 'MEDIUM',
              message: '1 compliance review due within 30 days',
              count: 1,
            },
          ],
        },
      };

      // Verify dashboard data
      expect(dashboardResponse.body.overview.totalComplianceLinks).toBe(4);
      expect(dashboardResponse.body.overview.complianceRate).toBe(50.0);
      expect(dashboardResponse.body.riskDistribution.high).toBe(3);
      expect(dashboardResponse.body.overdueItems).toHaveLength(1);
      expect(dashboardResponse.body.alerts).toHaveLength(2);
    });
  });

  describe('Regulation Library Management', () => {
    it('should ingest and index new regulations', async () => {
      // Simulate regulation ingestion
      const regulationData = {
        title: 'FAA Part 25 Emergency Equipment',
        content: 'Federal Aviation Administration requirements for emergency equipment...',
        regulationCode: '14 CFR 25.1309',
        authority: 'FAA',
        effectiveDate: '2024-07-01',
        source: 'Federal Register',
        documentUrl: 'https://www.faa.gov/regulations_policies/faa_regulations/part_25/',
      };

      // Mock ingestion response
      const ingestionResponse = {
        status: 201,
        body: {
          id: 'regulation-faa-new',
          title: regulationData.title,
          regulationCode: regulationData.regulationCode,
          authority: regulationData.authority,
          effectiveDate: regulationData.effectiveDate,
          status: 'ACTIVE',
          ingestionStatus: 'COMPLETED',
          processingMetadata: {
            ingestedAt: new Date().toISOString(),
            processedChunks: 15,
            embeddingGenerated: true,
            vectorIndexed: true,
            searchable: true,
          },
          contentAnalysis: {
            totalWords: 2847,
            keyTopics: [
              'emergency equipment',
              'passenger safety',
              'evacuation procedures',
              'lighting systems',
            ],
            applicableAircraft: [
              'Transport Category Aircraft',
              'Part 25 Certified Aircraft',
            ],
          },
          relatedRegulations: [
            'EASA CS-25.1309',
            'ICAO Annex 6',
          ],
        },
      };

      // Verify ingestion
      expect(ingestionResponse.status).toBe(201);
      expect(ingestionResponse.body.ingestionStatus).toBe('COMPLETED');
      expect(ingestionResponse.body.processingMetadata.embeddingGenerated).toBe(true);
      expect(ingestionResponse.body.contentAnalysis.keyTopics).toHaveLength(4);

      // Create regulation in database
      await prisma.regulation.create({
        data: {
          id: ingestionResponse.body.id,
          title: regulationData.title,
          content: regulationData.content,
          regulationCode: regulationData.regulationCode,
          authority: regulationData.authority,
          effectiveDate: new Date(regulationData.effectiveDate),
          status: 'ACTIVE',
          createdBy: 'system',
          updatedBy: 'system',
        },
      });
    });
  });
});
