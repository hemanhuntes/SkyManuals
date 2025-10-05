import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIComplianceService } from './openai-compliance.service';
import { ImpactAnalysisService, ImpactAnalysis, ComplianceAlert } from './impact-analysis.service';

export interface ComplianceDashboard {
  overview: ComplianceOverview;
  trends: ComplianceTrends;
  alerts: ComplianceAlert[];
  recentAnalyses: ImpactAnalysis[];
  riskDistribution: RiskDistribution;
  upcomingDeadlines: Deadline[];
  complianceMetrics: ComplianceMetrics;
}

export interface ComplianceOverview {
  totalDocuments: number;
  compliantDocuments: number;
  nonCompliantDocuments: number;
  pendingReview: number;
  overallCompliance: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  lastUpdated: Date;
}

export interface ComplianceTrends {
  complianceHistory: Array<{
    date: Date;
    compliance: number;
    documents: number;
  }>;
  trendDirection: 'UP' | 'DOWN' | 'STABLE';
  trendPercentage: number;
  period: string;
}

export interface RiskDistribution {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  total: number;
}

export interface Deadline {
  id: string;
  title: string;
  type: 'REGULATION_UPDATE' | 'COMPLIANCE_REVIEW' | 'TRAINING_REQUIRED' | 'AUDIT';
  dueDate: Date;
  daysRemaining: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
  assignedTo?: string;
  documentId?: string;
}

export interface ComplianceMetrics {
  averageComplianceScore: number;
  complianceByFramework: {
    EASA: number;
    FAA: number;
    ICAO: number;
    'EU-OPS': number;
  };
  complianceByDocumentType: {
    MANUAL: number;
    PROCEDURE: number;
    CHECKLIST: number;
  };
  topRiskDocuments: Array<{
    documentId: string;
    title: string;
    complianceScore: number;
    riskLevel: string;
  }>;
  improvementAreas: string[];
}

@Injectable()
export class ComplianceDashboardService {
  private readonly logger = new Logger(ComplianceDashboardService.name);

  constructor(
    private prisma: PrismaService,
    private openaiService: OpenAIComplianceService,
    private impactAnalysisService: ImpactAnalysisService
  ) {}

  async getDashboard(organizationId: string): Promise<ComplianceDashboard> {
    this.logger.log(`Generating compliance dashboard for organization ${organizationId}`);

    try {
      const [
        overview,
        trends,
        alerts,
        recentAnalyses,
        riskDistribution,
        upcomingDeadlines,
        complianceMetrics
      ] = await Promise.all([
        this.getComplianceOverview(organizationId),
        this.getComplianceTrends(organizationId),
        this.getActiveAlerts(organizationId),
        this.getRecentAnalyses(organizationId),
        this.getRiskDistribution(organizationId),
        this.getUpcomingDeadlines(organizationId),
        this.getComplianceMetrics(organizationId)
      ]);

      const dashboard: ComplianceDashboard = {
        overview,
        trends,
        alerts,
        recentAnalyses,
        riskDistribution,
        upcomingDeadlines,
        complianceMetrics
      };

      this.logger.log(`Dashboard generated: ${overview.overallCompliance}% compliance, ${alerts.length} active alerts`);

      return dashboard;
    } catch (error) {
      this.logger.error(`Failed to generate compliance dashboard:`, error);
      throw new Error(`Dashboard generation failed: ${error.message}`);
    }
  }

  async getComplianceOverview(organizationId: string): Promise<ComplianceOverview> {
    try {
      const stats = await this.openaiService.getComplianceStatistics(organizationId);
      
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      
      if (stats.nonCompliantDocuments > stats.compliantDocuments * 0.3) {
        riskLevel = 'CRITICAL';
      } else if (stats.nonCompliantDocuments > stats.compliantDocuments * 0.2) {
        riskLevel = 'HIGH';
      } else if (stats.nonCompliantDocuments > stats.compliantDocuments * 0.1) {
        riskLevel = 'MEDIUM';
      }

      return {
        totalDocuments: stats.totalDocuments,
        compliantDocuments: stats.compliantDocuments,
        nonCompliantDocuments: stats.nonCompliantDocuments,
        pendingReview: stats.pendingReview,
        overallCompliance: stats.averageCompliance,
        riskLevel,
        lastUpdated: new Date()
      };
    } catch (error) {
      this.logger.error(`Failed to get compliance overview:`, error);
      throw error;
    }
  }

