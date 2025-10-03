import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Epic-02: Workflow E2E Tests', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    // Clean up database before tests
    await cleanupDatabase();
  });

  afterAll(async () => {
    await cleanupDatabase();
    await app.close();
  });

  async function cleanupDatabase() {
    await prismaService.$transaction([
      prismaService.task.deleteMany(),
      prismaService.comment.deleteMany(),
      prismaService.checklist.deleteMany(),
      prismaService.workflowInstance.deleteMany(),
      prismaService.workflowDefinition.deleteMany(),
      prismaService.changeSet.deleteMany(),
      prismaService.manual.deleteMany(),
      prismaService.user.deleteMany(),
      prismaService.organization.deleteMany(),
    ]);
  }

  async function setupTestData() {
    // Create test organization
    const organization = await prismaService.organization.create({
      data: {
        name: 'Test Aviation Corp',
        slug: 'test-aviation',
        logoUrl: 'https://example.com/logo.png',
      },
    });

    // Create test users
    const tester = await prismaService.user.create({
      data: {
        email: 'tester@testaviation.com',
        name: 'Test Reviewer',
      },
    });

    const author = await prismaService.user.create({
      data: {
        email: 'author@testaviation.com',
        name: 'Test Author',
      },
    });

    // Create test manual
    const manual = await prismaService.manual.create({
      data: {
        organizationId: organization.id,
        title: 'Test Manual',
        status: 'DRAFT',
      },
    });

    // Create test workflow definition
    const workflowDefinition = await prismaService.workflowDefinition.create({
      data: {
        organizationId: organization.id,
        name: 'Test Review Workflow',
        description: 'Test workflow for manual review',
        entityType: 'MANUAL',
        stages: [
          {
            id: 'stage-1',
            name: 'Initial Review',
            description: 'Initial technical review',
            requiredRoles: ['REVIEWER'],
            approvalThreshold: 1,
            allowsRejection: true,
            maxDurationHours: 24,
          },
          {
            id: 'stage-2',
            name: 'Final Approval',
            description: 'Final approval stage',
            requiredRoles: ['ADMIN'],
            approvalThreshold: 1,
            allowsRejection: true,
            maxDurationHours: 48,
          },
        ],
      },
    });

    return { organization, tester, author, manual, workflowDefinition };
  }


  describe('Complete Workflow Submission -> Approval -> Release', () => {
    beforeEach(async () => {
      await setupTestData();
    });

    it('should create workflow instance', async () => {
      const response = await request(app.getHttpServer())
        .post('/workflows/instances')
        .query('organizationId', workflowDefinition.organizationId)
        .send({
          workflowDefinitionId: workflowDefinition.id,
          entityType: 'manual',
          entityId: manual.id,
          title: 'Test Manual Review',
          description: 'Testing workflow approval process',
          priority: 'HIGH',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe('Test Manual Review');
      expect(response.body.status).toBe('IN_PROGRESS');

      // Verify workflow instance was created in database
      const workflowInstance = await prismaService.workflowInstance.findFirst({
        where: { id: response.body.id },
      });
      expect(workflowInstance).toBeDefined();
      expect(workflowInstance?.status).toBe('IN_PROGRESS');
    });

    it('should create approval tasks for workflow stage', async () => {
      // Create workflow instance
      const createResponse = await request(app.getHttpServer())
        .post('/workflows/instances')
        .query('organizationId', workflowDefinition.organizationId)
        .send({
          workflowDefinitionId: workflowDefinition.id,
          entityType: 'manual',
          entityId: manual.id,
          title: 'Test Manual Review',
        })
        .expect(201);

      const workflowInstanceId = createResponse.body.id;

      // Get tasks for the reviewer
      const tasksResponse = await request(app.getHttpServer())
        .get('/tasks')
        .expect(200);

      expect(tasksResponse.body).toBeInstanceOf(Array);
      
      // Find our test task
      const testTask = tasksResponse.body.find((task: any) => 
        task.workflowInstanceId === workflowInstanceId
      );
      
      expect(testTask).toBeDefined();
      expect(testTask.status).toBe('PENDING');
      expect(testTask.priority).toBe('HIGH');
      expect(testTask.entityType).toBe('manual');
      expect(testTask.entityId).toBe(manual.id);

      return testTask;
    });

    it('should allow reviewer to approve task', async () => {
      // Create workflow and get task
      const task = await createWorkflowInstanceAndTask();

      // Approve the task
      const approveResponse = await request(app.getHttpServer())
        .patch(`/tasks/${task.id}/approve`)
        .send({
          comment: 'Manual review approved. Good work!',
          attachments: [],
        })
        .expect(200);

      expect(approveResponse.body.status).toBe('APPROVED');
      expect(approveResponse.body.completedAt).toBeDefined();

      // Verify task approval created comment
      const commentsResponse = await request(app.getHttpServer())
        .get(`/comments/tasks/${task.id}`)
        .expect(200);

      expect(commentsResponse.body).toBeInstanceOf(Array);
      expect(commentsResponse.body.length).toBeGreaterThan(0);
      
      const approvalComment = commentsResponse.body.find((comment: any) => 
        comment.type === 'APPROVAL_REASON'
      );
      expect(approvalComment).toBeDefined();
      expect(approvalComment.content).toBe('Manual review approved. Good work!');
    });

    it('should allow reviewer to reject task', async () => {
      // Create workflow and get task
      const task = await createWorkflowInstanceAndTask();

      // Reject the task
      const rejectResponse = await request(app.getHttpServer())
        .patch(`/tasks/${task.id}/reject`)
        .send({
          reason: 'Technical accuracy issues found',
          comment: 'Section 2.3 contains outdated performance data',
          attachments: [],
        })
        .expect(200);

      expect(rejectResponse.body.status).toBe('REJECTED');
      expect(rejectResponse.body.completedAt).toBeDefined();

      // Verify workflow instance was rejected
      const workflowResponse = await request(app.getHttpServer())
        .get(`/workflows/instances/${task.workflowInstanceId}`)
        .query('organizationId', workflowDefinition.organizationId)
        .expect(200);

      expect(workflowResponse.body.status).toBe('REJECTED');
      expect(workflowResponse.body.rejectionReason).toBe('Technical accuracy issues found');

      // Verify all other pending tasks were suspended
      const allTasksResponse = await request(app.getHttpServer())
        .get('/tasks')
        .expect(200);

      const relatedTasks = allTasksResponse.body.filter((t: any) => 
        t.workflowInstanceId === task.workflowInstanceId
      );
      
      relatedTasks.forEach((relatedTask: any) => {
        expect(['APPROVED', 'REJECTED', 'SUSPENDED']).toContain(relatedTask.status);
      });
    });

    it('should support task delegation', async () => {
      // Create workflow and get task
      const task = await createWorkflowInstanceAndTask();

      // Create another reviewer
      const anotherReviewer = await prismaService.user.create({
        data: {
          email: 'another@testaviation.com',
          name: 'Another Reviewer',
        },
      });

      // Delegate the task
      const delegateResponse = await request(app.getHttpServer())
        .patch(`/tasks/${task.id}/delegate`)
        .send({
          userId: anotherReviewer.id,
          note: 'Please handle this review, I\'m unable to complete it',
        })
        .expect(200);

      expect(delegateResponse.body.status).toBe('DELEGATED');
      expect(delegateResponse.body.assignedToUserId).toBe(anotherReviewer.id);

      // Verify delegation comment was created
      const commentsResponse = await request(app.getHttpServer())
        .get(`/comments/tasks/${task.id}/commenents`)
        .expect(200);

      const delegationComment = commentsResponse.body.find((comment: any) => 
        comment.type === 'DELEGATION_NOTE'
      );
      expect(delegationComment).toBeDefined();
      expect(delegationComment.content).toContain('Please handle this review');
    });

    it('should track complete workflow lifecycle', async () => {
      // Create a workflow
      const createResponse = await request(app.getHttpServer())
        .post('/workflows/instances')
        .query('organizationId', workflowDefinition.organizationId)
        .send({
          workflowDefinitionId: workflowDefinition.id,
          entityType: 'manual',
          entityId: manual.id,
          title: 'Complete Lifecycle Test',
          priority: 'MEDIUM',
        })
        .expect(201);

      const workflowInstanceId = createResponse.body.id;

      // Verify initial state
      expect(createResponse.body.status).toBe('IN_PROGRESS');
      expect(createResponse.body.currentStageId).toBe('stage-1');

      // Approve initial stage
      const task = await getTaskForWorkflow(workflowInstanceId);
      
      await request(app.getHttpServer())
        .patch(`/tasks/${task.id}/approve`)
        .send({ comment: 'Initial review passed' })
        .expect(200);

      // Verify workflow moved to next stage
      const updatedWorkflow = await request(app.getHttpServer())
        .get(`/workflows/instances/${workflowInstanceId}`)
        .query('organization_id: workflowDefinition.organizationId`)
        .expect(200);

      expect(updatedWorkflow.body.status).toBe('IN_PROGRESS');
      expect(updatedWorkflow.body.currentStageId).toBe('stage-2');

      // Approve final stage
      const finalTask = await getTaskForWorkflow(workflowInstanceId, 'stage-2');
      
      const finalApprovalResponse = await request(app.getHttpServer())
        .patch(`/tasks/${finalTask.id}/approve`)
        .send({ comment: 'Final approval granted' })
        .expect(200);

      // Verify workflow completed
      const completedWorkflow = await request(app.getHttpServer())
        .get(`/workflows/instances/${workflowInstanceId}`)
        .query('organizationId', workflowDefinition.organizationId)
        .expect(200);

      expect(completedWorkflow.body.status).toBe('APPROVED');
      expect(completedWorkflow.body.completedAt).toBeDefined();

      // Verify workflow metrics are updated
      const metricsResponse = await request(app.getHttpServer())
        .get('/workflows/metrics')
        .query({
          organizationId: workflowDefinition.organizationId,
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
        })
        .expect(200);

      expect(metricsResponse.body.totalInstances).toBeGreaterThan(0);
      expect(metricsResponse.body.completedInstances).toBeGreaterThan(0);
    });
  });

  // Helper functions
  async function createWorkflowInstanceAndTask() {
    const createResponse = await request(app.getHttpServer())
      .post('/workflows/instances')
      .query('organizationId', workflowDefinition.organizationId)
      .send({
        workflowDefinitionId: workflowDefinition.id,
        entityType: 'manual',
        entityId: manual.id,
        title: 'Test Workflow',
      })
      .expect(201);

    return await getTaskForWorkflow(createResponse.body.id);
  }

  async function getTaskForWorkflow(workflowInstanceId: string, stageId?: string) {
    const tasksResponse = await request(app.getHttpServer())
      .get('/tasks')
      .expect(200);

    const tasks = tasksResponse.body.filter((task: any) => 
      task.workflowInstanceId === workflowInstanceId && 
      (!stageId || task.stageId === stageId)
    );

    expect(tasks.length).toBeGreaterThan(0);
    return tasks[0];
  }
});
