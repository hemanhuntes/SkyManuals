import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIComplianceService, RegulationMatch } from './openai-compliance.service';

export interface ImpactAnalysis {
  regulationId: string;
  regulationTitle: string;
  changeType: 'NEW' | 'UPDATED' | 'DELETED' | 'AMENDED';
  changeDescription: string;
  effectiveDate: Date;
  affectedDocuments: AffectedDocument[];
  impactScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendations: string[];
  actionItems: ActionItem[];
  estimatedEffort: number; // hours
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export interface AffectedDocument {
  documentId: string;
  documentType: 'MANUAL' | 'PROCEDURE' | 'CHECKLIST';
  documentTitle: string;
  chapterId?: string;
  sectionId?: string;
  impactLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  currentCompliance: number;
  requiredChanges: string[];
  estimatedEffort: number; // hours
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  assignedTo?: string;
  dueDate: Date;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  estimatedEffort: number; // hours
  dependencies: string[];
}

export interface ComplianceAlert {
  id: string;
  type: 'REGULATION_CHANGE' | 'COMPLIANCE_DEADLINE' | 'NON_COMPLIANCE' | 'REVIEW_REQUIRED';
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  title: string;
  description: string;
  affectedDocuments: string[];
  dueDate?: Date;
  status: 'ACTIVE' | 'RESOLVED' | 'DISMISSED';
  createdAt: Date;
  resolvedAt?: Date;
  assignedTo?: string;
}

@Injectable()
export class ImpactAnalysisService {
  private readonly logger = new Logger(ImpactAnalysisService.name);

  constructor(
    private prisma: PrismaService,
    private openaiService: OpenAIComplianceService
  ) {}

  async analyzeRegulationImpact(regulationId: string): Promise<ImpactAnalysis> {
    this.logger.log(`Analyzing impact for regulation ${regulationId}`);

    try {
      // 1. Get regulation details
      const regulation = await this.prisma.regulation.findUnique({
        where: { id: regulationId }
      });

      if (!regulation) {
        throw new Error(`Regulation ${regulationId} not found`);
      }

      // 2. Find all documents that reference this regulation
      const complianceLinks = await this.prisma.complianceLink.findMany({
        where: { regulationId },
        include: {
          document: {
            include: {
              chapters: {
                include: {
                  sections: true
                }
              }
            }
          }
        }
      });

      // 3. Analyze impact for each document
      const affectedDocuments: AffectedDocument[] = [];
      
      for (const link of complianceLinks) {
        const impact = await this.analyzeDocumentImpact(link, regulation);
        affectedDocuments.push(impact);
      }

      // 4. Calculate overall impact score
      const impactScore = this.calculateImpactScore(affectedDocuments);

      // 5. Determine risk level
      const riskLevel = this.determineRiskLevel(impactScore, affectedDocuments);

      // 6. Generate recommendations and action items
      const { recommendations, actionItems } = await this.generateRecommendations(
        regulation,
        affectedDocuments
      );

      // 7. Calculate priority and effort
      const priority = this.determinePriority(impactScore, riskLevel, regulation.effectiveDate);
      const estimatedEffort = affectedDocuments.reduce((sum, doc) => sum + doc.estimatedEffort, 0);

      const analysis: ImpactAnalysis = {
        regulationId: regulation.id,
        regulationTitle: regulation.title,
        changeType: 'UPDATED', // This would be determined from regulation change history
        changeDescription: `Regulation ${regulation.title} has been updated`,
        effectiveDate: regulation.effectiveDate,
        affectedDocuments,
        impactScore,
        riskLevel,
        recommendations,
        actionItems,
        estimatedEffort,
        priority
      };

      // 8. Store analysis
      await this.storeImpactAnalysis(analysis);

      // 9. Create compliance alerts if needed
      await this.createComplianceAlerts(analysis);

      this.logger.log(`Impact analysis completed: ${affectedDocuments.length} documents affected, ${riskLevel} risk`);

      return analysis;
    } catch (error) {
      this.logger.error(`Failed to analyze regulation impact:`, error);
      throw new Error(`Impact analysis failed: ${error.message}`);
    }
  }

