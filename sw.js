// CachyMusic Audio Workstation - High-Performance Service Worker v3.0.0-dev.6
// Cache Storage is shared by every installation on an origin. Scope the
// cache name so a subdirectory installation cannot evict another one.
const CACHE_PREFIX = 'cachymusic-shell:' + encodeURIComponent(self.registration.scope) + ':';
const CACHE_NAME = CACHE_PREFIX + '3.0.0-dev.6.74';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './stylesheets/homepage.css',
  './stylesheets/interaction.css',
  './stylesheets/interaction-refinement.css',
  './scripts/modules/listening-history.js',
  './scripts/modules/recording-lease.js',
  './scripts/modules/compact-media.js',
  './scripts/modules/listening-history-model.js',
  './stylesheets/library-rows.css',
  './stylesheets/playlist-workspace.css',
  './stylesheets/settings-navigation.css',
  './stylesheets/surface-shapes.css',
  './stylesheets/metadata-editor.css',
  './scripts/modules/library-query-controller.js',
  './scripts/modules/transport-controls.js',
  './scripts/modules/settings-navigation.js',
  './stylesheets/volume-controls.css',
  './stylesheets/eq-spectrum.css',
  './stylesheets/tokens.css',
  './stylesheets/themes.css',
  './stylesheets/layout.css',
  './stylesheets/components.css',
  './stylesheets/refined.css',
  './stylesheets/soulseek-responsive.css',
  './stylesheets/theme-identities.css',
  './stylesheets/audit-overhaul.css',
  './scripts/theme-preload.js',
  './scripts/pwa-init.js',
  './scripts/modules/pwa-install.js',
  './scripts/modules/preference-storage.js',
  './scripts/modules/utils.js',
  './scripts/modules/notification-center.js',
  './stylesheets/task-feedback.css',
  './scripts/modules/icons.js',
  './scripts/modules/soulseek-ui-budget.js',
  './scripts/modules/soulseek-transport.js',
  './scripts/modules/soulseek-result-metadata.js',
  './scripts/modules/state.js',
  './scripts/modules/runtime-capabilities.js',
  './scripts/modules/tag-parser.js',
  './scripts/modules/local-library.js',
  './scripts/modules/offline-write-journal.js',
  './scripts/modules/modal-focus.js',
  './scripts/modules/local-source.js',
  './scripts/modules/decode-budget.js',
  './scripts/modules/artwork-cache.js',
  './scripts/modules/indexing-worker.js',
  './scripts/modules/indexing-client.js',
  './scripts/modules/media-session.js',
  './scripts/modules/ui-elements.js',
  './scripts/modules/control-ui.js',
  './scripts/modules/themes.js',
  './scripts/modules/audio-context-policy.js',
  './scripts/modules/audio-graph-lifecycle.js',
  './scripts/modules/eq-spectrum.js',
  './scripts/modules/peq-curve.js',
  './scripts/modules/ultrasonic-status.js',
  './scripts/modules/audio-engine.js',
  './scripts/modules/audio-policies.js',
  './scripts/modules/audio-settings-status.js',
  './scripts/modules/audio-change-policy.js',
  './scripts/modules/dsp-control-transaction.js',
  './scripts/modules/mixer-write-queue.js',
    './scripts/modules/audio-output-hold.js',
    './scripts/modules/worklet-ack.js',
    './scripts/modules/platter-gesture.js',
  './scripts/modules/player-core.js',
  './scripts/modules/track-session.js',
  './scripts/modules/player-marquee.js',
  './scripts/modules/player-presentation.js',
  './scripts/modules/mpris-client.js',
  './scripts/modules/signal-path-model.js',
  './scripts/modules/signal-path-ui.js',
  './scripts/modules/progress-scrubber.js',
  './scripts/modules/library.js',
  './scripts/modules/server-scan.js',
  './scripts/modules/library-transition.js',
  './scripts/modules/playlist-model.js',
  './scripts/modules/playlist-playback.js',
  './scripts/modules/metadata-editor.js',
  './scripts/modules/peq-workstation.js',
  './scripts/modules/software-audio-decoder.js',
  './scripts/modules/soulseek-client.js',
  './scripts/modules/soulseek-controls.js',
  './scripts/modules/player-progress.js',
  './scripts/modules/media-element-events.js',
  './scripts/modules/audio-preferences-ui.js',
  './scripts/modules/library-query.js',
  './scripts/modules/library-query-worker.js',
  './scripts/modules/metadata-providers.js',
  './scripts/modules/artwork-validation.js',
  './scripts/modules/flac-tag-writer.js',
  './scripts/modules/mp3-tag-writer.js',
  './scripts/modules/container-tag-writer.js',
  './scripts/modules/ogg-tag-writer.js',
  './scripts/modules/mp4-tag-writer.js',
  './scripts/modules/lyrics.js',
  './scripts/modules/theme-catalog.js',
  './stylesheets/visualizer-platter.css',
  './scripts/modules/visualizers/alloy.js',
  './scripts/modules/visualizers/amethyst.js',
  './scripts/modules/visualizers/bloom.js',
  './scripts/modules/visualizers/canvas-geometry.js',
  './scripts/modules/visualizers/canvas-shadow.js',
  './scripts/modules/visualizers/crimson.js',
  './scripts/modules/visualizers/graphite.js',
  './scripts/modules/visualizers/instrument-rim.js',
  './scripts/modules/visualizers/jade.js',
  './scripts/modules/visualizers/midnight.js',
  './scripts/modules/visualizers/orbit.js',
  './scripts/modules/visualizers/paper.js',
  './scripts/modules/visualizers/particles.js',
  './scripts/modules/visualizers/record-dial.js',
  './scripts/modules/visualizers/registry.js',
  './scripts/modules/visualizers/liquid-wave.js',
  './scripts/modules/visualizers/segmented-bars.js',
  './scripts/modules/visualizers/sleeve.js',
  './scripts/modules/visualizers/station.js',
  './scripts/modules/visualizers/studio.js',
  './scripts/modules/visualizers/themed-wave.js',
  './scripts/modules/visualizer-budget.js',
  './scripts/modules/visualizer.js',
  './scripts/modules/settings.js',
  './scripts/modules/p2p.js',
  './scripts/modules/android-soulseek-bridge.js',
    './scripts/modules/android-native-playback.js',
  './scripts/modules/android-pcm-reader.js',
  './scripts/modules/artwork-loader.js',
  './scripts/modules/app.js',
  './scripts/dsp-worklet-processor.js',
  './scripts/modules/peak-limiter.js',
  './scripts/modules/pcm-reader.js',
  './scripts/modules/flac-reader.js',
  './scripts/modules/pcm-range.js',
  './scripts/modules/pcm-worker.js',
  './scripts/modules/pcm-stream.js',
  './scripts/modules/pcm-transition.js',
  './resources/images/music-hanzi.svg',
  './resources/images/app-icon.svg',
  './resources/images/icon-192.png',
  './resources/images/icon-512.png',
  './resources/images/default.svg'
];

