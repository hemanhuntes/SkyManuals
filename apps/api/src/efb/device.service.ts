import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@skymanuals/prisma';
import { ConfigService } from '@nestjs/config';
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
} from '@skymanuals/types';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Enroll a new EFB device
   */
  async enrollDevice(
    enrollmentRequest: DeviceEnrollmentRequest,
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
      const sessionToken = await this.generateSessionToken(device.id);

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
    customPolicies?: string[],
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
  private async validateDeviceSecurity(securityInfo: any): Promise<{
    isValid: boolean;
    reason?: string;
  }> {
    const validation = {
      isValid: true,
      reason: undefined,
    };

    // Check for jailbreak/root detection
    if (securityInfo.isJailbroken) {
      validation.isValid = false;
      validation.reason =
        'Device appears to be jailbroken/rooted, which poses security risks';
      return validation;
    }

    // Check developer mode
    if (securityInfo.hasDeveloperMode) {
      this.logger.warn('Device has developer mode enabled');
      // Don't reject but warn
    }

    // Check encryption support
    if (!securityInfo.encryptionSupported) {
      validation.isValid = false;
      validation.reason = 'Device does not support encryption';
      return validation;
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
  private async generateSessionToken(deviceId: string): Promise<string> {
    const payload = {
      deviceId,
      timestamp: Date.now(),
      issuer: 'efb-enrollment',
    };

    const token = crypto.randomBytes(32).toString('hex');
    const session = await this.prisma.deviceSession.create({
      data: {
        deviceId,
        userId: 'enrollment-temp', // Temporary during enrollment
        sessionToken: token,
        isActive: true,
        lastActivityAt: new Date(),
        appContext: {},
        metadata: {
          enrollmentSession: true,
          payload,
        },
      },
    });

    return token;
  }

  /**
   * Create device session for approved device
   */
  private async createDeviceSession(
    deviceId: string,
    userId: string,
  ): Promise<any> {
    const sessionToken = crypto.randomBytes(32).toString('hex');

    const session = await this.prisma.deviceSession.create({
      data: {
        deviceId,
        userId,
        sessionToken,
        isActive: true,
        lastActivityAt: new Date(),
        appContext: {
          offlineMode: false,
          networkType: 'wifi',
        },
        metadata: {
          createdBy: 'device-approval',
        },
      },
    });

    return {
      sessionId: session.id,
      sessionToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };
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
