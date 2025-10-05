import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export interface PaginationOptions {
  page: number;
  size: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  key?: string;
  tags?: string[];
}

@Injectable()
export class PerformanceOptimizationService {
  private readonly logger = new Logger(PerformanceOptimizationService.name);
  private redis: Redis;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService
  ) {
    // Initialize Redis connection
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });
  }

  // Manual pagination with caching
  async getManualsPaginated(
    organizationId: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    const { page = 1, size = 20, sortBy = 'updatedAt', sortOrder = 'desc' } = options;
    const skip = (page - 1) * size;
    
    const cacheKey = `manuals:${organizationId}:${page}:${size}:${sortBy}:${sortOrder}`;
    
    // Try cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for manuals pagination: ${cacheKey}`);
      return cached;
    }
    
    // Fetch from database
    const [manuals, total] = await Promise.all([
      this.prisma.manual.findMany({
        where: { organizationId },
        skip,
        take: size,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          title: true,
          status: true,
          version: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { chapters: true } }
        }
      }),
      this.prisma.manual.count({ where: { organizationId } })
    ]);
    
    const result: PaginatedResult<any> = {
      data: manuals,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size),
      hasNext: page < Math.ceil(total / size),
      hasPrevious: page > 1
    };
    
    // Cache result
    await this.setCache(cacheKey, result, { ttl: 300 }); // 5 minutes
    
    this.logger.log(`Fetched ${manuals.length} manuals for organization ${organizationId}`);
    return result;
  }

  // Chapter pagination with caching
  async getChaptersPaginated(
    manualId: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    const { page = 1, size = 20, sortBy = 'number', sortOrder = 'asc' } = options;
    const skip = (page - 1) * size;
    
    const cacheKey = `chapters:${manualId}:${page}:${size}:${sortBy}:${sortOrder}`;
    
    // Try cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for chapters pagination: ${cacheKey}`);
      return cached;
    }
    
    // Fetch from database
    const [chapters, total] = await Promise.all([
      this.prisma.chapter.findMany({
        where: { manualId },
        skip,
        take: size,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { sections: true } }
        }
      }),
      this.prisma.chapter.count({ where: { manualId } })
    ]);
    
    const result: PaginatedResult<any> = {
      data: chapters,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size),
      hasNext: page < Math.ceil(total / size),
      hasPrevious: page > 1
    };
    
    // Cache result
    await this.setCache(cacheKey, result, { ttl: 600 }); // 10 minutes
    
    return result;
  }

  // Section pagination with caching
  async getSectionsPaginated(
    chapterId: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    const { page = 1, size = 20, sortBy = 'number', sortOrder = 'asc' } = options;
    const skip = (page - 1) * size;
    
    const cacheKey = `sections:${chapterId}:${page}:${size}:${sortBy}:${sortOrder}`;
    
    // Try cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for sections pagination: ${cacheKey}`);
      return cached;
    }
    
    // Fetch from database
    const [sections, total] = await Promise.all([
      this.prisma.section.findMany({
        where: { chapterId },
        skip,
        take: size,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { blocks: true } }
        }
      }),
      this.prisma.section.count({ where: { chapterId } })
    ]);
    
    const result: PaginatedResult<any> = {
      data: sections,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size),
      hasNext: page < Math.ceil(total / size),
      hasPrevious: page > 1
    };
    
    // Cache result
    await this.setCache(cacheKey, result, { ttl: 600 }); // 10 minutes
    
    return result;
  }

  // Manual caching with detailed content
  async getCachedManual(manualId: string): Promise<any> {
    const cacheKey = `manual:${manualId}`;
    
    // Try cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for manual: ${manualId}`);
      return cached;
    }
    
    // Fetch from database
    const manual = await this.prisma.manual.findUnique({
      where: { id: manualId },
      include: {
        chapters: {
          include: {
            sections: {
              include: {
                blocks: {
                  select: {
                    id: true,
                    type: true,
                    content: true,
                    status: true
                  }
                }
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
    
    if (!manual) {
      return null;
    }
    
    // Cache for 1 hour
    await this.setCache(cacheKey, manual, { ttl: 3600 });
    
    this.logger.log(`Cached manual: ${manualId}`);
    return manual;
  }

  // Chapter caching with sections
  async getCachedChapter(chapterId: string): Promise<any> {
    const cacheKey = `chapter:${chapterId}`;
    
    // Try cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for chapter: ${chapterId}`);
      return cached;
    }
    
    // Fetch from database
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: {
        sections: {
          include: {
            blocks: {
              select: {
                id: true,
                type: true,
                content: true,
                status: true
              }
            }
          },
          orderBy: { number: 'asc' }
        },
        manual: {
          select: {
            id: true,
            title: true,
            organizationId: true
          }
        }
      }
    });
    
    if (!chapter) {
      return null;
    }
    
    // Cache for 30 minutes
    await this.setCache(cacheKey, chapter, { ttl: 1800 });
    
    this.logger.log(`Cached chapter: ${chapterId}`);
    return chapter;
  }

  // Cache invalidation
  async invalidateManualCache(manualId: string): Promise<void> {
    const patterns = [
      `manual:${manualId}`,
      `chapters:*:${manualId}:*`,
      `sections:*:${manualId}:*`,
      `manuals:*:*`
    ];
    
    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.log(`Invalidated ${keys.length} cache keys for pattern: ${pattern}`);
      }
    }
  }

  async invalidateChapterCache(chapterId: string): Promise<void> {
    const patterns = [
      `chapter:${chapterId}`,
      `sections:${chapterId}:*`
    ];
    
    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.log(`Invalidated ${keys.length} cache keys for pattern: ${pattern}`);
      }
    }
  }

  // Database query optimization
  async getManualStatistics(organizationId: string): Promise<any> {
    const cacheKey = `stats:${organizationId}`;
    
    // Try cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Optimized query with aggregation
    const [totalManuals, totalChapters, totalSections, totalBlocks] = await Promise.all([
      this.prisma.manual.count({ where: { organizationId } }),
      this.prisma.chapter.count({ 
        where: { 
          manual: { organizationId } 
        } 
      }),
      this.prisma.section.count({ 
        where: { 
          chapter: { 
            manual: { organizationId } 
          } 
        } 
      }),
      this.prisma.block.count({ 
        where: { 
          section: { 
            chapter: { 
              manual: { organizationId } 
            } 
          } 
        } 
      })
    ]);
    
    const stats = {
      totalManuals,
      totalChapters,
      totalSections,
      totalBlocks,
      averageChaptersPerManual: totalManuals > 0 ? Math.round(totalChapters / totalManuals) : 0,
      averageSectionsPerChapter: totalChapters > 0 ? Math.round(totalSections / totalChapters) : 0,
      averageBlocksPerSection: totalSections > 0 ? Math.round(totalBlocks / totalSections) : 0
    };
    
    // Cache for 1 hour
    await this.setCache(cacheKey, stats, { ttl: 3600 });
    
    return stats;
  }

  // Search optimization with caching
  async searchManuals(
    organizationId: string,
    query: string,
    options: PaginationOptions = { page: 1, size: 20 }
  ): Promise<PaginatedResult<any>> {
    const { page = 1, size = 20 } = options;
    const skip = (page - 1) * size;
    
    const cacheKey = `search:${organizationId}:${query}:${page}:${size}`;
    
    // Try cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for search: ${query}`);
      return cached;
    }
    
    // Optimized search query
    const [manuals, total] = await Promise.all([
      this.prisma.manual.findMany({
        where: {
          organizationId,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { 
              chapters: {
                some: {
                  OR: [
                    { title: { contains: query, mode: 'insensitive' } },
                    { content: { contains: query, mode: 'insensitive' } }
                  ]
                }
              }
            }
          ]
        },
        skip,
        take: size,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          version: true,
          updatedAt: true,
          _count: { select: { chapters: true } }
        }
      }),
      this.prisma.manual.count({
        where: {
          organizationId,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { 
              chapters: {
                some: {
                  OR: [
                    { title: { contains: query, mode: 'insensitive' } },
                    { content: { contains: query, mode: 'insensitive' } }
                  ]
                }
              }
            }
          ]
        }
      })
    ]);
    
    const result: PaginatedResult<any> = {
      data: manuals,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size),
      hasNext: page < Math.ceil(total / size),
      hasPrevious: page > 1
    };
    
    // Cache for 5 minutes
    await this.setCache(cacheKey, result, { ttl: 300 });
    
    return result;
  }

  // Cache management
  private async getFromCache(key: string): Promise<any> {
    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      this.logger.warn(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  private async setCache(key: string, data: any, options: CacheOptions = {}): Promise<void> {
    try {
      const ttl = options.ttl || 300; // Default 5 minutes
      await this.redis.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      this.logger.warn(`Cache set error for key ${key}:`, error);
    }
  }

  // Health check
  async getCacheHealth(): Promise<any> {
    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      
      return {
        status: 'healthy',
        memory: info,
        keyspace: keyspace,
        connected: this.redis.status === 'ready'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Clear all cache
  async clearAllCache(): Promise<void> {
    try {
      await this.redis.flushall();
      this.logger.log('Cleared all cache');
    } catch (error) {
      this.logger.error('Failed to clear cache:', error);
    }
  }
}
