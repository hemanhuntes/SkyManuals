import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@skymanuals/prisma';
import * as crypto from 'crypto';
import {
  AuditEvent,
  AuditEventType,
  AuditSeverity,
  ResourceType,
  RequestContext,
  AuditIntegrityCheck,
  AuditIntegrityResult,
} from '@skymanuals/types';

export interface AuditEventOptions {
  type: AuditEventType;
  severity?: AuditSeverity;
  action: string;
  resource: string;
  resourceId?: string;
  resourceType?: ResourceType;
  beforeData?: any;
  afterData?: any;
  duration?: number;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly lastEventCache = new Map<string, string>(); // Cache for previous hash lookups

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Log an audit event with automatic hash chain calculation
   */
  async logEvent(
    context: RequestContext,
    options: AuditEventOptions,
  ): Promise<AuditEvent> {
    try {
      const correlationId = this.extractCorrelationId(context);
      const previousHash = await this.getPreviousEventHash(
        context.organizationId,
        correlationId,
        options.type,
      );

      // Calculate data hashes
      const beforeHash = this.calculateHashForData(options.beforeData);
      const afterHash = this.calculateHashForData(options.afterData);

      // Create the audit event object
      const eventData = {
        id: crypto.randomUUID(),
        requestId: context.requestId,
        correlationId,
        userId: context.userId,
        userEmail: context.metadata?.userEmail,
        userRole: context.userRole,
        organizationId: context.organizationId,
        clientId: context.metadata?.clientId,
        eventType: options.type,
        action: options.action,
        resource: options.resource,
        resourceId: options.resourceId,
        resourceType: options.resourceType,
        timestamp: new Date().toISOString(),
        duration: options.duration,
        ipAddress: options.ipAddress || context.ipAddress,
        userAgent: options.userAgent || context.userAgent,
        endpoint: options.endpoint,
        severity: options.severity || this.defaultSeverity(options.type),
        beforeData: options.beforeData ? JSON.stringify(options.beforeData) : null,
        afterData: options.afterData ? JSON.stringify(options.afterData) : null,
        beforeHash,
        afterHash,
        previousHash,
        tags: options.tags || [],
        metadata: options.metadata || {},
      };

      // Calculate integrity hash (hash of entire event)
      const integrityHash = this.calculateEventIntegrityHash(eventData, previousHash);
      eventData.integrityHash = integrityHash;

      // Store in database
      const auditLog = await this.prisma.auditLog.create({
        data: {
          id: eventData.id,
          requestId: eventData.requestId,
          correlationId: eventData.correlationId,
          userId: eventData.userId,
          userEmail: eventData.userEmail,
          userRole: eventData.userRole,
          organizationId: eventData.organizationId,
          clientId: eventData.clientId,
          eventType: eventData.eventType,
          action: eventData.action,
          resource: eventData.resource,
          resourceId: eventData.resourceId,
          resourceType: eventData.resourceType,
          timestamp: new Date(eventData.timestamp),
          duration: eventData.duration,
          ipAddress: eventData.ipAddress,
          userAgent: eventData.userAgent,
          endpoint: eventData.endpoint,
          severity: eventData.severity,
          beforeData: eventData.beforeData,
          afterData: eventData.afterData,
          beforeHash: eventData.beforeHash,
          afterHash: eventData.afterHash,
          previousHash: eventData.previousHash,
          integrityHash: eventData.integrityHash,
          tags: eventData.tags,
          metadata: eventData.metadata,
        },
        include: {
          organization: {
            select: { name: true, slug: true },
          },
          user: {
            select: { name: true, email: true },
          },
        },
      });

      // Cache the new event hash for future chain calculations
      this.cacheEventHash(
        context.organizationId,
        correlationId,
        eventData.eventType,
        eventData.integrityHash,
      );

      this.logger.debug(
        `Audit event logged: ${options.type}:${options.action} for user ${context.userId}`,
      );

      return this.formatAuditEvent(auditLog);
    } catch (error) {
      this.logger.error('Failed to log audit event', error);
      throw new Error('Audit logging failed');
    }
  }

