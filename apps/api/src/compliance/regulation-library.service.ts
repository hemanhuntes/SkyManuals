import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RegulationLibrary,
  RegulationItem,
  LibraryUpdateJob,
  RegulationLibrarySchema,
  RegulationItemSchema,
  LibraryUpdateJobSchema,
} from '@skymanuals/types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RegulationLibraryService {
  constructor(private prisma: PrismaService) {}

  async findAll(): Promise<RegulationLibrary[]> {
    console.log('📚 Retrieving all regulation libraries');

    const libraries = await this.prisma.regulationLibrary.findMany({
      include: {
        regulationItems: {
          select: {
            id: true,
            regulationType: true,
            reference: true,
            title: true,
            category: true,
            priority: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return libraries.map(library => RegulationLibrarySchema.parse({
      ...library,
      createdAt: library.createdAt.toISOString(),
      updatedAt: library.updatedAt.toISOString(),
      effectiveDate: library.effectiveDate.toISOString(),
      expiryDate: library.expiryDate?.toISOString(),
    }));
  }

  async create(libraryData: any): Promise<RegulationLibrary> {
    console.log(`📚 Creating regulation library: ${libraryData.title}`);

    const library = await this.prisma.regulationLibrary.create({
      data: {
        id: uuidv4(),
        source: libraryData.source,
        region: libraryData.region,
        title: libraryData.title,
        description: libraryData.description,
        version: libraryData.version,
        effectiveDate: new Date(libraryData.effectiveDate),
        expiryDate: libraryData.expiryDate ? new Date(libraryData.expiryDate) : null,
        url: libraryData.url,
        metadata: libraryData.metadata,
      },
      include: {
        regulationItems: {
          select: {
            id: true,
            regulationType: true,
            reference: true,
            title: true,
            category: true,
            priority: true,
          },
        },
      },
    });

    console.log(`✅ Created regulation library: ${library.id}`);

    return RegulationLibrarySchema.parse({
      ...library,
      createdAt: library.createdAt.toISOString(),
      updatedAt: library.updatedAt.toISOString(),
      effectiveDate: library.effectiveDate.toISOString(),
      expiryDate: library.expiryDate?.toISOString(),
    });
  }

  async updateVersion(libraryId: string, updateData: any): Promise<LibraryUpdateJob> {
    console.log(`🔄 Creating library update job for ${libraryId}`);

    // Get the current library
    const currentLibrary = await this.prisma.regulationLibrary.findUnique({
      where: { id: libraryId },
      include: {
        regulationItems: true,
      },
    });

    if (!currentLibrary) {
      throw new NotFoundException(`Regulation library ${libraryId} not found`);
    }

    // Create update job
    const updateJob = await this.prisma.libraryUpdateJob.create({
      data: {
        id: uuidv4(),
        organizationId: 'default-org', // Would be passed from context
        regulationLibraryId: libraryId,
        updateType: updateData.updateType || 'MINOR',
        oldVersion: currentLibrary.version,
        newVersion: updateData.newVersion,
        description: updateData.description,
        changes: this.simulateChanges(currentLibrary, updateData),
        effectiveDate: new Date(updateData.effectiveDate),
        implementationDeadline: updateData.implementationDeadline ? 
          new Date(updateData.implementationDeadline) : null,
        notificationDate: new Date(),
        status: 'PENDING',
        metadata: updateData.metadata,
      },
    });

    console.log(`✅ Created library update job: ${updateJob.id}`);

    // Process the update asynchronously
    await this.processUpdateJob(updateJob.id);

    return LibraryUpdateJobSchema.parse({
      ...updateJob,
      createdAt: updateJob.createdAt.toISOString(),
      updatedAt: updateJob.updatedAt.toISOString(),
      effectiveDate: updateJob.effectiveDate.toISOString(),
      implementationDeadline: updateJob.implementationDeadline?.toISOString(),
      notificationDate: updateJob.notificationDate.toISOString(),
      processingStartedAt: updateJob.processingStartedAt?.toISOString(),
      processingCompletedAfter: updateJob.processingCompletedAfter?.toISOString(),
    });
  }

  private async processUpdateJob(updateJobId: string): Promise<void> {
    console.log(`⚙️ Processing library update job: ${updateJobId}`);

    try {
      // Update status to processing
      await this.prisma.libraryUpdateJob.update({
        where: { id: updateJobId },
        data: {
          status: 'PROCESSING',
          processingStartedAt: new Date(),
        },
      });

      const updateJob = await this.prisma.libraryUpdateJob.findUnique({
        where: { id: updateJobId },
        include: {
          regulationLibrary: {
            include: {
              regulationItems: true,
            },
          },
        },
      });

      if (!updateJob) {
        throw new Error('Update job not found');
      }

      // Simulate processing changes
      const { regulationLibraryId, newVersion } = updateJob;

      // Update library version
      await this.prisma.regulationLibrary.update({
        where: { id: regulationLibraryId },
        data: {
          version: newVersion,
          metadata: {
            ...updateJob.regulationLibrary.metadata,
            lastUpdated: new Date().toISOString(),
            previousVersion: updateJob.oldVersion,
          },
        },
      });

      // TODO: Trigger impact analysis
      // TODO: Generate alerts for affected compliance links
      // TODO: Create automated audit checklist

      // Mark job as completed
      await this.prisma.libraryUpdateJob.update({
        where: { id: updateJobId },
        data: {
          status: 'COMPLETED',
          processingCompletedAt: new Date(),
          generatedAlertIds: [], // Would be populated by impact analysis
          generatedChecklistIds: [], // Would be populated by checklist generation
        },
      });

      console.log(`✅ Library update job completed: ${updateJobId}`);

    } catch (error) {
      console.error(`❌ Library update job failed: ${error.message}`);

      await this.prisma.libraryUpdateJob.update({
        where: { id: updateJobId },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          processingCompletedAt: new Date(),
        },
      });

      throw error;
    }
  }

  private simulateChanges(currentLibrary: any, updateData: any): any {
    // Mock change simulation - in production, this would parse actual regulation updates
    return {
      added: [
        `New ${updateData.newVersion} article`,
        `Additional requirements in ${updateData.updateType} update`,
      ],
      modified: [
        `Updated existing regulation`,
        `Clarified ${updateData.title} requirements`,
      ],
      deleted: [],
      renumbered: [
        {
          old: 'OLD-REF-001',
          new: 'NEW-REF-001',
        },
      ],
    };
  }

  async getRegulationItems(libraryId: string, filters?: any): Promise<RegulationItem[]> {
    console.log(`📋 Retrieving regulation items for library ${libraryId}`);

    const where: any = {
      regulationLibraryId: libraryId,
    };

    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.priority) {
      where.priority = filters.priority;
    }

    const items = await this.prisma.regulationItem.findMany({
      where,
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
      orderBy: {
        reference: 'asc',
      },
    });

    return items.map(item => RegulationItemSchema.parse({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));
  }

  async addRegulationItems(libraryId: string, itemsData: any[]): Promise<RegulationItem[]> {
    console.log(`📄 Adding ${itemsData.length} regulation items to library ${libraryId}`);

    const addedItems = [];

    for (const itemData of itemsData) {
      const item = await this.prisma.regulationItem.create({
        data: {
          id: uuidv4(),
          regulationLibraryId: libraryId,
          regulationType: itemData.regulationType,
          reference: itemData.reference,
          title: itemData.title,
          content: itemData.content,
          category: itemData.category,
          priority: itemData.priority,
          applicability: itemData.applicability || {},
          relatedRegulations: itemData.relatedRegulations || [],
          metadata: itemData.metadata,
        },
      });

      addedItems.push(item);
    }

    console.log(`✅ Added ${addedItems.length} regulation items`);

    return addedItems.map(item => RegulationItemSchema.parse({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));
  }

  async getPendingUpdates(organizationId: string = 'default-org'): Promise<LibraryUpdateJob[]> {
    console.log(`⏰ Retrieving pending library updates for organization ${organizationId}`);

    const updates = await this.prisma.libraryUpdateJob.findMany({
      where: {
        organizationId,
        status: {
          in: ['PENDING', 'PROCESSING'],
        },
      },
      include: {
        regulationLibrary: {
          select: {
            title: true,
            source: true,
            region: true,
          },
        },
      },
      orderBy: {
        notificationDate: 'desc',
      },
    });

    return updates.map(update => LibraryUpdateJobSchema.parse({
      ...update,
      createdAt: update.createdAt.toISOString(),
      updatedAt: update.updatedAt.toISOString(),
      effectiveDate: update.effectiveDate.toISOString(),
      implementationDeadline: update.implementationDeadline?.toISOString(),
      notificationDate: update.notificationDate.toISOString(),
      processingStartedAt: update.processingStartedAt?.toISOString(),
      processingCompletedAfter: update.processingCompletedAfter?.toISOString(),
    }));
  }

  async getUpdateHistory(libraryId: string): Promise<LibraryUpdateJob[]> {
    console.log(`📊 Retrieving update history for library ${libraryId}`);

    const history = await this.prisma.libraryUpdateJob.findMany({
      where: {
        regulationLibraryId: libraryId,
      },
      orderBy: {
        notificationDate: 'desc',
      },
    });

    return history.map(update => LibraryUpdateJobSchema.parse({
      ...update,
      createdAt: update.createdAt.toISOString(),
      updatedAt: update.updatedAt.toISOString(),
      effectiveDate: update.effectiveDate.toISOString(),
      implementationDeadline: update.implementationDeadline?.toISOString(),
      notificationDate: update.notificationDate.toISOString(),
      processingStartedAt: update.processingStartedAt?.toISOString(),
      processingCompletedAfter: update.processingCompletedAfter?.toISOString(),
    }));
  }
}
