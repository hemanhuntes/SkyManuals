// Offline Manager for SkyManuals Reader - Epic-03
export class OfflineManager {
  private static instance: OfflineManager;
  private db: IDBDatabase | null = null;
  private isOnline: boolean = navigator.onLine;

  constructor() {
    this.setupEventListeners();
    this.initIndexedDB();
  }

  static getInstance(): OfflineManager {
    if (!OfflineManager.instance) {
      OfflineManager.instance = new OfflineManager();
    }
    return OfflineManager.instance;
  }

  // Initialize IndexedDB for offline storage
  private async initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SkyManualsOffline', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('📱 IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Manual bundles store
        if (!db.objectStoreNames.contains('manualBundles')) {
          const bundleStore = db.createObjectStore('manualBundles', { 
            keyPath: ['manualId', 'version'] 
          });
          bundleStore.createIndex('manualId', 'manualId', { unique: false });
          bundleStore.createIndex('version', 'version', { unique: false });
          bundleStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        });

        // Annotations store
        if (!db.objectStoreNames.contains('annotations')) {
          const annotationStore = db.createObjectStore('annotations', { 
            keyPath: 'id' 
          });
          annotationStore.createIndex('manualId', 'manualId', { unique: false });
          annotationStore.createIndex('synced', ['manualId', 'syncedAt'], { unique: false });
          annotationStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Reading sessions store
        if (!db.objectStoreNames.contains('readingSessions')) {
          const sessionStore = db.createObjectStore('readingSessions', { 
            keyPath: ['manualId', 'userId'] 
          });
          sessionStore.createIndex('userId', 'userId', { unique: false });
          sessionStore.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
        }

        // Offline queue store
        if (!db.objectStoreNames.contains('offlineQueue')) {
          const queueStore = db.createObjectStore('offlineQueue', { 
            keyPath: 'id',
            autoIncrement: true 
          });
          queueStore.createIndex('type', 'type', { unique: false });
          queueStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        console.log('🗄️ IndexedDB stores created');
      };
    });
  }

  // Setup event listeners
  private setupEventListeners(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('🌐 Connection restored');
      this.syncOfflineData();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📴 Gone offline');
    });

    // Register for background sync
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then(registration => {
        registration.addEventListener('sync', (event: any) => {
          if (event.tag === 'background-sync-annotations') {
            this.syncAnnotations();
          }
        });
      });
    }
  }

  // Check if manual is available offline
  async isManualCached(manualId: string, version?: string): Promise<boolean> {
    if (!this.db) return false;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['manualBundles'], 'readonly');
      const store = transaction.objectStore('manualBundles');
      const request = store.get([manualId, version || 'latest']);

      request.onsuccess = () => {
        resolve(!!request.result);
      };

      request.onerror = () => {
        resolve(false);
      };
    });
  }

  // Cache manual bundle for offline access
  async cacheManualBundle(manualId: string, version: string, bundleData: any): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['manualBundles'], 'readwrite');
      const store = transaction.objectStore('manualBundles');

      const bundleRecord = {
        manualId,
        version,
        bundleData,
        cachedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        checksum: this.generateChecksum(bundleData),
      };

      const request = store.put(bundleRecord);

      request.onsuccess = () => {
        console.log(`📚 Manual ${manualId} v${version} cached offline`);
        
        // Notify Service Worker
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.controller?.postMessage({
            type: 'MANUAL_CACHED',
            manualId,
            version,
            cachedAt: bundleRecord.cachedAt,
          });
        }

        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Get cached manual bundle
  async getCachedManualBundle(manualId: string, version?: string): Promise<any | null> {
    if (!this.db) return null;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['manualBundles'], 'readonly');
      const store = transaction.objectStore('manualBundles');
      const request = store.get([manualId, version || 'latest']);

      request.onsuccess = () => {
        const result = request.result;
        if (result && new Date(result.expiresAt) > new Date()) {
          resolve(result.bundleData);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    });
  }

  // Cache annotation for offline sync
  async cacheAnnotation(manualId: string, annotation: any): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['annotations'], 'readwrite');
      const store = transaction.objectStore('annotations');

      const annotationRecord = {
        id: annotation.id || `${Date.now()}-${Math.random()}`,
        manualId,
        annotation,
        synced: false,
        syncedAt: null,
        createdAt: new Date().toISOString(),
      };

      const request = store.put(annotationRecord);

      request.onsuccess = () => {
        console.log(`📝 Annotation cached for sync`);
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Cache reading session
  async cacheReadingSession( manualId: string, userId: string, sessionData: any): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['readingSessions'], 'readwrite');
      const store = transaction.objectStore('readingSessions');

      const sessionRecord = {
        manualId,
        userId,
        ...sessionData,
        lastAccessedAt: new Date().toISOString(),
        synced: false,
      };

      const request = store.put(sessionRecord);

      request.onsuccess = () => {
        console.log(`📊 Reading session cached for Manual ${manualId}`);
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Queue action for offline sync
  async queueOfflineAction(type: string, data: any): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readwrite');
      const store = transaction.objectStore('offlineQueue');

      const actionRecord = {
        type,
        data,
        createdAt: new Date().toISOString(),
        attempts: 0,
      };

      const request = store.add(actionRecord);

      request.onsuccess = () => {
        console.log(`📋 Action queued for offline sync: ${type}`);
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Sync offline data when connection is restored
  async syncOfflineData(): Promise<void> {
    if (!this.isOnline || !this.db) return;

    console.log('🔄 Starting offline data sync...');

    try {
      await this.syncAnnotations();
      await this.syncReadingSessions();
      await this.processOfflineQueue();
      console.log('✅ Offline data sync completed');
    } catch (error) {
      console.error('❌ Offline data sync failed:', error);
    }
  }

  // Sync annotations to server
  private async syncAnnotations(): Promise<void> {
    const annotations = await this.getUnsyncedAnnotations();
    
    for (const annotation of annotations) {
      try {
        if (this.isOnline) {
          const response = await fetch(`/api/manuals/${annotation.manualId}/annotations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(annotation.annotation),
          });

          if (response.ok) {
            await this.markAnnotationAsSynced(annotation.id);
            console.log(`✅ Annotation synced: ${annotation.id}`);
          }
        }
      } catch (error) {
        console.log(`❌ Failed to sync annotation ${annotation.id}:`, error);
      }
    }
  }

  // Sync reading sessions to server
  private async syncReadingSessions(): Promise<void> {
    const sessions = await this.getUnsyncedReadingSessions();
    
    for (const session of sessions) {
      try {
        if (this.isOnline) {
          const response = await fetch(`/api/manuals/${session.manualId}/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(session),
          });

          if (response.ok) {
            await this.markReadingSessionAsSynced(session.manualId, session.userId);
            console.log(`✅ Reading session synced: ${session.manualId}`);
          }
        }
      } catch (error) {
        console.log(`❌ Failed to sync reading session ${session.manualId}:`, error);
      }
    }
  }

  // Process offline queue
  private async processOfflineQueue(): Promise<void> {
    const actions = await this.getQueuedActions();
    
    for (const action of actions) {
      try {
        if (this.isOnline) {
          await this.executeAction(action);
          await this.removeQueuedAction(action.id);
          console.log(`✅ Queued action executed: ${action.type}`);
        }
      } catch (error) {
        console.log(`❌ Failed to execute queued action ${action.id}:`, error);
        await this.incrementActionAttempts(action.id);
      }
    }
  }

  // Get unsynced annotations
  private async getUnsyncedAnnotations(): Promise<any[]> {
    if (!this.db) return [];

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['annotations'], 'readonly');
      const store = transaction.objectStore('annotations');
      const index = store.index('synced');
      const request = index.getAll([false, null]);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }

  // Mark annotation as synced
  private async markAnnotationAsSynced(annotationId: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['annotations'], 'readwrite');
      const store = transaction.objectStore('annotations');
      const request = store.get(annotationId);

      request.onsuccess = () => {
        const annotation = request.result;
        if (annotation) {
          annotation.synced = true;
          annotation.syncedAt = new Date().toISOString();
          
          const updateRequest = store.put(annotation);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Helper Methods
  private async getUnsyncedReadingSessions(): Promise<any[]> {
    if (!this.db) return [];

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['readingSessions'], 'readonly');
      const store = transaction.objectStore('readingSessions');
      const request = store.getAll();

      request.onsuccess = () => {
        const sessions = (request.result || []).filter(session => !session.synced);
        resolve(sessions);
      };

      request.onerror = () => resolve([]);
    });
  }

  private async markReadingSessionAsSynced(manualId: string, userId: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['readingSessions'], 'readwrite');
      const store = transaction.objectStore('readingSessions');
      const request = store.get([manualId, userId]);

      request.onsuccess = () => {
        const session = request.result;
        if (session) {
          session.synced = true;
          
          const updateRequest = store.put(session);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async getQueuedActions(): Promise<any[]> {
    if (!this.db) return [];

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readonly');
      const store = transaction.objectStore('offlineQueue');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }

  private async removeQueuedAction(actionId: number): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readwrite');
      const store = transaction.objectStore('offlineQueue');
      const request = store.delete(actionId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async incrementActionAttempts(actionId: number): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readwrite');
      const store = transaction.objectStore('offlineQueue');
      const request = store.get(actionId);

      request.onsuccess = () => {
        const action = request.result;
        if (action) {
          action.attempts += 1;
          
          const updateRequest = store.put(action);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async executeAction(action: any): Promise<void> {
    // Mock implementation - execute different action types
    switch (action.type) {
      case 'SUGGEST_EDIT':
        return fetch('/api/manuals/' + action.data.manualId + '/suggest-edits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action.data),
        }).then(response => {
          if (!response.ok) throw new Error('Failed to suggest edit');
        });
      
      case 'ANNOTATION':
        return fetch('/api/manuals/' + action.data.manualId + '/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action.data),
        }).then(response => {
          if (!response.ok) throw new Error('Failed to create annotation');
        });
      
      default:
        throw new Error('Unknown action type: ' + action.type);
    }
  }

  private generateChecksum(data: any): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Public API Methods
  async downloadForOffline(manualId: string, version: string = 'latest'): Promise<boolean> {
    try {
      console.log(`📱 Starting offline download for Manual ${manualId}`);
      
      // Check if already cached
      const cached = await this.isManualCached(manualId, version);
      if (cached) {
        console.log(`📚 Manual ${manualId} already cached offline`);
        return true;
      }

      // Fetch bundle data
      const response = await fetch(`/api/bundles/${manualId}/${version}`);
      if (!response.ok) throw new Error('Failed to fetch manual bundle');

      const bundleData = await response.json();
      
      // Cache the bundle
      await this.cacheManualBundle(manualId, version, bundleData);
      
      console.log(`✅ Manual ${manualId} v${version} downloaded for offline`);
      return true;
    } catch (error) {
      console.error('❌ Failed to download manual for offline:', error);
      return false;
    }
  }

  async getCacheInfo(): Promise<any> {
    if (!this.db) return { manualCount: 0, totalSize: 0, annotations: 0 };

    const manuals = await new Promise<any[]>((resolve) => {
      const transaction = this.db!.transaction(['manualBundles'], 'readonly');
      const store = transaction.objectStore('manualBundles');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });

    const annotations = await new Promise<any[]>((resolve) => {
      const transaction = this.db!.transaction(['annotations'], 'readonly');
      const store = transaction.objectStore('annotations');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });

    const totalSize = manuals.reduce((sum, manual) => {
      return sum + JSON.stringify(manual.bundleData).length;
    }, 0);

    return {
      manualCount: manuals.length,
      totalSize: Math.round(totalSize / (1024 * 1024) * 100) / 100, // MB
      annotations: annotations.length,
      lastSyncAt: localStorage.getItem('lastSyncAt') || null,
    };
  }

  async clearCache(): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['manualBundles', 'annotations', 'readingSessions', 'offlineQueue'], 'readwrite');
    
    const manualStore = transaction.objectStore('manualBundles');
    const annotationStore = transaction.objectStore('annotations');
    const sessionStore = transaction.objectStore('readingSessions');
    const queueStore = transaction.objectStore('offlineQueue');

    return new Promise((resolve, reject) => {
      const requests = [
        manualStore.clear(),
        annotationStore.clear(),
        sessionStore.clear(),
        queueStore.clear(),
      ];

      let completed = 0;
      requests.forEach(request => {
        request.onsuccess = () => {
          completed++;
          if (completed === requests.length) {
            console.log('🗑️ All offline cache cleared');
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  // Connection status
  get connected(): boolean {
    return this.isOnline;
  }

  // Trigger manual sync
  async forceSync(): Promise<void> {
    await this.syncOfflineData();
  }
}

// Export singleton instance
export const offlineManager = OfflineManager.getInstance();






