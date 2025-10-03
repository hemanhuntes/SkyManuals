import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { 
  SearchQuery,
  SearchResult,
  SearchQuerySchema,
  SearchResultSchema,
} from '@skymanuals/types';
import { z } from 'zod';

@Injectable()
export class SearchIndexService {
  constructor(private prisma: PrismaService) {}

  async search(query: z.infer<typeof SearchQuerySchema>): Promise<SearchResult> {
    console.log(`🔍 Searching: "${query.query}" in Manual ${query.manualId || 'all'}`);

    const startTime = Date.now();

    // Build search conditions
    const where: any = {};

    // Basic text search in searchableText
    if (query.query) {
      where.searchableText = {
        contains: query.query,
        mode: 'insensitive',
      };
    }

    if (query.manualId) {
      where.manualId = query.manualId;
    }

    if (query.bundleId) {
      where.bundleId = query.bundleId;
    }

    // Get search indexes matching conditions
    const searchIndexes = await this.prisma.searchIndex.findMany({
      where,
      include: {
        manual: {
          include: {
            organization: true,
          },
        },
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    // Create detailed search results from indexes
    const results = await Promise.all(
      searchIndexes.map(async (index) => {
        return this.buildDetailedSearchResult(index, query.query);
      })
    );

    const processingTimeMs = Date.now() - startTime;

    const searchResult: SearchResult = {
      results: results.flat(),
      totalResults: searchIndexes.length,
      page: query.page,
      limit: query.limit,
      query: query.query,
      processingTimeMs,
    };

    console.log(`✅ Search completed in ${processingTimeMs}ms: ${results.length} results`);

    return SearchResultSchema.parse(searchResult);
  }

  private async buildDetailedSearchResult(index: any, queryTerm: string): Promise<any[]> {
    const sections = index.indexes.sections || [];
    
    return sections
      .filter((section: any) => 
        section.blockText.toLowerCase().includes(queryTerm.toLowerCase())
      )
      .map((section: any, index: number) => ({
        manualId: index.manualId,
        chapterId: section.chapterId,
        sectionId: section.sectionId,
        blockId: section.blockId,
        title: `Section ${section.sectionId}`, // Would be fetched from actual section
        excerpt: this.extractExcerpt(section.blockText, queryTerm),
        highlight: this.createHighlight(section.blockText, queryTerm),
        relevanceScore: this.calculateRelevanceScore(section.blockText, queryTerm),
        position: section.position,
      }));
  }

  private extractExcerpt(text: string, queryTerm: string, maxLength: number = 200): string {
    const index = text.toLowerCase().indexOf(queryTerm.toLowerCase());
    
    if (index === -1) {
      return text.slice(0, maxLength) + (text.length > maxLength ? '...' : '');
    }

    const start = Math.max(0, index - Math.floor(maxLength / 2));
    const end = Math.min(text.length, start + maxLength);
    
    let excerpt = text.slice(start, end);
    if (start > 0) excerpt = '...' + excerpt;
    if (end < text.length) excerpt = excerpt + '...';
    
    return excerpt;
  }

  private createHighlight(text: string, queryTerm: string): string {
    const regex = new RegExp(`(${queryTerm})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  private calculateRelevanceScore(text: string, queryTerm: string): number {
    const textLower = text.toLowerCase();
    const queryLower = queryTerm.toLowerCase();
    
    // Basic scoring based on:
    // 1. Exact matches
    // 2. Partial matches
    // 3. Term frequency
    
    let score = 0;
    
    // Exact match bonus
    if (textLower.includes(queryLower)) {
      score += 100;
    }
    
    // Term frequency
    const matches = (textLower.match(new RegExp(queryLower, 'g')) || []).length;
    score += matches * 10;
    
    // Length penalty (shorter text with match gets higher score)
    score = score * (1000 / (text.length + 100));
    
    return Math.min(100, Math.max(0, score));
  }

  async getSearchSuggestions(query: string, manualId?: string): Promise<string[]> {
    console.log(`💡 Generating search suggestions for: "${query}"`);

    const suggestions: string[] = [];

    // Get keyword suggestions from existing indexes
    const indexes = await this.prisma.searchIndex.findMany({
      where: {
        ...(manualId && { manualId }),
        searchableText: {
          contains: query.toLowerCase(),
          mode: 'insensitive',
        },
      },
      select: {
        indexes: true,
      },
      take: 10,
    });

    indexes.forEach(index => {
      const keywords = (index.indexes as any).keywords || [];
      const phrases = (index.indexes as any).phrases || [];
      
      suggestions.push(
        ...keywords.filter((keyword: string) => 
          keyword.toLowerCase().startsWith(query.toLowerCase())
        ),
        ...phrases.filter((phrase: string) => 
          phrase.toLowerCase().includes(query.toLowerCase())
        )
      );
    });

    // Remove duplicates and limit
    const uniqueSuggestions = [...new Set(suggestions)].slice(0, 8);

    console.log(`✅ Found ${uniqueSuggestions.length} suggestions`);

    return uniqueSuggestions;
  }

  async getPopularSearches(manualId?: string, limit: number = 10): Promise<string[]> {
    console.log(`📊 Getting popular searches for Manual ${manualId || 'all'}`);

    // Mock implementation - in production, track search analytics
    const popularSearches = [
      'aircraft maintenance',
      'emergency procedures',
      'flight controls',
      'engine systems',
      'system troubleshooting',
      'preventive maintenance',
      'safety guidelines',
      'operational procedures',
      'fuel systems',
      'electrical systems',
    ];

    return popularSearches.slice(0, limit);
  }

  async getManualIndexStats(manualId: string): Promise<any> {
    const index = await this.prisma.searchIndex.findFirst({
      where: { manualId },
    });

    if (!index) {
      return {
        manualId,
        hasIndex: false,
        indexedAt: null,
        keywords: 0,
        phrases: 0,
        entities: 0,
        sections: 0,
      };
    }

    const stats = index.indexes as any;

    return {
      manualId,
      hasIndex: true,
      indexedAt: index.createdAt,
      keywords: stats.keywords?.length || 0,
      phrases: stats.phrases?.length || 0,
      entities: stats.entities?.length || 0,
      sections: stats.sections?.length || 0,
    };
  }

  async rebuildIndex(manualId: string): Promise<void> {
    console.log(`🔧 Rebuilding search index for Manual ${manualId}`);

    // Delete existing index
    await this.prisma.searchIndex.deleteMany({
      where: { manualId },
    });

    // The publish pipeline will regenerate the index
    console.log(`✅ Index rebuild initiated for Manual ${manualId}`);
  }
}
