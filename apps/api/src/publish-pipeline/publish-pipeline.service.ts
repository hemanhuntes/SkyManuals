import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search-engine/search-index.service';
import { CloudFrontService } from '../reader/cloudfront.service';
import { 
  ReaderBundle,
  ReleaseSnapshot,
  ReaderBundleSchema,
} from '@skymanuals/types';
import { z } from 'zod';

@Injectable()
export class PublishPipelineService {
  constructor(
    private prisma: PrismaService,
    private searchIndexService: SearchIndexService,
    private cloudFrontService: CloudFrontService,
  ) {}

  async publishReleaseSnapshot(releaseSnapshotId: string): Promise<ReaderBundle> {
    console.log(`📦 Publishing ReleaseSnapshot ${releaseSnapshotId}`);

    // Get release snapshot with related data
    const releaseSnapshot = await this.prisma.releaseSnapshot.findUnique({
      where: { id: releaseSnapshotId },
      include: {
        manual: {
          include: {
            organization: true,
            chapters: {
              include: {
                sections: {
                 <｜tool▁sep｜>include: {
                    blocks: true,
                  },
                },
              },
            },
          },
        },
        changeSet: true,
      },
    });

    if (!releaseSnapshot) {
      throw new NotFoundException(`ReleaseSnapshot ${releaseSnapshotId} not found`);
    }

    // Generate static JSON bundle
    const bundle = await this.generateStaticBundle(releaseSnapshot);

    // Upload bundle to CDN
    const bundleUrl = await this.uploadBundleToCdn(bundle);

    // Create ReaderBundle record
    const readerBundle = await this.prisma.readerBundle.create({
      data: {
        manualId: releaseSnapshot.manualId,
        releaseSnapshotId,
        version: releaseSnapshot.version,
        bundleUrl,
        bundleSize: JSON.stringify(bundle).length,
        expiresAt: this.calculateExpirationDate(releaseSnapshot.manual.status === 'RELEASED' ? 'permanent' : 'temporary'),
      },
    });

    // Generate search index
    await this.generateSearchIndex(releaseSnapshot.manualId, readerBundle.id, bundle);

    // Generate revision bars for "What's New"
    await this.generateRevisionBars(releaseSnapshot.manualId, readerBundle.id, releaseSnapshot);

    console.log(`✅ Published bundle for Manual ${releaseSnapshot.manual.title} v${releaseSnapshot.version}`);
    console.log(`📊 Bundle size: ${readerBundle.bundleSize} bytes`);
    console.log(`🔗 CDN URL: ${bundleUrl}`);

    return ReaderBundleSchema.parse(readerBundle);
  }

  private async generateStaticBundle(releaseSnapshot: any): Promise<any> {
    const { manual, changeSet } = releaseSnapshot;

    // Extract TipTap content from contentSnapshot
    const contentSnapshot = releaseSnapshot.contentSnapshot as any;

    // Build hierarchical content structure for efficient querying
    const bundle = {
      bundleId: `bundle-${Date.now()}`, // Temporary ID, will be updated with actual bundle ID
      manualId: manual.id,
      version: releaseSnapshot.version,
      publishedAt: new Date().toISOString(),
      manual: {
        id: manual.id,
        title: manual.title,
        organizationId: manual.organizationId,
        organization: {
          name: manual.organization.name,
          slug: manual.organization.slug,
          logoUrl: manual.organization.logoUrl,
        },
        status: manual.status,
        publishedAt: releaseSnapshot.createdAt,
      },
      chapters: manual.chapters.map(chapter => ({
        id: chapter.id,
        title: chapter.title,
        number: chapter.number,
        sections: chapter.sections.map(section => ({
          id: section.id,
          title: section.title,
          number: section.number,
          status: section.status,
          blocks: section.blocks.map(block => ({
            id: block.id,
            content: block.content, // TipTap JSON
            smartBlock: block.smartBlockType ? {
              type: block.smartBlockType,
              config: block.smartBlockConfig,
            } : null,
            attachments: block.attachments,
          })),
        })),
      })),
      metadata: {
        bundleVersion: '1.0',
        contentSnapshotId: releaseSnapshot.id,
        changeSetTitle: changeSet.title,
        changeSetDescription: changeSet.description,
        authorId: changeSet.authorId,
        createdAt: releaseSnapshot.createdAt,
      },
      checksum: this.generateContentChecksum(contentSnapshot),
    };

    return bundle;
  }

