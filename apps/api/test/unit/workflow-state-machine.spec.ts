import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowStateMachineService } from '../../src/workflows/workflow-state-machine.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('WorkflowStateMachineService', () => {
  let service: WorkflowStateMachineService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    workflowInstance: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    workflowTransitionLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    approvalTask: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    chapter: {
      count: jest.fn(),
    },
    section: {
      count: jest.fn(),
    },
    block: {
      findMany: jest.fn(),
    },
    complianceLink: {
      findMany: jest.fn(),
    },
    emergencyOverride: {
      findFirst: jest.fn(),
    },
    manual: {
      findUnique: jest.fn(),
    },
    organizationApproval: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowStateMachineService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<WorkflowStateMachineService>(WorkflowStateMachineService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canTransition', () => {
    it('should allow valid transitions', () => {
      expect(service.canTransition('DRAFT', 'IN_PROGRESS')).toBe(true);
      expect(service.canTransition('IN_PROGRESS', 'APPROVED')).toBe(true);
      expect(service.canTransition('IN_PROGRESS', 'REJECTED')).toBe(true);
      expect(service.canTransition('SUSPENDED', 'IN_PROGRESS')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(service.canTransition('APPROVED', 'DRAFT')).toBe(false);
      expect(service.canTransition('COMPLETED', 'IN_PROGRESS')).toBe(false);
      expect(service.canTransition('INVALID_STATE', 'APPROVED')).toBe(false);
    });
  });

  describe('validateWorkflowTransition', () => {
    it('should validate successful transition', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        status: 'IN_PROGRESS',
        manualId: 'manual-123',
      };

      mockPrismaService.workflowInstance.findUnique.mockResolvedValue(mockWorkflow);
      mockPrismaService.approvalTask.count.mockResolvedValue(0); // No pending tasks
      mockPrismaService.chapter.count.mockResolvedValue(3); // Has chapters
      mockPrismaService.section.count.mockResolvedValue(10); // Has sections

      const result = await service.validateWorkflowTransition('workflow-123', 'APPROVED');

      expect(result).toBe(true);
    });

    it('should reject transition with pending tasks', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        status: 'IN_PROGRESS',
        manualId: 'manual-123',
      };

      mockPrismaService.workflowInstance.findUnique.mockResolvedValue(mockWorkflow);
      mockPrismaService.approvalTask.count.mockResolvedValue(2); // Has pending tasks

      const result = await service.validateWorkflowTransition('workflow-123', 'APPROVED');

      expect(result).toBe(false);
    });

    it('should reject transition with invalid content', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        status: 'IN_PROGRESS',
        manualId: 'manual-123',
      };

      mockPrismaService.workflowInstance.findUnique.mockResolvedValue(mockWorkflow);
      mockPrismaService.approvalTask.count.mockResolvedValue(0);
      mockPrismaService.chapter.count.mockResolvedValue(0); // No chapters

      const result = await service.validateWorkflowTransition('workflow-123', 'APPROVED');

      expect(result).toBe(false);
    });
  });

  describe('checkCondition', () => {
    it('should check hasContent condition', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        chapters: [{ id: 'ch1' }, { id: 'ch2' }],
      };

      const result = await (service as any).checkCondition(mockWorkflow, 'hasContent');

      expect(result).toBe(true);
    });

    it('should check allTasksCompleted condition', async () => {
      const mockWorkflow = { id: 'workflow-123' };
      mockPrismaService.approvalTask.findMany.mockResolvedValue([]);

      const result = await (service as any).checkCondition(mockWorkflow, 'allTasksCompleted');

      expect(result).toBe(true);
    });

    it('should check allRequirementsMet condition', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        manualId: 'manual-123',
      };

      mockPrismaService.chapter.count.mockResolvedValue(3);
      mockPrismaService.section.count.mockResolvedValue(10);

      const result = await (service as any).checkCondition(mockWorkflow, 'allRequirementsMet');

      expect(result).toBe(true);
    });

    it('should check complianceChecked condition', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        manualId: 'manual-123',
      };

      mockPrismaService.complianceLink.findMany.mockResolvedValue([
        {
          regulationTitle: 'Critical Safety Regulation',
          status: 'VALIDATED',
        },
        {
          regulationTitle: 'Mandatory Procedure',
          status: 'VALIDATED',
        },
      ]);

      const result = await (service as any).checkCondition(mockWorkflow, 'complianceChecked');

      expect(result).toBe(true);
    });

    it('should check deadlineNotPassed condition', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const mockWorkflow = {
        id: 'workflow-123',
        deadline: futureDate,
      };

      const result = await (service as any).checkCondition(mockWorkflow, 'deadlineNotPassed');

      expect(result).toBe(true);
    });

    it('should fail deadlineNotPassed condition for past deadline', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);

      const mockWorkflow = {
        id: 'workflow-123',
        deadline: pastDate,
      };

      const result = await (service as any).checkCondition(mockWorkflow, 'deadlineNotPassed');

      expect(result).toBe(false);
    });
  });

  describe('getWorkflowStats', () => {
    it('should return workflow statistics', async () => {
      mockPrismaService.workflowInstance.findMany.mockResolvedValue([
        { status: 'DRAFT', _count: { id: 5 } },
        { status: 'IN_PROGRESS', _count: { id: 3 } },
        { status: 'APPROVED', _count: { id: 10 } },
        { status: 'REJECTED', _count: { id: 2 } },
      ]);

      const stats = await service.getWorkflowStats('test-org');

      expect(stats).toEqual({
        DRAFT: 5,
        IN_PROGRESS: 3,
        APPROVED: 10,
        REJECTED: 2,
      });
    });
  });
});
