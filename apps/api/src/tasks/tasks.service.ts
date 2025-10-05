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
          await this.createStageTasks(workflowInstanceId, nextStage.id, tx);
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

  /**
   * Create tasks for a workflow stage
   */
  private async createStageTasks(
    workflowInstanceId: string, 
    stageId: string, 
    tx: any
  ): Promise<void> {
    try {
      // Get stage definition
      const stage = await tx.workflowStage.findUnique({
        where: { id: stageId },
        include: {
          workflowDefinition: {
            include: {
              organization: true
            }
          }
        }
      });

      if (!stage) {
        throw new NotFoundException(`Stage ${stageId} not found`);
      }

      // Get workflow instance for context
      const workflowInstance = await tx.workflowInstance.findUnique({
        where: { id: workflowInstanceId },
        include: {
          manual: {
            include: {
              organization: true
            }
          }
        }
      });

      if (!workflowInstance) {
        throw new NotFoundException(`Workflow instance ${workflowInstanceId} not found`);
      }

      // Define task templates based on stage type
      const taskTemplates = this.getTaskTemplatesForStage(stage.name, workflowInstance);

      // Create tasks for each template
      for (const template of taskTemplates) {
        // Find suitable assignee
        const assignee = await this.findAssigneeForTask(
          template.role,
          workflowInstance.manual.organizationId,
          tx
        );

        if (!assignee) {
          console.warn(`No assignee found for role: ${template.role}`);
          continue;
        }

        // Create the task
        await tx.approvalTask.create({
          data: {
            workflowInstanceId,
            stageId,
            assignedToUserId: assignee.id,
            title: template.title,
            description: template.description,
            role: template.role,
            priority: template.priority,
            dueDate: template.dueDate,
            status: 'PENDING',
            createdAt: new Date(),
          }
        });

        console.log(`Created task: ${template.title} for user: ${assignee.email}`);
      }

    } catch (error) {
      console.error(`Error creating stage tasks: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get task templates for a specific stage
   */
  private getTaskTemplatesForStage(stageName: string, workflowInstance: any): Array<{
    role: string;
    title: string;
    description: string;
    priority: string;
    dueDate: Date;
  }> {
    const baseDueDate = new Date();
    baseDueDate.setDate(baseDueDate.getDate() + 7); // 7 days default

    switch (stageName.toLowerCase()) {
      case 'initial_review':
        return [
          {
            role: 'technical_reviewer',
            title: `Technical Review: ${workflowInstance.manual.title}`,
            description: `Please review the technical content of ${workflowInstance.manual.title} for accuracy and completeness.`,
            priority: 'HIGH',
            dueDate: new Date(baseDueDate.getTime() + 2 * 24 * 60 * 60 * 1000) // 2 days
          },
          {
            role: 'content_reviewer',
            title: `Content Review: ${workflowInstance.manual.title}`,
            description: `Please review the content structure and language of ${workflowInstance.manual.title}.`,
            priority: 'MEDIUM',
            dueDate: new Date(baseDueDate.getTime() + 3 * 24 * 60 * 60 * 1000) // 3 days
          }
        ];

      case 'compliance_review':
        return [
          {
            role: 'compliance_officer',
            title: `Compliance Review: ${workflowInstance.manual.title}`,
            description: `Please review ${workflowInstance.manual.title} for regulatory compliance and safety requirements.`,
            priority: 'HIGH',
            dueDate: new Date(baseDueDate.getTime() + 5 * 24 * 60 * 60 * 1000) // 5 days
          },
          {
            role: 'safety_officer',
            title: `Safety Review: ${workflowInstance.manual.title}`,
            description: `Please review safety procedures and emergency protocols in ${workflowInstance.manual.title}.`,
            priority: 'URGENT',
            dueDate: new Date(baseDueDate.getTime() + 3 * 24 * 60 * 60 * 1000) // 3 days
          }
        ];

      case 'final_approval':
        return [
          {
            role: 'final_approver',
            title: `Final Approval: ${workflowInstance.manual.title}`,
            description: `Please provide final approval for ${workflowInstance.manual.title} after reviewing all previous feedback.`,
            priority: 'HIGH',
            dueDate: new Date(baseDueDate.getTime() + 2 * 24 * 60 * 60 * 1000) // 2 days
          }
        ];

      case 'quality_assurance':
        return [
          {
            role: 'qa_specialist',
            title: `QA Review: ${workflowInstance.manual.title}`,
            description: `Please perform quality assurance review of ${workflowInstance.manual.title} including formatting and consistency.`,
            priority: 'MEDIUM',
            dueDate: new Date(baseDueDate.getTime() + 4 * 24 * 60 * 60 * 1000) // 4 days
          }
        ];

      default:
        return [
          {
            role: 'reviewer',
            title: `Review: ${workflowInstance.manual.title}`,
            description: `Please review ${workflowInstance.manual.title} in stage: ${stageName}.`,
            priority: 'MEDIUM',
            dueDate: baseDueDate
          }
        ];
    }
  }

  /**
   * Find suitable assignee for a task role
   */
  private async findAssigneeForTask(
    role: string, 
    organizationId: string, 
    tx: any
  ): Promise<any | null> {
    try {
      // First, try to find users with specific roles
      const roleMappings = {
        'technical_reviewer': ['technical_reviewer', 'engineer', 'technical_specialist'],
        'content_reviewer': ['content_reviewer', 'editor', 'technical_writer'],
        'compliance_officer': ['compliance_officer', 'regulatory_specialist'],
        'safety_officer': ['safety_officer', 'safety_specialist'],
        'final_approver': ['final_approver', 'manager', 'director'],
        'qa_specialist': ['qa_specialist', 'quality_assurance']
      };

      const possibleRoles = roleMappings[role] || [role];

      // Find user with matching role in organization
      const user = await tx.user.findFirst({
        where: {
          organizationId,
          roles: {
            hasSome: possibleRoles
          },
          status: 'ACTIVE'
        },
        orderBy: {
          lastActiveAt: 'desc'
        }
      });

      if (user) {
        return user;
      }

      // Fallback: find any active user in organization
      const fallbackUser = await tx.user.findFirst({
        where: {
          organizationId,
          status: 'ACTIVE'
        },
        orderBy: {
          lastActiveAt: 'desc'
        }
      });

      return fallbackUser;

    } catch (error) {
      console.error(`Error finding assignee for role ${role}: ${error.message}`);
      return null;
    }
  }
}