  async getComplianceTrends(organizationId: string): Promise<ComplianceTrends> {
    try {
      // Get compliance history for the last 12 months
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 12);

      const history = await this.prisma.complianceLink.groupBy({
        by: ['createdAt'],
        where: {
          document: {
            organizationId
          },
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        _avg: {
          confidenceScore: true
        },
        _count: {
          id: true
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      const complianceHistory = history.map(record => ({
        date: record.createdAt,
        compliance: (record._avg.confidenceScore || 0) * 100,
        documents: record._count.id
      }));

      // Calculate trend
      const firstCompliance = complianceHistory[0]?.compliance || 0;
      const lastCompliance = complianceHistory[complianceHistory.length - 1]?.compliance || 0;
      
      const trendPercentage = firstCompliance > 0 
        ? ((lastCompliance - firstCompliance) / firstCompliance) * 100 
        : 0;
      
      const trendDirection = trendPercentage > 5 ? 'UP' : trendPercentage < -5 ? 'DOWN' : 'STABLE';

      return {
        complianceHistory,
        trendDirection,
        trendPercentage: Math.abs(trendPercentage),
        period: '12 months'
      };
    } catch (error) {
      this.logger.error(`Failed to get compliance trends:`, error);
      return {
        complianceHistory: [],
        trendDirection: 'STABLE',
        trendPercentage: 0,
        period: '12 months'
      };
    }
  }

  async getActiveAlerts(organizationId: string): Promise<ComplianceAlert[]> {
    try {
      return await this.impactAnalysisService.getComplianceAlerts(organizationId);
    } catch (error) {
      this.logger.error(`Failed to get active alerts:`, error);
      return [];
    }
  }

  async getRecentAnalyses(organizationId: string): Promise<ImpactAnalysis[]> {
    try {
      return await this.impactAnalysisService.getImpactAnalyses(organizationId);
    } catch (error) {
      this.logger.error(`Failed to get recent analyses:`, error);
      return [];
    }
  }

  async getRiskDistribution(organizationId: string): Promise<RiskDistribution> {
    try {
      const stats = await this.openaiService.getComplianceStatistics(organizationId);
      
      return {
        CRITICAL: stats.riskDistribution.CRITICAL,
        HIGH: stats.riskDistribution.HIGH,
        MEDIUM: stats.riskDistribution.MEDIUM,
        LOW: stats.riskDistribution.LOW,
        total: stats.totalDocuments
      };
    } catch (error) {
      this.logger.error(`Failed to get risk distribution:`, error);
      return {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        total: 0
      };
    }
  }

  async getUpcomingDeadlines(organizationId: string): Promise<Deadline[]> {
    try {
      const upcomingAlerts = await this.prisma.complianceAlert.findMany({
        where: {
          status: 'ACTIVE',
          dueDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // Next 90 days
          }
        },
        orderBy: { dueDate: 'asc' },
        take: 20
      });

      return upcomingAlerts.map(alert => {
        const daysRemaining = Math.ceil((alert.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' = 'LOW';
        if (daysRemaining < 7) priority = 'URGENT';
        else if (daysRemaining < 14) priority = 'HIGH';
        else if (daysRemaining < 30) priority = 'MEDIUM';

        return {
          id: alert.id,
          title: alert.title,
          type: this.mapAlertTypeToDeadlineType(alert.type),
          dueDate: alert.dueDate,
          daysRemaining,
          priority,
          status: 'PENDING',
          assignedTo: alert.assignedTo,
          documentId: alert.affectedDocuments?.[0]
        };
      });
    } catch (error) {
      this.logger.error(`Failed to get upcoming deadlines:`, error);
      return [];
    }
  }

  async getComplianceMetrics(organizationId: string): Promise<ComplianceMetrics> {
    try {
      // Get compliance by framework
      const frameworkStats = await this.prisma.complianceLink.groupBy({
        by: ['regulationFramework'],
        where: {
          document: {
            organizationId
          }
        },
        _avg: {
          confidenceScore: true
        }
      });

      const complianceByFramework = {
        EASA: 0,
        FAA: 0,
        ICAO: 0,
        'EU-OPS': 0
      };

      frameworkStats.forEach(stat => {
        if (stat.regulationFramework in complianceByFramework) {
          complianceByFramework[stat.regulationFramework] = (stat._avg.confidenceScore || 0) * 100;
        }
      });

      // Get compliance by document type
      const documentTypeStats = await this.prisma.complianceLink.groupBy({
        by: ['documentType'],
        where: {
          document: {
            organizationId
          }
        },
        _avg: {
          confidenceScore: true
        }
      });

      const complianceByDocumentType = {
        MANUAL: 0,
        PROCEDURE: 0,
        CHECKLIST: 0
      };

      documentTypeStats.forEach(stat => {
        if (stat.documentType in complianceByDocumentType) {
          complianceByDocumentType[stat.documentType] = (stat._avg.confidenceScore || 0) * 100;
        }
      });

      // Get top risk documents
      const riskDocuments = await this.prisma.complianceLink.findMany({
        where: {
          document: {
            organizationId
          },
          confidenceScore: {
            lt: 0.8 // Low compliance scores
          }
        },
        include: {
          document: {
            select: {
              id: true,
              title: true
            }
          }
        },
        orderBy: { confidenceScore: 'asc' },
        take: 10
      });

      const topRiskDocuments = riskDocuments.map(link => ({
        documentId: link.documentId,
        title: link.document.title,
        complianceScore: link.confidenceScore * 100,
        riskLevel: link.confidenceScore < 0.5 ? 'CRITICAL' : 
                  link.confidenceScore < 0.7 ? 'HIGH' : 'MEDIUM'
      }));

      // Calculate average compliance score
      const allLinks = await this.prisma.complianceLink.findMany({
        where: {
          document: {
            organizationId
          }
        }
      });

      const averageComplianceScore = allLinks.length > 0
        ? allLinks.reduce((sum, link) => sum + link.confidenceScore, 0) / allLinks.length * 100
        : 0;

      // Generate improvement areas
      const improvementAreas = this.generateImprovementAreas(
        complianceByFramework,
        complianceByDocumentType,
        topRiskDocuments
      );

      return {
        averageComplianceScore,
        complianceByFramework,
        complianceByDocumentType,
        topRiskDocuments,
        improvementAreas
      };
    } catch (error) {
      this.logger.error(`Failed to get compliance metrics:`, error);
      throw error;
    }
  }

  private mapAlertTypeToDeadlineType(alertType: string): Deadline['type'] {
    switch (alertType) {
      case 'REGULATION_CHANGE':
        return 'REGULATION_UPDATE';
      case 'COMPLIANCE_DEADLINE':
        return 'COMPLIANCE_REVIEW';
      case 'REVIEW_REQUIRED':
        return 'AUDIT';
      default:
        return 'COMPLIANCE_REVIEW';
    }
  }

  private generateImprovementAreas(
    frameworkCompliance: any,
    documentTypeCompliance: any,
    riskDocuments: any[]
  ): string[] {
    const areas = [];

    // Framework-based improvements
    Object.entries(frameworkCompliance).forEach(([framework, score]) => {
      if (score < 80) {
        areas.push(`Improve ${framework} compliance (currently ${score.toFixed(1)}%)`);
      }
    });

    // Document type improvements
    Object.entries(documentTypeCompliance).forEach(([type, score]) => {
      if (score < 80) {
        areas.push(`Review and update ${type.toLowerCase()} documents`);
      }
    });

    // Risk-based improvements
    if (riskDocuments.length > 0) {
      areas.push(`Address ${riskDocuments.length} high-risk documents`);
    }

    if (areas.length === 0) {
      areas.push('Maintain current compliance levels');
      areas.push('Schedule regular compliance reviews');
    }

    return areas.slice(0, 5); // Limit to 5 areas
  }

  async generateComplianceReport(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    summary: ComplianceOverview;
    trends: ComplianceTrends;
    recommendations: string[];
    actionItems: string[];
  }> {
    this.logger.log(`Generating compliance report for organization ${organizationId}`);

    try {
      const dashboard = await this.getDashboard(organizationId);
      
      const recommendations = this.generateReportRecommendations(dashboard);
      const actionItems = this.generateActionItems(dashboard);

      return {
        summary: dashboard.overview,
        trends: dashboard.trends,
        recommendations,
        actionItems
      };
    } catch (error) {
      this.logger.error(`Failed to generate compliance report:`, error);
      throw new Error(`Report generation failed: ${error.message}`);
    }
  }

  private generateReportRecommendations(dashboard: ComplianceDashboard): string[] {
    const recommendations = [];

    if (dashboard.overview.overallCompliance < 80) {
      recommendations.push('Implement comprehensive compliance improvement program');
      recommendations.push('Increase frequency of compliance reviews');
    }

    if (dashboard.alerts.length > 10) {
      recommendations.push('Establish dedicated compliance monitoring team');
      recommendations.push('Implement automated compliance tracking system');
    }

    if (dashboard.riskDistribution.CRITICAL > 0) {
      recommendations.push('Address critical compliance issues immediately');
      recommendations.push('Implement emergency compliance procedures');
    }

    if (dashboard.trends.trendDirection === 'DOWN') {
      recommendations.push('Investigate causes of declining compliance');
      recommendations.push('Implement corrective action plan');
    }

    return recommendations;
  }

  private generateActionItems(dashboard: ComplianceDashboard): string[] {
    const actionItems = [];

    dashboard.upcomingDeadlines.forEach(deadline => {
      if (deadline.priority === 'URGENT') {
        actionItems.push(`URGENT: ${deadline.title} - Due in ${deadline.daysRemaining} days`);
      }
    });

    dashboard.complianceMetrics.topRiskDocuments.slice(0, 3).forEach(doc => {
      actionItems.push(`Review and update: ${doc.title} (${doc.complianceScore.toFixed(1)}% compliance)`);
    });

    if (dashboard.riskDistribution.CRITICAL > 0) {
      actionItems.push(`Address ${dashboard.riskDistribution.CRITICAL} critical compliance issues`);
    }

    return actionItems;
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details?: any }> {
    try {
      const [dashboardHealth, openaiHealth, impactHealth] = await Promise.all([
        this.prisma.complianceLink.count(),
        this.openaiService.healthCheck(),
        this.impactAnalysisService.healthCheck()
      ]);

      const allHealthy = openaiHealth.status === 'healthy' && impactHealth.status === 'healthy';

      return {
        status: allHealthy ? 'healthy' : 'unhealthy',
        details: {
          totalComplianceLinks: dashboardHealth,
          openaiService: openaiHealth,
          impactAnalysisService: impactHealth
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }
}
