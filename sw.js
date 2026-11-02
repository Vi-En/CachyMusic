// CachyMusic Audio Workstation - High-Performance Service Worker v1.1.9
const CACHE_NAME = 'cachymusic-v1.1.9';
const ART_CACHE = 'cachymusic-artwork-v4';
const MAX_ARTWORK_ENTRIES = 200;

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './stylesheets/homepage.css',
  './scripts/modules/utils.js',
  './scripts/modules/state.js',
  './scripts/modules/ui-elements.js',
  './scripts/modules/themes.js',
  './scripts/modules/audio-engine.js',
  './scripts/modules/player-core.js',
  './scripts/modules/library.js',
  './scripts/modules/app.js',
  './scripts/dsp-worklet-processor.js',
  './resources/fonts/NMSFuturaProBook_Kerned.ttf',
  './resources/images/music-hanzi.svg',
  './resources/images/app-icon.svg',
  './resources/images/icon-192.png',
  './resources/images/icon-512.png',
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

// Activate: Clean up previous versions and claim clients
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

// Fetch: Tiered caching strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Audio stream and Range requests should pass directly to network (never break 206 Partial Content)
  if (
    request.headers.has('range') ||
    request.destination === 'audio' ||
    url.pathname.includes('/stream.php') ||
    url.pathname.includes('/mpris_state.php') ||
    url.pathname.includes('/hardware_volume.php') ||
    url.pathname.includes('/soulseek.php') ||
    url.pathname.includes('/scan.php') ||
    request.method !== 'GET'
  ) {
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

  // 3. Cache-First: Fonts, App Icons, and Cover Art
  if (
    url.pathname.includes('/resources/fonts/') ||
    url.pathname.includes('/cover.php') ||
    url.pathname.includes('/data/covers/') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const targetCache = url.pathname.includes('/cover.php') ? ART_CACHE : CACHE_NAME;
            const cache = await caches.open(targetCache);
            cache.put(request, networkResponse.clone());
            if (targetCache === ART_CACHE) {
              trimCache(ART_CACHE, MAX_ARTWORK_ENTRIES);
            }
          }
          return networkResponse;
        } catch (_) {
          return new Response('', { status: 404, statusText: 'Resource Not Found' });
        }
      })
    );
    return;
  }

  // 4. Network-First with Offline Fallback for JSON API endpoints
  if (url.pathname.includes('/php/api/tracks.php') || url.pathname.includes('/php/api/playlists.php')) {
    event.respondWith(
      fetch(request).then(async (networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      }).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({
          success: false,
          offline: true,
          error: 'CachyMusic is offline. Stored tracks temporarily unavailable.'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      })
    );
    return;
  }

  // 5. Application scripts and styles: Network-First with cache fallback
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).then(async (networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // 6. Static media assets: Cache-first with background revalidation
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then(async (networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
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
