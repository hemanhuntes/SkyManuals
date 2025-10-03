import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { XmlDiff, XmlDocument } from '@sky/manuals/types';

@Injectable()
export class XmlDiffService {
  private readonly logger = new Logger(XmlDiffService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate diff between two XML documents
   */
  async generateXmlDiff(
    sourceXmlDocumentId: string,
    targetXmlDocumentId: string,
    diffType: 'IMPORT_EXPORT' | 'VERSION_COMPARISON' | 'MANUAL_XML_SYNC',
    userId: string
  ): Promise<XmlDiff> {
    try {
      // Get XML documents
      const sourceDocument = await this.prisma.xmlDocument.findUnique({
        where: { id: sourceXmlDocumentId },
      });

      const targetDocument = await this.prisma.xmlDocument.findUnique({
        where: { id: targetXmlDocumentId },
      });

      if (!sourceDocument || !targetDocument) {
        throw new Error('One or both XML documents not found');
      }

      // Parse both XML documents
      const sourceXml = sourceDocument.parsedXml as any;
      const targetXml = targetDocument.parsedXml as any;

      // Generate differences
      const differences = await this.compareXmlStructures(sourceXml, targetXml);

      // Generate summary
      const summary = this.generateDiffSummary(differences);

      // Create diff record
      const xmlDiff = await this.prisma.xmlDiff.create({
        data: {
          sourceXmlDocumentId,
          targetXmlDocumentId,
          diffType,
          differences,
          summary,
          createdBy: userId,
        },
      });

      return xmlDiff;
    } catch (error) {
      this.logger.error('Failed to generate XML diff:', error);
      throw error;
    }
  }

  /**
   * Compare two XML structures and return differences
   */
  private async compareXmlStructures(sourceXml: any, targetXml: any, basePath: string = ''): Promise<any[]> {
    const differences: any[] = [];

    try {
      // Compare objects at current path
      if (typeof sourceXml === 'object' && typeof targetXml === 'object') {
        // Compare properties
        const allKeys = new Set([
          ...Object.keys(sourceXml || {}),
          ...Object.keys(targetXml || {}),
        ]);

        for (const key of allKeys) {
          const currentPath = basePath ? `${basePath}.${key}` : key;
          const sourceValue = sourceXml?.[key];
          const targetValue = targetXml?.[key];

          if (sourceValue === undefined && targetValue !== undefined) {
            differences.push({
              type: 'ADDED',
              path: currentPath,
              oldValue: undefined,
              newValue: targetValue,
              description: `Element ${key} was added`,
              severity: this.calculateSeverity('ADDED', currentPath),
              autoResolvable: false,
            });
          } else if (sourceValue !== undefined && targetValue === undefined) {
            differences.push({
              type: 'REMOVED',
              path: currentPath,
              oldValue: sourceValue,
              newValue: undefined,
              description: `Element ${key} was removed`,
              severity: this.calculateSeverity('REMOVED', currentPath),
              autoResolvable: false,
            });
          } else if (sourceValue !== targetValue) {
            // Recursive comparison for nested objects
            if (typeof sourceValue === 'object' && typeof targetValue === 'object') {
              differences.push(...await diesem.compareXmlStructures(sourceValue, targetValue, currentPath));
            } else {
              differences.push({
                type: 'MODIFIED',
                path: currentPath,
                oldValue: sourceValue,
                newValue: targetValue,
                description: `Element ${key} was modified`,
                severity: this.calculateSeverity('MODIFIED', currentPath),
                autoResolvable: this.canAutoResolve(sourceValue, targetValue),
                resolution: this.generateResolution(sourceValue, targetValue),
              });
            }
          }
        }
      } else if (sourceXml !== targetXml) {
        differences.push({
          type: 'MODIFIED',
          path: basePath || 'root',
          oldValue: sourceXml,
          newValue: targetXml,
          description: 'Root values differ',
          severity: 'CRITICAL',
          autoResolvable: false,
        });
      }

      return differences;
    } catch (error) {
      this.logger.error('Failed to compare XML structures:', error);
      return [];
    }
  }

  /**
   * Generate diff summary
   */
  private generateDiffSummary(differences: any[]): any {
    try {
      const additions = differences.filter(d => d.type === 'ADDED').length;
      const deletions = differences.filter(d => d.type === 'REMOVED').length;
      const modifications = differences.filter(d => d.type === 'MODIFIED').length;
      const criticalChanges = differences.filter(d => d.severity === 'CRITICAL').length;

      return {
        totalChanges: differences.length,
        additions,
        deletions,
        modifications,
        criticalChanges,
      };
    } catch (error) {
      this.logger.error('Failed to generate diff summary:', error);
      return {
        totalChanges: 0,
        additions: 0,
        deletions: 0,
        modifications: 0,
        criticalChanges: 0,
      };
    }
  }

  /**
   * Calculate severity of change
   */
  private calculateSeverity(changeType: string, path: string): 'TRIVIAL' | 'MINOR' | 'MAJOR' | 'CRITICAL' {
    try {
      // Critical paths
      const criticalPaths = ['Manual.title', 'Manual.version', 'Manual.$.version'];
      if (criticalPaths.some(cp => path.includes(cp))) {
        return 'CRITICAL';
      }

      // Major paths
      const majorPaths = ['Manual.chapters', '.title', '.number'];
      if (majorPaths.some(mp => path.includes(mp))) {
        return 'MAJOR';
      }

      // Minor paths
      const minorPaths = ['.blocks', '.content'];
      if (minorPaths.some(mp => path.length > 3 && mp)) {
        return 'MINOR';
      }

      // Default severity based on change type
      switch (changeType) {
        case 'ADDED':
          return 'MINOR';
        case 'REMOVED':
          return 'MAJOR';
        case 'MODIFIED':
          return 'MINOR';
        default:
          return 'TRIVIAL';
      }
    } catch (error) {
      this.logger.error('Failed to calculate severity:', error);
      return 'TRIVIAL';
    }
  }

  /**
   * Check if change can be auto-resolved
   */
  private canAutoResolve(oldValue: any, newValue: any): boolean {
    try {
      // Simple auto-resolution rules
      if (typeof oldValue === 'string' && typeof newValue === 'string') {
        // Whitespace-only changes
        if (oldValue.trim() === newValue.trim()) {
          return true;
        }
        
        // HTML/formatting changes that don't affect content
        const oldText = oldValue.replace(/<[^>]*>/g, '').trim();
        const newText = newValue.replace(/<[^>]*>/g, '').trim();
        if (oldText === newText) {
          return true; // This would be true in real implementation
        }
      }

      // Numeric version changes (minor increments)
      if (/^\d+\.\d+\.\d+$/.test(oldValue) && /^\d+\.\d+\.\d+$/.test(newValue)) {
        return this.isMinorVersionChange(oldValue, newValue);
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to check if auto-resolvable:', error);
      return false;
    }
  }

  /**
   * Generate resolution suggestion
   */
  private generateResolution(oldValue: any, newValue: any): string {
    try {
      if (typeof oldValue === 'string' && typeof newValue === 'string') {
        if (oldValue.trim() === newValue.trim()) {
          return 'Trim whitespace difference';
        }
        
        const oldText = oldValue.replace(/<[^>]*>/g, '').trim();
        const newText = newValue.replace(/<[^>]*>/g, '').trim();
        if (oldText === newText) {
          return 'Update formatting to match target';
        }
      }

      if (/^\d+\.\d+\.\d+$/.test(oldValue) && /^\d+\.\d+\.\d+$/.test(newValue)) {
        return 'Update to newer version';
      }

      return 'Manual review required';
    } catch (error) {
      this.logger.error('Failed to generate resolution:', error);
      return 'Manual review required';
    }
  }

  /**
   * Check if version change is minor
   */
  private isMinorVersionChange(oldVersion: string, newVersion: string): boolean {
    try {
      const oldParts = oldVersion.split('.').map(Number);
      const newParts = newVersion.split('.').map(Number);

      if (oldParts.length === 3 && newParts.length === 3) {
        // Only patch version changed (x.x.Y)
        if (oldParts[0] === newParts[0] && oldParts[1] === newParts[1] && newParts[2] > oldParts[2]) {
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to check minor version change:', error);
      return false;
    }
  }

  /**
   * Generate visual diff representation
   */
  async generateVisualDiff(
    sourceXmlDocumentId: string,
    targetXmlDocumentId: string,
    options: {
      showUnchanged: boolean;
      contextLines: number;
      maxDiffLength: number;
    } = {}
  ): Promise<string> {
    try {
      const { showUnchanged = false, contextLines = 3, maxDiffLength = 1000 } = options;

      // Get source and target XML content
      const sourceDoc = await this.prisma.xmlDocument.findUnique({
        where: { id: sourceXmlDocumentId },
      });

      const targetDoc = await this.prisma.xmlDocument.findUnique({
        where: { id: targetXmlDocumentId },
      });

      if (!sourceDoc || !targetDoc) {
        throw new Error('Source or target XML document not found');
      }

      // Generate line-by-line diff
      const sourceLines = sourceDoc.originalXml.split('\n');
      const targetLines = targetDoc.originalXml.split('\n');

      // Simple diff algorithm (line-by-line comparison)
      let diff = '';
      const maxLines = Math.max(sourceLines.length, targetLines.length);

      for (let i = 0; i < maxLines; i++) {
        const sourceLine = sourceLines[i] || '';
        const targetLine = targetLines[i] || '';

        if (sourceLine === targetLine) {
          if (showUnchanged) {
            diff += `  ${sourceLine}\n`; // Unchanged line
          }
        } else {
          // Changed line
          if (sourceLine) {
            diff += `- ${sourceLine}\n`; // Removed line
          }
          if (targetLine) {
            diff += `+ ${targetLine}\n`; // Added line
          }
        }

        // Limit output length
        if (diff.length > maxDiffLength) {
          diff += `\n... (truncated)\n`;
          break;
        }
      }

      return diff;
    } catch (error) {
      this.logger.error('Failed to generate visual diff:', error);
      throw error;
    }
  }

  /**
   * Get diff by ID
   */
  async getDiff(id: string): Promise<XmlDiff | null> {
    try {
      return await this.prisma.xmlDiff.findUnique({
        where: { id },
        include: {
          sourceXmlDocument: true,
          targetXmlDocument: true,
          createdUser: true,
        },
      });
    } catch (error) {
      this.logger.error('Failed to get diff:', error);
      throw error;
    }
  }

  /**
   * Get diffs for XML document
   */
  async getDiffsForDocument(xmlDocumentId: string): Promise<XmlDiff[]> {
    try {
      return await this.prisma.xmlDiff.findMany({
        where: {
          OR: [
            { sourceXmlDocumentId: xmlDocumentId },
            { targetXmlDocumentId: xmlDocumentId },
          ],
        },
        orderBy: { createdAt: 'desc' },
        include: {
          sourceXmlDocument: true,
          targetXmlDocument: true,
          createdUser: true,
        },
      });
    } catch (error) {
      this.logger.error('Failed to get diffs for document:', error);
      throw error;
    }
  }

  /**
   * Delete diff
   */
  async deleteDiff(id: string): Promise<void> {
    try {
      await this.prisma.xmlDiff.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error('Failed to delete diff:', error);
      throw error;
    }
  }

  /**
   * Auto-resolve differences that can be automatically resolved
   */
  async autoResolveDifferences(
    xmlDocumentId: string,
    userId: string
  ): Promise<{ resolvedCount: number; failedCount: number }> {
    try {
      // Find diffs that can be auto-resolved
      const diffs = await this.prisma.xmlDiff.findMany({
        where: { targetXmlDocumentId: xmlDocumentId },
        include: { differences: true },
      });

      let resolvedCount = 0;
      let failedCount = 0;

      for (const diff of diffs) {
        try {
          const autoResolvableDifferences = (diff.differences as any[]).filter(d => d.autoResolvable);
          
          if (autoResolvableDifferences.length > 0) {
            // Apply resolutions
            await this.applyAutoResolutions(xmlDocumentId, autoResolvableDifferences);
            resolvedCount += autoResolvableDifferences.length;
          }
        } catch (error) {
          this.logger.error('Failed to auto-resolve diff:', error);
          failedCount++;
        }
      }

      return { resolvedCount, failedCount };
    } catch (error) {
      this.logger.error('Failed to auto-resolve differences:', error);
      throw error;
    }
  }

  /**
   * Apply auto-resolutions to XML document
   */
  private async applyAutoResolutions(
    xmlDocumentId: string,
    differences: any[]
  ): Promise<void> {
    try {
      // Get XML document
      const xmlDoc = await this.prisma.xmlDocument.findUnique({
        where: { id: xmlDocumentId },
      });

      if (!xmlDoc) {
        throw new Error('XML document not found');
      }

      let xmlContent = xmlDoc.originalXml;

      // Apply each resolution
      for (const diff of differences) {
        if (diff.resolution === 'Update to newer version') {
          // Update version in XML content
          xmlContent = xmlContent.replace(
            /(<version[^>]*>)(.*?)(<\/version>)/,
            `$1${diff.newValue}$3`
          );
        }
        // Add more resolution types as needed
      }

      // Update XML document with resolved content
      await this.prisma.xmlDocument.update({
        where: { id: xmlDocumentId },
        data: {
          originalXml: xmlContent,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Failed to apply auto-resolutions:', error);
      throw error;
    }
  }

  /**
   * Generate diff statistics
   */
  async generateDiffStatistics(organizationId: string): Promise<any> {
    try {
      const recentDiffs = await this.prisma.xmlDiff.findMany({
        where: {
          sourceXmlDocument: { organizationId },
        },
        include: { summary: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      const stats = {
        totalDiffs: recentDiffs.length,
        avgChanges: 0,
        criticalChangesCount: 0,
        autoResolvableCount: 0,
        diffTypes: {} as Record<string, number>,
        recentTrend: [] as any[],
      };

      if (recentDiffs.length > 0) {
        // Calculate averages
        const totalChanges = recentDiffs.reduce((sum, diff) => {
          const summary = diff.summary as any;
          return sum + (summary.totalChanges || 0);
        }, 0);

        stats.avgChanges = totalChanges / recentDiffs.length;
        stats.criticalChangesCount = recentDiffs.reduce((sum, diff) => {
          const summary = diff.summary as any;
          return sum + (summary.criticalChanges || 0);
        }, 0);

        // Count diff types
        recentDiffs.forEach(diff => {
          stats.diffTypes[diff.diffType] = (stats.diffTypes[diff.diffType] || 0) + 1;
        });

        // Generate recent trend (last 7 days)
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);

        const recentDiffsWeek = recentDiffs.filter(diff => 
          new Date(diff.createdAt) >= lastWeek
        );

        stats.recentTrend = recentDiffsWeek.map(diff => ({
          date: new Date(diff.createdAt).toISOString().split('T')[0],
          changes: (diff.summary as any)?.totalChanges || 0,
        }));
      }

      return stats;
    } catch (error) {
      this.logger.error('Failed to generate diff statistics:', error);
      throw error;
    }
  }
}
