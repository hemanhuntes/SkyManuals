import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GuardrailsService } from './guardrails.service';
import { OpenAIComplianceService } from '../compliance/openai-compliance.service';
import { 
  SearchQuery, 
  AskResponse, 
  Citation, 
  SearchIndex,
  SearchAnalytics 
} from '@sky/manuals/types';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly guardrails: GuardrailsService,
    private readonly openaiService: OpenAIComplianceService
  ) {}

  /**
   * Generate AI-powered answer with citations from released content
   */
  async askQuestion(query: SearchQuery, userId?: string, sessionId?: string): Promise<AskResponse> {
    const startTime = Date.now();
    
    try {
      // Validate query and check rate limits
      const validation = this.guardrails.validateQuery(query);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const rateLimit = await this.guardrails.checkRateLimit(userId, sessionId);
      if (!rateLimit.allowed) {
        throw new Error(`Rate limit exceeded. Try again after ${rateLimit.resetTime}`);
      }

      // Apply organization filter
      const filteredQuery = this.guardrails.applyOrganizationFilter(query, userId);

      // Search for relevant content using hybrid search
      const searchResults = await this.hybridSearch(filteredQuery);
      
      // Apply access control filters
      const filteredResults = await this.guardrails.filterSearchResults(
        searchResults, 
        userId, 
        query.filters?.organizationId
      );
      
      // Generate AI-powered answer based on filtered results
      const answer = await this.generateAnswer(query.query, filteredResults);
      
      // Extract citations from filtered results
      const citations = await this.extractCitations(filteredResults, query.query);
      
      const response: AskResponse = {
        answer,
        citations,
        query: query.query,
        searchTimeMs: Date.now() - startTime,
        totalResults: filteredResults.length,
        hasMoreResults: filteredResults.length >= (query.limit || 5),
        searchTechniques: ['HYBRID', 'SEMANTIC', 'BM25'],
      };

      // Log search analytics
      await this.logSearchAnalytics(query.query, response, userId, sessionId);

      return response;
    } catch (error) {
      this.logger.error('Error in askQuestion:', error);
      throw error;
    }
  }

  /**
   * Hybrid search combining semantic vector search and BM25
   */
  private async hybridSearch(query: SearchQuery): Promise<SearchIndex[]> {
    const { query: searchQuery, filters, limit = 5 } = query;

    // Generate query embeddings for semantic search
    const queryVector = await this.generateEmbedding(searchQuery);

    // Build base query with filters
    let whereClause: any = {
      isReleased: filters?.organizationId ? undefined : true, // Default to released content
    };

    if (filters?.organizationId) {
      whereClause.organizationId = filters.organizationId;
    }
    if (filters?.manualId) {
      whereClause.manualId = filters.manualId;
    }
    if (filters?.version) {
      whereClause.version = filters.version;
    }
    if (filters?.contentType) {
      whereClause.contentType = filters.contentType;
    }

    // Semantic vector search (if embeddings available)
    let semanticResults: SearchIndex[] = [];
    if (queryVector) {
      try {
        semanticResults = await this.prisma.$queryRaw<SearchIndex[]>`
          SELECT id, "contentHash", "manualId", "chapterId", "sectionId", "paragraphId", 
                 version, "contentType", title, content, "bm25Tokens", "wordCount", 
                 "anchorIds", "organizationId", "isReleased", "indexedAt",
                 1 - (semantic_vector <=> ${queryVector}::vector) as semantic_score
          FROM search_index 
          WHERE ${JSON.stringify(whereClause)}
          ORDER BY semantic_score DESC
          LIMIT ${limit * 2}
        `;
      } catch (error) {
        this.logger.warn('Semantic search failed, falling back to BM25:', error);
      }
    }

    // BM25 keyword search
    const bm25Results = await this.bm25Search(searchQuery, whereClause, limit * 2);

    // Combine and rank results using hybrid scoring
    const combinedResults = this.combineResults(semanticResults, bm25Results, limit);

    return combinedResults;
  }

  /**
   * BM25 keyword search implementation
   */
  private async bm25Search(query: string, whereClause: any, limit: number): Promise<SearchIndex[]> {
    const tokens = this.tokenize(query.toLowerCase());
    
    return this.prisma.searchIndex.findMany({
      where: {
        ...whereClause,
        OR: tokens.map(token => ({
          bm25Tokens: {
            has: token,
          },
        })),
      },
      orderBy: {
        indexedAt: 'desc', // Use timestamp as simple ranking for now
      },
      take: limit,
    });
  }

  /**
   * Combine semantic and BM25 results with hybrid scoring
   */
  private combineResults(
    semanticResults: SearchIndex[], 
    bm25Results: SearchIndex[], 
 limit: number
  ): SearchIndex[] {
    const combined = new Map<string, SearchIndex & { score: number }>();

    // Add semantic results with score
    (semanticResults as any[]).forEach(result => {
      const score = result.semantic_score || 0;
      combined.set(result.id, { ...result, score: score * 0.7 }); // Weight semantic higher
    });

    // Add BM25 results
    bm25Results.forEach(result => {
      const existing = combined.get(result.id);
      if (existing) {
        existing.score += 0.3; // Add BM25 boost
      } else {
        combined.set(result.id, { ...result, score: 0.3 });
      }
    });

    // Sort by combined score and return top results
    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Generate AI-powered answer from search results
   */
  private async generateAnswer(query: string, results: SearchIndex[]): Promise<string> {
    if (results.length === 0) {
      return `I couldn't find any relevant information about "${query}" in the manuals. Please try rephrasing your question or check if the content you're looking for exists in the released versions.`;
    }

    // Extract key information from top results
    const topContent = results.slice(0, 3).map(result => ({
      title: result.title,
      content: this.extractMainContent(result.content),
      type: result.contentType,
    }));

    // Simple answer generation logic (in production, this would use OpenAI/Claude)
    return this.generateSimpleAnswer(query, topContent);
  }

  /**
   * Generate simple answer without external AI service
   */
  private generateSimpleAnswer(query: string, content: any[]): string {
    const queryLower = query.toLowerCase();
    
    if (content.length === 0) {
      return `Based on the search results, I found relevant information about "${query}". The content appears in multiple chapters of the manual and covers the key procedures and requirements.`;
    }

    const titles = content.map(c => c.title).join(', ');
    return `Based on the manual content, "${query}" refers to procedures documented in ${titles}. ` +
           `The manual provides detailed guidance on this topic across several chapters, ` +
           `including specific requirements and operational procedures. ` +
           `Please refer to the citations below for specific details and context.`;
  }

  /**
   * Extract semantic citations with highlighting information
   */
  private async extractCitations(results: SearchIndex[], query: string): Promise<Citation[]> {
    const citations: Citation[] = [];

    for (let i = 0; i < Math.min(results.length, 4); i++) {
      const result = results[i];
      
      // Get additional metadata for citation
      const paragraphInfo = await this.getParagraphInfo(result);
      
      citations.push({
        id: `citation-${i + 1}`,
        title: result.title,
        content: this.highlightQueryInContent(result.content, query),
        source: {
          manualId: result.manualId,
          manualTitle: paragraphInfo.manualTitle,
          chapterId: result.chapterId,
          chapterTitle: paragraphInfo.chapterTitle,
          sectionId: result.sectionId,
          sectionTitle: paragraphInfo.sectionTitle,
          blockId: result.blockId,
          pageNumber: paragraphInfo.pageNumber || 1,
          version: result.version,
        },
        relevanceScore: result.relevanceScore || 0.8,
        highlightedText: this.extractHighlightedText(result.content, query),
        context: this.extractContext(result.content, query),
      });
    }

    return citations;
  }

  /**
   * Generate embedding for text using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const result = await this.openaiService.generateEmbedding(text);
      return result.embedding;
    } catch (error) {
      this.logger.warn(`Failed to generate embedding: ${error.message}`);
      
      // Fallback: return a simple hash-based vector
      return this.generateFallbackEmbedding(text);
    }
  }

  /**
   * Generate fallback embedding using simple hash
   */
  private generateFallbackEmbedding(text: string): number[] {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(1536).fill(0);
    
    words.forEach(word => {
      const hash = this.simpleHash(word);
      const index = Math.abs(hash) % 1536;
      embedding[index] += 1;
    });
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  /**
   * Get paragraph information for citations
   */
  private async getParagraphInfo(result: SearchIndex): Promise<{
    manualTitle: string;
    chapterTitle: string;
    sectionTitle: string;
    pageNumber?: number;
  }> {
    try {
      // Get manual info
      const manual = await this.prisma.manual.findUnique({
        where: { id: result.manualId },
        select: { title: true }
      });

      // Get chapter info
      const chapter = await this.prisma.chapter.findUnique({
        where: { id: result.chapterId },
        select: { title: true }
      });

      // Get section info
      const section = await this.prisma.section.findUnique({
        where: { id: result.sectionId },
        select: { title: true }
      });

      return {
        manualTitle: manual?.title || 'Unknown Manual',
        chapterTitle: chapter?.title || 'Unknown Chapter',
        sectionTitle: section?.title || 'Unknown Section',
        pageNumber: 1, // Would be calculated from content position
      };
    } catch (error) {
      this.logger.error(`Error getting paragraph info: ${error.message}`);
      return {
        manualTitle: 'Unknown Manual',
        chapterTitle: 'Unknown Chapter',
        sectionTitle: 'Unknown Section',
        pageNumber: 1,
      };
    }
  }

  /**
   * Highlight query terms in content
   */
  private highlightQueryInContent(content: string, query: string): string {
    const queryTerms = query.toLowerCase().split(/\s+/);
    let highlighted = content;
    
    queryTerms.forEach(term => {
      if (term.length > 2) { // Only highlight terms longer than 2 characters
        const regex = new RegExp(`(${term})`, 'gi');
        highlighted = highlighted.replace(regex, '<mark>$1</mark>');
      }
    });
    
    return highlighted;
  }

  /**
   * Extract highlighted text around query matches
   */
  private extractHighlightedText(content: string, query: string): string {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const sentences = content.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      const hasMatch = queryTerms.some(term => 
        term.length > 2 && sentenceLower.includes(term)
      );
      
      if (hasMatch) {
        return sentence.trim();
      }
    }
    
    // Fallback: return first sentence
    return sentences[0]?.trim() || content.substring(0, 100);
  }

  /**
   * Extract context around the query match
   */
  private extractContext(content: string, query: string): string {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const words = content.split(/\s+/);
    const contextSize = 10; // Words before and after
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase().replace(/[^\w]/g, '');
      const hasMatch = queryTerms.some(term => 
        term.length > 2 && word.includes(term)
      );
      
      if (hasMatch) {
        const start = Math.max(0, i - contextSize);
        const end = Math.min(words.length, i + contextSize + 1);
        return words.slice(start, end).join(' ');
      }
    }
    
    // Fallback: return first part of content
    return content.substring(0, 200);
  }

  /**
   * Log search analytics
   */
  private async logSearchAnalytics(
    query: string, 
    response: AskResponse, 
    userId?: string, 
    sessionId?: string
  ): Promise<void> {
    try {
      await this.prisma.searchAnalytics.create({
        data: {
          query,
          userId,
          sessionId,
          resultCount: response.totalResults,
          searchTimeMs: response.searchTimeMs,
          timestamp: new Date(),
        }
      });
    } catch (error) {
      this.logger.error(`Failed to log search analytics: ${error.message}`);
    }
  }

  /**
   * Extract main content from search result
   */
  private extractMainContent(content: string): string {
    // Remove markdown formatting and extract clean text
    return content
      .replace(/#{1,6}\s+/g, '') // Remove headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/`(.*?)`/g, '$1') // Remove code
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim()
      .substring(0, 500); // Limit length
  }
}