// CachyMusic - Unified Cross-Platform MediaSession, Android Notification & Background Alert Controller
import { store } from './state.js';

let lastPosSyncMs = 0;
let lastNotifiedTrackKey = null;
const rasterCoverCache = new Map();

function resolveRasterCover(coverUrl) {
    try {
        if (coverUrl && typeof coverUrl === 'string' && !coverUrl.toLowerCase().endsWith('.svg')) {
            if (rasterCoverCache.has(coverUrl)) {
                return rasterCoverCache.get(coverUrl);
            }
            if (coverUrl.startsWith('data:') || coverUrl.startsWith('blob:') || coverUrl.startsWith('http')) {
                return coverUrl;
            }
            return new URL(coverUrl, window.location.href).href;
        }
        return new URL('resources/images/icon-512.png', window.location.href).href;
    } catch (_) {
        return '';
    }
}

function cacheRasterCoverEntry(key, dataUrl) {
    if (!key || !dataUrl) return;
    if (rasterCoverCache.size >= 40) {
        const oldestKey = rasterCoverCache.keys().next().value;
        if (oldestKey) rasterCoverCache.delete(oldestKey);
    }
    rasterCoverCache.set(key, dataUrl);
}

function rasterizeCoverToDataUrl(coverUrl) {
    if (!coverUrl || typeof document === 'undefined') return Promise.resolve(null);
    if (rasterCoverCache.has(coverUrl)) return Promise.resolve(rasterCoverCache.get(coverUrl));
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => resolve(null), 2500);
        img.onload = () => {
            clearTimeout(timer);
            try {
                const size = 256;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(null);
                    return;
                }
                const srcW = img.naturalWidth || size;
                const srcH = img.naturalHeight || size;
                const scale = Math.max(size / srcW, size / srcH);
                const drawW = srcW * scale;
                const drawH = srcH * scale;
                ctx.drawImage(img, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
                cacheRasterCoverEntry(coverUrl, dataUrl);
                resolve(dataUrl);
            } catch (_) {
                resolve(null);
            }
        };
        img.onerror = () => {
            clearTimeout(timer);
            resolve(null);
        };
        img.src = coverUrl;
    });
}

export class MediaSessionController {
    constructor() {
        this.handlers = null;
        this.initialized = false;
    }