  async analyzeDocumentImpact(
    complianceLink: any,
    regulation: any
  ): Promise<AffectedDocument> {
    // Analyze how a specific document is affected by regulation changes
    const document = complianceLink.document;
    
    // Determine impact level based on confidence score and document type
    let impactLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    
    if (complianceLink.confidenceScore > 0.9) {
      impactLevel = 'CRITICAL';
    } else if (complianceLink.confidenceScore > 0.7) {
      impactLevel = 'HIGH';
    } else if (complianceLink.confidenceScore > 0.5) {
      impactLevel = 'MEDIUM';
    }

    // Estimate required changes
    const requiredChanges = this.estimateRequiredChanges(document, regulation, impactLevel);

    // Estimate effort based on document size and complexity
    const estimatedEffort = this.estimateEffort(document, impactLevel, requiredChanges.length);

    return {
      documentId: document.id,
      documentType: 'MANUAL', // This would be determined from document metadata
      documentTitle: document.title,
      impactLevel,
      currentCompliance: complianceLink.confidenceScore * 100,
      requiredChanges,
      estimatedEffort
    };
  }

  private calculateImpactScore(affectedDocuments: AffectedDocument[]): number {
    if (affectedDocuments.length === 0) return 0;

    const weights = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1
    };

    const totalWeight = affectedDocuments.reduce((sum, doc) => {
      return sum + weights[doc.impactLevel] * doc.estimatedEffort;
    }, 0);

    const maxPossibleWeight = affectedDocuments.length * weights.CRITICAL * 40; // Max 40 hours per document

    return Math.min(100, (totalWeight / maxPossibleWeight) * 100);
  }

  private determineRiskLevel(
    impactScore: number,
    affectedDocuments: AffectedDocument[]
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const criticalCount = affectedDocuments.filter(d => d.impactLevel === 'CRITICAL').length;
    const highCount = affectedDocuments.filter(d => d.impactLevel === 'HIGH').length;

    if (criticalCount > 0 || impactScore > 80) return 'CRITICAL';
    if (highCount > 2 || impactScore > 60) return 'HIGH';
    if (highCount > 0 || impactScore > 30) return 'MEDIUM';
    return 'LOW';
  }

