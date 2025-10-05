import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PublishPipelineService } from '../publish-pipeline/publish-pipeline.service';
import { SearchIndexService } from '../search-engine/search-index.service';
import {
  ManualReaderResponse,
  SearchQuery,
  SearchResult,
  Annotation,
  SuggestEdit,
  ReaderSession,
  BundleMetadata,
  ManualReaderResponseSchema,
  BundleMetadataSchema,
  AnnotationSchema,
  SuggestEditSchema,
  ReaderSessionSchema,
  SearchResultSchema,
} from '@skymanuals/types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ReaderService {
  constructor(
    private prisma: PrismaService,
    private publishPipeline: PublishPipelineService,
    private searchIndex: SearchIndexService,
  ) {}

  async getManualForReading(
    manualId: string,
    userId: string,
    version?: string,
  ): Promise<ManualReaderResponse> {
    console.log(`📖 Loading Manual ${manualId} v${version || 'latest'} for User ${userId}`);

    // Get latest bundle URL for the manual
    const bundleUrl = await this.publishPipeline.getBundleUrl(manualId, version);
    
    // Fetch bundle from CDN (mock implementation)
    const bundle = await this.fetchBundleFromCDN(bundleUrl);
    
    // Check user permissions
    const permissions = await this.getUserPermissions(manualId, userId);
    
    if (!permissions.canRead) {
      throw new ForbiddenException('You do not have permission to read this manual');
    }

    // Build response with manual content and permissions
    const response = {
      bundle: BundleMetadataSchema.parse({
        manualId,
        bundleId: bundle.bundleId,
        version: bundle.version,
        title: bundle.manual.title,
        description: bundle.manual.description,
        createdAt: bundle.publishedAt,
        publishedAt: bundle.publishedAt,
        bundleSize: JSON.stringify(bundle).length,
        bundleUrl,
        requiresAuth: true,
        offlineAvailable: true,
        annotationCount: 0, // Would be fetched from database
        revisionCount: 0, // Would be fetched from revision bars
      }),
      manual: bundle.manual,
      userPermissions: {
        canRead: permissions.canRead,
        canAnnotate: permissions.canAnnotate,
        canSuggestEdit: permissions.canSuggestEdit,
        canDownloadOffline: permissions.canDownloadOffline,
      },
    };

    // Track analytics
    await this.trackAnalytics( manualId, userId, {
      event: 'OPEN',
      metadata: { 
        version: bundle.version,
        bundleId: bundle.bundleId,
        method: 'direct_access',
      },
    });

    return ManualReaderResponseSchema.parse(response);
  }

  async getAvailableBundles(manualId: string): Promise<BundleMetadata[]> {
    console.log(`📦 Getting available bundles for Manual ${manualId}`);

    const bundles = await this.prisma.readerBundle.findMany({
      where: { manualId },
      include: {
        manual: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return bundles.map(bundle => BundleMetadataSchema.parse({
      manualId: bundle.manualId,
      bundleId: bundle.id,
      version: bundle.version,
      title: bundle.manual.title,
      description: bundle.manual.description,
      createdAt: bundle.createdAt.toISOString(),
      publishedAt: bundle.createdAt.toISOString(),
      bundleSize: bundle.bundleSize,
      bundleUrl: bundle.bundleUrl,
      requiresAuth: true,
      offlineAvailable: !bundle.expiresAt || bundle.expiresAt > new Date(),
      annotationCount: 0, // Would be counted from annotations table
      revisionCount: 0, // Would be counted from revision bars
    }));
  }

  async search(searchQuery: SearchQuery): Promise<SearchResult> {
    console.log(`🔍 Performing search: "${searchQuery.query}"`);

    // Validate search query
    const validatedQuery = {
      query: searchQuery.query,
      manualId: searchQuery.manualId,
      bundleId: searchQuery.bundleId,
      filters: searchQuery.filters,
      page: searchQuery.page || 1,
      limit: searchQuery.limit || 10,
    };

    const result = await this.searchIndex.search(validatedQuery);

    console.log(`✅ Search completed: ${result.totalResults} total results`);

    return SearchResultSchema.parse(result);
  }

  async getSearchSuggestions(query: string, manualId?: string): Promise<string[]> {
    return this.searchIndex.getSearchSuggestions(query, manualId);
  }

  async getPopularSearches(manualId?: string): Promise<string[]> {
    return this.searchIndex.getPopularSearches(manualId, 10);
  }

  async createAnnotation(
    manualId: string,
    userId: string,
    annotationData: any,
  ): Promise<Annotation> {
    console.log(`📝 Creating annotation for Manual ${manualId} by User ${userId}`);

    // Validate permissions
    const permissions = await this.getUserPermissions(manualId, userId);
    if (!permissions.canAnnotate) {
      throw new ForbiddenException('You do not have permission to create annotations');
    }

    // Get latest bundle
    const bundle = await this.prisma.readerBundle.findFirst({
      where: { manualId },
      orderBy: { createdAt: 'desc' },
    });

    if (!bundle) {
      throw new NotFoundException(`No bundle found for Manual ${manualId}`);
    }

    const annotation = await this.prisma.annotation.create({
      data: {
        id: uuidv4(),
        userId,
        manualId,
        bundleId: bundle.id,
        chapterId: annotationData.chapterId,
        sectionId: annotationData.sectionId,
        blockId: annotationData.blockId,
        selector: annotationData.selector,
        type: annotationData.type,
        content: annotationData.content,
        color: annotationData.color,
        isPrivate: annotationData.isPrivate !== false, // Default to private
      },
    });

    // Track analytics
    await this.trackAnalytics(manualId, userId, {
      event: 'ANNOTATE',
      metadata: { 
        annotationType: annotationData.type,
        chapterId: annotationData.chapterId,
        sectionId: annotationData.sectionId,
      },
    });

    console.log(`✅ Annotation created: ${annotation.id}`);

    return AnnotationSchema.parse(annotation);
  }

  async getAnnotations(
    manualId: string,
    userId: string,
    chapterId?: string,
  ): Promise<Annotation[]> {
    console.log(`📋 Getting annotations for Manual ${manualId}, Chapter ${chapterId || 'all'}`);

    const where: any = {
      manualId,
      userId, // Only get user's own annotations
    };

    if (chapterId) {
      where.chapterId = chapterId;
    }

    const annotations = await this.prisma.annotation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return annotations.map(annotation => AnnotationSchema.parse(annotation));
  }

  async suggestEdit(
    manualId: string,
    userId: string,
    suggestData: any,
  ): Promise<SuggestEdit> {
    console.log(`💡 Creating edit suggestion for Manual ${manualId} by User ${userId}`);

    // Validate permissions
    const permissions = await this.getUserPermissions(manualId, userId);
    if (!permissions.canSuggestEdit) {
      throw new ForbiddenException('You do not have permission to suggest edits');
    }

    // Get latest bundle
    const bundle = await this.prisma.readerBundle.findFirst({
      where: { manualId },
      orderBy: { createdAt: 'desc' },
    });

    if (!bundle) {
      throw new NotFoundException(`No bundle found for Manual ${manualId}`);
    }

    const suggestEdit = await this.prisma.suggestEdit.create({
      data: {
        id: uuidv4(),
        userId,
        manualId,
        bundleId: bundle.id,
        chapterId: suggestData.chapterId,
        sectionId: suggestData.sectionId,
        blockId: suggestData.blockId,
        selector: suggestData.selector,
        currentText: suggestData.currentText,
        suggestedText: suggestData.suggestedText,
        reason: suggestData.reason,
        priority: suggestData.priority || 'MEDIUM',
      },
    });

    // Create task for editors (link to Epic-02 workflows)
    const taskId = await this.createEditorTask(suggestEdit);

    // Update suggestion with task ID
    const updatedSuggestion = await this.prisma.suggestEdit.update({
      where: { id: suggestEdit.id },
      data: { createdTaskId: taskId },
    });

    // Track analytics
    await this.trackAnalytics(manualId, userId, {
      event: 'SUGGEST_EDIT',
      metadata: { 
        suggestionId: suggestEdit.id,
        taskId,
        priority: suggestData.priority || 'MEDIUM',
        chapterId: suggestData.chapterId,
        sectionId: suggestData.sectionId,
      },
    });

    console.log(`✅ Edit suggestion created: ${suggestEdit.id} -> Task: ${taskId}`);

    return SuggestEditSchema.parse(updatedSuggestion);
  }

  async getRevisionBars(manualId: string): Promise<any[]> {
    console.log(`📊 Getting revision bars for Manual ${manualId}`);

    // Get latest bundle
    const bundle = await this.prisma.readerBundle.findFirst({
      where: { manualId },
      orderBy: { createdAt: 'desc' },
    });

    if (!bundle) {
      throw new NotFoundException(`No bundle found for Manual ${manualId}`);
    }

    const revisionBars = await this.prisma.revisionBar.findMany({
      where: { manualId, bundleId: bundle.id },
      orderBy: { changedAt: 'desc' },
    });

    console.log(`✅ Retrieved ${revisionBars.length} revision bars`);

    return revisionBars.map(bar => ({
      id: bar.id,
      chapterId: bar.chapterId,
      sectionId: bar.sectionId,
      blockId: bar.blockId,
      revisionType: bar.revisionType,
      description: bar.description,
      authorName: bar.authorName,
      changedAt: bar.changedAt.toISOString(),
    }));
  }

  async updateReadingSession(
    manualId: string,
    userId: string,
    sessionData: any,
  ): Promise<ReaderSession> {
    console.log(`📊 Updating reading session for Manual ${manualId}, User ${userId}`);

    // Get latest bundle
    const bundle = await this.prisma.readerBundle.findFirst({
      where: { manualId },
      orderBy: { createdAt: 'desc' },
    });

    if (!bundle) {
      throw new NotFoundException(`No bundle found for Manual ${manualId}`);
    }

    // Upsert reader session
    const session = await this.prisma.readerSession.upsert({
      where: {
        userId_manualId_bundleId: {
          userId,
          manualId,
          bundleId: bundle.id,
        },
      },
      update: {
        currentChapterId: sessionData.currentChapterId,
        currentSectionId: sessionData.currentSectionId,
        readingProgress: sessionData.readingProgress || 0,
        readingTimeSeconds: {
          increment: sessionData.readingTimeSeconds || 0,
        },
        lastAccessedAt: new Date(),
        bookmarks: sessionData.bookmarks || [],
        annotations: sessionData.annotations || [],
        notes: sessionData.notes || [],
      },
      create: {
        id: uuidv4(),
        userId,
        manualId,
        bundleId: bundle.id,
        currentChapterId: sessionData.currentChapterId,
        currentSectionId: sessionData.currentSectionId,
        readingProgress: sessionData.readingProgress || 0,
        readingTimeSeconds: sessionData.readingTimeSeconds || 0,
        lastAccessedAt: new Date(),
        bookmarks: sessionData.bookmarks || [],
        annotations: sessionData.annotations || [],
        notes: sessionData.notes || [],
      },
    });

    console.log(`✅ Reading session updated: ${session.id}`);

    return ReaderSessionSchema.parse(session);
  }

  async getReaderSession(manualId: string, userId: string): Promise<ReaderSession | null> {
    const bundle = await this.prisma.readerBundle.findFirst({
      where: { manualId },
      orderBy: { createdAt: 'desc' },
    });

    if (!bundle) {
      return null;
    }

    const session = await this.prisma.readerSession.findUnique({
      where: {
        userId_manualId_bundleId: {
          userId,
          manualId,
          bundleId: bundle.id,
        },
      },
    });

    return session ? ReaderSessionSchema.parse(session) : null;
  }

  async getOfflineCapabilities(manualId: string, userId: string): Promise<any> {
    console.log(`📱 Getting offline capabilities for Manual ${manualId}, User ${userId}`);

    const bundle = await this.prisma.readerBundle.findFirst({
      where: { manualId },
      orderBy: { createdAt: 'desc' },
    });

    if (!bundle) {
      throw new NotFoundException(`No bundle found for Manual ${manualId}`);
    }

    return this.publishPipeline.getOfflineCapabilities(bundle.id, userId);
  }

  async cacheForOffline(manualId: string, userId: string): Promise<any> {
    console.log(`💾 Caching Manual ${manualId} for offline access by User ${userId}`);

    // Validate permissions
    const permissions = await this.getUserPermissions(manualId, userId);
    if (!permissions.canDownloadOffline) {
      throw new ForbiddenException('You do not have permission to download for offline access');
    }

    const bundle = await this.prisma.readerBundle.findFirst({
      where: { manualId },
      orderBy: { createdAt: 'desc' },
    });

    if (!bundle) {
      throw new NotFoundException(`No bundle found for Manual ${manualId}`);
    }

    // Fetch bundle data
    const bundleData = await this.fetchBundleFromCDN(bundle.bundleUrl);

    // Store in offline cache
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const cacheKey = `manual-${manualId}-${bundle.version}`;

    const offlineCache = await this.prisma.offlineCache.upsert({
      where: {
        userId_bundleId: {
          userId,
          bundleId: bundle.id,
        },
      },
      update: {
        cacheKey,
        data: bundleData,
        cachedAt: new Date(),
        expiresAt,
        version: bundle.version,
        checksum: this.generateContentChecksum(bundleData),
      },
      create: {
        id: uuidv4(),
        userId,
        bundleId: bundle.id,
        cacheKey,
        data: bundleData,
        cachedAt: new Date(),
        expiresAt,
        version: bundle.version,
        checksum: this.generateContentChecksum(bundleData),
      },
    });

    // Track analytics
    await this.trackAnalytics(manualId, userId, {
      event: 'DOWNLOAD',
      metadata: { 
        bundleId: bundle.id,
        version: bundle.version,
        cacheId: offlineCache.id,
      },
    });

    console.log(`✅ Manual cached for offline: ${offlineCache.id}`);

    return {
      cacheId: offlineCache.id,
      cacheKey: offlineCache.cacheKey,
      cachedAt: offlineCache.cachedAt.toISOString(),
      expiresAt: offlineCache.expiresAt.toISOString(),
      size: JSON.stringify(bundleData).length,
    };
  }

  async trackAnalytics(manualId: string, userId: string, analyticsData: any): Promise<void> {
    try {
      const bundle = await this.prisma.readerBundle.findFirst({
        where: { manualId },
        orderBy: { createdAt: 'desc' },
      });

      if (!bundle) return;

      await this.prisma.readerAnalytics.create({
        data: {
          id: uuidv4(),
          userId,
          manualId,
          bundleId: bundle.id,
          event: analyticsData.event,
          metadata: analyticsData.metadata,
          timestamp: new Date(),
          sessionId: analyticsData.sessionId || 'unknown',
        },
      });

      console.log(`📊 Analytics tracked: ${analyticsData.event} for Manual ${manualId}`);
    } catch (error) {
      console.error('Failed to track analytics:', error);
      // Don't throw error as analytics failures shouldn't break user experience
    }
  }

  async getUserPermissions(manualId: string, userId: string): Promise<any> {
    console.log(`🔐 Checking permissions for User ${userId} on Manual ${manualId}`);

    // Check explicit access permissions
    const permission = await this.prisma.accessPermission.findFirst({
      where: {
        userId,
        manualId,
      },
    });

    if (permission) {
      return {
        canRead: ['READ', 'ANNOTATE', 'SUGGEST_EDIT', 'ADMIN'].includes(permission.permission),
        canAnnotate: ['ANNOTATE', 'SUGGEST_EDIT', 'ADMIN'].includes(permission.permission),
        canSuggestEdit: ['SUGGEST_EDIT', 'ADMIN'].includes(permission.permission),
        canDownloadOffline: permission.permission === 'ADMIN',
      };
    }

    // Check organization membership (default READ access)
    const member = await this.prisma.membership.findFirst({
      where: {
        userId,
        organization: {
          manuals: {
            some: { id: manualId },
          },
        },
      },
      include: {
        organization: true,
      },
    });

    if (member) {
      // Default permissions for organization members
      return {
        canRead: true,
        canAnnotate: false, // Default: no annotation rights
        canSuggestEdit: false, // Default: no edit suggestion rights
        canDownloadOffline: member.role === 'ADMIN', // Only admins can download offline
      };
    }

    // No permissions found
    return {
      canRead: false,
      canAnnotate: false,
      canSuggestEdit: false,
      canDownloadOffline: false,
    };
  }

  // Helper methods
  private async createEditorTask(suggestEdit: any): Promise<string> {
    // Mock task creation - in production, this would integrate with Epic-02 workflows
    const taskId = uuidv4();
    
    console.log(`📋 Created editor task ${taskId} for suggestion ${suggestEdit.id}`);
    
    return taskId;
  }

  private async fetchBundleFromCDN(bundleUrl: string): Promise<any> {
    console.log(`📥 Fetching bundle from CDN: ${bundleUrl}`);
    
    try {
      // Use fetch to get bundle from CDN
      const response = await fetch(bundleUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SkyManuals-Reader/1.0'
        },
        // Add timeout
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`CDN fetch failed: ${response.status} ${response.statusText}`);
      }

      const bundleData = await response.json();
      console.log(`✅ Successfully fetched bundle from CDN (${bundleData.bundleSize || 'unknown'} bytes)`);
      
      return bundleData;
    } catch (error) {
      console.error(`❌ Failed to fetch bundle from CDN: ${error.message}`);
      
      // Fallback to cached bundle if available
      try {
        const fallbackBundle = await this.getFallbackBundle(bundleUrl);
        if (fallbackBundle) {
          console.log(`🔄 Using fallback bundle from cache`);
          return fallbackBundle;
        }
      } catch (fallbackError) {
        console.error(`❌ Fallback bundle also failed: ${fallbackError.message}`);
      }
      
      // Last resort: return minimal bundle structure
      console.warn(`⚠️ Using minimal bundle structure as last resort`);
      return {
        bundleId: 'fallback-bundle',
        manualId: 'unknown',
        version: '1.0.0',
        publishedAt: new Date().toISOString(),
        manual: {
          id: 'fallback-manual',
          title: 'Offline Manual (Fallback)',
          organizationId: 'unknown',
          status: 'RELEASED',
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'system',
          updatedBy: 'system'
        },
        chapters: [],
        annotations: [],
        bundleSize: 0
      };
    }
  }

  private async getFallbackBundle(bundleUrl: string): Promise<any | null> {
    try {
      // Try to get bundle from database cache
      const bundleId = this.extractBundleIdFromUrl(bundleUrl);
      
      if (bundleId) {
        const cachedBundle = await this.prisma.readerBundle.findUnique({
          where: { id: bundleId },
          include: {
            manual: {
              include: {
                chapters: {
                  include: {
                    sections: true,
                    blocks: true
                  }
                }
              }
            }
          }
        });

        if (cachedBundle) {
          return {
            bundleId: cachedBundle.id,
            manualId: cachedBundle.manualId,
            version: cachedBundle.version,
            publishedAt: cachedBundle.createdAt,
            manual: cachedBundle.manual,
            chapters: cachedBundle.manual.chapters,
            bundleSize: JSON.stringify(cachedBundle).length
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Error getting fallback bundle: ${error.message}`);
      return null;
    }
  }

  private extractBundleIdFromUrl(bundleUrl: string): string | null {
    try {
      // Extract bundle ID from URL patterns like:
      // https://cdn.skymanuals.com/bundles/{bundleId}/manifest.json
      // or similar patterns
      const url = new URL(bundleUrl);
      const pathParts = url.pathname.split('/');
      const bundleIndex = pathParts.findIndex(part => part === 'bundles');
      
      if (bundleIndex !== -1 && pathParts[bundleIndex + 1]) {
        return pathParts[bundleIndex + 1];
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Error extracting bundle ID from URL: ${error.message}`);
      return null;
    }
  }

  private generateContentChecksum(content: any): string {
    const contentString = JSON.stringify(content);
    return Buffer.from(contentString).toString('base64').slice(0, 16);
  }
}