// Cache only the immutable application shell. No private metadata, covers, audio or API responses.
const SHELL = new Set(PRECACHE_ASSETS.map(asset => new URL(asset, self.registration.scope).pathname));
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Installation fails if even one required asset is missing. Keep the old active build.
    await cache.addAll(PRECACHE_ASSETS.map(asset => new Request(new URL(asset, self.registration.scope), {cache: 'reload'})));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME &&
      key.startsWith(CACHE_PREFIX)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
// Artwork misses are deferred only for controlled image requests. API/media
// responses are never stored in CacheStorage. Unmanaged servers remain compatible.
let coverInFlight = 0;
async function fetchCover(request) {
  const fallback = async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(new Request(new URL('resources/images/default.svg', self.registration.scope))) || new Response('', {status: 503});
  };
  if (coverInFlight >= 24) return fallback();
  coverInFlight++;
  const deadline = Date.now() + 15000;
  const url = new URL(request.url); url.searchParams.set('defer','1');
  try {
    while (Date.now() < deadline) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1,deadline-Date.now()));
      let response;
      try { response = await fetch(url.href,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal}); }
      finally {clearTimeout(timer);}
      if (response.status !== 202 && response.status !== 503) return response;
      // A 503 without the pending protocol's retry header is a real error.
      if (response.headers.get('Retry-After') !== '1') return response;
      await new Promise(resolve => setTimeout(resolve,500));
    }
    return fallback();
  } catch (_) {return fallback();}
  finally {coverInFlight--;}
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.destination === 'image' && url.pathname === new URL('php/api/cover.php',self.registration.scope).pathname) {
    event.respondWith(fetchCover(request)); return;
  }
  if (!SHELL.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, {ignoreSearch: true});
    return cached || new Response('Application asset unavailable', {status: 503});
  })());
});
