import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as puppeteer from 'puppeteer';
import * as diff from 'diff';

export interface ExportOptions {
  format: 'pdf' | 'html';
  includeAnnotations?: boolean;
  includeMetadata?: boolean;
  pageSize?: 'A4' | 'Letter';
  margin?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
}

export interface VersionComparison {
  changes: diff.Change[];
  summary: {
    added: number;
    removed: number;
    unchanged: number;
  };
  affectedChapters: string[];
}

@Injectable()
export class ManualExportService {
  private readonly logger = new Logger(ManualExportService.name);

  constructor(private prisma: PrismaService) {}

  async exportToPDF(manualId: string, options: ExportOptions = {}): Promise<Buffer> {
    this.logger.log(`Exporting manual ${manualId} to PDF`);

    try {
      const manual = await this.getManualWithContent(manualId);
      
      // Use puppeteer for PDF generation
      const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      
      // Render HTML
      const html = this.renderManualHTML(manual, options);
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      // Generate PDF
      const pdf = await page.pdf({
        format: options.pageSize || 'A4',
        printBackground: true,
        margin: options.margin || { 
          top: '20mm', 
          right: '20mm', 
          bottom: '20mm', 
          left: '20mm' 
        }
      });
      
      await browser.close();
      
      this.logger.log(`Successfully exported manual ${manualId} to PDF`);
      return pdf;
    } catch (error) {
      this.logger.error(`Failed to export manual ${manualId} to PDF:`, error);
      throw new Error(`PDF export failed: ${error.message}`);
    }
  }

  async exportToHTML(manualId: string, options: ExportOptions = {}): Promise<string> {
    this.logger.log(`Exporting manual ${manualId} to HTML`);

    try {
      const manual = await this.getManualWithContent(manualId);
      return this.renderManualHTML(manual, options);
    } catch (error) {
      this.logger.error(`Failed to export manual ${manualId} to HTML:`, error);
      throw new Error(`HTML export failed: ${error.message}`);
    }
  }

