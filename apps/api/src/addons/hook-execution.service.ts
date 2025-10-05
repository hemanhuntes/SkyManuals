import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@skymanuals/prisma';
import { AddonService } from './addon.service';
import { AuditService } from '../audit/audit.service';
import * as crypto from 'crypto';
import * as request from 'supertest';
import {
  HookExecutionRequest,
  HookExecutionResponse,
  HookEvent,
  HookType,
  InstallStatus,
  RequestContext,
  AuditEventType,
  AuditSeverity,
} from '@skymanuals/types';

@Injectable()
export class HookExecutionService {
  private readonly logger = new Logger(HookExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly addonService: AddonService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Execute a hook for a specific installation
   */
  async executeHook(
    requestData: HookExecutionRequest,
    context: RequestContext,
): Promise<HookExecutionResponse> {
    const startTime = Date.now();

    try {
      // Get installation details
      const installation = await this.prisma.installation.findUnique({
        where: { id: requestData.installationId },
        include: {
          addon: true,
          organization: true,
        },
      });

      if (!installation) {
        throw new Error('Installation not found');
      }

      // Check if installation is active
      if (installation.status !== 'ACTIVE') {
        throw new Error('Installation is not active');
      }

      // Check if hook type is enabled for this installation
      if (!installation.enabledHooks.includes(requestData.hookType)) {
        this.logger.warn(`Hook ${requestData.hookType} not enabled for installation ${requestData.installationId}`);
        return {
          success: true,
          executionId: crypto.randomUUID(),
          duration: Date.now() - startTime,
          status: 'SUCCESS',
        };
      }

      // Prepare hook event
      const hookEvent: HookEvent = {
        hookType: requestData.hookType,
        timestamp: new Date().toISOString(),
        organizationId: installation.organizationId,
        userId: context.userId,
        resourceId: requestData.payload.resourceId,
        resourceType: requestData.payload.resourceType,
        payload: requestData.payload,
        metadata: {
          ...requestData.metadata,
          installationVersion: installation.installedVersion,
          addonType: installation.addon.type,
        },
      };

      // Create hook execution record
      const execution = await this.prisma.hookExecution.create({
        data: {
          installationId: requestData.installationId,
          hookType: requestData.hookType,
          webhookUrl: installation.webhookUrl!,
          event: hookEvent,
          correlationId: requestData.correlationId,
          status: 'PENDING',
        },
      });

      // Execute the webhook
      const result = await this.executeWebhook(installation.webhookUrl!, hookEvent);

      // Update execution record
      await this.prisma.hookExecution.update({
        where: { id: execution.id },
        data: {
          status: result.success ? 'SUCCESS' : 'FAILED',
          requestDuration: result.duration,
          responseStatus: result.responseStatus,
          responseBody: result.responseBody,
          error: result.error,
          retryCount: result.retryCount || 0,
        },
      });

      // Update installation webhook call count
      await this.updateWebhookCallCount(installation.id);
      
      // Log audit event
      await this.logHookExecution(context, installation, requestData.hookType, result);

      return {
        success: result.success,
        executionId: execution.id,
        duration: result.duration,
        status: result.success ? 'SUCCESS' : 'FAILED',
        error: result.error,
        retryCount: result.retryCount || 0,
        responseData: result.responseData,
      };
    } catch (error) {
      this.logger.error('Hook execution failed', error);
      return {
        success: false,
        executionId: crypto.randomUUID(),
        duration: Date.now() - startTime,
        status: 'FAILED',
        error: error.message,
      };
    }
  }

  /**
   * Execute webhook call
   */
  private async executeWebhook(webhookUrl: string, event: HookEvent): Promise<any> {
    const startTime = Date.now();
    const timeout = parseInt(this.configService.get('WEBHOOK_TIMEOUT') || '30000');

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SkyManuals-Signature': this.generateWebhookSignature(event),
          'X-SkyManuals-Hook-Type': event.hookType,
          'X-SkyManuals-Event-ID': crypto.randomUUID(),
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(timeout),
      });

      const duration = Date.now() - startTime;
      
      let responseBody: string | undefined;
      try {
        responseBody = await response.text();
      } catch (error) {
        responseBody = 'Unable to read response body';
      }

