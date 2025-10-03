import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '@skymanuals/prisma';
import * as request from 'supertest';
import { OIDCService } from '../src/auth/oidc.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuditService } from '../src/audit/audit.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  LoginRequest,
  AuthCallback,
  Permission,
  AuditEventType,
  AuditSeverity,
  OrganizationContext,
  RequestContext,
} from '@skymanuals/types';

describe('IAM & Audit End-to-End Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let oidcService: OIDCService;
  let auditService: AuditService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        OIDCService,
        AuditService,
        JwtService,
        ConfigService,
        PrismaService,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    oidcService = moduleFixture.get<OIDCService>(OIDCService);
    auditService = moduleFixture.get<AuditService>(AuditService);
    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('OIDC Authentication Flow', () => {
    let testOrganization: any;
    let testUser: any;

    beforeEach(async () => {
      // Create test organization
      testOrganization = await prisma.organization.create({
        data: {
          name: 'IAM Test Airlines',
          slug: 'iam-test-airlines',
          logoUrl: 'https://example.com/logo.png',
        },
      });

      // Create test user
      testUser = await prisma.user.create({
        data: {
          email: 'test@iam-airlines.com',
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
    });

    afterEach(async () => {
      await prisma.user.deleteMany();
      await prisma.organization.deleteMany();
    });

    it('should initiate OIDC login flow', async () => {
      const loginRequest: LoginRequest = {
        issuer: 'Auth0',
        clientId: 'test-client-id',
        redirectUri: 'http://localhost:3000/auth/callback',
        scopes: ['openid', 'profile', 'email'],
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginRequest);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('authUrl'); 
      expect(response.body).toHaveProperty('state');
      expect(response.body).toHaveProperty('clientId', 'test-client-id');
      
      // Verify auth URL contains required parameters
      const authUrl = response.body.authUrl;
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain('client_id=test-client-id');
      expect(authUrl).toContain('scope=openid+profile+email');
    });

    it('should handle OIDC callback and create session', async () => {
      // Mock OIDC token exchange
      const mockTokens = {
        access_token: 'mock-access-token',
        id_token: 'mock-id-token',
        refresh_token: 'mock-refresh-token',
        token_type: 'Bearer',
        expires_in: 86400,
      };

      const mockIdToken = {
        sub: testUser.id,
        email: testUser.email,
        name: testUser.name,
        org_roles: {
          [testOrganization.id]: {
            organizationId: testOrganization.id,
            organizationName: testOrganization.name,
            role: 'ADMIN',
            permissions: ['manual:read', 'manual:write', 'user:manage_roles'],
          },
        },
        primary_org: testOrganization.id,
        iss: 'https://test.auth0.com/',
        aud: 'test-audience',
        exp: Math.floor(Date.now() / 1000) + 86400,
        iat: Math.floor(Date.now() / 1000),
      };

      // Mock the OIDC service to return our test tokens
      jest.spyOn(oidcService, 'exchangeCodeForTokens').mockResolvedValue(mockTokens);
      jest.spyOn(oidcService, 'createUserSession').mockResolvedValue({
        userId: testUser.id,
        email: testUser.email,
        name: testUser.name,
        currentOrganization: {
          id: testOrganization.id,
          name: testOrganization.name,
          slug: testOrganization.slug,
          role: 'ADMIN',
          permissions: ['manual:read', 'manual:write', 'user:manage_roles'],
          isDefault: true,
        },
        availableOrganizations: [],
        permissions: ['manual:read', 'manual:write', 'user:manage_roles'],
        jwtExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        sessionId: 'test-session-id',
        clientId: 'test-client-id',
        loginTime: new Date().toISOString(),
      });

      const callbackData: AuthCallback = {
        code: 'test-authorization-code',
        state: 'test-state',
        iss: 'Auth0',
        clientId: 'test-client-id',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/callback')
        .send({ ...callbackData, redirectUri: 'http://localhost:3000/auth/callback' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('id_token');
      expect(response.body).toHaveProperty('session');
      expect(response.body.session.currentOrganization.role).toBe('ADMIN');
    });

    it('should handle organization context switching', async () => {
      // Create second organization for switching
      const secondOrg = await prisma.organization.create({
        data: {
          name: 'Second Airlines',
          slug: 'second-airlines',
        },
      });

      // Create membership in second org with EDITOR role
      await prisma.membership.create({
        data: {
          userId: testUser.id,
          organizationId: secondOrg.id,
          role: 'EDITOR',
        },
      });

      // Mock session payload
      const sessionPayload = {
        sessionId: 'test-session',
        userId: testUser.id,
        organizationId: testOrganization.id,
        role: 'ADMIN',
      };

      jest.spyOn(jwtService, 'verifyAsync').mockResolvedValue(sessionPayload);
      jest.spyOn(oidcService, 'switchOrganization').mockResolvedValue({
        userId: testUser.id,
        email: testUser.email,
        name: testUser.name,
        currentOrganization: {
          id: secondOrg.id,
          name: secondOrg.name,
          slug: secondOrg.slug,
          role: 'EDITOR',
          permissions: ['manual:read', 'manual:write'],
          isDefault: false,
        },
        availableOrganizations: [],
        permissions: ['manual:read', 'manual:write'],
        jwtExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        sessionId: 'test-session',
        clientId: 'test-client-id',
        loginTime: new Date().toISOString(),
      });

      const response = await request(app.getHttpServer())
        .post('/auth/switch-organization')
        .send({
          session_token: 'mock-session-token',
          organization_id: secondOrg.id,
          client_id: 'test-client-id',
        });

      expect(response.status).toBe(200);
      expect(response.body.currentOrganization.role).toBe('EDITOR');
      expect(response.body.currentOrganization.id).toBe(secondOrg.id);
    });
  });

  describe('Permission Matrix Testing', () => {
    let testOrganization: any;
    let testUsers: any[];

    beforeEach(async () => {
      testOrganization = await prisma.organization.create({
        data: {
          name: 'Permission Test Org',
          slug: 'permission-test',
        },
      });

      // Create users with different roles
      testUsers = [];
      const roles = ['ADMIN', 'EDITOR', 'REVIEWER', 'READER'];
      
      for (const role of roles) {
        const user = await prisma.user.create({
          data: {
            email: `${role.toLowerCase()}@test.com`,
            name: `${role} User`,
          },
        });

        await prisma.membership.create({
          data: {
            userId: user.id,
            organizationId: testOrganization.id,
            role: role as any,
          },
        });

        testUsers.push({ ...user, role });
      }

      // Create permission matrices
      const permissionBitmasks = {
        ADMIN: BigInt(0xFFFFFFFF), // All permissions (bitwise OR of all permission bits)
        EDITOR: BigInt(0x0FFF8FFF), // Most permissions except user management
        REVIEWER: BigInt(0x00030000), // Only read permissions and workflow approvals
        READER: BigInt(0x00008000), // Only read permissions
      };

      for (const [role, bitmask] of Object.entries(permissionBitmasks)) {
        await prisma.permissionMatrix.create({
          data: {
            organizationId: testOrganization.id,
            role: role as any,
            permissions: bitmask,
            limitations: [],
          },
        });
      }
    });

    afterEach(async () => {
      await prisma.user.deleteMany();
      await prisma.organization.deleteMany();
    });

    it('should enforce correct permissions for each role', async () => {
      const permissionTests = [
        { role: 'ADMIN', permissions: ['manual:read', 'manual:write', 'user:manage_roles', 'org:manage'], shouldHave: true },
        { role: 'EDITOR', permissions: ['manual:read', 'manual:write'], shouldHave: true },
        { role: 'EDITOR', permissions: ['user:manage_roles', 'org:manage'], shouldHave: false },
        { role: 'REVIEWER', permissions: ['manual:read', 'workflow:approve'], shouldHave: true },
        { role: 'REVIEWER', permissions: ['manual:write', 'device:manage'], shouldHave: false },
        { role: 'READER', permissions: ['manual:read'], shouldHave: true },
        { role: 'READER', permissions: ['manual:write', 'workflow:approve'], shouldHave: false },
      ];

      for (const test of permissionTests) {
        const context: RequestContext = {
          requestId: 'test-request',
          organizationId: testOrganization.id,
          userId: testUsers.find(u => u.role === test.role)!.id,
          userRole: test.role,
          permissions: await getUserPermissions(testUsers.find(u => u.role === test.role)!.id, testOrganization.id),
          timestamp: new Date().toISOString(),
        };

        for (const permission of test.permissions) {
          const hasPermission = context.permissions.includes(permission);
          expect(hasPermission).toBe(test.shouldHave);
        }
      }
    });

    it('should handle permission inheritance correctly', async () => {
      // Test that ADMIN has all permissions automatically
      const adminPermissions = await getUserPermissions(
        testUsers.find(u => u.role === 'ADMIN')!.id,
        testOrganization.id
      );

      // Should include comprehensive permissions
      expect(adminPermissions).toContain('user:manage_roles');
      expect(adminPermissions).toContain('org:manage');
      expect(adminPermissions).toContain('audit:export');
      expect(adminPermissions).toContain('device:manage');
      expect(adminPermissions).toContain('manual:publish');
    });

    it('should prevent privilege escalation', async () => {
      // Try to grant ADMIN role to a READER using their own context
      const readerUser = testUsers.find(u => u.role === 'READER');
      const readerContext: RequestContext = {
        requestId: 'escalation-test',
        organizationId: testOrganization.id,
        userId: readerUser!.id,
        userRole: 'READER',
        permissions: await getUserPermissions(readerUser!.id, testOrganization.id),
        timestamp: new Date().toISOString(),
      };

      // Reader should not be able to manage user roles
      const hasRoleManagement = readerContext.permissions.includes('user:manage_roles');
      expect(hasRoleManagement).toBe(false);
    });

    async function getUserPermissions(userId: string, organizationId: string): Promise<string[]> {
      const membership = await prisma.membership.findFirst({
        where: { userId, organizationId },
      });

      if (!membership) return [];

      const permissionMatrix = await prisma.permissionMatrix.findUnique({
        where: {
          organizationId_role: {
            organizationId,
            role: membership.role,
          },
        },
      });

      if (!permissionMatrix) {
        return getDefaultPermissions(membership.role);
      }

      return bitmaskToPermissions(permissionMatrix.permissions);
    }

    function getDefaultPermissions(role: string): string[] {
      const permissions: Record<string, string[]> = {
        ADMIN: [
          'manual:read', 'manual:write', 'manual:delete', 'manual:publish',
          'chapter:read', 'chapter:write', 'chapter:delete',
          'section:read', 'section:write', 'section:delete',
          'workflow:read', 'workflow:write', 'workflow:execute', 'workflow:approve',
          'device:read', 'device:write', 'device:manage',
          'compliance:read', 'compliance:write', 'compliance:manage',
          'user:read','user:write', 'user:manage_roles',
          'org:read', 'org:write', 'org:manage',
          'audit:read', 'audit:export',
          'search:read', 'search:index',
          'xml:read', 'xml:write', 'xml:validate',
        ],
        EDITOR: [
          'manual:read', 'manual:write', 'manual:publish',
          'chapter:read', 'chapter:write',
          'section:read', 'section:write',
          'workflow:read', 'workflow:write', 'workflow:execute',
          'compliance:read', 'compliance:write',
          'search:read', 'search:index',
          'xml:read', 'xml:write', 'xml:validate',
        ],
        REVIEWER: [
          'manual:read',
          'chapter:read', 'chapter:write',
          'section:read', 'section:write',
          'workflow:read', 'workflow:approve',
          'compliance:read',
          'search:read',
          'xml:read',
        ],
        READER: [
          'manual:read',
          'chapter:read',
          'section:read',
          'compliance:read',
          'search:read',
          'xml:read',
        ],
      };

      return permissions[role] || [];
    }

    function bitmaskToPermissions(bitmask: bigint): string[] {
      const allPermissions = getDefaultPermissions('ADMIN');
      const permissions = [];

      for (let i = 0; i < allPermissions.length; i++) {
        if (bitmask & (1n << BigInt(i))) {
          permissions.push(allPermissions[i]);
        }
      }

      return permissions;
    }
  });

  describe('Audit Log Integrity Chain', () => {
    let testOrganization: any;
    let testUser: any;

    beforeEach(async () => {
      testOrganization = await prisma.organization.create({
        data: {
          name: 'Audit Test Org',
          slug: 'audit-test',
        },
      });

      testUser = await prisma.user.create({
        data: {
          email: 'audit@test.com',
          name: 'Audit Test User',
        },
      });
    });

    afterEach(async () => {
      await prisma.user.deleteMany();
      await prisma.organization.deleteMany();
    });

    it('should maintain integrity chain across multiple events', async () => {
      const correlationId = 'test-correlation-id';
      const events = [];

      // Create a sequence of audit events
      for (let i = 0; i < 5; i++) {
        const context: RequestContext = {
          requestId: `test-request-${i}`,
          correlationId,
          organizationId: testOrganization.id,
          userId: testUser.id,
          userRole: 'ADMIN',
          permissions: ['manual:read', 'manual:write'],
          timestamp: new Date().toISOString(),
        };

        const auditEvent = await auditService.logEvent(context, {
          type: AuditEventType.DATA_MODIFICATION,
          action: `UPDATE`,
          resource: 'Manual',
          resourceId: `manual-${i}`,
          resourceType: 'Manual' as any,
          beforeData: { version: i },
          afterData: { version: i + 1 },
        });

        events.push(auditEvent);
      });

      // Verify integrity chain
      for (let i = 1; i < events.length; i++) {
        const currentEvent = events[i];
        const previousEvent = events[i - 1];

        // The current event's previousHash should match the previous event's integrityHash
        expect(currentEvent.previousHash).toBe(previousEvent.integrityHash);
      }

      // Verify all events can be found in database
      const storedEvents = await prisma.auditLog.findMany({
        where: { correlationId },
        orderBy: { timestamp: 'asc' },
      });

      expect(storedEvents.length).toBe(5);

      // Verify each event's integrity hash is correct
      for (const storedEvent of storedEvents) {
        const calculatedHash = auditService['calculateEventIntegrityHash'](
          storedEvent,
          storedEvent.previousHash
        );
        expect(storedEvent.integrityHash).toBe(calculatedHash);
      }
    });

    it('should detect tampered audit events', async () => {
      const correlationId = 'tamper-test';
      
      const context: RequestContext = {
        requestId: 'test-request',
        correlationId,
        organizationId: testOrganization.id,
        userId: testUser.id,
        userRole: 'ADMIN',
        permissions: ['manual:read'],
        timestamp: new Date().toISOString(),
      };

      // Create initial event
      const initialEvent = await auditService.logEvent(context, {
        type: AuditEventType.DATA_MODIFICATION,
        action: 'UPDATE',
        resource: 'Manual',
        resourceId: 'manual-1',
        beforeData: { version: 1 },
        afterData: { version: 2 },
      });

      // Manually tamper with the event in database
      await prisma.auditLog.update({
        where: { id: initialEvent.id },
        data: { 
          action: 'TAMPERED',
          integrityHash: 'fake-hash',
        },
      });

      // Verify integrity check fails
      const integrityResult = await auditService.verifyIntegrity(
        testOrganization.id,
        correlationId
      );

      expect(integrityResult.isValid).toBe(false);
      expect(integrityResult.chainBroken).toBe(true);
    });

    it('should handle audit export with before/after data', async () => {
      const context: RequestContext = {
        requestId: 'export-test',
        organizationId: testOrganization.id,
        userId: testUser.id,
        userRole: 'ADMIN',
        permissions: ['audit:export'],
        timestamp: new Date().toISOString(),
      };

      // Create events with before/after data
      const beforeData = { title: 'Old Title', status: 'DRAFT' };
      const afterData = { title: 'New Title', status: 'PUBLISHED' };

      await auditService.logDataModification(
        context,
        'UPDATE',
        'Manual',
        'manual-1',
        'Manual' as any,
        beforeData,
        afterData,
      );

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

      const exportResult = await auditService.exportAuditLogs(
        testOrganization.id,
        {
          startDate,
          endDate,
          includeBeforeAfter: true,
        },
        'json'
      );

      expect(exportResult.length).toBeGreaterThan(0);
      expect(exportResult[0]).toHaveProperty('beforeData');
      expect(exportResult[0]).toHaveProperty('afterData');
      expect(exportResult[0].beforeData.version).toBe(undefined); // Should not include calculated fields
    });
  });

  describe('Security Events and Monitoring', () => {
    let testOrganization: any;

    beforeEach(async () => {
      testOrganization = await prisma.organization.create({
        data: {
          name: 'Security Test Org',
          slug: 'security-test',
        },
      });
    });

    afterEach(async () => {
      await prisma.organization.deleteMany();
    });

    it('should log security events with appropriate severity', async () => {
      const context: RequestContext = {
        requestId: 'security-test',
        organizationId: testOrganization.id,
        userId: 'suspicious-user',
        permissions: [],
        timestamp: new Date().toISOString(),
        ipAddress: '192.168.1.100',
      };

      // Log suspicious login attempt
      await auditService.logSecurityEvent(
        context,
        'SUSPICIOUS_LOGIN',
        'Authentication',
        'login-attempt-1',
        AuditSeverity.HIGH,
        {
          attemptCount: 5,
          blocked: true,
          reason: 'Multiple failed login attempts',
        }
      );

      // Log privilege escalation attempt
      await auditService.logSecurityEvent(
        context,
        'PRIVILEGE_ESCALATION',
        'Authorization',
        'token-request',
        AuditSeverity.CRITICAL,
        {
          attemptedPermissions: ['user:manage_roles', 'org:manage'],
          currentRole: 'READER',
          blocked: true,
        }
      );

      // Verify events were logged with correct severity
      const highSeverityEvents = await prisma.auditLog.findMany({
        where: {
          organizationId: testOrganization.id,
          severity: 'HIGH',
          eventType: 'SECURITY_EVENT',
        },
      });

      const criticalSeverityEvents = await prisma.auditLog.findMany({
        where: {
          organizationId: testOrganization.id,
          severity: 'CRITICAL',
          eventType: 'SECURITY_EVENT',
        },
      });

      expect(highSeverityEvents.length).toBeGreaterThan(0);
      expect(criticalSeverityEvents.length).toBeGreaterThan(0);
      
      expect(highSeverityEvents[0].action).toBe('SUSPICIOUS_LOGIN');
      expect(criticalSeverityEvents[0].action).toBe('PRIVILEGE_ESCALATION');
    });

    it('should track user session lifecycle', async () => {
      const context: RequestContext = {
        requestId: 'session-test',
        organizationId: testOrganization.id,
        userId: 'authenticated-user',
        permissions: ['manual:read'],
        timestamp: new Date().toISOString(),
      };

      // Log login
      await auditService.logAuthentication(
        context,
        'LOGIN',
        'authenticated-user',
        'user@example.com',
        {
          loginMethod: 'OIDC',
          issuer: 'Auth0',
        }
      );

      // Log logout
      await auditService.logAuthentication(
        context,
        'LOGOUT',
        'authenticated-user',
        'user@example.com',
      );

      // Verify session events
      const sessionEvents = await prisma.auditLog.findMany({
        where: {
          organizationId: testOrganization.id,
          eventType: 'AUTHENTICATION',
          action: { in: ['LOGIN', 'LOGOUT'] },
        },
        orderBy: { timestamp: 'asc' },
      });

      expect(sessionEvents).toHaveLength(2);
      expect(sessionEvents[0].action).toBe('LOGIN');
      expect(sessionEvents[1].action).toBe('LOGOUT');
    });
  });
});
