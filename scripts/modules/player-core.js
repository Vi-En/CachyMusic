// CachyMusic - Core Audio Player, Software Decoder & Gapless Transport
import {
    formatTime,
    getValidSampleRate,
    safeStorage,
    showCachyToast,
    showToast
} from './utils.js';
import { hasActiveDsp, store } from './state.js';
import {
    albumName,
    artistName,
    auditMetricHeadroom,
    auditMetricLatency,
    auditQualityBadge,
    auditQualityDesc,
    auditQualityDot,
    bgDisc,
    coverArtPreview,
    coverBadge,
    currentTimeEl,
    deckArtworkAmbient,
    deckArtworkBackdrop,
    deckSignalDot,
    getActiveTheme,
    miniCurrentTime,
    miniProgressBar,
    miniTotalDuration,
    playPauseBtn,
    progressBar,
    repeatBtn,
    shuffleBtn,
    signalPathBadgeBtn,
    signalPathLabel,
    standaloneBanner,
    standaloneBannerTitle,
    statAlbum,
    statArtist,
    statBitDepth,
    statBitrate,
    statChannels,
    statDacStream,
    statFormat,
    statGenre,
    statPath,
    statSampleRate,
    statSize,
    statTitle,
    statTrack,
    statYear,
    tabPlaylists,
    toneArm,
    totalDurationEl,
    trackBadge,
    trackList,
    trackName,
    updateEmptyPlayerState,
    updateMiniPlayerInfo,
    updateMiniPlayerPlayState,
    vinylArt,
    vinylTurntable,
    volumeIcon
} from './ui-elements.js';
import { updateActiveLyric, updateLyricsDisplay } from './lyrics.js';
import { updateAmbientLighting } from './themes.js';
import { appendDebugTelemetry, cancelSleepTimer, logAudioPlaybackEvent } from './settings.js';
import { ensureAudioEngineForSampleRate, getOrCreateAudioSourceNode, setVolume, updateAudioRouting } from './audio-engine.js';
import { getRuntime } from './runtime-capabilities.js';
import { mediaSessionController } from './media-session.js';
import { normalizeGenre } from './tag-parser.js';

let mprisSyncHook = null;

function initMprisBridge() {
    if (!getRuntime().hasMprisBridge) return;
    const s = store.state;
    let lastReportedStatus = '';
    let lastReportedTitle = '';
    let lastReportedPos = -1;

    function getCurrentPlaybackTiming() {
        const track = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
            ? s.standaloneTrackList[s.standaloneTrackIndex]
            : s.allTracks[s.currentTrackIndex];
        if (s.isSoftwareDecoding && s.activeDecodedBuffer) {
            const pos = s.softwarePlaybackOffset + (!s.isSoftwarePaused && s.audioContext ? (s.audioContext.currentTime - s.softwarePlaybackStartTime) : 0);
            return {
                track,
                isPlaying: !s.isSoftwarePaused,
                position: Math.max(0, pos),
                duration: s.activeDecodedBuffer.duration || (track ? track.duration : 0) || 0,
                volume: s.currentVolumeValue
            };
        }
        const a = s.audio;
        return {
            track,
            isPlaying: Boolean(a && !a.paused && !a.ended),
            position: a ? (a.currentTime || 0) : 0,
            duration: (a && a.duration && isFinite(a.duration)) ? a.duration : ((track ? track.duration : 0) || 0),
            volume: a ? a.volume : s.currentVolumeValue
        };
    }

    function reportState(force = false) {
        const info = getCurrentPlaybackTiming();
        const track = info.track;
        const status = info.isPlaying ? 'Playing' : (info.position > 0 ? 'Paused' : 'Stopped');
        const pos = Math.floor(info.position || 0);
        const title = track ? (track.title || track.filename || '') : '';

        if (!force && status === lastReportedStatus && title === lastReportedTitle && Math.abs(pos - lastReportedPos) < 2) {
            return;
        }

        lastReportedStatus = status;
        lastReportedTitle = title;
        lastReportedPos = pos;

        const payload = {
            status,
            position: info.position || 0,
            duration: info.duration || 0,
            title: track ? (track.title || track.filename || 'Unknown') : 'CachyMusic',
            artist: track ? (track.artist || 'Unknown Artist') : 'CachyOS',
            album: track ? (track.album || '') : '',
            artUrl: track && track.cover ? ((track.cover.startsWith('http') || track.cover.startsWith('data:')) ? track.cover : window.location.origin + '/' + track.cover) : '',
            coverPath: track && track.cover ? track.cover : '',
            volume: info.volume,
            shuffle: s.isShuffle,
            repeat: s.repeatMode
        };

        fetch('php/api/mpris_state.php?action=update_state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(() => {});
    }

    mprisSyncHook = reportState;

    let isPollingCommands = false;
    let consecutiveIdlePolls = 0;
    async function pollCommands() {
        if (isPollingCommands) {
            setTimeout(pollCommands, 500);
            return;
        }
        isPollingCommands = true;
        try {
            const res = await fetch('php/api/mpris_state.php?action=get_command');
            if (res.ok) {
                const data = await res.json();
                if (data && data.command) {
                    consecutiveIdlePolls = 0;
                    const cmd = data.command;
                    const info = getCurrentPlaybackTiming();
                    if (cmd === 'PlayPause') {
                        if (info.isPlaying) pauseAudio();
                        else playAudio(true);
                    } else if (cmd === 'Play') {
                        playAudio(true);
                    } else if (cmd === 'Pause') {
                        pauseAudio();
                    } else if (cmd === 'Stop') {
                        pauseAudio();
                        seekAudio(0);
                    } else if (cmd === 'Next') {
                        nextTrack();
                    } else if (cmd === 'Previous') {
                        prevTrack();
                    } else if (cmd === 'Seek' && typeof data.offset === 'number') {
                        seekAudio(Math.max(0, info.position + data.offset));
                    } else if (cmd === 'SeekTo' && typeof data.position === 'number') {
                        seekAudio(Math.max(0, data.position));
                    } else if (cmd === 'SetVolume' && typeof data.volume === 'number') {
                        setVolume(Math.max(0, Math.min(1.5, data.volume)), true);
                    } else if (cmd === 'ToggleShuffle') {
                        s.isShuffle = !s.isShuffle;
                        if (shuffleBtn) {
                            shuffleBtn.classList.toggle('active', s.isShuffle);
                            shuffleBtn.setAttribute('title', s.isShuffle ? 'Shuffle Active' : 'Toggle Shuffle');
                        }
                    } else if (cmd === 'SetShuffle' && typeof data.shuffle === 'boolean') {
                        s.isShuffle = data.shuffle;
                        if (shuffleBtn) {
                            shuffleBtn.classList.toggle('active', s.isShuffle);
                            shuffleBtn.setAttribute('title', s.isShuffle ? 'Shuffle Active' : 'Toggle Shuffle');
                        }
                    } else if (cmd === 'SetLoopStatus' && typeof data.loopStatus === 'string') {
                        const ls = data.loopStatus.toLowerCase();
                        if (ls === 'track') s.repeatMode = 'one';
                        else if (ls === 'playlist') s.repeatMode = 'all';
                        else s.repeatMode = 'off';
                        updateRepeatUI();
                    }
                    reportState(true);
                } else {
                    consecutiveIdlePolls++;
                }
            }
        } catch (_) {
            consecutiveIdlePolls += 2;
        } finally {
            isPollingCommands = false;
            let nextDelay = 350;
            if (document.hidden) {
                nextDelay = 1200;
            } else if (consecutiveIdlePolls > 10) {
                nextDelay = 1200;
            } else if (consecutiveIdlePolls > 3) {
                nextDelay = 700;
            }
            setTimeout(pollCommands, nextDelay);
        }
    }

    setTimeout(pollCommands, 500);
}

function updateMarqueeText(el, text) {
    if (!el) return;
    el.title = text || '';
    el.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'marqueeContent';
    span.textContent = text || '';
    el.appendChild(span);

    requestAnimationFrame(() => {
        if (!el.isConnected) return;
        const overflow = span.scrollWidth - el.clientWidth;
        if (overflow > 6) {
            el.classList.add('isMarquee');
            const duration = Math.max(6, Math.min(22, Math.round(overflow / 24) + 4));
            span.style.setProperty('--marquee-overflow', `${Math.ceil(overflow) + 8}px`);
            span.style.setProperty('--marquee-duration', `${duration}s`);
        } else {
            el.classList.remove('isMarquee');
            span.style.removeProperty('--marquee-overflow');
            span.style.removeProperty('--marquee-duration');
        }
    });
}

function recomputeMarquees() {
    [trackName, artistName, albumName].forEach(el => {
        if (!el) return;
        const span = el.querySelector('.marqueeContent');
        if (!span) return;
        const overflow = span.scrollWidth - el.clientWidth;
        if (overflow > 6) {
            el.classList.add('isMarquee');
            const duration = Math.max(6, Math.min(22, Math.round(overflow / 24) + 4));
            span.style.setProperty('--marquee-overflow', `${Math.ceil(overflow) + 8}px`);
            span.style.setProperty('--marquee-duration', `${duration}s`);
        } else {
            el.classList.remove('isMarquee');
            span.style.removeProperty('--marquee-overflow');
            span.style.removeProperty('--marquee-duration');
        }
    });
}

if (typeof window !== 'undefined') {
    if (window.ResizeObserver) {
        const metaBox = document.querySelector('.trackMeta');
        if (metaBox) {
            const ro = new ResizeObserver(() => recomputeMarquees());
            ro.observe(metaBox);
        }
    }
    window.addEventListener('resize', () => recomputeMarquees(), { passive: true });
}

let currentPlayRequestId = 0;
let currentTrackGeneration = 0;
let activeLoadedMetadataHandler = null;
let playPendingTimeout = null;
let noDataStallTimer = null;
let lastPositionStateUpdate = 0;

function clearNoDataStallTimer() {
    if (noDataStallTimer) {
        clearTimeout(noDataStallTimer);
        noDataStallTimer = null;
    }
}

function applyTrackMetadataToDom(track, isStandalone = false) {
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
        const bd = track.bitDepth || ((track.sampleRate && track.sampleRate >= 88200) ? 24 : 16);
        statBitDepth.textContent = bd ? `${bd}-Bit` : 'N/A';
        statBitDepth.style.color = 'inherit';
    }
    updateDacStatusUi();
    if (statChannels) {
        statChannels.textContent = track.channels === 2 ? 'Stereo' : (track.channels === 1 ? 'Mono' : (track.channels ? `${track.channels} ch` : 'N/A'));
    }
    if (statFormat) statFormat.textContent = track.format ? track.format.toUpperCase() : 'N/A';
    if (statSize) statSize.textContent = track.size ? track.size : 'N/A';
    if (statPath) {
        statPath.textContent = track.filename ? track.filename : (isStandalone ? 'Standalone File' : 'N/A');
        statPath.title = track.fullPath || track.filename || 'N/A';
    }
}

