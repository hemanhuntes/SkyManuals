import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  WorkflowDefinition,
  WorkflowInstance,
  CreateWorkflowInstanceDto,
  WorkflowDefinitionSchema,
  WorkflowInstanceSchema,
  TaskStatus,
  WorkflowInstanceStatus,
} from '@skymanuals/types';
import { CreateWorkflowInstanceDtoSchema } from '@skymanuals/types';
import { z } from 'zod';

@Injectable()
export class WorkflowsService {
  constructor(private prisma: PrismaService) {}

  // Workflow Definition Management
  async createWorkflowDefinition(data: {
    organizationId: string;
    name: string;
    description?: string;
    entityType: 'manual' | 'chapter' | 'section';
    stages: any[];
  }): Promise<WorkflowDefinition> {
    const workflowDef = await this.prisma.workflowDefinition.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        description: data.description,
        entityType: data.entityType.toUpperCase() as any,
        stages: data.stages,
      },
    });

    return WorkflowDefinitionSchema.parse(workflowDef);
  }

  async findAllWorkflowDefinitions(organizationId: string): Promise<WorkflowDefinition[]> {
    const definitions = await this.prisma.workflowDefinition.findMany({
      where: { 
        organizationId,
        isActive: true,
      },
    });

    return z.array(WorkflowDefinitionSchema).parse(definitions);
  }

  async findOneWorkflowDefinition(
    organizationId: string,
    definitionId: string,
  ): Promise<WorkflowDefinition> {
    const definition = await this.prisma.workflowDefinition.findFirst({
      where: { 
        id: definitionId,
        organizationId,
      },
    });

    if (!definition) {
      throw new NotFoundException(`Workflow definition with ID ${definitionId} not found`);
    }

    return WorkflowDefinitionSchema.parse(definition);
  }

  // Workflow Instance Management
  async createWorkflowInstance(
    userId: string,
    organizationId: string,
    data: z.infer<typeof CreateWorkflowInstanceDtoSchema>,
  ): Promise<WorkflowInstance> {
    // Verify workflow definition exists
    const workflowDef = await this.prisma.workflowDefinition.findFirst({
      where: {
        id: data.workflowDefinitionId,
        organizationId,
        isActive: true,
      },
    });

    if (!workflowDef) {
      throw new NotFoundException('Workflow definition not found or inactive');
    }

    const workflowInstance = await this.prisma.workflowInstance.create({
      data: {
        workflowDefinitionId: data.workflowDefinitionId,
        entityType: data.entityType.toUpperCase() as any,
        entityId: data.entityId,
        title: data.title,
        description: data.description,
        initiatedByUserId: userId,
        priority: data.priority || 'MEDIUM',
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        status: data.scheduledAt ? 'DRAFT' : 'IN_PROGRESS',
      },
      include: {
        workflowDefinition: true,
        initiatedBy: true,
      },
    });

    return WorkflowInstanceSchema.parse(workflowInstance);
  }

  async findAllWorkflowInstances(
    organizationId: string,
    status?: WorkflowInstanceStatus,
  ): Promise<WorkflowInstance[]> {
    const workflowInstances = await this.prisma.workflowInstance.findMany({
      where: {
        workflowDefinition: { organizationId },
        ...(status && { status }),
      },
      include: {
        workflowDefinition: true,
        initiatedBy: true,
        tasks: {
          include: {
            assignedTo: true,
            completedBy: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return z.array(WorkflowInstanceSchema).parse(workflowInstances);
  }

  async findOneWorkflowInstance(
    organizationId: string,
    instanceId: string,
  ): Promise<WorkflowInstance> {
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { 
        id: instanceId,
        workflowDefinition: { organizationId },
      },
      include: {
        workflowDefinition: true,
        initiatedBy: true,
        tasks: {
          include: {
            assignedTo: true,
            completedBy: true,
            comments: true,
          },
        },
        checklists: true,
      },
    });

    if (!instance) {
      throw new NotFoundException(`Workflow instance with ID ${instanceId} not found`);
    }

    return WorkflowInstanceSchema.parse(instance);
  }

  // Workflow Analytics
  async getWorkflowMetrics(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const instances = await this.prisma.workflowInstance.findMany({
      where: {
        workflowDefinition: { organizationId },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { tasks: true },
    });

    const totalInstances = instances.length;
    const completedInstances = instances.filter(i => ['APPROVED', 'COMPLETED'].includes(i.status)).length;
    
    return {
      totalInstances,
      completedInstances,
      timeRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }
}
