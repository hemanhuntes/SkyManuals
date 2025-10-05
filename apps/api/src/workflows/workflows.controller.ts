import {
  Controller,
  Get,
  Post,
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
import { WorkflowsService } from './workflows.service';
import {
  WorkflowDefinition,
  WorkflowInstance,
  CreateWorkflowInstanceDto,
} from '@skymanuals/types';
import { CreateWorkflowInstanceDtoSchema } from '@skymanuals/types';

// Mock auth guard for now - will be replaced with real auth
@UseGuards()
class MockAuthGuard {}

@ApiTags('Workflows')
@Controller('workflows')
@UseGuards(MockAuthGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get('definitions')
  @ApiOperation({ summary: 'Get all workflow definitions for organization' })
  @ApiResponse({
    status: 200,
    description: 'Workflow definitions retrieved successfully',
    type: [WorkflowDefinition],
  })
  async findAllWorkflowDefinitions(
    @Query('organizationId') organizationId: string,
  ): Promise<WorkflowDefinition[]> {
    return this.workflowsService.findAllWorkflowDefinitions(organizationId);
  }

  @Get('definitions/:definitionId')
  @ApiOperation({ summary: 'Get workflow definition by ID' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Workflow definition found',
    type: WorkflowDefinition,
  })
  @ApiResponse({
    status: 404,
    description: 'Workflow definition not found',
  })
  async findOneWorkflowDefinition(
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Query('organizationId') organizationId: string,
  ): Promise<WorkflowDefinition> {
    return this.workflowsService.findOneWorkflowDefinition(organizationId, definitionId);
  }

  @Post('instances')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new workflow instance' })
  @ApiResponse({
    status: 201,
    description: 'Workflow instance created successfully',
    type: WorkflowInstance,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid workflow definition or entity',
  })
  async createWorkflowInstance(
    @Body() createWorkflowInstanceDto: CreateWorkflowInstanceDto,
    @Query('organizationId') organizationId: string,
    @Request() req: any, // Mock request - will be real user context later
  ): Promise<WorkflowInstance> {
    const userId = req.user?.id || 'mock-user-id'; // Mock user ID
    return this.workflowsService.createWorkflowInstance(
      userId,
      organizationId,
      createWorkflowInstanceDto,
    );
  }

  @Get('instances')
  @ApiOperation({ summary: 'Get all workflow instances for organization' })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'SUSPENDED', 'CANCELLED', 'COMPLETED'] })
  @ApiResponse({
    status: 200,
    description: 'Workflow instances retrieved successfully',
    type: [WorkflowInstance],
  })
  async findAllWorkflowInstances(
    @Query('organizationId') organizationId: string,
    @Query('status') status?: string,
  ): Promise<WorkflowInstance[]> {
    return this.workflowsService.findAllWorkflowInstances(organizationId, status as any);
  }

  @Get('instances/:instanceId')
  @ApiOperation({ summary: 'Get workflow instance by ID' })
  @ApiParam({ name: 'instanceId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Workflow instance found',
    type: WorkflowInstance,
  })
  @ApiResponse({
    status: 404,
    description: 'Workflow instance not found',
  })
  async findOneWorkflowInstance(
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
    @Query('organizationId') organizationId: string,
  ): Promise<WorkflowInstance> {
    return this.workflowsService.findOneWorkflowInstance(organizationId, instanceId);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get workflow analytics and metrics' })
  @ApiQuery({ name: 'organizationId', required: true, type: 'string' })
  @ApiQuery({ name: 'startDate', required: true, type: 'string', format: 'date' })
  @ApiQuery({ name: 'endDate', required: true, type: 'string', format: 'date' })
  @ApiResponse({
    status: 200,
    description: 'Workflow metrics retrieved successfully',
  })
  async getWorkflowMetrics(
    @Query('organizationId') organizationId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return this.workflowsService.getWorkflowMetrics(organizationId, start, end);
  }
}






