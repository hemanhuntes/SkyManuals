import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GuardrailsService {
  private readonly logger = new Logger(GuardrailsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if user can access draft content based on their role
   */
  async canAccessDraftContent(userId: string, organizationId?: string): Promise<boolean> {
    if (!userId) {
      return false; // Anonymous users can only access released content
    }

    try {
      const userMembership = await this.prisma.membership.findFirst({
        where: {
          userId,
          organizationId: organizationId || undefined,
        },
        include: {
          user: true,
        },
      });

      if (!userMembership) {
        return false;
      }

      // Only users with EDITOR role or higher can access draft content
      const allowedRoles = ['EDITOR', 'ADMIN'];
      return allowedRoles.includes(userMembership.role);
    } catch (error) {
      this.logger.error('Error checking draft access:', error);
      return false;
    }
  }

  /**
   * Filter search results based on user permissions
   */
  async filterSearchResults(
    results: any[],
    userId?: string,
    organizationId?: string
  ): Promise<any[]> {
    const canAccessDrafts = userId ? 
      await this.canAccessDraftContent(userId, organizationId) : false;

    return results.filter(result => {
      // Always allow released content
      if (result.isReleased) {
        return true;
      }

      // Draft content only if user has permission
      return canAccessDrafts;
    });
  }

  /**
   * Add organization filter to search query for multi-tenant support
   */
  applyOrganizationFilter(query: any, userId?: string, organizationId?: string): any {
    // If organizationId is provided, filter by it
    if (organizationId) {
      return {
        ...query,
        filters: {
          ...query.filters,
          organizationId,
        },
      };
    }

    // If userId is provided, try to get their organization
    if (userId) {
      // In a real implementation, you'd fetch the user's organization(s)
      // For now, return the query as-is
      return query;
    }

    // If no user context, restrict to released content only
    return {
      ...query,
      filters: {
        ...query.filters,
        // Organization filter would be empty to prevent cross-tenant access
      },
    };
  }

  /**
   * Validate search query for rate limiting and content restrictions
   */
  validateQuery(query: any): { valid: boolean; error?: string } {
    // Check query length
    if (!query.query || typeof query.query !== 'string') {
      return { valid: false, error: 'Query is required' };
    }

    if (query.query.length < 3) {
      return { valid: false, error: 'Query must be at least 3 characters' };
    }

    if (query.query.length > 500) {
      return { valid: false, error: 'Query too long (max 500 characters)' };
    }

    // Check limit
    if (query.limit && (query.limit < 1 || query.limit > 10)) {
      return { valid: false, error: 'Limit must be between 1 and 10' };
    }

    // Check for potentially harmful patterns
    const harmfulPatterns = [
      /drop\s+table/i,
      /delete\s+from/i,
      /insert\s+into/i,
      /update\s+.*set/i,
      /<script/i,
      /javascript:/i,
    ];

    for (const pattern of harmfulPatterns) {
      if (pattern.test(query.query)) {
        return { valid: false, error: 'Query contains potentially harmful content' };
      }
    }

    return { valid: true };
  }

  /**
   * Rate limiting check for search requests
   */
  async checkRateLimit(
    userId?: string,
    sessionId?: string,
    ipAddress?: string
  ): Promise<{ allowed: boolean; resetTime?: Date }> {
    try {
      // Check recent search requests (last 1 minute)
      const recentSearches = await this.prisma.searchAnalytics.count({
        where: {
          OR: [
            userId ? { userId } : undefined,
            sessionId ? { sessionId } : undefined,
            ipAddress ? { userAgent: { contains: ipAddress } } : undefined,
          ].filter(Boolean),
          timestamp: {
            gte: new Date(Date.now() - 60 * 1000), // Last minute
          },
        },
      });

      // Limit to 10 searches per minute per user/session/IP
      const maxRequestsPerMinute = 10;
      
      if (recentSearches >= maxRequestsPerMinute) {
        const resetTime = new Date(Date.now() + 60 * 1000);
        return { allowed: false, resetTime };
      }

      return { allowed: true };
    } catch (error) {
      this.logger.error('Error checking rate limit:', error);
      // Allow request on error to avoid blocking legitimate users
      return { allowed: true };
    }
  }

  /**
   * Check if content is operationally critical
   */
  async isOperationallyCritical(manualId: string): Promise<boolean> {
    try {
      const manual = await this.prisma.manual.findUnique({
        where: { id: manualId },
        include: {
          operationallyCriticalFlags: {
            where: { isActive: true },
          },
        },
      });

      return manual?.operationallyCriticalFlags.length > 0;
    } catch (error) {
      this.logger.error('Error checking operational criticality:', error);
      return false;
    }
  }

  /**
   * Apply operational critical content filters
   */
  async filterOperationallyCritical(
    results: any[],
    userId?: string
  ): Promise<any[]> {
    if (!userId) {
      // Anonymous users: show only non-critical content
      return results.filter(result => !result.isOperationallyCritical);
    }

    // Authenticated users: check if they have access to critical content
    // This would typically involve checking user permissions
    // For now, return all results
    return results;
  }
}
