import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';

interface SyncRequest {
  deviceId: string;
  cachedManifests: Array<{
    readerBundleId: string;
    bundleVersion: string;
    manifestChecksum: string;
    chunkChecksums: string[];
    lastModified: string;
  }>;
  status: {
    networkStatus: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
    batteryLevel?: number;
    availableStorageMB?: number;
    lastSyncAt?: string;
  };
}

interface CacheManifest {
  readerBundleId: string;
  bundleVersion: string;
  chunkCount: number;
  totalSizeBytes: number;
  checksum: string;
  chunks: Array<{
    chunkIndex: number;
    chunkPath: string;
    chunkChecksum: string;
    chunkSizeBytes: number;
  }>;
}

interface SyncJob {
  readerBundleId: string;
  bundleVersion: string;
  operation: 'NEW' | 'UPDATE' | 'DELETE';
  chunksToDownload: Array<{
    chunkIndex: number;
    chunkUrl: string;
    chunkChecksum: string;
    chunkSizeBytes: number;
  }>;
  chunksToDelete: number[];
  priority: number;
  estimatedSizeMB: number;
}

interface ChunkMetadata {
  chunkIndex: number;
  chunkChecksum: string;
  chunkSizeBytes: number;
  downloadedAt: string;
  lastAccessedAt: string;
}

export class CacheManagerService {
  private static instance: CacheManagerService;
  private isOnline: boolean = false;
  private cacheDir: string = `${FileSystem.documentDirectory}cache/`;
  private manifests: Map<string, CacheManifest> = new Map();

  static getInstance(): CacheManagerService {
    if (!CacheManagerService.instance) {
      CacheManagerService.instance = new CacheManagerService();
    }
    return CacheManagerService.instance;
  }

  constructor() {
    this.initializeNetworkMonitoring();
    this.loadCachedManifests();
  }

  private async initializeNetworkMonitoring(): Promise<void> {
    NetInfo.addEventListener(state => {
      this.isOnline = state.isInternetReachable ?? false;
      console.log('Network status:', this.isOnline ? 'ONLINE' : 'OFFLINE');
    });
  }

