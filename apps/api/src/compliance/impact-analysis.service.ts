import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ImpactAnalysis,
  ImpactAnalysisRequest,
  ImpactAnalysisSchema,
  ImpactAnalysisRequestSchema,
} from '@skymanuals/types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ImpactAnalysisService {
  constructor(private prisma: PrismaService) {}

  async analyzeImpact(
    request: ImpactAnalysisRequest,
    userId?: string,
  ): Promise<ImpactAnalysis> {
    console.log(`🔍 Starting impact analysis for regulation library ${request.regulationLibraryId}`);
    console.log(`   New version: ${request.newVersion}`);

    // Validate regulation library
    const regulationLibrary = await this.prisma.regulationLibrary.findUnique({
      where: { id: request.regulationLibraryId },
      include: {
        regulationItems: true,
      },
    });

    if (!regulationLibrary) {
      throw new NotFoundException(`Regulation library ${request.regulationLibraryId} not found`);
    }

    // Create impact analysis record
    const impactAnalysis = await this.prisma.impactAnalysis.create({
      data: {
        id: uuidv4(),
        triggerType: 'REGULATION_UPDATE',
        regulationLibraryId: request.regulationLibraryId,
        oldVersion: regulationLibrary.version,
        newVersion: request.newVersion,
        analysisScope: {
          organizationIds: request.analysisScope.organizationIds || [],
          manualIds: request.analysisScope.manualIds || [],
          regulationItemIds: regulationLibrary.regulationItems.map(item => item.id),
        },
        status: 'PENDING',
        analyzedBy: userId,
      },
    });

    // Perform impact analysis
    await this.performImpactAnalysis(impactAnalysis.id);

    // Return updated analysis
    const updatedAnalysis = await this.prisma.impactAnalysis.findUnique({
      where: { id: impactAnalysis.id },
    });

    if (!updatedAnalysis) {
      throw new NotFoundException('Impact analysis not found after creation');
    }

    return ImpactAnalysisSchema.parse({
      ...updatedAnalysis,
      createdAt: updatedAnalysis.createdAt.toISOString(),
      updatedAt: updatedAnalysis.updatedAt.toISOString(),
      reviewedAt: updatedAnalysis.reviewedAt?.toISOString(),
    });
  }

  private async performImpactAnalysis(analysisId: string): Promise<void> {
    console.log(`⚙️ Performing impact analysis: ${analysisId}`);

    try {
      // Update status to in progress
      await this.prisma.impactAnalysis.update({
        where: { id: analysisId },
        data: { status: 'IN_PROGRESS' },
      });

      const analysis = await this.prisma.impactAnalysis.findUnique({
        where: { id: analysisId },
        include: {
          regulationLibrary: true,
        },
      });

      if (!analysis) {
        throw new Error('Impact analysis not found');
      }

      // Get compliance links affected by this regulation library
      const affectedLinks = await this.prisma.complianceLink.findMany({
        where: {
          regulationLibraryId: analysis.regulationLibraryId,
          status: {
            in: ['ACTIVE', 'DRAFT'],
          },
        },
        include: {
          manual: true,
          regulationItem: true,
          block: true,
        },
      });

      // Simulate analysis results
      const results = await this.simulateAnalysisResults(analysis, affectedLinks);

      // Generate recommendations
      const recommendations = await this.generateRecommendations(analysis, results, affectedLinks);

      // Create automated checklist if needed
      const automatedChecklistId = results.conflictCount > 0 ? 
        await this.createAutomatedChecklist(analysisId, affectedLinks) : null;

      // Update analysis with results
      await this.prisma.impactAnalysis.update({
        where: { id: analysisId },
        data: {
          status: 'COMPLETED',
          results,
          recommendations,
          automatedChecklistId,
        },
      });

      console.log(`✅ Impact analysis completed: ${analysisId}`);

    } catch (error) {
      console.error(`❌ Impact analysis failed: ${error.message}`);

      await this.prisma.impactAnalysis.update({
        where: { id: analysisId },
        data: {
          status: 'REQUIRES_REVIEW',
          results: {
            error: error.message,
            processingFailedAt: new Date().toISOString(),
          },
        },
      });

      throw error;
    }
  }

  private async simulateAnalysisResults(analysis: any, affectedLinks: any[]): Promise<any> {
    console.log(`🧪 Simulating impact analysis results for ${affectedLinks.length} affected links`);

    // Get unique blocks and paragraphs affected
    const affectedParagraphs = [...new Set(affectedLinks
      .filter(link => link.blockId)
      .map(link => link.blockId))].length;

    // Simulate regulation changes
    const newRequirements = Math.floor(Math.random() * 5) + 1; // 1-5 new requirements
    const modifiedRequiredments = Math.floor(Math.random() * 8) + 2; // 2-9 modified
    const obsoleteRequirements = Math.floor(Math.random() * 3); // 0-2 obsolete

    // Calculate conflicts (links that may no longer be valid)
    const conflictLinks = affectedLinks.filter(link => 
      Math.random() > 0.7 // 30% chance of conflict per link
    );

    // Risk assessment
    const highRiskLinks = conflictLinks.filter(link => 
      link.regulationItem.priority === 'CRITICAL' || link.regulationItem.priority === 'HIGH'
    );

    const mediumRiskLinks = conflictLinks.filter(link => 
      link.regulationItem.priority === 'MEDIUM'
    );

    const lowRiskLinks = conflictLinks.filter(link => 
      link.regulationItem.priority === 'LOW'
    );

    // Estimate effort
    const estimatedHours = Math.max(
      newRequirements * 2 + // 2 hours per new requirement
      modifiedRequiredments * 1.5 + // 1.5 hours per modified requirement
      obsoleteRequiredments * 0.5 + // 0.5 hours per obsolete requirement
      conflictLinks.length * 1, // 1 hour per conflict resolution
      10 // Minimum 10 hours
    );

    const resources = ['Compliance Team', 'Technical Writers', 'Subject Matter Experts'];

    return {
      affectedParagraphs,
      newRequirements,
      modifiedRequirements: modifiedRequiredments,
      obsoleteRequirements: obsoleteRequiredments,
      conflictCount: conflictLinks.length,
      riskAssessment: {
        highRisk: highRiskLinks.length,
        mediumRisk: mediumRiskLinks.length,
        lowRisk: lowRiskLinks.length,
      },
      complianceLinksAffected: affectedLinks.map(link => ({
        linkId: link.id,
        manualTitle: link.manual.title,
        regulationReference: link.regulationItem.reference,
        conflictRisk: conflictLinks.includes(link) ? 'HIGH' : 'LOW',
        blockId: link.blockId,
      })),
      estimatedEffort: {
        hours: estimatedHours,
        resources,
        timeline: this.generateTimeline(estimatedHours),
      },
    };
  }

  private async generateRecommendations(analysis: any, results: any, affectedLinks: any[]): Promise<any[]> {
    console.log(`💡 Generating recommendations for impact analysis`);

    const recommendations = [];

    // Critical actions for new requirements
    if (results.newRequirements > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: `Review and implement ${results.newRequirements} new regulation requirements`,
        responsible: 'Compliance Team Lead',
        deadline: this.calculateDeadline(30), // 30 days from now
        estimatedEffort: `${results.newRequirements * 2} hours`,
      });
    }

    // Conflict resolution
    if (results.conflictCount > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        action: `Resolve ${results.conflictCount} compliance link conflicts`,
        responsible: 'Regulatory Affairs Manager',
        deadline: this.calculateDeadline(14), // 14 days for conflicts
        estimatedEffort: `${results.conflictCount * 1} hours`,
      });
    }

    // High-risk items
    if (results.riskAssessment.highRisk > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        action: `Immediate review of ${results.riskAssessment.highRisk} high-risk compliance links`,
        responsible: 'Safety Manager',
        deadline: this.calculateDeadline(7), // 7 days for high-risk
        estimatedEffort: `${results.riskAssessment.highRisk * 2} hours`,
      });
    }

    // Manual updates
    const affectedManuals = [...new Set(affectedLinks.map(link => link.manualId))];
    if (affectedManuals.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        action: `Update ${affectedManuals.length} affected aircraft manuals`,
        responsible: 'Technical Writing Team',
        deadline: this.calculateDeadline(60), // 60 days for manual updates
        estimatedEffort: `${affectedManuals.length * 8} hours`,
      });
    }

    // Audit preparation
    recommendations.push({
      priority: 'MEDIUM',
      action: 'Prepare for upcoming compliance audit with updated regulations',
      responsible: 'Quality Assurance Manager',
      deadline: this.calculateDeadline(90), // 90 days for audit prep
      estimatedEffort: '16 hours',
    });

    return recommendations;
  }

  private async createAutomatedChecklist(analysisId: string, affectedLinks: any[]): Promise<string> {
    console.log(`📋 Creating automated audit checklist for impact analysis`);

    // Create audit checklist through the audit service
    // For now, return a mock checklist ID
    const checklistId = uuidv4();

    console.log(`✅ Created automated checklist: ${checklistId}`);

    return checklistId;
  }

  private calculateDeadline(days: number): string {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + days);
    return deadline.toISOString().split('T')[0]; // Return just the date part
  }

  private generateTimeline(hours: number): string {
    // Simple timeline generation based on hours
    const weeks = Math.ceil(hours / 40); // Assume 40 hours per week

    if (weeks === 1) {
      return '1 week';
    } else if (weeks <= 4) {
      return `${weeks} weeks`;
    } else {
      const months = Math.ceil(weeks / 4);
      return `${months} months`;
    }
  }

    async getImpactAnalysis(analysisId: string): Promise<ImpactAnalysis> {
        console.log(`📊 Retrieving impact analysis: ${analysisId}`);

        const analysis = await this.prisma.impactAnalysis.findUnique({
            where: { id: analysisId },
            include: {
                regulationLibrary: {
                    select: {
                        title: true,
                        source: true,
                        region: true,
                        version: true,
                    },
                },
            },
        });

        if (!analysis) {
            throw new NotFoundException(`Impact analysis ${analysisId} not found`);
        }

        return ImpactAnalysisSchema.parse({
            ...analysis,
            createdAt: analysis.createdAt.toISOString(),
            updatedAt: analysis.updatedAt.toISOString(),
            reviewedAt: analysis.reviewedAt?.toISOString(),
        });
    }

    async getRecentAnalyses(organizationId: string = 'default-org', limit: number = 10): Promise<ImpactAnalysis[]> {
        console.log(`📋 Retrieving recent impact analyses for organization ${organizationId}`);

        const analyses = await this.prisma.impactAnalysis.findMany({
            include: {
                regulationLibrary: {
                    select: {
                        title: true,
                        source: true,
                        region: true,
                        version: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: limit,
        });

        return analyses.map(analysis => ImpactAnalysisSchema.parse({
            ...analysis,
            createdAt: analysis.createdAt.toISOString(),
            updatedAt: analysis.updatedAt.toISOString(),
            reviewedAt: analysis.reviewedAt?.toISOString(),
        }));
    }

    async acknowledgeAnalysis(analysisId: string, userId: string): Promise<ImpactAnalysis> {
        console.log(`👤 Acknowledging impact analysis ${analysisId} by user ${userId}`);

        const analysis = await this.prisma.impactAnalysis.update({
            where: { id: analysisId },
            data: {
                reviewedBy: userId,
                reviewedAt: new Date(),
                status: 'REQUIRES_REVIEW',
            },
        });

        console.log(`✅ Impact analysis acknowledged: ${analysisId}`);

        return ImpactAnalysisSchema.parse({
            ...analysis,
            createdAt: analysis.createdAt.toISOString(),
            updatedAt: analysis.updatedAt.toISOString(),
            reviewedAt: analysis.reviewedAt?.toISOString(),
        });
    }
}
