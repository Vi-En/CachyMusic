// Render track metadata and artwork, independently of transport.
import {store} from './state.js';
import {formatFileSize} from './utils.js';
import {normalizeGenre} from './tag-parser.js';
import {statTitle, statArtist, statAlbum, statGenre, statYear, statTrack, statBitrate, statSampleRate, statBitDepth, statChannels, statFormat, statSize, statPath, deckArtworkBackdrop, deckArtworkAmbient, vinylArt, coverArtPreview} from './ui-elements.js';

export function renderTrackMetadata(track, isStandalone, updateDacStatusUi) {
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
    updateDacStatusUi();
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

export function applyArtworkToDeck(coverSrc, hasCustomCover) {
    const fallback = 'resources/images/default.svg';
    if (deckArtworkBackdrop) {
        deckArtworkBackdrop.onerror = () => { deckArtworkBackdrop.onerror = null; deckArtworkBackdrop.style.opacity = '0'; deckArtworkBackdrop.src = fallback; };
        deckArtworkBackdrop.src = coverSrc;
        deckArtworkBackdrop.style.opacity = hasCustomCover ? 'var(--artwork-backdrop-opacity, .24)' : '0';
    }
    if (deckArtworkAmbient) {
        deckArtworkAmbient.onerror = () => { deckArtworkAmbient.onerror = null; deckArtworkAmbient.src = fallback; };
        deckArtworkAmbient.src = coverSrc;
        deckArtworkAmbient.style.opacity = hasCustomCover ? '0.35' : '0';
    }
    if (vinylArt) {
        vinylArt.onerror = () => { vinylArt.onerror = null; vinylArt.src = fallback; };
        vinylArt.src = coverSrc;
    }
    if (coverArtPreview) {
        coverArtPreview.onerror = () => { coverArtPreview.onerror = null; coverArtPreview.src = fallback; };
        coverArtPreview.src = coverSrc;
    }
}