  async compareVersions(manualId: string, v1: string, v2: string): Promise<VersionComparison> {
    this.logger.log(`Comparing versions ${v1} and ${v2} for manual ${manualId}`);

    try {
      const version1 = await this.getVersion(manualId, v1);
      const version2 = await this.getVersion(manualId, v2);
      
      // Generate structured content for comparison
      const content1 = this.generateStructuredContent(version1);
      const content2 = this.generateStructuredContent(version2);
      
      // Perform diff
      const changes = diff.diffLines(content1, content2);
      
      // Generate summary
      const summary = {
        added: changes.filter(c => c.added).reduce((sum, c) => sum + c.count, 0),
        removed: changes.filter(c => c.removed).reduce((sum, c) => sum + c.count, 0),
        unchanged: changes.filter(c => !c.added && !c.removed).reduce((sum, c) => sum + c.count, 0)
      };
      
      // Identify affected chapters
      const affectedChapters = this.identifyAffectedChapters(changes);
      
      return {
        changes: changes.filter(c => c.added || c.removed),
        summary,
        affectedChapters
      };
    } catch (error) {
      this.logger.error(`Failed to compare versions for manual ${manualId}:`, error);
      throw new Error(`Version comparison failed: ${error.message}`);
    }
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
        organization: true
      }
    });
  }

  private async getVersion(manualId: string, version: string): Promise<any> {
    // Get manual with specific version
    const manual = await this.prisma.manual.findUnique({
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
        }
      }
    });

    if (!manual) {
      throw new Error(`Manual ${manualId} not found`);
    }

    // For now, return current version
    // In production, this would fetch from version history
    return manual;
  }

  private renderManualHTML(manual: any, options: ExportOptions): string {
    const { includeAnnotations = false, includeMetadata = true } = options;
    
    const chaptersHTML = manual.chapters.map(chapter => `
      <div class="chapter">
        <h1>Chapter ${chapter.number}: ${chapter.title}</h1>
        ${chapter.sections.map(section => `
          <div class="section">
            <h2>${section.number} ${section.title}</h2>
            ${section.blocks.map(block => `
              <div class="block block-${block.type.toLowerCase()}">
                ${this.renderBlockContent(block)}
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${manual.title}</title>
          <style>
            ${this.getExportStyles()}
          </style>
        </head>
        <body>
          ${includeMetadata ? this.renderMetadata(manual) : ''}
          <div class="manual-content">
            <h1 class="manual-title">${manual.title}</h1>
            ${chaptersHTML}
          </div>
        </body>
      </html>
    `;
  }

  private renderBlockContent(block: any): string {
    switch (block.type) {
      case 'PROCEDURE':
        return `<div class="procedure">${this.formatProcedure(block.content)}</div>`;
      case 'LIST':
        return `<div class="list">${this.formatList(block.content)}</div>`;
      case 'TABLE':
        return `<div class="table">${this.formatTable(block.content)}</div>`;
      case 'IMAGE':
        return `<div class="image-reference">${block.content}</div>`;
      default:
        return `<div class="text">${this.formatText(block.content)}</div>`;
    }
  }

  private formatProcedure(content: string): string {
    // Format procedure steps
    const lines = content.split('\n');
    return lines.map(line => {
      if (line.match(/^\d+\./)) {
        return `<div class="step">${line}</div>`;
      }
      return `<div class="procedure-text">${line}</div>`;
    }).join('');
  }

  private formatList(content: string): string {
    // Format lists
    const lines = content.split('\n');
    return lines.map(line => {
      if (line.match(/^\d+\./) || line.match(/^[•\-\*]/)) {
        return `<div class="list-item">${line}</div>`;
      }
      return `<div class="list-text">${line}</div>`;
    }).join('');
  }

  private formatTable(content: string): string {
    // Basic table formatting
    const lines = content.split('\n');
    const rows = lines.map(line => {
      const cells = line.split(/\s{2,}|\t/);
      return `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
    }).join('');
    
    return `<table class="data-table">${rows}</table>`;
  }

  private formatText(content: string): string {
    // Basic text formatting
    return content.replace(/\n/g, '<br>');
  }

  private renderMetadata(manual: any): string {
    return `
      <div class="metadata">
        <h2>Document Information</h2>
        <table class="metadata-table">
          <tr><td>Title:</td><td>${manual.title}</td></tr>
          <tr><td>Organization:</td><td>${manual.organization?.name || 'N/A'}</td></tr>
          <tr><td>Version:</td><td>${manual.version}</td></tr>
          <tr><td>Status:</td><td>${manual.status}</td></tr>
          <tr><td>Created:</td><td>${new Date(manual.createdAt).toLocaleDateString()}</td></tr>
          <tr><td>Last Updated:</td><td>${new Date(manual.updatedAt).toLocaleDateString()}</td></tr>
        </table>
      </div>
    `;
  }

  private getExportStyles(): string {
    return `
      body {
        font-family: 'Times New Roman', serif;
        font-size: 12pt;
        line-height: 1.4;
        color: #000;
        margin: 0;
        padding: 0;
      }
      
      .manual-title {
        text-align: center;
        font-size: 18pt;
        font-weight: bold;
        margin-bottom: 30px;
        border-bottom: 2px solid #000;
        padding-bottom: 10px;
      }
      
      .chapter {
        page-break-before: always;
        margin-bottom: 30px;
      }
      
      .chapter h1 {
        font-size: 16pt;
        font-weight: bold;
        margin-bottom: 20px;
        color: #333;
      }
      
      .section {
        margin-bottom: 20px;
      }
      
      .section h2 {
        font-size: 14pt;
        font-weight: bold;
        margin-bottom: 15px;
        color: #555;
      }
      
      .block {
        margin-bottom: 10px;
        padding: 5px;
      }
      
      .block-procedure {
        background-color: #f9f9f9;
        border-left: 3px solid #007acc;
        padding-left: 15px;
      }
      
      .step {
        font-weight: bold;
        margin-bottom: 5px;
      }
      
      .block-list {
        background-color: #f5f5f5;
        padding: 10px;
      }
      
      .list-item {
        margin-bottom: 3px;
      }
      
      .block-table {
        margin: 10px 0;
      }
      
      .data-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #ccc;
      }
      
      .data-table td {
        border: 1px solid #ccc;
        padding: 5px;
      }
      
      .block-image {
        text-align: center;
        font-style: italic;
        color: #666;
      }
      
      .metadata {
        page-break-after: always;
        margin-bottom: 30px;
      }
      
      .metadata h2 {
        font-size: 14pt;
        font-weight: bold;
        margin-bottom: 15px;
      }
      
      .metadata-table {
        width: 100%;
        border-collapse: collapse;
      }
      
      .metadata-table td {
        padding: 3px 10px;
        border-bottom: 1px solid #eee;
      }
      
      .metadata-table td:first-child {
        font-weight: bold;
        width: 30%;
      }
      
      @media print {
        .chapter {
          page-break-before: always;
        }
        
        .section {
          page-break-inside: avoid;
        }
      }
    `;
  }

  private generateStructuredContent(manual: any): string {
    // Generate structured content for comparison
    const chapters = manual.chapters.map(chapter => {
      const sections = chapter.sections.map(section => {
        const blocks = section.blocks.map(block => 
          `${block.type}: ${block.content}`
        ).join('\n');
        return `Section ${section.number}: ${section.title}\n${blocks}`;
      }).join('\n');
      return `Chapter ${chapter.number}: ${chapter.title}\n${sections}`;
    }).join('\n');
    
    return chapters;
  }

  private identifyAffectedChapters(changes: diff.Change[]): string[] {
    const affectedChapters = new Set<string>();
    
    changes.forEach(change => {
      if (change.added || change.removed) {
        const lines = change.value.split('\n');
        lines.forEach(line => {
          const chapterMatch = line.match(/^Chapter (\d+):/);
          if (chapterMatch) {
            affectedChapters.add(chapterMatch[1]);
          }
        });
      }
    });
    
    return Array.from(affectedChapters);
  }
}
