import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface WorkflowTransition {
  from: string;
  to: string;
  allowed: boolean;
  conditions?: string[];
  requiredPermissions?: string[];
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  transitions: WorkflowTransition[];
}

// State machine definition
const WORKFLOW_TRANSITIONS = {
  DRAFT: {
    allowedTransitions: ['IN_PROGRESS', 'CANCELLED'],
    conditions: {
      'IN_PROGRESS': ['hasContent', 'hasApprovers'],
      'CANCELLED': ['canCancel']
    },
    requiredPermissions: {
      'IN_PROGRESS': ['workflow.start'],
      'CANCELLED': ['workflow.cancel']
    }
  },
  IN_PROGRESS: {
    allowedTransitions: ['APPROVED', 'REJECTED', 'SUSPENDED', 'CANCELLED'],
    conditions: {
      'APPROVED': ['allTasksCompleted', 'allApprovalsReceived'],
      'REJECTED': ['hasRejectionReason'],
      'SUSPENDED': ['hasSuspensionReason'],
      'CANCELLED': ['canCancel']
    },
    requiredPermissions: {
      'APPROVED': ['workflow.approve'],
      'REJECTED': ['workflow.reject'],
      'SUSPENDED': ['workflow.suspend'],
      'CANCELLED': ['workflow.cancel']
    }
  },
  SUSPENDED: {
    allowedTransitions: ['IN_PROGRESS', 'CANCELLED'],
    conditions: {
      'IN_PROGRESS': ['canResume'],
      'CANCELLED': ['canCancel']
    },
    requiredPermissions: {
      'IN_PROGRESS': ['workflow.resume'],
      'CANCELLED': ['workflow.cancel']
    }
  },
  APPROVED: {
    allowedTransitions: ['COMPLETED', 'REJECTED'],
    conditions: {
      'COMPLETED': ['allRequirementsMet'],
      'REJECTED': ['hasRejectionReason']
    },
    requiredPermissions: {
      'COMPLETED': ['workflow.complete'],
      'REJECTED': ['workflow.reject']
    }
  },
  REJECTED: {
    allowedTransitions: ['DRAFT', 'CANCELLED'],
    conditions: {
      'DRAFT': ['canRevert'],
      'CANCELLED': ['canCancel']
    },
    requiredPermissions: {
      'DRAFT': ['workflow.revert'],
      'CANCELLED': ['workflow.cancel']
    }
  },
  COMPLETED: {
    allowedTransitions: [],
    conditions: {},
    requiredPermissions: {}
  },
  CANCELLED: {
    allowedTransitions: [],
    conditions: {},
    requiredPermissions: {}
  }
};

@Injectable()
export class WorkflowStateMachineService {
  private readonly logger = new Logger(WorkflowStateMachineService.name);

  constructor(private prisma: PrismaService) {}

