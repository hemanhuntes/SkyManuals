import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { SlackService } from './slack.service';
import { NotificationGateway } from './notification.gateway';

export interface NotificationChannels {
  email?: boolean;
  slack?: boolean;
  websocket?: boolean;
}

export interface NotificationData {
  userId: string;
  organizationId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  channels: NotificationChannels;
}

export interface NotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  slackEnabled: boolean;
  websocketEnabled: boolean;
  emailTypes: string[];
  slackTypes: string[];
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private slackService: SlackService,
    private notificationGateway: NotificationGateway
  ) {}

  async sendNotification(notification: NotificationData): Promise<{
    success: boolean;
    results: {
      email?: { success: boolean; error?: string };
      slack?: { success: boolean; error?: string };
      websocket?: { success: boolean; error?: string };
    };
  }> {
    this.logger.log(`Sending notification: ${notification.title} to user ${notification.userId}`);

    const results = {
      email: undefined,
      slack: undefined,
      websocket: undefined
    };

    try {
      // Get user preferences
      const preferences = await this.getUserPreferences(notification.userId);

      // Send email notification
      if (notification.channels.email && preferences.emailEnabled) {
        results.email = await this.sendEmailNotification(notification);
      }

      // Send Slack notification
      if (notification.channels.slack && preferences.slackEnabled) {
        results.slack = await this.sendSlackNotification(notification);
      }

      // Send WebSocket notification
      if (notification.channels.websocket && preferences.websocketEnabled) {
        results.websocket = await this.sendWebSocketNotification(notification);
      }

      // Store notification in database
      await this.storeNotification(notification);

      const success = Object.values(results).some(result => result?.success);

      this.logger.log(`Notification sent: ${notification.title} (success: ${success})`);

      return { success, results };
    } catch (error) {
      this.logger.error(`Failed to send notification:`, error);
      return {
        success: false,
        results
      };
    }
  }

  async sendTaskAssignedNotification(taskData: {
    userId: string;
    organizationId: string;
    taskTitle: string;
    manualTitle: string;
    chapterTitle: string;
    dueDate: string;
    priority: string;
    taskUrl: string;
    channels: NotificationChannels;
  }): Promise<{ success: boolean; results: any }> {
    const notification: NotificationData = {
      userId: taskData.userId,
      organizationId: taskData.organizationId,
      type: 'task_assigned',
      title: 'New Task Assigned',
      message: `You have been assigned: ${taskData.taskTitle}`,
      data: taskData,
      priority: taskData.priority === 'HIGH' ? 'high' : 'medium',
      channels: taskData.channels
    };

    const result = await this.sendNotification(notification);

    // Send specific channel notifications
    if (taskData.channels.slack) {
      await this.slackService.sendTaskAssignedNotification({
        taskTitle: taskData.taskTitle,
        manualTitle: taskData.manualTitle,
        chapterTitle: taskData.chapterTitle,
        assignedTo: taskData.userId,
        dueDate: taskData.dueDate,
        priority: taskData.priority,
        taskUrl: taskData.taskUrl
      });
    }

    if (taskData.channels.websocket) {
      await this.notificationGateway.sendTaskAssignedNotification(taskData.userId, {
        taskTitle: taskData.taskTitle,
        manualTitle: taskData.manualTitle,
        chapterTitle: taskData.chapterTitle,
        dueDate: taskData.dueDate,
        priority: taskData.priority,
        taskUrl: taskData.taskUrl
      });
    }

    return result;
  }

  async sendWorkflowStatusChangeNotification(workflowData: {
    organizationId: string;
    manualTitle: string;
    previousStatus: string;
    newStatus: string;
    updatedBy: string;
    updatedAt: string;
    workflowUrl: string;
    channels: NotificationChannels;
  }): Promise<{ success: boolean; results: any }> {
    const notification: NotificationData = {
      userId: workflowData.updatedBy,
      organizationId: workflowData.organizationId,
      type: 'workflow_status_change',
      title: 'Workflow Status Changed',
      message: `${workflowData.manualTitle} status changed to ${workflowData.newStatus}`,
      data: workflowData,
      priority: 'medium',
      channels: workflowData.channels
    };

    const result = await this.sendNotification(notification);

    // Send specific channel notifications
    if (workflowData.channels.slack) {
      await this.slackService.sendWorkflowStatusChangeNotification(workflowData);
    }

    if (workflowData.channels.websocket) {
      await this.notificationGateway.sendWorkflowStatusChangeNotification(
        workflowData.organizationId,
        workflowData
      );
    }

    return result;
  }

  async sendTaskOverdueNotification(taskData: {
    userId: string;
    taskTitle: string;
    manualTitle: string;
    dueDate: string;
    daysOverdue: number;
    taskUrl: string;
    channels: NotificationChannels;
  }): Promise<{ success: boolean; results: any }> {
    const notification: NotificationData = {
      userId: taskData.userId,
      organizationId: '', // Will be filled from user data
      type: 'task_overdue',
      title: 'Overdue Task',
      message: `Task "${taskData.taskTitle}" is ${taskData.daysOverdue} days overdue`,
      data: taskData,
      priority: 'urgent',
      channels: taskData.channels
    };

    const result = await this.sendNotification(notification);

    // Send specific channel notifications
    if (taskData.channels.slack) {
      await this.slackService.sendTaskOverdueNotification({
        taskTitle: taskData.taskTitle,
        manualTitle: taskData.manualTitle,
        dueDate: taskData.dueDate,
        daysOverdue: taskData.daysOverdue,
        priority: 'HIGH',
        taskUrl: taskData.taskUrl
      });
    }

    if (taskData.channels.websocket) {
      await this.notificationGateway.sendTaskOverdueNotification(taskData.userId, {
        taskTitle: taskData.taskTitle,
        manualTitle: taskData.manualTitle,
        dueDate: taskData.dueDate,
        daysOverdue: taskData.daysOverdue,
        taskUrl: taskData.taskUrl
      });
    }

    return result;
  }

  async sendChecklistCompletedNotification(checklistData: {
    organizationId: string;
    checklistTitle: string;
    manualTitle: string;
    completedBy: string;
    completedAt: string;
    itemsCompleted: number;
    totalItems: number;
    checklistUrl: string;
    channels: NotificationChannels;
  }): Promise<{ success: boolean; results: any }> {
    const notification: NotificationData = {
      userId: checklistData.completedBy,
      organizationId: checklistData.organizationId,
      type: 'checklist_completed',
      title: 'Checklist Completed',
      message: `${checklistData.checklistTitle} completed by ${checklistData.completedBy}`,
      data: checklistData,
      priority: 'low',
      channels: checklistData.channels
    };

    const result = await this.sendNotification(notification);

    // Send specific channel notifications
    if (checklistData.channels.slack) {
      await this.slackService.sendChecklistCompletedNotification(checklistData);
    }

    if (checklistData.channels.websocket) {
      await this.notificationGateway.sendChecklistCompletedNotification(
        checklistData.organizationId,
        checklistData
      );
    }

    return result;
  }

  async sendApprovalRequestedNotification(approvalData: {
    userId: string;
    organizationId: string;
    manualTitle: string;
    requestedBy: string;
    requestedAt: string;
    priority: string;
    dueDate: string;
    approvalUrl: string;
    channels: NotificationChannels;
  }): Promise<{ success: boolean; results: any }> {
    const notification: NotificationData = {
      userId: approvalData.userId,
      organizationId: approvalData.organizationId,
      type: 'approval_requested',
      title: 'Approval Requested',
      message: `Approval requested for ${approvalData.manualTitle}`,
      data: approvalData,
      priority: approvalData.priority === 'HIGH' ? 'high' : 'medium',
      channels: approvalData.channels
    };

    const result = await this.sendNotification(notification);

    // Send specific channel notifications
    if (approvalData.channels.email) {
      await this.emailService.sendEmail('approvalRequested', approvalData.userId, {
        userName: approvalData.userId, // Should be resolved from user data
        manualTitle: approvalData.manualTitle,
        requestedBy: approvalData.requestedBy,
        requestedAt: approvalData.requestedAt,
        priority: approvalData.priority,
        dueDate: approvalData.dueDate,
        approvalUrl: approvalData.approvalUrl
      });
    }

    if (approvalData.channels.slack) {
      await this.slackService.sendApprovalRequestedNotification(approvalData);
    }

    if (approvalData.channels.websocket) {
      await this.notificationGateway.sendApprovalRequestedNotification(approvalData.userId, approvalData);
    }

    return result;
  }

  // Legacy methods for backward compatibility
  async sendWorkflowStartNotification(workflowInstanceId: string): Promise<null> {
    this.logger.log(`📢 Workflow ${workflowInstanceId} started`);
    return null;
  }

  async sendWorkflowCancellationNotification(workflowInstanceId: string, reason?: string): Promise<null> {
    this.logger.log(`🚫 Workflow ${workflowInstanceId} cancelled: ${reason || 'No reason provided'}`);
    return null;
  }

  async sendTaskAssignedNotification(userId: string, workflowInstanceId: string): Promise<null> {
    this.logger.log(`🎯 Task assigned to user ${userId} for workflow ${workflowInstanceId}`);
    return null;
  }

  async sendCommentAddedNotification(commentId: string, mentionedUserIds: string[]): Promise<null> {
    this.logger.log(`💬 Comment ${commentId} added for mentions: ${mentionedUserIds.join(', ')}`);
    return null;
  }

  private async sendEmailNotification(notification: NotificationData): Promise<{ success: boolean; error?: string }> {
    try {
      // Get user email
      const user = await this.prisma.user.findUnique({
        where: { id: notification.userId },
        select: { email: true, name: true }
      });

      if (!user?.email) {
        return { success: false, error: 'User email not found' };
      }

      // Map notification type to email template
      const templateMap = {
        'task_assigned': 'taskAssigned',
        'workflow_status_change': 'workflowStatusChange',
        'task_overdue': 'taskOverdue',
        'checklist_completed': 'checklistCompleted',
        'approval_requested': 'approvalRequested'
      };

      const templateName = templateMap[notification.type] as keyof typeof this.emailService['templates'];
      if (!templateName) {
        return { success: false, error: 'No email template found for notification type' };
      }

      const result = await this.emailService.sendEmail(templateName, user.email, {
        userName: user.name || user.email,
        ...notification.data
      });

      return result;
    } catch (error) {
      this.logger.error(`Failed to send email notification:`, error);
      return { success: false, error: error.message };
    }
  }

  private async sendSlackNotification(notification: NotificationData): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.slackService.sendNotification({
        channel: 'general',
        message: notification.message,
        priority: notification.priority
      });

      return result;
    } catch (error) {
      this.logger.error(`Failed to send Slack notification:`, error);
      return { success: false, error: error.message };
    }
  }

  private async sendWebSocketNotification(notification: NotificationData): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.notificationGateway.sendToUser(notification.userId, {
        id: `notification-${Date.now()}`,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        priority: notification.priority,
        timestamp: new Date(),
        read: false,
        userId: notification.userId
      });

      return { success: result, error: result ? undefined : 'Failed to send WebSocket notification' };
    } catch (error) {
      this.logger.error(`Failed to send WebSocket notification:`, error);
      return { success: false, error: error.message };
    }
  }

  private async storeNotification(notification: NotificationData): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId: notification.userId,
          organizationId: notification.organizationId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          priority: notification.priority,
          read: false,
          createdAt: new Date()
        }
      });
    } catch (error) {
      this.logger.error(`Failed to store notification:`, error);
    }
  }

  private async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    // TODO: Implement user preferences from database
    // For now, return default preferences
    return {
      userId,
      emailEnabled: true,
      slackEnabled: true,
      websocketEnabled: true,
      emailTypes: ['task_assigned', 'workflow_status_change', 'task_overdue', 'approval_requested'],
      slackTypes: ['task_assigned', 'workflow_status_change', 'task_overdue', 'approval_requested']
    };
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details: any }> {
    const [emailHealth, slackHealth, websocketHealth] = await Promise.all([
      this.emailService.healthCheck(),
      this.slackService.healthCheck(),
      this.notificationGateway.healthCheck()
    ]);

    const allHealthy = emailHealth.status === 'healthy' && 
                      slackHealth.status === 'healthy' && 
                      websocketHealth.status === 'healthy';

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      details: {
        email: emailHealth,
        slack: slackHealth,
        websocket: websocketHealth
      }
    };
  }
}