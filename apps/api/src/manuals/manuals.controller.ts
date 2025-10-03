import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
  ApiBody,
} from '@nestjs/swagger';
import { ManualsService } from './manuals.service';
import {
  Manual,
  Chapter,
  Section,
  Block,
  ChangeSet,
  Version,
  TipTapDocument,
  ManualSchema,
  ChangeSetSchema,
} from '@skymanuals/types';

@ApiTags('manuals')
@Controller('api/manuals')
export class ManualsController {
  constructor(private readonly manualsService: ManualsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new manual' })
  @ApiBody({ schema: { properties: { title: { type: 'string' } } } })
  @ApiResponse({ status: 201, description: 'Manual created successfully' })
  async createManual(
    @Body() body: { title: string; organizationId: string },
    @Headers('x-user-id') userId: string,
  ): Promise<{ manual: Manual; changeSet: ChangeSet; etag: string }> {
    const { manual, changeSet } = await this.manualsService.createManual(
      body.organizationId,
      body.title,
      userId,
    );

    return {
      manual: ManualSchema.parse(manual),
      changeSet: ChangeSetSchema.parse(changeSet),
      etag: changeSet.id, // Using changeSet ID as ETag for simplicity
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get manual by ID' })
  @ApiParam({ name: 'id', description: 'Manual ID' })
  @ApiResponse({ status: 200, description: 'Manual retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Manual not found' })
  async getManual(@Param('id') manualId: string): Promise<{ manual: Manual; etag: string }> {
    const manual = await this.manualsService.getManual(manualId);
    
    return {
      manual: ManualSchema.parse(manual),
      etag: manual.id, // Using manual ID as ETag
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update manual' })
  @ApiParam({ name: 'id', description: 'Manual ID' })
  @ApiHeader({ 
    name: 'If-Match', 
    description: 'ETag for optimistic locking', 
    required: false 
  })
  @ApiBody({ 
    schema: { 
      type: 'object',
      properties: {
        title: { type: 'string' },
        status: { type: 'string', enum: ['DRAFT', 'RELEASED'] }
      }
    } 
  })
  @ApiResponse({ status: 200, description: 'Manual updated successfully' })
  @ApiResponse({ status: 409, description: 'Concurrent modification conflict' })
  async updateManual(
    @Param('id') manualId: string,
    @Body() updates: { title?: string; status?: string },
    @Headers('x-user-id') userId: string,
    @Headers('if-match') ifMatch: string,
  ): Promise<{ manual: Manual; changeSet: ChangeSet; etag: string }> {
    const { manual, changeSet } = await this.manualsService.updateManual(
      manualId,
      updates as any,
      userId,
      ifMatch,
    );

    return {
      manual: ManualSchema.parse(manual),
      changeSet: ChangeSetSchema.parse(changeSet),
      etag: changeSet.id,
    };
  }

  // Chapter endpoints
  @Post(':manualId/chapters')
  @ApiOperation({ summary: 'Create a new chapter' })
  @ApiParam({ name: 'manualId', description: 'Manual ID' })
  @ApiBody({ 
    schema: { 
      properties: {
        title: { type: 'string' },
        number: { type: 'string' }
      } 
    } 
  })
  async createChapter(
    @Param('manualId') manualId: string,
    @Body() body: { title: string; number: string },
    @Headers('x-user-id') userId: string,
  ): Promise<{ chapter: Chapter; changeSet: ChangeSet }> {
    const { chapter, changeSet } = await this.manualsService.createChapter(
      manualId,
      body.title,
      body.number,
      userId,
    );

    return { chapter, changeSet };
  }

  // Section endpoints
  @Post(':manualId/chapters/:chapterId/sections')
  @ApiOperation({ summary: 'Create a new section' })
  @ApiParam({ name: 'chapterId', description: 'Chapter ID' })
  @ApiBody({ 
    schema: { 
      properties: {
        title: { type: 'string' },
        number: { type: 'string' }
      } 
    } 
  })
  async createSection(
    @Param('chapterId') chapterId: string,
    @Body() body: { title: string; number: string },
    @Headers('x-user-id') userId: string,
  ): Promise<{ section: Section; changeSet: ChangeSet }> {
    const { section, changeSet } = await this.manualsService.createSection(
      chapterId,
      body.title,
      body.number,
      userId,
    );

    return { section, changeSet };
  }

  // Block endpoints
  @Patch('blocks/:blockId/content')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update block content with TipTap format' })
  @ApiParam({ name: 'blockId', description: 'Block ID' })
  @ApiHeader({ 
    name: 'If-Match', 
    description: 'ETag for optimistic locking', 
    required: false 
  })
  @ApiBody({ 
    schema: { 
      type: 'object',
      properties: {
        content: { 
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['doc'] },
            content: { type: 'array' }
          }
        }
      }
    } 
  })
  @ApiResponse({ status: 200, description: 'Block content updated successfully' })
  @ApiResponse({ status: 409, description: 'Concurrent modification conflict' })
  async updateBlockContent(
    @Param('blockId') blockId: string,
    @Body() body: { content: TipTapDocument },
    @Headers('x-user-id') userId: string,
    @Headers('if-match') ifMatch: string,
  ): Promise<{ block: Block; changeSet: ChangeSet; version: Version; etag: string }> {
    const { block, changeSet, version } = await this.manualsService.updateBlockContent(
      blockId,
      body.content,
      userId,
      ifMatch,
    );

    return {
      block,
      changeSet,
      version,
      etag: version.etag,
    };
  }

  @Post('sections/:sectionId/blocks/smart')
  @ApiOperation({ summary: 'Insert a smart block' })
  @ApiParam({ name: 'sectionId', description: 'Section ID' })
  @ApiBody({ 
    schema: { 
      properties: {
        smartBlockType: { type: 'string', enum: ['LEP', 'MEL', 'ChangeLog', 'RevisionBar', 'CrossRef'] },
        position: { type: 'number' }
      } 
    } 
  })
  async insertSmartBlock(
    @Param('sectionId') sectionId: string,
    @Body() body: { smartBlockType: string; position: number },
    @Headers('x-user-id') userId: string,
  ): Promise<{ block: Block; changeSet: ChangeSet }> {
    const { block, changeSet } = await this.manualsService.insertSmartBlock(
      sectionId,
      body.smartBlockType,
      body.position,
      userId,
    );

    return { block, changeSet };
  }

  // ChangeSet endpoints
  @Get('changesets/:changeSetId')
  @ApiOperation({ summary: 'Get change set by ID' })
  @ApiParam({ name: 'changeSetId', description: 'ChangeSet ID' })
  async getChangeSet(@Param('changeSetId') changeSetId: string): Promise<ChangeSet> {
    return this.manualsService.getChangeSet(changeSetId);
  }

  @Post('changesets/:changeSetId/approve')
  @ApiOperation({ summary: 'Approve a change set' })
  @ApiParam({ name: 'changeSetId', description: 'ChangeSet ID' })
  @ApiResponse({ status: 200, description: 'Change set approved successfully' })
  async approveChangeSet(@Param('changeSetId') changeSetId: string): Promise<ChangeSet> {
    return this.manualsService.approveChangeSet(changeSetId);
  }

  @Post('changesets/:changeSetId/reject')
  @ApiOperation({ summary: 'Reject a change set' })
  @ApiParam({ name: 'changeSetId', description: 'ChangeSet ID' })
  @ApiResponse({ status: 200, description: 'Change set rejected successfully' })
  async rejectChangeSet(@Param('changeSetId') changeSetId: string): Promise<ChangeSet> {
    return this.manualsService.rejectChangeSet(changeSetId);
  }

  @Post('changesets/:changeSetId/merge')
  @ApiOperation({ summary: 'Merge a change set' })
  @ApiParam({ name: 'changeSetId', description: 'ChangeSet ID' })
  @ApiResponse({ status: 200, description: 'Change set merged successfully' })
  async mergeChangeSet(@Param('changeSetId') changeSetId: string): Promise<ChangeSet> {
    return this.manualsService.mergeChangeSet(changeSetId);
  }

  // Export endpoints
  @Get(':id/export/html')
  @ApiOperation({ summary: 'Export manual as HTML' })
  @ApiParam({ name: 'id', description: 'Manual ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'HTML export',
    content: {
      'text/html': {
        schema: { type: 'string' }
      }
    }
  })
  async exportToHtml(@Param('id') manualId: string): Promise<string> {
    return this.manualsService.exportToHtml(manualId);
  }

  @Get(':id/export/pdf')
  @ApiOperation({ summary: 'Export manual as PDF' })
  @ApiParam({ name: 'id', description: 'Manual ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'PDF export',
    content: {
      'application/pdf': {
        schema: { type: 'string', format: 'binary' }
      }
    }
  })
  async exportToPdf(@Param('id') manualId: string): Promise<Buffer> {
    return this.manualsService.exportToPdf(manualId);
  }
}
