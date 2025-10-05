import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
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
  ApiQuery,
} from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { ApprovalTask, ApproveTaskDto, RejectTaskDto } from '@skymanuals/types';

// Mock auth guard for now
@UseGuards()
class MockAuthGuard {}

@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(MockAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'Get all tasks assigned to current user' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED', 'DELEGATED', 'SUSPENDED', 'COMPLETED'] })
  @ApiResponse({
    status: 200,
    description: 'Tasks retrieved successfully',
    type: [ApprovalTask],
  })
  async findAllTasksForUser(
    @Query('status') status?: string,
    @Request() req: any,
  ): Promise<ApprovalTask[]> {
    const userId = req.user?.id || 'mock-user-id';
    return this.tasksService.findAllTasksForUser(userId, status as any);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get task summary for current user' })
  @ApiResponse({
    status: 200,
    description: 'Task summary retrieved successfully',
  })
  async getTaskSummary(@Request() req: any) {
    const userId = req.user?.id || 'mock-user-id';
    return this.tasksService.getTaskSummary(userId);
  }

  @Get(':taskId')
  @ApiOperation({ summary: 'Get task by ID' })
  @ApiParam({ name: 'taskId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Task found',
    type: ApprovalTask,
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
  })
  async findOneTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Request() req: any,
  ): Promise<ApprovalTask> {
    const userId = req.user?.id || 'mock-user-id';
    return this.tasksService.findOneTask(taskId, userId);
  }

  @Patch(':taskId/approve')
  @ApiOperation({ summary: 'Approve a task' })
  @ApiParam({ name: 'taskId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Task approved successfully',
    type: ApprovalTask,
  })
  @ApiResponse({
    status: 400,
    description: 'Task cannot be approved',
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
  })
  async approveTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() approveTaskDto: ApproveTaskDto,
    @Request() req: any,
  ): Promise<ApprovalTask> {
    const userId = req.user?.id || 'mock-user-id';
    return this.tasksService.approveTask(taskId, userId, approveTaskDto);
  }

  @Patch(':taskId/reject')
  @ApiOperation({ summary: 'Reject a task' })
  @ApiParam({ name: 'taskId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Task rejected successfully',
    type: ApprovalTask,
  })
  @ApiResponse({
    status: 400,
    description: 'Task cannot be rejected',
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
  })
  async rejectTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() rejectTaskDto: RejectTaskDto,
    @Request() req: any,
  ): Promise<ApprovalTask> {
    const userId = req.user?.id || 'mock-user-id';
    return this.tasksService.rejectTask(taskId, userId, rejectTaskDto);
  }

  @Patch(':taskId/delegate')
  @ApiOperation({ summary: 'Delegate a task to another user' })
  @ApiParam({ name: 'taskId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Task delegated successfully',
    type: ApprovalTask,
  })
  @ApiResponse({
    status: 400,
    description: 'Task cannot be delegated',
  })
  @ApiResponse({
    status: 404,
    description: 'Task or delegate user not found',
  })
  async delegateTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() delegateDto: { userId: string; note?: string },
    @Request() req: any,
  ): Promise<ApprovalTask> {
    const currentUserId = req.user?.id || 'mock-user-id';
    return this.tasksService.delegateTask(
      taskId,
      currentUserId,
      delegateDto.userId,
      delegateDto.note,
    );
  }
}






