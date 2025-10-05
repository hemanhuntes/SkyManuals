import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@skymanuals/prisma';
import { Redis } from 'ioredis';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly redis: Redis;
  private readonly config: Record<string, RateLimitConfig> = {
    // API endpoints
    '/api/search/ask': { windowMs: 60000, maxRequests: 60 }, // 60 requests per minute
    '/api/readers': { windowMs: 60000, maxRequests: 120 }, // 120 requests per minute
    '/api/manuals': { windowMs: 60000, maxRequests: 180 }, // 180 requests per minute
    '/api/workflows': { windowMs: 60000, maxRequests: 90 }, // 90 requests per minute
    '/api/compliance': { windowMs: 60000, maxRequests: 60 }, // 60 requests per minute
    '/api/addons': { windowMs: 60000, maxRequests: 150 }, // 150 requests per minute
    
    // Authentication endpoints
    '/api/auth/login': { windowMs: 900000, maxRequests: 5 }, // 5 requests per 15 minutes
    '/api/auth/refresh': { windowMs: 60000, maxRequests: 30 }, // 30 requests per minute
    
    // Hook executions (per installation)
    '/api/addons/hooks': { windowMs: 60000, maxRequests: 300 }, // 300 requests per minute
    
    // File uploads and data intensive operations
    '/api/xml/import': { windowMs: 300000, maxRequests: 10 }, // 10 requests per 5 minutes
    '/api/efb/sync': { windowMs: 300000, maxRequests: 20 }, // 20 requests per 5 minutes
    
    // Global fallback
    default: { windowMs: 60000, maxRequests: 100 }, // 100 requests per minute
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      retryDelayOnFailover: 100,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryDelayOnClusterDown: 300,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    const path = request.route?.path || request.url;
    const method = request.method;
    const identifier = this.getRateLimitKey(request);
    
    // Skip rate limiting for certain conditions
    if (this.shouldSkipRateLimit(request, path)) {
      return true;
    }

    const rateLimitConfig = this.getRateLimitConfig(path, method);
    const key = `rate_limit:${identifier}:${path}`;

    try {
      const current = await this.redis.get(key);
      const count = current ? parseInt(current, 10) : 0;

      if (count >= rateLimitConfig.maxRequests) {
        const ttl = await this.redis.ttl(key);
        const resetTime = Math.floor(Date.now() / 1000) + ttl;
        
        response.set({
          'X-RateLimit-Limit': String(rateLimitConfig.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(resetTime),
          'X-RateLimit-Window': String(rateLimitConfig.windowMs),
        });

        throw new HttpException(
          {
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            rateLimitInfo: {
              limit: rateLimitConfig.maxRequests,
              remaining: 0,
              resetTime: resetTime,
              windowMs: rateLimitConfig.windowMs,
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Increment counter
      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, Math.ceil(rateLimitConfig.windowMs / 1000));
      await pipeline.exec();

      const remaining = rateLimitConfig.maxRequests - (count + 1);
      const ttl = await this.redis.ttl(key);
      const resetTime = Math.floor(Date.now() / 1000) + ttl;

      response.set({
        'X-RateLimit-Limit': String(rateLimitConfig.maxRequests),
        'X-RateLimit-Remaining': String(Math.max(0, remaining)),
        'X-RateLimit-Reset': String(resetTime),
        'X-RateLimit-Window': String(rateLimitConfig.windowMs),
      });

      // Log rate limit metrics for monitoring
      await this.logRateLimitMetrics(identifier, path, count + 1, rateLimitConfig.maxRequests);

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      // If Redis is down, don't block requests but log the error
      console.error('Rate limit Redis error:', error);
      
      // For critical endpoints, enforce basic rate limiting
      if (path.includes('/auth/login')) {
        const cache = this.getInMemoryCache();
        if (cache && cache[identifier] && cache[identifier].count >= 5) {
          throw new HttpException(
            'Rate limit exceeded (fallback mode)',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        this.updateInMemoryCache(identifier);
      }
      
      return true;
    }
  }

  private getRateLimitKey(request: any): string {
    // Prioritize organization-based rate limiting
    const orgId = request.headers['x-org-id'] || 'anonymous';
    
    // Use authenticated user ID if available
    const userId = request.user?.userId || 'anonymous';
    
    // Use IP as fallback
    const clientIP = this.getClientIP(request);
    
    // For authenticated requests, use org+user, otherwise use IP
    return request.user ? `${orgId}:${userId}` : `ip:${clientIP}`;
  }

  private getClientIP(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0] ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      '127.0.0.1'
    );
  }

  private getRateLimitConfig(path: string, method: string): RateLimitConfig {
    // Method-specific overrides
    if (method !== 'GET') {
      const methodConfig = this.config[`${path}:${method}`];
      if (methodConfig) return methodConfig;
    }

    // Path-specific config
    const pathConfig = this.config[path];
    if (pathConfig) return pathConfig;

    // Fallback to default
    return this.config.default;
  }

  private shouldSkipRateLimit(request: any, path: string): boolean {
    // Skip for health checks
    if (path === '/api/health') return true;

    // Skip for webhook endpoints (they have their own validation)
    if (path.includes('/webhooks/')) return true;

    // Skip for internal services (if marked)
    const isInternalService = request.headers['x-internal-service'] === 'true';
    if (isInternalService) return true;

    // Skip for preflight requests
    if (request.method === 'OPTIONS') return true;

    return false;
  }

  private async logRateLimitMetrics(
    identifier: string,
    path: string,
    count: number,
    limit: number,
  ): Promise<void> {
    try {
      // Log to audit system for monitoring
      const isNearLimit = count > limit * 0.8;
      if (isNearLimit) {
        console.warn(`Rate limit approaching: ${identifier} on ${path} (${count}/${limit})`);
      }

      // Update Redis metrics
      const metricsKey = `rate_limit_metrics:${new Date().toISOString().split('T')[0]}`;
      await this.redis.hincrby(metricsKey, `${path}:requests`, 1);
      
      if (isNearLimit) {
        await this.redis.hincrby(metricsKey, `${path}:near_limit`, 1);
      }
      
      await this.redis.expire(metricsKey, 86400 * 7); // Keep for 7 days
    } catch (error) {
      console.error('Failed to log rate limit metrics:', error);
    }
  }

  // In-memory fallback cache (for critical endpoints when Redis is down)
  private inMemoryCache: Map<string, { count: number; resetTime: number }> = new Map();
  
  private getInMemoryCache(): Record<string, { count: number; resetTime: number }> {
    const now = Date.now();
    const cache: Record<string, { count: number; resetTime: number }> = {};
    
    for (const [key, value] of this.inMemoryCache.entries()) {
      if (value.resetTime > now) {
        cache[key] = value;
      }
    }
    
    return cache;
  }

  private updateInMemoryCache(identifier: string): void {
    const now = Date.now();
    const existing = this.inMemoryCache.get(identifier);
    
    if (existing && !existing.resetTime || existing.resetTime <= now) {
      this.inMemoryCache.set(identifier, { count: 1, resetTime: now + 900000 }); // 15 minutes
    } else if (existing) {
      existing.count++;
    } else {
      this.inMemoryCache.set(identifier, { count: 1, resetTime: now + 900000 });
    }
  }
}






