import { Injectable } from '@nestjs/common';
import { Diff, DiffResult, TipTapDocument } from '@skymanuals/types';
import { randomUUID } from 'crypto';

@Injectable()
export class DiffEngineService {
  /**
   * Compare two TipTap documents and generate diff
   */
  compareTipTapDocuments(
    oldDoc: TipTapDocument,
    newDoc: TipTapDocument,
    entityPath = 'root'
  ): Diff {
    const changes: DiffResult[] = [];
    
    // Compare document structure
    const oldContent = oldDoc.content || [];
    const newContent = newDoc.content || [];
    
    // Compare content arrays
    this.compareContentArrays(oldContent, newContent, `${entityPath}.content`, changes);
    
    return {
      changes,
      summary: this.generateSummary(changes),
    };
  }

  /**
   * Create a new version with ETag
   */
  createVersion(manualId: string, changeSetId: string, additionalData?: {
    chapterId?: string;
    sectionId?: string;
    blockId?: string;
  }) {
    return {
      id: randomUUID(),
      etag: randomUUID(),
      manualId,
      changeSetId,
      ...additionalData,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Validate ETag optimistic locking
   */
  validateETag(currentETag: string, providedETag?: string): boolean {
    if (!providedETag) {
      return true; // No ETag provided, allow operation
    }
    return currentETag === providedETag;
  }

  /**
   * Generate optimistic locking conflict error
   */
  createConflictError(currentETag: string, providedETag?: string) {
    return {
      success: false,
      error: {
        type: 'conflict_error' as const,
        message: 'Resource has been modified by another user. Please refresh and try again.',
        currentEtag: currentETag,
        providedEtag: providedETag,
      },
    };
  }

  private compareContentArrays(
    oldContent: unknown[],
    newContent: unknown[],
    path: string,
    changes: DiffResult[]
  ) {
    const maxLength = Math.max(oldContent.length, newContent.length);
    
    for (let i = 0; i < maxLength; i++) {
      const currentPath = `${path}[${i}]`;
      
      if (i >= oldContent.length) {
        // New content added
        changes.push({
          type: 'node',
          path: currentPath,
          newValue: newContent[i],
        });
      } else if (i >= newContent.length) {
        // Content removed
        changes.push({
          type: 'node',
          path: currentPath,
          oldValue: oldContent[i],
        });
      } else {
        // Compare existing content
        this.compareValues(oldContent[i], newContent[i], currentPath, changes);
      }
    }
  }

  private compareValues(
    oldValue: unknown,
    newValue: unknown,
    path: string,
    changes: DiffResult[]
  ) {
    // Check if values are different
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      return;
    }

    // Handle different types
    if (typeof oldValue === 'string' && typeof newValue === 'string') {
      if (oldValue !== newValue) {
        changes.push({
          type: 'text',
          path,
          oldValue,
          newValue,
        });
      }
      return;
    }

    if (typeof oldValue === 'object' && typeof newValue === 'object') {
      if (oldValue === null || newValue === null) {
        changes.push({
          type: 'node',
          path,
          oldValue,
          newValue,
        });
        return;
      }

      // Compare objects recursively
      this.compareObjects(oldValue as Record<string, unknown>, newValue as Record<string, unknown>, path, changes);
      return;
    }

    // Type changed or primitive comparison
    changes.push({
      type: 'node',
      path,
      oldValue,
      newValue,
    });
  }

  private compareObjects(
    oldObj: Record<string, unknown>,
    newObj: Record<string, unknown>,
    path: string,
    changes: DiffResult[]
  ) {
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    
    for (const key of allKeys) {
      const currentPath = `${path}.${key}`;
      
      if (!(key in oldObj)) {
        // New attribute
        changes.push({
          type: 'attribute',
          path: currentPath,
          newValue: newObj[key],
        });
      } else if (!(key in newObj)) {
        // Removed attribute
        changes.push({
          type: 'attribute',
          path: currentPath,
          oldValue: oldObj[key],
        });
      } else {
        // Compare existing attributes
        this.compareValues(oldObj[key], newObj[key], currentPath, changes);
      }
    }
  }

  private generateSummary(changes: DiffResult[]) {
    return {
      added: changes.filter(c => c.type === 'node' && c.oldValue === undefined).length,
      removed: changes.filter(c => c.type === 'node' && c.newValue === undefined).length,
      modified: changes.filter(c => 
        (c.type === 'text' || c.type === 'attribute') ||
        (c.type === 'node' && c.oldValue !== undefined && c.newValue !== undefined)
      ).length,
    };
  }

  /**
   * Generate textual diff representation
   */
  generateTextualDiff(diff: Diff): string {
    const lines: string[] = [];
    
    diff.changes.forEach(change => {
      const oldStr = change.oldValue ? JSON.stringify(change.oldValue, null, 2) : 'undefined';
      const newStr = change.newValue ? JSON.stringify(change.newValue, null, 2) : 'undefined';
      
      switch (change.type) {
        case 'text':
          lines.push(`--- ${change.path}`);
          lines.push(`+ ${newStr}`);
          lines.push(`- ${oldStr}`);
          break;
        case 'node':
          if (change.oldValue === undefined) {
            lines.push(`+ ADDED ${change.path}: ${newStr}`);
          } else if (change.newValue === undefined) {
            lines.push(`- REMOVED ${change.path}: ${oldStr}`);
          } else {
            lines.push(`~ MODIFIED ${change.path}`);
            lines.push(`  from: ${oldStr}`);
            lines.push(`  to: ${newStr}`);
          }
          break;
        case 'attribute':
          lines.push(`~ ATTRIBUTE ${change.path}: ${oldStr} → ${newStr}`);
          break;
      }
    });
    
    return lines.join('\n');
  }
}
