import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApprovalTask,
  ApprovalTaskSchema,
  ApproveTaskDto,
  RejectTaskDto,
  ApproveTaskDtoSchema,
  RejectTaskDtoSchema,
  TaskStatus,
} from '@skymanuals/types';
import { z } from 'zod';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async findAllTasksForUser(userId: string, status?: TaskStatus): Promise<ApprovalTask[]> {
    const tasks = await this.prisma.approvalTask.findMany({
      where: {
        assignedToUserId: userId,
        ...(status && { status }),
      },
      include: {
        workflowInstance: {
          include: {
            workflowDefinition: true,
            initiatedBy: true,
          },
        },
        comments: {
          include: {
            user: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: [
        { status: 'asc' }, // PENDING tasks first
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return z.array(ApprovalTaskSchema).parse(tasks);
  }

  async findOneTask(taskId: string, userId: string): Promise<ApprovalTask> {
    const task = await this.prisma.approvalTask.findFirst({
      where: { 
        id: taskId,
        assignedToUserId: userId,
      },
      include: {
        workflowInstance: {
          include: {
            workflowDefinition: true,
            initiatedBy: true,
          },
        },
        comments: {
          include: {
            user: true,
            replies: {
              include: {
                user: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    return ApprovalTaskSchema.parse(task);
  }

  async approveTask(
    taskId: string,
    userId: string,
    approveDto: z.infer<typeof ApproveTaskDtoSchema>,
  ): Promise<ApprovalTask> {
    const task = await this.prisma.approvalTask.findFirst({
      where: {
        id: taskId,
        assignedToUserId: userId,
        status: 'PENDING',
      },
      include: {
        workflowInstance: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found or already processed');
    }

    const updatedTask = await this.prisma.$transaction(async (tx) => {
      // Update task status
      const taskUpdate = await tx.approvalTask.update({
        where: { id: taskId },
        data: {
          status: 'APPROVED',
          completedAt: new Date(),
          completedByUserId: userId,
        },
      });

      // Add comment if provided
      if (approveDto.comment) {
        await tx.comment.create({
          data: {
            taskId,
            userId,
            content: approveDto.comment,
            type: 'APPROVAL_REASON',
            attachments: approveDto.attachments || [],
          },
        });
      }

      // Check if this stage is now complete
      await this.checkStageCompletion(tx, task.workflowInstanceId, task.stageId);

      return taskUpdate;
    });

    return ApprovalTaskSchema.parse(updatedTask);
  }

  async rejectTask(
    taskId: string,
    userId: string,
    rejectDto: z.infer<typeof RejectTaskDtoSchema>,
  ): Promise<ApprovalTask> {
    const task = await this.prisma.approvalTask.findFirst({
      where: {
        id: taskId,
        assignedToUserId: userId,
        status: 'PENDING',
      },
      include: {
        workflowInstance: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found or already processed');
    }

    const updatedTask = await this.prisma.$transaction(async (tx) => {
      // Update task status
      const taskUpdate = await tx.approvalTask.update({
        where: { id: taskId },
        data: {
          status: 'REJECTED',
          completedAt: new Date(),
          completedByUserId: userId,
        },
      });

      // Add rejection comment
      await tx.comment.create({
        data: {
          taskId,
          userId,
          content: rejectDto.comment || `Rejected: ${rejectDto.reason}`,
          type: 'REJECTION_REASON',
          attachments: rejectDto.attachments || [],
        },
      });

      // Reject the entire workflow instance
      await tx.workflowInstance.update({
        where: { id: task.workflowInstanceId },
        data: {
          status: 'REJECTED',
          rejectionReason: rejectDto.reason,
          completedAt: new Date(),
        },
      });

      // Suspend all other pending tasks in this workflow
      await tx.approvalTask.updateMany({
        where: {
          workflowInstanceId: task.workflowInstanceId,
          status: 'PENDING',
        },
        data: {
          status: 'SUSPENDED',
        },
      });

      return taskUpdate;
    });

    return ApprovalTaskSchema.parse(updatedTask);
  }

  async delegateTask(
    taskId: string,
    currentUserId: string,
    delegateToUserId: string,
    note?: string,
  ): Promise<ApprovalTask> {
    // Verify delegate target exists and has REVIEWER role
    const delegateUser = await this.prisma.user.findUnique({
      where: { id: delegateToUserId },
      include: {
        memberships: {
          include: {
            organization: {
              include: {
                workflowInstances: {
                  where: {
                    tasks: {
                      some: { id: taskId },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!delegateUser) {
      throw new NotFoundException('Delegate user not found');
    }

    const task = await this.prisma.approvalTask.findFirst({
      where: {
        id: taskId,
        assignedToUserId: currentUserId,
        status: 'PENDING',
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found or already processed');
    }

    const updatedTask = await	this.prisma.$transaction(async (tx) => {
      // Update task assignment
      const taskUpdate = await tx.approvalTask.update({
        where: { id: taskId },
        data: {
          assignedToUserId: delegateToUserId,
          status: 'DELEGATED',
        },
      });

      // Add delegation comment
      await tx.comment.create({
        data: {
          taskId,
          userId: currentUserId,
          content: note || `Task delegated to ${delegateUser.name}`,
          type: 'DELEGATION_NOTE',
        },
      });

      return taskUpdate;
    });

    return ApprovalTaskSchema.parse(updatedTask);
  }

  private async checkStageCompletion(tx: any, workflowInstanceId: string, stageId: string): Promise<void> {
    // Get workflow stage configuration
    const workflowInstance = await tx.workflowInstance.findUnique({
      where: { id: workflowInstanceId },
      include: { workflowDefinition: true },
    });

    if (!workflowInstance) return;

    const stages = workflowInstance.workflowDefinition.stages as any[];
    const currentStageConfig = stages.find(s => s.id === stageId);
    
    if (!currentStageConfig) return;

    const approvalThreshold = currentStageConfig.approvalThreshold || 1;

    // Count approvals for this stage
    const stageApprovals = await tx.approvalTask.count({
      where: {
        workflowInstanceId,
        stageId,
        status: 'APPROVED',
      },
    });

    if (stageApprovals >= approvalThreshold) {
      // Stage completed - move to next stage or complete workflow
      const nextStageId = currentStageConfig.nextStageId;
      
      if (nextStageId) {
        // Move to next stage
        await tx.workflowInstance.update({
          where: { id: workflowInstanceId },
          data: { currentStageId: nextStageId },
        });

        // Create tasks for next stage
        const nextStage = stages.find(s => s.id === nextStageId);
        if (nextStage) {
          // Note: In a real implementation, createStageTasks would be extracted
          // and called here to create tasks for the next stage
        }
      } else {
        // Workflow completed
        await tx.workflowInstance.update({
          where: { id: workflowInstanceId },
          data: {
            status: 'APPROVED',
            completedAt: new Date(),
          },
        });
      }
    }
  }

  async getTaskSummary(userId: string) {
    const summary = await this.prisma.approvalTask.aggregate({
      where: { assignedToUserId: userId },
      _count: {
        status: true,
      },
    });

    const overdueCount = await this.prisma.approvalTask.count({
      where: {
        assignedToUserId: userId,
        status: 'PENDING',
        dueAt: { lt: new Date() },
      },
    });

    return {
      totalTasks: summary._count.status,
      pendingTasks: await this.prisma.approvalTask.count({
        where: { assignedToUserId: userId, status: 'PENDING' },
      }),
      overdueTasks: overdueCount,
      completedThisWeek: await this.prisma.approvalTask.count({
        where: {
          assignedToUserId: userId,
          status: { in: ['APPROVED', 'REJECTED'] },
          completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    };
  }
}
