import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { FastifyRequest, FastifyReply } from 'fastify';
import { TelemetryService } from './telemetry.service';
import { RequestContext } from '@skymanuals/types';

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(private readonly telemetryService: TelemetryService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    
    const startTime = Date.now();
    const correlationId = this.extractCorrelationId(request) || this.generateCorrelationId();
    
    // Set correlation ID in response headers
    response.header('X-Correlation-ID', correlationId);
    response.header('X-Request-ID', correlationId);
    
    // Create span with request context
    const span = this.telemetryService.startSpan(`HTTP ${request.method} ${request.route?.path || request.url}`);
    
    // Set initial span attributes
    span.setAttributes({
      'http.method': request.method,
      'http.url': request.url,
      'http.route': request.route?.path || '',
      'http.user_agent': request.headers['user-agent'] || '',
      'http.content_type': request.headers['content-type'] || '',
      'http.content_length': parseInt(request.headers['content-length'] || '0'),
      'organization.id': request.headers['x-org-id'] || 'unknown',
      'user.id': (request as any).user?.userId || 'anonymous',
      'request.id': correlationId,
      'user.session_id': (request as any).user?.sessionId || '',
      'service.name': 'skymanuals-api',
      'service.version': process.env.SKYMANUALS_VERSION || '1.0.0',
    });

    // Add request body attributes (sanitized)
    if (request.body && typeof request.body === 'object') {
      const sanitizedBody = this.sanitizeRequestData(request.body);
      span.setAttributes({
        'request.body.size': JSON.stringify(sanitizedBody).length,
        'request.body.keys': Object.keys(sanitizedBody).join(','),
      });
    }

    // Set trace context for nested operations
    this.telemetryService.setCorrelationId(correlationId);

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        
        // Record successful request metrics
        this.telemetryService.recordRequest({
          method: request.method,
          path: request.route?.path || request.url,
          statusCode: response.statusCode || 200,
          duration,
          organizationId: request.headers['x-org-id'],
        });
        
        // Update span with response attributes
        span.setAttributes({
          'http.status_code': response.statusCode || 200,
          'response.duration_ms': duration,
          'response.size': parseInt(response.getHeader('content-length') || '0'),
        });
        
        span.addEvent('request.completed', {
          duration_ms: duration,
          success: true,
        });
        
        span.end();
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const statusCode = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
        
        // Record error metrics
        this.telemetryService.recordRequest({
          method: request.method,
          path: request.route?.path || request.url,
          statusCode,
          duration,
          organizationId: request.headers['x-org-id'],
          errors: 1,
        });
        
        // Update span with error information
        span.setAttributes({
          'http.status_code': statusCode,
          'response.duration_ms': duration,
          'error.message': error.message,
          'error.name': error.name,
          'error.stack': error.stack,
        });
        
        span.addEvent('request.error', {
          duration_ms: duration,
          error_message: error.message,
          error_code: statusCode,
        });
        
        span.setStatus({ 
          code: statusCode >= 500 ? 'ERROR' : 'OK',
          description: error.message,
        });
        
        span.end();
        
        // Log error with correlation context
        this.telemetryService.log('error', 'Request failed', {
          correlation_id: correlationId,
          method: request.method,
          path: request.url,
          error: {
            name: error.name,
            message: error.message,
            status: statusCode,
          },
          organization_id: request.headers['x-org-id'],
          user_id: (request as any).user?.userId,
        });
        
        return throwError(() => error);
      }),
    );
  }

  private extractCorrelationId(request: FastifyRequest): string | undefined {
    return (
      request.headers['x-correlation-id'] ||
      request.headers['x-request-id'] ||
      request.headers['correlation-id']
    ) as string | undefined;
  }

  private generateCorrelationId(): string {
    return this.telemetryService.createCorrelationId();
  }

  private sanitizeRequestData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = Array.isArray(data) ? [] : {};
    
    for (const [key, value] of Object.entries(data)) {
      // Skip sensitive fields
      if (this.isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeRequestData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'password', 'passwd', 'pwd',
      'secret', 'token', 'key',
      'authorization', 'auth',
      'cookie', 'session',
      'ssn', 'credit_card', 'cvv',
      'email_hash', 'salt',
    ];

    const normalizedFieldName = fieldName.toLowerCase();
    return sensitiveFields.some(field => normalizedFieldName.includes(field));
  }
}

// Decorator for automatic span creation
export function TraceOperation(operationName?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const telemetryService = new TelemetryService(); // This would be injected in real implementation

    descriptor.value = async function (...args: any[]) {
      const spanName = operationName || `${target.constructor.name}.${propertyName}`;
      
      return telemetryService.createSpan(spanName, async (span) => {
        span.setAttributes({
          'operation.name': spanName,
          'operation.component': target.constructor.name,
          'operation.method': propertyName,
        });

        try {
          const result = await method.apply(this, args);
          
          // Add result attributes if applicable
          if (result && typeof result === 'object') {
            span.setAttributes({
              'operation.result_type': result.constructor?.name || typeof result,
              'operation.success': true,
            });
          }
          
          return result;
        } catch (error) {
          span.setAttributes({
            'operation.success': false,
            'operation.error': error.message,
          });
          
          span.recordException(error);
          throw error;
        }
      });
    };
  };
}

// Decorator for database operation tracing
export function TraceDatabaseQuery(tableName?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const telemetryService = new TelemetryService();

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      
      return telemetryService.createSpan(`DATABASE_QUERY_${tableName || 'unknown'}`, async (span) => {
        span.setAttributes({
          'db.table': tableName || 'unknown',
          'db.operation': propertyName,
          'db.system': 'postgresql',
        });

        try {
          const result = await method.apply(this, args);
          
          const duration = Date.now() - startTime;
          
          // Record metrics
          telemetryService.recordDatabaseQuery({
            operation: propertyName,
            table: tableName || 'unknown',
            duration,
          });
          
          span.setAttributes({
            'db.duration_ms': duration,
          });
          
          span.addEvent('database.query.completed', {
            duration_ms: duration,
            success: true,
          });
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          
          telemetryService.recordDatabaseQuery({
            operation: propertyName,
            table: tableName || 'unknown',
            duration,
            error: true,
          });
          
          span.setAttributes({
            'db.duration_ms': duration,
            'db.error': error.message,
          });
          
          span.addEvent('database.query.error', {
            duration_ms: duration,
            error_message: error.message,
          });
          
          span.recordException(error);
          throw error;
        }
      });
    };
  };
}

// Decorator for external API calls
export function TraceExternalCall(serviceName: string, endpoint?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const telemetryService = new TelemetryService();

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      
      return telemetryService.createSpan(`EXTERNAL_${serviceName.toUpperCase()}_CALL`, async (span) => {
        span.setAttributes({
          'external.service': serviceName,
          'external.endpoint': endpoint || 'unknown',
          'external.operation': propertyName,
        });

        try {
          const result = await method.apply(this, args);
          
          const duration = Date.now() - startTime;
          
          span.setAttributes({
            'external.duration_ms': duration,
            'external.success': true,
          });
          
          span.addEvent('external.call.completed', {
            duration_ms: duration,
            success: true,
          });
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          
          span.setAttributes({
            'external.duration_ms': duration,
            'external.success': false,
            'external.error': error.message,
          });
          
          span.addEvent('external.call.error', {
            duration_ms: duration,
            error_message: error.message,
          });
          
          span.recordException(error);
          throw error;
        }
      });
    };
  };
}