  /**
   * Log authentication events
   */
  async logAuthentication(
    context: RequestContext,
    action: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'SESSION_EXPIRED',
    userId: string,
    email: string,
    metadata?: Record<string, any>,
  ): Promise<AuditEvent> {
    return this.logEvent(context, {
      type: AuditEventType.AUTHENTICATION,
      severity: action === 'LOGIN_FAILED' ? AuditSeverity.HIGH : AuditSeverity.MEDIUM,
      action,
      resource: 'Authentication',
      resourceType: ResourceType.User,
      resourceId: userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      tags: ['security', 'authentication'],
      metadata: { email, ...metadata },
    });
  }

  /**
   * Log authorization events (permission checks, role changes)
   */
  async logAuthorization(
    context: RequestContext,
    action: string,
    resource: string,
    resourceId: string,
    granted: boolean,
    metadata?: Record<string, any>,
  ): Promise<AuditEvent> {
    return this.logEvent(context, {
      type: AuditEventType.AUTHORIZATION,
      severity: granted ? AuditSeverity.LOW : AuditSeverity.MEDIUM,
      action,
      resource,
      resourceId,
      resourceType: ResourceType.User,
      tags: ['security', 'authorization'],
      metadata: { granted, ...metadata },
    });
  }

  /**
   * Log data access events (READ operations)
   */
  async logDataAccess(
    context: RequestContext,
    resource: string,
    resourceId: string,
    resourceType: ResourceType,
    duration?: number,
  ): Promise<AuditEvent> {
    return this.logEvent(context, {
      type: AuditEventType.DATA_ACCESS,
      severity: AuditSeverity.LOW,
      action: 'READ',
      resource,
      resourceId,
      resourceType,
      duration,
      tags: ['data-access'],
    });
  }

  /**
   * Log data modification events (CREATE, UPDATE operations)
   */
  async logDataModification(
    context: RequestContext,
    action: 'CREATE' | 'UPDATE',
    resource: string,
    resourceId: string,
    resourceType: ResourceType,
    beforeData?: any,
    afterData?: any,
    duration?: number,
  ): Promise<AuditEvent> {
    return this.logEvent(context, {
      type: AuditEventType.DATA_MODIFICATION,
      severity: AuditSeverity.MEDIUM,
      action,
      resource,
      resourceId,
      resourceType,
      beforeData,
      afterData,
      duration,
      tags: ['data-modification'],
    });
  }

  /**
   * Log data deletion events
   */
  async logDataDeletion(
    context: RequestContext,
    resource: string,
    resourceId: string,
    resourceType: ResourceType,
    deletedData: any,
    duration?: number,
  ): Promise<AuditEvent> {
    return this.logEvent(context, {
      type: AuditEventType.DATA_DELETION,
      severity: AuditSeverity.HIGH,
      action: 'DELETE',
      resource,
      resourceId,
      resourceType,
      beforeData: deletedData,
      duration,
      tags: ['data-deletion', 'destructive'],
    });
  }

  /**
   * Log role change events
   */
  async logRoleChange(
    context: RequestContext,
    targetUserId: string,
    currentRole: string,
    newRole: string,
    reason?: string,
  ): Promise<AuditEvent> {
    return this.logEvent(context, {
      type: AuditEventType.ROLE_CHANGE,
      severity: AuditSeverity.HIGH,
      action: 'ROLE_CHANGE',
      resource: 'User Role',
      resourceId: targetUserId,
      resourceType: ResourceType.User,
      beforeData: { role: currentRole },
      afterData: { role: newRole, reason },
      tags: ['role-management', 'authorization'],
    });
  }

  /**
   * Log security events
   */
  async logSecurityEvent(
    context: RequestContext,
    action: string,
    resource: string,
    resourceId: string,
    severity: AuditSeverity,
    metadata?: Record<string, any>,
  ): Promise<AuditEvent> {
    return this.logEvent(context, {
      type: AuditEventType.SECURITY_EVENT,
      severity,
      action,
      resource,
      resourceId,
      resourceType: ResourceType.User,
      tags: ['security', 'security-event'],
      metadata,
    });
  }

