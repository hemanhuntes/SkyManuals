import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface BundleManifest {
  id: string;
  version: string;
  manualId: string;
  title: string;
  chunks: ChunkInfo[];
  metadata: BundleMetadata;
  createdAt: string;
  checksum: string;
}

export interface ChunkInfo {
  index: number;
  key: string;
  checksum: string;
  size: number;
  compressedSize: number;
}

export interface BundleMetadata {
  totalSize: number;
  compressedSize: number;
  compressionRatio: number;
  chunkCount: number;
  manualVersion: string;
  organizationId: string;
}

export interface ReaderBundle {
  id: string;
  manualId: string;
  version: string;
  manifestUrl: string;
  status: 'GENERATING' | 'READY' | 'ERROR';
  createdAt: Date;
  expiresAt: Date;
}

export interface ChunkData {
  index: number;
  content: any;
  metadata: {
    chapterId?: string;
    sectionId?: string;
    blockId?: string;
    type: string;
  };
}

@Injectable()
export class BundleGenerationService {
  private readonly logger = new Logger(BundleGenerationService.name);
  private s3Client: S3Client;
  private readonly bucketName: string;
  private readonly chunkSize: number = 1024 * 1024; // 1MB chunks

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService
  ) {
    // Initialize S3 client
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    this.bucketName = this.configService.get('AWS_S3_BUCKET_NAME', 'skymanuals-bundles');
  }

  async generateBundle(manualId: string, options: {
    includeAnnotations?: boolean;
    includeMetadata?: boolean;
    chunkSize?: number;
  } = {}): Promise<ReaderBundle> {
    this.logger.log(`Generating bundle for manual ${manualId}`);

    try {
      // 1. Create bundle record
      const bundle = await this.createBundleRecord(manualId);
      
      // 2. Get manual data
      const manual = await this.getManualWithContent(manualId);
      if (!manual) {
        throw new Error(`Manual ${manualId} not found`);
      }

      // 3. Create snapshot
      const snapshot = await this.createSnapshot(manual, options);

      // 4. Generate chunks
      const chunks = await this.generateChunks(snapshot, options.chunkSize || this.chunkSize);

      // 5. Upload chunks to S3
      const chunkInfos = await this.uploadChunksToS3(bundle.id, chunks);

      // 6. Create manifest
      const manifest = await this.createManifest(bundle.id, manual, chunkInfos, options);

      // 7. Upload manifest to S3
      await this.uploadManifestToS3(bundle.id, manifest);

      // 8. Update bundle status
      await this.updateBundleStatus(bundle.id, 'READY');

      this.logger.log(`Bundle ${bundle.id} generated successfully with ${chunks.length} chunks`);

      return {
        id: bundle.id,
        manualId,
        version: manifest.version,
        manifestUrl: this.getManifestUrl(bundle.id),
        status: 'READY',
        createdAt: bundle.createdAt,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      };
    } catch (error) {
      this.logger.error(`Failed to generate bundle for manual ${manualId}:`, error);
      throw new Error(`Bundle generation failed: ${error.message}`);
    }
  }

  async getBundle(bundleId: string): Promise<{
    bundle: ReaderBundle;
    manifest: BundleManifest;
    signedUrls: { [key: string]: string };
  }> {
    this.logger.log(`Retrieving bundle ${bundleId}`);

    try {
      // Get bundle record
      const bundle = await this.prisma.readerBundle.findUnique({
        where: { id: bundleId }
      });

      if (!bundle) {
        throw new Error(`Bundle ${bundleId} not found`);
      }

      // Get manifest from S3
      const manifest = await this.getManifestFromS3(bundleId);

      // Generate signed URLs for chunks
      const signedUrls: { [key: string]: string } = {};
      for (const chunk of manifest.chunks) {
        signedUrls[chunk.key] = await this.generateSignedUrl(chunk.key);
      }

      return {
        bundle: {
          id: bundle.id,
          manualId: bundle.manualId,
          version: bundle.version,
          manifestUrl: this.getManifestUrl(bundleId),
          status: bundle.status as any,
          createdAt: bundle.createdAt,
          expiresAt: bundle.expiresAt
        },
        manifest,
        signedUrls
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve bundle ${bundleId}:`, error);
      throw new Error(`Bundle retrieval failed: ${error.message}`);
    }
  }

  async deleteBundle(bundleId: string): Promise<{ success: boolean; error?: string }> {
    this.logger.log(`Deleting bundle ${bundleId}`);

    try {
      // Get manifest to find all chunks
      const manifest = await this.getManifestFromS3(bundleId);

      // Delete all chunks from S3
      for (const chunk of manifest.chunks) {
        await this.deleteChunkFromS3(chunk.key);
      }

      // Delete manifest
      await this.deleteManifestFromS3(bundleId);

      // Delete bundle record
      await this.prisma.readerBundle.delete({
        where: { id: bundleId }
      });

      this.logger.log(`Bundle ${bundleId} deleted successfully`);

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to delete bundle ${bundleId}:`, error);
      return { success: false, error: error.message };
    }
  }

  private async createBundleRecord(manualId: string): Promise<any> {
    const bundle = await this.prisma.readerBundle.create({
      data: {
        id: uuidv4(),
        manualId,
        version: '1.0.0', // Will be updated with actual version
        status: 'GENERATING',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    });

    return bundle;
  }

  private async getManualWithContent(manualId: string): Promise<any> {
    return await this.prisma.manual.findUnique({
      where: { id: manualId },
      include: {
        chapters: {
          include: {
            sections: {
              include: {
                blocks: true
              }
            }
          },
          orderBy: { number: 'asc' }
        },
        organization: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
  }

  private async createSnapshot(manual: any, options: any): Promise<any> {
    const snapshot = {
      id: uuidv4(),
      manualId: manual.id,
      title: manual.title,
      version: manual.version,
      organizationId: manual.organizationId,
      createdAt: new Date(),
      chapters: manual.chapters.map(chapter => ({
        id: chapter.id,
        number: chapter.number,
        title: chapter.title,
        content: chapter.content,
        sections: chapter.sections.map(section => ({
          id: section.id,
          number: section.number,
          title: section.title,
          content: section.content,
          blocks: section.blocks.map(block => ({
            id: block.id,
            type: block.type,
            content: block.content,
            metadata: block.metadata
          }))
        }))
      })),
      metadata: {
        totalChapters: manual.chapters.length,
        totalSections: manual.chapters.reduce((sum, ch) => sum + ch.sections.length, 0),
        totalBlocks: manual.chapters.reduce((sum, ch) => 
          sum + ch.sections.reduce((secSum, sec) => secSum + sec.blocks.length, 0), 0),
        includeAnnotations: options.includeAnnotations || false,
        includeMetadata: options.includeMetadata || true
      }
    };

    return snapshot;
  }

  private async generateChunks(snapshot: any, chunkSize: number): Promise<ChunkData[]> {
    const chunks: ChunkData[] = [];
    let currentChunk: any = {
      chapters: [],
      metadata: snapshot.metadata
    };
    let currentSize = 0;
    let chunkIndex = 0;

    for (const chapter of snapshot.chapters) {
      const chapterSize = JSON.stringify(chapter).length;
      
      if (currentSize + chapterSize > chunkSize && currentChunk.chapters.length > 0) {
        // Save current chunk
        chunks.push({
          index: chunkIndex++,
          content: currentChunk,
          metadata: {
            type: 'chapter_group',
            chapterId: currentChunk.chapters[0]?.id
          }
        });

        // Start new chunk
        currentChunk = {
          chapters: [],
          metadata: snapshot.metadata
        };
        currentSize = 0;
      }

      currentChunk.chapters.push(chapter);
      currentSize += chapterSize;
    }

    // Add final chunk if it has content
    if (currentChunk.chapters.length > 0) {
      chunks.push({
        index: chunkIndex,
        content: currentChunk,
        metadata: {
          type: 'chapter_group',
          chapterId: currentChunk.chapters[0]?.id
        }
      });
    }

    this.logger.log(`Generated ${chunks.length} chunks for manual ${snapshot.manualId}`);

    return chunks;
  }

  private async uploadChunksToS3(bundleId: string, chunks: ChunkData[]): Promise<ChunkInfo[]> {
    const chunkInfos: ChunkInfo[] = [];

    for (const chunk of chunks) {
      try {
        const key = `bundles/${bundleId}/chunk-${chunk.index}.json.gz`;
        
        // Compress chunk data
        const jsonData = JSON.stringify(chunk.content);
        const compressed = zlib.gzipSync(jsonData);
        
        // Calculate checksum
        const checksum = crypto.createHash('sha256').update(compressed).digest('hex');

        // Upload to S3
        await this.s3Client.send(new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: compressed,
          ContentType: 'application/gzip',
          ContentEncoding: 'gzip',
          Metadata: {
            'chunk-index': chunk.index.toString(),
            'chunk-type': chunk.metadata.type,
            'checksum': checksum,
            'original-size': jsonData.length.toString(),
            'compressed-size': compressed.length.toString()
          },
          StorageClass: 'STANDARD_IA' // Cost optimization for infrequent access
        }));

        chunkInfos.push({
          index: chunk.index,
          key,
          checksum,
          size: jsonData.length,
          compressedSize: compressed.length
        });

        this.logger.log(`Uploaded chunk ${chunk.index} to S3: ${key}`);
      } catch (error) {
        this.logger.error(`Failed to upload chunk ${chunk.index}:`, error);
        throw error;
      }
    }

    return chunkInfos;
  }

  private async createManifest(
    bundleId: string,
    manual: any,
    chunkInfos: ChunkInfo[],
    options: any
  ): Promise<BundleManifest> {
    const totalSize = chunkInfos.reduce((sum, chunk) => sum + chunk.size, 0);
    const compressedSize = chunkInfos.reduce((sum, chunk) => sum + chunk.compressedSize, 0);

    const manifest: BundleManifest = {
      id: bundleId,
      version: manual.version,
      manualId: manual.id,
      title: manual.title,
      chunks: chunkInfos,
      metadata: {
        totalSize,
        compressedSize,
        compressionRatio: totalSize > 0 ? compressedSize / totalSize : 0,
        chunkCount: chunkInfos.length,
        manualVersion: manual.version,
        organizationId: manual.organizationId
      },
      createdAt: new Date().toISOString(),
      checksum: crypto.createHash('sha256').update(JSON.stringify(chunkInfos)).digest('hex')
    };

    return manifest;
  }

  private async uploadManifestToS3(bundleId: string, manifest: BundleManifest): Promise<void> {
    const key = `bundles/${bundleId}/manifest.json`;
    const manifestJson = JSON.stringify(manifest, null, 2);

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: manifestJson,
      ContentType: 'application/json',
      Metadata: {
        'bundle-id': bundleId,
        'version': manifest.version,
        'chunk-count': manifest.chunks.length.toString(),
        'checksum': manifest.checksum
      },
      StorageClass: 'STANDARD'
    }));

    this.logger.log(`Uploaded manifest for bundle ${bundleId}`);
  }

  private async getManifestFromS3(bundleId: string): Promise<BundleManifest> {
    const key = `bundles/${bundleId}/manifest.json`;

    const response = await this.s3Client.send(new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    }));

    const manifestJson = await response.Body.transformToString();
    return JSON.parse(manifestJson);
  }

  private async deleteChunkFromS3(key: string): Promise<void> {
    await this.s3Client.send(new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key
    }));
  }

  private async deleteManifestFromS3(bundleId: string): Promise<void> {
    const key = `bundles/${bundleId}/manifest.json`;
    await this.deleteChunkFromS3(key);
  }

  private async updateBundleStatus(bundleId: string, status: string): Promise<void> {
    await this.prisma.readerBundle.update({
      where: { id: bundleId },
      data: { status }
    });
  }

  private getManifestUrl(bundleId: string): string {
    return `https://${this.bucketName}.s3.amazonaws.com/bundles/${bundleId}/manifest.json`;
  }

  private async generateSignedUrl(key: string, expiresIn: number = 24 * 60 * 60): Promise<string> {
    // In production, use CloudFront signed URLs
    // For now, return S3 presigned URL
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details?: any }> {
    try {
      // Test S3 connectivity
      await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: 'health-check'
      }));

      return {
        status: 'healthy',
        details: {
          bucket: this.bucketName,
          region: this.configService.get('AWS_REGION'),
          chunkSize: this.chunkSize
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }

  // Get bundle statistics
  async getBundleStatistics(organizationId: string): Promise<any> {
    const stats = await this.prisma.readerBundle.groupBy({
      by: ['status'],
      where: {
        manual: {
          organizationId
        }
      },
      _count: {
        id: true
      }
    });

    return stats.reduce((acc, stat) => {
      acc[stat.status] = stat._count.id;
      return acc;
    }, {});
  }
}
