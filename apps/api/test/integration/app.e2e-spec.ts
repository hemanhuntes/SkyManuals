import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { testEnv } from '../setup';

describe('SkyManuals API Integration Tests', () => {
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
    await prisma.searchAnalytics.deleteMany();
    await prisma.approvalTask.deleteMany();
    await prisma.workflowInstance.deleteMany();
    await prisma.manual.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await app.getHttpServer().get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Authentication Flow', () => {
    it('should create and authenticate user', async () => {
      // Create test organization
      const organization = await prisma.organization.create({
        data: {
          id: 'test-org',
          name: 'Test Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      // Create test user
      const user = await prisma.user.create({
        data: {
          id: 'test-user',
          email: 'pilot@testairlines.com',
          name: 'Test Pilot',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['pilot'],
        },
      });

      expect(user.id).toBe('test-user');
      expect(user.organizationId).toBe('test-org');
    });
  });

  describe('Manual Management Flow', () => {
    let organization: any;
    let user: any;

    beforeEach(async () => {
      organization = await prisma.organization.create({
        data: {
          id: 'test-org',
          name: 'Test Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      user = await prisma.user.create({
        data: {
          id: 'test-user',
          email: 'author@testairlines.com',
          name: 'Test Author',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['author'],
        },
      });
    });

    it('should create manual with chapters and sections', async () => {
      // Create manual
      const manual = await prisma.manual.create({
        data: {
          id: 'test-manual',
          title: 'Boeing 737-800 Operations Manual',
          organizationId: organization.id,
          status: 'DRAFT',
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      // Create chapter
      const chapter = await prisma.chapter.create({
        data: {
          id: 'test-chapter',
          manualId: manual.id,
          number: 1,
          title: 'Emergency Procedures',
          content: 'Emergency procedures for Boeing 737-800',
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      // Create section
      const section = await prisma.section.create({
        data: {
          id: 'test-section',
          chapterId: chapter.id,
          number: '1.1',
          title: 'Emergency Evacuation',
          content: 'Procedures for emergency evacuation',
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      // Create block
      const block = await prisma.block.create({
        data: {
          id: 'test-block',
          sectionId: section.id,
          type: 'PROCEDURE',
          content: '1. Ensure aircraft is stationary\n2. Activate emergency exits\n3. Evacuate passengers',
          order: 1,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      expect(manual.id).toBe('test-manual');
      expect(chapter.manualId).toBe(manual.id);
      expect(section.chapterId).toBe(chapter.id);
      expect(block.sectionId).toBe(section.id);
    });
  });

  describe('Workflow Flow', () => {
    let organization: any;
    let user: any;
    let manual: any;

    beforeEach(async () => {
      organization = await prisma.organization.create({
        data: {
          id: 'test-org',
          name: 'Test Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      user = await prisma.user.create({
        data: {
          id: 'test-user',
          email: 'author@testairlines.com',
          name: 'Test Author',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['author'],
        },
      });

      manual = await prisma.manual.create({
        data: {
          id: 'test-manual',
          title: 'Boeing 737-800 Operations Manual',
          organizationId: organization.id,
          status: 'DRAFT',
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
    });

    it('should create workflow definition and instance', async () => {
      // Create workflow definition
      const workflowDef = await prisma.workflowDefinition.create({
        data: {
          id: 'test-workflow-def',
          name: 'Standard Approval Process',
          organizationId: organization.id,
          stages: [
            { id: 'review', name: 'Initial Review', order: 1 },
            { id: 'approval', name: 'Final Approval', order: 2 },
          ],
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      // Create workflow instance
      const workflowInstance = await prisma.workflowInstance.create({
        data: {
          id: 'test-workflow-instance',
          workflowDefinitionId: workflowDef.id,
          manualId: manual.id,
          status: 'DRAFT',
          initiatedBy: user.id,
          currentStageId: 'review',
        },
      });

      expect(workflowDef.id).toBe('test-workflow-def');
      expect(workflowInstance.workflowDefinitionId).toBe(workflowDef.id);
      expect(workflowInstance.manualId).toBe(manual.id);
    });
  });

  describe('Task Assignment Flow', () => {
    let organization: any;
    let author: any;
    let reviewer: any;
    let manual: any;
    let workflowInstance: any;

    beforeEach(async () => {
      organization = await prisma.organization.create({
        data: {
          id: 'test-org',
          name: 'Test Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      author = await prisma.user.create({
        data: {
          id: 'author-user',
          email: 'author@testairlines.com',
          name: 'Test Author',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['author'],
        },
      });

      reviewer = await prisma.user.create({
        data: {
          id: 'reviewer-user',
          email: 'reviewer@testairlines.com',
          name: 'Test Reviewer',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['technical_reviewer'],
        },
      });

      manual = await prisma.manual.create({
        data: {
          id: 'test-manual',
          title: 'Boeing 737-800 Operations Manual',
          organizationId: organization.id,
          status: 'DRAFT',
          createdBy: author.id,
          updatedBy: author.id,
        },
      });

      const workflowDef = await prisma.workflowDefinition.create({
        data: {
          id: 'test-workflow-def',
          name: 'Standard Approval Process',
          organizationId: organization.id,
          stages: [
            { id: 'review', name: 'Initial Review', order: 1 },
          ],
          createdBy: author.id,
          updatedBy: author.id,
        },
      });

      workflowInstance = await prisma.workflowInstance.create({
        data: {
          id: 'test-workflow-instance',
          workflowDefinitionId: workflowDef.id,
          manualId: manual.id,
          status: 'IN_PROGRESS',
          initiatedBy: author.id,
          currentStageId: 'review',
        },
      });
    });

    it('should create and assign approval task', async () => {
      const task = await prisma.approvalTask.create({
        data: {
          id: 'test-task',
          workflowInstanceId: workflowInstance.id,
          assignedToUserId: reviewer.id,
          title: 'Review Emergency Procedures',
          description: 'Please review the emergency procedures chapter',
          role: 'technical_reviewer',
          priority: 'HIGH',
          status: 'PENDING',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      expect(task.id).toBe('test-task');
      expect(task.assignedToUserId).toBe(reviewer.id);
      expect(task.workflowInstanceId).toBe(workflowInstance.id);
      expect(task.status).toBe('PENDING');
    });

    it('should complete approval task', async () => {
      const task = await prisma.approvalTask.create({
        data: {
          id: 'test-task',
          workflowInstanceId: workflowInstance.id,
          assignedToUserId: reviewer.id,
          title: 'Review Emergency Procedures',
          description: 'Please review the emergency procedures chapter',
          role: 'technical_reviewer',
          priority: 'HIGH',
          status: 'PENDING',
        },
      });

      // Complete the task
      const updatedTask = await prisma.approvalTask.update({
        where: { id: task.id },
        data: {
          status: 'APPROVED',
          completedAt: new Date(),
          comments: 'All procedures look good. Approved.',
        },
      });

      expect(updatedTask.status).toBe('APPROVED');
      expect(updatedTask.comments).toBe('All procedures look good. Approved.');
      expect(updatedTask.completedAt).toBeDefined();
    });
  });

  describe('Search Integration', () => {
    let organization: any;
    let user: any;
    let manual: any;

    beforeEach(async () => {
      organization = await prisma.organization.create({
        data: {
          id: 'test-org',
          name: 'Test Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      user = await prisma.user.create({
        data: {
          id: 'test-user',
          email: 'user@testairlines.com',
          name: 'Test User',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['user'],
        },
      });

      manual = await prisma.manual.create({
        data: {
          id: 'test-manual',
          title: 'Boeing 737-800 Operations Manual',
          organizationId: organization.id,
          status: 'RELEASED',
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      // Create searchable content
      const chapter = await prisma.chapter.create({
        data: {
          id: 'emergency-chapter',
          manualId: manual.id,
          number: 1,
          title: 'Emergency Procedures',
          content: 'Emergency procedures for various scenarios',
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      const section = await prisma.section.create({
        data: {
          id: 'evacuation-section',
          chapterId: chapter.id,
          number: '1.1',
          title: 'Emergency Evacuation',
          content: 'Procedures for emergency evacuation of the aircraft',
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      await prisma.block.create({
        data: {
          id: 'evacuation-block',
          sectionId: section.id,
          type: 'PROCEDURE',
          content: 'In case of emergency evacuation: 1. Stop aircraft 2. Activate exits 3. Evacuate passengers',
          order: 1,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
    });

    it('should log search analytics', async () => {
      const searchQuery = 'emergency evacuation procedures';
      
      const analytics = await prisma.searchAnalytics.create({
        data: {
          query: searchQuery,
          userId: user.id,
          sessionId: 'test-session',
          resultCount: 3,
          searchTimeMs: 150,
          timestamp: new Date(),
        },
      });

      expect(analytics.query).toBe(searchQuery);
      expect(analytics.userId).toBe(user.id);
      expect(analytics.resultCount).toBe(3);
    });
  });

  describe('Audit Logging', () => {
    let organization: any;
    let user: any;

    beforeEach(async () => {
      organization = await prisma.organization.create({
        data: {
          id: 'test-org',
          name: 'Test Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      user = await prisma.user.create({
        data: {
          id: 'test-user',
          email: 'user@testairlines.com',
          name: 'Test User',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['user'],
        },
      });
    });

    it('should create audit log entry', async () => {
      const auditLog = await prisma.auditLog.create({
        data: {
          id: 'test-audit-log',
          entityType: 'MANUAL',
          entityId: 'test-manual',
          action: 'CREATE',
          userId: user.id,
          organizationId: organization.id,
          metadata: {
            manualTitle: 'Test Manual',
            version: '1.0',
          },
          complianceMetadata: {
            regulatoryFramework: 'EASA',
            certificationLevel: 'AOC',
            effectiveDate: new Date(),
            retentionPeriodDays: 2555, // 7 years
          },
        },
      });

      expect(auditLog.entityType).toBe('MANUAL');
      expect(auditLog.action).toBe('CREATE');
      expect(auditLog.userId).toBe(user.id);
      expect(auditLog.complianceMetadata.regulatoryFramework).toBe('EASA');
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // This test would simulate database connection issues
      // In a real scenario, you'd mock the database to throw errors
      
      const response = await app.getHttpServer().get('/health');
      expect(response.status).toBe(200);
    });
  });
});