  /**
   * Search audit logs with filtering
   */
  async searchAuditLogs(
    organizationId: string,
    filters: {
      userIds?: string[];
      eventTypes?: AuditEventType[];
      severities?: AuditSeverity[];
      resourceTypes?: ResourceType[];
      startDate?: Date;
      endDate?: Date;
      query?: string;
    },
    pagination: {
      page: number;
      pageSize: number;
    },
  ) {
    const whereConditions: any = {
      organizationId,
    };

    if (filters.userIds?.length) {
      whereConditions.userId = { in: filters.userIds };
    }

    if (filters.eventTypes?.length) {
      whereConditions.eventType = { in: filters.eventTypes };
    }

    if (filters.severities?.length) {
      whereConditions.severity = { in: filters.severities };
    }

    if (filters.resourceTypes?.length) {
      whereConditions.resourceType = { in: filters.resourceTypes };
    }

    if (filters.startDate) {
      whereConditions.timestamp = { ...whereConditions.timestamp, gte: filters.startDate };
    }

    if (filters.endDate) {
      whereConditions.timestamp = { ...whereConditions.timestamp, lte: filters.endDate };
    }

    if (filters.query) {
      whereConditions.OR = [
        { action: { contains: filters.query, mode: 'insensitive' } },
        { resource: { contains: filters.query, mode: 'insensitive' } },
        { endpoint: { contains: filters.query, mode: 'insensitive' } },
      ];
    }

    const [auditLogs, totalCount] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: whereConditions,
        include: {
          user: {
            select: { name: true, email: true },
          },
          organization: {
            select: { name: true, slug: true },
          },
        },
        orderBy: { timestamp: 'desc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      this.prisma.auditLog.count({ where: whereConditions }),
    ]);