  async validateTransition(
    workflowId: string,
    newStatus: string,
    userId: string
  ): Promise<WorkflowValidationResult> {
    try {
      const workflow = await this.getWorkflowWithDetails(workflowId);
      if (!workflow) {
        return {
          valid: false,
          errors: ['Workflow not found'],
          warnings: [],
          transitions: []
        };
      }

      const currentStatus = workflow.status;
      const result: WorkflowValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        transitions: []
      };

      // Check if transition is allowed
      if (!this.canTransition(currentStatus, newStatus)) {
        result.valid = false;
        result.errors.push(`Transition from ${currentStatus} to ${newStatus} is not allowed`);
        return result;
      }

      // Validate conditions
      const conditionErrors = await this.validateConditions(workflow, currentStatus, newStatus);
      result.errors.push(...conditionErrors);

      // Check permissions
      const permissionErrors = await this.validatePermissions(userId, currentStatus, newStatus);
      result.errors.push(...permissionErrors);

      // Generate available transitions
      result.transitions = await this.getAvailableTransitions(workflow, userId);

      result.valid = result.errors.length === 0;

      this.logger.log(`Workflow ${workflowId} transition validation: ${currentStatus} → ${newStatus} (${result.valid ? 'valid' : 'invalid'})`);

      return result;
    } catch (error) {
      this.logger.error(`Failed to validate transition for workflow ${workflowId}:`, error);
      return {
        valid: false,
        errors: ['Validation failed'],
        warnings: [],
        transitions: []
      };
    }
  }

  async executeTransition(
    workflowId: string,
    newStatus: string,
    userId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const validation = await this.validateTransition(workflowId, newStatus, userId);
      
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(', ')
        };
      }

      const workflow = await this.prisma.workflowInstance.findUnique({
        where: { id: workflowId }
      });

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found'
        };
      }

      const previousStatus = workflow.status;

      // Update workflow status
      await this.prisma.workflowInstance.update({
        where: { id: workflowId },
        data: {
          status: newStatus,
          updatedAt: new Date(),
          updatedBy: userId
        }
      });

      // Log transition
      await this.logTransition(workflowId, previousStatus, newStatus, userId, reason);

      // Execute status-specific actions
      await this.executeStatusActions(workflowId, newStatus, userId);

      this.logger.log(`Workflow ${workflowId} transitioned: ${previousStatus} → ${newStatus}`);

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to execute transition for workflow ${workflowId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  private canTransition(from: string, to: string): boolean {
    const transitions = WORKFLOW_TRANSITIONS[from];
    return transitions && transitions.allowedTransitions.includes(to);
  }

  private async validateConditions(
    workflow: any,
    currentStatus: string,
    newStatus: string
  ): Promise<string[]> {
    const errors: string[] = [];
    const conditions = WORKFLOW_TRANSITIONS[currentStatus]?.conditions?.[newStatus] || [];

    for (const condition of conditions) {
      const isValid = await this.checkCondition(workflow, condition);
      if (!isValid) {
        errors.push(`Condition not met: ${condition}`);
      }
    }

    return errors;
  }

  private async checkCondition(workflow: any, condition: string): Promise<boolean> {
    switch (condition) {
      case 'hasContent':
        return workflow.chapters && workflow.chapters.length > 0;
      
      case 'hasApprovers':
        const approvers = await this.prisma.approvalTask.findMany({
          where: { workflowInstanceId: workflow.id, status: 'PENDING' }
        });
        return approvers.length > 0;
      
      case 'allTasksCompleted':
        const pendingTasks = await this.prisma.approvalTask.findMany({
          where: { workflowInstanceId: workflow.id, status: 'PENDING' }
        });
        return pendingTasks.length === 0;
      
      case 'allApprovalsReceived':
        const approvals = await this.prisma.approvalTask.findMany({
          where: { 
            workflowInstanceId: workflow.id,
            status: { in: ['PENDING', 'REJECTED'] }
          }
        });
        return approvals.length === 0;
      
      case 'hasRejectionReason':
        // Check if rejection reason is provided in the request
        return true; // This should be validated in the controller
      
      case 'hasSuspensionReason':
        // Check if suspension reason is provided in the request
        return true; // This should be validated in the controller
      
      case 'canCancel':
        return ['DRAFT', 'IN_PROGRESS', 'SUSPENDED', 'REJECTED'].includes(workflow.status);
      
      case 'canResume':
        return workflow.status === 'SUSPENDED';
      
      case 'canRevert':
        return workflow.status === 'REJECTED';
      
      case 'allRequirementsMet':
        // Check if all completion requirements are met
        return await this.checkAllRequirementsMet(workflow);
      
      case 'hasValidContent':
        // Check if content passes validation rules
        return await this.checkContentValidation(workflow);
      
      case 'hasRequiredApprovals':
        // Check if all required approval roles are assigned
        return await this.checkRequiredApprovals(workflow);
      
      case 'contentReviewed':
        // Check if content has been reviewed by required reviewers
        return await this.checkContentReviewed(workflow);
      
      case 'complianceChecked':
        // Check if compliance requirements are met
        return await this.checkComplianceRequirements(workflow);
      
      case 'deadlineNotPassed':
        // Check if current date is before deadline
        return await this.checkDeadlineNotPassed(workflow);
      
      case 'hasEmergencyOverride':
        // Check if emergency override is available and valid
        return await this.checkEmergencyOverride(workflow);
      
      case 'organizationApproved':
        // Check if organization has approved the workflow
        return await this.checkOrganizationApproval(workflow);
      
      default:
        this.logger.warn(`Unknown condition: ${condition}`);
        return true;
    }
  }

  private async validatePermissions(
    userId: string,
    currentStatus: string,
    newStatus: string
  ): Promise<string[]> {
    const errors: string[] = [];
    const requiredPermissions = WORKFLOW_TRANSITIONS[currentStatus]?.requiredPermissions?.[newStatus] || [];

    // TODO: Implement actual permission checking
    // For now, we'll assume all permissions are granted
    this.logger.log(`Checking permissions for user ${userId}: ${requiredPermissions.join(', ')}`);

    return errors;
  }

  private async getAvailableTransitions(workflow: any, userId: string): Promise<WorkflowTransition[]> {
    const currentStatus = workflow.status;
    const allowedTransitions = WORKFLOW_TRANSITIONS[currentStatus]?.allowedTransitions || [];
    const transitions: WorkflowTransition[] = [];

    for (const toStatus of allowedTransitions) {
      const validation = await this.validateTransition(workflow.id, toStatus, userId);
      
      transitions.push({
        from: currentStatus,
        to: toStatus,
        allowed: validation.valid,
        conditions: WORKFLOW_TRANSITIONS[currentStatus]?.conditions?.[toStatus],
        requiredPermissions: WORKFLOW_TRANSITIONS[currentStatus]?.requiredPermissions?.[toStatus]
      });
    }

    return transitions;
  }

  private async logTransition(
    workflowId: string,
    from: string,
    to: string,
    userId: string,
    reason?: string
  ): Promise<void> {
    await this.prisma.workflowTransitionLog.create({
      data: {
        workflowInstanceId: workflowId,
        fromStatus: from,
        toStatus: to,
        userId,
        reason,
        timestamp: new Date()
      }
    });
  }

  private async executeStatusActions(
    workflowId: string,
    newStatus: string,
    userId: string
  ): Promise<void> {
    switch (newStatus) {
      case 'IN_PROGRESS':
        await this.startWorkflow(workflowId, userId);
        break;
      
      case 'APPROVED':
        await this.approveWorkflow(workflowId, userId);
        break;
      
      case 'REJECTED':
        await this.rejectWorkflow(workflowId, userId);
        break;
      
      case 'SUSPENDED':
        await this.suspendWorkflow(workflowId, userId);
        break;
      
      case 'COMPLETED':
        await this.completeWorkflow(workflowId, userId);
        break;
      
      case 'CANCELLED':
        await this.cancelWorkflow(workflowId, userId);
        break;
    }
  }

  private async startWorkflow(workflowId: string, userId: string): Promise<void> {
    // Create initial approval tasks
    const workflow = await this.getWorkflowWithDetails(workflowId);
    
    // TODO: Create approval tasks based on workflow definition
    this.logger.log(`Starting workflow ${workflowId}`);
  }

  private async approveWorkflow(workflowId: string, userId: string): Promise<void> {
    // Mark all pending tasks as approved
    await this.prisma.approvalTask.updateMany({
      where: { 
        workflowInstanceId: workflowId,
        status: 'PENDING'
      },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: userId
      }
    });

    this.logger.log(`Workflow ${workflowId} approved by ${userId}`);
  }

  private async rejectWorkflow(workflowId: string, userId: string): Promise<void> {
    // Mark all pending tasks as rejected
    await this.prisma.approvalTask.updateMany({
      where: { 
        workflowInstanceId: workflowId,
        status: 'PENDING'
      },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectedBy: userId
      }
    });

    this.logger.log(`Workflow ${workflowId} rejected by ${userId}`);
  }

  private async suspendWorkflow(workflowId: string, userId: string): Promise<void> {
    this.logger.log(`Workflow ${workflowId} suspended by ${userId}`);
  }

  private async completeWorkflow(workflowId: string, userId: string): Promise<void> {
    // Mark workflow as completed
    await this.prisma.workflowInstance.update({
      where: { id: workflowId },
      data: {
        completedAt: new Date(),
        completedBy: userId
      }
    });

    this.logger.log(`Workflow ${workflowId} completed by ${userId}`);
  }

  private async cancelWorkflow(workflowId: string, userId: string): Promise<void> {
    // Cancel all pending tasks
    await this.prisma.approvalTask.updateMany({
      where: { 
        workflowInstanceId: workflowId,
        status: 'PENDING'
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: userId
      }
    });

    this.logger.log(`Workflow ${workflowId} cancelled by ${userId}`);
  }

  private async getWorkflowWithDetails(workflowId: string): Promise<any> {
    return await this.prisma.workflowInstance.findUnique({
      where: { id: workflowId },
      include: {
        manual: {
          include: {
            chapters: true
          }
        },
        tasks: true,
        transitions: {
          orderBy: { timestamp: 'desc' }
        }
      }
    });
  }

  // Get workflow status statistics
  async getWorkflowStatistics(organizationId: string): Promise<any> {
    const stats = await this.prisma.workflowInstance.groupBy({
      by: ['status'],
      where: {
        manual: {
          organizationId
        }
      },
      _count: {
        id: true
      }
    });

    return stats.reduce((acc, stat) => {
      acc[stat.status] = stat._count.id;
      return acc;
    }, {});
  }

  // Get workflow transition history
  async getWorkflowHistory(workflowId: string): Promise<any[]> {
    return await this.prisma.workflowTransitionLog.findMany({
      where: { workflowInstanceId: workflowId },
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }

  // Business logic helper methods
  private async checkAllRequirementsMet(workflow: any): Promise<boolean> {
    try {
      // Check if manual has required chapters
      const chapters = await this.prisma.chapter.count({
        where: { manualId: workflow.manualId }
      });
      
      if (chapters === 0) {
        return false;
      }

      // Check if all required sections exist
      const requiredSections = ['safety', 'procedures', 'emergency'];
      for (const sectionType of requiredSections) {
        const sectionExists = await this.prisma.section.count({
          where: {
            chapter: { manualId: workflow.manualId },
            title: { contains: sectionType, mode: 'insensitive' }
          }
        });
        
        if (sectionExists === 0) {
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error(`Error checking requirements: ${error.message}`);
      return false;
    }
  }

  private async checkContentValidation(workflow: any): Promise<boolean> {
    try {
      // Check if content passes basic validation rules
      const blocks = await this.prisma.block.findMany({
        where: {
          section: {
            chapter: { manualId: workflow.manualId }
          }
        }
      });

      // Check for empty blocks
      const emptyBlocks = blocks.filter(block => 
        !block.content || block.content.trim().length < 10
      );

      if (emptyBlocks.length > 0) {
        this.logger.warn(`Found ${emptyBlocks.length} empty blocks`);
        return false;
      }

      // Check for required keywords in safety sections
      const safetyBlocks = await this.prisma.block.findMany({
        where: {
          section: {
            chapter: { manualId: workflow.manualId },
            title: { contains: 'safety', mode: 'insensitive' }
          }
        }
      });

      const requiredSafetyTerms = ['emergency', 'procedure', 'warning', 'caution'];
      for (const block of safetyBlocks) {
        const content = block.content.toLowerCase();
        const hasRequiredTerms = requiredSafetyTerms.some(term => 
          content.includes(term)
        );
        
        if (!hasRequiredTerms) {
          this.logger.warn(`Safety block ${block.id} missing required terms`);
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error(`Error checking content validation: ${error.message}`);
      return false;
    }
  }

  private async checkRequiredApprovals(workflow: any): Promise<boolean> {
    try {
      // Check if all required approval roles are assigned
      const requiredRoles = ['technical_reviewer', 'compliance_officer', 'final_approver'];
      
      for (const role of requiredRoles) {
        const roleAssigned = await this.prisma.approvalTask.count({
          where: {
            workflowInstanceId: workflow.id,
            role: role,
            status: { not: 'CANCELLED' }
          }
        });
        
        if (roleAssigned === 0) {
          this.logger.warn(`Required role ${role} not assigned`);
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error(`Error checking required approvals: ${error.message}`);
      return false;
    }
  }

  private async checkContentReviewed(workflow: any): Promise<boolean> {
    try {
      // Check if content has been reviewed by required reviewers
      const reviewTasks = await this.prisma.approvalTask.findMany({
        where: {
          workflowInstanceId: workflow.id,
          role: { contains: 'reviewer' },
          status: 'COMPLETED'
        }
      });

      // Check if all review tasks have comments/feedback
      for (const task of reviewTasks) {
        if (!task.comments || task.comments.trim().length < 10) {
          this.logger.warn(`Review task ${task.id} missing comments`);
          return false;
        }
      }

      return reviewTasks.length > 0;
    } catch (error) {
      this.logger.error(`Error checking content reviewed: ${error.message}`);
      return false;
    }
  }

  private async checkComplianceRequirements(workflow: any): Promise<boolean> {
    try {
      // Check if compliance requirements are met
      const complianceLinks = await this.prisma.complianceLink.findMany({
        where: {
          documentId: workflow.manualId,
          status: 'VALIDATED'
        }
      });

      // Check if all critical compliance links are validated
      const criticalLinks = complianceLinks.filter(link => 
        link.regulationTitle.toLowerCase().includes('critical') ||
        link.regulationTitle.toLowerCase().includes('mandatory')
      );

      if (criticalLinks.length === 0) {
        this.logger.warn('No critical compliance links found');
        return false;
      }

      // Check if all critical links are validated
      const unvalidatedCritical = criticalLinks.filter(link => 
        link.status !== 'VALIDATED'
      );

      return unvalidatedCritical.length === 0;
    } catch (error) {
      this.logger.error(`Error checking compliance requirements: ${error.message}`);
      return false;
    }
  }

  private async checkDeadlineNotPassed(workflow: any): Promise<boolean> {
    try {
      // Check if current date is before deadline
      if (!workflow.deadline) {
        return true; // No deadline set
      }

      const deadline = new Date(workflow.deadline);
      const now = new Date();
      
      return now < deadline;
    } catch (error) {
      this.logger.error(`Error checking deadline: ${error.message}`);
      return false;
    }
  }

  private async checkEmergencyOverride(workflow: any): Promise<boolean> {
    try {
      // Check if emergency override is available and valid
      const emergencyOverride = await this.prisma.emergencyOverride.findFirst({
        where: {
          workflowInstanceId: workflow.id,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() }
        }
      });

      return !!emergencyOverride;
    } catch (error) {
      this.logger.error(`Error checking emergency override: ${error.message}`);
      return false;
    }
  }

  private async checkOrganizationApproval(workflow: any): Promise<boolean> {
    try {
      // Check if organization has approved the workflow
      const manual = await this.prisma.manual.findUnique({
        where: { id: workflow.manualId },
        include: { organization: true }
      });

      if (!manual?.organization) {
        return false;
      }

      // Check if organization has approved this type of workflow
      const orgApproval = await this.prisma.organizationApproval.findFirst({
        where: {
          organizationId: manual.organization.id,
          workflowType: workflow.type,
          status: 'APPROVED'
        }
      });

      return !!orgApproval;
    } catch (error) {
      this.logger.error(`Error checking organization approval: ${error.message}`);
      return false;
    }
  }
}
