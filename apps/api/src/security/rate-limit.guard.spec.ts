import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';
import { RedisService } from '../redis/redis.service';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let redisService: jest.Mocked<RedisService>;
  let mockContext: ExecutionContext;

  beforeEach(async () => {
    const mockRedisService = {
      incrementWithExpiry: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      quit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;

    // Mock execution context
    mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/api/test',
          headers: {
            'x-org-id': 'test-org',
            'user-agent': 'test-agent',
            'x-forwarded-for': '192.168.1.1',
          },
          ip: '192.168.1.1',
        }),
      }),
      getHandlers: jest.fn(),
      getClass: jest.fn(),
      getHandler: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn().mockReturnValue('http'),
    } as unknown as ExecutionContext;
  });

  describe('canActivate', () => {
    it('should allow requests under rate limit', async () => {
      redisService.incrementWithExpiry.mockResolvedValue(5);
      redisService.get.mockResolvedValue(null);

      const result = await guard.canActivate({
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'GET',
            url: '/api/test',
            headers: { 'x-org-id': 'test-org' },
            ip: '192.168.1.1',
          }),
        }),
      } as ExecutionContext);

      expect(result).toBe(true);
      expect(redisService.incrementWithExpiry).toHaveBeenCalledWith(
        'rate_limit:GET:/api/test:192.168.1.1',
        1,
        3600
      );
    });

    it('should block requests exceeding rate limit', async () => {
      redisService.incrementWithExpiry.mockResolvedValue(301);

      await expect(
        guard.canActivate({
          ...mockContext,
          switchToHttp: () => ({
            getRequest: () => ({
              method: 'GET',
              url: '/api/test',
              headers: { 'x-org-id': 'test-org' },
              ip: '192.168.1.1',
            }),
          }),
        } as ExecutionContext)
      ).rejects.toThrow(ForbiddenException);

      expect(redisService.incrementWithExpiry).toHaveBeenCalledTimes(1);
    });

    it('should handle different rate limits for different endpoints', async () => {
      redisService.incrementWithExpiry.mockResolvedValue(45);

      // Test search endpoint with lower limit
      await guard.canActivate({
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            url: '/api/search/ask',
            headers: { 'x-org-id': 'test-org' },
            ip: '192.168.1.1',
          }),
        }),
      } as ExecutionContext);

      expect(redisService.incrementWithExpiry).toHaveBeenCalledWith(
        'rate_limit:POST:/api/search/ask:192.168.1.1',
        1,
        3600
      );
    });

    it('should use organization-aware limits', async () => {
      const mockOrgService = { getOrganizationTier: jest.fn().mockResolvedValue('PAID') };
      guard['organizationService'] = mockOrgService as any;
      redisService.incrementWithExpiry.mockResolvedValue(120);

      await guard.canActivate({
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'GET',
            url: '/api/test',
            headers: { 'x-org-id': 'paid-org' },
            ip: '192.168.1.1',
          }),
        }),
      } as ExecutionContext);

      expect(mockOrgService.getOrganizationTier).toHaveBeenCalledWith('paid-org');
      expect(result).toBe(true);
    });

    it('should handle Redis failures gracefully', async () => {
      redisService.incrementWithExpiry.mockRejectedValue(new Error('Redis connection failed'));

      // Should use fallback in-memory rate limiting
      const result = await guard.canActivate({
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'GET',
            url: '/api/test',
            headers: { 'x-org-id': 'test-org' },
            ip: '192.168.1.1',
          }),
        }),
      } as ExecutionContext);

      expect(result).toBe(true); // Fallback should allow
    });

    it('should extract client IP correctly from various headers', async () => {
      redisService.incrementWithExpiry.mockResolvedValue(5);

      const testCases = [
        { headers: { 'x-forwarded-for': '1.2.3.4' }, expectedIP: '1.2.3.4' },
        { headers: { 'x-real-ip': '5.6.7.8' }, expectedIP: '5.6.7.8' },
        { headers: { 'cf-connecting-ip': '8.8.8.8' }, expectedIP: '8.8.8.8' },
        { headers: {}, expectedIP: '127.0.0.1' }, // Localhost fallback
      ];

      for (const testCase of testCases) {
        await guard.canActivate({
          ...mockContext,
          switchToHttp: () => ({
            getRequest: () => ({
              method: 'GET',
              url: '/api/test',
              headers: testCase.headers,
              ip: '127.0.0.1',
            }),
          }),
        } as ExecutionContext);

        expect(redisService.incrementWithExpiry).toHaveBeenCalledWith(
          expect.stringContaining(testCase.expectedIP),
          1,
          3600
        );
      }
    });
  });

  describe('getRateLimit', () => {
    it('should return correct rate limits for different patterns', () => {
      expect(guard['getRateLimit']('POST', '/api/search/ask')).toBe(60); // 60/min
      expect(guard['getRateLimit']('GET', '/api/readers')).toBe(120); // 120/min
      expect(guard['getRateLimit']('POST', '/api/addons/hooks')).toBe(300); // 300/min
      expect(guard['getRateLimit']('GET', '/api/test')).toBe(300); // Default 300/min
    });

    it('should handle webhook endpoints with higher limits', () => {
      expect(guard['getRateLimit']('POST', '/api/addons/webhooks/receive')).toBe(300);
      expect(guard['getRateLimit']('GET', '/api/addons/webhooks/test')).toBe(300);
    });
  });

  describe('extractClientIp', () => {
    it('should prioritize forwarded headers', () => {
      const request = {
        headers: {
          'x-forwarded-for': '1.2.3.4',
          'x-real-ip': '5.6.7.8',
          'cf-connecting-ip': '8.8.8.8',
        },
        connection: { remoteAddress: '192.168.1.1' },
      } as any;

      const clientIp = guard['extractClientIp'](request);
      expect(clientIp).toBe('1.2.3.4'); // Should use first x-forwarded-for
    });

    it('should handle CloudFlare headers', () => {
      const request = {
        headers: {
          'cf-connecting-ip': '8.8.8.8',
        },
        connection: { remoteAddress: '192.168.1.1' },
      } as any;

      const clientIp = guard['extractClientIp'](request);
      expect(clientIp).toBe('8.8.8.8');
    });

    it('should fallback to connection remoteAddress', () => {
      const request = {
        headers: {},
        connection: { remoteAddress: '192.168.1.1' },
      } as any;

      const clientIp = guard['extractClientIp'](request);
      expect(clientIp).toBe('192.168.1.1');
    });
  });

  describe('getOrganizationAwareLimit', () => {
    beforeEach(() => {
      guard['organizationService'] = {
        getOrganizationTier: jest.fn().mockResolvedValue('FREE'),
      } as any;
    });

    it('should return increased limits for paid organizations', async () => {
      guard['organizationService'].getOrganizationTier.mockResolvedValue('PAID');
      
      const limit = await guard['getOrganizationAwareLimit'](60, 'paid-org');
      expect(limit).toBe(120); // 2x multiplier for paid
    });

    it('should return premium limits for enterprise organizations', async () => {
      guard['organizationService'].getOrganizationTier.mockResolvedValue('ENTERPRISE');
      
      const limit = await guard['getOrganizationAwareLimit'](60, 'enterprise-org');
      expect(limit).toBe(300); // 5x multiplier for enterprise
    });

    it('should fallback to base limit for free tier', async () => {
      guard['organizationService'].getOrganizationTier.mockResolvedValue('FREE');
      
      const limit = await guard['getOrganizationAwareLimit'](60, 'free-org');
      expect(limit).toBe(60); // No multiplier for free
    });

    it('should handle service failures gracefully', async () => {
      guard['organizationService'].getOrganizationTier.mockRejectedValue(new Error('Service error'));
      
      const limit = await guard['getOrganizationAwareLimit'](60, 'error-org');
      expect(limit).toBe(60); // Should fallback to base limit
    });
  });
});