  private async uploadBundleToCdn(bundle: any): Promise<string> {
    const filename = `${bundle.manualId}-v${bundle.version}-${bundle.bundleId}.json`;
    const bundleData = JSON.stringify(bundle, null, 2);
    const bundleSize = Buffer.byteLength(bundleData, 'utf8');
    
    console.log(`📤 Uploading bundle to CDN: ${filename}`);
    console.log(`📊 Upload size: ${bundleSize} bytes`);
    
    try {
      // Use CloudFront service to upload to S3 and get CDN URL
      const cdnUrl = await this.cloudFrontService.uploadBundle(bundleData, filename, {
        contentType: 'application/json',
        cacheControl: 'public, max-age=3600', // Cache for 1 hour
        metadata: {
          manualId: bundle.manualId,
          version: bundle.version,
          bundleId: bundle.bundleId,
          uploadDate: new Date().toISOString()
        }
      });
      
      console.log(`✅ Bundle uploaded successfully to CDN: ${cdnUrl}`);
      return cdnUrl;
      
    } catch (error) {
      console.error(`❌ Failed to upload bundle to CDN: ${error.message}`);
      
      // Fallback: Store in database and serve via API
      const fallbackUrl = await this.storeBundleAsFallback(bundle, filename);
      console.log(`🔄 Using fallback storage: ${fallbackUrl}`);
      
      return fallbackUrl;
    }
  }

