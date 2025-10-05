import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

export class TestEnvironment {
  private app: INestApplication;
  private module: TestingModule;
  private prisma: PrismaService;

  async setup(): Promise<void> {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:password@localhost:5432/skymanuals_test';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.OPENAI_API_KEY = 'test-openai-key';

    // Create testing module
    this.module = await Test.createTestingModule({
      imports: [],
      providers: [
        PrismaService,
        ConfigService,
      ],
    }).compile();

    this.app = this.module.createNestApplication();
    this.prisma = this.module.get<PrismaService>(PrismaService);

    await this.app.init();
  }

  async cleanup(): Promise<void> {
    if (this.prisma) {
      // Clean up test data
      await this.cleanupDatabase();
      await this.prisma.$disconnect();
    }
    
    if (this.app) {
      await this.app.close();
    }
  }

  private async cleanupDatabase(): Promise<void> {
    // Delete all test data in reverse order of dependencies
    await this.prisma.searchAnalytics.deleteMany();
    await this.prisma.approvalTask.deleteMany();
    await this.prisma.workflowTransitionLog.deleteMany();
    await this.prisma.workflowInstance.deleteMany();
    await this.prisma.workflowStage.deleteMany();
    await this.prisma.workflowDefinition.deleteMany();
    await this.prisma.complianceLink.deleteMany();
    await this.prisma.complianceAlert.deleteMany();
    await this.prisma.regulation.deleteMany();
    await this.prisma.auditLog.deleteMany();
    await this.prisma.deviceSession.deleteMany();
    await this.prisma.device.deleteMany();
    await this.prisma.offlineCache.deleteMany();
    await this.prisma.cacheChunk.deleteMany();
    await this.prisma.readerBundle.deleteMany();
    await this.prisma.readerSession.deleteMany();
    await this.prisma.releaseSnapshot.deleteMany();
    await this.prisma.block.deleteMany();
    await this.prisma.section.deleteMany();
    await this.prisma.chapter.deleteMany();
    await this.prisma.manual.deleteMany();
    await this.prisma.organization.deleteMany();
    await this.prisma.user.deleteMany();
  }

  getApp(): INestApplication {
    return this.app;
  }

  getPrisma(): PrismaService {
    return this.prisma;
  }

  getModule(): TestingModule {
    return this.module;
  }

  async createTestUser(overrides: any = {}): Promise<any> {
    return this.prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        organizationId: 'test-org',
        status: 'ACTIVE',
        ...overrides,
      },
    });
  }

  async createTestOrganization(overrides: any = {}): Promise<any> {
    return this.prisma.organization.create({
      data: {
        name: 'Test Organization',
        type: 'AIRLINE',
        status: 'ACTIVE',
        ...overrides,
      },
    });
  }

  async createTestManual(overrides: any = {}): Promise<any> {
    return this.prisma.manual.create({
      data: {
        title: 'Test Manual',
        organizationId: 'test-org',
        status: 'DRAFT',
        createdBy: 'test-user',
        updatedBy: 'test-user',
        ...overrides,
      },
    });
  }
}

// Global test environment instance
export const testEnv = new TestEnvironment();
