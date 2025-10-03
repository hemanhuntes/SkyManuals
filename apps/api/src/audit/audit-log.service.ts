import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

export interface AuditLogEntry {
  entityType: 'Manual' | 'Chapter' | 'Section' | 'Block' | 'User' | 'Organization' | 'Device' | 'Workflow' | 'Compliance';
  entityId: string;
  action: string;
  userId: string;
  organizationId: string;
  timestamp: Date;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface ComplianceMetadata {
  // Aviation specific compliance tracking
  regulatoryFrameworks: Array<'EASA' | 'FAA' | 'ICAO' | 'EU-OPS'>;
  certificationLevel: 'OPERATIONAL' | 'SAFETY' | 'MAINTENANCE' | 'TRAINING';
  effectiveDate: Date;
  retentionPeriodDays: number;
  documentSource: 'OEM' | 'AUTHORED' | 'IMPORTED' | 'APPROVED';
  chainOfCustody: Array<{
    userId: string;
    action: string;
    timestamp: Date;
    signature?: string;
  }>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Log aviation-compliant audit entry with regulatory tracking
   */
  async logAviationAction(entry: AuditLogEntry & { 
    complianceMetadata?: ComplianceMetadata 
  }): Promise<void> {
    try {
      // Calculate integrity hash for chain verification
      const integrityHash = this.calculateIntegrityHash(entry);
      
      // Store in aviation-compliant audit log
      await this.prisma.auditLog.create({
        data: {
          id: this.generateId(),
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          userId: entry.userId,
          organizationId: entry.organizationId,
          timestamp: entry.timestamp,
          oldValues: entry.oldValues ? JSON.stringify(entry.oldValues) : null,
          newValues: entry.newValues ? JSON.stringify(entry.newValues) : null,
          metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
          complianceMetadata: entry.complianceMetadata ? JSON.stringify(entry.complianceMetadata) : null,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          sessionId: entry.sessionId,
          integrityHash,
          previousHash: await this.getPreviousHash(entry.organizationId),
          
          // Aviation-specific fields
          regulatoryFramework: entry.complianceMetadata?.regulatoryFrameworks?.join(',') || null,
          certificationLevel: entry.complianceMetadata?.certificationLevel || null,
          effectiveDate: entry.complianceMetadata?.effectiveDate || null,
          retentionPeriodDays: entry.complianceMetadata?.retentionPeriodDays || null,
          documentSource: entry.complianceMetadata?.documentSource || null,
        },
      });

      // Log to structured log for monitoring
      this.logger.log('Aviation audit logged', {
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        userId: entry.userId,
        organizationId: entry.organizationId,
        regulatoryFrameworks: entry.complianceMetadata?.regulatoryFrameworks,
        integrityHash,
      });
    } catch (error) {
      this.logger.error('Failed to log aviation audit entry', error);
      throw new Error('Audit logging failed - critical for aviation compliance');
    }
  }

  /**
   * Generate compliance report for regulatory audits
   */
  async generateComplianceReport(params: {
    organizationId: string;
    startDate: Date;
    endDate: Date;
    regulatoryFrameworks?: Array<'EASA' | 'FAA' | 'ICAO' | 'EU-OPS'>;
    includeChainOfCustody?: boolean;
  }) {
    const { organizationId, startDate, endDate, regulatoryFrameworks, includeChainOfCustody } = params;

    const audits = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
        ...(regulatoryFrameworks && {
          regulatoryFramework: {
            in: regulatoryFrameworks,
          },
        }),
      },
      orderBy: { timestamp: 'desc' },
    });

    const report = {
      summary: {
        totalAuditEntries: audits.length,
        dateRange: { startDate, endDate },
        regulatoryFrameworks: regulatoryFrameworks || ['EASA', 'FAA', 'ICAO'],
        integrityVerified: await this.verifyIntegrityChain(organizationId, startDate, endDate),
      },
      entries: audits.map(audit => ({
        id: audit.id,
        entityType: audit.entityType,
        entityId: audit.entityId,
        action: audit.action,
        userId: audit.userId,
        timestamp: audit.timestamp,
        regulatoryFramework: audit.regulatoryFramework,
        certificationLevel: audit.certificationLevel,
        integrityHash: audit.integrityHash,
        ...(includeChainOfCustody && {
          oldValues: audit.oldValues ? JSON.parse(audit.oldValues) : null,
          newValues: audit.newValues ? JSON.parse(audit.newValues) : null,
          complianceMetadata: audit.complianceMetadata ? JSON.parse(audit.complianceMetadata) : null,
        }),
      })),
      chainOfCustodyVerified: await this.verifyChainOfCustody(organizationId, startDate, endDate),
    };

    return report;
  }

  /**
   * Verify integrity chain for regulatory compliance
   */
  private async verifyIntegrityHash(entry: AuditLogEntry): string {
    const dataString = JSON.stringify({
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      userId: entry.userId,
      organizationId: entry.organizationId,
      timestamp: entry.timestamp.toISOString(),
      oldValues: entry.oldValues,
      newValues: entry.newValues,
    });

    return createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Get previous hash for chain verification
   */
  private async getPreviousHash(organizationId: string): Promise<string | null> {
    const previousEntry = await this.prisma.auditLog.findFirst({
      where: { organizationId },
      orderBy: { timestamp: 'desc' },
      select: { integrityHash: true },
    });

    return previousEntry?.integrityHash || null;
  }

  /**
   * Verify integrity chain for compliance reporting
   */
  private async verifyIntegrityChain(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<boolean> {
    const audits = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    let previousHash: string | null = null;

    for (const audit of audits) {
      const expectedHash = await this.calculateExpectedHash(audit, previousHash);
      if (expectedHash !== audit.integrityHash) {
        this.logger.error('Integrity chain broken', {
          auditId: audit.id,
          expectedHash,
          actualHash: audit.integrityHash,
          organizationId,
        });
        return false;
      }
      previousHash = audit.integrityHash;
    }

    return true;
  }

  /**
   * Verify chain of custody for regulatory compliance
   */
  private async verifyChainOfCustody(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ verified: boolean; breaks: Array<{ auditId: string; issue: string }> }> {
    const breaks: Array<{ auditId: string; issue: string }> = [];

    // Check for suspicious patterns that might indicate tampering
    const suspiciousPatterns = await this.prisma.auditLog.groupBy({
      by: ['userId'],
      where: {
        organizationId,
        timestamp: { gte: startDate, lte: endDate },
      },
      _count: { id: true },
      having: {
        id: {
          _count: {
            gt: 1000, // More than 1000 actions per day might be suspicious
          },
        },
      },
    });

    suspiciousPatterns.forEach(pattern => {
      breaks.push({
        auditId: pattern.userId,
        issue: `High activity volume: ${pattern._count.id} actions`,
      });
    });

    // Check for missing timestamps (gap analysis)
    const timestampGaps = await this.findTimestampGaps(organizationId, startDate, endDate);
    breaks.push(...timestampGaps);

    return {
      verified: breaks.length === 0,
      breaks,
    };
  }

  private async calculateExpectedHash(audit: any, previousHash: string | null): Promise<string> {
    const dataString = JSON.stringify({
      entityType: audit.entityType,
      entityId: audit.entityId,
      action: audit.action,
      userId: audit.userId,
      organizationId: audit.organizationId,
      timestamp: audit.timestamp.toISOString(),
      previousHash,
    });

    return createHash('sha256').update(dataString).digest('hex');
  }

  private async findTimestampGaps(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Array<{ auditId: string; issue: string }>> {
    // Implementation for detecting suspicious timestamp gaps
    // This would check for missing time periods that might indicate tampering
    return [];
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export audit logs for regulatory inspection
   */
  async exportAuditLogsForInspection(params: {
    organizationId: string;
    startDate: Date;
    endDate: Date;
    format: 'json' | 'csv' | 'xml';
    regulatoryFramework?: string;
  }) {
    const audits = await this.prisma.auditLog.findMany({
      where: {
        organizationId: params.organizationId,
        timestamp: {
          gte: params.startDate,
          lte: params.endDate,
        },
        ...(params.regulatoryFramework && {
          regulatoryFramework: params.regulatoryFramework,
        }),
      },
      orderBy: { timestamp: 'asc' },
    });

    // Format output for regulatory inspection
    switch (params.format) {
      case 'json':
        return this.formatAsJson(audits);
      case 'csv':
        return this.formatAsCsv(audits);
      case 'xml':
        return this.formatAsXml(audits);
      default:
        throw new Error('Unsupported export format');
    }
  }

  private formatAsJson(audits: any[]): string {
    return JSON.stringify(audits.map(audit => ({
      id: audit.id,
      timestamp: audit.timestamp,
      entityType: audit.entityType,
      entityId: audit.entityId,
      action: audit.action,
      userId: audit.userId,
      regulatoryFramework: audit.regulatoryFramework,
      complianceMetadata: audit.complianceMetadata ? JSON.parse(audit.complianceMetadata) : null,
      integrityHash: audit.integrityHash,
    })), null, 2);
  }

  private formatAsCsv(audits: any[]): string {
    const headers = [
      'ID', 'Timestamp', 'EntityType', 'EntityID', 'Action', 'UserID',
      'RegulatoryFramework', 'CertificationLevel', 'IntegrityHash'
    ];
    
    const rows = audits.map(audit => [
      audit.id,
      audit.timestamp.toISOString(),
      audit.entityType,
      audit.entityId,
      audit.action,
      audit.userId,
      audit.regulatoryFramework || '',
      audit.certificationLevel || '',
      audit.integrityHash,
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  private formatAsXml(audits: any[]): string {
    // Format as XML for regulatory submission
    return `<?xml version="1.0" encoding="UTF-8"?>
<AuditLogExport>
  ${audits.map(audit => `
  <AuditEntry>
    <ID>${audit.id}</ID>
    <Timestamp>${audit.timestamp.toISOString()}</Timestamp>
    <EntityType>${audit.entityType}</EntityType>
    <EntityID>${audit.entityId}</EntityID>
    <Action>${audit.action}</Action>
    <UserID>${audit.userId}</UserID>
    <RegulatoryFramework>${audit.regulatoryFramework || ''}</RegulatoryFramework>
    <IntegrityHash>${audit.integrityHash}</IntegrityHash>
  </AuditEntry>`).join('')}
</AuditLogExport>`;
  }
}
