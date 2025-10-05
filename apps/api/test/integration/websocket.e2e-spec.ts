import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationGateway } from '../../src/notifications/notification.gateway';
import * as io from 'socket.io-client';
import { testEnv } from '../setup';

describe('WebSocket Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let gateway: NotificationGateway;

  beforeAll(async () => {
    await testEnv.setup();
    app = testEnv.getApp();
    prisma = testEnv.getPrisma();
    
    const module = testEnv.getModule();
    jwtService = module.get<JwtService>(JwtService);
    gateway = module.get<NotificationGateway>(NotificationGateway);
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  });

  describe('WebSocket Connection', () => {
    it('should connect with valid JWT token', (done) => {
      const mockUser = {
        sub: 'test-user-id',
        organizationId: 'test-org-id',
        email: 'test@example.com',
      };

      const token = jwtService.sign(mockUser);
      
      const client = io.connect('http://localhost:3001/notifications', {
        auth: { token },
        transports: ['websocket'],
      });

      client.on('connect', () => {
        expect(client.connected).toBe(true);
        client.disconnect();
        done();
      });

      client.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should reject connection without token', (done) => {
      const client = io.connect('http://localhost:3001/notifications', {
        transports: ['websocket'],
      });

      client.on('connect', () => {
        done(new Error('Should not have connected without token'));
      });

      client.on('connect_error', (error) => {
        expect(error.message).toContain('No token provided');
        client.disconnect();
        done();
      });
    });

    it('should reject connection with invalid token', (done) => {
      const client = io.connect('http://localhost:3001/notifications', {
        auth: { token: 'invalid-token' },
        transports: ['websocket'],
      });

      client.on('connect', () => {
        done(new Error('Should not have connected with invalid token'));
      });

      client.on('connect_error', (error) => {
        expect(error.message).toContain('Invalid token');
        client.disconnect();
        done();
      });
    });
  });

  describe('WebSocket Events', () => {
    let client: any;
    let token: string;

    beforeEach((done) => {
      const mockUser = {
        sub: 'test-user-id',
        organizationId: 'test-org-id',
        email: 'test@example.com',
      };

      token = jwtService.sign(mockUser);
      
      client = io.connect('http://localhost:3001/notifications', {
        auth: { token },
        transports: ['websocket'],
      });

      client.on('connect', () => {
        done();
      });
    });

    afterEach(() => {
      if (client) {
        client.disconnect();
      }
    });

    it('should receive connection confirmation', (done) => {
      client.on('connected', (data: any) => {
        expect(data).toMatchObject({
          message: 'Connected to SkyManuals notifications',
          userId: 'test-user-id',
          organizationId: 'test-org-id',
          connectedAt: expect.any(String),
        });
        done();
      });
    });

    it('should respond to ping with pong', (done) => {
      client.on('pong', (data: any) => {
        expect(data).toMatchObject({
          timestamp: expect.any(String),
          userId: 'test-user-id',
        });
        done();
      });

      client.emit('ping');
    });

    it('should receive notifications sent to user', (done) => {
      const notification = {
        id: 'test-notification',
        type: 'task_assigned',
        title: 'New Task',
        message: 'You have a new task assigned',
        priority: 'high',
        timestamp: new Date(),
        read: false,
        userId: 'test-user-id',
      };

      client.on('notification', (receivedNotification: any) => {
        expect(receivedNotification).toMatchObject({
          id: 'test-notification',
          type: 'task_assigned',
          title: 'New Task',
          message: 'You have a new task assigned',
          priority: 'high',
          read: false,
          userId: 'test-user-id',
          timestamp: expect.any(String),
          type: 'user_notification',
        });
        done();
      });

      // Send notification using the gateway
      gateway.sendToUser('test-user-id', notification);
    });

    it('should receive organization-wide notifications', (done) => {
      const notification = {
        id: 'org-notification',
        type: 'workflow_status_change',
        title: 'Workflow Updated',
        message: 'Manual workflow status changed',
        priority: 'medium',
        timestamp: new Date(),
        read: false,
        userId: 'test-user-id',
      };

      client.on('notification', (receivedNotification: any) => {
        expect(receivedNotification).toMatchObject({
          id: 'org-notification',
          type: 'workflow_status_change',
          title: 'Workflow Updated',
          message: 'Manual workflow status changed',
          priority: 'medium',
          read: false,
          userId: 'test-user-id',
          timestamp: expect.any(String),
          type: 'org_notification',
        });
        done();
      });

      // Send organization notification using the gateway
      gateway.sendToOrganization('test-org-id', notification);
    });

    it('should handle mark notification as read', (done) => {
      client.on('notification_marked_read', (data: any) => {
        expect(data).toMatchObject({
          notificationId: 'test-notification-123',
          timestamp: expect.any(String),
        });
        done();
      });

      client.emit('mark_notification_read', {
        notificationId: 'test-notification-123',
      });
    });

    it('should handle get notifications request', (done) => {
      client.on('notifications', (data: any) => {
        expect(data).toMatchObject({
          notifications: expect.any(Array),
          timestamp: expect.any(String),
        });
        done();
      });

      client.emit('get_notifications');
    });
  });

  describe('Multiple Client Connections', () => {
    let token: string;
    let orgToken: string;

    beforeEach(() => {
      const mockUser = {
        sub: 'test-user-id',
        organizationId: 'test-org-id',
        email: 'test@example.com',
      };

      const mockOrgUser = {
        sub: 'org-user-id',
        organizationId: 'test-org-id',
        email: 'orguser@example.com',
      };

      token = jwtService.sign(mockUser);
      orgToken = jwtService.sign(mockOrgUser);
    });

    it('should handle multiple users in same organization', (done) => {
      const client1 = io.connect('http://localhost:3001/notifications', {
        auth: { token },
        transports: ['websocket'],
      });

      const client2 = io.connect('http://localhost:3001/notifications', {
        auth: { token: orgToken },
        transports: ['websocket'],
      });

      let receivedCount = 0;
      const expectedCount = 2;

      const checkComplete = () => {
        receivedCount++;
        if (receivedCount === expectedCount) {
          client1.disconnect();
          client2.disconnect();
          done();
        }
      };

      client1.on('connect', () => {
        client1.on('notification', (notification: any) => {
          expect(notification.type).toBe('org_notification');
          checkComplete();
        });
      });

      client2.on('connect', () => {
        client2.on('notification', (notification: any) => {
          expect(notification.type).toBe('org_notification');
          checkComplete();
        });
      });

      // Wait for both connections
      setTimeout(() => {
        const notification = {
          id: 'org-broadcast',
          type: 'system_announcement',
          title: 'System Maintenance',
          message: 'Scheduled maintenance tonight',
          priority: 'medium',
          timestamp: new Date(),
          read: false,
          userId: 'system',
        };

        gateway.sendToOrganization('test-org-id', notification);
      }, 1000);
    });
  });

  describe('Connection Statistics', () => {
    it('should track connection statistics', () => {
      const stats = gateway.getConnectionStats();
      
      expect(stats).toMatchObject({
        totalConnections: expect.any(Number),
        usersByOrganization: expect.any(Object),
        oldestConnection: expect.any(Date),
      });
    });

    it('should provide health check information', () => {
      const health = gateway.healthCheck();
      
      expect(health).toMatchObject({
        status: 'healthy',
        details: {
          totalConnections: expect.any(Number),
          usersByOrganization: expect.any(Object),
          oldestConnection: expect.any(Date),
          uptime: expect.any(Number),
          memory: expect.any(Object),
        },
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle client disconnect gracefully', (done) => {
      const mockUser = {
        sub: 'disconnect-test-user',
        organizationId: 'test-org-id',
        email: 'disconnect@example.com',
      };

      const token = jwtService.sign(mockUser);
      
      const client = io.connect('http://localhost:3001/notifications', {
        auth: { token },
        transports: ['websocket'],
      });

      client.on('connect', () => {
        // Disconnect immediately after connecting
        client.disconnect();
        
        // Give some time for cleanup
        setTimeout(() => {
          const stats = gateway.getConnectionStats();
          // Connection should be removed from stats
          done();
        }, 100);
      });

      client.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should handle malformed events gracefully', (done) => {
      const mockUser = {
        sub: 'error-test-user',
        organizationId: 'test-org-id',
        email: 'error@example.com',
      };

      const token = jwtService.sign(mockUser);
      
      const client = io.connect('http://localhost:3001/notifications', {
        auth: { token },
        transports: ['websocket'],
      });

      client.on('connect', () => {
        client.on('error', (error: any) => {
          expect(error.message).toBeDefined();
          client.disconnect();
          done();
        });

        // Send malformed event
        client.emit('mark_notification_read', {});
      });

      client.on('connect_error', (error) => {
        done(error);
      });
    });
  });
});
