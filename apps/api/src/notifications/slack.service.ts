import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface SlackMessage {
  text?: string;
  blocks?: any[];
  attachments?: any[];
  channel?: string;
  username?: string;
  icon_emoji?: string;
  icon_url?: string;
}

export interface SlackNotification {
  channel: string;
  message: string;
  blocks?: any[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface SlackChannelConfig {
  id: string;
  name: string;
  webhookUrl: string;
  enabled: boolean;
  notificationTypes: string[];
}

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly httpClient: AxiosInstance;

  // Default channel configurations
  private readonly defaultChannels: SlackChannelConfig[] = [
    {
      id: 'general',
      name: 'general',
      webhookUrl: process.env.SLACK_GENERAL_WEBHOOK_URL || '',
      enabled: true,
      notificationTypes: ['workflow_status', 'task_assigned', 'approval_requested']
    },
    {
      id: 'alerts',
      name: 'alerts',
      webhookUrl: process.env.SLACK_ALERTS_WEBHOOK_URL || '',
      enabled: true,
      notificationTypes: ['task_overdue', 'workflow_error', 'system_alert']
    },
    {
      id: 'approvals',
      name: 'approvals',
      webhookUrl: process.env.SLACK_APPROVALS_WEBHOOK_URL || '',
      enabled: true,
      notificationTypes: ['approval_requested', 'approval_completed', 'checklist_completed']
    }
  ];

  constructor(private configService: ConfigService) {
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async sendNotification(notification: SlackNotification): Promise<{ success: boolean; error?: string }> {
    try {
      const channelConfig = this.getChannelConfig(notification.channel);
      
      if (!channelConfig || !channelConfig.enabled) {
        this.logger.warn(`Channel ${notification.channel} not configured or disabled`);
        return { success: false, error: 'Channel not configured' };
      }

      const message: SlackMessage = {
        text: notification.message,
        username: 'SkyManuals',
        icon_emoji: this.getIconForPriority(notification.priority),
        channel: notification.channel,
        blocks: notification.blocks || this.createDefaultBlocks(notification)
      };

      const response = await this.httpClient.post(channelConfig.webhookUrl, message);

      if (response.status === 200) {
        this.logger.log(`Slack notification sent to ${notification.channel}`);
        return { success: true };
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send Slack notification to ${notification.channel}:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendTaskAssignedNotification(taskData: {
    taskTitle: string;
    manualTitle: string;
    chapterTitle: string;
    assignedTo: string;
    dueDate: string;
    priority: string;
    taskUrl: string;
  }): Promise<{ success: boolean; error?: string }> {
    const message = `📋 New task assigned: ${taskData.taskTitle}`;
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📋 New Task Assigned'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Task:* ${taskData.taskTitle}`
          },
          {
            type: 'mrkdwn',
            text: `*Manual:* ${taskData.manualTitle}`
          },
          {
            type: 'mrkdwn',
            text: `*Chapter:* ${taskData.chapterTitle}`
          },
          {
            type: 'mrkdwn',
            text: `*Assigned To:* ${taskData.assignedTo}`
          },
          {
            type: 'mrkdwn',
            text: `*Due Date:* ${taskData.dueDate}`
          },
          {
            type: 'mrkdwn',
            text: `*Priority:* ${taskData.priority}`
          }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Review Task'
            },
            url: taskData.taskUrl,
            style: 'primary'
          }
        ]
      }
    ];