  private async loadCachedManifests(): Promise<void> {
    try {
      const manifestsDir = `${this.cacheDir}manifests/`;
      const dirInfo = await FileSystem.getInfoAsync(manifestsDir);
      
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(manifestsDir);

        return;
      }

      const manifestFiles = await FileSystem.readDirectoryAsync(manifestsDir);
      
      for (const file of manifestFiles) {
        const manifestPath = `${manifestsDir}${file}`;
        const manifestData = await FileSystem.readAsStringAsync(manifestPath);
        const manifest = JSON.parse(manifestData);
        this.manifests.set(manifest.readerBundleId, manifest);
      }

      console.log(`Loaded ${this.manifests.size} cached manifests`);
    } catch (error) {
      console.error('Failed to load cached manifests:', error);
    }
  }

  async getCachedManifests(): Promise<CacheManifest[]> {
    return Array.from(this.manifests.values());
  }

  async checkForUpdates(deviceId: string): Promise<SyncJob[]> {
    try {
      const cachedManifests = await this.getCachedManifests();
      
      const syncRequest: SyncRequest = {
        deviceId,
        cachedManifests: cachedManifests.map(m => ({
          readerBundleId: m.readerBundleId,
          bundleVersion: m.bundleVersion,
          manifestChecksum: m.checksum,
          chunkChecksums: m.chunks.map(c => c.chunkChecksum),
          lastModified: new Date().toISOString(), // This should come from file metadata
        })),
        status: {
          networkStatus: this.isOnline ? 'ONLINE' : 'OFFLINE',
          availableStorageMB: await this.getAvailableStorageMB(),
          lastSyncAt: await this.getLastSyncTimestamp(),
        },
      };

      const response = await fetch('https://api.skymanuals.com/efb/sync/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(syncRequest),
      });

      if (!response.ok) {
        throw new Error('Sync check failed');
      }

      const syncData = await response.json();
      return syncData.syncJobs || [];
    } catch (error) {
      console.error('Failed to check for updates:', error);
      
      // Return empty array if offline or error
      return [];
    }
  }

  async downloadChunk(
    chunkUrl: string,
    bundleId: string,
    chunkIndex: number,
    expectedChecksum: string,
  ): Promise<boolean> {
    try {
      const chunkPath = `${this.cacheDir}chunks/${bundleId}/${chunkIndex}`;
      const chunkDir = `${this.cacheDir}chunks/${bundleId}/`;
      
      // Ensure chunk directory exists
      await FileSystem.makeDirectoryAsync(chunkDir);

      // Download chunk
      const downloadResult = await FileSystem.downloadAsync(chunkUrl, chunkPath);
      
      if (downloadResult.status !== 200) {
        throw new Error(`Download failed with status ${downloadResult.status}`);
      }

      // Verify checksum
      const downloadedData = await FileSystem.readAsStringAsync(chunkPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const downloadedChecksum = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        downloadedData,
        { encoding: Crypto.CryptoEncoding.BASE64 },
      );

      if (downloadedChecksum !== expectedChecksum) {
        await FileSystem.deleteAsync(chunkPath);
        throw new Error('Chunk checksum mismatch');
      }

      console.log(`Downloaded chunk ${chunkIndex} for bundle ${bundleId}`);
      return true;
    } catch (error) {
      console.error(`Failed to download chunk ${chunkIndex}:`, error);
      return false;
    }
  }

  async downloadSyncJob(syncJob: SyncJob): Promise<boolean> {
    try {
      const bundleDir = `${this.cacheDir}chunks/${syncJob.readerBundleId}/`;
      await FileSystem.makeDirectoryAsync(bundleDir);

      let successCount = 0;
      const totalChunks = syncJob.chunksToDownload.length;

      // Download chunks sequentially to avoid overwhelming network
      for (const chunk of syncJob.chunksToDownload) {
        if (!this.isOnline) {
          console.warn('Network lost during download, aborting');
          break;
        }

        const success = await this.downloadChunk(
          chunk.chunkUrl,
          syncJob.readerBundleId,
          chunk.chunkIndex,
          chunk.chunkChecksum,
        );

        if (success) {
          successCount++;
        }
      }

      // Delete obsolete chunks
      for (const chunkIndex of syncJob.chunksToDelete) {
        const chunkPath = `${bundleDir}${chunkIndex}`;
        try {
          await FileSystem.deleteAsync(chunkPath);
          console.log(`Deleted obsolete chunk ${chunkIndex}`);
        } catch (error) {
          console.warn(`Failed to delete chunk ${chunkIndex}:`, error);
        }
      }

      console.log(`Sync job completed: ${successCount}/${totalChunks} chunks downloaded`);
      return successCount === totalChunks;
      } catch (error) {
        console.error('Failed to download sync job:', error);
        return false;
      }
  }

  async updateCacheManifest(
    bundleId: string,
    bundleVersion: string,
    chunks: Array<{
      chunkIndex: number;
      chunkChecksum: string;
      chunkSizeBytes: number;
    }>,
  ): Promise<void> {
    try {
      const manifest: CacheManifest = {
        readerBundleId: bundleId,
        bundleVersion,
        chunkCount: chunks.length,
        totalSizeBytes: chunks.reduce((sum, chunk) => sum + chunk.chunkSizeBytes, 0),
        checksum: await this.calculateManifestChecksum(chunks),
        chunks: chunks.map(chunk => ({
          chunkIndex: chunk.chunkIndex,
          chunkPath: `${this.cacheDir}chunks/${bundleId}/${chunk.chunkIndex}`,
          chunkChecksum: chunk.chunkChecksum,
          chunkSizeBytes: chunk.chunkSizeBytes,
        })),
      };

      // Save manifest to file system
      const manifestPath = `${this.cacheDir}manifests/${bundleId}.json`;
      await FileSystem.writeAsStringAsync(manifestPath, JSON.stringify(manifest));

      // Update in-memory cache
      this.manifests.set(bundleId, manifest);

      // Update manifest on server
      await this.updateServerManifest(bundleId, manifest);

      console.log(`Updated cache manifest for bundle ${bundleId}`);
    } catch (error) {
      console.error('Failed to update cache manifest:', error);
    }
  }

  async getChunkContent(bundleId: string, chunkIndex: number): Promise<string | null> {
    try {
      const chunkPath = `${this.cacheDir}chunks/${bundleId}/${chunkIndex}`;
      const chunkExists = await FileSystem.getInfoAsync(chunkPath);

      if (!chunkExists.exists) {
        console.warn(`Chunk not found: ${bundleId}/${chunkIndex}`);
        return null;
      }

      // Update last accessed time
      const manifest = this.manifests.get(bundleId);
      if (manifest) {
        await this.updateLastAccessedTime(bundleId);
      }

      // Read chunk content
      return await FileSystem.readAsStringAsync(chunkPath, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (error) {
      console.error(`Failed to read chunk ${bundleId}/${chunkIndex}:`, error);
      return null;
    }
  }

  async getChunkMetadata(bundleId: string, chunkIndex: number): Promise<ChunkMetadata | null> {
    try {
      const chunkPath = `${this.cacheDir}chunks/${bundleId}/${chunkIndex}`;
      const chunkInfo = await FileSystem.getInfoAsync(chunkPath);

      if (!chunkInfo.exists || !chunkInfo.exists || typeof chunkInfo.size !== 'number') {
        return null;
      }

      const manifest = this.manifests.get(bundleId);
      const chunk = manifest?.chunks.find(c => c.chunkIndex === chunkIndex);

      if (!chunk) {
        return null;
      }

      return {
        chunkIndex,
        chunkChecksum: chunk.chunkChecksum,
        chunkSizeBytes: chunk.chunkSizeBytes,
        downloadedAt: chunkInfo.modificationTime ? new Date(chunkInfo.modificationTime * 1000).toISOString() : new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Failed to get chunk metadata:', error);
      return null;
    }
  }

  async clearCacheForBundle(bundleId: string): Promise<void> {
    try {
      const chunkDir = `${this.cacheDir}chunks/${bundleId}/`;
      const manifestPath = `${this.cacheDir}manifests/${bundleId}.json`;

      // Delete all chunks
      try {
        await FileSystem.deleteAsync(chunkDir);
      } catch (error) {
        console.warn(`Failed to delete chunk directory:`, error);
      }

      // Delete manifest
      try {
        await FileSystem.deleteAsync(manifestPath);
      } catch (error) {
        console.warn(`Failed to delete manifest:`, error);
      }

      // Remove from memory
      this.manifests.delete(bundleId);

      console.log(`Cleared cache for bundle ${bundleId}`);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  async getCacheStats(): Promise<{
    totalBundles: number;
    totalSizeMB: number;
    totalChunks: number;
    cacheDirectory: string;
  }> {
    try {
      let totalSizeBytes = 0;
      let totalChunks = 0;

      for (const manifest of this.manifests.values()) {
        totalSizeBytes += manifest.totalSizeBytes;
        totalChunks += manifest.chunkCount;
      }

      return {
        totalBundles: this.manifests.size,
        totalSizeMB: Math.round(totalSizeBytes / (1024 * 1024)),
        totalChunks,
        cacheDirectory: this.cacheDir,
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return {
        totalBundles: 0,
        totalSizeMB: 0,
        totalChunks: 0,
        cacheDirectory: this.cacheDir,
      };
    }
  }

  private async calculateManifestChecksum(chunks: any[]): Promise<string> {
    const manifestData = JSON.stringify({
      chunks: chunks.sort((a, b) => a.chunkIndex - b.chunkIndex),
    });
    
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      manifestData,
    );
  }

  private async updateServerManifest(bundleId: string, manifest: CacheManifest): Promise<void> {
    try {
      await fetch('https://api.skymanuals.com/efb/cache/manifest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: 'device_id_placeholder', // Would get from auth service
          readerBundleId: bundleId,
          bundleVersion: manifest.bundleVersion,
          chunks: manifest.chunks.map(chunk => ({
            chunkIndex: chunk.chunkIndex,
            checksum: chunk.chunkChecksum,
            sizeBytes: chunk.chunkSizeBytes,
          })),
        }),
      });
    } catch (error) {
      console.error('Failed to update server manifest:', error);
      // Don't throw - this is not critical for cache functionality
    }
  }

  private async updateLastAccessedTime(bundleId: string): Promise<void> {
    try {
      const manifest = this.manifests.get(bundleId);
      if (manifest) {
        manifest.lastAccessedAt = new Date();
        const manifestPath = `${this.cacheDir}manifests/${bundleId}.json`;
        await FileSystem.writeAsStringAsync(manifestPath, JSON.stringify(manifest));
      }
    } catch (error) {
      console.error('Failed to update last accessed time:', error);
    }
  }

  private async getAvailableStorageMB(): Promise<number> {
    try {
      const freeDiskStorageMB = await FileSystem.getFreeDiskStorageAsync();
      return Math.floor(freeDiskStorageMB / (1024 * 1024));
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return 0;
    }
  }

  private async getLastSyncTimestamp(): Promise<string | undefined> {
    try {
      return await AsyncStorage.getItem('last_sync_timestamp') || undefined;
    } catch (error) {
      console.error('Failed to get last sync timestamp:', error);
      return undefined;
    }
  }

  async setLastSyncTimestamp(timestamp: string): Promise<void> {
    try {
      await AsyncStorage.setItem('last_sync_timestamp', timestamp);
    } catch (error) {
      console.error('Failed to set last sync timestamp:', error);
    }
  }

  async purgeExpiredCache(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Remove expired manifests
      for (const [bundleId, manifest] of this.manifests.entries()) {
        const manifestFile = `${this.cacheDir}manifests/${bundleId}.json`;
        const manifestInfo = await FileSystem.getInfoAsync(manifestFile);

        if (manifestInfo.exists && manifestInfo.modificationTime) {
          const manifestTime = new Date(manifestInfo.modificationTime * 1000);
          if (manifestTime < thirtyDaysAgo) {
            await this.clearCacheForBundle(bundleId);
          }
        }
      }

      console.log('Purged expired cache entries');
    } catch (error) {
      console.error('Failed to purge expired cache:', error);
    }
  }
}
