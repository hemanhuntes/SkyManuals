import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '@skymanuals/prisma';
import * as request from 'supertest';
import { AddonController } from '../src/addons/addon.controller';
import { AddonService } from '../src/addons/addon.service';
import { HookExecutionService } from '../src/addons/hook-execution.service';
import { AuditService } from '../src/audit/audit.service';
import {
  AddonSearchRequest,
  HookExecutionRequest,
  InstallationRequest,
  LicenseCreateRequest,
  RequestContext,
  AddonType,
  LicenseTier,
  HookType,
} from '@skymanuals/types';

describe('Add-on Store End-to-End Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let addonService: AddonService;
  let hookExecutionService: HookExecutionService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AddonController],
      providers: [
        AddonService,
        HookExecutionService,
        AuditService,
        PrismaService,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    addonService = moduleFixture.get<AddonService>(AddonService);
    hookExecutionService = moduleFixture.get<HookExecutionService>(HookExecutionService);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Add-on Store Operations', () => {
    let testOrganization: any;
    let testUser: any;
    let testAddon: any;
    let testLicense: any;
    let testInstallation: any;

    beforeEach(async () => {
      // Create test organization
      testOrganization = await prisma.organization.create({
        data: {
          name: 'Add-on Test Airlines',
          slug: 'addon-test-airlines',
        },
      });

      // Create test user
      testUser = await prisma.user.create({
        data: {
          email: 'test@addon-test.com',
          name: 'Test Pilot',
        },
      });

      // Create membership
      await prisma.membership.create({
        data: {
          userId: testUser.id,
          organizationId: testOrganization.id,
          role: 'ADMIN',
        },
      });

      // Create test add-on
      testAddon = await prisma.addon.create({
        data: {
          name: 'EPIC-09 Test Add-on',
          slug: 'epic-09-test-addon',
          description: 'A test add-on for Epic-09 testing',
          version: '1.0.0',
          author: 'SkyManuals Test Team',
          authorEmail: 'test@skymanuals.com',
          type: 'TEMPLATE_PACK',
          status: 'PUBLISHED',
          tags: ['test', 'e2e'],
          categories: ['productivity'],
          hooks: ['ON_PUBLISH', 'ON_MANUAL_CREATE'],
        },
      });

      // Create pricing tier
      await prisma.addonPricingTier.create({
        data: {
          addonId: testAddon.id,
          tier: 'BASIC',
          price: 99.99,
          billingPeriod: 'MONTHLY',
          features: ['Basic features'],
          trialDays: 14,
        },
      });
    });

    afterEach(async () => {
      await prisma.user.deleteMany();
      await prisma.organization.deleteMany();
      await prisma.addon.deleteMany();
    });

    it('should search add-ons successfully', async () => {
      const searchRequest: AddonSearchRequest = {
        query: 'test',
        type: 'TEMPLATE_PACK',
        sortBy: 'name',
        sortOrder: 'asc',
        page: 1,
        pageSize: 20,
      };

      const response = await request(app.getHttpServer())
        .get('/addons/search')
        .query(searchRequest);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('addons');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body).toHaveProperty('filters');
      expect(response.body.addons.length).toBeGreaterThan(0);
      expect(response.body.addons[0].name).toContain('EPIC-09 Test Add-on');
    });

    it('should get add-on details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/addons/${testAddon.id}`);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('EPIC-09 Test Add-on');
      expect(response.body.status).toBe('PUBLISHED');
      expect(response.body.type).toBe('TEMPLATE_PACK');
      expect(response.body.hooks).toContain('ON_PUBLISH');
    });

    it('should create a license for an add-on', async () => {
      const licenseRequest: LicenseCreateRequest = {
        addonId: testAddon.id,
        organizationId: testOrganization.id,
        tier: 'BASIC',
        seatsPurchased: 5,
        billingPeriod: 'MONTHLY',
        autoRenew: false,
        trialDays: 14,
        purchaseNotes: 'E2E test license',
        createdBy: testUser.id,
      };

      const context: RequestContext = {
        requestId: 'test-request',
        organizationId: testOrganization.id,
        userId: testUser.id,
        userRole: 'ADMIN',
        permissions: ['user:manage_roles'],
        timestamp: new Date().toISOString(),
      };

      const response = await request(app.getHttpServer())
        .post('/addons/licenses')
        .send({ ...licenseRequest, context });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.addonId).toBe(testAddon.id);
      expect(response.body.organizationId).toBe(testOrganization.id);
      expect(response.body.isTrial).toBe(true);
      expect(response.body.seatsPurchased).toBe(5);

      // Store license for later tests
      testLicense = response.body;
    });

    it('should install an add-on', async () => {
      // First create a license
      const license = await prisma.license.create({
        data: {
          addonId: testAddon.id,
          organizationId: testOrganization.id,
          tier: 'BASIC',
          seatsPurchased: 5,
          startDate: new Date(),
          price: 99.99,
          currency: 'USD',
          billingPeriod: 'MONTHLY',
          createdBy: testUser.id,
        },
      });

      const installationRequest: InstallationRequest = {
        addonId: testAddon.id,
        organizationId: testOrganization.id,
        licenseId: license.id,
        settings: { theme: 'dark', notifications: true },
        webhookUrl: 'https://test.example.com/webhooks/addon',
      };

      const context: RequestContext = {
        requestId: 'test-install',
        organizationId: testOrganization.id,
        userId: testUser.id,
        userRole: 'ADMIN',
        permissions: ['user:manage_roles'],
        timestamp: new Date().toISOString(),
      };

      const response = await request(app.getHttpServer())
        .post('/addons/install')
        .send({ ...installationRequest, context });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.webhookUrl).toBe('https://test.example.com/webhooks/addon');
      expect(response.body.settings).toEqual({ theme: 'dark', notifications: true });

      // Store installation for later tests
      testInstallation = response.body;
    });

    it('should get organization installations', async () => {
      // Get installations for organization
      const response = await request(app.getHttpServer())
        .get(`/addons/organization/${testOrganization.id}/installations`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should get organization licenses', async () => {
      const response = await request(app.getHttpServer())
        .get(`/addons/organization/${testOrganization.id}/licenses`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should check add-on compatibility', async () => {
      const response = await request(app.getHttpServer())
        .get(`/addons/${testAddon.id}/compatibility`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('compatible');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('requirements');
    });

    it('should handle hook execution', async () => {
      // Create installation first
      const installation = await prisma.installation.create({
        data: {
          addonId: testAddon.id,
          organizationId: testOrganization.id,
          status: 'ACTIVE',
          enabledHooks: ['ON_PUBLISH', 'ON_MANUAL_CREATE'],
          webhookUrl: 'https://test.example.com/webhooks/addon',
          installedVersion: testAddon.version,
          installedAt: new Date(),
        },
      });

      const hookRequest: HookExecutionRequest = {
        installationId: installation.id,
        hookType: 'ON_PUBLISH',
        payload: {
          resourceId: 'manual-123',
          resourceType: 'Manual',
          manualTitle: 'Test Manual',
          version: '1.0.0',
        },
        correlationId: 'test-correlation-id',
      };

      const context: RequestContext = {
        requestId: 'test-hook',
        organizationId: testOrganization.id,
        userId: testUser.id,
        userRole: 'ADMIN',
        permissions: ['manual:publish'],
        timestamp: new Date().toISOString(),
      };

      // Mock successful webhook call
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('{"success": true}'),
      });

      global.fetch = mockFetch;

      const response = await request(app.getHttpServer())
        .post('/addons/hooks/execute')
        .send({ ...hookRequest, context });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.executionId).toBeDefined();
      expect(response.body.status).toBe('SUCCESS');

      // Verify webhook was called
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/webhooks/addon',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-SkyManuals-Hook-Type': 'ON_PUBLISH',
          }),
        })
      );
    });

    it('should get hook execution logs', async () => {
      // Create some hook execution records
      const installation = await prisma.installation.create({
        data: {
          addonId: testAddon.id,
          organizationId: testOrganization.id,
          status: 'ACTIVE',
          webhookUrl: 'https://test.example.com/webhooks/addon',
          installedVersion: testAddon.version,
          installedAt: new Date(),
        },
      });

      await prisma.hookExecution.create({
        data: {
          installationId: installation.id,
          hookType: 'ON_PUBLISH',
          webhookUrl: 'https://test.example.com/webhooks/addon',
          event: {
            hookType: 'ON_PUBLISH',
            timestamp: new Date().toISOString(),
            organizationId: testOrganization.id,
            payload: { resourceId: 'manual-123' },
          },
          status: 'SUCCESS',
          requestDuration: 500,
          responseStatus: 200,
          executedAt: new Date(),
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/addons/organization/${testOrganization.id}/hooks/logs`)
        .query({
          page: 1,
          pageSize: 10,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('executions');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.executions.length).toBeGreaterThan(0);
      expect(response.body.executions[0].hookType).toBe('ON_PUBLISH');
    });

    it('should upgrade installation settings', async () => {
      // Create installation first
      const installation = await prisma.installation.create({
        data: {
          addonId: testAddon.id,
          organizationId: testOrganization.id,
          status: 'ACTIVE',
          enabledHooks: ['ON_PUBLISH'],
          settings: { theme: 'light' },
          webhookUrl: 'https://test.example.com/webhooks/addon',
          installedVersion: testAddon.version,
          installedAt: new Date(),
        },
      });

      const updateRequest = {
        settings: { theme: 'dark', notifications: true },
        enabledHooks: ['ON_PUBLISH', 'ON_MANUAL_CREATE'],
        webhookUrl: 'https://new-webhook.example.com/addon',
      };

      const context: RequestContext = {
        requestId: 'test-update',
        organizationId: testOrganization.id,
        userId: testUser.id,
        userRole: 'ADMIN',
        permissions: ['user:manage_roles'],
        timestamp: new Date().toISOString(),
      };

      const response = await request(app.getHttpServer())
        .put(`/addons/installations/${installation.id}`)
        .send({ ...updateRequest, context });

      expect(response.status).toBe(200);
      expect(response.body.settings).toEqual({ theme: 'dark', notifications: true });
      expect(response.body.webhookUrl).toBe('https://new-webhook.example.com/addon');
      expect(response.body.enabledHooks).toContain('ON_MANUAL_CREATE');
    });

    it('should uninstall an add-on', async () => {
      // Create installation first
      const installation = await prisma.installation.create({
        data: {
          addonId: testAddon.id,
          organizationId: testOrganization.id,
          status: 'ACTIVE',
          webhookUrl: 'https://test.example.com/webhooks/addon',
          installedVersion: testAddon.version,
          installedAt: new Date(),
        },
      });

      const context: RequestContext = {
        requestId: 'test-uninstall',
        organizationId: testOrganization.id,
        userId: testUser.id,
        userRole: 'ADMIN',
        permissions: ['user:manage_roles'],
        timestamp: new Date().toISOString(),
      };

      const response = await request(app.getHttpServer())
        .delete(`/addons/installations/${installation.id}`)
        .send({ context });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify installation status updated
      const updatedInstallation = await prisma.installation.findUnique({
        where: { id: installation.id },
      });
      expect(updatedInstallation?.status).toBe('UNINSTALLED');
    });

    it('should handle bulk hook execution', async () => {
      // Create multiple installations
      const installation1 = await prisma.installation.create({
        data: {
          addonId: testAddon.id,
          organizationId: testOrganization.id,
          status: 'ACTIVE',
          enabledHooks: ['ON_PUBLISH'],
          webhookUrl: 'https://webhook1.example.com/addon',
          installedVersion: testAddon.version,
          installedAt: new Date(),
        },
      });

      const installation2 = await prisma.installation.create({
        data: {
          addonId: testAddon.id,
          organizationId: testOrganization.id,
          status: 'ACTIVE',
          enabledHooks: ['ON_PUBLISH'],
          webhookUrl: 'https://webhook2.example.com/addon',
          installedVersion: testAddon.version,
          installedAt: new Date(),
        },
      });

      // Mock successful webhook calls
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('{"success": true}'),
      });

      global.fetch = mockFetch;

      const response = await request(app.getHttpServer())
        .post('/addons/admin/bulk-hooks')
        .send({
            hookType: 'ON_PUBLISH',
            payload: {
              resourceId: 'manual-123',
              resourceType: 'Manual',
              manualTitle: 'Bulk Test Manual',
            },
            organizationId: testOrganization.id,
        });

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(2);
      
      // Verify both installations were processed
      expect(response.body[0].installationId).toBe(installation1.id);
      expect(response.body[1].installationId).toBe(installation2.id);
      expect(response.body[0].success).toBe(true);
      expect(response.body[1].success).toBe(true);

      // Verify webhooks were called
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle failed hook execution retries', async () => {
      // Create installation
      const installation = await prisma.installation.create({
        data: {
          addonId: testAddon.id,
          organizationId: testOrganization.id,
          status: 'ACTIVE',
          enabledHooks: ['ON_PUBLISH'],
          webhookUrl: 'https://failing-webhook.example.com/addon',
          installedVersion: testAddon.version,
          installedAt: new Date(),
        },
      });

      // Create failed hook execution
      await prisma.hookExecutionAttempt.create({
        data: {
          hookExecutionId: 'failed-execution-123',
          sequence: 1,
          status: 'FAILED',
          error: 'HTTP 500: Internal Server Error',
          responseStatus: 500,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/addons/admin/process-failed-hooks')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Failed hook executions processed');
    });
  });

  describe('Template Pack Specific Tests', () => {
    let testOrganization: any;
    let testTemplateAddon: any;
    let testLicense: any;
    let testInstallation: any;

    beforeEach(async () => {
      testOrganization = await prisma.organization.create({
        data: {
          name: 'Template Test Airlines',
          slug: 'template-test-airlines',
        },
      });

      // Create Template Pack add-on
      testTemplateAddon = await prisma.addon.create({
        data: {
          name: 'Aircraft Operations Template Pack',
          slug: 'aircraft-operations-template-pack',
          description: 'Professional templates for aircraft operations',
          version: '1.2.0',
          author: 'SkyManuals Aviation Team',
          authorEmail: 'aviation@skymanuals.com',
          type: 'TEMPLATE_PACK',
          status: 'PUBLISHED',
          tags: ['templates', 'aviation', 'compliance'],
          categories: ['productivity', 'templates'],
          hooks: ['ON_MANUAL_CREATE', 'ON_PUBLISH'],
        },
      });

      // Create license
      testLicense = await prisma.license.create({
        data: {
          addonId: testTemplateAddon.id,
          organizationId: testOrganization.id,
          tier: 'PROFESSIONAL',
          seatsPurchased: 10,
          startDate: new Date(),
          price: 149.99,
          currency: 'USD',
          billingPeriod: 'MONTHLY',
          createdBy: 'test-user',
        },
      });

      // Create installation
      testInstallation = await prisma.installation.create({
        data: {
          addonId: testTemplateAddon.id,
          organizationId: testOrganization.id,
          licenseId: testLicense.id,
          status: 'ACTIVE',
          enabledHooks: ['ON_MANUAL_CREATE'],
          webhookUrl: 'https://template-pack.example.com/webhook',
          settings: { autoApply: true, templateLibrary: 'expanded' },
          installedVersion: testTemplateAddon.version,
          installedAt: new Date(),
        },
      });
    });

    afterEach(async () => {
      await prisma.organization.deleteMany();
      await prisma.addon.deleteMany();
    });

    it('should provide template pack for manual creation', async () => {
      // Create a manual and trigger template pack hook
      const manual = await prisma.manual.create({
        data: {
          organizationId: testOrganization.id,
          title: 'B737-800 Operations Manual',
          status: 'DRAFT',
        },
      });

      const hookRequest: HookExecutionRequest = {
        installationId: testInstallation.id,
        hookType: 'ON_MANUAL_CREATE',
        payload: {
          resourceId: manual.id,
          resourceType: 'Manual',
          manualTitle: manual.title,
          organizationId: testOrganization.id,
        },
      };

      const context: RequestContext = {
        requestId: 'template-test',
        organizationId: testOrganization.id,
        userId: 'test-user',
        userRole: 'EDITOR',
        permissions: ['manual:write'],
        timestamp: new Date().toISOString(),
      };

      // Mock webhook response for template pack
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({
          success: true,
          templates: [
            {
              name: 'B737-800 FOM Template',
              sections: ['General Information', 'Flight Operations', 'Crew Training'],
              compliance: ['FAA Part 121', 'ICAO Annex 6'],
            },
            {
              name: 'B737-800 MEL Template',
              sections: ['MEL Items', 'Deferral Procedures', 'Maintenance'],
              compliance: ['FAA Part 121.628'],
            },
          ])),
      });

      global.fetch = mockFetch;

      const response = await request(app.getHttpServer())
        .post('/addons/hooks/execute')
        .send({ ...hookRequest, context });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify webhook request contains manual details
      expect(mockFetch).toHaveBeenCalledWith(
        'https://template-pack.example.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining(manual.title),
        }),
      );
    });

    it('should filter template packs by aircraft type', async () => {
      // Search for template packs
      const searchRequest: AddonSearchRequest = {
        query: 'aircraft',
        type: 'TEMPLATE_PACK',
        tags: ['aviation'],
        sortBy: 'rating',
        sortOrder: 'desc',
        page: 1,
        pageSize: 10,
      };

      const response = await request(app.getHttpServer())
        .get('/addons/search')
        .query(searchRequest);

      expect(response.status).toBe(200);
      expect(response.body.addons.length).toBeGreaterThan(0);
      
      // Find our template pack
      const templatePack = response.body.addons.find(
        addon => addon.name === 'Aircraft Operations Template Pack'
      );
      expect(templatePack).toBeDefined();
      expect(templatePack.type).toBe('TEMPLATE_PACK');
      expect(templatePack.tags).toContain('aviation');
    });

    it('should track template pack usage analytics', async () => {
      // Update installation analytics
      await prisma.installation.update({
        where: { id: testInstallation.id },
        data: {
          apiCallsThisMonth: 5,
          webhookCallsThisMonth: 3,
          activeUsers: 2,
        },
      });

      // Verify analytics tracking
      const updatedInstallation = await prisma.installation.findUnique({
        where: { id: testInstallation.id },
        include: { addon: true },
      });

      expect(updatedInstallation?.apiCallsThisMonth).toBe(5);
      expect(updatedInstallation?.webhookCallsThisMonth).toBe(3);
      expect(updatedInstallation?.activeUsers).toBe(2);
    });
  });
});
