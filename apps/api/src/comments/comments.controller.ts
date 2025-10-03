import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { Comment } from '@skymanuals/types';
import { z } from 'zod';

// DTOs
const CreateCommentDtoSchema = z.object({
  content: z.string().min(1),
  type: z.enum(['general', 'approval_reason', 'rejection_reason', 'delegation_note']).default('general'),
  parentCommentId: z.string().optional(),
  attachments: z.array(z.string()).default([]),
  mentionedUserIds: z.array(z.string()).default([]),
});

type CreateCommentDto = z.infer<typeof CreateCommentDtoSchema>;

// Mock auth guard for now
@UseGuards()
class MockAuthGuard {}

@ApiTags('Comments')
@Controller('comments')
@UseGuards(MockAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Get all comments for a task' })
  @ApiParam({ name: 'taskId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Comments retrieved successfully',
    type: [Comment],
  })
  async findAllCommentsForTask(@Param('taskId', ParseUUIDPipe) taskId: string): Promise<Comment[]> {
    return this.commentsService.findAllCommentsForTask(taskId);
  }

  @Post('tasks/:taskId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new comment' })
  @ApiParam({ name: 'taskId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Comment created successfully',
    type: Comment,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid comment data',
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
  })
  async createComment(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() createCommentDto: CreateCommentDto,
    @Request() req: any,
  ): Promise<Comment> {
    const userId = req.user?.id || 'mock-user-id';
    return this.commentsService.createComment(
      taskId,
      userId,
      createCommentDto.content,
      createCommentDto.type,
      createCommentDto.parentCommentId,
      createCommentDto.attachments,
      createCommentDto.mentionedUserIds
    );
  }

  @Get(':commentId')
  @ApiOperation({ summary: 'Get comment by ID' })
  @ApiParam({ name: 'commentId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Comment found',
    type: Comment,
  })
  @ApiResponse({
    status: 404,
    description: 'Comment not found',
  })
  async findOneComment(@Param('commentId', ParseUUIDPipe) commentId: string): Promise<Comment> {
    return this.commentsService.findOneComment(commentId);
  }

  @Patch(':commentId/toggle-resolved')
  @ApiOperation({ summary: 'Toggle comment resolved status' })
  @ApiParam({ name: 'commentId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Comment resolved status updated',
    type: Comment,
  })
  async resolveComment(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Request() req: any,
  ): Promise<Comment> {
    const userId = req.user?.id || 'mock-user-id';
    return this.commentsService.resolveComment(commentId, userId);
  }
}
