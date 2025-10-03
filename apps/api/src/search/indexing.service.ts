import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { 
  SearchIndex,
  IndexingJob,
  ContentType 
} from '@sky/manuals/types';

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Index released manual content for search
   */
  async indexReleasedContent(): Promise<string> {
    const job = await this.prisma.indexingJob.create({
        data: {
          type: 'INCREMENTAL',
          status: 'RUNNING',
          progress: {
            totalItems: 0,
            processedItems: 0,
            failedItems: 0,
            currentPhase: 'Starting',
          },
        triggeredBy: 'SYSTEM',
        startedAt: new Date(),
      },
    });

    try {
      await this.performIndexing(job.id);
      return job.id;
    } catch (error) {
      this.logger.error('Indexing failed:', error);
      await this.prisma.indexingJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Recreate full search index
   */
  async recreateFullIndex(): Promise<string> {
    const job = await this.prisma.indexingJob.create({
      data: {
        type: 'FULL_RECREATE',
        status: 'RUNNING',
        progress: {
          totalItems: 0,
          processedItems: 0,
          failedItems: 0,
          currentPhase: 'Clearing existing index',
        },
        triggeredBy: 'SYSTEM',
        startedAt: new Date(),
      },
    });

    try {
      // Clear existing index
      await this.prisma.searchIndex.deleteMany();
      
      // Perform full indexing
      await this.performIndexing(job.id);
      return job.id;
    } catch (error) {
      this.logger.error('Full index recreation failed:', error);
      await this.prisma.indexingJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Index content from release snapshot
   */
  async indexReleaseSnapshot(snapshotId: string): Promise<void> {
    const snapshot = await this.prisma.releaseSnapshot.findUnique({
      where: { id: snapshotId },
      include: {
        manual: {
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
        },
      },
    });

    if (!snapshot) {
      throw new Error(`Release snapshot ${snapshotId} not found`);
    }

    await this.indexManualContent(snapshot.manual, snapshot.version);
  }

  /**
   * Main indexing logic
   */
  private async performIndexing(jobId: string): Promise<void> {
    let processedItems = 0;
    let failedItems = 0;

    try {
      // Get all released manuals
      const releasedManuals = await this.prisma.releaseSnapshot.findMany({
        where: { publishedAt: { not: null } },
        include: {
          manual: {
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
          },
        },
        orderBy: { publishedAt: 'desc' },
      });

      const totalItems = this.calculateTotalItems(releasedManuals);

      // Update job progress
      await this.prisma.indexingJob.update({
        where: { id: jobId },
        data: {
          progress: {
            totalItems,
            processedItems: 0,
            failedItems: 0,
            currentPhase: 'Indexing content',
          },
        },
      });

      // Process each manual
      for (const snapshot of releasedManuals) {
        try {
          const indexed = await this.indexManualContent(snapshot.manual, snapshot.version);
          processedItems += indexed;
          
          // Update progress
          await this.prisma.indexingJob.update({
            where: { id: jobId },
            data: {
              progress: {
                totalItems,
                processedItems,
                failedItems,
                currentPhase: `Indexed ${snapshot.manual.title}`,
              },
            },
          });
        } catch (error) {
          this.logger.error(`Failed to index manual ${snapshot.manual.id}:`, error);
          failedItems++;
        }
      }

      // Complete job
      await this.prisma.indexingJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          progress: {
            totalItems,
            processedItems,
            failedItems,
            currentPhase: 'Completed',
          },
          completedAt: new Date(),
        },
      });

    } catch (error) {
      this.logger.error('Indexing process failed:', error);
      await this.prisma.indexingJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Index individual manual content
   */
  private async indexManualContent(manual: any, version: string): Promise<number> {
    let indexedCount = 0;

    for (const chapter of manual.chapters) {
      // Index chapter-level content
      const chapterIndex = await this.createSearchIndex({
        manualId: manual.id,
        chapterId: chapter.id,
        sectionId: '',
        version,
        contentType: 'CHAPTER' as ContentType,
        title: chapter.title,
        content: this.extractTextContent({}) || chapter.title,
        organizationId: manual.organizationId,
        isReleased: true,
      });
      
      if (chapterIndex) indexedCount++;

      for (const section of chapter.sections) {
        // Index section-level content
        const sectionIndex = await this.createSearchIndex({
          manualId: manual.id,
          chapterId: chapter.id,
          sectionId: section.id,
          version,
          contentType: 'SECTION' as ContentType,
          title: section.title,
          content: this.extractTextContent({}) || section.title,
          organizationId: manual.organizationId,
          isReleased: true,
        });
        
        if (sectionIndex) indexedCount++;

        // Index paragraph-level content
        for (const block of section.blocks) {
          const blockIndex = await this.createSearchIndex({
            manualId: manual.id,
            chapterId: chapter.id,
            sectionId: section.id,
            paragraphId: block.id,
            version,
            contentType: 'PARAGRAPH' as ContentType,
            title: `${chapter.number} ${section.number}`,
            content: this.extractTextContent(block.content),
            organizationId: manual.organizationId,
            isReleased: true,
          });
          
          if (blockIndex) indexedCount++;
        }
      }
    }

    return indexedCount;
  }

  /**
   * Create search index entry
   */
  private async createSearchIndex(params: {
    manualId: string;
    chapterId: string;
    sectionId: string;
    paragraphId?: string;
    version: string;
    contentType: ContentType;
    title: string;
    content: string;
    organizationId: string;
    isReleased: boolean;
  }): Promise<SearchIndex | null> {
    try {
      const contentHash = this.generateContentHash(params.content);
        
      // Check if already indexed with same content
      const existing = await this.prisma.searchIndex.findUnique({
        where: { contentHash },
      });

      if (existing) {
        return existing;
      }

      // Create new search index entry
      const searchIndex = await this.prisma.searchIndex.create({
        data: {
          contentHash,
          manualId: params.manualId,
          chapterId: params.chapterId,
          sectionId: params.sectionId,
          paragraphId: params.paragraphId,
          version: params.version,
          contentType: params.contentType,
          title: params.title,
          content: params.content,
          bm25Tokens: this.tokenizeContent(params.content),
          wordCount: this.countWords(params.content),
          anchorIds: this.generateAnchorIds(params),
          organizationId: params.organizationId,
          isReleased: params.isReleased,
        },
      });

      // Generate semantic vector (would call OpenAI in production)
      // await this.generateAndStoreSemanticVector(searchIndex.id, params.content);

      return searchIndex;
    } catch (error) {
      this.logger.error('Failed to create search index:', error);
      return null;
    }
  }

  /**
   * Calculate total items to index
   */
  private calculateTotalItems(manuals: any[]): number {
    return manuals.reduce((total, snapshot) => {
      const manual = snapshot.manual;
      return total + 
        manual.chapters.length + 
        manual.chapters.reduce((chTotal: number, chapter: any) => 
          chTotal + chapter.sections.reduce((sTotal: number, section: any) => 
            sTotal + section.blocks.length, 0), 0);
    }, 0);
  }

  /**
   * Extract plain text from TipTap content
   */
  private extractTextContent(content: any): string {
    if (!content || typeof content !== 'object') {
      return '';
    }

    if (typeof content === 'string') {
      return content;
    }

    if (content.content && Array.isArray(content.content)) {
      return content.content
        .map((node: any) => this.extractTextFromNode(node))
        .join('')
        .trim();
    }

    return '';
  }

  /**
   * Extract text from TipTap node
   */
  private extractTextFromNode(node: any): string {
    if (!node) return '';

    if (node.text) {
      return node.text;
    }

    if (node.content && Array.isArray(node.content)) {
      return node.content.map((child: any) => this.extractTextFromNode(child)).join('');
    }

    if (node.type === 'paragraph' && node.content) {
      return node.content.map((child: any) => this.extractTextFromNode(child)).join('') + '\n';
    }

    return '';
  }

  /**
   * Tokenize content for BM25 search
   */
  private tokenizeContent(content: string): string[] {
    return content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2)
      .filter((token, index, array) => array.indexOf(token) === index); // Remove duplicates
  }

  /**
   * Count words in content
   */
  private countWords(content: string): number {
    return content.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Generate content hash for deduplication
   */
  private generateContentHash(content: string): string {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Generate anchor IDs for navigation
   */
  private generateAnchorIds(params: any): string[] {
    const anchors: string[] = [];
    
    if (params.chapterId) {
      anchors.push(`chapter-${params.chapterId}`);
    }
    
    if (params.sectionId) {
      anchors.push(`section-${params.sectionId}`);
    }
    
    if (params.paragraphId) {
      anchors.push(`paragraph-${params.paragraphId}`);
    }

    return anchors;
  }

  /**
   * Get indexing job status
   */
  async getJobStatus(jobId: string): Promise<IndexingJob | null> {
    return this.prisma.indexingJob.findUnique({
      where: { id: jobId },
    });
  }

  /**
   * Get recent indexing jobs
   */
  async getRecentJobs(limit: number = 10): Promise<IndexingJob[]> {
    return this.prisma.indexingJob.findMany({
      take: limit,
      orderBy: {
        startedAt: 'desc',
      },
    });
  }
}
