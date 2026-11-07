// CachyMusic Workstation Audio Engine v4.0 - Modular Unified Bundle
(function() {
    'use strict';


    // --- Sub-Module: utils.js ---
// CachyMusic - Utilities & Performance Shields

    // Cross-Browser Engine Optimization & Safe Storage Initialization
    const isFirefox = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);
    if (isFirefox && typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.add('is-firefox');
    }

    const _storageMemFallback = {};
    const safeStorage = {
        getItem: function(key) {
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    const v = window.localStorage.getItem(key);
                    if (v !== null) return v;
                }
            } catch (_) {}
            try {
                if (typeof window !== 'undefined' && window.sessionStorage) {
                    const v = window.sessionStorage.getItem(key);
                    if (v !== null) return v;
                }
            } catch (_) {}
            try {
                const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + key + '=([^;]+)'));
                if (match) return decodeURIComponent(match[1]);
            } catch (_) {}
            return _storageMemFallback[key] !== undefined ? _storageMemFallback[key] : null;
        },
        setItem: function(key, val) {
            const str = String(val);
            _storageMemFallback[key] = str;
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.setItem(key, str);
                }
            } catch (_) {}
            try {
                if (typeof window !== 'undefined' && window.sessionStorage) {
                    window.sessionStorage.setItem(key, str);
                }
            } catch (_) {}
            try {
                document.cookie = key + '=' + encodeURIComponent(str) + '; path=/; max-age=31536000; SameSite=Lax';
            } catch (_) {}
        },
        removeItem: function(key) {
            delete _storageMemFallback[key];
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.removeItem(key);
                }
            } catch (_) {}
            try {
                if (typeof window !== 'undefined' && window.sessionStorage) {
                    window.sessionStorage.removeItem(key);
                }
            } catch (_) {}
            try {
                document.cookie = key + '=; path=/; max-age=0; SameSite=Lax';
            } catch (_) {}
        }
    };

    // Universal Cross-Browser 2D Canvas Performance Shield:
    // In Gecko/Firefox, CanvasRenderingContext2D.shadowBlur triggers a synchronous CPU-side
    // Gaussian blur convolution filter, dropping frame rates to 15-20 FPS with 100% core usage.
    // In Chromium and WebKit, heavy shadowBlur (>4px) on large rotating shockwaves and platters
    // creates massive GPU fill-rate stalls and micro-stutters.
    // By clamping shadowBlur to 0 on Firefox and a safe maximum of 3px on Chromium/WebKit,
    // we achieve a flat 60-144 FPS across Chrome, Brave, Firefox, Edge, Safari, and mobile.
    const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || ('ontouchstart' in window && window.innerWidth <= 768);
    if (typeof CanvasRenderingContext2D !== 'undefined') {
        try {
            const origShadowBlurDesc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
            if (origShadowBlurDesc && origShadowBlurDesc.set) {
                let currentShadowBlur = 0;
                Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', {
                    get: function() { return currentShadowBlur; },
                    set: function(val) {
                        const num = Number(val) || 0;
                        currentShadowBlur = (isFirefox || isMobileDevice) ? 0 : Math.min(Math.max(0, num), 3);
                        origShadowBlurDesc.set.call(this, currentShadowBlur);
                    },
                    configurable: true,
                    enumerable: true
                });
            }
        } catch (_) {}
    }



    function formatTime(seconds) {
        if (!seconds || isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hrs > 0) {
            return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function escapeHtml(str) {
        return (str || '').toString().replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    function escapeRegex(str) {
        return (str || '').toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // App Initialization
    window.__cachyMusic = {
        getAudioContext: () => audioContext,
        getAudio: () => audio,
        hasActiveDsp: () => hasActiveDsp(),
        getAllTracks: () => allTracks,
        loadTrack: (idx, autoPlay, initialTime) => loadTrack(idx, autoPlay, initialTime)
    };

    // =========================================================================
    // Linux MPRIS2 D-Bus & Desktop Media Control Bridge
    // =========================================================================

    function formatFileSize(bytes) {
        if (!bytes) return 'N/A';
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
        return (bytes / 1024).toFixed(1) + ' KB';
    }

    // Scan Directory via Server API

    function showToast(message, actionText = null, actionCallback = null, duration = 3500) {
        let container = document.getElementById('cachyToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'cachyToastContainer';
            container.className = 'toastContainer';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'cachyToast';

        const msgSpan = document.createElement('span');
        msgSpan.className = 'toastMsg';
        msgSpan.textContent = message;
        toast.appendChild(msgSpan);

        if (actionText && typeof actionCallback === 'function') {
            const actBtn = document.createElement('button');
            actBtn.type = 'button';
            actBtn.className = 'toastUndoBtn';
            actBtn.textContent = actionText;
            actBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                try { actionCallback(); } catch (err) { console.warn('Toast action error:', err); }
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
                setTimeout(() => toast.remove(), 200);
            });
            toast.appendChild(actBtn);
        }

        container.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
                setTimeout(() => toast.remove(), 200);
            }
        }, duration);
    }

    if (typeof window !== 'undefined') {
        Object.assign(window, {
            isFirefox,
            isMobileDevice,
            safeStorage,
            escapeHtml,
            escapeRegex,
            formatTime,
            formatFileSize,
            showToast
        });
    }




    // --- Sub-Module: state.js ---
// CachyMusic - Centralized Workstation State

const _g = typeof window !== 'undefined' ? window : globalThis;

// State Variables initialized on global window scope
_g.isInitialized = _g.isInitialized ?? false;
_g.allTracks = _g.allTracks ?? [];
_g.displayedTracks = _g.displayedTracks ?? [];
_g.playlists = _g.playlists ?? [];
_g.currentPlaylistId = _g.currentPlaylistId ?? null;
_g.currentPlaylistName = _g.currentPlaylistName ?? '';
_g.currentTrackIndex = _g.currentTrackIndex ?? 0;
_g.isPlaying = _g.isPlaying ?? false;
_g.isShuffle = _g.isShuffle ?? false;
_g.repeatMode = _g.repeatMode ?? (safeStorage.getItem('cachymusic_repeat_mode') || 'all'); // 'off' | 'all' | 'one'

const VALID_SORT_OPTIONS = [
    'default',
    'title-asc',
    'title-desc',
    'artist-asc',
    'artist-desc',
    'album-asc',
    'album-desc',
    'duration-asc',
    'duration-desc',
    'year-desc',
    'year-asc'
];
_g.VALID_SORT_OPTIONS = VALID_SORT_OPTIONS;

_g.currentSort = _g.currentSort ?? 'default';
try {
    const urlSort = new URLSearchParams(window.location.search).get('sort');
    const savedSort = urlSort || safeStorage.getItem('cachymusic_track_sort');
    if (savedSort && VALID_SORT_OPTIONS.includes(savedSort)) {
        _g.currentSort = savedSort;
    }
} catch (_) {}

_g.searchQuery = _g.searchQuery ?? '';
_g.isDraggingScrubber = _g.isDraggingScrubber ?? false;
_g.selectedTrackForPlaylist = _g.selectedTrackForPlaylist ?? null;
_g.isLyricsView = _g.isLyricsView ?? false;
_g.parsedLyrics = _g.parsedLyrics ?? null;
_g.activeLyricIndex = _g.activeLyricIndex ?? -1;

// Visualizer State & Physics
const urlVisParam = new URLSearchParams(window.location.search).get('vis');
let savedMode = urlVisParam || safeStorage.getItem('cachymusic_vis_mode') || 'wave';
if (savedMode === 'badapple') savedMode = 'thematic';
_g.activeVisualizerMode = _g.activeVisualizerMode ?? savedMode; // 'wave' | 'dash' | 'thematic'
_g.audioContext = _g.audioContext ?? null;
_g.analyser = _g.analyser ?? null;
_g.audioSourceNode = _g.audioSourceNode ?? null;

// Universal Web Audio Software Decoder Engine (for 24-bit/32-bit FLAC, ALAC, AIFF & unsupported platform codecs)
_g.isSoftwareDecoding = _g.isSoftwareDecoding ?? false;
_g.isSoftwarePaused = _g.isSoftwarePaused ?? false;
_g.activeDecodedBuffer = _g.activeDecodedBuffer ?? null;
_g.softwareSourceNode = _g.softwareSourceNode ?? null;
_g.softwareSourceGainNode = _g.softwareSourceGainNode ?? null;
_g.softwarePlaybackStartTime = _g.softwarePlaybackStartTime ?? 0;
_g.softwarePlaybackOffset = _g.softwarePlaybackOffset ?? 0;
_g.softwarePlaybackRaf = _g.softwarePlaybackRaf ?? null;
_g.alwaysSoftwareDecodeUrls = _g.alwaysSoftwareDecodeUrls ?? new Set();
_g.animFrameId = _g.animFrameId ?? null;
_g.lastRenderTime = _g.lastRenderTime ?? performance.now();
_g.simPhase = _g.simPhase ?? 0;
_g.isVisualizerLoopRunning = _g.isVisualizerLoopRunning ?? false;
_g.resumeVisualizerLoop = _g.resumeVisualizerLoop ?? function() {};
_g.smoothTurntableFidelity = _g.smoothTurntableFidelity ?? ((_g.activeVisualizerMode === 'thematic' || _g.activeVisualizerMode === 'badapple') ? 1.0 : 0.0);
_g.isStandalonePlayback = _g.isStandalonePlayback ?? false;
_g.standaloneTrackList = _g.standaloneTrackList ?? [];
_g.standaloneTrackIndex = _g.standaloneTrackIndex ?? 0;

// Audio DSP States (persisted in localStorage, bypass by default for pure native playback)
_g.isAmpBoost = _g.isAmpBoost ?? (safeStorage.getItem('cachymusic_amp_boost') === 'true');
_g.isBassBoost = _g.isBassBoost ?? (safeStorage.getItem('cachymusic_bass_boost') === 'true');
_g.isVocalBoost = _g.isVocalBoost ?? (safeStorage.getItem('cachymusic_vocal_boost') === 'true');
_g.isTrebleBoost = _g.isTrebleBoost ?? (safeStorage.getItem('cachymusic_treble_boost') === 'true');
_g.isLimiter = _g.isLimiter ?? (safeStorage.getItem('cachymusic_limiter') === 'true');
_g.isReplayGain = _g.isReplayGain ?? (safeStorage.getItem('cachymusic_replaygain') !== 'false');
_g.isCrossfeed = _g.isCrossfeed ?? (safeStorage.getItem('cachymusic_crossfeed') === 'true');
_g.isSubsonic = _g.isSubsonic ?? (safeStorage.getItem('cachymusic_subsonic') !== 'false');
let initVol = parseFloat(safeStorage.getItem('cachymusic_volume') || '0.8');
if (isNaN(initVol)) initVol = 0.8;
_g.currentVolumeValue = _g.currentVolumeValue ?? initVol;

// Neutron HiFi™ Audio Engine & Output Configuration
_g.isPrecision64 = _g.isPrecision64 ?? (safeStorage.getItem('cachymusic_precision_64') !== null
    ? safeStorage.getItem('cachymusic_precision_64') === 'true'
    : safeStorage.getItem('cachymusic_engine_precision') !== '32');
_g.isAgpEnabled = _g.isAgpEnabled ?? (safeStorage.getItem('cachymusic_agp') !== 'false');
_g.isSurroundWidener = _g.isSurroundWidener ?? (safeStorage.getItem('cachymusic_surround_ms') === 'true');
_g.isPhaseInvert = _g.isPhaseInvert ?? (safeStorage.getItem('cachymusic_phase_invert') === 'true');
_g.isMonoMix = _g.isMonoMix ?? (safeStorage.getItem('cachymusic_mono_mix') === 'true');
let initBalance = parseFloat(safeStorage.getItem('cachymusic_stereo_balance') || '0');
if (isNaN(initBalance)) initBalance = 0;
_g.stereoBalance = _g.stereoBalance ?? initBalance;
_g.isPitchLockTempo = _g.isPitchLockTempo ?? (safeStorage.getItem('cachymusic_pitch_lock') === 'true');
_g.currentPlaybackSpeed = _g.currentPlaybackSpeed ?? 1.0;
_g.isHardwareGain = _g.isHardwareGain ?? (safeStorage.getItem('cachymusic_hardware_gain') === 'true' || safeStorage.getItem('cachymusic_hw_gain') === 'true');
_g.isUltrasonic = _g.isUltrasonic ?? (safeStorage.getItem('cachymusic_ultrasonic') !== 'false');
_g.ultrasonicCutoff = _g.ultrasonicCutoff ?? parseInt(safeStorage.getItem('cachymusic_ultrasonic_cutoff') || '32000', 10);
_g.ditherMode = _g.ditherMode ?? (safeStorage.getItem('cachymusic_dither_mode') || 'shaped');
_g.isAmbiophonics = _g.isAmbiophonics ?? (safeStorage.getItem('cachymusic_ambiophonics') === 'true');
_g.bufferLatencyTarget = _g.bufferLatencyTarget ?? (safeStorage.getItem('cachymusic_buffer_latency') || 'playback');
_g.isPeqBypassed = _g.isPeqBypassed ?? (safeStorage.getItem('cachymusic_peq_bypassed') === 'true');
_g.dspWorkletNode = _g.dspWorkletNode ?? null;
_g.hwVolumeBackend = _g.hwVolumeBackend ?? 'none';

// 10-Band Parametric Equalizer (ISO standard 1-octave frequencies from 31 Hz to 16 kHz)
const PEQ_FREQS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const PEQ_Q_STEPS = [0.71, 1.0, 1.41, 2.2, 3.5];
_g.PEQ_FREQS = PEQ_FREQS;
_g.PEQ_Q_STEPS = PEQ_Q_STEPS;
_g.peqGains = _g.peqGains ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
_g.peqQs = _g.peqQs ?? [1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41];
try {
    const savedPeq = JSON.parse(safeStorage.getItem('cachymusic_peq_gains') || '[]');
    if (Array.isArray(savedPeq) && savedPeq.length === 10) {
        _g.peqGains = savedPeq.map(v => typeof v === 'number' && !isNaN(v) ? Math.max(-15, Math.min(15, v)) : 0);
    }
    const savedQs = JSON.parse(safeStorage.getItem('cachymusic_peq_qs') || '[]');
    if (Array.isArray(savedQs) && savedQs.length === 10) {
        _g.peqQs = savedQs.map(v => typeof v === 'number' && !isNaN(v) ? Math.max(0.4, Math.min(8.0, v)) : 1.41);
    }
} catch (_) {}
_g.peqNodes = _g.peqNodes ?? [];

// Dual-Buffer Gapless Playback Engine
_g.secondaryAudio = _g.secondaryAudio ?? null;
_g.preloadedNextTrackIndex = _g.preloadedNextTrackIndex ?? -1;
_g.isGaplessTransitioning = _g.isGaplessTransitioning ?? false;

function hasActiveDsp() {
    const hasPeq = !_g.isPeqBypassed && _g.peqGains.some(g => g !== 0);
    const hasWorkletDsp = _g.isUltrasonic || (_g.ditherMode !== 'off') || _g.isAmbiophonics || _g.isSurroundWidener || _g.isPhaseInvert || _g.isMonoMix || (Math.abs(_g.stereoBalance) > 0.005);
    return _g.isAmpBoost || _g.isBassBoost || _g.isVocalBoost || _g.isTrebleBoost || _g.isLimiter || _g.isCrossfeed || _g.isSubsonic || hasPeq || hasWorkletDsp || (_g.currentVolumeValue > 1.0);
}
_g.hasActiveDsp = hasActiveDsp;

// Web Audio BiquadFilter DSP, ReplayGain, PEQ, Amplification, Crossfeed & Limiter nodes
_g.subsonicFilter = _g.subsonicFilter ?? null;
_g.preAmpGainNode = _g.preAmpGainNode ?? null;
_g.xfeedNetwork = _g.xfeedNetwork ?? null;
_g.replayGainNode = _g.replayGainNode ?? null;
_g.bassFilter = _g.bassFilter ?? null;
_g.vocalFilter = _g.vocalFilter ?? null;
_g.trebleFilter = _g.trebleFilter ?? null;
_g.ampGainNode = _g.ampGainNode ?? null;
_g.ampSoftClipper = _g.ampSoftClipper ?? null;
_g.dspLimiter = _g.dspLimiter ?? null;
_g.ceilingTrimGain = _g.ceilingTrimGain ?? null;

// 60-band perceptual logarithmic frequency array & smoothing physics
const NUM_BANDS = 60;
_g.NUM_BANDS = NUM_BANDS;
_g.smoothBands = _g.smoothBands ?? new Float32Array(NUM_BANDS);
_g.smoothBass = _g.smoothBass ?? 0;
_g.smoothTreble = _g.smoothTreble ?? 0;

// Dash mode peak caps physics & smooth column interpolation
_g.peakValues = _g.peakValues ?? new Float32Array(NUM_BANDS);
_g.peakVelocity = _g.peakVelocity ?? new Float32Array(NUM_BANDS);
_g.peakHold = _g.peakHold ?? new Int32Array(NUM_BANDS);
_g.smoothDashLevels = _g.smoothDashLevels ?? new Float32Array(NUM_BANDS);

// Thematic Wave continuous angle integration & smoothed pulse
_g.yinYangAngle = _g.yinYangAngle ?? 0;
_g.runeRingAngle = _g.runeRingAngle ?? 0;
_g.atlasRotationAngle = _g.atlasRotationAngle ?? 0;
_g.atlasPrecessionAngle = _g.atlasPrecessionAngle ?? 0;
_g.smoothHeartPulse = _g.smoothHeartPulse ?? 1.0;

// Turntable center expanding acoustic shockwave ripples
_g.turntableShockwaves = _g.turntableShockwaves ?? [];
function emitTurntableShockwave(x, y, minRadius, maxRadius, initialAlpha = 0.65, color = '#ff1744') {
    if (_g.turntableShockwaves.length >= 10) _g.turntableShockwaves.shift();
    _g.turntableShockwaves.push({
        x,
        y,
        r: minRadius,
        minR: minRadius,
        maxR: maxRadius,
        alpha: initialAlpha,
        color: color,
        speed: (maxRadius - minRadius) * 2.4
    });
}
_g.emitTurntableShockwave = emitTurntableShockwave;

// Bad Apple / Wave floating particles
_g.particles = _g.particles ?? [];
const MAX_PARTICLES = 36;
_g.MAX_PARTICLES = MAX_PARTICLES;
if (_g.particles.length === 0) {
    for (let p = 0; p < MAX_PARTICLES; p++) {
        _g.particles.push({
            x: Math.random(),
            y: Math.random(),
            vx: (Math.random() - 0.5) * 0.08,
            vy: -0.05 - Math.random() * 0.15,
            size: 1.5 + Math.random() * 2.5,
            alpha: 0.1 + Math.random() * 0.5,
            rot: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.04
        });
    }
}



    // --- Sub-Module: ui-elements.js ---
// CachyMusic - UI Elements & Workspace Shell
    // DOM Elements - Player & Audio
    let audio = document.getElementById('audioPlayer');
    if (audio) audio.crossOrigin = 'anonymous';

    const vinylTurntable = document.getElementById('vinylTurntable');
    const toneArm = document.getElementById('toneArm');
    const vinylArt = document.getElementById('vinylArt');
    const vinylLabel = document.getElementById('vinylLabel');
    const deckArtworkBackdrop = document.getElementById('deckArtworkBackdrop');
    const deckArtworkAmbient = document.getElementById('deckArtworkAmbient');
    const turntableCenterVis = document.getElementById('turntableCenterVis');
    const turntableCenterCanvas = document.getElementById('turntableCenterCanvas');
    const turntableCenterCtx = turntableCenterCanvas ? turntableCenterCanvas.getContext('2d') : null;
    const bgDisc = document.querySelector('.bgDisc');
    const visualizerDock = document.getElementById('visualizerDock');
    const visualizerCanvas = document.getElementById('visualizerCanvas');
    const ctx = visualizerCanvas ? visualizerCanvas.getContext('2d') : null;
    const playerDeckEl = document.querySelector('.playerDeck');
    const trackListPanelEl = document.querySelector('.trackListPanel');
    const settingsPanelEl = document.querySelector('.settingsPanel');
    const infoPanelEl = document.getElementById('infoPanel');
    const cachedMobileTabBtns = Array.from(document.querySelectorAll('.mobileTabBtn'));
    const cachedAllPanelsList = [playerDeckEl, trackListPanelEl, settingsPanelEl].filter(Boolean);

    function setMobileTabActive(targetId) {
        for (let i = 0; i < cachedMobileTabBtns.length; i++) {
            const b = cachedMobileTabBtns[i];
            b.classList.toggle('active', b.dataset.target === targetId);
        }
    }

    function setMobilePanelsInactive() {
        for (let i = 0; i < cachedAllPanelsList.length; i++) {
            cachedAllPanelsList[i].classList.remove('mobileActive');
        }
    }

    function bindFastAction(el, action) {
        if (!el) return;
        let lastActionTime = 0;
        const handler = (e) => {
            if (e.type === 'pointerdown' && e.pointerType === 'mouse' && e.button !== 0) return;
            const now = performance.now();
            if (now - lastActionTime < 320) return;
            lastActionTime = now;
            action(e);
        };
        el.addEventListener('pointerdown', handler, { passive: true });
        el.addEventListener('click', (e) => {
            e.preventDefault();
            handler(e);
        });
    }

    // DOM Elements - Deck Actions (Metadata Inspector & Lyrics Toggles)
    const metadataToggleBtn = document.getElementById('metadataToggleBtn');
    const lyricsToggleBtn = document.getElementById('lyricsToggleBtn');
    const lyricsCon = document.getElementById('lyricsCon');
    const turntableCon = document.getElementById('turntableCon');
    const lyricsTrackName = document.getElementById('lyricsTrackName');
    const lyricsArtistName = document.getElementById('lyricsArtistName');
    const lyricsContent = document.getElementById('lyricsContent');
    const lyricsScrollArea = document.getElementById('lyricsScrollArea');

    const trackName = document.getElementById('trackName');
    const artistName = document.getElementById('artistName');
    const albumName = document.getElementById('albumName');
    const trackBadge = document.getElementById('trackBadge');
    const currentTimeEl = document.getElementById('currentTime');
    const totalDurationEl = document.getElementById('totalDuration');
    const progressCon = document.getElementById('progressCon');
    const progressBar = document.getElementById('progressBar');
    const progressHover = document.getElementById('progressHover');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playPauseImg = document.getElementById('playPauseImg');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const shufflePlayBtn = document.getElementById('shufflePlayBtn');
    const repeatBtn = document.getElementById('repeatBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const muteBtn = document.getElementById('muteBtn');
    const volumeLevel = document.getElementById('volumeLevel');
    const volumeIcon = document.getElementById('volumeIcon');
    const speedBtns = document.querySelectorAll('.speedBtn');

    // DOM Elements - Library, Playlists & Up Next Queue
    const tabLibrary = document.getElementById('tabLibrary');
    const tabPlaylists = document.getElementById('tabPlaylists');
    const tabQueue = document.getElementById('tabQueue');
    const queueView = document.getElementById('queueView');
    const queueList = document.getElementById('queueList');
    const upcomingLibraryList = document.getElementById('upcomingLibraryList');
    const queueCountBadge = document.getElementById('queueCountBadge');
    const queueCountSummary = document.getElementById('queueCountSummary');
    const clearQueueBtn = document.getElementById('clearQueueBtn');
    let playQueue = [];
    let currentFormatFilter = 'all';

    // DOM Elements - Audiophile Sleep Timer
    const sleepTimerBtn = document.getElementById('sleepTimerBtn');
    const sleepTimerLabel = document.getElementById('sleepTimerLabel');
    const sleepTimerModal = document.getElementById('sleepTimerModal');
    const closeSleepTimerModalBtn = document.getElementById('closeSleepTimerModalBtn');
    const sleepStatusCard = document.getElementById('sleepStatusCard');
    const sleepStatusRemaining = document.getElementById('sleepStatusRemaining');
    const cancelSleepTimerBtn = document.getElementById('cancelSleepTimerBtn');
    const customSleepInput = document.getElementById('customSleepInput');
    const setCustomSleepBtn = document.getElementById('setCustomSleepBtn');
    let sleepTimerInterval = null;
    let sleepTimerRemainingSec = 0;
    let sleepTimerMode = null;
    let sleepTimerOriginalVolume = null;

    // DOM Elements - Signal Path Inspector & Audio Audit
    const signalPathBadgeBtn = document.getElementById('signalPathBadgeBtn');
    const signalPathLabel = document.getElementById('signalPathLabel');
    const deckSignalDot = document.getElementById('deckSignalDot');
    const openSignalAuditBtn = document.getElementById('openSignalAuditBtn');
    const signalPathModal = document.getElementById('signalPathModal');
    const closeSignalPathModalBtn = document.getElementById('closeSignalPathModalBtn');
    const auditQualityDot = document.getElementById('auditQualityDot');
    const auditQualityBadge = document.getElementById('auditQualityBadge');
    const auditQualityDesc = document.getElementById('auditQualityDesc');
    const auditMetricHeadroom = document.getElementById('auditMetricHeadroom');
    const auditMetricLatency = document.getElementById('auditMetricLatency');
    const statDynamicRange = document.getElementById('statDynamicRange');
    const statPeakLevel = document.getElementById('statPeakLevel');

    let openPeqModal = null;
    let closePeqModal = null;

    const libraryControls = document.getElementById('libraryControls');
    const playlistBanner = document.getElementById('playlistBanner');
    const currentPlaylistTitle = document.getElementById('currentPlaylistTitle');
    const backToLibraryBtn = document.getElementById('backToLibraryBtn');
    const deleteCurrentPlaylistBtn = document.getElementById('deleteCurrentPlaylistBtn');
    const standaloneBanner = document.getElementById('standaloneBanner');
    const standaloneBannerTitle = document.getElementById('standaloneBannerTitle');
    const standaloneResumeLibraryBtn = document.getElementById('standaloneResumeLibraryBtn');
    const standaloneCloseBtn = document.getElementById('standaloneCloseBtn');
    const trackList = document.getElementById('trackList');
    const playlistsView = document.getElementById('playlistsView');
    const playlistList = document.getElementById('playlistList');
    const newPlaylistInput = document.getElementById('newPlaylistInput');
    const createPlaylistBtn = document.getElementById('createPlaylistBtn');
    const trackCount = document.getElementById('trackCount');
    const activeListLabel = document.getElementById('activeListLabel');
    const trackSearch = document.getElementById('trackSearch');
    const sortSelect = document.getElementById('sortSelect');
    const refreshTracksBtn = document.getElementById('refreshTracksBtn');
    const restoreTracksBtn = document.getElementById('restoreTracksBtn');
    const quickNewPlaylistBtn = document.getElementById('quickNewPlaylistBtn');
    const bannerAddTracksBtn = document.getElementById('bannerAddTracksBtn');
    const localFileInput = document.getElementById('localFileInput');
    const dismissedTracksMap = new Map();

    // DOM Elements - Folder Tray
    const toggleFolderBtn = document.getElementById('toggleFolderBtn');
    const folderTray = document.getElementById('folderTray');
    const closeFolderTrayBtn = document.getElementById('closeFolderTrayBtn');
    const folderPathInput = document.getElementById('folderPathInput');
    const scanFolderBtn = document.getElementById('scanFolderBtn');
    const browseFolderBtn = document.getElementById('browseFolderBtn');
    const folderPickerInput = document.getElementById('folderPickerInput');
    const presetPathBtns = document.querySelectorAll('.presetPathBtn');
    const scanStatus = document.getElementById('scanStatus');

    // DOM Elements - Metadata Inspector
    const coverArtPreview = document.getElementById('coverArtPreview');
    const coverBadge = document.getElementById('coverBadge');
    const statTitle = document.getElementById('statTitle');
    const statArtist = document.getElementById('statArtist');
    const statAlbum = document.getElementById('statAlbum');
    const statGenre = document.getElementById('statGenre');
    const statYear = document.getElementById('statYear');
    const statTrack = document.getElementById('statTrack');
    const statBitrate = document.getElementById('statBitrate');
    const statSampleRate = document.getElementById('statSampleRate');
    const statChannels = document.getElementById('statChannels');
    const statFormat = document.getElementById('statFormat');
    const statSize = document.getElementById('statSize');
    const statPath = document.getElementById('statPath');
    const statBitDepth = document.getElementById('statBitDepth');
    const statDacStream = document.getElementById('statDacStream');

    // DOM Elements - Playlist Modal
    const playlistModal = document.getElementById('playlistModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalTrackTitle = document.getElementById('modalTrackTitle');
    const modalPlaylistList = document.getElementById('modalPlaylistList');
    const modalNewPlaylistName = document.getElementById('modalNewPlaylistName');
    const modalCreateAndAddBtn = document.getElementById('modalCreateAndAddBtn');

    // DOM Elements - Metadata & ID3 Tag Editor Modal
    const metadataEditorModal = document.getElementById('metadataEditorModal');
    const closeMetaEditorModalBtn = document.getElementById('closeMetaEditorModalBtn');
    const metaEditCancelBtn = document.getElementById('metaEditCancelBtn');
    const metaEditorForm = document.getElementById('metaEditorForm');
    const metaEditSaveBtn = document.getElementById('metaEditSaveBtn');
    const metaEditTitle = document.getElementById('metaEditTitle');
    const metaEditArtist = document.getElementById('metaEditArtist');
    const metaEditAlbum = document.getElementById('metaEditAlbum');
    const metaEditGenre = document.getElementById('metaEditGenre');
    const metaEditYear = document.getElementById('metaEditYear');
    const metaEditTrackNum = document.getElementById('metaEditTrackNum');
    const metaEditComment = document.getElementById('metaEditComment');
    const metaEditorThumb = document.getElementById('metaEditorThumb');
    const metaEditorFileTitle = document.getElementById('metaEditorFileTitle');
    const metaEditorFilePath = document.getElementById('metaEditorFilePath');
    const metaEditorStatus = document.getElementById('metaEditorStatus');
    const metaEditorFormatPill = document.getElementById('metaEditorFormatPill');
    const metaEditorBitratePill = document.getElementById('metaEditorBitratePill');
    const metaEditorSampleRatePill = document.getElementById('metaEditorSampleRatePill');
    const metaEditorBitDepthPill = document.getElementById('metaEditorBitDepthPill');
    const infoPanelEditMetaBtn = document.getElementById('infoPanelEditMetaBtn');
    const trackMenuEditMetaBtn = document.getElementById('trackMenuEditMetaBtn');

    // DOM Elements - Theme Overhaul
    const validThemeIds = [
        'default', 'nms', 'solar-eclipse', 'euclid-horizon', 'alien-paradise',
        'abyssal-void', 'dissonance', 'sentinel',
        'minimalist-light', 'minimalist-dark', 'minimalist-warm', 'minimalist-obsidian',
        'brutalist-light', 'brutalist-dark'
    ];
    let activeTheme = safeStorage.getItem('cachymusic_active_theme') || (document.documentElement && document.documentElement.getAttribute('data-theme')) || 'default';
    if (activeTheme === 'brutalist-minimalism-light' || activeTheme === 'brutalist-light') activeTheme = 'minimalist-light';
    if (activeTheme === 'brutalist-minimalism-dark' || activeTheme === 'brutalist-dark') activeTheme = 'minimalist-dark';
    if (!validThemeIds.includes(activeTheme)) {
        activeTheme = (activeTheme === 'atlas' || activeTheme === 'spotify' || activeTheme === 'apple') ? 'nms' : 'default';
    }
    function getActiveTheme() {
        if (typeof document !== 'undefined' && document.documentElement) {
            const dt = document.documentElement.getAttribute('data-theme');
            if (dt) return dt;
        }
        if (typeof window !== 'undefined' && window.activeTheme) {
            return window.activeTheme;
        }
        return activeTheme || (typeof safeStorage !== 'undefined' ? safeStorage.getItem('cachymusic_active_theme') : null) || 'default';
    }
    function isAtlasThemeActive() {
        return getActiveTheme() === 'nms';
    }
    const themeModal = document.getElementById('themeModal');
    const themeModalBtn = document.getElementById('themeModalBtn');
    const closeThemeModalBtn = document.getElementById('closeThemeModalBtn');
    const topThemeLabel = document.getElementById('topThemeLabel');
    const themeSelectCards = document.querySelectorAll('.themeSelectCard');
    const themeQuickBtns = document.querySelectorAll('.themeQuickBtn');

    // Visualizer Controls
    const visPillBtns = document.querySelectorAll('.visPillBtn');
    const visModeBtns = document.querySelectorAll('.visModeBtn');

    // Workspace Switcher, Soulseek Studio, Download Hub & Settings Workspace Elements
    let currentWorkspace = 'player'; // 'player' | 'soulseek' | 'download' | 'settings'
    const wsPlayerBtn = document.getElementById('wsPlayerBtn');
    const wsSoulseekBtn = document.getElementById('wsSoulseekBtn');
    const wsSoulseekBadge = document.getElementById('wsSoulseekBadge');
    const wsDownloadBtn = document.getElementById('wsDownloadBtn');
    const wsSettingsBtn = document.getElementById('wsSettingsBtn');
    const topSettingsBtn = document.getElementById('topSettingsBtn');
    const installAppBtn = document.getElementById('installAppBtn');
    const gridContainer = document.querySelector('.gridContainer');
    const soulseekWorkspace = document.getElementById('soulseekWorkspace');
    const downloadWorkspace = document.getElementById('downloadWorkspace');
    const settingsWorkspace = document.getElementById('settingsWorkspace');
    const settingsReturnBtn = document.getElementById('settingsReturnBtn');
    const persistentMiniPlayer = document.getElementById('persistentMiniPlayer');
    let deferredInstallPrompt = null;

    // Persistent Mini-Player Elements
    const miniArtPreview = document.getElementById('miniArtPreview');
    const miniTurntableThumb = document.getElementById('miniTurntableThumb');
    const miniTitle = document.getElementById('miniTitle');
    const miniArtist = document.getElementById('miniArtist');
    const miniPrevBtn = document.getElementById('miniPrevBtn');
    const miniPlayBtn = document.getElementById('miniPlayBtn');
    const miniPlayImg = document.getElementById('miniPlayImg');
    const miniNextBtn = document.getElementById('miniNextBtn');
    const miniCurrentTime = document.getElementById('miniCurrentTime');
    const miniTotalDuration = document.getElementById('miniTotalDuration');
    const miniProgressCon = document.getElementById('miniProgressCon');
    const miniProgressBar = document.getElementById('miniProgressBar');
    const miniVolumeSlider = document.getElementById('miniVolumeSlider');
    const miniMuteBtn = document.getElementById('miniMuteBtn');
    const miniDeckReturnBtn = document.getElementById('miniDeckReturnBtn');

    // Soulseek Elements
    const slskStatusPill = document.getElementById('slskStatusPill');
    const slskStatusDot = document.getElementById('slskStatusDot');
    const slskStatusText = document.getElementById('slskStatusText');
    const slskUsername = document.getElementById('slskUsername');
    const slskStartDaemonBtn = document.getElementById('slskStartDaemonBtn');
    const slskChangeDirBtn = document.getElementById('slskChangeDirBtn');
    const slskDownloadsPathText = document.getElementById('slskDownloadsPathText');
    const slskChangeSharedDirBtn = document.getElementById('slskChangeSharedDirBtn');
    const slskSharedPathText = document.getElementById('slskSharedPathText');
    const slskSyncCurrentDirBtn = document.getElementById('slskSyncCurrentDirBtn');
    const slskPowerBtn = document.getElementById('slskPowerBtn');
    const slskPowerBtnText = document.getElementById('slskPowerBtnText');
    const slskAccountBtn = document.getElementById('slskAccountBtn');
    const slskAccountModal = document.getElementById('slskAccountModal');
    const slskCloseAccountModalBtn = document.getElementById('slskCloseAccountModalBtn');
    const slskModalPowerBtn = document.getElementById('slskModalPowerBtn');
    const slskModalUsername = document.getElementById('slskModalUsername');
    const slskModalPassword = document.getElementById('slskModalPassword');
    const slskModalDownloadDir = document.getElementById('slskModalDownloadDir');
    const slskModalSyncPlayerDirBtn = document.getElementById('slskModalSyncPlayerDirBtn');
    const slskModalSharedDir = document.getElementById('slskModalSharedDir');
    const slskModalSyncSharePlayerDirBtn = document.getElementById('slskModalSyncSharePlayerDirBtn');
    const slskAccountAlert = document.getElementById('slskAccountAlert');
    const slskSaveAccountBtn = document.getElementById('slskSaveAccountBtn');
    const slskLogoutBtn = document.getElementById('slskLogoutBtn');
    const slskRefreshStatusBtn = document.getElementById('slskRefreshStatusBtn');
    const slskToggleTransfersBtn = document.getElementById('slskToggleTransfersBtn');
    const slskTransferCount = document.getElementById('slskTransferCount');
    const slskSearchInput = document.getElementById('slskSearchInput');
    const slskSearchClearBtn = document.getElementById('slskSearchClearBtn');
    const slskSearchSubmitBtn = document.getElementById('slskSearchSubmitBtn');
    const slskFilterChips = document.querySelectorAll('.slskChip');
    const slskIncludeFilterInput = document.getElementById('slskIncludeFilterInput');
    const slskIncludeFilterClearBtn = document.getElementById('slskIncludeFilterClearBtn');
    const slskExcludeFilterInput = document.getElementById('slskExcludeFilterInput');
    const slskExcludeFilterClearBtn = document.getElementById('slskExcludeFilterClearBtn');
    const slskInResultFilterInput = slskIncludeFilterInput || document.getElementById('slskInResultFilterInput');
    const slskInResultFilterClearBtn = slskIncludeFilterClearBtn || document.getElementById('slskInResultFilterClearBtn');
    const slskSuggestedRow = document.getElementById('slskSuggestedRow');
    const slskSuggestedChips = document.getElementById('slskSuggestedChips');
    const slskClearSubFilterBtn = document.getElementById('slskClearSubFilterBtn');
    const slskSortSelect = document.getElementById('slskSortSelect');
    const slskResultsList = document.getElementById('slskResultsList');
    const slskPlaceholder = document.getElementById('slskPlaceholder');
    const slskSearchingState = document.getElementById('slskSearchingState');
    const slskSearchingTitle = document.getElementById('slskSearchingTitle');
    const slskResultCount = document.getElementById('slskResultCount');
    const slskActiveSearchMeta = document.getElementById('slskActiveSearchMeta');
    const slskTransfersDrawer = document.getElementById('slskTransfersDrawer');
    const slskTransfersHeader = document.getElementById('slskTransfersHeader');
    const slskTransfersSummary = document.getElementById('slskTransfersSummary');
    const slskTransfersList = document.getElementById('slskTransfersList');
    const slskCloseDrawerBtn = document.getElementById('slskCloseDrawerBtn');
    const slskScanDownloadsBtn = document.getElementById('slskScanDownloadsBtn');
    const slskControlsPanel = document.getElementById('slskControlsPanel');
    const slskPanelToggleBar = document.getElementById('slskPanelToggleBar');
    const slskPanelToggleChevron = document.getElementById('slskPanelToggleChevron');
    const slskMobileActiveFilter = document.getElementById('slskMobileActiveFilter');
    const slskMobileTransfersBtn = document.getElementById('slskMobileTransfersBtn');
    const slskMobileTransferCount = document.getElementById('slskMobileTransferCount');

    function setMobileSearchPanelCollapsed(collapsed) {
        if (!slskControlsPanel) return;
        if (collapsed) {
            slskControlsPanel.classList.add('is-collapsed');
        } else {
            slskControlsPanel.classList.remove('is-collapsed');
        }
    }

    function toggleMobileSearchPanel() {
        if (!slskControlsPanel) return;
        const isCollapsed = slskControlsPanel.classList.contains('is-collapsed');
        setMobileSearchPanelCollapsed(!isCollapsed);
    }

    let lastRenderedMiniTrack = null;
    function updateMiniPlayerInfo(track) {
        if (!track) return;
        if (lastRenderedMiniTrack === track) return;
        lastRenderedMiniTrack = track;
        if (miniTitle) miniTitle.textContent = track.title || track.filename || 'Unknown Track';
        if (miniArtist) miniArtist.textContent = track.artist || 'Unknown Artist';
        if (miniArtPreview) {
            miniArtPreview.onerror = () => { miniArtPreview.onerror = null; miniArtPreview.src = 'resources/images/default.svg'; };
            miniArtPreview.src = track.cover || 'resources/images/default.svg';
        }
        if (miniTotalDuration) miniTotalDuration.textContent = formatTime(track.duration || 0);
    }

    function updateMiniPlayerPlayState(playing) {
        // Icon toggled via CSS .playing class (instant, no image load)
        if (miniPlayBtn) {
            miniPlayBtn.classList.toggle('playing', playing);
        }
        if (miniTurntableThumb) {
            miniTurntableThumb.classList.toggle('playing', playing);
        }
    }

    function syncSettingsTabValues() {
        const settingsTabFolderPathInput = document.getElementById('settingsTabFolderPathInput');
        if (settingsTabFolderPathInput) {
            const currentPath = (folderPathInput && folderPathInput.value) || safeStorage.getItem('cachymusic_last_directory') || '';
            if (currentPath) settingsTabFolderPathInput.value = currentPath;
        }

        const settingsTabScanStatus = document.getElementById('settingsTabScanStatus');
        if (settingsTabScanStatus) {
            if (allTracks && allTracks.length > 0) {
                settingsTabScanStatus.textContent = `● ${allTracks.length} tracks currently loaded in library.`;
                settingsTabScanStatus.style.color = 'var(--accent-color, #00f0ff)';
            } else {
                settingsTabScanStatus.textContent = '● Ready to scan local music library.';
                settingsTabScanStatus.style.color = 'var(--text-secondary, #888888)';
            }
        }

        const settingsTabCurrentThemeBadge = document.getElementById('settingsTabCurrentThemeBadge');
        if (settingsTabCurrentThemeBadge && typeof activeTheme !== 'undefined') {
            const labels = {
                default: 'DEFAULT STUDIO HI-FI',
                nms: 'THE ATLAS',
                'solar-eclipse': 'PLANETARY WARP',
                'euclid-horizon': 'SPACE STATION',
                'alien-paradise': 'ALIEN PARADISE',
                'abyssal-void': 'EMERIL DRIVE',
                dissonance: 'DISSONANCE',
                sentinel: 'SENTINEL',
                'minimalist-light': 'MINIMALIST (LIGHT)',
                'minimalist-dark': 'MINIMALIST (DARK)',
                'minimalist-warm': 'MINIMALIST (WARM PAPER)',
                'minimalist-obsidian': 'MINIMALIST (OBSIDIAN OLED)',
                'brutalist-light': 'MINIMALIST (LIGHT)',
                'brutalist-dark': 'MINIMALIST (DARK)'
            };
            settingsTabCurrentThemeBadge.textContent = labels[activeTheme] || activeTheme.toUpperCase();
        }

        const settingsTabSleepStatusBadge = document.getElementById('settingsTabSleepStatusBadge');
        if (settingsTabSleepStatusBadge) {
            if (sleepTimerMode === 'end') {
                settingsTabSleepStatusBadge.textContent = 'PAUSE AT END OF TRACK';
                settingsTabSleepStatusBadge.classList.add('active');
            } else if (sleepTimerInterval && sleepTimerRemainingSec > 0) {
                const m = Math.floor(sleepTimerRemainingSec / 60);
                const s = sleepTimerRemainingSec % 60;
                settingsTabSleepStatusBadge.textContent = `${m}:${s < 10 ? '0' : ''}${s} REMAINING`;
                settingsTabSleepStatusBadge.classList.add('active');
            } else {
                settingsTabSleepStatusBadge.textContent = 'INACTIVE';
                settingsTabSleepStatusBadge.classList.remove('active');
            }
        }

        // 1. Math Precision Architecture
        const precisionBtns = document.querySelectorAll('.enginePrecisionBtn');
        const precisionPill = document.getElementById('settingsEnginePrecisionPill');
        if (precisionBtns.length > 0) {
            precisionBtns.forEach(b => {
                const is64 = b.getAttribute('data-precision') === '64';
                b.classList.toggle('active', is64 === isPrecision64);
            });
        }
        if (precisionPill) {
            precisionPill.textContent = isPrecision64 ? '64-BIT DOUBLE FLOAT' : '32-BIT FAST FLOAT';
        }

        // 2. Hardware Analog Gain (PipeWire / ALSA Bridge)
        const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
        const hwGainDot = document.getElementById('settingsHwGainDot');
        const hwGainText = document.getElementById('settingsHwGainText');
        const hwGainPill = document.getElementById('settingsHardwareGainPill');
        if (hwGainBtn) hwGainBtn.classList.toggle('active', isHardwareGain);
        if (hwGainDot) hwGainDot.classList.toggle('active', isHardwareGain);
        if (hwGainText) {
            hwGainText.textContent = isHardwareGain ? `HARDWARE GAIN: ON (${hwVolumeBackend.toUpperCase()})` : 'HARDWARE GAIN: OFF';
        }
        if (hwGainPill && hwVolumeBackend !== 'none') {
            hwGainPill.textContent = `READY (${hwVolumeBackend.toUpperCase()})`;
        }

        // 3. Ultrasonic IMD Filter
        const ultrasonicBtn = document.getElementById('settingsUltrasonicToggleBtn');
        const ultrasonicDot = document.getElementById('settingsUltrasonicDot');
        const ultrasonicText = document.getElementById('settingsUltrasonicText');
        const ultrasonicSelect = document.getElementById('settingsUltrasonicCutoffSelect');
        const ultrasonicPill = document.getElementById('settingsUltrasonicPill');
        if (ultrasonicBtn) ultrasonicBtn.classList.toggle('active', isUltrasonic);
        if (ultrasonicDot) ultrasonicDot.classList.toggle('active', isUltrasonic);
        if (ultrasonicText) {
            ultrasonicText.textContent = isUltrasonic ? 'ULTRASONIC FILTER: ON' : 'ULTRASONIC FILTER: OFF';
        }
        if (ultrasonicPill) {
            ultrasonicPill.textContent = isUltrasonic ? `ACTIVE (${Math.round(ultrasonicCutoff / 1000)} kHz)` : 'BYPASS';
        }
        if (ultrasonicSelect) {
            ultrasonicSelect.value = ultrasonicCutoff.toString();
        }

        // 4. Dithering & Noise Shaping
        const ditherBtns = document.querySelectorAll('.ditherModeBtn');
        const ditherPill = document.getElementById('settingsDitherPill');
        if (ditherBtns.length > 0) {
            ditherBtns.forEach(b => {
                const mode = b.getAttribute('data-dither');
                b.classList.toggle('active', mode === ditherMode);
            });
        }
        if (ditherPill) {
            ditherPill.textContent = ditherMode === 'shaped' ? 'SHAPED (>18 kHz)' : (ditherMode === 'tpdf' ? 'TPDF FLAT' : 'OFF (TRUNCATE)');
        }

        // 5. Speaker Ambiophonics R.A.C.E.
        const ambiBtn = document.getElementById('settingsAmbiToggleBtn');
        const ambiDot = document.getElementById('settingsAmbiDot');
        const ambiText = document.getElementById('settingsAmbiText');
        const ambiPill = document.getElementById('settingsAmbiPill');
        if (ambiBtn) ambiBtn.classList.toggle('active', isAmbiophonics);
        if (ambiDot) ambiDot.classList.toggle('active', isAmbiophonics);
        if (ambiText) {
            ambiText.textContent = isAmbiophonics ? 'AMBIOPHONICS: ON (R.A.C.E.)' : 'AMBIOPHONICS: OFF (SPEAKERS ONLY)';
        }
        if (ambiPill) {
            ambiPill.textContent = isAmbiophonics ? 'ACTIVE (R.A.C.E.)' : 'BYPASS';
        }

        // 6. Audio Buffer & Latency Tuning
        const bufferBtns = document.querySelectorAll('.bufferLatencyBtn');
        const bufferPill = document.getElementById('settingsBufferPill');
        if (bufferBtns.length > 0) {
            bufferBtns.forEach(b => {
                const latency = b.getAttribute('data-latency');
                b.classList.toggle('active', latency === bufferLatencyTarget);
            });
        }
        if (bufferPill) {
            bufferPill.textContent = bufferLatencyTarget === 'interactive' ? 'STUDIO LOW-LATENCY (~15ms)' : 'PLAYBACK (~100ms)';
        }

        // 7. Spectrum Visualizer Mode
        const visModeBtns = document.querySelectorAll('.visModeBtn');
        if (visModeBtns.length > 0 && typeof activeVisualizerMode !== 'undefined') {
            visModeBtns.forEach(b => {
                const m = b.dataset.mode;
                const matches = (m === activeVisualizerMode) || (activeVisualizerMode === 'thematic' && (m === 'badapple' || m === 'thematic'));
                b.classList.toggle('active', matches);
            });
        }

        if (typeof updateSignalPathUi === 'function') {
            updateSignalPathUi();
        }
    }

    function switchWorkspace(viewName, targetMobilePanel = null) {
        currentWorkspace = viewName;

        if (viewName === 'soulseek') {
            if (typeof window.getP2pModule === 'function') window.getP2pModule();
            document.body.classList.remove('view-player', 'view-download', 'view-settings');
            document.body.classList.add('view-soulseek');

            if (wsPlayerBtn) wsPlayerBtn.classList.remove('active');
            if (wsSoulseekBtn) wsSoulseekBtn.classList.add('active');
            if (wsDownloadBtn) wsDownloadBtn.classList.remove('active');
            if (wsSettingsBtn) wsSettingsBtn.classList.remove('active');
            if (topSettingsBtn) topSettingsBtn.classList.remove('active');
            if (installAppBtn) installAppBtn.classList.remove('active');

            if (gridContainer) gridContainer.style.display = 'none';
            if (soulseekWorkspace) soulseekWorkspace.style.display = 'flex';
            if (downloadWorkspace) downloadWorkspace.style.display = 'none';
            if (settingsWorkspace) settingsWorkspace.style.display = 'none';
            if (persistentMiniPlayer) persistentMiniPlayer.style.display = 'flex';

            setMobilePanelsInactive();
            setMobileTabActive('soulseekWorkspace');
            document.body.classList.remove('mobile-tab-player', 'mobile-tab-tracks', 'mobile-tab-info');

            if (allTracks[currentTrackIndex]) {
                updateMiniPlayerInfo(allTracks[currentTrackIndex]);
            }
            updateMiniPlayerPlayState(isPlaying);

            if (typeof soulseekController !== 'undefined') {
                if (typeof soulseekController.setSubView === 'function') {
                    soulseekController.setSubView('results');
                }
                soulseekController.checkStatus();
                soulseekController.startTransfersPolling();
            }
        } else if (viewName === 'download') {
            if (typeof window.getP2pModule === 'function') window.getP2pModule();
            document.body.classList.remove('view-player', 'view-soulseek', 'view-settings');
            document.body.classList.add('view-download');

            if (wsPlayerBtn) wsPlayerBtn.classList.remove('active');
            if (wsSoulseekBtn) wsSoulseekBtn.classList.remove('active');
            if (wsDownloadBtn) wsDownloadBtn.classList.add('active');
            if (wsSettingsBtn) wsSettingsBtn.classList.remove('active');
            if (topSettingsBtn) topSettingsBtn.classList.remove('active');
            if (installAppBtn) installAppBtn.classList.add('active');

            if (gridContainer) gridContainer.style.display = 'none';
            if (soulseekWorkspace) soulseekWorkspace.style.display = 'none';
            if (downloadWorkspace) downloadWorkspace.style.display = 'flex';
            if (settingsWorkspace) settingsWorkspace.style.display = 'none';
            if (persistentMiniPlayer) persistentMiniPlayer.style.display = 'flex';

            setMobilePanelsInactive();
            setMobileTabActive('downloadWorkspace');
            document.body.classList.remove('mobile-tab-player', 'mobile-tab-tracks', 'mobile-tab-info');

            if (allTracks[currentTrackIndex]) {
                updateMiniPlayerInfo(allTracks[currentTrackIndex]);
            }
            updateMiniPlayerPlayState(isPlaying);

            if (typeof soulseekController !== 'undefined') {
                soulseekController.stopTransfersPolling();
            }

            if (typeof fetchLanStreamingUrl === 'function') {
                fetchLanStreamingUrl();
            }
        } else if (viewName === 'settings') {
            if (typeof window.getSettingsModule === 'function') window.getSettingsModule();
            document.body.classList.remove('view-player', 'view-soulseek', 'view-download');
            document.body.classList.add('view-settings');

            if (wsPlayerBtn) wsPlayerBtn.classList.remove('active');
            if (wsSoulseekBtn) wsSoulseekBtn.classList.remove('active');
            if (wsDownloadBtn) wsDownloadBtn.classList.remove('active');
            if (wsSettingsBtn) wsSettingsBtn.classList.add('active');
            if (topSettingsBtn) topSettingsBtn.classList.add('active');
            if (installAppBtn) installAppBtn.classList.remove('active');

            if (gridContainer) gridContainer.style.display = 'none';
            if (soulseekWorkspace) soulseekWorkspace.style.display = 'none';
            if (downloadWorkspace) downloadWorkspace.style.display = 'none';
            if (settingsWorkspace) settingsWorkspace.style.display = 'flex';
            if (persistentMiniPlayer) persistentMiniPlayer.style.display = 'flex';

            setMobilePanelsInactive();
            setMobileTabActive('settingsWorkspace');
            document.body.classList.remove('mobile-tab-player', 'mobile-tab-tracks', 'mobile-tab-info');

            if (allTracks[currentTrackIndex]) {
                updateMiniPlayerInfo(allTracks[currentTrackIndex]);
            }
            updateMiniPlayerPlayState(isPlaying);

            if (typeof soulseekController !== 'undefined') {
                soulseekController.stopTransfersPolling();
            }

            syncSettingsTabValues();
        } else {
            document.body.classList.remove('view-soulseek', 'view-download', 'view-settings');
            document.body.classList.add('view-player');

            if (wsPlayerBtn) wsPlayerBtn.classList.add('active');
            if (wsSoulseekBtn) wsSoulseekBtn.classList.remove('active');
            if (wsDownloadBtn) wsDownloadBtn.classList.remove('active');
            if (wsSettingsBtn) wsSettingsBtn.classList.remove('active');
            if (topSettingsBtn) topSettingsBtn.classList.remove('active');
            if (installAppBtn) installAppBtn.classList.remove('active');

            if (gridContainer) gridContainer.style.display = '';
            if (soulseekWorkspace) soulseekWorkspace.style.display = 'none';
            if (downloadWorkspace) downloadWorkspace.style.display = 'none';
            if (settingsWorkspace) settingsWorkspace.style.display = 'none';
            if (persistentMiniPlayer) persistentMiniPlayer.style.display = 'none';

            if (typeof soulseekController !== 'undefined') {
                soulseekController.stopTransfersPolling();
            }

            if (targetMobilePanel || window.innerWidth <= 768) {
                const activeTarget = targetMobilePanel || 'playerDeck';
                setMobileTabActive(activeTarget);

                if (playerDeckEl) {
                    playerDeckEl.classList.toggle('mobileActive', activeTarget === 'playerDeck');
                    playerDeckEl.style.display = '';
                }
                if (trackListPanelEl) {
                    trackListPanelEl.classList.toggle('mobileActive', activeTarget === 'trackListPanel');
                    trackListPanelEl.style.display = '';
                }
                if (settingsPanelEl) {
                    settingsPanelEl.classList.toggle('mobileActive', activeTarget === 'settingsPanel');
                    settingsPanelEl.style.display = '';
                }

                document.body.classList.remove('mobile-tab-player', 'mobile-tab-tracks', 'mobile-tab-info');
                if (activeTarget === 'playerDeck') {
                    document.body.classList.add('mobile-tab-player');
                    if (persistentMiniPlayer) persistentMiniPlayer.style.display = 'none';
                } else if (activeTarget === 'trackListPanel') {
                    document.body.classList.add('mobile-tab-tracks');
                    if (persistentMiniPlayer) {
                        persistentMiniPlayer.style.display = 'flex';
                        if (allTracks && allTracks[currentTrackIndex]) updateMiniPlayerInfo(allTracks[currentTrackIndex]);
                        updateMiniPlayerPlayState(isPlaying);
                    }
                    if (typeof renderVirtualTrackWindow === 'function') {
                        renderVirtualTrackWindow(true);
                    }
                } else if (activeTarget === 'settingsPanel') {
                    document.body.classList.add('mobile-tab-info');
                    if (persistentMiniPlayer) {
                        persistentMiniPlayer.style.display = 'flex';
                        if (allTracks && allTracks[currentTrackIndex]) updateMiniPlayerInfo(allTracks[currentTrackIndex]);
                        updateMiniPlayerPlayState(isPlaying);
                    }
                }
                if (metadataToggleBtn) {
                    metadataToggleBtn.classList.toggle('active', activeTarget === 'settingsPanel');
                    metadataToggleBtn.setAttribute('aria-pressed', String(activeTarget === 'settingsPanel'));
                }
            } else {
                setMobilePanelsInactive();
                if (playerDeckEl) playerDeckEl.style.display = '';
                if (trackListPanelEl) trackListPanelEl.style.display = '';
                if (settingsPanelEl) settingsPanelEl.style.display = '';
                document.body.classList.remove('mobile-tab-player', 'mobile-tab-tracks', 'mobile-tab-info');
                if (persistentMiniPlayer) persistentMiniPlayer.style.display = 'none';
                if (metadataToggleBtn) {
                    const isCol = document.body.classList.contains('metadata-collapsed');
                    metadataToggleBtn.classList.toggle('active', !isCol);
                    metadataToggleBtn.setAttribute('aria-pressed', String(!isCol));
                }
            }

            if (typeof resumeVisualizerLoop === 'function') {
                resumeVisualizerLoop();
            }

            if (typeof resizeVisualizerCanvas === 'function') {
                resizeVisualizerCanvas();
            }
        }
    }

    // No sample placeholder tracks — user chooses music directory first
    const fallbackTracks = [];

    // =========================================================================

    // Blocking Track Loading Overlay & IndexedDB Library Persistence
    // =========================================================================
    let isTrackLoadingCancelled = false;
    let activeScanAbortController = null;

    function showTrackLoadingOverlay(title = 'LOADING MUSIC LIBRARY...', statusText = 'Indexing audio files and metadata. Please wait...', progressPct = null) {
        isTrackLoadingCancelled = false;
        const overlay = document.getElementById('trackLoadingOverlay');
        const titleEl = document.getElementById('trackLoadingTitle');
        const statusEl = document.getElementById('trackLoadingStatusText');
        const barEl = document.getElementById('trackLoadingProgressBar');
        if (titleEl && title) titleEl.textContent = title;
        if (statusEl && statusText) statusEl.textContent = statusText;
        if (barEl) {
            if (typeof progressPct === 'number') {
                barEl.classList.remove('indeterminate');
                barEl.style.width = `${Math.max(2, Math.min(100, progressPct))}%`;
            } else {
                barEl.classList.add('indeterminate');
                barEl.style.width = '40%';
            }
        }
        if (overlay) {
            overlay.style.display = 'flex';
        }
    }

    function updateTrackLoadingOverlay(statusText, progressPct = null) {
        const statusEl = document.getElementById('trackLoadingStatusText');
        const barEl = document.getElementById('trackLoadingProgressBar');
        if (statusEl && statusText) statusEl.textContent = statusText;
        if (barEl && typeof progressPct === 'number') {
            barEl.classList.remove('indeterminate');
            barEl.style.width = `${Math.max(2, Math.min(100, progressPct))}%`;
        }
    }

    function hideTrackLoadingOverlay() {
        const overlay = document.getElementById('trackLoadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        activeScanAbortController = null;
    }

    function cancelActiveTrackLoading() {
        isTrackLoadingCancelled = true;
        if (activeScanAbortController) {
            try { activeScanAbortController.abort(); } catch (_) {}
            activeScanAbortController = null;
        }
        if (window.AndroidBridge && typeof window.AndroidBridge.cancelScan === 'function') {
            try { window.AndroidBridge.cancelScan(); } catch (_) {}
        }
        hideTrackLoadingOverlay();
        setScanStatus('Track loading cancelled by user.', false);
        showToast('Track loading cancelled');
    }

    // Update Player Empty Prompt when no music directory is loaded
    function updateEmptyPlayerState(errorMsg = '') {
        const promptEl = document.getElementById('playerEmptyPrompt');
        const errorHintEl = document.getElementById('playerEmptyErrorHint');
        const hasTracks = Array.isArray(allTracks) && allTracks.length > 0;

        if (promptEl) {
            promptEl.style.display = hasTracks ? 'none' : 'flex';
        }
        if (errorHintEl) {
            if (!hasTracks && errorMsg) {
                errorHintEl.textContent = `${errorMsg} Please set the directory manually in Settings → Library & Folders.`;
                errorHintEl.style.display = 'block';
            } else {
                errorHintEl.style.display = 'none';
            }
        }
        if (trackName) trackName.style.display = hasTracks ? '' : 'none';
        if (artistName) artistName.style.display = hasTracks ? '' : 'none';
        if (albumName) albumName.style.display = hasTracks ? '' : 'none';
        if (trackBadge) trackBadge.style.display = hasTracks ? '' : 'none';

        if (!hasTracks) {
            if (miniTitle) miniTitle.textContent = 'No Track Loaded';
            if (miniArtist) miniArtist.textContent = 'Choose directory';
        }
        updateSignalPathUi();
    }


    // Attach top-level UI elements and helpers to window for cross-module accessibility
    if (typeof window !== "undefined") {
        try { window.activeListLabel = activeListLabel; } catch (_) {}
        try { window.activeScanAbortController = activeScanAbortController; } catch (_) {}
        try { window.activeTheme = activeTheme; } catch (_) {}
        try { window.albumName = albumName; } catch (_) {}
        try { window.artistName = artistName; } catch (_) {}
        try { window.audio = audio; } catch (_) {}
        try { window.auditMetricHeadroom = auditMetricHeadroom; } catch (_) {}
        try { window.auditMetricLatency = auditMetricLatency; } catch (_) {}
        try { window.auditQualityBadge = auditQualityBadge; } catch (_) {}
        try { window.auditQualityDesc = auditQualityDesc; } catch (_) {}
        try { window.auditQualityDot = auditQualityDot; } catch (_) {}
        try { window.backToLibraryBtn = backToLibraryBtn; } catch (_) {}
        try { window.bannerAddTracksBtn = bannerAddTracksBtn; } catch (_) {}
        try { window.bgDisc = bgDisc; } catch (_) {}
        try { window.bindFastAction = bindFastAction; } catch (_) {}
        try { window.browseFolderBtn = browseFolderBtn; } catch (_) {}
        try { window.cachedAllPanelsList = cachedAllPanelsList; } catch (_) {}
        try { window.cachedMobileTabBtns = cachedMobileTabBtns; } catch (_) {}
        try { window.cancelActiveTrackLoading = cancelActiveTrackLoading; } catch (_) {}
        try { window.cancelSleepTimerBtn = cancelSleepTimerBtn; } catch (_) {}
        try { window.clearQueueBtn = clearQueueBtn; } catch (_) {}
        try { window.closeFolderTrayBtn = closeFolderTrayBtn; } catch (_) {}
        try { window.closeModalBtn = closeModalBtn; } catch (_) {}
        try { window.closePeqModal = closePeqModal; } catch (_) {}
        try { window.closeSignalPathModalBtn = closeSignalPathModalBtn; } catch (_) {}
        try { window.closeSleepTimerModalBtn = closeSleepTimerModalBtn; } catch (_) {}
        try { window.closeThemeModalBtn = closeThemeModalBtn; } catch (_) {}
        try { window.coverArtPreview = coverArtPreview; } catch (_) {}
        try { window.coverBadge = coverBadge; } catch (_) {}
        try { window.createPlaylistBtn = createPlaylistBtn; } catch (_) {}
        try { window.ctx = ctx; } catch (_) {}
        try { window.currentFormatFilter = currentFormatFilter; } catch (_) {}
        try { window.currentPlaylistTitle = currentPlaylistTitle; } catch (_) {}
        try { window.currentTimeEl = currentTimeEl; } catch (_) {}
        try { window.currentWorkspace = currentWorkspace; } catch (_) {}
        try { window.customSleepInput = customSleepInput; } catch (_) {}
        try { window.deckArtworkAmbient = deckArtworkAmbient; } catch (_) {}
        try { window.deckArtworkBackdrop = deckArtworkBackdrop; } catch (_) {}
        try { window.deckSignalDot = deckSignalDot; } catch (_) {}
        try { window.deferredInstallPrompt = deferredInstallPrompt; } catch (_) {}
        try { window.deleteCurrentPlaylistBtn = deleteCurrentPlaylistBtn; } catch (_) {}
        try { window.dismissedTracksMap = dismissedTracksMap; } catch (_) {}
        try { window.downloadWorkspace = downloadWorkspace; } catch (_) {}
        try { window.fallbackTracks = fallbackTracks; } catch (_) {}
        try { window.folderPathInput = folderPathInput; } catch (_) {}
        try { window.folderPickerInput = folderPickerInput; } catch (_) {}
        try { window.folderTray = folderTray; } catch (_) {}
        try { window.getActiveTheme = getActiveTheme; } catch (_) {}
        try { window.gridContainer = gridContainer; } catch (_) {}
        try { window.hideTrackLoadingOverlay = hideTrackLoadingOverlay; } catch (_) {}
        try { window.infoPanelEl = infoPanelEl; } catch (_) {}
        try { window.installAppBtn = installAppBtn; } catch (_) {}
        try { window.isAtlasThemeActive = isAtlasThemeActive; } catch (_) {}
        try { window.isTrackLoadingCancelled = isTrackLoadingCancelled; } catch (_) {}
        try { window.lastRenderedMiniTrack = lastRenderedMiniTrack; } catch (_) {}
        try { window.libraryControls = libraryControls; } catch (_) {}
        try { window.localFileInput = localFileInput; } catch (_) {}
        try { window.lyricsArtistName = lyricsArtistName; } catch (_) {}
        try { window.lyricsCon = lyricsCon; } catch (_) {}
        try { window.lyricsContent = lyricsContent; } catch (_) {}
        try { window.lyricsScrollArea = lyricsScrollArea; } catch (_) {}
        try { window.lyricsToggleBtn = lyricsToggleBtn; } catch (_) {}
        try { window.lyricsTrackName = lyricsTrackName; } catch (_) {}
        try { window.metadataToggleBtn = metadataToggleBtn; } catch (_) {}
        try { window.metadataEditorModal = metadataEditorModal; } catch (_) {}
        try { window.closeMetaEditorModalBtn = closeMetaEditorModalBtn; } catch (_) {}
        try { window.metaEditCancelBtn = metaEditCancelBtn; } catch (_) {}
        try { window.metaEditorForm = metaEditorForm; } catch (_) {}
        try { window.metaEditSaveBtn = metaEditSaveBtn; } catch (_) {}
        try { window.metaEditTitle = metaEditTitle; } catch (_) {}
        try { window.metaEditArtist = metaEditArtist; } catch (_) {}
        try { window.metaEditAlbum = metaEditAlbum; } catch (_) {}
        try { window.metaEditGenre = metaEditGenre; } catch (_) {}
        try { window.metaEditYear = metaEditYear; } catch (_) {}
        try { window.metaEditTrackNum = metaEditTrackNum; } catch (_) {}
        try { window.metaEditComment = metaEditComment; } catch (_) {}
        try { window.metaEditorThumb = metaEditorThumb; } catch (_) {}
        try { window.metaEditorFileTitle = metaEditorFileTitle; } catch (_) {}
        try { window.metaEditorFilePath = metaEditorFilePath; } catch (_) {}
        try { window.metaEditorStatus = metaEditorStatus; } catch (_) {}
        try { window.metaEditorFormatPill = metaEditorFormatPill; } catch (_) {}
        try { window.metaEditorBitratePill = metaEditorBitratePill; } catch (_) {}
        try { window.metaEditorSampleRatePill = metaEditorSampleRatePill; } catch (_) {}
        try { window.metaEditorBitDepthPill = metaEditorBitDepthPill; } catch (_) {}
        try { window.infoPanelEditMetaBtn = infoPanelEditMetaBtn; } catch (_) {}
        try { window.trackMenuEditMetaBtn = trackMenuEditMetaBtn; } catch (_) {}
        try { window.miniArtPreview = miniArtPreview; } catch (_) {}
        try { window.miniArtist = miniArtist; } catch (_) {}
        try { window.miniCurrentTime = miniCurrentTime; } catch (_) {}
        try { window.miniDeckReturnBtn = miniDeckReturnBtn; } catch (_) {}
        try { window.miniMuteBtn = miniMuteBtn; } catch (_) {}
        try { window.miniNextBtn = miniNextBtn; } catch (_) {}
        try { window.miniPlayBtn = miniPlayBtn; } catch (_) {}
        try { window.miniPlayImg = miniPlayImg; } catch (_) {}
        try { window.miniPrevBtn = miniPrevBtn; } catch (_) {}
        try { window.miniProgressBar = miniProgressBar; } catch (_) {}
        try { window.miniProgressCon = miniProgressCon; } catch (_) {}
        try { window.miniTitle = miniTitle; } catch (_) {}
        try { window.miniTotalDuration = miniTotalDuration; } catch (_) {}
        try { window.miniTurntableThumb = miniTurntableThumb; } catch (_) {}
        try { window.miniVolumeSlider = miniVolumeSlider; } catch (_) {}
        try { window.modalCreateAndAddBtn = modalCreateAndAddBtn; } catch (_) {}
        try { window.modalNewPlaylistName = modalNewPlaylistName; } catch (_) {}
        try { window.modalPlaylistList = modalPlaylistList; } catch (_) {}
        try { window.modalTrackTitle = modalTrackTitle; } catch (_) {}
        try { window.muteBtn = muteBtn; } catch (_) {}
        try { window.newPlaylistInput = newPlaylistInput; } catch (_) {}
        try { window.nextBtn = nextBtn; } catch (_) {}
        try { window.openPeqModal = openPeqModal; } catch (_) {}
        try { window.openSignalAuditBtn = openSignalAuditBtn; } catch (_) {}
        try { window.persistentMiniPlayer = persistentMiniPlayer; } catch (_) {}
        try { window.playPauseBtn = playPauseBtn; } catch (_) {}
        try { window.playPauseImg = playPauseImg; } catch (_) {}
        try { window.playQueue = playQueue; } catch (_) {}
        try { window.playerDeckEl = playerDeckEl; } catch (_) {}
        try { window.playlistBanner = playlistBanner; } catch (_) {}
        try { window.playlistList = playlistList; } catch (_) {}
        try { window.playlistModal = playlistModal; } catch (_) {}
        try { window.playlistsView = playlistsView; } catch (_) {}
        try { window.presetPathBtns = presetPathBtns; } catch (_) {}
        try { window.prevBtn = prevBtn; } catch (_) {}
        try { window.progressBar = progressBar; } catch (_) {}
        try { window.progressCon = progressCon; } catch (_) {}
        try { window.progressHover = progressHover; } catch (_) {}
        try { window.queueCountBadge = queueCountBadge; } catch (_) {}
        try { window.queueCountSummary = queueCountSummary; } catch (_) {}
        try { window.queueList = queueList; } catch (_) {}
        try { window.queueView = queueView; } catch (_) {}
        try { window.quickNewPlaylistBtn = quickNewPlaylistBtn; } catch (_) {}
        try { window.refreshTracksBtn = refreshTracksBtn; } catch (_) {}
        try { window.repeatBtn = repeatBtn; } catch (_) {}
        try { window.restoreTracksBtn = restoreTracksBtn; } catch (_) {}
        try { window.scanFolderBtn = scanFolderBtn; } catch (_) {}
        try { window.scanStatus = scanStatus; } catch (_) {}
        try { window.setCustomSleepBtn = setCustomSleepBtn; } catch (_) {}
        try { window.setMobilePanelsInactive = setMobilePanelsInactive; } catch (_) {}
        try { window.setMobileSearchPanelCollapsed = setMobileSearchPanelCollapsed; } catch (_) {}
        try { window.setMobileTabActive = setMobileTabActive; } catch (_) {}
        try { window.settingsPanelEl = settingsPanelEl; } catch (_) {}
        try { window.settingsReturnBtn = settingsReturnBtn; } catch (_) {}
        try { window.settingsWorkspace = settingsWorkspace; } catch (_) {}
        try { window.showTrackLoadingOverlay = showTrackLoadingOverlay; } catch (_) {}
        try { window.shuffleBtn = shuffleBtn; } catch (_) {}
        try { window.shufflePlayBtn = shufflePlayBtn; } catch (_) {}
        try { window.signalPathBadgeBtn = signalPathBadgeBtn; } catch (_) {}
        try { window.signalPathLabel = signalPathLabel; } catch (_) {}
        try { window.signalPathModal = signalPathModal; } catch (_) {}
        try { window.sleepStatusCard = sleepStatusCard; } catch (_) {}
        try { window.sleepStatusRemaining = sleepStatusRemaining; } catch (_) {}
        try { window.sleepTimerBtn = sleepTimerBtn; } catch (_) {}
        try { window.sleepTimerInterval = sleepTimerInterval; } catch (_) {}
        try { window.sleepTimerLabel = sleepTimerLabel; } catch (_) {}
        try { window.sleepTimerModal = sleepTimerModal; } catch (_) {}
        try { window.sleepTimerMode = sleepTimerMode; } catch (_) {}
        try { window.sleepTimerOriginalVolume = sleepTimerOriginalVolume; } catch (_) {}
        try { window.sleepTimerRemainingSec = sleepTimerRemainingSec; } catch (_) {}
        try { window.standaloneBanner = standaloneBanner; } catch (_) {}
        try { window.standaloneBannerTitle = standaloneBannerTitle; } catch (_) {}
        try { window.standaloneResumeLibraryBtn = standaloneResumeLibraryBtn; } catch (_) {}
        try { window.standaloneCloseBtn = standaloneCloseBtn; } catch (_) {}
        try { window.slskAccountAlert = slskAccountAlert; } catch (_) {}
        try { window.slskAccountBtn = slskAccountBtn; } catch (_) {}
        try { window.slskAccountModal = slskAccountModal; } catch (_) {}
        try { window.slskActiveSearchMeta = slskActiveSearchMeta; } catch (_) {}
        try { window.slskChangeDirBtn = slskChangeDirBtn; } catch (_) {}
        try { window.slskChangeSharedDirBtn = slskChangeSharedDirBtn; } catch (_) {}
        try { window.slskClearSubFilterBtn = slskClearSubFilterBtn; } catch (_) {}
        try { window.slskCloseAccountModalBtn = slskCloseAccountModalBtn; } catch (_) {}
        try { window.slskCloseDrawerBtn = slskCloseDrawerBtn; } catch (_) {}
        try { window.slskControlsPanel = slskControlsPanel; } catch (_) {}
        try { window.slskDownloadsPathText = slskDownloadsPathText; } catch (_) {}
        try { window.slskExcludeFilterClearBtn = slskExcludeFilterClearBtn; } catch (_) {}
        try { window.slskExcludeFilterInput = slskExcludeFilterInput; } catch (_) {}
        try { window.slskFilterChips = slskFilterChips; } catch (_) {}
        try { window.slskInResultFilterClearBtn = slskInResultFilterClearBtn; } catch (_) {}
        try { window.slskInResultFilterInput = slskInResultFilterInput; } catch (_) {}
        try { window.slskIncludeFilterClearBtn = slskIncludeFilterClearBtn; } catch (_) {}
        try { window.slskIncludeFilterInput = slskIncludeFilterInput; } catch (_) {}
        try { window.slskLogoutBtn = slskLogoutBtn; } catch (_) {}
        try { window.slskMobileActiveFilter = slskMobileActiveFilter; } catch (_) {}
        try { window.slskMobileTransferCount = slskMobileTransferCount; } catch (_) {}
        try { window.slskMobileTransfersBtn = slskMobileTransfersBtn; } catch (_) {}
        try { window.slskModalDownloadDir = slskModalDownloadDir; } catch (_) {}
        try { window.slskModalPassword = slskModalPassword; } catch (_) {}
        try { window.slskModalPowerBtn = slskModalPowerBtn; } catch (_) {}
        try { window.slskModalSharedDir = slskModalSharedDir; } catch (_) {}
        try { window.slskModalSyncPlayerDirBtn = slskModalSyncPlayerDirBtn; } catch (_) {}
        try { window.slskModalSyncSharePlayerDirBtn = slskModalSyncSharePlayerDirBtn; } catch (_) {}
        try { window.slskModalUsername = slskModalUsername; } catch (_) {}
        try { window.slskPanelToggleBar = slskPanelToggleBar; } catch (_) {}
        try { window.slskPanelToggleChevron = slskPanelToggleChevron; } catch (_) {}
        try { window.slskPlaceholder = slskPlaceholder; } catch (_) {}
        try { window.slskPowerBtn = slskPowerBtn; } catch (_) {}
        try { window.slskPowerBtnText = slskPowerBtnText; } catch (_) {}
        try { window.slskRefreshStatusBtn = slskRefreshStatusBtn; } catch (_) {}
        try { window.slskResultCount = slskResultCount; } catch (_) {}
        try { window.slskResultsList = slskResultsList; } catch (_) {}
        try { window.slskSaveAccountBtn = slskSaveAccountBtn; } catch (_) {}
        try { window.slskScanDownloadsBtn = slskScanDownloadsBtn; } catch (_) {}
        try { window.slskSearchClearBtn = slskSearchClearBtn; } catch (_) {}
        try { window.slskSearchInput = slskSearchInput; } catch (_) {}
        try { window.slskSearchSubmitBtn = slskSearchSubmitBtn; } catch (_) {}
        try { window.slskSearchingState = slskSearchingState; } catch (_) {}
        try { window.slskSearchingTitle = slskSearchingTitle; } catch (_) {}
        try { window.slskSharedPathText = slskSharedPathText; } catch (_) {}
        try { window.slskSortSelect = slskSortSelect; } catch (_) {}
        try { window.slskStartDaemonBtn = slskStartDaemonBtn; } catch (_) {}
        try { window.slskStatusDot = slskStatusDot; } catch (_) {}
        try { window.slskStatusPill = slskStatusPill; } catch (_) {}
        try { window.slskStatusText = slskStatusText; } catch (_) {}
        try { window.slskSuggestedChips = slskSuggestedChips; } catch (_) {}
        try { window.slskSuggestedRow = slskSuggestedRow; } catch (_) {}
        try { window.slskSyncCurrentDirBtn = slskSyncCurrentDirBtn; } catch (_) {}
        try { window.slskToggleTransfersBtn = slskToggleTransfersBtn; } catch (_) {}
        try { window.slskTransferCount = slskTransferCount; } catch (_) {}
        try { window.slskTransfersDrawer = slskTransfersDrawer; } catch (_) {}
        try { window.slskTransfersHeader = slskTransfersHeader; } catch (_) {}
        try { window.slskTransfersList = slskTransfersList; } catch (_) {}
        try { window.slskTransfersSummary = slskTransfersSummary; } catch (_) {}
        try { window.slskUsername = slskUsername; } catch (_) {}
        try { window.sortSelect = sortSelect; } catch (_) {}
        try { window.soulseekWorkspace = soulseekWorkspace; } catch (_) {}
        try { window.speedBtns = speedBtns; } catch (_) {}
        try { window.statAlbum = statAlbum; } catch (_) {}
        try { window.statArtist = statArtist; } catch (_) {}
        try { window.statBitDepth = statBitDepth; } catch (_) {}
        try { window.statBitrate = statBitrate; } catch (_) {}
        try { window.statChannels = statChannels; } catch (_) {}
        try { window.statDacStream = statDacStream; } catch (_) {}
        try { window.statDynamicRange = statDynamicRange; } catch (_) {}
        try { window.statFormat = statFormat; } catch (_) {}
        try { window.statGenre = statGenre; } catch (_) {}
        try { window.statPath = statPath; } catch (_) {}
        try { window.statPeakLevel = statPeakLevel; } catch (_) {}
        try { window.statSampleRate = statSampleRate; } catch (_) {}
        try { window.statSize = statSize; } catch (_) {}
        try { window.statTitle = statTitle; } catch (_) {}
        try { window.statTrack = statTrack; } catch (_) {}
        try { window.statYear = statYear; } catch (_) {}
        try { window.switchWorkspace = switchWorkspace; } catch (_) {}
        try { window.syncSettingsTabValues = syncSettingsTabValues; } catch (_) {}
        try { window.tabLibrary = tabLibrary; } catch (_) {}
        try { window.tabPlaylists = tabPlaylists; } catch (_) {}
        try { window.tabQueue = tabQueue; } catch (_) {}
        try { window.themeModal = themeModal; } catch (_) {}
        try { window.themeModalBtn = themeModalBtn; } catch (_) {}
        try { window.themeQuickBtns = themeQuickBtns; } catch (_) {}
        try { window.themeSelectCards = themeSelectCards; } catch (_) {}
        try { window.toggleFolderBtn = toggleFolderBtn; } catch (_) {}
        try { window.toggleMobileSearchPanel = toggleMobileSearchPanel; } catch (_) {}
        try { window.toneArm = toneArm; } catch (_) {}
        try { window.topSettingsBtn = topSettingsBtn; } catch (_) {}
        try { window.topThemeLabel = topThemeLabel; } catch (_) {}
        try { window.totalDurationEl = totalDurationEl; } catch (_) {}
        try { window.trackBadge = trackBadge; } catch (_) {}
        try { window.trackCount = trackCount; } catch (_) {}
        try { window.trackList = trackList; } catch (_) {}
        try { window.trackListPanelEl = trackListPanelEl; } catch (_) {}
        try { window.trackName = trackName; } catch (_) {}
        try { window.trackSearch = trackSearch; } catch (_) {}
        try { window.turntableCenterCanvas = turntableCenterCanvas; } catch (_) {}
        try { window.turntableCenterCtx = turntableCenterCtx; } catch (_) {}
        try { window.turntableCenterVis = turntableCenterVis; } catch (_) {}
        try { window.turntableCon = turntableCon; } catch (_) {}
        try { window.upcomingLibraryList = upcomingLibraryList; } catch (_) {}
        try { window.updateEmptyPlayerState = updateEmptyPlayerState; } catch (_) {}
        try { window.updateMiniPlayerInfo = updateMiniPlayerInfo; } catch (_) {}
        try { window.updateMiniPlayerPlayState = updateMiniPlayerPlayState; } catch (_) {}
        try { window.updateTrackLoadingOverlay = updateTrackLoadingOverlay; } catch (_) {}
        try { window.validThemeIds = validThemeIds; } catch (_) {}
        try { window.vinylArt = vinylArt; } catch (_) {}
        try { window.vinylLabel = vinylLabel; } catch (_) {}
        try { window.vinylTurntable = vinylTurntable; } catch (_) {}
        try { window.visModeBtns = visModeBtns; } catch (_) {}
        try { window.visPillBtns = visPillBtns; } catch (_) {}
        try { window.visualizerCanvas = visualizerCanvas; } catch (_) {}
        try { window.visualizerDock = visualizerDock; } catch (_) {}
        try { window.volumeIcon = volumeIcon; } catch (_) {}
        try { window.volumeLevel = volumeLevel; } catch (_) {}
        try { window.volumeSlider = volumeSlider; } catch (_) {}
        try { window.wsDownloadBtn = wsDownloadBtn; } catch (_) {}
        try { window.wsPlayerBtn = wsPlayerBtn; } catch (_) {}
        try { window.wsSettingsBtn = wsSettingsBtn; } catch (_) {}
        try { window.wsSoulseekBadge = wsSoulseekBadge; } catch (_) {}
        try { window.wsSoulseekBtn = wsSoulseekBtn; } catch (_) {}
        try { window.metadataEditorModal = metadataEditorModal; } catch (_) {}
        try { window.closeMetaEditorModalBtn = closeMetaEditorModalBtn; } catch (_) {}
        try { window.metaEditCancelBtn = metaEditCancelBtn; } catch (_) {}
        try { window.metaEditorForm = metaEditorForm; } catch (_) {}
        try { window.metaEditSaveBtn = metaEditSaveBtn; } catch (_) {}
        try { window.metaEditTitle = metaEditTitle; } catch (_) {}
        try { window.metaEditArtist = metaEditArtist; } catch (_) {}
        try { window.metaEditAlbum = metaEditAlbum; } catch (_) {}
        try { window.metaEditGenre = metaEditGenre; } catch (_) {}
        try { window.metaEditYear = metaEditYear; } catch (_) {}
        try { window.metaEditTrackNum = metaEditTrackNum; } catch (_) {}
        try { window.metaEditComment = metaEditComment; } catch (_) {}
        try { window.metaEditorThumb = metaEditorThumb; } catch (_) {}
        try { window.metaEditorFileTitle = metaEditorFileTitle; } catch (_) {}
        try { window.metaEditorFilePath = metaEditorFilePath; } catch (_) {}
        try { window.metaEditorStatus = metaEditorStatus; } catch (_) {}
        try { window.metaEditorFormatPill = metaEditorFormatPill; } catch (_) {}
        try { window.metaEditorBitratePill = metaEditorBitratePill; } catch (_) {}
        try { window.metaEditorSampleRatePill = metaEditorSampleRatePill; } catch (_) {}
        try { window.metaEditorBitDepthPill = metaEditorBitDepthPill; } catch (_) {}
        try { window.infoPanelEditMetaBtn = infoPanelEditMetaBtn; } catch (_) {}
        try { window.trackMenuEditMetaBtn = trackMenuEditMetaBtn; } catch (_) {}
    }



    // --- Sub-Module: library.js ---
// CachyMusic - Audio Library, ID3 Parser, Playlists & Queue
    // IndexedDB Persistence for Browser File/Directory Selection & Offline Tracks
    function openLibraryIdb() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
            const req = window.indexedDB.open('cachymusic_idb_v1', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('library')) {
                    db.createObjectStore('library', { keyPath: 'key' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveLibraryToIndexedDB(tracks, directoryName) {
        try {
            const db = await openLibraryIdb();
            const tx = db.transaction('library', 'readwrite');
            const store = tx.objectStore('library');
            const storableTracks = tracks.map(t => ({
                id: t.id,
                tid: t.tid || null,
                filename: t.filename,
                fullPath: t.fullPath,
                title: t.title,
                artist: t.artist,
                album: t.album,
                genre: t.genre,
                year: t.year,
                track: t.track,
                duration: t.duration,
                bitrate: t.bitrate,
                sampleRate: t.sampleRate,
                bitDepth: t.bitDepth,
                channels: t.channels,
                format: t.format,
                size: t.size,
                cover: t.cover,
                lyrics: t.lyrics || null,
                src: (t.src && !t.src.startsWith('blob:')) ? t.src : null,
                fileBlob: t._fileBlob || null
            }));
            store.put({
                key: 'saved_library',
                directory: directoryName || '',
                updatedAt: Date.now(),
                tracks: storableTracks
            });
        } catch (err) {
            console.warn('IndexedDB save warning:', err);
        }
    }

    async function loadLibraryFromIndexedDB() {
        try {
            const db = await openLibraryIdb();
            return await new Promise((resolve) => {
                const tx = db.transaction('library', 'readonly');
                const store = tx.objectStore('library');
                const req = store.get('saved_library');
                req.onsuccess = () => {
                    const res = req.result;
                    if (res && Array.isArray(res.tracks) && res.tracks.length > 0) {
                        const hydrated = res.tracks.map(t => {
                            let src = t.src;
                            if (!src && t.fileBlob instanceof Blob) {
                                src = URL.createObjectURL(t.fileBlob);
                            }
                            return {
                                ...t,
                                src: src || '',
                                _fileBlob: t.fileBlob || null
                            };
                        }).filter(t => Boolean(t.src));
                        resolve({ directory: res.directory || '', tracks: hydrated });
                    } else {
                        resolve(null);
                    }
                };
                req.onerror = () => resolve(null);
            });
        } catch (_) {
            return null;
        }
    }


    // Client-side Binary Audio Metadata Parser (FLAC, MP3, M4A)
    async function parseAudioFileMetadata(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const meta = {
            title: null,
            artist: null,
            album: null,
            genre: null,
            year: null,
            track: null,
            duration: 0,
            bitrate: null,
            sampleRate: null,
            channels: null,
            format: ext.toUpperCase(),
            size: formatFileSize(file.size),
            cover: null,
            lyrics: null
        };

        try {
            // Read first 2MB slice for headers and tag metadata
            const slice = file.slice(0, Math.min(file.size, 2 * 1024 * 1024));
            const arrayBuffer = await slice.arrayBuffer();
            const view = new DataView(arrayBuffer);
            const uint8 = new Uint8Array(arrayBuffer);

            // FLAC Tag Extraction
            if (ext === 'flac' || (uint8[0] === 0x66 && uint8[1] === 0x4C && uint8[2] === 0x61 && uint8[3] === 0x43)) {
                meta.format = 'FLAC';
                let pos = 4;
                let isLast = false;
                while (!isLast && pos + 4 <= uint8.length) {
                    const header = uint8[pos];
                    isLast = (header & 0x80) !== 0;
                    const type = header & 0x7F;
                    const len = (uint8[pos + 1] << 16) | (uint8[pos + 2] << 8) | uint8[pos + 3];
                    pos += 4;
                    if (pos + len > uint8.length) break;

                    if (type === 0 && len >= 34) { // STREAMINFO
                        const sr = (uint8[pos + 10] << 12) | (uint8[pos + 11] << 4) | (uint8[pos + 12] >> 4);
                        const ch = ((uint8[pos + 12] >> 1) & 0x07) + 1;
                        const bps = (((uint8[pos + 12] & 0x01) << 4) | (uint8[pos + 13] >> 4)) + 1;
                        const hi = uint8[pos + 13] & 0x0F;
                        const lo = view.getUint32(pos + 14, false);
                        const totalSamples = (hi * 4294967296) + lo;
                        meta.sampleRate = sr;
                        meta.channels = ch;
                        meta.bitDepth = bps;
                        if (sr > 0) {
                            meta.duration = Math.round((totalSamples / sr) * 100) / 100;
                            if (meta.duration > 0) {
                                meta.bitrate = Math.round((file.size * 8) / meta.duration / 1000);
                            }
                        }
                    } else if (type === 4) { // VORBIS_COMMENT
                        let cPos = pos;
                        if (cPos + 4 <= pos + len) {
                            const vendorLen = view.getUint32(cPos, true);
                            cPos += 4 + vendorLen;
                            if (cPos + 4 <= pos + len) {
                                const count = view.getUint32(cPos, true);
                                cPos += 4;
                                const decoder = new TextDecoder('utf-8');
                                for (let i = 0; i < count; i++) {
                                    if (cPos + 4 > pos + len) break;
                                    const cLen = view.getUint32(cPos, true);
                                    cPos += 4;
                                    if (cPos + cLen > pos + len) break;
                                    const comment = decoder.decode(uint8.subarray(cPos, cPos + cLen));
                                    cPos += cLen;
                                    const eq = comment.indexOf('=');
                                    if (eq !== -1) {
                                        const k = comment.substring(0, eq).toUpperCase();
                                        const v = comment.substring(eq + 1).trim();
                                        if (k === 'TITLE') meta.title = v;
                                        else if (k === 'ARTIST') meta.artist = v;
                                        else if (k === 'ALBUM_ARTIST' && !meta.artist) meta.artist = v;
                                        else if (k === 'ALBUM') meta.album = v;
                                        else if (k === 'GENRE') meta.genre = v;
                                        else if (k === 'DATE' || k === 'YEAR') {
                                            const m = v.match(/\d{4}/);
                                            if (m) meta.year = parseInt(m[0], 10);
                                        }
                                        else if (k === 'TRACKNUMBER' || k === 'TRACK') meta.track = v.replace(/\/\d+$/, '');
                                        else if (k === 'LYRICS' || k === 'UNSYNCEDLYRICS') meta.lyrics = v;
                                    }
                                }
                            }
                        }
                    } else if (type === 6) { // PICTURE
                        let pPos = pos;
                        pPos += 4;
                        if (pPos + 4 <= pos + len) {
                            const mimeLen = view.getUint32(pPos, false);
                            pPos += 4;
                            const decoder = new TextDecoder('ascii');
                            const mime = decoder.decode(uint8.subarray(pPos, pPos + mimeLen)) || 'image/jpeg';
                            pPos += mimeLen;
                            const descLen = view.getUint32(pPos, false);
                            pPos += 4 + descLen + 16;
                            const picLen = view.getUint32(pPos, false);
                            pPos += 4;
                            if (pPos + picLen <= uint8.length) {
                                let binary = '';
                                const picBytes = uint8.subarray(pPos, pPos + picLen);
                                const chunk = 8192;
                                for (let i = 0; i < picBytes.length; i += chunk) {
                                    binary += String.fromCharCode.apply(null, picBytes.subarray(i, i + chunk));
                                }
                                meta.cover = 'data:' + mime + ';base64,' + btoa(binary);
                            }
                        }
                    }
                    pos += len;
                }
            } else if (uint8[0] === 0x49 && uint8[1] === 0x44 && uint8[2] === 0x33) {
                // MP3 ID3v2 Tag Extraction
                meta.format = 'MP3';
                const version = uint8[3];
                const tagSize = ((uint8[6] & 0x7F) << 21) | ((uint8[7] & 0x7F) << 14) | ((uint8[8] & 0x7F) << 7) | (uint8[9] & 0x7F);
                let pos = 10;
                const end = Math.min(uint8.length, 10 + tagSize);

                function decodeId3Text(bytes) {
                    if (!bytes || bytes.length <= 1) return '';
                    const enc = bytes[0];
                    const raw = bytes.subarray(1);
                    try {
                        if (enc === 1) return new TextDecoder('utf-16le').decode(raw).replace(/^\uFEFF/, '').replace(/\0+$/, '');
                        if (enc === 2) return new TextDecoder('utf-16be').decode(raw).replace(/^\uFEFF/, '').replace(/\0+$/, '');
                        if (enc === 3) return new TextDecoder('utf-8').decode(raw).replace(/\0+$/, '');
                        return new TextDecoder('iso-8859-1').decode(raw).replace(/\0+$/, '');
                    } catch (_) {
                        return '';
                    }
                }

                const asciiDec = new TextDecoder('ascii');
                while (pos + 10 <= end) {
                    const frameId = asciiDec.decode(uint8.subarray(pos, pos + 4));
                    if (frameId.charCodeAt(0) === 0 || frameId.trim() === '') break;
                    const frameSize = (version >= 4)
                        ? (((uint8[pos + 4] & 0x7F) << 21) | ((uint8[pos + 5] & 0x7F) << 14) | ((uint8[pos + 6] & 0x7F) << 7) | (uint8[pos + 7] & 0x7F))
                        : view.getUint32(pos + 4, false);
                    pos += 10;
                    if (frameSize <= 0 || pos + frameSize > end) break;

                    const frameData = uint8.subarray(pos, pos + frameSize);
                    pos += frameSize;

                    if (frameId === 'TIT2') meta.title = decodeId3Text(frameData);
                    else if (frameId === 'TPE1') meta.artist = decodeId3Text(frameData);
                    else if (frameId === 'TALB') meta.album = decodeId3Text(frameData);
                    else if (frameId === 'TCON') meta.genre = decodeId3Text(frameData).replace(/^\((\d+)\)$/, '$1');
                    else if (frameId === 'TYER' || frameId === 'TDRC') {
                        const m = decodeId3Text(frameData).match(/\d{4}/);
                        if (m) meta.year = parseInt(m[0], 10);
                    }
                    else if (frameId === 'TRCK') meta.track = decodeId3Text(frameData).replace(/\/\d+$/, '');
                    else if ((frameId === 'USLT' || frameId === 'ULT') && frameData.length > 4) {
                        const enc = frameData[0];
                        let dStart = 4;
                        if (enc === 1 || enc === 2) {
                            while (dStart + 1 < frameData.length && !(frameData[dStart] === 0 && frameData[dStart + 1] === 0)) dStart += 2;
                            dStart += 2;
                        } else {
                            while (dStart < frameData.length && frameData[dStart] !== 0) dStart++;
                            dStart += 1;
                        }
                        const lyricBytes = frameData.subarray(dStart);
                        try {
                            if (enc === 1) meta.lyrics = new TextDecoder('utf-16le').decode(lyricBytes).replace(/^\uFEFF/, '').trim();
                            else if (enc === 2) meta.lyrics = new TextDecoder('utf-16be').decode(lyricBytes).replace(/^\uFEFF/, '').trim();
                            else if (enc === 3) meta.lyrics = new TextDecoder('utf-8').decode(lyricBytes).trim();
                            else meta.lyrics = new TextDecoder('iso-8859-1').decode(lyricBytes).trim();
                        } catch (_) {}
                    }
                    else if (frameId === 'APIC' && frameData.length > 10) {
                        const enc = frameData[0];
                        let mEnd = 1;
                        while (mEnd < frameData.length && frameData[mEnd] !== 0) mEnd++;
                        const mime = asciiDec.decode(frameData.subarray(1, mEnd)) || 'image/jpeg';
                        let dStart = mEnd + 2;
                        if (enc === 1 || enc === 2) {
                            while (dStart + 1 < frameData.length && !(frameData[dStart] === 0 && frameData[dStart + 1] === 0)) dStart += 2;
                            dStart += 2;
                        } else {
                            while (dStart < frameData.length && frameData[dStart] !== 0) dStart++;
                            dStart += 1;
                        }
                        const picBytes = frameData.subarray(dStart);
                        if (picBytes.length > 50) {
                            let binary = '';
                            const chunk = 8192;
                            for (let i = 0; i < picBytes.length; i += chunk) {
                                binary += String.fromCharCode.apply(null, picBytes.subarray(i, i + chunk));
                            }
                            meta.cover = 'data:' + mime + ';base64,' + btoa(binary);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Local tag parse error:', e);
        }

        return meta;
    }


    async function scanDirectory(path, autoSelectTrack = true, isSilentBoot = false) {
        const cleanPath = (path || '').trim();
        let errorNotice = '';
        if (!isSilentBoot) {
            showTrackLoadingOverlay(
                'LOADING MUSIC LIBRARY...',
                cleanPath ? `Scanning "${cleanPath}" and indexing track metadata...` : 'Checking saved music directory...'
            );
        }
        setScanStatus(cleanPath ? `Scanning "${cleanPath}"...` : 'Checking saved music directory...', false);

        if (activeScanAbortController) {
            try { activeScanAbortController.abort(); } catch (_) {}
        }
        activeScanAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

        try {
            const endpoint = cleanPath ? `php/api/scan.php?directory=${encodeURIComponent(cleanPath)}` : 'php/api/scan.php';
            const res = await fetch(endpoint, activeScanAbortController ? { signal: activeScanAbortController.signal } : {});
            if (isTrackLoadingCancelled) {
                hideTrackLoadingOverlay();
                return;
            }
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.tracks) && data.tracks.length > 0) {
                    if (dismissedTracksMap.size > 0) {
                        allTracks = data.tracks.filter(t => !dismissedTracksMap.has(t.fullPath || t.filename || t.id));
                    } else {
                        allTracks = data.tracks;
                    }
                    const activeDir = data.directory || cleanPath;
                    if (folderPathInput) folderPathInput.value = activeDir;
                    const settingsTabFolderPathInput = document.getElementById('settingsTabFolderPathInput');
                    if (settingsTabFolderPathInput) settingsTabFolderPathInput.value = activeDir;
                    if (activeDir) {
                        try {
                            safeStorage.setItem('cachymusic_last_directory', activeDir);
                            safeStorage.setItem('cachymusic_directory_mode', 'server');
                        } catch (_) {}
                    }
                    setScanStatus(`Scanned ${data.count} audio tracks from ${activeDir}`, false);
                } else if (data.needsDirectory) {
                    setScanStatus('No music directory selected yet. Choose a directory to load tracks.', false);
                } else if (!data.success) {
                    errorNotice = data.message || 'Directory scan failed.';
                    setScanStatus(`${errorNotice} Please configure the directory manually in Settings → Library & Folders.`, true);
                } else {
                    errorNotice = cleanPath ? `No supported audio files found in "${cleanPath}".` : '';
                    setScanStatus(
                        cleanPath
                            ? `No supported audio files found in "${cleanPath}". Please configure your folder manually in Settings → Library & Folders.`
                            : 'Choose a music directory to load tracks.',
                        Boolean(cleanPath)
                    );
                }
            } else {
                errorNotice = `Could not read directory (HTTP ${res.status}).`;
                setScanStatus(`${errorNotice} Please configure it manually in Settings → Library & Folders.`, true);
            }
        } catch (err) {
            if (err && err.name === 'AbortError') {
                hideTrackLoadingOverlay();
                return;
            }
            console.warn('Scan API error:', err);
            if (!isSilentBoot) {
                errorNotice = 'Unable to scan directory.';
                setScanStatus('Unable to scan directory. Please configure it manually in Settings → Library & Folders.', true);
            }
        } finally {
            hideTrackLoadingOverlay();
        }

        updateEmptyPlayerState(errorNotice);
        applySearchAndSort();
        if (allTracks.length > 0 && autoSelectTrack) {
            let targetIdx = 0;
            const urlParams = new URLSearchParams(window.location.search);
            const reqTrack = urlParams.get('track');
            if (reqTrack !== null && !isNaN(parseInt(reqTrack, 10)) && allTracks[parseInt(reqTrack, 10)]) {
                targetIdx = parseInt(reqTrack, 10);
            } else if (currentTrackIndex >= 0 && allTracks[currentTrackIndex]) {
                targetIdx = currentTrackIndex;
            }
            loadTrack(targetIdx, false);
            if (isLyricsView) {
                updateLyricsDisplay(allTracks[targetIdx]);
            }
        }
    }

    function setScanStatus(msg, isError) {
        if (scanStatus) {
            scanStatus.textContent = msg;
            scanStatus.style.color = isError ? '#ff4d4d' : '#888888';
        }
        const settingsTabScanStatus = document.getElementById('settingsTabScanStatus');
        if (settingsTabScanStatus) {
            settingsTabScanStatus.textContent = msg;
            settingsTabScanStatus.style.color = isError ? '#ff4d4d' : 'var(--accent-color, #00f0ff)';
        }
    }

    // Load User Playlists
    async function loadPlaylists() {
        try {
            const res = await fetch('php/api/playlists.php');
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.playlists)) {
                    playlists = data.playlists;
                    try { safeStorage.setItem('cachymusic_cached_playlists', JSON.stringify(playlists)); } catch (e) {}
                    renderPlaylistsView();
                    return;
                }
            }
        } catch (e) {
            console.warn('Could not load playlists from backend, attempting offline fallback:', e);
        }

        // Offline / client-side fallback
        try {
            const local = JSON.parse(safeStorage.getItem('cachymusic_cached_playlists') || '[]');
            if (Array.isArray(local) && local.length > 0) {
                playlists = local;
                renderPlaylistsView();
            }
        } catch (e) {}
    }

    // ID3 Genre Normalization Table & Multi-Field Search Engine
    const ID3_GENRE_MAP = {
        0: 'Blues', 1: 'Classic Rock', 2: 'Country', 3: 'Dance', 4: 'Disco', 5: 'Funk',
        6: 'Grunge', 7: 'Hip-Hop', 8: 'Jazz', 9: 'Metal', 10: 'New Age', 11: 'Oldies',
        12: 'Other', 13: 'Pop', 14: 'R&B', 15: 'Rap', 16: 'Reggae', 17: 'Rock',
        18: 'Techno', 19: 'Industrial', 20: 'Alternative', 21: 'Ska', 22: 'Death Metal',
        23: 'Pranks', 24: 'Soundtrack', 25: 'Euro-Techno', 26: 'Ambient', 27: 'Trip-Hop',
        28: 'Vocal', 29: 'Jazz+Funk', 30: 'Fusion', 31: 'Trance', 32: 'Classical',
        33: 'Instrumental', 34: 'Acid', 35: 'House', 36: 'Game', 37: 'Sound Clip',
        38: 'Gospel', 39: 'Noise', 40: 'AlternRock', 41: 'Bass', 42: 'Soul',
        43: 'Punk', 44: 'Space', 45: 'Meditative', 46: 'Instrumental Pop',
        47: 'Instrumental Rock', 48: 'Ethnic', 49: 'Gothic', 50: 'Darkwave',
        51: 'Techno-Industrial', 52: 'Electronic', 53: 'Pop-Folk', 54: 'Eurodance',
        55: 'Dream', 56: 'Southern Rock', 57: 'Comedy', 58: 'Cult', 59: 'Gangsta',
        60: 'Top 40', 61: 'Christian Rap', 62: 'Pop/Funk', 63: 'Jungle',
        64: 'Native American', 65: 'Cabaret', 66: 'New Wave', 67: 'Psychadelic',
        68: 'Rave', 69: 'Showtunes', 70: 'Trailer', 71: 'Lo-Fi', 72: 'Tribal',
        73: 'Acid Punk', 74: 'Acid Jazz', 75: 'Polka', 76: 'Retro', 77: 'Musical',
        78: 'Rock & Roll', 79: 'Hard Rock'
    };

    function normalizeGenre(rawGenre) {
        if (!rawGenre) return '';
        const str = String(rawGenre).trim();
        const match = str.match(/^\(?(\d+)\)?$/);
        if (match) {
            const id = parseInt(match[1], 10);
            if (ID3_GENRE_MAP[id]) return ID3_GENRE_MAP[id];
        }
        const combinedMatch = str.match(/^\((\d+)\)\s*(.*)$/);
        if (combinedMatch) {
            const id = parseInt(combinedMatch[1], 10);
            const rest = combinedMatch[2].trim();
            const mapped = ID3_GENRE_MAP[id];
            return mapped ? (rest ? `${mapped} ${rest}` : mapped) : (rest || str);
        }
        return str;
    }

    function getTrackSearchString(t) {
        if (t._searchStr !== undefined) return t._searchStr;
        const title = t.title || '';
        const artist = t.artist || '';
        const album = t.album || '';
        const rawGenre = t.genre || '';
        const normGenre = normalizeGenre(rawGenre);
        const genrePart = normGenre ? (rawGenre.toLowerCase() !== normGenre.toLowerCase() ? `${rawGenre} ${normGenre}` : rawGenre) : rawGenre;
        const filename = t.filename || '';
        t._searchStr = `${title} ${artist} ${album} ${genrePart} ${filename}`.toLowerCase();
        return t._searchStr;
    }

    // Search and Sort Engine with Dedicated Web Worker Offloading
    let libraryWorker = null;
    let libraryWorkerRequestId = 0;

    function getLibraryWorker() {
        if (!libraryWorker && typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
            try {
                const workerCode = `
                    self.onmessage = function(e) {
                        const { requestId, tracks, query, sort, formatFilter, currentPlaylistId } = e.data;
                        let pool = tracks.slice();

                        if (currentPlaylistId !== null) {
                            pool = pool.filter(t => t.inCurrentPlaylist);
                        }

                        if (formatFilter && formatFilter !== 'all') {
                            pool = pool.filter(t => {
                                const fmt = (t.format || '').toLowerCase();
                                const ext = (t.filename || '').split('.').pop().toLowerCase();
                                const bd = t.bitDepth || ((t.sampleRate && t.sampleRate >= 88200) ? 24 : 16);
                                const sr = t.sampleRate || 0;

                                if (formatFilter === 'hires') {
                                    return (bd >= 24) || (sr >= 88200) || ['dsd', 'dsf'].includes(fmt) || ['dsd', 'dsf'].includes(ext);
                                } else if (formatFilter === 'lossless') {
                                    return ['flac', 'wav', 'alac', 'aiff', 'ape', 'wv', 'dsd', 'dsf'].includes(fmt) ||
                                           ['flac', 'wav', 'alac', 'aiff', 'ape', 'wv'].includes(ext);
                                } else if (formatFilter === 'lossy') {
                                    return ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma'].includes(fmt) ||
                                           ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wma'].includes(ext);
                                }
                                return true;
                            });
                        }

                        if (query && query.trim() !== '') {
                            const rawQ = query.toLowerCase().trim();
                            const isGenre = rawQ.startsWith('genre:');
                            const q = isGenre ? rawQ.slice(6).trim() : rawQ;
                            const words = q.split(/\\s+/).filter(Boolean);

                            pool = pool.filter(t => {
                                if (isGenre) {
                                    const g = (t.genre || '').toLowerCase();
                                    return words.every(w => g.includes(w));
                                }
                                const str = (t.searchStr || '').toLowerCase();
                                return words.every(w => str.includes(w));
                            });
                        }

                        switch (sort) {
                            case 'title-asc':
                                pool.sort((a, b) => (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                                break;
                            case 'title-desc':
                                pool.sort((a, b) => (b.title || b.filename || '').localeCompare(a.title || a.filename || ''));
                                break;
                            case 'artist-asc':
                                pool.sort((a, b) => (a.artist || 'Unknown').localeCompare(b.artist || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                                break;
                            case 'artist-desc':
                                pool.sort((a, b) => (b.artist || 'Unknown').localeCompare(a.artist || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                                break;
                            case 'album-asc':
                                pool.sort((a, b) => (a.album || 'Unknown').localeCompare(b.album || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                                break;
                            case 'album-desc':
                                pool.sort((a, b) => (b.album || 'Unknown').localeCompare(a.album || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                                break;
                            case 'duration-asc':
                                pool.sort((a, b) => (a.duration || 0) - (b.duration || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                                break;
                            case 'duration-desc':
                                pool.sort((a, b) => (b.duration || 0) - (a.duration || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                                break;
                            case 'year-desc':
                                pool.sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                                break;
                            case 'year-asc':
                                pool.sort((a, b) => (parseInt(a.year, 10) || 0) - (parseInt(b.year, 10) || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                                break;
                            case 'default':
                            default:
                                break;
                        }

                        const resultIndices = pool.map(t => t.origIdx);
                        self.postMessage({ requestId, resultIndices });
                    };
                `;
                const blob = new Blob([workerCode], { type: 'application/javascript' });
                libraryWorker = new Worker(URL.createObjectURL(blob));
                libraryWorker.onmessage = function(e) {
                    if (e.data && e.data.requestId === libraryWorkerRequestId) {
                        const indices = e.data.resultIndices;
                        displayedTracks = indices.map(i => allTracks[i]).filter(Boolean);
                        renderTrackList();
                    }
                };
            } catch (e) {
                console.warn('Worker creation failed, falling back to sync search', e);
                libraryWorker = null;
            }
        }
        return libraryWorker;
    }

    function applySearchAndSort() {
        const worker = getLibraryWorker();
        if (worker && allTracks.length > 200) {
            const reqId = ++libraryWorkerRequestId;
            const lightweightTracks = allTracks.map((t, idx) => {
                return {
                    origIdx: idx,
                    title: t.title,
                    artist: t.artist,
                    album: t.album,
                    genre: normalizeGenre(t.genre) || t.genre,
                    filename: t.filename,
                    format: t.format,
                    bitDepth: t.bitDepth,
                    sampleRate: t.sampleRate,
                    duration: t.duration,
                    year: t.year,
                    inCurrentPlaylist: Boolean(t.inCurrentPlaylist),
                    searchStr: getTrackSearchString(t)
                };
            });
            worker.postMessage({
                requestId: reqId,
                tracks: lightweightTracks,
                query: searchQuery,
                sort: currentSort,
                formatFilter: currentFormatFilter,
                currentPlaylistId
            });
            return;
        }

        let pool = [...allTracks];

        // Filter by Current Playlist
        if (currentPlaylistId !== null) {
            pool = pool.filter(t => t.inCurrentPlaylist);
        }

        // Filter by Quality Format (ALL, HI-RES, LOSSLESS, MP3/AAC)
        if (currentFormatFilter && currentFormatFilter !== 'all') {
            pool = pool.filter(t => {
                const fmt = (t.format || '').toLowerCase();
                const ext = (t.filename || '').split('.').pop().toLowerCase();
                const bd = t.bitDepth || ((t.sampleRate && t.sampleRate >= 88200) ? 24 : 16);
                const sr = t.sampleRate || 0;

                if (currentFormatFilter === 'hires') {
                    return (bd >= 24) || (sr >= 88200) || ['dsd', 'dsf'].includes(fmt) || ['dsd', 'dsf'].includes(ext);
                } else if (currentFormatFilter === 'lossless') {
                    return ['flac', 'wav', 'alac', 'aiff', 'ape', 'wv', 'dsd', 'dsf'].includes(fmt) ||
                           ['flac', 'wav', 'alac', 'aiff', 'ape', 'wv'].includes(ext);
                } else if (currentFormatFilter === 'lossy') {
                    return ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma'].includes(fmt) ||
                           ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wma'].includes(ext);
                }
                return true;
            });
        }

        // Filter by Search Query (Title, Artist, Album, Genre, Filename)
        if (searchQuery.trim() !== '') {
            const rawQ = searchQuery.toLowerCase().trim();
            const isGenre = rawQ.startsWith('genre:');
            const q = isGenre ? rawQ.slice(6).trim() : rawQ;
            const words = q.split(/\s+/).filter(Boolean);

            pool = pool.filter(t => {
                if (isGenre) {
                    const g = (t.genre ? `${t.genre} ${normalizeGenre(t.genre)}` : '').toLowerCase();
                    return words.every(w => g.includes(w));
                }
                const searchStr = getTrackSearchString(t);
                return words.every(w => searchStr.includes(w));
            });
        }

        // Apply Sorting
        switch (currentSort) {
            case 'title-asc':
                pool.sort((a, b) => (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                break;
            case 'title-desc':
                pool.sort((a, b) => (b.title || b.filename || '').localeCompare(a.title || a.filename || ''));
                break;
            case 'artist-asc':
                pool.sort((a, b) => (a.artist || 'Unknown').localeCompare(b.artist || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                break;
            case 'artist-desc':
                pool.sort((a, b) => (b.artist || 'Unknown').localeCompare(a.artist || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                break;
            case 'album-asc':
                pool.sort((a, b) => (a.album || 'Unknown').localeCompare(b.album || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                break;
            case 'album-desc':
                pool.sort((a, b) => (b.album || 'Unknown').localeCompare(a.album || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                break;
            case 'duration-asc':
                pool.sort((a, b) => (a.duration || 0) - (b.duration || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                break;
            case 'duration-desc':
                pool.sort((a, b) => (b.duration || 0) - (a.duration || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                break;
            case 'year-desc':
                pool.sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                break;
            case 'year-asc':
                pool.sort((a, b) => (parseInt(a.year, 10) || 0) - (parseInt(b.year, 10) || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                break;
            case 'default':
            default:
                break;
        }

        displayedTracks = pool;
        renderTrackList();
    }

    // Interactive Floating Toast Notification System

    function updateRestoreBtnUi() {
        if (!restoreTracksBtn) return;
        if (dismissedTracksMap.size > 0) {
            restoreTracksBtn.style.display = 'inline-flex';
            restoreTracksBtn.textContent = `RESTORE (${dismissedTracksMap.size})`;
        } else {
            restoreTracksBtn.style.display = 'none';
        }
    }

    // Remove track from active main tracks list (NOT deleting the physical file)
    function removeTrackFromMainList(track) {
        const key = track.fullPath || track.filename || track.id;
        const idxInAll = allTracks.findIndex(t => (track.tid && t.tid == track.tid) || (track.fullPath && t.fullPath === track.fullPath) || (t.id == track.id) || (t.filename === track.filename));
        if (idxInAll === -1) return;

        const removedTrack = allTracks[idxInAll];
        dismissedTracksMap.set(key, { track: removedTrack, originalIndex: idxInAll });
        allTracks.splice(idxInAll, 1);

        // If the removed track is currently loaded/playing in the deck
        if (currentTrackIndex === idxInAll) {
            if (allTracks.length > 0) {
                const nextIdx = Math.min(idxInAll, allTracks.length - 1);
                loadTrack(nextIdx, !audio.paused);
            } else {
                audio.src = '';
                pauseAudio();
                updateEmptyPlayerState();
            }
        } else if (currentTrackIndex > idxInAll) {
            currentTrackIndex--;
        }

        applySearchAndSort();
        updateRestoreBtnUi();

        const trackTitle = removedTrack.title || removedTrack.filename || 'Track';
        showToast(
            `Removed "${trackTitle}" from list (file remains safe on disk)`,
            'UNDO',
            () => {
                dismissedTracksMap.delete(key);
                const insertIdx = Math.min(idxInAll, allTracks.length);
                allTracks.splice(insertIdx, 0, removedTrack);
                updateEmptyPlayerState();
                applySearchAndSort();
                updateRestoreBtnUi();
                showToast(`Restored "${trackTitle}" to list`);
            }
        );
    }

    // Delegated trackList interaction handler
    let isTrackListDelegated = false;
    function initTrackListDelegation() {
        if (isTrackListDelegated || !trackList) return;
        isTrackListDelegated = true;
        trackList.addEventListener('click', (e) => {
            const emptyChooseBtn = e.target.closest('#emptyTrackListChooseDirBtn');
            if (emptyChooseBtn) {
                const chooseTrigger = document.getElementById('playerChooseDirBtn') || document.getElementById('settingsChooseFolderBtn') || browseFolderBtn;
                if (chooseTrigger) chooseTrigger.click();
                return;
            }
            const emptySettingsBtn = e.target.closest('#emptyTrackListOpenSettingsBtn');
            if (emptySettingsBtn) {
                switchWorkspace('settings');
                const libCatBtn = document.querySelector('#settingsCategoryNav .settingsCatBtn[data-cat="library"]');
                if (libCatBtn) libCatBtn.click();
                return;
            }
            const emptyBrowseBtn = e.target.closest('#emptyBrowseTracksBtn');
            if (emptyBrowseBtn) {
                const plName = currentPlaylistName;
                backToAllTracks();
                showToast(`Browse library and click "+" on any song to add it to "${plName}".`);
                return;
            }

            const trackMenuTrigger = e.target.closest('.trackMenuTriggerBtn');
            if (trackMenuTrigger) {
                e.stopPropagation();
                const item = trackMenuTrigger.closest('.trackItem');
                const idx = item ? parseInt(item.dataset.index, 10) : -1;
                const track = displayedTracks[idx];
                if (track) openTrackActionMenu(track, idx);
                return;
            }

            const playNextBtn = e.target.closest('.playNextTrackBtn');
            if (playNextBtn) {
                e.stopPropagation();
                const item = playNextBtn.closest('.trackItem');
                const idx = item ? parseInt(item.dataset.index, 10) : -1;
                const track = displayedTracks[idx];
                if (track) addToQueue(track, true);
                return;
            }

            const enqueueBtn = e.target.closest('.enqueueTrackBtn');
            if (enqueueBtn) {
                e.stopPropagation();
                const item = enqueueBtn.closest('.trackItem');
                const idx = item ? parseInt(item.dataset.index, 10) : -1;
                const track = displayedTracks[idx];
                if (track) addToQueue(track, false);
                return;
            }

            const openAddModalBtn = e.target.closest('.openAddModalBtn');
            if (openAddModalBtn) {
                e.stopPropagation();
                const item = openAddModalBtn.closest('.trackItem');
                const idx = item ? parseInt(item.dataset.index, 10) : -1;
                const track = displayedTracks[idx];
                if (track) openAddToPlaylistModal(track);
                return;
            }

            const removeMainTrackBtn = e.target.closest('.removeMainTrackBtn');
            if (removeMainTrackBtn) {
                e.stopPropagation();
                const item = removeMainTrackBtn.closest('.trackItem');
                const idx = item ? parseInt(item.dataset.index, 10) : -1;
                const track = displayedTracks[idx];
                if (track) removeTrackFromMainList(track);
                return;
            }

            const removePlaylistBtn = e.target.closest('.removePlaylistBtn');
            if (removePlaylistBtn) {
                e.stopPropagation();
                const item = removePlaylistBtn.closest('.trackItem');
                const idx = item ? parseInt(item.dataset.index, 10) : -1;
                const track = displayedTracks[idx];
                if (track) removeTrackFromCurrentPlaylist(track);
                return;
            }

            const item = e.target.closest('.trackItem');
            if (item && !e.target.closest('.addPlaylistBtn') && !e.target.closest('.actionPillBtn') && !e.target.closest('.trackMenuTriggerBtn')) {
                const idx = parseInt(item.dataset.index, 10);
                const track = displayedTracks[idx];
                if (track) {
                    const masterIdx = allTracks.findIndex(t => {
                        if (track.id && t.id) return t.id === track.id;
                        if (track.tid && t.tid) return t.tid === track.tid;
                        return t.filename === track.filename;
                    });
                    if (masterIdx !== -1) {
                        loadTrack(masterIdx, true);
                    }
                }
            }
        });
    }

    // =========================================================================
    // VIRTUAL SCROLLING ENGINE (O(1) Memory, 60/144 FPS with 10k-100k Tracks)
    // =========================================================================
    const VIRTUAL_ROW_HEIGHT = 65.2; // 59.6px card + 5.6px gap
    const VIRTUAL_BUFFER_ROWS = 8;   // Render 8 buffer items above/below viewport
    let isVirtualScrollBound = false;
    let isVirtualScrollPending = false;
    let virtualTrackState = {
        startIndex: -1,
        endIndex: -1
    };

    function renderVirtualTrackWindow(force = false) {
        if (!trackList) return;
        const total = displayedTracks.length;
        if (total === 0) return;

        const viewportHeight = trackList.clientHeight || 600;
        const scrollTop = trackList.scrollTop || 0;
        const visibleCount = Math.ceil(viewportHeight / VIRTUAL_ROW_HEIGHT);
        const rawStart = Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT);
        const startIndex = Math.max(0, rawStart - VIRTUAL_BUFFER_ROWS);
        const endIndex = Math.min(total, rawStart + visibleCount + VIRTUAL_BUFFER_ROWS);

        if (!force && startIndex === virtualTrackState.startIndex && endIndex === virtualTrackState.endIndex) {
            return;
        }
        virtualTrackState.startIndex = startIndex;
        virtualTrackState.endIndex = endIndex;

        const spacerTop = document.getElementById('trackSpacerTop');
        const spacerBottom = document.getElementById('trackSpacerBottom');
        const container = document.getElementById('trackItemsContainer');

        if (spacerTop) spacerTop.style.height = `${startIndex * VIRTUAL_ROW_HEIGHT}px`;
        if (spacerBottom) spacerBottom.style.height = `${Math.max(0, (total - endIndex) * VIRTUAL_ROW_HEIGHT)}px`;

        if (!container) return;

        const cur = allTracks[currentTrackIndex];

        function buildTrackItemElement(track, idx, isCurrent) {
            const item = document.createElement('div');
            item.className = `trackItem ${isCurrent ? 'active' : ''}`;
            item.dataset.id = track.id || track.tid || track.filename || '';
            item.dataset.index = idx;

            const coverSrc = track.cover ? (track.cover + (track.cover.includes('?') ? '&thumb=1' : '?thumb=1')) : 'resources/images/default.svg';
            const displayTitle = track.title ? escapeHtml(track.title) : escapeHtml(track.filename || 'Unknown');
            const displayArtist = track.artist ? escapeHtml(track.artist) : 'Unknown';
            const displayAlbum = track.album ? ` • ${escapeHtml(track.album)}` : '';

            item.innerHTML = `
                <span class="trackIndex">${idx + 1 < 10 ? '0' : ''}${idx + 1}</span>
                <div class="miniEq">
                    <span></span><span></span><span></span>
                </div>
                <img src="${escapeHtml(coverSrc)}" alt="Cover" class="trackThumb" width="40" height="40" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='resources/images/default.svg'">
                <div class="trackDetails">
                    <div class="trackTitle">${displayTitle}</div>
                    <div class="trackArtist">${displayArtist}${displayAlbum}</div>
                </div>
                <span class="trackDuration">${formatTime(track.duration)}</span>
                <div class="trackItemActions">
                    <button type="button" class="trackActionIconBtn actionPillBtn playNextTrackBtn" title="Play Next" data-index="${idx}">⤹</button>
                    <button type="button" class="trackActionIconBtn actionPillBtn enqueueTrackBtn" title="Add to Queue" data-index="${idx}">+Q</button>
                    ${currentPlaylistId !== null ? `
                        <button type="button" class="trackActionIconBtn addPlaylistBtn danger removePlaylistBtn" title="Remove from playlist" data-id="${escapeHtml(track.id)}">✕</button>
                    ` : `
                        <button type="button" class="trackActionIconBtn addPlaylistBtn openAddModalBtn" title="Add to playlist" data-id="${escapeHtml(track.id)}">+</button>
                        <button type="button" class="trackActionIconBtn addPlaylistBtn danger removeMainTrackBtn" title="Remove track from list (does not delete file)" data-id="${escapeHtml(track.id)}">✕</button>
                    `}
                </div>
                <button type="button" class="trackMenuTriggerBtn" title="Track options" aria-label="Track options for ${displayTitle}" data-index="${idx}">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="2.2"></circle>
                        <circle cx="12" cy="12" r="2.2"></circle>
                        <circle cx="12" cy="19" r="2.2"></circle>
                    </svg>
                </button>
            `;
            return item;
        }

        if (force) {
            container.innerHTML = '';
            const frag = document.createDocumentFragment();
            for (let idx = startIndex; idx < endIndex; idx++) {
                const track = displayedTracks[idx];
                if (!track) continue;
                const isCurrent = cur && (
                    (cur.id && track.id) ? cur.id === track.id :
                    ((cur.tid && track.tid) ? cur.tid === track.tid : cur.filename === track.filename)
                );
                frag.appendChild(buildTrackItemElement(track, idx, isCurrent));
            }
            container.appendChild(frag);
            return;
        }

        // Keyed DOM reconciliation: Keep already-rendered rows intact so images do not flicker or re-download
        const existingRows = new Map();
        for (const child of Array.from(container.children)) {
            const rowIdx = parseInt(child.dataset.index, 10);
            if (!isNaN(rowIdx) && rowIdx >= startIndex && rowIdx < endIndex) {
                existingRows.set(rowIdx, child);
                const curTrack = displayedTracks[rowIdx];
                if (curTrack) {
                    const isCurrent = cur && (
                        (cur.id && curTrack.id) ? cur.id === curTrack.id :
                        ((cur.tid && curTrack.tid) ? cur.tid === curTrack.tid : cur.filename === curTrack.filename)
                    );
                    child.classList.toggle('active', !!isCurrent);
                }
            } else {
                child.remove();
            }
        }

        for (let idx = startIndex; idx < endIndex; idx++) {
            if (existingRows.has(idx)) continue;
            const track = displayedTracks[idx];
            if (!track) continue;
            const isCurrent = cur && (
                (cur.id && track.id) ? cur.id === track.id :
                ((cur.tid && track.tid) ? cur.tid === track.tid : cur.filename === track.filename)
            );
            const newItem = buildTrackItemElement(track, idx, isCurrent);

            let inserted = false;
            for (let nextIdx = idx + 1; nextIdx < endIndex; nextIdx++) {
                const nextRow = existingRows.get(nextIdx);
                if (nextRow && nextRow.parentNode === container) {
                    container.insertBefore(newItem, nextRow);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                container.appendChild(newItem);
            }
            existingRows.set(idx, newItem);
        }
    }

    function initVirtualScrollListener() {
        if (isVirtualScrollBound || !trackList) return;
        isVirtualScrollBound = true;
        trackList.style.overflowAnchor = 'none';
        trackList.addEventListener('scroll', () => {
            if (isVirtualScrollPending) return;
            isVirtualScrollPending = true;
            requestAnimationFrame(() => {
                isVirtualScrollPending = false;
                renderVirtualTrackWindow();
            });
        }, { passive: true });
    }

    function scrollToTrackIndex(index, smooth = false) {
        if (!trackList || index < 0 || index >= displayedTracks.length) return;
        const targetTop = Math.max(0, (index * VIRTUAL_ROW_HEIGHT) - (trackList.clientHeight / 2 - VIRTUAL_ROW_HEIGHT / 2));
        if (smooth) {
            trackList.scrollTo({ top: targetTop, behavior: 'smooth' });
        } else {
            trackList.scrollTop = targetTop;
        }
        renderVirtualTrackWindow(true);
    }

    // Render Track List with Virtual Windowing
    function renderTrackList(preserveScroll = false) {
        initTrackListDelegation();
        initVirtualScrollListener();
        trackCount.textContent = `${displayedTracks.length} TRACK${displayedTracks.length === 1 ? '' : 'S'}`;

        if (displayedTracks.length === 0) {
            trackList.innerHTML = '';
            virtualTrackState.startIndex = -1;
            virtualTrackState.endIndex = -1;
            if (currentPlaylistId !== null) {
                trackList.innerHTML = `
                    <div class="emptyPlaylistNotice">
                        <div class="emptyPlaylistIcon">🎵</div>
                        <h3 class="emptyPlaylistTitle">"${escapeHtml(currentPlaylistName)}" is empty</h3>
                        <p class="emptyPlaylistDesc">Add songs to this playlist from your library by clicking the "+" button next to any track in ALL TRACKS.</p>
                        <button type="button" class="actionBtn primaryBtn emptyBrowseBtn" id="emptyBrowseTracksBtn">
                            ← BROWSE ALL TRACKS
                        </button>
                    </div>
                `;
            } else if (allTracks.length === 0) {
                trackList.innerHTML = `
                    <div class="emptyLibraryNotice">
                        <h3 class="emptyPlaylistTitle">No Music Directory Loaded</h3>
                        <p class="emptyPlaylistDesc">Choose your music directory first to load tracks. In case of error, configure the folder manually in <strong>Settings &rarr; Library &amp; Folders</strong>.</p>
                        <div class="emptyLibraryActions">
                            <button type="button" class="actionBtn primaryBtn" id="emptyTrackListChooseDirBtn">CHOOSE DIRECTORY</button>
                            <button type="button" class="actionBtn" id="emptyTrackListOpenSettingsBtn">MANUAL SETTINGS</button>
                        </div>
                    </div>
                `;
            } else {
                trackList.innerHTML = `
                    <div style="padding: 2.5rem 1rem; text-align: center; color: #cbd5e1; font-size: 1.05rem;">
                        No tracks found matching your query.
                    </div>
                `;
            }
            return;
        }

        if (!preserveScroll) {
            trackList.scrollTop = 0;
        }

        // Initialize Virtual Container Skeleton if not present
        if (!document.getElementById('trackItemsContainer')) {
            trackList.innerHTML = `
                <div class="trackListSpacerTop" id="trackSpacerTop" style="height: 0px; overflow-anchor: none;"></div>
                <div class="trackListItemsContainer" id="trackItemsContainer" style="overflow-anchor: none;"></div>
                <div class="trackListSpacerBottom" id="trackSpacerBottom" style="height: 0px; overflow-anchor: none;"></div>
            `;
        }

        renderVirtualTrackWindow(true);
    }

    // =========================================================================
    // MusicBee & Musicolet Style Playlist Management Engine
    // Upfront cards with 1-tap play, shuffle, queue, and batch song management
    // =========================================================================

    function formatPlaylistEstDuration(totalSeconds) {
        if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '0 MINS';
        const mins = Math.floor(totalSeconds / 60);
        if (mins < 60) return `${mins} MIN${mins === 1 ? '' : 'S'}`;
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;
        return `${hrs} HR${hrs === 1 ? '' : 'S'} ${remMins} MIN${remMins === 1 ? '' : 'S'}`;
    }

    function renderPlaylistsView() {
        if (!playlistList) return;
        playlistList.innerHTML = '';

        const summaryBadge = document.getElementById('playlistsSummaryBadge');
        if (summaryBadge) {
            const totalTracks = playlists.reduce((acc, p) => acc + (p.track_count || 0), 0);
            summaryBadge.textContent = `${playlists.length} Playlist${playlists.length === 1 ? '' : 's'} • ${totalTracks} Track${totalTracks === 1 ? '' : 's'}`;
        }

        if (playlists.length === 0) {
            playlistList.innerHTML = `
                <div class="playlistEmptyContainer">
                    <div class="playlistEmptyIcon">📂</div>
                    <div class="playlistEmptyTitle">No playlists yet</div>
                    <div class="playlistEmptyDesc">Use the quick presets above or type a name to create your first high-fidelity playlist!</div>
                </div>
            `;
            return;
        }

        playlists.forEach(pl => {
            const count = pl.track_count || 0;
            const estMins = Math.round(count * 3.6);
            const estText = estMins > 0 ? (estMins >= 60 ? `~${Math.floor(estMins / 60)}h ${estMins % 60}m` : `~${estMins} mins`) : '0 mins';

            const card = document.createElement('div');
            card.className = 'playlistCardItem richPlaylistCard';
            card.dataset.plid = pl.plid;
            card.innerHTML = `
                <div class="playlistCardTopRow">
                    <div class="playlistCardArtwork">
                        <span class="playlistIcon">🎵</span>
                    </div>
                    <div class="playlistCardMain">
                        <div class="playlistCardTitleRow">
                            <span class="playlistCardName">${escapeHtml(pl.name)}</span>
                        </div>
                        <div class="playlistCardMetaRow">
                            <span class="playlistMetaPill">${count} TRACK${count === 1 ? '' : 'S'}</span>
                            <span class="playlistMetaDuration">${estText}</span>
                        </div>
                    </div>
                    <button type="button" class="playlistCardDeleteBtn" title="Delete playlist" aria-label="Delete playlist ${escapeHtml(pl.name)}" data-plid="${pl.plid}">
                        ✕
                    </button>
                </div>
                <div class="playlistCardQuickActions">
                    <button type="button" class="playlistActionPlayBtn" title="Play entire playlist now" data-plid="${pl.plid}">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
                        <span>PLAY</span>
                    </button>
                    <button type="button" class="playlistActionShuffleBtn" title="Shuffle playlist" data-plid="${pl.plid}">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
                        <span>SHUFFLE</span>
                    </button>
                    <button type="button" class="playlistActionQueueBtn" title="Add all tracks to play queue" data-plid="${pl.plid}">
                        <span>+ QUEUE</span>
                    </button>
                </div>
            `;

            // Card body opens playlist
            const mainBody = card.querySelector('.playlistCardMain');
            const artBody = card.querySelector('.playlistCardArtwork');
            [mainBody, artBody].forEach(el => {
                if (el) el.addEventListener('click', () => openPlaylist(pl.plid, pl.name));
            });

            // Action: 1-Tap Play
            const playBtn = card.querySelector('.playlistActionPlayBtn');
            if (playBtn) {
                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    playPlaylistDirectly(pl.plid, pl.name, false);
                });
            }

            // Action: 1-Tap Shuffle
            const shufBtn = card.querySelector('.playlistActionShuffleBtn');
            if (shufBtn) {
                shufBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    playPlaylistDirectly(pl.plid, pl.name, true);
                });
            }

            // Action: Add to Queue
            const qBtn = card.querySelector('.playlistActionQueueBtn');
            if (qBtn) {
                qBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    queuePlaylistTracks(pl.plid, pl.name);
                });
            }

            // Action: Delete Playlist
            const delBtn = card.querySelector('.playlistCardDeleteBtn');
            if (delBtn) {
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete playlist "${pl.name}"?`)) return;
                    try {
                        const res = await fetch('php/api/playlists.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'delete', plid: pl.plid })
                        });
                        const data = await res.json();
                        if (data.success) {
                            playlists = playlists.filter(p => p.plid != pl.plid);
                            if (currentPlaylistId == pl.plid) {
                                backToPlaylistsView();
                            }
                            renderPlaylistsView();
                            showToast(`Deleted playlist "${pl.name}".`);
                        }
                    } catch (err) {
                        console.warn('Delete playlist error:', err);
                    }
                });
            }

            playlistList.appendChild(card);
        });
    }

    // Play Entire Playlist Directly
    async function playPlaylistDirectly(plid, name, shuffle = false) {
        await openPlaylist(plid, name);
        const plTracks = displayedTracks.filter(t => t.inCurrentPlaylist);
        if (plTracks.length === 0) {
            showToast(`Playlist "${name}" is empty. Add songs first!`);
            return;
        }

        if (shuffle) {
            const shuffled = [...plTracks].sort(() => Math.random() - 0.5);
            const first = shuffled[0];
            const masterIdx = allTracks.findIndex(t => (first.id && t.id == first.id) || (first.tid && t.tid == first.tid) || t.filename === first.filename);
            if (masterIdx !== -1) {
                loadTrack(masterIdx, true);
                playQueue = shuffled.slice(1);
                updateQueueUi();
                showToast(`Shuffled "${name}" (${shuffled.length} tracks)`);
            }
        } else {
            const first = plTracks[0];
            const masterIdx = allTracks.findIndex(t => (first.id && t.id == first.id) || (first.tid && t.tid == first.tid) || t.filename === first.filename);
            if (masterIdx !== -1) {
                loadTrack(masterIdx, true);
                playQueue = plTracks.slice(1);
                updateQueueUi();
                showToast(`Playing playlist "${name}"`);
            }
        }
    }

    // Queue All Tracks in Playlist
    async function queuePlaylistTracks(plid, name) {
        try {
            const res = await fetch(`php/api/playlists.php?plid=${plid}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.tracks) && data.tracks.length > 0) {
                    data.tracks.forEach(track => {
                        let existing = allTracks.find(t => (track.id && t.id == track.id) || (track.tid && t.tid == track.tid) || t.filename === track.filename);
                        if (!existing) {
                            allTracks.push(track);
                            existing = track;
                        }
                        playQueue.push(existing);
                    });
                    updateQueueUi();
                    showToast(`Queued ${data.tracks.length} tracks from "${name}"`);
                    return;
                }
            }
        } catch (e) {
            console.warn('Queue playlist error:', e);
        }
        showToast(`Could not queue tracks from "${name}"`);
    }

    // Open Specific Playlist
    async function openPlaylist(plid, name) {
        currentPlaylistId = plid;
        currentPlaylistName = name;
        activeListLabel.textContent = `PLAYLIST: ${name.toUpperCase()}`;
        currentPlaylistTitle.textContent = name;

        try {
            safeStorage.setItem('cachymusic_last_playlist_id', plid.toString());
            safeStorage.setItem('cachymusic_last_playlist_name', name || '');
        } catch (_) {}

        const quickFormatBar = document.getElementById('quickFormatFilterBar');
        tabPlaylists.classList.remove('active');
        tabLibrary.classList.add('active');
        playlistsView.style.display = 'none';
        libraryControls.style.display = 'none';
        if (quickFormatBar) quickFormatBar.style.display = 'flex';
        playlistBanner.style.display = 'flex';
        trackList.style.display = 'flex';

        try {
            const res = await fetch(`php/api/playlists.php?plid=${plid}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.tracks)) {
                    data.tracks.forEach(plTrack => {
                        let existing = allTracks.find(t => t.tid == plTrack.tid || (t.fullPath && t.fullPath === plTrack.fullPath));
                        if (!existing) {
                            allTracks.push(plTrack);
                            existing = plTrack;
                        }
                        existing.inCurrentPlaylist = true;
                    });
                    const plTrackTids = data.tracks.map(t => parseInt(t.tid, 10));
                    allTracks.forEach(t => {
                        if (!plTrackTids.includes(parseInt(t.tid, 10)) && !plTrackTids.includes(parseInt(t.id, 10))) {
                            t.inCurrentPlaylist = false;
                        }
                    });

                    // Update playlist banner duration metadata
                    const metaEl = document.getElementById('currentPlaylistMeta');
                    if (metaEl) {
                        const totalSecs = data.tracks.reduce((sum, t) => sum + (t.duration || 210), 0);
                        metaEl.textContent = `${data.tracks.length} TRACK${data.tracks.length === 1 ? '' : 'S'} • ${formatPlaylistEstDuration(totalSecs)}`;
                    }
                }
            }
        } catch (e) {
            console.warn('Error fetching playlist tracks:', e);
        }

        applySearchAndSort();
    }

    // Return to All Playlists View (Musicolet & MusicBee Style)
    function backToPlaylistsView() {
        currentPlaylistId = null;
        currentPlaylistName = '';
        activeListLabel.textContent = 'ALL TRACKS';
        allTracks.forEach(t => t.inCurrentPlaylist = false);

        try {
            safeStorage.removeItem('cachymusic_last_playlist_id');
            safeStorage.removeItem('cachymusic_last_playlist_name');
        } catch (_) {}

        const quickFormatBar = document.getElementById('quickFormatFilterBar');
        playlistBanner.style.display = 'none';
        trackList.style.display = 'none';
        if (queueView) queueView.style.display = 'none';
        libraryControls.style.display = 'none';
        if (quickFormatBar) quickFormatBar.style.display = 'none';
        tabLibrary.classList.remove('active');
        if (tabQueue) tabQueue.classList.remove('active');
        tabPlaylists.classList.add('active');
        playlistsView.style.display = 'flex';
        renderPlaylistsView();
    }

    // Return to All Tracks Library View
    function backToAllTracks() {
        currentPlaylistId = null;
        currentPlaylistName = '';
        activeListLabel.textContent = 'ALL TRACKS';
        allTracks.forEach(t => t.inCurrentPlaylist = false);

        try {
            safeStorage.removeItem('cachymusic_last_playlist_id');
            safeStorage.removeItem('cachymusic_last_playlist_name');
        } catch (_) {}

        const quickFormatBar = document.getElementById('quickFormatFilterBar');
        playlistBanner.style.display = 'none';
        libraryControls.style.display = 'flex';
        if (quickFormatBar) quickFormatBar.style.display = 'flex';
        applySearchAndSort();
    }

    // =========================================================================
    // Modal History & State Navigation Engine (W3C PWA & Android Hardware Back)
    // =========================================================================
    function pushModalState(modalId) {
        try {
            history.pushState({ cachyModal: modalId }, '');
        } catch (_) {}
    }

    function popModalState(modalId) {
        try {
            if (history.state && history.state.cachyModal === modalId) {
                history.back();
            }
        } catch (_) {}
    }

    window.addEventListener('popstate', (e) => {
        // If a modal was open when user pressed back, dismiss it cleanly
        const themeModalEl = document.getElementById('themeModal');
        if (themeModalEl && (themeModalEl.style.display === 'flex' || window.getComputedStyle(themeModalEl).display === 'flex')) {
            themeModalEl.style.display = 'none';
            return;
        }
        const peqModalEl = document.getElementById('peqModal');
        if (peqModalEl && (peqModalEl.style.display === 'flex' || window.getComputedStyle(peqModalEl).display === 'flex')) {
            peqModalEl.style.display = 'none';
            return;
        }
        const playlistModalEl = document.getElementById('playlistModal');
        if (playlistModalEl && (playlistModalEl.style.display === 'flex' || window.getComputedStyle(playlistModalEl).display === 'flex')) {
            playlistModalEl.style.display = 'none';
            return;
        }
        const trackActionMenuModalEl = document.getElementById('trackActionMenuModal');
        if (trackActionMenuModalEl && (trackActionMenuModalEl.style.display === 'flex' || window.getComputedStyle(trackActionMenuModalEl).display === 'flex')) {
            trackActionMenuModalEl.style.display = 'none';
            return;
        }
        const signalPathModalEl = document.getElementById('signalPathModal');
        if (signalPathModalEl && (signalPathModalEl.style.display === 'flex' || window.getComputedStyle(signalPathModalEl).display === 'flex')) {
            signalPathModalEl.style.display = 'none';
            return;
        }
        const sleepTimerModalEl = document.getElementById('sleepTimerModal');
        if (sleepTimerModalEl && (sleepTimerModalEl.style.display === 'flex' || window.getComputedStyle(sleepTimerModalEl).display === 'flex')) {
            sleepTimerModalEl.style.display = 'none';
            return;
        }
        const slskAccountModalEl = document.getElementById('slskAccountModal');
        if (slskAccountModalEl && (slskAccountModalEl.style.display === 'flex' || window.getComputedStyle(slskAccountModalEl).display === 'flex')) {
            slskAccountModalEl.style.display = 'none';
            return;
        }
        const batchModalEl = document.getElementById('batchAddSongsModal');
        if (batchModalEl && (batchModalEl.style.display === 'flex' || window.getComputedStyle(batchModalEl).display === 'flex')) {
            batchModalEl.style.display = 'none';
            return;
        }
        const metadataEditorModalEl = document.getElementById('metadataEditorModal');
        if (metadataEditorModalEl && (metadataEditorModalEl.style.display === 'flex' || window.getComputedStyle(metadataEditorModalEl).display === 'flex')) {
            metadataEditorModalEl.style.display = 'none';
            return;
        }
    });

    function openSlskAccountModal() {
        const modal = document.getElementById('slskAccountModal');
        if (!modal) return;
        modal.style.display = 'flex';
        if (typeof pushModalState === 'function') pushModalState('slskAccountModal');
    }

    function closeSlskAccountModal() {
        const modal = document.getElementById('slskAccountModal');
        if (!modal) return;
        modal.style.display = 'none';
        if (typeof popModalState === 'function') popModalState('slskAccountModal');
    }

    // =========================================================================
    // Batch Add Songs Modal Engine (Musicolet & MusicBee Style)
    // =========================================================================
    function openBatchAddModal() {
        if (!currentPlaylistId) return;
        const modal = document.getElementById('batchAddSongsModal');
        const titleEl = document.getElementById('batchAddModalTitle');
        const listEl = document.getElementById('batchAddTracksList');
        const searchInput = document.getElementById('batchAddSearchInput');
        const summaryEl = document.getElementById('batchAddSummaryText');
        if (!modal || !listEl) return;

        if (titleEl) titleEl.textContent = `ADD SONGS TO "${(currentPlaylistName || 'PLAYLIST').toUpperCase()}"`;
        if (searchInput) searchInput.value = '';

        const renderBatchList = (filterStr = '') => {
            listEl.innerHTML = '';
            const f = filterStr.toLowerCase().trim();
            const filtered = allTracks.filter(t => {
                if (!f) return true;
                const target = `${t.title || t.filename || ''} ${t.artist || ''} ${t.album || ''}`.toLowerCase();
                return target.includes(f);
            });

            if (filtered.length === 0) {
                listEl.innerHTML = '<div class="batchAddEmpty">No tracks matched your search.</div>';
                return;
            }

            const currentCount = allTracks.filter(t => t.inCurrentPlaylist).length;
            if (summaryEl) summaryEl.textContent = `${currentCount} song${currentCount === 1 ? '' : 's'} in playlist`;

            filtered.slice(0, 150).forEach(track => {
                const row = document.createElement('div');
                row.className = 'batchAddRow';
                const isInPlaylist = Boolean(track.inCurrentPlaylist);
                row.innerHTML = `
                    <img src="${escapeHtml(track.cover || 'resources/images/default.svg')}" alt="" class="batchAddThumb" width="40" height="40" loading="lazy" decoding="async">
                    <div class="batchAddInfo">
                        <span class="batchAddTitle">${escapeHtml(track.title || track.filename || 'Unknown')}</span>
                        <span class="batchAddArtist">${escapeHtml(track.artist || 'Unknown')}${track.album ? ' • ' + escapeHtml(track.album) : ''}</span>
                    </div>
                    <span class="batchAddDuration">${formatTime(track.duration)}</span>
                    <button type="button" class="batchAddToggleBtn ${isInPlaylist ? 'isAdded' : ''}">
                        ${isInPlaylist ? '✓ ADDED' : '+ ADD'}
                    </button>
                `;

                const toggleBtn = row.querySelector('.batchAddToggleBtn');
                toggleBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (track.inCurrentPlaylist) {
                        await removeTrackFromCurrentPlaylist(track);
                        toggleBtn.classList.remove('isAdded');
                        toggleBtn.textContent = '+ ADD';
                    } else {
                        toggleBtn.textContent = '...';
                        const ok = await addTrackToPlaylist(currentPlaylistId, track.tid || track.id, track);
                        if (ok) {
                            track.inCurrentPlaylist = true;
                            toggleBtn.classList.add('isAdded');
                            toggleBtn.textContent = '✓ ADDED';
                        } else {
                            toggleBtn.textContent = '+ ADD';
                        }
                    }
                    const updatedCount = allTracks.filter(t => t.inCurrentPlaylist).length;
                    if (summaryEl) summaryEl.textContent = `${updatedCount} song${updatedCount === 1 ? '' : 's'} in playlist`;
                    const metaEl = document.getElementById('currentPlaylistMeta');
                    if (metaEl) metaEl.textContent = `${updatedCount} TRACK${updatedCount === 1 ? '' : 'S'}`;
                });

                listEl.appendChild(row);
            });
        };

        renderBatchList();

        let searchDebounceTimer = null;
        if (searchInput) {
            searchInput.oninput = () => {
                if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => {
                    renderBatchList(searchInput.value);
                }, 100);
            };
        }

        modal.style.display = 'flex';
        pushModalState('batchAddSongsModal');
        if (searchInput) setTimeout(() => searchInput.focus(), 60);
    }

    function closeBatchAddModal() {
        const modal = document.getElementById('batchAddSongsModal');
        if (modal) modal.style.display = 'none';
        popModalState('batchAddSongsModal');
        applySearchAndSort();
    }

    // =========================================================================
    // Up Next / Dynamic Play Queue Engine
    // Apple Music & Plexamp-grade intuitive queueing with drag/order control
    // =========================================================================
    function addToQueue(track, playNext = false) {
        if (!track) return;
        if (playNext) {
            playQueue.unshift(track);
            showToast(`Playing next: "${track.title || track.filename}"`);
        } else {
            playQueue.push(track);
            showToast(`Added to queue: "${track.title || track.filename}"`);
        }
        updateQueueUi();
    }

    function removeFromQueue(index) {
        if (index >= 0 && index < playQueue.length) {
            const removed = playQueue.splice(index, 1)[0];
            updateQueueUi();
            showToast(`Removed "${removed.title || removed.filename}" from queue`);
        }
    }

    function moveQueueItem(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= playQueue.length || toIndex < 0 || toIndex >= playQueue.length) return;
        const [item] = playQueue.splice(fromIndex, 1);
        playQueue.splice(toIndex, 0, item);
        updateQueueUi();
    }

    function clearQueue() {
        if (playQueue.length === 0) return;
        playQueue = [];
        updateQueueUi();
        showToast('Play queue cleared');
    }

    function updateQueueUi() {
        if (queueCountBadge) {
            queueCountBadge.textContent = playQueue.length > 0 ? playQueue.length : '';
            queueCountBadge.style.display = playQueue.length > 0 ? 'inline-flex' : 'none';
        }
        if (queueCountSummary) {
            queueCountSummary.textContent = `${playQueue.length} song${playQueue.length === 1 ? '' : 's'} queued`;
        }
        if (queueView && queueView.style.display !== 'none') {
            renderQueueView();
        }
    }

    function renderQueueView() {
        if (!queueList) return;
        if (playQueue.length === 0) {
            queueList.innerHTML = '<div class="queueEmpty">Your queue is empty. Click "+ Queue" or "⤹ Next" on any track.</div>';
        } else {
            const frag = document.createDocumentFragment();
            playQueue.forEach((track, idx) => {
                const item = document.createElement('div');
                item.className = 'queueItem';
                const coverSrc = track.cover || 'resources/images/default.svg';
                const displayTitle = track.title ? escapeHtml(track.title) : escapeHtml(track.filename || 'Unknown');
                const displayArtist = track.artist ? escapeHtml(track.artist) : 'Unknown';

                item.innerHTML = `
                    <span class="queueIndex">#${idx + 1}</span>
                    <img src="${escapeHtml(coverSrc)}" alt="Cover" class="queueThumb" width="40" height="40" loading="lazy" decoding="async">
                    <div class="queueDetails">
                        <div class="queueTitle">${displayTitle}</div>
                        <div class="queueArtist">${displayArtist}</div>
                    </div>
                    <span class="queueDuration">${formatTime(track.duration)}</span>
                    <div class="queueItemActions">
                        ${idx > 0 ? `<button type="button" class="queueMoveBtn moveUpBtn" data-idx="${idx}" title="Move up">▲</button>` : ''}
                        ${idx < playQueue.length - 1 ? `<button type="button" class="queueMoveBtn moveDownBtn" data-idx="${idx}" title="Move down">▼</button>` : ''}
                        <button type="button" class="queuePlayNowBtn" data-idx="${idx}" title="Play now">▶</button>
                        <button type="button" class="queueRemoveBtn" data-idx="${idx}" title="Remove from queue">✕</button>
                    </div>
                `;
                frag.appendChild(item);
            });
            queueList.innerHTML = '';
            queueList.appendChild(frag);
        }

        // Render Continuing from Library Preview
        if (upcomingLibraryList) {
            const pool = displayedTracks.length > 0 ? displayedTracks : allTracks;
            let curIdx = pool.findIndex(t => {
                const cur = allTracks[currentTrackIndex];
                if (!cur) return false;
                if (cur.id && t.id) return t.id === cur.id;
                if (cur.tid && t.tid) return t.tid === cur.tid;
                return t.filename === cur.filename;
            });

            const upcoming = [];
            if (pool.length > 0 && curIdx !== -1) {
                for (let i = 1; i <= Math.min(5, pool.length - 1); i++) {
                    const nextIdx = (curIdx + i) % pool.length;
                    upcoming.push(pool[nextIdx]);
                }
            }

            if (upcoming.length === 0) {
                upcomingLibraryList.innerHTML = '<div class="queueEmptyUpcoming">End of active track list reached</div>';
            } else {
                const uFrag = document.createDocumentFragment();
                upcoming.forEach((track) => {
                    const uItem = document.createElement('div');
                    uItem.className = 'queueItem upcomingItem';
                    const coverSrc = track.cover || 'resources/images/default.svg';
                    const displayTitle = track.title ? escapeHtml(track.title) : escapeHtml(track.filename || 'Unknown');
                    const displayArtist = track.artist ? escapeHtml(track.artist) : 'Unknown';
                    const tId = track.id || track.tid || track.filename;
                    uItem.innerHTML = `
                        <span class="queueIndex libraryOrder">»</span>
                        <img src="${escapeHtml(coverSrc)}" alt="Cover" class="queueThumb" width="40" height="40" loading="lazy" decoding="async">
                        <div class="queueDetails">
                            <div class="queueTitle">${displayTitle}</div>
                            <div class="queueArtist">${displayArtist}</div>
                        </div>
                        <span class="queueDuration">${formatTime(track.duration)}</span>
                        <div class="queueItemActions">
                            <button type="button" class="actionPillBtn enqueueUpcomingBtn" data-id="${escapeHtml(tId)}" title="Pin to top of Queue">+ Queue</button>
                        </div>
                    `;
                    uFrag.appendChild(uItem);
                });
                upcomingLibraryList.innerHTML = '';
                upcomingLibraryList.appendChild(uFrag);
            }
        }
    }

    // =========================================================================

    // Track Actions & Options Context Menu Engine (Mobile Bottom Sheet & Menu)
    // =========================================================================
    let selectedTrackForMenu = null;
    let selectedTrackIndexForMenu = -1;

    function openTrackActionMenu(track, idx) {
        if (!track) return;
        selectedTrackForMenu = track;
        selectedTrackIndexForMenu = idx;

        const modal = document.getElementById('trackActionMenuModal');
        const thumb = document.getElementById('trackMenuThumb');
        const title = document.getElementById('trackMenuTitle');
        const artist = document.getElementById('trackMenuArtist');
        const formatPill = document.getElementById('trackMenuFormatPill');
        const durationPill = document.getElementById('trackMenuDurationPill');
        const removeLabel = document.getElementById('trackMenuRemoveLabel');
        const removeSub = document.getElementById('trackMenuRemoveSub');

        if (!modal) return;

        if (thumb) {
            thumb.src = track.cover ? (track.cover + (track.cover.includes('?') ? '&thumb=1' : '?thumb=1')) : 'resources/images/default.svg';
        }
        if (title) {
            title.textContent = track.title || track.filename || 'Unknown Track';
        }
        if (artist) {
            const art = track.artist || 'Unknown Artist';
            const alb = track.album ? ` • ${track.album}` : '';
            artist.textContent = `${art}${alb}`;
        }
        if (formatPill) {
            formatPill.textContent = (track.format || 'AUDIO').toUpperCase();
        }
        if (durationPill) {
            durationPill.textContent = formatTime(track.duration);
        }

        if (removeLabel && removeSub) {
            if (currentPlaylistId !== null) {
                removeLabel.textContent = `Remove from Playlist`;
                removeSub.textContent = `Remove from "${currentPlaylistName || 'Playlist'}"`;
            } else {
                removeLabel.textContent = `Remove from Library List`;
                removeSub.textContent = `Hide from current list (does not delete file)`;
            }
        }

        modal.style.display = 'flex';
        pushModalState('trackActionMenuModal');
    }

    function closeTrackActionMenu() {
        const modal = document.getElementById('trackActionMenuModal');
        if (modal) modal.style.display = 'none';
        popModalState('trackActionMenuModal');
        selectedTrackForMenu = null;
        selectedTrackIndexForMenu = -1;
    }

    // =========================================================================
    // Track Metadata & ID3 Tag Editor
    // =========================================================================
    let currentEditingTrack = null;
    let pendingMetadataPayload = null;

    function updateTrackMetadataDisplay(track) {
        if (!track) return;
        try { window.currentInspectedTrack = track; } catch (_) {}
        if (statTitle) statTitle.textContent = track.title ? track.title : (track.filename || 'Unknown');
        if (statArtist) statArtist.textContent = track.artist ? track.artist : 'Unknown';
        if (statAlbum) statAlbum.textContent = track.album ? track.album : 'Unknown';
        if (statGenre) statGenre.textContent = (typeof normalizeGenre === 'function' ? normalizeGenre(track.genre) : track.genre) || 'N/A';
        if (statYear) statYear.textContent = track.year ? track.year.toString() : 'N/A';
        if (statTrack) statTrack.textContent = (track.track || track.track_num) ? (track.track || track.track_num).toString() : 'N/A';
        if (statBitrate) statBitrate.textContent = track.bitrate ? `${track.bitrate} kbps` : 'N/A';
        if (statSampleRate) statSampleRate.textContent = track.sampleRate ? `${track.sampleRate} Hz` : 'N/A';
        if (statBitDepth) {
            const bd = track.bitDepth || ((track.sampleRate && track.sampleRate >= 88200) ? 24 : 16);
            statBitDepth.textContent = bd ? `${bd}-Bit` : 'N/A';
        }
        if (statChannels) {
            statChannels.textContent = track.channels === 2 ? 'Stereo' : (track.channels === 1 ? 'Mono' : (track.channels ? `${track.channels} ch` : 'N/A'));
        }
        if (statFormat) statFormat.textContent = track.format ? track.format.toUpperCase() : 'N/A';
        if (statSize) statSize.textContent = track.size ? track.size : 'N/A';
        if (statPath) {
            statPath.textContent = track.filename ? track.filename : 'N/A';
            statPath.title = track.fullPath || track.filename || 'N/A';
        }
        if (coverArtPreview) {
            coverArtPreview.src = track.cover ? track.cover : 'resources/images/default.svg';
        }
    }

    function openMetadataEditor(track) {
        if (!track) {
            showToast('No track selected to edit metadata.');
            return;
        }
        currentEditingTrack = track;
        pendingMetadataPayload = null;

        const modal = document.getElementById('metadataEditorModal');
        const thumb = document.getElementById('metaEditorThumb');
        const fileTitle = document.getElementById('metaEditorFileTitle');
        const filePath = document.getElementById('metaEditorFilePath');
        const formatPill = document.getElementById('metaEditorFormatPill');
        const bitratePill = document.getElementById('metaEditorBitratePill');
        const sampleRatePill = document.getElementById('metaEditorSampleRatePill');
        const bitDepthPill = document.getElementById('metaEditorBitDepthPill');
        const statusEl = document.getElementById('metaEditorStatus');
        const form = document.getElementById('metaEditorForm');
        const confirmCard = document.getElementById('metaEditorConfirmCard');
        const saveBtn = document.getElementById('metaEditSaveBtn');
        const proceedBtn = document.getElementById('metaEditConfirmProceedBtn');
        const cancelConfirmBtn = document.getElementById('metaEditConfirmCancelBtn');

        const inputTitle = document.getElementById('metaEditTitle');
        const inputArtist = document.getElementById('metaEditArtist');
        const inputAlbum = document.getElementById('metaEditAlbum');
        const inputGenre = document.getElementById('metaEditGenre');
        const inputYear = document.getElementById('metaEditYear');
        const inputTrackNum = document.getElementById('metaEditTrackNum');
        const inputComment = document.getElementById('metaEditComment');

        if (!modal) return;

        // Reset confirmation card and display form
        if (confirmCard) confirmCard.style.setProperty('display', 'none', 'important');
        if (form) form.style.setProperty('display', 'block', 'important');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'SAVE METADATA';
        }
        if (proceedBtn) {
            proceedBtn.disabled = false;
            proceedBtn.textContent = 'YES, WRITE & SAVE';
        }
        if (cancelConfirmBtn) {
            cancelConfirmBtn.disabled = false;
        }

        // Populate thumbnail
        if (thumb) {
            thumb.src = track.cover ? (track.cover + (track.cover.includes('?') ? '&thumb=1' : '?thumb=1')) : 'resources/images/default.svg';
        }

        // Summary Title & Path
        if (fileTitle) fileTitle.textContent = track.title || track.filename || 'Untitled Track';
        if (filePath) filePath.textContent = track.fullPath || track.filename || 'Local Audio Track';

        // Technical Spec Badges
        if (formatPill) formatPill.textContent = (track.format || 'AUDIO').toUpperCase();
        if (bitratePill) bitratePill.textContent = track.bitrate ? `${track.bitrate} kbps` : 'N/A';
        if (sampleRatePill) {
            const sr = track.sampleRate;
            sampleRatePill.textContent = sr ? (sr >= 1000 ? `${(sr / 1000).toFixed(1)} kHz` : `${sr} Hz`) : '44.1 kHz';
        }
        if (bitDepthPill) {
            const bd = track.bitDepth || ((track.sampleRate && track.sampleRate >= 88200) ? 24 : 16);
            bitDepthPill.textContent = `${bd}-Bit`;
        }

        // Clear status alert
        if (statusEl) {
            statusEl.style.display = 'none';
            statusEl.textContent = '';
            statusEl.className = 'metaEditorStatus';
        }

        // Populate form inputs
        if (inputTitle) inputTitle.value = track.title || '';
        if (inputArtist) inputArtist.value = track.artist || '';
        if (inputAlbum) inputAlbum.value = track.album || '';
        if (inputGenre) inputGenre.value = track.genre || '';
        if (inputYear) inputYear.value = (track.year && track.year > 0) ? track.year : '';
        if (inputTrackNum) inputTrackNum.value = (track.track || track.track_num) ? (track.track || track.track_num) : '';
        if (inputComment) inputComment.value = track.comment || '';

        modal.style.setProperty('display', 'flex', 'important');
        pushModalState('metadataEditorModal');

        if (window.innerWidth > 768 && inputTitle) {
            setTimeout(() => {
                try {
                    inputTitle.focus();
                    inputTitle.select();
                } catch (_) {}
            }, 60);
        }
    }

    function closeMetadataEditor() {
        const modal = document.getElementById('metadataEditorModal');
        if (modal) modal.style.setProperty('display', 'none', 'important');
        const confirmCard = document.getElementById('metaEditorConfirmCard');
        const form = document.getElementById('metaEditorForm');
        if (confirmCard) confirmCard.style.setProperty('display', 'none', 'important');
        if (form) form.style.setProperty('display', 'block', 'important');
        popModalState('metadataEditorModal');
        currentEditingTrack = null;
        pendingMetadataPayload = null;
    }

    function requestSaveMetadataConfirmation(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (!currentEditingTrack) return;

        const inputTitle = document.getElementById('metaEditTitle');
        const inputArtist = document.getElementById('metaEditArtist');
        const inputAlbum = document.getElementById('metaEditAlbum');
        const inputGenre = document.getElementById('metaEditGenre');
        const inputYear = document.getElementById('metaEditYear');
        const inputTrackNum = document.getElementById('metaEditTrackNum');
        const inputComment = document.getElementById('metaEditComment');
        const statusEl = document.getElementById('metaEditorStatus');
        const form = document.getElementById('metaEditorForm');
        const confirmCard = document.getElementById('metaEditorConfirmCard');
        const confirmSummary = document.getElementById('metaEditorConfirmSummary');
        const confirmDesc = document.getElementById('metaEditorConfirmDesc');

        const newTitle = (inputTitle ? inputTitle.value : '').trim();
        if (!newTitle) {
            if (statusEl) {
                statusEl.textContent = 'Track title cannot be empty.';
                statusEl.className = 'metaEditorStatus error';
                statusEl.style.display = 'block';
            }
            if (inputTitle) inputTitle.focus();
            return;
        }

        const newArtist = (inputArtist ? inputArtist.value : '').trim();
        const newAlbum = (inputAlbum ? inputAlbum.value : '').trim();
        const newGenre = (inputGenre ? inputGenre.value : '').trim();
        const newYear = inputYear && inputYear.value ? parseInt(inputYear.value, 10) : null;
        const newTrackNum = inputTrackNum && inputTrackNum.value ? parseInt(inputTrackNum.value, 10) : null;
        const newComment = (inputComment ? inputComment.value : '').trim();

        const track = currentEditingTrack;

        // Compile list of modifications
        const changes = [];
        const origTitle = (track.title || '').trim();
        const origArtist = (track.artist || '').trim();
        const origAlbum = (track.album || '').trim();
        const origGenre = (track.genre || '').trim();
        const origYear = (track.year && track.year > 0) ? parseInt(track.year, 10) : null;
        const origTrackNum = (track.track || track.track_num) ? parseInt(track.track || track.track_num, 10) : null;
        const origComment = (track.comment || '').trim();

        const escapeHtml = (str) => {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };

        if (newTitle !== origTitle) changes.push({ field: 'Title', from: origTitle || '(empty)', to: newTitle });
        if (newArtist !== origArtist) changes.push({ field: 'Artist', from: origArtist || '(empty)', to: newArtist || '(empty)' });
        if (newAlbum !== origAlbum) changes.push({ field: 'Album', from: origAlbum || '(empty)', to: newAlbum || '(empty)' });
        if (newGenre !== origGenre) changes.push({ field: 'Genre', from: origGenre || '(empty)', to: newGenre || '(empty)' });
        if (newYear !== origYear) changes.push({ field: 'Year', from: origYear ? String(origYear) : '(empty)', to: newYear ? String(newYear) : '(empty)' });
        if (newTrackNum !== origTrackNum) changes.push({ field: 'Track #', from: origTrackNum ? String(origTrackNum) : '(empty)', to: newTrackNum ? String(newTrackNum) : '(empty)' });
        if (newComment !== origComment) changes.push({ field: 'Comment', from: origComment || '(empty)', to: newComment || '(empty)' });

        pendingMetadataPayload = {
            newTitle,
            newArtist,
            newAlbum,
            newGenre,
            newYear,
            newTrackNum,
            newComment,
            targetTrack: track
        };

        if (confirmDesc) {
            confirmDesc.textContent = `Write ${changes.length} tag change${changes.length === 1 ? '' : 's'} to disk for "${escapeHtml(origTitle || track.filename || 'track')}"?`;
        }

        if (confirmSummary) {
            if (changes.length === 0) {
                confirmSummary.innerHTML = '<div class="metaEditNoChanges">No fields were modified. File tags already match.</div>';
            } else {
                confirmSummary.innerHTML = changes.map(ch => `
                    <div class="metaEditChangeRow">
                        <span class="metaEditChangeField">${escapeHtml(ch.field)}</span>
                        <span class="metaEditChangeFrom" title="${escapeHtml(ch.from)}">${escapeHtml(ch.from)}</span>
                        <span class="metaEditChangeArrow" aria-hidden="true">➔</span>
                        <span class="metaEditChangeTo" title="${escapeHtml(ch.to)}">${escapeHtml(ch.to)}</span>
                    </div>
                `).join('');
            }
        }

        // Switch view from form to confirmation card
        if (form) form.style.setProperty('display', 'none', 'important');
        if (confirmCard) confirmCard.style.setProperty('display', 'flex', 'important');
        const card = document.getElementById('metaEditorCard');
        if (card) card.scrollTop = 0;
    }

    function cancelMetadataConfirmation() {
        const form = document.getElementById('metaEditorForm');
        const confirmCard = document.getElementById('metaEditorConfirmCard');
        if (confirmCard) confirmCard.style.setProperty('display', 'none', 'important');
        if (form) form.style.setProperty('display', 'block', 'important');
    }

    async function executeSaveMetadata() {
        if (!pendingMetadataPayload || !pendingMetadataPayload.targetTrack) {
            cancelMetadataConfirmation();
            return;
        }

        const {
            newTitle,
            newArtist,
            newAlbum,
            newGenre,
            newYear,
            newTrackNum,
            newComment,
            targetTrack
        } = pendingMetadataPayload;

        const proceedBtn = document.getElementById('metaEditConfirmProceedBtn');
        const cancelConfirmBtn = document.getElementById('metaEditConfirmCancelBtn');

        if (proceedBtn) {
            proceedBtn.disabled = true;
            proceedBtn.textContent = 'WRITING TO DISK...';
        }
        if (cancelConfirmBtn) {
            cancelConfirmBtn.disabled = true;
        }

        const tid = targetTrack.tid || targetTrack.id || null;

        // Persist to backend PHP if tid is available
        if (tid && typeof fetch === 'function') {
            try {
                const resp = await fetch('php/api/metadata.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tid: tid,
                        title: newTitle,
                        artist: newArtist,
                        album: newAlbum,
                        genre: newGenre,
                        year: newYear,
                        track_num: newTrackNum,
                        comment: newComment
                    })
                });
                if (resp.ok) {
                    await resp.json().catch(() => null);
                }
            } catch (netErr) {
                console.warn('Backend metadata persistence skipped or offline:', netErr);
            }
        }

        // Update target track properties
        targetTrack.title = newTitle;
        targetTrack.artist = newArtist;
        targetTrack.album = newAlbum;
        targetTrack.genre = newGenre;
        targetTrack.year = newYear;
        targetTrack.track = newTrackNum;
        targetTrack.track_num = newTrackNum;
        targetTrack.comment = newComment;

        // Propagate across in-memory collections
        const updateInList = (list) => {
            if (!Array.isArray(list)) return;
            for (let i = 0; i < list.length; i++) {
                const t = list[i];
                if ((targetTrack.tid && t.tid === targetTrack.tid) ||
                    (targetTrack.fullPath && t.fullPath === targetTrack.fullPath) ||
                    (targetTrack.id && t.id === targetTrack.id)) {
                    t.title = newTitle;
                    t.artist = newArtist;
                    t.album = newAlbum;
                    t.genre = newGenre;
                    t.year = newYear;
                    t.track = newTrackNum;
                    t.track_num = newTrackNum;
                    t.comment = newComment;
                }
            }
        };

        updateInList(allTracks);
        updateInList(displayedTracks);
        updateInList(playQueue);

        // Persist to IndexedDB
        try {
            if (typeof saveLibraryToIndexedDB === 'function' && Array.isArray(allTracks) && allTracks.length > 0) {
                saveLibraryToIndexedDB(allTracks, (folderPathInput && folderPathInput.value) || '');
            }
        } catch (_) {}

        // Check if currently playing track was updated
        const activeTrack = (Array.isArray(allTracks) && allTracks[currentTrackIndex]) || null;
        const isCurrentPlaying = activeTrack && (
            (targetTrack.tid && activeTrack.tid === targetTrack.tid) ||
            (targetTrack.fullPath && activeTrack.fullPath === targetTrack.fullPath) ||
            (targetTrack.id && activeTrack.id === targetTrack.id)
        );

        if (isCurrentPlaying) {
            if (trackName) trackName.textContent = newTitle;
            if (artistName) artistName.textContent = newArtist || 'Unknown Artist';
            if (albumName) albumName.textContent = newAlbum || 'Unknown Album';
            if (lyricsTrackName) lyricsTrackName.textContent = newTitle;
            if (lyricsArtistName) lyricsArtistName.textContent = newArtist || 'Unknown Artist';
            if (miniTitle) miniTitle.textContent = newTitle;
            if (miniArtist) miniArtist.textContent = newArtist || 'Unknown Artist';

            // Update MediaSession
            if ('mediaSession' in navigator) {
                try {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: newTitle,
                        artist: newArtist || 'Unknown Artist',
                        album: newAlbum || 'CachyMusic Workstation',
                        artwork: targetTrack.cover ? [
                            { src: targetTrack.cover, sizes: '512x512', type: 'image/jpeg' }
                        ] : []
                    });
                } catch (_) {}
            }
        }

        // Always update Left Inspector Panel
        if (typeof updateTrackMetadataDisplay === 'function') {
            updateTrackMetadataDisplay(targetTrack);
        } else {
            if (statTitle) statTitle.textContent = newTitle;
            if (statArtist) statArtist.textContent = newArtist || 'Unknown';
            if (statAlbum) statAlbum.textContent = newAlbum || 'Unknown';
            if (statGenre) statGenre.textContent = (typeof normalizeGenre === 'function' ? normalizeGenre(newGenre) : newGenre) || 'N/A';
            if (statYear) statYear.textContent = newYear ? newYear.toString() : 'N/A';
            if (statTrack) statTrack.textContent = newTrackNum ? newTrackNum.toString() : 'N/A';
        }

        // Re-render track list DOM items
        renderVirtualTrackWindow(true);
        if (typeof updateQueueUi === 'function') updateQueueUi();

        closeMetadataEditor();
        showToast(`Metadata saved: "${newTitle}"`);
    }

    function saveMetadata(e) {
        return requestSaveMetadataConfirmation(e);
    }

    // Add Track to Playlist Modal
    function openAddToPlaylistModal(track) {
        selectedTrackForPlaylist = track;
        modalTrackTitle.textContent = `${track.title || track.filename} — ${track.artist || 'Unknown'}`;
        modalPlaylistList.innerHTML = '';

        // Quick Queue Actions (Ideal for mobile single-tap access & desktop)
        const quickActions = document.createElement('div');
        quickActions.className = 'modalQuickQueueActions';
        quickActions.innerHTML = `
            <button type="button" class="modalQuickQueueBtn" id="modalPlayNextBtn">⤹ Play Next</button>
            <button type="button" class="modalQuickQueueBtn" id="modalAddQueueBtn">+ Add to Queue</button>
        `;
        quickActions.querySelector('#modalPlayNextBtn').addEventListener('click', () => {
            addToQueue(track, true);
            closePlaylistModal();
            showToast(`Added to Play Next: "${track.title || track.filename}"`);
        });
        quickActions.querySelector('#modalAddQueueBtn').addEventListener('click', () => {
            addToQueue(track, false);
            closePlaylistModal();
            showToast(`Added to Up Next Queue: "${track.title || track.filename}"`);
        });
        modalPlaylistList.appendChild(quickActions);

        if (playlists.length === 0) {
            const emptyNotice = document.createElement('div');
            emptyNotice.className = 'modalPlaylistEmpty';
            emptyNotice.textContent = 'No playlists yet. Create your first one below:';
            modalPlaylistList.appendChild(emptyNotice);
        } else {
            playlists.forEach(pl => {
                const item = document.createElement('div');
                item.className = 'modalPlaylistItem';
                item.innerHTML = `
                    <span class="modalPlaylistInfo"><span class="modalPlaylistName">${escapeHtml(pl.name)}</span> <span class="modalPlaylistCount">(${pl.track_count || 0} tracks)</span></span>
                    <button type="button" class="modalPlaylistAddBtn" data-plid="${pl.plid}">+ ADD</button>
                `;

                const btn = item.querySelector('.modalPlaylistAddBtn');
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    btn.textContent = 'ADDING...';
                    const success = await addTrackToPlaylist(pl.plid, track.tid || track.id, track);
                    if (success) {
                        btn.textContent = '✓ ADDED';
                        btn.style.backgroundColor = '#00e676';
                        btn.style.color = '#000000';
                        setTimeout(() => closePlaylistModal(), 700);
                    } else {
                        btn.textContent = 'ALREADY IN PLAYLIST';
                        btn.style.backgroundColor = '#fff3e0';
                        btn.style.color = '#e65100';
                        btn.style.fontSize = '0.75rem';
                        btn.disabled = false;
                    }
                });

                modalPlaylistList.appendChild(item);
            });
        }

        playlistModal.style.display = 'flex';
        pushModalState('playlistModal');
        setTimeout(() => {
            if (modalNewPlaylistName) modalNewPlaylistName.focus();
        }, 100);
    }

    function closePlaylistModal() {
        playlistModal.style.display = 'none';
        popModalState('playlistModal');
        selectedTrackForPlaylist = null;
        modalNewPlaylistName.value = '';
    }

    async function addTrackToPlaylist(plid, tid, track = null) {
        try {
            const res = await fetch('php/api/playlists.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'add_track', plid, tid })
            });
            const data = await res.json();
            const p = playlists.find(x => x.plid == plid);
            const plName = p ? p.name : 'playlist';
            const trackName = track ? (track.title || track.filename) : 'Track';

            if (data.success) {
                if (p) p.track_count = (p.track_count || 0) + 1;
                renderPlaylistsView();
                showToast(`Added "${trackName}" to "${plName}".`);
                return true;
            } else {
                if (data.message === 'Track already in playlist.') {
                    showToast(`"${trackName}" is already in "${plName}".`);
                } else {
                    showToast(data.message || 'Could not add to playlist.');
                }
                return false;
            }
        } catch (e) {
            console.warn('Add track to playlist API error:', e);
            return false;
        }
    }

    async function removeTrackFromCurrentPlaylist(track) {
        if (!currentPlaylistId) return;
        try {
            await fetch('php/api/playlists.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove_track', plid: currentPlaylistId, tid: track.tid || track.id })
            });
            track.inCurrentPlaylist = false;
            const p = playlists.find(x => x.plid == currentPlaylistId);
            if (p && p.track_count > 0) p.track_count--;
            applySearchAndSort();
        } catch (e) {
            console.warn('Remove track API error:', e);
        }
    }

    // Attach library functions to window
    if (typeof window !== "undefined") {
        try { window.openLibraryIdb = openLibraryIdb; } catch (_) {}
        try { window.saveLibraryToIndexedDB = saveLibraryToIndexedDB; } catch (_) {}
        try { window.loadLibraryFromIndexedDB = loadLibraryFromIndexedDB; } catch (_) {}
        try { window.parseAudioFileMetadata = parseAudioFileMetadata; } catch (_) {}
        try { window.scanDirectory = scanDirectory; } catch (_) {}
        try { window.setScanStatus = setScanStatus; } catch (_) {}
        try { window.loadPlaylists = loadPlaylists; } catch (_) {}
        try { window.getLibraryWorker = getLibraryWorker; } catch (_) {}
        try { window.applySearchAndSort = applySearchAndSort; } catch (_) {}
        try { window.updateRestoreBtnUi = updateRestoreBtnUi; } catch (_) {}
        try { window.removeTrackFromMainList = removeTrackFromMainList; } catch (_) {}
        try { window.initTrackListDelegation = initTrackListDelegation; } catch (_) {}
        try { window.renderVirtualTrackWindow = renderVirtualTrackWindow; } catch (_) {}
        try { window.initVirtualScrollListener = initVirtualScrollListener; } catch (_) {}
        try { window.scrollToTrackIndex = scrollToTrackIndex; } catch (_) {}
        try { window.renderTrackList = renderTrackList; } catch (_) {}
        try { window.formatPlaylistEstDuration = formatPlaylistEstDuration; } catch (_) {}
        try { window.renderPlaylistsView = renderPlaylistsView; } catch (_) {}
        try { window.playPlaylistDirectly = playPlaylistDirectly; } catch (_) {}
        try { window.queuePlaylistTracks = queuePlaylistTracks; } catch (_) {}
        try { window.openPlaylist = openPlaylist; } catch (_) {}
        try { window.backToPlaylistsView = backToPlaylistsView; } catch (_) {}
        try { window.backToAllTracks = backToAllTracks; } catch (_) {}
        try { window.pushModalState = pushModalState; } catch (_) {}
        try { window.popModalState = popModalState; } catch (_) {}
        try { window.openSlskAccountModal = openSlskAccountModal; } catch (_) {}
        try { window.closeSlskAccountModal = closeSlskAccountModal; } catch (_) {}
        try { window.openBatchAddModal = openBatchAddModal; } catch (_) {}
        try { window.closeBatchAddModal = closeBatchAddModal; } catch (_) {}
        try { window.addToQueue = addToQueue; } catch (_) {}
        try { window.removeFromQueue = removeFromQueue; } catch (_) {}
        try { window.moveQueueItem = moveQueueItem; } catch (_) {}
        try { window.clearQueue = clearQueue; } catch (_) {}
        try { window.updateQueueUi = updateQueueUi; } catch (_) {}
        try { window.renderQueueView = renderQueueView; } catch (_) {}
        try { window.openTrackActionMenu = openTrackActionMenu; } catch (_) {}
        try { window.closeTrackActionMenu = closeTrackActionMenu; } catch (_) {}
        try { window.openAddToPlaylistModal = openAddToPlaylistModal; } catch (_) {}
        try { window.closePlaylistModal = closePlaylistModal; } catch (_) {}
        try { window.addTrackToPlaylist = addTrackToPlaylist; } catch (_) {}
        try { window.removeTrackFromCurrentPlaylist = removeTrackFromCurrentPlaylist; } catch (_) {}
        try { window.openMetadataEditor = openMetadataEditor; } catch (_) {}
        try { window.closeMetadataEditor = closeMetadataEditor; } catch (_) {}
        try { window.saveMetadata = saveMetadata; } catch (_) {}
        try { window.requestSaveMetadataConfirmation = requestSaveMetadataConfirmation; } catch (_) {}
        try { window.cancelMetadataConfirmation = cancelMetadataConfirmation; } catch (_) {}
        try { window.executeSaveMetadata = executeSaveMetadata; } catch (_) {}
        try { window.updateTrackMetadataDisplay = updateTrackMetadataDisplay; } catch (_) {}
    }



    // --- Sub-Module: audio-engine.js ---
// CachyMusic - Audiophile 32-Bit Floating Point DSP Engine
    function createSoftClipCurve(samples = 2048) {
        const curve = new Float32Array(samples);
        // Audiophile Analog Soft-Clip Curve:
        // 100% linear pass-through up to 0.891 (-1.0 dBFS).
        // Smoothly transitions into continuous tanh compression for extreme micro-transients,
        // asymptotically capping output at ~0.950 (-0.45 dBFS) to guarantee zero square-wave DAC clipping.
        const ceiling = 0.891;
        for (let i = 0; i < samples; i++) {
            // Normalized input range from -1 to +1
            const x = (i * 2) / (samples - 1) - 1;
            if (x < -ceiling) {
                curve[i] = -ceiling - (1.0 - ceiling) * Math.tanh((-x - ceiling) / (1.0 - ceiling));
            } else if (x > ceiling) {
                curve[i] = ceiling + (1.0 - ceiling) * Math.tanh((x - ceiling) / (1.0 - ceiling));
            } else {
                curve[i] = x;
            }
        }
        return curve;
    }

    function createLinearCurve(samples = 2048) {
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            curve[i] = (i * 2) / (samples - 1) - 1;
        }
        return curve;
    }

    function computeLimiterProfile() {
        if (!isLimiter) {
            return {
                threshold: 0,
                knee: 0,
                ratio: 1.0,
                attack: 0.0018,
                release: 0.090,
                isBypassed: true
            };
        }

        // Base transparent studio master limiter profile
        // - Ratio 20:1 brickwall peak arrest
        // - 1.8ms attack captures transient crests without dulling percussion snap
        // - 90ms release ensures swift gain recovery without pumping or breathing
        let threshold = -1.5; // dBFS
        let knee = 2.8;       // dB
        let ratio = 20.0;     // ratio (Brickwall)
        let attack = 0.0018;  // seconds (1.8ms)
        let release = 0.090;  // seconds (90ms)

        // Low-End Headroom for BASS BOOST (95 Hz Harman Shelf):
        // Low-frequency waves have long physical periods (~10.5ms at 95 Hz).
        // 1. Threshold lowers by -1.2 dB to catch heavy sub-bass crests before DAC saturation.
        // 2. Knee widens by +1.5 dB for an organic, musical onset.
        // 3. Release extends to 125ms (0.125s) to guarantee zero inter-cycle gain modulation (eliminates buzz/flab).
        if (isBassBoost) {
            threshold -= 1.2;
            knee += 1.5;
            release = Math.max(release, 0.125);
        }

        // Clean Preamp Headroom for AMP BOOST (+3.6 dB broadcast amplification):
        // Pulls threshold down by -2.0 dB and widens knee to seamlessly absorb the +3.6 dB gain without distortion.
        if (isAmpBoost) {
            threshold -= 2.0;
            knee += 1.5;
            attack = 0.0015;
            release = Math.max(release, 0.100);
        }

        // Dynamic Headroom for VOLUME OVERDRIVE (> 100% up to 150%):
        // Dynamically scales limitation based on the exact amount of volume overdrive.
        if (currentVolumeValue > 1.0) {
            const overdrive = (currentVolumeValue - 1.0) / 0.5; // 0 to 1
            threshold -= overdrive * 2.0;
            knee += overdrive * 1.5;
            attack = Math.min(attack, 0.0012);
            release = Math.max(release, 0.110);
        }

        // Vocal Presence Headroom for VOCAL BOOST (+2.8 dB at 3.0 kHz):
        if (isVocalBoost) {
            threshold -= 0.8;
            knee += 0.8;
        }

        // Transient Clamp for TREBLE BOOST (+3.0 dB at 10.0 kHz):
        // Fast 1.2ms attack swiftly clamps high-frequency transient spikes and prevents digital glare.
        if (isTrebleBoost) {
            threshold -= 0.6;
            attack = Math.min(attack, 0.0012);
        }

        // Guard rails: strictly clamped to maintain studio mastering standards
        threshold = Math.max(-8.0, Math.min(-1.2, threshold));
        knee = Math.min(8.0, knee);

        return {
            threshold,
            knee,
            ratio,
            attack,
            release,
            isBypassed: false
        };
    }

    function updateLimiterState(now = 0) {
        if (!dspLimiter || !audioContext) return;
        const profile = computeLimiterProfile();

        if (profile.isBypassed) {
            dspLimiter.threshold.setTargetAtTime(0, now, 0.02);
            dspLimiter.knee.setTargetAtTime(0, now, 0.02);
            dspLimiter.ratio.setTargetAtTime(1.0, now, 0.02);
            dspLimiter.attack.setTargetAtTime(0.0018, now, 0.02);
            dspLimiter.release.setTargetAtTime(0.090, now, 0.02);
            if (ceilingTrimGain) {
                ceilingTrimGain.gain.setTargetAtTime(1.0, now, 0.02);
            }
            if (ampSoftClipper) {
                ampSoftClipper.curve = createLinearCurve(2048);
            }
        } else {
            dspLimiter.threshold.setTargetAtTime(profile.threshold, now, 0.02);
            dspLimiter.knee.setTargetAtTime(profile.knee, now, 0.02);
            dspLimiter.ratio.setTargetAtTime(profile.ratio, now, 0.02);
            dspLimiter.attack.setTargetAtTime(profile.attack, now, 0.02);
            dspLimiter.release.setTargetAtTime(profile.release, now, 0.02);
            if (ceilingTrimGain) {
                // -0.6 dBFS True Peak headroom ceiling (gain = ~0.93325) guarantees DAC reconstruction safety
                ceilingTrimGain.gain.setTargetAtTime(Math.pow(10, -0.6 / 20), now, 0.02);
            }
            if (ampSoftClipper) {
                ampSoftClipper.curve = createSoftClipCurve(2048);
            }
        }
    }

    function getEffectiveAmplification() {
        // Base clean amplification boost: +3.6 dB when isAmpBoost is enabled (standard broadcast loudness enhancement)
        let ampDb = isAmpBoost ? 3.6 : 0;
        // Extended volume overdrive above 100% (from 1.0 to 1.5 adds up to +3.0 dB clean headroom gain)
        if (currentVolumeValue > 1.0) {
            const overdrive = (currentVolumeValue - 1.0) / 0.5; // 0 to 1
            ampDb += overdrive * 3.0;
        }
        return Math.pow(10, ampDb / 20);
    }

    function updateAmpGain(now = 0) {
        if (!ampGainNode || !audioContext) return;
        const targetLinear = getEffectiveAmplification();
        ampGainNode.gain.setTargetAtTime(targetLinear, now, 0.04);
    }

    function getPreAmpGainValue() {
        let maxBoost = 0;
        if (isBassBoost) maxBoost = Math.max(maxBoost, 3.8);
        if (isTrebleBoost) maxBoost = Math.max(maxBoost, 3.0);
        if (isVocalBoost) maxBoost = Math.max(maxBoost, 2.8);
        if (peqGains && peqGains.length) {
            for (const g of peqGains) {
                if (g > maxBoost) maxBoost = g;
            }
        }
        // Attenuate input by 70% of max positive boost to preserve dynamic range headroom without clipping
        const trimDb = maxBoost > 0 ? -(maxBoost * 0.70) : 0;
        return Math.pow(10, trimDb / 20);
    }

    function updatePreAmpGain(now = 0) {
        if (!preAmpGainNode || !audioContext) return;
        const target = getPreAmpGainValue();
        preAmpGainNode.gain.setTargetAtTime(target, now, 0.025);
    }

    // Audiophile Bauer / Jan Meier Natural Headphone Crossfeed Network (Unity-Gain Mono Bass)
    // Direct path: -2.85 dB (0.72) below 700 Hz + +2.85 dB high-shelf above 700 Hz (0 dB HF pass-through)
    // Cross path:  -11.0 dB (0.28) low-pass at 700 Hz with 300μs interaural delay (0.72 + 0.28 = 1.00 unity mono bass)
    function createCrossfeedNetwork(ctx) {
        if (!ctx) return null;
        try {
            const splitter = ctx.createChannelSplitter(2);
            const merger = ctx.createChannelMerger(2);

            const directGainL = ctx.createGain();
            const directGainR = ctx.createGain();
            directGainL.gain.value = 0.72;
            directGainR.gain.value = 0.72;

            const directShelfL = ctx.createBiquadFilter();
            const directShelfR = ctx.createBiquadFilter();
            directShelfL.type = 'highshelf';
            directShelfL.frequency.value = 700;
            directShelfL.gain.value = 2.85;
            directShelfR.type = 'highshelf';
            directShelfR.frequency.value = 700;
            directShelfR.gain.value = 2.85;

            const filterL = ctx.createBiquadFilter();
            const filterR = ctx.createBiquadFilter();
            filterL.type = 'lowpass';
            filterL.frequency.value = 700;
            filterL.Q.value = 0.707;

            filterR.type = 'lowpass';
            filterR.frequency.value = 700;
            filterR.Q.value = 0.707;

            const delayL = ctx.createDelay(0.01);
            const delayR = ctx.createDelay(0.01);
            delayL.delayTime.value = 0.00030; // 300 microseconds ITD
            delayR.delayTime.value = 0.00030;

            const crossGainL = ctx.createGain();
            const crossGainR = ctx.createGain();
            crossGainL.gain.value = 0.28; // -11.0 dB crossfeed (sums with 0.72 direct for 1.00 unity mono bass)
            crossGainR.gain.value = 0.28;

            // Left Channel Routing
            splitter.connect(directGainL, 0);
            directGainL.connect(directShelfL);
            directShelfL.connect(merger, 0, 0);

            splitter.connect(filterL, 0);
            filterL.connect(delayL);
            delayL.connect(crossGainL);
            crossGainL.connect(merger, 0, 1);

            // Right Channel Routing
            splitter.connect(directGainR, 1);
            directGainR.connect(directShelfR);
            directShelfR.connect(merger, 0, 1);

            splitter.connect(filterR, 1);
            filterR.connect(delayR);
            delayR.connect(crossGainR);
            crossGainR.connect(merger, 0, 0);

            return {
                input: splitter,
                output: merger
            };
        } catch (e) {
            console.warn('Crossfeed initialization warning:', e);
            return null;
        }
    }

    function setDspBoost(type, active) {
        if (!audioContext) {
            const track = allTracks[currentTrackIndex];
            const targetRate = (track && track.sampleRate) ? getValidSampleRate(track.sampleRate) : 44100;
            initAudioContext(targetRate);
        }
        const now = audioContext ? audioContext.currentTime : 0;

        if (type === 'limiter') {
            isLimiter = active;
            safeStorage.setItem('cachymusic_limiter', isLimiter ? 'true' : 'false');
        } else if (type === 'amp') {
            isAmpBoost = active;
            safeStorage.setItem('cachymusic_amp_boost', isAmpBoost ? 'true' : 'false');
            updateAmpGain(now);
        } else if (type === 'bass') {
            isBassBoost = active;
            safeStorage.setItem('cachymusic_bass_boost', isBassBoost ? 'true' : 'false');
            if (bassFilter && audioContext) {
                bassFilter.gain.setTargetAtTime(isBassBoost ? 3.8 : 0, now, 0.04);
            }
        } else if (type === 'vocal') {
            isVocalBoost = active;
            safeStorage.setItem('cachymusic_vocal_boost', isVocalBoost ? 'true' : 'false');
            if (vocalFilter && audioContext) {
                vocalFilter.gain.setTargetAtTime(isVocalBoost ? 2.8 : 0, now, 0.04);
            }
        } else if (type === 'treble') {
            isTrebleBoost = active;
            safeStorage.setItem('cachymusic_treble_boost', isTrebleBoost ? 'true' : 'false');
            if (trebleFilter && audioContext) {
                trebleFilter.gain.setTargetAtTime(isTrebleBoost ? 3.0 : 0, now, 0.04);
            }
        } else if (type === 'xfeed') {
            isCrossfeed = active;
            safeStorage.setItem('cachymusic_crossfeed', isCrossfeed ? 'true' : 'false');
        } else if (type === 'subsonic') {
            isSubsonic = active;
            safeStorage.setItem('cachymusic_subsonic', isSubsonic ? 'true' : 'false');
            if (subsonicFilter && audioContext) {
                subsonicFilter.frequency.setTargetAtTime(isSubsonic ? 20 : 5, now, 0.04);
            }
        } else if (type === 'agp') {
            isAgpEnabled = active;
            safeStorage.setItem('cachymusic_agp', isAgpEnabled ? 'true' : 'false');
        } else if (type === 'surround') {
            isSurroundWidener = active;
            safeStorage.setItem('cachymusic_surround_ms', isSurroundWidener ? 'true' : 'false');
        } else if (type === 'phase') {
            isPhaseInvert = active;
            safeStorage.setItem('cachymusic_phase_invert', isPhaseInvert ? 'true' : 'false');
        } else if (type === 'mono') {
            isMonoMix = active;
            safeStorage.setItem('cachymusic_mono_mix', isMonoMix ? 'true' : 'false');
        }

        updateWorkletParams();
        updatePreAmpGain(now);
        updateAudioRouting();
        updateLimiterState(now);
        updateDspButtonsUi();
    }

    function toggleDspBoost(type) {
        if (type === 'limiter') setDspBoost('limiter', !isLimiter);
        else if (type === 'amp') setDspBoost('amp', !isAmpBoost);
        else if (type === 'bass') setDspBoost('bass', !isBassBoost);
        else if (type === 'vocal') setDspBoost('vocal', !isVocalBoost);
        else if (type === 'treble') setDspBoost('treble', !isTrebleBoost);
        else if (type === 'xfeed') setDspBoost('xfeed', !isCrossfeed);
        else if (type === 'subsonic') setDspBoost('subsonic', !isSubsonic);
        else if (type === 'agp') setDspBoost('agp', !isAgpEnabled);
        else if (type === 'surround') setDspBoost('surround', !isSurroundWidener);
        else if (type === 'phase') setDspBoost('phase', !isPhaseInvert);
        else if (type === 'mono') setDspBoost('mono', !isMonoMix);
        else if (type === 'peq') {
            const peqModal = document.getElementById('peqModal');
            if (peqModal) {
                const isCurrentlyOpen = peqModal.style.display === 'flex' || window.getComputedStyle(peqModal).display === 'flex';
                if (isCurrentlyOpen) {
                    if (typeof closePeqModal === 'function') closePeqModal();
                    else peqModal.style.display = 'none';
                } else {
                    if (typeof openPeqModal === 'function') openPeqModal();
                    else {
                        peqModal.style.display = 'flex';
                        setTimeout(drawPeqCurve, 40);
                    }
                }
            }
        }
    }

    function updateDspButtonsUi() {
        const dspBtns = document.querySelectorAll('[data-target="limiter"], [data-target="amp"], [data-target="bass"], [data-target="vocal"], [data-target="treble"], [data-target="xfeed"], [data-target="subsonic"], [data-target="agp"], [data-target="surround"], [data-target="phase"], [data-target="mono"], [data-target="peq"]');
        dspBtns.forEach(btn => {
            const target = btn.dataset.target;
            const isActive = (target === 'limiter' && isLimiter) ||
                             (target === 'amp' && isAmpBoost) ||
                             (target === 'bass' && isBassBoost) ||
                             (target === 'vocal' && isVocalBoost) ||
                             (target === 'treble' && isTrebleBoost) ||
                             (target === 'xfeed' && isCrossfeed) ||
                             (target === 'subsonic' && isSubsonic) ||
                             (target === 'agp' && isAgpEnabled) ||
                             (target === 'surround' && isSurroundWidener) ||
                             (target === 'phase' && isPhaseInvert) ||
                             (target === 'mono' && isMonoMix) ||
                             (target === 'peq' && !isPeqBypassed && peqGains.some(g => g !== 0));
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            const dot = btn.querySelector('.dspDot');
            if (dot) dot.classList.toggle('active', isActive);
        });

        const peqXfeedStatus = document.getElementById('peqXfeedStatus');
        if (peqXfeedStatus) peqXfeedStatus.textContent = isCrossfeed ? 'ON' : 'OFF';
        const peqAgpStatus = document.getElementById('peqAgpStatus');
        if (peqAgpStatus) peqAgpStatus.textContent = isAgpEnabled ? 'GUARD ON' : 'BYPASS';
        const peqSurroundStatus = document.getElementById('peqSurroundStatus');
        if (peqSurroundStatus) peqSurroundStatus.textContent = isSurroundWidener ? '135% WIDE' : '100%';
        const peqPhaseStatus = document.getElementById('peqPhaseStatus');
        if (peqPhaseStatus) peqPhaseStatus.textContent = isPhaseInvert ? '180° INV' : '0° NORM';
        const peqMonoStatus = document.getElementById('peqMonoStatus');
        if (peqMonoStatus) peqMonoStatus.textContent = isMonoMix ? 'MONO L+R' : 'STEREO';

        const isPeqActive = !isPeqBypassed && peqGains.some(g => g !== 0);
        const playerPeqBadge = document.getElementById('playerPeqBadge');
        if (playerPeqBadge) {
            playerPeqBadge.textContent = isPeqActive ? 'ACTIVE' : '10-BAND';
            playerPeqBadge.classList.toggle('active', isPeqActive);
        }

        const activeDspCount = [isAmpBoost, isBassBoost, isVocalBoost, isTrebleBoost, isLimiter, isCrossfeed, isSurroundWidener, isPhaseInvert, isMonoMix].filter(Boolean).length;
        const playerDspCountBadge = document.getElementById('playerDspCountBadge');
        if (playerDspCountBadge) {
            if (activeDspCount > 0) {
                playerDspCountBadge.textContent = `+${activeDspCount} DSP`;
                playerDspCountBadge.style.display = 'inline-flex';
                playerDspCountBadge.classList.add('active');
            } else {
                playerDspCountBadge.style.display = 'none';
                playerDspCountBadge.classList.remove('active');
            }
        }

        const peqDspActiveSummary = document.getElementById('peqDspActiveSummary');
        if (peqDspActiveSummary) {
            peqDspActiveSummary.textContent = activeDspCount > 0 ? `${activeDspCount} ACTIVE` : (isAgpEnabled ? 'AGP GUARD READY' : 'ALL BYPASSED');
            peqDspActiveSummary.classList.toggle('active', activeDspCount > 0 || isAgpEnabled);
        }

        const playerPeqBtn = document.getElementById('playerPeqBtn');
        if (playerPeqBtn) {
            playerPeqBtn.classList.toggle('active', isPeqActive || activeDspCount > 0);
        }

        updateDacStatusUi();
        if (allTracks[currentTrackIndex]) {
            updateTrackBadgeUi(allTracks[currentTrackIndex]);
        }
    }

    function setupDspControls() {
        updateDspButtonsUi();
        const dspBtns = document.querySelectorAll('[data-target="limiter"], [data-target="amp"], [data-target="bass"], [data-target="vocal"], [data-target="treble"], [data-target="xfeed"], [data-target="subsonic"], [data-target="agp"], [data-target="surround"], [data-target="phase"], [data-target="mono"], [data-target="peq"]');
        dspBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                toggleDspBoost(btn.dataset.target);
            });
        });
    }

    // =========================================================================
    // 10-Band Parametric Equalizer (PEQ) & AutoEQ Compensation Engine
    // =========================================================================
    function setPeqBandGain(bandIndex, gainDb) {
        if (bandIndex < 0 || bandIndex >= PEQ_FREQS.length) return;
        const clampedGain = Math.max(-15, Math.min(15, Number(gainDb) || 0));
        peqGains[bandIndex] = clampedGain;
        try {
            safeStorage.setItem('cachymusic_peq_gains', JSON.stringify(peqGains));
        } catch (_) {}

        if (peqNodes && peqNodes[bandIndex] && audioContext) {
            const now = audioContext.currentTime;
            peqNodes[bandIndex].gain.setTargetAtTime(isPeqBypassed ? 0 : clampedGain, now, 0.04);
        }
        updateAudioRouting();
        updateLimiterState(audioContext ? audioContext.currentTime : 0);
        updateDspButtonsUi();
    }

    function setPeqBandQ(bandIndex, qVal) {
        if (bandIndex < 0 || bandIndex >= PEQ_FREQS.length) return;
        const clampedQ = Math.max(0.4, Math.min(8.0, Number(qVal) || 1.41));
        peqQs[bandIndex] = clampedQ;
        try {
            safeStorage.setItem('cachymusic_peq_qs', JSON.stringify(peqQs));
        } catch (_) {}

        if (peqNodes && peqNodes[bandIndex] && audioContext) {
            peqNodes[bandIndex].Q.setTargetAtTime(clampedQ, audioContext.currentTime, 0.03);
        }
    }

    function setPeqPreset(name) {
        const presets = {
            flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            harman_in_ear: [4.5, 3.8, 2.0, 0.5, 0.0, 0.5, 1.8, 3.0, 1.5, 0.5],
            harman_over_ear: [3.5, 2.8, 1.2, 0.0, 0.0, 0.5, 2.2, 3.5, 2.0, 1.0],
            vocal: [-1.0, -0.5, 0.0, 1.0, 2.5, 3.2, 2.8, 1.5, 0.5, 0.0],
            bass_slam: [7.0, 5.5, 3.5, 1.0, 0.0, 0.0, 0.5, 1.0, 1.5, 0.5],
            acoustic: [2.0, 1.5, 1.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5],
            treble_shimmer: [0.0, 0.0, 0.0, 0.5, 1.0, 1.5, 2.5, 3.8, 4.5, 5.0],
            vinyl_warmth: [3.5, 2.5, 1.5, 0.5, 0.0, -0.5, -1.0, -1.5, -2.5, -3.5],
            electronic: [6.0, 4.5, 2.0, 0.0, -0.5, 0.5, 1.5, 3.0, 3.5, 2.5],
            oratory_hd600: [5.2, 3.8, 1.5, -0.5, -0.8, 0.5, 1.2, -1.5, 2.0, 1.0]
        };
        const target = presets[String(name).toLowerCase()] || presets.flat;
        for (let i = 0; i < PEQ_FREQS.length; i++) {
            setPeqBandGain(i, target[i]);
        }
    }

    function importAutoEqProfile(text) {
        if (!text || typeof text !== 'string') return false;
        const lines = text.split(/\r?\n/);
        const parsedFilters = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const fcMatch = trimmed.match(/Fc\s+(\d+(?:\.\d+)?)\s*Hz/i);
            const gainMatch = trimmed.match(/Gain\s+([-+]?\d+(?:\.\d+)?)\s*dB/i);
            const qMatch = trimmed.match(/Q\s+(\d+(?:\.\d+)?)/i);

            if (fcMatch && gainMatch) {
                parsedFilters.push({
                    freq: parseFloat(fcMatch[1]),
                    gain: parseFloat(gainMatch[1]),
                    q: qMatch ? parseFloat(qMatch[1]) : 1.41
                });
            }
        }

        if (parsedFilters.length === 0) return false;

        const newGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const newQs = [1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41];
        for (let b = 0; b < PEQ_FREQS.length; b++) {
            const targetFreq = PEQ_FREQS[b];
            let matchingGain = 0;
            let matchingQ = 1.41;
            let bestRatioDist = 999;
            for (const f of parsedFilters) {
                const ratio = f.freq / targetFreq;
                const dist = Math.abs(Math.log2(ratio));
                if (dist < 0.65 && dist < bestRatioDist) {
                    bestRatioDist = dist;
                    matchingGain = f.gain;
                    matchingQ = f.q;
                }
            }
            newGains[b] = Math.max(-15, Math.min(15, matchingGain));
            newQs[b] = Math.max(0.4, Math.min(6.0, matchingQ));
        }

        for (let b = 0; b < PEQ_FREQS.length; b++) {
            setPeqBandGain(b, newGains[b]);
            setPeqBandQ(b, newQs[b]);
            const qBtn = document.getElementById(`peqFaderQ-${b}`);
            if (qBtn) qBtn.textContent = `Q ${newQs[b].toFixed(1)}`;
        }
        return true;
    }

    // Interactive Real-Time Response Curve Visualizer Canvas
    function drawPeqCurve() {
        const canvas = document.getElementById('peqCurveCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const rect = canvas.getBoundingClientRect();
        if (!rect || rect.width < 16 || rect.height < 16) return;
        const w = rect.width;
        const h = rect.height;

        const targetW = Math.min(4096, Math.round(w * dpr));
        const targetH = Math.min(2048, Math.round(h * dpr));
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }

        ctx.save();
        ctx.scale(targetW / w, targetH / h);
        ctx.clearRect(0, 0, w, h);

        const minFreq = 20;
        const maxFreq = 20000;
        const logMin = Math.log10(minFreq);
        const logMax = Math.log10(maxFreq);
        const minDb = -15;
        const maxDb = 15;
        const zeroY = h / 2;

        const freqToX = (f) => ((Math.log10(f) - logMin) / (logMax - logMin)) * w;
        const dbToY = (db) => zeroY - (db / maxDb) * (h * 0.42);

        const curTheme = getActiveTheme();
        const isLightCanvas = (curTheme === 'minimalist-light' || curTheme === 'brutalist-light' || curTheme === 'minimalist-warm');
        const isWarmTheme = (curTheme === 'minimalist-warm');

        // 1. Grid Lines
        ctx.lineWidth = 1;
        const gridFreqs = [50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000];
        ctx.strokeStyle = isLightCanvas ? 'rgba(24, 24, 27, 0.16)' : 'rgba(226, 232, 240, 0.13)';
        ctx.fillStyle = isLightCanvas ? 'rgba(9, 9, 11, 0.88)' : 'rgba(241, 245, 249, 0.88)';
        ctx.font = '700 9.5px monospace';
        ctx.textAlign = 'center';

        gridFreqs.forEach(f => {
            const x = freqToX(f);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
            const lbl = f >= 1000 ? `${f / 1000}k` : `${f}`;
            if (x > 46 && x < w - 12) {
                ctx.fillText(lbl, x, h - 5);
            }
        });

        // Horizontal dB lines (+12, +6, 0, -6, -12)
        const dbs = [12, 6, 0, -6, -12];
        dbs.forEach(d => {
            const y = dbToY(d);
            ctx.beginPath();
            if (isLightCanvas) {
                ctx.strokeStyle = (d === 0) ? 'rgba(24, 24, 27, 0.40)' : 'rgba(24, 24, 27, 0.11)';
            } else {
                ctx.strokeStyle = (d === 0) ? 'rgba(248, 250, 252, 0.36)' : 'rgba(226, 232, 240, 0.09)';
            }
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        });

        // 2. Calculate Combined Frequency Response H(f)
        const points = [];
        const numSteps = Math.min(300, Math.round(w));

        for (let s = 0; s <= numSteps; s++) {
            const x = (s / numSteps) * w;
            const freq = Math.pow(10, logMin + (x / w) * (logMax - logMin));
            let totalGain = 0;

            if (!isPeqBypassed) {
                for (let b = 0; b < PEQ_FREQS.length; b++) {
                    const g = peqGains[b];
                    if (g === 0) continue;
                    const f0 = PEQ_FREQS[b];
                    const ratio = freq / f0;
                    const Q = (peqQs && peqQs[b]) ? peqQs[b] : 1.414;
                    const weight = 1.0 / (1.0 + Math.pow(Q * (ratio - 1.0 / ratio), 2));
                    totalGain += g * weight;
                }
            }

            const y = dbToY(totalGain);
            points.push({ x, y, totalGain });
        }

        // 3. Gradient Fill Under Response Curve
        if (points.length > 0) {
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            if (isWarmTheme) {
                grad.addColorStop(0, 'rgba(180, 83, 9, 0.24)');
                grad.addColorStop(0.5, 'rgba(180, 83, 9, 0.08)');
                grad.addColorStop(1, 'rgba(180, 83, 9, 0.01)');
            } else if (isLightCanvas) {
                grad.addColorStop(0, 'rgba(9, 9, 11, 0.20)');
                grad.addColorStop(0.5, 'rgba(9, 9, 11, 0.06)');
                grad.addColorStop(1, 'rgba(9, 9, 11, 0.01)');
            } else {
                grad.addColorStop(0, 'rgba(0, 229, 255, 0.28)');
                grad.addColorStop(0.5, 'rgba(0, 229, 255, 0.08)');
                grad.addColorStop(1, 'rgba(0, 229, 255, 0.01)');
            }

            ctx.beginPath();
            ctx.moveTo(points[0].x, zeroY);
            for (let i = 0; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.lineTo(w, zeroY);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
        }

        // 4. Glowing Transfer Curve Line
        if (points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            const activeStroke = isWarmTheme ? '#9a3412' : (isLightCanvas ? '#09090b' : (curTheme === 'minimalist-obsidian' ? '#38bdf8' : '#00e5ff'));
            const isFx = document.documentElement.classList.contains('is-firefox') || /firefox|fxios/i.test(navigator.userAgent || '');
            ctx.strokeStyle = isPeqBypassed ? '#dc2626' : activeStroke;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = isPeqBypassed ? '#dc2626' : activeStroke;
            ctx.shadowBlur = isFx ? 0 : (isLightCanvas ? 2 : 3);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // 5. Center Frequency Nodes
        PEQ_FREQS.forEach((f0, b) => {
            const x = freqToX(f0);
            const g = isPeqBypassed ? 0 : peqGains[b];
            const y = dbToY(g);

            ctx.beginPath();
            ctx.arc(x, y, 4.5, 0, Math.PI * 2);
            if (isLightCanvas) {
                ctx.fillStyle = g !== 0 ? (isWarmTheme ? '#b45309' : '#047857') : '#ffffff';
                ctx.fill();
                ctx.strokeStyle = isWarmTheme ? '#1c1917' : '#09090b';
            } else {
                ctx.fillStyle = g !== 0 ? '#10b981' : '#ffffff';
                ctx.fill();
                ctx.strokeStyle = '#000000';
            }
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        ctx.restore();
    }

    function initPeqWorkstation() {
        const peqGrid = document.getElementById('peqFadersGrid');
        const peqModal = document.getElementById('peqModal');
        const playerEqBtn = document.getElementById('playerPeqBtn');
        const closeBtn = document.getElementById('closePeqModalBtn');
        const bypassBtn = document.getElementById('peqBypassToggleBtn');
        const bypassText = document.getElementById('peqBypassStatusText');
        const resetBtn = document.getElementById('peqResetBtn');
        const presetSelect = document.getElementById('peqPresetSelect');
        const autoEqOpenBtn = document.getElementById('peqAutoEqOpenBtn');
        const autoEqDrawer = document.getElementById('peqAutoEqDrawer');
        const autoEqInput = document.getElementById('peqAutoEqInput');
        const autoEqApplyBtn = document.getElementById('peqAutoEqApplyBtn');
        const autoEqCancelBtn = document.getElementById('peqAutoEqCancelBtn');

        if (!peqGrid) return;

        function syncBipolarSliderFill(slider, val, minVal, maxVal) {
            if (!slider) return;
            const span = (maxVal - minVal) || 1;
            const pct = Math.max(0, Math.min(100, ((val - minVal) / span) * 100));
            slider.style.setProperty('--fill-low', `${Math.min(50, pct).toFixed(2)}%`);
            slider.style.setProperty('--fill-high', `${Math.max(50, pct).toFixed(2)}%`);
            slider.dataset.polarity = val > 0.01 ? 'boost' : (val < -0.01 ? 'cut' : 'flat');
        }

        // Populate 10 Tactile Vertical Faders
        peqGrid.innerHTML = '';
        PEQ_FREQS.forEach((freq, i) => {
            const col = document.createElement('div');
            col.className = 'peqFaderCol';
            const val = peqGains[i] || 0;
            const qVal = (peqQs && peqQs[i]) ? peqQs[i] : 1.41;
            const sign = val > 0 ? '+' : '';
            const dbClass = val > 0 ? 'boost' : (val < 0 ? 'cut' : '');
            const hzText = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;

            col.innerHTML = `
                <span class="peqFaderDb ${dbClass}" id="peqFaderDb-${i}">${sign}${val.toFixed(1)}</span>
                <div class="peqFaderTrackCon">
                    <div class="peqFaderTrackZero"></div>
                    <input type="range" class="peqSlider" id="peqSlider-${i}" min="-15" max="15" step="0.5" value="${val}" aria-label="${hzText} Hz Band Gain" aria-orientation="vertical">
                </div>
                <span class="peqFaderHz">${hzText}</span>
                <button type="button" class="peqFaderQBtn" id="peqFaderQ-${i}" title="Click to adjust Q-Factor (Bandwidth) for ${hzText} Hz">${`Q ${qVal.toFixed(1)}`}</button>
            `;

            const slider = col.querySelector('.peqSlider');
            syncBipolarSliderFill(slider, val, -15, 15);
            slider.addEventListener('input', (e) => {
                const gain = parseFloat(e.target.value);
                setPeqBandGain(i, gain);
                syncBipolarSliderFill(slider, gain, -15, 15);
                const dbEl = document.getElementById(`peqFaderDb-${i}`);
                if (dbEl) {
                    const s = gain > 0 ? '+' : '';
                    dbEl.textContent = `${s}${gain.toFixed(1)}`;
                    dbEl.className = `peqFaderDb ${gain > 0 ? 'boost' : (gain < 0 ? 'cut' : '')}`;
                }
                drawPeqCurve();
            });
            slider.addEventListener('dblclick', () => {
                slider.value = 0;
                setPeqBandGain(i, 0);
                syncBipolarSliderFill(slider, 0, -15, 15);
                const dbEl = document.getElementById(`peqFaderDb-${i}`);
                if (dbEl) {
                    dbEl.textContent = '0.0';
                    dbEl.className = 'peqFaderDb';
                }
                drawPeqCurve();
            });

            const qBtn = col.querySelector('.peqFaderQBtn');
            if (qBtn) {
                qBtn.addEventListener('click', () => {
                    const curQ = peqQs[i] || 1.41;
                    let nextIdx = PEQ_Q_STEPS.findIndex(q => q > curQ + 0.05);
                    if (nextIdx === -1) nextIdx = 0;
                    const nextQ = PEQ_Q_STEPS[nextIdx];
                    setPeqBandQ(i, nextQ);
                    qBtn.textContent = `Q ${nextQ.toFixed(1)}`;
                    drawPeqCurve();
                });
            }

            peqGrid.appendChild(col);
        });

        function updateBypassUi() {
            if (bypassBtn) bypassBtn.classList.toggle('bypassed', isPeqBypassed);
            if (bypassText) bypassText.textContent = isPeqBypassed ? 'BYPASS' : 'ACTIVE';
            if (playerEqBtn) {
                const isPeqActive = !isPeqBypassed && peqGains.some(g => g !== 0);
                const activeDspCount = [isAmpBoost, isBassBoost, isVocalBoost, isTrebleBoost, isLimiter, isCrossfeed].filter(Boolean).length;
                playerEqBtn.classList.toggle('active', isPeqActive || activeDspCount > 0);
                const playerPeqBadge = document.getElementById('playerPeqBadge');
                if (playerPeqBadge) {
                    playerPeqBadge.textContent = isPeqActive ? 'ACTIVE' : '10-BAND';
                    playerPeqBadge.classList.toggle('active', isPeqActive);
                }
            }
        }
        updateBypassUi();

        if (bypassBtn) {
            bypassBtn.addEventListener('click', () => {
                isPeqBypassed = !isPeqBypassed;
                safeStorage.setItem('cachymusic_peq_bypassed', isPeqBypassed ? 'true' : 'false');
                updateBypassUi();
                for (let i = 0; i < PEQ_FREQS.length; i++) {
                    if (peqNodes[i] && audioContext) {
                        peqNodes[i].gain.setTargetAtTime(isPeqBypassed ? 0 : peqGains[i], audioContext.currentTime, 0.04);
                    }
                }
                updateAudioRouting();
                drawPeqCurve();
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                for (let i = 0; i < PEQ_FREQS.length; i++) {
                    setPeqBandGain(i, 0);
                    setPeqBandQ(i, 1.41);
                    const slider = document.getElementById(`peqSlider-${i}`);
                    const dbEl = document.getElementById(`peqFaderDb-${i}`);
                    const qBtn = document.getElementById(`peqFaderQ-${i}`);
                    if (slider) {
                        slider.value = 0;
                        syncBipolarSliderFill(slider, 0, -15, 15);
                    }
                    if (dbEl) {
                        dbEl.textContent = '0.0';
                        dbEl.className = 'peqFaderDb';
                    }
                    if (qBtn) qBtn.textContent = 'Q 1.4';
                }
                if (presetSelect) presetSelect.value = 'flat';
                updateBypassUi();
                drawPeqCurve();
            });
        }

        // Stereo Balance & Pitch-Lock Controls inside Equalizer Workstation
        const balanceSlider = document.getElementById('peqStereoBalanceSlider');
        const balanceValueEl = document.getElementById('peqStereoBalanceValue');
        const balanceResetBtn = document.getElementById('peqBalanceResetBtn');
        const pitchLockBtn = document.getElementById('peqPitchLockBtn');

        function formatStereoBalanceText(bal) {
            const pct = Math.round(bal * 100);
            if (Math.abs(pct) <= 1) return 'CENTER';
            return pct < 0 ? `${Math.abs(pct)}% L` : `${pct}% R`;
        }

        if (balanceSlider) {
            const initBalPct = Math.round(stereoBalance * 100);
            balanceSlider.value = initBalPct;
            syncBipolarSliderFill(balanceSlider, initBalPct, -100, 100);
            if (balanceValueEl) balanceValueEl.textContent = formatStereoBalanceText(stereoBalance);
            balanceSlider.addEventListener('input', (e) => {
                const rawPct = parseInt(e.target.value, 10) || 0;
                stereoBalance = Math.max(-1.0, Math.min(1.0, rawPct / 100));
                syncBipolarSliderFill(balanceSlider, rawPct, -100, 100);
                safeStorage.setItem('cachymusic_stereo_balance', stereoBalance.toFixed(2));
                if (balanceValueEl) balanceValueEl.textContent = formatStereoBalanceText(stereoBalance);
                updateWorkletParams();
                updateAudioRouting();
            });
        }

        if (balanceResetBtn) {
            balanceResetBtn.addEventListener('click', () => {
                stereoBalance = 0;
                safeStorage.setItem('cachymusic_stereo_balance', '0');
                if (balanceSlider) {
                    balanceSlider.value = 0;
                    syncBipolarSliderFill(balanceSlider, 0, -100, 100);
                }
                if (balanceValueEl) balanceValueEl.textContent = formatStereoBalanceText(0);
                updateWorkletParams();
                updateAudioRouting();
            });
        }

        function applyAudioPitchLockMode() {
            if (!audio) return;
            try {
                audio.preservesPitch = isPitchLockTempo;
                audio.mozPreservesPitch = isPitchLockTempo;
                audio.webkitPreservesPitch = isPitchLockTempo;
            } catch (_) {}
            if (pitchLockBtn) {
                pitchLockBtn.textContent = isPitchLockTempo ? 'PITCH-LOCK TEMPO' : 'ANALOG VINYL PITCH';
                pitchLockBtn.classList.toggle('active', isPitchLockTempo);
            }
        }
        applyAudioPitchLockMode();

        if (pitchLockBtn) {
            pitchLockBtn.addEventListener('click', () => {
                isPitchLockTempo = !isPitchLockTempo;
                safeStorage.setItem('cachymusic_pitch_lock', isPitchLockTempo ? 'true' : 'false');
                applyAudioPitchLockMode();
                showToast(isPitchLockTempo ? 'Pitch-Lock Enabled: Independent Tempo' : 'Analog Vinyl Mode: Coupled Pitch + RPM');
            });
        }

        if (presetSelect) {
            presetSelect.addEventListener('change', () => {
                setPeqPreset(presetSelect.value);
                for (let i = 0; i < PEQ_FREQS.length; i++) {
                    const slider = document.getElementById(`peqSlider-${i}`);
                    const dbEl = document.getElementById(`peqFaderDb-${i}`);
                    const g = peqGains[i];
                    if (slider) {
                        slider.value = g;
                        syncBipolarSliderFill(slider, g, -15, 15);
                    }
                    if (dbEl) {
                        const s = g > 0 ? '+' : '';
                        dbEl.textContent = `${s}${g.toFixed(1)}`;
                        dbEl.className = `peqFaderDb ${g > 0 ? 'boost' : (g < 0 ? 'cut' : '')}`;
                    }
                }
                if (isPeqBypassed) {
                    isPeqBypassed = false;
                    safeStorage.setItem('cachymusic_peq_bypassed', 'false');
                    updateBypassUi();
                }
                drawPeqCurve();
            });
        }

        if (autoEqOpenBtn && autoEqDrawer) {
            autoEqOpenBtn.addEventListener('click', () => {
                const isOpen = autoEqDrawer.style.display !== 'none';
                autoEqDrawer.style.display = isOpen ? 'none' : 'flex';
                if (!isOpen && autoEqInput) setTimeout(() => autoEqInput.focus(), 50);
            });
        }

        if (autoEqCancelBtn && autoEqDrawer) {
            autoEqCancelBtn.addEventListener('click', () => {
                autoEqDrawer.style.display = 'none';
            });
        }

        if (autoEqApplyBtn && autoEqInput) {
            autoEqApplyBtn.addEventListener('click', () => {
                const text = autoEqInput.value.trim();
                if (text && importAutoEqProfile(text)) {
                    for (let i = 0; i < PEQ_FREQS.length; i++) {
                        const slider = document.getElementById(`peqSlider-${i}`);
                        const dbEl = document.getElementById(`peqFaderDb-${i}`);
                        const g = peqGains[i];
                        if (slider) {
                            slider.value = g;
                            syncBipolarSliderFill(slider, g, -15, 15);
                        }
                        if (dbEl) {
                            const s = g > 0 ? '+' : '';
                            dbEl.textContent = `${s}${g.toFixed(1)}`;
                            dbEl.className = `peqFaderDb ${g > 0 ? 'boost' : (g < 0 ? 'cut' : '')}`;
                        }
                    }
                    if (autoEqDrawer) autoEqDrawer.style.display = 'none';
                    if (isPeqBypassed) {
                        isPeqBypassed = false;
                        safeStorage.setItem('cachymusic_peq_bypassed', 'false');
                        updateBypassUi();
                    }
                    drawPeqCurve();
                }
            });
        }

        openPeqModal = function() {
            if (!peqModal) return;
            peqModal.style.display = 'flex';
            pushModalState('peqModal');
            drawPeqCurve();
            requestAnimationFrame(() => {
                drawPeqCurve();
                setTimeout(drawPeqCurve, 60);
            });
        };

        closePeqModal = function() {
            if (!peqModal) return;
            peqModal.style.display = 'none';
            popModalState('peqModal');
        };

        if (closeBtn) closeBtn.addEventListener('click', closePeqModal);

        if (peqModal) {
            peqModal.addEventListener('click', (e) => {
                if (e.target === peqModal) closePeqModal();
            });
        }

        window.addEventListener('resize', () => {
            if (peqModal && peqModal.style.display !== 'none') {
                drawPeqCurve();
            }
        }, { passive: true });

        setTimeout(drawPeqCurve, 100);
    }

    // AudioWorklet 64-Bit Processor Loader
    async function loadDspWorklet() {
        if (!audioContext || !audioContext.audioWorklet) return;
        const targetCtx = audioContext;
        try {
            await targetCtx.audioWorklet.addModule('scripts/dsp-worklet-processor.js?v=10.47&t=' + Date.now());
            if (!audioContext || audioContext !== targetCtx || targetCtx.state === 'closed') return;
            dspWorkletNode = new AudioWorkletNode(targetCtx, 'cachymusic-dsp-processor', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            });
            dspWorkletNode.onprocessorerror = (err) => {
                console.warn('[AudioWorklet] Processor runtime error, falling back to native Web Audio graph:', err);
                dspWorkletNode = null;
                updateAudioRouting();
            };
            dspWorkletNode.port.onmessage = (e) => {
                if (e.data && e.data.type === 'agp_telemetry') {
                    const peqAgpStatus = document.getElementById('peqAgpStatus');
                    if (peqAgpStatus && isAgpEnabled) {
                        const gr = e.data.gainReductionDb;
                        peqAgpStatus.textContent = (gr < -0.1) ? `${gr.toFixed(1)} dB` : 'GUARD ON';
                    }
                }
            };
            updateWorkletParams();
            updateAudioRouting();
        } catch (e) {
            console.warn('[AudioWorklet] Fallback to native Web Audio graph:', e);
            dspWorkletNode = null;
            updateAudioRouting();
        }
    }

    function updateWorkletParams() {
        if (!dspWorkletNode || !dspWorkletNode.port) return;
        dspWorkletNode.port.postMessage({
            precision64: isPrecision64,
            agpEnabled: isAgpEnabled,
            subsonicEnabled: isSubsonic,
            ultrasonicEnabled: isUltrasonic,
            ultrasonicCutoff: ultrasonicCutoff,
            ditherMode: ditherMode,
            ambiophonicsEnabled: isAmbiophonics,
            phaseInvert: isPhaseInvert,
            monoMix: isMonoMix,
            stereoWidth: isSurroundWidener ? 1.35 : 1.0,
            stereoBalance: stereoBalance
        });
    }

    // Hardware Analog Gain (PipeWire / ALSA Bridge)
    let hwVolumeDebounceTimer = null;
    async function checkHardwareGainStatus() {
        try {
            const res = await fetch('php/api/hardware_volume.php?action=status');
            const data = await res.json();
            if (data && data.success) {
                hwVolumeBackend = data.backend;
                const pill = document.getElementById('settingsHardwareGainPill');
                const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
                const hwGainDot = document.getElementById('settingsHwGainDot');
                const hwGainText = document.getElementById('settingsHwGainText');
                if (pill) {
                    pill.textContent = data.available ? `READY (${data.backend.toUpperCase()})` : 'UNAVAILABLE';
                }
                if (!data.available) {
                    isHardwareGain = false;
                    if (hwGainBtn) {
                        hwGainBtn.disabled = true;
                        hwGainBtn.classList.add('disabled');
                        hwGainBtn.classList.remove('active');
                        hwGainBtn.setAttribute('aria-disabled', 'true');
                        hwGainBtn.title = 'Hardware Analog Gain is unavailable on this platform or output interface.';
                    }
                    if (hwGainDot) hwGainDot.classList.remove('active');
                    if (hwGainText) hwGainText.textContent = 'HARDWARE GAIN: UNAVAILABLE';
                } else {
                    if (hwGainBtn) {
                        hwGainBtn.disabled = false;
                        hwGainBtn.classList.remove('disabled');
                        hwGainBtn.removeAttribute('aria-disabled');
                        hwGainBtn.title = 'Direct PipeWire/ALSA physical volume bridge.';
                    }
                    if (hwGainText && isHardwareGain) {
                        hwGainText.textContent = `HARDWARE GAIN: ON (${data.backend.toUpperCase()})`;
                    }
                }
                if (isHardwareGain && data.available && typeof data.volume === 'number') {
                    currentVolumeValue = Math.max(0, Math.min(1.5, data.volume));
                    if (volumeSlider) volumeSlider.value = currentVolumeValue;
                    if (miniVolumeSlider) miniVolumeSlider.value = Math.min(1.0, currentVolumeValue);
                    if (volumeLevel) {
                        const pct = Math.round(currentVolumeValue * 100);
                        volumeLevel.textContent = currentVolumeValue > 1.0 ? `${pct}% HW-AMP` : `${pct}%`;
                    }
                    updateVolumeIcon(Math.min(1.0, currentVolumeValue));
                    if (audio) {
                        audio.volume = 1.0; // 0 dBFS unscaled bit-perfect pass-through
                        audio.muted = data.muted || false;
                    }
                }
            } else {
                markHwGainUnavailable();
            }
        } catch (_) {
            markHwGainUnavailable();
        }
    }

    function markHwGainUnavailable() {
        isHardwareGain = false;
        const pill = document.getElementById('settingsHardwareGainPill');
        const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
        const hwGainDot = document.getElementById('settingsHwGainDot');
        const hwGainText = document.getElementById('settingsHwGainText');
        if (pill) pill.textContent = 'UNAVAILABLE';
        if (hwGainBtn) {
            hwGainBtn.disabled = true;
            hwGainBtn.classList.add('disabled');
            hwGainBtn.classList.remove('active');
            hwGainBtn.setAttribute('aria-disabled', 'true');
            hwGainBtn.title = 'Hardware Analog Gain is unavailable on this platform or output interface.';
        }
        if (hwGainDot) hwGainDot.classList.remove('active');
        if (hwGainText) hwGainText.textContent = 'HARDWARE GAIN: UNAVAILABLE';
    }

    function dispatchHardwareVolume(vol) {
        if (!isHardwareGain) return;
        if (hwVolumeDebounceTimer) clearTimeout(hwVolumeDebounceTimer);
        hwVolumeDebounceTimer = setTimeout(() => {
            fetch('php/api/hardware_volume.php?action=set_volume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ volume: vol })
            }).catch(() => {});
        }, 35);
    }

    // Neutron HiFi™ Settings Controls Wiring
    function setupNeutronSettingsControls() {
        const applyAudioBtn = document.getElementById('settingsApplyAudioBtn');
        const applyAudioStatus = document.getElementById('settingsApplyAudioStatus');
        let pendingAudioChanges = 0;

        function markAudioSettingsPending(name, val) {
            pendingAudioChanges++;
            if (applyAudioBtn) {
                applyAudioBtn.textContent = `APPLY AUDIO SETTINGS (${pendingAudioChanges} PENDING)`;
                applyAudioBtn.style.boxShadow = '0 0 16px var(--accent-glow, rgba(0,240,255,0.4))';
            }
            if (applyAudioStatus) {
                applyAudioStatus.textContent = `Pending: ${name} (${val}). Click Apply to activate.`;
                applyAudioStatus.style.color = 'var(--accent-primary, #38bdf8)';
            }
        }

        // 1. Math Precision Architecture
        const precisionBtns = document.querySelectorAll('.enginePrecisionBtn');
        const precisionPill = document.getElementById('settingsEnginePrecisionPill');
        const updatePrecisionUi = () => {
            precisionBtns.forEach(b => {
                const is64 = b.getAttribute('data-precision') === '64';
                b.classList.toggle('active', is64 === isPrecision64);
            });
            if (precisionPill) {
                precisionPill.textContent = isPrecision64 ? '64-BIT DOUBLE FLOAT' : '32-BIT FAST FLOAT';
            }
        };
        updatePrecisionUi();
        precisionBtns.forEach(b => {
            b.addEventListener('click', () => {
                isPrecision64 = b.getAttribute('data-precision') === '64';
                safeStorage.setItem('cachymusic_precision_64', isPrecision64 ? 'true' : 'false');
                safeStorage.setItem('cachymusic_engine_precision', isPrecision64 ? '64' : '32');
                updatePrecisionUi();
                updateWorkletParams();
                updateSignalPathUi();
                markAudioSettingsPending('Math Precision', isPrecision64 ? '64-Bit Studio Float' : '32-Bit Fast Float');
                showToast(`Precision Engine: ${isPrecision64 ? '64-Bit Studio Float' : '32-Bit Fast Float'}`);
            });
        });

        // 2. Hardware Analog Gain (PipeWire / ALSA)
        const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
        const hwGainDot = document.getElementById('settingsHwGainDot');
        const hwGainText = document.getElementById('settingsHwGainText');
        const updateHwGainUi = () => {
            if (hwGainBtn) hwGainBtn.classList.toggle('active', isHardwareGain);
            if (hwGainDot) hwGainDot.classList.toggle('active', isHardwareGain);
            if (hwGainText) {
                hwGainText.textContent = isHardwareGain ? `HARDWARE GAIN: ON (${hwVolumeBackend.toUpperCase()})` : 'HARDWARE GAIN: OFF';
            }
        };
        updateHwGainUi();
        if (hwGainBtn) {
            hwGainBtn.addEventListener('click', async () => {
                if (hwGainBtn.disabled || hwGainBtn.classList.contains('disabled')) return;
                isHardwareGain = !isHardwareGain;
                safeStorage.setItem('cachymusic_hardware_gain', isHardwareGain ? 'true' : 'false');
                safeStorage.setItem('cachymusic_hw_gain', isHardwareGain ? 'true' : 'false');
                updateHwGainUi();
                if (isHardwareGain) {
                    await checkHardwareGainStatus();
                    updateHwGainUi();
                    showToast('Hardware Analog Gain Enabled (0 dBFS Bit-Perfect DAC Stream)');
                } else {
                    if (audio) {
                        audio.volume = Math.min(1.0, currentVolumeValue);
                    }
                    showToast('Hardware Analog Gain Disabled (Digital Volume)');
                }
                updateSignalPathUi();
            });
        }

        // 3. Ultrasonic IMD Filter
        const ultrasonicBtn = document.getElementById('settingsUltrasonicToggleBtn');
        const ultrasonicDot = document.getElementById('settingsUltrasonicDot');
        const ultrasonicText = document.getElementById('settingsUltrasonicText');
        const ultrasonicSelect = document.getElementById('settingsUltrasonicCutoffSelect');
        const ultrasonicPill = document.getElementById('settingsUltrasonicPill');
        const updateUltrasonicUi = () => {
            if (ultrasonicBtn) ultrasonicBtn.classList.toggle('active', isUltrasonic);
            if (ultrasonicDot) ultrasonicDot.classList.toggle('active', isUltrasonic);
            if (ultrasonicText) {
                ultrasonicText.textContent = isUltrasonic ? 'ULTRASONIC FILTER: ON' : 'ULTRASONIC FILTER: OFF';
            }
            if (ultrasonicPill) {
                ultrasonicPill.textContent = isUltrasonic ? `ACTIVE (${Math.round(ultrasonicCutoff / 1000)} kHz)` : 'BYPASS';
            }
            if (ultrasonicSelect) {
                ultrasonicSelect.value = ultrasonicCutoff.toString();
            }
        };
        updateUltrasonicUi();
        if (ultrasonicBtn) {
            ultrasonicBtn.addEventListener('click', () => {
                isUltrasonic = !isUltrasonic;
                safeStorage.setItem('cachymusic_ultrasonic', isUltrasonic ? 'true' : 'false');
                updateUltrasonicUi();
                updateWorkletParams();
                updateAudioRouting();
                updateSignalPathUi();
                markAudioSettingsPending('Ultrasonic Filter', isUltrasonic ? 'Active (' + Math.round(ultrasonicCutoff / 1000) + ' kHz)' : 'Bypassed');
                showToast(`Ultrasonic IMD Filter: ${isUltrasonic ? 'Active (' + Math.round(ultrasonicCutoff / 1000) + ' kHz)' : 'Bypassed'}`);
            });
        }
        if (ultrasonicSelect) {
            ultrasonicSelect.addEventListener('change', () => {
                ultrasonicCutoff = parseInt(ultrasonicSelect.value, 10) || 32000;
                safeStorage.setItem('cachymusic_ultrasonic_cutoff', ultrasonicCutoff.toString());
                updateUltrasonicUi();
                updateWorkletParams();
                updateSignalPathUi();
                markAudioSettingsPending('Ultrasonic Cutoff', `${Math.round(ultrasonicCutoff / 1000)} kHz`);
                showToast(`Ultrasonic Cutoff: ${Math.round(ultrasonicCutoff / 1000)} kHz`);
            });
        }

        // 4. Dithering & Noise Shaping
        const ditherBtns = document.querySelectorAll('.ditherModeBtn');
        const ditherPill = document.getElementById('settingsDitherPill');
        const updateDitherUi = () => {
            ditherBtns.forEach(b => {
                const mode = b.getAttribute('data-dither');
                b.classList.toggle('active', mode === ditherMode);
            });
            if (ditherPill) {
                ditherPill.textContent = ditherMode === 'shaped' ? 'SHAPED (>18 kHz)' : (ditherMode === 'tpdf' ? 'TPDF FLAT' : 'OFF (TRUNCATE)');
            }
        };
        updateDitherUi();
        ditherBtns.forEach(b => {
            b.addEventListener('click', () => {
                ditherMode = b.getAttribute('data-dither') || 'shaped';
                safeStorage.setItem('cachymusic_dither_mode', ditherMode);
                updateDitherUi();
                updateWorkletParams();
                updateAudioRouting();
                updateSignalPathUi();
                markAudioSettingsPending('Dither Mode', ditherMode === 'shaped' ? 'Psychoacoustic Shaped' : (ditherMode === 'tpdf' ? 'TPDF Flat' : 'Off'));
                showToast(`Dither: ${ditherMode === 'shaped' ? 'Psychoacoustic Shaped' : (ditherMode === 'tpdf' ? 'TPDF Flat' : 'Off')}`);
            });
        });

        // 5. Speaker Ambiophonics R.A.C.E.
        const ambiBtn = document.getElementById('settingsAmbiToggleBtn');
        const ambiDot = document.getElementById('settingsAmbiDot');
        const ambiText = document.getElementById('settingsAmbiText');
        const ambiPill = document.getElementById('settingsAmbiPill');
        const updateAmbiUi = () => {
            if (ambiBtn) ambiBtn.classList.toggle('active', isAmbiophonics);
            if (ambiDot) ambiDot.classList.toggle('active', isAmbiophonics);
            if (ambiText) {
                ambiText.textContent = isAmbiophonics ? 'AMBIOPHONICS: ON (R.A.C.E.)' : 'AMBIOPHONICS: OFF (SPEAKERS ONLY)';
            }
            if (ambiPill) {
                ambiPill.textContent = isAmbiophonics ? 'ACTIVE (R.A.C.E.)' : 'BYPASS';
            }
        };
        updateAmbiUi();
        if (ambiBtn) {
            ambiBtn.addEventListener('click', () => {
                isAmbiophonics = !isAmbiophonics;
                safeStorage.setItem('cachymusic_ambiophonics', isAmbiophonics ? 'true' : 'false');
                updateAmbiUi();
                updateWorkletParams();
                updateAudioRouting();
                updateSignalPathUi();
                markAudioSettingsPending('Speaker Ambiophonics', isAmbiophonics ? 'Enabled (Speakers Only)' : 'Disabled');
                showToast(`Speaker Ambiophonics: ${isAmbiophonics ? 'Enabled (Speakers Only)' : 'Disabled'}`);
            });
        }

        // 6. Audio Buffer & Latency Tuning
        const bufferBtns = document.querySelectorAll('.bufferLatencyBtn');
        const bufferPill = document.getElementById('settingsBufferPill');
        const updateBufferUi = () => {
            bufferBtns.forEach(b => {
                const latency = b.getAttribute('data-latency');
                b.classList.toggle('active', latency === bufferLatencyTarget);
            });
            if (bufferPill) {
                bufferPill.textContent = bufferLatencyTarget === 'interactive' ? 'STUDIO LOW-LATENCY (~15ms)' : 'PLAYBACK (~100ms)';
            }
        };
        updateBufferUi();
        bufferBtns.forEach(b => {
            b.addEventListener('click', () => {
                const newLatency = b.getAttribute('data-latency') || 'playback';
                if (newLatency === bufferLatencyTarget) return;
                bufferLatencyTarget = newLatency;
                safeStorage.setItem('cachymusic_buffer_latency', bufferLatencyTarget);
                updateBufferUi();
                updateWorkletParams();
                updateSignalPathUi();
                markAudioSettingsPending('Buffer Latency', newLatency === 'interactive' ? 'Low Latency (~15ms)' : 'Stable (~100ms)');
                showToast(`Audio Buffer Calibrated: ${newLatency === 'interactive' ? 'Low Latency (~15ms)' : 'Stable Playback (~100ms)'}`);
            });
        });

        // 7. Settings Confirmation & Apply Action Handler
        if (applyAudioBtn) {
            applyAudioBtn.addEventListener('click', () => {
                pendingAudioChanges = 0;
                applyAudioBtn.textContent = 'APPLY AUDIO SETTINGS';
                applyAudioBtn.style.boxShadow = '';
                if (applyAudioStatus) {
                    applyAudioStatus.textContent = 'All audio settings applied successfully & active.';
                    applyAudioStatus.style.color = '#10b981';
                }
                updateWorkletParams();
                updateAudioRouting();
                updateSignalPathUi();
                if (typeof showCachyToast === 'function') {
                    showCachyToast('Settings Applied', 'Audio & DSP configuration applied successfully.', 'success');
                } else {
                    showToast('Settings Applied Successfully');
                }
                logAudioPlaybackEvent('info', 'User confirmed and applied audio DSP settings.');
            });
        }

        // 8. Playback Diagnostics & Debug Log Actions
        const copyDebugBtn = document.getElementById('settingsCopyDebugLogBtn');
        const clearDebugBtn = document.getElementById('settingsClearDebugLogBtn');
        if (copyDebugBtn) {
            copyDebugBtn.addEventListener('click', () => {
                const logs = window.audioPlaybackDebugLogs && window.audioPlaybackDebugLogs.length > 0
                    ? window.audioPlaybackDebugLogs.join('\n')
                    : 'No telemetry events logged yet.';
                navigator.clipboard.writeText(logs).then(() => {
                    showToast('Playback Diagnostics Copied');
                }).catch(() => {
                    showToast('Could not copy diagnostics.');
                });
            });
        }
        if (clearDebugBtn) {
            clearDebugBtn.addEventListener('click', () => {
                window.audioPlaybackDebugLogs = [];
                const logBox = document.getElementById('settingsAudioDebugLog');
                if (logBox) logBox.textContent = '[AudioEngine] Diagnostics log cleared.';
                consecutiveSkipCount = 0;
                updateAudioDiagnosticsUi();
                showToast('Diagnostics Log Cleared');
            });
        }

        // 9. On-Screen Audio Diagnostics & Debug Mode Controls
        const debugEnableBtn = document.getElementById('debugModeEnableBtn');
        const debugDisableBtn = document.getElementById('debugModeDisableBtn');
        if (debugEnableBtn) {
            debugEnableBtn.addEventListener('click', () => {
                setDebugMode(true);
                markAudioSettingsPending('Debug Mode', 'Enabled');
            });
        }
        if (debugDisableBtn) {
            debugDisableBtn.addEventListener('click', () => {
                setDebugMode(false);
                markAudioSettingsPending('Debug Mode', 'Disabled');
            });
        }

        const hudClearBtn = document.getElementById('debugHudClearBtn');
        const hudCopyBtn = document.getElementById('debugHudCopyBtn');
        const hudCloseBtn = document.getElementById('debugHudCloseBtn');
        if (hudClearBtn) {
            hudClearBtn.addEventListener('click', () => {
                window.audioPlaybackDebugLogs = [];
                const logList = document.getElementById('debugHudLogList');
                if (logList) logList.innerHTML = '<div class="debugHudLogEntry system">[SYSTEM] Debug telemetry cleared.</div>';
                const logBox = document.getElementById('settingsAudioDebugLog');
                if (logBox) logBox.textContent = '';
                consecutiveSkipCount = 0;
                updateAudioDiagnosticsUi();
            });
        }
        if (hudCopyBtn) {
            hudCopyBtn.addEventListener('click', () => {
                const logs = window.audioPlaybackDebugLogs && window.audioPlaybackDebugLogs.length > 0
                    ? window.audioPlaybackDebugLogs.join('\n')
                    : 'No telemetry events logged yet.';
                navigator.clipboard.writeText(logs).then(() => {
                    if (typeof showCachyToast === 'function') {
                        showCachyToast('Copied', 'Debug telemetry log copied to clipboard.', 'success');
                    }
                }).catch(() => {
                    if (typeof showCachyToast === 'function') {
                        showCachyToast('Clipboard Error', 'Could not copy diagnostics to clipboard.', 'warning');
                    }
                });
            });
        }
        if (hudCloseBtn) {
            hudCloseBtn.addEventListener('click', () => setDebugMode(false));
        }

        // Make Diagnostics HUD Draggable by Header
        const hudEl = document.getElementById('debugHudContainer');
        const hudHeaderEl = hudEl ? hudEl.querySelector('.debugHudHeader') : null;
        if (hudEl && hudHeaderEl) {
            let isDragging = false;
            let startPointerX = 0;
            let startPointerY = 0;
            let startLeft = 0;
            let startTop = 0;

            const headerBtns = hudHeaderEl.querySelectorAll('button');
            headerBtns.forEach(btn => {
                btn.addEventListener('pointerdown', (e) => e.stopPropagation());
            });

            hudHeaderEl.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                isDragging = true;
                try {
                    hudHeaderEl.setPointerCapture(e.pointerId);
                } catch (_) {}
                const rect = hudEl.getBoundingClientRect();
                startPointerX = e.clientX;
                startPointerY = e.clientY;
                startLeft = rect.left;
                startTop = rect.top;

                hudEl.style.bottom = 'auto';
                hudEl.style.transform = 'none';
                hudEl.style.left = `${startLeft}px`;
                hudEl.style.top = `${startTop}px`;
            });

            hudHeaderEl.addEventListener('pointermove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startPointerX;
                const dy = e.clientY - startPointerY;
                const rect = hudEl.getBoundingClientRect();
                const maxLeft = Math.max(0, window.innerWidth - rect.width);
                const maxTop = Math.max(0, window.innerHeight - rect.height);
                const newLeft = Math.max(0, Math.min(maxLeft, startLeft + dx));
                const newTop = Math.max(0, Math.min(maxTop, startTop + dy));
                hudEl.style.left = `${newLeft}px`;
                hudEl.style.top = `${newTop}px`;
            });

            const stopDrag = (e) => {
                if (!isDragging) return;
                isDragging = false;
                try {
                    hudHeaderEl.releasePointerCapture(e.pointerId);
                } catch (_) {}
            };
            hudHeaderEl.addEventListener('pointerup', stopDrag);
            hudHeaderEl.addEventListener('pointercancel', stopDrag);
        }

        // DAC Capability Detection & Feature Gating
        async function checkDacCapabilities() {
            let hasDac = false;
            let dacLabel = '';
            try {
                if (audioContext && audioContext.sampleRate > 48000) {
                    hasDac = true;
                    dacLabel = `${Math.round(audioContext.sampleRate / 1000)}kHz Hi-Res Interface`;
                }
                if (!hasDac && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const dacDev = devices.find(d => 
                        d.kind === 'audiooutput' && 
                        /dac|hi-?res|headphone|usb|external|interface|fiio|topping|schiit|audioquest|chord/i.test(d.label)
                    );
                    if (dacDev) {
                        hasDac = true;
                        dacLabel = dacDev.label || 'Connected DAC';
                    }
                }
            } catch (_) {}

            const dacBtn = document.getElementById('dacShapedDitherBtn');
            const dacPill = document.getElementById('settingsDacRequiredPill');
            if (dacBtn) {
                if (hasDac) {
                    dacBtn.removeAttribute('disabled');
                    dacBtn.classList.remove('disabled');
                    dacBtn.setAttribute('title', `Active DAC detected: ${dacLabel}`);
                } else {
                    dacBtn.setAttribute('disabled', 'true');
                    dacBtn.classList.add('disabled');
                    dacBtn.setAttribute('title', 'Requires connected USB DAC or high-res audio interface (96kHz+)');
                    if (ditherMode === 'shaped') {
                        ditherMode = 'tpdf';
                        try {
                            safeStorage.setItem('cachymusic_dither_mode', 'tpdf');
                        } catch (_) {}
                        const ditherBtns = document.querySelectorAll('.ditherModeBtn');
                        ditherBtns.forEach(b => {
                            b.classList.toggle('active', b.getAttribute('data-dither') === 'tpdf');
                        });
                        const ditherPillEl = document.getElementById('settingsDitherPill');
                        if (ditherPillEl) ditherPillEl.textContent = 'TPDF FLAT';
                    }
                }
            }
            if (dacPill) {
                dacPill.textContent = hasDac ? 'DAC READY' : 'REQUIRES DAC';
                dacPill.classList.toggle('active', hasDac);
            }
        }
        checkDacCapabilities();
        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', checkDacCapabilities);
        }

        // Ensure sleep timer cancel button is hidden initially if no timer is active
        const initCancelSleepBtn = document.getElementById('settingsTabCancelSleepBtn');
        if (initCancelSleepBtn && !sleepTimerMode) {
            initCancelSleepBtn.style.display = 'none';
        }

        if (typeof updateDebugHudState === 'function') {
            updateDebugHudState();
        }

        // 7. Settings Category Sub-Navigation Filter Bar (Balanced 2-Column Sub-Groupings)
        const catBtns = document.querySelectorAll('#settingsCategoryNav .settingsCatBtn');
        const settingsGrid = document.getElementById('settingsLayoutGrid');
        if (catBtns.length > 0 && settingsGrid) {
            const applySettingsCategory = (cat) => {
                catBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-cat') === cat));
                settingsGrid.setAttribute('data-active-cat', cat);

                const audioCol = document.getElementById('settingsColAudio');
                const sysCol = document.getElementById('settingsColSystem');
                if (audioCol) audioCol.style.display = '';
                if (sysCol) sysCol.style.display = '';

                const panels = settingsGrid.querySelectorAll('.settingsSectionPanel[data-settings-cat]');
                panels.forEach(panel => {
                    const panelCats = (panel.getAttribute('data-settings-cat') || '').split(/\s+/);
                    const isMatch = (cat === 'all') || panelCats.includes(cat);
                    panel.style.display = isMatch ? '' : 'none';
                });
            };

            catBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const cat = btn.getAttribute('data-cat') || 'audio';
                    try { safeStorage.setItem('cachymusic_settings_cat', cat); } catch (_) {}
                    applySettingsCategory(cat);
                });
            });

            const urlParams = new URLSearchParams(window.location.search);
            const urlCat = urlParams.get('cat');
            const savedCat = urlCat || safeStorage.getItem('cachymusic_settings_cat') || 'audio';
            applySettingsCategory(savedCat);
        }
    }

    function toggleReplayGain(active) {
        isReplayGain = typeof active === 'boolean' ? active : !isReplayGain;
        try {
            safeStorage.setItem('cachymusic_replaygain', isReplayGain ? 'true' : 'false');
        } catch (_) {}
        const curTrack = allTracks[currentTrackIndex];
        if (curTrack && replayGainNode && audioContext) {
            let targetGain = (isReplayGain && typeof curTrack.replayGain === 'number' && !isNaN(curTrack.replayGain))
                ? Math.pow(10, curTrack.replayGain / 20)
                : 1.0;
            if (isReplayGain && typeof curTrack.replayPeak === 'number' && curTrack.replayPeak > 0 && (targetGain * curTrack.replayPeak) > 0.965) {
                targetGain = 0.965 / curTrack.replayPeak; // -0.31 dBFS true-peak safety ceiling
            }
            replayGainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.04);
        }
        updateDacStatusUi();
    }

    function setVolume(val, updateInput = false) {
        if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
            val = 0.8;
        }
        currentVolumeValue = Math.max(0, Math.min(1.5, val));
        safeStorage.setItem('cachymusic_volume', currentVolumeValue.toString());
        if (updateInput && volumeSlider) {
            volumeSlider.value = currentVolumeValue;
        }
        if (miniVolumeSlider) {
            miniVolumeSlider.value = Math.min(1.0, currentVolumeValue);
        }

        if (isHardwareGain) {
            // Bit-Perfect Hardware Analog Gain: Keep software digital stream at 0 dBFS full precision
            audio.volume = 1.0;
            audio.muted = false;
            dispatchHardwareVolume(currentVolumeValue);
        } else {
            // Standard HTML5 audio.volume clamped to [0.0, 1.0]
            const baseVol = Math.min(1.0, currentVolumeValue);
            audio.volume = baseVol;
            audio.muted = false;

            if (audioContext) {
                const now = audioContext.currentTime;
                updateAmpGain(now);
                updateLimiterState(now);
                updateAudioRouting();
            }
        }

        const pct = Math.round(currentVolumeValue * 100);
        if (currentVolumeValue > 1.0) {
            volumeLevel.textContent = isHardwareGain ? `${pct}% HW-AMP` : `${pct}% AMP`;
            volumeLevel.classList.add('amplified');
            volumeLevel.setAttribute('title', isHardwareGain ? `Hardware Analog Gain: ${pct}%` : `Volume: 100% + Clean Amplification: ${pct - 100}%`);
        } else {
            volumeLevel.textContent = `${pct}%`;
            volumeLevel.classList.remove('amplified');
            volumeLevel.removeAttribute('title');
        }
        updateVolumeIcon(Math.min(1.0, currentVolumeValue));
    }


    // =========================================================================
    // High-Fidelity Audio Visualizer Engine
    // 60-band perceptual log binning, dual-stage smoothing, 3 reworked modes
    // =========================================================================


    function initDspNodes() {
        if (!audioContext) return;
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // 1024 frequency bins for full 0Hz - 24,000Hz (24kHz) Nyquist spectrum fidelity
        analyser.smoothingTimeConstant = 0.38; // Highly responsive FFT buffer: captures musical transient spikes without lag
        analyser.minDecibels = -90; // Wide dynamic range captures delicate high-frequency air, harmonics & cymbals above 16kHz
        analyser.maxDecibels = -25;

        // -1. Subsonic High-Pass Filter: Infrasonic rumble eliminator at 20 Hz (Butterworth Q=0.707)
        subsonicFilter = audioContext.createBiquadFilter();
        subsonicFilter.type = 'highpass';
        subsonicFilter.frequency.value = isSubsonic ? 20 : 5;
        subsonicFilter.Q.value = 0.707;

        // 0. ReplayGain / EBU R128 Loudness Normalization Stage
        replayGainNode = audioContext.createGain();
        replayGainNode.gain.value = 1.0;

        // 0.5. Dynamic Headroom Pre-Amp Gain Stage
        preAmpGainNode = audioContext.createGain();
        preAmpGainNode.gain.value = getPreAmpGainValue();

        // 0.8. Bauer Headphone Crossfeed Network (Meier / Bauer Acoustic HRTF Simulation)
        xfeedNetwork = createCrossfeedNetwork(audioContext);

        // 10-Band Parametric Equalizer (ISO standard 1-octave frequencies from 31 Hz to 16 kHz)
        peqNodes = PEQ_FREQS.map((freq, i) => {
            const f = audioContext.createBiquadFilter();
            if (i === 0) f.type = 'lowshelf';
            else if (i === PEQ_FREQS.length - 1) f.type = 'highshelf';
            else f.type = 'peaking';
            f.frequency.value = freq;
            f.Q.value = (peqQs && typeof peqQs[i] === 'number') ? peqQs[i] : 1.41;
            f.gain.value = (peqGains && typeof peqGains[i] === 'number' && !isPeqBypassed) ? peqGains[i] : 0;
            return f;
        });

        // 1. Bass Boost Filter: Low-shelf filter at 95 Hz (+3.8 dB Harman sub-bass target)
        bassFilter = audioContext.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 95;
        bassFilter.gain.value = isBassBoost ? 3.8 : 0;

        // 2. Vocal Boost Filter: Peaking bandpass at 3000 Hz (+2.8 dB Pinna Ear-Gain presence)
        vocalFilter = audioContext.createBiquadFilter();
        vocalFilter.type = 'peaking';
        vocalFilter.frequency.value = 3000;
        vocalFilter.Q.value = 1.2;
        vocalFilter.gain.value = isVocalBoost ? 2.8 : 0;

        // 3. Treble Boost Filter: High-shelf filter at 10000 Hz (+3.0 dB Air Band & high shimmer)
        trebleFilter = audioContext.createBiquadFilter();
        trebleFilter.type = 'highshelf';
        trebleFilter.frequency.value = 10000;
        trebleFilter.gain.value = isTrebleBoost ? 3.0 : 0;

        // 4. Clean Amplification Gain Stage (raw unconstrained gain)
        ampGainNode = audioContext.createGain();
        ampGainNode.gain.value = isAmpBoost ? getEffectiveAmplification() : 1.0;

        // 5. Dedicated Studio-Grade Transparent Brickwall Limiter (Master anti-clipping protection)
        dspLimiter = audioContext.createDynamicsCompressor();
        const initProfile = computeLimiterProfile();
        if (isLimiter && !initProfile.isBypassed) {
            dspLimiter.threshold.value = initProfile.threshold;
            dspLimiter.knee.value = initProfile.knee;
            dspLimiter.ratio.value = initProfile.ratio;
            dspLimiter.attack.value = initProfile.attack;
            dspLimiter.release.value = initProfile.release;
        } else {
            dspLimiter.threshold.value = 0;
            dspLimiter.knee.value = 0;
            dspLimiter.ratio.value = 1.0;
            dspLimiter.attack.value = 0.0018;
            dspLimiter.release.value = 0.090;
        }

        // 6. True Peak Output Ceiling Stage (-0.6 dBFS anti-clipping ceiling for DAC reconstruction)
        ceilingTrimGain = audioContext.createGain();
        ceilingTrimGain.gain.value = isLimiter ? Math.pow(10, -0.6 / 20) : 1.0;

        // 7. Analog Soft-Clipper (Smooth hyperbolic tangent curve prevents harsh square-wave DAC clipping)
        ampSoftClipper = audioContext.createWaveShaper();
        ampSoftClipper.curve = isLimiter ? createSoftClipCurve(2048) : createLinearCurve(2048);
        // Adaptive oversampling: Hi-Res audio (>= 88.2 kHz) already has ultra-high Nyquist headroom (44.1+ kHz bandwidth),
        // so 2x oversampling is redundant and overloads the audio rendering thread (192,000+ samples/sec).
        ampSoftClipper.oversample = (audioContext.sampleRate >= 88200) ? 'none' : '2x';
    }

    function resetMediaElementForNewAudioContext() {
        if (!audio) return;
        const oldAudio = audio;
        oldAudio._isDisposed = true;
        try {
            oldAudio.pause();
            oldAudio.onplay = null;
            oldAudio.onplaying = null;
            oldAudio.onpause = null;
            oldAudio.onerror = null;
            oldAudio.onended = null;
            oldAudio.ontimeupdate = null;
            oldAudio.onwaiting = null;
            oldAudio.onstalled = null;
            oldAudio.removeAttribute('src');
        } catch (_) {}

        const newAudio = document.createElement('audio');
        newAudio.id = 'audioPlayer';
        newAudio.preload = 'auto';
        if (oldAudio.crossOrigin) {
            newAudio.crossOrigin = oldAudio.crossOrigin;
        }
        newAudio.volume = oldAudio.volume;
        newAudio.muted = oldAudio.muted;
        newAudio.loop = oldAudio.loop;
        if (oldAudio.src && !oldAudio.src.endsWith(window.location.href)) {
            newAudio.src = oldAudio.src;
        }
        if (oldAudio.parentNode) {
            oldAudio.parentNode.replaceChild(newAudio, oldAudio);
        }
        audio = newAudio;
        attachAudioListeners(audio);
    }

    function getOrCreateAudioSourceNode() {
        if (!audioContext || !audio) return null;
        if (audioSourceNode) return audioSourceNode;
        if (audio._mediaSourceNode && audio._mediaSourceContext === audioContext) {
            audioSourceNode = audio._mediaSourceNode;
            return audioSourceNode;
        }
        try {
            audioSourceNode = audioContext.createMediaElementSource(audio);
            audio._mediaSourceNode = audioSourceNode;
            audio._mediaSourceContext = audioContext;
            return audioSourceNode;
        } catch (_) {
            // Chromium safety fallback: if element was attached to an earlier context, refresh it
            resetMediaElementForNewAudioContext();
            try {
                audioSourceNode = audioContext.createMediaElementSource(audio);
                audio._mediaSourceNode = audioSourceNode;
                audio._mediaSourceContext = audioContext;
            } catch (e2) {
                console.error('Failed to create MediaElementSource on replacement element:', e2);
            }
            return audioSourceNode;
        }
    }

    function updateAudioRouting() {
        if (!audioContext) return;
        if (!audioSourceNode) {
            getOrCreateAudioSourceNode();
        }
        if (!audioSourceNode) return;
        try {
            audioSourceNode.disconnect();
            if (softwareSourceGainNode) {
                try { softwareSourceGainNode.disconnect(); } catch (_) {}
            }
            if (subsonicFilter) subsonicFilter.disconnect();
            if (replayGainNode) replayGainNode.disconnect();
            if (preAmpGainNode) preAmpGainNode.disconnect();
            if (xfeedNetwork && xfeedNetwork.output) xfeedNetwork.output.disconnect();
            if (peqNodes) peqNodes.forEach(node => { try { node.disconnect(); } catch (_) {} });
            if (bassFilter) bassFilter.disconnect();
            if (vocalFilter) vocalFilter.disconnect();
            if (trebleFilter) trebleFilter.disconnect();
            if (ampGainNode) ampGainNode.disconnect();
            if (dspLimiter) dspLimiter.disconnect();
            if (ceilingTrimGain) ceilingTrimGain.disconnect();
            if (ampSoftClipper) ampSoftClipper.disconnect();
            if (dspWorkletNode) {
                try { dspWorkletNode.disconnect(); } catch (_) {}
            }

            // Headroom Pre-Amp Gain
            updatePreAmpGain(audioContext.currentTime);

            // Active source: if in software decoding buffer mode, route through softwareSourceGainNode
            const activeSource = (isSoftwareDecoding && softwareSourceGainNode) ? softwareSourceGainNode : audioSourceNode;

            // Root node after source: Subsonic (only if worklet is not active, avoiding duplicate 24dB/oct roll-off) + ReplayGain + Pre-Amp headroom
            let rootNode = activeSource;
            if (isSubsonic && subsonicFilter && !dspWorkletNode) {
                activeSource.connect(subsonicFilter);
                rootNode = subsonicFilter;
            }
            if (replayGainNode) {
                rootNode.connect(replayGainNode);
                rootNode = replayGainNode;
            }
            if (preAmpGainNode) {
                rootNode.connect(preAmpGainNode);
                rootNode = preAmpGainNode;
            }

            if (!hasActiveDsp()) {
                // Pure Native Linear Pass-Through:
                // If 64-bit precision worklet is loaded, stream through double-precision worklet buffer; otherwise direct DAC stream
                if (dspWorkletNode && isPrecision64) {
                    rootNode.connect(dspWorkletNode);
                    dspWorkletNode.connect(audioContext.destination);
                } else {
                    rootNode.connect(audioContext.destination);
                }
                // Non-invasive parallel tap to analyser (visualizer receives full native audio data)
                if (analyser) {
                    rootNode.connect(analyser);
                }
            } else {
                let current = rootNode;

                // Bauer Headphone Crossfeed (if active)
                if (isCrossfeed && xfeedNetwork) {
                    current.connect(xfeedNetwork.input);
                    current = xfeedNetwork.output;
                }

                // 10-Band Parametric Equalizer Stage
                if (peqNodes && peqNodes.length > 0) {
                    for (const peqBand of peqNodes) {
                        current.connect(peqBand);
                        current = peqBand;
                    }
                }

                // Full Studio DSP & Dynamics Engine Route:
                current.connect(bassFilter);
                bassFilter.connect(vocalFilter);
                vocalFilter.connect(trebleFilter);
                if (analyser) trebleFilter.connect(analyser);
                trebleFilter.connect(ampGainNode);

                // Only route through DynamicsCompressor + SoftClipper when Limiter or Volume Overdrive (>100%) is active
                let terminalNode = ampGainNode;
                if ((isLimiter || currentVolumeValue > 1.0) && dspLimiter && ampSoftClipper) {
                    ampGainNode.connect(dspLimiter);
                    if (ceilingTrimGain) {
                        dspLimiter.connect(ceilingTrimGain);
                        ceilingTrimGain.connect(ampSoftClipper);
                    } else {
                        dspLimiter.connect(ampSoftClipper);
                    }
                    terminalNode = ampSoftClipper;
                }

                // Route through 64-bit AudioWorklet (Ultrasonic IMD filter, Ambiophonics R.A.C.E., TPDF/Noise-Shaped Dither)
                if (dspWorkletNode) {
                    terminalNode.connect(dspWorkletNode);
                    dspWorkletNode.connect(audioContext.destination);
                } else {
                    terminalNode.connect(audioContext.destination);
                }
            }
        } catch (e) {
            console.warn('Audio routing update warning:', e);
        }
        updateDacStatusUi();
    }

    async function ensureAudioEngineForSampleRate(targetRate = 44100, forceRecreate = false) {
        // Respect native integer clocking (44.1k, 48k, 88.2k, 96k, 176.4k, 192k)
        const cleanRate = getValidSampleRate(targetRate);
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;

        // If audioContext is already initialized and active, reuse it to preserve active HTMLMediaElement source & user gesture state
        if (!forceRecreate && audioContext && audioContext.state !== 'closed') {
            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
            if (!audioSourceNode) {
                getOrCreateAudioSourceNode();
                updateAudioRouting();
            }
            updateDacStatusUi();
            return audioContext;
        }

        // Initial creation needed
        try {
            if (dspWorkletNode) {
                try { dspWorkletNode.disconnect(); } catch (_) {}
                dspWorkletNode = null;
            }
            if (audioSourceNode) {
                try { audioSourceNode.disconnect(); } catch (_) {}
                audioSourceNode = null;
            }
            if (audioContext) {
                try { await audioContext.close(); } catch (_) {}
                audioContext = null;
                resetMediaElementForNewAudioContext();
            }

            // Create studio-grade AudioContext with native sample rate and user latency target
            const latencyHintVal = bufferLatencyTarget === 'interactive' ? 'interactive' : 'playback';
            try {
                audioContext = new AudioCtx({
                    sampleRate: cleanRate,
                    latencyHint: latencyHintVal
                });
            } catch (err) {
                console.warn(`Hardware or browser rejected sampleRate (${cleanRate}Hz), falling back gracefully:`, err);
                try {
                    audioContext = new AudioCtx({ latencyHint: latencyHintVal });
                } catch (_) {
                    audioContext = new AudioCtx();
                }
            }

            initDspNodes();
            getOrCreateAudioSourceNode();
            updateAudioRouting();
            loadDspWorklet().catch(() => {});

            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
        } catch (e) {
            console.error('ensureAudioEngineForSampleRate failure:', e);
        }

        updateDacStatusUi();
        return audioContext;
    }

    function initAudioContext(preferredRate = null) {
        if (audioContext && audioContext.state !== 'closed') {
            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
            return audioContext;
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;

        if (!preferredRate) {
            const track = allTracks[currentTrackIndex];
            preferredRate = (track && track.sampleRate) ? getValidSampleRate(track.sampleRate) : 44100;
        }
        const cleanRate = getValidSampleRate(preferredRate);

        const latencyHintVal = bufferLatencyTarget === 'interactive' ? 'interactive' : 'playback';
        try {
            audioContext = new AudioCtx({
                sampleRate: cleanRate,
                latencyHint: latencyHintVal
            });
        } catch (err) {
            try {
                audioContext = new AudioCtx({ latencyHint: latencyHintVal });
            } catch (_) {
                audioContext = new AudioCtx();
            }
        }

        dspWorkletNode = null;
        initDspNodes();
        getOrCreateAudioSourceNode();
        updateAudioRouting();
        loadDspWorklet().catch(() => {});
        updateDacStatusUi();
        return audioContext;
    }

    // Unlock AudioContext on any user interaction if suspended
    ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(ev => {
        window.addEventListener(ev, () => {
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
        }, { passive: true });
    });


    // Attach top-level Audio Engine functions to window for cross-module accessibility
    if (typeof window !== "undefined") {
        try { window.checkHardwareGainStatus = checkHardwareGainStatus; } catch (_) {}
        try { window.computeLimiterProfile = computeLimiterProfile; } catch (_) {}
        try { window.createCrossfeedNetwork = createCrossfeedNetwork; } catch (_) {}
        try { window.createLinearCurve = createLinearCurve; } catch (_) {}
        try { window.createSoftClipCurve = createSoftClipCurve; } catch (_) {}
        try { window.dispatchHardwareVolume = dispatchHardwareVolume; } catch (_) {}
        try { window.drawPeqCurve = drawPeqCurve; } catch (_) {}
        try { window.ensureAudioEngineForSampleRate = ensureAudioEngineForSampleRate; } catch (_) {}
        try { window.getEffectiveAmplification = getEffectiveAmplification; } catch (_) {}
        try { window.getOrCreateAudioSourceNode = getOrCreateAudioSourceNode; } catch (_) {}
        try { window.getPreAmpGainValue = getPreAmpGainValue; } catch (_) {}
        try { window.hwVolumeDebounceTimer = hwVolumeDebounceTimer; } catch (_) {}
        try { window.importAutoEqProfile = importAutoEqProfile; } catch (_) {}
        try { window.initAudioContext = initAudioContext; } catch (_) {}
        try { window.initDspNodes = initDspNodes; } catch (_) {}
        try { window.initPeqWorkstation = initPeqWorkstation; } catch (_) {}
        try { window.loadDspWorklet = loadDspWorklet; } catch (_) {}
        try { window.markHwGainUnavailable = markHwGainUnavailable; } catch (_) {}
        try { window.resetMediaElementForNewAudioContext = resetMediaElementForNewAudioContext; } catch (_) {}
        try { window.setDspBoost = setDspBoost; } catch (_) {}
        try { window.setPeqBandGain = setPeqBandGain; } catch (_) {}
        try { window.setPeqBandQ = setPeqBandQ; } catch (_) {}
        try { window.setPeqPreset = setPeqPreset; } catch (_) {}
        try { window.setVolume = setVolume; } catch (_) {}
        try { window.setupDspControls = setupDspControls; } catch (_) {}
        try { window.setupNeutronSettingsControls = setupNeutronSettingsControls; } catch (_) {}
        try { window.toggleDspBoost = toggleDspBoost; } catch (_) {}
        try { window.toggleReplayGain = toggleReplayGain; } catch (_) {}
        try { window.updateAmpGain = updateAmpGain; } catch (_) {}
        try { window.updateAudioRouting = updateAudioRouting; } catch (_) {}
        try { window.updateDspButtonsUi = updateDspButtonsUi; } catch (_) {}
        try { window.updateLimiterState = updateLimiterState; } catch (_) {}
        try { window.updatePreAmpGain = updatePreAmpGain; } catch (_) {}
        try { window.updateWorkletParams = updateWorkletParams; } catch (_) {}
    }



    // --- Sub-Module: player-core.js ---
// CachyMusic - Core Audio Player, Software Decoder & Gapless Transport
    function initMprisBridge() {
        let lastReportedStatus = '';
        let lastReportedTitle = '';
        let lastReportedPos = -1;

        function reportState(force = false) {
            const track = allTracks[currentTrackIndex];
            const isPlaying = !audio.paused && !audio.ended;
            const status = isPlaying ? 'Playing' : (audio.currentTime > 0 ? 'Paused' : 'Stopped');
            const pos = Math.floor(audio.currentTime || 0);
            const title = track ? (track.title || track.filename || '') : '';

            if (!force && status === lastReportedStatus && title === lastReportedTitle && Math.abs(pos - lastReportedPos) < 2) {
                return;
            }

            lastReportedStatus = status;
            lastReportedTitle = title;
            lastReportedPos = pos;

            const payload = {
                status,
                position: audio.currentTime || 0,
                duration: audio.duration || (track ? track.duration : 0) || 0,
                title: track ? (track.title || track.filename || 'Unknown') : 'CachyMusic',
                artist: track ? (track.artist || 'Unknown Artist') : 'CachyOS',
                album: track ? (track.album || '') : '',
                artUrl: track && track.cover ? (track.cover.startsWith('http') ? track.cover : window.location.origin + '/' + track.cover) : '',
                volume: audio.volume,
                shuffle: isShuffle,
                repeat: repeatMode
            };

            fetch('php/api/mpris_state.php?action=update_state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(() => {});
        }

        let isPollingCommands = false;
        let consecutiveIdlePolls = 0;
        async function pollCommands() {
            if (isPollingCommands) {
                setTimeout(pollCommands, 500);
                return;
            }
            isPollingCommands = true;
            let hadCommand = false;
            try {
                if (document.hidden) {
                    consecutiveIdlePolls = 10;
                    return;
                }
                const res = await fetch('php/api/mpris_state.php?action=get_command');
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.command) {
                        hadCommand = true;
                        consecutiveIdlePolls = 0;
                        const cmd = data.command;
                        if (cmd === 'PlayPause') {
                            if (audio.paused) playAudio(true);
                            else pauseAudio();
                        } else if (cmd === 'Play') {
                            playAudio(true);
                        } else if (cmd === 'Pause') {
                            pauseAudio();
                        } else if (cmd === 'Stop') {
                            pauseAudio();
                            audio.currentTime = 0;
                        } else if (cmd === 'Next') {
                            nextTrack();
                        } else if (cmd === 'Previous') {
                            prevTrack();
                        } else if (cmd === 'Seek' && typeof data.offset === 'number') {
                            audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + data.offset));
                        } else if (cmd === 'SeekTo' && typeof data.position === 'number') {
                            audio.currentTime = Math.max(0, Math.min(audio.duration || 0, data.position));
                        } else if (cmd === 'SetVolume' && typeof data.volume === 'number') {
                            setVolume(Math.max(0, Math.min(1.5, data.volume)), true);
                        } else if (cmd === 'ToggleShuffle') {
                            isShuffle = !isShuffle;
                            if (shuffleBtn) {
                                shuffleBtn.classList.toggle('active', isShuffle);
                                shuffleBtn.setAttribute('title', isShuffle ? 'Shuffle Active' : 'Toggle Shuffle');
                            }
                        } else if (cmd === 'SetShuffle' && typeof data.shuffle === 'boolean') {
                            isShuffle = data.shuffle;
                            if (shuffleBtn) {
                                shuffleBtn.classList.toggle('active', isShuffle);
                                shuffleBtn.setAttribute('title', isShuffle ? 'Shuffle Active' : 'Toggle Shuffle');
                            }
                        } else if (cmd === 'SetLoopStatus' && typeof data.loopStatus === 'string') {
                            const ls = data.loopStatus.toLowerCase();
                            if (ls === 'track') repeatMode = 'one';
                            else if (ls === 'playlist') repeatMode = 'all';
                            else repeatMode = 'off';
                            if (typeof updateRepeatUI === 'function') updateRepeatUI();
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
                    nextDelay = 2500;
                } else if (consecutiveIdlePolls > 10) {
                    nextDelay = 1200;
                } else if (consecutiveIdlePolls > 3) {
                    nextDelay = 700;
                }
                setTimeout(pollCommands, nextDelay);
            }
        }

        audio.addEventListener('play', () => reportState(true));
        audio.addEventListener('playing', () => reportState(true));
        audio.addEventListener('pause', () => reportState(true));
        audio.addEventListener('ended', () => reportState(true));
        audio.addEventListener('timeupdate', () => reportState(false));

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

    // Load Track by Index in allTracks
    async function loadTrack(index, autoPlay = true, initialTime = 0) {
        if (!allTracks[index]) return;
        currentTrackIndex = index;
        trackPlaybackRetryCount = 0;
        stopSoftwarePlayback();
        activeDecodedBuffer = null;
        isSoftwareDecoding = false;
        // Supersede any in-flight playAudio() call from an earlier track selection
        currentPlayRequestId++;
        isPlayPending = false;
        if (playPendingTimeout) {
            clearTimeout(playPendingTimeout);
            playPendingTimeout = null;
        }

        if (isStandalonePlayback) {
            isStandalonePlayback = false;
            updateStandaloneBannerUi(false);
        }
        const track = allTracks[currentTrackIndex];

        // Cache currently loaded track state in localStorage
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

        const isKnownSoftware = alwaysSoftwareDecodeUrls.has(trackSrc) || (track.src && alwaysSoftwareDecodeUrls.has(track.src));

        // Ensure studio-fidelity AudioContext clock rate matches track (44.1k, 48k, 88.2k, 96k, 176.4k, 192k)
        const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
        await ensureAudioEngineForSampleRate(targetRate);

        if (currentTrackIndex !== index) return; // Guard against rapid skipping during context change

        // Apply EBU R128 / ReplayGain Loudness Leveling with -0.3 dBFS True-Peak protection (safeguards MP3/M4A ISPs)
        if (replayGainNode && audioContext) {
            let targetGain = 1.0;
            if (isReplayGain && typeof track.replayGain === 'number' && !isNaN(track.replayGain)) {
                targetGain = Math.pow(10, track.replayGain / 20);
                if (typeof track.replayPeak === 'number' && track.replayPeak > 0 && (targetGain * track.replayPeak) > 0.965) {
                    targetGain = 0.965 / track.replayPeak; // -0.31 dBFS true-peak guard band
                }
            }
            try {
                replayGainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.04);
            } catch (_) {}
        }

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
        if (!isKnownSoftware) {
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

        // Enforce timeframe: selected tracks must ALWAYS start at the beginning (0:00),
        // unless initialTime was explicitly provided (to restore last unfinished track on boot).
        const targetTime = (typeof initialTime === 'number' && !isNaN(initialTime) && initialTime > 0) ? initialTime : 0;

        if (targetTime > 0 && audio.readyState >= 1) {
            try { audio.currentTime = targetTime; } catch (_) {}
        }

        if (targetTime === 0) {
            try {
                safeStorage.removeItem('cachymusic_last_track_time');
            } catch (_) {}
        }

        const applyTargetTime = () => {
            if (targetTime > 0 && audio.duration && !isNaN(audio.duration) && targetTime >= (audio.duration - 1)) {
                // If saved time exceeded or reached duration, treat as ended and restart at 0:00
                audio.currentTime = 0;
                currentTimeEl.textContent = '0:00';
                if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
                progressBar.style.width = '0%';
                if (miniProgressBar) miniProgressBar.style.width = '0%';
                try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {}
                return;
            }

            try {
                audio.currentTime = targetTime;
            } catch (_) {}

            if (targetTime === 0) {
                currentTimeEl.textContent = '0:00';
                if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
                progressBar.style.width = '0%';
                if (miniProgressBar) miniProgressBar.style.width = '0%';
            } else {
                currentTimeEl.textContent = formatTime(targetTime);
                if (miniCurrentTime) miniCurrentTime.textContent = formatTime(targetTime);
                const dur = audio.duration || track.duration || 0;
                if (dur > 0) {
                    const pct = Math.min(100, Math.max(0, (targetTime / dur) * 100));
                    progressBar.style.width = `${pct}%`;
                    if (miniProgressBar) miniProgressBar.style.width = `${pct}%`;
                }
            }
        };

        if (activeLoadedMetadataHandler) {
            try { audio.removeEventListener('loadedmetadata', activeLoadedMetadataHandler); } catch (_) {}
        }
        activeLoadedMetadataHandler = applyTargetTime;
        if (!isKnownSoftware) {
            audio.addEventListener('loadedmetadata', applyTargetTime, { once: true });
        }

        // Center Deck Text - Real Tags or Fallback to Filename / Unknown
        updateEmptyPlayerState();
        updateMarqueeText(trackName, track.title ? track.title : (track.filename || 'Unknown'));
        updateMarqueeText(artistName, track.artist ? track.artist : 'Unknown');
        updateMarqueeText(albumName, track.album ? `Album: ${track.album}${track.year ? ' (' + track.year + ')' : ''}` : 'Album: Unknown');

        // Dynamic Audio Specifications Badge
        updateTrackBadgeUi(track);

        // Cover Artwork & Badge
        const coverSrc = track.cover || 'resources/images/default.svg';
        const hasCustomCover = Boolean(track.cover && !track.cover.includes('default.svg'));
        if (deckArtworkBackdrop) {
            deckArtworkBackdrop.onerror = () => { deckArtworkBackdrop.onerror = null; deckArtworkBackdrop.src = 'resources/images/default.svg'; };
            deckArtworkBackdrop.src = coverSrc;
            deckArtworkBackdrop.style.opacity = hasCustomCover ? '0.28' : '0.04';
        }
        if (deckArtworkAmbient) {
            deckArtworkAmbient.onerror = () => { deckArtworkAmbient.onerror = null; deckArtworkAmbient.src = 'resources/images/default.svg'; };
            deckArtworkAmbient.src = coverSrc;
            deckArtworkAmbient.style.opacity = hasCustomCover ? '0.35' : '0';
        }
        if (vinylArt) {
            vinylArt.onerror = () => { vinylArt.onerror = null; vinylArt.src = 'resources/images/default.svg'; };
            vinylArt.src = coverSrc;
        }
        if (coverArtPreview) {
            coverArtPreview.onerror = () => { coverArtPreview.onerror = null; coverArtPreview.src = 'resources/images/default.svg'; };
            coverArtPreview.src = coverSrc;
        }
        updateAmbientLighting(coverSrc);
        window.appendDebugTelemetry?.(`[LOAD] Track #${index + 1}: "${track.title || track.filename}" (${track.format || 'AUDIO'}, ${track.sampleRate || 44100}Hz)`);

        if (coverBadge) {
            if (track.cover) {
                coverBadge.textContent = 'COVER ART';
                coverBadge.style.color = 'inherit';
            } else {
                coverBadge.textContent = 'MUSIC ICON';
                coverBadge.style.color = '#888888';
            }
        }

        // Right Panel Metadata Inspector - Exact Embedded Tags or Unknown / N/A
        try { window.currentInspectedTrack = track; } catch (_) {}
        statTitle.textContent = track.title ? track.title : 'Unknown';
        statArtist.textContent = track.artist ? track.artist : 'Unknown';
        statAlbum.textContent = track.album ? track.album : 'Unknown';
        statGenre.textContent = (typeof normalizeGenre === 'function' ? normalizeGenre(track.genre) : track.genre) || 'N/A';
        statYear.textContent = track.year ? track.year.toString() : 'N/A';
        if (statTrack) statTrack.textContent = track.track ? track.track.toString() : 'N/A';
        statBitrate.textContent = track.bitrate ? `${track.bitrate} kbps` : 'N/A';
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
        statFormat.textContent = track.format ? track.format.toUpperCase() : 'N/A';
        statSize.textContent = track.size ? track.size : 'N/A';
        statPath.textContent = track.filename ? track.filename : 'N/A';
        statPath.title = track.fullPath || track.filename || 'N/A';

        // Highlight active track in the list and handle virtualized window scrolling
        renderVirtualTrackWindow(true);
        const displayedIdx = displayedTracks.findIndex(t => (
            (track.id && t.id) ? t.id === track.id :
            ((track.tid && t.tid) ? t.tid === track.tid : t.filename === track.filename)
        ));
        if (displayedIdx !== -1) {
            const activeEl = trackList.querySelector(`.trackItem[data-index="${displayedIdx}"]`);
            if (activeEl) {
                activeEl.classList.add('active');
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                scrollToTrackIndex(displayedIdx, true);
            }
        }

        if (targetTime > 0) {
            currentTimeEl.textContent = formatTime(targetTime);
            if (miniCurrentTime) miniCurrentTime.textContent = formatTime(targetTime);
            const totalSec = track.duration || 0;
            if (totalSec > 0) {
                const pct = Math.min(100, Math.max(0, (targetTime / totalSec) * 100));
                progressBar.style.width = `${pct}%`;
                if (miniProgressBar) miniProgressBar.style.width = `${pct}%`;
            }
        } else {
            progressBar.style.width = '0%';
            if (miniProgressBar) miniProgressBar.style.width = '0%';
            currentTimeEl.textContent = '0:00';
            if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
        }
        totalDurationEl.textContent = formatTime(track.duration);
        if (miniTotalDuration) miniTotalDuration.textContent = formatTime(track.duration);
        updateMiniPlayerInfo(track);
        updateLyricsDisplay(track);
        if (targetTime > 0 && isLyricsView) {
            updateActiveLyric(targetTime);
        }

        // Native MediaSession Metadata sync (informs OS & browser of currently loaded track)
        if ('mediaSession' in navigator && window.MediaMetadata) {
            try {
                const resolvedCover = track.cover
                    ? new URL(track.cover, window.location.href).href
                    : new URL('resources/images/default.svg', window.location.href).href;
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.title || track.filename || 'Unknown Title',
                    artist: track.artist || 'Unknown Artist',
                    album: track.album || 'CachyMusic Workstation',
                    artwork: [
                        { src: resolvedCover, sizes: '512x512', type: track.cover ? 'image/png' : 'image/svg+xml' }
                    ]
                });
            } catch (_) {}
        }

        if (isKnownSoftware) {
            if (autoPlay) {
                playWithSoftwareDecoder(track, initialTime);
            } else {
                isSoftwarePaused = true;
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
        const banner = (typeof standaloneBanner !== 'undefined' && standaloneBanner) ? standaloneBanner : document.getElementById('standaloneBanner');
        const titleEl = (typeof standaloneBannerTitle !== 'undefined' && standaloneBannerTitle) ? standaloneBannerTitle : document.getElementById('standaloneBannerTitle');
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
    window.updateStandaloneBannerUi = updateStandaloneBannerUi;

    function exitStandalonePlayback(returnToLibrary = true) {
        isStandalonePlayback = false;
        updateStandaloneBannerUi(false);
        if (returnToLibrary && allTracks && allTracks.length > 0) {
            const targetIdx = (currentTrackIndex >= 0 && currentTrackIndex < allTracks.length) ? currentTrackIndex : 0;
            loadTrack(targetIdx, isPlaying);
        } else {
            pauseAudio();
            updateEmptyPlayerState();
        }
    }
    window.exitStandalonePlayback = exitStandalonePlayback;

    async function loadStandaloneTrack(indexOrTrack = 0, autoPlay = true) {
        let track = null;
        if (typeof indexOrTrack === 'number') {
            standaloneTrackIndex = Math.max(0, Math.min((standaloneTrackList.length || 1) - 1, indexOrTrack));
            track = standaloneTrackList[standaloneTrackIndex];
        } else if (indexOrTrack && typeof indexOrTrack === 'object') {
            track = indexOrTrack;
            standaloneTrackList = [track];
            standaloneTrackIndex = 0;
        }
        if (!track) return;

        isStandalonePlayback = true;
        updateStandaloneBannerUi(true, track);

        if (isSoftwareDecoding && softwareSourceNode) {
            try { softwareSourceNode.stop(); } catch (_) {}
            isSoftwareDecoding = false;
        }
        if (softwarePlaybackRaf) {
            cancelAnimationFrame(softwarePlaybackRaf);
            softwarePlaybackRaf = null;
        }

        let trackSrc = track.src || '';
        if (trackSrc.startsWith('../')) trackSrc = trackSrc.substring(3);

        const isKnownSoftware = alwaysSoftwareDecodeUrls.has(trackSrc) || (track.src && alwaysSoftwareDecodeUrls.has(track.src));

        const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
        await ensureAudioEngineForSampleRate(targetRate);

        if (replayGainNode && audioContext) {
            let targetGain = 1.0;
            if (isReplayGain && typeof track.replayGain === 'number' && !isNaN(track.replayGain)) {
                targetGain = Math.pow(10, track.replayGain / 20);
                if (typeof track.replayPeak === 'number' && track.replayPeak > 0 && (targetGain * track.replayPeak) > 0.965) {
                    targetGain = 0.965 / track.replayPeak;
                }
            }
            try {
                replayGainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.04);
            } catch (_) {}
        }

        currentTrackGeneration++;
        audio._trackGeneration = currentTrackGeneration;
        if (!isKnownSoftware) {
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
        if (deckArtworkBackdrop) {
            deckArtworkBackdrop.onerror = () => { deckArtworkBackdrop.onerror = null; deckArtworkBackdrop.src = 'resources/images/default.svg'; };
            deckArtworkBackdrop.src = coverSrc;
            deckArtworkBackdrop.style.opacity = hasCustomCover ? '0.28' : '0.04';
        }
        if (deckArtworkAmbient) {
            deckArtworkAmbient.onerror = () => { deckArtworkAmbient.onerror = null; deckArtworkAmbient.src = 'resources/images/default.svg'; };
            deckArtworkAmbient.src = coverSrc;
            deckArtworkAmbient.style.opacity = hasCustomCover ? '0.35' : '0';
        }
        if (vinylArt) {
            vinylArt.onerror = () => { vinylArt.onerror = null; vinylArt.src = 'resources/images/default.svg'; };
            vinylArt.src = coverSrc;
        }
        if (coverArtPreview) {
            coverArtPreview.onerror = () => { coverArtPreview.onerror = null; coverArtPreview.src = 'resources/images/default.svg'; };
            coverArtPreview.src = coverSrc;
        }
        updateAmbientLighting(coverSrc);
        window.appendDebugTelemetry?.(`[STANDALONE LOAD] "${track.title || track.filename}" (${track.format || 'AUDIO'}, ${track.sampleRate || 44100}Hz)`);

        try { window.currentInspectedTrack = track; } catch (_) {}
        if (statTitle) statTitle.textContent = track.title ? track.title : (track.filename || 'Standalone Audio');
        if (statArtist) statArtist.textContent = track.artist ? track.artist : 'External File';
        if (statAlbum) statAlbum.textContent = track.album ? track.album : 'Standalone File';
        if (statGenre) statGenre.textContent = (typeof normalizeGenre === 'function' ? normalizeGenre(track.genre) : track.genre) || 'N/A';
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
            statPath.textContent = track.filename ? track.filename : 'Standalone File';
            statPath.title = track.fullPath || track.filename || 'Standalone File';
        }

        const activeEls = document.querySelectorAll('.trackItem.active');
        activeEls.forEach(el => el.classList.remove('active'));

        if (totalDurationEl) totalDurationEl.textContent = formatTime(track.duration);
        if (miniTotalDuration) miniTotalDuration.textContent = formatTime(track.duration);
        updateMiniPlayerInfo(track);
        updateSignalPathUi(track);
        if (typeof updateLyricsDisplay === 'function') {
            updateLyricsDisplay(track);
        }

        if ('mediaSession' in navigator && window.MediaMetadata) {
            try {
                const resolvedCover = track.cover
                    ? new URL(track.cover, window.location.href).href
                    : new URL('resources/images/default.svg', window.location.href).href;
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.title || track.filename || 'Standalone Audio',
                    artist: track.artist || 'External File',
                    album: track.album || 'CachyMusic Workstation',
                    artwork: [
                        { src: resolvedCover, sizes: '512x512', type: track.cover ? 'image/png' : 'image/svg+xml' }
                    ]
                });
            } catch (_) {}
        }

        if (isKnownSoftware) {
            if (autoPlay) {
                playWithSoftwareDecoder(track, 0);
            } else {
                isSoftwarePaused = true;
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
    window.loadStandaloneTrack = loadStandaloneTrack;

    // =========================================================================
    // Lyrics Displayer & Turntable Toggle Logic
    // =========================================================================


    // Centralized Play/Pause UI Synchronizer
    let lastSyncedPlayingState = null;
    function syncPlayPauseUI(playing, force = false) {
        playing = !!playing;
        if (!force && lastSyncedPlayingState === playing) return;
        lastSyncedPlayingState = playing;
        isPlaying = playing;

        // Sync native MediaSession playbackState (stops OS & Chromium from falsely unpausing)
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
                if ('setPositionState' in navigator.mediaSession) {
                    const dur = isSoftwareDecoding ? (activeDecodedBuffer ? activeDecodedBuffer.duration : 0) : audio.duration;
                    const pos = isSoftwareDecoding ? (softwarePlaybackOffset + (audioContext ? (audioContext.currentTime - softwarePlaybackStartTime) : 0)) : (audio.currentTime || 0);
                    if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
                        navigator.mediaSession.setPositionState({
                            duration: Math.max(0, dur),
                            playbackRate: 1.0,
                            position: Math.max(0, Math.min(dur, pos || 0))
                        });
                    }
                }
            } catch (_) {}
        }

        // Center Player Deck Controls — icon toggled via CSS .playing class (instant, no image load)
        if (playPauseBtn) {
            playPauseBtn.setAttribute('title', playing ? 'Pause (Space)' : 'Play (Space)');
            playPauseBtn.classList.toggle('playing', playing);
        }

        // Vinyl Turntable, Tonearm, Background Disc Animation
        const isThematicActive = (activeVisualizerMode === 'thematic' || activeVisualizerMode === 'badapple');
        if (vinylTurntable) {
            vinylTurntable.classList.toggle('thematicFidelity', isThematicActive);
            vinylTurntable.classList.toggle('spinning', playing);
        }
        if (toneArm) toneArm.classList.toggle('active', playing);
        if (bgDisc) bgDisc.classList.toggle('fast', playing && isThematicActive);

        // Persistent Mini-Player Sync
        updateMiniPlayerPlayState(playing);

        // Synchronize Global Playback State Class on Body for Reactive CSS Hardware Animations
        document.body.classList.toggle('is-playing', playing);

        // Synchronize Header Studio Status Indicator
        const studioStatusEl = document.getElementById('studioUserStatus');
        if (studioStatusEl) {
            const textEl = studioStatusEl.querySelector('.statusText');
            if (textEl) {
                textEl.textContent = playing ? 'PLAYING' : 'READY';
            }
        }

        if (playing && typeof resumeVisualizerLoop === 'function') {
            resumeVisualizerLoop();
        }
    }

    // Render Repeat Button UI (with bold centered "1" for Repeat Current Track)
    function updateRepeatUI() {
        if (!repeatBtn) return;
        safeStorage.setItem('cachymusic_repeat_mode', repeatMode);

        if (repeatMode === 'one') {
            repeatBtn.classList.add('active', 'repeat-one');
            repeatBtn.setAttribute('title', 'Repeat Current Track (1) Active — Click to Turn Off');
            repeatBtn.style.opacity = '1';
            repeatBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                    <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="7.5" font-weight="900" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" fill="currentColor">1</text>
                </svg>
            `;
        } else if (repeatMode === 'all') {
            repeatBtn.classList.add('active');
            repeatBtn.classList.remove('repeat-one');
            repeatBtn.setAttribute('title', 'Repeat All Tracks Active — Click for Repeat One');
            repeatBtn.style.opacity = '1';
            repeatBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                </svg>
            `;
        } else { // 'off'
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

    let isPlayPending = false;
    let playPendingTimeout = null;
    // Explicit pause lock: when user pauses or starts app, locks out background unpausing
    let userExplicitlyPaused = true;
    let trackPlaybackRetryCount = 0;
    let consecutiveSkipCount = 0;
    window.audioPlaybackDebugLogs = [];

    let debugModeActive = false;
    try {
        debugModeActive = safeStorage.getItem('cachymusic_debug_mode') === 'true';
    } catch (_) {}


    // Play Audio (guarded against concurrent async race conditions and AbortError)
    async function playAudio(userInitiated = false) {
        if (isSoftwareDecoding) {
            userExplicitlyPaused = false;
            syncPlayPauseUI(true);
            resumeSoftwarePlayback();
            return;
        }

        const currentTrack = (isStandalonePlayback && standaloneTrackList.length > 0)
            ? standaloneTrackList[standaloneTrackIndex]
            : allTracks[currentTrackIndex];
        const currentSrc = currentTrack ? (currentTrack.src || '') : '';
        const cleanSrc = currentSrc.startsWith('../') ? currentSrc.substring(3) : currentSrc;
        const isKnownSoftware = currentTrack && (alwaysSoftwareDecodeUrls.has(cleanSrc) || (currentTrack.src && alwaysSoftwareDecodeUrls.has(currentTrack.src)));

        if (isKnownSoftware && !isSoftwareDecoding) {
            userExplicitlyPaused = false;
            syncPlayPauseUI(true);
            playWithSoftwareDecoder(currentTrack, 0);
            return;
        }

        if (!audio.src || audio.src === window.location.href) {
            // No track loaded — snap UI back to paused state and do nothing
            syncPlayPauseUI(false);
            return;
        }
        if (isPlayPending) {
            console.log('playAudio already pending, skipping concurrent call.');
            return;
        }

        const reqId = ++currentPlayRequestId;

        // User explicitly unpaused
        userExplicitlyPaused = false;

        // Lock immediately — before any await — so rapid clicks can't bypass the guard
        isPlayPending = true;
        if (playPendingTimeout) clearTimeout(playPendingTimeout);
        playPendingTimeout = setTimeout(() => {
            if (isPlayPending && reqId === currentPlayRequestId) {
                console.warn('isPlayPending safety timeout triggered, unlocking.');
                isPlayPending = false;
            }
        }, 4000);

        // Optimistically update UI so the user immediately sees the pause icon
        syncPlayPauseUI(true);

        try {
            const track = allTracks[currentTrackIndex];
            const targetRate = (track && track.sampleRate) ? getValidSampleRate(track.sampleRate) : 44100;
            if (!audioContext || audioContext.state === 'closed') {
                await ensureAudioEngineForSampleRate(targetRate);
            } else if (!audioSourceNode) {
                getOrCreateAudioSourceNode();
                updateAudioRouting();
            }
            if (reqId !== currentPlayRequestId) return;
            if (audioContext && audioContext.state !== 'running') {
                try {
                    await Promise.race([
                        audioContext.resume(),
                        new Promise(resolve => setTimeout(resolve, 300))
                    ]);
                } catch (_) {}
            }
            if (reqId !== currentPlayRequestId) return;
            if (audio.muted) {
                audio.muted = false;
            }
            if (audio.volume === 0 && currentVolumeValue > 0) {
                audio.volume = isHardwareGain ? 1.0 : Math.min(1.0, currentVolumeValue);
            }

            // If audio has an error state (e.g. from a past network timeout or worker stall), reload it
            // Only perform reload if it was NOT just loaded as a fresh track in loadTrack()
            if (audio.error && !audio._isFreshTrackLoad) {
                console.warn('Audio element has error state; recovering before play:', audio.error);
                const isDecodeErr = (audio.error.code === 3);
                const resumeTime = isDecodeErr ? 0 : (audio.currentTime || 0);
                const currentSrc = audio.src;
                audio.src = currentSrc;
                audio.load();
                if (resumeTime > 0) {
                    try { audio.currentTime = resumeTime; } catch (_) {}
                }
            }
            audio._isFreshTrackLoad = false;

            await audio.play();
            if (reqId !== currentPlayRequestId) return;
            // Reflect actual audio state — user may have paused during the async gap
            syncPlayPauseUI(!audio.paused);
        } catch (err) {
            if (reqId !== currentPlayRequestId) return;
            // Ignore AbortError if interrupted by a rapid pause click or track skip
            if (err.name !== 'AbortError') {
                console.warn('Audio playback error:', err);
            }
            if (audio.paused) {
                syncPlayPauseUI(false);
            }
        } finally {
            if (reqId === currentPlayRequestId) {
                if (playPendingTimeout) {
                    clearTimeout(playPendingTimeout);
                    playPendingTimeout = null;
                }
                isPlayPending = false;
            }
        }
    }

    // Pause Audio
    function pauseAudio() {
        userExplicitlyPaused = true;
        if (isSoftwareDecoding) {
            pauseSoftwarePlayback();
            syncPlayPauseUI(false);
            return;
        }
        try {
            audio.pause();
        } catch (err) {
            console.warn('Audio pause error:', err);
        }
        syncPlayPauseUI(false);
    }

    // Toggle Play/Pause (uses native audio.paused as ground truth)
    function togglePlayPause() {
        if (isSoftwareDecoding) {
            if (!isSoftwarePaused) {
                userExplicitlyPaused = true;
                pauseAudio();
            } else {
                userExplicitlyPaused = false;
                playAudio(true);
            }
            return;
        }
        // Nothing loaded yet — if library has tracks, start playback on current/first track
        if (!audio.src || audio.src === window.location.href) {
            if (allTracks && allTracks.length > 0) {
                const targetIdx = (currentTrackIndex >= 0 && allTracks[currentTrackIndex]) ? currentTrackIndex : 0;
                loadTrack(targetIdx, true);
                return;
            }
            syncPlayPauseUI(false);
            return;
        }
        // Always allow pause even if a play is still pending (e.g. buffering)
        if (!audio.paused) {
            userExplicitlyPaused = true;
            pauseAudio();
        } else if (!isPlayPending) {
            userExplicitlyPaused = false;
            playAudio(true);
        }
    }

    // =========================================================================
    // True Gapless Playback Engine (Dual-Buffer Pre-caching & 0ms Handoff)
    // =========================================================================
    function peekNextTrackIndex() {
        if (playQueue && playQueue.length > 0) {
            const queued = playQueue[0];
            const qIdx = allTracks.findIndex(t => (queued.id && t.id === queued.id) || (queued.tid && t.tid === queued.tid) || t.filename === queued.filename);
            if (qIdx !== -1) return qIdx;
        }

        const pool = displayedTracks.length > 0 ? displayedTracks : allTracks;
        if (pool.length === 0) return -1;

        let currentIdxInPool = pool.findIndex(t => {
            const cur = allTracks[currentTrackIndex];
            if (!cur) return false;
            if (cur.id && t.id) return t.id === cur.id;
            if (cur.tid && t.tid) return t.tid === cur.tid;
            return t.filename === cur.filename;
        });

        if (currentIdxInPool === -1) return -1;
        if (isShuffle && pool.length > 1) return -1;

        let nextIdx = currentIdxInPool + 1;
        if (nextIdx >= pool.length) {
            if (repeatMode === 'off') return -1;
            nextIdx = 0;
        }

        const target = pool[nextIdx];
        return allTracks.findIndex(t => target && ((t.id && t.id === target.id) || (t.tid && t.tid === target.tid) || t.filename === target.filename));
    }

    function checkAndPreloadNextTrack(currentTime, duration) {
        if (window.AndroidBridge || /Android/i.test(navigator.userAgent) || window.innerWidth <= 768) {
            return;
        }
        if (!duration || isNaN(duration) || duration < 8) return;
        if (duration - currentTime <= 5.0) {
            const nextMasterIdx = peekNextTrackIndex();
            if (nextMasterIdx !== -1 && nextMasterIdx !== preloadedNextTrackIndex && allTracks[nextMasterIdx]) {
                preloadedNextTrackIndex = nextMasterIdx;
                const nextTrack = allTracks[nextMasterIdx];
                let nextSrc = nextTrack.src || '';
                if (nextSrc.startsWith('../')) nextSrc = nextSrc.substring(3);

                if (!secondaryAudio) {
                    secondaryAudio = document.createElement('audio');
                    secondaryAudio.preload = 'auto';
                    secondaryAudio.crossOrigin = 'anonymous';
                }
                secondaryAudio.src = nextSrc;
                try {
                    secondaryAudio.load();
                } catch (_) {}
            }
        }
    }

    function executeGaplessHandoff(nextIndex) {
        // In Android WebView / mobile APK, bypass secondary audio swapping to ensure the canonical DOM-attached audio element is always used
        if (window.AndroidBridge || /Android/i.test(navigator.userAgent) || window.innerWidth <= 768) {
            return false;
        }
        if (!secondaryAudio || preloadedNextTrackIndex !== nextIndex || secondaryAudio.readyState < 2) {
            return false;
        }
        try {
            const oldAudio = audio;
            secondaryAudio.volume = oldAudio.volume;
            secondaryAudio.muted = oldAudio.muted;
            try {
                secondaryAudio.playbackRate = currentPlaybackSpeed || oldAudio.playbackRate || 1.0;
                secondaryAudio.preservesPitch = isPitchLockTempo;
                secondaryAudio.mozPreservesPitch = isPitchLockTempo;
                secondaryAudio.webkitPreservesPitch = isPitchLockTempo;
            } catch (_) {}

            // Swap active audio reference BEFORE pausing/clearing oldAudio so oldAudio events are ignored
            audio = secondaryAudio;
            secondaryAudio = oldAudio;
            currentTrackIndex = nextIndex;
            preloadedNextTrackIndex = -1;
            trackPlaybackRetryCount = 0;

            oldAudio.pause();
            oldAudio.removeAttribute('src');

            if (audioSourceNode) {
                try { audioSourceNode.disconnect(); } catch (_) {}
                audioSourceNode = null;
            }

            attachAudioListeners(audio);
            getOrCreateAudioSourceNode();
            updateAudioRouting();

            // ReplayGain leveling for the new track
            const nextTrack = allTracks[currentTrackIndex];
            if (nextTrack && replayGainNode && audioContext) {
                let targetGain = 1.0;
                if (isReplayGain && typeof nextTrack.replayGain === 'number' && !isNaN(nextTrack.replayGain)) {
                    targetGain = Math.pow(10, nextTrack.replayGain / 20);
                    if (typeof nextTrack.replayPeak === 'number' && nextTrack.replayPeak > 0 && (targetGain * nextTrack.replayPeak) > 0.965) {
                        targetGain = 0.965 / nextTrack.replayPeak; // -0.31 dBFS true-peak safety ceiling
                    }
                }
                try {
                    replayGainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.04);
                } catch (_) {}
            }

            userExplicitlyPaused = false;
            audio.play().then(() => {
                syncPlayPauseUI(true);
                if (typeof resumeVisualizerLoop === 'function') resumeVisualizerLoop();
            }).catch(console.warn);

            if (nextTrack) {
                if (trackName) updateMarqueeText(trackName, nextTrack.title ? nextTrack.title : (nextTrack.filename || 'Unknown'));
                if (artistName) updateMarqueeText(artistName, nextTrack.artist ? nextTrack.artist : 'Unknown');
                if (albumName) updateMarqueeText(albumName, nextTrack.album ? `Album: ${nextTrack.album}${nextTrack.year ? ' (' + nextTrack.year + ')' : ''}` : 'Album: Unknown');
                updateTrackBadgeUi(nextTrack);
                const coverSrc = nextTrack.cover || 'resources/images/default.svg';
                if (deckArtworkBackdrop) deckArtworkBackdrop.src = coverSrc;
                if (deckArtworkAmbient) deckArtworkAmbient.src = coverSrc;
                if (vinylArt) vinylArt.src = coverSrc;
                if (coverArtPreview) coverArtPreview.src = coverSrc;
                updateAmbientLighting(coverSrc);
                if (statTitle) statTitle.textContent = nextTrack.title || 'Unknown';
                if (statArtist) statArtist.textContent = nextTrack.artist || 'Unknown';
                if (statAlbum) statAlbum.textContent = nextTrack.album || 'Unknown';
                if (statGenre) statGenre.textContent = (typeof normalizeGenre === 'function' ? normalizeGenre(nextTrack.genre) : nextTrack.genre) || 'N/A';
                if (statYear) statYear.textContent = nextTrack.year ? nextTrack.year.toString() : 'N/A';
                if (statTrack) statTrack.textContent = nextTrack.track ? nextTrack.track.toString() : 'N/A';
                if (statBitrate) statBitrate.textContent = nextTrack.bitrate ? `${nextTrack.bitrate} kbps` : 'N/A';
                if (statSampleRate) statSampleRate.textContent = nextTrack.sampleRate ? `${nextTrack.sampleRate} Hz` : 'N/A';
                if (statFormat) statFormat.textContent = nextTrack.format ? nextTrack.format.toUpperCase() : 'N/A';
                if (statSize) statSize.textContent = nextTrack.size || 'N/A';
                if (statPath) {
                    statPath.textContent = nextTrack.filename || 'N/A';
                    statPath.title = nextTrack.fullPath || nextTrack.filename || 'N/A';
                }
                updateDacStatusUi();
                updateSignalPathUi(nextTrack);
                updateLyricsDisplay(nextTrack);
                updateMiniPlayerInfo(nextTrack);
                renderVirtualTrackWindow(true);
            }
            return true;
        } catch (e) {
            console.warn('Gapless handoff fallback:', e);
            return false;
        }
    }

    // Next Track (Sample-Accurate Gapless Aware)
    function nextTrack() {
        if (isStandalonePlayback && standaloneTrackList && standaloneTrackList.length > 0) {
            if (repeatMode === 'one') {
                audio.currentTime = 0;
                playAudio();
                return;
            }
            if (standaloneTrackList.length > 1) {
                if (standaloneTrackIndex + 1 < standaloneTrackList.length || repeatMode === 'all') {
                    standaloneTrackIndex = (standaloneTrackIndex + 1) % standaloneTrackList.length;
                    loadStandaloneTrack(standaloneTrackIndex, true);
                } else {
                    pauseAudio();
                    audio.currentTime = 0;
                }
            } else {
                if (repeatMode === 'all') {
                    audio.currentTime = 0;
                    playAudio();
                } else {
                    pauseAudio();
                    audio.currentTime = 0;
                }
            }
            return;
        }

        if (playQueue && playQueue.length > 0) {
            const nextQueuedTrack = playQueue.shift();
            updateQueueUi();
            const masterIdx = allTracks.findIndex(t =>
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

        const pool = displayedTracks.length > 0 ? displayedTracks : allTracks;
        if (pool.length === 0) return;

        let currentIdxInPool = pool.findIndex(t => {
            const cur = allTracks[currentTrackIndex];
            if (!cur) return false;
            if (cur.id && t.id) return t.id === cur.id;
            if (cur.tid && t.tid) return t.tid === cur.tid;
            return t.filename === cur.filename;
        });

        if (isShuffle && pool.length > 1) {
            let nextIdx = Math.floor(Math.random() * pool.length);
            let attempts = 0;
            while (nextIdx === currentIdxInPool && attempts < 10) {
                nextIdx = Math.floor(Math.random() * pool.length);
                attempts++;
            }
            const masterIdx = allTracks.findIndex(t => pool[nextIdx] && ((t.id && t.id === pool[nextIdx].id) || (t.tid && t.tid === pool[nextIdx].tid) || t.filename === pool[nextIdx].filename));
            if (masterIdx !== -1) {
                if (!executeGaplessHandoff(masterIdx)) {
                    loadTrack(masterIdx, true);
                }
            }
        } else {
            let nextIdx = currentIdxInPool + 1;
            if (nextIdx >= pool.length) {
                if (repeatMode === 'off') {
                    pauseAudio();
                    audio.currentTime = 0;
                    progressBar.style.width = '0%';
                    currentTimeEl.textContent = '0:00';
                    return;
                }
                nextIdx = 0;
            }
            const masterIdx = allTracks.findIndex(t => pool[nextIdx] && ((t.id && t.id === pool[nextIdx].id) || (t.tid && t.tid === pool[nextIdx].tid) || t.filename === pool[nextIdx].filename));
            if (masterIdx !== -1) {
                if (!executeGaplessHandoff(masterIdx)) {
                    loadTrack(masterIdx, true);
                }
            }
        }
    }

    // Previous Track
    function prevTrack() {
        if (isStandalonePlayback && standaloneTrackList && standaloneTrackList.length > 0) {
            if (audio.currentTime > 3) {
                audio.currentTime = 0;
            } else if (standaloneTrackList.length > 1) {
                standaloneTrackIndex = (standaloneTrackIndex - 1 + standaloneTrackList.length) % standaloneTrackList.length;
                loadStandaloneTrack(standaloneTrackIndex, true);
            } else {
                audio.currentTime = 0;
            }
            return;
        }

        if (audio.currentTime > 3) {
            audio.currentTime = 0;
            return;
        }

        const pool = displayedTracks.length > 0 ? displayedTracks : allTracks;
        if (pool.length === 0) return;

        let currentIdxInPool = pool.findIndex(t => {
            const cur = allTracks[currentTrackIndex];
            if (!cur) return false;
            if (cur.id && t.id) return t.id === cur.id;
            if (cur.tid && t.tid) return t.tid === cur.tid;
            return t.filename === cur.filename;
        });
        let prevIdx = currentIdxInPool - 1;
        if (prevIdx < 0) {
            prevIdx = pool.length - 1;
        }
        const masterIdx = allTracks.findIndex(t => pool[prevIdx] && ((t.id && t.id === pool[prevIdx].id) || (t.tid && t.tid === pool[prevIdx].tid) || t.filename === pool[prevIdx].filename));
        if (masterIdx !== -1) loadTrack(masterIdx, true);
    }

    // =========================================================================

    // Universal Web Audio Software Decoder Engine (Zero-Skip Hybrid Pipeline)
    // =========================================================================
    function updatePlaybackProgress(cur, dur) {
        if (isDraggingScrubber) return;
        const currentTrack = (isStandalonePlayback && standaloneTrackList.length > 0)
            ? standaloneTrackList[standaloneTrackIndex]
            : allTracks[currentTrackIndex];
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

        if (cur > 1.0 && consecutiveSkipCount > 0) {
            consecutiveSkipCount = 0;
        }

        if (isLyricsView) {
            updateActiveLyric(cur);
        }
    }

    function startSoftwareProgressLoop() {
        cancelSoftwareProgressLoop();
        function tick() {
            if (!isSoftwareDecoding || isSoftwarePaused || !activeDecodedBuffer) return;
            const cur = softwarePlaybackOffset + (audioContext ? (audioContext.currentTime - softwarePlaybackStartTime) : 0);
            const dur = activeDecodedBuffer.duration;
            updatePlaybackProgress(cur, dur);
            if (cur >= dur) {
                onSoftwarePlaybackEnded();
                return;
            }
            softwarePlaybackRaf = requestAnimationFrame(tick);
        }
        softwarePlaybackRaf = requestAnimationFrame(tick);
    }

    function cancelSoftwareProgressLoop() {
        if (softwarePlaybackRaf) {
            cancelAnimationFrame(softwarePlaybackRaf);
            softwarePlaybackRaf = null;
        }
    }

    function startSoftwareBufferPlayback() {
        if (!audioContext || !activeDecodedBuffer) return;
        if (softwareSourceNode) {
            try {
                softwareSourceNode.onended = null;
                softwareSourceNode.stop();
                softwareSourceNode.disconnect();
            } catch (_) {}
            softwareSourceNode = null;
        }

        softwareSourceNode = audioContext.createBufferSource();
        softwareSourceNode.buffer = activeDecodedBuffer;

        if (!softwareSourceGainNode) {
            softwareSourceGainNode = audioContext.createGain();
        }
        softwareSourceNode.connect(softwareSourceGainNode);
        updateAudioRouting();

        softwarePlaybackStartTime = audioContext.currentTime;
        softwareSourceNode.start(0, softwarePlaybackOffset);
        isSoftwarePaused = false;
        syncPlayPauseUI(true);
        startSoftwareProgressLoop();

        softwareSourceNode.onended = () => {
            if (!isSoftwareDecoding || isSoftwarePaused) return;
            const cur = softwarePlaybackOffset + (audioContext ? (audioContext.currentTime - softwarePlaybackStartTime) : 0);
            if (cur >= (activeDecodedBuffer.duration - 0.5)) {
                onSoftwarePlaybackEnded();
            }
        };
    }

    function pauseSoftwarePlayback() {
        if (!isSoftwareDecoding || isSoftwarePaused) return;
        cancelSoftwareProgressLoop();
        if (audioContext && softwarePlaybackStartTime > 0) {
            softwarePlaybackOffset += (audioContext.currentTime - softwarePlaybackStartTime);
        }
        if (softwareSourceNode) {
            try {
                softwareSourceNode.onended = null;
                softwareSourceNode.stop();
                softwareSourceNode.disconnect();
            } catch (_) {}
            softwareSourceNode = null;
        }
        isSoftwarePaused = true;
        syncPlayPauseUI(false);
    }

    function resumeSoftwarePlayback() {
        if (!isSoftwareDecoding || !activeDecodedBuffer) return;
        if (audioContext && audioContext.state !== 'running') {
            try { audioContext.resume(); } catch (_) {}
        }
        startSoftwareBufferPlayback();
    }

    function seekSoftwarePlayback(targetSec) {
        if (!isSoftwareDecoding || !activeDecodedBuffer) return;
        const dur = activeDecodedBuffer.duration;
        softwarePlaybackOffset = Math.max(0, Math.min(dur, targetSec));
        if (!isSoftwarePaused) {
            startSoftwareBufferPlayback();
        } else {
            updatePlaybackProgress(softwarePlaybackOffset, dur);
        }
    }

    function stopSoftwarePlayback() {
        cancelSoftwareProgressLoop();
        if (softwareSourceNode) {
            try {
                softwareSourceNode.onended = null;
                softwareSourceNode.stop();
                softwareSourceNode.disconnect();
            } catch (_) {}
            softwareSourceNode = null;
        }
        isSoftwareDecoding = false;
        isSoftwarePaused = false;
        softwarePlaybackStartTime = 0;
        softwarePlaybackOffset = 0;
    }

    function onSoftwarePlaybackEnded() {
        stopSoftwarePlayback();
        try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {}
        if (repeatMode === 'one') {
            loadTrack(currentTrackIndex, true, 0);
        } else {
            nextTrack();
        }
    }

    async function playWithSoftwareDecoder(track, startTime = 0) {
        if (!track) return;
        isSoftwareDecoding = true;
        isSoftwarePaused = false;
        userExplicitlyPaused = false;
        syncPlayPauseUI(true);

        try {
            if (audio) {
                try {
                    audio.pause();
                    audio.removeAttribute('src');
                    audio.load();
                } catch (_) {}
            }

            const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
            await ensureAudioEngineForSampleRate(targetRate);
            if (audioContext && audioContext.state !== 'running') {
                try { await audioContext.resume(); } catch (_) {}
            }

            let src = track.src || '';
            if (src.startsWith('../')) src = src.substring(3);

            logAudioPlaybackEvent('info', `Fetching stream bitstream for 32-bit software decode: "${track.title || track.filename}"`);
            if (typeof showCachyToast === 'function') {
                showCachyToast('Software Audio Engine', `Decoding 24-bit/audiophile stream: "${track.title || track.filename}"`, 'info');
            }

            const res = await fetch(src);
            if (!res.ok) throw new Error(`HTTP ${res.status} fetch failure`);
            const arrayBuf = await res.arrayBuffer();

            logAudioPlaybackEvent('info', `Decompressing bitstream into 32-bit floating point audio buffer (${(arrayBuf.byteLength / (1024 * 1024)).toFixed(2)} MB)...`);
            const decodedBuffer = await new Promise((resolve, reject) => {
                const p = audioContext.decodeAudioData(
                    arrayBuf,
                    buf => resolve(buf),
                    err => reject(err || new Error('decodeAudioData callback returned error'))
                );
                if (p && typeof p.then === 'function') {
                    p.then(resolve, reject);
                }
            });
            activeDecodedBuffer = decodedBuffer;

            track.duration = decodedBuffer.duration;
            if (totalDurationEl) totalDurationEl.textContent = formatTime(decodedBuffer.duration);
            if (miniTotalDuration) miniTotalDuration.textContent = formatTime(decodedBuffer.duration);

            softwarePlaybackOffset = Math.max(0, Math.min(decodedBuffer.duration, startTime));
            startSoftwareBufferPlayback();
            consecutiveSkipCount = 0;
            logAudioPlaybackEvent('info', `Web Audio Software Engine playing "${track.title || track.filename}" at ${decodedBuffer.sampleRate}Hz, ${decodedBuffer.numberOfChannels}ch, ${decodedBuffer.duration.toFixed(1)}s.`);
        } catch (err) {
            console.error('[AudioEngine] Software decoder fallback failed:', err);
            logAudioPlaybackEvent('error', `Web Audio software decode failure: ${err.message}`);
            isSoftwareDecoding = false;
            if (typeof showCachyToast === 'function') {
                showCachyToast('Playback Error', `File corrupted or unreadable. Skipping track...`, 'error');
            }
            setTimeout(() => nextTrack(), 1000);
        }
    }

    function attachAudioListeners(targetAudio) {
        if (!targetAudio || targetAudio._hasCachyListeners) return;
        targetAudio._hasCachyListeners = true;
        let isAudioBuffering = false;

        targetAudio.addEventListener('play', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            // Background Tab Protection:
            // If user explicitly paused CachyMusic and the tab is hidden in the background,
            // immediately halt any rogue/accidental unpause triggered by external media keys,
            // OS MPRIS signals, or YouTube media session transitions.
            if (userExplicitlyPaused && document.hidden) {
                targetAudio.pause();
                syncPlayPauseUI(false);
                return;
            }
            isAudioBuffering = false;
            syncPlayPauseUI(true);
        });
        targetAudio.addEventListener('playing', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            if (userExplicitlyPaused && document.hidden) {
                targetAudio.pause();
                syncPlayPauseUI(false);
                return;
            }
            isAudioBuffering = false;
            syncPlayPauseUI(true);
        });
        targetAudio.addEventListener('pause', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            // If pause was fired by the browser decoder while buffering and user did not request pause,
            // preserve user's playback state and avoid erratic UI flapping
            if (isAudioBuffering && !userExplicitlyPaused) {
                return;
            }
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
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            syncPlayPauseUI(false);
        });
        targetAudio.addEventListener('waiting', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            // Native audio decoder is buffering stream chunk
            if (!userExplicitlyPaused) {
                isAudioBuffering = true;
            }
        });
        targetAudio.addEventListener('stalled', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            console.warn('Audio stream buffer stalled, awaiting more chunk data');
            if (!userExplicitlyPaused) {
                isAudioBuffering = true;
            }
        });
        targetAudio.addEventListener('error', () => {
            // Discard errors from disposed audio elements, intentional src clears, or while software decoding is active
            if (targetAudio._isDisposed || targetAudio !== audio || isSoftwareDecoding) return;
            if (!targetAudio.src || targetAudio.src === window.location.href || !targetAudio.getAttribute('src')) {
                return;
            }
            const err = targetAudio.error;
            if (!err) return;
            console.error('Audio element error:', err);
            isAudioBuffering = false;
            syncPlayPauseUI(false);
            isPlayPending = false;

            if (playPendingTimeout) {
                clearTimeout(playPendingTimeout);
                playPendingTimeout = null;
            }

            const currentTrack = (isStandalonePlayback && standaloneTrackList.length > 0)
            ? standaloneTrackList[standaloneTrackIndex]
            : allTracks[currentTrackIndex];
            const trackTitle = currentTrack ? (currentTrack.title || currentTrack.filename || 'Current track') : 'Audio track';
            const errorCode = err ? err.code : 0;

            // Fatal error codes:
            // 3 = MEDIA_ERR_DECODE (corrupted audio frame or decoding bitstream failure)
            // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED (unsupported codec, 404, or unreadable source)
            const isFatalDecodeError = (errorCode === 3 || errorCode === 4);

            // If native browser decoder fails (code 3 or 4) on a local stream, attempt 1 automatic FFmpeg transcode fallback
            const currentAttrSrc = targetAudio.getAttribute('src') || targetAudio.src || '';
            if (isFatalDecodeError && trackPlaybackRetryCount === 0 && currentAttrSrc.includes('php/api/stream.php') && !currentAttrSrc.includes('transcode=1')) {
                trackPlaybackRetryCount++;
                const transcodeSrc = currentAttrSrc + (currentAttrSrc.includes('?') ? '&' : '?') + 'transcode=1';
                console.info(`[AudioEngine] Native decode error (${errorCode}) on "${trackTitle}"; attempting FFmpeg transcode fallback...`);
                userExplicitlyPaused = false;
                targetAudio.src = transcodeSrc;
                try { targetAudio.load(); } catch (_) {}
                playAudio();
                return;
            }

            // Universal Web Audio Software Decoder Fallback (for 24-bit FLAC, ALAC, AIFF & unsupported Android/browser codecs)
            if (isFatalDecodeError && currentTrack && !isSoftwareDecoding) {
                alwaysSoftwareDecodeUrls.add(currentAttrSrc);
                alwaysSoftwareDecodeUrls.add(targetAudio.src);
                try {
                    targetAudio.pause();
                    targetAudio.removeAttribute('src');
                    targetAudio.load();
                } catch (_) {}
                console.info(`[AudioEngine] HTML5 <audio> decode failure (${errorCode}) on "${trackTitle}". Switching to Web Audio Software Decoder...`);
                logAudioPlaybackEvent('info', `Native decoder unsuited for "${trackTitle}" (code ${errorCode}). Playing via 32-bit Web Audio Software Engine.`);
                playWithSoftwareDecoder(currentTrack, targetAudio.currentTime || 0);
                return;
            }

            if (isFatalDecodeError || trackPlaybackRetryCount >= 1) {
                userExplicitlyPaused = true;
                consecutiveSkipCount++;
                const errorDesc = errorCode === 3
                    ? 'Corrupted audio stream or decoder failure'
                    : (errorCode === 4 ? 'Format or file source not supported' : 'Playback stream timed out');

                logAudioPlaybackEvent('error', `Track "${trackTitle}" decode failure (code ${errorCode}): ${errorDesc}`, {
                    src: targetAudio.src,
                    track: currentTrack
                });
                console.warn(`[AudioEngine] Permanent playback error on "${trackTitle}": ${errorDesc}. Halting retry loop.`);

                if (consecutiveSkipCount >= 3) {
                    pauseAudio();
                    logAudioPlaybackEvent('warn', 'Consecutive skip limit reached (3 tracks failed). Halting auto-skip.');
                    if (typeof showCachyToast === 'function') {
                        showCachyToast('Playback Halted', 'Multiple tracks failed to decode. Check Audio Diagnostics in Settings.', 'error');
                    }
                    return;
                }

                if (typeof showCachyToast === 'function') {
                    showCachyToast('Playback Error', `"${trackTitle}": ${errorDesc}. Skipping track...`, 'warning');
                }

                // Reset dirty media element so subsequent tracks start with a completely fresh decoder pipeline
                resetMediaElementForNewAudioContext();

                // If in playlist or more tracks available, gracefully skip to next track without rapid flapping
                setTimeout(() => {
                    const pool = displayedTracks.length > 0 ? displayedTracks : allTracks;
                    let currentIdxInPool = pool.findIndex(t => {
                        const cur = allTracks[currentTrackIndex];
                        if (!cur) return false;
                        if (cur.id && t.id) return t.id === cur.id;
                        if (cur.tid && t.tid) return t.tid === cur.tid;
                        return t.filename === cur.filename;
                    });
                    if (currentIdxInPool === pool.length - 1 && repeatMode === 'off') {
                        // End of playlist and repeat is off: cleanly stop
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

            // For transient network hiccups (code 2), attempt at most 1 automatic retry
            if (errorCode === 2 && targetAudio.src && !userExplicitlyPaused && trackPlaybackRetryCount === 0) {
                trackPlaybackRetryCount++;
                const savedTime = targetAudio.currentTime || 0;
                const currentSrc = targetAudio.src;
                console.log(`[AudioEngine] Transient network error; attempting single recovery for "${trackTitle}" at ${savedTime}s...`);

                setTimeout(() => {
                    if (!userExplicitlyPaused) {
                        targetAudio.src = currentSrc;
                        targetAudio.load();
                        if (savedTime > 0) {
                            try { targetAudio.currentTime = savedTime; } catch (_) {}
                        }
                        targetAudio.play().catch(playErr => {
                            console.warn('[AudioEngine] Recovery retry failed:', playErr);
                            syncPlayPauseUI(false);
                            userExplicitlyPaused = true;
                            if (typeof showCachyToast === 'function') {
                                showCachyToast('Network Error', `Could not recover stream for "${trackTitle}".`, 'error');
                            }
                        });
                    }
                }, 1500);
            }
        });

        let lastPersistedTime = 0;
        targetAudio.addEventListener('timeupdate', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            if (isSoftwareDecoding) return;
            if (isDraggingScrubber) return;
            const cur = targetAudio.currentTime;
            let dur = targetAudio.duration;
            const currentTrack = (isStandalonePlayback && standaloneTrackList.length > 0)
            ? standaloneTrackList[standaloneTrackIndex]
            : allTracks[currentTrackIndex];
            if (!isFinite(dur) || isNaN(dur) || dur <= 0) {
                if (currentTrack && currentTrack.duration && isFinite(currentTrack.duration)) {
                    dur = Number(currentTrack.duration);
                }
            }
            updatePlaybackProgress(cur, dur);

            // Periodically persist playback timeframe (throttled to 1.0s deltas)
            // so closing or refreshing the program remembers the unfinished timeframe
            if (cur > 0 && Math.abs(cur - lastPersistedTime) >= 1.0) {
                lastPersistedTime = cur;
                if (!dur || isNaN(dur) || cur < (dur - 1)) {
                    try {
                        safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2));
                    } catch (_) {}
                }
            }

            // Dual-Buffer Gapless Playback Engine:
            // When current track hits 5 seconds before completion, asynchronously pre-load
            // and decode the header and initial bitstream of the next track into the secondary buffer
            checkAndPreloadNextTrack(cur, dur);
        });

        targetAudio.addEventListener('ended', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            if (typeof targetAudio._trackGeneration === 'number' && targetAudio._trackGeneration !== currentTrackGeneration) {
                console.log('[AudioEngine] Stale ended event discarded for superseded track generation');
                return;
            }
            try {
                safeStorage.removeItem('cachymusic_last_track_time');
            } catch (_) {}

            const curTime = targetAudio.currentTime || 0;
            const currentTrack = (isStandalonePlayback && standaloneTrackList.length > 0)
            ? standaloneTrackList[standaloneTrackIndex]
            : allTracks[currentTrackIndex];
            const trackDur = targetAudio.duration || (currentTrack ? (currentTrack.duration || 0) : 0);
            const trackTitle = currentTrack ? (currentTrack.title || currentTrack.filename || 'Current track') : 'Audio track';

            // Premature Ended Guard:
            // If the track ends within 3.0 seconds (or with >5s remaining on an established track),
            // this is an unexpected stream disconnect/hiccup or buffer underflow, NOT a finished song.
            if ((trackDur > 5 && curTime < 3.0) || curTime === 0) {
                console.warn(`[AudioEngine] Premature stream end detected at ${curTime.toFixed(2)}s / ${trackDur.toFixed(2)}s for "${trackTitle}".`);
                logAudioPlaybackEvent('warn', `Premature stream termination at ${curTime.toFixed(2)}s on "${trackTitle}"`);
                window.appendDebugTelemetry?.(`[WARN] Premature stream end at ${curTime.toFixed(2)}s / ${trackDur.toFixed(2)}s for "${trackTitle}". Attempting reload...`, 'warn');
                if (trackPlaybackRetryCount < 2) {
                    trackPlaybackRetryCount++;
                    setTimeout(() => {
                        if (!userExplicitlyPaused) {
                            try { targetAudio.load(); } catch (_) {}
                            playAudio();
                        }
                    }, 400);
                    return;
                } else {
                    pauseAudio();
                    showToast(`Playback paused on "${trackTitle}". Stream buffer interrupted.`);
                    return;
                }
            } else {
                window.appendDebugTelemetry?.(`[EVENT] Track finished naturally at ${curTime.toFixed(1)}s`);
            }

            if (sleepTimerMode === 'end') {
                pauseAudio();
                cancelSleepTimer(false);
                showToast('🌙 Sleep timer: End of track reached. Playback paused.');
                return;
            }

            if (repeatMode === 'one') {
                targetAudio.currentTime = 0;
                playAudio();
            } else {
                nextTrack();
            }
        });

        targetAudio.addEventListener('loadedmetadata', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            if (targetAudio.duration && !isNaN(targetAudio.duration)) {
                totalDurationEl.textContent = formatTime(targetAudio.duration);
                if (miniTotalDuration) miniTotalDuration.textContent = formatTime(targetAudio.duration);
                if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && isFinite(targetAudio.duration) && targetAudio.duration > 0) {
                    try {
                        navigator.mediaSession.setPositionState({
                            duration: Math.max(0, targetAudio.duration),
                            playbackRate: targetAudio.playbackRate || 1.0,
                            position: Math.max(0, Math.min(targetAudio.duration, targetAudio.currentTime || 0))
                        });
                    } catch (_) {}
                }
            }
            try {
                if (currentPlaybackSpeed !== 1.0) {
                    targetAudio.playbackRate = currentPlaybackSpeed;
                }
                targetAudio.preservesPitch = isPitchLockTempo;
                targetAudio.mozPreservesPitch = isPitchLockTempo;
                targetAudio.webkitPreservesPitch = isPitchLockTempo;
            } catch (_) {}
        });

        targetAudio.addEventListener('seeked', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && targetAudio.duration && isFinite(targetAudio.duration) && targetAudio.duration > 0) {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: Math.max(0, targetAudio.duration),
                        playbackRate: targetAudio.playbackRate || 1.0,
                        position: Math.max(0, Math.min(targetAudio.duration, targetAudio.currentTime || 0))
                    });
                } catch (_) {}
            }
        });
    }


    // --- Migrated Core Track Status & Session Methods ---
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

    function updateSignalPathUi(track = allTracks[currentTrackIndex]) {
        // Always keep player deck button label strictly as "SPA"
        if (signalPathLabel) {
            signalPathLabel.textContent = 'SPA';
        }

        const curTheme = getActiveTheme();
        const isMobileViewport = typeof window !== 'undefined' && window.innerWidth <= 768;
        const isLightSurface = (curTheme === 'minimalist-light' || curTheme === 'brutalist-light' || curTheme === 'minimalist-warm' || (curTheme === 'default' && !isMobileViewport));
        const hasTrack = Boolean(track && allTracks.length > 0);
        const format = hasTrack ? resolveTrackFormat(track) : 'NONE';
        const isLossless = hasTrack && ['FLAC', 'WAV', 'ALAC', 'AIFF', 'APE', 'WV', 'DSD', 'DSF', 'PCM'].includes(format);

        // Determine active DSP & EQ stages honestly
        const hasPeq = !isPeqBypassed && Array.isArray(peqGains) && peqGains.some(g => Math.abs(g) > 0.05);
        const maxBoostDb = (!isPeqBypassed && Array.isArray(peqGains)) ? Math.max(0, ...peqGains) : 0;
        const activeStages = [];
        if (isSubsonic) activeStages.push('20Hz Subsonic');
        if (hasPeq) activeStages.push('10-Band PEQ');
        if (isBassBoost) activeStages.push('Bass');
        if (isVocalBoost) activeStages.push('Vocal');
        if (isTrebleBoost) activeStages.push('Treble');
        if (isAmpBoost || currentVolumeValue > 1.0) activeStages.push('Pre-Amp');
        if (isCrossfeed) activeStages.push('HRTF Crossfeed');
        if (isSurroundWidener) activeStages.push('Surround M/S');
        if (isAmbiophonics) activeStages.push('Ambiophonics');
        if (isPhaseInvert) activeStages.push('180° Phase');
        if (isMonoMix) activeStages.push('Mono Sum');
        if (isAgpEnabled) activeStages.push('AGP Guard');
        if (isLimiter) activeStages.push('Peak Limiter');
        if (isUltrasonic) activeStages.push(`Ultrasonic (${Math.round(ultrasonicCutoff / 1000)}kHz)`);
        if (isReplayGain) activeStages.push('ReplayGain');

        const dspActive = hasActiveDsp();
        const workletPrecisionStr = isPrecision64 ? '64-Bit Double-Float Worklet' : '32-Bit Fast-Float Biquad';
        const shortEngineLabel = isPrecision64 ? '64-BIT WORKLET' : '32-BIT FLOAT';

        // 1. Update Top Summary Badge, Description & Indicator Dot
        if (!hasTrack) {
            if (signalPathBadgeBtn) signalPathBadgeBtn.dataset.signalState = 'idle';
            if (auditQualityBadge) {
                auditQualityBadge.textContent = `IDLE (${shortEngineLabel} READY)`;
                auditQualityBadge.className = 'signalQualityBadge highPrecision';
            }
            if (auditQualityDesc) {
                auditQualityDesc.textContent = `No audio track loaded. Browser Web Audio decodes streams to 32-bit IEEE 754 float; DSP worklet is configured for ${isPrecision64 ? '64-bit double-precision' : '32-bit single-precision'} math.`;
            }
            const dotCol = isLightSurface ? '#475569' : '#94a3b8';
            if (deckSignalDot) deckSignalDot.style.color = dotCol;
            if (auditQualityDot) auditQualityDot.style.color = dotCol;
        } else if (isLossless && !hasPeq && !isBassBoost && !isVocalBoost && !isTrebleBoost && !isCrossfeed && !isSurroundWidener && !isAmbiophonics && !isPhaseInvert && !isMonoMix) {
            if (signalPathBadgeBtn) signalPathBadgeBtn.dataset.signalState = 'bit-perfect';
            if (auditQualityBadge) {
                auditQualityBadge.textContent = `LOSSLESS ${format} → ${shortEngineLabel}`;
                auditQualityBadge.className = 'signalQualityBadge bitPerfect';
            }
            if (auditQualityDesc) {
                auditQualityDesc.textContent = `Lossless ${format} source decoded by Web Audio into 32-bit IEEE 754 float with flat EQ bypass${isUltrasonic || ditherMode !== 'off' ? ` and ${workletPrecisionStr.toLowerCase()} output conditioning` : ''}.`;
            }
            const dotCol = isLightSurface ? '#059669' : '#10b981';
            if (deckSignalDot) deckSignalDot.style.color = dotCol;
            if (auditQualityDot) auditQualityDot.style.color = dotCol;
        } else if (isLossless) {
            if (signalPathBadgeBtn) signalPathBadgeBtn.dataset.signalState = 'dsp';
            if (auditQualityBadge) {
                auditQualityBadge.textContent = `LOSSLESS ${format} → ${isPrecision64 ? '64-BIT' : '32-BIT'} DSP`;
                auditQualityBadge.className = 'signalQualityBadge dspEnhanced';
            }
            if (auditQualityDesc) {
                auditQualityDesc.textContent = `Lossless ${format} source decoded to 32-bit IEEE 754 float and actively shaped through ${workletPrecisionStr} (${activeStages.join(', ') || 'DSP Active'}).`;
            }
            const dotCol = isLightSurface ? '#b45309' : '#fbbf24';
            if (deckSignalDot) deckSignalDot.style.color = dotCol;
            if (auditQualityDot) auditQualityDot.style.color = dotCol;
        } else {
            if (signalPathBadgeBtn) signalPathBadgeBtn.dataset.signalState = 'lossy';
            if (auditQualityBadge) {
                auditQualityBadge.textContent = `${format} LOSSY → ${dspActive ? (isPrecision64 ? '64-BIT DSP' : '32-BIT DSP') : '32-BIT DECODE'}`;
                auditQualityBadge.className = 'signalQualityBadge highPrecision';
            }
            if (auditQualityDesc) {
                auditQualityDesc.textContent = `Compressed ${format} stream decoded by browser into 32-bit IEEE 754 floating-point PCM${activeStages.length > 0 ? `, processed via ${workletPrecisionStr} (${activeStages.join(', ')})` : ' with flat EQ response'}.`;
            }
            const dotCol = isLightSurface ? '#0284c7' : '#38bdf8';
            if (deckSignalDot) deckSignalDot.style.color = dotCol;
            if (auditQualityDot) auditQualityDot.style.color = dotCol;
        }

        // 2. Update Detailed 4-Stage Signal Chain Breakdown in Modal
        const stageSourceEl = document.getElementById('auditStageSource');
        const stageDecodeEl = document.getElementById('auditStageDecode');
        const stageDspEl = document.getElementById('auditStageDsp');
        const stageOutputEl = document.getElementById('auditStageOutput');

        const currentRate = audioContext ? audioContext.sampleRate : ((track && track.sampleRate) ? getValidSampleRate(track.sampleRate) : 44100);
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

        const ditherLabel = ditherMode === 'shaped'
            ? 'Psychoacoustic Shaped (>18 kHz)'
            : (ditherMode === 'tpdf' ? 'TPDF Flat Dither' : 'Unshaped Truncation (Off)');
        const volPct = Math.round(currentVolumeValue * 100);
        const gainModeStr = isHardwareGain ? `Hardware DAC Bridge (${volPct}%)` : `Digital Gain (${volPct}%)`;

        if (stageOutputEl) {
            stageOutputEl.textContent = `${ditherLabel} • ${gainModeStr}`;
        }

        // 3. Update Metrics Cards (Headroom, Latency, Precision) & Settings Telemetry
        let maxTotalBoost = maxBoostDb;
        if (isBassBoost) maxTotalBoost = Math.max(maxTotalBoost, 3.8);
        if (isTrebleBoost) maxTotalBoost = Math.max(maxTotalBoost, 3.0);
        if (isVocalBoost) maxTotalBoost = Math.max(maxTotalBoost, 2.8);
        const preampAttenDb = maxTotalBoost > 0 ? -(maxTotalBoost * 0.70) : 0;
        const volDb = currentVolumeValue > 0 ? (20 * Math.log10(currentVolumeValue)) : -60;
        const netHeadroomDb = Math.max(0, -(preampAttenDb + Math.min(0, volDb)));
        if (auditMetricHeadroom) {
            if (maxTotalBoost > 0) {
                auditMetricHeadroom.textContent = `${preampAttenDb.toFixed(1)} dB Pre-Amp (${netHeadroomDb.toFixed(1)} dB Guard)`;
            } else {
                auditMetricHeadroom.textContent = `+${Math.max(0.6, netHeadroomDb).toFixed(1)} dB (${currentVolumeValue > 1.0 ? 'Amplified' : 'Unity Guard'})`;
            }
        }

        let latencyMs = bufferLatencyTarget === 'interactive' ? 15.0 : 100.0;
        if (audioContext) {
            const ctxLat = ((audioContext.baseLatency || 0) + (audioContext.outputLatency || 0)) * 1000;
            if (ctxLat > 0) latencyMs = ctxLat;
        }
        const latencyModeStr = bufferLatencyTarget === 'interactive' ? 'Low-Latency' : 'Stable Buffer';
        if (auditMetricLatency) {
            auditMetricLatency.textContent = `~${latencyMs.toFixed(1)} ms (${latencyModeStr})`;
        }

        const auditMetricPrecision = document.getElementById('auditMetricPrecision');
        const auditMetricPrecisionDesc = document.getElementById('auditMetricPrecisionDesc');
        if (auditMetricPrecision) {
            auditMetricPrecision.textContent = isPrecision64
                ? '32-Bit Decode / 64-Bit DSP'
                : '32-Bit IEEE 754 Float';
        }
        if (auditMetricPrecisionDesc) {
            auditMetricPrecisionDesc.textContent = isPrecision64
                ? 'Browser decodes audio to 32-bit float; AudioWorklet computes biquad filters and dithering in 64-bit double float.'
                : 'Browser decodes and processes all audio stages in standard 32-bit single-precision IEEE 754 floating point.';
        }

        // Sync Settings Tab Telemetry Grid
        const settingsDspEngineVal = document.getElementById('settingsDspEngineVal');
        const settingsDspHeadroomVal = document.getElementById('settingsDspHeadroomVal');
        const settingsDspLatencyVal = document.getElementById('settingsDspLatencyVal');
        const settingsDspEqVal = document.getElementById('settingsDspEqVal');

        if (settingsDspEngineVal) {
            settingsDspEngineVal.textContent = isPrecision64 ? '64-Bit Worklet / 32-Bit Decode' : '32-Bit IEEE 754 Float';
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

        if (!savedTid && !savedPath && !savedFilename && !savedId && !savedTitle) {
            return -1;
        }

        // 1. Exact TID or ID match
        let idx = pool.findIndex(t => {
            if (savedTid && t.tid && t.tid.toString() === savedTid.toString()) return true;
            if (savedId && t.id && t.id.toString() === savedId.toString()) return true;
            return false;
        });
        if (idx !== -1) return idx;

        // 2. Exact fullPath match
        if (savedPath) {
            idx = pool.findIndex(t => t.fullPath && t.fullPath === savedPath);
            if (idx !== -1) return idx;
        }

        // 3. Filename match
        if (savedFilename) {
            idx = pool.findIndex(t => t.filename && t.filename.toLowerCase() === savedFilename.toLowerCase());
            if (idx !== -1) return idx;
        }

        // 4. Title match
        if (savedTitle) {
            idx = pool.findIndex(t => t.title && t.title.toLowerCase() === savedTitle.toLowerCase());
            if (idx !== -1) return idx;
        }

        return -1;
    }

    // Restore cached session state: active playlist and last played song (loaded in paused state)
    async function restoreSessionState() {
        const urlParams = new URLSearchParams(window.location.search);
        const reqTrack = urlParams.get('track');

        if (urlParams.get('tab') === 'playlists' || window.location.hash === '#playlists') {
            if (tabPlaylists) tabPlaylists.click();
        }

        // Restore active playlist if previously open and still exists
        const savedPlid = safeStorage.getItem('cachymusic_last_playlist_id');
        const savedPlName = safeStorage.getItem('cachymusic_last_playlist_name');
        if (savedPlid) {
            const matchedPl = playlists.find(p => p.plid == savedPlid);
            if (matchedPl) {
                await openPlaylist(matchedPl.plid, matchedPl.name || savedPlName);
            } else {
                try {
                    safeStorage.removeItem('cachymusic_last_playlist_id');
                    safeStorage.removeItem('cachymusic_last_playlist_name');
                } catch (_) {}
            }
        }

        if (allTracks.length === 0) return;

        // Determine target track to load (paused on boot)
        let targetIdx = 0;
        if (reqTrack !== null && !isNaN(parseInt(reqTrack, 10)) && allTracks[parseInt(reqTrack, 10)]) {
            targetIdx = parseInt(reqTrack, 10);
        } else {
            // First search within displayedTracks (if a playlist is active)
            const pool = (currentPlaylistId !== null && displayedTracks.length > 0) ? displayedTracks : allTracks;
            let foundPoolIdx = findTrackIndexBySavedState(pool);
            if (foundPoolIdx !== -1) {
                const tr = pool[foundPoolIdx];
                const masterIdx = allTracks.findIndex(t => (tr.tid && t.tid == tr.tid) || (tr.fullPath && t.fullPath === tr.fullPath) || (t.id == tr.id));
                targetIdx = masterIdx !== -1 ? masterIdx : 0;
            } else {
                // If not found in current playlist, check global allTracks
                let foundGlobalIdx = findTrackIndexBySavedState(allTracks);
                if (foundGlobalIdx !== -1) {
                    targetIdx = foundGlobalIdx;
                } else if (currentPlaylistId !== null && displayedTracks.length > 0) {
                    const firstPlTrack = displayedTracks[0];
                    const masterIdx = allTracks.findIndex(t => (firstPlTrack.tid && t.tid == firstPlTrack.tid) || (firstPlTrack.fullPath && t.fullPath === firstPlTrack.fullPath) || (t.id == firstPlTrack.id));
                    targetIdx = masterIdx !== -1 ? masterIdx : 0;
                } else {
                    targetIdx = 0;
                }
            }
        }

        // Retrieve remembered playback timeframe from previous session if track has not ended
        let savedTime = 0;
        try {
            const rawTime = safeStorage.getItem('cachymusic_last_track_time');
            if (rawTime !== null && !isNaN(parseFloat(rawTime))) {
                const parsed = parseFloat(rawTime);
                const targetTrack = allTracks[targetIdx];
                const trackDur = (targetTrack && targetTrack.duration) ? Number(targetTrack.duration) : 0;
                // Only resume if the song had not finished playing (< dur - 1)
                if (parsed > 0 && (!trackDur || parsed < (trackDur - 1))) {
                    savedTime = parsed;
                }
            }
        } catch (_) {}

        if (allTracks[targetIdx]) {
            await loadTrack(targetIdx, false, savedTime);
            if (isLyricsView) {
                updateLyricsDisplay(allTracks[targetIdx]);
            }
        }
    }


    function getValidSampleRate(rate) {
        const r = Number(rate);
        const validRates = [44100, 48000, 88200, 96000, 176400, 192000];
        if (validRates.includes(r)) return r;
        return 44100;
    }

    // Update DAC Stream & Hardware Sample Rate Status Indicator
    function updateDacStatusUi() {
        const currentTrack = (isStandalonePlayback && standaloneTrackList.length > 0)
            ? standaloneTrackList[standaloneTrackIndex]
            : allTracks[currentTrackIndex];
        updateSignalPathUi(currentTrack);
        if (!statDacStream) return;
        const currentRate = audioContext ? audioContext.sampleRate : ((currentTrack && currentTrack.sampleRate) ? getValidSampleRate(currentTrack.sampleRate) : 44100);
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
            if (isAmpBoost) activeDsp.push('AMP');
            if (isBassBoost) activeDsp.push('BASS');
            if (isVocalBoost) activeDsp.push('VOCAL');
            if (isTrebleBoost) activeDsp.push('TREBLE');
            if (isLimiter) activeDsp.push('LIMITER');
            const dspStr = activeDsp.length > 0 ? activeDsp.join('+') : 'ACTIVE';
            statDacStream.textContent = `STUDIO DSP (${dspStr} • ${bitStr} • ${rateStr} • ${nyquistKhz}kHz)`;
            statDacStream.style.color = isLightSurface ? '#9a3412' : '#ffaa00';
            statDacStream.title = `Processing through ${isPrecision64 ? '64-bit' : '32-bit'} floating-point Web Audio DSP stage at ${rateStr} (${nyquistKhz} kHz bandwidth).`;
        }
    }

    // Dynamic Audio Specifications Badge (Strict audio attributes, no fluff)
    function updateTrackBadgeUi(track) {
        if (!trackBadge || !track) return;
        const badgeParts = [];
        const fmt = resolveTrackFormat(track);
        if (fmt) {
            badgeParts.push(fmt);
        }
        const bd = track.bitDepth || ((track.sampleRate && track.sampleRate >= 88200) ? 24 : 16);
        if (bd) {
            badgeParts.push(`${bd}-Bit`);
        }
        if (track.sampleRate) {
            badgeParts.push(track.sampleRate >= 1000 ? `${(track.sampleRate / 1000).toFixed(1)} kHz` : `${track.sampleRate} Hz`);
        }
        if (track.bitrate) {
            badgeParts.push(`${track.bitrate} kbps`);
        }
        if (track.channels === 2) {
            badgeParts.push('Stereo');
        } else if (track.channels === 1) {
            badgeParts.push('Mono');
        } else if (track.channels) {
            badgeParts.push(`${track.channels} ch`);
        }
        trackBadge.textContent = badgeParts.length > 0 ? badgeParts.join(' • ') : 'AUDIO';
    }



    function updateVolumeIcon(vol) {
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

    let lastPositionStateUpdate = 0;
    function updateMediaSessionPositionState(force = false) {
        if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
        const now = performance.now();
        if (!force && (now - lastPositionStateUpdate < 800)) return;
        lastPositionStateUpdate = now;
        try {
            const dur = isSoftwareDecoding ? (activeDecodedBuffer ? activeDecodedBuffer.duration : 0) : (audio ? audio.duration : 0);
            const pos = isSoftwareDecoding ? (softwarePlaybackOffset + (audioContext && !isSoftwarePaused ? (audioContext.currentTime - softwarePlaybackStartTime) : 0)) : (audio ? (audio.currentTime || 0) : 0);
            if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
                navigator.mediaSession.setPositionState({
                    duration: Math.max(0, dur),
                    playbackRate: currentPlaybackSpeed || 1.0,
                    position: Math.max(0, Math.min(dur, pos || 0))
                });
            }
        } catch (_) {}
    }

    function setupMediaSessionActionHandlers() {
        if (!('mediaSession' in navigator)) return;
        try {
            navigator.mediaSession.setActionHandler('play', () => { resumeAudio(); });
            navigator.mediaSession.setActionHandler('pause', () => { pauseAudio(); });
            navigator.mediaSession.setActionHandler('stop', () => { pauseAudio(); });
            navigator.mediaSession.setActionHandler('previoustrack', () => { playPrevTrack(); });
            navigator.mediaSession.setActionHandler('nexttrack', () => { playNextTrack(); });
            navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                const skip = (details && details.seekOffset) || 10;
                const cur = isSoftwareDecoding ? softwarePlaybackOffset : (audio ? audio.currentTime : 0);
                seekAudio(Math.max(0, cur - skip));
            });
            navigator.mediaSession.setActionHandler('seekforward', (details) => {
                const skip = (details && details.seekOffset) || 10;
                const cur = isSoftwareDecoding ? softwarePlaybackOffset : (audio ? audio.currentTime : 0);
                seekAudio(cur + skip);
            });
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details && details.seekTime !== undefined && !isNaN(details.seekTime)) {
                    seekAudio(details.seekTime);
                }
            });
        } catch (e) {
            console.warn('[MediaSession] Error setting action handlers:', e);
        }
    }

    // Attach top-level Player Core functions and state to window for cross-module accessibility
    if (typeof window !== "undefined") {
        try { window.activeLoadedMetadataHandler = activeLoadedMetadataHandler; } catch (_) {}
        try { window.attachAudioListeners = attachAudioListeners; } catch (_) {}
        try { window.cancelSoftwareProgressLoop = cancelSoftwareProgressLoop; } catch (_) {}
        try { window.checkAndPreloadNextTrack = checkAndPreloadNextTrack; } catch (_) {}
        try { window.consecutiveSkipCount = consecutiveSkipCount; } catch (_) {}
        try { window.currentPlayRequestId = currentPlayRequestId; } catch (_) {}
        try { window.currentTrackGeneration = currentTrackGeneration; } catch (_) {}
        try { window.debugModeActive = debugModeActive; } catch (_) {}
        try { window.executeGaplessHandoff = executeGaplessHandoff; } catch (_) {}
        try { window.findTrackIndexBySavedState = findTrackIndexBySavedState; } catch (_) {}
        try { window.getValidSampleRate = getValidSampleRate; } catch (_) {}
        try { window.initMprisBridge = initMprisBridge; } catch (_) {}
        try { window.isPlayPending = isPlayPending; } catch (_) {}
        try { window.lastPositionStateUpdate = lastPositionStateUpdate; } catch (_) {}
        try { window.lastSyncedPlayingState = lastSyncedPlayingState; } catch (_) {}
        try { window.loadTrack = loadTrack; } catch (_) {}
        try { window.nextTrack = nextTrack; } catch (_) {}
        try { window.updateMarqueeText = updateMarqueeText; } catch (_) {}
        try { window.recomputeMarquees = recomputeMarquees; } catch (_) {}
        try { window.onSoftwarePlaybackEnded = onSoftwarePlaybackEnded; } catch (_) {}
        try { window.pauseAudio = pauseAudio; } catch (_) {}
        try { window.pauseSoftwarePlayback = pauseSoftwarePlayback; } catch (_) {}
        try { window.peekNextTrackIndex = peekNextTrackIndex; } catch (_) {}
        try { window.playAudio = playAudio; } catch (_) {}
        try { window.playPendingTimeout = playPendingTimeout; } catch (_) {}
        try { window.playWithSoftwareDecoder = playWithSoftwareDecoder; } catch (_) {}
        try { window.prevTrack = prevTrack; } catch (_) {}
        try { window.resolveTrackFormat = resolveTrackFormat; } catch (_) {}
        try { window.restoreSessionState = restoreSessionState; } catch (_) {}
        try { window.resumeSoftwarePlayback = resumeSoftwarePlayback; } catch (_) {}
        try { window.seekSoftwarePlayback = seekSoftwarePlayback; } catch (_) {}
        try { window.setupMediaSessionActionHandlers = setupMediaSessionActionHandlers; } catch (_) {}
        try { window.startSoftwareBufferPlayback = startSoftwareBufferPlayback; } catch (_) {}
        try { window.startSoftwareProgressLoop = startSoftwareProgressLoop; } catch (_) {}
        try { window.stopSoftwarePlayback = stopSoftwarePlayback; } catch (_) {}
        try { window.syncPlayPauseUI = syncPlayPauseUI; } catch (_) {}
        try { window.togglePlayPause = togglePlayPause; } catch (_) {}
        try { window.trackPlaybackRetryCount = trackPlaybackRetryCount; } catch (_) {}
        try { window.updateDacStatusUi = updateDacStatusUi; } catch (_) {}
        try { window.updateMediaSessionPositionState = updateMediaSessionPositionState; } catch (_) {}
        try { window.updatePlaybackProgress = updatePlaybackProgress; } catch (_) {}
        try { window.updateRepeatUI = updateRepeatUI; } catch (_) {}
        try { window.updateSignalPathUi = updateSignalPathUi; } catch (_) {}
        try { window.updateTrackBadgeUi = updateTrackBadgeUi; } catch (_) {}
        try { window.updateVolumeIcon = updateVolumeIcon; } catch (_) {}
        try { window.userExplicitlyPaused = userExplicitlyPaused; } catch (_) {}
    }



    // --- Sub-Module: lyrics.js ---
// CachyMusic - Synchronized LRC Lyrics Engine
    // Parse Lyrics (supporting standard text and timestamped LRC format [mm:ss.xx])
    function parseLyrics(raw) {
        if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
        const lines = raw.split(/\r?\n/);
        const parsed = [];
        const lrcRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
        let hasTimestamps = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const timeMatches = [...trimmed.matchAll(lrcRegex)];
            if (timeMatches.length > 0) {
                hasTimestamps = true;
                const textOnly = trimmed.replace(lrcRegex, '').trim();
                for (const match of timeMatches) {
                    const min = parseInt(match[1], 10);
                    const sec = parseInt(match[2], 10);
                    const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
                    const time = min * 60 + sec + (ms / 1000);
                    parsed.push({ time, text: textOnly || '♪' });
                }
            } else if (!trimmed.match(/^\[[a-zA-Z]+:.*\]$/)) {
                // Regular line (ignore ID tags like [ar:Artist])
                parsed.push({ time: -1, text: trimmed });
            }
        }

        if (hasTimestamps) {
            parsed.sort((a, b) => a.time - b.time);
        }

        return { isSynced: hasTimestamps, lines: parsed, raw };
    }

    // Update Lyrics Displayer Content
    function updateLyricsDisplay(track) {
        if (!lyricsTrackName || !lyricsArtistName || !lyricsContent) return;

        activeLyricIndex = -1;
        const title = track ? (track.title || track.filename || 'Select A Track') : '—';
        const artist = track ? (track.artist || 'Unknown Artist') : '—';
        lyricsTrackName.textContent = title;
        lyricsArtistName.textContent = artist;

        const lyricsRaw = track ? track.lyrics : null;
        parsedLyrics = parseLyrics(lyricsRaw);

        if (!parsedLyrics || parsedLyrics.lines.length === 0) {
            lyricsContent.innerHTML = `
                <div class="lyricsPlaceholder">
                    <div class="lyricsPlaceholderIcon">♪</div>
                    <p>No lyrics available for this track.</p>
                    <span>Lyrics can be embedded via the<br>USLT/LYRICS tag in your audio files or in a .lrc file.</span>
                </div>
            `;
            return;
        }

        let html = '';
        parsedLyrics.lines.forEach((item, idx) => {
            const timeAttr = item.time >= 0 ? ` data-time="${item.time.toFixed(2)}"` : '';
            const isClickable = item.time >= 0 ? ' clickable' : '';
            const clickTitle = isClickable ? ' title="Click to jump playback to this line"' : '';
            html += `<div class="lyricLine lyricsLine${isClickable}" data-index="${idx}"${timeAttr}${clickTitle}>${escapeHtml(item.text)}</div>`;
        });
        lyricsContent.innerHTML = html;

        // Interactive seeking when clicking synced lyric lines
        if (parsedLyrics.isSynced) {
            lyricsContent.querySelectorAll('.lyricLine.clickable').forEach(el => {
                el.addEventListener('click', () => {
                    const t = parseFloat(el.dataset.time);
                    if (!isNaN(t)) {
                        audio.currentTime = t;
                        try {
                            const dur = audio.duration;
                            if (t > 0 && (!dur || isNaN(dur) || t < (dur - 1))) {
                                safeStorage.setItem('cachymusic_last_track_time', t.toFixed(2));
                            }
                        } catch (_) {}
                        playAudio();
                    }
                });
            });
            updateActiveLyric(audio.currentTime);
        }
    }

    // Highlight and Scroll Active Lyric Line for Synced LRC
    function updateActiveLyric(currentTime) {
        if (!isLyricsView || !parsedLyrics || !parsedLyrics.isSynced || !lyricsContent) return;
        const lines = parsedLyrics.lines;
        let newIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].time <= currentTime + 0.15) {
                newIdx = i;
            } else {
                break;
            }
        }

        if (newIdx !== activeLyricIndex) {
            activeLyricIndex = newIdx;
            const allEls = lyricsContent.querySelectorAll('.lyricLine');
            allEls.forEach((el, i) => {
                if (i === activeLyricIndex) {
                    el.classList.add('active');
                    if (lyricsScrollArea) {
                        const elTop = el.offsetTop - lyricsScrollArea.offsetTop;
                        const targetScroll = elTop - (lyricsScrollArea.clientHeight / 2) + (el.clientHeight / 2);
                        lyricsScrollArea.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
                    }
                } else {
                    el.classList.remove('active');
                }
            });
        }
    }

    // Toggle Lyrics Displayer (takes over turntable upon toggle, returns to turntable upon disable)
    function toggleLyricsView(forcedState) {
        if (!lyricsToggleBtn || !lyricsCon || !turntableCon) return;

        isLyricsView = (forcedState !== undefined) ? !!forcedState : !isLyricsView;

        if (isLyricsView) {
            lyricsToggleBtn.classList.add('active');
            lyricsToggleBtn.setAttribute('title', 'Return to Turntable View (L)');
            const textSpan = lyricsToggleBtn.querySelector('span');
            if (textSpan) textSpan.textContent = 'TURNTABLE';
            turntableCon.style.setProperty('display', 'none', 'important');
            turntableCon.classList.add('lyricsActiveHidden');
            lyricsCon.classList.remove('lyricsActiveHidden');
            lyricsCon.style.setProperty('display', 'flex', 'important');
            updateLyricsDisplay(allTracks[currentTrackIndex]);
        } else {
            lyricsToggleBtn.classList.remove('active');
            lyricsToggleBtn.setAttribute('title', 'Toggle Lyrics View (L)');
            const textSpan = lyricsToggleBtn.querySelector('span');
            if (textSpan) textSpan.textContent = 'LYRICS';
            turntableCon.classList.remove('lyricsActiveHidden');
            turntableCon.style.removeProperty('display');
            lyricsCon.classList.add('lyricsActiveHidden');
            lyricsCon.style.setProperty('display', 'none', 'important');
        }
    }

    // Attach lyrics functions to window
    if (typeof window !== "undefined") {
        try { window.parseLyrics = parseLyrics; } catch (_) {}
        try { window.updateLyricsDisplay = updateLyricsDisplay; } catch (_) {}
        try { window.updateActiveLyric = updateActiveLyric; } catch (_) {}
        try { window.toggleLyricsView = toggleLyricsView; } catch (_) {}
    }




    // --- Sub-Module: visualizer-themes-1.js ---
// CachyMusic - Turntable Center Visualizers (Atlas, Solar Eclipse, Euclid, Alien Paradise)
    let atlasLuminance = 0.05;
    let atlasRotationAngle = 0;
    let atlasPrecessionAngle = 0;

    function drawTurntableCenterAtlasCore(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
        if (!ctx || width === 0 || height === 0) return;

        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) * 0.48;
        const hubRadius = Math.min(width, height) * 0.20;
        const s = hubRadius / 54;

        // 0. Dynamic Beat Strength & Core Luminance Calculation
        // At rest / quiet: dormant dark obsidian-garnet (~0.05).
        // On heavy beats & drops: ignites up to 1.0 (blazing incandescent crimson & laser white).
        const rawBeatEnergy = Math.min(1.0, 
            beatPulse * 1.15 + 
            snarePulse * 0.75 + 
            smoothBass * 0.90 + 
            smoothMid * 0.30
        );
        const targetLuminance = playing ? Math.min(1.0, 0.05 + rawBeatEnergy * 0.95) : 0.04;

        if (targetLuminance > atlasLuminance) {
            // Explosive instantaneous ignition on musical transients
            atlasLuminance += (targetLuminance - atlasLuminance) * (1.0 - Math.exp(-22.0 * dt));
        } else {
            // Smooth, organic thermal cooldown (cooling celestial plasma)
            atlasLuminance += (targetLuminance - atlasLuminance) * (1.0 - Math.exp(-4.2 * dt));
        }
        atlasLuminance = Math.max(0.04, Math.min(1.0, atlasLuminance));

        // Dynamic Rotational Surge on Beat Transients & Luminance (Scaled by Fidelity: 0 rotation in resting mode)
        if (playing) {
            const rotAccel = (0.25 + atlasLuminance * 2.6 + beatPulse * 1.2) * fidelity;
            atlasRotationAngle += dt * rotAccel;
            const precAccel = (0.18 + atlasLuminance * 1.3 + smoothTreble * 0.8) * fidelity;
            atlasPrecessionAngle += dt * precAccel;
        } else {
            atlasRotationAngle += dt * 0.15 * fidelity;
            atlasPrecessionAngle += dt * 0.08 * fidelity;
        }

        // 1. Acoustic Laser Shockwaves (Concentric ripples only ignite when beat energy surges and fidelity is high)
        if (playing && atlasLuminance > 0.38 && fidelity > 0.15) {
            if (beatPulse > 0.36 && Math.random() < 0.46) {
                emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * atlasLuminance * fidelity, '#ff1744');
            } else if (snarePulse > 0.42 && Math.random() < 0.38) {
                emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.80 * atlasLuminance * fidelity, '#00e5ff');
            }
        }

        for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
            const sw = turntableShockwaves[i];
            sw.r += sw.speed * dt;
            const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
            if (prog >= 1.0) {
                turntableShockwaves.splice(i, 1);
                continue;
            }
            const currentAlpha = sw.alpha * (1.0 - prog) * Math.min(1.0, atlasLuminance * 1.3) * (0.35 + 0.65 * fidelity);
            ctx.save();
            ctx.strokeStyle = sw.color === '#00e5ff' ? `rgba(0, 229, 255, ${currentAlpha})` : `rgba(255, 23, 68, ${currentAlpha})`;
            ctx.shadowColor = sw.color || '#ff1744';
            ctx.shadowBlur = (8 + atlasLuminance * 12 * (0.35 + 0.65 * fidelity)) * s;
            ctx.lineWidth = Math.max(1.0, (2.0 + atlasLuminance * 1.4) * (1.0 - prog * 0.5));
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // =====================================================================
        // FULL-PLATTER ATLAS ARCHITECTURE: Hexagonal Telemetry Matrix (Outer Platter)
        // Unlocked and smoothly bloomed when Thematic Core is active!
        // =====================================================================
        if (fidelity > 0.005) {
            ctx.save();
            ctx.globalAlpha = fidelity;
            ctx.translate(centerX, centerY);

            // Platter base circle
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#050711';
            ctx.fill();

            // Outer Atlas Containment Laser Rim
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius * 0.94, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 23, 68, ${0.40 + atlasLuminance * 0.50})`;
            ctx.lineWidth = Math.max(1.5, 2.0 * s);
            ctx.shadowColor = '#ff1744';
            ctx.shadowBlur = (8 + atlasLuminance * 16) * s;
            ctx.stroke();

            // Outer Hexagonal Grid & Radar Crosshairs
            ctx.save();
            ctx.rotate(atlasRotationAngle * 0.2);
            const hexR = maxRadius * 0.82;
            ctx.beginPath();
            for (let h = 0; h < 6; h++) {
                const hAng = (h * Math.PI) / 3;
                const hx = Math.cos(hAng) * hexR;
                const hy = Math.sin(hAng) * hexR;
                if (h === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
            }
            ctx.closePath();
            ctx.strokeStyle = `rgba(0, 229, 255, ${0.20 + atlasLuminance * 0.35})`;
            ctx.lineWidth = Math.max(1.0, 1.4 * s);
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = (6 + atlasLuminance * 10) * s;
            ctx.stroke();

            // 12 Telemetry Spokes & Sector Pointers
            for (let sp = 0; sp < 12; sp++) {
                const spAng = (sp * Math.PI) / 6;
                ctx.beginPath();
                ctx.moveTo(Math.cos(spAng) * hubRadius * 1.2, Math.sin(spAng) * hubRadius * 1.2);
                ctx.lineTo(Math.cos(spAng) * maxRadius * 0.92, Math.sin(spAng) * maxRadius * 0.92);
                ctx.strokeStyle = sp % 3 === 0 ? `rgba(255, 23, 68, ${0.25 + atlasLuminance * 0.4})` : `rgba(0, 229, 255, 0.12)`;
                ctx.lineWidth = sp % 3 === 0 ? 1.4 * s : 0.8 * s;
                ctx.stroke();
            }
            ctx.restore();

            // Telemetry Text Stamps around the perimeter
            ctx.save();
            ctx.rotate(-atlasRotationAngle * 0.15);
            ctx.fillStyle = `rgba(0, 229, 255, ${0.45 + atlasLuminance * 0.45})`;
            ctx.font = `${Math.max(9, Math.round(8 * s))}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const glyphs = ['16 // 16 // 16', 'ATLAS // MATRIX', 'EUCLID // SECTOR', 'ANOMALY // LOC'];
            for (let g = 0; g < 4; g++) {
                const gAng = (g * Math.PI) / 2;
                ctx.save();
                ctx.rotate(gAng);
                ctx.translate(0, -maxRadius * 0.88);
                ctx.fillText(glyphs[g], 0, 0);
                ctx.restore();
            }
            ctx.restore();
            ctx.restore();
        }

        // 2. Center Hub Void Platter: Obsidian Diamond Disc with Beat-Responsive Rim
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#060710';
        ctx.fill();
        const platterAlpha = 0.20 + atlasLuminance * 0.80;
        ctx.strokeStyle = atlasLuminance > 0.65 ? `rgba(255, 255, 255, ${platterAlpha})` : `rgba(255, 23, 68, ${platterAlpha})`;
        ctx.lineWidth = Math.max(1.0, (1.2 + atlasLuminance * 1.6) * s);
        ctx.shadowColor = atlasLuminance > 0.65 ? '#ffffff' : '#ff1744';
        ctx.shadowBlur = (atlasLuminance * 22 * (0.35 + 0.65 * fidelity)) * s;
        ctx.stroke();
        ctx.restore();

        // 3. Ambient Radial Nebula Glow (Quiet dark aura when dim, flares into blazing bloom on beat)
        const glowR = hubRadius * (0.50 + atlasLuminance * 0.75);
        const grad = ctx.createRadialGradient(centerX, centerY, 2, centerX, centerY, glowR);
        grad.addColorStop(0, `rgba(255, 23, 68, ${0.04 + atlasLuminance * 0.76})`);
        grad.addColorStop(0.35, `rgba(255, 171, 0, ${atlasLuminance * 0.38})`);
        grad.addColorStop(0.65, `rgba(124, 77, 255, ${atlasLuminance * 0.30})`);
        grad.addColorStop(1, 'rgba(6, 7, 16, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowR, 0, Math.PI * 2);
        ctx.fill();

        // 4. Concentric Orbital Coordinate Rings (The Anomaly Telemetry)
        ctx.save();
        ctx.translate(centerX, centerY);

        // Outer Ring 1 (Cyan telemetry ellipse with rotating glyph markers)
        const r1 = (44 + smoothTreble * 14 + atlasLuminance * 16) * s;
        ctx.save();
        ctx.rotate(atlasRotationAngle * 0.45);
        ctx.scale(1, 0.45);
        ctx.beginPath();
        ctx.arc(0, 0, r1, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 229, 255, ${0.15 + atlasLuminance * 0.75})`;
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = (atlasLuminance * 16) * s;
        ctx.lineWidth = Math.max(0.7, (0.9 + atlasLuminance * 1.5) * s);
        ctx.setLineDash([Math.round(5 * s), Math.round(7 * s)]);
        ctx.stroke();
        ctx.restore();

        // Outer Ring 2 (Crimson telemetry ellipse with 16-point coordinates)
        const r2 = (38 + smoothBass * 16 + atlasLuminance * 22) * s;
        ctx.save();
        ctx.rotate(-atlasRotationAngle * 0.65);
        ctx.scale(0.55, 1);
        ctx.beginPath();
        ctx.arc(0, 0, r2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 23, 68, ${0.18 + atlasLuminance * 0.75})`;
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = (atlasLuminance * 18) * s;
        ctx.lineWidth = Math.max(0.7, (0.9 + atlasLuminance * 1.6) * s);
        ctx.setLineDash([Math.round(6 * s), Math.round(5 * s)]);
        ctx.stroke();
        ctx.restore();

        // Inner Ring 3 (Golden telemetry radar ticks - erupts into view on heavy beats)
        if (atlasLuminance > 0.45) {
            ctx.save();
            ctx.rotate(atlasRotationAngle * 1.1);
            const r3 = (26 + atlasLuminance * 18) * s;
            ctx.beginPath();
            ctx.arc(0, 0, r3, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 171, 0, ${(atlasLuminance - 0.45) * 1.5})`;
            ctx.lineWidth = Math.max(0.8, 1.2 * s);
            ctx.setLineDash([Math.round(3 * s), Math.round(9 * s)]);
            ctx.stroke();
            ctx.restore();
        }

        // 4b. Orbiting Telemetry Coordinates: // 16 // 16 // 16 // 16 //
        ctx.save();
        ctx.rotate(atlasRotationAngle * 0.35);
        ctx.font = `bold ${Math.max(6, Math.round(7.5 * s))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(0, 229, 255, ${0.12 + atlasLuminance * 0.78})`;
        const runeDist = r1 * 0.95;
        for (let r = 0; r < 4; r++) {
            const rAngle = (r * Math.PI) / 2;
            const rx = Math.cos(rAngle) * runeDist;
            const ry = Math.sin(rAngle) * runeDist * 0.45;
            ctx.fillText('// 16 //', rx, ry);
        }
        ctx.restore();

        // 5. 3D Floating Crimson Octahedron (The ATLAS Entity)
        // Starts as a dormant, dark obsidian-garnet crystal, then blazes into searing radiant ruby & white!
        const coreScale = s * (0.92 + atlasLuminance * 0.46);
        const stretchY = 1.0 + (beatPulse * 0.22 - snarePulse * 0.08) * atlasLuminance;
        const stretchX = 1.0 + (snarePulse * 0.16 - beatPulse * 0.06) * atlasLuminance;
        const H = 34 * coreScale * stretchY;
        const R = 22 * coreScale * stretchX;

        const rotY = atlasRotationAngle;
        const tiltX = Math.sin(atlasPrecessionAngle) * 0.25;

        function project(x, y, z) {
            const y1 = y * Math.cos(tiltX) - z * Math.sin(tiltX);
            const z1 = y * Math.sin(tiltX) + z * Math.cos(tiltX);
            return { px: x, py: -z1, depth: y1 };
        }

        const topPt = project(0, 0, H);
        const botPt = project(0, 0, -H);

        const eqPts = [];
        for (let i = 0; i < 4; i++) {
            const angle = rotY + (i * Math.PI) / 2;
            const x = Math.cos(angle) * R;
            const y = Math.sin(angle) * R;
            eqPts.push(project(x, y, 0));
        }

        const faces = [];
        for (let i = 0; i < 4; i++) {
            const nextI = (i + 1) % 4;
            faces.push({
                pts: [topPt, eqPts[i], eqPts[nextI]],
                isTop: true,
                avgDepth: (topPt.depth + eqPts[i].depth + eqPts[nextI].depth) / 3
            });
            faces.push({
                pts: [botPt, eqPts[nextI], eqPts[i]],
                isTop: false,
                avgDepth: (botPt.depth + eqPts[nextI].depth + eqPts[i].depth) / 3
            });
        }

        faces.sort((a, b) => a.avgDepth - b.avgDepth);

        for (let f of faces) {
            const p0 = f.pts[0];
            const p1 = f.pts[1];
            const p2 = f.pts[2];

            const v1x = p1.px - p0.px;
            const v1y = p1.py - p0.py;
            const v2x = p2.px - p0.px;
            const v2y = p2.py - p0.py;
            const cross = v1x * v2y - v1y * v2x;

            const isFront = cross > 0;
            const lightNorm = isFront ? 0.75 : 0.35;
            const lightFactor = Math.min(1.0, lightNorm + (f.isTop ? 0.2 : 0.0) + (p1.depth > 0 ? 0.15 : -0.1));

            ctx.beginPath();
            ctx.moveTo(p0.px, p0.py);
            ctx.lineTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            ctx.closePath();

            // Dynamic Facet Color:
            // When dim (atlasLuminance ~ 0.05): Dark obsidian garnet (#220408 to #3a0812)
            // As beat strength rises (atlasLuminance -> 1.0): Blazes into radiant incandescent crimson (#ff1744) -> cherry ruby -> white-hot core
            const baseDimRed = 30 + 38 * lightFactor; // 30..68 (dark obsidian)
            const maxBrightRed = 212 + 43 * lightFactor; // 212..255 (flaming crimson)
            const redVal = Math.min(255, Math.round(baseDimRed + (maxBrightRed - baseDimRed) * atlasLuminance));

            // Green and Blue stay near zero in dim state (deep garnet), then swell on heavy beats for searing incandescence
            const peakHeat = Math.max(0, (atlasLuminance - 0.40) / 0.60);
            const greenVal = Math.min(220, Math.round(5 + 10 * lightFactor + peakHeat * (65 + snarePulse * 85)));
            const blueVal = Math.min(230, Math.round(10 + 15 * lightFactor + peakHeat * (85 + snarePulse * 90)));
            const alphaVal = isFront 
                ? Math.min(1.0, 0.60 + atlasLuminance * 0.40) 
                : Math.min(1.0, 0.30 + atlasLuminance * 0.65);

            ctx.fillStyle = `rgba(${redVal}, ${greenVal}, ${blueVal}, ${alphaVal})`;
            ctx.fill();

            // Facet edges flare from subtle dormant contour to razor-sharp laser white with crimson bloom
            if (atlasLuminance > 0.58 && isFront) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.65 + atlasLuminance * 0.35})`;
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = (atlasLuminance * 20) * s;
            } else {
                const edgeAlpha = 0.20 + atlasLuminance * 0.80;
                ctx.strokeStyle = isFront
                    ? `rgba(255, 40, 80, ${edgeAlpha})`
                    : `rgba(200, 15, 45, ${edgeAlpha * 0.7})`;
                ctx.shadowColor = '#ff1744';
                ctx.shadowBlur = (atlasLuminance * 16) * s;
            }
            ctx.lineWidth = Math.max(0.7, (0.8 + atlasLuminance * 1.5) * s);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // 6. Atlas Core Singularity Spark (Dormant garnet ember -> blazing stellar pulsar)
        const sparkBaseR = 2.5 * coreScale;
        const sparkMaxR = 10.0 * coreScale;
        const sparkR = sparkBaseR + (sparkMaxR - sparkBaseR) * atlasLuminance;

        const sparkGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, sparkR);
        if (atlasLuminance > 0.38) {
            sparkGrad.addColorStop(0, '#ffffff');
            sparkGrad.addColorStop(0.35, '#ff1744');
            sparkGrad.addColorStop(0.75, `rgba(255, 23, 68, ${atlasLuminance * 0.75})`);
            sparkGrad.addColorStop(1, 'rgba(255, 23, 68, 0)');
        } else {
            sparkGrad.addColorStop(0, `rgba(255, 60, 80, ${0.35 + atlasLuminance * 0.65})`);
            sparkGrad.addColorStop(0.5, `rgba(180, 10, 30, ${0.20 + atlasLuminance * 0.40})`);
            sparkGrad.addColorStop(1, 'rgba(255, 23, 68, 0)');
        }
        ctx.fillStyle = sparkGrad;
        ctx.beginPath();
        ctx.arc(0, 0, sparkR, 0, Math.PI * 2);
        ctx.fill();

        // Anamorphic Cross-Diffraction Laser Spikes (Ignite on heavy beat energy)
        if (playing && atlasLuminance > 0.42) {
            const flareIntensity = (atlasLuminance - 0.42) / 0.58;
            ctx.save();
            ctx.rotate(atlasRotationAngle * 1.25);
            const flareLen = (18 + flareIntensity * 58) * coreScale;
            const flareWidth = Math.max(1.0, (1.2 + flareIntensity * 2.4) * s);
            for (let f = 0; f < 4; f++) {
                const fAngle = (f * Math.PI) / 2;
                ctx.save();
                ctx.rotate(fAngle);
                const fGrad = ctx.createLinearGradient(0, 0, flareLen, 0);
                fGrad.addColorStop(0, `rgba(255, 255, 255, ${flareIntensity})`);
                fGrad.addColorStop(0.25, `rgba(255, 23, 68, ${flareIntensity * 0.9})`);
                fGrad.addColorStop(0.65, `rgba(0, 229, 255, ${flareIntensity * 0.5})`);
                fGrad.addColorStop(1, 'rgba(255, 23, 68, 0)');
                ctx.strokeStyle = fGrad;
                ctx.lineWidth = flareWidth;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(flareLen, 0);
                ctx.stroke();
                ctx.restore();
            }
            ctx.restore();
        }

        ctx.restore();
    }

    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center PLANETARY WARP (Solar Eclipse Reference)
    // Dark celestial sphere, blazing magenta solar corona, electric cyan rings,
    // and starship banking with curved relativistic lightspeed trails along its orbit.
    // -------------------------------------------------------------------------
    let eclipseRotation = 0;
    window.__setEclipseRotation = (r) => { eclipseRotation = r; };
    window.__pauseEclipseRotation = false;
    function drawTurntableCenterSolarEclipse(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
        if (!ctx || width === 0 || height === 0) return;
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) * 0.48;
        const hubRadius = Math.min(width, height) * 0.20;
        const s = hubRadius / 54;
        const orbitTilt = -0.32;
        const ringAspect = 0.58;
        const shipOrbitR = hubRadius * (1.72 + smoothBass * 0.12);

        if (!window.__pauseEclipseRotation) {
            if (playing) {
                eclipseRotation += dt * (0.6 + beatPulse * 1.8 + snarePulse * 1.2) * fidelity;
            } else {
                eclipseRotation += dt * 0.18 * fidelity;
            }
        }

        // 1. Acoustic Shockwaves (Electric Cyan & Magenta)
        if (playing && fidelity > 0.15) {
            if (beatPulse > 0.38 && Math.random() < 0.45) {
                emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * fidelity, '#00f0ff');
            } else if (snarePulse > 0.42 && Math.random() < 0.40) {
                emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.80 * fidelity, '#ff007f');
            }
        }
        for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
            const sw = turntableShockwaves[i];
            sw.r += sw.speed * dt;
            const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
            if (prog >= 1.0) { turntableShockwaves.splice(i, 1); continue; }
            const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
            ctx.save();
            ctx.strokeStyle = sw.color === '#ff007f' ? `rgba(255, 0, 127, ${currentAlpha})` : `rgba(0, 240, 255, ${currentAlpha})`;
            ctx.shadowColor = sw.color || '#00f0ff';
            ctx.shadowBlur = (8 + beatPulse * 8 * (0.35 + 0.65 * fidelity)) * s;
            ctx.lineWidth = Math.max(1.0, (2.0 + beatPulse * 1.2) * (1.0 - prog * 0.5));
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // =====================================================================
        // FULL-PLATTER PLANETARY WARP ARCHITECTURE: 3D Celestial Orbit
        // =====================================================================
        ctx.save();
        ctx.translate(centerX, centerY);

        const cosTilt = Math.cos(orbitTilt);
        const sinTilt = Math.sin(orbitTilt);

        function getOrbitPoint(theta) {
            const ex = Math.cos(theta) * shipOrbitR;
            const ey = Math.sin(theta) * shipOrbitR * ringAspect;
            return {
                x: ex * cosTilt - ey * sinTilt,
                y: ex * sinTilt + ey * cosTilt,
                ex,
                ey
            };
        }

        function getOrbitTangent(theta) {
            const dex = -Math.sin(theta) * shipOrbitR;
            const dey = Math.cos(theta) * shipOrbitR * ringAspect;
            const vx = dex * cosTilt - dey * sinTilt;
            const vy = dex * sinTilt + dey * cosTilt;
            const len = Math.hypot(vx, vy) || 1;
            return {
                vx: vx / len,
                vy: vy / len,
                nx: -vy / len,
                ny: vx / len,
                angle: Math.atan2(vy, vx)
            };
        }

        const trailSpan = 0.42 + beatPulse * 0.95 + snarePulse * 0.45 + smoothBass * 0.35;
        const K = 32;
        const trailPts = [];
        for (let i = 0; i <= K; i++) {
            const u = i / K; // 0 at tail tip, 1 at ship engine nozzle
            const th = eclipseRotation - trailSpan * (1 - u);
            const p = getOrbitPoint(th);
            const t = getOrbitTangent(th);
            trailPts.push({ u, x: p.x, y: p.y, ey: p.ey, nx: t.nx, ny: t.ny, angle: t.angle });
        }

        const headPt = trailPts[K];
        const tailPt = trailPts[0];

        // Draw orbital ring arcs (isFront = false for back Z < 0; isFront = true for front Z >= 0)
        function drawRingArcs(isFront) {
            ctx.save();
            ctx.rotate(orbitTilt);
            ctx.scale(1, ringAspect);

            const startAng = isFront ? -0.02 : Math.PI - 0.02;
            const endAng = isFront ? Math.PI + 0.02 : Math.PI * 2 + 0.02;

            // A. Planetary dust rings
            const totalRings = 9;
            for (let r = 0; r < totalRings; r++) {
                if (r === 4 || r === 7) continue; // Cassini division gaps
                const rRad = hubRadius * 1.20 + (r / (totalRings - 1)) * (maxRadius * 0.88 - hubRadius * 1.20);
                const rAlpha = (r % 2 === 0 ? 0.30 : 0.16) + (r === 2 ? beatPulse * 0.35 : snarePulse * 0.2);
                ctx.beginPath();
                ctx.arc(0, 0, rRad, startAng, endAng);
                ctx.strokeStyle = r % 2 === 0 ? `rgba(0, 240, 255, ${rAlpha})` : `rgba(255, 0, 128, ${rAlpha})`;
                ctx.lineWidth = Math.max(0.8, (r === 2 ? 2.4 : 1.2) * s);
                ctx.shadowColor = r % 2 === 0 ? '#00f0ff' : '#ff007f';
                ctx.shadowBlur = (r === 2 ? 10 + beatPulse * 12 : 4) * s;
                ctx.stroke();
            }

            // B. Dedicated Starship Orbit Guide Track
            ctx.beginPath();
            ctx.arc(0, 0, shipOrbitR, startAng, endAng);
            ctx.strokeStyle = `rgba(0, 240, 255, ${0.28 + beatPulse * 0.28})`;
            ctx.lineWidth = Math.max(1.0, 1.5 * s);
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = (8 + beatPulse * 10) * s;
            ctx.stroke();

            // Subtle dashed telemetry harmonic guide along ship orbit
            ctx.beginPath();
            ctx.arc(0, 0, shipOrbitR, startAng, endAng);
            ctx.setLineDash([4 * s, 10 * s]);
            ctx.strokeStyle = `rgba(255, 0, 128, ${0.22 + snarePulse * 0.22})`;
            ctx.lineWidth = 1 * s;
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.restore();
        }

        // Draw relativistic lightspeed trail ribbon, beams, and warp particles
        function drawLightspeedTrail() {
            // A. Curved Tapered Warp Ribbon
            ctx.save();
            ctx.beginPath();
            for (let i = 0; i <= K; i++) {
                const pt = trailPts[i];
                const w = 3.6 * s * Math.pow(pt.u, 1.3);
                const px = pt.x + pt.nx * w;
                const py = pt.y + pt.ny * w;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            for (let i = K; i >= 0; i--) {
                const pt = trailPts[i];
                const w = 3.6 * s * Math.pow(pt.u, 1.3);
                const px = pt.x - pt.nx * w;
                const py = pt.y - pt.ny * w;
                ctx.lineTo(px, py);
            }
            ctx.closePath();
            const ribbonGrad = ctx.createLinearGradient(tailPt.x, tailPt.y, headPt.x, headPt.y);
            ribbonGrad.addColorStop(0, 'rgba(255, 0, 127, 0)');
            ribbonGrad.addColorStop(0.35, `rgba(255, 0, 127, ${0.25 + beatPulse * 0.20})`);
            ribbonGrad.addColorStop(0.70, `rgba(0, 240, 255, ${0.45 + beatPulse * 0.30})`);
            ribbonGrad.addColorStop(1, `rgba(255, 255, 255, ${0.80 + beatPulse * 0.20})`);
            ctx.fillStyle = ribbonGrad;
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = (10 + beatPulse * 16) * s;
            ctx.fill();
            ctx.restore();

            // B. Triple Ion Jet Stream Curved Lines
            // 1. Center Hyperdrive Beam
            ctx.save();
            ctx.beginPath();
            for (let i = 0; i <= K; i++) {
                const pt = trailPts[i];
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            }
            const coreGrad = ctx.createLinearGradient(tailPt.x, tailPt.y, headPt.x, headPt.y);
            coreGrad.addColorStop(0, 'rgba(255, 0, 128, 0)');
            coreGrad.addColorStop(0.35, 'rgba(255, 0, 128, 0.4)');
            coreGrad.addColorStop(0.75, '#00f0ff');
            coreGrad.addColorStop(1, '#ffffff');
            ctx.strokeStyle = coreGrad;
            ctx.lineWidth = Math.max(1.0, (2.2 + beatPulse * 1.6) * s);
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = (12 + beatPulse * 18) * s;
            ctx.stroke();
            ctx.restore();

            // 2 & 3. Port & Starboard Ion Streams
            ctx.save();
            ctx.beginPath();
            for (let i = 0; i <= K; i++) {
                const pt = trailPts[i];
                const offset = 2.4 * s * pt.u;
                const px = pt.x - pt.nx * offset;
                const py = pt.y - pt.ny * offset;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.strokeStyle = `rgba(0, 240, 255, ${0.75 + beatPulse * 0.25})`;
            ctx.lineWidth = Math.max(0.7, 1.2 * s);
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = 6 * s;
            ctx.stroke();

            ctx.beginPath();
            for (let i = 0; i <= K; i++) {
                const pt = trailPts[i];
                const offset = 2.4 * s * pt.u;
                const px = pt.x + pt.nx * offset;
                const py = pt.y + pt.ny * offset;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.strokeStyle = `rgba(0, 240, 255, ${0.75 + beatPulse * 0.25})`;
            ctx.lineWidth = Math.max(0.7, 1.2 * s);
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = 6 * s;
            ctx.stroke();
            ctx.restore();

            // C. Relativistic Warp Specks / Speed Streaks
            ctx.save();
            for (let i = 3; i < K - 1; i += 3) {
                const pt = trailPts[i];
                const sparkAlpha = Math.sin(pt.u * Math.PI) * (0.6 + beatPulse * 0.4);
                ctx.fillStyle = i % 2 === 0 ? `rgba(255, 255, 255, ${sparkAlpha})` : `rgba(0, 240, 255, ${sparkAlpha})`;
                ctx.shadowColor = '#00f0ff';
                ctx.shadowBlur = 4 * s;
                const sparkSize = (1.2 + beatPulse * 0.8) * s;
                ctx.fillRect(pt.x - sparkSize / 2, pt.y - sparkSize / 2, sparkSize, sparkSize);
            }
            ctx.restore();
        }

        // Draw Starship (sleek arrow delta explorer)
        function drawStarship() {
            ctx.save();
            ctx.translate(headPt.x, headPt.y);
            ctx.rotate(headPt.angle);

            // Twin engine nozzle plasma flares
            const nozzleGlowR = (5 + beatPulse * 10) * s;
            for (const engY of [-2.4 * s, 2.4 * s]) {
                const engGrad = ctx.createRadialGradient(-2.5 * s, engY, 0, -2.5 * s, engY, nozzleGlowR);
                engGrad.addColorStop(0, '#ffffff');
                engGrad.addColorStop(0.4, '#00f0ff');
                engGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
                ctx.fillStyle = engGrad;
                ctx.beginPath();
                ctx.arc(-2.5 * s, engY, nozzleGlowR, 0, Math.PI * 2);
                ctx.fill();
            }

            // Starship hull (sleek arrow delta explorer)
            ctx.beginPath();
            ctx.moveTo(5.5 * s, 0);                 // Needle nose
            ctx.lineTo(-3.8 * s, -4.5 * s);         // Port wingtip
            ctx.lineTo(-2.2 * s, -1.8 * s);         // Port engine mount
            ctx.lineTo(-1.2 * s, 0);                // Aft keel indent
            ctx.lineTo(-2.2 * s, 1.8 * s);          // Starboard engine mount
            ctx.lineTo(-3.8 * s, 4.5 * s);          // Starboard wingtip
            ctx.closePath();
            ctx.fillStyle = '#060b18';
            ctx.fill();
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = Math.max(1.0, 1.3 * s);
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = (6 + beatPulse * 8) * s;
            ctx.stroke();

            // Cockpit canopy luminescent glass
            ctx.beginPath();
            ctx.moveTo(2.8 * s, 0);
            ctx.lineTo(0.2 * s, -1.2 * s);
            ctx.lineTo(-0.8 * s, 0);
            ctx.lineTo(0.2 * s, 1.2 * s);
            ctx.closePath();
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 4 * s;
            ctx.fill();

            ctx.restore();
        }

        // =====================================================================
        // LAYER 1: Deep Space Void & Background Stars & Outer Lensing Ring
        // =====================================================================
        if (fidelity > 0.005) {
            ctx.save();
            ctx.globalAlpha = fidelity;

            // Deep space void disk
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#030510';
            ctx.fill();

            // Distant stars / cosmic dust motes
            for (let st = 0; st < 36; st++) {
                const stAng = (st * 137.5 * Math.PI) / 180 + eclipseRotation * 0.05;
                const stDist = hubRadius * 1.1 + ((st * 7) % Math.round(maxRadius - hubRadius * 1.2));
                const stX = Math.cos(stAng) * stDist;
                const stY = Math.sin(stAng) * stDist;
                const stSize = (st % 3 === 0 ? 1.8 : 1.0) * s;
                ctx.fillStyle = st % 2 === 0 ? 'rgba(0, 240, 255, 0.65)' : 'rgba(255, 0, 128, 0.65)';
                ctx.fillRect(stX, stY, stSize, stSize);
            }

            // Outer Gravitational Lensing Distortion Ring
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius * 0.93, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 240, 255, ${0.35 + beatPulse * 0.35})`;
            ctx.lineWidth = Math.max(1.5, 2.2 * s);
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = (12 + beatPulse * 16) * s;
            ctx.stroke();

            ctx.restore();
        }

        // =====================================================================
        // LAYER 2: Back Orbital Half (Background, Z < 0)
        //          Rendered BEFORE the planet sphere so the planet naturally
        //          and smoothly occludes the back rings, trail, and ship.
        // =====================================================================
        if (fidelity > 0.005) {
            ctx.save();
            ctx.globalAlpha = fidelity;

            // Back half of rings (ey <= 0)
            drawRingArcs(false);

            // Back portion of lightspeed trail (ey <= 2)
            ctx.save();
            ctx.rotate(orbitTilt);
            ctx.beginPath();
            ctx.rect(-maxRadius * 2, -maxRadius * 2, maxRadius * 4, maxRadius * 2 + 2);
            ctx.clip();
            ctx.rotate(-orbitTilt);
            drawLightspeedTrail();
            ctx.restore();

            // Starship (when orbiting through the back hemisphere)
            if (headPt.ey < 0) {
                drawStarship();
            }

            ctx.restore();
        }

        // =====================================================================
        // LAYER 3: Blazing Solar Corona Flare on the upper-left (Behind the planet)
        // =====================================================================
        const starOffsetDist = hubRadius * 0.48;
        const starAngle = -Math.PI * 0.72;
        const starX = Math.cos(starAngle) * starOffsetDist;
        const starY = Math.sin(starAngle) * starOffsetDist;
        const coronaR = hubRadius * (1.1 + beatPulse * 0.65 + smoothBass * 0.35);
        const coronaGrad = ctx.createRadialGradient(starX, starY, 4, starX, starY, coronaR);
        coronaGrad.addColorStop(0, '#ffffff');
        coronaGrad.addColorStop(0.2, `rgba(255, 255, 255, ${0.9 + beatPulse * 0.1})`);
        coronaGrad.addColorStop(0.35, `rgba(255, 0, 128, ${0.75 + beatPulse * 0.25})`);
        coronaGrad.addColorStop(0.65, `rgba(179, 0, 89, ${0.35 + snarePulse * 0.25})`);
        coronaGrad.addColorStop(1, 'rgba(5, 8, 20, 0)');
        ctx.fillStyle = coronaGrad;
        ctx.beginPath();
        ctx.arc(starX, starY, coronaR, 0, Math.PI * 2);
        ctx.fill();

        // =====================================================================
        // LAYER 4: Colossal Planetary Dark Sphere & Atmospheric Rim
        // =====================================================================
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, hubRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#050713';
        ctx.fill();

        // Iridescent cyan atmospheric rim light illuminated by the star
        const rimGrad = ctx.createRadialGradient(starX, starY, hubRadius * 0.85, starX, starY, hubRadius * 1.15);
        rimGrad.addColorStop(0, 'rgba(0, 240, 255, 0)');
        rimGrad.addColorStop(0.7, `rgba(0, 240, 255, ${0.45 + beatPulse * 0.40})`);
        rimGrad.addColorStop(0.95, '#00f0ff');
        rimGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
        ctx.strokeStyle = rimGrad;
        ctx.lineWidth = Math.max(1.5, (2.2 + beatPulse * 1.4) * s);
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = (8 + beatPulse * 14) * s;
        ctx.stroke();
        ctx.restore();

        // Diamond-Ring Effect: Blinding flash on strong kicks
        if (beatPulse > 0.38) {
            ctx.save();
            const dFlashX = starX + Math.cos(starAngle) * (hubRadius * 0.55);
            const dFlashY = starY + Math.sin(starAngle) * (hubRadius * 0.55);
            const dFlashR = (12 + beatPulse * 28) * s;
            const dfGrad = ctx.createRadialGradient(dFlashX, dFlashY, 0, dFlashX, dFlashY, dFlashR);
            dfGrad.addColorStop(0, '#ffffff');
            dfGrad.addColorStop(0.3, `rgba(255, 240, 200, ${beatPulse * 0.9})`);
            dfGrad.addColorStop(0.6, `rgba(255, 0, 128, ${beatPulse * 0.5})`);
            dfGrad.addColorStop(1, 'rgba(255, 0, 128, 0)');
            ctx.fillStyle = dfGrad;
            ctx.beginPath();
            ctx.arc(dFlashX, dFlashY, dFlashR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // =====================================================================
        // LAYER 5: Front Orbital Half (Foreground, Z >= 0)
        //          Rendered AFTER the planet sphere with ZERO circular cutout,
        //          so the starship and its relativistic trail fly smoothly
        //          and gloriously IN FRONT OF the planet!
        // =====================================================================
        if (fidelity > 0.005) {
            ctx.save();
            ctx.globalAlpha = fidelity;

            // Front half of rings (ey >= 0)
            drawRingArcs(true);

            // Front portion of lightspeed trail (ey >= -2)
            ctx.save();
            ctx.rotate(orbitTilt);
            ctx.beginPath();
            ctx.rect(-maxRadius * 2, -2, maxRadius * 4, maxRadius * 2 + 2);
            ctx.clip();
            ctx.rotate(-orbitTilt);
            drawLightspeedTrail();
            ctx.restore();

            // Starship (when orbiting through the front hemisphere)
            if (headPt.ey >= 0) {
                drawStarship();
            }

            ctx.restore();
        }

        ctx.restore(); // Restore platter center translation
    }

    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center EUCLID PORTAL (Image 2 Reference)
    // Golden Circular Portal Halo, floating Atlas diamond monolith, ruby crystals
    // -------------------------------------------------------------------------
    let euclidRotation = 0;
    function drawTurntableCenterEuclidPortal(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
        if (!ctx || width === 0 || height === 0) return;
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) * 0.48;
        const hubRadius = Math.min(width, height) * 0.20;
        const s = hubRadius / 54;

        if (playing) {
            euclidRotation += dt * (0.65 + beatPulse * 1.6 + smoothBass * 0.8) * fidelity;
        } else {
            euclidRotation += dt * 0.18 * fidelity;
        }

        // 1. Acoustic Shockwaves (Portal Sun-Gold & Ruby)
        if (playing && fidelity > 0.15) {
            if (beatPulse > 0.38 && Math.random() < 0.45) {
                emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * fidelity, '#fbbf24');
            } else if (snarePulse > 0.42 && Math.random() < 0.40) {
                emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.80 * fidelity, '#e11d48');
            }
        }
        for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
            const sw = turntableShockwaves[i];
            sw.r += sw.speed * dt;
            const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
            if (prog >= 1.0) { turntableShockwaves.splice(i, 1); continue; }
            const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
            ctx.save();
            ctx.strokeStyle = sw.color === '#e11d48' ? `rgba(225, 29, 72, ${currentAlpha})` : `rgba(251, 191, 36, ${currentAlpha})`;
            ctx.shadowColor = sw.color || '#fbbf24';
            ctx.shadowBlur = (8 + beatPulse * 8 * (0.35 + 0.65 * fidelity)) * s;
            ctx.lineWidth = Math.max(1.0, (2.0 + beatPulse * 1.2) * (1.0 - prog * 0.5));
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // =====================================================================
        // FULL-PLATTER EUCLID PORTAL ARCHITECTURE: 16 Chevrons & Stargate Dial Wheel
        // =====================================================================
        if (fidelity > 0.005) {
            ctx.save();
            ctx.globalAlpha = fidelity;
            ctx.translate(centerX, centerY);

            // Ancient basalt stone platter
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#041014';
            ctx.fill();

            // Outer Ancient Dial Rim (Double Gold Border)
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius * 0.94, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(251, 191, 36, ${0.45 + beatPulse * 0.45})`;
            ctx.lineWidth = Math.max(1.8, 2.5 * s);
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = (10 + beatPulse * 16) * s;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 0, maxRadius * 0.86, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(20, 184, 166, 0.35)`;
            ctx.lineWidth = Math.max(1.0, 1.4 * s);
            ctx.stroke();

            // 16 Glowing Glyph Chevrons around the perimeter
            ctx.save();
            ctx.rotate(euclidRotation * 0.3);
            const chevrons = ['✦', 'ᚱ', 'ᛟ', 'ᚦ', 'ᚷ', 'ᛞ', 'ᚲ', '✦', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛝ', 'ᛟ'];
            const activeChevron = Math.floor(((now * 0.002) % 1) * 16);
            ctx.font = `${Math.max(10, Math.round(11 * s))}px serif, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (let ch = 0; ch < 16; ch++) {
                const chAng = (ch * Math.PI * 2) / 16;
                ctx.save();
                ctx.rotate(chAng);
                ctx.translate(0, -maxRadius * 0.90);

                const isLit = (ch === activeChevron) || (beatPulse > 0.45 && ch % 2 === 0);
                if (isLit) {
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowColor = '#fbbf24';
                    ctx.shadowBlur = (14 + beatPulse * 14) * s;
                } else {
                    ctx.fillStyle = `rgba(251, 191, 36, 0.45)`;
                    ctx.shadowBlur = 0;
                }
                ctx.fillText(chevrons[ch], 0, 0);
                ctx.restore();
            }
            ctx.restore();

            // Concentric Carved Stone Dial Rings
            ctx.save();
            ctx.rotate(-euclidRotation * 0.2);
            for (let dr = 0; dr < 3; dr++) {
                const drR = hubRadius * 1.25 + dr * (maxRadius * 0.22);
                ctx.beginPath();
                ctx.arc(0, 0, drR, 0, Math.PI * 2);
                ctx.strokeStyle = dr % 2 === 0 ? `rgba(20, 184, 166, 0.22)` : `rgba(251, 191, 36, 0.25)`;
                ctx.setLineDash([Math.round(8 * s), Math.round(12 * s)]);
                ctx.stroke();
            }
            ctx.restore();
            ctx.restore();
        }

        // 2. Atmospheric Teal Hub Platter
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#061a20';
        ctx.fill();
        ctx.strokeStyle = `rgba(20, 184, 166, ${0.45 + snarePulse * 0.35})`;
        ctx.lineWidth = Math.max(1.2, 1.6 * s);
        ctx.stroke();
        ctx.restore();

        // 3. Gigantic Glowing Golden Circular Portal Halo
        const haloR = hubRadius * (0.80 + beatPulse * 0.28 + smoothBass * 0.16);
        ctx.save();
        ctx.translate(centerX, centerY);

        const haloGlow = ctx.createRadialGradient(0, 0, haloR * 0.5, 0, 0, haloR * 1.35);
        haloGlow.addColorStop(0, `rgba(251, 191, 36, ${0.12 + beatPulse * 0.20})`);
        haloGlow.addColorStop(0.65, `rgba(251, 191, 36, ${0.28 + beatPulse * 0.32})`);
        haloGlow.addColorStop(1, 'rgba(6, 26, 32, 0)');
        ctx.fillStyle = haloGlow;
        ctx.beginPath();
        ctx.arc(0, 0, haloR * 1.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.rotate(euclidRotation * 0.7 * fidelity);
        ctx.beginPath();
        ctx.arc(0, 0, haloR, 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = Math.max(1.8, (2.6 + beatPulse * 1.8) * s);
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = (12 + beatPulse * 18 * (0.35 + 0.65 * fidelity)) * s;
        ctx.stroke();

        ctx.rotate(-euclidRotation * 1.4 * fidelity);
        ctx.beginPath();
        ctx.arc(0, 0, haloR * 1.14, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(254, 240, 138, ${0.55 + snarePulse * 0.35})`;
        ctx.lineWidth = Math.max(1.0, 1.3 * s);
        ctx.setLineDash([Math.round(4 * s), Math.round(7 * s)]);
        ctx.stroke();
        ctx.restore();

        // 4. Hovering Atlas Diamond Monolith in Center of Halo
        const diamondScale = s * (1.0 + beatPulse * 0.35);
        const dw = 14 * diamondScale;
        const dh = 26 * diamondScale;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, -dh);
        ctx.lineTo(dw, 0);
        ctx.lineTo(0, dh);
        ctx.lineTo(-dw, 0);
        ctx.closePath();
        ctx.fillStyle = '#0a232b';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, -dh);
        ctx.lineTo(dw, 0);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fillStyle = `rgba(225, 29, 72, ${0.75 + beatPulse * 0.25})`;
        ctx.fill();

        ctx.strokeStyle = beatPulse > 0.4 ? '#ffffff' : '#fbbf24';
        ctx.lineWidth = Math.max(1.0, 1.4 * s);
        ctx.shadowColor = '#e11d48';
        ctx.shadowBlur = (6 + beatPulse * 10) * s;
        ctx.stroke();

        const emberR = (3 + beatPulse * 5) * s;
        ctx.beginPath();
        ctx.arc(0, 0, emberR, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 10 * s;
        ctx.fill();
        ctx.restore();

        // 5. Orbiting Mineral Ruby Fragments
        ctx.save();
        ctx.rotate(euclidRotation * 0.5 * fidelity);
        for (let m = 0; m < 5; m++) {
            const mAngle = (m * Math.PI * 2) / 5;
            const mDist = haloR * (0.65 + (m % 2) * 0.25);
            const mx = Math.cos(mAngle) * mDist;
            const my = Math.sin(mAngle) * mDist;
            ctx.save();
            ctx.translate(mx, my);
            ctx.rotate(mAngle + euclidRotation * fidelity);
            ctx.fillStyle = m % 2 === 0 ? '#e11d48' : '#fbbf24';
            ctx.shadowColor = m % 2 === 0 ? '#e11d48' : '#fbbf24';
            ctx.shadowBlur = 4 * s;
            const mSize = (2.2 + beatPulse * 1.5) * s;
            ctx.fillRect(-mSize / 2, -mSize / 2, mSize, mSize);
            ctx.restore();
        }
        ctx.restore();

        ctx.restore();
    }

    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center ALIEN PARADISE (Image 3 Reference)
    // Retro turquoise skies, floating Atlas spire, ascending beacon vapor beams
    // -------------------------------------------------------------------------
    let paradiseTime = 0;
    function drawTurntableCenterAlienParadise(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
        if (!ctx || width === 0 || height === 0) return;
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) * 0.48;
        const hubRadius = Math.min(width, height) * 0.20;
        const s = hubRadius / 54;

        if (playing) {
            paradiseTime += dt * (0.8 + beatPulse * 0.8) * fidelity;
        } else {
            paradiseTime += dt * 0.20 * fidelity;
        }

        // 1. Acoustic Shockwaves (Hot Fuchsia & Turquoise)
        if (playing && fidelity > 0.15) {
            if (beatPulse > 0.38 && Math.random() < 0.45) {
                emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * fidelity, '#ff2a70');
            } else if (snarePulse > 0.42 && Math.random() < 0.40) {
                emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.80 * fidelity, '#00ced1');
            }
        }
        for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
            const sw = turntableShockwaves[i];
            sw.r += sw.speed * dt;
            const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
            if (prog >= 1.0) { turntableShockwaves.splice(i, 1); continue; }
            const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
            ctx.save();
            ctx.strokeStyle = sw.color === '#ff2a70' ? `rgba(255, 42, 112, ${currentAlpha})` : `rgba(0, 206, 209, ${currentAlpha})`;
            ctx.shadowColor = sw.color || '#ff2a70';
            ctx.shadowBlur = (8 + beatPulse * 8 * (0.35 + 0.65 * fidelity)) * s;
            ctx.lineWidth = Math.max(1.0, (2.0 + beatPulse * 1.2) * (1.0 - prog * 0.5));
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // =====================================================================
        // FULL-PLATTER ALIEN PARADISE ARCHITECTURE: Retro-Synth Bio-Deck
        // =====================================================================
        if (fidelity > 0.005) {
            ctx.save();
            ctx.globalAlpha = fidelity;
            ctx.translate(centerX, centerY);

            // Fluorescent jungle night base
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#05181a';
            ctx.fill();

            // Outer Neon Synth Compass Ring
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius * 0.94, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 42, 112, ${0.5 + beatPulse * 0.4})`;
            ctx.lineWidth = Math.max(1.8, 2.2 * s);
            ctx.shadowColor = '#ff2a70';
            ctx.shadowBlur = (10 + beatPulse * 14) * s;
            ctx.stroke();

            // 36 Degree Calibration Ticks (Hi-Fi Tape Deck Styling)
            ctx.save();
            ctx.rotate(paradiseTime * 0.25);
            for (let t = 0; t < 36; t++) {
                const tAng = (t * Math.PI * 2) / 36;
                const isMajor = t % 3 === 0;
                const innerR = maxRadius * (isMajor ? 0.88 : 0.91);
                ctx.beginPath();
                ctx.moveTo(Math.cos(tAng) * innerR, Math.sin(tAng) * innerR);
                ctx.lineTo(Math.cos(tAng) * maxRadius * 0.93, Math.sin(tAng) * maxRadius * 0.93);
                ctx.strokeStyle = isMajor ? '#00ced1' : `rgba(255, 42, 112, 0.35)`;
                ctx.lineWidth = isMajor ? 1.8 * s : 0.9 * s;
                ctx.stroke();
            }
            ctx.restore();

            // Topographic Biosphere Elevation Rings
            ctx.save();
            ctx.rotate(-paradiseTime * 0.15);
            const topoRings = 5;
            for (let tr = 0; tr < topoRings; tr++) {
                const trRad = hubRadius * 1.2 + tr * (maxRadius * 0.15);
                ctx.beginPath();
                for (let a = 0; a <= Math.PI * 2; a += 0.15) {
                    const waveWobble = Math.sin(a * 4 + paradiseTime + tr) * (4 + beatPulse * 6) * s;
                    const dist = trRad + waveWobble;
                    const ax = Math.cos(a) * dist;
                    const ay = Math.sin(a) * dist;
                    if (a === 0) ctx.moveTo(ax, ay);
                    else ctx.lineTo(ax, ay);
                }
                ctx.closePath();
                ctx.strokeStyle = tr % 2 === 0 ? `rgba(0, 206, 209, ${0.18 + snarePulse * 0.25})` : `rgba(250, 204, 21, 0.18)`;
                ctx.lineWidth = Math.max(0.8, 1.2 * s);
                ctx.stroke();
            }
            ctx.restore();
            ctx.restore();
        }

        // 2. Retro Turquoise Sky Hub
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#0a2527';
        ctx.fill();
        ctx.strokeStyle = `rgba(0, 206, 209, ${0.45 + snarePulse * 0.35})`;
        ctx.lineWidth = Math.max(1.2, 1.6 * s);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.translate(centerX, centerY);

        // 3. Huge Glowing White Horizon Arch in Background (from Image 3)
        const archR = hubRadius * 0.82;
        ctx.beginPath();
        ctx.arc(0, hubRadius * 0.32, archR, Math.PI * 1.05, -Math.PI * 0.05);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 + beatPulse * 0.45})`;
        ctx.lineWidth = Math.max(2.0, (3.2 + beatPulse * 2.0) * s);
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = (8 + beatPulse * 12) * s;
        ctx.stroke();

        // 4. Ascending Rocket Vapor Light Trails (Shooting straight up into the sky)
        const numBeacons = 5;
        for (let b = 0; b < numBeacons; b++) {
            const bx = (b - 2) * (hubRadius * 0.35);
            const beaconEnergy = b === 2 ? beatPulse : (b % 2 === 0 ? snarePulse : smoothTreble);
            const bHeight = hubRadius * (0.60 + beaconEnergy * 0.65);
            ctx.beginPath();
            ctx.moveTo(bx, hubRadius * 0.4);
            ctx.lineTo(bx, hubRadius * 0.4 - bHeight);
            ctx.strokeStyle = b === 2 ? '#ffffff' : `rgba(0, 206, 209, ${0.4 + beaconEnergy * 0.5})`;
            ctx.lineWidth = Math.max(0.8, (b === 2 ? 1.8 : 1.1) * s);
            ctx.shadowColor = b === 2 ? '#ffffff' : '#00ced1';
            ctx.shadowBlur = 6 * s;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(bx, hubRadius * 0.4 - bHeight, (1.6 + beaconEnergy * 1.6) * s, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }

        // 5. Floating Retro Turquoise Atlas Spire with Ember Eye (Hovering in Center)
        const spireScale = s * (1.0 + beatPulse * 0.32);
        const sw = 13 * spireScale;
        const sh = 28 * spireScale;
        const floatOffset = Math.sin(paradiseTime * 2.0) * 3 * s;

        ctx.save();
        ctx.translate(0, -hubRadius * 0.12 + floatOffset);

        ctx.beginPath();
        ctx.moveTo(0, -sh);
        ctx.lineTo(sw, 0);
        ctx.lineTo(0, sh);
        ctx.lineTo(-sw, 0);
        ctx.closePath();
        ctx.fillStyle = '#134e4a';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, -sh);
        ctx.lineTo(0, sh);
        ctx.lineTo(-sw, 0);
        ctx.closePath();
        ctx.fillStyle = `rgba(0, 206, 209, ${0.65 + snarePulse * 0.25})`;
        ctx.fill();

        ctx.strokeStyle = beatPulse > 0.4 ? '#ffffff' : '#00ced1';
        ctx.lineWidth = Math.max(1.0, 1.4 * s);
        ctx.shadowColor = '#00ced1';
        ctx.shadowBlur = (8 + beatPulse * 12) * s;
        ctx.stroke();

        const emberR = (4 + beatPulse * 6) * s;
        const emberGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, emberR);
        emberGrad.addColorStop(0, '#ffffff');
        emberGrad.addColorStop(0.35, '#ff2a70');
        emberGrad.addColorStop(1, 'rgba(255, 42, 112, 0)');
        ctx.fillStyle = emberGrad;
        ctx.beginPath();
        ctx.arc(0, 0, emberR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 6. Swirling Golden Canopy Spores / Flora Pollen
        for (let p = 0; p < 6; p++) {
            const pAngle = paradiseTime * 1.2 + (p * Math.PI * 2) / 6;
            const pDist = hubRadius * (0.65 + Math.sin(paradiseTime * 2.0 + p) * 0.20);
            const px = Math.cos(pAngle) * pDist;
            const py = Math.sin(pAngle) * pDist * 0.6 + hubRadius * 0.15;
            ctx.fillStyle = p % 2 === 0 ? '#facc15' : '#ff2a70';
            ctx.shadowColor = p % 2 === 0 ? '#facc15' : '#ff2a70';
            ctx.shadowBlur = 4 * s;
            ctx.beginPath();
            ctx.arc(px, py, (1.8 + beatPulse * 1.2) * s, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center ABYSSAL VOID (Image 4 Reference)
    // Radiant emerald crescent, colossal gas giant silhouette, twin sub-light trails
    // -------------------------------------------------------------------------

    // Attach visualizer theme drawing routines to window
    if (typeof window !== "undefined") {
        try { window.atlasLuminance = atlasLuminance; } catch (_) {}
        try { window.atlasRotationAngle = atlasRotationAngle; } catch (_) {}
        try { window.atlasPrecessionAngle = atlasPrecessionAngle; } catch (_) {}
        try { window.drawTurntableCenterAlienParadise = drawTurntableCenterAlienParadise; } catch (_) {}
        try { window.drawTurntableCenterAtlasCore = drawTurntableCenterAtlasCore; } catch (_) {}
        try { window.drawTurntableCenterEuclidPortal = drawTurntableCenterEuclidPortal; } catch (_) {}
        try { window.drawTurntableCenterSolarEclipse = drawTurntableCenterSolarEclipse; } catch (_) {}
        try { window.eclipseRotation = eclipseRotation; } catch (_) {}
        try { window.euclidRotation = euclidRotation; } catch (_) {}
        try { window.paradiseTime = paradiseTime; } catch (_) {}
    }



    // --- Sub-Module: visualizer-themes-2.js ---
// CachyMusic - Turntable Center Visualizers (Abyssal Void, Dissonance, Sentinel, Heart, Brutalist, Touhou)
    let abyssalTime = 0;
    function drawTurntableCenterAbyssalVoid(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
        if (!ctx || width === 0 || height === 0) return;
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) * 0.48;
        const hubRadius = Math.min(width, height) * 0.20;
        const s = hubRadius / 54;

        if (playing) {
            abyssalTime += dt * (0.8 + beatPulse * 0.8) * fidelity;
        } else {
            abyssalTime += dt * 0.20 * fidelity;
        }

        // 1. Acoustic Shockwaves (Radiant Emerald)
        if (playing && beatPulse > 0.38 && fidelity > 0.15) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * fidelity, '#00ffaa');
        }
        for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
            const sw = turntableShockwaves[i];
            sw.r += sw.speed * dt;
            const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
            if (prog >= 1.0) { turntableShockwaves.splice(i, 1); continue; }
            const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
            ctx.save();
            ctx.strokeStyle = `rgba(0, 255, 170, ${currentAlpha})`;
            ctx.shadowColor = '#00ffaa';
            ctx.shadowBlur = (8 + beatPulse * 8 * (0.35 + 0.65 * fidelity)) * s;
            ctx.lineWidth = Math.max(1.0, (2.0 + beatPulse * 1.2) * (1.0 - prog * 0.5));
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // =====================================================================
        // FULL-PLATTER ABYSSAL VOID ARCHITECTURE: Naval Sonar Scope Console
        // =====================================================================
        if (fidelity > 0.005) {
            ctx.save();
            ctx.globalAlpha = fidelity;
            ctx.translate(centerX, centerY);

            // Dark deep trench sonar cathode disk
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#010a0c';
            ctx.fill();

            // Outer Azimuth Compass Ring (000° to 359°)
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius * 0.94, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 255, 170, ${0.5 + beatPulse * 0.45})`;
            ctx.lineWidth = Math.max(1.8, 2.4 * s);
            ctx.shadowColor = '#00ffaa';
            ctx.shadowBlur = (10 + beatPulse * 16) * s;
            ctx.stroke();

            // 36 Compass Degree Tick Marks
            for (let c = 0; c < 36; c++) {
                const cAng = (c * Math.PI * 2) / 36;
                const isCardinal = c % 9 === 0;
                const isMajor = c % 3 === 0;
                const cInner = maxRadius * (isCardinal ? 0.86 : (isMajor ? 0.89 : 0.91));
                ctx.beginPath();
                ctx.moveTo(Math.cos(cAng) * cInner, Math.sin(cAng) * cInner);
                ctx.lineTo(Math.cos(cAng) * maxRadius * 0.93, Math.sin(cAng) * maxRadius * 0.93);
                ctx.strokeStyle = isCardinal ? '#00ffaa' : `rgba(0, 255, 170, 0.35)`;
                ctx.lineWidth = isCardinal ? 2.0 * s : 1.0 * s;
                ctx.stroke();
            }

            // Cardinal Degree Text: 000°, 090°, 180°, 270°
            ctx.font = `${Math.max(9, Math.round(8 * s))}px monospace`;
            ctx.fillStyle = `rgba(0, 255, 170, 0.85)`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const cardinals = ['000° N', '090° E', '180° S', '270° W'];
            for (let cd = 0; cd < 4; cd++) {
                const cdAng = (cd * Math.PI) / 2;
                ctx.save();
                ctx.rotate(cdAng);
                ctx.translate(0, -maxRadius * 0.82);
                ctx.fillText(cardinals[cd], 0, 0);
                ctx.restore();
            }

            // Concentric Distance Range Rings (100M, 250M, 500M)
            const rangeRings = [hubRadius * 1.3, hubRadius * 1.8, maxRadius * 0.72];
            const rangeLabels = ['100M', '250M', '500M'];
            for (let rg = 0; rg < rangeRings.length; rg++) {
                ctx.beginPath();
                ctx.arc(0, 0, rangeRings[rg], 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(0, 255, 170, 0.22)`;
                ctx.lineWidth = 0.9 * s;
                ctx.setLineDash([Math.round(4 * s), Math.round(6 * s)]);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = `rgba(0, 255, 170, 0.5)`;
                ctx.fillText(rangeLabels[rg], rangeRings[rg] - 14 * s, -4 * s);
            }

            // Tactical Crosshairs (North-South & East-West)
            ctx.beginPath();
            ctx.moveTo(-maxRadius * 0.92, 0);
            ctx.lineTo(maxRadius * 0.92, 0);
            ctx.moveTo(0, -maxRadius * 0.92);
            ctx.lineTo(0, maxRadius * 0.92);
            ctx.strokeStyle = `rgba(0, 255, 170, 0.15)`;
            ctx.lineWidth = 0.8 * s;
            ctx.stroke();

            // Active 360° Rotating Radar Sweep Line across the entire platter!
            const sweepAngle = abyssalTime * 1.8;
            ctx.save();
            ctx.rotate(sweepAngle);
            // Phosphor Persistence Cone (Fading sector behind sweep line)
            const sweepGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius * 0.92);
            sweepGrad.addColorStop(0, 'rgba(0, 255, 170, 0.45)');
            sweepGrad.addColorStop(1, 'rgba(0, 255, 170, 0.08)');
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, maxRadius * 0.92, -0.45, 0);
            ctx.closePath();
            ctx.fillStyle = sweepGrad;
            ctx.fill();

            // Main Sweep Laser Line
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(maxRadius * 0.93, 0);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1.2, 1.8 * s);
            ctx.shadowColor = '#00ffaa';
            ctx.shadowBlur = 12 * s;
            ctx.stroke();
            ctx.restore();

            ctx.restore();
        }

        // 2. Cosmic Void Background Hub
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#020707';
        ctx.fill();
        ctx.strokeStyle = `rgba(16, 185, 129, ${0.35 + snarePulse * 0.35})`;
        ctx.lineWidth = Math.max(1.2, 1.6 * s);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.translate(centerX, centerY);

        // 3. Radiant Emerald Crescent Glow in Upper-Right (Illuminating the Gas Giant)
        const crescentAngle = Math.PI * 0.25;
        const crescentDist = hubRadius * 0.25;
        const cx = Math.cos(crescentAngle) * crescentDist;
        const cy = -Math.sin(crescentAngle) * crescentDist;

        const crescentR = hubRadius * (0.88 + beatPulse * 0.32 + smoothBass * 0.18);
        const glowGrad = ctx.createRadialGradient(cx, cy, crescentR * 0.4, cx, cy, crescentR * 1.4);
        glowGrad.addColorStop(0, `rgba(0, 255, 170, ${0.45 + beatPulse * 0.45})`);
        glowGrad.addColorStop(0.4, `rgba(16, 185, 129, ${0.28 + beatPulse * 0.25})`);
        glowGrad.addColorStop(0.8, `rgba(5, 150, 105, ${0.10 + snarePulse * 0.15})`);
        glowGrad.addColorStop(1, 'rgba(2, 7, 7, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, crescentR * 1.4, 0, Math.PI * 2);
        ctx.fill();

        // 4. Distant Giant Gas Planet Silhouette with Radiant Rim Arc
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, crescentR, -Math.PI * 0.65, Math.PI * 0.35);
        ctx.strokeStyle = beatPulse > 0.4 ? '#ffffff' : '#00ffaa';
        ctx.lineWidth = Math.max(2.0, (2.8 + beatPulse * 2.0) * s);
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = (14 + beatPulse * 20) * s;
        ctx.stroke();
        ctx.restore();

        // 5. Silhouetted Moon Disc on the Crescent Rim (from Image 4)
        const moonR = hubRadius * 0.18;
        const moonX = cx - crescentR * 0.35;
        const moonY = cy + crescentR * 0.35;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.fillStyle = '#020707';
        ctx.fill();
        ctx.strokeStyle = `rgba(0, 255, 170, ${0.5 + beatPulse * 0.4})`;
        ctx.lineWidth = 1 * s;
        ctx.stroke();

        // 6. Colossal Foreground Planet Rim (Blocking the lower-left)
        ctx.beginPath();
        ctx.arc(-hubRadius * 0.6, hubRadius * 0.6, hubRadius * 1.1, -Math.PI * 0.5, Math.PI * 0.5);
        ctx.fillStyle = '#020707';
        ctx.fill();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();

        // 7. Twin Luminous Starlight Sub-Light Engine Trails (Cutting diagonally across the horizon)
        const trailAngle = -Math.PI * 0.28;
        const trailStartX = -hubRadius * 0.9;
        const trailStartY = hubRadius * 0.7;
        const trailLen = hubRadius * (1.6 + beatPulse * 0.6);
        const endX = trailStartX + Math.cos(trailAngle) * trailLen;
        const endY = trailStartY + Math.sin(trailAngle) * trailLen;

        ctx.save();
        for (let t = -1; t <= 1; t += 2) {
            const offset = t * 2.2 * s;
            const perpAngle = trailAngle + Math.PI / 2;
            const ox = Math.cos(perpAngle) * offset;
            const oy = Math.sin(perpAngle) * offset;

            ctx.beginPath();
            ctx.moveTo(trailStartX + ox, trailStartY + oy);
            ctx.lineTo(endX + ox, endY + oy);
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 + snarePulse * 0.3})`;
            ctx.lineWidth = Math.max(0.8, (1.2 + beatPulse * 0.8) * s);
            ctx.shadowColor = '#00ffaa';
            ctx.shadowBlur = (6 + beatPulse * 8) * s;
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(endX, endY, (2.2 + beatPulse * 1.5) * s, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = 10 * s;
        ctx.fill();
        ctx.restore();

        ctx.restore();
    }

    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center DISSONANCE (No Man's Sky Interceptor)
    // Luminous Atlantideum violet crystals, Dissonance Resonator core,
    // Corrupted Sentinel scanning HUD, inverted mirror runes & purple haze
    // -------------------------------------------------------------------------
    let dissonanceTime = 0;
    function drawTurntableCenterDissonance(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0, bands = null) {
        if (!ctx || width === 0 || height === 0) return;
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) * 0.48;
        const hubRadius = Math.min(width, height) * 0.20;
        const s = hubRadius / 54;

        if (playing) {
            dissonanceTime += dt * (0.85 + beatPulse * 1.2 + smoothBass * 0.6) * Math.max(0.4, fidelity);
        } else {
            dissonanceTime += dt * 0.22 * Math.max(0.4, fidelity);
        }

        // Chromatic glitch displacement on heavy transient kicks & snares
        const isGlitching = playing && (beatPulse > 0.52 || snarePulse > 0.58) && Math.random() < 0.40;
        const jitterX = isGlitching ? (Math.random() - 0.5) * 3.5 * s : 0;
        const jitterY = isGlitching ? (Math.random() - 0.5) * 3.5 * s : 0;

        // 1. Acoustic Shockwaves (Luminous Atlantideum Violet & Radiant Fuchsia with Hexagonal Geometry)
        if (playing && fidelity > 0.15) {
            if (beatPulse > 0.38 && Math.random() < 0.45) {
                emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * fidelity, '#d946ef');
            } else if (snarePulse > 0.42 && Math.random() < 0.40) {
                emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.80 * fidelity, '#a855f7');
            }
        }
        for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
            const sw = turntableShockwaves[i];
            sw.r += sw.speed * dt;
            const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
            if (prog >= 1.0) { turntableShockwaves.splice(i, 1); continue; }
            const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
            ctx.save();
            ctx.strokeStyle = sw.color === '#d946ef' ? `rgba(217, 70, 239, ${currentAlpha})` : `rgba(168, 85, 247, ${currentAlpha})`;
            ctx.shadowColor = sw.color || '#d946ef';
            ctx.shadowBlur = (10 + beatPulse * 10 * (0.35 + 0.65 * fidelity)) * s;
            ctx.lineWidth = Math.max(1.0, (2.2 + beatPulse * 1.5) * (1.0 - prog * 0.5));
            ctx.beginPath();
            const sides = 6;
            for (let side = 0; side < sides; side++) {
                const sang = (side * Math.PI * 2) / sides + dissonanceTime * 0.15;
                const sx = sw.x + Math.cos(sang) * sw.r;
                const sy = sw.y + Math.sin(sang) * sw.r;
                if (side === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        }

        // =====================================================================
        // FULL-PLATTER DISSONANCE ARCHITECTURE: Corrupted Planetary Scanner
        // =====================================================================
        if (fidelity > 0.005) {
            ctx.save();
            ctx.globalAlpha = fidelity;
            ctx.translate(centerX + jitterX, centerY + jitterY);

            // Dark corrupted twilight void disk
            const voidGrad = ctx.createRadialGradient(0, 0, hubRadius * 0.8, 0, 0, maxRadius);
            voidGrad.addColorStop(0, '#0f031c');
            voidGrad.addColorStop(0.45, '#06010d');
            voidGrad.addColorStop(0.85, '#030006');
            voidGrad.addColorStop(1, '#000000');
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
            ctx.fillStyle = voidGrad;
            ctx.fill();

            // Atmospheric purple haze ring
            const hazeGrad = ctx.createRadialGradient(0, 0, hubRadius * 0.9, 0, 0, maxRadius);
            hazeGrad.addColorStop(0, `rgba(168, 85, 247, ${0.22 + smoothBass * 0.15})`);
            hazeGrad.addColorStop(0.5, `rgba(217, 70, 239, ${0.14 + snarePulse * 0.10})`);
            hazeGrad.addColorStop(1, 'rgba(3, 0, 6, 0)');
            ctx.fillStyle = hazeGrad;
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
            ctx.fill();

            // Corrupted Vinyl Grooves (Micro-rings with harmonic audio breathing)
            ctx.save();
            ctx.lineWidth = 0.6 * s;
            for (let g = 1; g <= 6; g++) {
                const gr = hubRadius + (maxRadius - hubRadius) * (g / 7);
                const gAlpha = 0.08 + Math.sin(dissonanceTime * 1.5 + g) * 0.04 + (g % 2 === 0 ? smoothBass * 0.08 : 0);
                ctx.strokeStyle = g % 2 === 0 ? `rgba(217, 70, 239, ${gAlpha})` : `rgba(168, 85, 247, ${gAlpha})`;
                ctx.beginPath();
                ctx.arc(0, 0, gr, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();

            // Outer Corrupted Perimeter Ring with Hot Neon Edge
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius * 0.95, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(217, 70, 239, ${0.55 + beatPulse * 0.45})`;
            ctx.lineWidth = Math.max(1.8, 2.2 * s);
            ctx.shadowColor = '#d946ef';
            ctx.shadowBlur = (12 + beatPulse * 16) * s;
            ctx.stroke();

            // -----------------------------------------------------------------
            // CIRCULAR DISSONANCE HARMONIC RESONATOR EQUALIZER (48 Radial Spires)
            // -----------------------------------------------------------------
            ctx.save();
            const numSpires = 48;
            const eqInnerR = hubRadius * 1.32;
            const eqMaxSpireLen = (maxRadius * 0.76 - eqInnerR);
            ctx.rotate(dissonanceTime * 0.12);

            for (let sp = 0; sp < numSpires; sp++) {
                const ang = (sp * Math.PI * 2) / numSpires;
                let val = 0;
                if (bands && bands.length > 0) {
                    const bIdx = Math.floor((sp / numSpires) * bands.length);
                    val = bands[bIdx] || 0;
                } else {
                    const waveHarmonic = Math.sin(sp * 0.35 + dissonanceTime * 2.8) * 0.5 + 0.5;
                    val = playing ? (waveHarmonic * (0.35 + smoothBass * 0.45 + (sp % 4 === 0 ? beatPulse * 0.4 : 0))) : (Math.sin(sp * 0.28 + dissonanceTime) * 0.12 + 0.14);
                }
                const spireLen = Math.max(2.5 * s, val * eqMaxSpireLen * (0.85 + beatPulse * 0.35));
                const x1 = Math.cos(ang) * eqInnerR;
                const y1 = Math.sin(ang) * eqInnerR;
                const x2 = Math.cos(ang) * (eqInnerR + spireLen);
                const y2 = Math.sin(ang) * (eqInnerR + spireLen);

                const isHighSpire = val > 0.45 || (sp % 6 === 0);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = isHighSpire ? '#fae8ff' : (sp % 2 === 0 ? '#d946ef' : 'rgba(168, 85, 247, 0.7)');
                ctx.lineWidth = Math.max(1.0, (isHighSpire ? 2.2 : 1.4) * s);
                if (isHighSpire) {
                    ctx.shadowColor = '#d946ef';
                    ctx.shadowBlur = (6 + beatPulse * 8) * s;
                } else {
                    ctx.shadowBlur = 0;
                }
                ctx.stroke();

                if (val > 0.38) {
                    const tipR = (1.4 + beatPulse * 1.2) * s;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(x2 - tipR / 2, y2 - tipR / 2, tipR, tipR);
                }
            }
            ctx.restore();

            // 36 Degree Calibration Ticks (Corrupted Sentinel Telemetry)
            ctx.save();
            ctx.rotate(-dissonanceTime * 0.18);
            for (let t = 0; t < 36; t++) {
                const tAng = (t * Math.PI * 2) / 36;
                const isMajor = t % 3 === 0;
                const isCardinal = t % 9 === 0;
                const innerR = maxRadius * (isCardinal ? 0.85 : (isMajor ? 0.89 : 0.91));
                ctx.beginPath();
                ctx.moveTo(Math.cos(tAng) * innerR, Math.sin(tAng) * innerR);
                ctx.lineTo(Math.cos(tAng) * maxRadius * 0.94, Math.sin(tAng) * maxRadius * 0.94);
                ctx.strokeStyle = isCardinal ? '#d946ef' : (isMajor ? '#a855f7' : 'rgba(168, 85, 247, 0.35)');
                ctx.lineWidth = isCardinal ? 2.2 * s : (isMajor ? 1.4 * s : 0.8 * s);
                ctx.stroke();

                // Inverted Mirror Diamonds at the 4 cardinal positions
                if (isCardinal) {
                    const imR = maxRadius * 0.83;
                    const imX = Math.cos(tAng) * imR;
                    const imY = Math.sin(tAng) * imR;
                    const dSize = 3.5 * s;
                    ctx.save();
                    ctx.translate(imX, imY);
                    ctx.rotate(tAng);
                    ctx.beginPath();
                    ctx.moveTo(0, -dSize);
                    ctx.lineTo(dSize * 0.7, 0);
                    ctx.lineTo(0, dSize);
                    ctx.lineTo(-dSize * 0.7, 0);
                    ctx.closePath();
                    ctx.fillStyle = '#fae8ff';
                    ctx.shadowColor = '#d946ef';
                    ctx.shadowBlur = 6 * s;
                    ctx.fill();
                    ctx.restore();
                }
            }
            ctx.restore();

            // Corrupted Telemetry Glyphs: 16 // ECHO // DISSONANCE // ATLANTIDEUM
            ctx.font = `600 ${Math.max(9, Math.round(7.5 * s))}px "JetBrains Mono", monospace`;
            ctx.fillStyle = 'rgba(217, 70, 239, 0.9)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#d946ef';
            ctx.shadowBlur = 4 * s;
            const glyphs = ['16.16.16.16', 'ECHO // SEED', 'ATLANTIDEUM', 'NULL // VOID'];
            for (let g = 0; g < 4; g++) {
                const gAng = (g * Math.PI) / 2 + dissonanceTime * 0.05;
                ctx.save();
                ctx.rotate(gAng);
                ctx.translate(0, -maxRadius * 0.82);
                ctx.fillText(glyphs[g], 0, 0);
                ctx.restore();
            }

            // Concentric Guidance Rings (Echo Locator Grid)
            const locatorRings = [hubRadius * 1.30, maxRadius * 0.77];
            for (let lr = 0; lr < locatorRings.length; lr++) {
                ctx.beginPath();
                ctx.arc(0, 0, locatorRings[lr], 0, Math.PI * 2);
                ctx.strokeStyle = lr === 0 ? `rgba(217, 70, 239, ${0.32 + snarePulse * 0.25})` : 'rgba(168, 85, 247, 0.22)';
                ctx.lineWidth = 0.9 * s;
                ctx.setLineDash([Math.round(4 * s), Math.round(6 * s)]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Rotating Corrupted Sentinel Scanner Sweep with Dual Lasers
            const sweepAngle = dissonanceTime * 1.5;
            ctx.save();
            ctx.rotate(sweepAngle);
            const sweepGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius * 0.94);
            sweepGrad.addColorStop(0, `rgba(217, 70, 239, ${0.48 + beatPulse * 0.25})`);
            sweepGrad.addColorStop(0.6, 'rgba(168, 85, 247, 0.15)');
            sweepGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, maxRadius * 0.94, -0.42, 0);
            ctx.closePath();
            ctx.fillStyle = sweepGrad;
            ctx.fill();

            // Lead Laser Needles (Dual focused beams)
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(maxRadius * 0.94, 0);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1.4, 2.0 * s);
            ctx.shadowColor = '#d946ef';
            ctx.shadowBlur = 10 * s;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(maxRadius * 0.93 * Math.cos(-0.06), maxRadius * 0.93 * Math.sin(-0.06));
            ctx.strokeStyle = 'rgba(217, 70, 239, 0.85)';
            ctx.lineWidth = Math.max(0.8, 1.2 * s);
            ctx.stroke();
            ctx.restore();

            // Floating Atlantideum Spore Motes in Space
            for (let m = 0; m < 24; m++) {
                const mAng = (m * 15.0 * Math.PI) / 180 + dissonanceTime * 0.08;
                const mDist = hubRadius * 1.15 + ((m * 13) % Math.round(maxRadius * 0.85 - hubRadius));
                const mx = Math.cos(mAng) * mDist;
                const my = Math.sin(mAng) * mDist;
                const mSize = (m % 3 === 0 ? 2.2 : 1.3) * s;
                ctx.fillStyle = m % 2 === 0 ? '#d946ef' : '#c084fc';
                ctx.shadowColor = '#d946ef';
                ctx.shadowBlur = 6 * s;
                ctx.fillRect(mx - mSize / 2, my - mSize / 2, mSize, mSize);
            }

            ctx.restore();
        }

        // =====================================================================
        // 2. CENTER HUB DISK: Deep Obsidian Void with Armored Hexagonal Rim
        // =====================================================================
        ctx.save();
        ctx.translate(centerX + jitterX, centerY + jitterY);

        ctx.beginPath();
        ctx.arc(0, 0, hubRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0214';
        ctx.fill();
        ctx.strokeStyle = `rgba(217, 70, 239, ${0.55 + snarePulse * 0.35})`;
        ctx.lineWidth = Math.max(1.5, 2.0 * s);
        ctx.shadowColor = '#d946ef';
        ctx.shadowBlur = (10 + beatPulse * 12) * s;
        ctx.stroke();

        // Harmonic Concentric Frequency Ring inside Hub
        const hubRingR = hubRadius * (0.82 + smoothBass * 0.12);
        ctx.beginPath();
        ctx.arc(0, 0, hubRingR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(168, 85, 247, ${0.35 + beatPulse * 0.35})`;
        ctx.lineWidth = 1.0 * s;
        ctx.setLineDash([Math.round(3 * s), Math.round(4 * s)]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Hexagonal Corrupted Sentinel Armored Base Plate
        const hexR = hubRadius * 0.72;
        ctx.beginPath();
        for (let h = 0; h < 6; h++) {
            const hAng = (h * Math.PI) / 3 - Math.PI / 6;
            const hx = Math.cos(hAng) * hexR;
            const hy = Math.sin(hAng) * hexR;
            if (h === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fillStyle = '#140526';
        ctx.fill();
        ctx.strokeStyle = `rgba(168, 85, 247, ${0.50 + beatPulse * 0.40})`;
        ctx.lineWidth = Math.max(1.0, 1.4 * s);
        ctx.stroke();

        // =====================================================================
        // 3. CENTRAL ATLANTIDEUM CRYSTAL CLUSTER: 5-PIECE RADIANT SHARDS
        // =====================================================================
        // Dynamic anti-gravity hover & transient vertical expansion
        const floatBob = playing ? Math.sin(dissonanceTime * 2.4) * (3.0 * s * fidelity) : Math.sin(dissonanceTime * 1.2) * (1.2 * s);
        const recoilY = playing ? (-beatPulse * 4.0 * s) : 0;
        ctx.translate(0, floatBob + recoilY);

        // Radiant core aura
        const coreGlowR = hubRadius * (0.65 + beatPulse * 0.45);
        const coreGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, coreGlowR);
        coreGlow.addColorStop(0, `rgba(217, 70, 239, ${0.60 + beatPulse * 0.40})`);
        coreGlow.addColorStop(0.5, `rgba(168, 85, 247, ${0.30 + smoothBass * 0.30})`);
        coreGlow.addColorStop(1, 'rgba(10, 2, 20, 0)');
        ctx.fillStyle = coreGlow;
        ctx.beginPath();
        ctx.arc(0, 0, coreGlowR, 0, Math.PI * 2);
        ctx.fill();

        const crystalScale = s * (1.0 + beatPulse * 0.25);

        // Helper: Draw a faceted Atlantideum Shard Diamond
        function drawRadiantShard(cx, cy, w, hTop, hBottom, rot, gradTop, gradBottom, glowColor, strokeColor) {
            ctx.save();
            ctx.translate(cx, cy);
            if (rot !== 0) ctx.rotate(rot);

            ctx.beginPath();
            ctx.moveTo(0, -hTop);
            ctx.lineTo(w, 0);
            ctx.lineTo(0, hBottom);
            ctx.lineTo(-w, 0);
            ctx.closePath();

            const grad = ctx.createLinearGradient(0, -hTop, 0, hBottom);
            grad.addColorStop(0, gradTop);
            grad.addColorStop(0.35, '#d946ef');
            grad.addColorStop(0.75, '#7e22ce');
            grad.addColorStop(1, gradBottom);
            ctx.fillStyle = grad;
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = (10 + beatPulse * 16) * s;
            ctx.fill();

            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = Math.max(0.8, 1.0 * s);
            ctx.stroke();

            // Facet reflection spine
            ctx.beginPath();
            ctx.moveTo(0, -hTop);
            ctx.lineTo(0, hBottom);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 0.8 * s;
            ctx.stroke();

            ctx.restore();
        }

        // Outer Left Wing Shard (Smallest)
        drawRadiantShard(-18 * crystalScale, 4 * crystalScale, 3.8 * crystalScale, 13 * crystalScale, 11 * crystalScale, -0.55, '#f5d0fe', '#3b0764', '#a855f7', '#e9d5ff');

        // Outer Right Wing Shard (Smallest)
        drawRadiantShard(18 * crystalScale, 4 * crystalScale, 3.8 * crystalScale, 13 * crystalScale, 11 * crystalScale, 0.55, '#f5d0fe', '#3b0764', '#a855f7', '#e9d5ff');

        // Flanking Left Vanguard Shard
        drawRadiantShard(-10 * crystalScale, 1 * crystalScale, 5.5 * crystalScale, 20 * crystalScale, 16 * crystalScale, -0.28, '#fae8ff', '#4a044e', '#d946ef', '#ffffff');

        // Flanking Right Vanguard Shard
        drawRadiantShard(10 * crystalScale, 1 * crystalScale, 5.5 * crystalScale, 20 * crystalScale, 16 * crystalScale, 0.28, '#fae8ff', '#4a044e', '#d946ef', '#ffffff');

        // Central Prime Radiant Spire (Towering Obelisk)
        drawRadiantShard(0, -2 * crystalScale, 8.5 * crystalScale, 28 * crystalScale, 24 * crystalScale, 0, '#ffffff', '#2e0249', '#d946ef', '#ffffff');

        // ---------------------------------------------------------------------
        // 3 ORBITING INVERTED MIRROR SATELLITES (Cosmic Dissonance Collector Shards)
        // ---------------------------------------------------------------------
        for (let sat = 0; sat < 3; sat++) {
            const satAng = dissonanceTime * 0.8 + (sat * Math.PI * 2) / 3;
            const satDistX = hubRadius * 0.78 * Math.cos(satAng);
            const satDistY = hubRadius * 0.44 * Math.sin(satAng); // Elliptical 3D tilt

            ctx.save();
            ctx.translate(satDistX, satDistY);
            const satSize = 2.8 * s;
            ctx.beginPath();
            ctx.moveTo(0, -satSize);
            ctx.lineTo(satSize * 0.7, 0);
            ctx.lineTo(0, satSize);
            ctx.lineTo(-satSize * 0.7, 0);
            ctx.closePath();
            ctx.fillStyle = sat % 2 === 0 ? '#fae8ff' : '#d946ef';
            ctx.shadowColor = '#d946ef';
            ctx.shadowBlur = (8 + beatPulse * 8) * s;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.6 * s;
            ctx.stroke();

            // Subtle energy tether arc back to center
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-satDistX * 0.35, -satDistY * 0.35);
            ctx.strokeStyle = `rgba(217, 70, 239, ${0.25 + beatPulse * 0.25})`;
            ctx.lineWidth = 0.6 * s;
            ctx.stroke();

            ctx.restore();
        }

        ctx.restore();
    }

    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center Sentinel Defense Nexus (No Man's Sky)
    // High-fidelity Aeron Enforcer Centerpiece: Volumetric atmospheric aura, 64-ray
    // dense laser frequency horizon, counter-rotating gyroscopic telemetry rings,
    // integrated holographic Wanted HUD arc, tactical radar with combat alert flare,
    // 32 floating 3D ion embers, and an articulated 3D-shaded Aeron Drone with
    // ceramic armor plates, flaring wing cowlings, exposed glowing heatsinks,
    // dual ion thrusters, and a convex multi-aperture cyclops eye.
    // -------------------------------------------------------------------------
    let sentinelTime = 0;
    function drawTurntableCenterSentinel(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0, bands = null) {
        if (!ctx || width === 0 || height === 0) return;
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) * 0.48;
        const hubRadius = Math.min(width, height) * 0.21;
        const s = hubRadius / 54;

        if (playing) {
            sentinelTime += dt * (0.85 + beatPulse * 0.85) * fidelity;
        } else {
            sentinelTime += dt * 0.20 * fidelity;
        }

        const isCombat = playing && (beatPulse > 0.38);

        // 1. Acoustic Shockwaves (Aeron Patrol Cyan & Alert Crimson)
        if (playing && fidelity > 0.15) {
            if (beatPulse > 0.38 && Math.random() < 0.45) {
                emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * fidelity, '#ff2a00');
            } else if (snarePulse > 0.42 && Math.random() < 0.40) {
                emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.80 * fidelity, '#00e5ff');
            }
        }
        for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
            const sw = turntableShockwaves[i];
            sw.r += sw.speed * dt;
            const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
            if (prog >= 1.0) { turntableShockwaves.splice(i, 1); continue; }
            const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
            ctx.save();
            ctx.strokeStyle = sw.color === '#ff2a00' ? `rgba(255, 42, 0, ${currentAlpha})` : `rgba(0, 229, 255, ${currentAlpha})`;
            ctx.shadowColor = sw.color || '#00e5ff';
            ctx.shadowBlur = (10 + beatPulse * 10 * (0.35 + 0.65 * fidelity)) * s;
            ctx.lineWidth = Math.max(1.0, (2.2 + beatPulse * 1.5) * (1.0 - prog * 0.5));
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // =====================================================================
        // FULL-PLATTER ARCHITECTURE: 360° Planetary Security Nexus
        // =====================================================================
        if (fidelity > 0.005) {
            ctx.save();
            ctx.globalAlpha = fidelity;
            ctx.translate(centerX, centerY);

            // 1. Base Carbon Void Disc with Atmospheric Radial Energy Aura
            const bgGrad = ctx.createRadialGradient(0, 0, hubRadius * 0.5, 0, 0, maxRadius);
            bgGrad.addColorStop(0, '#090e17');
            bgGrad.addColorStop(0.45, '#05080e');
            bgGrad.addColorStop(0.85, '#03050a');
            bgGrad.addColorStop(1, '#020306');
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
            ctx.fillStyle = bgGrad;
            ctx.fill();

            // Atmospheric Breathing Halo
            const haloGrad = ctx.createRadialGradient(0, 0, hubRadius, 0, 0, maxRadius * 0.95);
            haloGrad.addColorStop(0, isCombat ? 'rgba(255, 42, 0, 0.14)' : 'rgba(0, 229, 255, 0.12)');
            haloGrad.addColorStop(0.4, isCombat ? 'rgba(255, 42, 0, 0.05)' : 'rgba(0, 229, 255, 0.04)');
            haloGrad.addColorStop(1, 'rgba(2, 4, 8, 0)');
            ctx.beginPath();
            ctx.arc(0, 0, maxRadius * 0.95, 0, Math.PI * 2);
            ctx.fillStyle = haloGrad;
            ctx.fill();

            // 2. High-Tech Precision Outer Bezel & Calibration Teeth
            ctx.save();
            ctx.rotate(-sentinelTime * 0.05);
            const outerRimR = maxRadius * 0.97;
            const innerRimR = maxRadius * 0.925;
            ctx.beginPath();
            ctx.arc(0, 0, outerRimR, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
            ctx.lineWidth = 1.0;
            ctx.stroke();

            // Micro-Calibration Teeth on Perimeter
            const teethCount = 48;
            for (let t = 0; t < teethCount; t++) {
                const tAng = (t * Math.PI * 2) / teethCount;
                const isCardinal = (t % 12 === 0);
                const isSub = (t % 4 === 0);
                const rStart = isCardinal ? innerRimR * 0.96 : (isSub ? innerRimR * 0.98 : innerRimR);
                const cosT = Math.cos(tAng);
                const sinT = Math.sin(tAng);
                ctx.beginPath();
                ctx.moveTo(cosT * rStart, sinT * rStart);
                ctx.lineTo(cosT * outerRimR, sinT * outerRimR);
                ctx.strokeStyle = isCardinal ? '#ff2a00' : (isSub ? '#00e5ff' : 'rgba(248, 250, 252, 0.22)');
                ctx.lineWidth = isCardinal ? 1.8 : (isSub ? 1.2 : 0.8);
                ctx.stroke();
            }

            // 4 Cardinal Aeron Reticle Brackets (0°, 90°, 180°, 270°)
            for (let c = 0; c < 4; c++) {
                const cAng = (c * Math.PI) / 2;
                ctx.save();
                ctx.rotate(cAng);
                ctx.translate(outerRimR * 0.99, 0);
                ctx.beginPath();
                ctx.moveTo(-6 * s, -4 * s);
                ctx.lineTo(0, 0);
                ctx.lineTo(-6 * s, 4 * s);
                ctx.strokeStyle = '#00e5ff';
                ctx.lineWidth = 1.4 * s;
                ctx.stroke();
                ctx.restore();
            }
            ctx.restore();

            // 3. Counter-Rotating Gyroscopic Telemetry Rings
            // Outer Gyro Ring (Segmented Telemetry Track with Degree Glyphs)
            ctx.save();
            ctx.rotate(sentinelTime * 0.08);
            const gyroOuterR = maxRadius * 0.87;
            const segments = 4;
            const segGap = 0.22;
            const segSpan = (Math.PI * 2 / segments) - segGap;
            for (let sg = 0; sg < segments; sg++) {
                const sgStart = sg * (Math.PI * 2 / segments) + segGap / 2;
                const sgEnd = sgStart + segSpan;
                ctx.beginPath();
                ctx.arc(0, 0, gyroOuterR, sgStart, sgEnd);
                ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
                ctx.lineWidth = 1.2 * s;
                ctx.stroke();

                // Bracket corner tick
                const cosStart = Math.cos(sgStart);
                const sinStart = Math.sin(sgStart);
                ctx.beginPath();
                ctx.moveTo(cosStart * (gyroOuterR - 3 * s), sinStart * (gyroOuterR - 3 * s));
                ctx.lineTo(cosStart * (gyroOuterR + 3 * s), sinStart * (gyroOuterR + 3 * s));
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5 * s;
                ctx.stroke();
            }

            // Degree Telemetry Glyphs
            const degLabels = ['090°', '180°', '270°', '360°'];
            ctx.font = `700 ${Math.max(5, Math.round(6.0 * s))}px "JetBrains Mono", monospace`;
            ctx.fillStyle = 'rgba(0, 229, 255, 0.75)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let d = 0; d < 4; d++) {
                const dAng = (d * Math.PI) / 2 + Math.PI / 4;
                const dx = Math.cos(dAng) * (gyroOuterR - 7 * s);
                const dy = Math.sin(dAng) * (gyroOuterR - 7 * s);
                ctx.fillText(degLabels[d], dx, dy);
            }
            ctx.restore();

            // Inner Gyro Ring (Precision Dotted Telemetry)
            ctx.save();
            ctx.rotate(-sentinelTime * 0.12);
            const gyroInnerR = maxRadius * 0.76;
            ctx.beginPath();
            ctx.arc(0, 0, gyroInnerR, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(248, 250, 252, 0.18)';
            ctx.lineWidth = 1.0;
            ctx.setLineDash([3 * s, 5 * s]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();

            // 4. 64-Ray High-Density Laser Audio Horizon (Radial Frequency Telemetry)
            const numRays = 64;
            const rayBaseR = hubRadius * 1.16;
            const maxRayLen = (gyroInnerR * 0.94 - rayBaseR);
            ctx.save();
            let prevTipX = 0, prevTipY = 0, firstTipX = 0, firstTipY = 0;
            for (let sp = 0; sp < numRays; sp++) {
                const spAng = (sp * Math.PI * 2) / numRays + sentinelTime * 0.03;
                let bVal = 0.16;
                if (bands && bands.length > 0) {
                    const bIdx = Math.floor((sp / numRays) * bands.length);
                    bVal = bands[bIdx] || 0.16;
                } else if (playing) {
                    bVal = 0.18 + 0.32 * Math.sin(now * 0.0035 + sp * 0.28);
                }
                const rayLen = bVal * maxRayLen * (0.88 + beatPulse * 0.38);
                const cosA = Math.cos(spAng);
                const sinA = Math.sin(spAng);
                const startX = cosA * rayBaseR;
                const startY = sinA * rayBaseR;
                const tipX = cosA * (rayBaseR + rayLen);
                const tipY = sinA * (rayBaseR + rayLen);

                // Filament color grading: Bass = Fiery Crimson/Orange, Mid = Gold/Amber, Treble = Neon Cyan/White
                const normSp = sp / numRays;
                let strokeColor = '#00e5ff';
                if (normSp < 0.25 || normSp > 0.75) {
                    strokeColor = '#ff2a00';
                } else if (normSp < 0.40 || normSp > 0.60) {
                    strokeColor = '#ff9100';
                }

                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(tipX, tipY);
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = Math.max(0.9, (1.2 + bVal * 1.6) * s);
                ctx.shadowColor = strokeColor;
                ctx.shadowBlur = (4 + bVal * 8) * s;
                ctx.stroke();

                // Radiant White Tip Spark Bead
                ctx.beginPath();
                ctx.arc(tipX, tipY, (1.0 + bVal * 1.8) * s, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = (6 + bVal * 10) * s;
                ctx.fill();

                // Faint perimeter wave mesh connection between tips
                if (sp === 0) {
                    firstTipX = tipX;
                    firstTipY = tipY;
                } else {
                    ctx.beginPath();
                    ctx.moveTo(prevTipX, prevTipY);
                    ctx.lineTo(tipX, tipY);
                    ctx.strokeStyle = `rgba(0, 229, 255, ${0.12 + bVal * 0.25})`;
                    ctx.lineWidth = 0.6 * s;
                    ctx.shadowBlur = 0;
                    ctx.stroke();
                }
                prevTipX = tipX;
                prevTipY = tipY;
            }
            if (numRays > 1) {
                ctx.beginPath();
                ctx.moveTo(prevTipX, prevTipY);
                ctx.lineTo(firstTipX, firstTipY);
                ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
                ctx.lineWidth = 0.6 * s;
                ctx.stroke();
            }
            ctx.restore();

            // 5. Tactical Combat Radar Sweep with Alert Flaring
            if (playing) {
                ctx.save();
                ctx.rotate(now * 0.002);
                const radarSweepR = gyroInnerR * 0.98;
                const sweepGrad = ctx.createRadialGradient(0, 0, hubRadius, 0, 0, radarSweepR);
                if (isCombat) {
                    sweepGrad.addColorStop(0, 'rgba(255, 42, 0, 0.45)');
                    sweepGrad.addColorStop(0.5, 'rgba(255, 42, 0, 0.18)');
                    sweepGrad.addColorStop(1, 'rgba(255, 42, 0, 0)');
                } else {
                    sweepGrad.addColorStop(0, 'rgba(0, 229, 255, 0.35)');
                    sweepGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.12)');
                    sweepGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
                }
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, radarSweepR, -0.42, 0);
                ctx.closePath();
                ctx.fillStyle = sweepGrad;
                ctx.fill();

                // Leading Tactical Radar Ray
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(radarSweepR, 0);
                ctx.strokeStyle = isCombat ? '#ff2a00' : '#00e5ff';
                ctx.lineWidth = 1.8 * s;
                ctx.shadowColor = isCombat ? '#ff2a00' : '#00e5ff';
                ctx.shadowBlur = 12 * s;
                ctx.stroke();

                // Radar Contact Ping Blips
                [0.45, 0.72, 0.88].forEach((distMult) => {
                    const bx = radarSweepR * distMult;
                    const by = 0;
                    ctx.beginPath();
                    ctx.arc(bx, by, (1.8 + snarePulse * 1.5) * s, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowColor = '#ffffff';
                    ctx.shadowBlur = 8 * s;
                    ctx.fill();
                });
                ctx.restore();
            }

            // 6. 32 Floating 3D Ion Particles (Atmospheric Energy Dust)
            ctx.save();
            const numParticles = 32;
            for (let p = 0; p < numParticles; p++) {
                const pSpeed = 0.0007 + (p % 4) * 0.0003;
                const pPhase = (now * pSpeed + p * 1.37) % (Math.PI * 2);
                const pOrbitR = hubRadius * 1.15 + ((p * 37) % Math.round(maxRadius * 0.65 - hubRadius));
                const pTilt = 0.55 + ((p % 5) * 0.08); // 3D elliptical tilt
                const px = Math.cos(pPhase) * pOrbitR;
                const py = Math.sin(pPhase) * pOrbitR * pTilt;
                const pAlpha = 0.35 + 0.55 * Math.abs(Math.sin(pPhase));
                const pSize = (1.2 + ((p % 3) * 0.7) + beatPulse * 0.6) * s;
                const isAmberParticle = (p % 3 === 0);

                ctx.beginPath();
                ctx.arc(px, py, pSize, 0, Math.PI * 2);
                ctx.fillStyle = isAmberParticle ? `rgba(255, 145, 0, ${pAlpha})` : `rgba(0, 229, 255, ${pAlpha})`;
                ctx.shadowColor = isAmberParticle ? '#ff9100' : '#00e5ff';
                ctx.shadowBlur = 6 * s;
                ctx.fill();
            }
            ctx.restore();

            // 7. Integrated Holographic Wanted HUD Arc (Top Arc - Conformal Geometry)
            ctx.save();
            const arcR = gyroOuterR + 1.5 * s;
            const arcSpan = 0.44; // radians on each side of -Math.PI / 2
            const arcStart = -Math.PI / 2 - arcSpan;
            const arcEnd = -Math.PI / 2 + arcSpan;

            // Curved Conformal Carbon Backing Strip
            ctx.beginPath();
            ctx.arc(0, 0, arcR + 15 * s, arcStart, arcEnd);
            ctx.arc(0, 0, arcR - 9 * s, arcEnd, arcStart, true);
            ctx.closePath();
            ctx.fillStyle = 'rgba(6, 10, 18, 0.94)';
            ctx.fill();
            ctx.strokeStyle = isCombat ? 'rgba(255, 42, 0, 0.75)' : 'rgba(0, 229, 255, 0.55)';
            ctx.lineWidth = 1.0 * s;
            ctx.stroke();

            // Telemetry Arc Text: AERON WANTED // LVL 5 (Upper portion of backing strip)
            ctx.font = `800 ${Math.max(6, Math.round(7.5 * s))}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ff3d00';
            ctx.shadowColor = '#ff2a00';
            ctx.shadowBlur = (8 + beatPulse * 10) * s;
            ctx.fillText('AERON WANTED // LVL 5', 0, -arcR - 7.5 * s);

            // 5 Holographic Wanted Diamond Glyphs along the arc (Lower portion of backing strip)
            const pipsCount = 5;
            for (let p = 0; p < pipsCount; p++) {
                const pFrac = (p - (pipsCount - 1) / 2) / (pipsCount - 1);
                const pipAngle = -Math.PI / 2 + pFrac * (arcSpan * 1.25);
                const pipR = arcR - 1.5 * s;
                const pipX = Math.cos(pipAngle) * pipR;
                const pipY = Math.sin(pipAngle) * pipR;

                ctx.save();
                ctx.translate(pipX, pipY);
                ctx.rotate(pipAngle + Math.PI / 4);
                const pipSz = (4.0 + beatPulse * 1.8) * s;
                ctx.fillStyle = '#ff2a00';
                ctx.shadowColor = '#ff2a00';
                ctx.shadowBlur = (10 + beatPulse * 12) * s;
                ctx.fillRect(-pipSz / 2, -pipSz / 2, pipSz, pipSz);

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.0 * s;
                ctx.strokeRect(-pipSz / 2, -pipSz / 2, pipSz, pipSz);

                // Flaring diamond corona on heavy transients
                if (playing && beatPulse > 0.35) {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                    ctx.lineWidth = 0.6 * s;
                    ctx.strokeRect(-pipSz * 0.9, -pipSz * 0.9, pipSz * 1.8, pipSz * 1.8);
                }
                ctx.restore();
            }
            ctx.restore();

            // 8. Integrated Holographic Diagnostics Arc (Bottom Arc - Conformal Geometry)
            ctx.save();
            const diagSpan = 0.42;
            const diagStart = Math.PI / 2 - diagSpan;
            const diagEnd = Math.PI / 2 + diagSpan;

            ctx.beginPath();
            ctx.arc(0, 0, arcR + 9 * s, diagStart, diagEnd);
            ctx.arc(0, 0, arcR - 9 * s, diagEnd, diagStart, true);
            ctx.closePath();
            ctx.fillStyle = 'rgba(6, 10, 18, 0.94)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.60)';
            ctx.lineWidth = 1.0 * s;
            ctx.stroke();

            ctx.font = `700 ${Math.max(5, Math.round(6.5 * s))}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#00e5ff';
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = 6 * s;
            ctx.fillText('[ ATLAN PROTOCOL // SYS_PURGE ]', 0, arcR);
            ctx.restore();

            ctx.restore();
        }

        // =====================================================================
        // CENTRAL HUB: Articulated 3D Sentinel Drone Centerpiece (Aeron Unit)
        // =====================================================================
        ctx.save();
        ctx.translate(centerX, centerY);

        // 1. Anti-Gravity Drone Hover Physics & Dynamic Banking
        const hoverY = playing
            ? (Math.sin(sentinelTime * 2.2) * (2.8 * s) - (beatPulse * 3.8 * s))
            : (Math.sin(sentinelTime * 1.1) * (1.0 * s));
        const bankAng = playing
            ? (Math.sin(now * 0.0022) * 0.035 + snarePulse * 0.025)
            : 0;

        // Base Docking Ring (Deep Carbon Gimbal Platform behind the Drone)
        ctx.beginPath();
        ctx.arc(0, 0, hubRadius, 0, Math.PI * 2);
        const dockGrad = ctx.createRadialGradient(0, 0, hubRadius * 0.25, 0, 0, hubRadius);
        dockGrad.addColorStop(0, '#0c1422');
        dockGrad.addColorStop(0.65, '#070b14');
        dockGrad.addColorStop(1, '#03050a');
        ctx.fillStyle = dockGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.75)';
        ctx.lineWidth = Math.max(1.6, 2.2 * s);
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = (12 + beatPulse * 14) * s;
        ctx.stroke();

        // 12 Recessed Socket Hex Bolts on Hub Rim
        for (let b = 0; b < 12; b++) {
            const bAng = (b * Math.PI * 2) / 12;
            const bx = Math.cos(bAng) * (hubRadius * 0.92);
            const by = Math.sin(bAng) * (hubRadius * 0.92);
            ctx.beginPath();
            ctx.arc(bx, by, 1.2 * s, 0, Math.PI * 2);
            ctx.fillStyle = '#94a3b8';
            ctx.fill();
        }

        // Inner Mechanical Circuit Trench
        ctx.beginPath();
        ctx.arc(0, 0, hubRadius * 0.78, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 229, 255, ${0.25 + beatPulse * 0.35})`;
        ctx.lineWidth = 1.0 * s;
        ctx.setLineDash([4 * s, 4 * s]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Hover Transform Applied to Floating Drone Chassis
        ctx.translate(0, hoverY);
        ctx.rotate(bankAng);

        // 2. Twin Ion Plasma Thruster Plumes
        const thrusterX = 15 * s;
        const thrusterY = 17 * s;
        const plumeLen = (20 + smoothBass * 34 + beatPulse * 44) * s;
        const plumeW = (6.0 + beatPulse * 3.5) * s;
        [-thrusterX, thrusterX].forEach(tx => {
            ctx.save();
            const jetGrad = ctx.createLinearGradient(tx, thrusterY, tx, thrusterY + plumeLen);
            if (isCombat) {
                jetGrad.addColorStop(0, '#ffffff');
                jetGrad.addColorStop(0.25, '#ff2a00');
                jetGrad.addColorStop(0.65, 'rgba(255, 42, 0, 0.45)');
                jetGrad.addColorStop(1, 'rgba(255, 42, 0, 0)');
            } else {
                jetGrad.addColorStop(0, '#ffffff');
                jetGrad.addColorStop(0.25, '#00e5ff');
                jetGrad.addColorStop(0.65, 'rgba(0, 229, 255, 0.45)');
                jetGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
            }
            ctx.beginPath();
            ctx.moveTo(tx - plumeW / 2, thrusterY);
            ctx.quadraticCurveTo(tx - plumeW * 0.65, thrusterY + plumeLen * 0.5, tx, thrusterY + plumeLen);
            ctx.quadraticCurveTo(tx + plumeW * 0.65, thrusterY + plumeLen * 0.5, tx + plumeW / 2, thrusterY);
            ctx.closePath();
            ctx.fillStyle = jetGrad;
            ctx.shadowColor = isCombat ? '#ff2a00' : '#00e5ff';
            ctx.shadowBlur = (14 + beatPulse * 18) * s;
            ctx.fill();

            // Inner Blazing White Core Jet
            ctx.beginPath();
            ctx.moveTo(tx - plumeW * 0.25, thrusterY);
            ctx.lineTo(tx, thrusterY + plumeLen * 0.55);
            ctx.lineTo(tx + plumeW * 0.25, thrusterY);
            ctx.closePath();
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.restore();
        });

        // 3. Articulated Ceramic Armor Wing Cowlings with Exposed Glowing Heatsinks
        const flareSpread = playing ? (beatPulse * 4.8 * s) : 0;

        // --- Left Wing Cowling ---
        ctx.save();
        // Exposed Glowing Orange Heatsink Grille behind Left Armor Plate
        ctx.beginPath();
        ctx.moveTo(-10 * s, -10 * s);
        ctx.lineTo(-24 * s - flareSpread * 0.6, -4 * s);
        ctx.lineTo(-26 * s - flareSpread * 0.6, 8 * s);
        ctx.lineTo(-12 * s, 12 * s);
        ctx.closePath();
        ctx.fillStyle = '#1e1b18';
        ctx.fill();
        for (let sl = 0; sl < 4; sl++) {
            const sly = -2 * s + sl * 3.2 * s;
            ctx.beginPath();
            ctx.moveTo(-12 * s, sly);
            ctx.lineTo(-22 * s - flareSpread * 0.4, sly - 2 * s);
            ctx.strokeStyle = `rgba(255, 87, 34, ${0.75 + beatPulse * 0.25})`;
            ctx.lineWidth = 1.2 * s;
            ctx.stroke();
        }

        // Left Outer Ceramic Wing Armor Plate
        ctx.beginPath();
        ctx.moveTo(-10 * s, -15 * s);
        ctx.lineTo(-28 * s - flareSpread, -6 * s);
        ctx.lineTo(-30 * s - flareSpread, 8 * s);
        ctx.lineTo(-14 * s, 15 * s);
        ctx.lineTo(-8 * s, 4 * s);
        ctx.closePath();
        const lWingGrad = ctx.createLinearGradient(-30 * s, -15 * s, -8 * s, 15 * s);
        lWingGrad.addColorStop(0, '#ffffff');
        lWingGrad.addColorStop(0.4, '#e2e8f0');
        lWingGrad.addColorStop(0.8, '#94a3b8');
        lWingGrad.addColorStop(1, '#334155');
        ctx.fillStyle = lWingGrad;
        ctx.fill();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = Math.max(1.2, 1.5 * s);
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 6 * s;
        ctx.stroke();

        // Left Wing Specular Edge Chamfer
        ctx.beginPath();
        ctx.moveTo(-10 * s, -15 * s);
        ctx.lineTo(-28 * s - flareSpread, -6 * s);
        ctx.lineTo(-30 * s - flareSpread, 8 * s);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();

        // Left Wing Hazard Stripe Accent
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(-30 * s - flareSpread, 1 * s);
        ctx.lineTo(-14 * s, 11 * s);
        ctx.strokeStyle = '#ff2a00';
        ctx.lineWidth = 3.2 * s;
        ctx.shadowColor = '#ff2a00';
        ctx.shadowBlur = 8 * s;
        ctx.stroke();
        ctx.restore();
        ctx.restore();

        // --- Right Wing Cowling ---
        ctx.save();
        // Exposed Glowing Orange Heatsink Grille behind Right Armor Plate
        ctx.beginPath();
        ctx.moveTo(10 * s, -10 * s);
        ctx.lineTo(24 * s + flareSpread * 0.6, -4 * s);
        ctx.lineTo(26 * s + flareSpread * 0.6, 8 * s);
        ctx.lineTo(12 * s, 12 * s);
        ctx.closePath();
        ctx.fillStyle = '#1e1b18';
        ctx.fill();
        for (let sl = 0; sl < 4; sl++) {
            const sly = -2 * s + sl * 3.2 * s;
            ctx.beginPath();
            ctx.moveTo(12 * s, sly);
            ctx.lineTo(22 * s + flareSpread * 0.4, sly - 2 * s);
            ctx.strokeStyle = `rgba(255, 87, 34, ${0.75 + beatPulse * 0.25})`;
            ctx.lineWidth = 1.2 * s;
            ctx.stroke();
        }

        // Right Outer Ceramic Wing Armor Plate
        ctx.beginPath();
        ctx.moveTo(10 * s, -15 * s);
        ctx.lineTo(28 * s + flareSpread, -6 * s);
        ctx.lineTo(30 * s + flareSpread, 8 * s);
        ctx.lineTo(14 * s, 15 * s);
        ctx.lineTo(8 * s, 4 * s);
        ctx.closePath();
        const rWingGrad = ctx.createLinearGradient(30 * s, -15 * s, 8 * s, 15 * s);
        rWingGrad.addColorStop(0, '#ffffff');
        rWingGrad.addColorStop(0.4, '#e2e8f0');
        rWingGrad.addColorStop(0.8, '#94a3b8');
        rWingGrad.addColorStop(1, '#334155');
        ctx.fillStyle = rWingGrad;
        ctx.fill();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = Math.max(1.2, 1.5 * s);
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 6 * s;
        ctx.stroke();

        // Right Wing Specular Edge Chamfer
        ctx.beginPath();
        ctx.moveTo(10 * s, -15 * s);
        ctx.lineTo(28 * s + flareSpread, -6 * s);
        ctx.lineTo(30 * s + flareSpread, 8 * s);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();

        // Right Wing Hazard Stripe Accent
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(30 * s + flareSpread, 1 * s);
        ctx.lineTo(14 * s, 11 * s);
        ctx.strokeStyle = '#ff2a00';
        ctx.lineWidth = 3.2 * s;
        ctx.shadowColor = '#ff2a00';
        ctx.shadowBlur = 8 * s;
        ctx.stroke();
        ctx.restore();
        ctx.restore();

        // 4. Main Aeron Drone Body Chassis (Matte White Faceted Armor Shell)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, -28 * s);
        ctx.lineTo(13 * s, -13 * s);
        ctx.lineTo(15 * s, 6 * s);
        ctx.lineTo(9 * s, 20 * s);
        ctx.lineTo(-9 * s, 20 * s);
        ctx.lineTo(-15 * s, 6 * s);
        ctx.lineTo(-13 * s, -13 * s);
        ctx.closePath();
        const bodyGrad = ctx.createLinearGradient(0, -28 * s, 0, 20 * s);
        bodyGrad.addColorStop(0, '#ffffff');
        bodyGrad.addColorStop(0.35, '#f8fafc');
        bodyGrad.addColorStop(0.7, '#cbd5e1');
        bodyGrad.addColorStop(1, '#1e293b');
        ctx.fillStyle = bodyGrad;
        ctx.fill();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = Math.max(1.2, 1.6 * s);
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 8 * s;
        ctx.stroke();

        // Central Facet Ridge (Illuminated 3D Spine)
        ctx.beginPath();
        ctx.moveTo(0, -28 * s);
        ctx.lineTo(0, 20 * s);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.4 * s;
        ctx.stroke();

        // Top Spire Sensor Fin
        ctx.beginPath();
        ctx.moveTo(0, -27 * s);
        ctx.lineTo(6 * s, -16 * s);
        ctx.lineTo(-6 * s, -16 * s);
        ctx.closePath();
        ctx.fillStyle = '#060a12';
        ctx.fill();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 0.9 * s;
        ctx.stroke();
        ctx.restore();

        // 5. Multi-Ring Mechanical Cyclops Optic (Heart of the Aeron Drone)
        ctx.save();
        const eyeR = 12.5 * s;

        // Outer Gunmetal Bezel Collar
        ctx.beginPath();
        ctx.arc(0, 0, eyeR * 1.28, 0, Math.PI * 2);
        ctx.fillStyle = '#070b14';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.4, 1.8 * s);
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 8 * s;
        ctx.stroke();

        // 8 Recessed Socket Screws on Bezel
        for (let b = 0; b < 8; b++) {
            const bAng = (b * Math.PI) / 4;
            const bx = Math.cos(bAng) * eyeR * 1.14;
            const by = Math.sin(bAng) * eyeR * 1.14;
            ctx.beginPath();
            ctx.arc(bx, by, 1.0 * s, 0, Math.PI * 2);
            ctx.fillStyle = '#94a3b8';
            ctx.fill();
        }

        // Rotating Mechanical Iris Diaphragm Blades
        ctx.save();
        ctx.rotate(sentinelTime * 0.4);
        const irisBlades = 6;
        for (let ib = 0; ib < irisBlades; ib++) {
            const ibAng = (ib * Math.PI * 2) / irisBlades;
            const ix1 = Math.cos(ibAng) * (eyeR * 1.05);
            const iy1 = Math.sin(ibAng) * (eyeR * 1.05);
            const ix2 = Math.cos(ibAng + 0.5) * (eyeR * 0.72);
            const iy2 = Math.sin(ibAng + 0.5) * (eyeR * 0.72);
            ctx.beginPath();
            ctx.moveTo(ix1, iy1);
            ctx.lineTo(ix2, iy2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
            ctx.lineWidth = 0.9 * s;
            ctx.stroke();
        }
        ctx.restore();

        // Deep Convex Spherical Glass Lens (Instant Shift to Alert Crimson on Transients)
        const eyeColor = isCombat ? '#ff1744' : '#00e5ff';
        const eyeCoreGrad = ctx.createRadialGradient(0, 0, eyeR * 0.1, 0, 0, eyeR);
        eyeCoreGrad.addColorStop(0, '#ffffff');
        eyeCoreGrad.addColorStop(0.28, eyeColor);
        eyeCoreGrad.addColorStop(0.72, isCombat ? '#b71c1c' : '#0284c7');
        eyeCoreGrad.addColorStop(1, '#020617');
        ctx.beginPath();
        ctx.arc(0, 0, eyeR, 0, Math.PI * 2);
        ctx.fillStyle = eyeCoreGrad;
        ctx.shadowColor = eyeColor;
        ctx.shadowBlur = (16 + beatPulse * 24) * s;
        ctx.fill();

        // Glowing Optical Pupil Slit
        const pupilW = (2.2 + snarePulse * 2.0) * s;
        const pupilH = eyeR * 0.74;
        ctx.beginPath();
        ctx.ellipse(0, 0, pupilW, pupilH, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 12 * s;
        ctx.fill();

        // Horizontal Scanning Laser Needle
        if (playing) {
            const scanX = Math.sin(now * 0.0075) * (eyeR * 0.68);
            ctx.beginPath();
            ctx.moveTo(scanX, -eyeR * 0.82);
            ctx.lineTo(scanX, eyeR * 0.82);
            ctx.strokeStyle = isCombat ? '#ffffff' : '#e0f7fa';
            ctx.lineWidth = 1.1 * s;
            ctx.stroke();
        }

        // Specular Convex Glass Glare Arc (Gives Photorealistic 3D Lens Depth)
        ctx.beginPath();
        ctx.arc(0, 0, eyeR * 0.78, -Math.PI * 0.85, -Math.PI * 0.25);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.4 * s;
        ctx.stroke();

        ctx.restore();

        ctx.restore();
    }


    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center Touhou Heart & Yin-Yang Medallion
    // Rendered on the center hub of the vinyl turntable when Thematic Wave is active
    // Balanced, refined heartbeat response ("not too much" over-exaggeration)
    // -------------------------------------------------------------------------
    function drawTurntableCenterHeart(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
        if (!ctx || width === 0 || height === 0) return;

        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) * 0.48;

        // Hub radius: anchor center record label (~40% of turntable diameter)
        const hubRadius = Math.min(width, height) * 0.20;
        const s = hubRadius / 54;
        const heartPulse = smoothHeartPulse;

        if (playing) {
            runeRingAngle += dt * (1.2 + smoothTreble * 2.2 + beatPulse * 1.4);
            yinYangAngle += dt * (1.2 + smoothBass * 1.8 + smoothTreble * 2.0);
        } else {
            runeRingAngle += dt * 0.45;
            yinYangAngle += dt * 0.45;
        }

        // 1. Acoustic Shockwaves: Concentric soundwaves expanding across vinyl (high fidelity)
        if (playing && beatPulse > 0.40 && Math.random() < 0.36 && fidelity > 0.15) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.72 * fidelity, '#ffffff');
        }

        for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
            const sw = turntableShockwaves[i];
            sw.r += sw.speed * dt;
            const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
            if (prog >= 1.0) {
                turntableShockwaves.splice(i, 1);
                continue;
            }
            const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
            ctx.save();
            ctx.strokeStyle = `rgba(255, 255, 255, ${currentAlpha})`;
            ctx.lineWidth = Math.max(0.8, 1.8 * (1.0 - prog * 0.5));
            ctx.setLineDash([Math.round(4 * s), Math.round(6 * s)]);
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // =====================================================================
        // OUTER VINYL RINGS ARCHITECTURE (Harmonic resonance & spectrum dots)
        // =====================================================================
        if (fidelity > 0.005) {
            ctx.save();
            ctx.globalAlpha = fidelity;

            // 2. Harmonic Outer Resonance Ring (Radiating across vinyl grooves)
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(runeRingAngle * 1.5 * fidelity);
            const harmonicRadius = hubRadius + (28 * s + smoothMid * 34 * s + snarePulse * 22 * s);
            const harmonicAlpha = Math.max(0.12, (0.28 + snarePulse * 0.35) * Math.max(0, 1.0 - (harmonicRadius / maxRadius)));
            ctx.strokeStyle = `rgba(255, 255, 255, ${harmonicAlpha})`;
            ctx.lineWidth = Math.max(0.8, 1.1 * s);
            ctx.setLineDash([Math.round(3 * s), Math.round(8 * s)]);
            ctx.beginPath();
            ctx.arc(0, 0, harmonicRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // 3. Primary Visualizer Dots Ring (Freely expanding across vinyl grooves)
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(-runeRingAngle * 2.2 * fidelity);
            const dotsRadius = hubRadius + (12 * s + smoothBass * 38 * s + beatPulse * 26 * s);
            const dotsAlpha = Math.max(0.20, (0.58 + beatPulse * 0.35) * Math.max(0, 1.0 - (dotsRadius / maxRadius)));
            ctx.strokeStyle = `rgba(255, 255, 255, ${dotsAlpha})`;
            ctx.lineWidth = Math.max(1.0, 1.4 * s);
            ctx.setLineDash([Math.round(4 * s), Math.round(6 * s)]);
            ctx.beginPath();
            ctx.arc(0, 0, dotsRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            ctx.restore();
        }

        // 4. Center Turntable Hub: Dark Disc with Crisp White Border
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#080808';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.2, (1.5 + beatPulse * 0.5) * s);
        ctx.stroke();
        ctx.restore();

        // 5. Ambient Radial Bloom inside the hub
        const glowR = hubRadius * (playing ? (0.85 + beatPulse * 0.30) : 0.75);
        const grad = ctx.createRadialGradient(centerX, centerY, 3, centerX, centerY, glowR);
        grad.addColorStop(0, 'rgba(255, 255, 255, ' + ((0.35 + beatPulse * 0.38) * (0.4 + 0.6 * fidelity)) + ')');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, ' + ((0.08 + beatPulse * 0.15) * (0.4 + 0.6 * fidelity)) + ')');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowR, 0, Math.PI * 2);
        ctx.fill();

        // 6. Inner Dashed Rune Ring with 8 Radial Trigram Ticks (Inside the hub)
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(runeRingAngle * fidelity);

        ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.65 + beatPulse * 0.30) + ')';
        ctx.lineWidth = Math.max(1, 1.3 * s);
        ctx.setLineDash([Math.round(5 * s), Math.round(5 * s)]);
        ctx.beginPath();
        ctx.arc(0, 0, 42 * s * heartPulse, 0, Math.PI * 2);
        ctx.stroke();

        // 8 Radial Trigram Ticks
        for (let a = 0; a < 8; a++) {
            const angle = (a * Math.PI) / 4;
            const r1 = 39 * s * heartPulse;
            const r2 = 45 * s * heartPulse;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
            ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
            ctx.stroke();
        }
        ctx.restore();

        // 7. Solid White Touhou Heart Silhouette with Soft Bloom
        ctx.save();
        ctx.translate(centerX, centerY);
        const hScale = s * heartPulse;
        ctx.scale(hScale, hScale);

        ctx.beginPath();
        ctx.moveTo(0, -9);
        // Left top lobe
        ctx.bezierCurveTo(-8, -24, -26, -22, -26, -6);
        // Left curve down to bottom apex
        ctx.bezierCurveTo(-26, 9, -14, 19, 0, 26);
        // Right curve up from bottom apex
        ctx.bezierCurveTo(14, 19, 26, 9, 26, -6);
        // Right top lobe back to top notch
        ctx.bezierCurveTo(26, -22, 8, -24, 0, -9);
        ctx.closePath();

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255, 255, 255, ' + (0.8 + beatPulse * 0.2) + ')';
        ctx.shadowBlur = (4 + beatPulse * 15 * (0.35 + 0.65 * fidelity)) * s;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Subtle dark contour line
        ctx.lineWidth = 1.0;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.stroke();

        // 8. Rotating Yin-Yang Medallion in Center of Heart
        ctx.save();
        ctx.translate(0, 1.5);
        ctx.rotate(yinYangAngle * fidelity);

        const r = 10.5;

        // Circular Medallion Outer Border
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // Black Right Half
        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
        ctx.fillStyle = '#000000';
        ctx.fill();

        // White Left Half
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Top Black Inner Semicircle
        ctx.beginPath();
        ctx.arc(0, -r / 2, r / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();

        // Bottom White Inner Semicircle
        ctx.beginPath();
        ctx.arc(0, r / 2, r / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // White Eye Dot in Top Black Semicircle
        ctx.beginPath();
        ctx.arc(0, -r / 2, 2.0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Black Eye Dot in Bottom White Semicircle
        ctx.beginPath();
        ctx.arc(0, r / 2, 2.0, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();

        ctx.restore(); // Yin-Yang restore
        ctx.restore(); // Heart restore
    }

    // -------------------------------------------------------------------------
    // Visualizer 3 Centerpieces: Unique Authentic Vessels & Cores for Each Theme
    // High-fidelity central entities with real-time reactive audio animation
    // -------------------------------------------------------------------------

    // 1. No Man's Sky (The Atlas): Majestic Atlas Interface Communion Platform
    function drawThematicAtlasPlatform(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();

        const hoverY = playing ? Math.sin(now * 0.0024) * (2.2 * s) : Math.sin(now * 0.0012) * (1.0 * s);
        const platY = cy + hoverY;
        ctx.translate(cx, platY);

        const auraR = (34 + smoothBass * 24 + beatPulse * 30) * s;
        const auraGrad = ctx.createRadialGradient(0, -8 * s, 4 * s, 0, -8 * s, auraR);
        auraGrad.addColorStop(0, 'rgba(255, 23, 68, 0.45)');
        auraGrad.addColorStop(0.35, 'rgba(213, 0, 0, 0.22)');
        auraGrad.addColorStop(0.7, 'rgba(124, 77, 255, 0.08)');
        auraGrad.addColorStop(1, 'rgba(8, 2, 12, 0)');
        ctx.beginPath();
        ctx.arc(0, -8 * s, auraR, 0, Math.PI * 2);
        ctx.fillStyle = auraGrad;
        ctx.fill();

        ctx.save();
        const baseW = 38 * s;
        const baseH = 16 * s;
        const baseY = 10 * s;

        ctx.beginPath();
        ctx.ellipse(0, baseY + 6 * s, baseW * 1.05, baseH * 0.9, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(2, 4, 10, 0.85)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-baseW, baseY);
        ctx.lineTo(-baseW * 0.65, baseY + baseH * 0.7);
        ctx.lineTo(baseW * 0.65, baseY + baseH * 0.7);
        ctx.lineTo(baseW, baseY);
        ctx.lineTo(baseW * 0.65, baseY - baseH * 0.6);
        ctx.lineTo(-baseW * 0.65, baseY - baseH * 0.6);
        ctx.closePath();
        const platBaseGrad = ctx.createLinearGradient(0, baseY - baseH * 0.6, 0, baseY + baseH * 0.7);
        platBaseGrad.addColorStop(0, '#1a050d');
        platBaseGrad.addColorStop(0.5, '#0d0208');
        platBaseGrad.addColorStop(1, '#050104');
        ctx.fillStyle = platBaseGrad;
        ctx.fill();
        ctx.strokeStyle = '#ff1744';
        ctx.lineWidth = Math.max(1.0, 1.4 * s);
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = (8 + beatPulse * 10) * s;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, baseY - baseH * 0.55);
        ctx.lineTo(baseW * 0.85, baseY);
        ctx.lineTo(0, baseY + baseH * 0.55);
        ctx.lineTo(-baseW * 0.85, baseY);
        ctx.closePath();
        const floorGrad = ctx.createLinearGradient(0, baseY - baseH * 0.55, 0, baseY + baseH * 0.55);
        floorGrad.addColorStop(0, '#2d0818');
        floorGrad.addColorStop(0.5, '#12030a');
        floorGrad.addColorStop(1, '#060105');
        ctx.fillStyle = floorGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 23, 68, 0.75)';
        ctx.lineWidth = 1.0 * s;
        ctx.stroke();

        [-baseW * 0.55, -baseW * 0.25, baseW * 0.25, baseW * 0.55].forEach((gx) => {
            ctx.beginPath();
            ctx.moveTo(gx, baseY);
            ctx.lineTo(0, baseY);
            ctx.strokeStyle = `rgba(255, 23, 68, ${0.45 + beatPulse * 0.45})`;
            ctx.lineWidth = 1.2 * s;
            ctx.stroke();
        });

        const wellR = (7.5 + beatPulse * 3.5) * s;
        ctx.beginPath();
        ctx.ellipse(0, baseY, wellR, wellR * 0.55, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = (14 + beatPulse * 20) * s;
        ctx.fill();

        if (playing && beatPulse > 0.28) {
            const rippleR = wellR * (1.2 + beatPulse * 1.5);
            ctx.beginPath();
            ctx.ellipse(0, baseY, rippleR, rippleR * 0.55, 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.85 * (1.0 - beatPulse * 0.5)})`;
            ctx.lineWidth = 1.2 * s;
            ctx.stroke();
        }

        [-baseW * 0.7, -baseW * 0.35, baseW * 0.35, baseW * 0.7].forEach((px, pIdx) => {
            const py = (pIdx === 0 || pIdx === 3) ? baseY : baseY - baseH * 0.35;
            const pilH = (8 + ((pIdx % 2) * 4)) * s;
            ctx.beginPath();
            ctx.moveTo(px - 1.8 * s, py);
            ctx.lineTo(px, py - pilH);
            ctx.lineTo(px + 1.8 * s, py);
            ctx.closePath();
            ctx.fillStyle = '#0a0106';
            ctx.fill();
            ctx.strokeStyle = '#ff1744';
            ctx.lineWidth = 0.9 * s;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(px, py - pilH, 1.2 * s, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#ff1744';
            ctx.shadowBlur = 6 * s;
            ctx.fill();
        });
        ctx.restore();

        const coreCenterY = -12 * s - (beatPulse * 3.5 * s);
        const coreW = (13 + smoothBass * 4 + beatPulse * 5) * s;
        const coreH = (22 + smoothBass * 5 + beatPulse * 7) * s;

        ctx.save();
        ctx.translate(0, coreCenterY);
        const haloRot = now * 0.0018;
        ctx.rotate(haloRot);
        const haloRingR = coreH * 0.82;
        ctx.beginPath();
        ctx.ellipse(0, 0, haloRingR, haloRingR * 0.45, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 23, 68, 0.45)';
        ctx.lineWidth = 1.0 * s;
        ctx.stroke();

        for (let sh = 0; sh < 4; sh++) {
            const shAng = (sh * Math.PI) / 2;
            const shx = Math.cos(shAng) * haloRingR;
            const shy = Math.sin(shAng) * haloRingR * 0.45;
            ctx.save();
            ctx.translate(shx, shy);
            ctx.rotate(shAng + haloRot);
            ctx.beginPath();
            ctx.moveTo(0, -3.2 * s);
            ctx.lineTo(2.2 * s, 0);
            ctx.lineTo(0, 3.2 * s);
            ctx.lineTo(-2.2 * s, 0);
            ctx.closePath();
            ctx.fillStyle = '#060105';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.8 * s;
            ctx.shadowColor = '#ff1744';
            ctx.shadowBlur = 6 * s;
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();

        ctx.save();
        ctx.translate(0, coreCenterY);
        ctx.beginPath();
        ctx.moveTo(-coreW * 1.15, -coreH * 0.35);
        ctx.lineTo(-coreW * 0.7, -coreH * 0.75);
        ctx.lineTo(-coreW * 0.5, 0);
        ctx.lineTo(-coreW * 0.7, coreH * 0.75);
        ctx.lineTo(-coreW * 1.15, coreH * 0.35);
        ctx.closePath();
        ctx.fillStyle = '#080106';
        ctx.fill();
        ctx.strokeStyle = '#ff1744';
        ctx.lineWidth = 1.1 * s;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(coreW * 1.15, -coreH * 0.35);
        ctx.lineTo(coreW * 0.7, -coreH * 0.75);
        ctx.lineTo(coreW * 0.5, 0);
        ctx.lineTo(coreW * 0.7, coreH * 0.75);
        ctx.lineTo(coreW * 1.15, coreH * 0.35);
        ctx.closePath();
        ctx.fillStyle = '#080106';
        ctx.fill();
        ctx.strokeStyle = '#ff1744';
        ctx.lineWidth = 1.1 * s;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, -coreH);
        ctx.lineTo(coreW, 0);
        ctx.lineTo(0, coreH);
        ctx.lineTo(-coreW, 0);
        ctx.closePath();
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreH);
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.25, '#ff5252');
        coreGrad.addColorStop(0.65, '#d50000');
        coreGrad.addColorStop(0.9, '#5f091c');
        coreGrad.addColorStop(1, '#1a0105');
        ctx.fillStyle = coreGrad;
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = (16 + beatPulse * 24) * s;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.0, 1.4 * s);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, -coreH);
        ctx.lineTo(0, coreH);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();

        ctx.restore();

        ctx.fillStyle = 'rgba(255, 23, 68, 0.9)';
        ctx.font = `700 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = 6 * s;
        ctx.fillText('// ATLAS INTERFACE // PROTOCOL 16.16.16 // KORE //', 0, 20 * s);

        ctx.restore();
    }

    // -------------------------------------------------------------------------
    // Brutalist Minimalism: Platter Center Hub & Thematic Core
    // Razor hairlines, zero blur, monolithic precision, stark high contrast
    // -------------------------------------------------------------------------
    function drawTurntableCenterBrutalist(ctx, width, height, variantOrLight, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
        if (!ctx || width === 0 || height === 0) return;
        const cx = width / 2;
        const cy = height / 2;
        const s = Math.min(1.25, Math.max(0.65, width / 180));

        ctx.save();
        ctx.translate(cx, cy);

        const variant = (variantOrLight === true || variantOrLight === 'light') ? 'light'
            : (variantOrLight === 'warm' ? 'warm' : (variantOrLight === 'obsidian' ? 'obsidian' : 'dark'));
        const isLight = (variant === 'light' || variant === 'warm');

        let fgColor = isLight ? '#000000' : '#ffffff';
        let bgColor = isLight ? '#ffffff' : '#0c0c0e';
        let subColor = isLight ? '#52525b' : '#a1a1aa';
        let hairline = isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.18)';
        let spindleFill = isLight ? '#f4f4f5' : '#000000';
        let badgeTag = 'MINIMALIST';

        if (variant === 'warm') {
            fgColor = '#1c1917';
            bgColor = '#faf8f5';
            subColor = '#d97706';
            hairline = 'rgba(217, 119, 6, 0.28)';
            spindleFill = '#f3eee6';
            badgeTag = 'WARM PAPER';
        } else if (variant === 'obsidian') {
            fgColor = '#38bdf8';
            bgColor = '#000000';
            subColor = '#94a3b8';
            hairline = 'rgba(56, 189, 248, 0.28)';
            spindleFill = '#050505';
            badgeTag = 'OBSIDIAN';
        }

        // 1. Center Matte Minimalist Label Disc
        const labelR = 48 * s;
        ctx.beginPath();
        ctx.arc(0, 0, labelR, 0, Math.PI * 2);
        ctx.fillStyle = bgColor;
        ctx.fill();
        ctx.lineWidth = 2.0 * s;
        ctx.strokeStyle = fgColor;
        ctx.stroke();

        // 2. Concentric calibrated hairline rings
        ctx.beginPath();
        ctx.arc(0, 0, labelR * 0.82, 0, Math.PI * 2);
        ctx.lineWidth = 0.8 * s;
        ctx.strokeStyle = hairline;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, labelR * 0.55, 0, Math.PI * 2);
        ctx.stroke();

        // 3. Spindle Hole Ring
        const spindleR = 10 * s;
        ctx.beginPath();
        ctx.arc(0, 0, spindleR, 0, Math.PI * 2);
        ctx.fillStyle = spindleFill;
        ctx.fill();
        ctx.lineWidth = 1.6 * s;
        ctx.strokeStyle = fgColor;
        ctx.stroke();

        // Spindle center pin
        ctx.beginPath();
        ctx.arc(0, 0, 3.5 * s, 0, Math.PI * 2);
        ctx.fillStyle = fgColor;
        ctx.fill();

        // 4. Clean Audio Reactive Ring (Zero clutter)
        if (playing) {
            const pulseR = spindleR + (12 + smoothBass * 16 + beatPulse * 8) * s;
            ctx.beginPath();
            ctx.arc(0, 0, Math.min(labelR * 0.82, pulseR), 0, Math.PI * 2);
            ctx.lineWidth = 1.2 * s;
            ctx.strokeStyle = fgColor;
            ctx.stroke();
        }

        // 5. 4 Cardinal Alignment Ticks
        const tLen = 4 * s;
        ctx.lineWidth = 1.0 * s;
        ctx.strokeStyle = fgColor;
        ctx.beginPath();
        ctx.moveTo(-labelR, 0); ctx.lineTo(-labelR + tLen, 0);
        ctx.moveTo(labelR, 0); ctx.lineTo(labelR - tLen, 0);
        ctx.moveTo(0, -labelR); ctx.lineTo(0, -labelR + tLen);
        ctx.moveTo(0, labelR); ctx.lineTo(0, labelR - tLen);
        ctx.stroke();

        // 6. Monospaced Circular Alignment Text
        ctx.save();
        ctx.font = `800 ${Math.max(5, Math.round(5.5 * s))}px monospace`;
        ctx.fillStyle = fgColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('33⅓ RPM • HI-FI', 0, -26 * s);
        ctx.fillStyle = subColor;
        ctx.fillText(badgeTag, 0, 26 * s);
        ctx.restore();

        ctx.restore();
    }

    function drawThematicBrutalistCore(ctx, cx, cy, s, isLight, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();
        ctx.translate(cx, cy);

        const fgColor = isLight ? '#000000' : '#ffffff';
        const subColor = isLight ? '#52525b' : '#a1a1aa';
        const hairline = isLight ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.2)';
        const hairlineSolid = isLight ? '#000000' : '#ffffff';

        // Minimalist Architectural Geometric Framework
        ctx.shadowBlur = 0;

        // Outer Calibrated Minimalist Reticle Ring
        const baseR = (30 + beatPulse * 6) * s;
        ctx.beginPath();
        ctx.arc(0, 0, baseR, 0, Math.PI * 2);
        ctx.strokeStyle = hairlineSolid;
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();

        // Secondary concentric hairline ring
        ctx.beginPath();
        ctx.arc(0, 0, baseR * 0.72, 0, Math.PI * 2);
        ctx.strokeStyle = hairline;
        ctx.lineWidth = 0.8 * s;
        ctx.setLineDash([3 * s, 3 * s]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 4 Cardinal Axis Hairlines & Millimeter Ticks
        const tickLen = 6 * s;
        ctx.strokeStyle = hairlineSolid;
        ctx.lineWidth = 1.0 * s;

        // Crosshairs
        ctx.beginPath();
        ctx.moveTo(-baseR - tickLen, 0); ctx.lineTo(-baseR + tickLen, 0);
        ctx.moveTo(baseR - tickLen, 0); ctx.lineTo(baseR + tickLen, 0);
        ctx.moveTo(0, -baseR - tickLen); ctx.lineTo(0, -baseR + tickLen);
        ctx.moveTo(0, baseR - tickLen); ctx.lineTo(0, baseR + tickLen);
        ctx.stroke();

        // Center Crosshair
        const centerCross = (5 + smoothBass * 3) * s;
        ctx.beginPath();
        ctx.moveTo(-centerCross, 0); ctx.lineTo(centerCross, 0);
        ctx.moveTo(0, -centerCross); ctx.lineTo(0, centerCross);
        ctx.stroke();

        // Dynamic Architectural Rotating Box Frame in the Center
        const boxSize = (14 + smoothBass * 8 + beatPulse * 4) * s;
        ctx.save();
        if (playing) {
            ctx.rotate((now * 0.0008) % (Math.PI * 2));
        }
        ctx.strokeStyle = hairlineSolid;
        ctx.lineWidth = 1.5 * s;
        ctx.strokeRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);

        // Inner solid core dot
        ctx.fillStyle = hairlineSolid;
        ctx.beginPath();
        ctx.arc(0, 0, 2.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Monospaced Architectural HUD Typography Above & Below
        ctx.font = `700 ${Math.max(6, Math.round(7 * s))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = fgColor;
        const dbVal = playing ? (-18 + Math.round((smoothBass + beatPulse) * 12)) : -48;
        ctx.fillText(`[ ${dbVal > 0 ? '+' : ''}${dbVal} dBFS ] LINEAR_RMS`, 0, -baseR - 10 * s);

        ctx.fillStyle = subColor;
        ctx.font = `600 ${Math.max(5, Math.round(6 * s))}px monospace`;
        ctx.fillText(isLight ? 'MINIMALIST // 0-CLUTTER // LIGHT' : 'MINIMALIST // 0-CLUTTER // DARK', 0, baseR + 10 * s);

        ctx.restore();
    }

    function drawThematicMinimalistWarmCore(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();
        ctx.translate(cx, cy);

        const fgColor = '#1c1917';
        const subColor = '#78716c';
        const amberColor = '#d97706';

        ctx.shadowBlur = 0;

        // Outer Calibrated Reticle Dial Ring in Terracotta Amber
        const baseR = (28 + beatPulse * 5) * s;
        ctx.beginPath();
        ctx.arc(0, 0, baseR, 0, Math.PI * 2);
        ctx.strokeStyle = amberColor;
        ctx.lineWidth = 1.4 * s;
        ctx.stroke();

        // Concentric ivory dial track
        ctx.beginPath();
        ctx.arc(0, 0, baseR * 0.74, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.25)';
        ctx.lineWidth = 0.8 * s;
        ctx.setLineDash([3 * s, 3 * s]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 12-Hour Geometric Studio Graduation Pips
        for (let a = 0; a < 12; a++) {
            const angle = (a / 12) * Math.PI * 2;
            const r1 = baseR - 3 * s;
            const r2 = baseR + (a % 3 === 0 ? 5 : 2) * s;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
            ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
            ctx.strokeStyle = (a % 3 === 0) ? amberColor : 'rgba(28, 25, 23, 0.4)';
            ctx.lineWidth = (a % 3 === 0) ? 1.2 * s : 0.8 * s;
            ctx.stroke();
        }

        // Tactile Center Rotating Amber Rotor
        const rotorSize = (14 + smoothBass * 7 + beatPulse * 4) * s;
        ctx.save();
        if (playing) {
            ctx.rotate((now * 0.0006) % (Math.PI * 2));
        }
        ctx.fillStyle = '#faf8f5';
        ctx.strokeStyle = amberColor;
        ctx.lineWidth = 1.4 * s;
        ctx.beginPath();
        ctx.arc(0, 0, rotorSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Amber Core Hotspot
        ctx.fillStyle = amberColor;
        ctx.beginPath();
        ctx.arc(0, 0, (2.8 + snarePulse * 1.5) * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Precision Editorial Typography Above & Below
        ctx.font = `700 ${Math.max(6, Math.round(7 * s))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = amberColor;
        const dbVal = playing ? (-18 + Math.round((smoothBass + beatPulse) * 12)) : -48;
        ctx.fillText(`[ ${dbVal > 0 ? '+' : ''}${dbVal} dBFS ] WARM_MASTER`, 0, -baseR - 8 * s);

        ctx.fillStyle = fgColor;
        ctx.font = `600 ${Math.max(5, Math.round(6 * s))}px monospace`;
        ctx.fillText('MINIMALIST // NORDIC PAPER // AMBER', 0, baseR + 10 * s);

        ctx.restore();
    }

    function drawThematicMinimalistObsidianCore(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();
        ctx.translate(cx, cy);

        const subColor = '#94a3b8';
        const cyanColor = '#38bdf8';

        ctx.shadowBlur = 0;

        // Outer Calibrated Reticle Dial Ring in Pure Platinum White
        const baseR = (28 + beatPulse * 6) * s;
        ctx.beginPath();
        ctx.arc(0, 0, baseR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();

        // Concentric Electric Cyan Reticle Ring with subtle pulse
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, baseR * 0.72, 0, Math.PI * 2);
        ctx.strokeStyle = cyanColor;
        ctx.shadowColor = cyanColor;
        ctx.shadowBlur = playing ? (6 + beatPulse * 8) * s : 3 * s;
        ctx.lineWidth = 1.0 * s;
        ctx.setLineDash([4 * s, 3 * s]);
        ctx.stroke();
        ctx.restore();

        // 4 Cardinal Axis Laser Hairlines
        const tickLen = 6 * s;
        ctx.strokeStyle = cyanColor;
        ctx.lineWidth = 1.0 * s;
        ctx.beginPath();
        ctx.moveTo(-baseR - tickLen, 0); ctx.lineTo(-baseR + tickLen, 0);
        ctx.moveTo(baseR - tickLen, 0); ctx.lineTo(baseR + tickLen, 0);
        ctx.moveTo(0, -baseR - tickLen); ctx.lineTo(0, -baseR + tickLen);
        ctx.moveTo(0, baseR - tickLen); ctx.lineTo(0, baseR + tickLen);
        ctx.stroke();

        // Precision Center Rotating Obsidian Diamond
        const diamondSize = (13 + smoothBass * 7 + beatPulse * 4) * s;
        ctx.save();
        if (playing) {
            ctx.rotate((now * 0.0009) % (Math.PI * 2));
        }
        ctx.strokeStyle = cyanColor;
        ctx.shadowColor = cyanColor;
        ctx.shadowBlur = (4 + beatPulse * 6) * s;
        ctx.lineWidth = 1.5 * s;
        ctx.strokeRect(-diamondSize / 2, -diamondSize / 2, diamondSize, diamondSize);

        // Core White Hotspot
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 5 * s;
        ctx.beginPath();
        ctx.arc(0, 0, 2.2 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Precision Monospaced Typography Above & Below
        ctx.font = `700 ${Math.max(6, Math.round(7 * s))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = cyanColor;
        const dbVal = playing ? (-18 + Math.round((smoothBass + beatPulse) * 12)) : -48;
        ctx.fillText(`[ ${dbVal > 0 ? '+' : ''}${dbVal} dBFS ] ZERO_WATT_RMS`, 0, -baseR - 8 * s);

        ctx.fillStyle = subColor;
        ctx.font = `600 ${Math.max(5, Math.round(6 * s))}px monospace`;
        ctx.fillText('MINIMALIST // OBSIDIAN OLED // ICE_CYAN', 0, baseR + 10 * s);

        ctx.restore();
    }


    // 2. Default: Touhou Spirit Core & Floating Yin-Yang Medallion
    function drawThematicDefaultCore(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();
        ctx.translate(cx, cy);

        const hScale = (0.75 + smoothBass * 0.18 + beatPulse * 0.22) * s;

        // Ambient Radial Bloom
        const glowR = (36 + beatPulse * 18) * s;
        const glowGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, glowR);
        glowGrad.addColorStop(0, `rgba(255, 255, 255, ${0.45 + beatPulse * 0.35})`);
        glowGrad.addColorStop(0.5, `rgba(255, 255, 255, ${0.12 + beatPulse * 0.15})`);
        glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Dashed Outer Rune Ring with 8 Radial Trigram Ticks
        ctx.save();
        ctx.rotate(runeRingAngle);
        const rRing = (28 + beatPulse * 4) * s;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.65 + beatPulse * 0.35})`;
        ctx.lineWidth = Math.max(0.8, 1.1 * s);
        ctx.setLineDash([Math.round(4 * s), Math.round(5 * s)]);
        ctx.beginPath();
        ctx.arc(0, 0, rRing, 0, Math.PI * 2);
        ctx.stroke();

        for (let a = 0; a < 8; a++) {
            const angle = (a * Math.PI) / 4;
            const r1 = rRing - 3 * s;
            const r2 = rRing + 3 * s;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
            ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
            ctx.stroke();
        }
        ctx.restore();

        // Counter-rotating Harmonic Ring
        ctx.save();
        ctx.rotate(-runeRingAngle * 1.4);
        const rInner = (20 + snarePulse * 4) * s;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + snarePulse * 0.35})`;
        ctx.lineWidth = Math.max(0.8, 1.0 * s);
        ctx.setLineDash([Math.round(2 * s), Math.round(4 * s)]);
        ctx.beginPath();
        ctx.arc(0, 0, rInner, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Solid White Touhou Heart Silhouette
        ctx.save();
        ctx.scale(hScale, hScale);
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.bezierCurveTo(-7, -20, -22, -18, -22, -5);
        ctx.bezierCurveTo(-22, 7, -12, 16, 0, 22);
        ctx.bezierCurveTo(12, 16, 22, 7, 22, -5);
        ctx.bezierCurveTo(22, -18, 7, -20, 0, -7);
        ctx.closePath();

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = (10 + beatPulse * 16) * s;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1.0;
        ctx.stroke();

        // Rotating Yin-Yang Medallion in Heart Center
        ctx.save();
        ctx.translate(0, 1.2);
        ctx.rotate(yinYangAngle);
        const r = 8.5;

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
        ctx.fillStyle = '#000000';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, -r / 2, r / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, r / 2, r / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, -r / 2, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, r / 2, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.restore();

        ctx.restore();

        // Subtitle Tag
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = `600 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('◆ REIMU RESONANCE CORE ◆', 0, 26 * s);

        ctx.restore();
    }

    // 3. Solar Eclipse: Helios Solar Scout Cruiser
    function drawThematicSolarCruiser(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();
        const hoverY = playing ? Math.sin(now * 0.003) * (2.4 * s) : 0;
        ctx.translate(cx, cy + hoverY);

        // Solar Corona Ring & Prominence Plasma Flares
        const coronaR = (17 + beatPulse * 5) * s;
        ctx.save();
        const coronaGrad = ctx.createRadialGradient(0, 0, coronaR * 0.6, 0, 0, coronaR * 1.8);
        coronaGrad.addColorStop(0, '#ffffff');
        coronaGrad.addColorStop(0.25, '#00f0ff');
        coronaGrad.addColorStop(0.65, '#ff007f');
        coronaGrad.addColorStop(1, 'rgba(255, 0, 127, 0)');
        ctx.fillStyle = coronaGrad;
        ctx.beginPath();
        ctx.arc(0, 0, coronaR * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // 8 Solar Prominence Flares
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4 + now * 0.0012;
            const flareLen = (coronaR * 1.1) + Math.sin(now * 0.006 + i) * (5 * s) + (beatPulse * 9 * s);
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * (coronaR * 0.8), Math.sin(angle) * (coronaR * 0.8));
            ctx.lineTo(Math.cos(angle) * flareLen, Math.sin(angle) * flareLen);
            ctx.strokeStyle = i % 2 === 0 ? '#00f0ff' : '#ff007f';
            ctx.lineWidth = Math.max(0.8, (1.2 + beatPulse * 0.8) * s);
            ctx.stroke();
        }

        // Dark Eclipse Core Disc
        ctx.beginPath();
        ctx.arc(0, 0, coronaR * 0.72, 0, Math.PI * 2);
        ctx.fillStyle = '#06020c';
        ctx.fill();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = Math.max(0.9, 1.2 * s);
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 8 * s;
        ctx.stroke();
        ctx.restore();

        // Helios Solar Scout Cruiser
        ctx.save();
        // Left Wing Crescent
        ctx.beginPath();
        ctx.moveTo(-4 * s, 0);
        ctx.bezierCurveTo(-14 * s, -14 * s, -28 * s, -10 * s, -25 * s, 6 * s);
        ctx.bezierCurveTo(-22 * s, 10 * s, -12 * s, 6 * s, -4 * s, 4 * s);
        ctx.closePath();
        const wingGradL = ctx.createLinearGradient(-26 * s, 0, 0, 0);
        wingGradL.addColorStop(0, '#00f0ff');
        wingGradL.addColorStop(0.6, '#7928ca');
        wingGradL.addColorStop(1, '#ff007f');
        ctx.fillStyle = wingGradL;
        ctx.fill();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = Math.max(0.8, 1.1 * s);
        ctx.stroke();

        // Right Wing Crescent
        ctx.beginPath();
        ctx.moveTo(4 * s, 0);
        ctx.bezierCurveTo(14 * s, -14 * s, 28 * s, -10 * s, 25 * s, 6 * s);
        ctx.bezierCurveTo(22 * s, 10 * s, 12 * s, 6 * s, 4 * s, 4 * s);
        ctx.closePath();
        const wingGradR = ctx.createLinearGradient(26 * s, 0, 0, 0);
        wingGradR.addColorStop(0, '#00f0ff');
        wingGradR.addColorStop(0.6, '#7928ca');
        wingGradR.addColorStop(1, '#ff007f');
        ctx.fillStyle = wingGradR;
        ctx.fill();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = Math.max(0.8, 1.1 * s);
        ctx.stroke();

        // Center Sensor Fuselage
        ctx.beginPath();
        ctx.moveTo(0, -16 * s);
        ctx.lineTo(3.5 * s, -4 * s);
        ctx.lineTo(3.0 * s, 8 * s);
        ctx.lineTo(0, 11 * s);
        ctx.lineTo(-3.0 * s, 8 * s);
        ctx.lineTo(-3.5 * s, -4 * s);
        ctx.closePath();
        ctx.fillStyle = '#0a0212';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.0 * s;
        ctx.stroke();

        // Solar Ion Discharge Trail
        const trailLen = (12 + smoothBass * 22 + beatPulse * 25) * s;
        const trailGrad = ctx.createLinearGradient(0, 11 * s, 0, 11 * s + trailLen);
        trailGrad.addColorStop(0, '#ff007f');
        trailGrad.addColorStop(0.5, '#00f0ff');
        trailGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
        ctx.beginPath();
        ctx.moveTo(-2 * s, 11 * s);
        ctx.lineTo(0, 11 * s + trailLen);
        ctx.lineTo(2 * s, 11 * s);
        ctx.closePath();
        ctx.fillStyle = trailGrad;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = (8 + beatPulse * 12) * s;
        ctx.fill();
        ctx.restore();

        // Telemetry Subtitle
        ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
        ctx.font = `600 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('// HELIOS-IV SOLAR SCOUT //', 0, 25 * s);

        ctx.restore();
    }

    // 4. Euclid Horizon: Orbital Space Station (No Man's Sky)
    function drawThematicSpaceStation(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();
        const hoverY = playing ? Math.sin(now * 0.0022) * (2.0 * s) : 0;
        const rollAng = playing ? Math.sin(now * 0.0012) * 0.025 : 0;
        ctx.translate(cx, cy + hoverY);
        ctx.rotate(rollAng);

        const glowR = (36 + smoothBass * 20 + beatPulse * 28) * s;
        const glowGrad = ctx.createRadialGradient(0, 0, 4 * s, 0, 0, glowR);
        glowGrad.addColorStop(0, 'rgba(251, 191, 36, 0.35)');
        glowGrad.addColorStop(0.4, 'rgba(20, 184, 166, 0.18)');
        glowGrad.addColorStop(1, 'rgba(10, 5, 21, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, glowR, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        ctx.save();
        const arraySpread = 32 * s;
        [-arraySpread, arraySpread].forEach((bx, bIdx) => {
            ctx.beginPath();
            ctx.moveTo(bIdx === 0 ? -16 * s : 16 * s, -2 * s);
            ctx.lineTo(bx, -2 * s);
            ctx.lineTo(bx, 2 * s);
            ctx.lineTo(bIdx === 0 ? -16 * s : 16 * s, 2 * s);
            ctx.closePath();
            ctx.fillStyle = '#0f172a';
            ctx.fill();
            ctx.strokeStyle = '#14b8a6';
            ctx.lineWidth = 1.0 * s;
            ctx.stroke();

            const panW = 10 * s;
            const panH = 22 * s;
            const panX = bIdx === 0 ? bx - panW : bx;
            const panY = -panH / 2;
            ctx.beginPath();
            ctx.rect(panX, panY, panW, panH);
            const panGrad = ctx.createLinearGradient(panX, panY, panX + panW, panY + panH);
            panGrad.addColorStop(0, '#1e293b');
            panGrad.addColorStop(0.5, '#0e3a3f');
            panGrad.addColorStop(1, '#0a101d');
            ctx.fillStyle = panGrad;
            ctx.fill();
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = Math.max(0.9, 1.2 * s);
            ctx.stroke();

            for (let c = 1; c < 4; c++) {
                ctx.beginPath();
                ctx.moveTo(panX, panY + (c * panH) / 4);
                ctx.lineTo(panX + panW, panY + (c * panH) / 4);
                ctx.strokeStyle = 'rgba(20, 184, 166, 0.45)';
                ctx.lineWidth = 0.7 * s;
                ctx.stroke();
            }

            const tipColor = bIdx === 0 ? '#f43f5e' : '#14b8a6';
            const strobeAlpha = Math.sin(now * 0.008 + bIdx * Math.PI) > 0 ? 0.95 : 0.25;
            ctx.beginPath();
            ctx.arc(bIdx === 0 ? panX : panX + panW, 0, 1.8 * s, 0, Math.PI * 2);
            ctx.fillStyle = tipColor;
            ctx.shadowColor = tipColor;
            ctx.shadowBlur = (8 * strobeAlpha) * s;
            ctx.fill();
        });
        ctx.restore();

        ctx.save();
        const hullW = 20 * s;
        const hullH = 24 * s;

        ctx.beginPath();
        ctx.moveTo(-hullW * 0.55, -hullH);
        ctx.lineTo(hullW * 0.55, -hullH);
        ctx.lineTo(hullW, -hullH * 0.55);
        ctx.lineTo(hullW, hullH * 0.55);
        ctx.lineTo(hullW * 0.55, hullH);
        ctx.lineTo(-hullW * 0.55, hullH);
        ctx.lineTo(-hullW, hullH * 0.55);
        ctx.lineTo(-hullW, -hullH * 0.55);
        ctx.closePath();
        const hullGrad = ctx.createLinearGradient(0, -hullH, 0, hullH);
        hullGrad.addColorStop(0, '#1e293b');
        hullGrad.addColorStop(0.35, '#0f172a');
        hullGrad.addColorStop(0.7, '#070b14');
        hullGrad.addColorStop(1, '#020408');
        ctx.fillStyle = hullGrad;
        ctx.fill();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = Math.max(1.2, 1.6 * s);
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = (10 + beatPulse * 12) * s;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-hullW * 0.55, -hullH);
        ctx.lineTo(-hullW * 0.45, -hullH * 0.35);
        ctx.lineTo(hullW * 0.45, -hullH * 0.35);
        ctx.lineTo(hullW * 0.55, -hullH);
        ctx.strokeStyle = 'rgba(20, 184, 166, 0.65)';
        ctx.lineWidth = 1.0 * s;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, -hullH);
        ctx.lineTo(0, -hullH - 8 * s);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -hullH - 8 * s, 1.4 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#14b8a6';
        ctx.shadowColor = '#14b8a6';
        ctx.shadowBlur = 8 * s;
        ctx.fill();

        const bayW = 11 * s;
        const bayH = 14 * s;
        ctx.beginPath();
        ctx.rect(-bayW, -bayH / 2, bayW * 2, bayH);
        ctx.fillStyle = '#040208';
        ctx.fill();
        ctx.strokeStyle = '#14b8a6';
        ctx.lineWidth = Math.max(1.0, 1.4 * s);
        ctx.stroke();

        const runwayGrad = ctx.createLinearGradient(0, -bayH / 2, 0, bayH / 2);
        runwayGrad.addColorStop(0, '#fbbf24');
        runwayGrad.addColorStop(0.5, '#ffffff');
        runwayGrad.addColorStop(1, '#fbbf24');
        ctx.beginPath();
        ctx.rect(-bayW * 0.85, -2.5 * s, bayW * 1.7, 5 * s);
        ctx.fillStyle = runwayGrad;
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = (12 + beatPulse * 16) * s;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-bayW, 0);
        ctx.lineTo(bayW, 0);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4 * s;
        ctx.stroke();

        [-bayW * 0.6, 0, bayW * 0.6].forEach((rx) => {
            ctx.beginPath();
            ctx.arc(rx, 0, (1.2 + snarePulse * 0.8) * s, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        });
        ctx.restore();

        ctx.save();
        ctx.fillStyle = 'rgba(251, 191, 36, 0.85)';
        ctx.font = `700 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 6 * s;
        ctx.fillText('// ORBITAL STATION // DOCKING RUNWAY ACTIVE //', 0, 26 * s);

        const retW = 28 * s;
        ctx.strokeStyle = 'rgba(20, 184, 166, 0.65)';
        ctx.lineWidth = 1.0 * s;
        ctx.beginPath();
        ctx.moveTo(-retW, -8 * s);
        ctx.lineTo(-retW - 3 * s, -8 * s);
        ctx.lineTo(-retW - 3 * s, 8 * s);
        ctx.lineTo(-retW, 8 * s);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(retW, -8 * s);
        ctx.lineTo(retW + 3 * s, -8 * s);
        ctx.lineTo(retW + 3 * s, 8 * s);
        ctx.lineTo(retW, 8 * s);
        ctx.stroke();
        ctx.restore();

        ctx.restore();
    }


    // 5. Alien Paradise: Bioluminescent Xenobiological Manta Bio-Vessel
    function drawThematicAlienBioManta(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();
        const hoverY = playing ? Math.sin(now * 0.0028) * (2.8 * s) : 0;
        ctx.translate(cx, cy + hoverY);

        const flap = Math.sin(now * 0.0036) * (6 * s);

        // Translucent Bioluminescent Manta Body
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, -18 * s);
        ctx.bezierCurveTo(-10 * s, -14 * s, -28 * s, -6 * s + flap, -30 * s, 4 * s + flap);
        ctx.bezierCurveTo(-26 * s, 10 * s + flap, -12 * s, 8 * s, -4 * s, 12 * s);
        ctx.lineTo(0, 14 * s);
        ctx.lineTo(4 * s, 12 * s);
        ctx.bezierCurveTo(12 * s, 8 * s, 26 * s, 10 * s + flap, 30 * s, 4 * s + flap);
        ctx.bezierCurveTo(28 * s, -6 * s + flap, 10 * s, -14 * s, 0, -18 * s);
        ctx.closePath();

        const mantaGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 28 * s);
        mantaGrad.addColorStop(0, 'rgba(255, 42, 112, 0.9)');
        mantaGrad.addColorStop(0.45, 'rgba(0, 206, 209, 0.75)');
        mantaGrad.addColorStop(0.85, 'rgba(250, 204, 21, 0.35)');
        mantaGrad.addColorStop(1, 'rgba(0, 206, 209, 0.05)');
        ctx.fillStyle = mantaGrad;
        ctx.shadowColor = '#00ced1';
        ctx.shadowBlur = (10 + beatPulse * 14) * s;
        ctx.fill();

        ctx.strokeStyle = '#00ced1';
        ctx.lineWidth = Math.max(0.8, 1.2 * s);
        ctx.stroke();
        ctx.restore();

        // Luminous Ventral Photophore Nodes (Spine Bio-Lights)
        const spineNodes = [-11 * s, -6 * s, -1 * s, 4 * s, 9 * s];
        spineNodes.forEach((ny, idx) => {
            const nodePulse = Math.sin(now * 0.005 + idx * 0.8) * 0.3 + 0.7;
            const nodeR = (1.8 + beatPulse * 1.4) * s * nodePulse;
            ctx.beginPath();
            ctx.arc(0, ny, nodeR, 0, Math.PI * 2);
            ctx.fillStyle = idx % 2 === 0 ? '#ff2a70' : '#facc15';
            ctx.shadowColor = idx % 2 === 0 ? '#ff2a70' : '#facc15';
            ctx.shadowBlur = (6 + beatPulse * 8) * s;
            ctx.fill();
        });

        // Trailing Bioluminescent Antennae / Filaments
        ctx.save();
        [-3.5 * s, 3.5 * s].forEach((tx, i) => {
            ctx.beginPath();
            ctx.moveTo(tx, 14 * s);
            const wave1 = Math.sin(now * 0.004 + i) * (4 * s);
            const wave2 = Math.cos(now * 0.004 + i) * (6 * s);
            ctx.bezierCurveTo(tx + wave1, 20 * s, tx - wave2, 26 * s, tx + wave2, (32 + smoothBass * 14) * s);
            ctx.strokeStyle = `rgba(0, 206, 209, ${0.5 + snarePulse * 0.4})`;
            ctx.lineWidth = Math.max(0.7, 1.0 * s);
            ctx.shadowColor = '#00ced1';
            ctx.shadowBlur = 6 * s;
            ctx.stroke();
        });
        ctx.restore();

        // Subtitle
        ctx.fillStyle = 'rgba(0, 206, 209, 0.75)';
        ctx.font = `600 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('// XENO-BIOLOGICAL MANTA //', 0, 24 * s);

        ctx.restore();
    }

    // 6. Emeril Drive: Relativistic Hyperspace Warp Jump Simulation (No Man's Sky)
    function drawThematicEmerilWarpTunnel(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();
        ctx.translate(cx, cy);

        const numRings = 7;
        const maxRingR = 46 * s;
        ctx.save();
        for (let r = 0; r < numRings; r++) {
            const prog = ((now * 0.0018 + r / numRings) % 1.0);
            const ringR = Math.max(3 * s, prog * maxRingR);
            const ringAlpha = Math.sin(prog * Math.PI) * (0.45 + beatPulse * 0.45);
            ctx.beginPath();
            ctx.arc(0, 0, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = (r % 2 === 0)
                ? `rgba(0, 255, 170, ${ringAlpha})`
                : `rgba(16, 185, 129, ${ringAlpha})`;
            ctx.lineWidth = Math.max(1.0, (1.2 + prog * 2.2) * s);
            ctx.shadowColor = '#00ffaa';
            ctx.shadowBlur = (8 + beatPulse * 14) * s;
            ctx.stroke();
        }
        ctx.restore();

        const numStreaks = 36;
        ctx.save();
        for (let k = 0; k < numStreaks; k++) {
            const baseAng = (k * Math.PI * 2) / numStreaks;
            const ang = baseAng + Math.sin(k * 2.1 + now * 0.0008) * 0.08;
            const rStart = (4 + ((k * 13) % 16)) * s;
            const streakLen = (14 + smoothBass * 28 + beatPulse * 38) * s;
            const rEnd = rStart + streakLen;

            const cosA = Math.cos(ang);
            const sinA = Math.sin(ang);

            const isMint = (k % 3 === 0);
            const isWhite = (k % 5 === 0);
            const streakColor = isWhite ? '#ffffff' : (isMint ? '#00ffaa' : '#10b981');

            ctx.beginPath();
            ctx.moveTo(cosA * rStart, sinA * rStart);
            ctx.lineTo(cosA * rEnd, sinA * rEnd);
            ctx.strokeStyle = streakColor;
            ctx.lineWidth = Math.max(0.8, (1.1 + beatPulse * 1.4) * s);
            ctx.shadowColor = '#00ffaa';
            ctx.shadowBlur = (6 + beatPulse * 10) * s;
            ctx.stroke();

            if (isWhite || isMint) {
                ctx.beginPath();
                ctx.arc(cosA * rEnd, sinA * rEnd, (1.1 + beatPulse * 1.1) * s, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#00ffaa';
                ctx.shadowBlur = 8 * s;
                ctx.fill();
            }
        }
        ctx.restore();

        const coreR = (11 + smoothBass * 6 + beatPulse * 9) * s;
        const vortexGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
        vortexGrad.addColorStop(0, '#ffffff');
        vortexGrad.addColorStop(0.3, '#00ffaa');
        vortexGrad.addColorStop(0.65, '#059669');
        vortexGrad.addColorStop(0.9, '#022c22');
        vortexGrad.addColorStop(1, 'rgba(2, 44, 34, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, coreR, 0, Math.PI * 2);
        ctx.fillStyle = vortexGrad;
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = (18 + beatPulse * 28) * s;
        ctx.fill();

        ctx.save();
        ctx.rotate(now * 0.005);
        for (let sp = 0; sp < 4; sp++) {
            const spAng = (sp * Math.PI) / 2;
            ctx.beginPath();
            ctx.arc(0, 0, coreR * 0.65, spAng, spAng + 0.85);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.3 * s;
            ctx.stroke();
        }
        ctx.restore();

        if (playing && beatPulse > 0.38) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, coreR * 1.6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 24 * s;
            ctx.fill();
            ctx.restore();
        }

        ctx.save();
        ctx.fillStyle = 'rgba(0, 255, 170, 0.9)';
        ctx.font = `700 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = 6 * s;
        ctx.fillText('// EMERIL WARP // HYPERSPACE JUMP // CADMIUM-EMERIL-INDIUM //', 0, 26 * s);

        const retW = 30 * s;
        ctx.strokeStyle = 'rgba(0, 255, 170, 0.65)';
        ctx.lineWidth = 1.0 * s;
        ctx.beginPath();
        ctx.moveTo(-retW, -6 * s);
        ctx.lineTo(-retW - 3 * s, -6 * s);
        ctx.lineTo(-retW - 3 * s, 6 * s);
        ctx.lineTo(-retW, 6 * s);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(retW, -6 * s);
        ctx.lineTo(retW + 3 * s, -6 * s);
        ctx.lineTo(retW + 3 * s, 6 * s);
        ctx.lineTo(retW, 6 * s);
        ctx.stroke();
        ctx.restore();

        ctx.restore();
    }


    // 7. Dissonance: Corrupted Atlantideum Harmonic Monolith Spire (No Man's Sky)
    function drawThematicHarmonicMonolith(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();

        const hoverY = playing ? Math.sin(now * 0.0026) * (3.0 * s) : Math.sin(now * 0.0014) * (1.2 * s);
        ctx.translate(cx, cy + hoverY);

        const auraR = (34 + smoothBass * 22 + beatPulse * 28) * s;
        const auraGrad = ctx.createRadialGradient(0, 0, 4 * s, 0, 0, auraR);
        auraGrad.addColorStop(0, 'rgba(217, 70, 239, 0.45)');
        auraGrad.addColorStop(0.35, 'rgba(168, 85, 247, 0.22)');
        auraGrad.addColorStop(0.7, 'rgba(126, 34, 206, 0.08)');
        auraGrad.addColorStop(1, 'rgba(10, 2, 20, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, auraR, 0, Math.PI * 2);
        ctx.fillStyle = auraGrad;
        ctx.fill();

        if (playing && beatPulse > 0.25) {
            const waveR = (16 + beatPulse * 24) * s;
            ctx.beginPath();
            ctx.ellipse(0, 14 * s, waveR, waveR * 0.42, 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(217, 70, 239, ${0.75 * (1.0 - beatPulse * 0.5)})`;
            ctx.lineWidth = 1.2 * s;
            ctx.stroke();
        }

        for (let sat = 0; sat < 4; sat++) {
            const satAng = (sat * Math.PI) / 2 + now * 0.0018;
            const satDistX = 24 * s * Math.cos(satAng);
            const satDistY = 12 * s * Math.sin(satAng);
            ctx.save();
            ctx.translate(satDistX, satDistY);
            ctx.rotate(satAng);
            const satSz = 3.2 * s;
            ctx.beginPath();
            ctx.moveTo(0, -satSz);
            ctx.lineTo(satSz * 0.7, 0);
            ctx.lineTo(0, satSz);
            ctx.lineTo(-satSz * 0.7, 0);
            ctx.closePath();
            ctx.fillStyle = sat % 2 === 0 ? '#fae8ff' : '#d946ef';
            ctx.shadowColor = '#d946ef';
            ctx.shadowBlur = (8 + beatPulse * 10) * s;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.8 * s;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-satDistX * 0.45, -satDistY * 0.45);
            ctx.strokeStyle = `rgba(217, 70, 239, ${0.35 + beatPulse * 0.35})`;
            ctx.lineWidth = 0.8 * s;
            ctx.stroke();
            ctx.restore();
        }

        const monoW = (11 + beatPulse * 3.5) * s;
        const monoHTop = (24 + beatPulse * 5) * s;
        const monoHBot = 16 * s;

        ctx.beginPath();
        ctx.moveTo(0, -monoHTop);
        ctx.lineTo(-monoW, 0);
        ctx.lineTo(0, monoHBot);
        ctx.closePath();
        const monoGradL = ctx.createLinearGradient(-monoW, -monoHTop, 0, monoHBot);
        monoGradL.addColorStop(0, '#f5d0fe');
        monoGradL.addColorStop(0.3, '#d946ef');
        monoGradL.addColorStop(0.7, '#6b21a8');
        monoGradL.addColorStop(1, '#1e0538');
        ctx.fillStyle = monoGradL;
        ctx.shadowColor = '#d946ef';
        ctx.shadowBlur = (14 + beatPulse * 20) * s;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.0, 1.4 * s);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, -monoHTop);
        ctx.lineTo(monoW, 0);
        ctx.lineTo(0, monoHBot);
        ctx.closePath();
        const monoGradR = ctx.createLinearGradient(monoW, -monoHTop, 0, monoHBot);
        monoGradR.addColorStop(0, '#ffffff');
        monoGradR.addColorStop(0.35, '#c084fc');
        monoGradR.addColorStop(0.75, '#581c87');
        monoGradR.addColorStop(1, '#0e021a');
        ctx.fillStyle = monoGradR;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.0, 1.4 * s);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, -monoHTop);
        ctx.lineTo(0, monoHBot);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 1.4 * s;
        ctx.stroke();

        ctx.save();
        ctx.font = `800 ${Math.max(5, Math.round(5.5 * s))}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#d946ef';
        ctx.shadowBlur = 8 * s;
        ctx.textAlign = 'center';
        ctx.fillText('16.16.16', 0, -monoHTop * 0.35);
        ctx.fillText('ATLANTIS', 0, 0);
        ctx.fillText('ECHO // NULL', 0, monoHBot * 0.45);
        ctx.restore();

        ctx.fillStyle = 'rgba(217, 70, 239, 0.9)';
        ctx.font = `700 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.shadowColor = '#d946ef';
        ctx.shadowBlur = 6 * s;
        ctx.fillText('// HARMONIC RESONATOR // CORRUPTED ATLANTIDEUM //', 0, 26 * s);

        ctx.restore();
    }

    // 8. Sentinel Theme: Heavy Combat Patrol Drone (No Man's Sky Aeron Unit)
    function drawThematicSentinelDrone(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();

        // Anti-gravity levitation hover & mechanical banking
        const hoverY = playing ? Math.sin(now * 0.0036) * (3.2 * s) : Math.sin(now * 0.0018) * (1.2 * s);
        const bankAngle = playing ? (Math.sin(now * 0.0024) * 0.04 + (snarePulse * 0.03)) : 0;
        const droneY = cy + hoverY;

        ctx.translate(cx, droneY);
        ctx.rotate(bankAngle);

        // Lateral Ion Repulsor Jet Thrusters (Left & Right)
        const thrusterX = 14 * s;
        const thrusterY = 6 * s;
        const plumeLen = (18 + smoothBass * 32 + beatPulse * 38) * s;
        const plumeW = (4.8 + beatPulse * 2.8) * s;
        const isCombatJet = (playing && beatPulse > 0.40);

        [-thrusterX, thrusterX].forEach((tx) => {
            ctx.save();
            const jetGrad = ctx.createLinearGradient(tx, thrusterY, tx, thrusterY + plumeLen);
            if (isCombatJet) {
                jetGrad.addColorStop(0, '#ffffff');
                jetGrad.addColorStop(0.2, '#ff3d00');
                jetGrad.addColorStop(0.6, 'rgba(255, 61, 0, 0.45)');
                jetGrad.addColorStop(1, 'rgba(255, 61, 0, 0)');
            } else {
                jetGrad.addColorStop(0, '#ffffff');
                jetGrad.addColorStop(0.2, '#00e5ff');
                jetGrad.addColorStop(0.6, 'rgba(0, 229, 255, 0.45)');
                jetGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
            }

            ctx.beginPath();
            ctx.moveTo(tx - plumeW / 2, thrusterY);
            ctx.quadraticCurveTo(tx - plumeW * 0.6, thrusterY + plumeLen * 0.5, tx, thrusterY + plumeLen);
            ctx.quadraticCurveTo(tx + plumeW * 0.6, thrusterY + plumeLen * 0.5, tx + plumeW / 2, thrusterY);
            ctx.closePath();
            ctx.fillStyle = jetGrad;
            ctx.shadowColor = isCombatJet ? '#ff3d00' : '#00e5ff';
            ctx.shadowBlur = (12 + beatPulse * 18) * s;
            ctx.fill();
            ctx.restore();
        });

        // Articulated Lateral Ceramic Flare Winglets
        const flareSpread = playing ? (beatPulse * 3.8 * s) : 0;
        ctx.save();
        // Left Winglet
        ctx.beginPath();
        ctx.moveTo(-6 * s, -8 * s);
        ctx.lineTo(-24 * s - flareSpread, -2 * s);
        ctx.lineTo(-26 * s - flareSpread, 8 * s);
        ctx.lineTo(-12 * s, 6 * s);
        ctx.lineTo(-6 * s, 10 * s);
        ctx.closePath();
        ctx.fillStyle = '#f8fafc';
        ctx.fill();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = Math.max(0.9, 1.2 * s);
        ctx.stroke();

        // Right Winglet
        ctx.beginPath();
        ctx.moveTo(6 * s, -8 * s);
        ctx.lineTo(24 * s + flareSpread, -2 * s);
        ctx.lineTo(26 * s + flareSpread, 8 * s);
        ctx.lineTo(12 * s, 6 * s);
        ctx.lineTo(6 * s, 10 * s);
        ctx.closePath();
        ctx.fillStyle = '#f8fafc';
        ctx.fill();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = Math.max(0.9, 1.2 * s);
        ctx.stroke();
        ctx.restore();

        // Main Drone Body (Hardened Graphite Core & Matte Ceramic Shell)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, -22 * s);
        ctx.lineTo(10 * s, -10 * s);
        ctx.lineTo(12 * s, 4 * s);
        ctx.lineTo(7 * s, 14 * s);
        ctx.lineTo(-7 * s, 14 * s);
        ctx.lineTo(-12 * s, 4 * s);
        ctx.lineTo(-10 * s, -10 * s);
        ctx.closePath();
        const hullGrad = ctx.createLinearGradient(0, -22 * s, 0, 14 * s);
        hullGrad.addColorStop(0, '#ffffff');
        hullGrad.addColorStop(0.35, '#e2e8f0');
        hullGrad.addColorStop(0.7, '#1e293b');
        hullGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = hullGrad;
        ctx.fill();
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = Math.max(1.0, 1.4 * s);
        ctx.stroke();

        // Central Graphite Inset
        ctx.beginPath();
        ctx.moveTo(0, -16 * s);
        ctx.lineTo(6 * s, -6 * s);
        ctx.lineTo(6 * s, 8 * s);
        ctx.lineTo(-6 * s, 8 * s);
        ctx.lineTo(-6 * s, -6 * s);
        ctx.closePath();
        ctx.fillStyle = '#070a12';
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 0.8 * s;
        ctx.stroke();

        // Central Multi-Aperture Cyclops Optic
        const isAlertEye = (playing && beatPulse > 0.40);
        const eyeColor = isAlertEye ? '#ff3d00' : '#00e5ff';
        const eyeRadius = (4.8 + snarePulse * 1.5) * s;
        ctx.beginPath();
        ctx.arc(0, 0, eyeRadius, 0, Math.PI * 2);
        ctx.fillStyle = eyeColor;
        ctx.shadowColor = eyeColor;
        ctx.shadowBlur = (14 + beatPulse * 20) * s;
        ctx.fill();

        // White Pupil Hotspot
        ctx.beginPath();
        ctx.arc(0, 0, eyeRadius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8 * s;
        ctx.fill();

        // Scanner Laser Sweep Beam
        const scanX = Math.sin(now * 0.008) * (8 * s);
        ctx.beginPath();
        ctx.moveTo(scanX, -4 * s);
        ctx.lineTo(scanX, 4 * s);
        ctx.strokeStyle = isAlertEye ? '#ffffff' : '#00ffff';
        ctx.lineWidth = 1.0 * s;
        ctx.stroke();

        ctx.restore();

        // Floating 5-Star Alert HUD Reticle above Drone: [ ◆ ◆ ◆ ◆ ◆ ] WANTED LEVEL: 5
        ctx.save();
        const reticleY = -27 * s;
        ctx.fillStyle = '#ff3d00';
        ctx.shadowColor = '#ff3d00';
        ctx.shadowBlur = 8 * s;
        ctx.font = `800 ${Math.max(6, Math.round(7.5 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('[ ◆ ◆ ◆ ◆ ◆ ] WANTED LEVEL: 5', 0, reticleY);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.9)';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 5 * s;
        ctx.fillText('// AERON ENFORCER // ATLAN_01 //', 0, 24 * s);
        ctx.restore();

        ctx.restore();
    }

    // Master Dispatcher for Thematic Centerpiece
    function drawThematicCenterpiece(ctx, cx, cy, width, height, currentTheme, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        if (!ctx || width === 0 || height === 0) return;
        const s = Math.min(0.96, Math.max(0.56, height / 102));
        const adjustedCy = cy - (3.5 * s);

        switch (currentTheme) {
            case 'nms':
                drawThematicAtlasPlatform(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'solar-eclipse':
                drawThematicSolarCruiser(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'euclid-horizon':
                drawThematicSpaceStation(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'alien-paradise':
                drawThematicAlienBioManta(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'abyssal-void':
                drawThematicEmerilWarpTunnel(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'dissonance':
                drawThematicHarmonicMonolith(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'sentinel':
                drawThematicSentinelDrone(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'minimalist-light':
            case 'brutalist-light':
                drawThematicBrutalistCore(ctx, cx, adjustedCy, s, true, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'minimalist-dark':
            case 'brutalist-dark':
                drawThematicBrutalistCore(ctx, cx, adjustedCy, s, false, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'minimalist-warm':
                drawThematicMinimalistWarmCore(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'minimalist-obsidian':
                drawThematicMinimalistObsidianCore(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            default:
                drawThematicDefaultCore(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
        }
    }

    // -------------------------------------------------------------------------
    // Visualizer 3: Thematic Wave (Ethereal Touhou Ink Wave Visualizer)
    // Sinuous ink wings, dynamic mist, crest luminescence & spirit danmaku
    // -------------------------------------------------------------------------
    function drawThematicWave(ctx, width, height, bands, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        const centerX = width / 2;
        const centerY = height / 2;

        // Heart pulsing: strictly locked to track's bass and kick transients
        const targetHeartPulse = playing
            ? (1.0 + smoothBass * 0.28 + beatPulse * 0.36)
            : (1.0 + Math.sin(now * 0.002) * 0.03);
        smoothHeartPulse += (targetHeartPulse - smoothHeartPulse) * (1.0 - Math.exp(-22 * dt));
        const heartPulse = smoothHeartPulse;

        // Continuous delta-time rotation integration: smooth acceleration without angle jumping
        const runeSpeed = playing ? (1.2 + smoothTreble * 2.2 + beatPulse * 1.4) : 0.6;
        runeRingAngle += dt * runeSpeed * 1.0;

        const yinYangSpeed = playing ? (1.2 + smoothBass * 1.8 + smoothTreble * 2.0) : 0.7;
        yinYangAngle += dt * yinYangSpeed * 1.3;

        // Trigger expanding concentric ripple soundwaves on heavy kicks
        if (playing && beatPulse > 0.55 && Math.random() < 0.25) {
            emitShockwave(centerX, centerY, Math.min(width * 0.42, 115 * heartPulse), 0.75);
        }

        const currentTheme = getActiveTheme();
        const isNms = isAtlasThemeActive();

        // Ambient radial aura in dock center
        if (playing) {
            const glowR = Math.min(width * 0.45, (85 + smoothBass * 45 + beatPulse * 55) * heartPulse);
            const grad = ctx.createRadialGradient(centerX, centerY, 6, centerX, centerY, glowR);
            if (isNms) {
                grad.addColorStop(0, 'rgba(255, 23, 68, ' + (0.35 + beatPulse * 0.35) + ')');
                grad.addColorStop(0.4, 'rgba(124, 77, 255, ' + (0.12 + beatPulse * 0.12) + ')');
                grad.addColorStop(1, 'rgba(6, 7, 16, 0)');
            } else if (currentTheme === 'dissonance') {
                grad.addColorStop(0, 'rgba(217, 70, 239, ' + (0.35 + beatPulse * 0.35) + ')');
                grad.addColorStop(0.4, 'rgba(168, 85, 247, ' + (0.15 + beatPulse * 0.15) + ')');
                grad.addColorStop(1, 'rgba(6, 2, 12, 0)');
            } else {
                grad.addColorStop(0, 'rgba(255, 255, 255, ' + (0.24 + beatPulse * 0.32) + ')');
                grad.addColorStop(0.4, 'rgba(255, 255, 255, ' + (0.07 + beatPulse * 0.10) + ')');
                grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            }
            ctx.fillStyle = grad;
            ctx.fillRect(centerX - glowR, centerY - glowR, glowR * 2, glowR * 2);
        }

        // Draw Expanding Soundwave Ripple Rings
        updateAndDrawShockwaves(ctx, dt);

        // Symmetrical Sinuous Thematic Audio Wings (Left & Right Wings)
        const thematicLeftPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
        const thematicRightPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
        const thematicLeftMistPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
        const thematicRightMistPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
        const wingPoints = 36;
        const clearance = Math.min(width * 0.16, Math.max(54, height * 0.58));
        const wingWidth = (width / 2) - clearance;
        const wingHeadroom = Math.max(16, height * 0.24);
        const maxWingHeight = height - wingHeadroom - 4;
        const mistHeadroom = Math.max(22, height * 0.38);
        const maxMistHeight = height - mistHeadroom - 4;

        // Gradient for sleek translucent ink wings adapted to active theme
        const wingGrad = ctx.createLinearGradient(0, wingHeadroom, 0, height);
        switch (currentTheme) {
            case 'nms':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#ffab00');
                wingGrad.addColorStop(0.45, '#ff1744');
                wingGrad.addColorStop(0.75, 'rgba(213, 0, 0, 0.35)');
                wingGrad.addColorStop(1, 'rgba(124, 77, 255, 0.05)');
                break;
            case 'solar-eclipse':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#00f0ff');
                wingGrad.addColorStop(0.45, '#ff007f');
                wingGrad.addColorStop(0.75, 'rgba(179, 0, 89, 0.35)');
                wingGrad.addColorStop(1, 'rgba(0, 240, 255, 0.05)');
                break;
            case 'euclid-horizon':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#fbbf24');
                wingGrad.addColorStop(0.45, '#14b8a6');
                wingGrad.addColorStop(0.75, 'rgba(225, 29, 72, 0.35)');
                wingGrad.addColorStop(1, 'rgba(20, 184, 166, 0.05)');
                break;
            case 'alien-paradise':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#ff2a70');
                wingGrad.addColorStop(0.45, '#00ced1');
                wingGrad.addColorStop(0.75, 'rgba(250, 204, 21, 0.35)');
                wingGrad.addColorStop(1, 'rgba(0, 206, 209, 0.05)');
                break;
            case 'abyssal-void':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#00ffaa');
                wingGrad.addColorStop(0.45, '#10b981');
                wingGrad.addColorStop(0.75, 'rgba(5, 150, 105, 0.35)');
                wingGrad.addColorStop(1, 'rgba(16, 185, 129, 0.05)');
                break;
            case 'dissonance':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#d946ef');
                wingGrad.addColorStop(0.45, '#a855f7');
                wingGrad.addColorStop(0.75, 'rgba(126, 34, 206, 0.35)');
                wingGrad.addColorStop(1, 'rgba(88, 28, 135, 0.05)');
                break;
            case 'sentinel':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#00e5ff');
                wingGrad.addColorStop(0.45, '#ff3d00');
                wingGrad.addColorStop(0.75, 'rgba(0, 229, 255, 0.35)');
                wingGrad.addColorStop(1, 'rgba(11, 14, 23, 0.05)');
                break;
            case 'minimalist-light':
            case 'brutalist-light':
                wingGrad.addColorStop(0, '#000000');
                wingGrad.addColorStop(0.25, '#27272a');
                wingGrad.addColorStop(0.60, 'rgba(0, 0, 0, 0.25)');
                wingGrad.addColorStop(1, 'rgba(0, 0, 0, 0.02)');
                break;
            case 'minimalist-dark':
            case 'brutalist-dark':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.25, '#e4e4e7');
                wingGrad.addColorStop(0.60, 'rgba(255, 255, 255, 0.25)');
                wingGrad.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
                break;
            case 'minimalist-warm':
                wingGrad.addColorStop(0, '#d97706');
                wingGrad.addColorStop(0.25, '#b45309');
                wingGrad.addColorStop(0.60, 'rgba(217, 119, 6, 0.25)');
                wingGrad.addColorStop(1, 'rgba(250, 248, 245, 0.02)');
                break;
            case 'minimalist-obsidian':
                wingGrad.addColorStop(0, '#38bdf8');
                wingGrad.addColorStop(0.25, '#0284c7');
                wingGrad.addColorStop(0.60, 'rgba(56, 189, 248, 0.25)');
                wingGrad.addColorStop(1, 'rgba(0, 0, 0, 0.02)');
                break;
            default:
                wingGrad.addColorStop(0, 'rgba(255, 255, 255, 0.94)');
                wingGrad.addColorStop(0.22, 'rgba(255, 255, 255, 0.62)');
                wingGrad.addColorStop(0.60, 'rgba(255, 255, 255, 0.20)');
                wingGrad.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
                break;
        }

        for (let i = 0; i < wingPoints; i++) {
            const progress = i / (wingPoints - 1);
            const bandIdx = Math.min(bands.length - 1, Math.floor(Math.pow(progress, 0.95) * (bands.length - 1)));
            const b = bands[bandIdx] || 0;

            const innerTaper = Math.min(1.0, progress * 4.0);
            const wingAmp = Math.min(maxWingHeight, (b * maxWingHeight * (0.82 + beatPulse * 0.14 + smoothMid * 0.10) + (playing ? 3.5 : 1.5)) * innerTaper);
            const mistAmp = Math.min(maxMistHeight, (b * maxMistHeight * (0.76 + smoothBass * 0.16) + (playing ? 2.5 : 1.2)) * innerTaper);

            const y = Math.max(wingHeadroom, height - wingAmp);
            const mistY = Math.max(mistHeadroom, height - mistAmp);

            const lx = (centerX - clearance) - progress * wingWidth;
            const rx = (centerX + clearance) + progress * wingWidth;

            thematicLeftPoints[i].x = lx;
            thematicLeftPoints[i].y = y;
            thematicRightPoints[i].x = rx;
            thematicRightPoints[i].y = y;
            thematicLeftMistPoints[i].x = lx;
            thematicLeftMistPoints[i].y = mistY;
            thematicRightMistPoints[i].x = rx;
            thematicRightMistPoints[i].y = mistY;
        }

        let mistFill = 'rgba(255, 255, 255, ' + (0.05 + smoothBass * 0.06) + ')';
        let crestShadow = 'rgba(255, 255, 255, ' + (0.8 + beatPulse * 0.2) + ')';
        if (currentTheme === 'nms') {
            mistFill = 'rgba(124, 77, 255, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#ff1744';
        } else if (currentTheme === 'solar-eclipse') {
            mistFill = 'rgba(255, 0, 128, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#00f0ff';
        } else if (currentTheme === 'euclid-horizon') {
            mistFill = 'rgba(225, 29, 72, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#fbbf24';
        } else if (currentTheme === 'alien-paradise') {
            mistFill = 'rgba(244, 63, 94, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#ff2a70';
        } else if (currentTheme === 'abyssal-void') {
            mistFill = 'rgba(5, 150, 105, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#00ffaa';
        } else if (currentTheme === 'dissonance') {
            mistFill = 'rgba(168, 85, 247, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#d946ef';
        } else if (currentTheme === 'sentinel') {
            mistFill = 'rgba(0, 229, 255, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#00e5ff';
        } else if (currentTheme === 'brutalist-light' || currentTheme === 'minimalist-light') {
            mistFill = 'rgba(0, 0, 0, ' + (0.03 + smoothBass * 0.04) + ')';
            crestShadow = 'rgba(0, 0, 0, 0.4)';
        } else if (currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-dark') {
            mistFill = 'rgba(255, 255, 255, ' + (0.03 + smoothBass * 0.04) + ')';
            crestShadow = 'rgba(255, 255, 255, 0.4)';
        } else if (currentTheme === 'minimalist-warm') {
            mistFill = 'rgba(217, 119, 6, ' + (0.04 + smoothBass * 0.05) + ')';
            crestShadow = '#d97706';
        } else if (currentTheme === 'minimalist-obsidian') {
            mistFill = 'rgba(56, 189, 248, ' + (0.04 + smoothBass * 0.05) + ')';
            crestShadow = '#38bdf8';
        }

        // --- Left Wing: Layer 1 Mist Wave ---
        ctx.beginPath();
        ctx.moveTo(centerX - clearance, height);
        ctx.lineTo(thematicLeftMistPoints[0].x, thematicLeftMistPoints[0].y);
        drawSplinePath(ctx, thematicLeftMistPoints);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = mistFill;
        ctx.fill();

        // --- Left Wing: Layer 2 Ethereal Ink Silhouette ---
        ctx.beginPath();
        ctx.moveTo(centerX - clearance, height);
        ctx.lineTo(thematicLeftPoints[0].x, thematicLeftPoints[0].y);
        drawSplinePath(ctx, thematicLeftPoints);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = wingGrad;
        ctx.fill();

        const thematicCrestStroke = (currentTheme === 'minimalist-light' || currentTheme === 'brutalist-light')
            ? '#09090b'
            : (currentTheme === 'minimalist-warm' ? '#9a3412' : (currentTheme === 'minimalist-obsidian' ? '#38bdf8' : '#ffffff'));

        // Left Crest Glow Line
        ctx.save();
        if (isFirefox) {
            ctx.beginPath();
            ctx.moveTo(thematicLeftPoints[0].x, thematicLeftPoints[0].y);
            drawSplinePath(ctx, thematicLeftPoints);
            ctx.lineWidth = (2.2 + beatPulse * 1.4) * 2.2;
            ctx.strokeStyle = crestShadow;
            ctx.globalAlpha = 0.42;
            ctx.stroke();

            ctx.lineWidth = 2.2 + beatPulse * 1.4;
            ctx.strokeStyle = thematicCrestStroke;
            ctx.globalAlpha = 1.0;
            ctx.stroke();
        } else {
            ctx.shadowColor = crestShadow;
            ctx.shadowBlur = Math.min(12, 6 + beatPulse * 8);
            ctx.lineWidth = 2.2 + beatPulse * 1.4;
            ctx.strokeStyle = thematicCrestStroke;
            ctx.beginPath();
            ctx.moveTo(thematicLeftPoints[0].x, thematicLeftPoints[0].y);
            drawSplinePath(ctx, thematicLeftPoints);
            ctx.stroke();
        }
        ctx.restore();

        // --- Right Wing: Layer 1 Mist Wave ---
        ctx.beginPath();
        ctx.moveTo(centerX + clearance, height);
        ctx.lineTo(thematicRightMistPoints[0].x, thematicRightMistPoints[0].y);
        drawSplinePath(ctx, thematicRightMistPoints);
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = mistFill;
        ctx.fill();

        // --- Right Wing: Layer 2 Ethereal Ink Silhouette ---
        ctx.beginPath();
        ctx.moveTo(centerX + clearance, height);
        ctx.lineTo(thematicRightPoints[0].x, thematicRightPoints[0].y);
        drawSplinePath(ctx, thematicRightPoints);
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = wingGrad;
        ctx.fill();

        // Right Crest Glow Line
        ctx.save();
        if (isFirefox) {
            ctx.beginPath();
            ctx.moveTo(thematicRightPoints[0].x, thematicRightPoints[0].y);
            drawSplinePath(ctx, thematicRightPoints);
            ctx.lineWidth = (2.2 + beatPulse * 1.4 + snarePulse * 0.8) * 2.2;
            ctx.strokeStyle = crestShadow;
            ctx.globalAlpha = 0.42;
            ctx.stroke();

            ctx.lineWidth = 2.2 + beatPulse * 1.4 + snarePulse * 0.8;
            ctx.strokeStyle = thematicCrestStroke;
            ctx.globalAlpha = 1.0;
            ctx.stroke();
        } else {
            ctx.shadowColor = crestShadow;
            ctx.shadowBlur = Math.min(12, 6 + beatPulse * 8 + snarePulse * 4);
            ctx.lineWidth = 2.2 + beatPulse * 1.4 + snarePulse * 0.8;
            ctx.strokeStyle = thematicCrestStroke;
            ctx.beginPath();
            ctx.moveTo(thematicRightPoints[0].x, thematicRightPoints[0].y);
            drawSplinePath(ctx, thematicRightPoints);
            ctx.stroke();
        }
        ctx.restore();

        // Distinct Thematic Centerpiece for each Theme (NMS Starship, Touhou Core, Solar Cruiser, Vector Speeder, Bio Manta, Deep Submersible)
        drawThematicCenterpiece(ctx, centerX, centerY, width, height, currentTheme, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);

        // Floating Sakura Petals & Spirit Danmaku (Default Touhou Theme Only)
        if (currentTheme === 'default') {
            updateAndDrawParticles(ctx, width, height, dt, smoothBass * 1.8 + beatPulse * 2.5 + snarePulse * 1.2);
        }
    }

    // Alias for compatibility
    function drawBadAppleTouhou(...args) {
        return drawThematicWave(...args);
    }

    // Floating Petals / Spray Particles Physics (Exclusive to Default Touhou Theme)
    function updateAndDrawParticles(ctx, width, height, dt, impulse) {
        const currentTheme = getActiveTheme();
        if (currentTheme !== 'default') {
            return;
        }

        ctx.save();
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            // Velocity & Audio Updraft
            p.y += p.vy * dt * 60;
            p.x += p.vx * dt * 60;
            p.rot += p.vRot;

            if (impulse > 0.4) {
                p.y -= (impulse * 0.8) * dt * 60;
                p.x += (Math.sin(p.y * 10 + i) * 0.04) * impulse;
            }

            // Screen boundary reset
            if (p.y < 0) {
                p.y = 1.0;
                p.x = Math.random();
            }
            if (p.x < 0) p.x = 1.0;
            if (p.x > 1.0) p.x = 0;

            const px = p.x * width;
            const py = p.y * height;
            const dynamicAlpha = Math.min(1.0, p.alpha * (0.8 + Math.min(1.0, impulse) * 0.6));

            ctx.fillStyle = `rgba(255, 255, 255, ${dynamicAlpha})`;
            if (i % 2 === 0) {
                ctx.beginPath();
                ctx.ellipse(px, py, p.size * 1.2, p.size * 0.6, p.rot, 0, Math.PI * 2);
                ctx.fill();
            } else {
                const cos = Math.cos(p.rot);
                const sin = Math.sin(p.rot);
                const s1 = p.size * 1.3;
                const s2 = p.size * 0.8;
                ctx.beginPath();
                ctx.moveTo(px + sin * s1, py - cos * s1);
                ctx.lineTo(px + cos * s2, py + sin * s2);
                ctx.lineTo(px - sin * s1, py + cos * s1);
                ctx.lineTo(px - cos * s2, py - sin * s2);
                ctx.closePath();
                ctx.fill();
            }
        }
        ctx.restore();
    }


    // Attach visualizer theme drawing routines to window
    if (typeof window !== "undefined") {
        try { window.abyssalTime = abyssalTime; } catch (_) {}
        try { window.dissonanceTime = dissonanceTime; } catch (_) {}
        try { window.drawBadAppleTouhou = drawBadAppleTouhou; } catch (_) {}
        try { window.drawThematicAlienBioManta = drawThematicAlienBioManta; } catch (_) {}
        try { window.drawThematicAtlasPlatform = drawThematicAtlasPlatform; } catch (_) {}
        try { window.drawThematicBrutalistCore = drawThematicBrutalistCore; } catch (_) {}
        try { window.drawThematicCenterpiece = drawThematicCenterpiece; } catch (_) {}
        try { window.drawThematicDefaultCore = drawThematicDefaultCore; } catch (_) {}
        try { window.drawThematicEmerilWarpTunnel = drawThematicEmerilWarpTunnel; } catch (_) {}
        try { window.drawThematicHarmonicMonolith = drawThematicHarmonicMonolith; } catch (_) {}
        try { window.drawThematicMinimalistObsidianCore = drawThematicMinimalistObsidianCore; } catch (_) {}
        try { window.drawThematicMinimalistWarmCore = drawThematicMinimalistWarmCore; } catch (_) {}
        try { window.drawThematicSentinelDrone = drawThematicSentinelDrone; } catch (_) {}
        try { window.drawThematicSolarCruiser = drawThematicSolarCruiser; } catch (_) {}
        try { window.drawThematicSpaceStation = drawThematicSpaceStation; } catch (_) {}
        try { window.drawThematicWave = drawThematicWave; } catch (_) {}
        try { window.drawTurntableCenterAbyssalVoid = drawTurntableCenterAbyssalVoid; } catch (_) {}
        try { window.drawTurntableCenterBrutalist = drawTurntableCenterBrutalist; } catch (_) {}
        try { window.drawTurntableCenterDissonance = drawTurntableCenterDissonance; } catch (_) {}
        try { window.drawTurntableCenterHeart = drawTurntableCenterHeart; } catch (_) {}
        try { window.drawTurntableCenterSentinel = drawTurntableCenterSentinel; } catch (_) {}
        try { window.sentinelTime = sentinelTime; } catch (_) {}
        try { window.updateAndDrawParticles = updateAndDrawParticles; } catch (_) {}
    }



    // --- Sub-Module: visualizer.js ---
// CachyMusic - High-Fidelity Canvas Visualizer Engine (Liquid Wave & Segmented Bars)


    let themes1Promise = null;
    let themes2Promise = null;

    function loadVisualizerThemes1() {
        if (!themes1Promise) {
            themes1Promise = import('./visualizer-themes-1.js').then(mod => {
                if (typeof window !== 'undefined') {
                    Object.assign(window, mod);
                }
                return mod;
            }).catch(err => {
                console.warn('Failed to load visualizer-themes-1.js', err);
            });
        }
        return themes1Promise;
    }

    function loadVisualizerThemes2() {
        if (!themes2Promise) {
            themes2Promise = import('./visualizer-themes-2.js').then(mod => {
                if (typeof window !== 'undefined') {
                    Object.assign(window, mod);
                }
                return mod;
            }).catch(err => {
                console.warn('Failed to load visualizer-themes-2.js', err);
            });
        }
        return themes2Promise;
    }

    function setupVisualizerMode() {
        setVisualizerMode(activeVisualizerMode);

        visPillBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                setVisualizerMode(btn.dataset.mode);
            });
        });

        visModeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                setVisualizerMode(btn.dataset.mode);
            });
        });
    }

    function setVisualizerMode(mode) {
        if (mode === 'badapple' || mode === 'thematic') {
            activeVisualizerMode = 'thematic';
            loadVisualizerThemes1();
            loadVisualizerThemes2();
        } else {
            activeVisualizerMode = mode;
        }
        safeStorage.setItem('cachymusic_vis_mode', activeVisualizerMode);

        visPillBtns.forEach(b => {
            const m = b.dataset.mode;
            const matches = (m === activeVisualizerMode) || (activeVisualizerMode === 'thematic' && (m === 'badapple' || m === 'thematic'));
            b.classList.toggle('active', matches);
        });
        visModeBtns.forEach(b => {
            const m = b.dataset.mode;
            const matches = (m === activeVisualizerMode) || (activeVisualizerMode === 'thematic' && (m === 'badapple' || m === 'thematic'));
            b.classList.toggle('active', matches);
        });

        // Reset peak drops for dash mode & pulse state
        peakValues.fill(0);
        peakVelocity.fill(0);
        peakHold.fill(0);
        smoothDashLevels.fill(0);
        smoothHeartPulse = 1.0;

        const isThematic = (activeVisualizerMode === 'thematic' || activeVisualizerMode === 'badapple');
        if (turntableCenterVis) {
            turntableCenterVis.style.display = 'flex';
        }
        if (vinylLabel) {
            vinylLabel.style.opacity = '0';
        }
        if (vinylTurntable) {
            vinylTurntable.classList.toggle('thematicFidelity', isThematic);
            vinylTurntable.classList.toggle('spinning', isPlaying);
        }
        if (bgDisc) {
            bgDisc.classList.toggle('fast', isPlaying && isThematic);
        }
        if (typeof resumeVisualizerLoop === 'function') {
            resumeVisualizerLoop();
        }
    }
    window.setVisualizerMode = setVisualizerMode;

    let lastCanvasW = 0;
    let lastCanvasH = 0;
    let lastCanvasDpr = 0;

    let lastCenterW = 0;
    let lastCenterH = 0;
    let lastCenterDpr = 0;

    let cachedDockW = 0;
    let cachedDockH = 0;
    let cachedCenterW = 0;
    let cachedCenterH = 0;

    function refreshCanvasDimensions() {
        if (visualizerDock) {
            const w = Math.round(visualizerDock.clientWidth || visualizerDock.getBoundingClientRect().width);
            const h = Math.round(visualizerDock.clientHeight || visualizerDock.getBoundingClientRect().height);
            if (w > 0 && h > 0) {
                cachedDockW = w;
                cachedDockH = h;
                syncCanvasResolution(w, h);
            }
        }
        if (turntableCenterCanvas) {
            const cw = Math.round(turntableCenterCanvas.clientWidth || turntableCenterCanvas.getBoundingClientRect().width);
            const ch = Math.round(turntableCenterCanvas.clientHeight || turntableCenterCanvas.getBoundingClientRect().height);
            if (cw > 0 && ch > 0) {
                cachedCenterW = cw;
                cachedCenterH = ch;
                if (typeof resumeVisualizerLoop === 'function') resumeVisualizerLoop();
            }
        }
    }

    if (window.ResizeObserver) {
        const resizeObs = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.target === visualizerDock) {
                    cachedDockW = Math.round(entry.contentRect.width);
                    cachedDockH = Math.round(entry.contentRect.height);
                    if (cachedDockW > 0 && cachedDockH > 0) {
                        syncCanvasResolution(cachedDockW, cachedDockH);
                    }
                } else if (entry.target === turntableCenterCanvas) {
                    cachedCenterW = Math.round(entry.contentRect.width);
                    cachedCenterH = Math.round(entry.contentRect.height);
                    if (cachedCenterW > 0 && cachedCenterH > 0 && typeof resumeVisualizerLoop === 'function') {
                        resumeVisualizerLoop();
                    }
                }
            }
        });
        if (visualizerDock) resizeObs.observe(visualizerDock);
        if (turntableCenterCanvas) resizeObs.observe(turntableCenterCanvas);
    }
    window.addEventListener('resize', refreshCanvasDimensions, { passive: true });
    window.addEventListener('orientationchange', refreshCanvasDimensions, { passive: true });

    const cachedCenterDims = { width: 0, height: 0, dpr: 1 };
    function syncTurntableCenterCanvas() {
        if (!turntableCenterCanvas || !turntableCenterVis) return null;
        let w = cachedCenterW;
        let h = cachedCenterH;
        if (w === 0 || h === 0) {
            w = Math.round(turntableCenterCanvas.clientWidth || turntableCenterCanvas.getBoundingClientRect().width);
            h = Math.round(turntableCenterCanvas.clientHeight || turntableCenterCanvas.getBoundingClientRect().height);
            cachedCenterW = w;
            cachedCenterH = h;
        }
        if (w === 0 || h === 0) return null;
        const maxDpr = window.innerWidth <= 768 ? 1.5 : 2.0;
        const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

        if (w !== lastCenterW || h !== lastCenterH || dpr !== lastCenterDpr) {
            turntableCenterCanvas.width = Math.round(w * dpr);
            turntableCenterCanvas.height = Math.round(h * dpr);
            lastCenterW = w;
            lastCenterH = h;
            lastCenterDpr = dpr;
        }
        cachedCenterDims.width = w;
        cachedCenterDims.height = h;
        cachedCenterDims.dpr = dpr;
        return cachedCenterDims;
    }

    function syncCanvasResolution(wOrRect, optH) {
        const maxDpr = window.innerWidth <= 768 ? 1.5 : 2.0;
        const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
        const w = Math.round(typeof wOrRect === 'object' && wOrRect !== null ? wOrRect.width : wOrRect);
        const h = Math.round(typeof wOrRect === 'object' && wOrRect !== null ? wOrRect.height : optH);
        const pixelW = Math.round(w * dpr);
        const pixelH = Math.round(h * dpr);

        if (visualizerCanvas.width !== pixelW || visualizerCanvas.height !== pixelH || dpr !== lastCanvasDpr) {
            visualizerCanvas.width = pixelW;
            visualizerCanvas.height = pixelH;
            lastCanvasW = w;
            lastCanvasH = h;
            lastCanvasDpr = dpr;
        }
        return dpr;
    }

    function setupCanvas() {
        refreshCanvasDimensions();
    }

    // Expanding soundwave ripple rings for beat hits
    const shockwaveRings = [];
    function emitShockwave(x, y, maxRadius, initialAlpha = 0.75) {
        if (shockwaveRings.length >= 8) shockwaveRings.shift();
        shockwaveRings.push({
            x,
            y,
            r: 6,
            maxR: maxRadius,
            alpha: initialAlpha,
            speed: (maxRadius - 6) * 2.6
        });
    }

    function updateAndDrawShockwaves(ctx, dt) {
        if (shockwaveRings.length === 0) return;
        ctx.save();
        for (let i = shockwaveRings.length - 1; i >= 0; i--) {
            const ring = shockwaveRings[i];
            ring.r += ring.speed * dt;
            const progress = ring.r / ring.maxR;
            if (progress >= 1.0) {
                shockwaveRings.splice(i, 1);
                continue;
            }
            const currentAlpha = ring.alpha * (1.0 - progress);
            ctx.strokeStyle = `rgba(255, 255, 255, ${currentAlpha})`;
            ctx.lineWidth = 1.6 * (1.0 - progress * 0.5);
            ctx.beginPath();
            ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Dynamic Crest Sparkles for Solid Wave (reacts to snares & treble transients)
    const crestSparkles = [];
    function emitSparkle(x, y, intensity = 1.0) {
        if (crestSparkles.length >= 24) crestSparkles.shift();
        crestSparkles.push({
            x,
            y,
            life: 1.0,
            decay: 2.2 + Math.random() * 1.5,
            size: 2.0 + Math.random() * 2.8,
            intensity
        });
    }

    function updateAndDrawSparkles(ctx, dt) {
        const currentTheme = getActiveTheme();
        if (currentTheme !== 'default') {
            crestSparkles.length = 0;
            return;
        }
        for (let i = crestSparkles.length - 1; i >= 0; i--) {
            const sp = crestSparkles[i];
            sp.life -= sp.decay * dt;
            if (sp.life <= 0) {
                crestSparkles.splice(i, 1);
                continue;
            }
            ctx.save();
            ctx.translate(sp.x, sp.y);
            const a = sp.life * sp.intensity;
            ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
            ctx.shadowColor = 'rgba(255, 255, 255, 0.95)';
            ctx.shadowBlur = 6;
            const s = sp.size * (0.5 + sp.life * 0.5);
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.lineTo(s * 0.4, 0);
            ctx.lineTo(0, s);
            ctx.lineTo(-s * 0.4, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    // Smooth Catmull-Rom Spline Path Generator (passes exactly through all peaks and valleys with C1 continuity)
    function drawSplinePath(ctx, points) {
        if (!points || points.length === 0) return;
        if (points.length === 1) {
            ctx.lineTo(points[0].x, points[0].y);
            return;
        }
        if (points.length === 2) {
            ctx.lineTo(points[1].x, points[1].y);
            return;
        }
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(points.length - 1, i + 2)];

            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;

            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
    }

    // =========================================================================

    function startVisualizerLoop() {
        const rawFreqArray = new Uint8Array(1024);
        const bandRawVals = new Float32Array(NUM_BANDS);
        const filteredBands = new Float32Array(NUM_BANDS);
        let runningHeadroom = 0.85;
        let beatPulse = 0;
        let snarePulse = 0;
        let treblePulse = 0;
        let smoothMid = 0;
        let lastBass = 0;
        let lastMid = 0;
        let lastTreble = 0;
        let idleFramesAfterPause = 0;
        let turntableCenterStylesSet = false;
        let drMeterFrameCounter = 0;
        let lastPeakText = '';
        let lastDrText = '';
        let lastHeadroomText = '';

        let cachedSampleRate = 0;
        let cachedBinCount = 0;
        let precomputedBands = null;

        function getPrecomputedBands(sampleRate, binCount) {
            if (precomputedBands && cachedSampleRate === sampleRate && cachedBinCount === binCount) {
                return precomputedBands;
            }
            cachedSampleRate = sampleRate;
            cachedBinCount = binCount;
            const hzPerBin = sampleRate / (binCount * 2);
            const minFreq = 20; // Human audiophile sub-bass threshold
            // Full 24 kHz high-fidelity frequency range (utilizing complete 48 kHz+ Nyquist headroom):
            const nyquist = sampleRate / 2;
            const maxFreq = Math.min(24000, Math.max(22050, nyquist));
            const logRatio = Math.log(maxFreq / minFreq);
            precomputedBands = new Array(NUM_BANDS);
            for (let b = 0; b < NUM_BANDS; b++) {
                const f0 = minFreq * Math.exp((b / NUM_BANDS) * logRatio);
                const f1 = minFreq * Math.exp(((b + 1) / NUM_BANDS) * logRatio);
                const startBin = Math.max(1, Math.floor(f0 / hzPerBin));
                const endBin = Math.max(startBin + 1, Math.min(binCount, Math.ceil(f1 / hzPerBin)));
                const count = endBin - startBin;
                const normB = b / (NUM_BANDS - 1);
                // Equal-loudness Fletcher-Munson contour tilt compensation across 20Hz - 24kHz:
                // Upper treble (16-24kHz) has lower acoustic energy in natural recordings,
                // so an organic contour tilt highlights high-resolution air, sparkles, and cymbal harmonics!
                const tilt = 0.94 + Math.pow(normB, 1.1) * 0.65;
                precomputedBands[b] = { startBin, endBin, count, tilt };
            }
            return precomputedBands;
        }

        resumeVisualizerLoop = function() {
            if (!isVisualizerLoopRunning) {
                isVisualizerLoopRunning = true;
                idleFramesAfterPause = 0;
                lastRenderTime = performance.now();
                animFrameId = requestAnimationFrame(renderFrame);
            }
        };

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && typeof resumeVisualizerLoop === 'function') {
                resumeVisualizerLoop();
            }
        });

        function renderFrame(now) {
            if (currentWorkspace !== 'player') {
                isVisualizerLoopRunning = false;
                return;
            }

            if (document.hidden) {
                isVisualizerLoopRunning = false;
                return;
            }

            if (!isPlaying) {
                idleFramesAfterPause++;
                const targetFidelity = (activeVisualizerMode === 'thematic' || activeVisualizerMode === 'badapple') ? 1.0 : 0.0;
                const isFidelityTransitioning = Math.abs(targetFidelity - smoothTurntableFidelity) > 0.002;
                const isAlreadySilent = (smoothBass < 0.002 && smoothMid < 0.002 && smoothTreble < 0.002 && beatPulse < 0.002);
                if (!isFidelityTransitioning && ((isAlreadySilent && idleFramesAfterPause > 2) || idleFramesAfterPause > 45)) {
                    isVisualizerLoopRunning = false;
                    return;
                }
            } else {
                idleFramesAfterPause = 0;
            }

            const elapsed = now - lastRenderTime;
            if (elapsed < 7) {
                animFrameId = requestAnimationFrame(renderFrame);
                return;
            }
            const dt = Math.min(elapsed / 1000, 0.1);
            lastRenderTime = now;

            const isMobileViewport = window.innerWidth <= 768;
            if (isMobileViewport) {
                const isDeckActive = Boolean(playerDeckEl && playerDeckEl.classList.contains('mobileActive') && !isLyricsView);
                const isInfoActive = Boolean(settingsPanelEl && settingsPanelEl.classList.contains('mobileActive'));
                const isSignalOpen = Boolean(signalPathModal && signalPathModal.style.display === 'flex');
                if (!isDeckActive && !isInfoActive && !isSignalOpen) {
                    isVisualizerLoopRunning = false;
                    return;
                }
            }

            let width = isMobileViewport ? 0 : cachedDockW;
            let height = isMobileViewport ? 0 : cachedDockH;
            if (!isMobileViewport && (width === 0 || height === 0) && visualizerDock) {
                width = Math.round(visualizerDock.clientWidth || visualizerDock.getBoundingClientRect().width);
                height = Math.round(visualizerDock.clientHeight || visualizerDock.getBoundingClientRect().height);
                cachedDockW = width;
                cachedDockH = height;
            }

            const hasDockCanvas = (width > 0 && height > 0 && ctx);
            if (hasDockCanvas) {
                const dpr = syncCanvasResolution(width, height);
                ctx.save();
                ctx.scale(dpr, dpr);
                ctx.clearRect(0, 0, width, height);
            }

            // 1. Acquire Frequency & Time-domain data
            let hasRealData = false;
            if (analyser && isPlaying) {
                try {
                    analyser.getByteFrequencyData(rawFreqArray);
                    for (let i = 0; i < 40; i++) {
                        if (rawFreqArray[i] > 0) { hasRealData = true; break; }
                    }
                } catch(_) {}
            }

            // 2. Compute 60 Perceptual Logarithmic Frequency Bands with Adaptive Dynamic Headroom
            if (hasRealData) {
                const sampleRate = (audioContext && audioContext.sampleRate) || 48000;
                const binCount = analyser.frequencyBinCount || 1024;
                const bandsConfig = getPrecomputedBands(sampleRate, binCount);

                // Pass 1: Extract raw band acoustic energy with balanced mean + peak blend
                let frameMaxRaw = 0;
                for (let b = 0; b < NUM_BANDS; b++) {
                    const cfg = bandsConfig[b];
                    let sum = 0;
                    let peak = 0;
                    for (let k = cfg.startBin; k < cfg.endBin; k++) {
                        const v = rawFreqArray[k] || 0;
                        sum += v;
                        if (v > peak) peak = v;
                    }
                    const meanNorm = (sum / cfg.count) / 255;
                    const peakNorm = peak / 255;
                    // 55% mean provides solid musical body; 45% peak captures harmonic transient definition
                    const rawNorm = meanNorm * 0.55 + peakNorm * 0.45;

                    // Balanced perceptual tilt compensation
                    let rawScaled = rawNorm * cfg.tilt;

                    if (rawScaled < 0.03) {
                        rawScaled = Math.max(0, rawScaled * 0.35);
                    }
                    bandRawVals[b] = rawScaled;
                    if (rawScaled > frameMaxRaw) frameMaxRaw = rawScaled;
                }

                // Pass 1.5: Dynamic Range (DR) & Peak Headroom Live Metering (Throttled & Visibility-Guarded)
                drMeterFrameCounter++;
                if (drMeterFrameCounter >= 60) {
                    drMeterFrameCounter = 0;

                    const isSettingsVisible = window.innerWidth > 768 || (settingsPanelEl && settingsPanelEl.classList.contains('mobileActive'));
                    const isSignalModalVisible = signalPathModal && signalPathModal.style.display === 'flex';

                    if (isSettingsVisible || isSignalModalVisible) {
                        const peakAmp = Math.max(0.001, Math.min(1.0, frameMaxRaw));
                        const peakDb = 20 * Math.log10(peakAmp);

                        if (isSettingsVisible) {
                            let sumSq = 0;
                            for (let b = 0; b < NUM_BANDS; b++) {
                                const v = bandRawVals[b] || 0;
                                sumSq += v * v;
                            }
                            const rms = Math.sqrt(sumSq / NUM_BANDS);
                            const rmsDb = rms > 0.0001 ? 20 * Math.log10(rms) : -60;
                            const drScore = Math.max(4, Math.min(20, Math.round(Math.abs(peakDb - rmsDb) * 1.25)));

                            if (statPeakLevel) {
                                const txt = `${peakDb.toFixed(1)} dBFS`;
                                if (txt !== lastPeakText) {
                                    statPeakLevel.textContent = txt;
                                    lastPeakText = txt;
                                }
                            }
                            if (statDynamicRange) {
                                let grade = 'Hi-Fi';
                                if (drScore >= 14) grade = 'Audiophile';
                                else if (drScore >= 11) grade = 'Pristine';
                                else if (drScore >= 8) grade = 'Standard';
                                else grade = 'Compressed';
                                const txt = `DR${drScore} (${grade})`;
                                if (txt !== lastDrText) {
                                    statDynamicRange.textContent = txt;
                                    lastDrText = txt;
                                }
                            }
                        }

                        if (isSignalModalVisible && auditMetricHeadroom) {
                            const headroomDb = Math.max(0, -peakDb);
                            let maxBoost = (!isPeqBypassed && Array.isArray(peqGains)) ? Math.max(0, ...peqGains) : 0;
                            if (isBassBoost) maxBoost = Math.max(maxBoost, 3.8);
                            if (isTrebleBoost) maxBoost = Math.max(maxBoost, 3.0);
                            if (isVocalBoost) maxBoost = Math.max(maxBoost, 2.8);
                            const guardStr = maxBoost > 0 ? `-${(maxBoost * 0.7).toFixed(1)} dB Pre-Amp` : 'Live Peak';
                            const txt = `+${headroomDb.toFixed(1)} dB (${guardStr})`;
                            if (txt !== lastHeadroomText) {
                                auditMetricHeadroom.textContent = txt;
                                lastHeadroomText = txt;
                            }
                        }
                    }
                }

                // Dynamic Automatic Headroom Tracking (AGC for Visualizer)
                // Adapts to track mastering and loudness so the visualizer is never easily filled,
                // regardless of how loud the song is or how high the volume is set!
                if (frameMaxRaw > runningHeadroom) {
                    runningHeadroom += (frameMaxRaw - runningHeadroom) * Math.min(1.0, 3.8 * dt);
                } else {
                    runningHeadroom += (frameMaxRaw - runningHeadroom) * (1.0 - Math.exp(-0.30 * dt));
                }
                runningHeadroom = Math.max(0.48, Math.min(1.35, runningHeadroom));

                // Pass 2: Contrast Shaping & Asymptotic Headroom Clamping
                for (let b = 0; b < NUM_BANDS; b++) {
                    const normalized = Math.min(1.0, Math.max(0, bandRawVals[b] / runningHeadroom));
                    // Dynamic contrast expansion:
                    // Lowers resting background wave to ~25%-38% height, leaving abundant breathing room.
                    // Punchy transients and spikes shoot up to ~72%-80% with crisp mountain crests.
                    const contrast = Math.pow(normalized, 1.58);

                    // Soft saturation curve: guarantees smooth organic crests without ceiling clipping
                    let target;
                    if (contrast > 0.78) {
                        target = 0.78 + Math.tanh((contrast - 0.78) * 1.5) * 0.16;
                    } else {
                        target = contrast;
                    }
                    target = Math.min(0.92, Math.max(0, target));

                    // Adaptive ballistic attack and liquid exponential decay:
                    const diff = target - smoothBands[b];
                    if (diff > 0) {
                        const attackRate = 36 + Math.min(26, diff * 50);
                        const attackCoeff = 1.0 - Math.exp(-attackRate * dt);
                        smoothBands[b] += diff * attackCoeff;
                    } else {
                        const decayRate = 12.0; // Responsive decay prevents sluggish "wall of sound"
                        const decayCoeff = 1.0 - Math.exp(-decayRate * dt);
                        smoothBands[b] += diff * decayCoeff;
                    }
                }
            } else {
                // Procedural ambient simulation (smooth breathing waves when idle or fallback)
                simPhase += isPlaying ? dt * 3.2 : dt * 0.7;
                for (let b = 0; b < NUM_BANDS; b++) {
                    let target = 0;
                    if (isPlaying) {
                        const normB = b / (NUM_BANDS - 1);
                        const wave1 = Math.sin(simPhase * 1.8 + b * 0.14) * 0.28;
                        const wave2 = Math.cos(simPhase * 2.6 + b * 0.22) * 0.18;
                        const bassImpulse = (b < 12) ? Math.max(0, Math.sin(simPhase * 3.0)) * 0.42 * (1.0 - b / 12) : 0;
                        const midImpulse = (b >= 16 && b <= 34) ? Math.max(0, Math.sin(simPhase * 2.2 + 1.2)) * 0.32 : 0;
                        const highImpulse = (b > 38) ? Math.max(0, Math.sin(simPhase * 4.0 + 2.0)) * 0.24 * normB : 0;
                        target = Math.min(0.92, Math.max(0.04, 0.14 + wave1 + wave2 + bassImpulse + midImpulse + highImpulse));
                    } else {
                        target = 0;
                    }

                    const diff = target - smoothBands[b];
                    if (diff > 0) {
                        const simAttack = 1.0 - Math.exp(-28 * dt);
                        smoothBands[b] += diff * simAttack;
                    } else {
                        const simDecay = 1.0 - Math.exp(-8.5 * dt);
                        smoothBands[b] += diff * simDecay;
                    }
                }
            }

            // Peak-preserving spatial smoothing filter across neighboring bands:
            // Retains peak height of true spikes while smoothing slopes and valleys into fluid curves
            for (let b = 0; b < NUM_BANDS; b++) {
                const prev = smoothBands[Math.max(0, b - 1)];
                const curr = smoothBands[b];
                const next = smoothBands[Math.min(NUM_BANDS - 1, b + 1)];
                if (curr > prev && curr > next) {
                    filteredBands[b] = prev * 0.09 + curr * 0.82 + next * 0.09;
                } else {
                    filteredBands[b] = prev * 0.18 + curr * 0.64 + next * 0.18;
                }
            }

            // Energy domains with continuous time-delta smoothing
            const currentBass = (smoothBands[0] + smoothBands[1] + smoothBands[2] + smoothBands[3] + smoothBands[4] + smoothBands[5]) / 6;
            smoothBass += (currentBass - smoothBass) * (1.0 - Math.exp(-18 * dt));

            const currentMid = (smoothBands[12] + smoothBands[16] + smoothBands[20] + smoothBands[24] + smoothBands[28]) / 5;
            smoothMid += (currentMid - smoothMid) * (1.0 - Math.exp(-14 * dt));

            const currentTreble = (smoothBands[42] + smoothBands[46] + smoothBands[50] + smoothBands[54] + smoothBands[58]) / 5;
            smoothTreble += (currentTreble - smoothTreble) * (1.0 - Math.exp(-14 * dt));

            // Triple transient detectors:
            // 1. Bass Transient (Drum Kicks & 808 Drops)
            const bassDelta = currentBass - lastBass;
            lastBass = currentBass;
            if (bassDelta > 0.038 && currentBass > 0.16) {
                beatPulse = Math.min(1.0, beatPulse + bassDelta * 5.2);
            } else {
                beatPulse = Math.max(0, beatPulse - dt * 3.6);
            }

            // 2. Snare / Mid Transient (Snares, Claps, Vocal/Guitar Stabs)
            const midDelta = currentMid - lastMid;
            lastMid = currentMid;
            if (midDelta > 0.038 && currentMid > 0.15) {
                snarePulse = Math.min(1.0, snarePulse + midDelta * 5.0);
            } else {
                snarePulse = Math.max(0, snarePulse - dt * 4.2);
            }

            // 3. Treble Transient (Hi-hats, Cymbals, Percussion, Vocal sibilance)
            const trebleDelta = currentTreble - lastTreble;
            lastTreble = currentTreble;
            if (trebleDelta > 0.035 && currentTreble > 0.12) {
                treblePulse = Math.min(1.0, treblePulse + trebleDelta * 4.8);
            } else {
                treblePulse = Math.max(0, treblePulse - dt * 4.8);
            }

            // 4. Render Visualizer Mode with high musical expressiveness (when bottom dock is visible)
            if (hasDockCanvas) {
                switch (activeVisualizerMode) {
                    case 'dash':
                        drawVerticalDash(ctx, width, height, smoothBands, isPlaying, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                        break;
                    case 'thematic':
                    case 'badapple': {
                        const fnThematicWave = (typeof drawThematicWave === 'function' ? drawThematicWave : (typeof window !== 'undefined' && typeof window.drawThematicWave === 'function' ? window.drawThematicWave : null));
                        if (fnThematicWave) {
                            fnThematicWave(ctx, width, height, filteredBands, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                        } else {
                            loadVisualizerThemes2();
                        }
                        break;
                    }
                    case 'wave':
                    default:
                        drawSolidWave(ctx, width, height, filteredBands, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                        break;
                }
                ctx.restore();
            }

            // 5. Turntable Center Visualizer (Signature animated hub across all themes and modes)
            // Visualizer fidelity smoothly transitions so activating Thematic Core blossoms into full-feature design!
            const currentTheme = getActiveTheme();
            const targetFidelity = (activeVisualizerMode === 'thematic' || activeVisualizerMode === 'badapple') ? 1.0 : 0.0;
            smoothTurntableFidelity += (targetFidelity - smoothTurntableFidelity) * (1.0 - Math.exp(-6.0 * dt));
            if (Math.abs(targetFidelity - smoothTurntableFidelity) < 0.001) {
                smoothTurntableFidelity = targetFidelity;
            }
            const fidelity = smoothTurntableFidelity;

            const currentDeckEl = (typeof playerDeckEl !== 'undefined' && playerDeckEl) ? playerDeckEl : document.querySelector('.playerDeck');
            const isTurntableVisible = !isLyricsView &&
                (window.innerWidth > 768 || (currentDeckEl && currentDeckEl.classList.contains('mobileActive')));

            const currentCenterVis = (typeof turntableCenterVis !== 'undefined' && turntableCenterVis) ? turntableCenterVis : document.getElementById('turntableCenterVis');
            const currentCenterCanvas = (typeof turntableCenterCanvas !== 'undefined' && turntableCenterCanvas) ? turntableCenterCanvas : document.getElementById('turntableCenterCanvas');
            const currentCenterCtx = (typeof turntableCenterCtx !== 'undefined' && turntableCenterCtx) ? turntableCenterCtx : (currentCenterCanvas ? currentCenterCanvas.getContext('2d') : null);

            if (isTurntableVisible && currentCenterCanvas && currentCenterCtx) {
                if (!turntableCenterStylesSet) {
                    if (currentCenterVis && currentCenterVis.style.display !== 'flex') {
                        currentCenterVis.style.display = 'flex';
                    }
                    if (vinylLabel && vinylLabel.style.opacity !== '0') {
                        vinylLabel.style.opacity = '0';
                    }
                    turntableCenterStylesSet = true;
                }
                const centerDims = syncTurntableCenterCanvas();
                if (centerDims) {
                    currentCenterCtx.save();
                    currentCenterCtx.scale(centerDims.dpr, centerDims.dpr);
                    currentCenterCtx.clearRect(0, 0, centerDims.width, centerDims.height);

                    // Physical circular clipping boundary to prevent edge blur/shockwaves from clipping squarely
                    currentCenterCtx.save();
                    currentCenterCtx.beginPath();
                    currentCenterCtx.arc(centerDims.width / 2, centerDims.height / 2, Math.min(centerDims.width, centerDims.height) * 0.495, 0, Math.PI * 2);
                    currentCenterCtx.clip();

                    const getThemeFn = (fnName) => {
                        if (typeof window !== 'undefined' && typeof window[fnName] === 'function') return window[fnName];
                        try {
                            const f = eval(fnName);
                            if (typeof f === 'function') return f;
                        } catch (_) {}
                        return null;
                    };
                    const fnAtlas = getThemeFn('drawTurntableCenterAtlasCore');
                    const fnSolar = getThemeFn('drawTurntableCenterSolarEclipse');
                    const fnEuclid = getThemeFn('drawTurntableCenterEuclidPortal');
                    const fnParadise = getThemeFn('drawTurntableCenterAlienParadise');
                    const fnAbyssal = getThemeFn('drawTurntableCenterAbyssalVoid');
                    const fnDissonance = getThemeFn('drawTurntableCenterDissonance');
                    const fnSentinel = getThemeFn('drawTurntableCenterSentinel');
                    const fnBrutalist = getThemeFn('drawTurntableCenterBrutalist');
                    const fnHeart = getThemeFn('drawTurntableCenterHeart');

                    switch (currentTheme) {
                        case 'nms':
                            if (fnAtlas) {
                                fnAtlas(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            } else {
                                loadVisualizerThemes1();
                            }
                            break;
                        case 'solar-eclipse':
                            if (fnSolar) {
                                fnSolar(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            } else {
                                loadVisualizerThemes1();
                            }
                            break;
                        case 'euclid-horizon':
                            if (fnEuclid) {
                                fnEuclid(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            } else {
                                loadVisualizerThemes1();
                            }
                            break;
                        case 'alien-paradise':
                            if (fnParadise) {
                                fnParadise(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            } else {
                                loadVisualizerThemes1();
                            }
                            break;
                        case 'abyssal-void':
                            if (fnAbyssal) {
                                fnAbyssal(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            } else {
                                loadVisualizerThemes2();
                            }
                            break;
                        case 'dissonance':
                            if (fnDissonance) {
                                fnDissonance(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity, filteredBands);
                            } else {
                                loadVisualizerThemes2();
                            }
                            break;
                        case 'sentinel':
                            if (fnSentinel) {
                                fnSentinel(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity, filteredBands);
                            } else {
                                loadVisualizerThemes2();
                            }
                            break;
                        case 'minimalist-light':
                        case 'brutalist-light':
                            if (fnBrutalist) {
                                fnBrutalist(currentCenterCtx, centerDims.width, centerDims.height, 'light', isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            } else {
                                loadVisualizerThemes2();
                            }
                            break;
                        case 'minimalist-dark':
                        case 'brutalist-dark':
                            if (fnBrutalist) {
                                fnBrutalist(currentCenterCtx, centerDims.width, centerDims.height, 'dark', isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            } else {
                                loadVisualizerThemes2();
                            }
                            break;
                        case 'minimalist-warm':
                            if (fnBrutalist) {
                                fnBrutalist(currentCenterCtx, centerDims.width, centerDims.height, 'warm', isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            } else {
                                loadVisualizerThemes2();
                            }
                            break;
                        case 'minimalist-obsidian':
                            if (fnBrutalist) {
                                fnBrutalist(currentCenterCtx, centerDims.width, centerDims.height, 'obsidian', isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            } else {
                                loadVisualizerThemes2();
                            }
                            break;
                        default:
                            if (fnHeart) {
                                fnHeart(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            } else {
                                loadVisualizerThemes2();
                            }
                            break;
                    }
                    currentCenterCtx.restore();
                    currentCenterCtx.restore();
                }
            }

            if (isVisualizerLoopRunning) {
                animFrameId = requestAnimationFrame(renderFrame);
            }
        }

        isVisualizerLoopRunning = true;
        animFrameId = requestAnimationFrame(renderFrame);
    }

    // -------------------------------------------------------------------------
    // Visualizer 1: Reworked Solid Wave ("All wavy and stuff" - Liquid Mercury)
    // Multi-layer translucent fluid Catmull-Rom spline wave with glowing crest & spray motes
    // -------------------------------------------------------------------------
    const solidWaveUndertowPoints = Array.from({ length: NUM_BANDS }, () => ({ x: 0, y: 0 }));
    const solidWaveMidPoints = Array.from({ length: NUM_BANDS }, () => ({ x: 0, y: 0 }));
    const solidWaveForePoints = Array.from({ length: NUM_BANDS }, () => ({ x: 0, y: 0 }));
    const thematicLeftPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
    const thematicRightPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
    const thematicLeftMistPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
    const thematicRightMistPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));

    function drawSolidWave(ctx, width, height, bands, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        const pointsCount = bands.length;
        const step = width / (pointsCount - 1);

        // Shockwave trigger on heavy drum kicks
        if (playing && beatPulse > 0.52 && Math.random() < 0.25) {
            emitShockwave(width * 0.18, height - 16, Math.min(width * 0.45, 110), 0.75);
        }

        // Headroom: leaves 24% atmospheric breathing space at top so the wave is never easily filled
        const topHeadroom = Math.max(12, height * 0.24);
        const maxForegroundHeight = height - topHeadroom - 4;

        const currentTheme = getActiveTheme();

        // Layer 1: Ambient Deep Translucent Undertow (Sub-bass & Kick weight)
        const undertowHeadroom = Math.max(18, height * 0.44);
        const maxUndertowHeight = height - undertowHeadroom;
        const undertowPoints = solidWaveUndertowPoints;
        for (let i = 0; i < pointsCount; i++) {
            const x = i * step;
            const bassWeight = Math.max(0, 1.0 - (i / (pointsCount * 0.65)));
            const b = bands[Math.floor(i * 0.35)] * bassWeight;
            const h = Math.min(maxUndertowHeight, b * maxUndertowHeight * (0.80 + smoothBass * 0.25) + (playing ? 2 : 1));
            const pt = undertowPoints[i];
            pt.x = x;
            pt.y = Math.max(undertowHeadroom, height - h);
        }
        ctx.beginPath();
        ctx.moveTo(undertowPoints[0].x, height);
        ctx.lineTo(undertowPoints[0].x, undertowPoints[0].y);
        drawSplinePath(ctx, undertowPoints);
        ctx.lineTo(undertowPoints[undertowPoints.length - 1].x, height);
        ctx.closePath();

        let undertowFill = 'rgba(255, 255, 255, ' + (0.05 + smoothBass * 0.08) + ')';
        let midFill = 'rgba(255, 255, 255, ' + (0.08 + smoothMid * 0.10 + snarePulse * 0.06) + ')';
        if (currentTheme === 'nms') {
            undertowFill = 'rgba(124, 77, 255, ' + (0.14 + smoothBass * 0.18) + ')';
            midFill = 'rgba(0, 229, 255, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
        } else if (currentTheme === 'solar-eclipse') {
            undertowFill = 'rgba(255, 0, 128, ' + (0.14 + smoothBass * 0.18) + ')';
            midFill = 'rgba(0, 240, 255, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
        } else if (currentTheme === 'euclid-horizon') {
            undertowFill = 'rgba(225, 29, 72, ' + (0.14 + smoothBass * 0.18) + ')';
            midFill = 'rgba(251, 191, 36, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
        } else if (currentTheme === 'alien-paradise') {
            undertowFill = 'rgba(244, 63, 94, ' + (0.14 + smoothBass * 0.18) + ')';
            midFill = 'rgba(0, 206, 209, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
        } else if (currentTheme === 'abyssal-void') {
            undertowFill = 'rgba(5, 150, 105, ' + (0.14 + smoothBass * 0.18) + ')';
            midFill = 'rgba(0, 255, 170, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
        } else if (currentTheme === 'dissonance') {
            undertowFill = 'rgba(126, 34, 206, ' + (0.14 + smoothBass * 0.18) + ')';
            midFill = 'rgba(217, 70, 239, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
        } else if (currentTheme === 'sentinel') {
            undertowFill = 'rgba(14, 20, 36, ' + (0.16 + smoothBass * 0.18) + ')';
            midFill = 'rgba(0, 229, 255, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
        } else if (currentTheme === 'brutalist-light' || currentTheme === 'minimalist-light') {
            undertowFill = 'rgba(0, 0, 0, ' + (0.04 + smoothBass * 0.05) + ')';
            midFill = 'rgba(0, 0, 0, ' + (0.08 + smoothMid * 0.08 + snarePulse * 0.05) + ')';
        } else if (currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-dark') {
            undertowFill = 'rgba(255, 255, 255, ' + (0.04 + smoothBass * 0.05) + ')';
            midFill = 'rgba(255, 255, 255, ' + (0.08 + smoothMid * 0.08 + snarePulse * 0.05) + ')';
        } else if (currentTheme === 'minimalist-warm') {
            undertowFill = 'rgba(217, 119, 6, ' + (0.06 + smoothBass * 0.08) + ')';
            midFill = 'rgba(28, 25, 23, ' + (0.08 + smoothMid * 0.08 + snarePulse * 0.05) + ')';
        } else if (currentTheme === 'minimalist-obsidian') {
            undertowFill = 'rgba(56, 189, 248, ' + (0.06 + smoothBass * 0.08) + ')';
            midFill = 'rgba(255, 255, 255, ' + (0.08 + smoothMid * 0.08 + snarePulse * 0.05) + ')';
        }
        ctx.fillStyle = undertowFill;
        ctx.fill();

        // Layer 2: Mid-range Harmonic Wave (reacts to vocals, chords, synths)
        const midHeadroom = Math.max(16, height * 0.34);
        const maxMidHeight = height - midHeadroom;
        const midPoints = solidWaveMidPoints;
        for (let i = 0; i < pointsCount; i++) {
            const x = i * step;
            const b = bands[i];
            const h = Math.min(maxMidHeight, b * maxMidHeight * (0.78 + smoothMid * 0.20 + snarePulse * 0.10) + (playing ? 2.5 : 1.2));
            const pt = midPoints[i];
            pt.x = x;
            pt.y = Math.max(midHeadroom, height - h);
        }
        ctx.beginPath();
        ctx.moveTo(midPoints[0].x, height);
        ctx.lineTo(midPoints[0].x, midPoints[0].y);
        drawSplinePath(ctx, midPoints);
        ctx.lineTo(midPoints[midPoints.length - 1].x, height);
        ctx.closePath();
        ctx.fillStyle = midFill;
        ctx.fill();

        // Layer 3: Solid Foreground Liquid Wave (Direct High-Fidelity Musical Spectrum)
        const forePoints = solidWaveForePoints;
        let minY = height;
        for (let i = 0; i < pointsCount; i++) {
            const x = i * step;
            const b = bands[i];
            const dynamicLift = 0.88 + beatPulse * 0.14 + snarePulse * 0.08;
            const amp = Math.min(maxForegroundHeight, b * maxForegroundHeight * dynamicLift + (playing ? 3.5 : 1.5));
            const y = Math.max(topHeadroom, height - amp);
            if (y < minY) minY = y;
            const pt = forePoints[i];
            pt.x = x;
            pt.y = y;
        }

        ctx.beginPath();
        ctx.moveTo(forePoints[0].x, height);
        ctx.lineTo(forePoints[0].x, forePoints[0].y);
        drawSplinePath(ctx, forePoints);
        ctx.lineTo(forePoints[forePoints.length - 1].x, height);
        ctx.closePath();

        const liquidGrad = ctx.createLinearGradient(0, minY, 0, height);
        let waveShadowColor = 'rgba(255, 255, 255, ' + (0.85 + beatPulse * 0.15) + ')';
        switch (currentTheme) {
            case 'nms':
                liquidGrad.addColorStop(0, '#ffffff');
                liquidGrad.addColorStop(0.12, '#ffab00');
                liquidGrad.addColorStop(0.35, '#ff1744');
                liquidGrad.addColorStop(0.70, 'rgba(213, 0, 0, 0.45)');
                liquidGrad.addColorStop(1, 'rgba(124, 77, 255, 0.05)');
                waveShadowColor = '#ff1744';
                break;
            case 'solar-eclipse':
                liquidGrad.addColorStop(0, '#ffffff');
                liquidGrad.addColorStop(0.15, '#00f0ff');
                liquidGrad.addColorStop(0.40, '#ff007f');
                liquidGrad.addColorStop(0.75, 'rgba(179, 0, 89, 0.40)');
                liquidGrad.addColorStop(1, 'rgba(0, 240, 255, 0.05)');
                waveShadowColor = '#00f0ff';
                break;
            case 'euclid-horizon':
                liquidGrad.addColorStop(0, '#ffffff');
                liquidGrad.addColorStop(0.15, '#fbbf24');
                liquidGrad.addColorStop(0.40, '#14b8a6');
                liquidGrad.addColorStop(0.75, 'rgba(225, 29, 72, 0.35)');
                liquidGrad.addColorStop(1, 'rgba(20, 184, 166, 0.05)');
                waveShadowColor = '#fbbf24';
                break;
            case 'alien-paradise':
                liquidGrad.addColorStop(0, '#ffffff');
                liquidGrad.addColorStop(0.15, '#ff2a70');
                liquidGrad.addColorStop(0.40, '#00ced1');
                liquidGrad.addColorStop(0.75, 'rgba(250, 204, 21, 0.35)');
                liquidGrad.addColorStop(1, 'rgba(0, 206, 209, 0.05)');
                waveShadowColor = '#ff2a70';
                break;
            case 'abyssal-void':
                liquidGrad.addColorStop(0, '#ffffff');
                liquidGrad.addColorStop(0.15, '#00ffaa');
                liquidGrad.addColorStop(0.40, '#10b981');
                liquidGrad.addColorStop(0.75, 'rgba(5, 150, 105, 0.35)');
                liquidGrad.addColorStop(1, 'rgba(16, 185, 129, 0.05)');
                waveShadowColor = '#00ffaa';
                break;
            case 'dissonance':
                liquidGrad.addColorStop(0, '#ffffff');
                liquidGrad.addColorStop(0.15, '#d946ef');
                liquidGrad.addColorStop(0.40, '#a855f7');
                liquidGrad.addColorStop(0.75, 'rgba(126, 34, 206, 0.35)');
                liquidGrad.addColorStop(1, 'rgba(88, 28, 135, 0.05)');
                waveShadowColor = '#d946ef';
                break;
            case 'sentinel':
                liquidGrad.addColorStop(0, '#ffffff');
                liquidGrad.addColorStop(0.15, '#00e5ff');
                liquidGrad.addColorStop(0.40, '#ff3d00');
                liquidGrad.addColorStop(0.75, 'rgba(0, 229, 255, 0.35)');
                liquidGrad.addColorStop(1, 'rgba(11, 14, 23, 0.05)');
                waveShadowColor = '#00e5ff';
                break;
            case 'minimalist-light':
            case 'brutalist-light':
                liquidGrad.addColorStop(0, '#000000');
                liquidGrad.addColorStop(0.35, '#27272a');
                liquidGrad.addColorStop(0.70, 'rgba(0, 0, 0, 0.35)');
                liquidGrad.addColorStop(1, 'rgba(0, 0, 0, 0.04)');
                waveShadowColor = 'rgba(0, 0, 0, 0.3)';
                break;
            case 'minimalist-dark':
            case 'brutalist-dark':
                liquidGrad.addColorStop(0, '#ffffff');
                liquidGrad.addColorStop(0.35, '#e4e4e7');
                liquidGrad.addColorStop(0.70, 'rgba(255, 255, 255, 0.35)');
                liquidGrad.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
                waveShadowColor = 'rgba(255, 255, 255, 0.3)';
                break;
            case 'minimalist-warm':
                liquidGrad.addColorStop(0, '#d97706');
                liquidGrad.addColorStop(0.35, '#b45309');
                liquidGrad.addColorStop(0.70, 'rgba(217, 119, 6, 0.35)');
                liquidGrad.addColorStop(1, 'rgba(250, 248, 245, 0.04)');
                waveShadowColor = 'rgba(217, 119, 6, 0.35)';
                break;
            case 'minimalist-obsidian':
                liquidGrad.addColorStop(0, '#38bdf8');
                liquidGrad.addColorStop(0.35, '#0284c7');
                liquidGrad.addColorStop(0.70, 'rgba(56, 189, 248, 0.35)');
                liquidGrad.addColorStop(1, 'rgba(0, 0, 0, 0.04)');
                waveShadowColor = 'rgba(56, 189, 248, 0.4)';
                break;
            default:
                liquidGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
                liquidGrad.addColorStop(0.18, 'rgba(255, 255, 255, 0.65)');
                liquidGrad.addColorStop(0.50, 'rgba(255, 255, 255, 0.22)');
                liquidGrad.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
                break;
        }
        ctx.fillStyle = liquidGrad;
        ctx.fill();

        // Luminous Crest Ridge with Glow (+25% bloom on beat/snare pulses)
        const crestStrokeColor = (currentTheme === 'minimalist-light' || currentTheme === 'brutalist-light')
            ? '#09090b'
            : (currentTheme === 'minimalist-warm' ? '#9a3412' : (currentTheme === 'minimalist-obsidian' ? '#38bdf8' : '#ffffff'));
        ctx.save();
        if (isFirefox) {
            // Ethereal Multi-Pass Vector Glow for Firefox/Gecko:
            // High-fidelity blooming crest rendered in pure hardware rasterization with 0% CPU blur overhead
            ctx.beginPath();
            ctx.moveTo(forePoints[0].x, forePoints[0].y);
            drawSplinePath(ctx, forePoints);
            ctx.lineWidth = (2.0 + beatPulse * 1.2 + snarePulse * 0.6) * 2.2;
            ctx.strokeStyle = waveShadowColor;
            ctx.globalAlpha = 0.42;
            ctx.stroke();

            ctx.lineWidth = 2.0 + beatPulse * 1.2 + snarePulse * 0.6;
            ctx.strokeStyle = crestStrokeColor;
            ctx.globalAlpha = 1.0;
            ctx.stroke();
        } else {
            ctx.shadowColor = waveShadowColor;
            ctx.shadowBlur = Math.min(12, 4 + beatPulse * 8 + snarePulse * 4);
            ctx.lineWidth = 2.0 + beatPulse * 1.2 + snarePulse * 0.6;
            ctx.strokeStyle = crestStrokeColor;
            ctx.beginPath();
            ctx.moveTo(forePoints[0].x, forePoints[0].y);
            drawSplinePath(ctx, forePoints);
            ctx.stroke();
        }
        ctx.restore();

        // THEME-SPECIFIC DISTINCT WAVEFORM OVERLAYS
        if (currentTheme === 'nms') {
            // Atlas Segmented Vector Laser Nodes along peaks
            ctx.save();
            ctx.fillStyle = '#00e5ff';
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = 8;
            for (let i = 2; i < pointsCount - 2; i += 3) {
                if (bands[i] > 0.35) {
                    const nx = forePoints[i].x;
                    const ny = forePoints[i].y;
                    ctx.beginPath();
                    ctx.arc(nx, ny, 2.4 + beatPulse * 1.5, 0, Math.PI * 2);
                    ctx.fill();
                    // Technical laser crosshair
                    ctx.strokeStyle = 'rgba(255, 23, 68, 0.6)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(nx - 5, ny); ctx.lineTo(nx + 5, ny);
                    ctx.moveTo(nx, ny - 5); ctx.lineTo(nx, ny + 5);
                    ctx.stroke();
                }
            }
            ctx.restore();
        } else if (currentTheme === 'solar-eclipse') {
            // Solar Prominence Plasma Loops leaping above the wave on kicks
            if (playing && beatPulse > 0.35) {
                ctx.save();
                for (let i = 4; i < pointsCount - 4; i += 7) {
                    if (bands[i] > 0.40) {
                        const px = forePoints[i].x;
                        const py = forePoints[i].y;
                        const loopH = (15 + beatPulse * 30) * (bands[i] || 0.5);
                        ctx.beginPath();
                        ctx.moveTo(px - 8, py);
                        ctx.quadraticCurveTo(px, py - loopH, px + 8, py);
                        ctx.strokeStyle = 'rgba(255, 0, 128, 0.85)';
                        ctx.shadowColor = '#00f0ff';
                        ctx.shadowBlur = 10;
                        ctx.lineWidth = 1.8;
                        ctx.stroke();
                    }
                }
                ctx.restore();
            }
        } else if (currentTheme === 'abyssal-void') {
            // Hydrophone Sonar Oscilloscope CRT Graticule Lines
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 255, 170, 0.15)';
            ctx.lineWidth = 0.8;
            const numGrids = 4;
            for (let g = 1; g <= numGrids; g++) {
                const gy = height - (g * (height / (numGrids + 1)));
                ctx.beginPath();
                ctx.moveTo(0, gy);
                ctx.lineTo(width, gy);
                ctx.setLineDash([3, 5]);
                ctx.stroke();
            }
            ctx.restore();
        } else if (currentTheme === 'dissonance') {
            // Corrupted Sentinel Spectrum CRT Telemetry Lines
            ctx.save();
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.16)';
            ctx.lineWidth = 0.8;
            const numGrids = 4;
            for (let g = 1; g <= numGrids; g++) {
                const gy = height - (g * (height / (numGrids + 1)));
                ctx.beginPath();
                ctx.moveTo(0, gy);
                ctx.lineTo(width, gy);
                ctx.setLineDash([3, 6]);
                ctx.stroke();
            }
            ctx.restore();
        } else if (currentTheme === 'sentinel') {
            // Sentinel Security Patrol CRT Telemetry Grid & Scanning nodes
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.14)';
            ctx.lineWidth = 0.8;
            const numGrids = 4;
            for (let g = 1; g <= numGrids; g++) {
                const gy = height - (g * (height / (numGrids + 1)));
                ctx.beginPath();
                ctx.moveTo(0, gy);
                ctx.lineTo(width, gy);
                ctx.setLineDash([4, 6]);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Crest Sparkles emission on snare snaps, vocal spikes & prominent crests (Default theme only)
        if (currentTheme === 'default' && playing && (snarePulse > 0.20 || beatPulse > 0.35)) {
            for (let i = 3; i < pointsCount - 3; i += 3) {
                if (bands[i] > 0.45 && bands[i] >= bands[i - 1] && bands[i] >= bands[i + 1]) {
                    if (Math.random() < 0.32) {
                        emitSparkle(forePoints[i].x, forePoints[i].y, snarePulse + 0.35);
                    }
                }
            }
        }

        // Draw Expanding Shockwaves & Crest Sparkles
        updateAndDrawShockwaves(ctx, dt);
        if (currentTheme === 'default') {
            updateAndDrawSparkles(ctx, dt);
        }

        // Floating spray particles triggered on bass surges and beat hits (Default theme only)
        if (playing && currentTheme === 'default') {
            updateAndDrawParticles(ctx, width, height, dt, smoothBass * 1.6 + beatPulse * 2.2 + snarePulse * 1.2);
        }
    }

    // -------------------------------------------------------------------------
    // Visualizer 2: Segmented Hi-Fi Equalizer (Unique & Distinct for EACH Theme)
    // Dynamic theme-specific column geometry, segment shapes, peak caps & HUD grids
    // -------------------------------------------------------------------------
    function drawVerticalDash(ctx, width, height, bands, playing, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        const currentTheme = getActiveTheme();
        const totalSegments = 16;
        const legendHeight = 12;
        const paddingX = 14;
        const availableW = width - (paddingX * 2);

        // Frame-rate independent attack & decay physics for column dynamics
        const colAttack = 1.0 - Math.exp(-34 * dt);
        const colDecay = 1.0 - Math.exp(-9.8 * dt);

        // Theme-specific column count & geometry
        let colCount = 56;
        if (currentTheme === 'solar-eclipse') colCount = 48;
        else if (currentTheme === 'alien-paradise') colCount = 50;
        else if (currentTheme === 'euclid-horizon') colCount = 52;
        else if (currentTheme === 'nms') colCount = 52;
        else if (currentTheme === 'abyssal-void') colCount = 54;
        else if (currentTheme === 'dissonance') colCount = 52;
        else if (currentTheme === 'sentinel') colCount = 52;
        else if (currentTheme === 'brutalist-light' || currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-dark' || currentTheme === 'minimalist-warm' || currentTheme === 'minimalist-obsidian') colCount = 48;

        const colWidth = availableW / colCount;
        const barWidth = Math.max(3.5, colWidth - 3.5);
        const headerSpace = 16;
        const footerSpace = legendHeight + 4;
        const usableH = Math.max(22, height - headerSpace - footerSpace);
        const segmentGap = Math.max(1.0, Math.min(2.0, (usableH / totalSegments) * 0.35));
        const segmentHeight = Math.max(1.8, (usableH - (totalSegments - 1) * segmentGap) / totalSegments);

        // 1. THEME-SPECIFIC BACKGROUND HUD & OSCILLOSCOPE GRIDS
        if (currentTheme === 'nms') {
            // Atlas Telemetry Scan HUD grid & coordinates
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.12)';
            ctx.lineWidth = 0.8;
            for (let g = 1; g <= 4; g++) {
                const gy = height - legendHeight - 4 - g * ((height - 24) / 5);
                ctx.beginPath();
                ctx.moveTo(paddingX, gy);
                ctx.lineTo(width - paddingX, gy);
                ctx.setLineDash([4, 6]);
                ctx.stroke();
            }
            // Beat scanline sweep
            if (playing && beatPulse > 0.3) {
                const scanX = paddingX + ((performance.now() * 0.25) % availableW);
                const scanGrad = ctx.createLinearGradient(scanX - 25, 0, scanX + 25, 0);
                scanGrad.addColorStop(0, 'rgba(255, 23, 68, 0)');
                scanGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.35)');
                scanGrad.addColorStop(1, 'rgba(255, 23, 68, 0)');
                ctx.fillStyle = scanGrad;
                ctx.fillRect(scanX - 25, 0, 50, height);
            }
            // HUD Top Banner
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = 'rgba(0, 229, 255, 0.65)';
            ctx.fillText('// ATLAS SPECTRAL SCAN // 16.16.16 // 24kHz HIGH-RES BANDWIDTH', paddingX + 2, 11);
            ctx.restore();
        } else if (currentTheme === 'abyssal-void') {
            // Deep Trench Hydrophone CRT Oscilloscope Graticule
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 255, 170, 0.12)';
            ctx.lineWidth = 0.8;
            const dbLabels = ['+3dB', '0dB', '-6dB', '-18dB', '-36dB'];
            for (let g = 0; g < dbLabels.length; g++) {
                const gy = height - legendHeight - 4 - (g + 1) * ((height - 26) / (dbLabels.length + 1));
                ctx.beginPath();
                ctx.moveTo(paddingX, gy);
                ctx.lineTo(width - paddingX, gy);
                ctx.setLineDash([2, 5]);
                ctx.stroke();
                ctx.font = '7px NMSFuturaProBook, monospace';
                ctx.fillStyle = 'rgba(0, 255, 170, 0.45)';
                ctx.fillText(dbLabels[g], paddingX + 2, gy - 2);
            }
            // Oscilloscope sonar sweep indicator
            const sweepX = paddingX + ((performance.now() * 0.18) % availableW);
            ctx.strokeStyle = 'rgba(0, 255, 170, ' + (0.25 + beatPulse * 0.35) + ')';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(sweepX, 0);
            ctx.lineTo(sweepX, height - legendHeight - 2);
            ctx.stroke();
            ctx.restore();
        } else if (currentTheme === 'euclid-horizon') {
            // Synthwave Horizon Perspective Baseline Grid
            ctx.save();
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.15)';
            ctx.lineWidth = 0.8;
            for (let g = 1; g <= 3; g++) {
                const gy = height - legendHeight - 2 - g * 12;
                ctx.beginPath();
                ctx.moveTo(paddingX, gy);
                ctx.lineTo(width - paddingX, gy);
                ctx.stroke();
            }
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = 'rgba(251, 191, 36, 0.65)';
            ctx.fillText('EUCLID HORIZON // 1984 VECTOR SYNTH // 24kHz', paddingX + 2, 11);
            ctx.restore();
        } else if (currentTheme === 'solar-eclipse') {
            // Celestial Solar Prominence Header
            ctx.save();
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = 'rgba(0, 240, 255, 0.65)';
            ctx.fillText('SOLAR CORONA // 5800K // 24kHz HELIOS FLUX', paddingX + 2, 11);
            ctx.restore();
        } else if (currentTheme === 'alien-paradise') {
            ctx.save();
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = 'rgba(244, 63, 94, 0.65)';
            ctx.fillText('XENOFLORA // BIO-LUMINESCENT 24kHz SPORE SPECTRUM', paddingX + 2, 11);
            ctx.restore();
        } else if (currentTheme === 'dissonance') {
            // Corrupted Sentinel Spectrum Scanner HUD
            ctx.save();
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.14)';
            ctx.lineWidth = 0.8;
            for (let g = 1; g <= 4; g++) {
                const gy = height - footerSpace - g * (usableH / 5);
                ctx.beginPath();
                ctx.moveTo(paddingX, gy);
                ctx.lineTo(width - paddingX, gy);
                ctx.setLineDash([3, 6]);
                ctx.stroke();
            }
            if (playing && beatPulse > 0.3) {
                const scanX = paddingX + ((performance.now() * 0.22) % availableW);
                const scanGrad = ctx.createLinearGradient(scanX - 25, 0, scanX + 25, 0);
                scanGrad.addColorStop(0, 'rgba(168, 85, 247, 0)');
                scanGrad.addColorStop(0.5, 'rgba(217, 70, 239, 0.35)');
                scanGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
                ctx.fillStyle = scanGrad;
                ctx.fillRect(scanX - 25, headerSpace, 50, usableH);
            }
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = 'rgba(217, 70, 239, 0.75)';
            ctx.fillText('// DISSONANCE DETECTED // ATLANTIDEUM // 24kHz RESONATOR SCAN', paddingX + 2, 11);
            ctx.restore();
        } else if (currentTheme === 'sentinel') {
            // Sentinel Security Patrol HUD Sweep & Wanted Level Banner
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.14)';
            ctx.lineWidth = 0.8;
            for (let g = 1; g <= 4; g++) {
                const gy = height - legendHeight - 4 - g * ((height - 24) / 5);
                ctx.beginPath();
                ctx.moveTo(paddingX, gy);
                ctx.lineTo(width - paddingX, gy);
                ctx.setLineDash([4, 6]);
                ctx.stroke();
            }
            if (playing && beatPulse > 0.3) {
                const scanX = paddingX + ((performance.now() * 0.24) % availableW);
                const scanGrad = ctx.createLinearGradient(scanX - 25, 0, scanX + 25, 0);
                scanGrad.addColorStop(0, 'rgba(0, 229, 255, 0)');
                scanGrad.addColorStop(0.5, 'rgba(255, 61, 0, 0.35)');
                scanGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
                ctx.fillStyle = scanGrad;
                ctx.fillRect(scanX - 25, 0, 50, height);
            }
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = 'rgba(0, 229, 255, 0.85)';
            ctx.fillText('// SENTINEL PATROL GRID // 24kHz SPECTRAL MONITOR // SECURITY SCAN //', paddingX + 2, 11);
            ctx.restore();
        } else if (currentTheme === 'brutalist-light' || currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-dark' || currentTheme === 'minimalist-warm' || currentTheme === 'minimalist-obsidian') {
            const isLt = (currentTheme === 'brutalist-light' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-warm');
            ctx.save();
            let gridCol = isLt ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
            if (currentTheme === 'minimalist-warm') gridCol = 'rgba(217, 119, 6, 0.12)';
            else if (currentTheme === 'minimalist-obsidian') gridCol = 'rgba(56, 189, 248, 0.12)';
            ctx.strokeStyle = gridCol;
            ctx.lineWidth = 0.8;
            for (let g = 1; g <= 4; g++) {
                const gy = height - legendHeight - 4 - g * ((height - 24) / 5);
                ctx.beginPath();
                ctx.moveTo(paddingX, gy);
                ctx.lineTo(width - paddingX, gy);
                ctx.stroke();
            }
            ctx.font = '700 8px monospace';
            let headerText = isLt ? '// MINIMALIST ARCHITECTURAL EQUALIZER // CH-1/2 // LINEAR' : '// MINIMALIST MONOLITHIC EQUALIZER // CH-1/2 // LINEAR';
            let textCol = isLt ? '#000000' : '#ffffff';
            if (currentTheme === 'minimalist-warm') {
                headerText = '// MINIMALIST WARM PAPER EQUALIZER // CH-1/2 // LINEAR';
                textCol = '#1c1917';
            } else if (currentTheme === 'minimalist-obsidian') {
                headerText = '// MINIMALIST OBSIDIAN OLED EQUALIZER // CH-1/2 // ZERO-WATT';
                textCol = '#38bdf8';
            }
            ctx.fillStyle = textCol;
            ctx.fillText(headerText, paddingX + 2, 11);
            ctx.restore();
        }

        // Color definitions for each theme
        let peakColor = '#ffffff';
        let peakGlow = 'rgba(255, 255, 255, 0.95)';
        let midColor = 'rgba(255, 255, 255, 0.92)';
        let midGlow = 'rgba(255, 255, 255, 0.45)';
        let lowColor = 'rgba(255, 255, 255, 0.78)';
        let lowGlow = 'transparent';
        let unlitColor = 'rgba(255, 255, 255, 0.07)';
        let diamondColor = '#ffffff';

        if (currentTheme === 'nms') {
            peakColor = '#ff1744'; peakGlow = 'rgba(255, 23, 68, 0.95)';
            midColor = '#ffab00'; midGlow = 'rgba(255, 171, 0, 0.65)';
            lowColor = 'rgba(0, 229, 255, 0.85)'; lowGlow = 'rgba(0, 229, 255, 0.4)';
            unlitColor = 'rgba(0, 229, 255, 0.06)'; diamondColor = '#ff1744';
        } else if (currentTheme === 'solar-eclipse') {
            peakColor = '#ff007f'; peakGlow = 'rgba(255, 0, 127, 0.95)';
            midColor = '#3b82f6'; midGlow = 'rgba(59, 130, 246, 0.65)';
            lowColor = 'rgba(0, 240, 255, 0.85)'; lowGlow = 'rgba(0, 240, 255, 0.4)';
            unlitColor = 'rgba(0, 240, 255, 0.06)'; diamondColor = '#00f0ff';
        } else if (currentTheme === 'euclid-horizon') {
            peakColor = '#e11d48'; peakGlow = 'rgba(225, 29, 72, 0.95)';
            midColor = '#fbbf24'; midGlow = 'rgba(251, 191, 36, 0.65)';
            lowColor = 'rgba(20, 184, 166, 0.85)'; lowGlow = 'rgba(20, 184, 166, 0.4)';
            unlitColor = 'rgba(20, 184, 166, 0.06)'; diamondColor = '#fbbf24';
        } else if (currentTheme === 'alien-paradise') {
            peakColor = '#ff2a70'; peakGlow = 'rgba(255, 42, 112, 0.95)';
            midColor = '#facc15'; midGlow = 'rgba(250, 204, 21, 0.65)';
            lowColor = 'rgba(0, 206, 209, 0.85)'; lowGlow = 'rgba(0, 206, 209, 0.4)';
            unlitColor = 'rgba(0, 206, 209, 0.06)'; diamondColor = '#ff2a70';
        } else if (currentTheme === 'abyssal-void') {
            peakColor = '#00ffaa'; peakGlow = 'rgba(0, 255, 170, 0.95)';
            midColor = '#6ee7b7'; midGlow = 'rgba(110, 231, 183, 0.65)';
            lowColor = 'rgba(16, 185, 129, 0.85)'; lowGlow = 'rgba(16, 185, 129, 0.4)';
            unlitColor = 'rgba(16, 185, 129, 0.06)'; diamondColor = '#00ffaa';
        } else if (currentTheme === 'dissonance') {
            peakColor = '#fae8ff'; peakGlow = 'rgba(217, 70, 239, 0.95)';
            midColor = '#d946ef'; midGlow = 'rgba(217, 70, 239, 0.75)';
            lowColor = 'rgba(168, 85, 247, 0.88)'; lowGlow = 'rgba(168, 85, 247, 0.45)';
            unlitColor = 'rgba(168, 85, 247, 0.12)'; diamondColor = '#d946ef';
        } else if (currentTheme === 'sentinel') {
            peakColor = '#ff3d00'; peakGlow = 'rgba(255, 61, 0, 0.95)';
            midColor = '#00e5ff'; midGlow = 'rgba(0, 229, 255, 0.65)';
            lowColor = 'rgba(248, 250, 252, 0.85)'; lowGlow = 'rgba(248, 250, 252, 0.4)';
            unlitColor = 'rgba(0, 229, 255, 0.06)'; diamondColor = '#00e5ff';
        } else if (currentTheme === 'brutalist-light' || currentTheme === 'minimalist-light') {
            peakColor = '#000000'; peakGlow = 'rgba(0, 0, 0, 0.35)';
            midColor = '#27272a'; midGlow = 'rgba(0, 0, 0, 0.15)';
            lowColor = 'rgba(39, 39, 42, 0.85)'; lowGlow = 'transparent';
            unlitColor = 'rgba(0, 0, 0, 0.05)'; diamondColor = '#000000';
        } else if (currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-dark') {
            peakColor = '#ffffff'; peakGlow = 'rgba(255, 255, 255, 0.75)';
            midColor = '#e4e4e7'; midGlow = 'rgba(255, 255, 255, 0.25)';
            lowColor = 'rgba(228, 228, 231, 0.85)'; lowGlow = 'transparent';
            unlitColor = 'rgba(255, 255, 255, 0.05)'; diamondColor = '#ffffff';
        } else if (currentTheme === 'minimalist-warm') {
            peakColor = '#d97706'; peakGlow = 'rgba(217, 119, 6, 0.45)';
            midColor = '#b45309'; midGlow = 'rgba(180, 83, 9, 0.2)';
            lowColor = '#1c1917'; lowGlow = 'transparent';
            unlitColor = 'rgba(28, 25, 23, 0.05)'; diamondColor = '#d97706';
        } else if (currentTheme === 'minimalist-obsidian') {
            peakColor = '#38bdf8'; peakGlow = 'rgba(56, 189, 248, 0.85)';
            midColor = '#ffffff'; midGlow = 'rgba(255, 255, 255, 0.35)';
            lowColor = '#e2e8f0'; lowGlow = 'transparent';
            unlitColor = 'rgba(255, 255, 255, 0.05)'; diamondColor = '#38bdf8';
        }

        // 2. COLUMN EQUALIZER PHYSICS & SEGMENTS RENDERING
        for (let i = 0; i < colCount; i++) {
            const x = paddingX + i * colWidth + (colWidth - barWidth) / 2;
            const bandVal = bands[Math.floor((i / colCount) * bands.length)] || 0;
            const shapedVal = Math.pow(bandVal, 1.25);
            const transientPop = (i < 18 ? beatPulse * 1.4 : (i < 38 ? snarePulse * 1.2 : smoothTreble * 1.1));

            const targetSegments = playing
                ? Math.max(0.6, Math.min(15.6, shapedVal * 12.8 + transientPop * 2.2))
                : Math.max(0.8, Math.sin((i * 0.28) + simPhase) * 1.6 + 2.2);

            if (targetSegments > smoothDashLevels[i]) {
                smoothDashLevels[i] += (targetSegments - smoothDashLevels[i]) * colAttack;
            } else {
                smoothDashLevels[i] += (targetSegments - smoothDashLevels[i]) * colDecay;
            }
            const currentLevel = smoothDashLevels[i];

            if (currentLevel >= peakValues[i]) {
                peakValues[i] = currentLevel;
                peakVelocity[i] = 0;
                peakHold[i] = 20;
            } else {
                if (peakHold[i] > 0) {
                    peakHold[i]--;
                } else {
                    peakVelocity[i] += 26 * dt;
                    peakValues[i] = Math.max(0, peakValues[i] - peakVelocity[i] * dt);
                }
            }

            const fullSegments = Math.floor(currentLevel);
            const fraction = currentLevel - fullSegments;

            // Render Segments per Theme
            for (let s = 0; s < totalSegments; s++) {
                const y = height - footerSpace - segmentHeight - s * (segmentHeight + segmentGap);
                const isMidSeg = s >= 8 && s < 12;
                const isPeakZone = s >= 12;
                const isLit = s < fullSegments;
                const isPartial = s === fullSegments && fraction > 0.03;

                const segColor = isPeakZone ? peakColor : (isMidSeg ? midColor : lowColor);
                ctx.fillStyle = (isLit || isPartial) ? segColor : unlitColor;

                // THEME-SPECIFIC SEGMENT SHAPES!
                if (currentTheme === 'nms') {
                    // Slanted Tech Chevron / Tactical Trapezoid
                    ctx.beginPath();
                    ctx.moveTo(x + 2, y);
                    ctx.lineTo(x + barWidth, y);
                    ctx.lineTo(x + barWidth - 2, y + segmentHeight);
                    ctx.lineTo(x, y + segmentHeight);
                    ctx.closePath();
                    ctx.fill();
                } else if (currentTheme === 'solar-eclipse') {
                    // Glowing Circular Plasma Node / Eclipse Bead
                    const cyNode = y + segmentHeight / 2;
                    const cxNode = x + barWidth / 2;
                    const radNode = Math.min(barWidth, segmentHeight) * 0.48;
                    ctx.beginPath();
                    ctx.arc(cxNode, cyNode, radNode, 0, Math.PI * 2);
                    ctx.fill();
                } else if (currentTheme === 'euclid-horizon') {
                    // Wireframe Dual-Stroke Laser Synth Bar
                    ctx.fillRect(x, y, barWidth, segmentHeight);
                    if (isLit) {
                        ctx.strokeStyle = isPeakZone ? '#fbbf24' : (isMidSeg ? '#14b8a6' : 'rgba(251, 191, 36, 0.7)');
                        ctx.lineWidth = 1;
                        ctx.strokeRect(x, y, barWidth, segmentHeight);
                    }
                } else if (currentTheme === 'alien-paradise') {
                    // Smooth Organic Capsule Pod
                    drawRoundedRect(ctx, x, y, barWidth, segmentHeight, segmentHeight * 0.45);
                } else if (currentTheme === 'abyssal-void') {
                    // Digital CRT Phosphor Pip
                    ctx.fillRect(x, y, barWidth, segmentHeight);
                    // CRT Scanline notch
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                    ctx.fillRect(x, y + segmentHeight * 0.5, barWidth, 0.6);
                } else if (currentTheme === 'dissonance') {
                    // Angular Corrupted Sentinel Crystal Prism Segment
                    const inset = Math.min(1.5, Math.max(0.8, barWidth * 0.14));
                    ctx.beginPath();
                    ctx.moveTo(x + inset, y);
                    ctx.lineTo(x + barWidth - inset, y);
                    ctx.lineTo(x + barWidth, y + segmentHeight / 2);
                    ctx.lineTo(x + barWidth - inset, y + segmentHeight);
                    ctx.lineTo(x + inset, y + segmentHeight);
                    ctx.lineTo(x, y + segmentHeight / 2);
                    ctx.closePath();
                    ctx.fill();
                    if (isLit && isPeakZone) {
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                } else if (currentTheme === 'sentinel') {
                    // Ceramic Armor Angled Tactical Plate
                    const inset = 1.0;
                    ctx.beginPath();
                    ctx.moveTo(x + inset, y);
                    ctx.lineTo(x + barWidth, y);
                    ctx.lineTo(x + barWidth - inset, y + segmentHeight);
                    ctx.lineTo(x, y + segmentHeight);
                    ctx.closePath();
                    ctx.fill();
                    if (isLit && isPeakZone) {
                        ctx.strokeStyle = '#ff3d00';
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                } else if (currentTheme === 'brutalist-light' || currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-dark' || currentTheme === 'minimalist-warm' || currentTheme === 'minimalist-obsidian') {
                    // Pure Minimalist Rectilinear Segment: Sharp 0px corners, high-contrast flat fill
                    ctx.fillRect(x, y, barWidth, segmentHeight);
                    if (isLit && isPeakZone) {
                        let strokeCol = '#ffffff';
                        if (currentTheme === 'minimalist-light' || currentTheme === 'brutalist-light') strokeCol = '#000000';
                        else if (currentTheme === 'minimalist-warm') strokeCol = '#d97706';
                        else if (currentTheme === 'minimalist-obsidian') strokeCol = '#38bdf8';
                        ctx.strokeStyle = strokeCol;
                        ctx.lineWidth = 1;
                        ctx.strokeRect(x, y, barWidth, segmentHeight);
                    }
                } else {
                    // Default Studio Phosphor Rounded Bar
                    drawRoundedRect(ctx, x, y, barWidth, segmentHeight, 1);
                }
                ctx.shadowBlur = 0;
            }

            // 3. THEME-SPECIFIC FLOATING PEAK CAPS!
            const peakSeg = Math.min(totalSegments - 1, Math.floor(peakValues[i]));
            if (peakSeg > fullSegments && peakSeg >= 1) {
                const peakY = height - footerSpace - segmentHeight - peakSeg * (segmentHeight + segmentGap);
                const pcx = x + barWidth / 2;
                const pcy = peakY + segmentHeight / 2;

                if (currentTheme === 'nms') {
                    // Atlas Holographic Diamond with Target Brackets [ ◆ ]
                    ctx.save();
                    ctx.translate(pcx, pcy);
                    ctx.rotate(Math.PI / 4);
                    ctx.fillStyle = diamondColor;
                    ctx.shadowColor = diamondColor;
                    ctx.shadowBlur = Math.min(4, 2 + beatPulse * 2);
                    const dSize = Math.max(2.2, Math.min(segmentHeight, barWidth * 0.45, 5.0));
                    ctx.fillRect(-dSize / 2, -dSize / 2, dSize, dSize);
                    ctx.restore();
                    // Telemetry bracket
                    ctx.strokeStyle = '#00e5ff';
                    ctx.lineWidth = 0.8;
                    ctx.beginPath();
                    ctx.moveTo(pcx - barWidth * 0.45, pcy - 2);
                    ctx.lineTo(pcx - barWidth * 0.45, pcy + 2);
                    ctx.moveTo(pcx + barWidth * 0.45, pcy - 2);
                    ctx.lineTo(pcx + barWidth * 0.45, pcy + 2);
                    ctx.stroke();
                } else if (currentTheme === 'solar-eclipse') {
                    // Solar Eclipse Corona Orb with Pulsing Halo
                    ctx.save();
                    ctx.fillStyle = '#ff007f';
                    ctx.shadowColor = '#00f0ff';
                    ctx.shadowBlur = Math.min(4, 2 + beatPulse * 2);
                    const orbR = Math.max(1.8, Math.min(barWidth * 0.38, segmentHeight * 0.85, 4.0));
                    ctx.beginPath();
                    ctx.arc(pcx, pcy, orbR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#00f0ff';
                    ctx.lineWidth = 1.0;
                    ctx.stroke();
                    ctx.restore();
                } else if (currentTheme === 'euclid-horizon') {
                    // Horizon Speed Vector Blip
                    ctx.save();
                    ctx.fillStyle = '#fbbf24';
                    ctx.shadowColor = '#fbbf24';
                    ctx.shadowBlur = 3;
                    ctx.fillRect(x - 1, peakY, barWidth + 2, Math.min(2.2, segmentHeight));
                    ctx.fillStyle = '#14b8a6';
                    ctx.fillRect(pcx - 1, peakY - 3, 2, 2);
                    ctx.restore();
                } else if (currentTheme === 'alien-paradise') {
                    // Floating Bioluminescent Spore Bead
                    ctx.save();
                    const bobY = pcy + Math.sin(performance.now() * 0.005 + i) * 1.0;
                    ctx.fillStyle = '#ff2a70';
                    ctx.shadowColor = '#00ced1';
                    ctx.shadowBlur = Math.min(4, 2 + beatPulse * 2);
                    const sporeR = Math.max(1.6, Math.min(barWidth * 0.36, segmentHeight * 0.8, 3.8));
                    ctx.beginPath();
                    ctx.arc(pcx, bobY, sporeR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (currentTheme === 'abyssal-void') {
                    // Sonar Radar Blip & Ripple Ring
                    ctx.save();
                    ctx.fillStyle = '#00ffaa';
                    ctx.shadowColor = '#00ffaa';
                    ctx.shadowBlur = 3;
                    ctx.fillRect(x, peakY, barWidth, Math.min(2.0, segmentHeight));
                    // Radar ping ripple
                    ctx.strokeStyle = 'rgba(0, 255, 170, ' + (0.4 + beatPulse * 0.4) + ')';
                    ctx.lineWidth = 0.8;
                    ctx.beginPath();
                    ctx.arc(pcx, pcy, Math.min(barWidth * 0.65, 6.0), 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                } else if (currentTheme === 'dissonance') {
                    // Floating Luminous Atlantideum Shard Diamond Cap
                    ctx.save();
                    ctx.fillStyle = '#fae8ff';
                    ctx.shadowColor = '#d946ef';
                    ctx.shadowBlur = Math.min(4, 2 + beatPulse * 2);
                    const capH = Math.max(1.8, Math.min(segmentHeight, 3.5));
                    const capW = Math.max(3.0, Math.min(barWidth * 0.7, 8.0));
                    ctx.beginPath();
                    ctx.moveTo(pcx, pcy - capH);
                    ctx.lineTo(pcx + capW * 0.5, pcy);
                    ctx.lineTo(pcx, pcy + capH);
                    ctx.lineTo(pcx - capW * 0.5, pcy);
                    ctx.closePath();
                    ctx.fill();
                    // Inner luminous crystal core
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(pcx, pcy, Math.min(capH, capW) * 0.28, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (currentTheme === 'sentinel') {
                    // Sentinel Laser Targeter Pip with Crosshair
                    ctx.save();
                    ctx.fillStyle = '#ff3d00';
                    ctx.shadowColor = '#ff3d00';
                    ctx.shadowBlur = Math.min(4, 2 + beatPulse * 2);
                    ctx.fillRect(x, peakY, barWidth, Math.min(2.0, segmentHeight));
                    // Optical targeting pip
                    ctx.fillStyle = '#00e5ff';
                    ctx.beginPath();
                    ctx.arc(pcx, pcy, Math.min(1.4, segmentHeight * 0.5), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (currentTheme === 'brutalist-light' || currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-dark' || currentTheme === 'minimalist-warm' || currentTheme === 'minimalist-obsidian') {
                    // Pure Minimalist Peak Cap: Sharp solid horizontal tick mark
                    ctx.save();
                    let capCol = '#ffffff';
                    if (currentTheme === 'minimalist-light' || currentTheme === 'brutalist-light') capCol = '#000000';
                    else if (currentTheme === 'minimalist-warm') capCol = '#d97706';
                    else if (currentTheme === 'minimalist-obsidian') capCol = '#38bdf8';
                    ctx.fillStyle = capCol;
                    ctx.shadowBlur = 0;
                    ctx.fillRect(x, peakY, barWidth, Math.min(2.0, segmentHeight));
                    ctx.restore();
                } else {
                    // Default Studio Phosphor LED Peak Bar
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowColor = 'rgba(255, 255, 255, 0.95)';
                    ctx.shadowBlur = Math.min(4, 2 + beatPulse * 2);
                    drawRoundedRect(ctx, x, peakY, barWidth, segmentHeight, 1);
                    ctx.shadowBlur = 0;
                }
            }
        }

        // 4. THEME-SPECIFIC FLOOR BASELINE & LABELS (Full 20Hz - 24kHz High-Fidelity Bandwidth)
        if (currentTheme === 'nms') {
            // Atlas Telemetry Baseline
            ctx.fillStyle = '#ff1744';
            ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.5);
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = 'rgba(0, 229, 255, 0.8)';
            const techMarks = [
                { col: 2, text: '[30Hz]' }, { col: 14, text: '[250Hz]' },
                { col: 27, text: '[1kHz]' }, { col: 38, text: '[4kHz]' },
                { col: 46, text: '[16kHz]' }, { col: 51, text: '[24kHz]' }
            ];
            for (const tm of techMarks) {
                const isEdge = (tm.col >= colCount - 1);
                const isStart = (tm.col <= 2);
                ctx.textAlign = isEdge ? 'right' : (isStart ? 'left' : 'center');
                const lx = isEdge ? (width - paddingX) : (isStart ? paddingX : (paddingX + tm.col * colWidth + colWidth / 2));
                ctx.fillText(tm.text, lx, height - 2);
            }
        } else if (currentTheme === 'solar-eclipse') {
            // Solar Prominence Plasma Floor
            const solGrad = ctx.createLinearGradient(paddingX, 0, width - paddingX, 0);
            solGrad.addColorStop(0, '#00f0ff');
            solGrad.addColorStop(0.5, '#ff007f');
            solGrad.addColorStop(1, '#00f0ff');
            ctx.fillStyle = solGrad;
            ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.8);
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = '#00f0ff';
            const solarMarks = [
                { col: 2, text: '• 30Hz' }, { col: 14, text: '• 250Hz' },
                { col: 25, text: '• 1kHz' }, { col: 35, text: '• 4kHz' },
                { col: 42, text: '• 16kHz' }, { col: 47, text: '• 24kHz' }
            ];
            for (const sm of solarMarks) {
                const isEdge = (sm.col >= colCount - 1);
                const isStart = (sm.col <= 2);
                ctx.textAlign = isEdge ? 'right' : (isStart ? 'left' : 'center');
                const lx = isEdge ? (width - paddingX) : (isStart ? paddingX : (paddingX + sm.col * colWidth + colWidth / 2));
                ctx.fillText(sm.text, lx, height - 2);
            }
        } else if (currentTheme === 'euclid-horizon') {
            // Synthwave Horizon Sun Arc & Floor
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.8);
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = '#fbbf24';
            const synthMarks = [
                { col: 2, text: '30Hz' }, { col: 14, text: '250Hz' },
                { col: 27, text: '1kHz' }, { col: 38, text: '4kHz' },
                { col: 46, text: '16kHz' }, { col: 51, text: '24kHz' }
            ];
            for (const sm of synthMarks) {
                const isEdge = (sm.col >= colCount - 1);
                const isStart = (sm.col <= 2);
                ctx.textAlign = isEdge ? 'right' : (isStart ? 'left' : 'center');
                const lx = isEdge ? (width - paddingX) : (isStart ? paddingX : (paddingX + sm.col * colWidth + colWidth / 2));
                ctx.fillText(sm.text, lx, height - 2);
            }
        } else if (currentTheme === 'alien-paradise') {
            // Undulating Mycelial Wave Baseline
            ctx.strokeStyle = '#ff2a70';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(paddingX, height - legendHeight - 2);
            for (let xPos = paddingX; xPos <= width - paddingX; xPos += 10) {
                const waveY = height - legendHeight - 2 + Math.sin(xPos * 0.05 + performance.now() * 0.003) * 1.5;
                ctx.lineTo(xPos, waveY);
            }
            ctx.stroke();
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = '#00ced1';
            const bioMarks = [
                { col: 2, text: '✿ 30Hz' }, { col: 14, text: '✿ 250Hz' },
                { col: 26, text: '✿ 1kHz' }, { col: 37, text: '✿ 4kHz' },
                { col: 44, text: '✿ 16kHz' }, { col: 49, text: '✿ 24kHz' }
            ];
            for (const bm of bioMarks) {
                const isEdge = (bm.col >= colCount - 1);
                const isStart = (bm.col <= 2);
                ctx.textAlign = isEdge ? 'right' : (isStart ? 'left' : 'center');
                const lx = isEdge ? (width - paddingX) : (isStart ? paddingX : (paddingX + bm.col * colWidth + colWidth / 2));
                ctx.fillText(bm.text, lx, height - 2);
            }
        } else if (currentTheme === 'abyssal-void') {
            // CRT Hydrophone Sonar Floor
            ctx.fillStyle = '#00ffaa';
            ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.8);
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = '#00ffaa';
            const sonarMarks = [
                { col: 2, text: '◄ 30Hz' }, { col: 14, text: '◄ 250Hz' },
                { col: 28, text: '◄ 1kHz' }, { col: 39, text: '◄ 4kHz' },
                { col: 47, text: '◄ 16kHz' }, { col: 53, text: '◄ 24kHz' }
            ];
            for (const sm of sonarMarks) {
                const isEdge = (sm.col >= colCount - 1);
                const isStart = (sm.col <= 2);
                ctx.textAlign = isEdge ? 'right' : (isStart ? 'left' : 'center');
                const lx = isEdge ? (width - paddingX) : (isStart ? paddingX : (paddingX + sm.col * colWidth + colWidth / 2));
                ctx.fillText(sm.text, lx, height - 2);
            }
        } else if (currentTheme === 'dissonance') {
            // Corrupted Sentinel Dissonance Floor Baseline
            ctx.fillStyle = '#d946ef';
            ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.8);
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = '#d946ef';
            const dissMarks = [
                { col: 2, text: '✦ 30Hz' }, { col: 14, text: '✦ 250Hz' },
                { col: 27, text: '✦ 1kHz' }, { col: 38, text: '✦ 4kHz' },
                { col: 46, text: '✦ 16kHz' }, { col: 51, text: '✦ 24kHz' }
            ];
            for (const dm of dissMarks) {
                const isEdge = (dm.col >= colCount - 1);
                const isStart = (dm.col <= 2);
                ctx.textAlign = isEdge ? 'right' : (isStart ? 'left' : 'center');
                const lx = isEdge ? (width - paddingX) : (isStart ? paddingX : (paddingX + dm.col * colWidth + colWidth / 2));
                ctx.fillText(dm.text, lx, height - 2);
            }
        } else if (currentTheme === 'sentinel') {
            // Sentinel Security Enforcement Floor Baseline
            ctx.fillStyle = '#ff3d00';
            ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.8);
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = '#00e5ff';
            const sentinelMarks = [
                { col: 2, text: '[30Hz]' }, { col: 14, text: '[250Hz]' },
                { col: 27, text: '[1kHz]' }, { col: 38, text: '[4kHz]' },
                { col: 46, text: '[16kHz]' }, { col: 51, text: '[24kHz]' }
            ];
            for (const sm of sentinelMarks) {
                const isEdge = (sm.col >= colCount - 1);
                const isStart = (sm.col <= 2);
                ctx.textAlign = isEdge ? 'right' : (isStart ? 'left' : 'center');
                const lx = isEdge ? (width - paddingX) : (isStart ? paddingX : (paddingX + sm.col * colWidth + colWidth / 2));
                ctx.fillText(sm.text, lx, height - 2);
            }
        } else if (currentTheme === 'brutalist-light' || currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-dark' || currentTheme === 'minimalist-warm' || currentTheme === 'minimalist-obsidian') {
            const isLt = (currentTheme === 'brutalist-light' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-warm');
            let floorCol = isLt ? '#000000' : '#ffffff';
            if (currentTheme === 'minimalist-warm') floorCol = '#d97706';
            else if (currentTheme === 'minimalist-obsidian') floorCol = '#38bdf8';
            ctx.fillStyle = floorCol;
            ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.5);
            ctx.font = '700 8px monospace';
            ctx.fillStyle = floorCol;
            const techMarks = [
                { col: 2, text: '30Hz' }, { col: 14, text: '250Hz' },
                { col: 25, text: '1kHz' }, { col: 35, text: '4kHz' },
                { col: 42, text: '16kHz' }, { col: 47, text: '24kHz' }
            ];
            for (const tm of techMarks) {
                const isEdge = (tm.col >= colCount - 1);
                const isStart = (tm.col <= 2);
                ctx.textAlign = isEdge ? 'right' : (isStart ? 'left' : 'center');
                const lx = isEdge ? (width - paddingX) : (isStart ? paddingX : (paddingX + tm.col * colWidth + colWidth / 2));
                ctx.fillText(tm.text, lx, height - 2);
            }
        } else {
            // Default Studio Floor
            ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.24 + beatPulse * 0.40) + ')';
            ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1);
            const freqLegends = [
                { col: 2, text: '30' }, { col: 8, text: '60' },
                { col: 17, text: '250' }, { col: 29, text: '1k' },
                { col: 40, text: '4k' }, { col: 49, text: '16k' },
                { col: 55, text: '24k' }
            ];
            ctx.save();
            ctx.font = '8px NMSFuturaProBook, monospace';
            ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.28 + (beatPulse + snarePulse) * 0.20) + ')';
            for (const fl of freqLegends) {
                const isEdge = (fl.col >= colCount - 1);
                const isStart = (fl.col <= 2);
                ctx.textAlign = isEdge ? 'right' : (isStart ? 'left' : 'center');
                const lx = isEdge ? (width - paddingX) : (isStart ? paddingX : (paddingX + fl.col * colWidth + colWidth / 2));
                ctx.fillText(fl.text, lx, height - 2);
            }
            ctx.restore();
        }
    }

    function drawRoundedRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
    }

    // Attach visualizer functions to window
    if (typeof window !== "undefined") {
        try { window.setupVisualizerMode = setupVisualizerMode; } catch (_) {}
        try { window.setVisualizerMode = setVisualizerMode; } catch (_) {}
        try { window.refreshCanvasDimensions = refreshCanvasDimensions; } catch (_) {}
        try { window.syncTurntableCenterCanvas = syncTurntableCenterCanvas; } catch (_) {}
        try { window.syncCanvasResolution = syncCanvasResolution; } catch (_) {}
        try { window.setupCanvas = setupCanvas; } catch (_) {}
        try { window.emitShockwave = emitShockwave; } catch (_) {}
        try { window.updateAndDrawShockwaves = updateAndDrawShockwaves; } catch (_) {}
        try { window.emitSparkle = emitSparkle; } catch (_) {}
        try { window.updateAndDrawSparkles = updateAndDrawSparkles; } catch (_) {}
        try { window.drawSplinePath = drawSplinePath; } catch (_) {}
        try { window.startVisualizerLoop = startVisualizerLoop; } catch (_) {}
        try { window.drawSolidWave = drawSolidWave; } catch (_) {}
        try { window.drawVerticalDash = drawVerticalDash; } catch (_) {}
        try { window.drawRoundedRect = drawRoundedRect; } catch (_) {}
        try { window.loadVisualizerThemes1 = loadVisualizerThemes1; } catch (_) {}
        try { window.loadVisualizerThemes2 = loadVisualizerThemes2; } catch (_) {}
    }



    // --- Sub-Module: themes.js ---
// CachyMusic - 10-Theme Palette & Ambient Aura Engine
    let ambientCtx = null;
    const ambientColorCache = new Map();

    function updateAmbientLighting(coverUrl) {
        if (!coverUrl) return;

        if (ambientColorCache.has(coverUrl)) {
            const [c1, c2] = ambientColorCache.get(coverUrl);
            document.documentElement.style.setProperty('--ambient-aura-1', c1);
            document.documentElement.style.setProperty('--ambient-aura-2', c2);
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                if (!ambientCanvas) {
                    ambientCanvas = document.createElement('canvas');
                    ambientCanvas.width = 16;
                    ambientCanvas.height = 16;
                    ambientCtx = ambientCanvas.getContext('2d', { willReadFrequently: true });
                }
                ambientCtx.drawImage(img, 0, 0, 16, 16);
                const imgData = ambientCtx.getImageData(0, 0, 16, 16).data;

                let rSum = 0, gSum = 0, bSum = 0, count = 0;
                let maxSat = -1;
                let satR = 230, satG = 20, satB = 20;

                for (let i = 0; i < imgData.length; i += 4) {
                    const r = imgData[i];
                    const g = imgData[i + 1];
                    const b = imgData[i + 2];
                    const a = imgData[i + 3];
                    if (a < 128) continue;

                    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                    if (lum > 25 && lum < 235) {
                        rSum += r;
                        gSum += g;
                        bSum += b;
                        count++;

                        const max = Math.max(r, g, b);
                        const min = Math.min(r, g, b);
                        const sat = (max - min) / (max || 1);
                        if (sat > maxSat) {
                            maxSat = sat;
                            satR = r;
                            satG = g;
                            satB = b;
                        }
                    }
                }

                let secR = satR, secG = satG, secB = satB;
                if (count > 0) {
                    secR = Math.round(rSum / count);
                    secG = Math.round(gSum / count);
                    secB = Math.round(bSum / count);
                }

                const c1 = `rgba(${satR}, ${satG}, ${satB}, 0.22)`;
                const c2 = `rgba(${secR}, ${secG}, ${secB}, 0.05)`;

                ambientColorCache.set(coverUrl, [c1, c2]);
                document.documentElement.style.setProperty('--ambient-aura-1', c1);
                document.documentElement.style.setProperty('--ambient-aura-2', c2);
            } catch (_) {}
        };
        img.src = coverUrl;
    }


    function applyTheme(themeName, showToastNotification = false) {
        if (themeName === 'atlas' || themeName === 'spotify' || themeName === 'apple') {
            themeName = 'nms';
        } else if (themeName === 'brutalist-minimalism-light' || themeName === 'brutalist-light') {
            themeName = 'minimalist-light';
        } else if (themeName === 'brutalist-minimalism-dark' || themeName === 'brutalist-dark') {
            themeName = 'minimalist-dark';
        }
        const validThemes = [
            'default', 'nms', 'solar-eclipse', 'euclid-horizon', 'alien-paradise',
            'abyssal-void', 'dissonance', 'sentinel',
            'minimalist-light', 'minimalist-dark', 'minimalist-warm', 'minimalist-obsidian',
            'brutalist-light', 'brutalist-dark'
        ];
        if (!validThemes.includes(themeName)) {
            themeName = 'default';
        }
        activeTheme = themeName;
        if (showToastNotification) {
            showThemeLoadingOverlay(themeName);
        }
        document.documentElement.setAttribute('data-theme', themeName);
        document.body.removeAttribute('data-theme');
        try {
            safeStorage.setItem('cachymusic_active_theme', themeName);
            localStorage.setItem('cachymusic_active_theme', themeName);
        } catch (_) {}
        window.applyTheme = applyTheme;
        window.activeTheme = themeName;

        try {
            if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
                const currentUrl = new URL(window.location.href);
                if (currentUrl.searchParams.has('theme') && currentUrl.searchParams.get('theme') !== themeName) {
                    currentUrl.searchParams.set('theme', themeName);
                    window.history.replaceState(null, '', currentUrl.pathname + currentUrl.search + currentUrl.hash);
                }
            }
        } catch (_) {}

        // Update active class on Theme Modal cards
        themeSelectCards.forEach(card => {
            const isTarget = card.dataset.theme === themeName;
            card.classList.toggle('active', isTarget);
        });

        // Update active class on Settings Panel quick buttons
        themeQuickBtns.forEach(btn => {
            const isTarget = btn.dataset.theme === themeName;
            btn.classList.toggle('active', isTarget);
        });

        // Update Top Navigation Bar label
        if (topThemeLabel) {
            const labels = {
                default: 'DEFAULT',
                nms: 'THE ATLAS',
                'solar-eclipse': 'PLANETARY WARP',
                'euclid-horizon': 'SPACE STATION',
                'alien-paradise': 'ALIEN PARADISE',
                'abyssal-void': 'EMERIL DRIVE',
                dissonance: 'DISSONANCE',
                sentinel: 'SENTINEL',
                'minimalist-light': 'MINIMALIST (LIGHT)',
                'minimalist-dark': 'MINIMALIST (DARK)',
                'minimalist-warm': 'MINIMALIST (WARM)',
                'minimalist-obsidian': 'MINIMALIST (OLED)',
                'brutalist-light': 'MINIMALIST (LIGHT)',
                'brutalist-dark': 'MINIMALIST (DARK)'
            };
            topThemeLabel.textContent = labels[themeName] || 'THEMES';
        }

        // Update Settings Panel Theme Status
        const settingsThemeLabel = document.getElementById('settingsThemeCurrentLabel');
        if (settingsThemeLabel) {
            const friendly = {
                default: 'Default Studio Hi-Fi • Precision Noir',
                nms: 'The Atlas • Crimson Core HUD',
                'solar-eclipse': 'Planetary Warp • Corona Orbit',
                'euclid-horizon': 'Space Station • Euclid Dock',
                'alien-paradise': 'Alien Paradise • 70s Retro Flora',
                'abyssal-void': 'Emeril Drive • Emerald Pulse',
                dissonance: 'Dissonance • Corrupted Atlantideum',
                sentinel: 'Sentinel • Defense Combat Interface',
                'minimalist-light': 'Minimalist (Light) • Stark Paper Clarity',
                'minimalist-dark': 'Minimalist (Dark) • Monolithic Slate Void',
                'minimalist-warm': 'Minimalist (Warm Paper) • Nordic Alabaster & Amber',
                'minimalist-obsidian': 'Minimalist (Obsidian OLED) • Pitch Pure Zero-Watt',
                'brutalist-light': 'Minimalist (Light) • Stark Paper Clarity',
                'brutalist-dark': 'Minimalist (Dark) • Monolithic Slate Void'
            };
            settingsThemeLabel.textContent = friendly[themeName] || themeName.toUpperCase();
        }

        const settingsTabCurrentThemeBadge = document.getElementById('settingsTabCurrentThemeBadge');
        if (settingsTabCurrentThemeBadge) {
            const labels = {
                default: 'DEFAULT STUDIO HI-FI',
                nms: 'THE ATLAS',
                'solar-eclipse': 'PLANETARY WARP',
                'euclid-horizon': 'SPACE STATION',
                'alien-paradise': 'ALIEN PARADISE',
                'abyssal-void': 'EMERIL DRIVE',
                dissonance: 'DISSONANCE',
                sentinel: 'SENTINEL',
                'minimalist-light': 'MINIMALIST (LIGHT)',
                'minimalist-dark': 'MINIMALIST (DARK)',
                'minimalist-warm': 'MINIMALIST (WARM PAPER)',
                'minimalist-obsidian': 'MINIMALIST (OBSIDIAN OLED)',
                'brutalist-light': 'MINIMALIST (LIGHT)',
                'brutalist-dark': 'MINIMALIST (DARK)'
            };
            settingsTabCurrentThemeBadge.textContent = labels[themeName] || themeName.toUpperCase();
        }

        // Sync turntable center visualizer and fidelity according to activeVisualizerMode
        const isThematicActive = (activeVisualizerMode === 'thematic' || activeVisualizerMode === 'badapple');
        if (turntableCenterVis) {
            turntableCenterVis.style.display = 'flex';
        }
        if (vinylLabel) {
            vinylLabel.style.opacity = '0';
        }
        if (vinylTurntable) {
            vinylTurntable.classList.toggle('thematicFidelity', isThematicActive);
            vinylTurntable.classList.toggle('spinning', isPlaying);
        }
        if (typeof updateSignalPathUi === 'function') {
            updateSignalPathUi();
        }
        if (typeof updateDacStatusUi === 'function') {
            updateDacStatusUi();
        }
        if (typeof drawPeqCurve === 'function') {
            drawPeqCurve();
        }
        if (typeof loadVisualizerThemes1 === 'function') loadVisualizerThemes1();
        else if (typeof window !== 'undefined' && typeof window.loadVisualizerThemes1 === 'function') window.loadVisualizerThemes1();
        if (typeof loadVisualizerThemes2 === 'function') loadVisualizerThemes2();
        else if (typeof window !== 'undefined' && typeof window.loadVisualizerThemes2 === 'function') window.loadVisualizerThemes2();
        if (typeof resumeVisualizerLoop === 'function') {
            resumeVisualizerLoop();
        } else if (typeof window !== 'undefined' && typeof window.resumeVisualizerLoop === 'function') {
            window.resumeVisualizerLoop();
        }
    }
    window.applyTheme = applyTheme;

    function openThemeModal() {
        if (!themeModal) return;
        themeModal.style.display = 'flex';
        pushModalState('themeModal');
        setTimeout(() => {
            const activeCard = themeModal.querySelector('.themeSelectCard.active');
            if (activeCard) {
                activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 60);
    }

    function closeThemeModal() {
        if (themeModal) themeModal.style.display = 'none';
        popModalState('themeModal');
    }

    if (typeof window !== 'undefined') {
        Object.assign(window, {
            updateAmbientLighting,
            applyTheme,
            openThemeModal,
            closeThemeModal
        });
    }




    // --- Sub-Module: settings.js ---
// CachyMusic - Audio Settings, Sleep Timer & Telemetry HUD
    // Audiophile Sleep Timer Engine
    // Gentle 12-second logarithmic volume fade-out prevents sleep interruption
    // =========================================================================
    function setSleepTimer(minutes) {
        cancelSleepTimer(false);
        if (minutes === 'end') {
            sleepTimerMode = 'end';
            sleepTimerRemainingSec = 0;
            if (sleepTimerLabel) sleepTimerLabel.textContent = '🌙 End of Track';
            if (sleepStatusRemaining) sleepStatusRemaining.textContent = 'Pauses at end of current track';
            if (sleepStatusCard) sleepStatusCard.style.display = 'flex';
            if (sleepTimerBtn) sleepTimerBtn.classList.add('hasActiveTimer');
            const settingsTabSleepStatusBadge = document.getElementById('settingsTabSleepStatusBadge');
            if (settingsTabSleepStatusBadge) {
                settingsTabSleepStatusBadge.textContent = 'PAUSE AT END OF TRACK';
                settingsTabSleepStatusBadge.classList.add('active');
            }
            const settingsTabCancelSleepBtn = document.getElementById('settingsTabCancelSleepBtn');
            if (settingsTabCancelSleepBtn) settingsTabCancelSleepBtn.style.display = '';
            showToast('Sleep timer set: Pauses at end of track');
            closeSleepTimerModal();
            return;
        }

        const mins = parseInt(minutes, 10);
        if (isNaN(mins) || mins <= 0) return;

        sleepTimerMode = 'countdown';
        sleepTimerRemainingSec = mins * 60;
        sleepTimerOriginalVolume = currentVolumeValue;

        updateSleepTimerStatusUi();
        if (sleepStatusCard) sleepStatusCard.style.display = 'flex';
        if (sleepTimerBtn) sleepTimerBtn.classList.add('hasActiveTimer');
        const settingsTabCancelSleepBtn = document.getElementById('settingsTabCancelSleepBtn');
        if (settingsTabCancelSleepBtn) settingsTabCancelSleepBtn.style.display = '';
        showToast(`Sleep timer set: ${mins} minute${mins === 1 ? '' : 's'}`);
        closeSleepTimerModal();

        sleepTimerInterval = setInterval(() => {
            sleepTimerRemainingSec--;
            updateSleepTimerStatusUi();

            // Audiophile 12-second logarithmic gentle fade-out
            if (sleepTimerRemainingSec <= 12 && sleepTimerRemainingSec > 0) {
                if (sleepTimerOriginalVolume === null) sleepTimerOriginalVolume = currentVolumeValue;
                const ratio = Math.max(0, sleepTimerRemainingSec / 12);
                const fadedVol = sleepTimerOriginalVolume * Math.pow(ratio, 1.4);
                setVolume(fadedVol, false);
            }

            if (sleepTimerRemainingSec <= 0) {
                clearInterval(sleepTimerInterval);
                sleepTimerInterval = null;
                pauseAudio();
                if (sleepTimerOriginalVolume !== null) {
                    setVolume(sleepTimerOriginalVolume, true);
                    sleepTimerOriginalVolume = null;
                }
                cancelSleepTimer(false);
                showToast('🌙 Sleep timer finished: Playback paused.');
            }
        }, 1000);
    }

    function updateSleepTimerStatusUi() {
        const m = Math.floor(sleepTimerRemainingSec / 60);
        const s = sleepTimerRemainingSec % 60;
        const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;
        if (sleepTimerLabel) sleepTimerLabel.textContent = `🌙 ${timeStr}`;
        if (sleepStatusRemaining) sleepStatusRemaining.textContent = `${timeStr} remaining`;
        const settingsTabSleepStatusBadge = document.getElementById('settingsTabSleepStatusBadge');
        if (settingsTabSleepStatusBadge) {
            settingsTabSleepStatusBadge.textContent = `${timeStr} REMAINING`;
            settingsTabSleepStatusBadge.classList.add('active');
        }
    }

    function cancelSleepTimer(showFeedback = true) {
        if (sleepTimerInterval) {
            clearInterval(sleepTimerInterval);
            sleepTimerInterval = null;
        }
        if (sleepTimerOriginalVolume !== null) {
            setVolume(sleepTimerOriginalVolume, true);
            sleepTimerOriginalVolume = null;
        }
        sleepTimerMode = null;
        sleepTimerRemainingSec = 0;
        if (sleepTimerLabel) sleepTimerLabel.textContent = 'SLEEP TIMER';
        if (sleepStatusCard) sleepStatusCard.style.display = 'none';
        if (sleepTimerBtn) sleepTimerBtn.classList.remove('hasActiveTimer');
        const settingsTabSleepStatusBadge = document.getElementById('settingsTabSleepStatusBadge');
        if (settingsTabSleepStatusBadge) {
            settingsTabSleepStatusBadge.textContent = 'INACTIVE';
            settingsTabSleepStatusBadge.classList.remove('active');
        }
        const settingsTabCancelSleepBtn = document.getElementById('settingsTabCancelSleepBtn');
        if (settingsTabCancelSleepBtn) settingsTabCancelSleepBtn.style.display = 'none';
        if (showFeedback) showToast('Sleep timer cancelled');
    }

    function openSleepTimerModal() {
        if (sleepTimerModal) sleepTimerModal.style.display = 'flex';
        pushModalState('sleepTimerModal');
    }

    function closeSleepTimerModal() {
        if (sleepTimerModal) sleepTimerModal.style.display = 'none';
        popModalState('sleepTimerModal');
    }

    // =========================================================================

    // Signal Path & Audit (Honest, Real-Time Pipeline Telemetry)
    // =========================================================================

    function openSignalPathModal() {
        updateSignalPathUi();
        if (signalPathModal) signalPathModal.style.display = 'flex';
        pushModalState('signalPathModal');
    }

    function closeSignalPathModal() {
        if (signalPathModal) signalPathModal.style.display = 'none';
        popModalState('signalPathModal');
    }


    // Dynamic Ambient Atmosphere Lighting (Samples dominant vibrancy from album art)
    let ambientCanvas = null;

    function updateDebugHudState() {
        const hud = document.getElementById('debugHudContainer');
        const pill = document.getElementById('settingsDebugPill');
        const enableBtn = document.getElementById('debugModeEnableBtn');
        const disableBtn = document.getElementById('debugModeDisableBtn');

        if (hud) {
            hud.style.display = debugModeActive ? 'flex' : 'none';
        }
        if (pill) {
            pill.textContent = debugModeActive ? 'ENABLED (HUD)' : 'DISABLED';
            pill.className = `settingsEnginePill ${debugModeActive ? 'active' : ''}`;
        }
        if (enableBtn) enableBtn.classList.toggle('active', debugModeActive);
        if (disableBtn) disableBtn.classList.toggle('active', !debugModeActive);

        if (debugModeActive) {
            refreshDebugHudTelemetry();
        }
    }

    function setDebugMode(enabled) {
        debugModeActive = Boolean(enabled);
        try {
            safeStorage.setItem('cachymusic_debug_mode', debugModeActive ? 'true' : 'false');
        } catch (_) {}
        updateDebugHudState();
        if (debugModeActive) {
            appendDebugTelemetry(`[SYSTEM] Debug Mode enabled. Monitoring Web Audio pipeline & MediaStore IPC.`);
            if (typeof showCachyToast === 'function') {
                showCachyToast('Debug Mode Active', 'Real-time Audio Diagnostics HUD visible.', 'info');
            }
        }
    }

    function appendDebugTelemetry(msg, level = 'info') {
        const time = new Date().toLocaleTimeString();
        const entryText = `[${time}] ${msg}`;
        window.audioPlaybackDebugLogs.push(entryText);
        if (window.audioPlaybackDebugLogs.length > 80) window.audioPlaybackDebugLogs.shift();

        const logList = document.getElementById('debugHudLogList');
        if (logList) {
            const row = document.createElement('div');
            row.className = `debugHudLogEntry ${level}`;
            row.textContent = entryText;
            logList.appendChild(row);
            while (logList.childNodes.length > 50) {
                logList.removeChild(logList.firstChild);
            }
            logList.scrollTop = logList.scrollHeight;
        }

        const logBox = document.getElementById('settingsAudioDebugLog');
        if (logBox) {
            logBox.textContent = window.audioPlaybackDebugLogs.join('\n');
            logBox.scrollTop = logBox.scrollHeight;
        }

        refreshDebugHudTelemetry();
    }

    function refreshDebugHudTelemetry() {
        if (!debugModeActive) return;
        const curTrack = allTracks[currentTrackIndex];
        const trackEl = document.getElementById('debugHudTrack');
        const codecEl = document.getElementById('debugHudCodec');
        const html5El = document.getElementById('debugHudHtml5');
        const ctxEl = document.getElementById('debugHudAudioCtx');
        const srcEl = document.getElementById('debugHudSrc');

        if (trackEl) {
            trackEl.textContent = curTrack
                ? `#${currentTrackIndex + 1}: ${curTrack.title || curTrack.filename} (${formatTime(curTrack.duration)})`
                : 'None loaded';
        }
        if (codecEl && curTrack) {
            const fmt = (curTrack.format || 'AUDIO').toUpperCase();
            const rate = curTrack.sampleRate ? `${curTrack.sampleRate}Hz` : '44100Hz';
            const depth = curTrack.bitDepth ? `${curTrack.bitDepth}-Bit` : (curTrack.sampleRate >= 88200 ? '24-Bit' : '16-Bit');
            codecEl.textContent = `${fmt} • ${depth} • ${rate}`;
        }
        if (html5El) {
            if (isSoftwareDecoding && activeDecodedBuffer) {
                const cur = softwarePlaybackOffset + (audioContext && !isSoftwarePaused ? (audioContext.currentTime - softwarePlaybackStartTime) : 0);
                const dur = activeDecodedBuffer.duration;
                const state = isSoftwarePaused ? 'PAUSED' : 'PLAYING';
                html5El.textContent = `SOFTWARE ENGINE • ${state} (${cur.toFixed(1)}s / ${dur.toFixed(1)}s) • 32-bit Float PCM`;
                html5El.title = `Decoded: ${activeDecodedBuffer.sampleRate}Hz, ${activeDecodedBuffer.numberOfChannels}ch, Web Audio Buffer`;
            } else if (audio) {
                const rLabels = ['No Data', 'Metadata Loaded', 'Current Frame Ready', 'Buffering', 'Ready to Play'];
                const rText = rLabels[audio.readyState] || `State ${audio.readyState}`;
                const t = (audio.currentTime || 0).toFixed(1);
                const d = (audio.duration && isFinite(audio.duration)) ? audio.duration.toFixed(1) : '--';
                const state = audio.paused ? 'PAUSED' : 'PLAYING';
                html5El.textContent = `${state} • ${rText} (${t}s / ${d}s)`;
                html5El.title = `HTML5 Media Pipeline: readyState ${audio.readyState}, networkState ${audio.networkState}`;
            }
        }
        if (ctxEl) {
            const ctxState = audioContext ? audioContext.state : 'None';
            const sRate = audioContext ? `${audioContext.sampleRate}Hz` : '--';
            ctxEl.textContent = `State: ${ctxState} | Clock: ${sRate}`;
        }
        if (srcEl && audio) {
            const srcStr = audio.src || 'none';
            srcEl.textContent = srcStr.length > 70 ? srcStr.substring(0, 67) + '...' : srcStr;
            srcEl.title = srcStr;
        }
    }

    function logAudioPlaybackEvent(level, msg, meta = {}) {
        const time = new Date().toLocaleTimeString();
        const entry = `[${time}] [${level.toUpperCase()}] ${msg}`;
        window.audioPlaybackDebugLogs.push(entry);
        if (window.audioPlaybackDebugLogs.length > 50) window.audioPlaybackDebugLogs.shift();
        const logBox = document.getElementById('settingsAudioDebugLog');
        if (logBox) {
            logBox.textContent = window.audioPlaybackDebugLogs.join('\n');
            logBox.scrollTop = logBox.scrollHeight;
        }
        appendDebugTelemetry(`[${level.toUpperCase()}] ${msg}`, level);
        updateAudioDiagnosticsUi(meta);
    }

    function updateAudioDiagnosticsUi(meta = {}) {
        const streamVal = document.getElementById('debugStreamStatus');
        const formatVal = document.getElementById('debugFormatVal');
        const pipeVal = document.getElementById('debugPipelineState');
        const skipVal = document.getElementById('debugSkipStatus');
        const curTrack = allTracks[currentTrackIndex];

        if (streamVal) {
            if (audio && audio.error) {
                streamVal.textContent = `Error (Code ${audio.error.code})`;
                streamVal.style.color = '#ef4444';
            } else if (audio && !audio.paused) {
                streamVal.textContent = 'Streaming Active (206/200)';
                streamVal.style.color = '#10b981';
            } else {
                streamVal.textContent = 'Standby / Paused';
                streamVal.style.color = 'inherit';
            }
        }
        if (formatVal && curTrack) {
            const fmt = (curTrack.format || 'AUDIO').toUpperCase();
            const rate = curTrack.sampleRate ? `${Math.round(curTrack.sampleRate / 1000)} kHz` : '44.1 kHz';
            const depth = curTrack.bitDepth ? `${curTrack.bitDepth}-Bit` : (curTrack.sampleRate >= 88200 ? '24-Bit' : '16-Bit');
            const br = curTrack.bitrate ? `${curTrack.bitrate} kbps` : '';
            formatVal.textContent = `${rate} • ${depth} • ${fmt} ${br ? '• ' + br : ''}`;
        }
        if (pipeVal && audio) {
            const rStates = [
                'Idle (No Data)',
                'Metadata Loaded',
                'Decoding Frame',
                'Buffering Stream',
                'Ready (Buffered)'
            ];
            const r = rStates[audio.readyState] || 'Ready';
            const ctxState = audioContext ? (audioContext.state === 'running' ? 'Active' : 'Standby') : 'Inactive';
            pipeVal.textContent = `${r} • DSP: ${ctxState}`;
        }
        if (skipVal) {
            skipVal.textContent = consecutiveSkipCount > 0 ? `${consecutiveSkipCount} skip(s) logged` : 'No abnormal skips (0)';
            skipVal.style.color = consecutiveSkipCount > 0 ? '#f59e0b' : 'inherit';
        }
        refreshDebugHudTelemetry();
    }

    function showThemeLoadingOverlay(themeName) {
        const overlay = document.getElementById('themeLoadingOverlay');
        const title = document.getElementById('themeLoadingTitle');
        const sub = document.getElementById('themeLoadingSubtitle');
        if (!overlay) return;
        if (title) title.textContent = 'APPLYING THEME...';
        if (sub) sub.textContent = `Configuring palette: ${themeName.toUpperCase()}`;
        overlay.style.display = 'flex';
        overlay.style.opacity = '1';
        setTimeout(() => {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.25s ease';
            setTimeout(() => {
                overlay.style.display = 'none';
                overlay.style.opacity = '1';
                overlay.style.transition = '';
            }, 250);
        }, 320);
    }


    // Attach top-level Settings & Diagnostics functions to window
    if (typeof window !== "undefined") {
        try { window.ambientCanvas = ambientCanvas; } catch (_) {}
        try { window.appendDebugTelemetry = appendDebugTelemetry; } catch (_) {}
        try { window.cancelSleepTimer = cancelSleepTimer; } catch (_) {}
        try { window.closeSignalPathModal = closeSignalPathModal; } catch (_) {}
        try { window.closeSleepTimerModal = closeSleepTimerModal; } catch (_) {}
        try { window.logAudioPlaybackEvent = logAudioPlaybackEvent; } catch (_) {}
        try { window.openSignalPathModal = openSignalPathModal; } catch (_) {}
        try { window.openSleepTimerModal = openSleepTimerModal; } catch (_) {}
        try { window.refreshDebugHudTelemetry = refreshDebugHudTelemetry; } catch (_) {}
        try { window.setDebugMode = setDebugMode; } catch (_) {}
        try { window.setSleepTimer = setSleepTimer; } catch (_) {}
        try { window.showThemeLoadingOverlay = showThemeLoadingOverlay; } catch (_) {}
        try { window.updateAudioDiagnosticsUi = updateAudioDiagnosticsUi; } catch (_) {}
        try { window.updateDebugHudState = updateDebugHudState; } catch (_) {}
        try { window.updateSleepTimerStatusUi = updateSleepTimerStatusUi; } catch (_) {}
    }



    // --- Sub-Module: p2p.js ---
// CachyMusic - P2P Network, Downloads & PWA Integration

    // Trigger PWA Installation or Browser Instructions
    async function triggerPwaInstallPrompt() {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            try {
                const choiceResult = await deferredInstallPrompt.userChoice;
                if (choiceResult && choiceResult.outcome === 'accepted') {
                    const installBtn = document.getElementById('installAppBtn');
                    if (installBtn) installBtn.style.display = 'none';
                    const statusPill = document.getElementById('downloadPwaStatusPill');
                    if (statusPill) {
                        statusPill.textContent = 'Installed (PWA)';
                        statusPill.classList.add('active');
                    }
                }
            } catch (_) {}
            deferredInstallPrompt = null;
        } else {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                                 window.navigator.standalone === true;
            if (isStandalone) {
                alert('CachyMusic is already installed and running as a standalone desktop/mobile app!');
                return;
            }

            const ua = (navigator.userAgent || '').toLowerCase();
            let advice = 'Install CachyMusic on your device:\n\n';
            if (/iphone|ipad|ipod/i.test(ua)) {
                advice += '• iOS Safari: Tap Share (square with upward arrow) ➔ "Add to Home Screen".';
            } else if (/android/i.test(ua)) {
                advice += '• Android Chrome: Tap Menu (⋮) ➔ "Install app" or "Add to Home screen".';
            } else if (/mac/i.test(ua)) {
                advice += '• macOS Safari: Click File ➔ "Add to Dock".\n• Chrome / Brave: Click the Install icon in the address bar.';
            } else if (/win/i.test(ua)) {
                advice += '• Windows: Click the Install icon in Edge/Chrome address bar, or download cachymusic.bat from the Windows tab.';
            } else {
                advice += '• Linux Desktop: Run ./install.sh in the project folder for complete system, launcher, and icon integration.\n• Chromium / Brave: Click the Install icon in the address bar.';
            }
            alert(advice);
        }
    }

    // PWA & Desktop Installation Handler
    function setupPwaInstallPrompt() {
        const installBtn = document.getElementById('installAppBtn');
        if (!installBtn) return;

        // Window Controls Overlay (WCO) for desktop PWA titlebar integration
        if ('windowControlsOverlay' in navigator) {
            const handleWcoChange = () => {
                const isOverlay = navigator.windowControlsOverlay.visible;
                document.body.classList.toggle('wco-active', isOverlay);
                if (isOverlay && typeof navigator.windowControlsOverlay.getTitlebarAreaRect === 'function') {
                    const rect = navigator.windowControlsOverlay.getTitlebarAreaRect();
                    if (rect && rect.height) {
                        document.documentElement.style.setProperty('--wco-titlebar-height', `${rect.height}px`);
                    }
                }
            };
            navigator.windowControlsOverlay.addEventListener('geometrychange', handleWcoChange);
            handleWcoChange();
        }

        // Check if already running in standalone display mode
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                             window.matchMedia('(display-mode: window-controls-overlay)').matches ||
                             window.navigator.standalone === true;
        if (isStandalone) {
            installBtn.style.display = 'none';
            const statusPill = document.getElementById('downloadPwaStatusPill');
            if (statusPill) {
                statusPill.textContent = 'Installed (Standalone)';
                statusPill.classList.add('active');
            }
            const pwaInstallHint = document.getElementById('pwaInstallHint');
            if (pwaInstallHint) {
                pwaInstallHint.textContent = '✓ CachyMusic is currently running as an installed standalone application.';
            }
            return;
        }

        // Listen for beforeinstallprompt (Chromium, Brave, Chrome, Edge, Android)
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredInstallPrompt = e;
            installBtn.style.display = 'inline-flex';
            const statusPill = document.getElementById('downloadPwaStatusPill');
            if (statusPill) {
                statusPill.textContent = 'Install Ready';
                statusPill.classList.add('active');
            }
        });

        // Also display install button after initial load if not standalone,
        // so desktop & mobile users on all browsers have a clear way to install
        setTimeout(() => {
            if (!isStandalone) {
                installBtn.style.display = 'inline-flex';
            }
        }, 800);

        installBtn.addEventListener('click', async () => {
            if (deferredInstallPrompt) {
                try {
                    deferredInstallPrompt.prompt();
                    const choiceResult = await deferredInstallPrompt.userChoice;
                    if (choiceResult && choiceResult.outcome === 'accepted') {
                        console.log('[PWA] User accepted install prompt');
                        deferredInstallPrompt = null;
                        installBtn.style.display = 'none';
                    }
                } catch (err) {
                    console.warn('[PWA] Install prompt failed:', err);
                }
            } else {
                switchWorkspace(currentWorkspace === 'download' ? 'player' : 'download');
            }
        });

        window.addEventListener('appinstalled', () => {
            installBtn.style.display = 'none';
            deferredInstallPrompt = null;
            const statusPill = document.getElementById('downloadPwaStatusPill');
            if (statusPill) {
                statusPill.textContent = 'Installed (PWA)';
                statusPill.classList.add('active');
            }
            console.log('[PWA] CachyMusic installed successfully');
        });
    }

    // Cross-Platform Download Hub & LAN Setup
    let lanUrlFetched = false;
    async function fetchLanStreamingUrl() {
        if (lanUrlFetched) return;
        try {
            const res = await fetch('php/api/lan_info.php');
            const data = await res.json();
            if (data && data.success && data.lanUrl) {
                lanUrlFetched = true;
                const lanInput = document.getElementById('downloadLanUrlInput');
                const copyBtn = document.getElementById('copyLanUrlBtn');
                if (lanInput) lanInput.value = data.lanUrl;
                if (copyBtn) copyBtn.dataset.copy = data.lanUrl;
            }
        } catch (e) {
            console.warn('[LAN] Failed to fetch LAN streaming info:', e);
        }
    }

    function setupDownloadWorkspace() {
        const downloadTabs = document.querySelectorAll('.downloadTabBtn');
        const downloadPanels = document.querySelectorAll('.downloadPanel');
        const returnBtn = document.getElementById('downloadReturnBtn');

        function activatePlatformTab(platform) {
            downloadTabs.forEach(tab => {
                const isActive = tab.dataset.platform === platform;
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            downloadPanels.forEach(panel => {
                const isMatch = panel.id === `platform-${platform}`;
                panel.classList.toggle('active', isMatch);
                panel.style.display = isMatch ? 'block' : 'none';
            });
        }

        downloadTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const platform = tab.dataset.platform;
                if (platform) activatePlatformTab(platform);
            });
        });

        if (returnBtn) {
            returnBtn.addEventListener('click', () => {
                switchWorkspace('player');
            });
        }

        // Copy-to-clipboard buttons with animated feedback
        document.querySelectorAll('.copyCodeBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const textToCopy = btn.dataset.copy || (btn.previousElementSibling && btn.previousElementSibling.value);
                if (!textToCopy) return;

                let copySuccess = false;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    try {
                        await navigator.clipboard.writeText(textToCopy);
                        copySuccess = true;
                    } catch (_) {}
                }

                if (!copySuccess) {
                    try {
                        const textarea = document.createElement('textarea');
                        textarea.value = textToCopy;
                        textarea.style.position = 'fixed';
                        textarea.style.opacity = '0';
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                        copySuccess = true;
                    } catch (_) {}
                }

                if (copySuccess) {
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = '✓ COPIED!';
                    btn.classList.add('copied');
                    setTimeout(() => {
                        btn.innerHTML = originalHtml;
                        btn.classList.remove('copied');
                    }, 1800);
                }
            });
        });

        // Wire 1-Click PWA Buttons in Download Hub
        const pwaActionBtns = document.querySelectorAll('.downloadDirectPwaBtn, #downloadPwaTriggerBtn');
        pwaActionBtns.forEach(btn => {
            btn.addEventListener('click', triggerPwaInstallPrompt);
        });

        // Auto-detect current operating system to highlight YOUR OS badge (or read ?platform=)
        const urlParams = new URLSearchParams(window.location.search);
        let defaultPlatform = urlParams.get('platform') || '';
        let detected = 'linux';
        const ua = (navigator.userAgent || '').toLowerCase();
        if (/iphone|ipad|ipod|android/i.test(ua)) {
            detected = 'mobile';
        } else if (/win/i.test(ua)) {
            detected = 'windows';
        } else if (/mac/i.test(ua)) {
            detected = 'macos';
        } else {
            detected = 'linux';
        }

        // Show "YOUR OS" badge on the detected platform tab
        const detectedBadge = document.getElementById(`osBadge-${detected}`);
        if (detectedBadge) {
            detectedBadge.style.display = 'inline-block';
        }

        if (!defaultPlatform) {
            defaultPlatform = detected;
        }
        activatePlatformTab(defaultPlatform);
    }



    function getSlskApiUrl(action, queryParams = '') {
        let base = 'php/api/soulseek.php';
        try {
            const isNativeAndroid = typeof AndroidBridge !== 'undefined'
                && typeof AndroidBridge.isAndroid === 'function'
                && AndroidBridge.isAndroid();
            if (!isNativeAndroid) {
                const host = (typeof safeStorage !== 'undefined' ? safeStorage.getItem('cachymusic_slsk_host') : '') || '';
                if (host && host.trim()) {
                    base = `${host.trim().replace(/\/+$/, '')}/php/api/soulseek.php`;
                }
            }
        } catch (_) {}
        const paramStr = queryParams ? `&${queryParams}` : '';
        return `${base}?action=${encodeURIComponent(action)}${paramStr}`;
    }

    // Setup Android Standalone Bridge hook for Soulseek fetch requests
    if (typeof window !== 'undefined' && window.AndroidBridge && typeof window.AndroidBridge.callSoulseekApi === 'function') {
        try {
            if (typeof safeStorage !== 'undefined') safeStorage.removeItem('cachymusic_slsk_host');
            localStorage.removeItem('cachymusic_slsk_host');
        } catch (_) {}

        const origFetch = window.fetch;
        window.fetch = async function(resource, init) {
            const urlStr = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
            if (urlStr.includes('soulseek.php')) {
                try {
                    const urlObj = new URL(urlStr, window.location.href);
                    const action = urlObj.searchParams.get('action') || 'status';
                    let bodyStr = '{}';
                    if (init && init.body) {
                        bodyStr = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
                    }
                    const respJson = window.AndroidBridge.callSoulseekApi(action, bodyStr, urlObj.search);
                    return new Response(respJson, {
                        status: 200,
                        statusText: 'OK',
                        headers: { 'Content-Type': 'application/json' }
                    });
                } catch (bridgeErr) {
                    console.warn('AndroidBridge callSoulseekApi fallback:', bridgeErr);
                }
            }
            return origFetch.apply(this, arguments);
        };
    }

    // =========================================================================
    // Soulseek Controller - Nicotine+ REST Engine
    // =========================================================================
    const soulseekController = {
        activeToken: null,
        activeQuery: '',
        rawResults: [],
        activeFilter: 'all',
        activeSubFilter: null,
        includeFilterQuery: '',
        excludeFilterQuery: '',
        inResultFilterQuery: '',
        suggestedTags: [],
        activeSort: 'speed-desc',
        searchPollTimer: null,
        transfersPollTimer: null,
        statusPollTimer: null,
        isSearching: false,
        autoPlayQueue: new Set(),

        downloadsDir: '',
        sharedDir: '',
        isPowered: false,
        isConnected: false,
        isConnecting: false,
        hasCredentials: false,
        lastStatus: null,

        startStatusPolling() {
            if (this.statusPollTimer) return;
            const schedulePoll = () => {
                let delay = 25000;
                if (currentWorkspace === 'soulseek' || this.isConnecting || this.isSearching) {
                    delay = 5000;
                } else if (this.isConnected) {
                    delay = 15000;
                }
                this.statusPollTimer = setTimeout(async () => {
                    this.statusPollTimer = null;
                    if (!document.hidden) {
                        try {
                            await this.checkStatus();
                        } catch (_) {}
                    }
                    schedulePoll();
                }, delay);
            };
            schedulePoll();
        },

        stopStatusPolling() {
            if (this.statusPollTimer) {
                clearTimeout(this.statusPollTimer);
                clearInterval(this.statusPollTimer);
                this.statusPollTimer = null;
            }
        },

        updatePowerUI(status) {
            const isConn = Boolean(status.connected);
            const isConnBusy = Boolean(status.connecting);
            const isPow = Boolean(status.powered_on || isConn);
            const hasCreds = Boolean(status.has_credentials);

            this.isConnected = isConn;
            this.isConnecting = isConnBusy;
            this.isPowered = isPow;
            this.hasCredentials = hasCreds;

            if (slskPowerBtn) {
                slskPowerBtn.classList.remove('power-on', 'power-off', 'busy');
                if (isConnBusy) {
                    slskPowerBtn.classList.add('busy');
                    if (slskPowerBtnText) slskPowerBtnText.textContent = 'CONNECTING...';
                    slskPowerBtn.disabled = true;
                    slskPowerBtn.title = 'Connecting to Soulseek network...';
                } else if (isConn) {
                    slskPowerBtn.classList.add('power-on');
                    if (slskPowerBtnText) slskPowerBtnText.textContent = 'DISCONNECT';
                    slskPowerBtn.disabled = false;
                    slskPowerBtn.title = 'Online. Click to Disconnect (disconnects and stops sharing files)';
                } else {
                    slskPowerBtn.classList.add('power-off');
                    if (slskPowerBtnText) slskPowerBtnText.textContent = 'CONNECT';
                    slskPowerBtn.disabled = false;
                    slskPowerBtn.title = hasCreds
                        ? 'Soulseek is Disconnected. Click to Connect'
                        : 'Click to configure Soulseek account and Connect';
                }
            }

            if (slskModalPowerBtn) {
                slskModalPowerBtn.classList.remove('power-on', 'busy');
                if (isConnBusy) {
                    slskModalPowerBtn.classList.add('busy');
                    slskModalPowerBtn.textContent = 'CONNECTING...';
                    slskModalPowerBtn.disabled = true;
                } else if (isConn) {
                    slskModalPowerBtn.classList.add('power-on');
                    slskModalPowerBtn.textContent = 'DISCONNECT';
                    slskModalPowerBtn.disabled = false;
                } else {
                    slskModalPowerBtn.textContent = 'CONNECT';
                    slskModalPowerBtn.disabled = !hasCreds && !(slskModalUsername && slskModalUsername.value.trim());
                }
            }
        },

        async togglePower() {
            if (this.isConnecting) return;

            if (!this.isConnected && !this.hasCredentials) {
                if (slskAccountBtn) slskAccountBtn.click();
                if (slskAccountAlert) {
                    slskAccountAlert.className = 'slskModalAlert';
                    slskAccountAlert.textContent = 'Please configure your Soulseek username and password first.';
                    slskAccountAlert.style.display = 'block';
                }
                return;
            }

            const targetState = this.isConnected ? 'off' : 'on';

            if (slskPowerBtn) {
                slskPowerBtn.disabled = true;
                slskPowerBtn.classList.add('busy');
            }
            if (slskPowerBtnText) {
                slskPowerBtnText.textContent = targetState === 'on' ? 'CONNECTING...' : 'DISCONNECTING...';
            }
            if (slskModalPowerBtn) {
                slskModalPowerBtn.disabled = true;
                slskModalPowerBtn.textContent = targetState === 'on' ? 'CONNECTING...' : 'DISCONNECTING...';
            }

            try {
                const res = await fetch(getSlskApiUrl('power'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ state: targetState })
                });
                const data = await res.json();

                if (!data.ok) {
                    if (slskAccountAlert) {
                        renderSlskDiagnosticAlert(slskAccountAlert, data, `Failed to ${targetState === 'on' ? 'connect' : 'disconnect'}`);
                    } else {
                        alert(data.error || data.message || `Failed to ${targetState === 'on' ? 'connect' : 'disconnect'}`);
                    }
                } else {
                    if (slskAccountAlert) {
                        slskAccountAlert.className = 'slskModalAlert success';
                        slskAccountAlert.textContent = data.message || `Soulseek ${targetState === 'on' ? 'Connected' : 'Disconnected'}`;
                        slskAccountAlert.style.display = 'block';
                    }
                }
            } catch (err) {
                console.warn('Power toggle error:', err);
            } finally {
                await this.checkStatus();
            }
        },

        async checkStatus() {
            try {
                const res = await fetch(getSlskApiUrl('status'));
                const data = await res.json();
                this.lastStatus = data;

                if (data.downloads_dir) {
                    this.downloadsDir = data.downloads_dir;
                    if (slskDownloadsPathText) {
                        slskDownloadsPathText.textContent = data.downloads_dir;
                    }
                    if (slskChangeDirBtn) {
                        slskChangeDirBtn.setAttribute('title', `Downloads: ${data.downloads_dir} (Click to change)`);
                    }
                }

                if (data.shared_dir) {
                    this.sharedDir = data.shared_dir;
                    if (slskSharedPathText) {
                        slskSharedPathText.textContent = data.shared_dir;
                    }
                    if (slskChangeSharedDirBtn) {
                        slskChangeSharedDirBtn.setAttribute('title', `Shared folder: ${data.shared_dir} (Click to change)`);
                    }
                }

                this.updatePowerUI(data);

                const isNative = data.daemon_type === 'embedded-native' || (typeof AndroidBridge !== 'undefined' && AndroidBridge.isAndroid());
                const clientLabel = isNative ? 'SOULSEEK' : 'NICOTINE+';
                const slskBadge = document.getElementById('slskBadge');
                if (slskBadge) {
                    slskBadge.textContent = clientLabel;
                }

                if (data.ok) {
                    if (data.connected) {
                        if (slskStatusDot) slskStatusDot.className = 'slskStatusDot online';
                        if (slskStatusText) slskStatusText.textContent = `ONLINE: ${data.login_username}`;
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge online';
                        if (slskUsername) slskUsername.textContent = data.login_username;
                    } else if (data.connecting) {
                        if (slskStatusDot) slskStatusDot.className = 'slskStatusDot busy';
                        if (slskStatusText) slskStatusText.textContent = 'CONNECTING TO SOULSEEK...';
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge busy';
                        if (slskUsername) slskUsername.textContent = `${data.login_username} (Connecting)`;
                    } else if (data.has_credentials) {
                        if (slskStatusDot) slskStatusDot.className = 'slskStatusDot offline';
                        if (slskStatusText) slskStatusText.textContent = data.error ? `AUTH FAILED: ${data.error}` : `${clientLabel} OFFLINE (DISCONNECTED)`;
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                        if (slskUsername) slskUsername.textContent = `${data.login_username} (Offline)`;
                    } else {
                        if (slskStatusDot) slskStatusDot.className = 'slskStatusDot offline';
                        if (slskStatusText) slskStatusText.textContent = 'NOT CONFIGURED (CLICK SETTINGS)';
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                        if (slskUsername) slskUsername.textContent = 'Not configured';
                    }
                    if (slskStartDaemonBtn) slskStartDaemonBtn.style.display = 'none';
                } else if (data.daemon_running) {
                    if (slskStatusDot) slskStatusDot.className = 'slskStatusDot busy';
                    if (slskStatusText) slskStatusText.textContent = `${clientLabel} INITIALIZING...`;
                    if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge busy';
                    if (slskStartDaemonBtn) slskStartDaemonBtn.style.display = 'none';
                } else {
                    if (slskStatusDot) slskStatusDot.className = 'slskStatusDot offline';
                    if (slskStatusText) slskStatusText.textContent = `${clientLabel} OFFLINE`;
                    if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                    if (slskStartDaemonBtn) {
                        slskStartDaemonBtn.style.display = 'inline-block';
                        slskStartDaemonBtn.disabled = false;
                        slskStartDaemonBtn.textContent = `▶ START ${clientLabel}`;
                    }
                }
            } catch (err) {
                console.warn('Soulseek status error:', err);
                if (slskStatusDot) slskStatusDot.className = 'slskStatusDot offline';
                if (slskStatusText) slskStatusText.textContent = 'REST API OFFLINE';
                if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                if (slskStartDaemonBtn) {
                    slskStartDaemonBtn.style.display = 'inline-block';
                    slskStartDaemonBtn.disabled = false;
                    slskStartDaemonBtn.textContent = '▶ START NICOTINE+';
                }
            } finally {
                const mobileDot = document.querySelector('#slskMobileStatusDot .slskStatusDot');
                if (mobileDot && slskStatusDot) {
                    mobileDot.className = slskStatusDot.className;
                }

                // Update Soulseek Workspace Diagnostic Notice Banner
                const wsNotice = document.getElementById('slskWorkspaceNotice');
                if (wsNotice) {
                    const statusObj = this.lastStatus || {};
                    if (statusObj.ok && statusObj.connected) {
                        wsNotice.style.display = 'none';
                    } else {
                        const noticeTitle = document.getElementById('slskNoticeTitle');
                        const noticeMsg = document.getElementById('slskNoticeMsg');
                        const noticeIcon = document.getElementById('slskNoticeIcon');

                        let nTitle = 'Soulseek Disconnected';
                        let nMsg = 'Files are unexposed. Click Settings to configure or connect.';
                        let nIcon = 'ℹ️';

                        if (statusObj.reason === 'mobile_standalone') {
                            nTitle = 'Soulseek Standalone Mode';
                            nMsg = 'Soulseek is currently disconnected. Click Settings to enter credentials and connect directly to the Soulseek network.';
                            nIcon = '📱';
                        } else if (!statusObj.daemon_running || (statusObj.error && /12339|daemon|refused/i.test(statusObj.error))) {
                            nTitle = 'Soulseek Daemon Offline';
                            nMsg = 'Nicotine+ background service is offline on port 12339. Start the service on your host PC.';
                            nIcon = '🔌';
                        } else if (statusObj.has_credentials) {
                            nTitle = 'Soulseek Offline';
                            nMsg = statusObj.error ? `Auth issue: ${statusObj.error}` : 'Soulseek is currently disconnected. Click Settings to connect.';
                            nIcon = '⚠️';
                        } else {
                            nTitle = 'Soulseek Not Configured';
                            nMsg = 'Click Settings to enter your Soulseek username and password.';
                            nIcon = '⚙️';
                        }

                        if (noticeTitle) noticeTitle.textContent = nTitle;
                        if (noticeMsg) noticeMsg.textContent = nMsg;
                        if (noticeIcon) noticeIcon.textContent = nIcon;
                        wsNotice.style.display = 'flex';
                    }
                }
            }
        },

        async startDaemon() {
            if (slskStartDaemonBtn) {
                slskStartDaemonBtn.textContent = 'STARTING...';
                slskStartDaemonBtn.disabled = true;
            }
            if (slskStatusText) slskStatusText.textContent = 'LAUNCHING DAEMON...';
            if (slskStatusDot) slskStatusDot.className = 'slskStatusDot busy';
            const mobileDot = document.querySelector('#slskMobileStatusDot .slskStatusDot');
            if (mobileDot) mobileDot.className = 'slskStatusDot busy';
            if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge busy';

            try {
                const res = await fetch(getSlskApiUrl('start_daemon'), { method: 'POST' });
                const data = await res.json();
                
                let attempts = 0;
                const pollStart = setInterval(async () => {
                    attempts++;
                    await this.checkStatus();
                    if (attempts >= 4) {
                        clearInterval(pollStart);
                        if (slskStartDaemonBtn) {
                            slskStartDaemonBtn.textContent = '▶ START DAEMON';
                            slskStartDaemonBtn.disabled = false;
                        }
                    }
                }, 1200);
            } catch (err) {
                console.warn('Could not start daemon:', err);
                if (slskStartDaemonBtn) {
                    slskStartDaemonBtn.textContent = '▶ START DAEMON';
                    slskStartDaemonBtn.disabled = false;
                }
                this.checkStatus();
            }
        },

        renderSearchingAnimation(query, statusText = 'Collecting distributed peer search responses...') {
            if (!slskResultsList) return;
            slskResultsList.innerHTML = `
                <div class="slskSearchingState activeSearchLive" id="slskSearchingState">
                    <div class="slskRadarGraphic activeRadar">
                        <div class="radarRing r1"></div>
                        <div class="radarRing r2"></div>
                        <div class="radarRing r3"></div>
                        <div class="radarSweep"></div>
                        <div class="radarCenterPulse"></div>
                    </div>
                    <div class="slskSearchingInfo">
                        <h3 id="slskSearchingTitle">Querying Soulseek Network</h3>
                        <p class="slskSearchingQuery">Searching peer network for <strong class="queryHighlight">"${escapeHtml(query)}"</strong></p>
                        <div class="slskSearchingProgressCon">
                            <div class="slskSearchingProgressBar"><div class="slskSearchingProgressIndicator"></div></div>
                            <span class="slskSearchingPeerStatus" id="slskSearchingPeerStatus">${escapeHtml(statusText)}</span>
                        </div>
                    </div>
                </div>
            `;
        },

        renderNoResultsFound(query) {
            if (!slskResultsList) return;
            slskResultsList.innerHTML = `
                <div class="slskPlaceholder noResultsFound">
                    <div class="slskNoResultsIcon">🔍</div>
                    <h3>NO MATCHING PEER SHARES FOUND</h3>
                    <p>No peers are currently sharing tracks matching "<strong>${escapeHtml(query)}</strong>".</p>
                    <div class="slskSampleTags">
                        <span>Try searching:</span>
                        <button type="button" class="sampleTagBtn" data-query="${escapeHtml(query.split(' ')[0] || query)}">${escapeHtml(query.split(' ')[0] || query)}</button>
                        <button type="button" class="sampleTagBtn" data-query="OneRepublic FLAC">OneRepublic FLAC</button>
                        <button type="button" class="sampleTagBtn" data-query="Daft Punk Discovery">Daft Punk Discovery</button>
                    </div>
                </div>
            `;
            slskResultsList.querySelectorAll('.sampleTagBtn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const sampleQ = btn.dataset.query;
                    if (slskSearchInput) slskSearchInput.value = sampleQ;
                    soulseekController.search(sampleQ);
                });
            });
            if (slskResultCount) {
                slskResultCount.textContent = '0 RESULTS FOUND';
            }
        },

        async search(query) {
            const q = (query || '').trim();
            if (!q) return;

            if (!this.isConnected) {
                if (!this.hasCredentials) {
                    if (slskAccountBtn) slskAccountBtn.click();
                    return;
                }

                await this.togglePower();
                if (!this.isConnected) return;
            }

            this.activeQuery = q;
            if (window.innerWidth <= 768) {
                setMobileSearchPanelCollapsed(true);
                const textFiltersCon = document.getElementById('slskTextFiltersCon');
                const textFilterBtn = document.getElementById('slskTextFilterToggleBtn');
                if (textFiltersCon && textFiltersCon.classList.contains('open')) {
                    textFiltersCon.classList.remove('open');
                    if (textFilterBtn && !this.includeFilterQuery && !this.excludeFilterQuery) {
                        textFilterBtn.classList.remove('active');
                    }
                }
            }
            this.rawResults = [];
            this.activeSubFilter = null;
            this.includeFilterQuery = (slskIncludeFilterInput?.value || '').trim();
            this.excludeFilterQuery = (slskExcludeFilterInput?.value || '').trim();
            this.inResultFilterQuery = this.includeFilterQuery;
            this.suggestedTags = [];
            this.renderSuggestedChips();
            this.isSearching = true;

            if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge busy';
            if (slskActiveSearchMeta) slskActiveSearchMeta.textContent = `QUERY: "${q.toUpperCase()}"`;
            if (slskResultCount) slskResultCount.textContent = 'QUERYING NETWORK PEERS...';

            // Immediately clear stale results and display high-tech radar loading animation!
            this.renderSearchingAnimation(q, 'Dispatching distributed search query to network peers...');

            if (this.searchPollTimer) clearInterval(this.searchPollTimer);

            try {
                const searchModeSelect = document.getElementById('slskSearchModeSelect');
                const searchMode = searchModeSelect ? searchModeSelect.value : 'global';
                const isNativeMobile = !!(window.CachyNativeSoulseek && typeof window.CachyNativeSoulseek.call === 'function');

                const res = await fetch(getSlskApiUrl('search', `query=${encodeURIComponent(q)}&mode=${encodeURIComponent(searchMode)}`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: q, mode: searchMode })
                });
                const data = await res.json();

                if (!data.ok) {
                    const peerStatusEl = document.getElementById('slskSearchingPeerStatus');
                    if (peerStatusEl) peerStatusEl.textContent = `Search error: ${data.message || data.error || (isNativeMobile ? 'Check Soulseek login' : 'Check Nicotine+')}`;
                    this.isSearching = false;
                    return;
                }

                this.activeToken = data.token;

                let pollCount = 0;
                const maxPolls = 16;

                const doPoll = async () => {
                    pollCount++;
                    const peerStatusEl = document.getElementById('slskSearchingPeerStatus');
                    if (peerStatusEl && this.isSearching && (!this.rawResults || this.rawResults.length === 0)) {
                        peerStatusEl.textContent = `Querying peers (${pollCount}/${maxPolls})... Streaming responses...`;
                    }
                    await this.pollResults(this.activeToken);
                    if (pollCount >= maxPolls) {
                        clearInterval(this.searchPollTimer);
                        this.searchPollTimer = null;
                        this.isSearching = false;
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge online';
                        if (!this.rawResults || this.rawResults.length === 0) {
                            this.renderNoResultsFound(q);
                        }
                    }
                };

                setTimeout(doPoll, 400);
                this.searchPollTimer = setInterval(doPoll, 1000);

            } catch (err) {
                console.warn('Search request error:', err);
                const peerStatusEl = document.getElementById('slskSearchingPeerStatus');
                const isNativeMobile = !!(window.CachyNativeSoulseek && typeof window.CachyNativeSoulseek.call === 'function');
                if (peerStatusEl) peerStatusEl.textContent = isNativeMobile ? 'Connection error reaching Soulseek network' : 'Connection error reaching Nicotine+ daemon';
                this.isSearching = false;
            }
        },

        async pollResults(token) {
            if (!token) return;
            try {
                const res = await fetch(getSlskApiUrl('results', `token=${encodeURIComponent(token)}&limit=250`));
                const data = await res.json();

                if (data.ok && Array.isArray(data.items)) {
                    if (data.items.length > 0) {
                        this.rawResults = data.items;
                        this.extractSuggestions(data.items);
                        this.applyFilterAndRender();
                    }
                }
            } catch (err) {
                console.warn('Poll results error:', err);
            }
        },

        activeSortField: 'speed',
        activeSortDir: 'desc',

        getEffectiveBitrate(item) {
            if (!item) return 0;

            const isLossless = Boolean(item.isLossless || ['FLAC', 'WAV', 'ALAC', 'AIFF'].includes((item.extension || '').toUpperCase()));

            // Numeric bitrate if already known
            const raw = item.bitrate;
            let numBr = typeof raw === 'number' ? raw : (raw ? parseInt(raw, 10) : 0);
            if (isNaN(numBr)) numBr = 0;

            // Lossless formats (FLAC, WAV, ALAC, AIFF)
            if (isLossless) {
                if (numBr >= 500) return numBr;
                if (item.size && item.duration && item.duration > 0) {
                    const calc = Math.round((item.size * 8) / (item.duration * 1000));
                    if (calc >= 400 && calc <= 9216) return calc;
                }
                // Lossless baseline: CD Red Book quality 1411 kbps for ranking above 320 kbps MP3
                return 1411;
            }

            if (numBr > 0) return numBr;

            // Fallback: calculate from file size and duration
            if (item.size && item.duration && item.duration > 0) {
                const calc = Math.round((item.size * 8) / (item.duration * 1000));
                if (calc > 0 && calc <= 3000) return calc;
            }

            // Fallback: parse bitrate markers from file name or path (e.g. 320kbps, [320], 256k)
            const text = `${item.filename || ''} ${item.filePath || ''}`;
            const m = text.match(/\b(320|256|224|192|160|128|96|64)\s*(?:kbps|k)?\b/i);
            if (m) {
                const p = parseInt(m[1], 10);
                if (!isNaN(p) && p > 0) return p;
            }
            if (/\bV0\b/i.test(text)) return 245;
            if (/\bV2\b/i.test(text)) return 190;

            return 0;
        },

        setSortColumn(field) {
            if (this.activeSortField === field) {
                // Toggle direction
                this.activeSortDir = this.activeSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                this.activeSortField = field;
                // Default directions: speed, size, bitrate, slots start desc; filename, format start asc
                this.activeSortDir = (field === 'filename' || field === 'format') ? 'asc' : 'desc';
            }
            this.updateSortHeaderUI();
            this.applyFilterAndRender();
        },

        updateSortHeaderUI() {
            const headerCols = document.querySelectorAll('.slskResultsHeader .col.sortable');
            headerCols.forEach(col => {
                const field = col.dataset.sort;
                const indicator = col.querySelector('.sortIndicator');
                if (field === this.activeSortField) {
                    col.classList.add('active');
                    col.classList.toggle('asc', this.activeSortDir === 'asc');
                    col.classList.toggle('desc', this.activeSortDir === 'desc');
                    if (indicator) {
                        indicator.textContent = this.activeSortDir === 'asc' ? '▲' : '▼';
                    }
                } else {
                    col.classList.remove('active', 'asc', 'desc');
                    if (indicator) {
                        indicator.textContent = '↕';
                    }
                }
            });
        },

        extractSuggestions(items) {
            if (!items || items.length === 0) {
                this.suggestedTags = [];
                this.renderSuggestedChips();
                return;
            }

            const currentQuery = (this.activeQuery || '').trim();
            const queryWords = new Set(currentQuery.toLowerCase().split(/\s+/).filter(Boolean));

            const ignoreWords = new Set([
                'music', 'flac', 'mp3', 'cd', 'disc', 'album', 'va', 'vbr', 'cbr', '320',
                '320kbps', 'lossless', 'remix', 'remixes', 'deluxe', 'edition', 'ost',
                'soundtrack', 'single', 'ep', 'various', 'artists', 'tracks', 'audio',
                'complete', 'discography', 'vol', 'volume', 'new music', 'unknown',
                'soundtracks', 'greatest hits', 'the best of', 'best of', 'hit collection',
                'hi-res', 'high resolution', 'remaster', 'remastered', 'bonus track', 'bonus tracks'
            ]);

            const albumCounts = new Map();
            const trackCounts = new Map();

            items.forEach(it => {
                // 1. Process Album / Subfolder
                let alb = (it.albumGuess || '').trim();
                if (alb) {
                    alb = alb.replace(/^\d+[\s._-]+/, '');
                    alb = alb.replace(/\s*\(?\b(19|20)\d{2}\b\)?.*$/, '');
                    alb = alb.replace(/\s*\[.*?\]/g, '');
                    alb = alb.replace(/\s*\(.*?(flac|mp3|320|lossless|deluxe|edition|cd|remaster|reissue|bonus).*?\)/gi, '');
                    if (currentQuery) {
                        const qRegex = new RegExp('^' + escapeRegex(currentQuery) + '[\\s\\-_:]*', 'i');
                        alb = alb.replace(qRegex, '').trim();
                    }
                    alb = alb.replace(/[\s._-]+$/, '').trim();
                    const lowAlb = alb.toLowerCase();
                    if (alb.length >= 3 && alb.length <= 40 && !ignoreWords.has(lowAlb)) {
                        const albWords = lowAlb.split(/\s+/).filter(Boolean);
                        if (!albWords.every(w => queryWords.has(w))) {
                            albumCounts.set(alb, (albumCounts.get(alb) || 0) + 1);
                        }
                    }
                }

                // 2. Process Track Title
                let fn = (it.filename || '').trim();
                if (fn) {
                    fn = fn.replace(/\.[a-z0-9]+$/i, '');
                    fn = fn.replace(/^\d+[\s._-]+/, '');
                    if (currentQuery) {
                        const qRegex = new RegExp('^' + escapeRegex(currentQuery) + '[\\s\\-_:]*', 'i');
                        fn = fn.replace(qRegex, '').trim();
                    }
                    fn = fn.replace(/\s*\(.*?\)/g, '');
                    fn = fn.replace(/\s*\[.*?\]/g, '').trim();
                    fn = fn.replace(/^\d+[\s._-]+/, '');
                    fn = fn.replace(/[\s._-]+$/, '').trim();
                    const lowFn = fn.toLowerCase();
                    if (fn.length >= 3 && fn.length <= 35 && !ignoreWords.has(lowFn)) {
                        const fnWords = lowFn.split(/\s+/).filter(Boolean);
                        if (!fnWords.every(w => queryWords.has(w))) {
                            trackCounts.set(fn, (trackCounts.get(fn) || 0) + 1);
                        }
                    }
                }
            });

            const suggestions = [];

            // Top albums
            const sortedAlbums = Array.from(albumCounts.entries())
                .filter(([_, count]) => count >= 2)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 7);

            sortedAlbums.forEach(([alb, count]) => {
                suggestions.push({ type: 'album', value: alb, label: alb, count });
            });

            // Top tracks (excluding names that match an album already)
            const albumNameSet = new Set(sortedAlbums.map(([a]) => a.toLowerCase()));
            const sortedTracks = Array.from(trackCounts.entries())
                .filter(([name, count]) => count >= 2 && !albumNameSet.has(name.toLowerCase()))
                .sort((a, b) => b[1] - a[1])
                .slice(0, 7);

            sortedTracks.forEach(([track, count]) => {
                suggestions.push({ type: 'track', value: track, label: track, count });
            });

            this.suggestedTags = suggestions;
            this.renderSuggestedChips();
        },

        renderSuggestedChips() {
            const slskSuggestedRow = document.getElementById('slskSuggestedRow');
            const slskSuggestedChips = document.getElementById('slskSuggestedChips');
            const slskClearSubFilterBtn = document.getElementById('slskClearSubFilterBtn');

            if (!slskSuggestedRow || !slskSuggestedChips) return;

            if (!this.suggestedTags || this.suggestedTags.length === 0) {
                slskSuggestedRow.style.display = 'none';
                slskSuggestedChips.innerHTML = '';
                return;
            }

            slskSuggestedRow.style.display = 'flex';
            slskSuggestedChips.innerHTML = '';

            if (slskClearSubFilterBtn) {
                slskClearSubFilterBtn.style.display = (this.activeSubFilter || this.includeFilterQuery || this.excludeFilterQuery || this.inResultFilterQuery) ? 'inline-block' : 'none';
            }

            this.suggestedTags.forEach(tag => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'slskSuggestedChip';
                if (this.activeSubFilter && this.activeSubFilter.value.toLowerCase() === tag.value.toLowerCase()) {
                    btn.classList.add('active');
                }
                btn.innerHTML = `<span class="tagLabel">${escapeHtml(tag.label)}</span><span class="tagCount">${tag.count}</span>`;
                btn.title = `Filter by ${tag.type === 'album' ? 'Album' : 'Track'}: "${tag.value}"`;

                btn.addEventListener('click', () => {
                    if (this.activeSubFilter && this.activeSubFilter.value.toLowerCase() === tag.value.toLowerCase()) {
                        // Toggle off
                        this.activeSubFilter = null;
                    } else {
                        this.activeSubFilter = { type: tag.type, value: tag.value };
                    }
                    this.renderSuggestedChips();
                    this.applyFilterAndRender();
                });

                slskSuggestedChips.appendChild(btn);
            });
        },

        getFilterTerms(queryStr) {
            if (!queryStr) return [];
            const terms = [];
            const regex = /"([^"]+)"|'([^']+)'|([^\s,]+)/g;
            let match;
            while ((match = regex.exec(queryStr)) !== null) {
                const val = (match[1] || match[2] || match[3] || '').trim().toLowerCase();
                if (val) terms.push(val);
            }
            return terms;
        },

        applyFilterAndRender() {
            let filtered = [...this.rawResults];

            // 1. Format Filter
            if (this.activeFilter === 'flac') {
                filtered = filtered.filter(item => item.isLossless || item.extension === 'FLAC');
            } else if (this.activeFilter === '320') {
                filtered = filtered.filter(item => item.isHighBitrate || item.isLossless);
            } else if (this.activeFilter === 'slots') {
                filtered = filtered.filter(item => item.freeSlots);
            }

            // 2. Suggested Sub-filter (Album / Track tag)
            if (this.activeSubFilter) {
                const targetVal = this.activeSubFilter.value.toLowerCase();
                const targetNorm = targetVal.replace(/[_.\-\s]+/g, ' ').trim();
                filtered = filtered.filter(item => {
                    const alb = (item.albumGuess || '').toLowerCase();
                    const fn = (item.filename || '').toLowerCase();
                    const fp = (item.filePath || '').toLowerCase();
                    if (alb.includes(targetVal) || fn.includes(targetVal) || fp.includes(targetVal)) return true;
                    if (targetNorm) {
                        const normStr = `${alb} ${fn} ${fp}`.replace(/[_.\-\s]+/g, ' ');
                        return normStr.includes(targetNorm);
                    }
                    return false;
                });
            }

            // 3. Include Text Filter (all tokens must match)
            const incQuery = (this.includeFilterQuery || this.inResultFilterQuery || '').trim();
            if (incQuery) {
                const incTerms = this.getFilterTerms(incQuery);
                if (incTerms.length > 0) {
                    filtered = filtered.filter(item => {
                        const target = `${item.filename || ''} ${item.filePath || ''} ${item.albumGuess || ''} ${item.artistGuess || ''} ${item.username || ''} ${item.extension || ''}`.toLowerCase();
                        return incTerms.every(term => target.includes(term));
                    });
                }
            }

            // 4. Exclude Text Filter (any token match excludes the item)
            const excQuery = (this.excludeFilterQuery || '').trim();
            if (excQuery) {
                const excTerms = this.getFilterTerms(excQuery);
                if (excTerms.length > 0) {
                    filtered = filtered.filter(item => {
                        const target = `${item.filename || ''} ${item.filePath || ''} ${item.albumGuess || ''} ${item.artistGuess || ''} ${item.username || ''} ${item.extension || ''}`.toLowerCase();
                        return !excTerms.some(term => target.includes(term));
                    });
                }
            }

            const dir = this.activeSortDir === 'asc' ? 1 : -1;

            if (this.activeSortField === 'filename') {
                filtered.sort((a, b) => dir * a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base', numeric: true }));
            } else if (this.activeSortField === 'format') {
                filtered.sort((a, b) => dir * (a.extension || '').localeCompare(b.extension || ''));
            } else if (this.activeSortField === 'bitrate') {
                filtered.sort((a, b) => {
                    const brA = this.getEffectiveBitrate(a);
                    const brB = this.getEffectiveBitrate(b);
                    if (brA !== brB) {
                        return dir * (brA - brB);
                    }
                    if (Boolean(a.isLossless) !== Boolean(b.isLossless)) {
                        return dir * ((a.isLossless ? 1 : 0) - (b.isLossless ? 1 : 0));
                    }
                    return dir * ((a.size || 0) - (b.size || 0));
                });
            } else if (this.activeSortField === 'size') {
                filtered.sort((a, b) => dir * ((a.size || 0) - (b.size || 0)));
            } else if (this.activeSortField === 'speed') {
                filtered.sort((a, b) => dir * ((a.speed || 0) - (b.speed || 0)));
            } else if (this.activeSortField === 'slots') {
                filtered.sort((a, b) => dir * ((a.freeSlots ? 1 : 0) - (b.freeSlots ? 1 : 0)));
            }

            const slskClearSubFilterBtn = document.getElementById('slskClearSubFilterBtn');
            if (slskClearSubFilterBtn) {
                slskClearSubFilterBtn.style.display = (this.activeSubFilter || incQuery || excQuery) ? 'inline-block' : 'none';
            }

            if (slskResultCount) {
                let filterLabel = '';
                if (this.activeSubFilter) {
                    filterLabel = ` [${this.activeSubFilter.type === 'album' ? 'ALBUM' : 'TRACK'}: "${this.activeSubFilter.value}"]`;
                }
                if (incQuery) {
                    filterLabel += ` [+INC: "${incQuery}"]`;
                }
                if (excQuery) {
                    filterLabel += ` [-EXC: "${excQuery}"]`;
                }
                slskResultCount.textContent = `${filtered.length} RESULT(S)${filterLabel} • ${this.rawResults.length} TOTAL PEER SHARES`;
            }

            if (filtered.length > 0) {
                if (slskSearchingState) slskSearchingState.style.display = 'none';
                if (slskPlaceholder) slskPlaceholder.style.display = 'none';
                this.renderRows(filtered);
            } else if (!this.isSearching) {
                if (slskSearchingState) slskSearchingState.style.display = 'none';
                if (slskResultsList) {
                    let msg = `No results matched filter "${this.activeFilter.toUpperCase()}". Try selecting ALL FORMATS or a broader query.`;
                    if (this.activeSubFilter) {
                        msg = `No results matched "${this.activeSubFilter.value}". Click RESET to clear sub-filter.`;
                    } else if (this.inResultFilterQuery) {
                        msg = `No results matched "${this.inResultFilterQuery}". Click ✕ to clear filter.`;
                    }
                    slskResultsList.innerHTML = `
                        <div class="slskPlaceholder">
                            <h3>NO MATCHING TRACKS FOUND</h3>
                            <p>${escapeHtml(msg)}</p>
                        </div>
                    `;
                }
            }
        },

        renderRows(items) {
            if (!slskResultsList) return;
            slskResultsList.innerHTML = '';

            items.forEach(item => {
                const row = document.createElement('div');
                row.className = 'slskResultRow';

                let badgeClass = 'badgeOther';
                if (item.isLossless || item.extension === 'FLAC') badgeClass = 'badgeFlac';
                else if (item.extension === 'MP3') badgeClass = 'badgeMp3';

                // Determine bitrate & sample rate
                const effBitrate = this.getEffectiveBitrate(item);

                let sampleRateText = '';
                if (item.sampleRate) {
                    const srKhz = (item.sampleRate / 1000).toFixed(1).replace(/\.0$/, '');
                    sampleRateText = `${srKhz} kHz`;
                    if (item.bitDepth) {
                        sampleRateText = `${item.bitDepth}-bit / ${sampleRateText}`;
                    }
                } else if (item.filePath) {
                    const srMatch = item.filePath.match(/(24|16)\s*[-_bit\/ ]+\s*(44(?:\.1)?|48|88(?:\.2)?|96|176(?:\.4)?|192)\s*(?:khz)?/i);
                    if (srMatch) {
                        sampleRateText = `${srMatch[1]}-bit / ${srMatch[2]} kHz`;
                    } else {
                        const srOnlyMatch = item.filePath.match(/(44\.1|48|88\.2|96|176\.4|192)\s*kHz/i);
                        if (srOnlyMatch) {
                            sampleRateText = `${srOnlyMatch[1]} kHz`;
                        }
                    }
                }

                let bitrateDisplay = '';
                if (item.isLossless || (item.extension && ['FLAC', 'WAV', 'ALAC', 'AIFF'].includes(item.extension.toUpperCase()))) {
                    bitrateDisplay = (effBitrate && effBitrate > 0 && effBitrate !== 1411) ? `${effBitrate} kbps` : 'LOSSLESS';
                } else if (effBitrate > 0) {
                    bitrateDisplay = `${effBitrate} kbps`;
                } else {
                    bitrateDisplay = 'N/A';
                }

                const queueHtml = item.freeSlots
                    ? `<span class="slskQueueVal free">✓ Free Slot</span>`
                    : `<span class="slskQueueVal queued">Queue: ${item.queuePosition || 1}</span>`;

                row.innerHTML = `
                    <div class="col colTrack">
                        <span class="slskResultTitle" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</span>
                        <span class="slskResultPath" title="${escapeHtml(item.filePath)}">${escapeHtml(item.artistGuess ? item.artistGuess + ' • ' : '')}${escapeHtml(item.filePath)}</span>
                    </div>
                    <div class="col colFormat">
                        <span class="slskFormatBadge ${badgeClass}">${escapeHtml(item.extension || 'AUDIO')}</span>
                    </div>
                    <div class="col colBitrate">
                        <span class="slskBitrateVal ${item.isLossless || (effBitrate && effBitrate >= 320) ? 'hiRes' : ''}">${bitrateDisplay}</span>
                        ${sampleRateText ? `<span class="slskSampleRateVal">${sampleRateText}</span>` : ''}
                    </div>
                    <div class="col colSize">
                        <span class="slskSizeVal">${item.sizeFormatted}</span>
                    </div>
                    <div class="col colPeer">
                        <span class="slskPeerUser" title="${escapeHtml(item.username)}">${escapeHtml(item.username)}</span>
                        <span class="slskPeerSpeed">${item.speedFormatted}</span>
                    </div>
                    <div class="col colQueue">
                        ${queueHtml}
                    </div>
                    <div class="col colAction slskActionCell">
                        <button type="button" class="slskBtn slskGetBtn" title="Queue Download">⬇ GET</button>
                        <button type="button" class="slskBtn slskBtnPrimary slskPlayBtn" title="Download & Auto-Play When Finished">▶ & PLAY</button>
                    </div>
                `;

                const getBtn = row.querySelector('.slskGetBtn');
                const playBtn = row.querySelector('.slskPlayBtn');

                getBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.queueDownload(item, false, getBtn);
                });

                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.queueDownload(item, true, playBtn);
                });

                slskResultsList.appendChild(row);
            });
        },

        async queueDownload(item, autoPlayWhenDone, btnEl) {
            if (btnEl) {
                btnEl.textContent = 'QUEUEING...';
                btnEl.disabled = true;
            }

            try {
                const res = await fetch(getSlskApiUrl('download'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: item.token || this.activeToken,
                        index: item.index,
                        username: item.username,
                        virtual_path: item.filePath,
                        size: item.size
                    })
                });
                const data = await res.json();

                if (data.ok) {
                    if (btnEl) {
                        btnEl.textContent = '✓ QUEUED';
                        btnEl.classList.add('enqueued');
                    }
                    if (autoPlayWhenDone) {
                        this.autoPlayQueue.add(item.filename);
                    }
                    this.pollTransfers();
                } else {
                    if (btnEl) {
                        btnEl.textContent = 'FAILED';
                        setTimeout(() => {
                            btnEl.textContent = autoPlayWhenDone ? '▶ & PLAY' : '⬇ GET';
                            btnEl.disabled = false;
                        }, 2500);
                    }
                }
            } catch (err) {
                console.warn('Queue download error:', err);
                if (btnEl) {
                    btnEl.textContent = 'ERROR';
                    btnEl.disabled = false;
                }
            }
        },

        activeSubView: 'results',

        setSubView(mode) {
            const nextMode = mode === 'transfers' ? 'transfers' : 'results';
            this.activeSubView = nextMode;
            const wsEl = document.getElementById('soulseekWorkspace');
            if (wsEl) {
                wsEl.setAttribute('data-slsk-subview', nextMode);
            }
            if (slskTransfersDrawer) {
                slskTransfersDrawer.classList.toggle('open', nextMode === 'transfers');
            }
            if (slskToggleTransfersBtn) {
                slskToggleTransfersBtn.classList.toggle('active', nextMode === 'transfers');
                slskToggleTransfersBtn.setAttribute('aria-pressed', nextMode === 'transfers' ? 'true' : 'false');
            }
            if (nextMode === 'transfers') {
                this.pollTransfers();
            }
        },

        toggleTransfersTab() {
            this.setSubView(this.activeSubView === 'transfers' ? 'results' : 'transfers');
        },

        openTransfersDrawer() {
            this.setSubView('transfers');
        },

        closeTransfersDrawer() {
            this.setSubView('results');
        },

        startTransfersPolling() {
            if (this.transfersPollTimer) return;
            this.pollTransfers();
            this.transfersPollTimer = setInterval(() => {
                if (document.hidden) return;
                this.pollTransfers();
            }, 1800);
        },

        stopTransfersPolling() {
            if (this.transfersPollTimer) {
                clearInterval(this.transfersPollTimer);
                this.transfersPollTimer = null;
            }
        },

        getTransferActionsHtml(item, isFin) {
            if (isFin) {
                return `
                    <button type="button" class="slskPlayNowBtn">PLAY NOW</button>
                    <button type="button" class="slskTransferBtn slskCancelBtn slskIconOnlyBtn" title="Remove Completed Transfer">✕</button>
                `;
            } else if (item.status === 'Paused') {
                return `
                    <button type="button" class="slskTransferBtn slskResumeBtn" title="Resume Download">RESUME</button>
                    <button type="button" class="slskTransferBtn slskCancelBtn" title="Cancel Download">CANCEL</button>
                `;
            } else if (item.status === 'Cancelled' || (item.status && item.status.startsWith('Error'))) {
                return `
                    <button type="button" class="slskTransferBtn slskResumeBtn" title="Retry Download">RETRY</button>
                    <button type="button" class="slskTransferBtn slskCancelBtn slskIconOnlyBtn" title="Remove Transfer">✕</button>
                `;
            } else {
                return `
                    <button type="button" class="slskTransferBtn slskPauseBtn" title="Pause Download">PAUSE</button>
                    <button type="button" class="slskTransferBtn slskCancelBtn" title="Cancel Download">CANCEL</button>
                `;
            }
        },

        bindTransferRowActions(row, item, isFin) {
            if (isFin) {
                const playBtn = row.querySelector('.slskPlayNowBtn');
                if (playBtn) {
                    playBtn.addEventListener('click', () => {
                        this.importAndPlay(item.localFile || item.filename, true);
                    });
                }
            }

            const pauseBtn = row.querySelector('.slskPauseBtn');
            if (pauseBtn) {
                pauseBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    pauseBtn.disabled = true;
                    pauseBtn.textContent = '...';
                    try {
                        await fetch(getSlskApiUrl('pause_download'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: item.id || `${item.username}:${item.virtualPath}`,
                                username: item.username,
                                virtual_path: item.virtualPath,
                                size: item.size
                            })
                        });
                        await this.pollTransfers();
                    } catch (_) {
                        pauseBtn.disabled = false;
                        pauseBtn.textContent = 'PAUSE';
                    }
                });
            }

            const resumeBtn = row.querySelector('.slskResumeBtn');
            if (resumeBtn) {
                resumeBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    resumeBtn.disabled = true;
                    resumeBtn.textContent = '...';
                    try {
                        await fetch(getSlskApiUrl('resume_download'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: item.id || `${item.username}:${item.virtualPath}`,
                                username: item.username,
                                virtual_path: item.virtualPath,
                                size: item.size
                            })
                        });
                        await this.pollTransfers();
                    } catch (_) {
                        resumeBtn.disabled = false;
                        resumeBtn.textContent = 'RESUME';
                    }
                });
            }

            const cancelBtn = row.querySelector('.slskCancelBtn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    cancelBtn.disabled = true;
                    row.style.opacity = '0.35';
                    try {
                        await fetch(getSlskApiUrl('cancel_download'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: item.id || `${item.username}:${item.virtualPath}`,
                                username: item.username,
                                virtual_path: item.virtualPath
                            })
                        });
                        row.remove();
                        await this.pollTransfers();
                    } catch (_) {
                        row.style.opacity = '1';
                        cancelBtn.disabled = false;
                    }
                });
            }
        },

        async pollTransfers() {
            try {
                const res = await fetch(getSlskApiUrl('transfers'));
                const data = await res.json();

                if (!data.ok || !Array.isArray(data.items)) return;

                const items = data.items;
                const activeCount = items.filter(it => !it.isFinished).length;

                if (slskTransferCount) slskTransferCount.textContent = activeCount.toString();
                if (slskMobileTransferCount) slskMobileTransferCount.textContent = activeCount.toString();
                if (slskTransfersSummary) slskTransfersSummary.textContent = `${activeCount} Active • ${items.length} Total`;

                const slskResumeAllBtn = document.getElementById('slskResumeAllBtn');
                const hasPaused = items.some(it => !it.isFinished && (it.status === 'Paused' || (it.status && it.status.startsWith('Error'))));
                if (slskResumeAllBtn) {
                    slskResumeAllBtn.style.display = hasPaused ? 'inline-flex' : 'none';
                    if (!slskResumeAllBtn.dataset.bound) {
                        slskResumeAllBtn.dataset.bound = 'true';
                        slskResumeAllBtn.addEventListener('click', async () => {
                            slskResumeAllBtn.disabled = true;
                            slskResumeAllBtn.textContent = 'RESUMING...';
                            try {
                                await fetch(getSlskApiUrl('resume_all'), { method: 'POST' });
                                await this.pollTransfers();
                            } catch (_) {}
                            finally {
                                slskResumeAllBtn.disabled = false;
                                slskResumeAllBtn.textContent = 'RESUME ALL';
                            }
                        });
                    }
                }

                if (!slskTransfersList) return;

                if (items.length === 0) {
                    slskTransfersList.innerHTML = `<div class="slskEmptyTransfers">No active or recent transfers.</div>`;
                    return;
                }

                const emptyNotice = slskTransfersList.querySelector('.slskEmptyTransfers');
                if (emptyNotice) emptyNotice.remove();

                const validIds = new Set(items.map(it => String(it.id)));
                Array.from(slskTransfersList.children).forEach(child => {
                    const tid = child.dataset.transferId;
                    if (tid && !validIds.has(tid)) {
                        child.remove();
                    }
                });

                items.forEach(item => {
                    const itemIdStr = String(item.id);
                    const pct = Math.max(0, Math.min(100, item.progress));
                    const isFin = item.isFinished || pct >= 100;
                    const statusText = (item.status === 'Paused' && pct > 0)
                        ? `Paused (${pct}% • Resumable)`
                        : `${escapeHtml(item.status)} (${pct}%)`;

                    let row = slskTransfersList.querySelector(`[data-transfer-id="${CSS.escape(itemIdStr)}"]`);

                    if (row) {
                        const statusEl = row.querySelector('.status');
                        const speedEl = row.querySelector('.speed');
                        const barFill = row.querySelector('.slskTransferBarFill');

                        if (statusEl && statusEl.textContent !== statusText) statusEl.textContent = statusText;
                        if (speedEl && speedEl.textContent !== item.speedFormatted) speedEl.textContent = item.speedFormatted;
                        if (barFill) {
                            barFill.style.width = `${pct}%`;
                            barFill.classList.toggle('finished', isFin);
                        }

                        if (row.dataset.lastStatus !== item.status) {
                            row.dataset.lastStatus = item.status;
                            const actionsCon = row.querySelector('.slskTransferActions');
                            if (actionsCon) {
                                actionsCon.innerHTML = this.getTransferActionsHtml(item, isFin);
                                this.bindTransferRowActions(row, item, isFin);
                            }
                        }
                    } else {
                        row = document.createElement('div');
                        row.className = 'slskTransferRow';
                        row.dataset.transferId = itemIdStr;
                        row.dataset.lastStatus = item.status;

                        row.innerHTML = `
                            <div class="slskTransferLeft">
                                <div class="slskTransferName" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</div>
                                <div class="slskTransferMeta">
                                    <span>${item.sizeFormatted}</span>
                                    <span class="status">${statusText}</span>
                                    <span class="speed">${item.speedFormatted}</span>
                                    <span>${escapeHtml(item.username)}</span>
                                </div>
                            </div>
                            <div class="slskTransferBarCon">
                                <div class="slskTransferBarFill ${isFin ? 'finished' : ''}" style="width: ${pct}%;"></div>
                            </div>
                            <div class="slskTransferActions">
                                ${this.getTransferActionsHtml(item, isFin)}
                            </div>
                        `;

                        this.bindTransferRowActions(row, item, isFin);
                        slskTransfersList.appendChild(row);
                    }

                    if (isFin && this.autoPlayQueue.has(item.filename)) {
                        this.autoPlayQueue.delete(item.filename);
                        const shouldAutoPlay = !userExplicitlyPaused && !audio.paused && !document.hidden;
                        this.importAndPlay(item.localFile || item.filename, shouldAutoPlay);
                    }
                });

            } catch (err) {
                console.warn('Poll transfers error:', err);
            }
        },

        async importAndPlay(filenameOrPath, autoPlay = true) {
            try {
                const res = await fetch(getSlskApiUrl('import_track'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file: filenameOrPath })
                });
                const data = await res.json();

                if (data.ok && data.track) {
                    const imported = data.track;
                    const existingIdx = allTracks.findIndex(t => t.filename === imported.filename || t.fullPath === imported.fullPath);
                    let targetIdx;

                    if (existingIdx !== -1) {
                        targetIdx = existingIdx;
                    } else {
                        allTracks.push(imported);
                        applySearchAndSort();
                        targetIdx = allTracks.length - 1;
                    }

                    if (autoPlay && !userExplicitlyPaused) {
                        loadTrack(targetIdx, true);
                    } else {
                        loadTrack(targetIdx, false);
                    }
                }
            } catch (err) {
                console.warn('Import track error:', err);
            }
        },

        async syncAllDownloadsToLibrary() {
            if (slskScanDownloadsBtn) slskScanDownloadsBtn.textContent = 'SCANNING...';
            try {
                const targetDir = this.downloadsDir || '';
                const res = await fetch('php/api/scan.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ directory: targetDir })
                });
                const data = await res.json();
                if (data.success && Array.isArray(data.tracks)) {
                    allTracks = data.tracks;
                    applySearchAndSort();
                    if (allTracks.length > 0) {
                        loadTrack(0, false);
                    }
                    if (slskScanDownloadsBtn) slskScanDownloadsBtn.textContent = `✓ LOADED ${data.count} TRACKS`;
                    setTimeout(() => {
                        if (slskScanDownloadsBtn) slskScanDownloadsBtn.textContent = 'SYNC ALL TO LIBRARY';
                    }, 3000);
                }
            } catch (err) {
                console.warn('Sync downloads error:', err);
                if (slskScanDownloadsBtn) slskScanDownloadsBtn.textContent = 'SCAN FAILED';
            }
        }
    };


    let slskEventsInitialized = false;
    function initSoulseekEventListeners() {
        if (slskEventsInitialized) return;
        slskEventsInitialized = true;

        function renderSlskDiagnosticAlert(el, data = {}, fallbackMsg = 'Connection failed.') {
            if (!el) return;
            const rawErr = (typeof data === 'string' ? data : (data.error || data.message || fallbackMsg || '')).trim();
            const reason = (typeof data === 'object' && data ? data.reason : '') || '';

            let title = 'Connection Failed';
            let explanation = rawErr || fallbackMsg;
            let icon = '⚠️';

            if (reason === 'mobile_standalone' || /standalone/i.test(rawErr)) {
                title = 'Desktop Workstation Required';
                explanation = 'Soulseek P2P transfers require a desktop workstation running the Nicotine+ daemon. In the settings field above, enter your Desktop Host IP (e.g. http://192.168.1.50:8000) to connect your mobile device.';
                icon = '📱';
            } else if (reason === 'daemon_offline' || /port 12339|daemon|refused|could not launch/i.test(rawErr)) {
                title = 'Soulseek Service Offline';
                explanation = 'The background Nicotine+ daemon (port 12339) is offline on the host machine. Please start the Nicotine+ background service on your desktop.';
                icon = '🔌';
            } else if (reason === 'invalid_credentials' || /password|invalid username|invaliduserpass|credentials/i.test(rawErr)) {
                title = 'Invalid Soulseek Credentials';
                explanation = 'Incorrect username or password. Please verify your Soulseek account credentials with server.slsknet.org.';
                icon = '🔑';
            } else if (reason === 'network_unreachable' || /timeout|etimedout|econn|unreachable/i.test(rawErr)) {
                title = 'Network Unreachable';
                explanation = 'Could not reach server.slsknet.org (port 2242). Please check your internet connection or firewall rules.';
                icon = '🌐';
            }

            el.className = 'slskModalAlert error';
            el.innerHTML = `
                <div class="slskAlertTitle">${icon} <strong>${title}</strong></div>
                <div class="slskAlertBody">${explanation}</div>
            `;
            el.style.display = 'block';
        }
        try { window.renderSlskDiagnosticAlert = renderSlskDiagnosticAlert; } catch (_) {}

        function safeOpenSlskAccountModal() {
            const hostGroup = document.getElementById('slskModalHostGroup');
            if (hostGroup) {
                const isNativeAndroid = typeof AndroidBridge !== 'undefined'
                    && typeof AndroidBridge.isAndroid === 'function'
                    && AndroidBridge.isAndroid();
                hostGroup.style.display = isNativeAndroid ? 'none' : 'block';
            }
            const modal = document.getElementById('slskAccountModal');
            if (modal) {
                modal.style.display = 'flex';
                if (typeof pushModalState === 'function') pushModalState('slskAccountModal');
            }
        }

        function safeCloseSlskAccountModal() {
            const modal = document.getElementById('slskAccountModal');
            if (modal) {
                modal.style.display = 'none';
                if (typeof popModalState === 'function') popModalState('slskAccountModal');
            }
        }

        // Soulseek Power Button Listeners (Toolbar & Modal)
        if (slskPowerBtn) {
            slskPowerBtn.addEventListener('click', () => {
                soulseekController.togglePower();
            });
        }

        if (slskModalPowerBtn) {
            slskModalPowerBtn.addEventListener('click', () => {
                soulseekController.togglePower();
            });
        }

        // Soulseek Account Modal Listeners
        if (slskAccountBtn) {
            slskAccountBtn.addEventListener('click', async () => {
                safeOpenSlskAccountModal();
                if (slskAccountAlert) slskAccountAlert.style.display = 'none';
                const hostInput = document.getElementById('slskModalHost');
                if (hostInput) {
                    hostInput.value = (typeof safeStorage !== 'undefined' ? safeStorage.getItem('cachymusic_slsk_host') : '') || '';
                }
                try {
                    const res = await fetch(getSlskApiUrl('account'));
                    const data = await res.json();
                    if (data.username && slskModalUsername) {
                        slskModalUsername.value = data.username;
                    }
                    if (slskModalPassword) {
                        slskModalPassword.value = '';
                        slskModalPassword.placeholder = data.hasPassword ? '•••••••• (Stored securely in database)' : 'Enter password';
                    }
                    if (data.downloads_dir && slskModalDownloadDir) {
                        slskModalDownloadDir.value = data.downloads_dir;
                    } else if (soulseekController.downloadsDir && slskModalDownloadDir) {
                        slskModalDownloadDir.value = soulseekController.downloadsDir;
                    }
                    if (data.shared_dir && slskModalSharedDir) {
                        slskModalSharedDir.value = data.shared_dir;
                    } else if (soulseekController.sharedDir && slskModalSharedDir) {
                        slskModalSharedDir.value = soulseekController.sharedDir;
                    }
                    soulseekController.updatePowerUI(soulseekController.lastStatus || data);
                } catch (_) {}
            });
        }

        if (slskChangeDirBtn) {
            slskChangeDirBtn.addEventListener('click', () => {
                if (slskAccountBtn) slskAccountBtn.click();
            });
        }

        if (slskChangeSharedDirBtn) {
            slskChangeSharedDirBtn.addEventListener('click', () => {
                if (slskAccountBtn) slskAccountBtn.click();
            });
        }

        // Direct "SYNC WITH PLAYER DIR" button in Soulseek toolbar
        if (slskSyncCurrentDirBtn) {
            slskSyncCurrentDirBtn.addEventListener('click', async () => {
                let currentFolder = (folderPathInput ? folderPathInput.value : '').trim();

                // If not in input, ask scan.php for current library directory
                if (!currentFolder) {
                    try {
                        const scanRes = await fetch('php/api/scan.php');
                        const scanData = await scanRes.json();
                        if (scanData.directory) {
                            currentFolder = scanData.directory;
                            if (folderPathInput) folderPathInput.value = currentFolder;
                        }
                    } catch (_) {}
                }

                if (!currentFolder) {
                    alert('No active player music folder found. Please enter or scan a music folder first.');
                    return;
                }

                slskSyncCurrentDirBtn.textContent = 'SYNCING...';
                slskSyncCurrentDirBtn.disabled = true;

                try {
                    const res = await fetch(getSlskApiUrl('directory'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ directory: currentFolder })
                    });
                    const data = await res.json();

                    if (data.ok && data.downloads_dir) {
                        soulseekController.downloadsDir = data.downloads_dir;
                        if (slskDownloadsPathText) slskDownloadsPathText.textContent = data.downloads_dir;
                        if (slskModalDownloadDir) slskModalDownloadDir.value = data.downloads_dir;
                        slskSyncCurrentDirBtn.textContent = 'SYNCED!';
                        setTimeout(() => {
                            slskSyncCurrentDirBtn.textContent = 'SYNC WITH PLAYER DIR';
                            slskSyncCurrentDirBtn.disabled = false;
                        }, 1800);
                    } else {
                        alert(data.error || data.message || 'Failed to update Soulseek download folder.');
                        slskSyncCurrentDirBtn.textContent = 'SYNC WITH PLAYER DIR';
                        slskSyncCurrentDirBtn.disabled = false;
                    }
                } catch (e) {
                    console.warn('Sync dir error:', e);
                    alert('Network error communicating with Soulseek backend.');
                    slskSyncCurrentDirBtn.textContent = 'SYNC WITH PLAYER DIR';
                    slskSyncCurrentDirBtn.disabled = false;
                }
            });
        }

        // "USE PLAYER DIR" button inside the Account Settings Modal (Downloads)
        if (slskModalSyncPlayerDirBtn) {
            slskModalSyncPlayerDirBtn.addEventListener('click', async () => {
                let currentFolder = (folderPathInput ? folderPathInput.value : '').trim();
                if (!currentFolder) {
                    try {
                        const scanRes = await fetch('php/api/scan.php');
                        const scanData = await scanRes.json();
                        if (scanData.directory) currentFolder = scanData.directory;
                    } catch (_) {}
                }

                if (currentFolder && slskModalDownloadDir) {
                    slskModalDownloadDir.value = currentFolder;
                } else {
                    alert('No music folder currently scanned in the player.');
                }
            });
        }

        // "USE PLAYER DIR" button inside the Account Settings Modal (Shareable)
        if (slskModalSyncSharePlayerDirBtn) {
            slskModalSyncSharePlayerDirBtn.addEventListener('click', async () => {
                let currentFolder = (folderPathInput ? folderPathInput.value : '').trim();
                if (!currentFolder) {
                    try {
                        const scanRes = await fetch('php/api/scan.php');
                        const scanData = await scanRes.json();
                        if (scanData.directory) currentFolder = scanData.directory;
                    } catch (_) {}
                }

                if (currentFolder && slskModalSharedDir) {
                    slskModalSharedDir.value = currentFolder;
                } else {
                    alert('No music folder currently scanned in the player.');
                }
            });
        }

        if (slskCloseAccountModalBtn) {
            slskCloseAccountModalBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                safeCloseSlskAccountModal();
            });
            slskCloseAccountModalBtn.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
            }, { passive: true });
        }

        if (slskAccountModal) {
            slskAccountModal.addEventListener('click', (e) => {
                if (e.target === slskAccountModal) {
                    safeCloseSlskAccountModal();
                }
            });
        }

        const slskModalAutoDetectHostBtn = document.getElementById('slskModalAutoDetectHostBtn');
        if (slskModalAutoDetectHostBtn) {
            slskModalAutoDetectHostBtn.addEventListener('click', () => {
                const hostInput = document.getElementById('slskModalHost');
                if (!hostInput) return;
                if (window.location.protocol.startsWith('http') && !window.location.hostname.includes('androidplatform.net')) {
                    hostInput.value = window.location.origin;
                } else {
                    const promptVal = prompt('Enter your desktop workstation IP and port (e.g. http://192.168.1.50:8000):', hostInput.value || 'http://192.168.1.');
                    if (promptVal) hostInput.value = promptVal.trim();
                }
            });
        }

        async function saveSlskAccountSettings() {
            if (!slskSaveAccountBtn || slskSaveAccountBtn.disabled) return;
            const hostInput = document.getElementById('slskModalHost');
            if (hostInput) {
                const hostVal = hostInput.value.trim();
                safeStorage.setItem('cachymusic_slsk_host', hostVal);
                if (typeof AndroidBridge !== 'undefined' && typeof AndroidBridge.setSoulseekHost === 'function') {
                    try { AndroidBridge.setSoulseekHost(hostVal); } catch (_) {}
                }
            }
            const username = (slskModalUsername ? slskModalUsername.value : '').trim();
            const password = (slskModalPassword ? slskModalPassword.value : '').trim();
            const newDir = (slskModalDownloadDir ? slskModalDownloadDir.value : '').trim();
            const newSharedDir = (slskModalSharedDir ? slskModalSharedDir.value : '').trim();

            slskSaveAccountBtn.textContent = 'SAVING...';
            slskSaveAccountBtn.disabled = true;

            try {
                // Update downloads directory if changed
                if (newDir && newDir !== soulseekController.downloadsDir) {
                    try {
                        const dirRes = await fetch(getSlskApiUrl('directory'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ directory: newDir })
                        });
                        const dirData = await dirRes.json();
                        if (dirData && dirData.downloads_dir) {
                            soulseekController.downloadsDir = dirData.downloads_dir;
                            if (slskDownloadsPathText) slskDownloadsPathText.textContent = dirData.downloads_dir;
                        }
                    } catch (_) {}
                }

                // Update shared directory if changed
                if (newSharedDir && newSharedDir !== soulseekController.sharedDir) {
                    try {
                        const sRes = await fetch(getSlskApiUrl('shared_directory'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ directory: newSharedDir })
                        });
                        const sData = await sRes.json();
                        if (sData && sData.shared_dir) {
                            soulseekController.sharedDir = sData.shared_dir;
                            if (slskSharedPathText) slskSharedPathText.textContent = sData.shared_dir;
                        }
                    } catch (_) {}
                }

                // Save credentials and connect
                if (username) {
                    const res = await fetch(getSlskApiUrl('login'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username,
                            password,
                            downloads_dir: newDir,
                            shared_dir: newSharedDir
                        })
                    });
                    const data = await res.json();

                    if (data.ok) {
                        if (slskAccountAlert) {
                            slskAccountAlert.className = 'slskModalAlert success';
                            slskAccountAlert.textContent = `Connected as ${data.username || username}! Settings saved.`;
                            slskAccountAlert.style.display = 'block';
                        }
                        setTimeout(() => {
                            safeCloseSlskAccountModal();
                            soulseekController.checkStatus();
                        }, 900);
                    } else {
                        renderSlskDiagnosticAlert(slskAccountAlert, data, 'Connection failed.');
                    }
                } else {
                    // Directory only saved
                    if (slskAccountAlert) {
                        slskAccountAlert.className = 'slskModalAlert success';
                        slskAccountAlert.textContent = 'Settings saved.';
                        slskAccountAlert.style.display = 'block';
                    }
                    setTimeout(() => {
                        safeCloseSlskAccountModal();
                        soulseekController.checkStatus();
                    }, 900);
                }
            } catch (err) {
                renderSlskDiagnosticAlert(slskAccountAlert, {
                    error: err && err.message ? err.message : 'Network error communicating with Soulseek backend.',
                    reason: isMobileDevice ? 'mobile_standalone' : 'daemon_offline'
                }, 'Network error saving settings.');
            } finally {
                slskSaveAccountBtn.textContent = 'SAVE & CONNECT';
                slskSaveAccountBtn.disabled = false;
            }
        }

        if (slskSaveAccountBtn) {
            bindFastAction(slskSaveAccountBtn, () => {
                saveSlskAccountSettings();
            });
        }

        const slskAccountForm = document.getElementById('slskAccountForm');
        if (slskAccountForm) {
            slskAccountForm.addEventListener('submit', (e) => {
                e.preventDefault();
                saveSlskAccountSettings();
            });
        }

        const slskNoticeActionBtn = document.getElementById('slskNoticeActionBtn');
        if (slskNoticeActionBtn) {
            bindFastAction(slskNoticeActionBtn, () => {
                safeOpenSlskAccountModal();
            });
        }

        const slskNoticeConnectBtn = document.getElementById('slskNoticeConnectBtn');
        if (slskNoticeConnectBtn && slskPowerBtn) {
            bindFastAction(slskNoticeConnectBtn, () => {
                slskPowerBtn.click();
            });
        }

        if (slskLogoutBtn) {
            slskLogoutBtn.addEventListener('click', async () => {
                try {
                    await fetch(getSlskApiUrl('logout'), { method: 'POST' });
                    if (slskModalUsername) slskModalUsername.value = '';
                    if (slskModalPassword) {
                        slskModalPassword.value = '';
                        slskModalPassword.placeholder = 'Enter password';
                    }
                    if (slskAccountAlert) {
                        slskAccountAlert.className = 'slskModalAlert success';
                        slskAccountAlert.textContent = 'Credentials cleared from database and disconnected.';
                        slskAccountAlert.style.display = 'block';
                    }
                    soulseekController.checkStatus();
                } catch (e) {
                    console.warn('Logout error:', e);
                }
            });
        }

        const slskSearchForm = document.getElementById('slskSearchForm');
        let lastInstantSearchTs = 0;
        let lastInstantSearchQuery = '';

        const triggerInstantSearch = () => {
            if (!slskSearchInput) return;
            const rawVal = slskSearchInput.value.trim();
            if (!rawVal) return;
            const now = Date.now();
            if (now - lastInstantSearchTs < 350 && rawVal === lastInstantSearchQuery) {
                return;
            }
            lastInstantSearchTs = now;
            lastInstantSearchQuery = rawVal;
            if (window.innerWidth <= 768) {
                slskSearchInput.blur();
            }
            soulseekController.search(rawVal);
        };

        if (slskSearchForm) {
            slskSearchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                triggerInstantSearch();
            });
        }

        if (slskSearchInput) {
            const handleSearchKey = (e) => {
                if (e.isComposing) return;
                if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13) {
                    e.preventDefault();
                    triggerInstantSearch();
                }
            };
            slskSearchInput.addEventListener('keydown', handleSearchKey);
            slskSearchInput.addEventListener('keyup', handleSearchKey);
            slskSearchInput.addEventListener('input', () => {
                if (slskSearchClearBtn) {
                    slskSearchClearBtn.style.display = slskSearchInput.value ? 'inline-flex' : 'none';
                }
            });
        }
        if (slskSearchClearBtn) {
            slskSearchClearBtn.addEventListener('click', () => {
                if (slskSearchInput) slskSearchInput.value = '';
                slskSearchClearBtn.style.display = 'none';
            });
        }
        if (slskSearchSubmitBtn) {
            slskSearchSubmitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                triggerInstantSearch();
            });
        }
        if (slskFilterChips) {
            slskFilterChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    slskFilterChips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    soulseekController.activeFilter = chip.dataset.filter;
                    if (slskMobileActiveFilter) {
                        const filterNames = {
                            'all': 'ALL',
                            'flac': 'FLAC',
                            '320': '320K',
                            'slots': 'FREE SLOTS'
                        };
                        slskMobileActiveFilter.textContent = filterNames[chip.dataset.filter] || chip.dataset.filter.toUpperCase();
                    }
                    soulseekController.applyFilterAndRender();
                });
            });
        }

        // Include Text Filter Listeners
        if (slskIncludeFilterInput) {
            slskIncludeFilterInput.addEventListener('input', () => {
                soulseekController.includeFilterQuery = slskIncludeFilterInput.value.trim();
                soulseekController.inResultFilterQuery = soulseekController.includeFilterQuery;
                if (slskIncludeFilterClearBtn) {
                    slskIncludeFilterClearBtn.style.display = slskIncludeFilterInput.value ? 'inline-flex' : 'none';
                }
                soulseekController.applyFilterAndRender();
            });
        }

        if (slskIncludeFilterClearBtn) {
            slskIncludeFilterClearBtn.addEventListener('click', () => {
                if (slskIncludeFilterInput) slskIncludeFilterInput.value = '';
                slskIncludeFilterClearBtn.style.display = 'none';
                soulseekController.includeFilterQuery = '';
                soulseekController.inResultFilterQuery = '';
                soulseekController.applyFilterAndRender();
            });
        }

        // Exclude Text Filter Listeners
        if (slskExcludeFilterInput) {
            slskExcludeFilterInput.addEventListener('input', () => {
                soulseekController.excludeFilterQuery = slskExcludeFilterInput.value.trim();
                if (slskExcludeFilterClearBtn) {
                    slskExcludeFilterClearBtn.style.display = slskExcludeFilterInput.value ? 'inline-flex' : 'none';
                }
                soulseekController.applyFilterAndRender();
            });
        }

        if (slskExcludeFilterClearBtn) {
            slskExcludeFilterClearBtn.addEventListener('click', () => {
                if (slskExcludeFilterInput) slskExcludeFilterInput.value = '';
                slskExcludeFilterClearBtn.style.display = 'none';
                soulseekController.excludeFilterQuery = '';
                soulseekController.applyFilterAndRender();
            });
        }

        if (slskClearSubFilterBtn) {
            slskClearSubFilterBtn.addEventListener('click', () => {
                soulseekController.activeSubFilter = null;
                soulseekController.includeFilterQuery = '';
                soulseekController.excludeFilterQuery = '';
                soulseekController.inResultFilterQuery = '';
                if (slskIncludeFilterInput) slskIncludeFilterInput.value = '';
                if (slskIncludeFilterClearBtn) slskIncludeFilterClearBtn.style.display = 'none';
                if (slskExcludeFilterInput) slskExcludeFilterInput.value = '';
                if (slskExcludeFilterClearBtn) slskExcludeFilterClearBtn.style.display = 'none';
                soulseekController.renderSuggestedChips();
                soulseekController.applyFilterAndRender();
            });
        }
        // Soulseek Column Header Sorting Listeners
        const slskSortHeaders = document.querySelectorAll('.slskResultsHeader .col.sortable');
        slskSortHeaders.forEach(col => {
            col.addEventListener('click', () => {
                const sortField = col.dataset.sort;
                if (sortField) {
                    soulseekController.setSortColumn(sortField);
                }
            });
        });
        soulseekController.updateSortHeaderUI();
        document.querySelectorAll('.sampleTagBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                const q = btn.dataset.query;
                if (slskSearchInput) {
                    slskSearchInput.value = q;
                    if (slskSearchClearBtn) slskSearchClearBtn.style.display = 'inline-flex';
                }
                if (window.innerWidth <= 768) {
                    setMobileSearchPanelCollapsed(true);
                }
                soulseekController.search(q);
            });
        });
        if (slskStartDaemonBtn) {
            slskStartDaemonBtn.addEventListener('click', () => soulseekController.startDaemon());
        }
        if (slskRefreshStatusBtn) {
            slskRefreshStatusBtn.addEventListener('click', () => soulseekController.checkStatus());
        }
        if (slskToggleTransfersBtn) {
            slskToggleTransfersBtn.addEventListener('click', () => {
                soulseekController.toggleTransfersTab();
            });
        }
        const slskBackToResultsBtn = document.getElementById('slskBackToResultsBtn');
        if (slskBackToResultsBtn) {
            slskBackToResultsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                soulseekController.setSubView('results');
            });
        }
        const slskTextFilterToggleBtn = document.getElementById('slskTextFilterToggleBtn');
        const slskTextFiltersCon = document.getElementById('slskTextFiltersCon');
        if (slskTextFilterToggleBtn && slskTextFiltersCon) {
            slskTextFilterToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isOpen = slskTextFiltersCon.classList.toggle('open');
                const hasText = Boolean((slskIncludeFilterInput?.value || '').trim() || (slskExcludeFilterInput?.value || '').trim());
                slskTextFilterToggleBtn.classList.toggle('active', isOpen || hasText);
            });
        }
        if (slskPanelToggleBar) {
            slskPanelToggleBar.addEventListener('click', (e) => {
                if (e.target.closest('#slskMobileTransfersBtn')) return;
                toggleMobileSearchPanel();
            });
        }
        if (slskMobileTransfersBtn) {
            slskMobileTransfersBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                soulseekController.toggleTransfersTab();
            });
        }
        if (slskResultsList) {
            slskResultsList.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    if (slskTextFiltersCon && slskTextFiltersCon.classList.contains('open')) {
                        slskTextFiltersCon.classList.remove('open');
                        const hasText = Boolean((slskIncludeFilterInput?.value || '').trim() || (slskExcludeFilterInput?.value || '').trim());
                        if (slskTextFilterToggleBtn) slskTextFilterToggleBtn.classList.toggle('active', hasText);
                    }
                }
            });
        }
        if (slskCloseDrawerBtn) {
            slskCloseDrawerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                soulseekController.setSubView('results');
            });
        }
        if (slskScanDownloadsBtn) {
            slskScanDownloadsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                soulseekController.syncAllDownloadsToLibrary();
            });
        }

        // Initialize status check & heartbeat
        soulseekController.checkStatus();
        soulseekController.startStatusPolling();


    }
    initSoulseekEventListeners();

    // Attach top-level P2P / Soulseek functions and controller to window
    if (typeof window !== "undefined") {
        try { window.fetchLanStreamingUrl = fetchLanStreamingUrl; } catch (_) {}
        try { window.lanUrlFetched = lanUrlFetched; } catch (_) {}
        try { window.setupDownloadWorkspace = setupDownloadWorkspace; } catch (_) {}
        try { window.setupPwaInstallPrompt = setupPwaInstallPrompt; } catch (_) {}
        try { window.soulseekController = soulseekController; } catch (_) {}
        try { window.initSoulseekEventListeners = initSoulseekEventListeners; } catch (_) {}
        try { window.triggerPwaInstallPrompt = triggerPwaInstallPrompt; } catch (_) {}
    }



    // --- Sub-Module: app.js ---
// CachyMusic - Application Orchestrator & Lifecycle Bootstrap







// Dynamic Tier 3 Module Loaders (Visualizer, Lyrics, P2P/Soulseek, Settings)
let visualizerPromise = null;
function getVisualizerModule() {
    if (!visualizerPromise) {
        visualizerPromise = import('./visualizer.js').then(mod => {
            if (typeof window !== 'undefined') {
                Object.assign(window, mod);
            }
            if (typeof mod.setupVisualizerMode === 'function') {
                mod.setupVisualizerMode();
            }
            if (typeof mod.setupCanvas === 'function') {
                mod.setupCanvas();
            }
            if (typeof mod.startVisualizerLoop === 'function') {
                mod.startVisualizerLoop();
            }
            return mod;
        }).catch(err => {
            console.warn('Failed to load visualizer.js', err);
            visualizerPromise = null;
        });
    }
    return visualizerPromise;
}

let lyricsPromise = null;
function getLyricsModule() {
    if (!lyricsPromise) {
        lyricsPromise = import('./lyrics.js').then(mod => {
            if (typeof window !== 'undefined') {
                Object.assign(window, mod);
            }
            return mod;
        }).catch(err => {
            console.warn('Failed to load lyrics.js', err);
            lyricsPromise = null;
        });
    }
    return lyricsPromise;
}

let p2pPromise = null;
function getP2pModule() {
    if (!p2pPromise) {
        p2pPromise = import('./p2p.js').then(mod => {
            if (typeof window !== 'undefined') {
                Object.assign(window, mod);
            }
            if (typeof mod.initSoulseekEventListeners === 'function') {
                mod.initSoulseekEventListeners();
            }
            return mod;
        }).catch(err => {
            console.warn('Failed to load p2p.js', err);
            p2pPromise = null;
        });
    }
    return p2pPromise;
}

let settingsPromise = null;
function getSettingsModule() {
    if (!settingsPromise) {
        settingsPromise = import('./settings.js').then(mod => {
            if (typeof window !== 'undefined') {
                Object.assign(window, mod);
            }
            return mod;
        }).catch(err => {
            console.warn('Failed to load settings.js', err);
            settingsPromise = null;
        });
    }
    return settingsPromise;
}

if (typeof window !== 'undefined') {
    window.getVisualizerModule = getVisualizerModule;
    window.getLyricsModule = getLyricsModule;
    window.getP2pModule = getP2pModule;
    window.getSettingsModule = getSettingsModule;
    window.toggleMetadataPanel = toggleMetadataPanel;
    window.toggleTracklistPanel = toggleTracklistPanel;

    window.setupVisualizerMode = function() {
        getVisualizerModule().then(m => m && m.setupVisualizerMode && m.setupVisualizerMode());
    };
    window.setVisualizerMode = function(mode) {
        getVisualizerModule().then(m => m && m.setVisualizerMode && m.setVisualizerMode(mode));
    };
    window.startVisualizerLoop = function() {
        getVisualizerModule().then(m => m && m.startVisualizerLoop && m.startVisualizerLoop());
    };
    window.setupCanvas = function() {
        getVisualizerModule().then(m => m && m.setupCanvas && m.setupCanvas());
    };
    window.toggleLyricsView = function(forcedState) {
        getLyricsModule().then(m => m && m.toggleLyricsView && m.toggleLyricsView(forcedState));
    };
    window.updateLyricsDisplay = function(track) {
        if (isLyricsView) {
            getLyricsModule().then(m => m && m.updateLyricsDisplay && m.updateLyricsDisplay(track));
        }
    };
    window.updateActiveLyric = function(time) {
        if (isLyricsView) {
            getLyricsModule().then(m => m && m.updateActiveLyric && m.updateActiveLyric(time));
        }
    };
    window.openSleepTimerModal = function() {
        getSettingsModule().then(m => m && m.openSleepTimerModal && m.openSleepTimerModal());
    };
    window.closeSleepTimerModal = function() {
        getSettingsModule().then(m => m && m.closeSleepTimerModal && m.closeSleepTimerModal());
    };
    window.openSignalPathModal = function() {
        getSettingsModule().then(m => m && m.openSignalPathModal && m.openSignalPathModal());
    };
    window.closeSignalPathModal = function() {
        getSettingsModule().then(m => m && m.closeSignalPathModal && m.closeSignalPathModal());
    };
    window.showThemeLoadingOverlay = function(name, sub) {
        getSettingsModule().then(m => m && m.showThemeLoadingOverlay && m.showThemeLoadingOverlay(name, sub));
    };
    window.updateDebugHudState = function() {
        getSettingsModule().then(m => m && m.updateDebugHudState && m.updateDebugHudState());
    };
    window.setupPwaInstallPrompt = function() {
        getP2pModule().then(m => m && m.setupPwaInstallPrompt && m.setupPwaInstallPrompt());
    };
    window.setupDownloadWorkspace = function() {
        getP2pModule().then(m => m && m.setupDownloadWorkspace && m.setupDownloadWorkspace());
    };
}

    // Toggle Collapsible / Sliding Metadata Inspector Panel
    function toggleMetadataPanel(forcedState) {
        if (window.innerWidth <= 768) {
            // Mobile View: toggle directly between playerDeck and settingsPanel (Metadata Inspector)
            const isInfoActive = (infoPanelEl && infoPanelEl.classList.contains('mobileActive')) || document.body.classList.contains('mobile-tab-info');
            if (isInfoActive) {
                switchWorkspace('player', 'playerDeck');
            } else {
                switchWorkspace('player', 'settingsPanel');
            }
            return;
        }

        const isCollapsed = document.body.classList.contains('metadata-collapsed');
        const willCollapse = (forcedState !== undefined) ? !forcedState : !isCollapsed;

        document.body.classList.toggle('metadata-collapsed', willCollapse);
        if (metadataToggleBtn) {
            metadataToggleBtn.classList.toggle('active', !willCollapse);
            metadataToggleBtn.setAttribute('aria-pressed', String(!willCollapse));
            metadataToggleBtn.setAttribute('title', willCollapse ? 'Expand Metadata Inspector (I)' : 'Collapse Metadata Inspector (I)');
        }

        try {
            safeStorage.setItem('cachymusic_metadata_visible', willCollapse ? 'false' : 'true');
        } catch (_) {}
    }


    // Toggle Collapsible / Sliding Tracklist Panel (Desktop Zen Stage)
    function toggleTracklistPanel(forcedState) {
        if (window.innerWidth <= 768) {
            const isTracksActive = (trackListPanelEl && trackListPanelEl.classList.contains('mobileActive')) || document.body.classList.contains('mobile-tab-tracks');
            if (isTracksActive) {
                switchWorkspace('player', 'playerDeck');
            } else {
                switchWorkspace('player', 'trackListPanel');
            }
            return;
        }

        const isCollapsed = document.body.classList.contains('tracklist-collapsed');
        const willCollapse = (forcedState !== undefined) ? !forcedState : !isCollapsed;

        document.body.classList.toggle('tracklist-collapsed', willCollapse);
        const tracklistToggleBtn = document.getElementById('tracklistToggleBtn');
        if (tracklistToggleBtn) {
            tracklistToggleBtn.classList.toggle('active', !willCollapse);
            tracklistToggleBtn.setAttribute('aria-pressed', String(!willCollapse));
            tracklistToggleBtn.setAttribute('title', willCollapse ? 'Expand Tracklist Panel (T)' : 'Collapse Tracklist Panel (T)');
        }

        try {
            safeStorage.setItem('cachymusic_tracklist_visible', willCollapse ? 'false' : 'true');
        } catch (_) {}
    }

    async function init() {
        if (isInitialized) return;
        isInitialized = true;

        setupEventListeners();
        getVisualizerModule();
        if (currentWorkspace === 'player') {
            const urlParams = new URLSearchParams(window.location.search);
            const initPanel = urlParams.get('panel') || 'playerDeck';
            if (window.innerWidth <= 768 || urlParams.get('panel')) {
                switchWorkspace('player', initPanel);
            }
        }
        setupDspControls();
        initPeqWorkstation();
        setupNeutronSettingsControls();
        checkHardwareGainStatus();
        setVolume(currentVolumeValue, true);
        await loadPlaylists();

        // Restore saved directory or cached library on startup
        const savedDir = (safeStorage.getItem('cachymusic_last_directory') || '').trim();
        const savedMode = (safeStorage.getItem('cachymusic_directory_mode') || '').trim();
        if (savedDir) {
            if (folderPathInput) folderPathInput.value = savedDir;
            const sInput = document.getElementById('settingsTabFolderPathInput');
            if (sInput) sInput.value = savedDir;
        }

        // 1. Check Android Native Bridge saved library first (on APK)
        if (window.AndroidBridge && typeof window.AndroidBridge.getSavedLibraryJson === 'function') {
            try {
                const rawJson = window.AndroidBridge.getSavedLibraryJson();
                if (rawJson) {
                    const parsed = JSON.parse(rawJson);
                    if (parsed && Array.isArray(parsed.tracks) && parsed.tracks.length > 0) {
                        allTracks = parsed.tracks;
                        const dirName = parsed.directory || savedDir || 'Music Folder';
                        if (folderPathInput) folderPathInput.value = dirName;
                        const sInput = document.getElementById('settingsTabFolderPathInput');
                        if (sInput) sInput.value = dirName;
                        try { safeStorage.setItem('cachymusic_last_directory', dirName); } catch (_) {}
                        applySearchAndSort();
                        setScanStatus(`Restored ${allTracks.length} tracks from "${dirName}".`, false);
                    }
                }
            } catch (err) {
                console.warn('AndroidBridge saved library restore error:', err);
            }
        }

        // 2. If not restored from AndroidBridge and not a pure browser-blob directory, try scanning saved server directory
        if (allTracks.length === 0 && savedMode !== 'browser_idb') {
            await scanDirectory(savedDir, false, true);
        }

        // 3. If still empty, check localStorage cached Android tracks
        if (allTracks.length === 0) {
            try {
                const cachedRaw = safeStorage.getItem('cachymusic_android_tracks');
                if (cachedRaw) {
                    const cached = JSON.parse(cachedRaw);
                    if (Array.isArray(cached) && cached.length > 0) {
                        allTracks = cached;
                        applySearchAndSort();
                        setScanStatus(`Restored ${cached.length} tracks from saved library.`, false);
                    }
                }
            } catch (err) {
                console.warn('Error restoring cached tracks:', err);
            }
        }

        // 4. If still empty, check IndexedDB saved library (browser folder picker / local files)
        if (allTracks.length === 0) {
            const idbLib = await loadLibraryFromIndexedDB();
            if (idbLib && Array.isArray(idbLib.tracks) && idbLib.tracks.length > 0) {
                allTracks = idbLib.tracks;
                if (idbLib.directory) {
                    if (folderPathInput) folderPathInput.value = idbLib.directory;
                    const sInput = document.getElementById('settingsTabFolderPathInput');
                    if (sInput) sInput.value = idbLib.directory;
                    try { safeStorage.setItem('cachymusic_last_directory', idbLib.directory); } catch (_) {}
                }
                applySearchAndSort();
                setScanStatus(`Restored ${allTracks.length} tracks from "${idbLib.directory || 'Saved Folder'}".`, false);
            }
        }

        updateEmptyPlayerState();
        await restoreSessionState();

        // Restore saved metadata panel state (persisted across sessions)
        try {
            const savedMetaVisible = safeStorage.getItem('cachymusic_metadata_visible');
            if (savedMetaVisible === 'false' && window.innerWidth > 768) {
                toggleMetadataPanel(false);
            }
        } catch (_) {}

        initMprisBridge();
    }


    // Setup All Event Handlers
    function setupEventListeners() {
        if (visPillBtns && visPillBtns.length > 0) {
            visPillBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    getVisualizerModule().then(m => m && m.setVisualizerMode && m.setVisualizerMode(btn.dataset.mode));
                });
            });
        }
        if (visModeBtns && visModeBtns.length > 0) {
            visModeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    getVisualizerModule().then(m => m && m.setVisualizerMode && m.setVisualizerMode(btn.dataset.mode));
                });
            });
        }
        if (visualizerDock) {
            visualizerDock.addEventListener('click', () => {
                getVisualizerModule();
            });
        }
        if (turntableCenterCanvas) {
            turntableCenterCanvas.addEventListener('click', () => {
                getVisualizerModule();
            });
        }

        if (metadataToggleBtn) {
            metadataToggleBtn.addEventListener('click', () => toggleMetadataPanel());
        }

        if (lyricsToggleBtn) {
            lyricsToggleBtn.addEventListener('click', () => toggleLyricsView());
        }

        const tracklistToggleBtn = document.getElementById('tracklistToggleBtn');
        if (tracklistToggleBtn) {
            tracklistToggleBtn.addEventListener('click', () => toggleTracklistPanel());
        }

        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => {
                togglePlayPause();
                playPauseBtn.blur();
            });
        }
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                prevTrack();
                prevBtn.blur();
            });
            ['touchend', 'pointerup'].forEach(evt => {
                prevBtn.addEventListener(evt, () => prevBtn.blur(), { passive: true });
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                nextTrack();
                nextBtn.blur();
            });
            ['touchend', 'pointerup'].forEach(evt => {
                nextBtn.addEventListener(evt, () => nextBtn.blur(), { passive: true });
            });
        }

        if (shuffleBtn) {
            shuffleBtn.addEventListener('click', () => {
                isShuffle = !isShuffle;
                shuffleBtn.classList.toggle('active', isShuffle);
                shuffleBtn.setAttribute('title', isShuffle ? 'Shuffle Active' : 'Toggle Shuffle');
                shuffleBtn.blur();
            });
        }

        if (shufflePlayBtn) {
            shufflePlayBtn.addEventListener('click', () => {
                isShuffle = true;
                if (shuffleBtn) {
                    shuffleBtn.classList.add('active');
                    shuffleBtn.setAttribute('title', 'Shuffle Active');
                }
                nextTrack();
                shufflePlayBtn.blur();
            });
        }

        if (repeatBtn) {
            repeatBtn.addEventListener('click', () => {
                if (repeatMode === 'all') {
                    repeatMode = 'one';
                } else if (repeatMode === 'one') {
                    repeatMode = 'off';
                } else {
                    repeatMode = 'all';
                }
                updateRepeatUI();
                repeatBtn.blur();
            });
        }

        // Continuous Native Media Event Synchronization
        attachAudioListeners(audio);

        const ensureContextRunning = () => {
            if (!audioContext || audioContext.state === 'closed') {
                initAudioContext();
            } else if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
        };
        ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evt => {
            window.addEventListener(evt, ensureContextRunning, { passive: true });
        });

        // Remember playback position of currently playing track when window closes / navigates away
        function persistCurrentPlaybackTimeOnExit() {
            if (!audio) return;
            try {
                const cur = audio.currentTime;
                const dur = audio.duration;
                if (cur > 0 && (!dur || isNaN(dur) || cur < (dur - 1))) {
                    safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2));
                } else {
                    safeStorage.removeItem('cachymusic_last_track_time');
                }
            } catch (_) {}
        }
        window.addEventListener('beforeunload', persistCurrentPlaybackTimeOnExit);
        window.addEventListener('pagehide', persistCurrentPlaybackTimeOnExit);

        // MediaSession API Integration (Explicit OS & Browser Media Control Integration)
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.setActionHandler('play', () => {
                    if (isPlaying && !audio.paused) return; // Prevent echo loop
                    userExplicitlyPaused = false;
                    playAudio(true);
                });
                navigator.mediaSession.setActionHandler('pause', () => {
                    if (!isPlaying && audio.paused) return; // Prevent echo loop
                    userExplicitlyPaused = true;
                    pauseAudio();
                });
                navigator.mediaSession.setActionHandler('stop', () => {
                    if (!isPlaying && audio.paused) return; // Prevent echo loop
                    userExplicitlyPaused = true;
                    pauseAudio();
                });
                navigator.mediaSession.setActionHandler('previoustrack', () => {
                    userExplicitlyPaused = false;
                    prevTrack();
                });
                navigator.mediaSession.setActionHandler('nexttrack', () => {
                    userExplicitlyPaused = false;
                    nextTrack();
                });
                navigator.mediaSession.setActionHandler('seekto', (details) => {
                    if (details.seekTime !== undefined && !isNaN(details.seekTime)) {
                        audio.currentTime = details.seekTime;
                    }
                });
                navigator.mediaSession.setActionHandler('seekforward', (details) => {
                    const skip = details.seekOffset || 10;
                    if (audio.duration && !isNaN(audio.duration)) {
                        audio.currentTime = Math.min(audio.duration, audio.currentTime + skip);
                    }
                });
                navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                    const skip = details.seekOffset || 10;
                    audio.currentTime = Math.max(0, audio.currentTime - skip);
                });
            } catch (err) {
                console.warn('MediaSession handler registration:', err);
            }
        }

        // Keep OS media session locked as paused when tab is hidden while paused
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && (userExplicitlyPaused || audio.paused)) {
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'paused';
                }
            }
        });

        // Initial Repeat UI sync
        updateRepeatUI();



        // Scrubber Dragging & Seeking (Mouse & Touch) - Defer audio.currentTime to mouseup/touchend
        let pendingSeekPct = null;

        function getClientX(e) {
            if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
            if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
            return e.clientX;
        }

        function updateScrubberVisual(e) {
            const rect = progressCon.getBoundingClientRect();
            if (!rect || rect.width <= 0) return;
            const clientX = getClientX(e);
            if (typeof clientX !== 'number' || isNaN(clientX) || !isFinite(clientX)) return;
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            if (isNaN(pct) || !isFinite(pct)) return;
            pendingSeekPct = pct;
            progressBar.style.width = `${pct * 100}%`;
            const dur = (isSoftwareDecoding && activeDecodedBuffer)
                ? activeDecodedBuffer.duration
                : (audio.duration || ((allTracks[currentTrackIndex] && allTracks[currentTrackIndex].duration) || 0));
            if (dur && !isNaN(dur) && isFinite(dur)) {
                currentTimeEl.textContent = formatTime(pct * dur);
            }
        }

        function commitSeek() {
            if (pendingSeekPct !== null && typeof pendingSeekPct === 'number' && !isNaN(pendingSeekPct) && isFinite(pendingSeekPct)) {
                if (isSoftwareDecoding) {
                    const totalDur = activeDecodedBuffer ? activeDecodedBuffer.duration : ((allTracks[currentTrackIndex] && allTracks[currentTrackIndex].duration) || 0);
                    if (totalDur > 0) {
                        const targetSec = Math.max(0, Math.min(totalDur, pendingSeekPct * totalDur));
                        seekSoftwarePlayback(targetSec);
                    }
                } else if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
                    const targetSec = Math.max(0, Math.min(audio.duration, pendingSeekPct * audio.duration));
                    if (!isNaN(targetSec) && isFinite(targetSec)) {
                        audio.currentTime = targetSec;
                        try {
                            const cur = audio.currentTime;
                            const dur = audio.duration;
                            if (cur > 0 && cur < dur - 1) {
                                safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2));
                            }
                        } catch (_) {}
                    }
                }
            }
            pendingSeekPct = null;
            isDraggingScrubber = false;
        }

        const progressHoverTooltip = document.getElementById('progressHoverTooltip');

        progressCon.addEventListener('mousedown', (e) => {
            isDraggingScrubber = true;
            progressCon.classList.add('dragging');
            updateScrubberVisual(e);
        });

        window.addEventListener('mousemove', (e) => {
            if (isDraggingScrubber) {
                updateScrubberVisual(e);
            }
        });

        window.addEventListener('mouseup', () => {
            if (isDraggingScrubber) {
                commitSeek();
                progressCon.classList.remove('dragging');
            }
        });

        progressCon.addEventListener('touchstart', (e) => {
            isDraggingScrubber = true;
            progressCon.classList.add('dragging');
            updateScrubberVisual(e);
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (isDraggingScrubber) {
                updateScrubberVisual(e);
            }
        }, { passive: true });

        window.addEventListener('touchend', () => {
            if (isDraggingScrubber) {
                commitSeek();
                progressCon.classList.remove('dragging');
            }
        });

        window.addEventListener('touchcancel', () => {
            if (isDraggingScrubber) {
                pendingSeekPct = null;
                isDraggingScrubber = false;
                progressCon.classList.remove('dragging');
            }
        });

        let cachedProgressRect = null;
        let isHoverPending = false;
        progressCon.addEventListener('mouseenter', () => {
            cachedProgressRect = progressCon.getBoundingClientRect();
        });
        progressCon.addEventListener('mousemove', (e) => {
            if (isHoverPending) return;
            isHoverPending = true;
            const clientX = getClientX(e);
            requestAnimationFrame(() => {
                isHoverPending = false;
                if (!cachedProgressRect) cachedProgressRect = progressCon.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (clientX - cachedProgressRect.left) / cachedProgressRect.width));
                progressHover.style.width = `${pct * 100}%`;
                if (progressHoverTooltip) {
                    const totalDur = (audio.duration && !isNaN(audio.duration) && audio.duration > 0)
                        ? audio.duration
                        : ((allTracks[currentTrackIndex] && allTracks[currentTrackIndex].duration) || 0);
                    if (totalDur > 0) {
                        progressHoverTooltip.textContent = formatTime(pct * totalDur);
                        progressHoverTooltip.style.left = `${pct * 100}%`;
                        progressHoverTooltip.style.opacity = '1';
                    }
                }
            });
        }, { passive: true });

        progressCon.addEventListener('mouseleave', () => {
            cachedProgressRect = null;
            isHoverPending = false;
            progressHover.style.width = '0%';
            if (progressHoverTooltip) {
                progressHoverTooltip.style.opacity = '0';
            }
        });

        // Mobile Viewport Navigation Switcher (Instant 0ms Pointerdown Fast-Path)
        const mobileTabBtns = document.querySelectorAll('.mobileTabBtn');
        mobileTabBtns.forEach(btn => {
            bindFastAction(btn, () => {
                const target = btn.dataset.target;
                if (target === 'soulseekWorkspace') {
                    switchWorkspace('soulseek');
                } else if (target === 'downloadWorkspace') {
                    switchWorkspace('download');
                } else if (target === 'settingsWorkspace') {
                    switchWorkspace('settings');
                } else {
                    switchWorkspace('player', target);
                }
            });
        });

        // Viewport Resize Synchronizer: Smooth transition between Desktop 3-column & Mobile 1-panel mode
        let lastInnerWidth = window.innerWidth;
        window.addEventListener('resize', () => {
            const currentW = window.innerWidth;
            if ((lastInnerWidth <= 768 && currentW > 768) || (lastInnerWidth > 768 && currentW <= 768)) {
                if (currentWorkspace === 'player') {
                    if (currentW <= 768) {
                        const activeMobile = document.querySelector('.panel.mobileActive');
                        const target = activeMobile ? (activeMobile.classList.contains('trackListPanel') ? 'trackListPanel' : activeMobile.classList.contains('settingsPanel') ? 'settingsPanel' : 'playerDeck') : 'playerDeck';
                        switchWorkspace('player', target);
                    } else {
                        switchWorkspace('player');
                    }
                }
            }
            lastInnerWidth = currentW;
        }, { passive: true });

        // Volume Deck & Scroll Control
        const volumeDeck = document.querySelector('.volumeDeck');

        function handleVolumeWheel(e) {
            e.preventDefault();
            // Determine scroll direction (supports vertical wheel & horizontal scroll / trackpad)
            const delta = e.deltaY !== 0 ? -e.deltaY : e.deltaX;
            if (delta === 0) return;

            // 5% step normally, 1% fine step if Shift key is held
            const step = (e.shiftKey ? 0.01 : 0.05) * (delta > 0 ? 1 : -1);
            let targetVol = Math.round((currentVolumeValue + step) * 100) / 100;
            targetVol = Math.max(0, Math.min(1.5, targetVol));

            setVolume(targetVol, true);
        }

        if (volumeDeck) {
            volumeDeck.addEventListener('wheel', handleVolumeWheel, { passive: false });
        } else if (volumeSlider) {
            volumeSlider.addEventListener('wheel', handleVolumeWheel, { passive: false });
        }

        volumeSlider.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            setVolume(vol, false);
        });

        muteBtn.addEventListener('click', () => {
            audio.muted = !audio.muted;
            if (audio.muted) {
                volumeLevel.textContent = '0%';
                updateVolumeIcon(0);
                if (isHardwareGain) {
                    dispatchHardwareVolume(0);
                }
            } else {
                setVolume(currentVolumeValue, true);
            }
        });

        // Search Input (Debounced 80ms for fluid typing without layout stutter)
        let searchDebounceTimer = null;
        trackSearch.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                applySearchAndSort();
            }, 80);
        });

        // Sort Select
        if (sortSelect) {
            sortSelect.value = currentSort;
            sortSelect.addEventListener('change', (e) => {
                currentSort = e.target.value;
                try {
                    safeStorage.setItem('cachymusic_track_sort', currentSort);
                } catch (_) {}
                applySearchAndSort();
            });
        }

        // Main Tracks Refresh Button
        if (refreshTracksBtn) {
            refreshTracksBtn.addEventListener('click', async () => {
                refreshTracksBtn.textContent = 'REFRESHING...';
                refreshTracksBtn.disabled = true;
                dismissedTracksMap.clear();
                updateRestoreBtnUi();
                const path = (folderPathInput && folderPathInput.value.trim()) 
                    ? folderPathInput.value.trim() 
                    : (safeStorage.getItem('cachymusic_last_directory') || '');
                await scanDirectory(path);
                refreshTracksBtn.textContent = 'REFRESHED';
                setTimeout(() => {
                    refreshTracksBtn.textContent = 'REFRESH';
                    refreshTracksBtn.disabled = false;
                }, 1200);
            });
        }

        // Restore Removed Main Tracks
        if (restoreTracksBtn) {
            restoreTracksBtn.addEventListener('click', () => {
                const count = dismissedTracksMap.size;
                if (count === 0) return;
                for (const [key, item] of dismissedTracksMap.entries()) {
                    const alreadyExists = allTracks.some(t => (item.track.tid && t.tid == item.track.tid) || (item.track.fullPath && t.fullPath === item.track.fullPath) || (t.id == item.track.id));
                    if (!alreadyExists) {
                        const insertIdx = Math.min(item.originalIndex ?? allTracks.length, allTracks.length);
                        allTracks.splice(insertIdx, 0, item.track);
                    }
                }
                dismissedTracksMap.clear();
                applySearchAndSort();
                updateRestoreBtnUi();
                showToast(`Restored ${count} track${count === 1 ? '' : 's'} to list.`);
            });
        }

        // Quick New Playlist Shortcut from Library Toolbar
        if (quickNewPlaylistBtn) {
            quickNewPlaylistBtn.addEventListener('click', () => {
                tabPlaylists.click();
                setTimeout(() => {
                    if (newPlaylistInput) {
                        newPlaylistInput.focus();
                        newPlaylistInput.select();
                    }
                }, 100);
            });
        }


        // Library vs Playlists vs Up Next Queue Tabs
        const quickFormatFilterBarEl = document.getElementById('quickFormatFilterBar');
        const libraryToolsToggleBtnEl = document.getElementById('libraryToolsToggleBtn');
        const libraryToolsChevronEl = document.getElementById('libraryToolsChevron');

        if (libraryToolsToggleBtnEl && libraryControls) {
            libraryToolsToggleBtnEl.addEventListener('click', () => {
                const isCollapsed = libraryControls.classList.toggle('mobileCollapsed');
                libraryToolsToggleBtnEl.classList.toggle('active', !isCollapsed);
                libraryToolsToggleBtnEl.setAttribute('aria-expanded', String(!isCollapsed));
                if (libraryToolsChevronEl) {
                    libraryToolsChevronEl.textContent = isCollapsed ? '▾' : '▴';
                }
            });
        }

        tabLibrary.addEventListener('click', () => {
            tabLibrary.classList.add('active');
            tabPlaylists.classList.remove('active');
            if (tabQueue) tabQueue.classList.remove('active');
            trackList.style.display = 'flex';
            playlistsView.style.display = 'none';
            if (queueView) queueView.style.display = 'none';
            if (quickFormatFilterBarEl) quickFormatFilterBarEl.style.display = 'flex';
            if (currentPlaylistId) {
                playlistBanner.style.display = 'flex';
                libraryControls.style.display = 'none';
                if (libraryToolsToggleBtnEl) libraryToolsToggleBtnEl.style.display = 'none';
            } else {
                playlistBanner.style.display = 'none';
                libraryControls.style.display = 'flex';
                if (libraryToolsToggleBtnEl) libraryToolsToggleBtnEl.style.display = '';
            }
        });

        tabPlaylists.addEventListener('click', () => {
            tabPlaylists.classList.add('active');
            tabLibrary.classList.remove('active');
            if (tabQueue) tabQueue.classList.remove('active');
            trackList.style.display = 'none';
            libraryControls.style.display = 'none';
            if (quickFormatFilterBarEl) quickFormatFilterBarEl.style.display = 'none';
            playlistBanner.style.display = 'none';
            if (queueView) queueView.style.display = 'none';
            playlistsView.style.display = 'flex';
            renderPlaylistsView();
        });

        if (tabQueue) {
            tabQueue.addEventListener('click', () => {
                tabQueue.classList.add('active');
                tabLibrary.classList.remove('active');
                tabPlaylists.classList.remove('active');
                trackList.style.display = 'none';
                libraryControls.style.display = 'none';
                if (quickFormatFilterBarEl) quickFormatFilterBarEl.style.display = 'none';
                playlistBanner.style.display = 'none';
                playlistsView.style.display = 'none';
                if (queueView) queueView.style.display = 'flex';
                renderQueueView();
            });
        }

        // Quick Quality Format Filter Bar (ALL, HI-RES, LOSSLESS, MP3/AAC)
        const formatPillBtns = document.querySelectorAll('.formatFilterPill');
        formatPillBtns.forEach(pill => {
            pill.addEventListener('click', () => {
                formatPillBtns.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                currentFormatFilter = pill.dataset.filter || 'all';
                applySearchAndSort();
            });
        });

        // Queue Controls & Item Action Delegation
        if (clearQueueBtn) {
            clearQueueBtn.addEventListener('click', clearQueue);
        }

        if (queueView) {
            queueView.addEventListener('click', (e) => {
                const moveUpBtn = e.target.closest('.moveUpBtn');
                if (moveUpBtn) {
                    const idx = parseInt(moveUpBtn.dataset.idx, 10);
                    moveQueueItem(idx, idx - 1);
                    return;
                }
                const moveDownBtn = e.target.closest('.moveDownBtn');
                if (moveDownBtn) {
                    const idx = parseInt(moveDownBtn.dataset.idx, 10);
                    moveQueueItem(idx, idx + 1);
                    return;
                }
                const playNowBtn = e.target.closest('.queuePlayNowBtn');
                if (playNowBtn) {
                    const idx = parseInt(playNowBtn.dataset.idx, 10);
                    if (idx >= 0 && idx < playQueue.length) {
                        const track = playQueue.splice(idx, 1)[0];
                        updateQueueUi();
                        const masterIdx = allTracks.findIndex(t =>
                            (track.id && t.id === track.id) ||
                            (track.tid && t.tid === track.tid) ||
                            t.filename === track.filename
                        );
                        if (masterIdx !== -1) {
                            loadTrack(masterIdx, true);
                        }
                    }
                    return;
                }
                const removeBtn = e.target.closest('.queueRemoveBtn');
                if (removeBtn) {
                    const idx = parseInt(removeBtn.dataset.idx, 10);
                    removeFromQueue(idx);
                    return;
                }
                const enqueueUpcomingBtn = e.target.closest('.enqueueUpcomingBtn');
                if (enqueueUpcomingBtn) {
                    const id = enqueueUpcomingBtn.dataset.id;
                    const track = allTracks.find(t => (t.id && t.id == id) || (t.tid && t.tid == id) || t.filename == id);
                    if (track) addToQueue(track, false);
                    return;
                }
            });
        }

        // Sleep Timer Modal & Triggers
        if (sleepTimerBtn) {
            sleepTimerBtn.addEventListener('click', openSleepTimerModal);
        }
        if (closeSleepTimerModalBtn) {
            closeSleepTimerModalBtn.addEventListener('click', closeSleepTimerModal);
        }
        if (sleepTimerModal) {
            sleepTimerModal.addEventListener('click', (e) => {
                if (e.target === sleepTimerModal) closeSleepTimerModal();
            });
        }
        const sleepOptBtns = document.querySelectorAll('.sleepOptBtn');
        sleepOptBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mins = btn.dataset.minutes;
                setSleepTimer(mins);
            });
        });
        if (setCustomSleepBtn && customSleepInput) {
            setCustomSleepBtn.addEventListener('click', () => {
                const val = parseInt(customSleepInput.value, 10);
                if (!isNaN(val) && val > 0) {
                    setSleepTimer(val);
                    customSleepInput.value = '';
                } else {
                    showToast('Please enter valid minutes (e.g., 20)');
                }
            });
            customSleepInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    setCustomSleepBtn.click();
                }
            });
        }
        if (cancelSleepTimerBtn) {
            cancelSleepTimerBtn.addEventListener('click', () => cancelSleepTimer(true));
        }

        // Signal Path Inspector Modal & Triggers
        if (signalPathBadgeBtn) {
            signalPathBadgeBtn.addEventListener('click', openSignalPathModal);
        }
        if (openSignalAuditBtn) {
            openSignalAuditBtn.addEventListener('click', openSignalPathModal);
        }
        if (closeSignalPathModalBtn) {
            closeSignalPathModalBtn.addEventListener('click', closeSignalPathModal);
        }
        if (signalPathModal) {
            signalPathModal.addEventListener('click', (e) => {
                if (e.target === signalPathModal) closeSignalPathModal();
            });
            const initUrlParams = new URLSearchParams(window.location.search);
            if (initUrlParams.get('modal') === 'signal' || window.location.hash === '#signal') {
                openSignalPathModal();
            }
            if (initUrlParams.get('modal') === 'theme' || window.location.hash === '#theme') {
                openThemeModal();
            }
            if (initUrlParams.get('tab') === 'playlists' || window.location.hash === '#playlists') {
                if (tabPlaylists) tabPlaylists.click();
            }
            if (initUrlParams.get('tab') === 'settings' || initUrlParams.get('view') === 'settings' || window.location.hash === '#settings') {
                switchWorkspace('settings');
            }
            if (initUrlParams.get('tab') === 'soulseek' || initUrlParams.get('view') === 'soulseek' || window.location.hash === '#soulseek') {
                switchWorkspace('soulseek');
            }
            if (initUrlParams.get('tab') === 'download' || initUrlParams.get('view') === 'download' || window.location.hash === '#download') {
                switchWorkspace('download');
            }
        }

        if (backToLibraryBtn) {
            backToLibraryBtn.addEventListener('click', backToPlaylistsView);
        }

        const bannerPlayAllBtn = document.getElementById('bannerPlayAllBtn');
        if (bannerPlayAllBtn) {
            bannerPlayAllBtn.addEventListener('click', () => {
                if (currentPlaylistId) {
                    playPlaylistDirectly(currentPlaylistId, currentPlaylistName, false);
                }
            });
        }

        const bannerShuffleBtn = document.getElementById('bannerShuffleBtn');
        if (bannerShuffleBtn) {
            bannerShuffleBtn.addEventListener('click', () => {
                if (currentPlaylistId) {
                    playPlaylistDirectly(currentPlaylistId, currentPlaylistName, true);
                }
            });
        }

        if (bannerAddTracksBtn) {
            bannerAddTracksBtn.addEventListener('click', openBatchAddModal);
        }

        const closeBatchAddModalBtn = document.getElementById('closeBatchAddModalBtn');
        if (closeBatchAddModalBtn) {
            closeBatchAddModalBtn.addEventListener('click', closeBatchAddModal);
        }

        const doneBatchAddBtn = document.getElementById('doneBatchAddBtn');
        if (doneBatchAddBtn) {
            doneBatchAddBtn.addEventListener('click', closeBatchAddModal);
        }

        const batchAddSongsModal = document.getElementById('batchAddSongsModal');
        if (batchAddSongsModal) {
            batchAddSongsModal.addEventListener('click', (e) => {
                if (e.target === batchAddSongsModal) closeBatchAddModal();
            });
        }

        // Playlist Quick Presets Chips
        document.querySelectorAll('.playlistChipBtn').forEach(chip => {
            chip.addEventListener('click', () => {
                const input = document.getElementById('newPlaylistInput');
                if (input) {
                    input.value = chip.dataset.name;
                    input.focus();
                }
            });
        });

        // Top Navigation Bar & Dedicated Settings Workspace Triggers
        const topSettingsBtn = document.getElementById('topSettingsBtn');
        if (topSettingsBtn) {
            bindFastAction(topSettingsBtn, () => {
                switchWorkspace(currentWorkspace === 'settings' ? 'player' : 'settings');
            });
        }

        const wsSettingsBtn = document.getElementById('wsSettingsBtn');
        if (wsSettingsBtn) {
            bindFastAction(wsSettingsBtn, () => {
                switchWorkspace('settings');
            });
        }

        const settingsReturnBtn = document.getElementById('settingsReturnBtn');
        if (settingsReturnBtn) {
            bindFastAction(settingsReturnBtn, () => {
                switchWorkspace('player');
            });
        }

        // Dedicated Settings Workspace Actions:
        // 1. Theme Overhaul Modal Trigger
        const settingsTabOpenThemeModalBtn = document.getElementById('settingsTabOpenThemeModalBtn');
        if (settingsTabOpenThemeModalBtn) {
            settingsTabOpenThemeModalBtn.addEventListener('click', openThemeModal);
        }
        const settingsThemeBtn = document.getElementById('settingsThemeBtn');
        if (settingsThemeBtn) {
            settingsThemeBtn.addEventListener('click', openThemeModal);
        }

        // 2. Folder Scanner inside Settings
        const settingsTabFolderPathInput = document.getElementById('settingsTabFolderPathInput');
        const settingsTabBrowseBtn = document.getElementById('settingsTabBrowseBtn');
        const settingsTabScanBtn = document.getElementById('settingsTabScanBtn');

        if (settingsTabFolderPathInput) {
            settingsTabFolderPathInput.addEventListener('input', (e) => {
                if (folderPathInput) folderPathInput.value = e.target.value;
            });
            settingsTabFolderPathInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const p = settingsTabFolderPathInput.value.trim() || (safeStorage.getItem('cachymusic_last_directory') || '');
                    scanDirectory(p, true);
                }
            });
        }
        if (folderPathInput) {
            folderPathInput.addEventListener('input', (e) => {
                if (settingsTabFolderPathInput) settingsTabFolderPathInput.value = e.target.value;
            });
        }
        if (settingsTabBrowseBtn) {
            settingsTabBrowseBtn.addEventListener('click', openFolderBrowser);
        }
        if (settingsTabScanBtn) {
            settingsTabScanBtn.addEventListener('click', () => {
                const path = (settingsTabFolderPathInput ? settingsTabFolderPathInput.value.trim() : '') || (folderPathInput ? folderPathInput.value.trim() : '') || (safeStorage.getItem('cachymusic_last_directory') || '');
                scanDirectory(path, true);
            });
        }

        // 3. DSP & Audiophile Signal Audit
        const settingsTabOpenSignalAuditBtn = document.getElementById('settingsTabOpenSignalAuditBtn');
        if (settingsTabOpenSignalAuditBtn) {
            settingsTabOpenSignalAuditBtn.addEventListener('click', openSignalPathModal);
        }
        const settingsSignalAuditBtn = document.getElementById('settingsSignalAuditBtn');
        if (settingsSignalAuditBtn) {
            settingsSignalAuditBtn.addEventListener('click', openSignalPathModal);
        }

        // 4. Sleep Timer inside Settings
        document.querySelectorAll('.settingsSleepPresetBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mins = btn.dataset.mins;
                setSleepTimer(mins);
            });
        });
        const settingsTabCancelSleepBtn = document.getElementById('settingsTabCancelSleepBtn');
        if (settingsTabCancelSleepBtn) {
            settingsTabCancelSleepBtn.addEventListener('click', () => cancelSleepTimer(true));
        }
        const settingsTabOpenSleepModalBtn = document.getElementById('settingsTabOpenSleepModalBtn');
        if (settingsTabOpenSleepModalBtn) {
            settingsTabOpenSleepModalBtn.addEventListener('click', openSleepTimerModal);
        }
        const settingsSleepTimerBtn = document.getElementById('settingsSleepTimerBtn');
        if (settingsSleepTimerBtn) {
            settingsSleepTimerBtn.addEventListener('click', openSleepTimerModal);
        }

        // 5. Cross-Platform App & Downloads inside Settings
        const settingsTabOpenDownloadHubBtn = document.getElementById('settingsTabOpenDownloadHubBtn');
        if (settingsTabOpenDownloadHubBtn) {
            settingsTabOpenDownloadHubBtn.addEventListener('click', () => {
                switchWorkspace('download');
            });
        }
        const settingsDownloadBtn = document.getElementById('settingsDownloadBtn');
        if (settingsDownloadBtn) {
            settingsDownloadBtn.addEventListener('click', () => {
                switchWorkspace('download');
            });
        }
        const settingsTabPwaInstallBtn = document.getElementById('settingsTabPwaInstallBtn');
        if (settingsTabPwaInstallBtn) {
            settingsTabPwaInstallBtn.addEventListener('click', () => {
                if (deferredInstallPrompt) {
                    deferredInstallPrompt.prompt();
                    deferredInstallPrompt.userChoice.then(() => { deferredInstallPrompt = null; });
                } else {
                    switchWorkspace('download');
                }
            });
        }

        // Theme Modal: All 3 categories are displayed side-by-side in multi-column layout

        deleteCurrentPlaylistBtn.addEventListener('click', async () => {
            if (!currentPlaylistId) return;
            if (!confirm(`Delete playlist "${currentPlaylistName}"?`)) return;

            try {
                const res = await fetch('php/api/playlists.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'delete', plid: currentPlaylistId })
                });
                const data = await res.json();
                if (data.success) {
                    playlists = playlists.filter(p => p.plid != currentPlaylistId);
                    backToPlaylistsView();
                    renderPlaylistsView();
                }
            } catch (e) {
                console.warn('Delete playlist API error:', e);
            }
        });

        // Folder Scan Tray Toggle
        if (toggleFolderBtn) {
            toggleFolderBtn.addEventListener('click', () => {
                folderTray.style.display = folderTray.style.display === 'flex' ? 'none' : 'flex';
            });
        }

        if (closeFolderTrayBtn) {
            closeFolderTrayBtn.addEventListener('click', () => {
                folderTray.style.display = 'none';
            });
        }

        if (scanFolderBtn) {
            scanFolderBtn.addEventListener('click', () => {
                const path = (folderPathInput ? folderPathInput.value.trim() : '') || (safeStorage.getItem('cachymusic_last_directory') || '');
                scanDirectory(path, true);
            });
        }

        if (folderPathInput) {
            folderPathInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (scanFolderBtn) scanFolderBtn.click();
                }
            });
        }

        // Blocking Track Loading Overlay Cancel Button & Empty Player Prompt Actions
        const cancelTrackLoadingBtnEl = document.getElementById('cancelTrackLoadingBtn');
        if (cancelTrackLoadingBtnEl) {
            cancelTrackLoadingBtnEl.addEventListener('click', cancelActiveTrackLoading);
        }

        const playerChooseDirBtn = document.getElementById('playerChooseDirBtn');
        if (playerChooseDirBtn) {
            playerChooseDirBtn.addEventListener('click', openFolderBrowser);
        }

        const playerOpenDirSettingsBtn = document.getElementById('playerOpenDirSettingsBtn');
        if (playerOpenDirSettingsBtn) {
            playerOpenDirSettingsBtn.addEventListener('click', () => {
                switchWorkspace('settings');
                const libCatBtn = document.querySelector('#settingsCategoryNav .settingsCatBtn[data-cat="library"]');
                if (libCatBtn) libCatBtn.click();
                setTimeout(() => {
                    const sInput = document.getElementById('settingsTabFolderPathInput');
                    if (sInput) sInput.focus();
                }, 80);
            });
        }

        // Native Android Bridge progress, cancellation & discovery receivers
        window.onAndroidScanProgress = function(count, total, folderName, etaSec) {
            if (isTrackLoadingCancelled) return;
            const pct = total > 0 ? Math.min(98, Math.round((count / total) * 100)) : 50;
            const etaText = (typeof etaSec === 'number' && etaSec > 0)
                ? ` • ETA: ~${etaSec}s`
                : (count > 0 && total > 0 && count < total ? ' • Fast index in progress...' : '');
            showTrackLoadingOverlay(
                'LOADING MUSIC LIBRARY...',
                `Scanning "${folderName || 'Device Storage'}" — ${count}${total > 0 ? ' / ' + total : ''} tracks indexed${etaText}`,
                pct
            );
        };

        window.onAndroidScanCancelled = function() {
            hideTrackLoadingOverlay();
            setScanStatus('Directory scan cancelled.', false);
            updateEmptyPlayerState();
        };

        window.onAndroidTracksDiscovered = function(tracks, folderName) {
            hideTrackLoadingOverlay();
            if (isTrackLoadingCancelled) return;

            if (!Array.isArray(tracks) || tracks.length === 0) {
                const errStr = `No supported audio tracks found in "${folderName || 'Selected Folder'}".`;
                setScanStatus(`${errStr} Please configure your directory manually in Settings → Library & Folders.`, true);
                updateEmptyPlayerState(errStr);
                return;
            }

            setScanStatus(`Loaded ${tracks.length} track(s) from "${folderName}".`, false);
            if (folderPathInput) folderPathInput.value = folderName;
            const sInput = document.getElementById('settingsTabFolderPathInput');
            if (sInput) sInput.value = folderName;

            allTracks = tracks;
            try {
                const cacheData = tracks.map(t => ({
                    id: t.id,
                    filename: t.filename,
                    fullPath: t.fullPath,
                    title: t.title,
                    artist: t.artist,
                    album: t.album,
                    duration: t.duration,
                    bitrate: t.bitrate,
                    sampleRate: t.sampleRate,
                    channels: t.channels || 2,
                    format: t.format,
                    size: t.size,
                    src: t.src,
                    cover: t.cover
                }));
                safeStorage.setItem('cachymusic_last_directory', folderName);
                safeStorage.setItem('cachymusic_directory_mode', 'android');
                safeStorage.setItem('cachymusic_android_tracks', JSON.stringify(cacheData));
            } catch (e) {
                console.warn('Could not cache tracks to localStorage, using IndexedDB:', e);
            }
            saveLibraryToIndexedDB(tracks, folderName);

            updateEmptyPlayerState();
            applySearchAndSort();
            if (allTracks.length > 0 && !isPlaying) {
                loadTrack(0, false);
            }
        };

        // Folder Browse Action (Native Android SAF -> Native OS Dialog -> Web Folder Picker Fallback)
        async function openFolderBrowser() {
            if (window.AndroidBridge && typeof window.AndroidBridge.openFolderPicker === 'function') {
                setScanStatus('Opening system folder directory picker...', false);
                try {
                    window.AndroidBridge.openFolderPicker();
                    return;
                } catch (err) {
                    console.warn('AndroidBridge.openFolderPicker error:', err);
                }
            }

            setScanStatus('Opening folder selection dialog...', false);
            const curPath = (folderPathInput ? folderPathInput.value.trim() : '') || (safeStorage.getItem('cachymusic_last_directory') || '');

            try {
                const res = await fetch('php/api/browse_folder.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initialDir: curPath })
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.directory) {
                        if (folderPathInput) folderPathInput.value = data.directory;
                        const sInput = document.getElementById('settingsTabFolderPathInput');
                        if (sInput) sInput.value = data.directory;
                        setScanStatus(`Selected directory: ${data.directory}. Scanning library...`, false);
                        await scanDirectory(data.directory, true);
                        return;
                    } else if (data.cancelled) {
                        setScanStatus('Folder selection cancelled.', false);
                        return;
                    }
                }
            } catch (err) {
                console.warn('Native folder chooser error:', err);
            }

            // Fallback: trigger HTML5 directory picker input
            if (folderPickerInput) {
                setScanStatus('Select folder in directory picker...', false);
                folderPickerInput.click();
            }
        }

        if (browseFolderBtn) {
            browseFolderBtn.addEventListener('click', openFolderBrowser);
        }

        const mobileScanFolderBtn = document.getElementById('mobileScanFolderBtn');
        if (mobileScanFolderBtn) {
            mobileScanFolderBtn.addEventListener('click', openFolderBrowser);
        }

        const settingsChooseFolderBtn = document.getElementById('settingsChooseFolderBtn');
        if (settingsChooseFolderBtn) {
            settingsChooseFolderBtn.addEventListener('click', openFolderBrowser);
        }

        const settingsScanDeviceMusicBtn = document.getElementById('settingsScanDeviceMusicBtn');
        if (settingsScanDeviceMusicBtn) {
            settingsScanDeviceMusicBtn.addEventListener('click', () => {
                if (window.AndroidBridge && typeof window.AndroidBridge.scanDeviceMusic === 'function') {
                    setScanStatus('Scanning device music library...', false);
                    showTrackLoadingOverlay('SCANNING DEVICE MUSIC...', 'Searching audio files across device storage...', 15);
                    window.AndroidBridge.scanDeviceMusic();
                } else {
                    setScanStatus('Native device scanner available on Android APK. Please choose a folder or configure path manually.', true);
                }
            });
        }

        if (folderPickerInput) {
            folderPickerInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;

                const firstRel = files[0].webkitRelativePath || '';
                const folderName = firstRel ? firstRel.split('/')[0] : 'Selected Folder';
                
                const audioFiles = files.filter(f => /\.(mp3|flac|wav|ogg|m4a|aac|opus|webm|alac|aiff)$/i.test(f.name));
                if (audioFiles.length === 0) {
                    const msg = `No supported audio files found in "${folderName}".`;
                    setScanStatus(`${msg} Please choose another folder or configure path manually in Settings.`, true);
                    updateEmptyPlayerState(msg);
                    folderPickerInput.value = '';
                    return;
                }

                showTrackLoadingOverlay(
                    'LOADING MUSIC LIBRARY...',
                    `Scanning ${audioFiles.length} audio files from "${folderName}"...`,
                    10
                );
                setScanStatus(`Reading ${audioFiles.length} audio files from "${folderName}"...`, false);

                // Check candidate server paths matching the selected folder name
                const candidatePaths = [
                    folderPathInput ? folderPathInput.value.trim() : '',
                    `~/Music/${folderName}`,
                    `~/Downloads/${folderName}`,
                    `~/${folderName}`,
                    folderName
                ].filter(Boolean);

                let serverScanned = false;
                for (const cand of candidatePaths) {
                    if (isTrackLoadingCancelled) break;
                    try {
                        activeScanAbortController = new AbortController();
                        const res = await fetch(`php/api/scan.php?directory=${encodeURIComponent(cand)}`, {
                            signal: activeScanAbortController.signal
                        });
                        if (res.ok) {
                            const data = await res.json();
                            if (data.success && Array.isArray(data.tracks) && data.tracks.length > 0) {
                                const resolvedDir = data.directory || cand;
                                if (folderPathInput) folderPathInput.value = resolvedDir;
                                const sInput = document.getElementById('settingsTabFolderPathInput');
                                if (sInput) sInput.value = resolvedDir;
                                try {
                                    safeStorage.setItem('cachymusic_last_directory', resolvedDir);
                                    safeStorage.setItem('cachymusic_directory_mode', 'server');
                                } catch (_) {}
                                if (dismissedTracksMap.size > 0) {
                                    allTracks = data.tracks.filter(t => !dismissedTracksMap.has(t.fullPath || t.filename || t.id));
                                } else {
                                    allTracks = data.tracks;
                                }
                                saveLibraryToIndexedDB(allTracks, resolvedDir);
                                setScanStatus(`Scanned ${data.count} audio tracks from ${resolvedDir}`, false);
                                hideTrackLoadingOverlay();
                                updateEmptyPlayerState();
                                applySearchAndSort();
                                loadTrack(0, false);
                                serverScanned = true;
                                break;
                            }
                        }
                    } catch (err) {
                        if (err && err.name === 'AbortError') break;
                    } finally {
                        activeScanAbortController = null;
                    }
                }

                // If not available on server path, load files directly in browser with ID3 metadata parser
                if (!serverScanned && !isTrackLoadingCancelled) {
                    if (folderPathInput) folderPathInput.value = folderName;
                    const sInput = document.getElementById('settingsTabFolderPathInput');
                    if (sInput) sInput.value = folderName;
                    const importedTracks = [];
                    for (let i = 0; i < audioFiles.length; i++) {
                        if (isTrackLoadingCancelled) break;
                        const file = audioFiles[i];
                        const pct = Math.min(98, Math.round(((i + 1) / audioFiles.length) * 100));
                        updateTrackLoadingOverlay(
                            `Reading track metadata (${i + 1} / ${audioFiles.length}): ${file.name}`,
                            pct
                        );
                        const url = URL.createObjectURL(file);
                        const parsed = await parseAudioFileMetadata(file);
                        importedTracks.push({
                            id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                            tid: null,
                            filename: file.name,
                            fullPath: file.webkitRelativePath || file.name,
                            title: parsed.title,
                            artist: parsed.artist,
                            album: parsed.album,
                            genre: parsed.genre,
                            year: parsed.year,
                            track: parsed.track,
                            duration: parsed.duration || 0,
                            bitrate: parsed.bitrate,
                            sampleRate: parsed.sampleRate,
                            bitDepth: parsed.bitDepth,
                            channels: parsed.channels,
                            format: parsed.format,
                            size: parsed.size,
                            cover: parsed.cover,
                            src: url,
                            _fileBlob: file
                        });
                    }
                    hideTrackLoadingOverlay();
                    if (!isTrackLoadingCancelled && importedTracks.length > 0) {
                        allTracks = importedTracks;
                        try {
                            safeStorage.setItem('cachymusic_last_directory', folderName);
                            safeStorage.setItem('cachymusic_directory_mode', 'browser_idb');
                        } catch (_) {}
                        saveLibraryToIndexedDB(allTracks, folderName);
                        updateEmptyPlayerState();
                        applySearchAndSort();
                        loadTrack(0, false);
                        setScanStatus(`Loaded ${importedTracks.length} track(s) from "${folderName}".`, false);
                    }
                } else {
                    hideTrackLoadingOverlay();
                }
                folderPickerInput.value = '';
            });
        }

        // Create Playlist in Tab
        createPlaylistBtn.addEventListener('click', async () => {
            const name = newPlaylistInput.value.trim();
            if (!name) {
                newPlaylistInput.focus();
                return;
            }

            try {
                const res = await fetch('php/api/playlists.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create', name })
                });
                const data = await res.json();
                if (data.success) {
                    playlists.push({ plid: data.plid, name: data.name, track_count: 0 });
                    try { safeStorage.setItem('cachymusic_cached_playlists', JSON.stringify(playlists)); } catch (err) {}
                    newPlaylistInput.value = '';
                    renderPlaylistsView();
                    showToast(`Playlist "${data.name}" created!`, 'OPEN', () => {
                        openPlaylist(data.plid, data.name);
                    });
                    return;
                }
            } catch (e) {
                console.warn('Create playlist API error, saving locally:', e);
                const localId = Date.now();
                playlists.push({ plid: localId, name, track_count: 0 });
                try { safeStorage.setItem('cachymusic_cached_playlists', JSON.stringify(playlists)); } catch (err) {}
                newPlaylistInput.value = '';
                renderPlaylistsView();
                showToast(`Playlist "${name}" created offline!`, 'OPEN', () => {
                    openPlaylist(localId, name);
                });
            }
        });

        newPlaylistInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                createPlaylistBtn.click();
            }
        });

        closeModalBtn.addEventListener('click', closePlaylistModal);
        playlistModal.addEventListener('click', (e) => {
            if (e.target === playlistModal) closePlaylistModal();
        });

        modalCreateAndAddBtn.addEventListener('click', async () => {
            const name = modalNewPlaylistName.value.trim();
            if (!name || !selectedTrackForPlaylist) {
                if (modalNewPlaylistName) modalNewPlaylistName.focus();
                return;
            }

            try {
                const res = await fetch('php/api/playlists.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create', name })
                });
                const data = await res.json();
                if (data.success) {
                    const newPl = { plid: data.plid, name: data.name, track_count: 0 };
                    playlists.push(newPl);
                    await addTrackToPlaylist(data.plid, selectedTrackForPlaylist.tid || selectedTrackForPlaylist.id, selectedTrackForPlaylist);
                    closePlaylistModal();
                }
            } catch (e) {
                console.warn('Create and add playlist error:', e);
            }
        });

        modalNewPlaylistName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                modalCreateAndAddBtn.click();
            }
        });

        function setupTrackActionMenuModal() {
            const modal = document.getElementById('trackActionMenuModal');
            const closeBtn = document.getElementById('closeTrackMenuBtn');
            const playNextBtn = document.getElementById('trackMenuPlayNextBtn');
            const enqueueBtn = document.getElementById('trackMenuEnqueueBtn');
            const addToPlaylistBtn = document.getElementById('trackMenuAddToPlaylistBtn');
            const editMetaBtn = document.getElementById('trackMenuEditMetaBtn');
            const viewInfoBtn = document.getElementById('trackMenuViewInfoBtn');
            const removeBtn = document.getElementById('trackMenuRemoveBtn');

            if (closeBtn) closeBtn.addEventListener('click', closeTrackActionMenu);
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) closeTrackActionMenu();
                });
            }

            if (playNextBtn) {
                playNextBtn.addEventListener('click', () => {
                    if (!selectedTrackForMenu) return;
                    const track = selectedTrackForMenu;
                    addToQueue(track, true);
                    closeTrackActionMenu();
                    showToast(`Added to Play Next: "${track.title || track.filename}"`);
                });
            }

            if (enqueueBtn) {
                enqueueBtn.addEventListener('click', () => {
                    if (!selectedTrackForMenu) return;
                    const track = selectedTrackForMenu;
                    addToQueue(track, false);
                    closeTrackActionMenu();
                    showToast(`Added to Up Next Queue: "${track.title || track.filename}"`);
                });
            }

            if (addToPlaylistBtn) {
                addToPlaylistBtn.addEventListener('click', () => {
                    if (!selectedTrackForMenu) return;
                    const track = selectedTrackForMenu;
                    closeTrackActionMenu();
                    openAddToPlaylistModal(track);
                });
            }

            if (viewInfoBtn) {
                viewInfoBtn.addEventListener('click', () => {
                    if (!selectedTrackForMenu) return;
                    const track = selectedTrackForMenu;
                    closeTrackActionMenu();
                    if (typeof updateTrackMetadataDisplay === 'function') {
                        updateTrackMetadataDisplay(track);
                    }
                    if (window.innerWidth <= 768) {
                        switchWorkspace('player', 'settingsPanel');
                    } else {
                        const metaTab = document.getElementById('tabMetadata');
                        if (metaTab) metaTab.click();
                    }
                });
            }

            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    if (!selectedTrackForMenu) return;
                    const track = selectedTrackForMenu;
                    closeTrackActionMenu();
                    if (currentPlaylistId !== null) {
                        removeTrackFromCurrentPlaylist(track);
                    } else {
                        removeTrackFromMainList(track);
                    }
                });
            }
        }
        setupTrackActionMenuModal();

        function setupMetadataEditorModal() {
            const modal = document.getElementById('metadataEditorModal');
            const closeBtn = document.getElementById('closeMetaEditorModalBtn');
            const cancelBtn = document.getElementById('metaEditCancelBtn');
            const form = document.getElementById('metaEditorForm');
            const saveBtn = document.getElementById('metaEditSaveBtn');
            const infoEditBtn = document.getElementById('infoPanelEditMetaBtn');
            const confirmCancelBtn = document.getElementById('metaEditConfirmCancelBtn');
            const confirmProceedBtn = document.getElementById('metaEditConfirmProceedBtn');

            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    if (typeof closeMetadataEditor === 'function') closeMetadataEditor();
                });
            }
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    if (typeof closeMetadataEditor === 'function') closeMetadataEditor();
                });
            }
            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (typeof requestSaveMetadataConfirmation === 'function') {
                        requestSaveMetadataConfirmation(e);
                    } else if (typeof saveMetadata === 'function') {
                        saveMetadata(e);
                    }
                });
            }
            if (confirmCancelBtn) {
                confirmCancelBtn.addEventListener('click', () => {
                    if (typeof cancelMetadataConfirmation === 'function') {
                        cancelMetadataConfirmation();
                    }
                });
            }
            if (confirmProceedBtn) {
                confirmProceedBtn.addEventListener('click', () => {
                    if (typeof executeSaveMetadata === 'function') {
                        executeSaveMetadata();
                    }
                });
            }
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        if (typeof closeMetadataEditor === 'function') closeMetadataEditor();
                    }
                });
            }
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    if (typeof requestSaveMetadataConfirmation === 'function') {
                        requestSaveMetadataConfirmation(e);
                    } else if (typeof saveMetadata === 'function') {
                        saveMetadata(e);
                    }
                });
            }
            if (infoEditBtn) {
                infoEditBtn.addEventListener('click', () => {
                    const track = window.currentInspectedTrack || (Array.isArray(allTracks) && allTracks[currentTrackIndex]) || null;
                    if (track) {
                        if (typeof openMetadataEditor === 'function') openMetadataEditor(track);
                    } else {
                        showToast('No active track loaded to edit metadata');
                    }
                });
            }
        }
        setupMetadataEditorModal();

        async function handleOpenStandaloneAudioFiles(files) {
            const rawFiles = Array.from(files || []);
            const audioFiles = rawFiles.filter(f => {
                const name = (f.name || '').toLowerCase();
                return f.type.startsWith('audio/') || /\.(mp3|flac|wav|ogg|m4a|aac|opus|alac|aiff)$/i.test(name);
            });
            if (audioFiles.length === 0) return;

            showTrackLoadingOverlay(
                'OPENING AUDIO FILE...',
                `Reading ${audioFiles.length} audio file(s)...`,
                15
            );
            setScanStatus(`Reading ${audioFiles.length} standalone audio file(s)...`, false);
            const openedTracks = [];

            for (let i = 0; i < audioFiles.length; i++) {
                if (isTrackLoadingCancelled) break;
                const file = audioFiles[i];
                const pct = Math.min(98, Math.round(((i + 1) / audioFiles.length) * 100));
                updateTrackLoadingOverlay(`Reading metadata (${i + 1}/${audioFiles.length}): ${file.name}`, pct);
                if (i % 5 === 0 || i === audioFiles.length - 1) {
                    setScanStatus(`Reading audio metadata (${i + 1}/${audioFiles.length})...`, false);
                }
                const url = URL.createObjectURL(file);

                let parsed = null;
                try {
                    parsed = await parseAudioFileMetadata(file);
                } catch (_) {
                    parsed = { title: file.name.replace(/\.[^/.]+$/, ''), artist: 'External Audio', album: 'Standalone File', duration: 0 };
                }

                openedTracks.push({
                    id: 'standalone_' + Date.now() + '_' + i + '_' + Math.random().toString(36).substr(2, 4),
                    tid: null,
                    filename: file.name,
                    fullPath: file.name,
                    title: (parsed && parsed.title) ? parsed.title : file.name.replace(/\.[^/.]+$/, ''),
                    artist: (parsed && parsed.artist) ? parsed.artist : 'External Audio',
                    album: (parsed && parsed.album) ? parsed.album : 'Standalone File',
                    genre: (parsed && parsed.genre) ? parsed.genre : 'N/A',
                    year: (parsed && parsed.year) ? parsed.year : '',
                    track: (parsed && parsed.track) ? parsed.track : null,
                    duration: (parsed && parsed.duration) ? parsed.duration : 0,
                    bitrate: (parsed && parsed.bitrate) ? parsed.bitrate : 0,
                    sampleRate: (parsed && parsed.sampleRate) ? parsed.sampleRate : 44100,
                    bitDepth: (parsed && parsed.bitDepth) ? parsed.bitDepth : 16,
                    channels: (parsed && parsed.channels) ? parsed.channels : 2,
                    format: (parsed && parsed.format) ? parsed.format : (file.name.split('.').pop() || 'audio'),
                    size: (parsed && parsed.size) ? parsed.size : (file.size ? (file.size / (1024 * 1024)).toFixed(2) + ' MB' : 'N/A'),
                    cover: (parsed && parsed.cover) ? parsed.cover : null,
                    src: url,
                    _fileBlob: file,
                    isStandalone: true
                });
            }

            hideTrackLoadingOverlay();
            if (!isTrackLoadingCancelled && openedTracks.length > 0) {
                setScanStatus(`Loaded ${openedTracks.length} standalone file(s).`, false);
                standaloneTrackList = openedTracks;
                standaloneTrackIndex = 0;
                isStandalonePlayback = true;
                await loadStandaloneTrack(0, true);
            }
        }
        window.handleOpenStandaloneAudioFiles = handleOpenStandaloneAudioFiles;

        localFileInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;
            await handleOpenStandaloneAudioFiles(files);
            localFileInput.value = '';
        });

        // Drag & Drop external audio files onto the workstation window (VLC-style)
        window.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        });

        window.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const dt = e.dataTransfer;
            if (!dt || !dt.files || dt.files.length === 0) return;
            await handleOpenStandaloneAudioFiles(dt.files);
        });

        // W3C File Handling API (Launch Queue - when user opens audio files with CachyMusic from desktop/OS file manager)
        if (typeof window !== 'undefined' && 'launchQueue' in window && window.LaunchParams && 'files' in window.LaunchParams.prototype) {
            try {
                window.launchQueue.setConsumer(async (launchParams) => {
                    if (!launchParams.files || launchParams.files.length === 0) return;
                    const loadedFiles = [];
                    for (const handle of launchParams.files) {
                        try {
                            const file = await handle.getFile();
                            if (file) loadedFiles.push(file);
                        } catch (_) {}
                    }
                    if (loadedFiles.length > 0) {
                        await handleOpenStandaloneAudioFiles(loadedFiles);
                    }
                });
            } catch (_) {}
        }

        if (standaloneResumeLibraryBtn) {
            standaloneResumeLibraryBtn.addEventListener('click', () => {
                exitStandalonePlayback(true);
            });
        }
        if (standaloneCloseBtn) {
            standaloneCloseBtn.addEventListener('click', () => {
                exitStandalonePlayback(false);
            });
        }

        speedBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                speedBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const speed = parseFloat(btn.dataset.speed);
                currentPlaybackSpeed = speed;
                audio.playbackRate = speed;
                try {
                    audio.preservesPitch = isPitchLockTempo;
                    audio.mozPreservesPitch = isPitchLockTempo;
                    audio.webkitPreservesPitch = isPitchLockTempo;
                } catch (_) {}

                if (speed === 1) {
                    vinylTurntable.style.animationDuration = '2.2s';
                } else {
                    vinylTurntable.style.animationDuration = `${2.2 / speed}s`;
                }
            });
        });

        // Mobile & Touch Ergonomics: Tactile Vinyl Swiping & Tapping
        if (vinylTurntable) {
            let touchStartX = 0;
            let touchStartY = 0;
            let touchStartTime = 0;

            vinylTurntable.addEventListener('touchstart', (e) => {
                if (!e.touches || e.touches.length !== 1) return;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                touchStartTime = Date.now();
            }, { passive: true });

            vinylTurntable.addEventListener('touchend', (e) => {
                if (!e.changedTouches || e.changedTouches.length !== 1) return;
                const dx = e.changedTouches[0].clientX - touchStartX;
                const dy = e.changedTouches[0].clientY - touchStartY;
                const dt = Date.now() - touchStartTime;

                if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 600) {
                    if (dx < 0) {
                        nextTrack();
                        showToast('Next Track ⏭');
                    } else {
                        prevTrack();
                        showToast('Previous Track ⏮');
                    }
                } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 300) {
                    togglePlayPause();
                }
            }, { passive: true });
        }

        // Theme Overhaul Listeners
        if (themeModalBtn) {
            themeModalBtn.addEventListener('click', openThemeModal);
        }
        if (closeThemeModalBtn) {
            closeThemeModalBtn.addEventListener('click', closeThemeModal);
        }
        if (themeModal) {
            themeModal.addEventListener('click', (e) => {
                if (e.target === themeModal) closeThemeModal();
            });
        }

        themeSelectCards.forEach(card => {
            card.addEventListener('click', () => {
                const t = card.dataset.theme || 'default';
                applyTheme(t, true);
                closeThemeModal();
            });
        });

        themeQuickBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const t = btn.dataset.theme || 'default';
                applyTheme(t, true);
            });
        });

        if (new URLSearchParams(window.location.search).get('modal') === 'theme') {
            openThemeModal();
        }

        // Mini Player & Soulseek Studio Listeners
        function seekMiniAudio(e) {
            if (!miniProgressCon) return;
            const rect = miniProgressCon.getBoundingClientRect();
            if (!rect || rect.width <= 0) return;
            const clientX = getClientX(e);
            if (typeof clientX !== 'number' || isNaN(clientX) || !isFinite(clientX)) return;
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            if (isNaN(pct) || !isFinite(pct)) return;
            if (miniProgressBar) miniProgressBar.style.width = `${pct * 100}%`;
            if (progressBar) progressBar.style.width = `${pct * 100}%`;
            if (isSoftwareDecoding) {
                const totalDur = activeDecodedBuffer ? activeDecodedBuffer.duration : ((allTracks[currentTrackIndex] && allTracks[currentTrackIndex].duration) || 0);
                if (totalDur > 0) {
                    seekSoftwarePlayback(pct * totalDur);
                }
                return;
            }
            if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
                const targetSec = Math.max(0, Math.min(audio.duration, pct * audio.duration));
                if (!isNaN(targetSec) && isFinite(targetSec)) {
                    audio.currentTime = targetSec;
                    if (miniCurrentTime) miniCurrentTime.textContent = formatTime(audio.currentTime);
                    currentTimeEl.textContent = formatTime(audio.currentTime);
                    try {
                        const cur = audio.currentTime;
                        const dur = audio.duration;
                        if (cur > 0 && cur < dur - 1) {
                            safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2));
                        }
                    } catch (_) {}
                }
            }
        }

        if (miniPlayBtn) miniPlayBtn.addEventListener('click', () => {
            togglePlayPause();
            miniPlayBtn.blur();
        });
        if (miniPrevBtn) miniPrevBtn.addEventListener('click', () => {
            prevTrack();
            miniPrevBtn.blur();
        });
        if (miniNextBtn) miniNextBtn.addEventListener('click', () => {
            nextTrack();
            miniNextBtn.blur();
        });
        if (miniDeckReturnBtn) bindFastAction(miniDeckReturnBtn, () => switchWorkspace('player', 'playerDeck'));
        const miniPlayerLeftEl = document.querySelector('.miniPlayerLeft');
        if (miniPlayerLeftEl) {
            miniPlayerLeftEl.style.cursor = 'pointer';
            bindFastAction(miniPlayerLeftEl, () => switchWorkspace('player', 'playerDeck'));
        }
        if (miniProgressCon) {
            miniProgressCon.addEventListener('click', seekMiniAudio);
        }
        if (miniMuteBtn) {
            miniMuteBtn.addEventListener('click', () => {
                audio.muted = !audio.muted;
                if (audio.muted) {
                    volumeLevel.textContent = '0%';
                    updateVolumeIcon(0);
                    if (isHardwareGain) dispatchHardwareVolume(0);
                } else {
                    setVolume(currentVolumeValue, true);
                }
            });
        }
        if (miniVolumeSlider) {
            miniVolumeSlider.addEventListener('input', (e) => {
                setVolume(parseFloat(e.target.value), true);
            });
        }

        if (wsPlayerBtn) bindFastAction(wsPlayerBtn, () => switchWorkspace('player'));
        if (wsSoulseekBtn) bindFastAction(wsSoulseekBtn, () => switchWorkspace('soulseek'));
        if (wsDownloadBtn) bindFastAction(wsDownloadBtn, () => switchWorkspace('download'));

        // Soulseek / P2P toolbar power triggers (loads P2P module on demand)
        if (slskPowerBtn) {
            slskPowerBtn.addEventListener('click', () => {
                getP2pModule().then(m => m.soulseekController && m.soulseekController.togglePower());
            });
        }
        if (slskModalPowerBtn) {
            slskModalPowerBtn.addEventListener('click', () => {
                getP2pModule().then(m => m.soulseekController && m.soulseekController.togglePower());
            });
        }
        if (slskAccountBtn) {
            slskAccountBtn.addEventListener('click', () => {
                getP2pModule().then(() => openSlskAccountModal());
            });
        }

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('view') === 'soulseek' || window.location.hash === '#soulseek') {
            switchWorkspace('soulseek');
            if (urlParams.get('slsk_open') === '1') {
                setMobileSearchPanelCollapsed(false);
            }
        } else if (urlParams.get('view') === 'download' || window.location.hash === '#download') {
            switchWorkspace('download');
        } else if (urlParams.get('view') === 'settings' || window.location.hash === '#settings' || urlParams.get('tab') === 'settings') {
            switchWorkspace('settings');
        } else if (urlParams.get('panel')) {
            switchWorkspace('player', urlParams.get('panel'));
        }
        if (urlParams.get('lyrics') === '1' || window.location.hash === '#lyrics') {
            toggleLyricsView(true);
        }
        if (urlParams.get('vis')) {
            setVisualizerMode(urlParams.get('vis'));
        }
        if (urlParams.get('theme')) {
            applyTheme(urlParams.get('theme'), false);
        } else {
            applyTheme(activeTheme, false);
        }
        if (urlParams.get('modal') === 'theme' || window.location.hash === '#theme') {
            openThemeModal();
            if (urlParams.get('scroll_theme') === '1') {
                const tc = document.querySelector('.themeModalCard');
                if (tc) tc.scrollTop = tc.scrollHeight;
            }
        }
        if (urlParams.get('modal') === 'playlist') {
            const dummyTrack = (allTracks && allTracks.length > 0) ? allTracks[0] : { title: 'Solar Echoes', artist: 'Antigravity Sound', filename: 'solar_echoes.flac' };
            openAddToPlaylistModal(dummyTrack);
        }
        if (urlParams.get('modal') === 'slsk' || urlParams.get('modal') === 'soulseek') {
            openSlskAccountModal();
        }
        if (urlParams.get('modal') === 'signal' || window.location.hash === '#signal') {
            openSignalPathModal();
        }
        if (urlParams.get('modal') === 'peq' || urlParams.get('modal') === 'eq' || window.location.hash === '#peq') {
            setTimeout(() => {
                if (playerEqBtn) playerEqBtn.click();
            }, 80);
        }
        if (urlParams.get('play') === '1') {
            setTimeout(() => {
                loadTrack(0, true);
            }, 300);
            try {
                const cleanUrl = new URL(window.location.href);
                cleanUrl.searchParams.delete('play');
                window.history.replaceState({}, document.title, cleanUrl.pathname + (cleanUrl.search ? cleanUrl.search : '') + cleanUrl.hash);
            } catch (_) {}
        }

        window.addEventListener('keydown', (e) => {
            // Dismiss open modals or unfocus search on Escape key
            if (e.code === 'Escape') {
                if (document.activeElement && document.activeElement.id === 'trackSearch') {
                    document.activeElement.blur();
                    return;
                }
                if (themeModal && themeModal.style.display === 'flex') {
                    closeThemeModal();
                    return;
                }
                if (playlistModal && playlistModal.style.display === 'flex') {
                    closePlaylistModal();
                    return;
                }
                if (signalPathModal && signalPathModal.style.display === 'flex') {
                    closeSignalPathModal();
                    return;
                }
                if (sleepTimerModal && sleepTimerModal.style.display === 'flex') {
                    closeSleepTimerModal();
                    return;
                }
                if (slskAccountModal && slskAccountModal.style.display === 'flex') {
                    closeSlskAccountModal();
                    return;
                }
                const peqModalEl = document.getElementById('peqModal');
                if (peqModalEl && peqModalEl.style.display === 'flex') {
                    if (typeof closePeqModal === 'function') closePeqModal();
                    else peqModalEl.style.display = 'none';
                    return;
                }
                const batchModalEl = document.getElementById('batchAddSongsModal');
                if (batchModalEl && batchModalEl.style.display === 'flex') {
                    closeBatchAddModal();
                    return;
                }
                const metaModalEl = document.getElementById('metadataEditorModal');
                if (metaModalEl && (metaModalEl.style.display === 'flex' || window.getComputedStyle(metaModalEl).display === 'flex')) {
                    if (typeof closeMetadataEditor === 'function') closeMetadataEditor();
                    else metaModalEl.style.display = 'none';
                    return;
                }
            }

            // Quick Search Shortcut: '/' or 'Cmd+K' / 'Ctrl+K'
            const isSearchTrigger = (e.key === '/' || ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')));
            if (isSearchTrigger && !['input', 'select', 'textarea'].includes(document.activeElement.tagName.toLowerCase()) && !document.activeElement.isContentEditable) {
                const searchEl = document.getElementById('trackSearch');
                if (searchEl) {
                    e.preventDefault();
                    searchEl.focus();
                    searchEl.select();
                    return;
                }
            }

            // Workspace Hotkeys (Alt+S for Soulseek, Alt+P for Player, Alt+D for Download)
            if (e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                switchWorkspace(currentWorkspace === 'soulseek' ? 'player' : 'soulseek');
                return;
            }
            if (e.altKey && (e.code === 'KeyD' || e.key === 'd' || e.key === 'D')) {
                e.preventDefault();
                switchWorkspace(currentWorkspace === 'download' ? 'player' : 'download');
                return;
            }
            if (e.altKey && (e.code === 'KeyO' || e.key === 'o' || e.key === 'O')) {
                e.preventDefault();
                switchWorkspace(currentWorkspace === 'settings' ? 'player' : 'settings');
                return;
            }
            if (e.altKey && (e.code === 'KeyP' || e.key === 'p' || e.key === 'P')) {
                e.preventDefault();
                switchWorkspace('player');
                return;
            }

            if (['input', 'select', 'textarea'].includes(document.activeElement.tagName.toLowerCase()) || document.activeElement.isContentEditable) return;

            // Quick Queue Hotkey: 'Q' toggles Up Next queue view
            if ((e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                if (tabQueue && queueView && queueView.style.display !== 'none') {
                    tabLibrary.click();
                } else if (tabQueue) {
                    tabQueue.click();
                }
                return;
            }

            // Quick Equalizer Hotkey: 'E' toggles 10-Band Parametric Equalizer modal
            if ((e.code === 'KeyE' || e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                const peqBtn = document.getElementById('playerPeqBtn');
                if (peqBtn) {
                    peqBtn.click();
                } else {
                    const peqModalEl = document.getElementById('peqModal');
                    if (peqModalEl && (peqModalEl.style.display === 'flex' || window.getComputedStyle(peqModalEl).display === 'flex')) {
                        if (typeof closePeqModal === 'function') closePeqModal();
                        else peqModalEl.style.display = 'none';
                    } else if (typeof openPeqModal === 'function') {
                        openPeqModal();
                    }
                }
                return;
            }

            // Background Tab & Focus Protection:
            // Never capture spacebar or media playback keys if the tab is hidden or window is not focused!
            // (Completely prevents YouTube spacebar / media hotkey leakage from unpausing CachyMusic)
            if (document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus())) return;

            if (e.code === 'Space') {
                e.preventDefault();
                togglePlayPause();
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                if (e.shiftKey) nextTrack();
                else audio.currentTime = Math.min(audio.currentTime + 5, audio.duration || 0);
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                if (e.shiftKey) prevTrack();
                else audio.currentTime = Math.max(audio.currentTime - 5, 0);
            } else if (e.code === 'ArrowUp') {
                e.preventDefault();
                setVolume(currentVolumeValue + 0.05, true);
            } else if (e.code === 'ArrowDown') {
                e.preventDefault();
                setVolume(currentVolumeValue - 0.05, true);
            } else if (e.code === 'KeyM') {
                e.preventDefault();
                muteBtn.click();
            } else if (e.code === 'KeyL') {
                e.preventDefault();
                toggleLyricsView();
            } else if (e.code === 'KeyI' || e.key === 'i' || e.key === 'I') {
                e.preventDefault();
                toggleMetadataPanel();
            } else if ((e.code === 'KeyT' || e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                toggleTracklistPanel();
            } else if ((e.code === 'KeyN' || e.key === 'n') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                nextTrack();
            } else if ((e.code === 'KeyP' || e.key === 'p') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                prevTrack();
            }
        });

        // Setup PWA & Desktop Installation Handler
        setupPwaInstallPrompt();

        // Setup Download Hub & Cross-Platform Client Switcher
        setupDownloadWorkspace();
    }


    window.CachyMusicApp = {
        init,
        getAllTracks: () => allTracks,
        getAudioContext: () => audioContext,
        loadTrack,
        playAudio,
        pauseAudio,
        nextTrack,
        prevTrack,
        scanDirectory,
        setDspBoost,
        toggleReplayGain,
        playWithSoftwareDecoder,
        isSoftwareDecoding: () => isSoftwareDecoding,
        peq: {
            frequencies: PEQ_FREQS,
            getGains: () => [...peqGains],
            setGain: setPeqBandGain,
            setPreset: setPeqPreset,
            importProfile: importAutoEqProfile
        },
        updateDacStatusUi
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }



})();