      return {
        success: response.ok,
        duration,
        responseStatus: response.status,
        responseBody,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      return {
        success: false,
        duration,
        error: error.message,
      };
    }
  }

  /**
   * Bulk hook execution for multiple installations
   */
  async executeBulkHooks(
    hookType: HookType,
    payload: Record<string, any>,
    organizationId?: string,
  ): Promise<any[]> {
    try {
      // Get all active installations that have this hook type enabled
      const whereConditions: any = {
        status: 'ACTIVE',
        enabledHooks: { has: hookType },
      };

      if (organizationId) {
        whereConditions.organizationId = organizationId;
      }

      const installations = await this.prisma.installation.findMany({
        where: whereConditions,
        include: {
          addon: true,
          organization: true,
        },
      });

      const results = [];

      for (const installation of installations) {
        try {
          // Simulate context for bulk execution
          const context: RequestContext = {
            requestId: crypto.randomUUID(),
            organizationId: installation.organizationId,
            userId: 'system', // System-initiated bulk execution
            userRole: undefined,
            permissions: [],
            timestamp: new Date().toISOString(),
          };

          const requestData: HookExecutionRequest = {
            installationId: installation.id,
            hookType,
            payload,
            correlationId: crypto.randomUUID(),
          };

          const result = await this.executeHook(requestData, context);
          results.push({ installationId: installation.id, ...result });
        } catch (error) {
          results.push({
            installationId: installation.id,
            success: false,
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      this.logger.error('Bulk hook execution failed', error);
      throw error;
    }
  }

  /**
   * Process failed hook executions for retry
   */
  async processFailedHookExecutions(): Promise<void> {
    try {
      // Get failed executions that haven't exceeded max retries
      const failedExecutions = await this.prisma.hookExecution.findMany({
        where: {
          status: 'FAILED',
          retryCount: { lt: 3 },
          nextRetryAt: { lte: new Date() },
        },
        include: {
          installation: {
            include: { addon: true },
          },
        },
        take: 100, // Process in batches
      });

      for (const execution of failedExecutions) {
        try {
          // Re-execute the hook
          const executionRequest: HookExecutionRequest = {
            installationId: execution.installationId,
            hookType: execution.hookType,
            payload: execution.event.payload,
            metadata: execution.event.metadata,
            correlationId: execution.correlationId,
          };

          // Simulate context for retry
          const context: RequestContext = {
            requestId: crypto.randomUUID(),
            organizationId: execution.event.organizationId,
            userId: execution.event.userId || 'system',
            userRole: undefined,
            permissions: [],
            timestamp: new Date().toISOString(),
          };

          const result = await this.executeHook(executionRequest, context);

          // Update execution record
          await this.prisma.hookExecution.update({
            where: { id: execution.id },
            data: {
              retryCount: { increment: 1 },
              nextRetryAt: result.success ? null : this.calculateNextRetryTime(execution.retryCount + 1),
            },
          });
        } catch (error) {
          // Update retry count even on failure
          await this.prisma.hookExecution.update({
            where: { id: execution.id },
            data: { retryCount: { increment: 1 } },
          });
        }
      }

      this.logger.log(`Processed ${failedExecutions.length} failed hook executions for retry`);
    } catch (error) {
      this.logger.error('Failed to process failed hook executions', error);
    }
  }

  /**
   * Get hook execution logs for an organization
   */
  async getHookExecutionLogs(
    organizationId: string,
    filters: {
      installationId?: string;
      hookType?: HookType;
      status?: string;
      startDate?: Date;
      endDate?: Date;
    },
    pagination: { page: number; pageSize: number },
  ) {
    const whereConditions: any = {
      installation: {
        organizationId,
      },
    };

    if (filters.installationId) {
      whereConditions.installationId = filters.installationId;
    }

    if (filters.hookType) {
      whereConditions.hookType = filters.hookType;
    }

    if (filters.status) {
      whereConditions.status = filters.status;
    }

    if (filters.startDate) {
      whereConditions.executedAt = { ...whereConditions.executedAt, gte: filters.startDate };
    }

    if (filters.endDate) {
      whereConditions.executedAt = { ...whereConditions.executedAt, lte: filters.endDate };
    }

    const [executions, totalCount] = await Promise.all([
      this.prisma.hookExecution.findMany({
        where: whereConditions,
        include: {
          installation: {
            include: { addon: { select: { name: true, type: true } } },
          },
          attempts: { orderBy: { sequence: 'asc' } },
        },
        orderBy: { executedAt: 'desc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      this.prisma.hookExecution.count({ where: whereConditions }),
    ]);

    return {
      executions,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pagination.pageSize),
      },
    };
  }

  /**
   * Utility methods
   */
  private generateWebhookSignature(event: HookEvent): string {
    const secret = this.configService.get('WEBHOOK_SECRET') || 'default-secret';
    const payload = JSON.stringify(event);
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  private async updateWebhookCallCount(installationId: string): Promise<void> {
    await this.prisma.installation.update({
      where: { id: installationId },
      data: { webhookCallsThisMonth: { increment: 1 } },
    });
  }

  private async logHookExecution(
    context: RequestContext,
    installation: any,
    hookType: HookType,
    result: any,
  ): Promise<void> {
    try {
      await this.auditService.logEvent(context, {
        type: AuditEventType.DATA_ACCESS,
        severity: AuditSeverity.LOW,
        action: `ADDON_HOOK_EXECUTION`,
        resource: 'Hook Execution',
        resourceId: installation.id,
        resourceType: 'Addon' as any,
        duration: result.duration,
        metadata: {
          addonId: installation.addonId,
          addonName: installation.addon.name,
          hookType,
          success: result.success,
          responseStatus: result.responseStatus,
        },
      });
    } catch (error) {
      this.logger.warn('Failed to log hook execution audit event', error);
    }
  }

  private calculateNextRetryTime(retryCount: number): Date {
    // Exponential backoff: 1min, 5min, 15min, then give up
    const delays = [1, 5, 15];
    const minutes = retryCount < delays.length ? delays[retryCount] : delays[delays.length - 1];
    return new Date(Date.now() + minutes * 60 * 1000);
  }
}






