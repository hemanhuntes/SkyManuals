import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@skymanuals/prisma';
import * as crypto from 'crypto';
import * as jose from 'jose';
import {
  JWTPayload,
  UserSession,
  RequestContext,
  OrganizationContext,
  TokenResponse,
  AuthCallback,
  OIDCIssuer,
} from '@skymanuals/types';

@Injectable()
export class OIDCService {
  private readonly logger = new Logger(OIDCService.name);
  private readonly issuerConfigs: Map<OIDCIssuer, any> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.initializeIssuerConfigs();
  }

  private initializeIssuerConfigs() {
    // Auth0 Configuration
    this.issuerConfigs.set('Auth0', {
      discoveryUrl: 'https://your-domain.auth0.com/.well-known/openid_configuration',
      issuer: 'https://your-domain.auth0.com/',
      audience: this.configService.get('AUTH0_AUDIENCE'),
    });

    // Azure Entra Configuration
    this.issuerConfigs.set('Entra', {
      discoveryUrl: 'https://login.microsoftonline.com/your-tenant/v2.0/.well-known/openid_configuration',
      issuer: 'https://login.microsoftonline.com/your-tenant/v2.0',
      audience: this.configService.get('ENTRA_CLIENT_ID'),
    });

    // Keycloak Configuration
    this.issuerConfigs.set('Keycloak', {
      discoveryUrl: 'https://your-keycloak-server/realms/your-realm/.well-known/openid_configuration',
      issuer: 'https://your-keycloak-server/realms/your-realm',
      audience: this.configService.get('KEYCLOAK_CLIENT_ID'),
    });
  }

  /**
   * Exchange authorization code for tokens via OIDC
   */
  async exchangeCodeForTokens(callback: AuthCallback): Promise<TokenResponse> {
    const config = this.issuerConfigs.get(callback.iss as OIDCIssuer);
    if (!config) {
      throw new UnauthorizedException('Unsupported OIDC issuer');
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await this.requestTokens(config, callback);
      
      // Verify and decode ID token
      const idTokenPayload = await this.verifyIDToken(tokenResponse.id_token, callback.iss);
      
      return tokenResponse;
    } catch (error) {
      this.logger.error('Failed to exchange code for tokens', error);
      throw new UnauthorizedException('Invalid authorization code');
    }
  }

  /**
   * Create a user session from OIDC tokens
   */
  async createUserSession(
    idTokenPayload: JWTPayload,
    organizationId: string,
    clientId: string,
    issuer: OIDCIssuer,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<UserSession> {
    const sessionId = crypto.randomUUID();
    const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Get user permissions for the organization
    const permissions = await this.getUserPermissions(idTokenPayload.sub, organizationId);

    // Create session in database
    const session = await this.prisma.userSession.create({
      data: {
        userId: idTokenPayload.sub,
        sessionId,
        clientId,
        issuer,
        organizationContext: JSON.stringify({
          id: organizationId,
          role: this.extractRoleFromToken(idTokenPayload, organizationId),
        }),
        permissions,
        expiresAt: sessionExpiresAt,
        ipAddress,
        userAgent,
        metadata: {
          issuer,
          authTime: idTokenPayload.auth_time,
        },
      },
    });

    return this.formatUserSession(session, idTokenPayload);
  }

  /**
   * Validate session and extract request context
   */
  async validateSession(sessionToken: string): Promise<RequestContext> {
    try {
      const sessionPayload = await this.jwtService.verifyAsync(sessionToken);
      
      // Verify session exists and is active
      const session = await this.prisma.userSession.findUnique({
        where: { sessionId: sessionPayload.sessionId },
        include: {
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      });

      if (!session || !session.isActive || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Session expired or invalid');
      }

      // Update last activity
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { lastActivity: new Date() },
      });

      const organizationContext = JSON.parse(session.organizationContext);
      
      return {
        requestId: crypto.randomUUID(),
        userId: session.userId,
        organizationId: organizationContext.id,
        userRole: organizationContext.role,
        permissions: session.permissions,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Session validation failed', error);
      throw new UnauthorizedException('Invalid session');
    }
  }

  /**
   * Generate session JWT token
   */
  generateSessionToken(session: UserSession): string {
    return this.jwtService.sign({
      sessionId: session.sessionId,
      userId: session.userId,
      organizationId: session.currentOrganization.id,
      role: session.currentOrganization.role,
      permissions: session.permissions,
      exp: Math.floor(new Date(session.jwtExpiresAt).getTime() / 1000),
    });
  }

  /**
   * Switch user's current organization context
   */
  async switchOrganization(
    sessionToken: string,
    organizationId: string,
    clientId: string,
  ): Promise<UserSession> {
    const sessionPayload = await this.jwtService.verifyAsync(sessionToken);
    
    const session = await this.prisma.userSession.findUnique({
      where: { sessionId: sessionPayload.sessionId },
      include: { user: true },
    });

    if (!session || !session.isActive) {
      throw new UnauthorizedException('Invalid session');
    }

    // Verify user has access to the organization
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: session.userId,
          organizationId,
        },
      },
    });

    if (!membership) {
      throw new UnauthorizedException('User does not have access to this organization');
    }

    // Get permissions for new organization
    const permissions = await this.getUserPermissions(session.userId, organizationId);

    // Update session with new organization context
    const updatedSession = await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        organizationContext: JSON.stringify({
          id: organizationId,
          role: membership.role,
        }),
        permissions,
        lastActivity: new Date(),
      },
    });

    // Create new JWT claims
    const idTokenPayload = JSON.parse(session.idToken || '{}');
    return this.formatUserSession(updatedSession, idTokenPayload);
  }

  /**
   * Terminates a user session
   */
  async terminateSession(sessionToken: string): Promise<void> {
    try {
      const sessionPayload = await this.jwtService.verifyAsync(sessionToken);
      
      await this.prisma.userSession.update({
        where: { sessionId: sessionPayload.sessionId },
        data: { isActive: false },
      });
    } catch (error) {
      this.logger.warn('Failed to terminate session', error);
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: {
        expiresAt: { lt: new Date() },
        isActive: true,
      },
      data: { isActive: false },
    });

    this.logger.log(`Cleaned up ${result.count} expired sessions`);
    return result.count;
  }

  /**
   * Extract organization roles from JWT token
   */
  private extractRoleFromToken(payload: JWTPayload, organizationId: string): string {
    const orgRoles = payload.org_roles || {};
    const orgRole = orgRoles[OrganizationContext];
    
    return orgRole?.role || 'READER';
  }

  /**
   * Get user permissions for an organization
   */
  private async getUserPermissions(userId: string, organizationId: string): Promise<string[]> {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });

    if (!membership) {
      return [];
    }

    // Get permission matrix for the organization
    const permissionMatrix = await this.prisma.permissionMatrix.findUnique({
      where: {
        organizationId_role: {
          organizationId,
          role: membership.role,
        },
      },
    });

    if (!permissionMatrix) {
      return this.getDefaultPermissions(membership.role);
    }

    return this.bitmaskToPermissions(permissionMatrix.permissions);
  }

  /**
   * Default permissions for roles
   */
  private getDefaultPermissions(role: string): string[] {
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

  /**
   * Convert bitmask to permission array
   */
  private bitmaskToPermissions(bitmask: bigint): string[] {
    const allPermissions = this.getDefaultPermissions('ADMIN');
    const permissions = [];

    for (let i = 0; i < allPermissions.length; i++) {
      if (bitmask & (1n << BigInt(i))) {
        permissions.push(allPermissions[i]);
      }
    }

    return permissions;
  }

  /**
   * Request tokens from OIDC provider
   */
  private async requestTokens(config: any, callback: AuthCallback): Promise<TokenResponse> {
    const tokenEndpoint = `${config.issuer}/oauth/token`;
    
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: callback.clientId,
      client_secret: this.configService.get(`${callback.iss}_CLIENT_SECRET`),
      code: callback.code,
      redirect_uri: callback.redirectUri,
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Verify and decode ID token
   */
  private async verifyIDToken(idToken: string, issuer: OIDCIssuer): Promise<JWTPayload> {
    const config = this.issuerConfigs.get(issuer);
    
    // Get JWKS for verification
    const jwksResponse = await fetch(`${config.issuer}/.well-known/jwks.json`);
    const jwks = await jwksResponse.json();

    // Create JWKS key store
    const keyStore = jose.createLocalJWKSet(jwks);

    // Verify token
    const { payload } = await jose.jwtVerify(idToken, keyStore, {
      issuer: config.issuer,
      audience: config.audience,
    });

    return payload as JWTPayload;
  }

  /**
   * Format UserSession from database record
   */
  private formatUserSession(dbSession: any, idTokenPayload: JWTPayload): UserSession {
    const organizationContext = JSON.parse(dbSession.organizationContext);
    
    // Mock available organizations (in real implementation, this would query user's memberships)
    const availableOrganizations: OrganizationContext[] = [{
      id: organizationContext.id,
      name: 'Current Organization',
      slug: 'current-org',
      role: organizationContext.role,
      permissions: dbSession.permissions,
      isDefault: true,
    }];

    return {
      userId: dbSession.userId,
      email: idTokenPayload.email,
      name: idTokenPayload.name,
      currentOrganization: {
        id: organizationContext.id,
        name: 'Current Organization',
        slug: 'current-org',
        role: organizationContext.role,
        permissions: dbSession.permissions,
        isDefault: true,
      },
      availableOrganizations,
      permissions: dbSession.permissions,
      jwtExpiresAt: new Date(idTokenPayload.exp * 1000).toISOString(),
      sessionId: dbSession.sessionId,
      clientId: dbSession.clientId,
      loginTime: dbSession.loginTime.toISOString(),
    };
  }
}
