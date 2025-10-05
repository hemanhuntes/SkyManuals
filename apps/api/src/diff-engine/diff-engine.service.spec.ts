import { Test, TestingModule } from '@nestjs/testing';
import { DiffEngineService } from './diff-engine.service';
import { TipTapDocument } from '@skymanuals/types';

describe('DiffEngineService', () => {
  let service: DiffEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DiffEngineService],
    }).compile();

    service = module.get<DiffEngineService>(DiffEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('compareTipTapDocuments', () => {
    it('should detect text changes', () => {
      const oldDoc: TipTapDocument = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Old text' }],
          },
        ],
      };

      const newDoc: TipTapDocument = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'New text' }],
          },
        ],
      };

      const diff = service.compareTipTapDocuments(oldDoc, newDoc);

      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0].type).toBe('text');
      expect(diff.changes[0].oldValue).toBe('Old text');
      expect(diff.changes[0].newValue).toBe('New text');
    });

    it('should detect added content', () => {
      const oldDoc: TipTapDocument = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'First paragraph' }],
          },
        ],
      };

      const newDoc: TipTapDocument = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'First paragraph' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Second paragraph' }],
          },
        ],
      };

      const diff = service.compareTipTapDocuments(oldDoc, newDoc);

      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0].type).toBe('node');
      expect(diff.changes[0].newValue).toEqual({
        type: 'paragraph',
        content: [{ type: 'text', text: 'Second paragraph' }],
      });
      expect(diff.summary.added).toBe(1);
    });

    it('should detect removed content', () => {
      const oldDoc: TipTapDocument = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'First paragraph' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Second paragraph' }],
          },
        ],
      };

      const newDoc: TipTapDocument = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'First paragraph' }],
          },
        ],
      };

      const diff = service.compareTipTapDocuments(oldDoc, newDoc);

      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0].type).toBe('node');
      expect(diff.summary.removed).toBe(1);
    });
  });

  describe('ETagValidation', () => {
    it('should validate matching ETags', () => {
      const currentETag = 'abc123';
      const providedETag = 'abc123';
      
      expect(service.validateETag(currentETag, providedETag)).toBe(true);
    });

    it('should reject non-matching ETags', () => {
      const currentETag = 'abc123';
      const providedETag = 'def456';
      
      expect(service.validateETag(currentETag, providedETag)).toBe(false);
    });

    it('should allow operation when no ETag provided', () => {
      const currentETag = 'abc123';
      
      expect(service.validateETag(currentETag, undefined)).toBe(true);
    });

    it('should create conflict error', () => {
      const currentETag = 'abc123';
      const providedETag = 'def456';
      
      const error = service.createConflictError(currentETag, providedETag);
      
      expect(error.success).toBe(false);
      expect(error.error.type).toBe('conflict_error');
      expect(error.error.currentEtag).toBe(currentETag);
      expect(error.error.providedEtag).toBe(providedETag);
    });
  });

  describe('generateTextualDiff', () => {
    it('should generate readable diff', () => {
      const oldDoc: TipTapDocument = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Original content' }],
          },
        ],
      };

      const newDoc: TipTapDocument = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Modified content' }],
          },
        ],
      };

      const diff = service.compareTipTapDocuments(oldDoc, newDoc);
      const textualDiff = service.generateTextualDiff(diff);

      expect(textualDiff).toContain('MODIFIED');
      expect(textualDiff).toContain('Original content');
      expect(textualDiff).toContain('Modified content');
    });
  });
});






