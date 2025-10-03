import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@skymanuals/prisma';
import {
  Permission,
  RequestContext,
  PermissionCheckResponse,
  AuditEventType,
  AuditSeverity,
} from '@skymanuals/types';

export interface RequestWithContext extends Request {
  context: RequestContext;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    
    try {
      const token = this.extractTokenFromHeader(request);
      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      // Verify and decode session token
      const sessionPayload = await this.jwtService.verifyAsync(token);
      
      // Create request context
      const requestContext: RequestContext = {
        requestId: crypto.randomUUID(),
        userId: sessionPayload.userId,
        organizationId: sessionPayload.organizationId,
        userRole: sessionPayload.role,
        permissions: sessionPayload.permissions || [],
        timestamp: new Date().toISOString(),
        ipAddress: request.headers['x-forwarded-for'] || request.headers['x-real-ip'] || '',
        userAgent: request.headers['user-agent'] || '',
      };

      request.context = requestContext;
      return true;
    } catch (error) {
      this.logger.error('Authentication failed', error);
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers['authorization'];
    const type = authHeader?.split(' ')[0];
    const token = authHeader?.split(' ')[1];
    
    return type === 'Bearer' ? token : undefined;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const requiredPermissions = this.getRequiredPermissions(context);

    if (!requiredPermissions.length) {
      return true; // No permissions required
    }

    if (!request.context) {
      throw new UnauthorizedException('Authentication context not found');
    }

    const userPermissions = request.context.permissions;

    // Check if user has all required permissions
    const missingPermissions = requiredPermissions.filter(
      permission => !userPermissions.includes(permission)
    );

    if (missingPermissions.length > 0) {
      this.logger.warn(
        `Access denied for user ${request.context.userId}. Missing permissions: ${missingPermissions.join(', ')}`
      );
      
      await this.logAuthorizationAttempt(request.context, requiredPermissions, missingPermissions);
      
      throw new ForbiddenException(
        `Missing required permissions: ${missingPermissions.join(', ')}`
      );
    }

    return true;
  }

  private getRequiredPermissions(context: ExecutionContext): Permission[] {
    const handler = context.getHandler();
    const classHandler = context.getClass();
    
    // Get required permissions from decorators
    const classPermissions = this.getMetadata('permissions', classHandler);
    const handlerPermissions = this.getMetadata('permissions', handler);
    
    return [...(classPermissions || []), ...(handlerPermissions || [])];
  }

  private getMetadata(metadataKey: string, target: Function): Permission[] {
    return Reflect.getMetadata(metadataKey, target) || [];
  }

  private async logAuthorizationAttempt(
    context: RequestContext,
    requiredPermissions: Permission[],
    missingPermissions: Permission[]
  ): Promise<void> {
    // In real implementation, this would write to audit log
    this.logger.log(
      `Authorization attempt recorded: User ${context.userId}, Org: ${context.organizationId}, Missing: ${missingPermissions.join(', ')}`
    );
  }
}

@Injectable()
export class OrganizationGuard implements CanActivate {
  private readonly logger = new Logger(OrganizationGuard.name);

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();

    // Check for required organization context
    const organizationId = request.headers['x-org-id'] as string;

    if (!organizationId) {
      throw new ForbiddenException('Organization context is required via x-org-id header');
    }

    if (!request.context) {
      throw new UnauthorizedException('Authentication context not found');
    }

    // Verify requested organization matches user's current organization or available organizations
    if (request.context.organizationId !== organizationId) {
      this.logger.warn(
        `Organization mismatch: User ${request.context.userId} requested org ${organizationId} but current org is ${request.context.organizationId}`
      );
      
      // In a real implementation, you might want to allow switching organizations
      // or validate that the user has access to the requested organization
      
      throw new ForbiddenException('Access denied: Invalid organization context');
    }

    return true;
  }
}

@Injectable()
export class ResourceAccessGuard implements CanActivate {
  private readonly logger = new Logger(ResourceAccessGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    
    if (!request.context) {
      throw new UnauthorizedException('Authentication context not found');
    }

    const resourceType = this.getResourceType(context);
    const resourceId = this.getResourceId(context);

    if (!resourceType || !resourceId) {
      return true; // No specific resource access check required
    }

    const hasAccess = await this.checkResourceAccess(
      request.context,
      resourceType,
      resourceId
    );

    if (!hasAccess) {
      await this.logAccessDenied(request.context, resourceType, resourceId);
      throw new ForbiddenException(`Access denied to ${resourceType}: ${resourceId}`);
    }

    return true;
  }

