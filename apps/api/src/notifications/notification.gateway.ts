import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export interface NotificationData {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: Date;
  read: boolean;
  userId: string;
}

export interface SocketUser {
  socketId: string;
  userId: string;
  organizationId: string;
  connectedAt: Date;
  lastActivity: Date;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  },
  namespace: '/notifications'
})
export class NotificationGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationGateway.name);
  private connectedUsers = new Map<string, SocketUser>();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      // Extract token from handshake
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        this.logger.warn(`Connection rejected: No token provided for socket ${client.id}`);
        client.disconnect();
        return;
      }

      // Verify JWT token
      const payload = this.jwtService.verify(token);
      
      const user: SocketUser = {
        socketId: client.id,
        userId: payload.sub,
        organizationId: payload.organizationId,
        connectedAt: new Date(),
        lastActivity: new Date()
      };

      // Store user connection
      this.connectedUsers.set(client.id, user);
      
      // Join user to their personal room
      await client.join(`user:${user.userId}`);
      
      // Join user to organization room
      await client.join(`org:${user.organizationId}`);

      this.logger.log(`User ${user.userId} connected (${this.connectedUsers.size} total connections)`);

      // Send connection confirmation
      client.emit('connected', {
        message: 'Connected to SkyManuals notifications',
        userId: user.userId,
        organizationId: user.organizationId,
        connectedAt: user.connectedAt
      });

      // Send any pending notifications
      await this.sendPendingNotifications(user.userId);

    } catch (error) {
      this.logger.error(`Connection error for socket ${client.id}:`, error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = this.connectedUsers.get(client.id);
    if (user) {
      this.connectedUsers.delete(client.id);
      this.logger.log(`User ${user.userId} disconnected (${this.connectedUsers.size} total connections)`);
    }
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    const user = this.connectedUsers.get(client.id);
    if (user) {
      user.lastActivity = new Date();
    }
    client.emit('pong', { timestamp: new Date() });
  }

  @SubscribeMessage('mark_notification_read')
  async handleMarkNotificationRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: string }
  ) {
    const user = this.connectedUsers.get(client.id);
    if (!user) {
      client.emit('error', { message: 'User not found' });
      return;
    }

    try {
      // TODO: Update notification as read in database
      this.logger.log(`Notification ${data.notificationId} marked as read by user ${user.userId}`);
      
      client.emit('notification_marked_read', {
        notificationId: data.notificationId,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error(`Failed to mark notification as read:`, error);
      client.emit('error', { message: 'Failed to mark notification as read' });
    }
  }

  @SubscribeMessage('get_notifications')
  async handleGetNotifications(@ConnectedSocket() client: Socket) {
    const user = this.connectedUsers.get(client.id);
    if (!user) {
      client.emit('error', { message: 'User not found' });
      return;
    }

    try {
      // TODO: Fetch notifications from database
      const notifications = await this.getUserNotifications(user.userId);
      
      client.emit('notifications', {
        notifications,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error(`Failed to get notifications:`, error);
      client.emit('error', { message: 'Failed to get notifications' });
    }
  }

  // Send notification to specific user
  async sendToUser(userId: string, notification: NotificationData): Promise<boolean> {
    try {
      this.server.to(`user:${userId}`).emit('notification', notification);
      this.logger.log(`Notification sent to user ${userId}: ${notification.title}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send notification to user ${userId}:`, error);
      return false;
    }
  }

  // Send notification to organization
  async sendToOrganization(organizationId: string, notification: NotificationData): Promise<boolean> {
    try {
      this.server.to(`org:${organizationId}`).emit('notification', notification);
      this.logger.log(`Notification sent to organization ${organizationId}: ${notification.title}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send notification to organization ${organizationId}:`, error);
      return false;
    }
  }

  // Send notification to all connected users
  async broadcastNotification(notification: NotificationData): Promise<boolean> {
    try {
      this.server.emit('notification', notification);
      this.logger.log(`Broadcast notification: ${notification.title}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to broadcast notification:`, error);
      return false;
    }
  }

  // Send task assigned notification
  async sendTaskAssignedNotification(userId: string, taskData: {
    taskTitle: string;
    manualTitle: string;
    chapterTitle: string;
    dueDate: string;
    priority: string;
    taskUrl: string;
  }): Promise<boolean> {
    const notification: NotificationData = {
      id: `task-${Date.now()}`,
      type: 'task_assigned',
      title: 'New Task Assigned',
      message: `You have been assigned: ${taskData.taskTitle}`,
      data: taskData,
      priority: taskData.priority === 'HIGH' ? 'high' : 'medium',
      timestamp: new Date(),
      read: false,
      userId
    };

    return this.sendToUser(userId, notification);
  }

  // Send workflow status change notification
  async sendWorkflowStatusChangeNotification(organizationId: string, workflowData: {
    manualTitle: string;
    previousStatus: string;
    newStatus: string;
    updatedBy: string;
    workflowUrl: string;
  }): Promise<boolean> {
    const notification: NotificationData = {
      id: `workflow-${Date.now()}`,
      type: 'workflow_status_change',
      title: 'Workflow Status Changed',
      message: `${workflowData.manualTitle} status changed to ${workflowData.newStatus}`,
      data: workflowData,
      priority: 'medium',
      timestamp: new Date(),
      read: false,
      userId: workflowData.updatedBy
    };

    return this.sendToOrganization(organizationId, notification);
  }

  // Send task overdue notification
  async sendTaskOverdueNotification(userId: string, taskData: {
    taskTitle: string;
    manualTitle: string;
    dueDate: string;
    daysOverdue: number;
    taskUrl: string;
  }): Promise<boolean> {
    const notification: NotificationData = {
      id: `overdue-${Date.now()}`,
      type: 'task_overdue',
      title: 'Overdue Task',
      message: `Task "${taskData.taskTitle}" is ${taskData.daysOverdue} days overdue`,
      data: taskData,
      priority: 'urgent',
      timestamp: new Date(),
      read: false,
      userId
    };

    return this.sendToUser(userId, notification);
  }

  // Send checklist completed notification
  async sendChecklistCompletedNotification(organizationId: string, checklistData: {
    checklistTitle: string;
    manualTitle: string;
    completedBy: string;
    itemsCompleted: number;
    totalItems: number;
    checklistUrl: string;
  }): Promise<boolean> {
    const notification: NotificationData = {
      id: `checklist-${Date.now()}`,
      type: 'checklist_completed',
      title: 'Checklist Completed',
      message: `${checklistData.checklistTitle} completed by ${checklistData.completedBy}`,
      data: checklistData,
      priority: 'low',
      timestamp: new Date(),
      read: false,
      userId: checklistData.completedBy
    };

    return this.sendToOrganization(organizationId, notification);
  }

  // Send approval requested notification
  async sendApprovalRequestedNotification(userId: string, approvalData: {
    manualTitle: string;
    requestedBy: string;
    priority: string;
    dueDate: string;
    approvalUrl: string;
  }): Promise<boolean> {
    const notification: NotificationData = {
      id: `approval-${Date.now()}`,
      type: 'approval_requested',
      title: 'Approval Requested',
      message: `Approval requested for ${approvalData.manualTitle}`,
      data: approvalData,
      priority: approvalData.priority === 'HIGH' ? 'high' : 'medium',
      timestamp: new Date(),
      read: false,
      userId
    };

    return this.sendToUser(userId, notification);
  }

  // Get connection statistics
  getConnectionStats(): {
    totalConnections: number;
    usersByOrganization: { [key: string]: number };
    oldestConnection: Date | null;
  } {
    const usersByOrganization: { [key: string]: number } = {};
    let oldestConnection: Date | null = null;

    for (const user of this.connectedUsers.values()) {
      usersByOrganization[user.organizationId] = (usersByOrganization[user.organizationId] || 0) + 1;
      
      if (!oldestConnection || user.connectedAt < oldestConnection) {
        oldestConnection = user.connectedAt;
      }
    }

    return {
      totalConnections: this.connectedUsers.size,
      usersByOrganization,
      oldestConnection
    };
  }

  // Health check
  healthCheck(): { status: string; details: any } {
    const stats = this.getConnectionStats();
    
    return {
      status: 'healthy',
      details: {
        ...stats,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      }
    };
  }

  private async sendPendingNotifications(userId: string): Promise<void> {
    // TODO: Fetch and send pending notifications from database
    this.logger.log(`Sending pending notifications to user ${userId}`);
  }

  private async getUserNotifications(userId: string): Promise<NotificationData[]> {
    // TODO: Fetch notifications from database
    return [];
  }
}
