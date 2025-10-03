import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ComplianceLink,
  ComplianceLinkResponse,
  CreateComplianceLinkDto,
  ComplianceLinkSchema,
  ComplianceLinkResponseSchema,
  CreateComplianceLinkDtoSchema,
} from '@skymanuals/types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ComplianceLinkService {
  constructor(private prisma: PrismaService) {}

  async createLink(
    manualId: string,
    createLinkDto: CreateComplianceLinkDto,
    userId: string,
  ): Promise<ComplianceLink> {
    console.log(`🔗 Creating compliance link for Manual ${manualId}`);

    // Validate that the block exists
    const block = await this.prisma.block.findUnique({
      where: { id: createLinkDto.blockId },
      include: {
        section: {
          include: {
            chapter: true,
          },
        },
      },
    });

    if (!block) {
      throw new NotFoundException(`Block ${createLinkDto.blockId} not found`);
    }

    // Get regulation item details
    const regulationItem = await this.prisma.regulationItem.findUnique({
      where: { id: createLinkDto.regulationItemId },
      include: {
        regulationLibrary: true,
      },
    });

    if (!regulationItem) {
      throw new NotFoundException(`Regulation item ${createLinkDto.regulationItemId} not found`);
    }

    // Validate link doesn't already exist for this block and regulation
    const existingLink = await this.prisma.complianceLink.findFirst({
      where: {
        blockId: createLinkDto.blockId,
        regulationItemId: createLinkDto.regulationItemId,
        status: {
          in: ['ACTIVE', 'DRAFT'],
        },
      },
    });

    if (existingLink) {
      throw new BadRequestException(
        `A compliance link already exists between block ${createLinkDto.blockId} and regulation ${createLinkDto.regulationItemId}`,
      );
    }

    // Create compliance link
    const link = await this.prisma.complianceLink.create({
      data: {
        id: uuidv4(),
        manualId: block.section.chapter.manualId,
        chapterId: block.section.chapterId,
        sectionId: block.sectionId,
        blockId: createLinkDto.blockId,
        regulationItemId: createLinkDto.regulationItemId,
        regulationLibraryId: regulationItem.regulationLibraryId,
        linkType: createLinkDto.linkType,
        relationship: createLinkDto.relationship,
        confidence: Math.round(createLinkDto.confidence), // Ensure integer
        createdBy: userId,
        status: 'DRAFT',
        notes: createLinkDto.notes,
        evidence: createLinkDto.evidence || [],
      },
      include: {
        manual: true,
        regulationItem: {
          include: {
            regulationLibrary: true,
          },
        },
      },
    });

    console.log(`✅ Created compliance link: ${link.id}`);

    return ComplianceLinkSchema.parse({
      ...link,
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
      reviewedAt: link.reviewedAt?.toISOString(),
    });
  }

  async getLinks(
    manualId?: string,
    regulationLibraryId?: string,
    status?: string,
    userId?: string,
  ): Promise<ComplianceLinkResponse[]> {
    console.log(`🔍 Retrieving compliance links`);
    console.log(`   Manual: ${manualId || 'all'}`);
    console.log(`   Library: ${regulationLibraryId || 'all'}`);
    console.log(`   Status: ${status || 'all'}`);

    const where: any = {};

    if (manualId) {
      where.manualId = manualId;
    }

    if (regulationLibraryId) {
      where.regulationLibraryId = regulationLibraryId;
    }

    if (status) {
      where.status = status;
    }

    const links = await this.prisma.complianceLink.findMany({
      where,
      include: {
        manual: {
          select: {
            id: true,
            title: true,
            organizationId: true,
          },
        },
        regulationItem: {
          include: {
            regulationLibrary: {
              select: {
                id: true,
                source: true,
                region: true,
                version: true,
                title: true,
              },
            },
          },
        },
        block: {
          select: {
            id: true,
            content: true,
            smartBlockType: true,
            smartBlockConfig: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return links.map(link => {
      const blockTitle = link.block?.smartBlockType ? 
        `${link.block.smartBlockType} block` : 
        'Text block';

      return ComplianceLinkResponseSchema.parse({
        id: link.id,
        block: {
          id: link.blockId || '',
          content: link.block?.content || {},
          title: blockTitle,
        },
        regulation: {
          id: link.regulationItem.id,
          reference: link.regulationItem.reference,
          title: link.regulationItem.title,
          regulationLibrary: {
            source: link.regulationItem.regulationLibrary.source,
            region: link.regulationItem.regulationLibrary.region,
            version: link.regulationItem.regulationLibrary.version,
          },
        },
        linkType: link.linkType,
        relationship: link.relationship,
        confidence: link.confidence,
        status: link.status,
        createdAt: link.createdAt.toISOString(),
      });
    });
  }

  async getLinksByBlockId(blockId: string): Promise<ComplianceLinkResponse[]> {
    console.log(`🔗 Retrieving compliance links for block ${blockId}`);

    const links = await this.prisma.complianceLink.findMany({
      where: { blockId },
      include: {
        regulationItem: {
          include: {
            regulationLibrary: true,
          },
        },
      },
      orderBy: {
        confidence: 'desc', // Show highest confidence first
      },
    });

    return links.map(link => {
      return ComplianceLinkResponseSchema.parse({
        id: link.id,
        block: {
          id: blockId,
          content: {}, // Would be filled by caller
          title: 'Block',
        },
        regulation: {
          id: link.regulationItem.id,
          reference: link.regulationItem.reference,
          title: link.regulationItem.title,
          regulationLibrary: {
            source: link.regulationItem.regulationLibrary.source,
            region: link.regulationItem.regulationLibrary.region,
            version: link.regulationItem.regulationLibrary.version,
          },
        },
        linkType: link.linkType,
        relationship: link.relationship,
        confidence: link.confidence,
        status: link.status,
        createdAt: link.createdAt.toISOString(),
      });
    });
  }

  async updateLinkStatus(
    linkId: string,
    status: string,
    reviewedBy?: string,
  ): Promise<ComplianceLink> {
    console.log(`📝 Updating compliance link ${linkId} status to ${status}`);

    const link = await this.prisma.complianceLink.update({
      where: { id: linkId },
      data: {
        status: status as any,
        reviewedBy,
        reviewedAt: new Date(),
      },
    });

    console.log(`✅ Updated compliance link status: ${link.id}`);

    return ComplianceLinkSchema.parse({
      ...link,
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
      reviewedAt: link.reviewedAt?.toISOString(),
    });
  }

  async deleteLink(linkId: string): Promise<void> {
    console.log(`🗑️ Deleting compliance link ${linkId}`);

    await this.prisma.complianceLink.delete({
      where: { id: linkId },
    });

    console.log(`✅ Deleted compliance link: ${linkId}`);
  }

  async suggestLinksForBlock(blockId: string): Promise<any[]> {
    console.log(`🔍 Suggesting compliance links for block ${blockId}`);

    // Get block content
    const block = await this.prisma.block.findUnique({
      where: { id: blockId },
      include: {
        section: {
          include: {
            chapter: true,
          },
        },
      },
    });

    if (!block || !block.content) {
      return [];
    }

    const blockText = this.extractTextFromContent(block.content);
    const keywords = await this.extractComplianceKeywords(blockText);

    // Find matching regulation items
    const suggestions = [];

    for (const keyword of keywords) {
      const regulationItems = await this.prisma.regulationItem.findMany({
        where: {
          OR: [
            { title: { contains: keyword, mode: 'insensitive' } },
            { content: { contains: keyword, mode: 'insensitive' } },
            { reference: { contains: keyword, mode: 'insensitive' } },
          ],
        },
        include: {
          regulationLibrary: {
            select: {
              source: true,
              region: true,
              version: true,
              title: true,
            },
          },
        },
        take: 5, // Limit suggestions per关键字
      });

      suggestions.push(...regulationItems.map(item => ({
        regulationItem: {
          id: item.id,
          reference: item.reference,
          title: item.title,
          category: item.category,
          priority: item.priority,
          regulationLibrary: {
            source: item.regulationLibrary.source,
            region: item.regulationLibrary.region,
            version: item.regulationLibrary.version,
            title: item.regulationLibrary.title,
          },
        },
        matchReason: `Contains keyword: ${keyword}`,
        confidence: this.calculateConfidence(blockText, keyword, item.content),
        suggestedLinkType: this.suggestLinkType(keyword, item.content),
      })));

      /**
      
      suggestions.push(...regulationItems.map(item => ({
        regulationItem: {
          id: item.id,
          reference: item.reference,
          title: item.title,
          category: item.category,
          priority: item.priority,
          regulationLibrary: {
            source: item.regulationLibrary.source,
            region: item.regulationLibrary.region,
            version: item.regulationLibrary.version,
            title: item.regulationLibrary.title,
          },
        },
        matchReason: `Contains keyword: ${keyword}`,
        confidence: this.calculateConfidence(blockText, keyword, item.content),
        suggestedLinkType: this.suggestLinkType(keyword, item.content),
      })));
      */
    }

    // Remove duplicates and sort by confidence
    const uniqueSuggestions = suggestions.filter((suggestion, index, arr) =>
      index === arr.findIndex(s => s.regulationItem.id === suggestion.regulationItem.id)
    );

    return uniqueSuggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
  }

  private extractTextFromContent(content: any): string {
    if (!content || typeof content !== 'object') {
      return '';
    }

    // Extract text from TipTap content structure
    let text = '';

    if (content.type === 'doc' && content.content) {
      content.content.forEach((node: any) => {
        text += this.extractTextFromNode(node) + ' ';
      });
    } else {
      text = this.extractTextFromNode(content);
    }

    return text.trim();
  }

  private extractTextFromNode(node: any): string {
    if (!node) return '';

    if (node.type === 'text') {
      return node.text || '';
    }

    if (node.content && Array.isArray(node.content)) {
      return node.content
        .map((child: any) => this.extractTextFromNode(child))
        .join(' ');
    }

    return '';
  }

  private async extractComplianceKeywords(text: string): Promise<string[]> {
    // Mock NLP keyword extraction - in production, use sophisticated NLP
    const aviationKeywords = [
      'aircraft',
      'flight',
      'maintenance',
      'safety',
      'emergency',
      'procedure',
      'operation',
      'training',
      'equipment',
      'crew',
      'pilot',
      'passenger',
      'inspection',
      'compliance',
      'regulation',
    ];

    const detectedKeywords = aviationKeywords.filter(keyword =>
      text.toLowerCase().includes(keyword.toLowerCase())
    );

    // Add custom extraction logic for aviation-specific terms
    const customMatches = text.match(/\\b[A-Z]{2,}[\\s\\d]*\\d+\\b/g) || []; // Acronyms like FAR 121
    detectedKeywords.push(...customMatches.map(match => match.trim()));

    return [...new Set(detectedKeywords)]; // Remove duplicates
  }

  private calculateConfidence(blockText: string, keyword: string, regulationContent: string): number {
    // Simple confidence calculation based on keyword frequency and matching
    const keywordCount = (blockText.toLowerCase().match(new RegExp(keyword.toLowerCase(), 'g')) || []).length;
    const regulationMatches = regulationContent.toLowerCase().includes(keyword.toLowerCase());
    
    let confidence = keywordCount * 20; // Base score for keyword frequency
    
    if (regulationMatches) {
      confidence += 30; // Bonus for regulation content match
    }

    // Increase confidence for critical regulation categories
    if (regulationContent.toLowerCase().includes('critical') || 
        regulationContent.toLowerCase().includes('mandatory')) {
      confidence += 20;
    }

    return Math.min(95, Math.max(10, confidence)); // Cap between 10-95
  }

  private suggestLinkType(keyword: string, regulationContent: string): 'DIRECT' | 'INDIRECT' | 'REQUIREMENT' | 'REFERENCE' {
    const requirementsTerms = ['must', 'shall', 'required', 'mandatory', 'obligatory'];
    const referenceTerms = ['see', 'refer to', 'applied', 'follow'];

    const regulationLower = regulationContent.toLowerCase();

    if (requirementsTerms.some(term => regulationLower.includes(term))) {
      return 'REQUIREMENT';
    }

    if (referenceTerms.some(term => regulationLower.includes(term))) {
      return 'REFERENCE';
    } else if (regulationLower.includes(keyword.toLowerCase())) {
      return 'DIRECT';
    } else {
      return 'INDIRECT';
    }
  }

  async getCoverageReport(manualId: string): Promise<any> {
    console.log(`📊 Generating compliance coverage report for Manual ${manualId}`);

    // Get manual statistics
    const manual = await this.prisma.manual.findUnique({
      where: { id: manualId },
      include: {
        chapters: {
          include: {
            sections: {
              include: {
                blocks: true,
              },
            },
          },
        },
      },
    });

    if (!manual) {
      throw new NotFoundException(`Manual ${manualId} not found`);
    }

    // Count total blocks
    const totalBlocks = manual.chapters.reduce((total, chapter) =>
      total + chapter.sections.reduce((chapterTotal, section) =>
        chapterTotal + section.blocks.length, 0), 0);

    // Count linked blocks
    const linkedBlocksCount = await this.prisma.complianceLink.count({
      where: {
        manualId,
        status: {
          in: ['ACTIVE', 'DRAFT'],
        },
      },
      distinct: ['blockId'],
    });

    // Get links by regulation library
    const linksByLibrary = await this.prisma.complianceLink.groupBy({
      by: ['regulationLibraryId'],
      where: {
        manualId,
        status: {
          in: ['ACTIVE', 'DRAFT'],
        },
      },
      _count: {
        id: true,
      },
    });

    const libraries = await this.prisma.regulationLibrary.findMany({
      where: {
        id: {
          in: linksByLibrary.map(link => link.regulationLibraryId),
        },
      },
    });

    const libraryCoverage = linksByLibrary.map(link => {
      const library = libraries.find(lib => lib.id === link.regulationLibraryId);
      return {
        regulationLibraryId: link.regulationLibraryId,
        regulationLibraryTitle: library?.title || 'Unknown',
        linkedBlocks: link._count.id,
        coveragePercentage: Math.round((link._count.id / totalBlocks) * 100),
      };
    });

    const globalCoverage = Math.round((linkedBlocksCount / totalBlocks) * 100);

    return {
      manual: {
        id: manualId,
        title: manual.title,
      },
      coverage: {
        totalBlocks,
        linkedBlocks: linkedBlocksCount,
        unlinkedBlocks: totalBlocks - linkedBlocksCount,
        globalCoveragePercentage: globalCoverage,
      },
      byLibrary: libraryCoverage,
      summary: {
        coverageLevel: globalCoverage >= 80 ? 'HIGH' : globalCoverage >= 50 ? 'MEDIUM' : 'LOW',
        recommendations: globalCoverage < 50 ? [
          'Consider linking more paragraphs to regulations',
          'Focus on critical safety and operational sections',
          'Regular review of compliance coverage needed',
        ] : [],
      },
    };
  }
}