  private determinePriority(
    impactScore: number,
    riskLevel: string,
    effectiveDate: Date
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' {
    const daysUntilEffective = Math.ceil((effectiveDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    if (daysUntilEffective < 30 || riskLevel === 'CRITICAL') return 'URGENT';
    if (daysUntilEffective < 60 || riskLevel === 'HIGH') return 'HIGH';
    if (daysUntilEffective < 90 || riskLevel === 'MEDIUM') return 'MEDIUM';
    return 'LOW';
  }

  private estimateRequiredChanges(
    document: any,
    regulation: any,
    impactLevel: string
  ): string[] {
    const changes = [];

    switch (impactLevel) {
      case 'CRITICAL':
        changes.push('Complete content review and update required');
        changes.push('Update procedures and workflows');
        changes.push('Staff training and certification updates');
        changes.push('Quality assurance review');
        break;
      case 'HIGH':
        changes.push('Content review and selective updates');
        changes.push('Procedure updates');
        changes.push('Staff notification and training');
        break;
      case 'MEDIUM':
        changes.push('Content review');
        changes.push('Minor procedure adjustments');
        break;
      case 'LOW':
        changes.push('Documentation review');
        break;
    }

    return changes;
  }

  private estimateEffort(
    document: any,
    impactLevel: string,
    changeCount: number
  ): number {
    const baseEffort = {
      CRITICAL: 20,
      HIGH: 10,
      MEDIUM: 5,
      LOW: 2
    };

    const documentComplexity = document.chapters?.length || 1;
    const complexityMultiplier = Math.min(3, Math.ceil(documentComplexity / 5));

    return baseEffort[impactLevel] * complexityMultiplier * changeCount;
  }

  private async generateRecommendations(
    regulation: any,
    affectedDocuments: AffectedDocument[]
  ): Promise<{
    recommendations: string[];
    actionItems: ActionItem[];
  }> {
    const recommendations = [];
    const actionItems: ActionItem[] = [];

    // Generate recommendations based on regulation and affected documents
    if (affectedDocuments.some(d => d.impactLevel === 'CRITICAL')) {
      recommendations.push('Immediate action required for critical compliance issues');
      recommendations.push('Establish compliance review team');
      recommendations.push('Implement enhanced monitoring and reporting');
    }

    if (affectedDocuments.length > 5) {
      recommendations.push('Consider phased implementation approach');
      recommendations.push('Prioritize documents with highest compliance scores');
    }

    recommendations.push('Schedule regular compliance reviews');
    recommendations.push('Update staff training programs');
    recommendations.push('Implement automated compliance monitoring');

    // Generate action items
    const urgentDocs = affectedDocuments.filter(d => d.impactLevel === 'CRITICAL');
    
    for (const doc of urgentDocs) {
      actionItems.push({
        id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: `Update ${doc.documentTitle}`,
        description: `Critical compliance update required for ${doc.documentTitle}`,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        status: 'PENDING',
        priority: 'URGENT',
        estimatedEffort: doc.estimatedEffort,
        dependencies: []
      });
    }

    return { recommendations, actionItems };
  }

  private async storeImpactAnalysis(analysis: ImpactAnalysis): Promise<void> {
    try {
      await this.prisma.impactAnalysis.create({
        data: {
          id: `impact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          regulationId: analysis.regulationId,
          regulationTitle: analysis.regulationTitle,
          changeType: analysis.changeType,
          changeDescription: analysis.changeDescription,
          effectiveDate: analysis.effectiveDate,
          impactScore: analysis.impactScore,
          riskLevel: analysis.riskLevel,
          estimatedEffort: analysis.estimatedEffort,
          priority: analysis.priority,
          affectedDocumentsCount: analysis.affectedDocuments.length,
          analysisData: analysis,
          createdAt: new Date()
        }
      });
    } catch (error) {
      this.logger.error(`Failed to store impact analysis:`, error);
    }
  }

  private async createComplianceAlerts(analysis: ImpactAnalysis): Promise<void> {
    try {
      // Create alerts for critical and high impact issues
      const criticalDocs = analysis.affectedDocuments.filter(d => d.impactLevel === 'CRITICAL');
      
      for (const doc of criticalDocs) {
        await this.prisma.complianceAlert.create({
          data: {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'REGULATION_CHANGE',
            severity: 'CRITICAL',
            title: `Critical Compliance Update Required: ${doc.documentTitle}`,
            description: `Document ${doc.documentTitle} requires immediate updates due to regulation changes in ${analysis.regulationTitle}`,
            affectedDocuments: [doc.documentId],
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
            status: 'ACTIVE',
            createdAt: new Date()
          }
        });
      }

      // Create summary alert for the regulation change
      if (analysis.riskLevel === 'CRITICAL' || analysis.riskLevel === 'HIGH') {
        await this.prisma.complianceAlert.create({
          data: {
            id: `alert_summary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'REGULATION_CHANGE',
            severity: analysis.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
            title: `Regulation Update Impact: ${analysis.regulationTitle}`,
            description: `Regulation ${analysis.regulationTitle} has been updated, affecting ${analysis.affectedDocuments.length} documents`,
            affectedDocuments: analysis.affectedDocuments.map(d => d.documentId),
            dueDate: analysis.effectiveDate,
            status: 'ACTIVE',
            createdAt: new Date()
          }
        });
      }
    } catch (error) {
      this.logger.error(`Failed to create compliance alerts:`, error);
    }
  }

  async getImpactAnalyses(organizationId: string): Promise<ImpactAnalysis[]> {
    try {
      const analyses = await this.prisma.impactAnalysis.findMany({
        where: {
          regulation: {
            // Filter by organization if needed
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });

      return analyses.map(analysis => analysis.analysisData as ImpactAnalysis);
    } catch (error) {
      this.logger.error(`Failed to get impact analyses:`, error);
      throw new Error(`Impact analyses retrieval failed: ${error.message}`);
    }
  }

  async getComplianceAlerts(organizationId: string): Promise<ComplianceAlert[]> {
    try {
      const alerts = await this.prisma.complianceAlert.findMany({
        where: {
          status: 'ACTIVE'
        },
        orderBy: [
          { severity: 'desc' },
          { createdAt: 'desc' }
        ],
        take: 100
      });

      return alerts.map(alert => ({
        id: alert.id,
        type: alert.type as any,
        severity: alert.severity as any,
        title: alert.title,
        description: alert.description,
        affectedDocuments: alert.affectedDocuments || [],
        dueDate: alert.dueDate,
        status: alert.status as any,
        createdAt: alert.createdAt,
        resolvedAt: alert.resolvedAt,
        assignedTo: alert.assignedTo
      }));
    } catch (error) {
      this.logger.error(`Failed to get compliance alerts:`, error);
      throw new Error(`Compliance alerts retrieval failed: ${error.message}`);
    }
  }

  async resolveAlert(alertId: string, resolution: string): Promise<{ success: boolean }> {
    try {
      await this.prisma.complianceAlert.update({
        where: { id: alertId },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolution
        }
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to resolve alert ${alertId}:`, error);
      return { success: false };
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details?: any }> {
    try {
      const alertCount = await this.prisma.complianceAlert.count({
        where: { status: 'ACTIVE' }
      });

      const analysisCount = await this.prisma.impactAnalysis.count();

      return {
        status: 'healthy',
        details: {
          activeAlerts: alertCount,
          totalAnalyses: analysisCount
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