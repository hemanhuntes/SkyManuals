import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Logger
} from '@nestjs/common';
import { NotificationService, NotificationData, NotificationChannels } from './notification.service';
import { EmailService } from './email.service';
import { SlackService } from './slack.service';
import { NotificationGateway } from './notification.gateway';
import { WorkflowStateMachineService } from '../workflows/workflow-state-machine.service';

@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(
    private notificationService: NotificationService,
    private emailService: EmailService,
    private slackService: SlackService,
    private notificationGateway: NotificationGateway,
    private workflowStateMachineService: WorkflowStateMachineService
  ) {}

  // Send custom notification
  @Post()
  async sendNotification(
    @Body() notificationData: NotificationData,
    @Req() req: any
  ) {
    this.logger.log(`Sending notification: ${notificationData.title}`);

    try {
      const result = await this.notificationService.sendNotification(notificationData);
      
      return {
        success: result.success,
        message: 'Notification sent',
        results: result.results
      };
    } catch (error) {
      this.logger.error(`Failed to send notification:`, error);
      return {
        success: false,
        message: 'Failed to send notification',
        error: error.message
      };
    }
  }

  // Send task assigned notification
  @Post('task-assigned')
  async sendTaskAssignedNotification(
    @Body() taskData: {
      userId: string;
      taskTitle: string;
      manualTitle: string;
      chapterTitle: string;
      dueDate: string;
      priority: string;
      taskUrl: string;
      channels: NotificationChannels;
    },
    @Req() req: any
  ) {
    this.logger.log(`Sending task assigned notification to user ${taskData.userId}`);

    try {
      const result = await this.notificationService.sendTaskAssignedNotification({
        ...taskData,
        organizationId: req.user.organizationId
      });

      return {
        success: result.success,
        message: 'Task assigned notification sent',
        results: result.results
      };
    } catch (error) {
      this.logger.error(`Failed to send task assigned notification:`, error);
      return {
        success: false,
        message: 'Failed to send task assigned notification',
        error: error.message
      };
    }
  }

  // Send workflow status change notification
  @Post('workflow-status-change')
  async sendWorkflowStatusChangeNotification(
    @Body() workflowData: {
      manualTitle: string;
      previousStatus: string;
      newStatus: string;
      updatedBy: string;
      workflowUrl: string;
      channels: NotificationChannels;
    },
    @Req() req: any
  ) {
    this.logger.log(`Sending workflow status change notification`);

    try {
      const result = await this.notificationService.sendWorkflowStatusChangeNotification({
        ...workflowData,
        organizationId: req.user.organizationId,
        updatedAt: new Date().toISOString()
      });

      return {
        success: result.success,
        message: 'Workflow status change notification sent',
        results: result.results
      };
    } catch (error) {
      this.logger.error(`Failed to send workflow status change notification:`, error);
      return {
        success: false,
        message: 'Failed to send workflow status change notification',
        error: error.message
      };
    }
  }

  // Send task overdue notification
  @Post('task-overdue')
  async sendTaskOverdueNotification(
    @Body() taskData: {
      userId: string;
      taskTitle: string;
      manualTitle: string;
      dueDate: string;
      daysOverdue: number;
      taskUrl: string;
      channels: NotificationChannels;
    }
  ) {
    this.logger.log(`Sending task overdue notification to user ${taskData.userId}`);

    try {
      const result = await this.notificationService.sendTaskOverdueNotification(taskData);

      return {
        success: result.success,
        message: 'Task overdue notification sent',
        results: result.results
      };
    } catch (error) {
      this.logger.error(`Failed to send task overdue notification:`, error);
      return {
        success: false,
        message: 'Failed to send task overdue notification',
        error: error.message
      };
    }
  }

  // Send checklist completed notification
  @Post('checklist-completed')
  async sendChecklistCompletedNotification(
    @Body() checklistData: {
      checklistTitle: string;
      manualTitle: string;
      completedBy: string;
      itemsCompleted: number;
      totalItems: number;
      checklistUrl: string;
      channels: NotificationChannels;
    },
    @Req() req: any
  ) {
    this.logger.log(`Sending checklist completed notification`);

    try {
      const result = await this.notificationService.sendChecklistCompletedNotification({
        ...checklistData,
        organizationId: req.user.organizationId,
        completedAt: new Date().toISOString()
      });

      return {
        success: result.success,
        message: 'Checklist completed notification sent',
        results: result.results
      };
    } catch (error) {
      this.logger.error(`Failed to send checklist completed notification:`, error);
      return {
        success: false,
        message: 'Failed to send checklist completed notification',
        error: error.message
      };
    }
  }

  // Send approval requested notification
  @Post('approval-requested')
  async sendApprovalRequestedNotification(
    @Body() approvalData: {
      userId: string;
      manualTitle: string;
      requestedBy: string;
      priority: string;
      dueDate: string;
      approvalUrl: string;
      channels: NotificationChannels;
    },
    @Req() req: any
  ) {
    this.logger.log(`Sending approval requested notification to user ${approvalData.userId}`);

    try {
      const result = await this.notificationService.sendApprovalRequestedNotification({
        ...approvalData,
        organizationId: req.user.organizationId,
        requestedAt: new Date().toISOString()
      });

      return {
        success: result.success,
        message: 'Approval requested notification sent',
        results: result.results
      };
    } catch (error) {
      this.logger.error(`Failed to send approval requested notification:`, error);
      return {
        success: false,
        message: 'Failed to send approval requested notification',
        error: error.message
      };
    }
  }

  // Test email service
  @Post('test/email')
  async testEmailService(
    @Body() data: { to: string; template: string },
    @Req() req: any
  ) {
    this.logger.log(`Testing email service with template ${data.template}`);

    try {
      const result = await this.emailService.sendEmail(
        data.template as any,
        data.to,
        {
          userName: 'Test User',
          taskTitle: 'Test Task',
          manualTitle: 'Test Manual',
          chapterTitle: 'Test Chapter',
          dueDate: new Date().toLocaleDateString(),
          priority: 'MEDIUM',
          taskUrl: 'https://test.com'
        }
      );

      return {
        success: result.success,
        message: 'Email test completed',
        result
      };
    } catch (error) {
      this.logger.error(`Failed to test email service:`, error);
      return {
        success: false,
        message: 'Email test failed',
        error: error.message
      };
    }
  }

  // Test Slack service
  @Post('test/slack')
  async testSlackService(
    @Body() data: { channel: string },
    @Req() req: any
  ) {
    this.logger.log(`Testing Slack service on channel ${data.channel}`);

    try {
      const result = await this.slackService.testWebhook(data.channel);

      return {
        success: result.success,
        message: 'Slack test completed',
        result
      };
    } catch (error) {
      this.logger.error(`Failed to test Slack service:`, error);
      return {
        success: false,
        message: 'Slack test failed',
        error: error.message
      };
    }
  }

  // Test WebSocket service
  @Get('test/websocket')
  async testWebSocketService(@Req() req: any) {
    this.logger.log(`Testing WebSocket service`);

    try {
      const result = await this.notificationGateway.sendToUser(req.user.id, {
        id: `test-${Date.now()}`,
        type: 'test',
        title: 'Test Notification',
        message: 'This is a test notification from SkyManuals',
        data: { test: true },
        priority: 'low',
        timestamp: new Date(),
        read: false,
        userId: req.user.id
      });

      return {
        success: result,
        message: 'WebSocket test completed'
      };
    } catch (error) {
      this.logger.error(`Failed to test WebSocket service:`, error);
      return {
        success: false,
        message: 'WebSocket test failed',
        error: error.message
      };
    }
  }

  // Get notification health status
  @Get('health')
  async getNotificationHealth() {
    try {
      const health = await this.notificationService.healthCheck();

      return {
        success: true,
        health
      };
    } catch (error) {
      this.logger.error(`Failed to get notification health:`, error);
      return {
        success: false,
        message: 'Failed to get notification health',
        error: error.message
      };
    }
  }

  // Get workflow state machine statistics
  @Get('workflow/statistics')
  async getWorkflowStatistics(@Req() req: any) {
    try {
      const stats = await this.workflowStateMachineService.getWorkflowStatistics(req.user.organizationId);

      return {
        success: true,
        statistics: stats
      };
    } catch (error) {
      this.logger.error(`Failed to get workflow statistics:`, error);
      return {
        success: false,
        message: 'Failed to get workflow statistics',
        error: error.message
      };
    }
  }

  // Validate workflow transition
  @Post('workflow/validate-transition')
  async validateWorkflowTransition(
    @Body() data: { workflowId: string; newStatus: string },
    @Req() req: any
  ) {
    try {
      const validation = await this.workflowStateMachineService.validateTransition(
        data.workflowId,
        data.newStatus,
        req.user.id
      );

      return {
        success: true,
        validation
      };
    } catch (error) {
      this.logger.error(`Failed to validate workflow transition:`, error);
      return {
        success: false,
        message: 'Failed to validate workflow transition',
        error: error.message
      };
    }
  }

  // Execute workflow transition
  @Post('workflow/execute-transition')
  async executeWorkflowTransition(
    @Body() data: { workflowId: string; newStatus: string; reason?: string },
    @Req() req: any
  ) {
    try {
      const result = await this.workflowStateMachineService.executeTransition(
        data.workflowId,
        data.newStatus,
        req.user.id,
        data.reason
      );

      return {
        success: result.success,
        message: result.success ? 'Workflow transition executed' : 'Workflow transition failed',
        error: result.error
      };
    } catch (error) {
      this.logger.error(`Failed to execute workflow transition:`, error);
      return {
        success: false,
        message: 'Failed to execute workflow transition',
        error: error.message
      };
    }
  }

  // Get workflow history
  @Get('workflow/:id/history')
  async getWorkflowHistory(@Param('id') workflowId: string) {
    try {
      const history = await this.workflowStateMachineService.getWorkflowHistory(workflowId);

      return {
        success: true,
        history
      };
    } catch (error) {
      this.logger.error(`Failed to get workflow history:`, error);
      return {
        success: false,
        message: 'Failed to get workflow history',
        error: error.message
      };
    }
  }
}
