import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from '../../src/search/search.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GuardrailsService } from '../../src/search/guardrails.service';
import { OpenAIComplianceService } from '../../src/compliance/openai-compliance.service';

describe('SearchService', () => {
  let service: SearchService;
  let prismaService: PrismaService;
  let guardrailsService: GuardrailsService;
  let openaiService: OpenAIComplianceService;

  const mockPrismaService = {
    searchIndex: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    searchAnalytics: {
      create: jest.fn(),
    },
    manual: {
      findUnique: jest.fn(),
    },
    chapter: {
      findUnique: jest.fn(),
    },
    section: {
      findUnique: jest.fn(),
    },
  };

  const mockGuardrailsService = {
    validateQuery: jest.fn().mockReturnValue({ valid: true }),
    checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
    applyOrganizationFilter: jest.fn().mockImplementation((query) => query),
    filterSearchResults: jest.fn().mockImplementation((results) => results),
  };

  const mockOpenaiService = {
    generateEmbedding: jest.fn().mockResolvedValue({
      embedding: new Array(1536).fill(0.1),
      tokenCount: 100,
      model: 'text-embedding-3-small',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: GuardrailsService,
          useValue: mockGuardrailsService,
        },
        {
          provide: OpenAIComplianceService,
          useValue: mockOpenaiService,
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    prismaService = module.get<PrismaService>(PrismaService);
    guardrailsService = module.get<GuardrailsService>(GuardrailsService);
    openaiService = module.get<OpenAIComplianceService>(OpenAIComplianceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('askQuestion', () => {
    it('should generate AI-powered answer with citations', async () => {
      const mockSearchResults = [
        {
          id: 'result-1',
          title: 'Emergency Procedures',
          content: 'In case of emergency, follow these procedures...',
          manualId: 'manual-1',
          chapterId: 'chapter-1',
          sectionId: 'section-1',
          blockId: 'block-1',
          version: '1.0',
          relevanceScore: 0.9,
        },
      ];

      const mockParagraphInfo = {
        manualTitle: 'Test Manual',
        chapterTitle: 'Emergency',
        sectionTitle: 'Procedures',
        pageNumber: 1,
      };

      mockPrismaService.searchIndex.findMany.mockResolvedValue(mockSearchResults);
      mockPrismaService.manual.findUnique.mockResolvedValue({ title: 'Test Manual' });
      mockPrismaService.chapter.findUnique.mockResolvedValue({ title: 'Emergency' });
      mockPrismaService.section.findUnique.mockResolvedValue({ title: 'Procedures' });
      mockPrismaService.searchAnalytics.create.mockResolvedValue({});

      const query = {
        query: 'What are the emergency procedures?',
        filters: { organizationId: 'test-org' },
        limit: 5,
      };

      const result = await service.askQuestion(query, 'test-user', 'test-session');

      expect(result).toBeDefined();
      expect(result.answer).toContain('emergency procedures');
      expect(result.citations).toHaveLength(1);
      expect(result.query).toBe(query.query);
      expect(result.searchTechniques).toContain('HYBRID');
      expect(result.searchTechniques).toContain('SEMANTIC');
      expect(result.searchTechniques).toContain('BM25');
    });

    it('should handle empty search results', async () => {
      mockPrismaService.searchIndex.findMany.mockResolvedValue([]);

      const query = {
        query: 'nonexistent content',
        filters: { organizationId: 'test-org' },
        limit: 5,
      };

      const result = await service.askQuestion(query, 'test-user', 'test-session');

      expect(result.answer).toContain("couldn't find any relevant information");
      expect(result.citations).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    });

    it('should validate query using guardrails', async () => {
      mockGuardrailsService.validateQuery.mockReturnValue({ 
        valid: false, 
        error: 'Invalid query' 
      });

      const query = {
        query: 'invalid query',
        filters: { organizationId: 'test-org' },
      };

      await expect(service.askQuestion(query, 'test-user', 'test-session'))
        .rejects.toThrow('Invalid query');

      expect(mockGuardrailsService.validateQuery).toHaveBeenCalledWith(query);
    });

    it('should check rate limits', async () => {
      mockGuardrailsService.checkRateLimit.mockResolvedValue({ 
        allowed: false, 
        resetTime: new Date() 
      });

      const query = {
        query: 'test query',
        filters: { organizationId: 'test-org' },
      };

      await expect(service.askQuestion(query, 'test-user', 'test-session'))
        .rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('generateEmbedding', () => {
    it('should generate embedding using OpenAI service', async () => {
      const text = 'test content for embedding';
      
      const result = await (service as any).generateEmbedding(text);

      expect(openaiService.generateEmbedding).toHaveBeenCalledWith(text);
      expect(result).toHaveLength(1536);
      expect(result.every(val => val === 0.1)).toBe(true);
    });

    it('should use fallback embedding when OpenAI fails', async () => {
      mockOpenaiService.generateEmbedding.mockRejectedValue(new Error('OpenAI API error'));
      
      const text = 'test content for embedding';
      
      const result = await (service as any).generateEmbedding(text);

      expect(result).toHaveLength(1536);
      expect(result.every(val => typeof val === 'number')).toBe(true);
    });
  });

  describe('extractCitations', () => {
    it('should extract and format citations', async () => {
      const mockResults = [
        {
          id: 'result-1',
          title: 'Emergency Procedures',
          content: 'In case of emergency, follow these procedures immediately.',
          manualId: 'manual-1',
          chapterId: 'chapter-1',
          sectionId: 'section-1',
          blockId: 'block-1',
          version: '1.0',
          relevanceScore: 0.9,
        },
      ];

      mockPrismaService.manual.findUnique.mockResolvedValue({ title: 'Test Manual' });
      mockPrismaService.chapter.findUnique.mockResolvedValue({ title: 'Emergency' });
      mockPrismaService.section.findUnique.mockResolvedValue({ title: 'Procedures' });

      const citations = await (service as any).extractCitations(mockResults, 'emergency procedures');

      expect(citations).toHaveLength(1);
      expect(citations[0]).toMatchObject({
        id: 'citation-1',
        title: 'Emergency Procedures',
        content: expect.stringContaining('<mark>emergency</mark>'),
        source: {
          manualId: 'manual-1',
          manualTitle: 'Test Manual',
          chapterTitle: 'Emergency',
          sectionTitle: 'Procedures',
          blockId: 'block-1',
          version: '1.0',
        },
        relevanceScore: 0.9,
        highlightedText: expect.any(String),
        context: expect.any(String),
      });
    });
  });

  describe('highlightQueryInContent', () => {
    it('should highlight query terms in content', () => {
      const content = 'In case of emergency, follow these emergency procedures immediately.';
      const query = 'emergency procedures';

      const result = (service as any).highlightQueryInContent(content, query);

      expect(result).toContain('<mark>emergency</mark>');
      expect(result).toContain('<mark>procedures</mark>');
    });

    it('should not highlight short terms', () => {
      const content = 'This is a test with short words.';
      const query = 'is a test';

      const result = (service as any).highlightQueryInContent(content, query);

      expect(result).not.toContain('<mark>is</mark>');
      expect(result).not.toContain('<mark>a</mark>');
      expect(result).toContain('<mark>test</mark>');
    });
  });

  describe('extractHighlightedText', () => {
    it('should extract sentence containing query terms', () => {
      const content = 'This is normal text. Emergency procedures must be followed. This is more text.';
      const query = 'emergency procedures';

      const result = (service as any).extractHighlightedText(content, query);

      expect(result).toContain('Emergency procedures must be followed');
    });

    it('should return first sentence if no matches found', () => {
      const content = 'This is normal text. This is more text.';
      const query = 'nonexistent';

      const result = (service as any).extractHighlightedText(content, query);

      expect(result).toBe('This is normal text');
    });
  });

  describe('extractContext', () => {
    it('should extract context around query matches', () => {
      const content = 'This is some context before the emergency procedures and some context after.';
      const query = 'emergency procedures';

      const result = (service as any).extractContext(content, query);

      expect(result).toContain('emergency procedures');
      expect(result.split(' ').length).toBeGreaterThan(5);
    });

    it('should return beginning of content if no matches', () => {
      const content = 'This is a long piece of content that does not contain the search terms anywhere in the text.';
      const query = 'nonexistent';

      const result = (service as any).extractContext(content, query);

      expect(result).toBe('This is a long piece of content that does not contain the search terms anywhere in the text.');
    });
  });
});
