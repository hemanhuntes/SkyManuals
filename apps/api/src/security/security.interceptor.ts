import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler invoker
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class SecurityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();

    // Apply security headers
    this.setSecurityHeaders(response);

    // Log suspicious activity
    this.detectSuspiciousActivity(request);

    return next.handle().pipe(
      tap(() => {
        // Post-response security checks
        this.logSecurityMetrics(request, response);
      }),
    );
  }

  private setSecurityHeaders(response. FastifyReply): void {
    const securityHeaders = {
      // Prevent clickjacking
      'X-Frame-Options': 'DENY',
      
      // XSS Protection (legacy but still used by older browsers)
      'X-XSS-Protection': '1; mode=block',
      
      // Prevent MIME type sniffing
      'X-Content-Type-Options': 'nosniff',
      
      // Strict Transport Security (HTTPS only)
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      
      // Content Security Policy
      'Content-Security-Policy': this.buildCSPPolicy(),
      
      // Referrer Policy (privacy enhancement)
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      
      // Permissions Policy (disable unnecessary browser APIs)
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
      
      // Cache Control for sensitive endpoints
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      
      // Custom SkyManuals security header
      'X-SkyManuals-Version': process.env.SKYMANUALS_VERSION || '1.0.0',
      'X-SkyManuals-Security': 'enabled',
    };

    Object.entries(securityHeaders).forEach(([header, value]) => {
      response.header(header, value);
    });
  }

  private buildCSPPolicy(): string {
    const policies = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.skymanuals.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.skymanuals.com",
      "font-src 'self' https://fonts.gstatic.com https://cdn.skymanuals.com",
      "img-src 'self' data: https: blob:",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
      "block-all-mixed-content",
    ];

    return policies.join('; ');
  }

  private detectSuspiciousActivity(request: FastifyRequest): void {
    const suspiciousPatterns = [
      // SQL injection attempts
      /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b)[\s\S]*?\bFROM\b/i,
      /(\bUNION\b|\bSELECT\b)[\s\S]*?(\b--\b|\b#\b|\b\/\*)/i,
      
      // XSS attempts
      /<script[\s\S]*?>[\s\S]*?<\/script>/i,
      /javascript:/i,
      /vbscript:/i,
      /data:text\/html/i,
      
      // Path traversal attempts
      /\.\.(\/|\\)/,
      /%2e%2e(\/|\\)/i,
      /%252e%252e(\/|\\)/i,
      
      // Command injection attempts
      /(\||`|\$\(|\bcmd\b|\bshell\b|\bexec\b)[\s\S]*?(\||`|;)/i,
      
      // Common attack signatures
      /\b(payload|exploit|attack|malware|trojan)\b/i,
    ];

    const url = request.url;
    const userAgent = request.headers['user-agent'] || '';
    const referer = request.headers.referer || '';
    
    // Check URL and headers for suspicious patterns
    const allText = `${url} ${userAgent} ${referer}`;
    
    suspiciousPatterns.forEach((pattern) => {
      if (pattern.test(allText)) {
        this.logSecurityViolation(request, 'SUSPICIOUS_ACTIVITY', {
          pattern: pattern.toString(),
          url,
          userAgent,
          referer,
        });
      }
    });

    // Check for suspicious headers
    this.checkSuspiciousHeaders(request);
  }

  private checkSuspiciousHeaders(request: FastifyRequest): void {
    const suspiciousHeaders = [
      'x-forwarded-host',
      'x-original-url', 
      'x-rewrite-url',
      'x-real-ip',
      'forwarded',
      'x-cluster-client-ip',
      'host',
    ];

    suspiciousHeaders.forEach(header => {
      const value = request.headers[header];
      if (typeof value === 'string' && this.looksLikeInjection(value)) {
        this.logSecurityViolation(request, 'HEADER_INJECTION', {
          header,
          value,
        });
      }
    });

    // Check for unusual User-Agent patterns
    const userAgent = request.headers['user-agent'];
    if (userAgent && this.isSuspiciousUserAgent(userAgent)) {
      this.logSecurityViolation(request, 'SUSPICIOUS_USER_AGENT', {
        userAgent,
      });
    }
  }

  private looksLikeInjection(text: string): boolean {
    const injectionPatterns = [
      /<script/i,
      /javascript:/i,
      /\.\.(\/|\\)/,
      /union.*select/i,
      /select.*from/i,
      /insert.*into/i,
      /drop.*table/i,
      /'.*or.*'.*=/i,
    ];

    return injectionPatterns.some(pattern => pattern.test(text));
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousUAs = [
      'sqlmap',
      'nikto',
      'nmap',
      'masscan',
      'zmap',
      'wget',
      'curl',
      'python-requests',
      'awis',
      'bot',
    ];

    return suspiciousUAs.some(suspicious => 
      userAgent.toLowerCase().includes(suspicious.toLowerCase())
    );
  }

  private logSecurityViolation(
    request: FastifyRequest,
    violationType: string,
    details: any,
  ): void {
    const securityEvent = {
      violationType,
      timestamp: new Date().toISOString(),
      ip: this.getClientIP(request),
      userAgent: request.headers['user-agent'],
      url: request.url,
      method: request.method,
      organizationId: request.headers['x-org-id'],
      userId: (request as any).user?.userId,
      details,
      severity: this.getThreatSeverity(violationType),
    };

    // Log to console immediately for real-time monitoring
    console.warn('🚨 SECURITY VIOLATION DETECTED:', securityEvent);

    // Store in database for investigation
    this.storeSecurityViolation(securityEvent);

    // In production, send to security monitoring system
    if (process.env.NODE_ENV === 'production') {
      this.sendSecurityAlert(securityEvent);
    }
  }

  private logSecurityMetrics(
    request: FastifyRequest,
    response: FastifyReply,
  ): void {
    const metrics = {
      requestId: response.getHeader('x-request-id'),
      organizationId: request.headers['x-org-id'],
      endpoint: request.url,
      method: request.method,
      statusCode: response.statusCode,
      responseTime: response.getResponseTime?.() || 0,
      userAgent: request.headers['user-agent'],
      ip: this.getClientIP(request),
      timestamp: new Date().toISOString(),
    };

    // Update security metrics in Redis or other metrics store
    this.updateSecurityMetrics(metrics);
  }

  private getClientIP(request: FastifyRequest): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0] ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      '127.0.0.1'
    );
  }

  private getThreatSeverity(violationType: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const severityMap = {
      'SUSPICIOUS_USER_AGENT': 'LOW',
      'HEADER_INJECTION': 'MEDIUM',
      'SUSPICIOUS_ACTIVITY': 'HIGH',
      'SQL_INJECTION': 'CRITICAL',
      'XSS_ATTEMPT': 'HIGH',
      'PATH_TRAVERSAL': 'HIGH',
      'COMMAND_INJECTION': 'CRITICAL',
    };

    return severityMap[violationType] || 'MEDIUM';
  }

  private async storeSecurityViolation(violation: any): Promise<void> {
    try {
      // Store in dedicated security violations table
      // This would use PrismaService in actual implementation
      console.log('Security violation stored:', violation);
    } catch (error) {
      console.error('Failed to store security violation:', error);
    }
  }

  private async sendSecurityAlert(violation: any): Promise<void> {
    try {
      // Send to security monitoring system (e.g., AWS GuardDuty, Azure Security Center)
      console.log('Security alert sent:', violation);
    } catch (error) {
      console.error('Failed to send security alert:', error);
    }
  }

  private async updateSecurityMetrics(metrics: any): Promise<void> {
    try {
      // Update security metrics in monitoring system
      console.log('Security metrics:', metrics);
    } catch (error) {
      console.error('Failed to update security metrics:', error);
    }
  }
}






