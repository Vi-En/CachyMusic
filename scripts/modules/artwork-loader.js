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
    if (raw.includes('thumb=')) return raw;
    return raw + (raw.includes('?') ? '&thumb=1' : '?thumb=1');
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
    maxEntries = 256,
    maxInFlight = 6,
    bridge = typeof window !== 'undefined' ? window.AndroidBridge : null,
    ImageCtor = typeof Image !== 'undefined' ? Image : null
} = {}) {
    const decoded = new Map();
    const inFlight = new Set();
    const queue = [];
    let activeCount = 0;

    function touch(url, img) {
        decoded.delete(url);
        decoded.set(url, img);
        while (decoded.size > maxEntries) {
            const oldest = decoded.keys().next().value;
            decoded.delete(oldest);
        }
    }

    function drain() {
        if (!ImageCtor) return;
        while (activeCount < maxInFlight && queue.length > 0) {
            const url = queue.shift();
            if (!url || decoded.has(url) || inFlight.has(url)) continue;
            inFlight.add(url);
            activeCount++;
            const img = new ImageCtor();
            img.decoding = 'async';
            const finish = (keep) => {
                inFlight.delete(url);
                activeCount--;
                if (keep) touch(url, img);
                drain();
            };
            img.src = url;
            if (typeof img.decode === 'function') {
                img.decode().then(() => finish(true), () => finish(false));
            } else {
                img.onload = () => finish(true);
                img.onerror = () => finish(false);
            }
        }
    }

    function scheduleUrl(url) {
        if (!url || url === DEFAULT_COVER || url.includes('default.svg')) return;
        if (decoded.has(url)) {
            touch(url, decoded.get(url));
            return;
        }
        if (inFlight.has(url) || queue.includes(url) || queue.length >= maxEntries) return;
        queue.push(url);
    }

    function prefetchWindow(tracks, startIdx, endIdx, direction = 1, velocityPxPerMs = 0) {
        if (!Array.isArray(tracks) || tracks.length === 0) return;
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
            if (androidBatch.length < 48) {
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
        decoded.delete(url);
        const rawUri = extractIndexedUri(url);
        if (rawUri && typeof bridge?.invalidateArtwork === 'function') {
            try { bridge.invalidateArtwork(rawUri); } catch (_) {}
        }
    }

    function clear() {
        decoded.clear();
        queue.length = 0;
    }

    return {
        prefetchWindow,
        invalidate,
        clear,
        has: url => decoded.has(url),
        get cachedCount() { return decoded.size; }
    };
}
