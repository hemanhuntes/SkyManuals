import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@skymanuals/prisma';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import {
  SyncCheckRequest,
  SyncResponse,
  HighlightSync,
  NoteSync,
  CacheInvalidationRequest,
  RequestContext,
  AuditEventType,
  AuditSeverity,
  ResourceType,
} from '@skymanuals/types';

// S3 Storage interfaces
export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // For local development or custom S3-compatible storage
  forcePathStyle?: boolean;
}

export interface ChunkStorageResult {
  success: boolean;
  s3Key: string;
  checksum: string;
  size: number;
  compressedSize?: number;
  url?: string;
  error?: string;
}

export interface ChunkRetrievalResult {
  success: boolean;
  data: Buffer;
  checksum: string;
  size: number;
  metadata: any;
  error?: string;
}

// Priority-based sync enums
export enum SyncPriority {
  CRITICAL_SAFETY = 1,    // AFM, MMEL, Emergency procedures
  HIGH_SAFETY = 2,        // SOPs, Checklists, Safety procedures
  OPERATIONAL = 3,        // Charts, Navigation data
  ROUTINE = 4,           // General content, Updates
  BACKGROUND = 5,        // Non-critical content
  HISTORICAL = 6,        // Archive content, Old versions
}

export enum SyncUrgency {
  EMERGENCY = 1,         // Immediate sync required
  PRE_FLIGHT = 2,        // Must be synced before flight
  MID_FLIGHT = 3,        // Can be synced during flight
  POST_FLIGHT = 4,       // Can be synced after flight
  SCHEDULED = 5,         // Scheduled sync
}

export enum SyncScenario {
  PRE_FLIGHT = 'PRE_FLIGHT',
  MID_FLIGHT = 'MID_FLIGHT',
  EXTENDED_OFFLINE = 'EXTENDED_OFFLINE',
  EMERGENCY = 'EMERGENCY',
  ROUTINE = 'ROUTINE',
}

// Conflict resolution enums
export enum ConflictStrategy {
  SERVER_WINS = 'SERVER_WINS',
  CLIENT_WINS = 'CLIENT_WINS',
  MANUAL_MERGE = 'MANUAL_MERGE',
  TIMESTAMP_WINS = 'TIMESTAMP_WINS',
}

export enum ConflictType {
  SEMANTIC = 'SEMANTIC',
  TEMPORAL = 'TEMPORAL',
  CONTENT = 'CONTENT',
}

export interface ConflictResolution {
  strategy: ConflictStrategy;
  conflictType: ConflictType;
  serverData: any;
  clientData: any;
  mergedData?: any;
  requiresManualReview: boolean;
  reason: string;
}

export interface SyncConflict {
  entityType: 'HIGHLIGHT' | 'NOTE' | 'ANNOTATION';
  entityId: string;
  conflictType: ConflictType;
  serverTimestamp: Date;
  clientTimestamp: Date;
  serverData: any;
  clientData: any;
  resolution: ConflictResolution;
}

// Priority-based sync queue interfaces
export interface SyncItem {
  id: string;
  deviceId: string;
  manualId: string;
  chapterId?: string;
  sectionId?: string;
  blockId?: string;
  priority: SyncPriority;
  urgency: SyncUrgency;
  scenario: SyncScenario;
  contentType: 'MANUAL' | 'CHAPTER' | 'SECTION' | 'BLOCK' | 'ANNOTATION' | 'HIGHLIGHT' | 'NOTE';
  sizeBytes: number;
  checksum: string;
  version: string;
  lastModified: Date;
  timeoutSeconds: number;
  retryCount: number;
  maxRetries: number;
  metadata: any;
  createdAt: Date;
  scheduledFor?: Date;
}

export interface SyncQueue {
  items: SyncItem[];
  totalSize: number;
  estimatedTimeMinutes: number;
  aviationCompliant: boolean;
  emergencyProtocols: boolean;
}

export interface SyncPlan {
  queue: SyncQueue;
  scenario: SyncScenario;
  totalItems: number;
  criticalItems: number;
  highPriorityItems: number;
  estimatedBandwidthMB: number;
  estimatedTimeMinutes: number;
  complianceStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'REQUIRES_REVIEW';
  warnings: string[];
  recommendations: string[];
}

@Injectable()
export class OfflineCacheService {
  private readonly logger = new Logger(OfflineCacheService.name);
  private readonly s3Client: S3Client;
  private readonly s3Config: S3StorageConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    // Initialize S3 client with configuration
    this.s3Config = {
      bucket: this.configService.get<string>('AWS_S3_BUCKET') || 'skymanuals-chunks',
      region: this.configService.get<string>('AWS_REGION') || 'us-east-1',
      accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
      secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      endpoint: this.configService.get<string>('AWS_S3_ENDPOINT'),
      forcePathStyle: this.configService.get<boolean>('AWS_S3_FORCE_PATH_STYLE') || false,
    };

    this.s3Client = new S3Client({
      region: this.s3Config.region,
      credentials: {
        accessKeyId: this.s3Config.accessKeyId,
        secretAccessKey: this.s3Config.secretAccessKey,
      },
      endpoint: this.s3Config.endpoint,
      forcePathStyle: this.s3Config.forcePathStyle,
    });

