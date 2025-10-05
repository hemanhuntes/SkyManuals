import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand, SendEmailCommandInput } from '@aws-sdk/client-ses';
import { v4 as uuidv4 } from 'uuid';

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailData {
  [key: string]: any;
}

export interface EmailOptions {
  from?: string;
  replyTo?: string;
  tags?: { Name: string; Value: string }[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private sesClient: SESClient;

  // Email templates
  private readonly templates = {
    taskAssigned: {
      subject: 'New Approval Task: {{taskTitle}}',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #007acc; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background: #f9f9f9; }
              .task-info { background: white; padding: 15px; border-left: 4px solid #007acc; margin: 15px 0; }
              .button { display: inline-block; background: #007acc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 15px 0; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>✈️ SkyManuals</h1>
                <h2>New Task Assigned</h2>
              </div>
              <div class="content">
                <p>Hi {{userName}},</p>
                <p>You have been assigned a new approval task:</p>
                <div class="task-info">
                  <h3>{{taskTitle}}</h3>
                  <p><strong>Manual:</strong> {{manualTitle}}</p>
                  <p><strong>Chapter:</strong> {{chapterTitle}}</p>
                  <p><strong>Due Date:</strong> {{dueDate}}</p>
                  <p><strong>Priority:</strong> {{priority}}</p>
                </div>
                <p>Please review and approve this task as soon as possible.</p>
                <a href="{{taskUrl}}" class="button">Review Task</a>
              </div>
              <div class="footer">
                <p>This is an automated message from SkyManuals</p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
        New Task Assigned - SkyManuals
        
        Hi {{userName}},
        
        You have been assigned: {{taskTitle}}
        Manual: {{manualTitle}}
        Chapter: {{chapterTitle}}
        Due: {{dueDate}}
        Priority: {{priority}}
        
        Review Task: {{taskUrl}}
      `
    },

    workflowStatusChange: {
      subject: 'Workflow Status Changed: {{manualTitle}}',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #28a745; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background: #f9f9f9; }
              .status-info { background: white; padding: 15px; border-left: 4px solid #28a745; margin: 15px 0; }
              .button { display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 15px 0; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>✈️ SkyManuals</h1>
                <h2>Workflow Status Update</h2>
              </div>
              <div class="content">
                <p>Hi {{userName}},</p>
                <p>The workflow status has been updated:</p>
                <div class="status-info">
                  <h3>{{manualTitle}}</h3>
                  <p><strong>Previous Status:</strong> {{previousStatus}}</p>
                  <p><strong>New Status:</strong> {{newStatus}}</p>
                  <p><strong>Updated By:</strong> {{updatedBy}}</p>
                  <p><strong>Updated At:</strong> {{updatedAt}}</p>
                </div>
                <a href="{{workflowUrl}}" class="button">View Workflow</a>
              </div>
              <div class="footer">
                <p>This is an automated message from SkyManuals</p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
        Workflow Status Changed - SkyManuals
        
        Hi {{userName}},
        
        {{manualTitle}} status changed:
        From: {{previousStatus}}
        To: {{newStatus}}
        Updated by: {{updatedBy}}
        At: {{updatedAt}}
        
        View: {{workflowUrl}}
      `
    },

    taskOverdue: {
      subject: '⚠️ Overdue Task: {{taskTitle}}',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background: #f9f9f9; }
              .task-info { background: white; padding: 15px; border-left: 4px solid #dc3545; margin: 15px 0; }
              .button { display: inline-block; background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 15px 0; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>⚠️ SkyManuals</h1>
                <h2>Overdue Task Alert</h2>
              </div>
              <div class="content">
                <p>Hi {{userName}},</p>
                <p>This task is now overdue and requires immediate attention:</p>
                <div class="task-info">
                  <h3>{{taskTitle}}</h3>
                  <p><strong>Manual:</strong> {{manualTitle}}</p>
                  <p><strong>Due Date:</strong> {{dueDate}}</p>
                  <p><strong>Days Overdue:</strong> {{daysOverdue}}</p>
                  <p><strong>Priority:</strong> {{priority}}</p>
                </div>
                <a href="{{taskUrl}}" class="button">Complete Task</a>
              </div>
              <div class="footer">
                <p>This is an automated message from SkyManuals</p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
        Overdue Task Alert - SkyManuals
        
        Hi {{userName}},
        
        This task is overdue: {{taskTitle}}
        Manual: {{manualTitle}}
        Due: {{dueDate}}
        Days Overdue: {{daysOverdue}}
        Priority: {{priority}}
        
        Complete: {{taskUrl}}
      `
    },

    checklistCompleted: {
      subject: '✅ Checklist Completed: {{checklistTitle}}',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #28a745; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background: #f9f9f9; }
              .checklist-info { background: white; padding: 15px; border-left: 4px solid #28a745; margin: 15px 0; }
              .button { display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 15px 0; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>✅ SkyManuals</h1>
                <h2>Checklist Completed</h2>
              </div>
              <div class="content">
                <p>Hi {{userName}},</p>
                <p>The following checklist has been completed:</p>
                <div class="checklist-info">
                  <h3>{{checklistTitle}}</h3>
                  <p><strong>Manual:</strong> {{manualTitle}}</p>
                  <p><strong>Completed By:</strong> {{completedBy}}</p>
                  <p><strong>Completed At:</strong> {{completedAt}}</p>
                  <p><strong>Items Completed:</strong> {{itemsCompleted}}/{{totalItems}}</p>
                </div>
                <a href="{{checklistUrl}}" class="button">View Checklist</a>
              </div>
              <div class="footer">
                <p>This is an automated message from SkyManuals</p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
        Checklist Completed - SkyManuals
        
        Hi {{userName}},
        
        Checklist completed: {{checklistTitle}}
        Manual: {{manualTitle}}
        Completed by: {{completedBy}}
        At: {{completedAt}}
        Items: {{itemsCompleted}}/{{totalItems}}
        
        View: {{checklistUrl}}
      `
    },

    approvalRequested: {
      subject: '🔍 Approval Requested: {{manualTitle}}',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #ffc107; color: #333; padding: 20px; text-align: center; }
              .content { padding: 20px; background: #f9f9f9; }
              .approval-info { background: white; padding: 15px; border-left: 4px solid #ffc107; margin: 15px 0; }
              .button { display: inline-block; background: #ffc107; color: #333; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 15px 0; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🔍 SkyManuals</h1>
                <h2>Approval Requested</h2>
              </div>
              <div class="content">
                <p>Hi {{userName}},</p>
                <p>An approval is required for the following manual:</p>
                <div class="approval-info">
                  <h3>{{manualTitle}}</h3>
                  <p><strong>Requested By:</strong> {{requestedBy}}</p>
                  <p><strong>Requested At:</strong> {{requestedAt}}</p>
                  <p><strong>Priority:</strong> {{priority}}</p>
                  <p><strong>Due Date:</strong> {{dueDate}}</p>
                </div>
                <a href="{{approvalUrl}}" class="button">Review & Approve</a>
              </div>
              <div class="footer">
                <p>This is an automated message from SkyManuals</p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
        Approval Requested - SkyManuals
        
        Hi {{userName}},
        
        Approval needed for: {{manualTitle}}
        Requested by: {{requestedBy}}
        At: {{requestedAt}}
        Priority: {{priority}}
        Due: {{dueDate}}
        
        Review: {{approvalUrl}}
      `
    }
  };

  constructor(private configService: ConfigService) {
    // Initialize SES client
    this.sesClient = new SESClient({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async sendEmail(
    templateName: keyof typeof this.templates,
    to: string | string[],
    data: EmailData,
    options: EmailOptions = {}
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const template = this.templates[templateName];
      if (!template) {
        throw new Error(`Template ${templateName} not found`);
      }

      // Render template with data
      const subject = this.renderTemplate(template.subject, data);
      const html = this.renderTemplate(template.html, data);
      const text = template.text ? this.renderTemplate(template.text, data) : undefined;

      // Prepare email command
      const emailParams: SendEmailCommandInput = {
        Source: options.from || this.configService.get('EMAIL_FROM', 'noreply@skymanuals.com'),
        Destination: {
          ToAddresses: Array.isArray(to) ? to : [to],
        },
        Message: {
          Subject: { Data: subject },
          Body: {
            Html: { Data: html },
            ...(text && { Text: { Data: text } }),
          },
        },
        ...(options.replyTo && { ReplyToAddresses: [options.replyTo] }),
        ...(options.tags && { Tags: options.tags }),
      };

      // Send email
      const command = new SendEmailCommand(emailParams);
      const result = await this.sesClient.send(command);

      this.logger.log(`Email sent successfully: ${result.MessageId} to ${Array.isArray(to) ? to.join(', ') : to}`);

      return {
        success: true,
        messageId: result.MessageId,
      };
    } catch (error) {
      this.logger.error(`Failed to send email to ${Array.isArray(to) ? to.join(', ') : to}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async sendBulkEmail(
    templateName: keyof typeof this.templates,
    recipients: { email: string; data: EmailData }[],
    options: EmailOptions = {}
  ): Promise<{ success: boolean; results: any[] }> {
    const results = [];

    for (const recipient of recipients) {
      const result = await this.sendEmail(templateName, recipient.email, recipient.data, options);
      results.push({
        email: recipient.email,
        ...result,
      });
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.log(`Bulk email sent: ${successCount}/${recipients.length} successful`);

    return {
      success: successCount === recipients.length,
      results,
    };
  }

  private renderTemplate(template: string, data: EmailData): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  }

  async validateEmailAddress(email: string): Promise<boolean> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async getSendingQuota(): Promise<any> {
    try {
      const command = new (await import('@aws-sdk/client-ses')).GetSendQuotaCommand({});
      const result = await this.sesClient.send(command);
      
      return {
        max24HourSend: result.Max24HourSend,
        maxSendRate: result.MaxSendRate,
        sentLast24Hours: result.SentLast24Hours,
      };
    } catch (error) {
      this.logger.error('Failed to get sending quota:', error);
      return null;
    }
  }

  async getSendStatistics(): Promise<any> {
    try {
      const command = new (await import('@aws-sdk/client-ses')).GetSendStatisticsCommand({});
      const result = await this.sesClient.send(command);
      
      return result.SendDataPoints || [];
    } catch (error) {
      this.logger.error('Failed to get send statistics:', error);
      return [];
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details?: any }> {
    try {
      const quota = await this.getSendingQuota();
      return {
        status: 'healthy',
        details: {
          quota,
          region: this.configService.get('AWS_REGION'),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message },
      };
    }
  }
}