function applyArtworkToDeck(coverSrc, hasCustomCover) {
    const fallback = 'resources/images/default.svg';
    if (deckArtworkBackdrop) {
        deckArtworkBackdrop.onerror = () => { deckArtworkBackdrop.onerror = null; deckArtworkBackdrop.src = fallback; };
        deckArtworkBackdrop.src = coverSrc;
        deckArtworkBackdrop.style.opacity = hasCustomCover ? '0.28' : '0.04';
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
    updateAmbientLighting(coverSrc);
}

// Load Track by Index in allTracks
async function loadTrack(index, autoPlay = true, initialTime = 0) {
    const s = store.state;
    if (!s.allTracks[index]) return;
    s.currentTrackIndex = index;
    s.trackPlaybackRetryCount = 0;
    stopSoftwarePlayback();
    s.activeDecodedBuffer = null;
    s.isSoftwareDecoding = false;
    currentPlayRequestId++;
    s.isPlayPending = false;
    clearNoDataStallTimer();
    if (playPendingTimeout) {
        clearTimeout(playPendingTimeout);
        playPendingTimeout = null;
    }

    if (s.isStandalonePlayback) {
        s.isStandalonePlayback = false;
        updateStandaloneBannerUi(false);
    }
    const track = s.allTracks[s.currentTrackIndex];
    s.currentTrack = track;

    if (track) {
        try {
            if (track.tid) safeStorage.setItem('cachymusic_last_track_tid', track.tid.toString());
            if (track.fullPath) safeStorage.setItem('cachymusic_last_track_path', track.fullPath);
            if (track.filename) safeStorage.setItem('cachymusic_last_track_filename', track.filename);
            if (track.id) safeStorage.setItem('cachymusic_last_track_id', track.id.toString());
            if (track.title) safeStorage.setItem('cachymusic_last_track_title', track.title);
        } catch (_) {}
    }

    let trackSrc = track.src || '';
    if (trackSrc.startsWith('../')) trackSrc = trackSrc.substring(3);

    const isKnownSoftware = s.alwaysSoftwareDecodeUrls.has(trackSrc) || (track.src && s.alwaysSoftwareDecodeUrls.has(track.src));
    const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
    await ensureAudioEngineForSampleRate(targetRate);

    if (s.currentTrackIndex !== index) return;

    store.emit('track:change', { track, index });

    const audio = s.audio;
    if (audio) {
        const isCrossOrigin = trackSrc.startsWith('http://') || trackSrc.startsWith('https://');
        let needsCors = false;
        if (isCrossOrigin) {
            try {
                needsCors = new URL(trackSrc, window.location.href).origin !== window.location.origin;
            } catch (_) {}
        }
        if (needsCors) {
            audio.crossOrigin = 'anonymous';
        } else {
            audio.removeAttribute('crossorigin');
        }

        currentTrackGeneration++;
        audio._trackGeneration = currentTrackGeneration;
        if (!isKnownSoftware && trackSrc) {
            audio.src = trackSrc;
            audio._isFreshTrackLoad = true;
            try { audio.load(); } catch (_) {}
        } else {
            try {
                audio.pause();
                audio.removeAttribute('src');
                audio.load();
            } catch (_) {}
        }
    }

    const targetTime = (typeof initialTime === 'number' && !isNaN(initialTime) && initialTime > 0) ? initialTime : 0;
    if (audio && targetTime > 0 && audio.readyState >= 1) {
        try { audio.currentTime = targetTime; } catch (_) {}
    }
    if (targetTime === 0) {
        try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {}
    }

    const applyTargetTime = () => {
        if (!s.audio) return;
        if (targetTime > 0 && s.audio.duration && !isNaN(s.audio.duration) && targetTime >= (s.audio.duration - 1)) {
            s.audio.currentTime = 0;
            if (currentTimeEl) currentTimeEl.textContent = '0:00';
            if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
            if (progressBar) progressBar.style.width = '0%';
            if (miniProgressBar) miniProgressBar.style.width = '0%';
            try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {}
            return;
        }
        try { s.audio.currentTime = targetTime; } catch (_) {}
        if (targetTime === 0) {
            if (currentTimeEl) currentTimeEl.textContent = '0:00';
            if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
            if (progressBar) progressBar.style.width = '0%';
            if (miniProgressBar) miniProgressBar.style.width = '0%';
        } else {
            if (currentTimeEl) currentTimeEl.textContent = formatTime(targetTime);
            if (miniCurrentTime) miniCurrentTime.textContent = formatTime(targetTime);
            const dur = s.audio.duration || track.duration || 0;
            if (dur > 0) {
                const pct = Math.min(100, Math.max(0, (targetTime / dur) * 100));
                if (progressBar) progressBar.style.width = `${pct}%`;
                if (miniProgressBar) miniProgressBar.style.width = `${pct}%`;
            }
        }
    };

    if (activeLoadedMetadataHandler && audio) {
        try { audio.removeEventListener('loadedmetadata', activeLoadedMetadataHandler); } catch (_) {}
    }
    activeLoadedMetadataHandler = applyTargetTime;
    if (audio && !isKnownSoftware && trackSrc) {
        audio.addEventListener('loadedmetadata', applyTargetTime, { once: true });
    }

    updateEmptyPlayerState();
    updateMarqueeText(trackName, track.title ? track.title : (track.filename || 'Unknown'));
    updateMarqueeText(artistName, track.artist ? track.artist : 'Unknown');
    updateMarqueeText(albumName, track.album ? `Album: ${track.album}${track.year ? ' (' + track.year + ')' : ''}` : 'Album: Unknown');
    updateTrackBadgeUi(track);

    const coverSrc = track.cover || 'resources/images/default.svg';
    const hasCustomCover = Boolean(track.cover && !track.cover.includes('default.svg'));
    applyArtworkToDeck(coverSrc, hasCustomCover);
    appendDebugTelemetry(`[LOAD] Track #${index + 1}: "${track.title || track.filename}" (${track.format || 'AUDIO'}, ${track.sampleRate || 44100}Hz)`);

    if (coverBadge) {
        if (track.cover) {
            coverBadge.textContent = 'COVER ART';
            coverBadge.style.color = 'inherit';
        } else {
            coverBadge.textContent = 'MUSIC ICON';
            coverBadge.style.color = '#888888';
        }
    }

    applyTrackMetadataToDom(track, false);

    store.emit('library:render-window', { preserveScroll: true });
    const displayedIdx = s.displayedTracks.findIndex(t => (
        (track.id && t.id) ? t.id === track.id :
        ((track.tid && t.tid) ? t.tid === track.tid : t.filename === track.filename)
    ));
    if (displayedIdx !== -1 && trackList) {
        const activeEl = trackList.querySelector(`.trackItem[data-index="${displayedIdx}"]`);
        if (activeEl) {
            activeEl.classList.add('active');
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            store.emit('library:scroll-to-index', { index: displayedIdx, active: true });
        }
    }

    if (targetTime > 0) {
        if (currentTimeEl) currentTimeEl.textContent = formatTime(targetTime);
        if (miniCurrentTime) miniCurrentTime.textContent = formatTime(targetTime);
        const totalSec = track.duration || 0;
        if (totalSec > 0) {
            const pct = Math.min(100, Math.max(0, (targetTime / totalSec) * 100));
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (miniProgressBar) miniProgressBar.style.width = `${pct}%`;
        }
    } else {
        if (progressBar) progressBar.style.width = '0%';
        if (miniProgressBar) miniProgressBar.style.width = '0%';
        if (currentTimeEl) currentTimeEl.textContent = '0:00';
        if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
    }
    if (totalDurationEl) totalDurationEl.textContent = formatTime(track.duration);
    if (miniTotalDuration) miniTotalDuration.textContent = formatTime(track.duration);
    updateMiniPlayerInfo(track);
    updateLyricsDisplay(track);
    if (targetTime > 0 && s.isLyricsView) {
        updateActiveLyric(targetTime);
    }

    mediaSessionController.updateMetadata(track);
    if (mprisSyncHook) mprisSyncHook(true);

    if (isKnownSoftware) {
        if (autoPlay) {
            playWithSoftwareDecoder(track, initialTime);
        } else {
            s.isSoftwarePaused = true;
            syncPlayPauseUI(false);
        }
        return;
    }

    if (autoPlay) {
        playAudio();
    } else {
        pauseAudio();
    }
}

// =========================================================================
// Standalone / External File Playback Engine (VLC-Style Isolated Playback)
// =========================================================================
function updateStandaloneBannerUi(visible, track = null) {
    const banner = standaloneBanner || document.getElementById('standaloneBanner');
    const titleEl = standaloneBannerTitle || document.getElementById('standaloneBannerTitle');
    if (!banner) return;
    if (visible && track) {
        banner.style.display = 'flex';
        if (titleEl) {
            titleEl.textContent = track.title ? `${track.title}${track.artist ? ' - ' + track.artist : ''}` : (track.filename || 'Standalone Audio');
            titleEl.title = track.filename || track.title || '';
        }
    } else {
        banner.style.display = 'none';
    }
}

function exitStandalonePlayback(returnToLibrary = true) {
    const s = store.state;
    s.isStandalonePlayback = false;
    updateStandaloneBannerUi(false);
    if (returnToLibrary && s.allTracks && s.allTracks.length > 0) {
        const targetIdx = (s.currentTrackIndex >= 0 && s.currentTrackIndex < s.allTracks.length) ? s.currentTrackIndex : 0;
        loadTrack(targetIdx, s.isPlaying);
    } else {
        pauseAudio();
        updateEmptyPlayerState();
    }
}

async function loadStandaloneTrack(indexOrTrack = 0, autoPlay = true) {
    const s = store.state;
    let track = null;
    if (typeof indexOrTrack === 'number') {
        s.standaloneTrackIndex = Math.max(0, Math.min((s.standaloneTrackList.length || 1) - 1, indexOrTrack));
        track = s.standaloneTrackList[s.standaloneTrackIndex];
    } else if (indexOrTrack && typeof indexOrTrack === 'object') {
        track = indexOrTrack;
        s.standaloneTrackList = [track];
        s.standaloneTrackIndex = 0;
    }
    if (!track) return;

    s.isStandalonePlayback = true;
    s.currentTrack = track;
    updateStandaloneBannerUi(true, track);

    if (s.isSoftwareDecoding && s.softwareSourceNode) {
        try { s.softwareSourceNode.stop(); } catch (_) {}
        s.isSoftwareDecoding = false;
    }
    if (s.softwarePlaybackRaf) {
        cancelAnimationFrame(s.softwarePlaybackRaf);
        s.softwarePlaybackRaf = null;
    }

    let trackSrc = track.src || '';
    if (trackSrc.startsWith('../')) trackSrc = trackSrc.substring(3);
    const isKnownSoftware = s.alwaysSoftwareDecodeUrls.has(trackSrc) || (track.src && s.alwaysSoftwareDecodeUrls.has(track.src));
    const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
    await ensureAudioEngineForSampleRate(targetRate);

    store.emit('track:change', { track, index: s.standaloneTrackIndex });

    const audio = s.audio;
    if (audio) {
        currentTrackGeneration++;
        audio._trackGeneration = currentTrackGeneration;
        if (!isKnownSoftware && trackSrc) {
            audio.src = trackSrc;
            audio._isFreshTrackLoad = true;
            try { audio.load(); } catch (_) {}
        } else {
            try {
                audio.pause();
                audio.removeAttribute('src');
                audio.load();
            } catch (_) {}
        }
        audio.currentTime = 0;
    }

    if (currentTimeEl) currentTimeEl.textContent = '0:00';
    if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
    if (progressBar) progressBar.style.width = '0%';
    if (miniProgressBar) miniProgressBar.style.width = '0%';

    updateEmptyPlayerState();
    if (trackName) updateMarqueeText(trackName, track.title ? track.title : (track.filename || 'Standalone Audio'));
    if (artistName) updateMarqueeText(artistName, track.artist ? track.artist : 'External File');
    if (albumName) updateMarqueeText(albumName, track.album ? `Album: ${track.album}${track.year ? ' (' + track.year + ')' : ''}` : 'Standalone File');

    updateTrackBadgeUi(track);
    const audioSrcBadge = document.getElementById('audioSourceBadge');
    if (audioSrcBadge) audioSrcBadge.textContent = 'STANDALONE';

    const coverSrc = track.cover || 'resources/images/default.svg';
    const hasCustomCover = Boolean(track.cover && !track.cover.includes('default.svg'));
    applyArtworkToDeck(coverSrc, hasCustomCover);
    appendDebugTelemetry(`[STANDALONE LOAD] "${track.title || track.filename}" (${track.format || 'AUDIO'}, ${track.sampleRate || 44100}Hz)`);

    applyTrackMetadataToDom(track, true);
    document.querySelectorAll('.trackItem.active').forEach(el => el.classList.remove('active'));

    if (totalDurationEl) totalDurationEl.textContent = formatTime(track.duration);
    if (miniTotalDuration) miniTotalDuration.textContent = formatTime(track.duration);
    updateMiniPlayerInfo(track);
    updateSignalPathUi(track);
    updateLyricsDisplay(track);

    mediaSessionController.updateMetadata(track);
    if (mprisSyncHook) mprisSyncHook(true);

    if (isKnownSoftware) {
        if (autoPlay) {
            playWithSoftwareDecoder(track, 0);
        } else {
            s.isSoftwarePaused = true;
            syncPlayPauseUI(false);
        }
        return;
    }

    if (autoPlay) {
        playAudio();
    } else {
        pauseAudio();
    }
}

// Centralized Play/Pause UI Synchronizer
function syncPlayPauseUI(playing, force = false) {
    const s = store.state;
    playing = !!playing;
    if (!force && s.lastSyncedPlayingState === playing) return;
    s.lastSyncedPlayingState = playing;
    s.isPlaying = playing;

    mediaSessionController.syncPlaybackState(playing);
    if (mprisSyncHook) mprisSyncHook(true);

    if (playPauseBtn) {
        playPauseBtn.setAttribute('title', playing ? 'Pause (Space)' : 'Play (Space)');
        playPauseBtn.classList.toggle('playing', playing);
    }

    const isThematicActive = (s.activeVisualizerMode === 'thematic' || s.activeVisualizerMode === 'badapple');
    if (vinylTurntable) {
        vinylTurntable.classList.toggle('thematicFidelity', isThematicActive);
        vinylTurntable.classList.toggle('spinning', playing);
    }
    if (toneArm) toneArm.classList.toggle('active', playing);
    if (bgDisc) bgDisc.classList.toggle('fast', playing && isThematicActive);

    updateMiniPlayerPlayState(playing);
    document.body.classList.toggle('is-playing', playing);

    const studioStatusEl = document.getElementById('studioUserStatus');
    if (studioStatusEl) {
        const textEl = studioStatusEl.querySelector('.statusText');
        if (textEl) {
            textEl.textContent = playing ? 'PLAYING' : 'READY';
        }
    }

    if (playing) {
        store.emit('visualizer:resume');
    }
}

function updateRepeatUI() {
    const s = store.state;
    if (!repeatBtn) return;
    safeStorage.setItem('cachymusic_repeat_mode', s.repeatMode);

    if (s.repeatMode === 'one') {
        repeatBtn.classList.add('active', 'repeat-one');
        repeatBtn.setAttribute('title', 'Repeat Current Track (1) Active — Click to Turn Off');
        repeatBtn.style.opacity = '1';
        repeatBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="7.5" font-weight="900" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" fill="currentColor">1</text>
            </svg>
        `;
    } else if (s.repeatMode === 'all') {
        repeatBtn.classList.add('active');
        repeatBtn.classList.remove('repeat-one');
        repeatBtn.setAttribute('title', 'Repeat All Tracks Active — Click for Repeat One');
        repeatBtn.style.opacity = '1';
        repeatBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
            </svg>
        `;
    } else {
        repeatBtn.classList.remove('active', 'repeat-one');
        repeatBtn.setAttribute('title', 'Repeat Off — Click for Repeat All');
        repeatBtn.style.opacity = '0.45';
        repeatBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
            </svg>
        `;
    }
}

// Unified Seek Helper (HTML5 <audio> and Web Audio Software Decoder)
function seekAudio(targetSec) {
    const s = store.state;
    if (typeof targetSec !== 'number' || isNaN(targetSec)) return;
    if (s.isSoftwareDecoding && s.activeDecodedBuffer) {
        seekSoftwarePlayback(targetSec);
        mediaSessionController.updatePositionState(true);
        return;
    }
    const audio = s.audio;
    if (!audio) return;
    const track = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
        ? s.standaloneTrackList[s.standaloneTrackIndex]
        : s.allTracks[s.currentTrackIndex];
    const dur = (audio.duration && isFinite(audio.duration)) ? audio.duration : (track?.duration || Infinity);
    const clamped = Math.max(0, Math.min(dur, targetSec));
    try {
        audio.currentTime = clamped;
    } catch (_) {}
    updatePlaybackProgress(clamped, isFinite(dur) ? dur : 0);
    mediaSessionController.updatePositionState(true);
    if (mprisSyncHook) mprisSyncHook(true);
}

// Play Audio (guarded against concurrent async race conditions and AbortError)
async function playAudio(userInitiated = false) {
    const s = store.state;
    if (s.isSoftwareDecoding) {
        s.userExplicitlyPaused = false;
        syncPlayPauseUI(true);
        resumeSoftwarePlayback();
        return;
    }

    const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
        ? s.standaloneTrackList[s.standaloneTrackIndex]
        : s.allTracks[s.currentTrackIndex];
    const currentSrc = currentTrack ? (currentTrack.src || '') : '';
    const cleanSrc = currentSrc.startsWith('../') ? currentSrc.substring(3) : currentSrc;
    const isKnownSoftware = currentTrack && (s.alwaysSoftwareDecodeUrls.has(cleanSrc) || (currentTrack.src && s.alwaysSoftwareDecodeUrls.has(currentTrack.src)));

    if (isKnownSoftware && !s.isSoftwareDecoding) {
        s.userExplicitlyPaused = false;
        syncPlayPauseUI(true);
        playWithSoftwareDecoder(currentTrack, 0);
        return;
    }

    const audio = s.audio;
    if (!audio || !audio.src || audio.src === window.location.href) {
        syncPlayPauseUI(false);
        return;
    }
    if (s.isPlayPending) {
        return;
    }

    const reqId = ++currentPlayRequestId;
    s.userExplicitlyPaused = false;
    s.isPlayPending = true;
    clearNoDataStallTimer();
    if (playPendingTimeout) clearTimeout(playPendingTimeout);
    playPendingTimeout = setTimeout(() => {
        if (s.isPlayPending && reqId === currentPlayRequestId) {
            s.isPlayPending = false;
        }
    }, 4000);

    syncPlayPauseUI(true);

    const scheduleNoDataFallback = (targetAudio) => {
        clearNoDataStallTimer();
        if (!targetAudio || !currentTrack || s.userExplicitlyPaused || s.isSoftwareDecoding) return;
        if (targetAudio.readyState >= 1) return;
        noDataStallTimer = setTimeout(() => {
            noDataStallTimer = null;
            if (reqId !== currentPlayRequestId || s.userExplicitlyPaused || s.isSoftwareDecoding || s.audio !== targetAudio) return;
            if (targetAudio.readyState === 0 && !targetAudio.ended) {
                const rawSrc = targetAudio.getAttribute('src') || targetAudio.src || '';
                if (rawSrc) s.alwaysSoftwareDecodeUrls.add(rawSrc);
                if (currentTrack.src) s.alwaysSoftwareDecodeUrls.add(currentTrack.src);
                try {
                    targetAudio.pause();
                    targetAudio.removeAttribute('src');
                    targetAudio.load();
                } catch (_) {}
                logAudioPlaybackEvent('info', `HTML5 Audio stalled at No Data (readyState 0) on "${currentTrack.title || currentTrack.filename}". Switching to 32-bit Web Audio Software Engine.`);
                playWithSoftwareDecoder(currentTrack, targetAudio.currentTime || 0);
            }
        }, 2200);
    };

    try {
        const track = s.allTracks[s.currentTrackIndex];
        const targetRate = (track && track.sampleRate) ? getValidSampleRate(track.sampleRate) : 44100;
        if (!s.audioContext || s.audioContext.state === 'closed') {
            await ensureAudioEngineForSampleRate(targetRate);
        } else if (!s.audioSourceNode) {
            getOrCreateAudioSourceNode();
            updateAudioRouting();
        }
        if (reqId !== currentPlayRequestId) return;
        if (s.audioContext && s.audioContext.state !== 'running') {
            try {
                await Promise.race([
                    s.audioContext.resume(),
                    new Promise(resolve => setTimeout(resolve, 300))
                ]);
            } catch (_) {}
        }
        if (reqId !== currentPlayRequestId) return;
        const activeAudio = s.audio;
        if (activeAudio.muted) activeAudio.muted = false;
        if (activeAudio.volume === 0 && s.currentVolumeValue > 0) {
            activeAudio.volume = s.isHardwareGain ? 1.0 : Math.min(1.0, s.currentVolumeValue);
        }

        if (activeAudio.error && !activeAudio._isFreshTrackLoad) {
            const isDecodeErr = (activeAudio.error.code === 3);
            const resumeTime = isDecodeErr ? 0 : (activeAudio.currentTime || 0);
            const reloadSrc = activeAudio.src;
            activeAudio.src = reloadSrc;
            activeAudio.load();
            if (resumeTime > 0) {
                try { activeAudio.currentTime = resumeTime; } catch (_) {}
            }
        }
        activeAudio._isFreshTrackLoad = false;

        scheduleNoDataFallback(activeAudio);
        await activeAudio.play();
        if (reqId !== currentPlayRequestId) return;
        if (activeAudio.readyState >= 1) clearNoDataStallTimer();
        syncPlayPauseUI(!activeAudio.paused);
    } catch (err) {
        clearNoDataStallTimer();
        if (reqId !== currentPlayRequestId) return;
        const errCode = s.audio && s.audio.error ? s.audio.error.code : 0;
        const shouldSoftwareFallback = !s.userExplicitlyPaused && currentTrack && !s.isSoftwareDecoding
            && (err.name === 'NotSupportedError' || errCode === 3 || errCode === 4);
        if (shouldSoftwareFallback) {
            const rawSrc = (s.audio && (s.audio.getAttribute('src') || s.audio.src)) || '';
            if (rawSrc) s.alwaysSoftwareDecodeUrls.add(rawSrc);
            if (currentTrack.src) s.alwaysSoftwareDecodeUrls.add(currentTrack.src);
            try {
                if (s.audio) {
                    s.audio.pause();
                    s.audio.removeAttribute('src');
                    s.audio.load();
                }
            } catch (_) {}
            logAudioPlaybackEvent('info', `HTML5 play() rejected (${err.name || 'code ' + errCode}) on "${currentTrack.title || currentTrack.filename}". Switching to 32-bit Web Audio Software Engine.`);
            playWithSoftwareDecoder(currentTrack, (s.audio && s.audio.currentTime) || 0);
            return;
        }
        if (err.name !== 'AbortError') {
            console.warn('Audio playback error:', err);
        }
        if (s.audio && s.audio.paused) {
            syncPlayPauseUI(false);
        }
    } finally {
        if (reqId === currentPlayRequestId) {
            if (playPendingTimeout) {
                clearTimeout(playPendingTimeout);
                playPendingTimeout = null;
            }
            s.isPlayPending = false;
        }
    }
}

function pauseAudio() {
    const s = store.state;
    s.userExplicitlyPaused = true;
    clearNoDataStallTimer();
    if (s.isSoftwareDecoding) {
        pauseSoftwarePlayback();
        syncPlayPauseUI(false);
        return;
    }
    try {
        if (s.audio) s.audio.pause();
    } catch (err) {
        console.warn('Audio pause error:', err);
    }
    syncPlayPauseUI(false);
}

function togglePlayPause() {
    const s = store.state;
    if (s.isSoftwareDecoding) {
        if (!s.isSoftwarePaused) {
            s.userExplicitlyPaused = true;
            pauseAudio();
        } else {
            s.userExplicitlyPaused = false;
            playAudio(true);
        }
        return;
    }
    const audio = s.audio;
    if (!audio || !audio.src || audio.src === window.location.href) {
        if (s.allTracks && s.allTracks.length > 0) {
            const targetIdx = (s.currentTrackIndex >= 0 && s.allTracks[s.currentTrackIndex]) ? s.currentTrackIndex : 0;
            loadTrack(targetIdx, true);
            return;
        }
        syncPlayPauseUI(false);
        return;
    }
    if (!audio.paused) {
        s.userExplicitlyPaused = true;
        pauseAudio();
    } else if (!s.isPlayPending) {
        s.userExplicitlyPaused = false;
        playAudio(true);
    }
}

// =========================================================================
// True Gapless Playback Engine (Dual-Buffer Pre-caching & 0ms Handoff)
// =========================================================================
function peekNextTrackIndex() {
    const s = store.state;
    if (s.playQueue && s.playQueue.length > 0) {
        const queued = s.playQueue[0];
        const qIdx = s.allTracks.findIndex(t => (queued.id && t.id === queued.id) || (queued.tid && t.tid === queued.tid) || t.filename === queued.filename);
        if (qIdx !== -1) return qIdx;
    }

    const pool = s.displayedTracks.length > 0 ? s.displayedTracks : s.allTracks;
    if (pool.length === 0) return -1;

    const currentIdxInPool = pool.findIndex(t => {
        const cur = s.allTracks[s.currentTrackIndex];
        if (!cur) return false;
        if (cur.id && t.id) return t.id === cur.id;
        if (cur.tid && t.tid) return t.tid === cur.tid;
        return t.filename === cur.filename;
    });

    if (currentIdxInPool === -1) return -1;
    if (s.isShuffle && pool.length > 1) return -1;

    let nextIdx = currentIdxInPool + 1;
    if (nextIdx >= pool.length) {
        if (s.repeatMode === 'off') return -1;
        nextIdx = 0;
    }

    const target = pool[nextIdx];
    return s.allTracks.findIndex(t => target && ((t.id && t.id === target.id) || (t.tid && t.tid === target.tid) || t.filename === target.filename));
}

function checkAndPreloadNextTrack(currentTime, duration) {
    const rt = getRuntime();
    if (rt.isAndroid || rt.isMobile) return;
    if (!duration || isNaN(duration) || duration < 8) return;
    const s = store.state;
    if (duration - currentTime <= 5.0) {
        const nextMasterIdx = peekNextTrackIndex();
        if (nextMasterIdx !== -1 && nextMasterIdx !== s.preloadedNextTrackIndex && s.allTracks[nextMasterIdx]) {
            s.preloadedNextTrackIndex = nextMasterIdx;
            const nextTr = s.allTracks[nextMasterIdx];
            let nextSrc = nextTr.src || '';
            if (nextSrc.startsWith('../')) nextSrc = nextSrc.substring(3);
            if (!nextSrc) return;

            if (!s.secondaryAudio) {
                s.secondaryAudio = document.createElement('audio');
                s.secondaryAudio.preload = 'auto';
                s.secondaryAudio.crossOrigin = 'anonymous';
            }
            s.secondaryAudio.src = nextSrc;
            try { s.secondaryAudio.load(); } catch (_) {}
        }
    }
}

function executeGaplessHandoff(nextIndex) {
    const rt = getRuntime();
    if (rt.isAndroid || rt.isMobile) return false;
    const s = store.state;
    if (!s.secondaryAudio || s.preloadedNextTrackIndex !== nextIndex || s.secondaryAudio.readyState < 2) {
        return false;
    }
    try {
        const oldAudio = s.audio;
        s.secondaryAudio.volume = oldAudio.volume;
        s.secondaryAudio.muted = oldAudio.muted;
        try {
            s.secondaryAudio.playbackRate = s.currentPlaybackSpeed || oldAudio.playbackRate || 1.0;
            s.secondaryAudio.preservesPitch = s.isPitchLockTempo;
            s.secondaryAudio.mozPreservesPitch = s.isPitchLockTempo;
            s.secondaryAudio.webkitPreservesPitch = s.isPitchLockTempo;
        } catch (_) {}

        s.audio = s.secondaryAudio;
        s.secondaryAudio = oldAudio;
        s.currentTrackIndex = nextIndex;
        s.preloadedNextTrackIndex = -1;
        s.trackPlaybackRetryCount = 0;

        oldAudio.pause();
        oldAudio.removeAttribute('src');

        if (s.audioSourceNode) {
            try { s.audioSourceNode.disconnect(); } catch (_) {}
            s.audioSourceNode = null;
        }

        attachAudioListeners(s.audio);
        getOrCreateAudioSourceNode();
        updateAudioRouting();

        const nextTr = s.allTracks[s.currentTrackIndex];
        s.currentTrack = nextTr;
        store.emit('track:change', { track: nextTr, index: nextIndex });

        s.userExplicitlyPaused = false;
        s.audio.play().then(() => {
            syncPlayPauseUI(true);
            store.emit('visualizer:resume');
        }).catch(console.warn);

        if (nextTr) {
            if (trackName) updateMarqueeText(trackName, nextTr.title ? nextTr.title : (nextTr.filename || 'Unknown'));
            if (artistName) updateMarqueeText(artistName, nextTr.artist ? nextTr.artist : 'Unknown');
            if (albumName) updateMarqueeText(albumName, nextTr.album ? `Album: ${nextTr.album}${nextTr.year ? ' (' + nextTr.year + ')' : ''}` : 'Album: Unknown');
            updateTrackBadgeUi(nextTr);
            const coverSrc = nextTr.cover || 'resources/images/default.svg';
            const hasCustomCover = Boolean(nextTr.cover && !nextTr.cover.includes('default.svg'));
            applyArtworkToDeck(coverSrc, hasCustomCover);
            applyTrackMetadataToDom(nextTr, false);
            updateSignalPathUi(nextTr);
            updateLyricsDisplay(nextTr);
            updateMiniPlayerInfo(nextTr);
            mediaSessionController.updateMetadata(nextTr);
            store.emit('library:render-window', { preserveScroll: true });
        }
        return true;
    } catch (e) {
        console.warn('Gapless handoff fallback:', e);
        return false;
    }
}

function nextTrack() {
    const s = store.state;
    if (s.isStandalonePlayback && s.standaloneTrackList && s.standaloneTrackList.length > 0) {
        if (s.repeatMode === 'one') {
            seekAudio(0);
            playAudio();
            return;
        }
        if (s.standaloneTrackList.length > 1 && (s.standaloneTrackIndex + 1 < s.standaloneTrackList.length || s.repeatMode === 'all')) {
            s.standaloneTrackIndex = (s.standaloneTrackIndex + 1) % s.standaloneTrackList.length;
            loadStandaloneTrack(s.standaloneTrackIndex, true);
        } else if (s.repeatMode === 'all') {
            seekAudio(0);
            playAudio();
        } else {
            pauseAudio();
            seekAudio(0);
        }
        return;
    }

    if (s.playQueue && s.playQueue.length > 0) {
        const nextQueuedTrack = s.playQueue.shift();
        store.emit('library:update-queue');
        const masterIdx = s.allTracks.findIndex(t =>
            (nextQueuedTrack.id && t.id === nextQueuedTrack.id) ||
            (nextQueuedTrack.tid && t.tid === nextQueuedTrack.tid) ||
            t.filename === nextQueuedTrack.filename
        );
        if (masterIdx !== -1) {
            if (!executeGaplessHandoff(masterIdx)) {
                loadTrack(masterIdx, true);
            }
            return;
        }
    }

    const pool = s.displayedTracks.length > 0 ? s.displayedTracks : s.allTracks;
    if (pool.length === 0) return;

    const currentIdxInPool = pool.findIndex(t => {
        const cur = s.allTracks[s.currentTrackIndex];
        if (!cur) return false;
        if (cur.id && t.id) return t.id === cur.id;
        if (cur.tid && t.tid) return t.tid === cur.tid;
        return t.filename === cur.filename;
    });

    if (s.isShuffle && pool.length > 1) {
        let nextIdx = Math.floor(Math.random() * pool.length);
        let attempts = 0;
        while (nextIdx === currentIdxInPool && attempts < 10) {
            nextIdx = Math.floor(Math.random() * pool.length);
            attempts++;
        }
        const masterIdx = s.allTracks.findIndex(t => pool[nextIdx] && ((t.id && t.id === pool[nextIdx].id) || (t.tid && t.tid === pool[nextIdx].tid) || t.filename === pool[nextIdx].filename));
        if (masterIdx !== -1 && !executeGaplessHandoff(masterIdx)) {
            loadTrack(masterIdx, true);
        }
    } else {
        let nextIdx = currentIdxInPool + 1;
        if (nextIdx >= pool.length) {
            if (s.repeatMode === 'off') {
                pauseAudio();
                seekAudio(0);
                if (progressBar) progressBar.style.width = '0%';
                if (currentTimeEl) currentTimeEl.textContent = '0:00';
                return;
            }
            nextIdx = 0;
        }
        const masterIdx = s.allTracks.findIndex(t => pool[nextIdx] && ((t.id && t.id === pool[nextIdx].id) || (t.tid && t.tid === pool[nextIdx].tid) || t.filename === pool[nextIdx].filename));
        if (masterIdx !== -1 && !executeGaplessHandoff(masterIdx)) {
            loadTrack(masterIdx, true);
        }
    }
}

function prevTrack() {
    const s = store.state;
    const curPos = s.isSoftwareDecoding
        ? (s.softwarePlaybackOffset + (!s.isSoftwarePaused && s.audioContext ? (s.audioContext.currentTime - s.softwarePlaybackStartTime) : 0))
        : (s.audio ? s.audio.currentTime : 0);

    if (s.isStandalonePlayback && s.standaloneTrackList && s.standaloneTrackList.length > 0) {
        if (curPos > 3) {
            seekAudio(0);
        } else if (s.standaloneTrackList.length > 1) {
            s.standaloneTrackIndex = (s.standaloneTrackIndex - 1 + s.standaloneTrackList.length) % s.standaloneTrackList.length;
            loadStandaloneTrack(s.standaloneTrackIndex, true);
        } else {
            seekAudio(0);
        }
        return;
    }

    if (curPos > 3) {
        seekAudio(0);
        return;
    }

    const pool = s.displayedTracks.length > 0 ? s.displayedTracks : s.allTracks;
    if (pool.length === 0) return;

    const currentIdxInPool = pool.findIndex(t => {
        const cur = s.allTracks[s.currentTrackIndex];
        if (!cur) return false;
        if (cur.id && t.id) return t.id === cur.id;
        if (cur.tid && t.tid) return t.tid === cur.tid;
        return t.filename === cur.filename;
    });
    let prevIdx = currentIdxInPool - 1;
    if (prevIdx < 0) prevIdx = pool.length - 1;
    const masterIdx = s.allTracks.findIndex(t => pool[prevIdx] && ((t.id && t.id === pool[prevIdx].id) || (t.tid && t.tid === pool[prevIdx].tid) || t.filename === pool[prevIdx].filename));
    if (masterIdx !== -1) loadTrack(masterIdx, true);
}

// =========================================================================
// Universal Web Audio Software Decoder Engine (Zero-Skip Hybrid Pipeline)
// =========================================================================
function updatePlaybackProgress(cur, dur) {
    const s = store.state;
    if (s.isDraggingScrubber) return;
    const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
        ? s.standaloneTrackList[s.standaloneTrackIndex]
        : s.allTracks[s.currentTrackIndex];
    if (!isFinite(dur) || isNaN(dur) || dur <= 0) {
        if (currentTrack && currentTrack.duration && isFinite(currentTrack.duration)) {
            dur = Number(currentTrack.duration);
        }
    }
    if (currentTimeEl) currentTimeEl.textContent = formatTime(cur);
    if (miniCurrentTime) miniCurrentTime.textContent = formatTime(cur);

    if (dur && isFinite(dur) && dur > 0) {
        const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (miniProgressBar) miniProgressBar.style.width = `${pct}%`;
    }

    if (cur > 1.0 && s.consecutiveSkipCount > 0) {
        s.consecutiveSkipCount = 0;
    }

    if (s.isLyricsView) {
        updateActiveLyric(cur);
    }
}

function startSoftwareProgressLoop() {
    const s = store.state;
    cancelSoftwareProgressLoop();
    function tick() {
        if (!s.isSoftwareDecoding || s.isSoftwarePaused || !s.activeDecodedBuffer) return;
        const cur = s.softwarePlaybackOffset + (s.audioContext ? (s.audioContext.currentTime - s.softwarePlaybackStartTime) : 0);
        const dur = s.activeDecodedBuffer.duration;
        updatePlaybackProgress(cur, dur);
        mediaSessionController.updatePositionState(false);
        if (cur >= dur) {
            onSoftwarePlaybackEnded();
            return;
        }
        s.softwarePlaybackRaf = requestAnimationFrame(tick);
    }
    s.softwarePlaybackRaf = requestAnimationFrame(tick);
}

function cancelSoftwareProgressLoop() {
    const s = store.state;
    if (s.softwarePlaybackRaf) {
        cancelAnimationFrame(s.softwarePlaybackRaf);
        s.softwarePlaybackRaf = null;
    }
}

function startSoftwareBufferPlayback() {
    const s = store.state;
    if (!s.audioContext || !s.activeDecodedBuffer) return;
    if (s.softwareSourceNode) {
        try {
            s.softwareSourceNode.onended = null;
            s.softwareSourceNode.stop();
            s.softwareSourceNode.disconnect();
        } catch (_) {}
        s.softwareSourceNode = null;
    }

    s.softwareSourceNode = s.audioContext.createBufferSource();
    s.softwareSourceNode.buffer = s.activeDecodedBuffer;

    if (!s.softwareSourceGainNode) {
        s.softwareSourceGainNode = s.audioContext.createGain();
    }
    s.softwareSourceNode.connect(s.softwareSourceGainNode);
    updateAudioRouting();

    s.softwarePlaybackStartTime = s.audioContext.currentTime;
    s.softwareSourceNode.start(0, s.softwarePlaybackOffset);
    s.isSoftwarePaused = false;
    syncPlayPauseUI(true);
    startSoftwareProgressLoop();

    s.softwareSourceNode.onended = () => {
        if (!s.isSoftwareDecoding || s.isSoftwarePaused) return;
        const cur = s.softwarePlaybackOffset + (s.audioContext ? (s.audioContext.currentTime - s.softwarePlaybackStartTime) : 0);
        if (s.activeDecodedBuffer && cur >= (s.activeDecodedBuffer.duration - 0.5)) {
            onSoftwarePlaybackEnded();
        }
    };
}

function pauseSoftwarePlayback() {
    const s = store.state;
    if (!s.isSoftwareDecoding || s.isSoftwarePaused) return;
    cancelSoftwareProgressLoop();
    if (s.audioContext && s.softwarePlaybackStartTime > 0) {
        s.softwarePlaybackOffset += (s.audioContext.currentTime - s.softwarePlaybackStartTime);
    }
    if (s.softwareSourceNode) {
        try {
            s.softwareSourceNode.onended = null;
            s.softwareSourceNode.stop();
            s.softwareSourceNode.disconnect();
        } catch (_) {}
        s.softwareSourceNode = null;
    }
    s.isSoftwarePaused = true;
    syncPlayPauseUI(false);
}

function resumeSoftwarePlayback() {
    const s = store.state;
    if (!s.isSoftwareDecoding || !s.activeDecodedBuffer) return;
    if (s.audioContext && s.audioContext.state !== 'running') {
        try { s.audioContext.resume(); } catch (_) {}
    }
    startSoftwareBufferPlayback();
}

function seekSoftwarePlayback(targetSec) {
    const s = store.state;
    if (!s.isSoftwareDecoding || !s.activeDecodedBuffer) return;
    const dur = s.activeDecodedBuffer.duration;
    s.softwarePlaybackOffset = Math.max(0, Math.min(dur, targetSec));
    if (!s.isSoftwarePaused) {
        startSoftwareBufferPlayback();
    } else {
        updatePlaybackProgress(s.softwarePlaybackOffset, dur);
    }
}

function stopSoftwarePlayback() {
    const s = store.state;
    cancelSoftwareProgressLoop();
    if (s.softwareSourceNode) {
        try {
            s.softwareSourceNode.onended = null;
            s.softwareSourceNode.stop();
            s.softwareSourceNode.disconnect();
        } catch (_) {}
        s.softwareSourceNode = null;
    }
    s.isSoftwareDecoding = false;
    s.isSoftwarePaused = false;
    s.softwarePlaybackStartTime = 0;
    s.softwarePlaybackOffset = 0;
}

function onSoftwarePlaybackEnded() {
    const s = store.state;
    stopSoftwarePlayback();
    try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {}
    if (s.repeatMode === 'one') {
        loadTrack(s.currentTrackIndex, true, 0);
    } else {
        nextTrack();
    }
}

function stripId3ToFlacMagic(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 16) return null;
    const bytes = new Uint8Array(arrayBuffer);
    // Only scan when file begins with ID3v2 header ('I','D','3')
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;
    // Syncsafe ID3v2 tag size + 10-byte header
    let startOffset = 10 + ((bytes[6] & 0x7f) << 21) + ((bytes[7] & 0x7f) << 14) + ((bytes[8] & 0x7f) << 7) + (bytes[9] & 0x7f);
    if (startOffset + 4 <= bytes.length
        && bytes[startOffset] === 0x66 && bytes[startOffset + 1] === 0x4c
        && bytes[startOffset + 2] === 0x61 && bytes[startOffset + 3] === 0x43) {
        return arrayBuffer.slice(startOffset);
    }
    const scanLimit = Math.min(bytes.length - 4, 262144);
    for (let i = 10; i < scanLimit; i++) {
        if (bytes[i] === 0x66 && bytes[i + 1] === 0x4c && bytes[i + 2] === 0x61 && bytes[i + 3] === 0x43) {
            return arrayBuffer.slice(i);
        }
    }
    return null;
}

async function decodeBufferWithAudioContext(ctx, rawArrayBuf) {
    const attemptDecode = (buf) => new Promise((resolve, reject) => {
        const p = ctx.decodeAudioData(
            buf,
            decoded => resolve(decoded),
            err => reject(err || new Error('decodeAudioData callback returned error'))
        );
        if (p && typeof p.then === 'function') {
            p.then(resolve, reject);
        }
    });
    try {
        // Slice a copy so decodeAudioData neutering never destroys our fallback slice
        return await attemptDecode(rawArrayBuf.slice(0));
    } catch (primaryErr) {
        const stripped = stripId3ToFlacMagic(rawArrayBuf);
        if (stripped) {
            logAudioPlaybackEvent('info', 'Stripped prepended ID3v2 tag wrapper before fLaC sync frame for software decoder.');
            return await attemptDecode(stripped);
        }
        throw primaryErr;
    }
}

async function playWithSoftwareDecoder(track, startTime = 0) {
    const s = store.state;
    if (!track) return;
    clearNoDataStallTimer();
    const decodeGen = currentTrackGeneration;
    s.activeDecodedBuffer = null;
    s.isSoftwareDecoding = true;
    s.isSoftwarePaused = false;
    s.userExplicitlyPaused = false;
    syncPlayPauseUI(true);

    try {
        if (s.audio) {
            try {
                s.audio.pause();
                s.audio.removeAttribute('src');
                s.audio.load();
            } catch (_) {}
        }

        const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
        await ensureAudioEngineForSampleRate(targetRate);
        if (decodeGen !== currentTrackGeneration) return;
        if (s.audioContext && s.audioContext.state !== 'running') {
            try {
                await Promise.race([
                    s.audioContext.resume(),
                    new Promise(resolve => setTimeout(resolve, 250))
                ]);
            } catch (_) {}
        }

        let src = track.src || '';
        if (src.startsWith('../')) src = src.substring(3);

        logAudioPlaybackEvent('info', `Fetching stream bitstream for 32-bit software decode: "${track.title || track.filename}"`);
        showCachyToast('Software Audio Engine', `Decompressing lossless bitstream: "${track.title || track.filename}"`, 'info');

        let arrayBuf = null;
        if (track._fileBlob && typeof track._fileBlob.arrayBuffer === 'function') {
            arrayBuf = await track._fileBlob.arrayBuffer();
        } else {
            const res = await fetch(src);
            if (!res.ok) throw new Error(`HTTP ${res.status} fetch failure`);
            arrayBuf = await res.arrayBuffer();
        }
        if (decodeGen !== currentTrackGeneration || !s.isSoftwareDecoding) return;

        logAudioPlaybackEvent('info', `Decompressing bitstream into 32-bit floating point audio buffer (${(arrayBuf.byteLength / (1024 * 1024)).toFixed(2)} MB)...`);
        const decodedBuffer = await decodeBufferWithAudioContext(s.audioContext, arrayBuf);
        if (decodeGen !== currentTrackGeneration || !s.isSoftwareDecoding) return;
        s.activeDecodedBuffer = decodedBuffer;

        track.duration = decodedBuffer.duration;
        if (totalDurationEl) totalDurationEl.textContent = formatTime(decodedBuffer.duration);
        if (miniTotalDuration) miniTotalDuration.textContent = formatTime(decodedBuffer.duration);

        s.softwarePlaybackOffset = Math.max(0, Math.min(decodedBuffer.duration, startTime));
        startSoftwareBufferPlayback();
        s.consecutiveSkipCount = 0;
        logAudioPlaybackEvent('info', `Web Audio Software Engine playing "${track.title || track.filename}" at ${decodedBuffer.sampleRate}Hz, ${decodedBuffer.numberOfChannels}ch, ${decodedBuffer.duration.toFixed(1)}s.`);
    } catch (err) {
        if (decodeGen !== currentTrackGeneration) return;
        console.error('[AudioEngine] Software decoder fallback failed:', err);
        logAudioPlaybackEvent('error', `Web Audio software decode failure: ${err.message}`);
        s.isSoftwareDecoding = false;
        s.activeDecodedBuffer = null;
        showCachyToast('Playback Error', 'File corrupted or unreadable. Skipping track...', 'error');
        setTimeout(() => nextTrack(), 1000);
    }
}

function attachAudioListeners(targetAudio) {
    const s = store.state;
    if (!targetAudio || targetAudio._hasCachyListeners) return;
    targetAudio._hasCachyListeners = true;
    let isAudioBuffering = false;

    targetAudio.addEventListener('play', () => {
        if (targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (s.userExplicitlyPaused && document.hidden) {
            targetAudio.pause();
            syncPlayPauseUI(false);
            return;
        }
        isAudioBuffering = false;
        syncPlayPauseUI(true);
    });
    targetAudio.addEventListener('playing', () => {
        if (targetAudio._isDisposed || targetAudio !== s.audio) return;
        clearNoDataStallTimer();
        if (s.userExplicitlyPaused && document.hidden) {
            targetAudio.pause();
            syncPlayPauseUI(false);
            return;
        }
        isAudioBuffering = false;
        syncPlayPauseUI(true);
    });
    targetAudio.addEventListener('canplay', () => {
        if (targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (targetAudio.readyState >= 1) clearNoDataStallTimer();
    });
    targetAudio.addEventListener('pause', () => {
        if (targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (isAudioBuffering && !s.userExplicitlyPaused) return;
        syncPlayPauseUI(false);
        try {
            const cur = targetAudio.currentTime;
            const dur = targetAudio.duration;
            if (cur > 0 && (!dur || isNaN(dur) || cur < (dur - 1))) {
                safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2));
            }
        } catch (_) {}
    });
    targetAudio.addEventListener('emptied', () => {
        if (targetAudio._isDisposed || targetAudio !== s.audio) return;
        syncPlayPauseUI(false);
    });
    targetAudio.addEventListener('waiting', () => {
        if (targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (!s.userExplicitlyPaused) isAudioBuffering = true;
    });
    targetAudio.addEventListener('stalled', () => {
        if (targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (!s.userExplicitlyPaused) isAudioBuffering = true;
    });
    targetAudio.addEventListener('error', () => {
        if (targetAudio._isDisposed || targetAudio !== s.audio || s.isSoftwareDecoding) return;
        if (!targetAudio.src || targetAudio.src === window.location.href || !targetAudio.getAttribute('src')) {
            return;
        }
        const err = targetAudio.error;
        if (!err) return;
        console.error('Audio element error:', err);
        clearNoDataStallTimer();
        isAudioBuffering = false;
        syncPlayPauseUI(false);
        s.isPlayPending = false;

        if (playPendingTimeout) {
            clearTimeout(playPendingTimeout);
            playPendingTimeout = null;
        }

        const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
            ? s.standaloneTrackList[s.standaloneTrackIndex]
            : s.allTracks[s.currentTrackIndex];
        const trackTitle = currentTrack ? (currentTrack.title || currentTrack.filename || 'Current track') : 'Audio track';
        const errorCode = err ? err.code : 0;
        const isFatalDecodeError = (errorCode === 3 || errorCode === 4);

        const currentAttrSrc = targetAudio.getAttribute('src') || targetAudio.src || '';
        if (isFatalDecodeError && s.trackPlaybackRetryCount === 0 && currentAttrSrc.includes('php/api/stream.php') && !currentAttrSrc.includes('transcode=1')) {
            s.trackPlaybackRetryCount++;
            const transcodeSrc = currentAttrSrc + (currentAttrSrc.includes('?') ? '&' : '?') + 'transcode=1';
            s.userExplicitlyPaused = false;
            targetAudio.src = transcodeSrc;
            try { targetAudio.load(); } catch (_) {}
            playAudio();
            return;
        }

        if (isFatalDecodeError && currentTrack && !s.isSoftwareDecoding) {
            s.alwaysSoftwareDecodeUrls.add(currentAttrSrc);
            s.alwaysSoftwareDecodeUrls.add(targetAudio.src);
            try {
                targetAudio.pause();
                targetAudio.removeAttribute('src');
                targetAudio.load();
            } catch (_) {}
            logAudioPlaybackEvent('info', `Native decoder unsuited for "${trackTitle}" (code ${errorCode}). Playing via 32-bit Web Audio Software Engine.`);
            playWithSoftwareDecoder(currentTrack, targetAudio.currentTime || 0);
            return;
        }

        if (isFatalDecodeError || s.trackPlaybackRetryCount >= 1) {
            s.userExplicitlyPaused = true;
            s.consecutiveSkipCount++;
            const errorDesc = errorCode === 3
                ? 'Corrupted audio stream or decoder failure'
                : (errorCode === 4 ? 'Format or file source not supported' : 'Playback stream timed out');

            logAudioPlaybackEvent('error', `Track "${trackTitle}" decode failure (code ${errorCode}): ${errorDesc}`, {
                src: targetAudio.src,
                track: currentTrack
            });

            if (s.consecutiveSkipCount >= 3) {
                pauseAudio();
                logAudioPlaybackEvent('warn', 'Consecutive skip limit reached (3 tracks failed). Halting auto-skip.');
                showCachyToast('Playback Halted', 'Multiple tracks failed to decode. Check Audio Diagnostics in Settings.', 'error');
                return;
            }

            showCachyToast('Playback Error', `"${trackTitle}": ${errorDesc}. Skipping track...`, 'warning');
            store.emit('audio:reset-element');

            setTimeout(() => {
                const pool = s.displayedTracks.length > 0 ? s.displayedTracks : s.allTracks;
                const currentIdxInPool = pool.findIndex(t => {
                    const cur = s.allTracks[s.currentTrackIndex];
                    if (!cur) return false;
                    if (cur.id && t.id) return t.id === cur.id;
                    if (cur.tid && t.tid) return t.tid === cur.tid;
                    return t.filename === cur.filename;
                });
                if (currentIdxInPool === pool.length - 1 && s.repeatMode === 'off') {
                    pauseAudio();
                    targetAudio.currentTime = 0;
                    if (progressBar) progressBar.style.width = '0%';
                    if (currentTimeEl) currentTimeEl.textContent = '0:00';
                    try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {}
                } else {
                    nextTrack();
                }
            }, 1200);
            return;
        }

        if (errorCode === 2 && targetAudio.src && !s.userExplicitlyPaused && s.trackPlaybackRetryCount === 0) {
            s.trackPlaybackRetryCount++;
            const savedTime = targetAudio.currentTime || 0;
            const currentSrc = targetAudio.src;
            setTimeout(() => {
                if (!s.userExplicitlyPaused) {
                    targetAudio.src = currentSrc;
                    targetAudio.load();
                    if (savedTime > 0) {
                        try { targetAudio.currentTime = savedTime; } catch (_) {}
                    }
                    targetAudio.play().catch(() => {
                        syncPlayPauseUI(false);
                        s.userExplicitlyPaused = true;
                        showCachyToast('Network Error', `Could not recover stream for "${trackTitle}".`, 'error');
                    });
                }
            }, 1500);
        }
    });

    let lastPersistedTime = 0;
    targetAudio.addEventListener('timeupdate', () => {
        if (targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (s.isSoftwareDecoding || s.isDraggingScrubber) return;
        const cur = targetAudio.currentTime;
        let dur = targetAudio.duration;
        const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
            ? s.standaloneTrackList[s.standaloneTrackIndex]
            : s.allTracks[s.currentTrackIndex];
        if (!isFinite(dur) || isNaN(dur) || dur <= 0) {
            if (currentTrack && currentTrack.duration && isFinite(currentTrack.duration)) {
                dur = Number(currentTrack.duration);
            }
        }
        updatePlaybackProgress(cur, dur);
        mediaSessionController.updatePositionState(false);

        if (cur > 0 && Math.abs(cur - lastPersistedTime) >= 1.0) {
            lastPersistedTime = cur;
            if (!dur || isNaN(dur) || cur < (dur - 1)) {
                try { safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2)); } catch (_) {}
            }
        }
        checkAndPreloadNextTrack(cur, dur);
        if (mprisSyncHook) mprisSyncHook(false);
    });

    targetAudio.addEventListener('ended', () => {
        if (targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (typeof targetAudio._trackGeneration === 'number' && targetAudio._trackGeneration !== currentTrackGeneration) {
            return;
        }
        try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {}

        const curTime = targetAudio.currentTime || 0;
        const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
            ? s.standaloneTrackList[s.standaloneTrackIndex]
            : s.allTracks[s.currentTrackIndex];
        const trackDur = targetAudio.duration || (currentTrack ? (currentTrack.duration || 0) : 0);
        const trackTitle = currentTrack ? (currentTrack.title || currentTrack.filename || 'Current track') : 'Audio track';

        if ((trackDur > 5 && curTime < 3.0) || curTime === 0) {
            logAudioPlaybackEvent('warn', `Premature stream termination at ${curTime.toFixed(2)}s on "${trackTitle}"`);
            appendDebugTelemetry(`[WARN] Premature stream end at ${curTime.toFixed(2)}s / ${trackDur.toFixed(2)}s for "${trackTitle}". Attempting reload...`, 'warn');
            if (s.trackPlaybackRetryCount < 2) {
                s.trackPlaybackRetryCount++;
                setTimeout(() => {
                    if (!s.userExplicitlyPaused) {
                        try { targetAudio.load(); } catch (_) {}
                        playAudio();
                    }
                }, 400);
                return;
            }
            pauseAudio();
            showToast(`Playback paused on "${trackTitle}". Stream buffer interrupted.`);
            return;
        }
        appendDebugTelemetry(`[EVENT] Track finished naturally at ${curTime.toFixed(1)}s`);

        if (s.sleepTimerMode === 'end') {
            pauseAudio();
            cancelSleepTimer(false);
            showToast('Sleep timer: End of track reached. Playback paused.');
            return;
        }

        if (s.repeatMode === 'one') {
            targetAudio.currentTime = 0;
            playAudio();
        } else {
            nextTrack();
        }
    });

    targetAudio.addEventListener('loadedmetadata', () => {
        if (targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (targetAudio.duration && !isNaN(targetAudio.duration)) {
            if (totalDurationEl) totalDurationEl.textContent = formatTime(targetAudio.duration);
            if (miniTotalDuration) miniTotalDuration.textContent = formatTime(targetAudio.duration);
            mediaSessionController.updatePositionState(true);
        }
        try {
            if (s.currentPlaybackSpeed !== 1.0) {
                targetAudio.playbackRate = s.currentPlaybackSpeed;
            }
            targetAudio.preservesPitch = s.isPitchLockTempo;
            targetAudio.mozPreservesPitch = s.isPitchLockTempo;
            targetAudio.webkitPreservesPitch = s.isPitchLockTempo;
        } catch (_) {}
    });

    targetAudio.addEventListener('seeked', () => {
        if (targetAudio._isDisposed || targetAudio !== s.audio) return;
        mediaSessionController.updatePositionState(true);
        if (mprisSyncHook) mprisSyncHook(true);
    });
}

// --- Core Track Status & Session Methods ---
function resolveTrackFormat(track) {
    if (!track) return '';
    let fmt = (track.format || '').toUpperCase().trim();
    if (!fmt || fmt === 'AUDIO') {
        const fname = track.filename || track.fullPath || '';
        const dotIdx = fname.lastIndexOf('.');
        if (dotIdx !== -1 && dotIdx < fname.length - 1) {
            fmt = fname.substring(dotIdx + 1).toUpperCase().trim();
        }
    }
    return fmt || 'PCM';
}

function updateSignalPathUi(track = store.state.allTracks[store.state.currentTrackIndex]) {
    const s = store.state;
    if (signalPathLabel) {
        signalPathLabel.textContent = 'SPA';
    }

    const curTheme = getActiveTheme();
    const isMobileViewport = typeof window !== 'undefined' && window.innerWidth <= 768;
    const isLightSurface = (curTheme === 'minimalist-light' || curTheme === 'brutalist-light' || curTheme === 'minimalist-warm' || (curTheme === 'default' && !isMobileViewport));
    const hasTrack = Boolean(track && (s.allTracks.length > 0 || s.isStandalonePlayback));
    const format = hasTrack ? resolveTrackFormat(track) : 'NONE';
    const isLossless = hasTrack && ['FLAC', 'WAV', 'ALAC', 'AIFF', 'APE', 'WV', 'DSD', 'DSF', 'PCM'].includes(format);

    const hasPeq = !s.isPeqBypassed && Array.isArray(s.peqGains) && s.peqGains.some(g => Math.abs(g) > 0.05);
    const maxBoostDb = (!s.isPeqBypassed && Array.isArray(s.peqGains)) ? Math.max(0, ...s.peqGains) : 0;
    const activeStages = [];
    if (s.isSubsonic) activeStages.push('20Hz Subsonic');
    if (hasPeq) activeStages.push('10-Band PEQ');
    if (s.isBassBoost) activeStages.push('Bass');
    if (s.isVocalBoost) activeStages.push('Vocal');
    if (s.isTrebleBoost) activeStages.push('Treble');
    if (s.isAmpBoost || s.currentVolumeValue > 1.0) activeStages.push('Pre-Amp');
    if (s.isCrossfeed) activeStages.push('HRTF Crossfeed');
    if (s.isSurroundWidener) activeStages.push('Surround M/S');
    if (s.isAmbiophonics) activeStages.push('Ambiophonics');
    if (s.isPhaseInvert) activeStages.push('180° Phase');
    if (s.isMonoMix) activeStages.push('Mono Sum');
    if (s.isAgpEnabled) activeStages.push('AGP Guard');
    if (s.isLimiter) activeStages.push('Peak Limiter');
    if (s.isUltrasonic) activeStages.push(`Ultrasonic (${Math.round(s.ultrasonicCutoff / 1000)}kHz)`);
    if (s.isReplayGain) activeStages.push('ReplayGain');

    const dspActive = hasActiveDsp();
    const isNativeBypass = s.mathPrecision === 'native';
    const workletPrecisionStr = isNativeBypass
        ? 'Native Host Bypass'
        : (s.isPrecision64 ? '64-Bit Double-Float Worklet' : '32-Bit Fast-Float Biquad');
    const shortEngineLabel = isNativeBypass
        ? 'NATIVE BYPASS'
        : (s.isPrecision64 ? '64-BIT WORKLET' : '32-BIT FLOAT');

    if (!hasTrack) {
        if (signalPathBadgeBtn) signalPathBadgeBtn.dataset.signalState = 'idle';
        if (auditQualityBadge) {
            auditQualityBadge.textContent = `IDLE (${shortEngineLabel} READY)`;
            auditQualityBadge.className = 'signalQualityBadge highPrecision';
        }
        if (auditQualityDesc) {
            auditQualityDesc.textContent = isNativeBypass
                ? 'No audio track loaded. Native Bypass mode skips worklet DSP math & dithering when EQ/effects are flat, passing decoded Web Audio float frames directly.'
                : `No audio track loaded. Browser Web Audio decodes streams to 32-bit IEEE 754 float; DSP worklet is configured for ${s.isPrecision64 ? '64-bit double-precision' : '32-bit single-precision'} math.`;
        }
        const dotCol = isLightSurface ? '#475569' : '#94a3b8';
        if (deckSignalDot) deckSignalDot.style.color = dotCol;
        if (auditQualityDot) auditQualityDot.style.color = dotCol;
    } else if (isLossless && !hasPeq && !s.isBassBoost && !s.isVocalBoost && !s.isTrebleBoost && !s.isCrossfeed && !s.isSurroundWidener && !s.isAmbiophonics && !s.isPhaseInvert && !s.isMonoMix) {
        if (signalPathBadgeBtn) signalPathBadgeBtn.dataset.signalState = 'bit-perfect';
        if (auditQualityBadge) {
            auditQualityBadge.textContent = `LOSSLESS ${format} → ${shortEngineLabel}`;
            auditQualityBadge.className = 'signalQualityBadge bitPerfect';
        }
        if (auditQualityDesc) {
            auditQualityDesc.textContent = isNativeBypass
                ? `Lossless ${format} decoded by host engine in Native Bypass mode (custom worklet float math & dither bypassed for direct path).`
                : `Lossless ${format} source decoded by Web Audio into 32-bit IEEE 754 float with flat EQ bypass${s.isUltrasonic || s.ditherMode !== 'off' ? ` and ${workletPrecisionStr.toLowerCase()} output conditioning` : ''}.`;
        }
        const dotCol = isLightSurface ? '#059669' : '#10b981';
        if (deckSignalDot) deckSignalDot.style.color = dotCol;
        if (auditQualityDot) auditQualityDot.style.color = dotCol;
    } else if (isLossless) {
        if (signalPathBadgeBtn) signalPathBadgeBtn.dataset.signalState = 'dsp';
        if (auditQualityBadge) {
            auditQualityBadge.textContent = `LOSSLESS ${format} → ${isNativeBypass ? 'NATIVE' : (s.isPrecision64 ? '64-BIT' : '32-BIT')} DSP`;
            auditQualityBadge.className = 'signalQualityBadge dspEnhanced';
        }
        if (auditQualityDesc) {
            auditQualityDesc.textContent = `Lossless ${format} source decoded to 32-bit IEEE 754 float and actively shaped through ${isNativeBypass ? '32-bit host DSP (user EQ/FX active)' : workletPrecisionStr} (${activeStages.join(', ') || 'DSP Active'}).`;
        }
        const dotCol = isLightSurface ? '#b45309' : '#fbbf24';
        if (deckSignalDot) deckSignalDot.style.color = dotCol;
        if (auditQualityDot) auditQualityDot.style.color = dotCol;
    } else {
        if (signalPathBadgeBtn) signalPathBadgeBtn.dataset.signalState = 'lossy';
        if (auditQualityBadge) {
            auditQualityBadge.textContent = `${format} LOSSY → ${dspActive ? (isNativeBypass ? 'NATIVE DSP' : (s.isPrecision64 ? '64-BIT DSP' : '32-BIT DSP')) : (isNativeBypass ? 'NATIVE BYPASS' : '32-BIT DECODE')}`;
            auditQualityBadge.className = 'signalQualityBadge highPrecision';
        }
        if (auditQualityDesc) {
            auditQualityDesc.textContent = `Compressed ${format} stream decoded by browser into 32-bit IEEE 754 floating-point PCM${activeStages.length > 0 ? `, processed via ${workletPrecisionStr} (${activeStages.join(', ')})` : ' with flat EQ response'}.`;
        }
        const dotCol = isLightSurface ? '#0284c7' : '#38bdf8';
        if (deckSignalDot) deckSignalDot.style.color = dotCol;
        if (auditQualityDot) auditQualityDot.style.color = dotCol;
    }

    const stageSourceEl = document.getElementById('auditStageSource');
    const stageDecodeEl = document.getElementById('auditStageDecode');
    const stageDspEl = document.getElementById('auditStageDsp');
    const stageOutputEl = document.getElementById('auditStageOutput');

    const currentRate = s.audioContext ? s.audioContext.sampleRate : ((track && track.sampleRate) ? getValidSampleRate(track.sampleRate) : 44100);
    const rateStr = currentRate >= 1000 ? `${(currentRate / 1000).toFixed(1)} kHz` : `${currentRate} Hz`;

    if (stageSourceEl) {
        if (!hasTrack) {
            stageSourceEl.textContent = 'Idle (No track loaded)';
        } else {
            const bd = track.bitDepth || (isLossless ? ((currentRate >= 88200) ? 24 : 16) : null);
            const br = track.bitrate ? `${track.bitrate} kbps` : '';
            const ch = track.channels === 1 ? 'Mono' : 'Stereo';
            stageSourceEl.textContent = [
                `${format} (${isLossless ? 'Lossless' : 'Lossy'})`,
                bd ? `${bd}-Bit` : '',
                rateStr,
                br,
                ch
            ].filter(Boolean).join(' • ');
        }
    }

    if (stageDecodeEl) {
        stageDecodeEl.textContent = `32-Bit IEEE 754 Float PCM @ ${rateStr}`;
    }

    if (stageDspEl) {
        const stagesText = activeStages.length > 0 ? activeStages.join(' + ') : 'Flat Bypass';
        stageDspEl.textContent = `${workletPrecisionStr} (${stagesText})`;
    }

    const ditherLabel = s.ditherMode === 'shaped'
        ? 'Psychoacoustic Shaped (>18 kHz)'
        : (s.ditherMode === 'tpdf' ? 'TPDF Flat Dither' : 'Unshaped Truncation (Off)');
    const volPct = Math.round(s.currentVolumeValue * 100);
    const gainModeStr = s.isHardwareGain ? `Hardware DAC Bridge (${volPct}%)` : `Digital Gain (${volPct}%)`;

    if (stageOutputEl) {
        stageOutputEl.textContent = `${ditherLabel} • ${gainModeStr}`;
    }

    let maxTotalBoost = maxBoostDb;
    if (s.isBassBoost) maxTotalBoost = Math.max(maxTotalBoost, 3.8);
    if (s.isTrebleBoost) maxTotalBoost = Math.max(maxTotalBoost, 3.0);
    if (s.isVocalBoost) maxTotalBoost = Math.max(maxTotalBoost, 2.8);
    const preampAttenDb = maxTotalBoost > 0 ? -(maxTotalBoost * 0.70) : 0;
    const volDb = s.currentVolumeValue > 0 ? (20 * Math.log10(s.currentVolumeValue)) : -60;
    const netHeadroomDb = Math.max(0, -(preampAttenDb + Math.min(0, volDb)));
    if (auditMetricHeadroom) {
        if (maxTotalBoost > 0) {
            auditMetricHeadroom.textContent = `${preampAttenDb.toFixed(1)} dB Pre-Amp (${netHeadroomDb.toFixed(1)} dB Guard)`;
        } else {
            auditMetricHeadroom.textContent = `+${Math.max(0.6, netHeadroomDb).toFixed(1)} dB (${s.currentVolumeValue > 1.0 ? 'Amplified' : 'Unity Guard'})`;
        }
    }

    let latencyMs = s.bufferLatencyTarget === 'interactive' ? 15.0 : 100.0;
    if (s.audioContext) {
        const ctxLat = ((s.audioContext.baseLatency || 0) + (s.audioContext.outputLatency || 0)) * 1000;
        if (ctxLat > 0) latencyMs = ctxLat;
    }
    const latencyModeStr = s.bufferLatencyTarget === 'interactive' ? 'Low-Latency' : 'Stable Buffer';
    if (auditMetricLatency) {
        auditMetricLatency.textContent = `~${latencyMs.toFixed(1)} ms (${latencyModeStr})`;
    }

    const auditMetricPrecision = document.getElementById('auditMetricPrecision');
    const auditMetricPrecisionDesc = document.getElementById('auditMetricPrecisionDesc');
    if (auditMetricPrecision) {
        auditMetricPrecision.textContent = s.isPrecision64 ? '32-Bit Decode / 64-Bit DSP' : '32-Bit IEEE 754 Float';
    }
    if (auditMetricPrecisionDesc) {
        auditMetricPrecisionDesc.textContent = s.isPrecision64
            ? 'Browser decodes audio to 32-bit float; AudioWorklet computes biquad filters and dithering in 64-bit double float.'
            : 'Browser decodes and processes all audio stages in standard 32-bit single-precision IEEE 754 floating point.';
    }

    const settingsDspEngineVal = document.getElementById('settingsDspEngineVal');
    const settingsDspHeadroomVal = document.getElementById('settingsDspHeadroomVal');
    const settingsDspLatencyVal = document.getElementById('settingsDspLatencyVal');
    const settingsDspEqVal = document.getElementById('settingsDspEqVal');

    if (settingsDspEngineVal) {
        settingsDspEngineVal.textContent = s.isPrecision64 ? '64-Bit Worklet / 32-Bit Decode' : '32-Bit IEEE 754 Float';
    }
    if (settingsDspHeadroomVal) {
        settingsDspHeadroomVal.textContent = maxBoostDb > 0 ? `${preampAttenDb.toFixed(1)} dB AGP Active` : '0.0 dBFS True-Peak';
    }
    if (settingsDspLatencyVal) {
        settingsDspLatencyVal.textContent = `~${latencyMs.toFixed(0)} ms (${latencyModeStr})`;
    }
    if (settingsDspEqVal) {
        settingsDspEqVal.textContent = activeStages.length > 0 ? activeStages.slice(0, 2).join(' + ') : 'Linear Bypass';
    }
}

function findTrackIndexBySavedState(pool) {
    if (!pool || pool.length === 0) return -1;
    const savedTid = safeStorage.getItem('cachymusic_last_track_tid');
    const savedPath = safeStorage.getItem('cachymusic_last_track_path');
    const savedFilename = safeStorage.getItem('cachymusic_last_track_filename');
    const savedId = safeStorage.getItem('cachymusic_last_track_id');
    const savedTitle = safeStorage.getItem('cachymusic_last_track_title');

    if (!savedTid && !savedPath && !savedFilename && !savedId && !savedTitle) return -1;

    let idx = pool.findIndex(t => {
        if (savedTid && t.tid && t.tid.toString() === savedTid.toString()) return true;
        if (savedId && t.id && t.id.toString() === savedId.toString()) return true;
        return false;
    });
    if (idx !== -1) return idx;

    if (savedPath) {
        idx = pool.findIndex(t => t.fullPath && t.fullPath === savedPath);
        if (idx !== -1) return idx;
    }
    if (savedFilename) {
        idx = pool.findIndex(t => t.filename && t.filename.toLowerCase() === savedFilename.toLowerCase());
        if (idx !== -1) return idx;
    }
    if (savedTitle) {
        idx = pool.findIndex(t => t.title && t.title.toLowerCase() === savedTitle.toLowerCase());
        if (idx !== -1) return idx;
    }
    return -1;
}

async function restoreSessionState() {
    const s = store.state;
    const urlParams = new URLSearchParams(window.location.search);
    const reqTrack = urlParams.get('track');

    if (urlParams.get('tab') === 'playlists' || window.location.hash === '#playlists') {
        if (tabPlaylists) tabPlaylists.click();
    }

    const savedPlid = safeStorage.getItem('cachymusic_last_playlist_id');
    const savedPlName = safeStorage.getItem('cachymusic_last_playlist_name');
    if (savedPlid) {
        const matchedPl = s.playlists.find(p => p.plid == savedPlid);
        if (matchedPl && typeof s.openPlaylist === 'function') {
            await s.openPlaylist(matchedPl.plid, matchedPl.name || savedPlName);
        } else {
            try {
                safeStorage.removeItem('cachymusic_last_playlist_id');
                safeStorage.removeItem('cachymusic_last_playlist_name');
            } catch (_) {}
        }
    }

    if (s.allTracks.length === 0) return;

    let targetIdx = 0;
    if (reqTrack !== null && !isNaN(parseInt(reqTrack, 10)) && s.allTracks[parseInt(reqTrack, 10)]) {
        targetIdx = parseInt(reqTrack, 10);
    } else {
        const pool = (s.currentPlaylistId !== null && s.displayedTracks.length > 0) ? s.displayedTracks : s.allTracks;
        const foundPoolIdx = findTrackIndexBySavedState(pool);
        if (foundPoolIdx !== -1) {
            const tr = pool[foundPoolIdx];
            const masterIdx = s.allTracks.findIndex(t => (tr.tid && t.tid == tr.tid) || (tr.fullPath && t.fullPath === tr.fullPath) || (t.id == tr.id));
            targetIdx = masterIdx !== -1 ? masterIdx : 0;
        } else {
            const foundGlobalIdx = findTrackIndexBySavedState(s.allTracks);
            if (foundGlobalIdx !== -1) {
                targetIdx = foundGlobalIdx;
            } else if (s.currentPlaylistId !== null && s.displayedTracks.length > 0) {
                const firstPlTrack = s.displayedTracks[0];
                const masterIdx = s.allTracks.findIndex(t => (firstPlTrack.tid && t.tid == firstPlTrack.tid) || (firstPlTrack.fullPath && t.fullPath === firstPlTrack.fullPath) || (t.id == firstPlTrack.id));
                targetIdx = masterIdx !== -1 ? masterIdx : 0;
            }
        }
    }

    let savedTime = 0;
    try {
        const rawTime = safeStorage.getItem('cachymusic_last_track_time');
        if (rawTime !== null && !isNaN(parseFloat(rawTime))) {
            const parsed = parseFloat(rawTime);
            const targetTrack = s.allTracks[targetIdx];
            const trackDur = (targetTrack && targetTrack.duration) ? Number(targetTrack.duration) : 0;
            if (parsed > 0 && (!trackDur || parsed < (trackDur - 1))) {
                savedTime = parsed;
            }
        }
    } catch (_) {}

    if (s.allTracks[targetIdx]) {
        await loadTrack(targetIdx, false, savedTime);
        if (s.isLyricsView) {
            updateLyricsDisplay(s.allTracks[targetIdx]);
        }
    }
}

function updateDacStatusUi() {
    const s = store.state;
    const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
        ? s.standaloneTrackList[s.standaloneTrackIndex]
        : s.allTracks[s.currentTrackIndex];
    updateSignalPathUi(currentTrack);
    if (!statDacStream) return;
    const currentRate = s.audioContext ? s.audioContext.sampleRate : ((currentTrack && currentTrack.sampleRate) ? getValidSampleRate(currentTrack.sampleRate) : 44100);
    const rateStr = currentRate >= 1000 ? `${(currentRate / 1000).toFixed(1)} kHz` : `${currentRate} Hz`;
    const bd = (currentTrack && currentTrack.bitDepth) || ((currentRate >= 88200) ? 24 : 16);
    const bitStr = `${bd}-BIT`;
    const nyquistKhz = (currentRate / 2000).toFixed(1).replace(/\.0$/, '');

    const curTheme = getActiveTheme();
    const isLightSurface = (curTheme === 'default' || curTheme === 'minimalist-light' || curTheme === 'brutalist-light' || curTheme === 'minimalist-warm');

    if (!hasActiveDsp()) {
        statDacStream.textContent = `BIT-PERFECT DIRECT (${bitStr} • ${rateStr} • ${nyquistKhz}kHz BANDWIDTH)`;
        statDacStream.style.color = isLightSurface ? '#047857' : '#00ff88';
        statDacStream.title = `Direct hardware stream matching ${bitStr} • ${rateStr} (${nyquistKhz} kHz Nyquist bandwidth) with zero downsampling and zero DSP coloration.`;
    } else {
        const activeDsp = [];
        if (s.isAmpBoost) activeDsp.push('AMP');
        if (s.isBassBoost) activeDsp.push('BASS');
        if (s.isVocalBoost) activeDsp.push('VOCAL');
        if (s.isTrebleBoost) activeDsp.push('TREBLE');
        if (s.isLimiter) activeDsp.push('LIMITER');
        const dspStr = activeDsp.length > 0 ? activeDsp.join('+') : 'ACTIVE';
        statDacStream.textContent = `STUDIO DSP (${dspStr} • ${bitStr} • ${rateStr} • ${nyquistKhz}kHz)`;
        statDacStream.style.color = isLightSurface ? '#9a3412' : '#ffaa00';
        statDacStream.title = `Processing through ${s.isPrecision64 ? '64-bit' : '32-bit'} floating-point Web Audio DSP stage at ${rateStr} (${nyquistKhz} kHz bandwidth).`;
    }
}

function updateTrackBadgeUi(track) {
    if (!trackBadge || !track) return;
    const badgeParts = [];
    const fmt = resolveTrackFormat(track);
    if (fmt) badgeParts.push(fmt);
    const bd = track.bitDepth || ((track.sampleRate && track.sampleRate >= 88200) ? 24 : 16);
    if (bd) badgeParts.push(`${bd}-Bit`);
    if (track.sampleRate) {
        badgeParts.push(track.sampleRate >= 1000 ? `${(track.sampleRate / 1000).toFixed(1)} kHz` : `${track.sampleRate} Hz`);
    }
    if (track.bitrate) badgeParts.push(`${track.bitrate} kbps`);
    if (track.channels === 2) badgeParts.push('Stereo');
    else if (track.channels === 1) badgeParts.push('Mono');
    else if (track.channels) badgeParts.push(`${track.channels} ch`);
    trackBadge.textContent = badgeParts.length > 0 ? badgeParts.join(' • ') : 'AUDIO';
}

function updateVolumeIcon(vol) {
    const audio = store.state.audio;
    let pathHtml = '';
    if (vol === 0 || (audio && audio.muted)) {
        pathHtml = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else if (vol < 0.5) {
        pathHtml = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
    } else {
        pathHtml = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }

    if (volumeIcon) volumeIcon.innerHTML = pathHtml;
    const miniVolIcon = document.getElementById('miniVolumeIcon');
    if (miniVolIcon) miniVolIcon.innerHTML = pathHtml;
}

function updateMediaSessionPositionState(force = false) {
    mediaSessionController.updatePositionState(force);
}

function setupMediaSessionActionHandlers() {
    mediaSessionController.init({
        play: () => playAudio(true),
        pause: () => pauseAudio(),
        prev: () => prevTrack(),
        next: () => nextTrack(),
        seekTo: (sec) => seekAudio(sec),
        getDuration: () => {
            const s = store.state;
            if (s.isSoftwareDecoding && s.activeDecodedBuffer) return s.activeDecodedBuffer.duration;
            if (s.audio && s.audio.duration && isFinite(s.audio.duration)) return s.audio.duration;
            const tr = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
                ? s.standaloneTrackList[s.standaloneTrackIndex]
                : s.allTracks[s.currentTrackIndex];
            return (tr && tr.duration) ? Number(tr.duration) : 0;
        },
        getPosition: () => {
            const s = store.state;
            if (s.isSoftwareDecoding) {
                return s.softwarePlaybackOffset + (!s.isSoftwarePaused && s.audioContext ? (s.audioContext.currentTime - s.softwarePlaybackStartTime) : 0);
            }
            return s.audio ? (s.audio.currentTime || 0) : 0;
        },
        getPlaybackRate: () => store.state.currentPlaybackSpeed || 1.0
    });
}

store.subscribe('playback:seek', (e) => {
    const d = e?.detail;
    if (!d || typeof d.time !== 'number') return;
    seekAudio(d.time);
    if (d.play) playAudio(true);
});
store.subscribe('playback:pause', () => pauseAudio());
store.subscribe('ui:sync-signal-path', () => updateSignalPathUi());
store.subscribe('ui:sync-dac-status', () => updateDacStatusUi());
store.subscribe('ui:sync-track-badge', (e) => updateTrackBadgeUi(e?.detail?.track));
store.subscribe('ui:sync-volume-icon', (e) => updateVolumeIcon(e?.detail?.volume ?? store.state.currentVolumeValue));
store.subscribe('audio:attach-listeners', (e) => attachAudioListeners(e?.detail?.audio || store.state.audio));

export {
    activeLoadedMetadataHandler,
    attachAudioListeners,
    cancelSoftwareProgressLoop,
    checkAndPreloadNextTrack,
    currentPlayRequestId,
    currentTrackGeneration,
    executeGaplessHandoff,
    exitStandalonePlayback,
    findTrackIndexBySavedState,
    getValidSampleRate,
    initMprisBridge,
    lastPositionStateUpdate,
    loadStandaloneTrack,
    loadTrack,
    nextTrack,
    onSoftwarePlaybackEnded,
    pauseAudio,
    pauseSoftwarePlayback,
    peekNextTrackIndex,
    playAudio,
    playPendingTimeout,
    playWithSoftwareDecoder,
    prevTrack,
    recomputeMarquees,
    resolveTrackFormat,
    restoreSessionState,
    resumeSoftwarePlayback,
    seekAudio,
    seekSoftwarePlayback,
    setupMediaSessionActionHandlers,
    startSoftwareBufferPlayback,
    startSoftwareProgressLoop,
    stopSoftwarePlayback,
    syncPlayPauseUI,
    togglePlayPause,
    updateDacStatusUi,
    updateMarqueeText,
    updateMediaSessionPositionState,
    updatePlaybackProgress,
    updateRepeatUI,
    updateSignalPathUi,
    updateTrackBadgeUi,
    updateVolumeIcon
};
