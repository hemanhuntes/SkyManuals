import { Test, TestingModule } from '@nestjs/testing';
import { DeviceService } from '../src/efb/device.service';
import { OfflineCacheService } from '../src/efb/offline-cache.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  DeviceEnrollmentRequest,
  SyncCheckRequest,
  HighlightSync,
  NoteSync,
  CacheInvalidationRequest,
} from '@skymanuals/types';

describe('EFB Services Unit Tests', () => {
  let deviceService: DeviceService;
  let offlineCacheService: OfflineCacheService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    organization: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    device: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    devicePolicy: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    readerBundle: {
      findUnique: jest.fn(),
    },
    cacheManifest: {
      create: jest.fn(), 
      upsert: jest.fn(),
    },
    annotation: {
      upsert: jest.fn(),
    },
    readerSession: {
      upsert: jest.fn(),
    },
    deviceAnalytics: {
      create: jest.fn(),
    },
    offlineCache: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    cacheChunk: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceService,
        OfflineCacheService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: 'ConfigService',
          useValue: {
            get: jest.fn().mockReturnValue('test-value'),
          },
        },
      ],
    }).compile();

    deviceService = module.get<DeviceService>(DeviceService);
    offlineCacheService = module.get<OfflineCacheService>(OfflineCacheService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('DeviceService', () => {
    const mockEnrollmentRequest: DeviceEnrollmentRequest = {
      deviceModel: 'iPad',
      platform: 'iOS',
      osVersion: '16.0',
      appVersion: '1.0.0',
      deviceName: 'Test Device',
      deviceId: 'test-device-123',
      hardwareId: 'hw-456',
      organizationIdentifier: 'test-org',
      securityInfo: {
        isJailbroken: false,
        hasDeveloperMode: false,
        encryptionSupported: true,
        biometricAuthSupported: true,
      },
    };

    const mockOrganization = {
      id: 'org-123',
      name: 'Test Organization',
      slug: 'test-org',
    };

    const mockDevice = {
      id: 'device-123',
      deviceId: 'test-device-123',
      organizationId: 'org-123',
      status: 'ACTIVE',
      deviceModel: 'iPad',
      platform: 'iOS',
    };

    it('should enroll a new device successfully', async () => {
      // Mock organization lookup
      mockPrismaService.organization.findFirst.mockResolvedValue(mockOrganization);
      
      // Mock device not found initially
      mockPrismaService.device.findUnique.mockResolvedValueOnce(null);
      
      // Mock device creation
      mockPrismaService.device.create.mockResolvedValue(mockDevice);
      
      // Mock policy creation
      mockPrismaService.devicePolicy.create.mockResolvedValue({
        id: 'policy-123',
        name: 'Default Security Policy',
        type: 'SECURITY',
      });

      // Mock device update with policies
      mockPrismaService.device.update.mockResolvedValue({
        ...mockDevice,
      });

      const result = await deviceService.enrollDevice(mockEnrollmentRequest);

      expect(result).toHaveProperty('id', 'device-123');
      expect(result).toHaveProperty('status', 'ACTIVE');
      expect(result).toHaveProperty('sessionToken');
      expect(result).toHaveProperty('policies');

      expect(mockPrismaService.organization.findFirst).toHaveBeenCalledWith({
        where: { slug: 'test-org' },
      });
      expect(mockPrismaService.device.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deviceId: 'test-device-123',
            organizationId: 'org-123',
            status: 'PENDING_ENROLLMENT',
          }),
        })
      );
    });

    it('should reject jailbroken devices', async () => {
      const jailbrokenRequest = {
        ...mockEnrollmentRequest,
        securityInfo: {
          ...mockEnrollmentRequest.securityInfo,
          isJailbroken: true,
        },
      };

      mockPrismaService.organization.findFirst.mockResolvedValue(mockOrganization);
      mockPrismaService.device.findUnique.mockResolvedValueOnce(null);

      await expect(deviceService.enrollDevice(jailbrokenRequest))
        .rejects.toThrow('jailbroken');
    });

    it('should reject devices without encryption support', async () => {
      const noEncryptionRequest = {
        ...mockEnrollmentRequest,
        securityInfo: {
          ...mockEnrollmentRequest.securityInfo,
          encryptionSupported: false,
        },
      };

      mockPrismaService.organization.findFirst.mockResolvedValue(mockOrganization);
      mockPrismaService.device.findUnique.mockResolvedValueOnce(null);

      await expect(deviceService.enrollDevice(noEncryptionRequest))
        .rejects.toThrow('encryption');
    });

    it('should approve pending device', async () => {
      const pendingDevice = {
        ...mockDevice,
        status: 'PENDING_ENROLLMENT',
        userId: 'user-123',
      };

      mockPrismaService.device.findUnique.mockResolvedValueOnce(pendingDevice);
      mockPrismaService.device.update.mockResolvedValue({
        ...pendingDevice,
        status: 'ACTIVE',
      });

      const result = await deviceService.approveDevice('device-123', 'admin-user');

      expect(result.device.status).toBe('ACTIVE');
      expect(result).toHaveProperty('session');
      expect(mockPrismaService.device.update).toHaveBeenCalledWith({
        where: { id: 'device-123' },
        data: expect.objectContaining({
          status: 'ACTIVE',
        }),
      });
    });

    it('should get device list with filters', async () => {
      const mockDevices = [mockDevice];
      
      mockPrismaService.device.findMany.mockResolvedValueOnce(mockDevices);
      mockPrismaService.device.count.mockResolvedValueOnce(1);

      const result = await deviceService.getDeviceList(
        'org-123',
        1,
        20,
        { status: 'ACTIVE', platform: 'iOS' }
      );

      expect(result).toHaveProperty('devices');
      expect(result.devices).toHaveLength(1);
      expect(result.pagination.totalCount).toBe(1);
      
      expect(mockPrismaService.device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123',
            status: 'ACTIVE',
            platform: 'iOS',
          }),
        })
      );
    });

    it('should create device policy', async () => {
      const mockPolicy = {
        id: 'policy-456',
        name: 'Test Policy',
        type: 'MANUAL_PINNING',
        settings: {
          type: 'MANUAL_PINNING',
          settings: {
            manualIds: ['manual-1', 'manual-2'],
            maxStorageMB: 1000,
          },
        },
      };

      mockPrismaService.devicePolicy.create.mockResolvedValue(mockPolicy);

      const result = await deviceService.createDevicePolicy({
        organizationId: 'org-123',
        createdBy: 'admin-user',
        name: 'Test Policy',
        type: 'MANUAL_PINNING',
        settings: {
          type: 'MANUAL_PINNING',
          settings: {
            manualIds: ['manual-1', 'manual-2'],
            maxStorageMB: 1000,
            autoPinNewManuals: false,
            expiration: {
              enabled: true,
              maxDays: 30,
              autoRefresh: true,
            },
          },
        },
      });

      expect(result).toHaveProperty('id', 'policy-456');
      expect(result.settings.type).toBe('MANUAL_PINNING');
      
      expect(mockPrismaService.devicePolicy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-123',
            createdBy: 'admin-user',
            type: 'MANUAL_PINNING',
          }),
        })
      );
    });

    it('should update device policies in bulk', async () => {
      const device1 = { ...mockDevice, installedPolicies: ['policy-1'] };
      const device2 = { ...mockDevice, id: 'device-456', installedPolicies: ['policy-2'] };

      mockPrismaService.devicePolicy.findMany.mockResolvedValueOnce([
        { id: 'policy-123', name: 'Test Policy' },
      ]);
      
      mockPrismaService.device.findUnique
        .mockResolvedValueOnce(device1)
        .mockResolvedValueOnce(device2);

      mockPrismaService.device.update
        .mockResolvedValueOnce(device1)
        .mockResolvedValueOnce(device2);

      const updateRequest = {
        deviceIds: ['device-123', 'device-456'],
        policyId: 'policy-123',
        action: 'ADD' as const,
      };

      const result = await deviceService.updateDevicePolicies(updateRequest);

      expect(result.updatedDevices).toBe(2);
      expect(result.action).toBe('ADD');
      expect(result.policyId).toBe('policy-123');
    });
  });

  describe('OfflineCacheService', () => {
    const mockDevice = {
      id: 'device-123',
      deviceId: 'test-device',
      organizationId: 'org-123',
      deviceModel: 'iPad',
      platform: 'iOS',
      organization: {
        id: 'org-123',
        manuals: [
          {
            id: 'manual-123',
            status: 'RELEASED',
            readerBundles: [
              {
                id: 'bundle-123',
                version: '1.0.0',
                isActive: true,
              },
            ],
          },
        ],
      },
    };

    const mockSyncRequest: SyncCheckRequest = {
      deviceId: 'test-device',
      cachedManifests: [
        {
          readerBundleId: 'bundle-123',
          bundleVersion: '1.0.0',
          manifestChecksum: 'old-checksum',
          chunkChecksums: ['chunk-1', 'chunk-2'],
          lastModified: new Date().toISOString(),
        },
      ],
      status: {
        networkStatus: 'ONLINE',
        availableStorageMB: 5000,
      },
    };

    it('should check sync status for device with cached content', async () => {
      mockPrismaService.device.findUnique.mockResolvedValueOnce(mockDevice);
      mockPrismaService.devicePolicy.findMany.mockResolvedValueOnce([]);

      const result = await offlineCacheService.checkSyncStatus(mockSyncRequest);

      expect(result).toHaveProperty('needsSync');
      expect(result).toHaveProperty('syncJobs');
      expect(result).toHaveProperty('policies');
      expect(result).toHaveProperty('featureFlags');
      
      expect(mockPrismaService.device.findUnique).toHaveBeenCalledWith({
        where: { deviceId: 'test-device' },
        include: expect.any(Object),
      });
    });

    it('should handle empty cached manifests (new device)', async () => {
      const emptySyncRequest = {
        ...mockSyncRequest,
        cachedManifests: [],
      };

      mockPrismaService.device.findUnique.mockResolvedValueOnce(mockDevice);
      mockPrismaService.devicePolicy.findMany.mockResolvedValueOnce([]);

      const result = await offlineCacheService.checkSyncStatus(emptySyncRequest);

      expect(result.needsSync).toBe(true);
      expect(result.syncJobs.length).toBeGreaterThan(0);
    });

    it('should create incremental sync job', async () => {
      const mockBundle = {
        id: 'bundle-123',
        version: '1.1.0',
        manual: {
          organizationId: 'org-123',
        },
      };

      mockPrismaService.readerBundle.findUnique.mockResolvedValueOnce(mockBundle);
      mockPrismaService.syncJob.create.mockResolvedValueOnce({
        id: 'sync-job-123',
        status: 'PENDING',
      });

      const result = await offlineCacheService.createIncrementalSync(
        'device-123',
        'bundle-123',
        new Date()
      );

      expect(result).toHaveProperty('id', 'sync-job-123');
      expect(result).toHaveProperty('status', 'PENDING');
      
      expect(mockPrismaService.syncJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deviceId: 'device-123',
          type: 'INCREMENTAL_SYNC',
          status: 'PENDING',
        }),
      });
    });

    it('should sync highlights from device', async () => {
      const mockHighlightSync: HighlightSync = {
        deviceId: 'test-device',
        highlights: [
          {
            blockId: 'block-123',
            content: 'Highlighted text',
            color: 'yellow',
            note: 'Important note',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      mockPrismaService.annotation.upsert.mockResolvedValueOnce({
        id: 'annotation-123',
        blockId: 'block-123',
        type: 'HIGHLIGHT',
      });

      const result = await offlineCacheService.syncHighlights(mockHighlightSync);

      expect(result.syncedHighlights).toBe(1);
      expect(result.deviceId).toBe('test-device');
      
      expect(mockPrismaService.annotation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            blockId_userId: expect.any(Object),
          },
          update: expect.objectContaining({
            content: 'Highlighted text',
            metadata: expect.objectContaining({
              color: 'yellow',
              note: 'Important note',
            }),
          }),
          create: expect.objectContaining({
            type: 'HIGHLIGHT',
            content: 'Highlighted text',
          }),
        })
      );
    });

    it('should sync notes from device', async () => {
      const mockNoteSync: NoteSync = {
        deviceId: 'test-device',
        notes: [
          {
            manualId: 'manual-123',
            sectionId: 'section-123',
            blockId: 'block-123',
            title: 'Flight Note',
            content: 'Important information',
            isPrivate: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      mockPrismaService.readerSession.upsert.mockResolvedValueOnce({
        id: 'session-123',
        manualId: 'manual-123',
      });

      const result = await offlineCacheService.syncNotes(mockNoteSync);

      expect(result.syncedNotes).toBe(1);
      expect(result.deviceId).toBe('test-device');
      
      expect(mockPrismaService.readerSession.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            manualId: 'manual-123',
            metadata: expect.objectContaining({
              notes: expect.arrayContaining([
                expect.objectContaining({
                  title: 'Flight Note',
                  content: 'Important information',
                  isPrivate: true,
                }),
              ]),
            }),
          }),
        })
      );
    });

    it('should invalidate cache for multiple devices', async () => {
      const mockCacheInvalidation: CacheInvalidationRequest = {
        deviceIds: ['device-123', 'device-456'],
        scope: {
          forceImmediate: true,
        },
      };

      mockPrismaService.offlineCache.deleteMany.mockResolvedValueOnce({ count: 2 });
      mockPrismaService.cacheManifest.deleteMany.mockResolvedValueOnce({ count: 1 });
      mockPrismaService.cacheChunk.deleteMany.mockResolvedValueOnce({ count: 10 });
      mockPrismaService.deviceAnalytics.create.mockResolvedValueOnce({});

      const result = await offlineCacheService.invalidateCache(mockCacheInvalidation);

      expect(result.invalidatedDevices).toBe(2);
      expect(result.results.length).toBe(2);
      
      expect(result.results[0]).toHaveProperty('deletedCaches', 2);
      expect(result.results[0]).toHaveProperty('deletedManifests', 1);
      expect(result.results[0]).toHaveProperty('deletedChunks', 10);
      
      expect(mockPrismaService.offlineCache.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          deviceId: expect.any(String),
        }),
      });
    });

    it('should update cache manifest with chunk metadata', async () => {
      const mockChunks = [
        { chunkIndex: 0, checksum: 'chunk-1-checksum', sizeBytes: 1024 },
        { chunkIndex: 1, checksum: 'chunk-2-checksum', sizeBytes: 2048 },
      ];

      mockPrismaService.cacheManifest.upsert.mockResolvedValueOnce({
        id: 'manifest-123',
        deviceId: 'device-123',
        readerBundleId: 'bundle-123',
      });

      await offlineCacheService.updateCacheManifest(
        'bundle-123',
        '1.0.0',
        mockChunks
      );

      expect(mockPrismaService.cacheManifest.upsert).toHaveBeenCalledWith({
        where: {
          deviceId_readerBundleId: {
            deviceId: 'device-123',
            readerBundleId: 'bundle-123',
          },
        },
        update: expect.objectContaining({
          bundleVersion: '1.0.0',
          chunkCount: 2,
          totalSizeBytes: 3072,
        }),
        create: expect.objectContaining({
          deviceId: 'device-123',
          readerBundleId: 'bundle-123',
        }),
      });
    });
  });

  describe('Device Security Validation', () => {
    it('should validate device security compliance', async () => {
      const deviceInfo = {
        isJailbroken: false,
        hasDeveloperMode: false,
        encryptionSupported: true,
        biometricAuthSupported: true,
      };

      // Test jailbroken detection
      const result = await deviceService['validateDeviceSecurity']({
        isJailbroken: true,
        hasDeveloperMode: false,
        encryptionSupported: true,
        biometricAuthSupported: true,
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('jailbroken');

      // Test encryption requirement
      const noEncryption = await deviceService['validateDeviceSecurity']({
        isJailbroken: false,
        hasDeveloperMode: false,
        encryptionSupported: false,
        biometricAuthSupported: true,
      });

      expect(noEncryption.isValid).toBe(false);
      expect(noEncryption.reason).toContain('encryption');

      // Test valid device
      const validDevice = await deviceService['validateDeviceSecurity'](deviceInfo);
      expect(validDevice.isValid).toBe(true);
    });
  });

  describe('Cache Integrity', () => {
    it('should detect chunk corruption', async () => {
      const corruptedManifests = [
        {
          type: 'CORRUPTED_BUILDING',
          readerBundleId: 'bundle-123',
          bundleVersion: '1.0.0',
          manifestChecksum: 'valid-checksum',
          chunkChecksums: ['valid-chunk1', 'corrupted-chunk2'],
          lastModified: new Date().toISOString(),
        },
      ];

      const mockDevice = {
        id: 'device-123',
        deviceId: 'test-device',
        organizationId: 'org-123',
        deviceModel: 'iPad',
        organization: {
          manuals: [],
        },
      };

      mockPrismaService.device.findUnique.mockResolvedValueOnce(mockDevice);
      mockPrismaService.devicePolicy.findMany.mockResolvedValueOnce([]);

      const result = await offlineCacheService.checkSyncStatus({
        deviceId: 'test-device',
        cachedManifests: corruptedManifests,
        status: {
          networkStatus: 'ONLINE',
          availableStorageMB: 5000,
        },
      });

      expect(result.needsSync).toBe(true);
      expect(result.syncJobs).toBeDefined();
    });
  });
});
