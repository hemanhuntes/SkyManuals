import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiffEngineService } from '../diff-engine/diff-engine.service';
import {
  Manual,
  Chapter,
  Section,
  Block,
  ChangeSet,
  Change,
  Version,
  TipTapDocument,
  ManualSchema,
  ChangeSetSchema,
} from '@skymanuals/types';

@Injectable()
export class ManualsService {
  constructor(
    private prisma: PrismaService,
    private diffEngine: DiffEngineService,
  ) {}

  // Manual CRUD Operations
  async createManual(
    organizationId: string,
    title: string,
    authorId: string
  ): Promise<{ manual: Manual; changeSet: ChangeSet }> {
    const manual = await this.prisma.manual.create({
      data: {
        organizationId,
        title,
        status: 'DRAFT',
      },
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

    const changeSet = await this.createChangeSet(manual.id, 'Initial Manual Creation', authorId);

    return {
      manual: ManualSchema.parse(manual),
      changeSet,
    };
  }

  async getManual(manualId: string): Promise<Manual> {
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
      throw new NotFoundException(`Manual with ID ${manualId} not found`);
    }

    return ManualSchema.parse(manual);
  }

  async updateManual(
    manualId: string,
    updates: Partial<Pick<Manual, 'title' | 'status'>>,
    authorId: string,
    ifMatch?: string
  ): Promise<{ manual: Manual; changeSet: ChangeSet }> {
    const currentManual = await this.prisma.manual.findUnique({
      where: { id: manualId },
    });

    if (!currentManual) {
      throw new NotFoundException(`Manual with ID ${manualId} not found`);
    }

    // ETag validation would go here in a real implementation
    const updatedManual = await this.prisma.manual.update({
      where: { id: manualId },
      data: updates,
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

    const changeSet = await this.createChangeSet(manualId, `Update Manual`, authorId);

    return {
      manual: ManualSchema.parse(updatedManual),
      changeSet,
    };
  }

  // Chapter Operations
  async createChapter(
    manualId: string,
    title: string,
    number: string,
    authorId: string
  ): Promise<{ chapter: Chapter; changeSet: ChangeSet }> {
    await this.validateManualExists(manualId);

    const chapter = await this.prisma.chapter.create({
      data: {
        manualId,
        title,
        number,
      },
      include: {
        sections: {
          include: {
            blocks: true,
          },
        },
      },
    });

    const changeSet = await this.createChangeSet(manualId, `Add Chapter: ${title}`, authorId);

    return { chapter: chapter as any, changeSet };
  }

  // Section Operations
  async createSection(
    chapterId: string,
    title: string,
    number: string,
    authorId: string
  ): Promise<{ section: Section; changeSet: ChangeSet }> {
    const chapter = await this.validateChapterExists(chapterId);

    const section = await this.prisma.section.create({
      data: {
        chapterId,
        title,
        number,
      },
      include: {
        blocks: true,
      },
    });

    const changeSet = await this.createChangeSet(
      chapter.manualId,
      `Add Section: ${title}`,
      authorId
    );

    return { section: section as any, changeSet };
  }

  // Block Operations with TipTap
  async updateBlockContent(
    blockId: string,
    content: TipTapDocument,
    authorId: string,
    ifMatch?: string
  ): Promise<{ block: Block; changeSet: ChangeSet; version: Version }> {
    const currentBlock = await this.prisma.block.findUnique({
      where: { id: blockId },
      include: {
        section: {
          include: {
            chapter: true,
          },
        },
      },
    });

    if (!currentBlock) {
      throw new NotFoundException(`Block with ID ${blockId} not found`);
    }

    const updatedBlock = await this.prisma.block.update({
      where: { id: blockId },
      data: { content },
      include: {
        section: {
          include: {
            chapter: true,
          },
        },
      },
    });

    const changeSet = await this.createChangeSet(
      currentBlock.section.chapter.manualId,
      `Update Block Content`,
      authorId
    );

    const version = this.diffEngine.createVersion(
      currentBlock.section.chapter.manualId,
      changeSet.id,
      { blockId }
    );

    return { 
      block: updatedBlock as any, 
      changeSet, 
      version: version as any 
    };
  }

  async insertSmartBlock(
    sectionId: string,
    smartBlockType: string,
    position: number,
    authorId: string
  ): Promise<{ block: Block; changeSet: ChangeSet }> {
    const section = await this.validateSectionExists(sectionId);

    const block = await this.prisma.block.create({
      data: {
        sectionId,
        content: this.createSmartBlockContent(smartBlockType),
        smartBlockType: smartBlockType as any,
        smartBlockConfig: this.getDefaultSmartBlockConfig(smartBlockType),
        attachments: [],
      },
    });

    const changeSet = await this.createChangeSet(
      section.chapter.manualId,
      `Insert Smart Block: ${smartBlockType}`,
      authorId
    );

    return { block: block as any, changeSet };
  }

  // ChangeSet Operations
  async getChangeSet(changeSetId: string): Promise<ChangeSet> {
    const changeSet = await this.prisma.changeSet.findUnique({
      where: { id: changeSetId },
      include: {
        changes: true,
        author: true,
      },
    });

    if (!changeSet) {
      throw new NotFoundException(`ChangeSet with ID ${changeSetId} not found`);
    }

    return ChangeSetSchema.parse(changeSet);
  }

  async approveChangeSet(changeSetId: string): Promise<ChangeSet> {
    return this.updateChangeSetStatus(changeSetId, 'APPROVED');
  }

  async rejectChangeSet(changeSetId: string): Promise<ChangeSet> {
    return this.updateChangeSetStatus(changeSetId, 'REJECTED');
  }

  async mergeChangeSet(changeSetId: string): Promise<ChangeSet> {
    const changeSet = await this.updateChangeSetStatus(changeSetId, 'MERGED');
    return changeSet;
  }

  // Export Operations (stubs)
  async exportToHtml(manualId: string): Promise<string> {
    const manual = await this.getManual(manualId);
    
    // This would generate HTML from TipTap content
    return `<html><head><title>${manual.title}</title></head><body><h1>${manual.title}</h1><p>Manual content...</p></body></html>`;
  }

  async exportToPdf(manualId: string): Promise<Buffer> {
    const html = await this.exportToHtml(manualId);
    
    // This would use a library like puppeteer to generate PDF
    return Buffer.from('PDF stub content', 'utf-8');
  }

  // Private helper methods
  private async createChangeSet(
    manualId: string,
    title: string,
    authorId: string
  ): Promise<ChangeSet> {
    const changeSet = await this.prisma.changeSet.create({
      data: {
        manualId,
        title,
        authorId,
        status: 'PENDING',
      },
    });

    return changeSet;
  }

  private async validateManualExists(manualId: string) {
    const manual = await this.prisma.manual.findUnique({
      where: { id: manualId },
    });

    if (!manual) {
      throw new NotFoundException(`Manual with ID ${manualId} not found`);
    }

    return manual;
  }

  private async validateChapterExists(chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: {
        manual: true,
      },
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    return chapter;
  }

  private async validateSectionExists(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: {
        chapter: true,
      },
    });

    if (!section) {
      throw new NotFoundException(`Section with ID ${sectionId} not found`);
    }

    return section;
  }

  private async updateChangeSetStatus(changeSetId: string, status: string): Promise<ChangeSet> {
    const changeSet = await this.prisma.changeSet.update({
      where: { id: changeSetId },
      data: { status },
    });

    return ChangeSetSchema.parse(changeSet);
  }

  private createSmartBlockContent(smartBlockType: string): any {
    const baseContent = {
      type: 'doc',
      content: [
        {
          type: `smartBlock_${smartBlockType.toLowerCase()}`,
          attrs: {},
          content: [
            {
              type: 'text',
              text: `${smartBlockType} placeholder content`,
            },
          ],
        },
      ],
    };

    return baseContent;
  }

  private getDefaultSmartBlockConfig(smartBlockType: string): any {
    const configs = {
      LEP: { level: 1, required: true },
      MEL: { level: 1, required: false },
      ChangeLog: { autoDate: true, includeAuthor: true },
      RevisionBar: { showRevisions: true, maxVisible: 10 },
      CrossRef: { targetChapter: null, autoUpdate: true },
    ];

    return configs[smartBlockType] || {};
  }
}






