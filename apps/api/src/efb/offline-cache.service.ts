import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@skymanuals/prisma';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  SyncCheckRequest,
  SyncResponse,
  HighlightSync,
  NoteSync,
  CacheInvalidationRequest,
} from '@skymanuals/types';

@Injectable()
export class OfflineCacheService {
  private readonly logger = new Logger(OfflineCacheService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check sync status and determine needed updates
   */
  async checkSyncStatus(request: SyncCheckRequest): Promise<SyncResponse> {
    this.logger.log(`Checking sync status for device: ${request.deviceId}`);

    const device = await this.prisma.device.findUnique({
      where: { deviceId: request.deviceId },
      include: {
        organization: {
          include: {
            manuals: {
              where: { status: 'RELEASED' },
              include: {
                readerBundles: {
                  where: { isActive: true },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!device) {
      throw new BadRequestException('Device not found');
    }

    // Get device policies to determine mandatory manuals
    const policies = await this.prisma.devicePolicy.findMany({
      where: {
        organizationId: device.organizationId,
        isActive: true,
        OR: [
          { id: { in: device.installedPolicies } },
          {
            conditions: {
              path: ['deviceModels'],
              array_contains: device.deviceModel,
            },
          },
        ],
      },
    });

    const mandatoryManualIds = this.extractMandatoryManuals(policies);

    const syncJobs = [];
    let totalEstimatedSizeMB = 0;

    // Check each manual for updates
    for (const manual of device.organization.manuals) {
      if (manual.readerBundles.length === 0) continue;

      const latestBundle = manual.readerBundles[0];
      const cachedManifest = request.cachedManifests.find(
        (m) => m.readerBundleId === latestBundle.id,
      );

      if (!cachedManifest) {
        // New bundle needs to be downloaded
        const syncJob = await this.createNewBundleSyncJob(
          device.id,
          latestBundle,
          manual.id,
        );
        syncJobs.push(syncJob);
        totalEstimatedSizeMB += syncJob.estimatedSizeMB;
      } else if (cachedManifest.bundleVersion !== latestBundle.version) {
        // Bundle update needed
        const syncJob = await this.createUpdateBundleSyncJob(
          device.id,
          latestBundle,
          cachedManifest,
          manual.id,
        );
        syncJobs.push(syncJob);
        totalEstimatedSizeMB += syncJob.estimatedSizeMB;
      } else {
        // Check for chunk-level deltas
        const deltaCheck = await this.checkChunkDeltas(
          device.id,
          latestBundle,
          cachedManifest,
        );
        if (deltaCheck.chunksToDownload.length > 0) {
          syncJobs.push(deltaCheck);
          totalEstimatedSizeMB += deltaCheck.estimatedSizeMB;
        }
      }
    }

    const needsSync = syncJobs.length > 0;

    // Get applicable policies for device
    const applicablePolicies = await this.getApplicablePolicies(
      device.organizationId,
      device.deviceModel,
      device.platform,
    );

    // Get feature flags for device
    const featureFlags = await this.getFeatureFlagsForDevice(
      device.id,
      policies,
    );

    return {
      needsSync,
      syncJobs,
      policies: applicablePolicies.map((policy) => ({
        policyId: policy.id,
        policyVersion: policy.updatedAt.toISOString(),
        settings: policy.settings,
        effectiveAt: policy.createdAt.toISOString(),
      })),
      featureFlags,
    };
  }

  /**
   * Create incremental sync job
   */
  async createIncrementalSync(
    deviceId: string,
    readerBundleId: string,
    lastSyncTimestamp?: Date,
  ): Promise<any> {
    this.logger.log(
      `Creating incremental sync for device ${deviceId}, bundle ${readerBundleId}`,
    );

    const bundle = await this.prisma.readerBundle.findUnique({
      where: { id: readerBundleId },
      include: {
        manual: true,
      },
    });

    if (!bundle) {
      throw new BadRequestException('Reader bundle not found');
    }

    // Calculate chunks that have been modified since last sync
    const chunksToSync = await this.getModifiedChunks(
      readerBundleId,
      lastSyncTimestamp,
    );

    const syncJob = await this.prisma.syncJob.create({
      data: {
        deviceId,
        organizationId: bundle.manual.organizationId,
        initiatedBy: 'system',
        type: 'INCREMENTAL_SYNC',
        status: 'PENDING',
        progress: {
          totalItems: chunksToSync.length,
          completedItems: 0,
          failedItems: 0,
          skippedItems: 0,
          percentage: 0,
        },
        settings: {
          readerBundleId,
          chunkIndices: chunksToSync.map((chunk) => chunk.chunkIndex),
          forceFreshFetch: false,
        },
        metadata: {
          syncType: 'INCREMENTAL',
          bundleVersion: bundle.version,
          manualId: bundle.manualId,
        },
      },
    });

    return syncJob;
  }

  /**
   * Download and cache chunk data
   */
  async cacheChunk(
    deviceId: string,
    readerBundleId: string,
    chunkIndex: number,
    chunkData: Buffer,
  ): Promise<any> {
    const chunkId = crypto.randomUUID();
    const checksum = crypto.createHash('sha256').update(chunkData).digest('hex');

    // Store chunk metadata
    const chunk = await this.prisma.cacheChunk.create({
      data: {
        id: chunkId,
        deviceId,
        readerBundleId,
        chunkIndex,
        chunkPath: `chunks/${deviceId}/${readerBundleId}/${chunkIndex}`,
        chunkChecksum: checksum,
        chunkSizeBytes: chunkData.length,
        status: 'COMPLETED',
        downloadedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        metadata: {
          compressed: false,
          encrypted: false,
        },
      },
    });

    // In a real implementation, you would store the actual chunk data to S3/local storage
    await this.storeChunkData(chunkId, chunkData);

    this.logger.debug(
      `Cached chunk ${chunkIndex} for device ${deviceId}, bundle ${readerBundleId}`,
    );

    return chunk;
  }

  /**
   * Create offline cache entry for a manual
   */
  async createOfflineCache(
    deviceId: string,
    readerBundleId: string,
    manualId: string,
    chunks: Array<{ chunkIndex: number; checksum: string; sizeBytes: number }>,
  ): Promise<any> {
    const totalSizeBytes = chunks.reduce((sum, chunk) => sum + chunk.sizeBytes, 0);

    const offlineCache = await this.prisma.offlineCache.create({
      data: {
        deviceId,
        organizationId: (await this.getDeviceOrganizationId(deviceId)),
        manualId,
        readerBundleId,
        storagePath: `cache/${deviceId}/${readerBundleId}`,
        totalSizeBytes,
        cachedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        chunkChecksums: chunks,
        metadata: {
          compressionEnabled: true,
          encryptionEnabled: false,
          manifest: true,
        },
      },
    });

    this.logger.log(
      `Created offline cache for device ${deviceId}, manual ${manualId}`,
    );

    return offlineCache;
  }

  /**
   * Update cache manifest when bundle changes
   */
  async updateCacheManifest(
    deviceId: string,
    readerBundleId: string,
    bundleVersion: string,
    chunks: any[],
  ): Promise<any> {
    const chunkCount = chunks.length;
    const totalSizeBytes = chunks.reduce((sum, chunk) => sum + chunk.sizeBytes, 0);
    const checksum = crypto.createHash('sha256').update(JSON.stringify(chunks)).digest('hex');

    const manifest = await this.prisma.cacheManifest.upsert({
      where: {
        deviceId_readerBundleId: {
          deviceId,
          readerBundleId,
        },
      },
      update: {
        bundleVersion,
        chunkCount,
        totalSizeBytes,
        checksum,
        lastModified: new Date(),
      },
      create: {
        deviceId,
        readerBundleId,
        bundleVersion,
        chunkCount,
        totalSizeBytes,
        checksum,
        createdAt: new Date(),
        lastModified: new Date(),
      },
    });

    return manifest;
  }

  /**
   * Sync highlights from device to server
   */
  async syncHighlights(highlightSync: HighlightSync): Promise<any> {
    this.logger.log(
      `Syncing highlights from device ${highlightSync.deviceId}`,
    );

    for (const highlight of highlightSync.highlights) {
      await this.prisma.annotation.upsert({
        where: {
          blockId_userId: {
            blockId: highlight.blockId,
            userId: (await this.getDeviceUserId(highlightSync.deviceId)),
          },
        },
        update: {
          content: highlight.content,
          metadata: {
            ...highlight.metadata,
            color: highlight.color,
            note: highlight.note,
            position: highlight.position,
            syncedAt: new Date().toISOString(),
            deviceId: highlightSync.deviceId,
          },
          updatedAt: new Date(),
        },
        create: {
          blockId: highlight.blockId,
          userId: (await this.getDeviceUserId(highlightSync.deviceId)),
          organizationId: (await this.getDeviceOrganizationId(highlightSync.deviceId)),
          type: 'HIGHLIGHT',
          content: highlight.content,
          metadata: {
            color: highlight.color,
            note: highlight.note,
            position: highlight.position,
            deviceId: highlightSync.deviceId,
          },
          createdAt: new Date(highlight.createdAt),
          updatedAt: new Date(highlight.updatedAt),
        },
      });
    }

    return {
      syncedHighlights: highlightSync.highlights.length,
      deviceId: highlightSync.deviceId,
    };
  }

  /**
   * Sync notes from device to server
   */
  async syncNotes(noteSync: NoteSync): Promise<any> {
    this.logger.log(`Syncing notes from device ${noteSync.deviceId}`);

    for (const note of noteSync.notes) {
      await this.prisma.readerSession.upsert({
        where: {
          id: crypto.randomUUID(), // This should be calculated from content
        },
        update: {
          metadata: {
            ...note.metadata,
            notes: [
              {
                title: note.title,
                content: note.content,
                isPrivate: note.isPrivate,
                tags: note.tags,
                syncedAt: new Date().toISOString(),
                deviceId: noteSync.deviceId,
              },
            ],
          },
          updatedAt: new Date(),
        },
        create: {
          id: crypto.randomUUID(),
          userId: (await this.getDeviceUserId(noteSync.deviceId)),
          organizationId: (await this.getDeviceOrganizationId(noteSync.deviceId)),
          manualId: note.manualId,
          sectionId: note.sectionId,
          blockId: note.blockId,
          sessionToken: crypto.randomBytes(16).toString('hex'),
          metadata: {
            notes: [
              {
                title: note.title,
                content: note.content,
                isPrivate: note.isPrivate,
                tags: note.tags,
                deviceId: noteSync.deviceId,
              },
            ],
          },
          createdAt: new Date(note.createdAt),
          updatedAt: new Date(note.updatedAt),
        },
      });
    }

    return {
      syncedNotes: noteSync.notes.length,
      deviceId: noteSync.deviceId,
    };
  }

  /**
   * Invalidate cache for specific devices
   */
  async invalidateCache(request: CacheInvalidationRequest): Promise<any> {
    this.logger.log(
      `Invalidating cache for ${request.deviceIds.length} devices`,
    );

    const results = [];

    for (const deviceId of request.deviceIds) {
      const whereCondition: any = {
        deviceId,
      };

      if (request.scope.manualIds && request.scope.manualIds.length > 0) {
        whereCondition.manualId = {
          in: request.scope.manualIds,
        };
      }

      if (request.scope.cacheTypes && request.scope.cacheTypes.length > 0) {
        whereCondition.metadata = {
          contains: JSON.stringify({ cacheType: { in: request.scope.cacheTypes } }),
        };
      }

      const deletedCaches = await this.prisma.offlineCache.deleteMany({
        where: whereCondition,
      });

      const deletedManifests = await this.prisma.cacheManifest.deleteMany({
        where: { deviceId },
      });

      const deletedChunks = await this.prisma.cacheChunk.deleteMany({
        where: { deviceId },
      });

      results.push({
        deviceId,
        deletedCaches: deletedCaches.count,
        deletedManifests: deletedManifests.count,
        deletedChunks: deletedChunks.count,
      });

      // Log analytics
      await this.prisma.deviceAnalytics.create({
        data: {
          deviceId,
          userId: await this.getDeviceUserId(deviceId),
          organizationId: await this.getDeviceOrganizationId(deviceId),
          action: 'CACHE_INVALIDATED',
          targetId: 'BULK_INVALIDATION',
          metadata: {
            scope: request.scope,
            forceImmediate: request.scope.forceImmediate,
          },
          timestamp: new Date(),
        },
      });
    }

    return {
      invalidatedDevices: results.length,
      results,
    };
  }

  /**
   * Private helper methods
   */

  private extractMandatoryManuals(policies: any[]): string[] {
    const mandatoryManualIds = new Set<string>();

    policies.forEach((policy) => {
      if (policy.type === 'MANUAL_PINNING') {
        const settings = policy.settings as any;
        if (settings.manualIds) {
          settings.manualIds.forEach((id: string) => mandatoryManualIds.add(id));
        }
      }
    });

    return Array.from(mandatoryManualIds);
  }

  private async createNewBundleSyncJob(
    deviceId: string,
    bundle: any,
    manualId: string,
  ): Promise<any> {
    // Simulate bundle chunks
    const chunks = Array.from({ length: 10 }, (_, i) => ({
      chunkIndex: i,
      chunkUrl: `https://storage.example.com/chunks/${bundle.id}/${i}`,
      chunkChecksum: crypto.randomBytes(32).toString('hex'),
      chunkSizeBytes: Math.floor(Math.random() * 1024 * 1024) + 1024 * 1024, // 1-2MB
    }));

    const estimatedSizeMB = chunks.reduce(
      (sum, chunk) => sum + chunk.chunkSizeBytes,
      0,
    ) / (1024 * 1024);

    return {
      readerBundleId: bundle.id,
      bundleVersion: bundle.version,
      operation: 'NEW',
      chunksToDownload: chunks,
      chunksToDelete: [],
      priority: 0,
      estimatedSizeMB,
    };
  }

  private async createUpdateBundleSyncJob(
    deviceId: string,
    bundle: any,
    cachedManifest: any,
    manualId: string,
  ): Promise<any> {
    // Simulate updated chunks (only changed ones)
    const chunksToDownload = Array.from({ length: 3 }, (_, i) => ({
      chunkIndex: i + 5, // Start from chunk 5
      chunkUrl: `https://storage.example.com/chunks/${bundle.id}/${i + 5}`,
      chunkChecksum: crypto.randomBytes(32).toString('hex'),
      chunkSizeBytes: Math.floor(Math.random() * 1024 * 1024) + 1024 * 1024,
    }));

    const estimatedSizeMB = chunksToDownload.reduce(
      (sum, chunk) => sum + chunk.chunkSizeBytes,
      0,
    ) / (1024 * 1024);

    return {
      readerBundleId: bundle.id,
      bundleVersion: bundle.version,
      operation: 'UPDATE',
      chunksToDownload,
      chunksToDelete: [2, 7], // Some chunks to delete
      priority: 1,
      estimatedSizeMB,
    };
  }

  private async checkChunkDeltas(
    deviceId: string,
    bundle: any,
    cachedManifest: any,
  ): Promise<any> {
    // Simulate small delta updates
    const chunksToDownload = Array.from({ length: 2 }, (_, i) => ({
      chunkIndex: i,
      chunkUrl: `https://storage.example.com/chunks/${bundle.id}/${i}`,
      chunkChecksum: crypto.randomBytes(32).toString('hex'),
      chunkSizeBytes: Math.floor(Math.random() * 512 * 1024) + 512 * 1024, // 512KB-1MB
    }));

    return {
      readerBundleId: bundle.id,
      bundleVersion: bundle.version,
      operation: 'UPDATE',
      chunksToDownload,
      chunksToDelete: [],
      priority: 2,
      estimatedSizeMB: 1.5,
    };
  }

  private async getApplicablePolicies(
    organizationId: string,
    deviceModel: string,
    platform: string,
  ): Promise<any[]> {
    return this.prisma.devicePolicy.findMany({
      where: {
        organizationId,
        isActive: true,
        conditions: {
          path: ['deviceModels'],
          array_contains: deviceModel,
        },
      },
    });
  }

  private async getFeatureFlagsForDevice(
    deviceId: string,
    policies: any[],
  ): Promise<any[]> {
    const featureFlagsPolicy = policies.find(
      (p) => p.type === 'FEATURE_FLAGS',
    );

    if (!featureFlagsPolicy) {
      return [];
    }

    const settings = featureFlagsPolicy.settings as any;
    return settings.enabledFeatures.map((flagName: string) => ({
      flagName,
      isEnabled: true,
      defaultValue: true,
    }));
  }

  private async getModifiedChunks(
    readerBundleId: string,
    lastSyncTimestamp?: Date,
  ): Promise<any[]> {
    // Simulate getting modified chunks since last sync
    return [
      { chunkIndex: 0, checksum: 'abc123', sizeBytes: 1024 * 1024 },
      { chunkIndex: 3, checksum: 'def456', sizeBytes: 2 * 1024 * 1024 },
      { chunkIndex: 7, checksum: 'ghi789', sizeBytes: 512 * 1024 },
    ];
  }

  private async storeChunkData(chunkId: string, chunkData: Buffer): Promise<void> {
    // In a real implementation, store to S3 or local filesystem
    this.logger.debug(`Stored chunk data for chunk ${chunkId}`);
  }

  private async getDeviceOrganizationId(deviceId: string): Promise<string> {
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
      select: { organizationId: true },
    });
    return device?.organizationId || '';
  }

  private async getDeviceUserId(deviceId: string): Promise<string> {
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
      select: { userId: true },
    });
    return device?.userId || '';
  }
}
