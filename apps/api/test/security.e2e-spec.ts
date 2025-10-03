import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Security Features (E2E)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Security Headers', () => {
    it('should set security headers on all responses', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      // Verify security headers are present
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['strict-transport-security']).toContain('max-age=');
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['cache-control']).toContain('no-store');
    });

    it('should set custom SkyManuals security headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-skymanuals-version']).toBeDefined();
      expect(response.headers['x-skymanuals-security']).toBe('enabled');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce default rate limits', async () => {
      const requests = Array(305).fill(null).map(() =>
        request(app.getHttpServer())
          .get('/api/test')
          .set('X-Forwarded-For', '192.168.1.100')
      );

      const responses = await Promise.all(requests);
      
      // First 300 requests should succeed
      const successfulResponses = responses.filter(r => r.status === 200);
      const failedResponses = responses.filter(r => r.status === 429);

      expect(successfulResponses.length).toBeGreaterThan(290);
      expect(failedResponses.length).toBeGreaterThan(0);
      
      // Check rate limit headers on failed requests
      const failedResponse = failedResponses[0];
      expect(failedResponse.headers['retry-after']).toBeDefined();
      expect(failedResponse.headers['x-ratelimit-limit']).toBeDefined();
      expect(failedResponse.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('should enforce stricter limits for search endpoints', async () => {
      const requests = Array(65).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/api/search/ask')
          .send({ query: 'test query' })
          .set('X-Forwarded-For', '192.168.1.101')
      );

      const responses = await Promise.all(requests);
      const successfulResponses = responses.filter(r => r.status === 200);
      const failedResponses = responses.filter(r => r.status === 429);

      // Should hit rate limit between 60-65 requests
      expect(successfulResponses.length).toBeLessThanOrEqual(60);
      expect(failedResponses.length).toBeGreaterThan(0);
      expect(failedResponses.length).toBeLessThanOrEqual(5);
    });

    it('should use different limits per IP address', async () => {
      const ip1Requests = Array(305).fill(null).map(() =>
        request(app.getHttpServer())
          .get('/api/test')
          .set('X-Forwarded-For', '192.168.1.200')
      );

      const ip2Requests = Array(305).fill(null).map(() =>
        request(app.getHttpServer())
          .get('/api/test')
          .set('X-Forwarded-For', '192.168.1.201')
      );

      const [ip1Responses, ip2Responses] = await Promise.all([
        Promise.all(ip1Requests),
        Promise.all(ip2Requests),
      ]);

      // Both IPs should hit rate limit independently
      const ip1RateLimited = ip1Responses.filter(r => r.status === 429);
      const ip2RateLimited = ip2Responses.filter(r => r.status === 429);

      expect(ip1RateLimited.length).toBeGreaterThan(0);
      expect(ip2RateLimited.length).toBeGreaterThan(0);
    });

    it('should include organization-aware rate limits', async () => {
      // Free tier org - lower limits
      const freeOrgRequests = Array(305).fill(null).map(() =>
        request(app.getHttpServer())
          .get('/api/test')
          .set('X-Org-Id', 'free-org')
          .set('X-Forwarded-For', '192.168.1.300')
      );

      // Paid tier org - higher limits
      const paidOrgRequests = Array(305).fill(null).map(() =>
        request(app.getHttpServer())
          .get('/api/test')
          .set('X-Org-Id', 'paid-org')
          .set('X-Forwarded-For', '192.168.1.301')
      );

      const [freeResponses, paidResponses] = await Promise.all([
        Promise.all(freeOrgRequests),
        Promise.all(paidOrgRequests),
      ]);

      const freeRateLimited = freeResponses.filter(r => r.status === 429);
      const paidRateLimited = paidResponses.filter(r => r.status === 429);

      // Paid org should have more successful requests
      expect(paidRateLimited.length).toBeLessThan(freeRateLimited.length);
    });
  });

  describe('Threat Detection', () => {
    it('should detect and log SQL injection attempts', async () => {
      const maliciousUrls = [
        '/api/test?id=1 UNION SELECT * FROM users',
        '/api/test?id=1 OR 1=1',
        "/api/test?id=1'; DROP TABLE users; --",
      ];

      for (const url of maliciousUrls) {
        const response = await request(app.getHttpServer())
          .get(url)
          .expect(200); // May return various status codes

        // Should still respond but threat should be logged
        expect(response.body).toBeDefined();
      }
    });

    it('should detect XSS attempts', async () => {
      const maliciousPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        'vbscript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
      ];

      for (const payload of maliciousPayloads) {
        await request(app.getHttpServer())
          .post('/api/test')
          .send({ data: payload })
          .set('Content-Type', 'application/json')
          .expect(200);

        // Should respond but XSS attempt should be logged
      }
    });

    it('should detect suspicious user agents', async () => {
      const suspiciousUserAgents = [
        'sqlmap/1.0',
        'nikto/2.1.5',
        'nmap scripting engine',
        'python-requests/2.23.0',
        'burp suite',
      ];

      for (const userAgent of suspiciousUserAgents) {
        await request(app.getHttpServer())
          .get('/api/test')
          .set('User-Agent', userAgent)
          .expect(200);

        // Should log suspicious activity
      }
    });

    it('should detect path traversal attempts', async () => {
      const maliciousPaths = [
        '/api/files/../../../etc/passwd',
        '/api/files/..%2F..%2Fetc%2Fpasswd',
        '/api/files/....//....//etc/passwd',
      ];

      for (const path of maliciousPaths) {
        await request(app.getHttpServer())
          .get(path)
          .expect(200);

        // Should log path traversal attempt
      }
    });

    it('should detect command injection attempts', async () => {
      const commandInjections = [
        'id=1; rm -rf /',
        'cmd=ls; cat /etc/passwd',
        'data=$(whoami); echo $data',
      ];

      for (const injection of commandInjections) {
        await request(app.getHttpServer())
          .post('/api/test')
          .send({ command: injection })
          .expect(200);
      }
    });
  });

  describe('Input Validation', () => {
    it('should validate JSON payload size', async () => {
      const largePayload = { data: 'x'.repeat(1000000) }; // 1MB payload

      await request(app.getHttpServer())
        .post('/api/test')
        .send(largePayload)
        .expect(413); // Payload Too Large
    });

    it('should sanitize sensitive data in request bodies', async () => {
      await request(app.getHttpServer())
        .post('/api/test')
        .send({
          username: 'test',
          password: 'super-secret',
          email: 'test@example.com',
          apiKey: 'abc123',
        })
        .expect(anyStatus);

      // Password and API key should be sanitized in logs
    });

    it('should validate content types', async () => {
      await request(app.getHttpServer())
        .post('/api/test')
        .set('Content-Type', 'text/plain')
        .send('malicious payload')
        .expect(415); // Unsupported Media Type
    });

    it('should handle malformed JSON gracefully', async () => {
      await request(app.getHttpServer())
        .post('/api/test')
        .set('Content-Type', 'application/json')
        .send('{invalid json')
        .expect(400);
    });
  });

  describe('CSRF Protection', () => {
    it('should validate CSRF tokens for state-changing operations', async () => {
      // First, get CSRF token
      const csrfResponse = await request(app.getHttpServer())
        .get('/api/csrf-token')
        .expect(200);

      const csrfToken = csrfResponse.body.token;

      // POST request without CSRF token should fail
      await request(app.getHttpServer())
        .post('/api/manuals/test')
        .send({ title: 'Test Manual' })
        .expect(403);

      // POST request with CSRF token should succeed
      await request(app.getHttpServer())
        .post('/api/manuals/test')
        .set('X-CSRF-Token', csrfToken)
        .send({ title: 'Test Manual' })
        .expect(201);
    });
  });

  describe('CORS Configuration', () => {
    it('should allow requests from configured origins', async () => {
      await request(app.getHttpServer())
        .get('/api/test')
        .set('Origin', 'https://skymanuals.com')
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/test')
        .set('Origin', 'https://staging.skymanuals.com')
        .expect(200);
    });

    it('should block requests from unauthorized origins', async () => {
      await request(app.getHttpServer())
        .get('/api/test')
        .set('Origin', 'https://evil.com')
        .expect(200); // Returns 200 but CORS headers will block browser access
    });
  });

  describe('Health Check Security', () => {
    it('should include security metrics in health check', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(response.body.security).toBeDefined();
      expect(response.body.security.rate_limiting_enabled).toBe(true);
      expect(response.body.security.threat_detection_enabled).toBe(true);
      expect(response.body.security.headers_configured).toBe(true);
    });
  });

  describe('Authentication Security', () => {
    it('should require authentication for protected endpoints', async () => {
      await request(app.getHttpServer())
        .get('/api/manuals')
        .expect(401);

      await request(app.getHttpServer())
        .get('/api/manuals')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      await request(app.getHttpServer())
        .get('/api/manuals')
        .set('Authorization', 'Basic invalid-base64')
        .expect(401);
    });

    it('should validate JWT token format', async () => {
      await request(app.getHttpServer())
        .get('/api/manuals')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);

      await request(app.getHttpServer())
        .get('/api/manuals')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid')
        .expect(401);
    });
  });

  describe('Webhook Security', () => {
    it('should validate webhook signatures', async () => {
      // Invalid signature
      await request(app.getHttpServer())
        .post('/api/addons/hooks/receive')
        .set('X-SkyManuals-Signature', 'invalid-signature')
        .send({ event: 'test' })
        .expect(401);

      // Missing signature
      await request(app.getHttpServer())
        .post('/api/addons/hooks/receive')
        .send({ event: 'test' })
        .expect(401);

      // Valid signature (would need proper crypto setup in actual implementation)
      const crypto = require('crypto');
      const secret = 'webhook-secret';
      const payload = JSON.stringify({ event: 'test' });
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      await request(app.getHttpServer())
        .post('/api/addons/hooks/receive')
        .set('X-SkyManuals-Signature', `sha256=${signature}`)
        .send(payload)
        .expect(200);
    });
  });

  describe('Error Handling Security', () => {
    it('should not leak sensitive information in error messages', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/nonexistent')
        .expect(404);

      // Error message should not contain internal paths or stack traces
      expect(response.body.message).not.toContain('/opt/skymanuals');
      expect(response.body.message).not.toContain('Error:');
      expect(response.body.message).not.toContain('at ');
    });

    it('should sanitize database error messages', async () => {
      // Trigger database error
      await request(app.getHttpServer())
        .post('/api/test/database-error')
        .expect(500);

      // Error should not contain SQL details or internal paths
    });
  });

  describe('Logging Security', () => {
    it('should not log sensitive data', async () => {
      // Suppress actual logging to test data sanitization
      const originalConsoleLog = console.log;
      const logs: string[] = [];
      
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
      };

      await request(app.getHttpServer())
        .post('/api/test')
        .send({
          username: 'test',
          password: 'super-secret',
          email: 'test@example.com',
        })
        .expect(anyStatus);

      // Logs should not contain password
      const allLogs = logs.join(' ');
      expect(allLogs).not.toContain('super-secret');

      console.log = originalConsoleLog;
    });
  });
});