    this.logger.log(`S3 client initialized for bucket: ${this.s3Config.bucket}`);
  }

  /**
   * Detect conflicts between server and client data
   */
  private async detectConflict(
    entityType: 'HIGHLIGHT' | 'NOTE' | 'ANNOTATION',
    entityId: string,
    serverData: any,
    clientData: any,
  ): Promise<SyncConflict | null> {
    const serverTimestamp = new Date(serverData.updatedAt || serverData.createdAt);
    const clientTimestamp = new Date(clientData.updatedAt || clientData.createdAt);
    
    // Check for temporal conflicts (different timestamps)
    const timeDiff = Math.abs(serverTimestamp.getTime() - clientTimestamp.getTime());
    const hasTemporalConflict = timeDiff > 1000; // More than 1 second difference
    
    // Check for content conflicts (different content)
    const hasContentConflict = serverData.content !== clientData.content ||
                              JSON.stringify(serverData.metadata) !== JSON.stringify(clientData.metadata);
    
    // Check for semantic conflicts (different meaning/context)
    const hasSemanticConflict = serverData.type !== clientData.type ||
                               serverData.isPrivate !== clientData.isPrivate;
    
    if (!hasTemporalConflict && !hasContentConflict && !hasSemanticConflict) {
      return null; // No conflict
    }
    
    // Determine conflict type and resolution strategy
    let conflictType: ConflictType;
    let strategy: ConflictStrategy;
    
    if (hasSemanticConflict) {
      conflictType = ConflictType.SEMANTIC;
      strategy = ConflictStrategy.MANUAL_MERGE; // Semantic conflicts require manual review
    } else if (hasContentConflict) {
      conflictType = ConflictType.CONTENT;
      strategy = this.getContentConflictStrategy(entityType, serverTimestamp, clientTimestamp);
    } else {
      conflictType = ConflictType.TEMPORAL;
      strategy = ConflictStrategy.TIMESTAMP_WINS;
    }
    
    const resolution: ConflictResolution = {
      strategy,
      conflictType,
      serverData,
      clientData,
      requiresManualReview: strategy === ConflictStrategy.MANUAL_MERGE,
      reason: this.getConflictReason(conflictType, entityType),
    };
    
    return {
      entityType,
      entityId,
      conflictType,
      serverTimestamp,
      clientTimestamp,
      serverData,
      clientData,
      resolution,
    };
  }
  
  /**
   * Determine content conflict resolution strategy based on aviation compliance rules
   */
  private getContentConflictStrategy(
    entityType: 'HIGHLIGHT' | 'NOTE' | 'ANNOTATION',
    serverTimestamp: Date,
    clientTimestamp: Date,
  ): ConflictStrategy {
    // For aviation compliance, certain entities should always use SERVER_WINS
    if (entityType === 'ANNOTATION') {
      // Regulatory annotations should always use server version
      return ConflictStrategy.SERVER_WINS;
    }
    
    // For user-generated content (highlights, notes), use timestamp-based resolution
    // But with aviation-specific logic
    const timeDiff = Math.abs(serverTimestamp.getTime() - clientTimestamp.getTime());
    
    if (timeDiff > 24 * 60 * 60 * 1000) { // More than 24 hours
      // Large time gaps suggest offline usage - prefer server version for consistency
      return ConflictStrategy.SERVER_WINS;
    }
    
    // Small time gaps - use most recent
    return serverTimestamp > clientTimestamp ? ConflictStrategy.SERVER_WINS : ConflictStrategy.CLIENT_WINS;
  }
  
  /**
   * Get human-readable conflict reason
   */
  private getConflictReason(conflictType: ConflictType, entityType: string): string {
    switch (conflictType) {
      case ConflictType.SEMANTIC:
        return `Semantic conflict detected in ${entityType.toLowerCase()}. Different meaning or context detected.`;
      case ConflictType.CONTENT:
        return `Content conflict detected in ${entityType.toLowerCase()}. Different content or metadata.`;
      case ConflictType.TEMPORAL:
        return `Temporal conflict detected in ${entityType.toLowerCase()}. Different timestamps suggest concurrent modifications.`;
      default:
        return `Unknown conflict type in ${entityType.toLowerCase()}.`;
    }
  }
  
  /**
   * Resolve conflict based on strategy
   */
  private async resolveConflict(
    conflict: SyncConflict,
    context: RequestContext,
  ): Promise<any> {
    const { resolution } = conflict;
    
    // Log the conflict for audit trail
    await this.auditService.logAviationComplianceEvent(context, {
      type: AuditEventType.SYSTEM_EVENT,
      severity: AuditSeverity.MEDIUM,
      action: 'SYNC_CONFLICT_DETECTED',
      resource: conflict.entityType,
      resourceId: conflict.entityId,
      resourceType: ResourceType.Manual,
      beforeData: conflict.serverData,
      afterData: conflict.clientData,
      metadata: {
        conflictType: conflict.conflictType,
        resolutionStrategy: resolution.strategy,
        requiresManualReview: resolution.requiresManualReview,
        reason: resolution.reason,
      },
      complianceMetadata: {
        regulatoryFrameworks: ['EASA', 'FAA'],
        certificationLevel: 'OPERATIONAL',
        documentSource: 'AUTHORED',
        requiresReporting: resolution.requiresManualReview,
        complianceNotes: `Sync conflict in ${conflict.entityType.toLowerCase()} resolved using ${resolution.strategy} strategy`,
      },
      tags: ['sync', 'conflict-resolution', 'efb'],
    });
    
    switch (resolution.strategy) {
      case ConflictStrategy.SERVER_WINS:
        this.logger.warn(`Conflict resolved: SERVER_WINS for ${conflict.entityId}`);
        return conflict.serverData;
        
      case ConflictStrategy.CLIENT_WINS:
        this.logger.warn(`Conflict resolved: CLIENT_WINS for ${conflict.entityId}`);
        return conflict.clientData;
        
      case ConflictStrategy.TIMESTAMP_WINS:
        const winner = conflict.serverTimestamp > conflict.clientTimestamp 
          ? conflict.serverData 
          : conflict.clientData;
        this.logger.warn(`Conflict resolved: TIMESTAMP_WINS for ${conflict.entityId}`);
        return winner;
        
      case ConflictStrategy.MANUAL_MERGE:
        // For manual merge, we store both versions and flag for review
        this.logger.error(`Manual merge required for ${conflict.entityId} - flagging for review`);
        
        // Store conflict for manual review
        await this.prisma.syncConflict.create({
          data: {
            entityType: conflict.entityType,
            entityId: conflict.entityId,
            conflictType: conflict.conflictType,
            serverData: JSON.stringify(conflict.serverData),
            clientData: JSON.stringify(conflict.clientData),
            resolutionStrategy: resolution.strategy,
            status: 'PENDING_REVIEW',
            detectedAt: new Date(),
            detectedBy: context.userId,
          },
        });
        
        // For now, return server data as fallback
        return conflict.serverData;
        
      default:
        this.logger.error(`Unknown conflict resolution strategy: ${resolution.strategy}`);
        return conflict.serverData;
    }
  }

  /**
   * Store chunk data to S3 with compression and encryption
   */
  private async storeChunkToS3(
    s3Key: string,
    chunkData: Buffer,
    metadata: any = {},
  ): Promise<ChunkStorageResult> {
    try {
      // Compress data for storage efficiency
      const compressedData = zlib.gzipSync(chunkData);
      
      // Calculate checksum of original data
      const checksum = crypto.createHash('sha256').update(chunkData).digest('hex');
      
      // Add compression metadata
      const storageMetadata = {
        ...metadata,
        originalSize: chunkData.length,
        compressedSize: compressedData.length,
        compressionRatio: (compressedData.length / chunkData.length).toFixed(2),
        checksum,
        storedAt: new Date().toISOString(),
        version: '1.0',
      };

      // Upload to S3
      const putCommand = new PutObjectCommand({
        Bucket: this.s3Config.bucket,
        Key: s3Key,
        Body: compressedData,
        Metadata: storageMetadata,
        ContentType: 'application/gzip',
        ContentEncoding: 'gzip',
        ServerSideEncryption: 'AES256', // Enable S3 server-side encryption
        StorageClass: 'STANDARD_IA', // Use Infrequent Access for cost optimization
      });

      const result = await this.s3Client.send(putCommand);
      
      this.logger.debug(`Chunk stored to S3: ${s3Key}, size: ${chunkData.length} -> ${compressedData.length} bytes`);

      return {
        success: true,
        s3Key,
        checksum,
        size: chunkData.length,
        compressedSize: compressedData.length,
        url: `s3://${this.s3Config.bucket}/${s3Key}`,
      };

    } catch (error) {
      this.logger.error(`Failed to store chunk to S3: ${s3Key}`, error);
      return {
        success: false,
        s3Key,
        checksum: '',
        size: 0,
        error: error.message,
      };
    }
  }

  /**
   * Retrieve chunk data from S3 with decompression and verification
   */
  private async retrieveChunkFromS3(s3Key: string): Promise<ChunkRetrievalResult> {
    try {
      const getCommand = new GetObjectCommand({
        Bucket: this.s3Config.bucket,
        Key: s3Key,
      });

      const result = await this.s3Client.send(getCommand);
      
      if (!result.Body) {
        throw new Error('No data returned from S3');
      }

      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of result.Body as any) {
        chunks.push(chunk);
      }
      const compressedData = Buffer.concat(chunks);

      // Decompress data
      const decompressedData = zlib.gunzipSync(compressedData);
      
      // Verify checksum
      const calculatedChecksum = crypto.createHash('sha256').update(decompressedData).digest('hex');
      const storedChecksum = result.Metadata?.checksum;

      if (storedChecksum && calculatedChecksum !== storedChecksum) {
        throw new Error(`Checksum mismatch: expected ${storedChecksum}, got ${calculatedChecksum}`);
      }

      this.logger.debug(`Chunk retrieved from S3: ${s3Key}, size: ${decompressedData.length} bytes`);

      return {
        success: true,
        data: decompressedData,
        checksum: calculatedChecksum,
        size: decompressedData.length,
        metadata: result.Metadata,
      };

    } catch (error) {
      this.logger.error(`Failed to retrieve chunk from S3: ${s3Key}`, error);
      return {
        success: false,
        data: Buffer.alloc(0),
        checksum: '',
        size: 0,
        metadata: {},
        error: error.message,
      };
    }
  }

  /**
   * Delete chunk from S3
   */
  private async deleteChunkFromS3(s3Key: string): Promise<boolean> {
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.s3Config.bucket,
        Key: s3Key,
      });

      await this.s3Client.send(deleteCommand);
      this.logger.debug(`Chunk deleted from S3: ${s3Key}`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to delete chunk from S3: ${s3Key}`, error);
      return false;
    }
  }

  /**
   * Check if chunk exists in S3
   */
  private async chunkExistsInS3(s3Key: string): Promise<boolean> {
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.s3Config.bucket,
        Key: s3Key,
      });

      await this.s3Client.send(headCommand);
      return true;

    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      this.logger.error(`Error checking chunk existence in S3: ${s3Key}`, error);
      return false;
    }
  }

  /**
   * Generate S3 key for chunk storage
   */
  private generateS3Key(deviceId: string, readerBundleId: string, chunkIndex: number): string {
    // Use hierarchical structure for better organization
    return `chunks/${deviceId}/${readerBundleId}/${chunkIndex.toString().padStart(6, '0')}.gz`;
  }

  /**
   * Create priority-based sync queue for aviation compliance
   */
  async createPrioritySyncQueue(
    deviceId: string,
    scenario: SyncScenario,
    context: RequestContext,
  ): Promise<SyncPlan> {
    this.logger.log(`Creating priority sync queue for device ${deviceId}, scenario: ${scenario}`);

    // Get device and organization info
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
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
        },
      },
    });

    if (!device) {
      throw new BadRequestException('Device not found');
    }

    // Generate sync items based on scenario and priority
    const syncItems = await this.generateSyncItems(device, scenario);
    
    // Sort by priority and urgency
    const sortedItems = this.sortSyncItemsByPriority(syncItems, scenario);
    
    // Create sync queue
    const queue: SyncQueue = {
      items: sortedItems,
      totalSize: sortedItems.reduce((sum, item) => sum + item.sizeBytes, 0),
      estimatedTimeMinutes: this.calculateEstimatedTime(sortedItems, scenario),
      aviationCompliant: this.validateAviationCompliance(sortedItems, scenario),
      emergencyProtocols: scenario === SyncScenario.EMERGENCY,
    };

    // Generate sync plan
    const plan: SyncPlan = {
      queue,
      scenario,
      totalItems: sortedItems.length,
      criticalItems: sortedItems.filter(item => item.priority === SyncPriority.CRITICAL_SAFETY).length,
      highPriorityItems: sortedItems.filter(item => 
        item.priority === SyncPriority.CRITICAL_SAFETY || item.priority === SyncPriority.HIGH_SAFETY
      ).length,
      estimatedBandwidthMB: Math.round(queue.totalSize / (1024 * 1024)),
      estimatedTimeMinutes: queue.estimatedTimeMinutes,
      complianceStatus: this.assessComplianceStatus(sortedItems, scenario),
      warnings: this.generateWarnings(sortedItems, scenario),
      recommendations: this.generateRecommendations(sortedItems, scenario),
    };

    // Log sync plan creation for audit
    await this.auditService.logAviationComplianceEvent(context, {
      type: AuditEventType.SYSTEM_EVENT,
      severity: AuditSeverity.MEDIUM,
      action: 'SYNC_PLAN_CREATED',
      resource: 'Sync Plan',
      resourceId: deviceId,
      resourceType: ResourceType.Device,
      afterData: {
        scenario,
        totalItems: plan.totalItems,
        criticalItems: plan.criticalItems,
        estimatedTimeMinutes: plan.estimatedTimeMinutes,
        complianceStatus: plan.complianceStatus,
      },
      complianceMetadata: {
        regulatoryFrameworks: ['EASA', 'FAA'],
        certificationLevel: scenario === SyncScenario.EMERGENCY ? 'EMERGENCY' : 'OPERATIONAL',
        documentSource: 'AUTHORED',
        requiresReporting: plan.complianceStatus === 'NON_COMPLIANT',
        complianceNotes: `Sync plan created for ${scenario} scenario with ${plan.totalItems} items`,
      },
      tags: ['sync', 'priority-queue', 'aviation-compliance'],
    });

    this.logger.log(
      `Sync plan created: ${plan.totalItems} items, ${plan.criticalItems} critical, ${plan.estimatedTimeMinutes}min estimated`,
    );

    return plan;
  }

  /**
   * Generate sync items based on device and scenario
   */
  private async generateSyncItems(device: any, scenario: SyncScenario): Promise<SyncItem[]> {
    const items: SyncItem[] = [];

    for (const manual of device.organization.manuals) {
      // Determine manual priority based on content type
      const manualPriority = this.getManualPriority(manual, scenario);
      
      // Manual-level sync item
      items.push({
        id: crypto.randomUUID(),
        deviceId: device.deviceId,
        manualId: manual.id,
        priority: manualPriority,
        urgency: this.getUrgencyForScenario(scenario, manualPriority),
        scenario,
        contentType: 'MANUAL',
        sizeBytes: this.estimateManualSize(manual),
        checksum: manual.readerBundles[0]?.bundleUrl || '',
        version: manual.readerBundles[0]?.version || '1.0',
        lastModified: manual.updatedAt,
        timeoutSeconds: this.getTimeoutForPriority(manualPriority),
        retryCount: 0,
        maxRetries: this.getMaxRetriesForPriority(manualPriority),
        metadata: {
          title: manual.title,
          manualType: this.getManualType(manual),
          regulatoryFramework: this.getRegulatoryFramework(manual),
        },
        createdAt: new Date(),
      });

      // Chapter-level sync items for high priority manuals
      if (manualPriority <= SyncPriority.HIGH_SAFETY) {
        for (const chapter of manual.chapters) {
          const chapterPriority = this.getChapterPriority(chapter, manualPriority);
          
          items.push({
            id: crypto.randomUUID(),
            deviceId: device.deviceId,
            manualId: manual.id,
            chapterId: chapter.id,
            priority: chapterPriority,
            urgency: this.getUrgencyForScenario(scenario, chapterPriority),
            scenario,
            contentType: 'CHAPTER',
            sizeBytes: this.estimateChapterSize(chapter),
            checksum: `chapter_${chapter.id}_${chapter.updatedAt.getTime()}`,
            version: manual.readerBundles[0]?.version || '1.0',
            lastModified: chapter.updatedAt,
            timeoutSeconds: this.getTimeoutForPriority(chapterPriority),
            retryCount: 0,
            maxRetries: this.getMaxRetriesForPriority(chapterPriority),
            metadata: {
              title: chapter.title,
              number: chapter.number,
              manualTitle: manual.title,
            },
            createdAt: new Date(),
          });
        }
      }

      // Section-level sync items for critical safety content
      if (manualPriority === SyncPriority.CRITICAL_SAFETY) {
        for (const chapter of manual.chapters) {
          const chapterPriority = this.getChapterPriority(chapter, manualPriority);
          for (const section of chapter.sections) {
            const sectionPriority = this.getSectionPriority(section, chapterPriority);
            
            items.push({
              id: crypto.randomUUID(),
              deviceId: device.deviceId,
              manualId: manual.id,
              chapterId: chapter.id,
              sectionId: section.id,
              priority: sectionPriority,
              urgency: this.getUrgencyForScenario(scenario, sectionPriority),
              scenario,
              contentType: 'SECTION',
              sizeBytes: this.estimateSectionSize(section),
              checksum: `section_${section.id}_${section.updatedAt.getTime()}`,
              version: manual.readerBundles[0]?.version || '1.0',
              lastModified: section.updatedAt,
              timeoutSeconds: this.getTimeoutForPriority(sectionPriority),
              retryCount: 0,
              maxRetries: this.getMaxRetriesForPriority(sectionPriority),
              metadata: {
                title: section.title,
                number: section.number,
                chapterTitle: chapter.title,
                manualTitle: manual.title,
              },
              createdAt: new Date(),
            });
          }
        }
      }
    }

    return items;
  }

  /**
   * Get manual priority based on content type and scenario
   */
  private getManualPriority(manual: any, scenario: SyncScenario): SyncPriority {
    const title = manual.title.toLowerCase();
    
    // Critical safety content
    if (title.includes('afm') || title.includes('aircraft flight manual')) {
      return SyncPriority.CRITICAL_SAFETY;
    }
    if (title.includes('mmel') || title.includes('master minimum equipment list')) {
      return SyncPriority.CRITICAL_SAFETY;
    }
    if (title.includes('emergency') || title.includes('evacuation')) {
      return SyncPriority.CRITICAL_SAFETY;
    }
    
    // High safety content
    if (title.includes('sop') || title.includes('standard operating procedure')) {
      return SyncPriority.HIGH_SAFETY;
    }
    if (title.includes('checklist') || title.includes('procedure')) {
      return SyncPriority.HIGH_SAFETY;
    }
    if (title.includes('safety') || title.includes('security')) {
      return SyncPriority.HIGH_SAFETY;
    }
    
    // Operational content
    if (title.includes('chart') || title.includes('navigation')) {
      return SyncPriority.OPERATIONAL;
    }
    if (title.includes('flight') || title.includes('operational')) {
      return SyncPriority.OPERATIONAL;
    }
    
    // Emergency scenario adjustments
    if (scenario === SyncScenario.EMERGENCY) {
      // Prioritize all safety content in emergency
      if (title.includes('safety') || title.includes('emergency') || title.includes('checklist')) {
        return SyncPriority.CRITICAL_SAFETY;
      }
    }
    
    return SyncPriority.ROUTINE;
  }

  /**
   * Get chapter priority based on content
   */
  private getChapterPriority(chapter: any, manualPriority: SyncPriority): SyncPriority {
    const title = chapter.title.toLowerCase();
    
    // Emergency procedures
    if (title.includes('emergency') || title.includes('evacuation') || title.includes('fire')) {
      return SyncPriority.CRITICAL_SAFETY;
    }
    
    // Normal procedures
    if (title.includes('normal') || title.includes('procedure') || title.includes('checklist')) {
      return SyncPriority.HIGH_SAFETY;
    }
    
    // Abnormal procedures
    if (title.includes('abnormal') || title.includes('malfunction') || title.includes('failure')) {
      return SyncPriority.HIGH_SAFETY;
    }
    
    return Math.min(manualPriority + 1, SyncPriority.HISTORICAL) as SyncPriority;
  }

  /**
   * Get section priority based on content
   */
  private getSectionPriority(section: any, chapterPriority: SyncPriority): SyncPriority {
    const title = section.title.toLowerCase();
    
    // Critical emergency procedures
    if (title.includes('immediate action') || title.includes('memory items')) {
      return SyncPriority.CRITICAL_SAFETY;
    }
    
    // Emergency procedures
    if (title.includes('emergency') || title.includes('evacuation')) {
      return SyncPriority.CRITICAL_SAFETY;
    }
    
    return chapterPriority;
  }

  /**
   * Get urgency based on scenario and priority
   */
  private getUrgencyForScenario(scenario: SyncScenario, priority: SyncPriority): SyncUrgency {
    if (scenario === SyncScenario.EMERGENCY) {
      return priority <= SyncPriority.HIGH_SAFETY ? SyncUrgency.EMERGENCY : SyncUrgency.PRE_FLIGHT;
    }
    
    if (scenario === SyncScenario.PRE_FLIGHT) {
      return priority <= SyncPriority.CRITICAL_SAFETY ? SyncUrgency.PRE_FLIGHT : SyncUrgency.MID_FLIGHT;
    }
    
    if (scenario === SyncScenario.MID_FLIGHT) {
      return priority <= SyncPriority.HIGH_SAFETY ? SyncUrgency.MID_FLIGHT : SyncUrgency.POST_FLIGHT;
    }
    
    return SyncUrgency.SCHEDULED;
  }

  /**
   * Sort sync items by priority and urgency
   */
  private sortSyncItemsByPriority(items: SyncItem[], scenario: SyncScenario): SyncItem[] {
    return items.sort((a, b) => {
      // First sort by priority (lower number = higher priority)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      
      // Then by urgency (lower number = higher urgency)
      if (a.urgency !== b.urgency) {
        return a.urgency - b.urgency;
      }
      
      // Then by size (smaller items first for faster completion)
      return a.sizeBytes - b.sizeBytes;
    });
  }

  /**
   * Calculate estimated sync time based on items and scenario
   */
  private calculateEstimatedTime(items: SyncItem[], scenario: SyncScenario): number {
    const totalSizeMB = items.reduce((sum, item) => sum + item.sizeBytes, 0) / (1024 * 1024);
    
    // Different bandwidth assumptions based on scenario
    const bandwidthMBps = {
      [SyncScenario.EMERGENCY]: 10,      // High priority bandwidth
      [SyncScenario.PRE_FLIGHT]: 5,      // Standard bandwidth
      [SyncScenario.MID_FLIGHT]: 2,      // Limited bandwidth
      [SyncScenario.EXTENDED_OFFLINE]: 1, // Very limited bandwidth
      [SyncScenario.ROUTINE]: 3,         // Background bandwidth
    };
    
    const estimatedSeconds = totalSizeMB / bandwidthMBps[scenario];
    return Math.ceil(estimatedSeconds / 60); // Convert to minutes
  }

  /**
   * Validate aviation compliance
   */
  private validateAviationCompliance(items: SyncItem[], scenario: SyncScenario): boolean {
    // In emergency scenario, all critical safety items must be present
    if (scenario === SyncScenario.EMERGENCY) {
      const hasCriticalSafety = items.some(item => item.priority === SyncPriority.CRITICAL_SAFETY);
      return hasCriticalSafety;
    }
    
    // In pre-flight scenario, critical safety items must be prioritized
    if (scenario === SyncScenario.PRE_FLIGHT) {
      const criticalItems = items.filter(item => item.priority === SyncPriority.CRITICAL_SAFETY);
      return criticalItems.length > 0;
    }
    
    return true;
  }

  /**
   * Assess compliance status
   */
  private assessComplianceStatus(items: SyncItem[], scenario: SyncScenario): 'COMPLIANT' | 'NON_COMPLIANT' | 'REQUIRES_REVIEW' {
    const criticalItems = items.filter(item => item.priority === SyncPriority.CRITICAL_SAFETY);
    const highSafetyItems = items.filter(item => item.priority === SyncPriority.HIGH_SAFETY);
    
    if (scenario === SyncScenario.EMERGENCY) {
      return criticalItems.length > 0 ? 'COMPLIANT' : 'NON_COMPLIANT';
    }
    
    if (scenario === SyncScenario.PRE_FLIGHT) {
      if (criticalItems.length > 0 && highSafetyItems.length > 0) {
        return 'COMPLIANT';
      }
      if (criticalItems.length > 0 || highSafetyItems.length > 0) {
        return 'REQUIRES_REVIEW';
      }
      return 'NON_COMPLIANT';
    }
    
    return 'COMPLIANT';
  }

  /**
   * Generate warnings based on sync plan
   */
  private generateWarnings(items: SyncItem[], scenario: SyncScenario): string[] {
    const warnings: string[] = [];
    
    const criticalItems = items.filter(item => item.priority === SyncPriority.CRITICAL_SAFETY);
    const highSafetyItems = items.filter(item => item.priority === SyncPriority.HIGH_SAFETY);
    
    if (scenario === SyncScenario.EMERGENCY && criticalItems.length === 0) {
      warnings.push('No critical safety content found for emergency scenario');
    }
    
    if (scenario === SyncScenario.PRE_FLIGHT && criticalItems.length === 0) {
      warnings.push('No critical safety content available for pre-flight sync');
    }
    
    const totalSizeMB = items.reduce((sum, item) => sum + item.sizeBytes, 0) / (1024 * 1024);
    if (totalSizeMB > 1000) { // More than 1GB
      warnings.push(`Large sync size (${Math.round(totalSizeMB)}MB) may impact performance`);
    }
    
    return warnings;
  }

  /**
   * Generate recommendations based on sync plan
   */
  private generateRecommendations(items: SyncItem[], scenario: SyncScenario): string[] {
    const recommendations: string[] = [];
    
    if (scenario === SyncScenario.PRE_FLIGHT) {
      recommendations.push('Complete sync before flight departure');
      recommendations.push('Verify all critical safety content is available offline');
    }
    
    if (scenario === SyncScenario.MID_FLIGHT) {
      recommendations.push('Prioritize critical safety content during flight');
      recommendations.push('Complete remaining sync after landing');
    }
    
    if (scenario === SyncScenario.EMERGENCY) {
      recommendations.push('Immediate sync of emergency procedures required');
      recommendations.push('Verify emergency content availability');
    }
    
    return recommendations;
  }

  /**
   * Helper methods for priority and timeout calculations
   */
  private getTimeoutForPriority(priority: SyncPriority): number {
    const timeouts = {
      [SyncPriority.CRITICAL_SAFETY]: 300,    // 5 minutes
      [SyncPriority.HIGH_SAFETY]: 600,        // 10 minutes
      [SyncPriority.OPERATIONAL]: 1800,       // 30 minutes
      [SyncPriority.ROUTINE]: 3600,           // 1 hour
      [SyncPriority.BACKGROUND]: 7200,        // 2 hours
      [SyncPriority.HISTORICAL]: 14400,       // 4 hours
    };
    return timeouts[priority];
  }

  private getMaxRetriesForPriority(priority: SyncPriority): number {
    const retries = {
      [SyncPriority.CRITICAL_SAFETY]: 5,
      [SyncPriority.HIGH_SAFETY]: 3,
      [SyncPriority.OPERATIONAL]: 2,
      [SyncPriority.ROUTINE]: 1,
      [SyncPriority.BACKGROUND]: 1,
      [SyncPriority.HISTORICAL]: 1,
    };
    return retries[priority];
  }

  private getManualType(manual: any): string {
    const title = manual.title.toLowerCase();
    if (title.includes('afm')) return 'Aircraft Flight Manual';
    if (title.includes('mmel')) return 'Master Minimum Equipment List';
    if (title.includes('sop')) return 'Standard Operating Procedures';
    if (title.includes('checklist')) return 'Checklist';
    return 'General Manual';
  }

  private getRegulatoryFramework(manual: any): string {
    // This would be determined based on manual metadata
    return 'EASA/FAA';
  }

  private estimateManualSize(manual: any): number {
    // Estimate based on number of chapters and sections
    const chapterCount = manual.chapters?.length || 0;
    const sectionCount = manual.chapters?.reduce((sum: number, ch: any) => sum + (ch.sections?.length || 0), 0) || 0;
    
    // Rough estimate: 100KB per section
    return sectionCount * 100 * 1024;
  }

  private estimateChapterSize(chapter: any): number {
    const sectionCount = chapter.sections?.length || 0;
    return sectionCount * 50 * 1024; // 50KB per section
  }

  private estimateSectionSize(section: any): number {
    const blockCount = section.blocks?.length || 0;
    return blockCount * 10 * 1024; // 10KB per block
  }

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
    const s3Key = this.generateS3Key(deviceId, readerBundleId, chunkIndex);
    
    this.logger.log(`Caching chunk ${chunkIndex} for device ${deviceId} to S3`);

    try {
      // Store chunk data to S3
      const storageResult = await this.storeChunkToS3(s3Key, chunkData, {
        deviceId,
        readerBundleId,
        chunkIndex,
        chunkId,
      });

      if (!storageResult.success) {
        throw new Error(`S3 storage failed: ${storageResult.error}`);
      }

      // Store chunk metadata in database
      const chunk = await this.prisma.cacheChunk.create({
        data: {
          id: chunkId,
          deviceId,
          readerBundleId,
          chunkIndex,
          chunkPath: s3Key,
          chunkChecksum: storageResult.checksum,
          chunkSizeBytes: storageResult.size,
          status: 'COMPLETED',
          downloadedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          metadata: {
            s3Key,
            originalSize: storageResult.size,
            compressedSize: storageResult.compressedSize,
            compressionRatio: storageResult.compressedSize 
              ? (storageResult.compressedSize / storageResult.size).toFixed(2)
              : '1.0',
            storageClass: 'STANDARD_IA',
            encryption: 'AES256',
            url: storageResult.url,
          },
        },
      });

      this.logger.log(
        `Chunk cached successfully: ${chunkId}, size: ${storageResult.size} bytes, compressed: ${storageResult.compressedSize} bytes`,
      );

      return chunk;

    } catch (error) {
      this.logger.error(`Failed to cache chunk ${chunkIndex} for device ${deviceId}:`, error);
      
      // Store failed chunk record for debugging
      await this.prisma.cacheChunk.create({
        data: {
          id: chunkId,
          deviceId,
          readerBundleId,
          chunkIndex,
          chunkPath: s3Key,
          chunkChecksum: '',
          chunkSizeBytes: 0,
          status: 'ERROR',
          error: error.message,
          metadata: {
            error: error.message,
            stack: error.stack,
          },
        },
      });

      throw new BadRequestException(`Failed to cache chunk: ${error.message}`);
    }
  }

  /**
   * Retrieve cached chunk data from S3
   */
  async retrieveChunk(
    deviceId: string,
    readerBundleId: string,
    chunkIndex: number,
  ): Promise<any> {
    try {
      // Find chunk in database
      const chunk = await this.prisma.cacheChunk.findFirst({
        where: {
          deviceId,
          readerBundleId,
          chunkIndex,
          status: 'COMPLETED',
        },
      });

      if (!chunk) {
        throw new BadRequestException(`Chunk not found: device ${deviceId}, bundle ${readerBundleId}, index ${chunkIndex}`);
      }

      // Check if chunk exists in S3
      const existsInS3 = await this.chunkExistsInS3(chunk.chunkPath);
      if (!existsInS3) {
        throw new BadRequestException(`Chunk data not found in S3: ${chunk.chunkPath}`);
      }

      // Retrieve chunk data from S3
      const retrievalResult = await this.retrieveChunkFromS3(chunk.chunkPath);
      if (!retrievalResult.success) {
        throw new BadRequestException(`Failed to retrieve chunk from S3: ${retrievalResult.error}`);
      }

      // Verify checksum
      if (retrievalResult.checksum !== chunk.chunkChecksum) {
        this.logger.error(
          `Checksum mismatch for chunk ${chunk.id}: expected ${chunk.chunkChecksum}, got ${retrievalResult.checksum}`,
        );
        throw new BadRequestException('Chunk integrity check failed');
      }

      this.logger.debug(
        `Retrieved chunk ${chunkIndex} for device ${deviceId}: ${retrievalResult.size} bytes`,
      );

      return {
        chunkId: chunk.id,
        deviceId,
        readerBundleId,
        chunkIndex,
        data: retrievalResult.data,
        size: retrievalResult.size,
        checksum: retrievalResult.checksum,
        metadata: retrievalResult.metadata,
      };

    } catch (error) {
      this.logger.error(`Failed to retrieve chunk ${chunkIndex} for device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Delete cached chunk from both database and S3
   */
  async deleteChunk(
    deviceId: string,
    readerBundleId: string,
    chunkIndex: number,
  ): Promise<boolean> {
    try {
      // Find chunk in database
      const chunk = await this.prisma.cacheChunk.findFirst({
        where: {
          deviceId,
          readerBundleId,
          chunkIndex,
        },
      });

      if (!chunk) {
        this.logger.warn(`Chunk not found for deletion: device ${deviceId}, bundle ${readerBundleId}, index ${chunkIndex}`);
        return false;
      }

      // Delete from S3
      const deletedFromS3 = await this.deleteChunkFromS3(chunk.chunkPath);
      
      // Delete from database
      await this.prisma.cacheChunk.delete({
        where: { id: chunk.id },
      });

      this.logger.log(
        `Deleted chunk ${chunkIndex} for device ${deviceId}: database=${true}, s3=${deletedFromS3}`,
      );

      return true;

    } catch (error) {
      this.logger.error(`Failed to delete chunk ${chunkIndex} for device ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * Verify chunk integrity in S3
   */
  async verifyChunkIntegrity(
    deviceId: string,
    readerBundleId: string,
    chunkIndex: number,
  ): Promise<{
    isValid: boolean;
    expectedChecksum: string;
    actualChecksum: string;
    size: number;
    error?: string;
  }> {
    try {
      // Find chunk in database
      const chunk = await this.prisma.cacheChunk.findFirst({
        where: {
          deviceId,
          readerBundleId,
          chunkIndex,
          status: 'COMPLETED',
        },
      });

      if (!chunk) {
        return {
          isValid: false,
          expectedChecksum: '',
          actualChecksum: '',
          size: 0,
          error: 'Chunk not found in database',
        };
      }

      // Retrieve and verify from S3
      const retrievalResult = await this.retrieveChunkFromS3(chunk.chunkPath);
      if (!retrievalResult.success) {
        return {
          isValid: false,
          expectedChecksum: chunk.chunkChecksum,
          actualChecksum: '',
          size: 0,
          error: retrievalResult.error,
        };
      }

      const isValid = retrievalResult.checksum === chunk.chunkChecksum;
      
      return {
        isValid,
        expectedChecksum: chunk.chunkChecksum,
        actualChecksum: retrievalResult.checksum,
        size: retrievalResult.size,
        error: isValid ? undefined : 'Checksum mismatch',
      };

    } catch (error) {
      return {
        isValid: false,
        expectedChecksum: '',
        actualChecksum: '',
        size: 0,
        error: error.message,
      };
    }
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
  async syncHighlights(
    highlightSync: HighlightSync,
    context: RequestContext,
  ): Promise<any> {
    this.logger.log(
      `Syncing highlights from device ${highlightSync.deviceId}`,
    );

    const conflicts: SyncConflict[] = [];
    const syncedHighlights: any[] = [];

    for (const highlight of highlightSync.highlights) {
      // Get existing server data
      const existingHighlight = await this.prisma.annotation.findFirst({
        where: {
          blockId: highlight.blockId,
          userId: (await this.getDeviceUserId(highlightSync.deviceId)),
          type: 'HIGHLIGHT',
        },
      });

      const clientData = {
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
      };

      if (existingHighlight) {
        // Check for conflicts
        const conflict = await this.detectConflict(
          'HIGHLIGHT',
          existingHighlight.id,
          existingHighlight,
          clientData,
        );

        if (conflict) {
          conflicts.push(conflict);
          
          // Resolve conflict
          const resolvedData = await this.resolveConflict(conflict, context);
          
          // Update with resolved data
          const updatedHighlight = await this.prisma.annotation.update({
            where: { id: existingHighlight.id },
            data: {
              content: resolvedData.content,
              metadata: resolvedData.metadata,
              updatedAt: new Date(),
            },
          });
          
          syncedHighlights.push(updatedHighlight);
        } else {
          // No conflict - update normally
          const updatedHighlight = await this.prisma.annotation.update({
            where: { id: existingHighlight.id },
            data: {
              content: clientData.content,
              metadata: clientData.metadata,
              updatedAt: new Date(),
            },
          });
          
          syncedHighlights.push(updatedHighlight);
        }
      } else {
        // Create new highlight
        const newHighlight = await this.prisma.annotation.create({
          data: {
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
        
        syncedHighlights.push(newHighlight);
      }
    }

    // Log audit event for highlight sync
    await this.auditService.logAviationComplianceEvent(context, {
      type: AuditEventType.DATA_MODIFICATION,
      severity: AuditSeverity.LOW,
      action: 'HIGHLIGHTS_SYNCED',
      resource: 'Highlights',
      resourceId: `device_${highlightSync.deviceId}`,
      resourceType: ResourceType.Manual,
      afterData: {
        syncedCount: syncedHighlights.length,
        conflictsDetected: conflicts.length,
        deviceId: highlightSync.deviceId,
      },
      complianceMetadata: {
        regulatoryFrameworks: ['EASA', 'FAA'],
        certificationLevel: 'OPERATIONAL',
        documentSource: 'AUTHORED',
        requiresReporting: conflicts.length > 0,
        complianceNotes: `Synced ${syncedHighlights.length} highlights with ${conflicts.length} conflicts resolved`,
      },
      tags: ['sync', 'highlights', 'efb'],
    });

    return {
      syncedHighlights: syncedHighlights.length,
      conflictsDetected: conflicts.length,
      deviceId: highlightSync.deviceId,
      conflicts: conflicts.map(c => ({
        entityId: c.entityId,
        conflictType: c.conflictType,
        resolutionStrategy: c.resolution.strategy,
        requiresManualReview: c.resolution.requiresManualReview,
      })),
    };
  }

  /**
   * Sync notes from device to server
   */
  async syncNotes(
    noteSync: NoteSync,
    context: RequestContext,
  ): Promise<any> {
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
