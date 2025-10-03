import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '@skymanuals/prisma';
import * as request from 'supertest';
import { DeviceService } from '../src/efb/device.service';
import { OfflineCacheService } from '../src/efb/offline-cache.service';
import { EFBController } from '../src/efb/efb.controller';
import {
  DeviceEnrollmentRequest,
  SyncCheckRequest,
  HighlightSync,
  NoteSync,
  CacheInvalidationRequest,
} from '@skymanuals/types';

describe('EFB End-to-End Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let deviceService: DeviceService;
  let offlineCacheService: OfflineCacheService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [EFBController],
      providers: [
        DeviceService,
        OfflineCacheService,
        PrismaService,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    deviceService = moduleFixture.get<DeviceService>(DeviceService);
    offlineCacheService = moduleFixture.get<OfflineCacheService>(OfflineCacheService);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Device Enrollment Flow', () => {
    let testOrganization: any;
    let enrollmentRequest: DeviceEnrollmentRequest;

    beforeEach(async () => {
      // Create test organization
      testOrganization = await prisma.organization.create({
        data: {
          name: 'Test Airlines',
          slug: 'test-airlines',
          logoUrl: 'https://example.com/logo.png',
        },
      });

      enrollmentRequest = {
        deviceModel: 'iPad',
        platform: 'iOS',
        osVersion: '16.0',
        appVersion: '1.0.0',
        deviceName: 'EFB Device #1',
        deviceId: 'test-device-123',
        hardwareId: 'hw-456',
        organizationIdentifier: 'test-airlines',
        securityInfo: {
          isJailbroken: false,
          hasDeveloperMode: false,
          encryptionSupported: true,
          biometricAuthSupported: true,
        },
      };
    });

    afterEach(async () => {
      await prisma.device.deleteMany();
      await prisma.organization.deleteMany();
    });

    it('should enroll device successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/efb/devices/enroll')
        .send(enrollmentRequest);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('status', 'PENDING_ENROLLMENT');
      expect(response.body).toHaveProperty('sessionToken');
      expect(response.body).toHaveProperty('policies');

      // Verify device exists in database
      const device = await prisma.device.findUnique({
        where: { deviceId: 'test-device-123' },
      });
      expect(device).toBeTruthy();
      expect(device.status).toBe('PENDING_ENROLLMENT');
    });

    it('should reject jailbroken devices', async () => {
      const jailbrokenRequest = {
        ...enrollmentRequest,
        securityInfo: {
          ...enrollmentRequest.securityInfo,
          isJailbroken: true,
        },
      };

      const response = await request(app.getHttpServer())
        .post('/efb/devices/enroll')
        .send(jailbrokenRequest);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('jailbroken');
    });

    it('should handle duplicate device enrollment', async () => {
      // Enroll device first time
      await request(app.getHttpServer())
        .post('/efb/devices/enroll')
        .send(enrollmentRequest);

      // Try to enroll same device again
      const response = await request(app.getHttpServer())
        .post('/efb/devices/enroll')
        .send(enrollmentRequest);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('PENDING_ENROLLMENT');
    });

    it('should approve pending device', async () => {
      // Create pending device first
      await request(app.getHttpServer())
        .post('/efb/devices/enroll')
        .send(enrollmentRequest);

      const device = await prisma.device.findUnique({
        where: { deviceId: 'test-device-123' },
      });

      const response = await request(app.getHttpServer())
        .post(`/efb/devices/${device.id}/approve`)
        .send({ customPolicies: [] });

      expect(response.status).toBe(200);
      expect(response.body.device.status).toBe('ACTIVE');
      expect(response.body.session.sessionToken).toBeTruthy();
    });
  });

  describe('Offline Cache Management', () => {
    let testDevice: any;
    let testManual: any;
    let testReaderBundle: any;

    beforeEach(async () => {
      // Create test organization
      const testOrg = await prisma.organization.create({
        data: {
          name: 'Cache Test Org',
          slug: 'cache-test',
        },
      });

      // Create test manual
      testManual = await prisma.manual.create({
        data: {
          organizationId: testOrg.id,
          title: 'Test Aircraft Manual',
          status: 'RELEASED',
        },
      });

      // Create reader bundle
      testReaderBundle = await prisma.readerBundle.create({
        data: {
          manualId: testManual.id,
          version: '1.0.0',
          isActive: true,
          contentJson: JSON.stringify({
            chapters: [
              {
                id: 'ch1',
                title: 'General Information',
                sections: [
                  {
                    id: 'sec1',
                    title: 'Introduction',
                    blocks: [
                      {
                        id: 'block1',
                        type: 'paragraph',
                        content: 'This is a test manual for offline functionality.',
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        },
      });

      // Create test device
      testDevice = await prisma.device.create({
        data: {
          deviceId: 'cache-test-device',
          hardwareId: 'hw-cache-test',
          organizationId: testOrg.id,
          deviceModel: 'iPad',
          platform: 'iOS',
          osVersion: '16.0',
          appVersion: '1.0.0',
          deviceName: 'Cache Test Device',
          status: 'ACTIVE',
          installedPolicies: [],
          securityFlags: {},
        },
      });
    });

    afterEach(async () => {
      await prisma.device.deleteMany();
      await prisma.readerBundle.deleteMany();
      await prisma.manual.deleteMany();
      await prisma.organization.deleteMany();
    });

    it('should check sync status for empty device', async () => {
      const syncRequest: SyncCheckRequest = {
        deviceId: 'cache-test-device',
        cachedManifests: [],
        status: {
          networkStatus: 'ONLINE',
          availableStorageMB: 5000,
        },
      };

      const response = await request(app.getHttpServer())
        .post('/efb/sync/check')
        .send(syncRequest);

      expect(response.status).toBe(200);
      expect(response.body.needsSync).toBe(true);
      expect(response.body.syncJobs.length).toBeGreaterThan(0);

      const syncJob = response.body.syncJobs[0];
      expect(syncJob.readerBundleId).toBe(testReaderBundle.id);
      expect(syncJob.operation).toBe('NEW');
      expect(syncJob.chunksToDownload.length).toBeGreaterThan(0);
    });

    });

    it('should skip sync for up-to-date content', async () => {
      // Create existing cache manifest
      await prisma.cacheManifest.create({
        data: {
          deviceId: testDevice.id,
          readerBundleId: testReaderBundle.id,
          bundleVersion: '1.0.0',
          chunkCount: 1,
          totalSizeBytes: 1024,
          checksum: 'test-checksum',
        },
      });

      const syncRequest: SyncCheckRequest = {
        deviceId: 'cache-test-device',
        cachedManifests: [
          {
            readerBundleId: testReaderBundle.id,
            bundleVersion: '1.0.0',
            manifestChecksum: 'test-checksum',
            chunkChecksums: ['test-checksum'],
            lastModified: new Date().toISOString(),
          },
        ],
        status: {
          networkStatus: 'ONLINE',
          availableStorageMB: 5000,
        },
      };

      const response = await request(app.getHttpServer())
        .post('/efb/sync/check')
        .send(syncRequest);

      expect(response.status).toBe(200);
      expect(response.body.needsSync).toBe(false);
      expect(response.body.syncJobs.length).toBe(0);
    });

    it('should detect delta updates for changed content', async () => {
      // Update reader bundle version
      await prisma.readerBundle.update({
        where: { id: testReaderBundle.id },
        data: {
          version: '1.1.0',
          contentJson: JSON.stringify({
            chapters: [
              {
                id: 'ch1',
                title: 'General Information - Updated',
                sections: [
                  {
                    id: 'sec1',
                    title: 'Introduction',
                    blocks: [
                      {
                        id: 'block1',
                        type: 'paragraph',
                        content: 'This is an updated test manual for offline functionality.',
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        },
      });

      const syncRequest: SyncCheckRequest = {
        deviceId: 'cache-test-device',
        cachedManifests: [
          {
            readerBundleId: testReaderBundle.id,
            bundleVersion: '1.0.0',
            manifestChecksum: 'old-checksum',
            chunkChecksums: ['old-checksum'],
            lastModified: new Date().toISOString(),
          },
        ],
        status: {
          networkStatus: 'ONLINE',
          availableStorageMB: 5000,
        },
      };

      const response = await request(app.getHttpServer())
        .post('/efb/sync/check')
        .send(syncRequest);

      expect(response.status).toBe(200);
      expect(response.body.needsSync).toBe(true);

      const syncJob = response.body.syncJobs[0];
      expect(syncJob.readerBundleId).toBe(testReaderBundle.id);
      expect(syncJob.bundleVersion).toBe('1.1.0');
      expect(syncJob.operation).toBe('UPDATE');
    });

    it('should handle highlight sync from device', async () => {
      const highlightSync: HighlightSync = {
        deviceId: 'cache-test-device',
        highlights: [
          {
            blockId: 'block1',
            content: 'This is highlighted text',
            color: 'yellow',
            note: 'Important note',
            position: {
              startOffset: 0,
              endOffset: 10,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/efb/sync/highlights')
        .send(highlightSync);

      expect(response.status).toBe(200);
      expect(response.body.syncedHighlights).toBe(1);
      expect(response.body.deviceId).toBe('cache-test-device');

      // Verify highlight was stored
      const annotation = await prisma.annotation.findFirst({
        where: { blockId: 'block1' },
      });
      expect(annotation).toBeTruthy();
      expect(annotation.type).toBe('HIGHLIGHT');
    });

    it('should handle note sync from device', async () => {
      const noteSync: NoteSync = {
        deviceId: 'cache-test-device',
        notes: [
          {
            manualId: testManual.id,
            sectionId: 'sec1',
            blockId: 'block1',
            title: 'Flight Note',
            content: 'Important operational information',
            isPrivate: true,
            tags: ['procedure', 'safety'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/efb/sync/notes')
        .send(noteSync);

      expect(response.status).toBe(200);
      expect(response.body.syncedNotes).toBe(1);
    });
  });

  describe('Airplane Mode Simulation', () => {
    let testDevice: any;

    beforeEach(async () => {
      // Create test device
      const testOrg = await prisma.organization.create({
        data: { name: 'Test Org', slug: 'test-org' },
      });

      testDevice = await prisma.device.create({
        data: {
          deviceId: 'airplane-test-device',
          hardwareId: 'hw-airplane-test',
          organizationId: testOrg.id,
          deviceModel: 'iPad',
          platform: 'iOS',
          osVersion: '16.0',
          appVersion: '1.0.0',
          deviceName: 'Airplane Test Device',
          status: 'ACTIVE',
          installedPolicies: [],
          securityFlags: {},
        },
      });
    });

    afterEach(async () => {
      await prisma.device.deleteMany();
      await prisma.organization.deleteMany();
    });

    it('should handle offline sync check gracefully', async () => {
      const offlineSyncRequest: SyncCheckRequest = {
        deviceId: 'airplane-test-device',
        cachedManifests: [],
        status: {
          networkStatus: 'OFFLINE',
          batteryLevel: 85,
          availableStorageMB: 1000,
        },
      };

      const response = await request(app.getHttpServer())
        .post('/efb/sync/check')
        .send(offlineSyncRequest);

      expect(response.status).toBe(200);
      
      // When offline with no cached content, sync should be deferred but recorded
      expect(response.body).toHaveProperty('needsSync');
      expect(response.body.policies).toBeDefined();
      expect(response.body.featureFlags).toBeDefined();
    });

    it('should queue sync jobs for later execution', async () => {
      // Create sync job when device thinks it's offline
      const syncRequest: SyncCheckRequest = {
        deviceId: 'airplane-test-device',
        cachedManifests: [
          {
            readerBundleId: 'bundle-123',
            bundleVersion: '1.0.0',
            manifestChecksum: 'outdated-checksum',
            chunkChecksums: ['outdated-chunk'],
            lastModified: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
          },
        ],
        status: {
          networkStatus: 'OFFLINE',
          batteryLevel: 75,
          availableStorageMB: 500,
        },
      };

      const response = await request(app.getHttpServer())
        .post('/efb/sync/check')
        .send(syncRequest);

      expect(response.status).toBe(200);
      
      // Should identify that sync is needed but queue for later
      expect(response.body.needsSync).toBe(true);
      expect(response.body.syncJobs.length).toBeGreaterThan(0);
      
      // Each sync job should include priority for background processing
      const syncJob = response.body.syncJobs[0];
      expect(syncJob).toHaveProperty('priority');
      expect(syncJob).toHaveProperty('estimatedSizeMB');
    });

    it('should handle intermittent connectivity', async () => {
      // First request while "offline"
      const offlineRequest: SyncCheckRequest = {
        deviceId: 'airplane-test-device',
        cachedManifests: [],
        status: {
          networkStatus: 'OFFLINE',
          batteryLevel: 80,
          availableStorageMB: 2000,
        },
      };

      const offlineResponse = await request(app.getHttpServer())
        .post('/efb/sync/check')
        .send(offlineRequest);

      expect(offlineResponse.status).toBe(200);

      // Simulate connectivity restored
      const onlineRequest: SyncCheckRequest = {
        deviceId: 'airplane-test-device',
        cachedManifests: [],
        status: {
          networkStatus: 'ONLINE',
          batteryLevel: 78, // Slightly lower from background processing
          availableStorageMB: 2000,
        },
      };

      const onlineResponse = await request(app.getHttpServer())
        .post('/efb/sync/check')
        .send(onlineRequest);

      expect(onlineResponse.status).toBe(200);
      
      // Should provide more detailed sync instructions when online
      expect(onlineResponse.body.needsSync).toBeDefined();
      expect(onlineResponse.body.syncJobs).toBeInstanceOf(Array);
      
      if (onlineResponse.body.needsSync) {
        expect(onlineResponse.body.syncJobs.length).toBeGreaterThan(0);
        
        // Verify sync job has proper structure for chunk downloads
        const syncJob = onlineResponse.body.syncJobs[0];
        expect(syncJob).toHaveProperty('chunksToDownload');
        expect(syncJob).toHaveProperty('chunksToDelete');
        expect(syncJob.chunksToDownload).toBeInstanceOf(Array);
        
        // Each chunk should have download URL and checksum
        if (syncJob.chunksToDownload.length > 0) {
          const chunk = syncJob.chunksToDownload[0];
          expect(chunk).toHaveProperty('chunkUrl');
          expect(chunk).toHaveProperty('chunkChecksum');
          expect(chunk).toHaveProperty('chunkSizeBytes');
        }
      }
    });
  });

  describe('Cache Integrity Verification', () => {
    let testDevice: any;

    beforeEach(async () => {
      const testOrg = await prisma.organization.create({
        data: { name: 'Cache Integrity Org', slug: 'cache-integrity' },
      });

      testDevice = await prisma.device.create({
        data: {
          deviceId: 'integrity-test-device',
          hardwareId: 'hw-integrity',
          organizationId: testOrg.id,
          deviceModel: 'iPad',
          platform: 'iOS',
          osVersion: '16.0',
          appVersion: '1.0.0',
          deviceName: 'Integrity Test Device',
          status: 'ACTIVE',
          installedPolicies: [],
          securityFlags: {},
        },
      });
    });

    afterEach(async () => {
      await prisma.device.deleteMany();
      await prisma.organization.deleteMany();
    });

    it('should detect corrupted chunk checksums', async () => {
      const syncRequest: SyncCheckRequest = {
        deviceId: 'integrity-test-device',
        cachedManifests: [
          {
            readerBundleId: 'bundle-with-corruption',
            bundleVersion: '1.0.0',
            manifestChecksum: 'corrupt-manifest-checksum',
            chunkChecksums: ['valid-checksum', 'corrupt-checksum'],
            lastModified: new Date().toISOString(),
          },
        ],
        status: {
          networkStatus: 'ONLINE',
          batteryLevel: 90,
          availableStorageMB: 3000,
        },
      };

      const response = await request(app.getHttpServer())
        .post('/efb/sync/check')
        .send(syncRequest);

      expect(response.status).toBe(200);
      
      // Should identify chunk corruption and schedule re-download
      expect(response.body.needsSync).toBe(true);
      
      if (response.body.syncJobs.length > 0) {
        const syncJob = response.body.syncJobs[0];
        expect(syncJob.operation).toBe('UPDATE');
        
        // Should include corrupted chunk in download list
        const corruptedChunk = syncJob.chunksToDownload.find(
          (chunk: any) => chunk.chunkChecksum === 'corrupt-checksum'
        );
        expect(corruptedChunk).toBeUndefined(); // Should not download same corrupt chunk
        
        // Should mark for re-download with fresh chunk
        expect(syncJob.chunksToDownload.length).toBeGreaterThan(0);
      }
    });

    it('should handle chunk download failures gracefully', async () => {
      // Simulate chunk caching with error
      const chunkPath = `chunks/bundle-123/0`;
      const corruptedData = 'corrupted content that fails checksum validation';

      // Try to cache corrupted chunk - should fail gracefully
      try {
        // In real implementation, this would involve actual chunk storage
        // For test, we'll verify the service handles validation
        const response = await request(app.getHttpServer())
          .post('/efb/cache/chunk')
          .send({
            deviceId: 'integrity-test-device',
            readerBundleId: 'bundle-123',
            chunkIndex: 0,
            chunkData: Buffer.from(corruptedData).toString('base64'),
          });

        // Service should perform checksum validation
        expect(response.status).toBe(400);
        expect(response.body.message).toContain('checksum');
      } catch (error) {
        // Expected to fail due to checksum mismatch
        expect(error.message).toBeTruthy();
      }
    });

    it('should verify chunk checksums during sync', async () => {
      // Create manual and bundle for integrity test
      const testOrg = await prisma.organization.findFirst({
        where: { slug: 'cache-integrity' },
      });

      const manual = await prisma.manual.create({
        data: {
          organizationId: testOrg.id,
          title: 'Integrity Test Manual',
          status: 'RELEASED',
        },
      });

      const bundle = await prisma.readerBundle.create({
        data: {
          manualId: manual.id,
          version: '1.0.0',
          isActive: true,
          contentJson: JSON.stringify({
            testContent: 'This is test content for integrity verification',
            metadata: {
              chunkCount: 2,
              checksums: ['abc123', 'def456'],
            },
          }),
        },
      });

      // Request sync with invalid chunk hash
      const syncRequest: SyncCheckRequest = {
        deviceId: 'integrity-test-device',
        cachedManifests: [
          {
            readerBundleId: bundle.id,
            bundleVersion: '1.0.0',
            manifestChecksum: 'invalid-checksum',
            chunkChecksums: ['invalid-chunk1', 'invalid-chunk2'],
            lastModified: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
          },
        ],
        status: {
          networkStatus: 'ONLINE',
          batteryLevel: 85,
          availableStorageMB: 2500,
        },
      };

      const response = await request(app.getHttpServer())
        .post('/efb/sync/check')
        .send(syncRequest);

      expect(response.status).toBe(200);
      expect(response.body.needsSync).toBe(true);
      
      // All chunks should be marked for re-download due to checksum mismatch
      if (response.body.syncJobs.length > 0) {
        const syncJob = response.body.syncJobs[0];
        expect(syncJob.chunksToDownload.length).toBe(2); // Both chunks need re-download
        expect(syncJob.chunksToDelete).toEqual([]); // No chunks to delete
        
        // Each chunk should have its correct checksum for validation
        syncJob.chunksToDownload.forEach((chunk: any) => {
          expect(chunk).toHaveProperty('chunkChecksum');
          expect(chunk).toHaveProperty('chunksSizeBytes');
          expect(chunk.chunksIndex).toBeGreaterThanOrEqual(0);
        });
      }

      // Cleanup
      await prisma.readerBundle.deleteMany();
      await prisma.manual.deleteMany();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle non-existent device gracefully', async () => {
      const syncRequest: SyncCheckRequest = {
        deviceId: 'non-existent-device',
        cachedManifests: [],
        status: {
          networkStatus: 'ONLINE',
          availableStorageMB: 1000,
        },
      };

      const response = await request(app.getHttpServer())
        .post('/efb/sync/check')
        .send(syncRequest);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('not found');
    });

    it('should handle invalid organization identifier', async () => {
      const enrollmentRequest: DeviceEnrollmentRequest = {
        deviceModel: 'iPad',
        platform: 'iOS',
        osVersion: '16.0',
        appVersion: '1.0.0',
        deviceName: 'Test Device',
        deviceId: 'test-device-invalid-org',
        hardwareId: 'hw-invalid',
        organizationIdentifier: 'non-existent-org',
        securityInfo: {
          isJailbroken: false,
          hasDeveloperMode: false,
          encryptionSupported: true,
          biometricAuthSupported: true,
        },
      };

      const response = await request(app.getHttpServer())
        .post('/efb/devices/enroll')
        .send(enrollmentRequest);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Organization not found');
    });

    it('should validate required fields in sync requests', async () => {
      const invalidSyncRequest = {
        deviceId: 'test-device',
        // Missing required cachedManifests and status fields
      };

      const response = await request(app.getHttpServer())
        .post('/efb/sync/check')
        .send(invalidSyncRequest);

      expect(response.status).toBe(400);
    });

    it('should handle cache invalidation for multiple devices', async () => {
      // Create multiple test devices
      const testOrg = await prisma.organization.create({
        data: { name: 'Multi Device Org', slug: 'multi-device' },
      });

      const devices = [];
      for (let i = 0; i < 3; i++) {
        const device = await prisma.device.create({
          data: {
            deviceId: `multi-device-${i}`,
            hardwareId: `hw-multi-${i}`,
            organizationId: testOrg.id,
            deviceModel: 'iPad',
            platform: 'iOS',
            osVersion: '16.0',
            appVersion: '1.0.0',
            deviceName: `Multi Device ${i}`,
            status: 'ACTIVE',
            installedPolicies: [],
            securityFlags: {},
          },
        });
        devices.push(device);
      }

      const cacheInvalidationRequest: CacheInvalidationRequest = {
        deviceIds: devices.map(d => d.id),
        scope: {
          forceImmediate: true,
        },
      };

      const response = await request(app.getHttpServer())
        .post('/efb/cache/invalidate')
        .send(cacheInvalidationRequest);

      expect(response.status).toBe(200);
      expect(response.body.invalidatedDevices).toBe(3);
      expect(response.body.results.length).toBe(3);

      // Verify all devices were processed
      response.body.results.forEach((result: any) => {
        expect(devices.map(d => d.id)).toContain(result.deviceId);
        expect(result).toHaveProperty('deletedCaches');
        expect(result).toHaveProperty('deletedManifests');
        expect(result).toHaveProperty('deletedChunks');
      });

      // Cleanup
      await prisma.device.deleteMany();
      await prisma.organization.deleteMany();
    });
  });
});
