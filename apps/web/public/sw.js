// Service Worker for SkyManuals Reader - Epic-03
const CACHE_NAME = 'skymanuals-reader-v1';
const OFFLINE_CACHE_NAME = 'skymanuals-offline-v1';
const API_CACHE_NAME = 'skymanuals-api-v1';

// Cache configuration
const STATIC_ASSETS = [
  '/',
  '/readers',
  '/offline.html',
  '/manifest.json',
];

const API_ENDPOINTS = [
  '/api/manuals/',
  '/api/search',
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Installing');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('✅ Service Worker: Static assets cached');
        self.skipWaiting(); // Take control immediately
      })
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Activated');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== OFFLINE_CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('🗑️ Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker: Old caches cleaned');
      self.clients.claim(); // Take control of all clients
    })
  );
});

// Fetch event - serve from cache when offline, update cache when online
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-HTTP requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Handle different types of requests
  if (url.pathname.startsWith('/api/')) {
    // API requests - cache with network-first strategy
    event.respondWith(handleApiRequest(request));
  } else if (url.pathname.startsWith('/readers/')) {
    // Manual reader pages - cache with stale-while-revalidate
    event.respondWith(handleManualRequest(request));
  } else if (STATIC_ASSETS.includes(url.pathname)) {
    // Static assets - cache with cache-first strategy
    event.respondWith(handleStaticRequest(request));
  } else {
    // Other requests - try network first
    event.respondWith(handleOtherRequest(request));
  }
});

// API Request Handler (Network First)
async function handleApiRequest(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful API responses
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Fallback to cache if network fails
    console.log('🌐 Service Worker: Network failed, checking cache');
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      console.log('📋 Service Worker: Serving from cache');
      return cachedResponse;
    }
    
    // Return offline response for API requests
    return new Response(
      JSON.stringify({
        error: 'No internet connection',
        message: 'This request is not available offline',
        offline: true,
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// Manual Request Handler (Stale While Revalidate)
async function handleManualRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Fetch from network in background
  const networkPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cachedResponse || new Response(
    generateOfflinePage(request.url),
    {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    }
  ));
  
  // Return cached version immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Otherwise wait for network
  return networkPromise;
}

// Static Request Handler (Cache First)
async function handleStaticRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

// Other Request Handler (Network First)
async function handleOtherRequest(request) {
  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return new Response('Offline', { status: 503 });
  }
}

// Background Sync for offline annotations
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync-annotations') {
    event.waitUntil(syncAnnotations());
  }
});

// Sync Annotations to Server
async function syncAnnotations() {
  try {
    // Get pending annotations from IndexedDB
    const pendingAnnotations = await getPendingAnnotations();
    
    for (const annotation of pendingAnnotations) {
      try {
        const response = await fetch('/api/manuals/' + annotation.manualId + '/' + annotation.bundleId + '/annotations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(annotation.data),
        });
        
        if (response.ok) {
          // Mark as synced
          await markAnnotationAsSynced(annotation.id);
        }
      } catch (error) {
        console.log('❌ Service Worker: Failed to sync annotation:', error);
      }
    }
    
    console.log('✅ Service Worker: Annotation sync completed');
  } catch (error) {
    console.log('❌ Service Worker: Background sync failed:', error);
  }
}

// Push Notifications for manual updates
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'Manual update available',
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: data.tag || 'manual-update',
      data: data.data || {},
      actions: [
        {
          action: 'view',
          title: 'View Manual',
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
        },
      ],
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'SkyManuals Update', options)
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'view' && event.notification.data?.manualUrl) {
    event.waitUntil(
      clients.openWindow(event.notification.data.manualUrl)
    );
  }
});

// Message handler for manual cache updates
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_MANUAL') {
    const { manualId, manualData } = event.data;
    cacheManualData(manualId, manualData);
  }
});

// Cache Manual Data Function
async function cacheManualData(manualId, manualData) {
  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const response = new Response(JSON.stringify(manualData), {
      headers: { 'Content-Type': 'application/json' },
    });
    
    await cache.put(`/api/manuals/${manualId}/bundle`, response);
    
    console.log(`📚 Service Worker: Manual ${manualId} cached for offline`);
    
    // Notify clients that cache was updated
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'MANUAL_CACHED',
          manualId,
          cachedAt: new Date().toISOString(),
        });
      });
    });
  } catch (error) {
    console.log('❌ Service Worker: Failed to cache manual:', error);
  }
}

// Generate Offline Page
function generateOfflinePage(url) {
  return `
    <!DOCTYPE html>
    <html lang="sv">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>SkyManuals - Offline</title>
        <style>
            body { 
                font-family: system-ui, -apple-system, sans-serif; 
                margin: 0; padding: 2rem; 
                background: #f9fafb; 
                color: #374151;
            }
            .container { 
                max-width: 600px; 
                margin: 0 auto; 
                text-align: center; 
                background: white; 
                padding: 3rem; 
                border-radius: 12px; 
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .icon { font-size: 4rem; margin-bottom: 1rem; }
            .title { font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem; color: #1f2937; }
            .message { color: #6b7280; margin-bottom: 2rem; }
            .button { 
                background: #2563eb; 
                color: white; 
                padding: 0.75rem 1.5rem; 
                border-radius: 8px; 
                text-decoration: none; 
                display: inline-block;
                border: none;
                cursor: pointer;
            }
            .button:hover { background: #1d4ed8; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon">🎪</div>
            <h1 class="title">You're Offline</h1>
            <p class="message">
                This page isn't available offline. Please check your internet connection and try again.
            </p>
            <button class="button" onclick="window.history.back()">
                Go Back
            </button>
        </div>
    </body>
    </html>
  `;
}

// Helper Functions for IndexedDB
async function getPendingAnnotations() {
  // Mock implementation - in production, use IndexedDB
  return [];
}

async function markAnnotationAsSynced(annotationId) {
  // Mock implementation - in production, use IndexedDB
  return true;
}

console.log('🚀 SkyManuals Service Worker loaded successfully!');
