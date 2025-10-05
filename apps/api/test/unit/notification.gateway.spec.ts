import { Test, TestingModule } from '@nestjs/testing';
import { NotificationGateway } from '../../src/notifications/notification.gateway';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;
  let jwtService: JwtService;
  let mockServer: Partial<Server>;

  beforeEach(async () => {
    const mockJwtService = {
      verify: jest.fn().mockReturnValue({
        sub: 'test-user-id',
        organizationId: 'test-org-id',
      }),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('test-value'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationGateway,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    gateway = module.get<NotificationGateway>(NotificationGateway);
    jwtService = module.get<JwtService>(JwtService);

    // Mock WebSocket server
    mockServer = {
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
    };
    (gateway as any).server = mockServer;
  });

  describe('handleConnection', () => {
    it('should accept valid JWT token', async () => {
      const mockClient = {
        id: 'socket-123',
        handshake: {
          auth: { token: 'valid-jwt-token' },
          headers: {},
        },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as any;

      await (gateway as any).handleConnection(mockClient);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-jwt-token');
      expect(mockClient.join).toHaveBeenCalledWith('user:test-user-id');
      expect(mockClient.join).toHaveBeenCalledWith('org:test-org-id');
      expect(mockClient.emit).toHaveBeenCalledWith('connected', expect.any(Object));
    });

    it('should reject connection without token', async () => {
      const mockClient = {
        id: 'socket-123',
        handshake: {
          auth: {},
          headers: {},
        },
        disconnect: jest.fn(),
      } as any;

      await (gateway as any).handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should reject connection with invalid JWT', async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const mockClient = {
        id: 'socket-123',
        handshake: {
          auth: { token: 'invalid-jwt-token' },
          headers: {},
        },
        disconnect: jest.fn(),
      } as any;

      await (gateway as any).handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('sendToUser', () => {
    it('should send notification to specific user', async () => {
      const notification = {
        id: 'notif-123',
        type: 'task_assigned',
        title: 'New Task',
        message: 'You have a new task',
        priority: 'high',
        timestamp: new Date(),
        read: false,
        userId: 'test-user-id',
      };

      const result = await gateway.sendToUser('test-user-id', notification);

      expect(result).toBe(true);
      expect(mockServer.to).toHaveBeenCalledWith('user:test-user-id');
      expect(mockServer.emit).toHaveBeenCalledWith('notification', notification);
    });
  });

  describe('sendToOrganization', () => {
    it('should send notification to organization', async () => {
      const notification = {
        id: 'notif-456',
        type: 'workflow_status_change',
        title: 'Workflow Updated',
        message: 'Workflow status changed',
        priority: 'medium',
        timestamp: new Date(),
        read: false,
        userId: 'test-user-id',
      };

      const result = await gateway.sendToOrganization('test-org-id', notification);

      expect(result).toBe(true);
      expect(mockServer.to).toHaveBeenCalledWith('org:test-org-id');
      expect(mockServer.emit).toHaveBeenCalledWith('notification', notification);
    });
  });

  describe('handlePing', () => {
    it('should respond to ping with pong', () => {
      const mockClient = {
        id: 'socket-123',
        emit: jest.fn(),
      } as any;

      // Mock connectedUsers map
      (gateway as any).connectedUsers = new Map([
        ['socket-123', {
          userId: 'test-user-id',
          lastActivity: new Date(),
        }]
      ]);

      gateway.handlePing(mockClient);

      expect(mockClient.emit).toHaveBeenCalledWith('pong', expect.objectContaining({
        timestamp: expect.any(Date),
        userId: 'test-user-id',
      }));
    });
  });

  describe('getConnectionStats', () => {
    it('should return connection statistics', () => {
      // Mock connectedUsers map
      (gateway as any).connectedUsers = new Map([
        ['socket-1', { userId: 'user-1', organizationId: 'org-1', connectedAt: new Date() }],
        ['socket-2', { userId: 'user-2', organizationId: 'org-1', connectedAt: new Date() }],
        ['socket-3', { userId: 'user-3', organizationId: 'org-2', connectedAt: new Date() }],
      ]);

      const stats = gateway.getConnectionStats();

      expect(stats.totalConnections).toBe(3);
      expect(stats.usersByOrganization['org-1']).toBe(2);
      expect(stats.usersByOrganization['org-2']).toBe(1);
      expect(stats.oldestConnection).toBeInstanceOf(Date);
    });
  });
});