  private getResourceType(context: ExecutionContext): string {
    const handler = context.getHandler();
    const classHandler = context.getClass();
    
    const handlerResourceType = Reflect.getMetadata('resourceType', handler);
    const classResourceType = Reflect.getMetadata('resourceType', classHandler);
    
    return handlerResourceType || classResourceType;
  }

  private getResourceId(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest();
    
    const handler = context.getHandler();
    const resourceIdParam = Reflect.getMetadata('resourceId', handler);
    
    if (resourceIdParam) {
      return request.params[resourceIdParam];
    }
    
    // Try common parameter names
    return request.params.id || 
           request.params.manualId || 
           request.params.chapterId || 
           request.params.sectionId;
  }

  private async checkResourceAccess(
    context: RequestContext,
    resourceType: string,
    resourceId: string
  ): Promise<boolean> {
    try {
      switch (resourceType) {
        case 'Manual':
          return await this.checkManualAccess(context, resourceId);
        case 'Chapter':
          return await this.checkChapterAccess(context, resourceId);
        case 'Section':
          return await this.checkSectionAccess(context, resourceId);
        case 'Organization':
          return await this.checkOrganizationAccess(context, resourceId);
        default:
          this.logger.warn(`Unknown resource type: ${resourceType}`);
          return true;
      }
    } catch (error) {
      this.logger.error(`Resource access check failed for ${resourceType}:${resourceId}`, error);
      return false;
    }
  }

  private async checkManualAccess(context: RequestContext, manualId: string): Promise<boolean> {
    const manual = await this.prisma.manual.findUnique({
      where: { id: manualId },
      select: { organizationId: true },
    });

    return !!manual && manual.organizationId === context.organizationId;
  }

  private async checkChapterAccess(context: RequestContext, chapterId: string): Promise<boolean> {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { manual: { select: { organizationId: true } } },
    });

    return !!chapter && chapter.manual.organizationId === context.organizationId;
  }

  private async checkSectionAccess(context: RequestContext, sectionId: string): Promise<boolean> {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { chapter: { include: { manual: { select: { organizationId: true } } } } },
    });

    return !!section && section.chapter.manual.organizationId === context.organizationId;
  }

  private async checkOrganizationAccess(context: RequestContext, organizationId: string): Promise<boolean> {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: context.userId,
          organizationId,
        },
      },
    });

    return !!membership;
  }

  private async logAccessDenied(
    context: RequestContext,
    resourceType: string,
    resourceId: string
  ): Promise<void> {
    // In real implementation, this would write to audit log
    this.logger.warn(
      `Access denied: User ${context.userId} attempted to access ${resourceType}:${resourceId}`
    );
  }
}

// Decorator for setting required permissions
export const RequirePermissions = (...permissions: Permission[]) => {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    const targetType = descriptor ? descriptor : target;
    Reflect.defineMetadata('permissions', permissions, targetType);
  };
};

// Decorator for setting resource type
export const ResourceType = (resourceType: string) => {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    const targetType = descriptor ? descriptor : target;
    Reflect.defineMetadata('resourceType', resourceType, targetType);
  };
};

// Decorator for setting resource ID parameter
export const ResourceId = (paramName: string) => {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    const targetType = descriptor ? descriptor : target;
    Reflect.defineMetadata('resourceId', paramName, targetType);
  };
};

// Aggregated Guard combining all security checks
@Injectable()
export class SecurityGuard implements CanActivate {
  constructor(
    private readonly authGuard: AuthGuard,
    private readonly permissionsGuard: PermissionsGuard,
    private readonly organizationGuard: OrganizationGuard,
    private readonly resourceAccessGuard: ResourceAccessGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Authenticate user first
    if (!(await this.authGuard.canActivate(context))) {
      return false;
    }

    // Check organization context
    if (!(await this.organizationGuard.canActivate(context))) {
      return false;
    }

    // Check permissions
    if (!(await this.permissionsGuard.canActivate(context))) {
      return false;
    }

    // Check resource-specific access
    if (!(await this.resourceAccessGuard.canActivate(context))) {
      return false;
    }

    return true;
  }
}
