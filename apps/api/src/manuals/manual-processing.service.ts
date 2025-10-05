import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as pdfParse from 'pdf-parse';
import { v4 as uuidv4 } from 'uuid';

export interface ProcessedManual {
  title: string;
  chapters: ChapterStructure[];
  sections: SectionStructure[];
  blocks: BlockStructure[];
  metadata: ManualMetadata;
}

export interface ChapterStructure {
  number: number;
  title: string;
  sections: SectionStructure[];
  content: string;
}

export interface SectionStructure {
  number: string;
  title: string;
  blocks: BlockStructure[];
  content: string;
}

export interface BlockStructure {
  id: string;
  type: 'TEXT' | 'LIST' | 'TABLE' | 'IMAGE' | 'PROCEDURE';
  content: string;
  metadata?: any;
}

export interface ManualMetadata {
  pages: number;
  info: any;
  version: string;
  filename: string;
  uploadedAt: Date;
}

@Injectable()
export class ManualProcessingService {
  private readonly logger = new Logger(ManualProcessingService.name);

  constructor(private prisma: PrismaService) {}

  async processUploadedPDF(file: Buffer, filename: string): Promise<ProcessedManual> {
    this.logger.log(`Processing PDF: ${filename}`);

    try {
      // Parse PDF
      const data = await pdfParse(file);
      
      // Extract text and metadata
      const text = data.text;
      const metadata: ManualMetadata = {
        pages: data.numpages,
        info: data.info,
        version: data.version || '1.0',
        filename,
        uploadedAt: new Date()
      };
      
      // Parse structure using AI-accelerated patterns
      const structure = this.parseAviationManualStructure(text);
      
      return {
        title: this.extractTitle(text, metadata),
        chapters: structure.chapters,
        sections: structure.sections,
        blocks: structure.blocks,
        metadata
      };
    } catch (error) {
      this.logger.error(`Failed to process PDF ${filename}:`, error);
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  private parseAviationManualStructure(text: string): {
    chapters: ChapterStructure[];
    sections: SectionStructure[];
    blocks: BlockStructure[];
  } {
    this.logger.log('Parsing aviation manual structure');

    const chapters: ChapterStructure[] = [];
    const sections: SectionStructure[] = [];
    const blocks: BlockStructure[] = [];

    // Aviation manuals follow standard patterns:
    // "CHAPTER 1" or "1. CHAPTER TITLE"
    // "Section 1.1" or "1.1 SECTION TITLE"
    
    const chapterRegex = /(?:CHAPTER|Chapter)\s+(\d+)[:\s]+(.+?)(?=(?:CHAPTER|Chapter)\s+\d+|$)/gs;
    
    let match;
    while ((match = chapterRegex.exec(text)) !== null) {
      const chapterNumber = parseInt(match[1]);
      const chapterContent = match[2];
      
      const chapter: ChapterStructure = {
        number: chapterNumber,
        title: this.extractChapterTitle(chapterContent),
        sections: this.extractSections(chapterContent, chapterNumber),
        content: chapterContent
      };
      
      chapters.push(chapter);
      
      // Extract sections from chapter
      sections.push(...chapter.sections);
      
      // Extract blocks from sections
      chapter.sections.forEach(section => {
        blocks.push(...section.blocks);
      });
    }

    // If no chapters found, try alternative patterns
    if (chapters.length === 0) {
      const altChapters = this.parseAlternativeStructure(text);
      chapters.push(...altChapters);
    }

    this.logger.log(`Parsed ${chapters.length} chapters, ${sections.length} sections, ${blocks.length} blocks`);

    return { chapters, sections, blocks };
  }

  private parseAlternativeStructure(text: string): ChapterStructure[] {
    // Alternative pattern: "1. CHAPTER TITLE" or "1 CHAPTER TITLE"
    const altChapterRegex = /^(\d+)[\.\s]+([A-Z][^0-9\n]+?)(?=\n\d+[\.\s]+[A-Z]|$)/gm;
    const chapters: ChapterStructure[] = [];
    
    let match;
    while ((match = altChapterRegex.exec(text)) !== null) {
      const chapterNumber = parseInt(match[1]);
      const chapterTitle = match[2].trim();
      
      chapters.push({
        number: chapterNumber,
        title: chapterTitle,
        sections: [],
        content: ''
      });
    }
    
    return chapters;
  }

  private extractChapterTitle(content: string): string {
    // Extract title from first line or heading
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      // Remove common prefixes
      return firstLine.replace(/^(CHAPTER|Chapter)\s+\d+[:\s]*/i, '').trim();
    }
    return 'Untitled Chapter';
  }

  private extractSections(chapterContent: string, chapterNumber: number): SectionStructure[] {
    const sections: SectionStructure[] = [];
    
    // Pattern: "Section 1.1" or "1.1 SECTION TITLE" or "1.1.1 SUBSECTION"
    const sectionRegex = /(?:Section\s+)?(\d+\.\d+(?:\.\d+)?)[:\s]+(.+?)(?=(?:Section\s+)?\d+\.\d+(?:\.\d+)?[:\s]+|$)/gs;
    
    let match;
    while ((match = sectionRegex.exec(chapterContent)) !== null) {
      const sectionNumber = match[1];
      const sectionContent = match[2];
      
      const section: SectionStructure = {
        number: sectionNumber,
        title: this.extractSectionTitle(sectionContent),
        blocks: this.extractBlocks(sectionContent),
        content: sectionContent
      };
      
      sections.push(section);
    }
    
    return sections;
  }

  private extractSectionTitle(content: string): string {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      // Remove section number prefix
      return firstLine.replace(/^\d+\.\d+(?:\.\d+)?[:\s]*/, '').trim();
    }
    return 'Untitled Section';
  }

