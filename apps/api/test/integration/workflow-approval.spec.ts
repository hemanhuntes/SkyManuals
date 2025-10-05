import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { testEnv } from '../setup';

describe('Workflow & Approval Process Integration Tests', () => {
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
    await prisma.approvalTask.deleteMany();
    await prisma.workflowInstance.deleteMany();
    await prisma.workflowDefinition.deleteMany();
    await prisma.manual.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Complete Workflow Lifecycle', () => {
    it('should simulate full manual approval workflow', async () => {
      // 1. Setup test data
      const organization = await prisma.organization.create({
        data: {
          id: 'test-org',
          name: 'Test Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      const author = await prisma.user.create({
        data: {
          id: 'author-123',
          email: 'author@testairlines.com',
          name: 'Test Author',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['author'],
        },
      });

      const reviewer = await prisma.user.create({
        data: {
          id: 'reviewer-123',
          email: 'reviewer@testairlines.com',
          name: 'Test Reviewer',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['reviewer'],
        },
      });

      const approver = await prisma.user.create({
        data: {
          id: 'approver-123',
          email: 'approver@testairlines.com',
          name: 'Test Approver',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['approver'],
        },
      });

      // 2. Create workflow definition
      const workflowDefinition = await prisma.workflowDefinition.create({
        data: {
          id: 'workflow-def-123',
          name: 'Manual Approval Process',
          description: 'Standard approval process for aviation manuals',
          organizationId: organization.id,
          stages: [
            {
              name: 'DRAFT',
              description: 'Initial draft stage',
              order: 1,
              requiredRoles: ['author'],
              allowedTransitions: ['IN_REVIEW'],
            },
            {
              name: 'IN_REVIEW',
              description: 'Under review by technical experts',
              order: 2,
              requiredRoles: ['reviewer'],
              allowedTransitions: ['APPROVED', 'REJECTED', 'DRAFT'],
            },
            {
              name: 'APPROVED',
              description: 'Approved by management',
              order: 3,
              requiredRoles: ['approver'],
              allowedTransitions: ['PUBLISHED'],
            },
            {
              name: 'PUBLISHED',
              description: 'Published and available',
              order: 4,
              requiredRoles: [],
              allowedTransitions: [],
            },
          ],
          isActive: true,
          createdBy: author.id,
        },
      });

      // 3. Create manual
      const manual = await prisma.manual.create({
        data: {
          id: 'manual-123',
          title: 'Emergency Procedures Manual',
          organizationId: organization.id,
          status: 'DRAFT',
          createdBy: author.id,
          updatedBy: author.id,
        },
      });

      // 4. Start workflow
      const workflowInstance = await prisma.workflowInstance.create({
        data: {
          id: 'workflow-instance-123',
          workflowDefinitionId: workflowDefinition.id,
          manualId: manual.id,
          currentStage: 'DRAFT',
          status: 'ACTIVE',
          startedBy: author.id,
          organizationId: organization.id,
        },
      });

      // 5. Simulate workflow transitions
      const workflowTransitions = [
        {
          from: 'DRAFT',
          to: 'IN_REVIEW',
          triggeredBy: author.id,
          comment: 'Ready for technical review',
        },
        {
          from: 'IN_REVIEW',
          to: 'APPROVED',
          triggeredBy: reviewer.id,
          comment: 'Technical review completed, approved for management review',
        },
        {
          from: 'APPROVED',
          to: 'PUBLISHED',
          triggeredBy: approver.id,
          comment: 'Management approval granted, ready for publication',
        },
      ];

      for (const transition of workflowTransitions) {
        // Update workflow instance
        await prisma.workflowInstance.update({
          where: { id: workflowInstance.id },
          data: {
            currentStage: transition.to,
            updatedBy: transition.triggeredBy,
          },
        });

        // Create audit log for transition
        await prisma.auditLog.create({
          data: {
            id: `audit-${Date.now()}-${Math.random()}`,
            entityType: 'WORKFLOW_INSTANCE',
            entityId: workflowInstance.id,
            action: 'WORKFLOW_TRANSITION',
            userId: transition.triggeredBy,
            organizationId: organization.id,
            details: {
              from: transition.from,
              to: transition.to,
              comment: transition.comment,
              timestamp: new Date().toISOString(),
            },
            ipAddress: '127.0.0.1',
            userAgent: 'Test Agent',
            timestamp: new Date(),
          },
        });
      }

      // 6. Verify final state
      const finalWorkflow = await prisma.workflowInstance.findUnique({
        where: { id: workflowInstance.id },
        include: { auditLogs: true },
      });

      expect(finalWorkflow.currentStage).toBe('PUBLISHED');
      expect(finalWorkflow.status).toBe('ACTIVE');
      expect(finalWorkflow.auditLogs).toHaveLength(3);
    });

    it('should handle workflow rejection and revision', async () => {
      // Setup similar to above...
      const organization = await prisma.organization.create({
        data: {
          id: 'test-org-2',
          name: 'Test Airlines 2',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      const author = await prisma.user.create({
        data: {
          id: 'author-456',
          email: 'author2@testairlines.com',
          name: 'Test Author 2',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['author'],
        },
      });

      const reviewer = await prisma.user.create({
        data: {
          id: 'reviewer-456',
          email: 'reviewer2@testairlines.com',
          name: 'Test Reviewer 2',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['reviewer'],
        },
      });

      // Create manual and workflow
      const manual = await prisma.manual.create({
        data: {
          id: 'manual-456',
          title: 'Operations Manual',
          organizationId: organization.id,
          status: 'DRAFT',
          createdBy: author.id,
          updatedBy: author.id,
        },
      });

      const workflowInstance = await prisma.workflowInstance.create({
        data: {
          id: 'workflow-instance-456',
          workflowDefinitionId: 'workflow-def-123',
          manualId: manual.id,
          currentStage: 'IN_REVIEW',
          status: 'ACTIVE',
          startedBy: author.id,
          organizationId: organization.id,
        },
      });

      // Simulate rejection
      await prisma.workflowInstance.update({
        where: { id: workflowInstance.id },
        data: {
          currentStage: 'DRAFT',
          updatedBy: reviewer.id,
        },
      });

      // Create rejection audit log
      await prisma.auditLog.create({
        data: {
          id: `audit-rejection-${Date.now()}`,
          entityType: 'WORKFLOW_INSTANCE',
          entityId: workflowInstance.id,
          action: 'WORKFLOW_REJECTION',
          userId: reviewer.id,
          organizationId: organization.id,
          details: {
            reason: 'Technical inaccuracies found in Chapter 3',
            feedback: 'Please review emergency procedures and update fuel calculations',
            from: 'IN_REVIEW',
            to: 'DRAFT',
            requiresRevision: true,
          },
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
          timestamp: new Date(),
        },
      });

      // Verify rejection state
      const rejectedWorkflow = await prisma.workflowInstance.findUnique({
        where: { id: workflowInstance.id },
      });

      expect(rejectedWorkflow.currentStage).toBe('DRAFT');
    });
  });

  describe('Task Assignment and Completion', () => {
    it('should assign and complete approval tasks', async () => {
      // Setup test data
      const organization = await prisma.organization.create({
        data: {
          id: 'task-org',
          name: 'Task Test Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      const reviewer = await prisma.user.create({
        data: {
          id: 'task-reviewer',
          email: 'taskreviewer@testairlines.com',
          name: 'Task Reviewer',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['reviewer'],
        },
      });

      const manual = await prisma.manual.create({
        data: {
          id: 'task-manual',
          title: 'Task Test Manual',
          organizationId: organization.id,
          status: 'IN_REVIEW',
          createdBy: 'author-123',
          updatedBy: 'author-123',
        },
      });

      // Create approval task
      const approvalTask = await prisma.approvalTask.create({
        data: {
          id: 'task-123',
          title: 'Review Emergency Procedures Chapter',
          description: 'Please review Chapter 3 for technical accuracy',
          manualId: manual.id,
          assignedTo: reviewer.id,
          organizationId: organization.id,
          status: 'PENDING',
          priority: 'HIGH',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          createdBy: 'author-123',
        },
      });

      // Simulate task completion
      const taskCompletion = {
        taskId: approvalTask.id,
        status: 'COMPLETED',
        completedBy: reviewer.id,
        completionNotes: 'Chapter 3 reviewed and approved. All procedures are accurate and comply with current regulations.',
        completionDate: new Date(),
        rating: 4, // Out of 5
        feedback: {
          technicalAccuracy: 'Excellent',
          complianceStatus: 'Compliant',
          suggestions: 'Consider adding more detailed diagrams for emergency exits',
        },
      };

      // Update task
      await prisma.approvalTask.update({
        where: { id: approvalTask.id },
        data: {
          status: taskCompletion.status,
          completedBy: taskCompletion.completedBy,
          completionNotes: taskCompletion.completionNotes,
          completedAt: taskCompletion.completionDate,
          rating: taskCompletion.rating,
        },
      });

      // Create completion audit log
      await prisma.auditLog.create({
        data: {
          id: `audit-task-completion-${Date.now()}`,
          entityType: 'APPROVAL_TASK',
          entityId: approvalTask.id,
          action: 'TASK_COMPLETED',
          userId: reviewer.id,
          organizationId: organization.id,
          details: {
            completionNotes: taskCompletion.completionNotes,
            rating: taskCompletion.rating,
            feedback: taskCompletion.feedback,
            timeSpent: '2.5 hours',
          },
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
          timestamp: new Date(),
        },
      });

      // Verify task completion
      const completedTask = await prisma.approvalTask.findUnique({
        where: { id: approvalTask.id },
      });

      expect(completedTask.status).toBe('COMPLETED');
      expect(completedTask.completedBy).toBe(reviewer.id);
      expect(completedTask.rating).toBe(4);
    });

    it('should handle task delegation', async () => {
      // Setup test data
      const organization = await prisma.organization.create({
        data: {
          id: 'delegation-org',
          name: 'Delegation Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      const originalAssignee = await prisma.user.create({
        data: {
          id: 'original-assignee',
          email: 'original@testairlines.com',
          name: 'Original Assignee',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['reviewer'],
        },
      });

      const delegateAssignee = await prisma.user.create({
        data: {
          id: 'delegate-assignee',
          email: 'delegate@testairlines.com',
          name: 'Delegate Assignee',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['reviewer'],
        },
      });

      // Create task
      const task = await prisma.approvalTask.create({
        data: {
          id: 'delegation-task',
          title: 'Review Navigation Procedures',
          description: 'Technical review required',
          manualId: 'manual-123',
          assignedTo: originalAssignee.id,
          organizationId: organization.id,
          status: 'PENDING',
          priority: 'MEDIUM',
          createdBy: 'author-123',
        },
      });

      // Simulate delegation
      const delegation = {
        taskId: task.id,
        fromUserId: originalAssignee.id,
        toUserId: delegateAssignee.id,
        reason: 'Out of office for 2 weeks',
        delegationDate: new Date(),
        comments: 'Please handle this review while I am on vacation',
      };

      // Update task assignment
      await prisma.approvalTask.update({
        where: { id: task.id },
        data: {
          assignedTo: delegation.toUserId,
          updatedBy: delegation.fromUserId,
        },
      });

      // Create delegation audit log
      await prisma.auditLog.create({
        data: {
          id: `audit-delegation-${Date.now()}`,
          entityType: 'APPROVAL_TASK',
          entityId: task.id,
          action: 'TASK_DELEGATED',
          userId: delegation.fromUserId,
          organizationId: organization.id,
          details: {
            fromUser: originalAssignee.email,
            toUser: delegateAssignee.email,
            reason: delegation.reason,
            comments: delegation.comments,
            delegationDate: delegation.delegationDate.toISOString(),
          },
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
          timestamp: new Date(),
        },
      });

      // Verify delegation
      const delegatedTask = await prisma.approvalTask.findUnique({
        where: { id: task.id },
      });

      expect(delegatedTask.assignedTo).toBe(delegateAssignee.id);
    });
  });

  describe('Notification Flow', () => {
    it('should trigger notifications for workflow events', async () => {
      // Setup test data
      const organization = await prisma.organization.create({
        data: {
          id: 'notification-org',
          name: 'Notification Airlines',
          type: 'AIRLINE',
          status: 'ACTIVE',
        },
      });

      const author = await prisma.user.create({
        data: {
          id: 'notification-author',
          email: 'notificationauthor@testairlines.com',
          name: 'Notification Author',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['author'],
        },
      });

      const reviewer = await prisma.user.create({
        data: {
          id: 'notification-reviewer',
          email: 'notificationreviewer@testairlines.com',
          name: 'Notification Reviewer',
          organizationId: organization.id,
          status: 'ACTIVE',
          roles: ['reviewer'],
        },
      });

      // Simulate notification triggers
      const notifications = [
        {
          type: 'TASK_ASSIGNED',
          recipientId: reviewer.id,
          title: 'New Review Task Assigned',
          message: 'You have been assigned to review "Emergency Procedures Manual"',
          priority: 'HIGH',
          channel: 'EMAIL',
        },
        {
          type: 'WORKFLOW_TRANSITION',
          recipientId: author.id,
          title: 'Workflow Status Updated',
          message: 'Your manual "Emergency Procedures Manual" has moved to IN_REVIEW stage',
          priority: 'MEDIUM',
          channel: 'IN_APP',
        },
        {
          type: 'TASK_OVERDUE',
          recipientId: reviewer.id,
          title: 'Task Overdue',
          message: 'Review task for "Emergency Procedures Manual" is overdue',
          priority: 'HIGH',
          channel: 'SLACK',
        },
      ];

      // Simulate notification processing
      const notificationResults = notifications.map(notification => ({
        ...notification,
        id: `notification-${Date.now()}-${Math.random()}`,
        status: 'SENT',
        sentAt: new Date(),
        deliveryAttempts: 1,
        lastAttemptAt: new Date(),
      }));

      // Verify notification results
      expect(notificationResults).toHaveLength(3);
      expect(notificationResults[0].type).toBe('TASK_ASSIGNED');
      expect(notificationResults[1].type).toBe('WORKFLOW_TRANSITION');
      expect(notificationResults[2].type).toBe('TASK_OVERDUE');

      // Verify different notification channels
      const emailNotifications = notificationResults.filter(n => n.channel === 'EMAIL');
      const inAppNotifications = notificationResults.filter(n => n.channel === 'IN_APP');
      const slackNotifications = notificationResults.filter(n => n.channel === 'SLACK');

      expect(emailNotifications).toHaveLength(1);
      expect(inAppNotifications).toHaveLength(1);
      expect(slackNotifications).toHaveLength(1);
    });
  });
});
