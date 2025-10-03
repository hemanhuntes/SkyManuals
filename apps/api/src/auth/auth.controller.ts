import {
  Controller,
  Post,
  Body,
  Query,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard, SecurityGuard } from './auth.guard';
import { OIDCService } from './oidc.service';
import { AuditService } from '../audit/audit.service';
import {
  LoginRequest,
  AuthCallback,
  TokenResponse,
  UserSession,
  RequestContext,
} from '@skymanuals/types';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@skymanuals/prisma';
import * as crypto from 'crypto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly oidcService: OIDCService,
    private readonly auditService: AuditService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Initiate OIDC login flow' })
  @ApiResponse({ status: 200, description: 'Login URL generated successfully' })
  async initiateLogin(@Body() loginRequest: LoginRequest) {
    try {
      // Generate state parameter for CSRF protection
      const state = crypto.randomUUID();
      
      // Build authorization URL based on issuer
      const authUrl = await this.buildAuthUrl(loginRequest, state);
      
      return {
        authUrl,
        state,
        clientId: loginRequest.clientId,
      };
    } catch (error) {
      throw new BadRequestException('Failed to initiate login');
    }
  }

  @Post('callback')
  @ApiOperation({ summary: 'Handle OIDC callback' })
  @ApiResponse({ status: 200, description: 'Authentication completed successfully' })
  async handleCallback(
    @Body() callback: AuthCallback,
    @Body('redirectUri') redirectUri: string,
  ): Promise<TokenResponse> {
    try {
      // Exchange code for tokens
      const tokens = await this.oidcService.exchangeCodeForTokens({
        ...callback,
        redirectUri,
      });

      // Extract organization from token or user's profile
      const organizationId = await this.extractOrganizationFromToken(tokens.id_token);
      
      if (!organizationId) {
        throw new UnauthorizedException('No organization associated with user');
      }

      // Create user session
      const session = await this.oidcService.createUserSession(
        jwtDecode(tokens.id_token),
        organizationId,
        callback.clientId,
        callback.iss as any,
        callback.ipAddress,
        callback.userAgent,
      );

      // Generate session token
      const sessionToken = this.oidcService.generateSessionToken(session);

      // Log successful authentication
      const auditContext: RequestContext = {
        requestId: crypto.randomUUID(),
        organizationId,
        userId: session.userId,
        userRole: session.currentOrganization.role,
        permissions: session.permissions,
        timestamp: new Date().toISOString(),
      };

      await this.auditService.logAuthentication(
        auditContext,
        'LOGIN',
        session.userId,
        session.email,
        {
          issuer: callback.iss,
          clientId: callback.clientId,
        },
      );

      return {
        access_token: sessionToken,
        id_token: tokens.id_token,
        refresh_token: tokens.refresh_token,
        token_type: 'Bearer',
        expires_in: 86400, // 24 hours
        scope: 'openid profile email',
        session,
      };
    } catch (error) {
      // Log failed authentication attempt
      const auditContext: RequestContext = {
        requestId: crypto.randomUUID(),
        organizationId: 'unknown',
        userId: 'unknown',
        userRole: 'unknown',
        permissions: [],
        timestamp: new Date().toISOString(),
      };

      await this.auditService.logAuthentication(
        auditContext,
        'LOGIN_FAILED',
        'unknown',
        callback.email || 'unknown',
        {
          error: error.message,
          issuer: callback.iss,
          clientId: callback.clientId,
        },
      );

      throw new UnauthorizedException('Authentication failed');
    }
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Terminate user session' })
  @ApiResponse({ status: 200, description: 'Session terminated successfully' })
  @HttpCode(HttpStatus.OK)
  async logout(@Body('session_token') sessionToken: string) {
    try {
      // Terminate session
      await this.oidcService.terminateSession(sessionToken);

      // Extract context for audit logging
      const sessionPayload = await this.jwtService.verifyAsync(sessionToken);
      
      const auditContext: RequestContext = {
        requestId: crypto.randomUUID(),
        organizationId: sessionPayload.organizationId,
        userId: sessionPayload.userId,
        userRole: sessionPayload.role,
        permissions: sessionPayload.permissions,
        timestamp: new Date().toISOString(),
      };

      await this.auditService.logAuthentication(
        auditContext,
        'LOGOUT',
        sessionPayload.userId,
        sessionPayload.email,
      );

      return { success: true };
    } catch (error) {
      // Even if logout fails, return success to avoid breaking user experience
      return { success: true };
    }
  }

  @Post('switch-organization')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Switch current organization context' })
  @ApiResponse({ status: 200, description: 'Organization context switched successfully' })
  async switchOrganization(
    @Body('session_token') sessionToken: string,
    @Body('organization_id') organizationId: string,
    @Body('client_id') clientId: string,
  ): Promise<UserSession> {
    try {
      const newSession = await this.oidcService.switchOrganization(
        sessionToken,
        organizationId,
        clientId,
      );

      // Generate new session token
      const newSessionToken = this.oidcService.generateSessionToken(newSession);

      return {
        ...newSession,
        sessionToken: newSessionToken,
      };
    } catch (error) {
      throw new BadRequestException('Failed to switch organisation');
    }
  }

  @Get('organizations')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user available organizations' })
  @ApiResponse({ status: 200, description: 'Organizations retrieved successfully' })
  async getAvailableOrganizations(
    @Body('session_token') sessionToken: string,
  ) {
    try {
      const sessionPayload = await this.jwtService.verifyAsync(sessionToken);
      
      // Get user's memberships
      const memberships = await this.prisma.membership.findMany({
        where: { userId: sessionPayload.userId },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      return memberships.map(membership => ({
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        role: membership.role,
      }));
    } catch (error) {
      throw new UnauthorizedException('Failed to get organizations');
    }
  }

  /**
   * Private helper methods
   */
  private async buildAuthUrl(loginRequest: LoginRequest, state: string): Promise<string> {
    const config = this.oidcService['issuerConfigs'].get(loginRequest.issuer);
    if (!config) {
      throw new BadRequestException('Unsupported OIDC issuer');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: loginRequest.clientId,
      redirect_uri: loginRequest.redirectUri,
      scope: loginRequest.scopes.join(' '),
      state,
      nonce: crypto.randomUUID(),
    });

    return `${config.discoveryUrl.split('.well-known')[0]}authorize?${params}`;
  }

  private async extractOrganizationFromToken(idToken: string): Promise<string | null> {
    const decodedToken = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
    
    // Extract organization from token claims
    // This depends on how your OIDC provider structures organization claims
    const orgId = decodedToken.org_roles?.[0]?.organizationId || 
                  decodedToken.organization || 
                  decodedToken['https://skymanuals.com/organization'];

    return orgId || null;
  }
}

// Helper function to decode JWT (in real implementation, use a proper library)
function jwtDecode(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT token');
  }
  return JSON.parse(Buffer.from(parts[1], 'base64').toString());
}
