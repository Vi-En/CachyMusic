// CachyMusic Audio Workstation - High-Performance Service Worker v1.1.3
const CACHE_NAME = 'cachymusic-v1.1.3';
const ART_CACHE = 'cachymusic-artwork-v3';
const MAX_ARTWORK_ENTRIES = 150;

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './stylesheets/homepage.css?v=1.1.3',
  './stylesheets/homepage.css',
  './scripts/homepage.js?v=1.1.3',
  './scripts/homepage.js',
  './scripts/dsp-worklet-processor.js?v=1.1.3',
  './scripts/dsp-worklet-processor.js',
  './resources/images/music-hanzi.svg',
  './resources/images/app-icon.svg',
  './resources/images/icon-192.png',
  './resources/images/icon-512.png',
  './resources/images/bad-apple.png',
  './resources/images/skipprevious.svg',
  './resources/images/skipnext.svg',
  './resources/images/default.svg'
];

// Helper to bound artwork cache size
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      const itemsToDelete = keys.slice(0, keys.length - maxItems);
      await Promise.all(itemsToDelete.map(req => cache.delete(req)));
    }
  } catch (_) {}
}

// Install: Resilient precaching with Promise.allSettled
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const fetchPromises = PRECACHE_ASSETS.map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res && res.status === 200) {
            await cache.put(url, res);
          }
        } catch (err) {
          console.warn('[ServiceWorker] Could not precache:', url, err);
        }
      });
      await Promise.allSettled(fetchPromises);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up previous versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== ART_CACHE) {
            console.log('[ServiceWorker] Purging legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Smart caching strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Audio stream and Range requests should pass directly to network
  if (request.destination === 'audio' || url.pathname.includes('stream.php') || url.pathname.includes('android-media') || request.headers.has('range') || request.method !== 'GET') {
    return;
  }

  // 2. Navigation fallback for offline SPA support
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(async () => {
        const cached = await caches.match('./index.html') || await caches.match('./');
        return cached || new Response('Offline: CachyMusic shell not cached', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      })
    );
    return;
  }

  // 3. High-Performance Artwork Cache with auto-trim
  if (url.pathname.includes('cover.php')) {
    event.respondWith(
      caches.open(ART_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
            trimCache(ART_CACHE, MAX_ARTWORK_ENTRIES);
          }
          return networkResponse;
        } catch (_) {
          return new Response('', { status: 404, statusText: 'Artwork Not Found' });
        }
      })
    );
    return;
  }

  // 4. Dynamic PHP API endpoints: Network-first with structured offline JSON response
  if (url.pathname.includes('/php/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({
          success: false,
          offline: true,
          error: 'CachyMusic is offline. Background service temporarily unavailable.'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      })
    );
    return;
  }

  // 5. Application scripts and styles: Network-First with cache fallback
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // 6. Static media assets: Cache-first with background revalidation
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        if (request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });

      return cachedResponse || fetchPromise;
    })
  );
});
