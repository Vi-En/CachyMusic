// Render track metadata and artwork, independently of transport.
import {store} from './state.js';
import {formatFileSize} from './utils.js';
import {normalizeGenre} from './tag-parser.js';
import {infoPanelEl, statTitle, statArtist, statAlbum, statGenre, statYear, statTrack, statBitrate, statSampleRate, statBitDepth, statChannels, statFormat, statSize, statPath, deckArtworkBackdrop, vinylArt, coverArtPreview} from './ui-elements.js';

const DEFAULT_COVER = 'resources/images/default.svg';
let lastDeckCover = { src: DEFAULT_COVER, hasCustom: false };
let pendingBackdropApply = false;
let pendingCoverCardApply = false;
let pendingMetadata = null;
let pendingDacCallback = null;

function isElementVisible(el) {
    return Boolean(el && el.getClientRects().length > 0);
}

function assignImageSrc(img, src, onErrorFallback) {
    if (!img) return;
    img.decoding = 'async';
    if (img.getAttribute('src') === src) return;
    img.onerror = () => {
        img.onerror = null;
        if (onErrorFallback) onErrorFallback();
        img.src = DEFAULT_COVER;
    };
    img.src = src;
}

function writeMetadataToDom(track, isStandalone, updateDacStatusUi) {
    const s = store.state;
    s.currentInspectedTrack = track;
    if (statTitle) statTitle.textContent = track.title ? track.title : (isStandalone ? (track.filename || 'Standalone Audio') : 'Unknown');
    if (statArtist) statArtist.textContent = track.artist ? track.artist : (isStandalone ? 'External File' : 'Unknown');
    if (statAlbum) statAlbum.textContent = track.album ? track.album : (isStandalone ? 'Standalone File' : 'Unknown');
    if (statGenre) statGenre.textContent = normalizeGenre(track.genre) || 'N/A';
    if (statYear) statYear.textContent = track.year ? track.year.toString() : 'N/A';
    if (statTrack) statTrack.textContent = track.track ? track.track.toString() : 'N/A';
    if (statBitrate) statBitrate.textContent = track.bitrate ? `${track.bitrate} kbps` : 'N/A';
    if (statSampleRate) statSampleRate.textContent = track.sampleRate ? `${track.sampleRate} Hz` : 'N/A';
    if (statBitDepth) {
        const bd = track.bitDepth || null;
        statBitDepth.textContent = bd ? `${bd}-Bit` : 'N/A';
        statBitDepth.style.color = 'inherit';
    }
    if (typeof updateDacStatusUi === 'function') updateDacStatusUi();
    if (statChannels) {
        statChannels.textContent = track.channels === 2 ? 'Stereo' : (track.channels === 1 ? 'Mono' : (track.channels ? `${track.channels} ch` : 'N/A'));
    }
    if (statFormat) statFormat.textContent = track.format ? track.format.toUpperCase() : 'N/A';
    if (statSize) statSize.textContent = formatFileSize(track.size);
    if (statPath) {
        statPath.textContent = track.filename ? track.filename : (isStandalone ? 'Standalone File' : 'N/A');
        statPath.title = track.fullPath || track.filename || 'N/A';
    }
}

export function renderTrackMetadata(track, isStandalone, updateDacStatusUi) {
    const s = store.state;
    s.currentInspectedTrack = track;
    if (infoPanelEl && !isElementVisible(infoPanelEl)) {
        pendingMetadata = { track, isStandalone };
        pendingDacCallback = updateDacStatusUi;
        if (typeof updateDacStatusUi === 'function') updateDacStatusUi();
        return;
    }
    pendingMetadata = null;
    pendingDacCallback = null;
    writeMetadataToDom(track, isStandalone, updateDacStatusUi);
}

export function applyArtworkToDeck(coverSrc, hasCustomCover) {
    const src = coverSrc || DEFAULT_COVER;
    const custom = Boolean(hasCustomCover);
    lastDeckCover = { src, hasCustom: custom };

    if (vinylArt) {
        assignImageSrc(vinylArt, src);
    }

    const presentation = typeof document !== 'undefined' ? document.documentElement?.dataset?.presentation : 'artwork';
    if (deckArtworkBackdrop) {
        if (presentation !== 'artwork' && isElementVisible(deckArtworkBackdrop)) {
            assignImageSrc(deckArtworkBackdrop, src, () => { deckArtworkBackdrop.style.opacity = '0'; });
            deckArtworkBackdrop.style.opacity = custom ? 'var(--artwork-backdrop-opacity, .24)' : '0';
            pendingBackdropApply = false;
        } else {
            pendingBackdropApply = true;
        }
    }

    if (coverArtPreview) {
        if (isElementVisible(coverArtPreview)) {
            assignImageSrc(coverArtPreview, src);
            pendingCoverCardApply = false;
        } else {
            pendingCoverCardApply = true;
        }
    }
}

export function hydrateVisibleArtwork() {
    const presentation = typeof document !== 'undefined' ? document.documentElement?.dataset?.presentation : 'artwork';
    if (pendingBackdropApply && deckArtworkBackdrop && presentation !== 'artwork' && isElementVisible(deckArtworkBackdrop)) {
        assignImageSrc(deckArtworkBackdrop, lastDeckCover.src, () => { deckArtworkBackdrop.style.opacity = '0'; });
        deckArtworkBackdrop.style.opacity = lastDeckCover.hasCustom ? 'var(--artwork-backdrop-opacity, .24)' : '0';
        pendingBackdropApply = false;
    }
    if (pendingCoverCardApply && coverArtPreview && isElementVisible(coverArtPreview)) {
        assignImageSrc(coverArtPreview, lastDeckCover.src);
        pendingCoverCardApply = false;
    }
    if (pendingMetadata && (!infoPanelEl || isElementVisible(infoPanelEl))) {
        const meta = pendingMetadata;
        const cb = pendingDacCallback;
        pendingMetadata = null;
        pendingDacCallback = null;
        writeMetadataToDom(meta.track, meta.isStandalone, cb);
    }
}

if (typeof store?.subscribe === 'function') {
    for (const ev of ['workspace:change', 'visualizer:change', 'ui:hydrate-artwork']) {
        store.subscribe(ev, () => {
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(hydrateVisibleArtwork);
            else hydrateVisibleArtwork();
        });
    }
}

