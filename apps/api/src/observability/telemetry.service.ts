import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace, metrics, logs, SpanKind, SpanStatusCode, context, Span } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

// Exporters
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-otlp-http';

// Instrumentations
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { HapiInstrumentation } from '@opentelemetry/instrumentation-hapi';
import { PrismaInstrumentation } from '@opentelemetry/instrumentation-prisma';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

export interface TelemetryConfig {
  enabled: boolean;
  traces: {
    endpoint: string;
    sampleRate: number;
    batchSize: number;
    exportTimeoutMillis: number;
  };
  metrics: {
    endpoint: string;
    intervalMills: number;
    exportTimeoutMillis: number;
  };
  logs: {
    endpoint: string;
    level: string;
    includeTraceContext: boolean;
  };
  resource: {
    serviceName: string;
    serviceVersion: string;
    environment: string;
    hostName: string;
  };
}

@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private sdk?: NodeSDK;
  
  // OpenTelemetry instances
  public readonly tracer = trace.getTracer('skymanuals-api');
  public readonly meter = metrics.getMeter('skymanuals-api');
  public readonly logger_otel = logs.getLogger('skymanuals-api');
  
  // Custom metrics
  private readonly requestCounter: any;
  private readonly requestDuration: any;
  private readonly requestErrors: any;
  private readonly databaseQueryDuration: any;
  private readonly cacheHitRate: any;
  private readonly activeConnections: any;
  private readonly memoryUsage: any;
  private readonly cpuUsage: any;

  constructor(private readonly configService: ConfigService) {
    // Initialize metrics instruments
    this.requestCounter = this.meter.createCounter('skymanuals_requests_total', {
      description: 'Total number of HTTP requests',
    });

    this.requestDuration = this.meter.createHistogram('skymanuals_request_duration_ms', {
      description: 'HTTP request duration in milliseconds',
      unit: 'ms',
    });

    this.requestErrors = this.meter.createCounter('skymanuals_requests_errors_total', {
     description: 'Total number of HTTP request errors',
    });

    this.databaseQueryDuration = this.meter.createHistogram('skymanuals_database_query_duration_ms', {
      description: 'Database query duration in milliseconds',
      unit: 'ms',
    });

    this.cacheHitRate = this.meter.createCounter('skymanuals_cache_hits_total', {
      description: 'Total cache hits',
    });

    this.activeConnections = this.meter.createUpDownCounter('skymanuals_active_connections', {
      description: 'Number of active connections',
    });

    this.memoryUsage = this.meter.createUpDownCounter('skymanuals_memory_usage_bytes', {
      description: 'Memory usage in bytes',
      unit: 'bytes',
    });

    this.cpuUsage = this.meter.createGauge('skymanuals_cpu_usage_percent', {
      description: 'CPU usage percentage',
      unit: 'percent',
    });
  }

  async onModuleInit() {
    const config = this.getTelemetryConfig();
    
    if (!config.enabled) {
      this.logger.warn('OpenTelemetry is disabled');
      return;
    }

    this.logger.log('Initializing OpenTelemetry...');

    try {
      // Initialize exporters
      const traceExporter = new OTLPTraceExporter({
        url: config.traces.endpoint,
        headers: {},
      });

      const metricExporter = new OTLPMetricExporter({
        url: config.metrics.endpoint,
        headers: {},
      });

      const logExporter = new OTLPLogExporter({
        url: config.logs.endpoint,
        headers: {},
      });

      // Create resource
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.resource.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: config.resource.serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.resource.environment,
        [SemanticResourceAttributes.HOST_NAME]: config.resource.hostName,
        'skymanuals.version': config.resource.serviceVersion,
        'skymanuals.instance.id': process.env.HOSTNAME || 'unknown',
      });

      // Initialize SDK
      this.sdk = new NodeSDK({
        resource,
        traceExporter,
        metricExporter,
        logRecordProcessor: {
          logRecordLimits: {
            maxLogRecordsPerBatch: 1024,
          },
          forceFlush: true,
          exportTimeoutMillis: config.logs.exportTimeoutMillis || 30000,
        },
        instrumentations: [
          new PinoInstrumentation(),
          new HttpInstrumentation({
            enabled: true,
            requestHook: (span, request) => {
              span.setAttributes({
                'http.method': request.method,
                'http.url': request.url,
                'user_agent': request.headers['user-agent'],
                'content_type': request.headers['content-type'],
              });
            },
            responseHook: (span, response) => {
              span.setAttributes({
                'http.status_code': response.statusCode,
                'http.response_size': response.headers['content-length'],
              });
            },
          }),
          new FastifyInstrumentation(),
          new PrismaInstrumentation(),
          new RedisInstrumentation(),
          new PgInstrumentation(),
          new HapiInstrumentation(),
        ],
        spanProcessor: {
          batchProcessingExporter: traceExporter,
          maxExportBatchSize: config.traces.batchSize || 512,
          exportTimeoutMillis: config.traces.exportTimeoutMillis || 30000,
          scheduleDelayMillis: 5000,
        },
        sampler: {
          shouldSample: (parentContext, traceId, spanName, spanKind, attributes, links) => {
            const spanContext = trace.getActiveSpan(parentContext)?.spanContext();
            
            // Always sample health checks
            if (spanName.includes('health') || spanName.includes('/api/health')) {
              return { decision: 'recd' };
            }
            
            // Always sample authentication failures
            if (spanName.includes('auth') && attributes['http.status_code'] >= 400) {
              return { decision: 'recd' };
            }
            
            // Always sample due to sampling rate
            const random = Math.random();
            const sampleRate = config.traces.sampleRate || 0.1;
            
            if (random < sampleRate) {
              return { decision: 'record' };
            }
            
            return { decision: 'drop' };
          },
        },
      });

      // Start the SDK
      await this.sdk.start();

      this.logger.log('OpenTelemetry initialized successfully');

      // Start periodic metrics collection
      this.startPeriodicMetrics();

      // Register lifecycle methods
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      this.logger.error('Failed to initialize OpenTelemetry', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.shutdown();
  }

  private async shutdown() {
    this.logger.log('Shutting down OpenTelemetry...');
    
    if (this.sdk) {
      await this.sdk.shutdown();
      this.logger.log('OpenTelemetry shutdown completed');
    }
  }

  private getTelemetryConfig(): TelemetryConfig {
    return {
      enabled: this.configService.get('TELEMETRY_ENABLED', 'true') === 'true',
      traces: {
        endpoint: this.configService.get('OTEL_TRACES_ENDPOINT', 'http://localhost:4318/v1/traces'),
        sampleRate: parseFloat(this.configService.get('OTEL_TRACES_SAMPLE_RATE', '0.1')),
        batchSize: parseInt(this.configService.get('OTEL_TRACES_BATCH_SIZE', '512')),
        exportTimeoutMillis: parseInt(this.configService.get('OTEL_TRACES_TIMEOUT', '30000')),
      },
      metrics: {
        endpoint: this.configService.get('OTEL_METRICS_ENDPOINT', 'http://localhost:4318/v1/metrics'),
        intervalMills: parseInt(this.configService.get('OTEL_METRICS_INTERVAL', '60000')),
        exportTimeoutMillis: parseInt(this.configService.get('OTEL_METRICS_TIMEOUT', '30000')),
      },
      logs: {
        endpoint: this.configService.get('OTEL_LOGS_ENDPOINT', 'http://localhost:4318/v1/logs'),
        level: this.configService.get('OTEL_LOGS_LEVEL', 'info'),
        includeTraceContext: this.configService.get('OTEL_LOGS_TRACE_CONTEXT', 'true') === 'true',
      },
      resource: {
        serviceName: 'skymanuals-api',
        serviceVersion: this.configService.get('SKYMANUALS_VERSION', '1.0.0'),
        environment: this.configService.get('NODE_ENV', 'development'),
        hostName: this.configService.get('HOSTNAME', process.env.HOSTNAME || 'unknown'),
      },
    };
  }

  private startPeriodicMetrics() {
    // Collect system metrics every minute
    setInterval(() => {
      try {
        // Memory usage
        const memoryUsage = process.memoryUsage();
        this.memoryUsage.add(memoryUsage.rss);
        
        // CPU usage (simplified)
        const cpuUsage = process.cpuUsage();
        this.cpuUsage.record(cpuUsage.user / 1000000); // Convert to percentage
        
      } catch (error) {
        this.log.status.error('Failed to collect system metrics', error);
      }
    }, 60000);
  }

  // Public API for manual instrumentation
  async createSpan(name: string, fn: (span: Span) => Promise<any>): Promise<any> {
    return await this.tracer.startActiveSpan(name, async (span) => {
      try {
        span.setStatus({ code: SpanStatusCode.OK });
        const result = await fn(span);
        return result;
      } catch (error) {
        span.setStatus({ 
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  recordRequest(options: {
    method: string;
    path: string;
    statusCode: number;
    duration: number;
    organizationId?: string;
    errors?: number;
  }) {
    const { method, path, statusCode, duration, organizationId, errors } = options;
    
    // Increment request counter
    this.requestCounter.add(1, {
      method,
      path,
      status_code: statusCode.toString(),
      organization_id: organizationId || 'unknown',
    });
    
    // Record duration
    this.requestDuration.record(duration, {
      method,
      path,
      status_code: statusCode.toString(),
    });
    
    // Record errors
    if (statusCode >= 400 || errors) {
      this.requestErrors.add(errors || 1, {
        method,
      path,
        status_code: statusCode.toString(),
        error_type: statusCode >= 500 ? 'server_error' : 'client_error',
      });
    }
  }

  recordDatabaseQuery(options: {
    operation: string;
    table: string;
    duration: number;
    organizationId?: string;
    error?: boolean;
  }) {
    const { operation, table, duration, organizationId, error } = options;
    
    this.databaseQueryDuration.record(duration, {
      operation,
      table,
      organization_id: organizationId || 'unknown',
      error: error ? 'true' : 'false',
    });
  }

  recordCacheAction(options: {
    operation: 'hit' | 'miss';
    key: string;
    organizationId?: string;
  }) {
    const { operation, key, organizationId } = options;
    
    this.cacheHitRate.add(1, {
      operation,
      cache_key: key,
      organization_id: organizationId || 'unknown',
    });
  }

  recordConnectionCount(options: {
    active: number;
    type: 'http' | 'websocket' | 'database';
  }) {
    const { active, type } = options;
    
    this.activeConnections.add(active, {
      connection_type: type,
    });
  }

  // Logging with trace context
  log(level: 'info' | 'debug' | 'warn' | 'error', message: string, meta?: any) {
    const traceContext = trace.getActiveSpan()?.spanContext();
    
    const logRecord = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...meta,
      ...(traceContext && {
        trace_id: traceContext.traceId,
        span_id: traceContext.spanId,
      }),
    };

    this.logger_otel.emit(logRecord);
  }

  // Manual span creation for specific operations
  startSpan(name: string, options?: {
    kind?: SpanKind;
    attributes?: Record<string, any>;
  }): Span {
    return this.tracer.startSpan(name, {
      kind: options?.kind || SpanKind.INTERNAL,
    });
  }

  // Utility to add attributes to active span
  addSpanAttributes(attributes: Record<string, any>) {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes(attributes);
    }
  }

  // Utility to add events to active span
  addSpanEvent(name: string, attributes?: Record<string, any>) {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.addEvent(name, attributes);
    }
  }

  // Correlation ID management
  createCorrelationId(): string {
    return `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Set correlation ID in context
  setCorrelationId(correlationId: string): void {
    context.active().setValue('correlation_id', correlationId);
  }

  // Get correlation ID from context
  getCorrelationId(): string | undefined {
    return context.active().getValue('correlation_id') as string;
  }
}
