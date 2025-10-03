import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  let service: TelemetryService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<TelemetryService>(TelemetryService);
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;

    // Mock config values
    configService.get.mockImplementation((key: string) => {
      const config: any = {
        TELEMETRY_ENABLED: 'true',
        OTEL_TRACES_ENDPOINT: 'http://localhost:4318/v1/traces',
        OTEL_TRACES_SAMPLE_RATE: '0.1',
        OTEL_TRACES_BATCH_SIZE: '512',
        OTEL_METRICS_ENDPOINT: 'http://localhost:4318/v1/metrics',
        OTEL_LOGS_ENDPOINT: 'http://localhost:4318/v1/logs',
        NODE_ENV: 'test',
        HOSTNAME: 'test-host',
        SKYMANUALS_VERSION: '1.0.0',
      };
      return config[key];
    });
  });

  describe('recordRequest', () => {
    it('should record request metrics correctly', () => {
      jest.spyOn(service.requestCounter, 'add');
      jest.spyOn(service.requestDuration, 'record');
      jest.spyOn(service.requestErrors, 'add');

      service.recordRequest({
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        duration: 150,
        organizationId: 'test-org',
      });

      expect(service.requestCounter.add).toHaveBeenCalledWith(1, {
        method: 'GET',
        path: '/api/test',
        status_code: '200',
        organization_id: 'test-org',
      });

      expect(service.requestDuration.record).toHaveBeenCalledWith(150, {
        method: 'GET',
        path: '/api/test',
      });
    });

    it('should record error metrics for failed requests', () => {
      jest.spyOn(service.requestCounter, 'add');
      jest.spyOn(service.requestDuration.record');
      jest.spyOn(service.requestErrors, 'add');

      service.recordRequest({
        method: 'POST',
        path: '/api/test',
        statusCode: 500,
        duration: 2000,
        organizationId: 'test-org',
        errors: 1,
      });

      expect(service.requestErrors.add).toHaveBeenCalledWith(1, {
        method: 'POST',
        path: '/api/test',
        status_code: '500',
        error_type: 'server_error',
      });
    });

    it('should handle requests without organization ID', () => {
      jest.spyOn(service.requestCounter, 'add');

      service.recordRequest({
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        duration: 100,
        organizationId: undefined,
      });

      expect(service.requestCounter.add).toHaveBeenCalledWith(1, {
        method: 'GET',
        path: '/api/test',
        status_code: '200',
        organization_id: 'unknown',
      });
    });
  });

  describe('recordDatabaseQuery', () => {
    it('should record successful database query metrics', () => {
      jest.spyOn(service.databaseQueryDuration, 'record');

      service.recordDatabaseQuery({
        operation: 'findMany',
        table: 'manuals',
        duration: 50,
        organizationId: 'test-org',
      });

      expect(service.databaseQueryDuration.record).toHaveBeenCalledWith(50, {
        operation: 'findMany',
        table: 'manuals',
        organization_id: 'test-org',
        error: 'false',
      });
    });

    it('should record database query errors', () => {
      jest.spyOn(service.databaseQueryDuration, 'record');

      service.recordDatabaseQuery({
        operation: 'updateMany',
        table: 'sections',
        duration: 150,
        organizationId: 'test-org',
        error: true,
      });

      expect(service.databaseQueryDuration.record).toHaveBeenCalledWith(150, {
        operation: 'updateMany',
        table: 'sections',
        organization_id: 'test-org',
        error: 'true',
      });
    });
  });

  describe('recordCacheAction', () => {
    it('should record cache hit', () => {
      jest.spyOn(service.cacheHitRate, 'add');

      service.recordCacheAction({
        operation: 'hit',
        key: 'manual:123',
        organizationId: 'test-org',
      });

      expect(service.cacheHitRate.add).toHaveBeenCalledWith(1, {
        operation: 'hit',
        cache_key: 'manual:123',
        organization_id: 'test-org',
      });
    });

    it('should record cache miss', () => {
      jest.spyOn(service.cacheHitRate, 'add');

      service.recordCacheAction({
        operation: 'miss',
        key: 'manual:456',
        organizationId: 'test-org',
      });

      expect(service.cacheHitRate.add).toHaveBeenCalledWith(1, {
        operation: 'miss',
        cache_key: 'manual:456',
        organization_id: 'test-org',
      });
    });
  });

  describe('recordConnectionCount', () => {
    it('should record HTTP connection count', () => {
      jest.spyOn(service.activeConnections, 'add');

      service.recordConnectionCount({
        active: 150,
        type: 'http',
      });

      expect(service.activeConnections.add).toHaveBeenCalledWith(150, {
        connection_type: 'http',
      });
    });

    it('should record database connection count', () => {
      jest.spyOn(service.activeConnections, 'add');

      service.recordConnectionCount({
        active: 10,
        type: 'database',
      });

      expect(service.activeConnections.add).toHaveBeenCalledWith(10, {
        connection_type: 'database',
      });
    });
  });

  describe('createSpan', () => {
    it('should create and manage span lifecycle', async () => {
      jest.spyOn(service.tracer, 'startActiveSpan');

      await service.createSpan('test-operation', async (span: any) => {
        expect(span).toBeDefined();
        return 'test-result';
      });

      expect(service.tracer.startActiveSpan).toHaveBeenCalledWith('test-operation');
    });

    it('should handle span errors correctly', async () => {
      jest.spyOn(service.tracer, 'startActiveSpan');

      await expect(
        service.createSpan('error-operation', async (span: any) => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(service.tracer.startActiveSpan).toHaveBeenCalledWith('error-operation');
    });
  });

  describe('log', () => {
    it('should log with proper context', () => {
      jest.spyOn(service.logger_otel, 'emit');

      service.log('info', 'Test message', {
        organizationId: 'test-org',
        userId: 'test-user',
      });

      expect(service.logger_otel.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'Test message',
          organizationId: 'test-org',
          userId: 'test-user',
          timestamp: expect.any(String),
        })
      );
    });

    it('should include trace context when available', () => {
      jest.spyOn(service.logger_otel, 'emit');
      jest.spyOn(service, 'trace').mockReturnValue({
        getActiveSpan: () => ({
          spanContext: () => ({
            traceId: 'test-trace-id',
            spanId: 'test-span-id',
          }),
        }),
      } as any);

      service.log('debug', 'Test with trace', {});

      expect(service.logger_otel.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          trace_id: 'test-trace-id',
          span_id: 'test-span-id',
        })
      );
    });
  });

  describe('correlation ID management', () => {
    it('should generate unique correlation IDs', () => {
      const id1 = service.createCorrelationId();
      const id2 = service.createCorrelationId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^ctx-/);
    });

    it('should set and retrieve correlation ID', () => {
      const correlationId = 'test-correlation-id';
      
      service.setCorrelationId(correlationId);
      const retrieved = service.getCorrelationId();

      expect(retrieved).toBe(correlationId);
    });
  });

  describe('startSpan', () => {
    it('should create span with default options', () => {
      jest.spyOn(service.tracer, 'startSpan');

      const span = service.startSpan('test-span');

      expect(service.tracer.startSpan).toHaveBeenCalledWith('test-span', {
        kind: 'internal',
      });
      expect(span).toBeDefined();
    });

    it('should create span with custom options', () => {
      jest.spyOn(service.tracer, 'startSpan');

      const span = service.startSpan('test-span', {
        kind: 'client' as any,
        attributes: { component: 'test' },
      });

      expect(service.tracer.startSpan).toHaveBeenCalledWith('test-span', {
        kind: 'client',
        attributes: { component: 'test' },
      });
    });
  });

  describe('addSpanAttributes', () => {
    it('should add attributes to active span', () => {
      const mockSpan = {
        setAttributes: jest.fn(),
      };
      jest.spyOn(service.tracer, 'getActiveSpan').mockReturnValue(mockSpan as any);

      service.addSpanAttributes({ component: 'test', operation: 'test-op' });

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        component: 'test',
        operation: 'test-op',
      });
    });

    it('should handle no active span gracefully', () => {
      jest.spyOn(service.tracer, 'getActiveSpan').mockReturnValue(undefined);

      expect(() => {
        service.addSpanAttributes({ component: 'test' });
      }).not.toThrow();
    });
  });

  describe('addSpanEvent', () => {
    it('should add event to active span', () => {
      const mockSpan = {
        addEvent: jest.fn(),
      };
      jest.spyOn(service.tracer, 'getActiveSpan').mockReturnValue(mockSpan as any);

      service.addSpanEvent('test-event', { data: 'test' });

      expect(mockSpan.addEvent).toHaveBeenCalledWith('test-event', { data: 'test' });
    });

    it('should handle no active span gracefully', () => {
      jest.spyOn(service.tracer, 'getActiveSpan').mockReturnValue(undefined);

      expect(() => {
        service.addSpanEvent('test-event');
      }).not.toThrow();
    });
  });

  describe('getTelemetryConfig', () => {
    it('should return complete configuration', () => {
      const config = service['getTelemetryConfig']();

      expect(config).toEqual({
        enabled: true,
        traces: {
          endpoint: 'http://localhost:4318/v1/traces',
          sampleRate: 0.1,
          batchSize: 512,
          exportTimeoutMillis: 30000,
        },
        metrics: {
          endpoint: 'http://localhost:4318/v1/metrics',
          intervalMills: 60000,
          exportTimeoutMillis: 30000,
        },
        logs: {
          endpoint: 'http://localhost:4318/v1/logs',
          level: 'info',
          includeTraceContext: true,
        },
        resource: {
          serviceName: 'skymanuals-api',
          serviceVersion: '1.0.0',
          environment: 'test',
          hostName: 'test-host',
        },
      });
    });

    it('should handle disabled telemetry', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TELEMETRY_ENABLED') return 'false';
        return null;
      });

      const config = service['getTelemetryConfig']();

      expect(config.enabled).toBe(false);
    });
  });
});
