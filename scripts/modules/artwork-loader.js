// CachyMusic - Directional Artwork Prefetcher & Bounded Image Decode Cache

const DEFAULT_COVER = 'resources/images/default.svg';

/**
 * Resolves the lightweight thumbnail URL for a library track row.
 */
export function resolveTrackThumbUrl(track) {
    if (!track) return DEFAULT_COVER;
    if (track.coverThumb) return track.coverThumb;
    const raw = track.cover;
    if (!raw || typeof raw !== 'string') return DEFAULT_COVER;
    if (raw.startsWith('data:') || raw.startsWith('blob:') || raw.includes('default.svg')) return raw;
    // Only our thumbnail endpoints understand this parameter. Preserve external
    // signed URLs, fragments, and ordinary artwork paths exactly.
    try {
        const base = globalThis.location?.href || 'https://appassets.androidplatform.net/index.html';
        const u = new URL(raw, base);
        if (u.origin !== new URL(base).origin || !/(?:^|\/)php\/api\/cover\.php$|^\/android-media-art$/.test(u.pathname)) return raw;
        if (u.searchParams.has('thumb')) return raw;
        const hashAt = raw.indexOf('#');
        const path = hashAt < 0 ? raw : raw.slice(0, hashAt);
        return path + (path.includes('?') ? '&thumb=1' : '?thumb=1') + (hashAt < 0 ? '' : raw.slice(hashAt));
    } catch (_) { return raw; }
}

function extractIndexedUri(thumbUrl) {
    if (!thumbUrl || !thumbUrl.includes('/android-media-art?')) return '';
    try {
        const u = new URL(thumbUrl, 'https://appassets.androidplatform.net');
        if (u.pathname !== '/android-media-art') return '';
        const raw = u.searchParams.get('uri') || '';
        return raw.startsWith('content://') ? raw : '';
    } catch (_) {
        return '';
    }
}

/**
 * Bounded LRU thumbnail prefetcher that keeps upcoming rows decoded and notifies
 * the native Android artwork engine of high-priority scroll targets ahead of paint.
 */
export function createArtworkPrefetcher({
    maxEntries = 64,
    maxInFlight = 2,
    maxDecodedBytes = 16 * 1024 * 1024,
    maxNativeBatch = 16,
    bridge = typeof window !== 'undefined' ? window.AndroidBridge : null,
    ImageCtor = typeof Image !== 'undefined' ? Image : null
} = {}) {
    const decoded = new Map();
    const inFlight = new Map();
    const queue = [];
    let activeCount = 0;
    let decodedBytes = 0;
    let paused = false;

    function touch(url, img) {
        const bytes = Math.max(0, (img.naturalWidth || 0) * (img.naturalHeight || 0) * 4);
        drop(url);
        if (bytes > maxDecodedBytes) return;
        decoded.set(url, {img, bytes});
        decodedBytes += bytes;
        while (decoded.size > maxEntries || decodedBytes > maxDecodedBytes) drop(decoded.keys().next().value);
    }

    function drop(url) {
        const entry = decoded.get(url);
        if (entry) decodedBytes -= entry.bytes;
        decoded.delete(url);
    }

    function drain() {
        if (!ImageCtor || paused) return;
        while (activeCount < maxInFlight && queue.length > 0) {
            const url = queue.shift();
            if (!url || decoded.has(url) || inFlight.has(url)) continue;
            const job = {valid: true};
            inFlight.set(url, job);
            activeCount++;
            const img = new ImageCtor();
            img.decoding = 'async';
            const finish = (keep) => {
                if (inFlight.get(url) !== job) return;
                inFlight.delete(url);
                activeCount--;
                if (keep && job.valid && !paused) touch(url, img);
                drain();
            };
            if (typeof img.decode === 'function') {
                img.src = url;
                Promise.resolve().then(() => img.decode()).then(() => finish(true), () => finish(false));
            } else {
                img.onload = () => finish(true);
                img.onerror = () => finish(false);
                img.src = url;
            }
        }
    }

    function scheduleUrl(url) {
        if (!url || url === DEFAULT_COVER || url.includes('default.svg')) return;
        if (decoded.has(url)) {
            touch(url, decoded.get(url).img);
            return;
        }
        if (inFlight.has(url) || queue.includes(url) || queue.length >= maxEntries) return;
        queue.push(url);
    }

    function prefetchWindow(tracks, startIdx, endIdx, direction = 1, velocityPxPerMs = 0) {
        if (paused || !Array.isArray(tracks) || tracks.length === 0) return;
        const fastBoost = Math.min(40, Math.floor(Math.abs(velocityPxPerMs) * 14));
        const ahead = 24 + fastBoost;
        const behind = 8;
        const dir = direction < 0 ? -1 : 1;

        const lo = Math.max(0, startIdx - (dir < 0 ? ahead : behind));
        const hi = Math.min(tracks.length, endIdx + (dir > 0 ? ahead : behind));

        const orderedIndices = [];
        if (dir >= 0) {
            for (let i = startIdx; i < hi; i++) orderedIndices.push(i);
            for (let i = startIdx - 1; i >= lo; i--) orderedIndices.push(i);
        } else {
            for (let i = endIdx - 1; i >= lo; i--) orderedIndices.push(i);
            for (let i = endIdx; i < hi; i++) orderedIndices.push(i);
        }

        // Replace stale unstarted queue entries from prior scroll positions with current priority targets.
        queue.length = 0;
        const androidBatch = [];
        for (const i of orderedIndices) {
            const url = resolveTrackThumbUrl(tracks[i]);
            if (!url || url.includes('default.svg') || decoded.has(url)) continue;
            scheduleUrl(url);
            if (androidBatch.length < maxNativeBatch) {
                const rawUri = extractIndexedUri(url);
                if (rawUri) androidBatch.push(rawUri);
            }
        }

        if (androidBatch.length > 0 && typeof bridge?.prefetchArtwork === 'function') {
            try {
                bridge.prefetchArtwork(JSON.stringify(androidBatch));
            } catch (_) {}
        }
        drain();
    }

    function invalidate(url) {
        if (!url) return;
        drop(url);
        if (inFlight.has(url)) inFlight.get(url).valid = false;
        const queued = queue.indexOf(url);
        if (queued >= 0) queue.splice(queued, 1);
        const rawUri = extractIndexedUri(url);
        if (rawUri && typeof bridge?.invalidateArtwork === 'function') {
            try { bridge.invalidateArtwork(rawUri); } catch (_) {}
        }
    }

    function clear() {
        decoded.clear();
        decodedBytes = 0;
        queue.length = 0;
        for (const job of inFlight.values()) job.valid = false;
    }

    function setPaused(value) {
        paused = Boolean(value);
        if (paused) {
            queue.length = 0;
            for (const job of inFlight.values()) job.valid = false;
        }
    }

    return {
        prefetchWindow,
        invalidate,
        clear,
        setPaused,
        has: url => decoded.has(url),
        get cachedCount() { return decoded.size; }
    };
}
