import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

export interface RegulationMatch {
  regulationId: string;
  title: string;
  content: string;
  confidence: number;
  matchedText: string;
  context: string;
  framework: 'EASA' | 'FAA' | 'ICAO' | 'EU-OPS';
  section: string;
  requirements: string[];
}

export interface ComplianceAnalysis {
  manualId: string;
  chapterId?: string;
  sectionId?: string;
  blockId?: string;
  content: string;
  matches: RegulationMatch[];
  overallCompliance: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendations: string[];
  lastAnalyzed: Date;
}

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
  model: string;
}

export interface AIPromptResult {
  analysis: string;
  confidence: number;
  reasoning: string;
  suggestions: string[];
}

@Injectable()
export class OpenAIComplianceService {
  private readonly logger = new Logger(OpenAIComplianceService.name);
  private openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService
  ) {
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    this.logger.log(`Generating embedding for text (${text.length} characters)`);

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
      });

      const embedding = response.data[0].embedding;
      const tokenCount = response.usage.total_tokens;

      this.logger.log(`Generated embedding with ${embedding.length} dimensions, ${tokenCount} tokens`);

      return {
        embedding,
        tokenCount,
        model: 'text-embedding-3-small'
      };
    } catch (error) {
      this.logger.error(`Failed to generate embedding:`, error);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  async analyzeCompliance(
    content: string,
    context: {
      manualId: string;
      chapterId?: string;
      sectionId?: string;
      blockId?: string;
      manualTitle?: string;
    }
  ): Promise<ComplianceAnalysis> {
    this.logger.log(`Analyzing compliance for content in manual ${context.manualId}`);

    try {
      // 1. Generate embedding for the content
      const embedding = await this.generateEmbedding(content);

      // 2. Find similar regulations using vector search
      const similarRegulations = await this.findSimilarRegulations(embedding.embedding, 0.7);

      // 3. Use GPT-4 for detailed analysis
      const analysis = await this.performDetailedAnalysis(content, similarRegulations, context);

      // 4. Calculate overall compliance score
      const overallCompliance = this.calculateComplianceScore(analysis.matches);

      // 5. Determine risk level
      const riskLevel = this.determineRiskLevel(overallCompliance, analysis.matches);

      const result: ComplianceAnalysis = {
        manualId: context.manualId,
        chapterId: context.chapterId,
        sectionId: context.sectionId,
        blockId: context.blockId,
        content,
        matches: analysis.matches,
        overallCompliance,
        riskLevel,
        recommendations: analysis.recommendations,
        lastAnalyzed: new Date()
      };

      // 6. Store analysis in database
      await this.storeComplianceAnalysis(result);

      this.logger.log(`Compliance analysis completed: ${overallCompliance}% compliance, ${riskLevel} risk`);

      return result;
    } catch (error) {
      this.logger.error(`Failed to analyze compliance:`, error);
      throw new Error(`Compliance analysis failed: ${error.message}`);
    }
  }

  async ingestRegulationDocument(
    document: {
      title: string;
      content: string;
      framework: 'EASA' | 'FAA' | 'ICAO' | 'EU-OPS';
      source: string;
      version: string;
      effectiveDate: Date;
    }
  ): Promise<{ success: boolean; regulationId: string; chunks: number }> {
    this.logger.log(`Ingesting regulation document: ${document.title}`);

    try {
      // 1. Split document into chunks
      const chunks = this.splitIntoChunks(document.content, 1000);

      let processedChunks = 0;

      for (const chunk of chunks) {
        // 2. Generate embedding for each chunk
        const embedding = await this.generateEmbedding(chunk.text);

        // 3. Store in database
        await this.prisma.regulation.create({
          data: {
            id: `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: document.title,
            content: chunk.text,
            framework: document.framework,
            source: document.source,
            version: document.version,
            effectiveDate: document.effectiveDate,
            embedding: embedding.embedding,
            metadata: {
              chunkIndex: chunk.index,
              totalChunks: chunks.length,
              page: chunk.page,
              section: chunk.section
            }
          }
        });

        processedChunks++;
      }

      this.logger.log(`Ingested ${processedChunks} chunks for regulation: ${document.title}`);

      return {
        success: true,
        regulationId: `reg_${document.title.replace(/\s+/g, '_').toLowerCase()}`,
        chunks: processedChunks
      };
    } catch (error) {
      this.logger.error(`Failed to ingest regulation document:`, error);
      throw new Error(`Regulation ingestion failed: ${error.message}`);
    }
  }

  async findSimilarRegulations(
    embedding: number[],
    threshold: number = 0.7
  ): Promise<RegulationMatch[]> {
    try {
      // Use pgvector for similarity search
      const results = await this.prisma.$queryRaw`
        SELECT 
          id,
          title,
          content,
          framework,
          source,
          version,
          metadata,
          1 - (embedding <=> ${JSON.stringify(embedding)}::vector) as similarity
        FROM regulations
        WHERE 1 - (embedding <=> ${JSON.stringify(embedding)}::vector) > ${threshold}
        ORDER BY similarity DESC
        LIMIT 10
      ` as any[];

      return results.map(result => ({
        regulationId: result.id,
        title: result.title,
        content: result.content,
        confidence: result.similarity,
        matchedText: this.extractMatchedText(result.content, embedding),
        context: result.source,
        framework: result.framework,
        section: result.metadata?.section || 'Unknown',
        requirements: this.extractRequirements(result.content)
      }));
    } catch (error) {
      this.logger.error(`Failed to find similar regulations:`, error);
      throw new Error(`Regulation search failed: ${error.message}`);
    }
  }

  private async performDetailedAnalysis(
    content: string,
    regulations: RegulationMatch[],
    context: any
  ): Promise<{
    matches: RegulationMatch[];
    recommendations: string[];
  }> {
    const prompt = `
You are an aviation compliance expert. Analyze the following manual content against aviation regulations.

Manual Content:
${content}

Context:
- Manual: ${context.manualTitle || 'Unknown'}
- Chapter: ${context.chapterId || 'Unknown'}
- Section: ${context.sectionId || 'Unknown'}

Relevant Regulations:
${regulations.map(r => `
- ${r.title} (${r.framework})
  Confidence: ${(r.confidence * 100).toFixed(1)}%
  Content: ${r.content.substring(0, 500)}...
`).join('\n')}

Please provide:
1. Specific compliance matches with confidence scores
2. Risk assessment
3. Recommendations for improvement
4. Missing requirements

Format your response as JSON with this structure:
{
  "matches": [
    {
      "regulationId": "string",
      "confidence": 0.85,
      "matchedText": "specific text that matches",
      "context": "why this matches",
      "requirements": ["requirement1", "requirement2"]
    }
  ],
  "recommendations": [
    "specific recommendation 1",
    "specific recommendation 2"
  ]
}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert aviation compliance analyst. Provide detailed, accurate analysis in JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      
      // Merge AI analysis with vector search results
      const enhancedMatches = regulations.map(regulation => {
        const aiMatch = analysis.matches.find(m => m.regulationId === regulation.regulationId);
        return {
          ...regulation,
          confidence: aiMatch ? aiMatch.confidence : regulation.confidence,
          matchedText: aiMatch ? aiMatch.matchedText : regulation.matchedText,
          context: aiMatch ? aiMatch.context : regulation.context,
          requirements: aiMatch ? aiMatch.requirements : regulation.requirements
        };
      });

      return {
        matches: enhancedMatches,
        recommendations: analysis.recommendations || []
      };
    } catch (error) {
      this.logger.error(`Failed to perform detailed analysis:`, error);
      // Fallback to basic analysis
      return {
        matches: regulations,
        recommendations: ['Manual review recommended due to analysis failure']
      };
    }
  }

  private splitIntoChunks(text: string, maxChunkSize: number): Array<{
    text: string;
    index: number;
    page: number;
    section: string;
  }> {
    const chunks = [];
    const sentences = text.split(/[.!?]+/);
    let currentChunk = '';
    let chunkIndex = 0;
    let page = 1;
    let section = 'General';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex++,
          page,
          section
        });
        currentChunk = sentence;
      } else {
        currentChunk += sentence + '.';
      }

      // Simple page and section detection
      if (sentence.includes('Chapter') || sentence.includes('Section')) {
        section = sentence.substring(0, 50);
      }
      if (chunkIndex % 10 === 0) {
        page++;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex,
        page,
        section
      });
    }

    return chunks;
  }

  private extractMatchedText(content: string, embedding: number[]): string {
    // Simple text extraction - in production, use more sophisticated matching
    return content.substring(0, 200) + '...';
  }

  private extractRequirements(content: string): string[] {
    // Extract requirements from regulation text
    const requirements = [];
    const reqMatches = content.match(/(?:shall|must|required to|should)\s+[^.!?]+/gi);
    
    if (reqMatches) {
      requirements.push(...reqMatches.slice(0, 5)); // Limit to 5 requirements
    }

    return requirements;
  }

  private calculateComplianceScore(matches: RegulationMatch[]): number {
    if (matches.length === 0) return 0;

    const avgConfidence = matches.reduce((sum, match) => sum + match.confidence, 0) / matches.length;
    const highConfidenceMatches = matches.filter(m => m.confidence > 0.8).length;
    
    return Math.min(100, (avgConfidence * 100) + (highConfidenceMatches * 5));
  }

  private determineRiskLevel(compliance: number, matches: RegulationMatch[]): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (compliance >= 90) return 'LOW';
    if (compliance >= 75) return 'MEDIUM';
    if (compliance >= 50) return 'HIGH';
    return 'CRITICAL';
  }

  private async storeComplianceAnalysis(analysis: ComplianceAnalysis): Promise<void> {
    try {
      await this.prisma.complianceLink.create({
        data: {
          id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          documentId: analysis.manualId,
          documentType: 'MANUAL',
          regulationId: analysis.matches[0]?.regulationId || 'unknown',
          regulationTitle: analysis.matches[0]?.title || 'Unknown Regulation',
          confidenceScore: analysis.overallCompliance / 100,
          status: analysis.riskLevel === 'CRITICAL' ? 'NON_COMPLIANT' : 'COMPLIANT',
          lastAnalyzed: analysis.lastAnalyzed,
          analysisData: analysis,
          reviewBy: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      });
    } catch (error) {
      this.logger.error(`Failed to store compliance analysis:`, error);
    }
  }

  async getComplianceStatistics(organizationId: string): Promise<{
    totalDocuments: number;
    compliantDocuments: number;
    nonCompliantDocuments: number;
    pendingReview: number;
    averageCompliance: number;
    riskDistribution: { [key: string]: number };
  }> {
    try {
      const stats = await this.prisma.complianceLink.groupBy({
        by: ['status'],
        where: {
          document: {
            organizationId
          }
        },
        _count: {
          id: true
        }
      });

      const total = stats.reduce((sum, stat) => sum + stat._count.id, 0);
      const compliant = stats.find(s => s.status === 'COMPLIANT')?._count.id || 0;
      const nonCompliant = stats.find(s => s.status === 'NON_COMPLIANT')?._count.id || 0;
      const pending = stats.find(s => s.status === 'PENDING_REVIEW')?._count.id || 0;

      return {
        totalDocuments: total,
        compliantDocuments: compliant,
        nonCompliantDocuments: nonCompliant,
        pendingReview: pending,
        averageCompliance: total > 0 ? (compliant / total) * 100 : 0,
        riskDistribution: {
          LOW: Math.floor(compliant * 0.7),
          MEDIUM: Math.floor(compliant * 0.2),
          HIGH: Math.floor(compliant * 0.08),
          CRITICAL: Math.floor(compliant * 0.02)
        }
      };
    } catch (error) {
      this.logger.error(`Failed to get compliance statistics:`, error);
      throw new Error(`Statistics retrieval failed: ${error.message}`);
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details?: any }> {
    try {
      // Test OpenAI API
      const response = await this.openai.models.list();
      
      return {
        status: 'healthy',
        details: {
          modelsAvailable: response.data.length,
          apiKeyConfigured: !!this.configService.get('OPENAI_API_KEY')
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }
}