    return this.sendNotification({
      channel: 'approvals',
      message,
      blocks,
      priority: taskData.priority === 'HIGH' ? 'high' : 'medium'
    });
  }

  async sendWorkflowStatusChangeNotification(workflowData: {
    manualTitle: string;
    previousStatus: string;
    newStatus: string;
    updatedBy: string;
    updatedAt: string;
    workflowUrl: string;
  }): Promise<{ success: boolean; error?: string }> {
    const message = `🔄 Workflow status changed: ${workflowData.manualTitle}`;
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔄 Workflow Status Update'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Manual:* ${workflowData.manualTitle}`
          },
          {
            type: 'mrkdwn',
            text: `*Status:* ${workflowData.previousStatus} → ${workflowData.newStatus}`
          },
          {
            type: 'mrkdwn',
            text: `*Updated By:* ${workflowData.updatedBy}`
          },
          {
            type: 'mrkdwn',
            text: `*Updated At:* ${workflowData.updatedAt}`
          }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Workflow'
            },
            url: workflowData.workflowUrl,
            style: 'primary'
          }
        ]
      }
    ];

    return this.sendNotification({
      channel: 'general',
      message,
      blocks,
      priority: 'medium'
    });
  }

  async sendTaskOverdueNotification(taskData: {
    taskTitle: string;
    manualTitle: string;
    dueDate: string;
    daysOverdue: number;
    priority: string;
    taskUrl: string;
  }): Promise<{ success: boolean; error?: string }> {
    const message = `⚠️ Overdue task: ${taskData.taskTitle}`;
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚠️ Overdue Task Alert'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Task:* ${taskData.taskTitle}`
          },
          {
            type: 'mrkdwn',
            text: `*Manual:* ${taskData.manualTitle}`
          },
          {
            type: 'mrkdwn',
            text: `*Due Date:* ${taskData.dueDate}`
          },
          {
            type: 'mrkdwn',
            text: `*Days Overdue:* ${taskData.daysOverdue}`
          },
          {
            type: 'mrkdwn',
            text: `*Priority:* ${taskData.priority}`
          }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Complete Task'
            },
            url: taskData.taskUrl,
            style: 'danger'
          }
        ]
      }
    ];

    return this.sendNotification({
      channel: 'alerts',
      message,
      blocks,
      priority: 'urgent'
    });
  }

  async sendChecklistCompletedNotification(checklistData: {
    checklistTitle: string;
    manualTitle: string;
    completedBy: string;
    completedAt: string;
    itemsCompleted: number;
    totalItems: number;
    checklistUrl: string;
  }): Promise<{ success: boolean; error?: string }> {
    const message = `✅ Checklist completed: ${checklistData.checklistTitle}`;
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '✅ Checklist Completed'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Checklist:* ${checklistData.checklistTitle}`
          },
          {
            type: 'mrkdwn',
            text: `*Manual:* ${checklistData.manualTitle}`
          },
          {
            type: 'mrkdwn',
            text: `*Completed By:* ${checklistData.completedBy}`
          },
          {
            type: 'mrkdwn',
            text: `*Completed At:* ${checklistData.completedAt}`
          },
          {
            type: 'mrkdwn',
            text: `*Items:* ${checklistData.itemsCompleted}/${checklistData.totalItems}`
          }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Checklist'
            },
            url: checklistData.checklistUrl,
            style: 'primary'
          }
        ]
      }
    ];

    return this.sendNotification({
      channel: 'approvals',
      message,
      blocks,
      priority: 'low'
    });
  }

  async sendApprovalRequestedNotification(approvalData: {
    manualTitle: string;
    requestedBy: string;
    requestedAt: string;
    priority: string;
    dueDate: string;
    approvalUrl: string;
  }): Promise<{ success: boolean; error?: string }> {
    const message = `🔍 Approval requested: ${approvalData.manualTitle}`;
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔍 Approval Requested'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Manual:* ${approvalData.manualTitle}`
          },
          {
            type: 'mrkdwn',
            text: `*Requested By:* ${approvalData.requestedBy}`
          },
          {
            type: 'mrkdwn',
            text: `*Requested At:* ${approvalData.requestedAt}`
          },
          {
            type: 'mrkdwn',
            text: `*Priority:* ${approvalData.priority}`
          },
          {
            type: 'mrkdwn',
            text: `*Due Date:* ${approvalData.dueDate}`
          }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Review & Approve'
            },
            url: approvalData.approvalUrl,
            style: 'primary'
          }
        ]
      }
    ];

    return this.sendNotification({
      channel: 'approvals',
      message,
      blocks,
      priority: approvalData.priority === 'HIGH' ? 'high' : 'medium'
    });
  }

  private getChannelConfig(channelId: string): SlackChannelConfig | undefined {
    return this.defaultChannels.find(channel => channel.id === channelId);
  }

  private getIconForPriority(priority: string): string {
    switch (priority) {
      case 'urgent':
        return ':rotating_light:';
      case 'high':
        return ':exclamation:';
      case 'medium':
        return ':warning:';
      case 'low':
        return ':information_source:';
      default:
        return ':airplane:';
    }
  }

  private createDefaultBlocks(notification: SlackNotification): any[] {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: notification.message
        }
      }
    ];
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details?: any }> {
    try {
      const enabledChannels = this.defaultChannels.filter(channel => channel.enabled);
      const configuredChannels = enabledChannels.filter(channel => channel.webhookUrl);

      return {
        status: configuredChannels.length > 0 ? 'healthy' : 'unhealthy',
        details: {
          totalChannels: this.defaultChannels.length,
          enabledChannels: enabledChannels.length,
          configuredChannels: configuredChannels.length,
          channels: configuredChannels.map(ch => ({ id: ch.id, name: ch.name }))
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }

  // Test webhook
  async testWebhook(channelId: string): Promise<{ success: boolean; error?: string }> {
    return this.sendNotification({
      channel: channelId,
      message: '🧪 Test notification from SkyManuals',
      priority: 'low'
    });
  }
}
