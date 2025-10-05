import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@skymanuals/prisma';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import {
  DeviceEnrollmentRequest,
  DeviceListResponse,
  DevicePolicyUpdateRequest,
  DevicePolicy,
  ManualPinningPolicy,
  CacheSyncPolicy,
  SecurityPolicy,
  FeatureFlagsPolicy,
  RequestContext,
  AuditEventType,
  AuditSeverity,
  ResourceType,
} from '@skymanuals/types';

// Enhanced security interfaces
export interface JWTTokenPayload {
  deviceId: string;
  userId: string;
  organizationId: string;
  sessionId: string;
  tokenType: 'device_session' | 'enrollment' | 'admin';
  permissions: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface DeviceSecurityValidation {
  isValid: boolean;
  reason?: string;
  securityScore: number; // 0-100
  risks: string[];
  recommendations: string[];
}

export interface CertificateValidation {
  isValid: boolean;
  issuer?: string;
  subject?: string;
  expiresAt?: Date;
  chain?: string[];
  errors?: string[];
}

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Enroll a new EFB device
   */
  async enrollDevice(
    enrollmentRequest: DeviceEnrollmentRequest,
    context: RequestContext,
  ): Promise<any> {
    this.logger.log(`Enrolling device: ${enrollmentRequest.deviceId}`);

    try {
      // Look up organization by domain/identifier
      const organization = await this.prisma.organization.findFirst({
        where: {
          slug: enrollmentRequest.organizationIdentifier,
        },
      });

      if (!organization) {
        throw new BadRequestException('Organization not found');
      }

      // Check if device already exists
      const existingDevice = await this.prisma.device.findUnique({
        where: { deviceId: enrollmentRequest.deviceId },
      });

      if (existingDevice) {
        this.logger.log(`Device ${enrollmentRequest.deviceId} already enrolled`);
        return {
          id: existingDevice.id,
          status: existingDevice.status,
          organizationId: organization.id,
          sessionToken: await this.generateSessionToken(existingDevice.id),
        };
      }

      // Perform security validation
      const securityValidation = await this.validateDeviceSecurity(
        enrollmentRequest.securityInfo,
      );

      if (!securityValidation.isValid) {
        throw new BadRequestException(
          `Device security validation failed: ${securityValidation.reason}`,
        );
      }

      // Create device record
      const device = await this.prisma.device.create({
        data: {
          deviceModel: enrollmentRequest.deviceModel,
          platform: enrollmentRequest.platform,
          osVersion: enrollmentRequest.osVersion,
          appVersion: enrollmentRequest.appVersion,
          deviceName: enrollmentRequest.deviceName,
          deviceId: enrollmentRequest.deviceId,
          hardwareId: enrollmentRequest.hardwareId,
          organizationId: organization.id,
          userId: enrollmentRequest.userId,
          status: 'PENDING_ENROLLMENT',
          enrollmentDate: new Date(),
          securityFlags: {
            isJailbroken: enrollmentRequest.securityInfo.isJailbroken,
            hasMalware: false, // Would be detected by scanning
            encryptionEnabled: enrollmentRequest.securityInfo.encryptionSupported,
            screenLockEnabled: false, // Default value
            developerModeEnabled: enrollmentRequest.securityInfo.hasDeveloperMode,
          },
          installedPolicies: [],
          metadata: {
            enrollmentRequest: enrollmentRequest,
            securityValidation: securityValidation,
          },
        },
      });

      // Apply default policies
      await this.applyDefaultPolicies(device.id, organization.id);

      // Generate enrollment session token
      const sessionToken = await this.generateSessionToken(
        device.id,
        enrollmentRequest.userId || 'enrollment-temp',
        organization.id,
        'enrollment',
      );

      // Log audit event for device enrollment
      await this.auditService.logAviationComplianceEvent(context, {
        type: AuditEventType.DATA_MODIFICATION,
        severity: AuditSeverity.MEDIUM,
        action: 'DEVICE_ENROLLMENT',
        resource: 'Device',
        resourceId: device.id,
        resourceType: ResourceType.Device,
        afterData: {
          deviceId: device.deviceId,
          deviceModel: device.deviceModel,
          platform: device.platform,
          osVersion: device.osVersion,
          organizationId: device.organizationId,
          userId: device.userId,
        },
        complianceMetadata: {
          regulatoryFrameworks: ['EASA', 'FAA'],
          certificationLevel: 'OPERATIONAL',
          documentSource: 'AUTHORED',
          requiresReporting: true,
          complianceNotes: `Device enrollment for ${enrollmentRequest.deviceModel} running ${enrollmentRequest.platform}`,
        },
        tags: ['device-management', 'efb'],
      });

      this.logger.log(
        `Device ${enrollmentRequest.deviceId} enrolled successfully`,
      );

      return {
        id: device.id,
        status: device.status,
        organizationId: organization.id,
        sessionToken,
        policies: await this.getDevicePolicies(device.id),
      };
    } catch (error) {
      this.logger.error(`Device enrollment failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Approve/enable a device after review
   */
  async approveDevice(
    deviceId: string,
    approvedBy: string,
    customPolicies: string[],
    context: RequestContext,
  ): Promise<any> {
    this.logger.log(`Approving device: ${deviceId}`);

    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        organization: true,
        user: true,
      },
    });

    if (!device) {
      throw new BadRequestException('Device not found');
    }

    if (device.status !== 'PENDING_ENROLLMENT') {
      throw new BadRequestException(
        'Device is not in pending enrollment status',
      );
    }

    // Update device status
    const updatedDevice = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'ACTIVE',
        installedPolicies: customPolicies || [],
        metadata: {
          ...device.metadata,
          approvedBy,
          approvedAt: new Date().toISOString(),
        },
      },
    });

    // Create device session
    const session = await this.createDeviceSession(
      deviceId,
      device.userId || approvedBy,
    );

    // Apply customized policies if provided
    if (customPolicies && customPolicies.length > 0) {
      await this.applyCustomPolicies(deviceId, customPolicies);
    }

    // Log audit event for device approval
    await this.auditService.logAviationComplianceEvent(context, {
      type: AuditEventType.DATA_MODIFICATION,
      severity: AuditSeverity.MEDIUM,
      action: 'DEVICE_APPROVAL',
      resource: 'Device',
      resourceId: deviceId,
      resourceType: ResourceType.Device,
      beforeData: { status: device.status },
      afterData: { status: updatedDevice.status, approvedBy },
      complianceMetadata: {
        regulatoryFrameworks: ['EASA', 'FAA'],
        certificationLevel: 'OPERATIONAL',
        documentSource: 'AUTHORED',
        requiresReporting: true,
        complianceNotes: `Device approved with ${customPolicies?.length || 0} custom policies`,
      },
      tags: ['device-management', 'efb', 'approval'],
    });

    return {
      device: updatedDevice,
      session: session,
      policies: await this.getDevicePolicies(deviceId),
    };
  }

  /**
   * Suspend a device
   */
  async suspendDevice(deviceId: string, reason: string): Promise<any> {
    const device = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'SUSPENDED',
        metadata: {
          suspendedReason: reason,
          suspendedAt: new Date().toISOString(),
        },
      },
    });

    // Revoke all active sessions
    await this.prisma.deviceSession.updateMany({
      where: {
        deviceId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    return device;
  }

  /**
   * Get list of devices for admin interface
   */
  async getDeviceList(
    organizationId: string,
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      status?: string;
      platform?: string;
      search?: string;
    },
  ): Promise<DeviceListResponse> {
    const skip = (page - 1) * pageSize;

    const whereClause: any = {
      organizationId,
    };

    if (filters?.status) {
      whereClause.status = filters.status;
    }

    if (filters?.platform) {
      whereClause.platform = filters.platform;
    }

    if (filters?.search) {
      whereClause.OR = [
        { deviceName: { contains: filters.search, mode: 'insensitive' } },
        { deviceId: { contains: filters.search, mode: 'insensitive' } },
        { user: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const [devices, totalCount] = await Promise.all([
      this.prisma.device.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          syncJobs: {
            select: {
              id: true,
              status: true,
              type: true,
              createdAt: true,
            },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          offlineCaches: {
            select: {
              totalSizeBytes: true,
              cachedAt: true,
            },
          },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.device.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      devices: devices.map((device) => ({
        ...device,
        totalCacheSizeMB: device.offlineCaches.reduce(
          (sum, cache) => sum + cache.totalSizeBytes,
          0,
        ) / (1024 * 1024),
        lastSyncJob: device.syncJobs[0] || null,
      })),
      totalCount,
      pagination: {
        page,
        pageSize,
        totalPages,
      },
    };
  }

  /**
   * Create or update device policy
   */
  async createDevicePolicy(policyData: {
    organizationId: string;
    createdBy: string;
    name: string;
    description?: string;
    type: string;
    settings: ManualPinningPolicy | CacheSyncPolicy | SecurityPolicy | FeatureFlagsPolicy;
    conditions?: any;
    priority?: number;
  }): Promise<DevicePolicy> {
    const policy = await this.prisma.devicePolicy.create({
      data: {
        organizationId: policyData.organizationId,
        createdBy: policyData.createdBy,
        name: policyData.name,
        description: policyData.description,
        type: policyData.type as any,
        settings: policyData.settings as any,
        conditions: policyData.conditions || {},
        priority: policyData.priority || 0,
      },
      include: {
        organization: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    this.logger.log(`Created policy: ${policy.name} (${policy.id})`);

    return {
      ...policy,
      settings: policy.settings as ManualPinningPolicy | CacheSyncPolicy | SecurityPolicy | FeatureFlagsPolicy,
    };
  }

  /**
   * Update device policies in bulk
   */
  async updateDevicePolicies(
    request: DevicePolicyUpdateRequest,
  ): Promise<any> {
    const policies = await this.prisma.devicePolicy.findMany({
      where: {
        id: {
          in: request.policyId ? [request.policyId] : [],
        },
      },
    });

    if (policies.length === 0) {
      throw new BadRequestException('Policy not found');
    }

    const updatedDevices = [];

    for (const deviceId of request.deviceIds) {
      const device = await this.prisma.device.findUnique({
        where: { id: deviceId },
      });

      if (!device) {
        this.logger.warn(`Device ${deviceId} not found for policy update`);
        continue;
      }

      let newPolicies = [...device.installedPolicies];

      switch (request.action) {
        case 'ADD':
          if (!newPolicies.includes(request.policyId)) {
            newPolicies.push(request.policyId);
          }
          break;

        case 'REMOVE':
          newPolicies = newPolicies.filter((pid) => pid !== request.policyId);
          break;

        case 'REPLACE':
          newPolicies = [request.policyId];
          break;
      }

      const updatedDevice = await this.prisma.device.update({
        where: { id: deviceId },
        data: {
          installedPolicies: newPolicies,
          metadata: {
            ...device.metadata,
            lastPolicyUpdate: new Date().toISOString(),
            policyAction: request.action,
          },
        },
      });

      updatedDevices.push(updatedDevice);
    }

    this.logger.log(
      `Updated policies for ${updatedDevices.length} devices`,
    );

    return {
      updatedDevices: updatedDevices.length,
      action: request.action,
      policyId: request.policyId,
    };
  }

  /**
   * Get policies applicable to a device
   */
  async getDevicePolicies(deviceId: string): Promise<any[]> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        organization: {
          include: {
            devicePolicies: {
              where: { isActive: true },
              orderBy: { priority: 'desc' },
            },
          },
        },
      },
    });

    if (!device) {
      return [];
    }

    // Filter policies based on device conditions
    const applicablePolicies = device.organization.devicePolicies.filter(
      (policy) => {
        const conditions = policy.conditions as any;

        // Check device model
        if (conditions.deviceModels && conditions.deviceModels.length > 0) {
          if (!conditions.deviceModels.includes(device.deviceModel)) {
            return false;
          }
        }

        // Check platform
        if (conditions.platforms && conditions.platforms.length > 0) {
          if (!conditions.platforms.includes(device.platform)) {
            return false;
          }
        }

        // Check OS version (simplified check)
        if (conditions.osVersions && conditions.osVersions.length > 0) {
          const deviceOSVersion = device.osVersion.split('.')[0]; // Major version
          const matchingVersions = conditions.osVersions.filter((version: string) =>
            version.startsWith(deviceOSVersion)
          );
          if (matchingVersions.length === 0) {
            return false;
          }
        }

        return true;
      },
    );

    // Apply device-specific policies (installed policy IDs)
    const deviceSpecificPolicies = device.organization.devicePolicies.filter(
      (policy) => device.installedPolicies.includes(policy.id),
    );

    return [...applicablePolicies, ...deviceSpecificPolicies];
  }

  /**
   * Validate device security settings
   */
  /**
   * Enhanced device security validation with comprehensive checks
   */
  private async validateDeviceSecurity(securityInfo: any): Promise<DeviceSecurityValidation> {
    const validation: DeviceSecurityValidation = {
      isValid: true,
      securityScore: 100,
      risks: [],
      recommendations: [],
    };

    // Jailbreak/Root detection (Critical)
    if (securityInfo.isJailbroken) {
      validation.isValid = false;
      validation.reason = 'Device appears to be jailbroken/rooted, which poses critical security risks';
      validation.securityScore -= 50;
      validation.risks.push('Device is jailbroken/rooted - potential for unauthorized access');
      validation.recommendations.push('Use a non-jailbroken device for aviation operations');
      return validation;
    }

    // Developer mode (High risk)
    if (securityInfo.hasDeveloperMode) {
      validation.securityScore -= 20;
      validation.risks.push('Developer mode enabled - potential security vulnerability');
      validation.recommendations.push('Disable developer mode for production use');
      this.logger.warn('Device has developer mode enabled - security risk detected');
    }

    // Encryption support (Critical)
    if (!securityInfo.encryptionSupported) {
      validation.isValid = false;
      validation.reason = 'Device does not support encryption - required for aviation compliance';
      validation.securityScore -= 40;
      validation.risks.push('No encryption support - data at risk');
      validation.recommendations.push('Use a device with hardware encryption support');
      return validation;
    }

    // Screen lock enforcement (Medium risk)
    if (!securityInfo.screenLockEnabled) {
      validation.securityScore -= 15;
      validation.risks.push('No screen lock protection');
      validation.recommendations.push('Enable screen lock with biometric or PIN protection');
    }

    // Biometric capability check (Medium risk)
    if (!securityInfo.biometricCapability) {
      validation.securityScore -= 10;
      validation.risks.push('No biometric authentication available');
      validation.recommendations.push('Enable biometric authentication for enhanced security');
    }

    // Certificate validation (if provided)
    if (securityInfo.certificateChain) {
      const certValidation = await this.validateCertificateChain(securityInfo.certificateChain);
      if (!certValidation.isValid) {
        validation.securityScore -= 25;
        validation.risks.push('Invalid certificate chain detected');
        validation.recommendations.push('Ensure device has valid certificates for secure communication');
      }
    }

    // Malware scanning (if available)
    if (securityInfo.malwareScanResults) {
      if (securityInfo.malwareScanResults.threatsDetected > 0) {
        validation.isValid = false;
        validation.reason = 'Malware detected on device';
        validation.securityScore -= 60;
        validation.risks.push(`${securityInfo.malwareScanResults.threatsDetected} malware threats detected`);
        validation.recommendations.push('Remove all malware before using device for aviation operations');
        return validation;
      }
    }

    // Determine final validation status
    if (validation.securityScore < 50) {
      validation.isValid = false;
      validation.reason = 'Device security score too low for aviation use';
    }

    this.logger.log(`Device security validation: Score ${validation.securityScore}/100, Valid: ${validation.isValid}`);
    
    return validation;
  }

  /**
   * Validate certificate chain for device authentication
   */
  private async validateCertificateChain(certificateChain: string[]): Promise<CertificateValidation> {
    const validation: CertificateValidation = {
      isValid: true,
      errors: [],
    };

    try {
      // In a real implementation, you would:
      // 1. Parse each certificate in the chain
      // 2. Validate signatures
      // 3. Check expiration dates
      // 4. Verify certificate authorities
      // 5. Check for certificate revocation

      // For now, we'll do basic validation
      for (const cert of certificateChain) {
        // Basic format validation (simplified)
        if (!cert.includes('-----BEGIN CERTIFICATE-----') || !cert.includes('-----END CERTIFICATE-----')) {
          validation.isValid = false;
          validation.errors.push('Invalid certificate format');
          break;
        }
      }

      if (validation.isValid) {
        validation.issuer = 'Device Certificate Authority';
        validation.subject = 'EFB Device Certificate';
        validation.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
      }

    } catch (error) {
      validation.isValid = false;
      validation.errors.push(`Certificate validation error: ${error.message}`);
    }

    return validation;
  }

  /**
   * Apply default policies to newly enrolled device
   */
  private async applyDefaultPolicies(
    deviceId: string,
    organizationId: string,
  ): Promise<void> {
    // Create default security policy
    const defaultSecurityPolicy = await this.createDevicePolicy({
      organizationId,
      createdBy: 'system', // System-generated policy
      name: 'Default Security Policy',
      description: 'Baseline security requirements for EFB devices',
      type: 'SECURITY',
      settings: {
        type: 'SECURITY',
        settings: {
          allowScreenshots: false,
          enableWatermarking: true,
          requireBiometrics: true,
          sessionTimeoutMinutes: 30,
          deviceLockoutThreshold: 5,
          allowSharing: false,
          networkRestrictions: {
            blockUntrustedWifi: true,
            requireVPN: false,
          },
          remoteWipeEnabled: true,
        },
      },
      priority: 100,
    });

    // Update device with default policy
    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        installedPolicies: [defaultSecurityPolicy.id],
      },
    });

    this.logger.log(`Applied default policies to device ${deviceId}`);
  }

  /**
   * Apply custom policies to device
   */
  private async applyCustomPolicies(
    deviceId: string,
    policyIds: string[],
  ): Promise<void> {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        installedPolicies: policyIds,
      },
    });
  }

  /**
   * Generate enrollment session token
   */
  /**
   * Generate secure JWT session token with proper expiration and validation
   */
  private async generateSessionToken(
    deviceId: string,
    userId: string,
    organizationId: string,
    tokenType: 'device_session' | 'enrollment' | 'admin' = 'device_session',
  ): Promise<string> {
    const sessionId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    
    // Different expiration times based on token type
    const expirationTime = {
      device_session: 30 * 24 * 60 * 60, // 30 days
      enrollment: 24 * 60 * 60, // 24 hours
      admin: 8 * 60 * 60, // 8 hours
    };

    const payload: JWTTokenPayload = {
      deviceId,
      userId,
      organizationId,
      sessionId,
      tokenType,
      permissions: this.getDevicePermissions(tokenType),
      iat: now,
      exp: now + expirationTime[tokenType],
      iss: 'skymanuals-api',
      aud: 'efb-device',
    };

    // Generate JWT token
    const token = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      algorithm: 'HS256',
    });

    // Store session in database
    await this.prisma.deviceSession.create({
      data: {
        deviceId,
        userId,
        sessionToken: token,
        isActive: true,
        lastActivityAt: new Date(),
        expiresAt: new Date((now + expirationTime[tokenType]) * 1000),
        appContext: {
          tokenType,
          sessionId,
        },
        metadata: {
          payload,
          securityLevel: this.getSecurityLevel(tokenType),
        },
      },
    });

    // Log token generation for audit
    this.logger.log(`Generated ${tokenType} token for device ${deviceId}, expires in ${expirationTime[tokenType]}s`);

    return token;
  }

  /**
   * Get device permissions based on token type
   */
  private getDevicePermissions(tokenType: string): string[] {
    const permissions = {
      device_session: ['read_manuals', 'sync_data', 'create_annotations'],
      enrollment: ['enroll_device'],
      admin: ['manage_devices', 'view_analytics', 'manage_policies'],
    };
    return permissions[tokenType] || [];
  }

  /**
   * Get security level for token type
   */
  private getSecurityLevel(tokenType: string): string {
    const levels = {
      device_session: 'standard',
      enrollment: 'temporary',
      admin: 'high',
    };
    return levels[tokenType] || 'standard';
  }

  /**
   * Create device session for approved device
   */
  private async createDeviceSession(
    deviceId: string,
    userId: string,
  ): Promise<any> {
    // Get device to get organizationId
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { organizationId: true },
    });

    if (!device) {
      throw new BadRequestException('Device not found');
    }

    // Generate secure JWT session token
    const sessionToken = await this.generateSessionToken(
      deviceId,
      userId,
      device.organizationId,
      'device_session',
    );

    // Get the created session
    const session = await this.prisma.deviceSession.findFirst({
      where: {
        deviceId,
        userId,
        sessionToken,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      throw new BadRequestException('Failed to create device session');
    }

    return {
      sessionId: session.id,
      sessionToken,
      expiresAt: session.expiresAt,
      tokenType: 'device_session',
      permissions: this.getDevicePermissions('device_session'),
    };
  }

  /**
   * Validate JWT token and check expiration
   */
  async validateSessionToken(token: string): Promise<{
    isValid: boolean;
    payload?: JWTTokenPayload;
    reason?: string;
  }> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
        algorithms: ['HS256'],
      }) as JWTTokenPayload;

      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        return {
          isValid: false,
          reason: 'Token has expired',
        };
      }

      // Check if session is still active in database
      const session = await this.prisma.deviceSession.findFirst({
        where: {
          sessionToken: token,
          isActive: true,
        },
      });

      if (!session) {
        return {
          isValid: false,
          reason: 'Session not found or inactive',
        };
      }

      // Check if session has expired in database
      if (session.expiresAt && session.expiresAt < new Date()) {
        // Mark session as inactive
        await this.prisma.deviceSession.update({
          where: { id: session.id },
          data: { isActive: false },
        });

        return {
          isValid: false,
          reason: 'Session has expired',
        };
      }

      return {
        isValid: true,
        payload,
      };

    } catch (error) {
      return {
        isValid: false,
        reason: `Token validation failed: ${error.message}`,
      };
    }
  }

  /**
   * Rotate session token for enhanced security
   */
  async rotateSessionToken(oldToken: string, context: RequestContext): Promise<{
    newToken: string;
    expiresAt: Date;
  }> {
    // Validate current token
    const validation = await this.validateSessionToken(oldToken);
    if (!validation.isValid || !validation.payload) {
      throw new BadRequestException('Invalid token for rotation');
    }

    const { payload } = validation;

    // Generate new token
    const newToken = await this.generateSessionToken(
      payload.deviceId,
      payload.userId,
      payload.organizationId,
      payload.tokenType,
    );

    // Deactivate old session
    await this.prisma.deviceSession.updateMany({
      where: {
        sessionToken: oldToken,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    // Get new session info
    const newSession = await this.prisma.deviceSession.findFirst({
      where: {
        sessionToken: newToken,
        isActive: true,
      },
    });

    // Log token rotation for audit
    await this.auditService.logSecurityEvent(
      context,
      'TOKEN_ROTATION',
      'Session Token',
      payload.sessionId,
      AuditSeverity.MEDIUM,
      {
        deviceId: payload.deviceId,
        userId: payload.userId,
        tokenType: payload.tokenType,
        rotationReason: 'Security rotation',
      },
    );

    this.logger.log(`Session token rotated for device ${payload.deviceId}`);

    return {
      newToken,
      expiresAt: newSession?.expiresAt || new Date(),
    };
  }

  /**
   * Revoke all sessions for a device
   */
  async revokeAllDeviceSessions(deviceId: string, context: RequestContext): Promise<void> {
    const revokedSessions = await this.prisma.deviceSession.updateMany({
      where: {
        deviceId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    // Log session revocation for audit
    await this.auditService.logSecurityEvent(
      context,
      'SESSIONS_REVOKED',
      'Device Sessions',
      deviceId,
      AuditSeverity.HIGH,
      {
        deviceId,
        revokedCount: revokedSessions.count,
      },
    );

    this.logger.warn(`Revoked ${revokedSessions.count} sessions for device ${deviceId}`);
  }

  /**
   * Log device analytics event
   */
  async logDeviceAnalytics(
    deviceId: string,
    userId: string,
    organizationId: string,
    action: string,
    targetId?: string,
    metadata?: any,
  ): Promise<void> {
    await this.prisma.deviceAnalytics.create({
      data: {
        deviceId,
        userId,
        organizationId,
        action: action as any,
        targetId,
        metadata: metadata || {},
        timestamp: new Date(),
      },
    });

    this.logger.debug(
      `Logged device analytics: ${action} for device ${deviceId}`,
    );
  }
}