    return {
      auditLogs: auditLogs.map(this.formatAuditEvent),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pagination.pageSize),
      },
    };
  }

  /**
   * Verify audit log integrity chain
   */
  async verifyIntegrity(
    organizationId: string,
    correlationId: string,
  ): Promise<AuditIntegrityResult> {
    const events = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        correlationId,
      },
      orderBy: { timestamp: 'asc' },
    });

    if (events.length === 0) {
      return {
        isValid: true,
        verifiedEvents: 0,
        totalEvents: 0,
        chainBroken: false,
      };
    }

    let verifiedEvents = 0;
    let chainBroken = false;
    let previousHash: string | undefined;

    for (const event of events) {
      const calculatedHash = this.calculateEventIntegrityHash(
        this.formatAuditEvent(event),
        previousHash,
      );

      if (event.integrityHash === calculatedHash) {
        verifiedEvents++;
      } else {
        chainBroken = true;
        break;
      }

      previousHash = event.integrityHash;
    }

    return {
      isValid: !chainBroken,
      verifiedEvents,
      totalEvents: events.length,
      chainBroken,
    };
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(
    organizationId: string,
    filters: {
      eventTypes?: AuditEventType[];
      severities?: AuditSeverity[];
      startDate: Date;
      endDate: Date;
      includeBeforeAfter?: boolean;
    },
    format: 'json' | 'csv' | 'excel' = 'json',
  ) {
    const audits = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        eventType: filters.eventTypes ? { in: filters.eventTypes } : undefined,
        severity: filters.severities ? { in: filters.severities } : undefined,
        timestamp: {
          gte: filters.startDate,
          lte: filters.endDate,
        },
      },
      include: {
        user: { select: { name: true, email: true } },
        organization: { select: { name: true } },
      },
      orderBy: { timestamp: 'desc' },
    });

    const formattedAudits = audits.map(audit => {
      const base = {
        timestamp: audit.timestamp.toISOString(),
        eventType: audit.eventType,
        action: audit.action,
        resource: audit.resource,
        resourceId: audit.resourceId,
        userId: audit.userId,
        userEmail: audit.userEmail,
        userRole: audit.userRole,
        severity: audit.severity,
        ipAddress: audit.ipAddress,
        integrityHash: audit.integrityHash,
      };

      if (filters.includeBeforeAfter) {
        return {
          ...base,
          beforeData: audit.before<｜tool▁call▁begin｜>data,
          afterData: audit.afterData,
          beforeHash: audit.beforeHash,
          afterHash: audit.afterHash,
        };
      }

      return base;
    });

    switch (format) {
      case 'csv':
        return this.generateCSV(formattedAudits);
      case 'excel':
        return this.generateExcel(formattedAudits);
      default:
        return formattedAudits;
    }
  }

  /**
   * Utility methods
   */
  private extractCorrelationId(context: RequestContext): string {
    return context.correlationId || context.requestId;
  }

  private async getPreviousEventHash(
    organizationId: string,
    correlationId: string,
    eventType: AuditEventType,
  ): Promise<string | undefined> {
    const cacheKey = `${organizationId}:${correlationId}:${eventType}`;
    
    if (this.lastEventCache.has(cacheKey)) {
      return this.lastEventCache.get(cacheKey);
    }

    const lastEvent = await this.prisma.auditLog.findFirst({
      where: {
        organizationId,
        correlationId,
        eventType,
      },
      orderBy: { timestamp: 'desc' },
      select: { integrityHash: true },
    });

    return lastEvent?.integrityHash;
  }

  private calculateHashForData(data: any): string | undefined {
    return data ? this.calculateDataHash(data) : undefined;
  }

  private calculateDataHash(data: any): string {
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  private calculateEventIntegrityHash(
    eventData: any,
    previousHash?: string,
  ): string {
    const components = [
      eventData.requestId,
      eventData.userId || 'system',
      eventData.organizationId,
      eventData.eventType,
      eventData.action,
      eventData.resource,
      eventData.resourceId || '',
      eventData.timestamp,
      eventData.beforeHash || '',
      eventData.afterHash || '',
      previousHash || '',
    ];

    const hashInput = components.join('|');
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  private cacheEventHash(
    organizationId: string,
    correlationId: string,
    eventType: AuditEventType,
    integrityHash: string,
  ): void {
    const cacheKey = `${organizationId}:${correlationId}:${eventType}`;
    this.lastEventCache.set(cacheKey, integrityHash);
  }

  private formatAuditEvent(auditLog: any): AuditEvent {
    return {
      id: auditLog.id,
      requestId: auditLog.requestId,
      correlationId: auditLog.correlationId,
      userId: auditLog.userId,
      userEmail: auditLog.userEmail,
      userRole: auditLog.userRole,
      organizationId: auditLog.organizationId,
      clientId: auditLog.clientId,
      eventType: auditLog.eventType,
      action: auditLog.action,
      resource: auditLog.resource,
      resourceId: auditLog.resourceId,
      resourceType: auditLog.resourceType,
      timestamp: auditLog.timestamp.toISOString(),
      duration: auditLog.duration,
      ipAddress: auditLog.ipAddress,
      userAgent: auditLog.userAgent,
      endpoint: auditLog.endpoint,
      severity: auditLog.severity,
      beforeData: auditLog.beforeData ? JSON.parse(auditLog.beforeData) : undefined,
      afterData: auditLog.afterData ? JSON.parse(auditLog.afterData) : undefined,
      beforeHash: auditLog.beforeHash,
      afterHash: auditLog.afterHash,
      previousHash: auditLog.previousHash,
      integrityHash: auditLog.integrityHash,
      tags: auditLog.tags,
      metadata: auditLog.metadata,
    };
  }

  private defaultSeverity(eventType: AuditEventType): AuditSeverity {
    const severityMap: Record<AuditEventType, AuditSeverity> = {
      [AuditEventType.AUTHENTICATION]: AuditSeverity.MEDIUM,
      [AuditEventType.AUTHORIZATION]: AuditSeverity.MEDIUM,
      [AuditEventType.DATA_ACCESS]: AuditSeverity.LOW,
      [AuditEventType.DATA_MODIFICATION]: AuditSeverity.MEDIUM,
      [AuditEventType.DATA_DELETION]: AuditSeverity.HIGH,
      [AuditEventType.PERMISSION_CHANGE]: AuditSeverity.HIGH,
      [AuditEventType.ROLE_CHANGE]: AuditSeverity.HIGH,
      [AuditEventType.ORGANIZATION_CHANGE]: AuditSeverity.HIGH,
      [AuditEventType.SECURITY_EVENT]: AuditSeverity.HIGH,
      [AuditEventType.SYSTEM_EVENT]: AuditSeverity.MEDIUM,
    };

    return severityMap[eventType] || AuditSeverity.MEDIUM;
  }

  private generateCSV(audits: any[]): string {
    if (audits.length === 0) return '';

    const headers = Object.keys(audits[0]).join(',');
    const rows = audits.map(audit => 
      Object.values(audit).map(v => `"${v}"`).join(',')
    );

    return [headers, ...rows].join('\n');
  }

  private generateExcel(audits: any[]): Buffer {
    // In a real implementation, you would use a library like xlsx
    // For now, return CSV as buffer
    const csvContent = this.generateCSV(audits);
    return Buffer.from(csvContent);
  }
}
