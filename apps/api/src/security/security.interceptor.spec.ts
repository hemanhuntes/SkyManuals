import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { SecurityInterceptor } from './security.interceptor';
import { TelemetryService } from '../observability/telemetry.service';

describe('SecurityInterceptor', () => {
  let interceptor: SecurityInterceptor;
  let telemetryService: jest.Mocked<TelemetryService>;

  beforeEach(async () => {
    const mockTelemetryService = {
      addSpanAttributes: jest.fn(),
      addSpanEvent: jest.fn(),
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityInterceptor,
        {
          provide: TelemetryService,
          useValue: mockTelemetryService,
        },
      ],
    }).compile();

    interceptor = module.get<SecurityInterceptor>(SecurityInterceptor);
    telemetryService = module.get(TelemetryService) as jest.Mocked<TelemetryService>;
  });

  describe('intercept', () => {
    let mockRequest: any;
    let mockResponse: any;
    let mockContext: ExecutionContext;

    beforeEach(() => {
      mockRequest = {
        url: '/api/test',
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'content-type': 'application/json',
          'content-length': '100',
        },
        body: { test: 'data' },
      };

      mockResponse = {
        header: jest.fn(),
        statusCode: 200,
        getHeader: jest.fn().mockReturnValue('500'),
      };

      mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => mockResponse,
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

    it('should set security headers', (done) => {
      interceptor.intercept(mockContext, {
        handle: () => ({
          pipe: (fn: any) => fn({
            tap: (fn: any) => {
              fn(); // Call tap function
              done();
            },
          }),
        }),
      } as any);

      expect(mockResponse.header).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(mockResponse.header).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(mockResponse.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockResponse.header).toHaveBeenCalledWith('Strict-Transport-Security', expect.stringContaining('max-age=31536000'));
      expect(mockResponse.header).toHaveBeenCalledWith('Content-Security-Policy', expect.stringContaining("default-src 'self'"));
    });

    it('should detect SQL injection attempts', (done) => {
      mockRequest.url = '/api/test?q=SELECT * FROM users WHERE id=1 OR 1=1';
      mockRequest.headers['user-agent'] = 'sqlmap/1.0';

      interceptor.intercept(mockContext, {
        handle: () => ({
          pipe: (fn: any) => fn({
            tap: (fn: any) => {
              fn(); // Call tap function
              done();
            },
          }),
        }),
      } as any);

      // Should trigger security violation logging
      expect(telemetryService.addSpanAttributes).toHaveBeenCalled();
    });

    it('should detect XSS attempts', (done) => {
      mockRequest.url = '/api/test?comment=<script>alert("xss")</script>';
      mockRequest.headers['user-agent'] = 'Mozilla/5.0';

      interceptor.intercept(mockContext, {
        handle: () => ({
          pipe: (fn: any) => fn({
            tap: (fn: any) => {
              fn(); // Call tap function
              done();
            },
          }),
        }),
      } as any);

      expect(telemetryService.addSpanAttributes).toHaveBeenCalled();
    });

    it('should detect path traversal attempts', (done) => {
      mockRequest.url = '/api/files/../../../etc/passwd';

      interceptor.intercept(mockContext, {
        handle: () => ({
          pipe: (fn: any) => fn({
            tap: (fn: any) => {
              fn(); // Call tap function
              done();
            },
          }),
        }),
      } as any);

      expect(telemetryService.addSpanAttributes).toHaveBeenCalled();
    });

    it('should detect suspicious user agents', (done) => {
      mockRequest.headers['user-agent'] = 'sqlmap/1.6.11';

      interceptor.intercept(mockContext, {
        handle: () => ({
          pipe: (fn: any) => fn({
            tap: (fn: any) => {
              fn(); // Call tap function
              done();
            },
          }),
        }),
      } as any);

      expect(telemetryService.addSpanAttributes).toHaveBeenCalled();
    });

    it('should sanitize request body data', () => {
      const sanitizedData = interceptor['sanitizeRequestData']({
        username: 'test',
        password: 'secret123',
        email: 'test@example.com',
        token: 'abc123',
      });

      expect(sanitizedData.username).toBe('test');
      expect(sanitizedData.password).toBe('[REDACTED]');
      expect(sanitizedData.email).toBe('test@example.com');
      expect(sanitizedData.token).toBe('[REDACTED]');
    });

    it('should detect suspicious header values', (done) => {
      mockRequest.headers['host'] = '<script>alert("xss")</script>';
      mockRequest.headers['x-forwarded-host'] = 'evil.com';

      interceptor.intercept(mockContext, {
        handle: () => ({
          pipe: (fn: any) => fn({
            tap: (fn: any) => {
              fn(); // Call tap function
              done();
            },
          }),
        }),
      } as any);

      expect(telemetryService.addSpanAttributes).toHaveBeenCalled();
    });

    it('should handle nested request data sanitization', () => {
      const sanitizedData = interceptor['sanitizeRequestData']({
        user: {
          username: 'test',
          password: 'secret',
          profile: {
            email: 'test@example.com',
            apiKey: 'key123',
          },
        },
        settings: {
          notifications: true,
          secret: 'hidden',
        },
      });

      expect(sanitizedData.user.username).toBe('test');
      expect(sanitizedData.user.password).toBe('[REDACTED]');
      expect(sanitizedData.user.profile.email).toBe('test@example.com');
      expect(sanitizedData.user.profile.apiKey).toBe('[REDACTED]');
      expect(sanitizedData.settings.notifications).toBe(true);
      expect(sanitizedData.settings.secret).toBe('[REDACTED]');
    });
  });

  describe('isSensitiveField', () => {
    it('should identify password fields', () => {
      expect(interceptor['isSensitiveField']('password')).toBe(true);
      expect(interceptor['isSensitiveField']('passwd')).toBe(true);
      expect(interceptor['isSensitiveField']('pwd')).toBe(true);
      expect(interceptor['isSensitiveField']('adminPassword')).toBe(true);
    });

    it('should identify token fields', () => {
      expect(interceptor['isSensitiveField']('token')).toBe(true);
      expect(interceptor['isSensitiveField']('apiKey')).toBe(true);
      expect(interceptor['isSensitiveField']('secretKey')).toBe(true);
      expect(interceptor['isSensitiveField']('accessToken')).toBe(true);
    });

    it('should identify auth fields', () => {
      expect(interceptor['isSensitiveField']('authorization')).toBe(true);
      expect(interceptor['isSensitiveField']('authToken')).toBe(true);
      expect(interceptor['isSensitiveField']('sessionId')).toBe(true);
    });

    it('should not flag non-sensitive fields', () => {
      expect(interceptor['isSensitiveField']('username')).toBe(false);
      expect(interceptor['isSensitiveField']('email')).toBe(false);
      expect(interceptor['isSensitiveField']('firstName')).toBe(false);
      expect(interceptor['isSensitiveField']('data')).toBe(false);
    });
  });

  describe('buildCSPPolicy', () => {
    it('should create comprehensive CSP policy', () => {
      const policy = interceptor['buildCSPPolicy']();

      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("script-src 'self'");
      expect(policy).toContain("style-src 'self'");
      expect(policy).toContain("font-src 'self'");
      expect(policy).toContain("img-src 'self' data: https:");
      expect(policy).toContain("object-src 'none'");
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("upgrade-insecure-requests");
      expect(policy).toContain("block-all-mixed-content");
    });
  });

  describe('detectSuspiciousActivity', () => {
    beforeEach(() => {
      // Mock console.warn to avoid cluttering test output
      jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should detect SQL injection patterns in URL', () => {
      const maliciousUrl = '/api/users?id=1 UNION SELECT * FROM passwords';
      
      interceptor['detectSuspiciousActivity']({
        url: maliciousUrl,
        headers: { 'user-agent': 'Mozilla/5.0' },
        method: 'GET',
      } as any);

      expect(console.warn).toHaveBeenCalledWith(
        '🚨 SECURITY VIOLATION DETECTED:',
        expect.objectContaining({
          violationType: 'SUSPICIOUS_ACTIVITY',
          url: maliciousUrl,
        })
      );
    });

    it('should detect XSS attempts in headers', () => {
      const maliciousHeaders = {
        referer: 'javascript:alert("xss")',
        'user-agent': '<script>alert("xss")</script>',
      };

      interceptor['detectSuspiciousActivity']({
        url: '/api/test',
        headers: maliciousHeaders,
        method: 'GET',
      } as any);

      expect(console.warn).toHaveBeenCalled();
    });

    it('should detect command injection patterns', () => {
      const url = '/api/files?cmd=ls /etc; rm -rf /';
      
      interceptor['detectSuspiciousActivity']({
        url,
        headers: { 'user-agent': 'Mozilla/5.0' },
        method: 'GET',
      } as any);

      expect(console.warn).toHaveBeenCalled();
    });

    it('should not flag legitimate requests', () => {
      interceptor['detectSuspiciousActivity']({
        url: '/api/manuals/123',
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        method: 'GET',
      } as any);

      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
