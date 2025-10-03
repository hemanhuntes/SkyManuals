import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Comment,
  CommentSchema,
} from '@skymanuals/types';
import { z } from 'zod';

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService) {}

  async findAllCommentsForTask(taskId: string): Promise<Comment[]> {
    const comments = await this.prisma.comment.findMany({
      where: { taskId },
      include: {
        user: true,
        replies: {
          include: {
            user: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return z.array(CommentSchema).parse(comments);
  }

  async createComment(
    taskId: string,
    userId: string,
    content: string,
    type: 'general' | 'approval_reason' | 'rejection_reason' | 'delegation_note' = 'general',
    parentCommentId?: string,
    attachments: string[] = [],
    mentionedUserIds: string[] = [],
  ): Promise<Comment> {
    // Verify task exists
    const task = await this.prisma.approvalTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const comment = await this.prisma.comment.create({
      data: {
        taskId,
        userId,
        content,
        type: type.toUpperCase() as any,
        parentCommentId,
        attachments,
        mentionedUserIds,
      },
      include: {
        user: true,
        parentComment: true,
        replies: {
          include: {
            user: true,
          },
        },
      },
    });

    // Update task comment count
    await this.prisma.approvalTask.update({
      where: { id: taskId },
      data: {
        commentsCount: {
          increment: 1,
        },
      },
    });

    return CommentSchema.parse(comment);
  }

  async findOneComment(commentId: string): Promise<Comment> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        user: true,
        task: true,
        parentComment: true,
        replies: {
          include: {
            user: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!comment) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    return CommentSchema.parse(comment);
  }

  async resolveComment(commentId: string, userId: string): Promise<Comment> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    const updatedComment = await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        isResolved: !comment.isResolved,
      },
      include: {
        user: true,
        task: true,
        parentComment: true,
        replies: {
          include: {
            user: true,
          },
        },
      },
    });

    return CommentSchema.parse(updatedComment);
  }
}