    init(handlers) {
        this.handlers = handlers;
        if (this.initialized) return;
        this.initialized = true;

        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
            const safeBind = (action, fn) => {
                try {
                    navigator.mediaSession.setActionHandler(action, fn);
                } catch (_) {}
            };

            safeBind('play', () => this.handlers?.play?.());
            safeBind('pause', () => this.handlers?.pause?.());
            safeBind('stop', () => this.handlers?.pause?.());
            safeBind('previoustrack', () => this.handlers?.prev?.());
            safeBind('nexttrack', () => this.handlers?.next?.());
            safeBind('seekto', (details) => {
                if (details && details.seekTime !== undefined && !isNaN(details.seekTime)) {
                    this.handlers?.seekTo?.(Math.max(0, details.seekTime));
                }
            });
            safeBind('seekbackward', (details) => {
                const skip = (details && details.seekOffset) || 10;
                const cur = this.handlers?.getPosition?.() || 0;
                this.handlers?.seekTo?.(Math.max(0, cur - skip));
            });
            safeBind('seekforward', (details) => {
                const skip = (details && details.seekOffset) || 10;
                const cur = this.handlers?.getPosition?.() || 0;
                const dur = this.handlers?.getDuration?.() || Infinity;
                this.handlers?.seekTo?.(Math.min(dur, cur + skip));
            });
        }

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && !store.state.isPlaying && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
                    try {
                        navigator.mediaSession.playbackState = 'paused';
                    } catch (_) {}
                }
            });
        }
    }

    applyMediaSessionMetadata(title, artist, album, resolvedCover) {
        if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof window.MediaMetadata === 'undefined') {
            return;
        }
        try {
            const fallback192 = new URL('resources/images/icon-192.png', window.location.href).href;
            const mimeType = resolvedCover.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
            const artwork = (resolvedCover && !resolvedCover.startsWith('blob:'))
                ? [
                    { src: resolvedCover, sizes: '256x256', type: mimeType },
                    { src: resolvedCover, sizes: '512x512', type: mimeType }
                ]
                : resolvedCover
                    ? [
                        { src: resolvedCover, sizes: '256x256', type: mimeType },
                        { src: fallback192, sizes: '192x192', type: 'image/png' }
                    ]
                    : [{ src: fallback192, sizes: '192x192', type: 'image/png' }];
            navigator.mediaSession.metadata = new window.MediaMetadata({
                title,
                artist,
                album,
                artwork
            });
        } catch (_) {}
    }

    updateMetadata(track) {
        if (!track) return;
        const title = track.title || track.filename || 'CachyMusic';
        const artist = track.artist || 'Unknown Artist';
        const album = track.album || 'CachyMusic Workstation';
        const rawCover = track.cover;
        const resolvedCover = track._resolvedNotificationCover || resolveRasterCover(rawCover);

        this.applyMediaSessionMetadata(title, artist, album, resolvedCover);
        this.syncAndroidNotification(track, store.state.isPlaying);
        this.maybeNotifyBackgroundTrack(track, resolvedCover);

        const needsRasterize = rawCover && typeof rawCover === 'string' && !rawCover.toLowerCase().endsWith('.svg')
            && (rawCover.startsWith('blob:') || (!rawCover.startsWith('data:image/jpeg') && rawCover.startsWith('https://appassets.androidplatform.net/')));
        if (needsRasterize && !track._resolvedNotificationCover) {
            const trackKey = `${track.tid || track.id || track.filename}:${rawCover}`;
            rasterizeCoverToDataUrl(rawCover).then((dataUrl) => {
                if (!dataUrl) return;
                track._resolvedNotificationCover = dataUrl;
                const activeTrack = store.state.isStandalonePlayback
                    ? store.state.standaloneTrackList?.[store.state.standaloneTrackIndex]
                    : (store.state.allTracks?.[store.state.currentTrackIndex] || store.state.currentTrack);
                const activeKey = activeTrack ? `${activeTrack.tid || activeTrack.id || activeTrack.filename}:${activeTrack.cover}` : '';
                if (activeKey === trackKey) {
                    this.applyMediaSessionMetadata(title, artist, album, dataUrl);
                    this.syncAndroidNotification(track, store.state.isPlaying);
                }
            });
        }
    }

    syncPlaybackState(playing) {
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
            try {
                navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
            } catch (_) {}
        }
        this.updatePositionState(true);
        const activeTrack = store.state.allTracks?.[store.state.currentTrackIndex] || store.state.currentTrack;
        if (activeTrack) {
            this.syncAndroidNotification(activeTrack, playing);
        }
    }

    updatePositionState(force = false) {
        if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') {
            return;
        }
        const now = performance.now();
        if (!force && (now - lastPosSyncMs < 800)) return;
        lastPosSyncMs = now;
        try {
            const dur = this.handlers?.getDuration?.() || 0;
            const pos = this.handlers?.getPosition?.() || 0;
            const rate = this.handlers?.getPlaybackRate?.() || store.state.currentPlaybackSpeed || 1.0;
            if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
                navigator.mediaSession.setPositionState({
                    duration: Math.max(0, dur),
                    playbackRate: rate,
                    position: Math.max(0, Math.min(dur, pos))
                });
            }
        } catch (_) {}
    }

    syncAndroidNotification(track, playing) {
        if (typeof window === 'undefined' || !window.AndroidBridge) return;
        if (typeof window.AndroidBridge.updateMediaNotification === 'function') {
            try {
                const durMs = Math.round((this.handlers?.getDuration?.() || track?.duration || 0) * 1000);
                const posMs = Math.round((this.handlers?.getPosition?.() || 0) * 1000);
                const coverArg = track?._resolvedNotificationCover || resolveRasterCover(track?.cover) || track?.cover || '';
                window.AndroidBridge.updateMediaNotification(
                    track?.title || track?.filename || 'CachyMusic',
                    track?.artist || 'Unknown Artist',
                    track?.album || 'CachyMusic Workstation',
                    coverArg,
                    Boolean(playing),
                    durMs,
                    posMs
                );
            } catch (_) {}
        }
    }

    stopAndroidNotification() {
        if (typeof window !== 'undefined' && window.AndroidBridge && typeof window.AndroidBridge.stopMediaNotification === 'function') {
            try {
                window.AndroidBridge.stopMediaNotification();
            } catch (_) {}
        }
    }

    maybeNotifyBackgroundTrack(track, iconUrl) {
        if (!store.state.backgroundNotificationsEnabled) return;
        if (typeof document === 'undefined' || !document.hidden) return;
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;

        const key = `${track.tid || track.id || track.filename}:${track.title}`;
        if (key === lastNotifiedTrackKey) return;
        lastNotifiedTrackKey = key;

        try {
            const n = new Notification(track.title || track.filename || 'Now Playing', {
                body: `${track.artist || 'Unknown Artist'}${track.album ? ' — ' + track.album : ''}`,
                icon: iconUrl || undefined,
                tag: 'cachymusic-now-playing',
                silent: true
            });
            setTimeout(() => { try { n.close(); } catch (_) {} }, 4000);
        } catch (_) {}
    }
}

export const mediaSessionController = new MediaSessionController();