  private extractBlocks(content: string): BlockStructure[] {
    const blocks: BlockStructure[] = [];
    
    // Split content into logical blocks
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
    
    paragraphs.forEach((paragraph, index) => {
      const blockType = this.determineBlockType(paragraph);
      
      blocks.push({
        id: uuidv4(),
        type: blockType,
        content: paragraph.trim(),
        metadata: {
          index,
          length: paragraph.length
        }
      });
    });
    
    return blocks;
  }

  private determineBlockType(content: string): BlockStructure['type'] {
    const text = content.toLowerCase();
    
    // Check for procedure indicators
    if (text.includes('procedure') || text.includes('step') || text.includes('action')) {
      return 'PROCEDURE';
    }
    
    // Check for list indicators
    if (text.match(/^\d+\./) || text.match(/^[•\-\*]/) || text.match(/^[a-z]\./)) {
      return 'LIST';
    }
    
    // Check for table indicators
    if (text.includes('|') || text.includes('\t') || text.match(/\s{3,}/)) {
      return 'TABLE';
    }
    
    // Check for image references
    if (text.includes('figure') || text.includes('image') || text.includes('diagram')) {
      return 'IMAGE';
    }
    
    return 'TEXT';
  }

  private extractTitle(text: string, metadata: ManualMetadata): string {
    // Try to extract title from PDF info first
    if (metadata.info?.Title) {
      return metadata.info.Title;
    }
    
    // Try to extract from first few lines
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      // Skip common headers
      if (!firstLine.match(/^(CHAPTER|Chapter|Section|Page)/i)) {
        return firstLine;
      }
    }
    
    // Fallback to filename
    return metadata.filename.replace('.pdf', '');
  }

  async createManualFromProcessed(
    processed: ProcessedManual,
    organizationId: string,
    userId: string
  ): Promise<any> {
    this.logger.log(`Creating manual: ${processed.title}`);

    return await this.prisma.$transaction(async (tx) => {
      // Create manual
      const manual = await tx.manual.create({
        data: {
          title: processed.title,
          organizationId,
          createdBy: userId,
          status: 'DRAFT',
          metadata: processed.metadata,
          version: '1.0'
        }
      });

      // Create chapters
      for (const chapterData of processed.chapters) {
        const chapter = await tx.chapter.create({
          data: {
            manualId: manual.id,
            number: chapterData.number,
            title: chapterData.title,
            content: chapterData.content,
            status: 'DRAFT'
          }
        });

        // Create sections
        for (const sectionData of chapterData.sections) {
          const section = await tx.section.create({
            data: {
              chapterId: chapter.id,
              number: sectionData.number,
              title: sectionData.title,
              content: sectionData.content,
              status: 'DRAFT'
            }
          });

          // Create blocks
          for (const blockData of sectionData.blocks) {
            await tx.block.create({
              data: {
                sectionId: section.id,
                type: blockData.type,
                content: blockData.content,
                metadata: blockData.metadata,
                status: 'DRAFT'
              }
            });
          }
        }
      }

      // Create initial changeset
      await tx.changeSet.create({
        data: {
          manualId: manual.id,
          title: 'Initial upload',
          description: `Manual uploaded from ${processed.metadata.filename}`,
          status: 'DRAFT',
          createdBy: userId,
          changes: {
            type: 'CREATE',
            description: 'Manual created from PDF upload'
          }
        }
      });

      this.logger.log(`Created manual ${manual.id} with ${processed.chapters.length} chapters`);

      return manual;
    });
  }
}