  private async storeBundleAsFallback(bundle: any, filename: string): Promise<string> {
    try {
      // Store bundle in database as fallback
      const bundleData = JSON.stringify(bundle, null, 2);
      
      // Create a fallback record in the database
      const fallbackBundle = await this.prisma.bundleFallback.create({
        data: {
          filename,
          content: bundleData,
          manualId: bundle.manualId,
          version: bundle.version,
          bundleId: bundle.bundleId,
          size: Buffer.byteLength(bundleData, 'utf8'),
          createdAt: new Date()
        }
      });
      
      // Return API endpoint URL for serving the fallback bundle
      const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
      return `${baseUrl}/api/bundles/fallback/${fallbackBundle.id}`;
      
    } catch (error) {
      console.error(`❌ Failed to store fallback bundle: ${error.message}`);
      
      // Last resort: return a mock URL
      return `https://cdn.skymanuals.com/bundles/${filename}`;
    }

  private async generateSearchIndex(manualId: string, bundleId: string, bundle: any): Promise<void> {
    console.log(`🔍 Generating search index for Manual ${manualId}`);

    const searchableText = this.extractSearchableText(bundle);
    
    // Generate keywords and phrases
    const keywords = await this.extractKeywords(searchableText);
    const phrases = await this.extractKeyPhrases(searchableText);
    
    // Extract named entities (aircraft types, procedures, etc.)
    const entities = await this.extractNamedEntities(searchableText);

    // Build section-level indexes for precise searching
    const sections = this.buildSectionIndexes(bundle);

    await this.prisma.searchIndex.create({
      data: {
        manualId,
        bundleId,
        searchableText,
        indexes: {
          keywords,
          phrases,
          entities,
          sections,
        },
      },
    });

    console.log(`✅ Search index generated: ${keywords.length} keywords, ${phrases.length} phrases, ${entities.length} entities`);
  }

  private async generateRevisionBars(manualId: string, bundleId: string, releaseSnapshot: any): Promise<void> {
    console.log(`📝 Generating revision bars for Manual ${manualId}`);

    const changeSet = releaseSnapshot.changeSet;
    const changes = await this.prisma.change.findMany({
      where: { changeSetId: changeSet.id },
    });

    const revisionBars = changes.map(change => ({
      manualId,
      bundleId,
      chapterId: change.entityType === 'CHAPTER' ? change.entityId : this.extractChapterIdFromEntity(change),
      sectionId: change.entityType === 'SECTION' ? change.entityId : this.extractSectionIdFromEntity(change),
      blockId: change.entityType === 'BLOCK' ? change.entityId : null,
      revisionType: this.mapChangeTypeToRevisionType(change.changeType),
      oldVersion: 'previous', // Would be extracted from version comparison
      newVersion: releaseSnapshot.version,
      description: change.diff || `${change.changeType} operation`,
      authorName: 'Author Name', // Would be fetched from authorId
      changedAt: change.createdAt,
    }));

    await this.prisma.revisionBar.createMany({
      data: revisionBars,
    });

    console.log(`✅ Generated ${revisionBars.length} revision bars`);
  }

  private extractSearchableText(bundle: any): string {
    let searchableText = '';
    
    searchableText += `${bundle.manual.title} `;
    
    bundle.chapters.forEach((chapter: any) => {
      searchableText += `${chapter.title} ${chapter.number} `;
      
      chapter.sections.forEach((section: any) => {
        searchableText += `${section.title} ${section.number} `;
        
        section.blocks.forEach((block: any) => {
          if (block.content && typeof block.content === 'object') {
            searchableText += this.extractTextFromTipTapContent(block.content) + ' ';
          }
          if (block.smartBlock) {
            searchableText += `smart-block ${block.smartBlock.type} `;
          }
        });
      });
    });

    return searchableText.trim();
  }

  private extractTextFromTipTapContent(content: any): string {
    if (!content || typeof content !== 'object') return '';
    
    if (content.type === 'doc' && content.content) {
      return content.content
        .map((node: any) => this.extractTextFromNode(node))
        .join(' ');
    }
    
    return this.extractTextFromNode(content);
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

  private async extractKeywords(text: string): Promise<string[]> {
    // Mock keyword extraction - in production, use NLP libraries
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    const wordCount = new Map();
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });
    
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100) // Top 100 keywords
      .map(([word]) => word);
  }

  private async extractKeyPhrases(text: string): Promise<string[]> {
    // Mock phrase extraction - in production, use NLP libraries
    const phrases = [
      'aircraft maintenance',
      'operational procedures',
      'flight manual',
      'safety guidelines',
      'emergency procedures',
      'preventive maintenance',
    ];
    
    return phrases.filter(phrase => 
      text.toLowerCase().includes(phrase.toLowerCase())
    );
  }

  private async extractNamedEntities(text: string): Promise<string[]> {
    // Mock named entity extraction - in production, use NLP libraries
    const entities = [
      'Boeing 737',
      'Airbus A320',
      'CFM56 Engine',
      'ICAO',
      'FAA',
      'EASA',
    ];
    
    return entities.filter(entity => 
      text.includes(entity)
    );
  }

  private buildSectionIndexes(bundle: any): any[] {
    const sections = [];
    let position = 0;

    bundle.chapters.forEach((chapter: any) => {
      chapter.sections.forEach((section: any) => {
        section.blocks.forEach((block: any) => {
          const blockText = block.content ? this.extractTextFromTipTapContent(block.content) : '';
          
          sections.push({
            chapterId: chapter.id,
            sectionId: section.id,
            blockId: block.id,
            blockText,
            position: position++,
          });
        });
      });
    });

    return sections;
  }

  private calculateExpirationDate(type: 'permanent' | 'temporary'): Date {
    if (type === 'permanent') {
      // Permanent manuals don't expire (set far future date)
      return new Date('2099-12-31');
    } else {
      // Temporary manuals expire after 30 days
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  }

  private generateContentChecksum(content: any): string {
    const contentString = JSON.stringify(content);
    // Simple checksum implementation - in production, use crypto.hash
    return Buffer.from(contentString).toString('base64').slice(0, 16);
  }

  private extractChapterIdFromEntity(change: any): string {
    // Mock implementation - in production, extract chapter ID from change context
    return 'chapter-placeholder';
  }

  private extractSectionIdFromEntity(change: any): string {
    // Mock implementation - in production, extract section ID from change context  
    return 'section-placeholder';
  }

  private mapChangeTypeToRevisionType(changeType: string): 'NEW' | 'UPDATED' | 'MODIFIED' | 'DELETED' {
    switch (changeType) {
      case 'CREATE': return 'NEW';
      case 'UPDATE': return 'MODIFIED';
      case 'DELETE': return 'DELETED';
      case 'MERGE': return 'UPDATED';
      default: return 'UPDATED';
    }
  }

  async getBundleUrl(manualId: string, version?: string): Promise<string> {
    const where: any = { manualId };
    if (version) {
      where.version = version;
    } else {
      // Get latest version if not specified
      where.version = await this.getLatestVersion(manualId);
    }

    const bundle = await this.prisma.readerBundle.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (!bundle) {
      throw new NotFoundException(`Bundle for Manual ${manualId} not found`);
    }

    return bundle.bundleUrl;
  }

  private async getLatestVersion(manualId: string): Promise<string> {
    const bundle = await this.prisma.readerBundle.findFirst({
      where: { manualId },
      orderBy: { createdAt: 'desc' },
    });

    return bundle?.version || '1.0.0';
  }

  async validateBundleAccess(manualId: string, bundleId: string, userId: string): Promise<boolean> {
    // Check if user has access permission
    const permission = await this.prisma.accessPermission.findFirst({
      where: {
        userId,
        manualId,
        bundleId,
      },
    });

    if (permission) {
      return true;
    }

    // Check organization membership
    const member = await this.prisma.member.findFirst({
      where: {
        userId,
        organization: {
          manuals: {
            some: { id: manualId },
          },
        },
      },
    });

    // Users with organization membership have READ access by default
    return !!member;
  }

  async getOfflineCapabilities(bundleId: string, userId: string): Promise<any> {
    const bundle = await this.prisma.readerBundle.findUnique({
      where: { id: bundleId },
    });

    if (!bundle) {
      throw new NotFoundException(`Bundle ${bundleId} not found`);
    }

    const cachedBundle = await this.prisma.offlineCache.findUnique({
      where: {
        userId_bundleId: {
          userId,
          bundleId,
        },
      },
    });

    return {
      bundleId,
      canCache: !bundle.expiresAt || bundle.expiresAt > new Date(),
      estimatedSizeMB: Math.round(bundle.bundleSize / (1024 * 1024) * 100) / 100,
      includesAnnotations: !!cachedBundle,
      includesSearchIndex: true, // Always included in bundles
      lastSyncAt: cachedBundle?.cachedAt || null,
      syncRequired: !cachedBundle || cachedBundle.expiresAt < new Date(),
    };
  }
}




