// CachyMusic - Centralized Reactive WorkstationStore & State Architecture
import { safeStorage } from './utils.js';

export const VALID_SORT_OPTIONS = [
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

export const PEQ_FREQS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const PEQ_Q_STEPS = [0.71, 1.0, 1.41, 2.2, 3.5];
export const NUM_BANDS = 60;
export const MAX_PARTICLES = 36;

export const VALID_THEME_IDS = [
    'default', 'nms', 'solar-eclipse', 'euclid-horizon', 'alien-paradise',
    'abyssal-void', 'dissonance', 'sentinel',
    'minimalist-light', 'minimalist-dark', 'minimalist-warm', 'minimalist-obsidian',
    'brutalist-light', 'brutalist-dark'
];

function resolveInitialSort() {
    try {
        const urlSort = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('sort') : null;
        const savedSort = urlSort || safeStorage.getItem('cachymusic_track_sort');
        if (savedSort && VALID_SORT_OPTIONS.includes(savedSort)) {
            return savedSort;
        }
    } catch (_) {}
    return 'default';
}

function resolveInitialVisMode() {
    try {
        const urlVisParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('vis') : null;
        let savedMode = urlVisParam || safeStorage.getItem('cachymusic_vis_mode') || 'wave';
        if (savedMode === 'badapple') savedMode = 'thematic';
        return savedMode;
    } catch (_) {}
    return 'wave';
}

function resolveInitialTheme() {
    let t = safeStorage.getItem('cachymusic_active_theme')
        || (typeof document !== 'undefined' && document.documentElement ? document.documentElement.getAttribute('data-theme') : null)
        || 'default';
    if (t === 'brutalist-minimalism-light' || t === 'brutalist-light') t = 'minimalist-light';
    if (t === 'brutalist-minimalism-dark' || t === 'brutalist-dark') t = 'minimalist-dark';
    if (!VALID_THEME_IDS.includes(t)) {
        t = (t === 'atlas' || t === 'spotify' || t === 'apple') ? 'nms' : 'default';
    }
    return t;
}

function createInitialPeq() {
    let peqGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let peqQs = [1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41];
    try {
        const savedPeq = JSON.parse(safeStorage.getItem('cachymusic_peq_gains') || '[]');
        if (Array.isArray(savedPeq) && savedPeq.length === 10) {
            peqGains = savedPeq.map(v => typeof v === 'number' && !isNaN(v) ? Math.max(-15, Math.min(15, v)) : 0);
        }
        const savedQs = JSON.parse(safeStorage.getItem('cachymusic_peq_qs') || '[]');
        if (Array.isArray(savedQs) && savedQs.length === 10) {
            peqQs = savedQs.map(v => typeof v === 'number' && !isNaN(v) ? Math.max(0.4, Math.min(8.0, v)) : 1.41);
        }
    } catch (_) {}
    return { peqGains, peqQs };
}

function createInitialParticles() {
    const arr = [];
    for (let p = 0; p < MAX_PARTICLES; p++) {
        arr.push({
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
    return arr;
}

const DSP_STATE_KEYS = new Set([
    'isAmpBoost', 'isBassBoost', 'isVocalBoost', 'isTrebleBoost', 'isLimiter',
    'isReplayGain', 'isCrossfeed', 'isSubsonic', 'currentVolumeValue',
    'isPrecision64', 'mathPrecision', 'isAgpEnabled', 'isSurroundWidener', 'isPhaseInvert',
    'isMonoMix', 'stereoBalance', 'isPitchLockTempo', 'currentPlaybackSpeed',
    'isHardwareGain', 'isUltrasonic', 'ultrasonicCutoff', 'ditherMode',
    'isAmbiophonics', 'bufferLatencyTarget', 'isPeqBypassed', 'peqGains', 'peqQs',
    'dspWorkletNode', 'hwVolumeBackend', 'detectedDacLabel', 'hasExternalDac'
]);

const TRACK_STATE_KEYS = new Set([
    'currentTrackIndex', 'currentTrack', 'isStandalonePlayback',
    'standaloneTrackList', 'standaloneTrackIndex', 'preloadedNextTrackIndex'
]);

const PLAYBACK_STATE_KEYS = new Set([
    'isPlaying', 'isShuffle', 'repeatMode', 'isSoftwareDecoding',
    'isSoftwarePaused', 'softwarePlaybackOffset', 'currentPlaybackSpeed'
]);

const LIBRARY_STATE_KEYS = new Set([
    'allTracks', 'displayedTracks', 'playlists', 'currentPlaylistId',
    'currentPlaylistName', 'currentSort', 'searchQuery', 'currentFormatFilter',
    'selectedTrackForPlaylist'
]);

export class WorkstationStore extends EventTarget {
    constructor() {
        super();
        const { peqGains, peqQs } = createInitialPeq();
        let initVol = parseFloat(safeStorage.getItem('cachymusic_volume') || '0.8');
        if (isNaN(initVol)) initVol = 0.8;
        let initBalance = parseFloat(safeStorage.getItem('cachymusic_stereo_balance') || '0');
        if (isNaN(initBalance)) initBalance = 0;
        const visMode = resolveInitialVisMode();

        this.state = {
            // App Lifecycle & Runtime Mode
            isInitialized: false,
            activeTheme: resolveInitialTheme(),
            currentWorkspace: 'player',
            deferredInstallPrompt: null,
            activeScanAbortController: null,
            isTrackLoadingCancelled: false,
            currentTrackLoadingTitle: 'LOADING MUSIC LIBRARY...',
            openPeqModal: null,
            closePeqModal: null,
            resumeVisualizerLoop: null,
            ambientCanvas: null,
            ambientCtx: null,
            lastRenderedMiniTrack: null,
            dismissedTracksMap: new Map(),

            // Media Elements & Core References
            audio: (typeof document !== 'undefined') ? document.getElementById('audioPlayer') : null,
            secondaryAudio: null,
            preloadedNextTrackIndex: -1,
            isGaplessTransitioning: false,

            // Library, Playlists & Queue
            allTracks: [],
            displayedTracks: [],
            playlists: [],
            playQueue: [],
            currentPlaylistId: null,
            currentPlaylistName: '',
            currentTrackIndex: 0,
            currentTrack: null,
            currentSort: resolveInitialSort(),
            searchQuery: '',
            currentFormatFilter: 'all',
            selectedTrackForPlaylist: null,

            // Transport & Decoder State
            isPlaying: false,
            isShuffle: false,
            repeatMode: safeStorage.getItem('cachymusic_repeat_mode') || 'all',
            isDraggingScrubber: false,
            isStandalonePlayback: false,
            standaloneTrackList: [],
            standaloneTrackIndex: 0,
            isSoftwareDecoding: false,
            isSoftwarePaused: false,
            activeDecodedBuffer: null,
            softwareSourceNode: null,
            softwareSourceGainNode: null,
            softwarePlaybackStartTime: 0,
            softwarePlaybackOffset: 0,
            softwarePlaybackRaf: null,
            alwaysSoftwareDecodeUrls: new Set(),

            // Lyrics
            isLyricsView: false,
            parsedLyrics: null,
            activeLyricIndex: -1,

            // Audio Context & DSP Engine
            audioContext: null,
            analyser: null,
            audioSourceNode: null,
            subsonicFilter: null,
            preAmpGainNode: null,
            xfeedNetwork: null,
            replayGainNode: null,
            bassFilter: null,
            vocalFilter: null,
            trebleFilter: null,
            ampGainNode: null,
            ampSoftClipper: null,
            dspLimiter: null,
            ceilingTrimGain: null,
            peqNodes: [],
            dspWorkletNode: null,
            hwVolumeBackend: 'none',

            // Audiophile DSP Toggles & Parameters
            isAmpBoost: safeStorage.getItem('cachymusic_amp_boost') === 'true',
            isBassBoost: safeStorage.getItem('cachymusic_bass_boost') === 'true',
            isVocalBoost: safeStorage.getItem('cachymusic_vocal_boost') === 'true',
            isTrebleBoost: safeStorage.getItem('cachymusic_treble_boost') === 'true',
            isLimiter: safeStorage.getItem('cachymusic_limiter') === 'true',
            isReplayGain: safeStorage.getItem('cachymusic_replaygain') !== 'false',
            isCrossfeed: safeStorage.getItem('cachymusic_crossfeed') === 'true',
            isSubsonic: safeStorage.getItem('cachymusic_subsonic') !== 'false',
            currentVolumeValue: initVol,
            mathPrecision: (() => {
                const raw = safeStorage.getItem('cachymusic_engine_precision');
                if (raw === 'native' || raw === '32' || raw === '64') return raw;
                return safeStorage.getItem('cachymusic_precision_64') === 'false' ? '32' : '64';
            })(),
            isPrecision64: (() => {
                const raw = safeStorage.getItem('cachymusic_engine_precision');
                if (raw === 'native' || raw === '32') return false;
                if (raw === '64') return true;
                return safeStorage.getItem('cachymusic_precision_64') !== 'false';
            })(),
            detectedDacLabel: '',
            hasExternalDac: false,
            isAgpEnabled: safeStorage.getItem('cachymusic_agp') !== 'false',
            isSurroundWidener: safeStorage.getItem('cachymusic_surround_ms') === 'true',
            isPhaseInvert: safeStorage.getItem('cachymusic_phase_invert') === 'true',
            isMonoMix: safeStorage.getItem('cachymusic_mono_mix') === 'true',
            stereoBalance: initBalance,
            isPitchLockTempo: safeStorage.getItem('cachymusic_pitch_lock') === 'true',
            currentPlaybackSpeed: 1.0,
            isHardwareGain: safeStorage.getItem('cachymusic_hardware_gain') === 'true' || safeStorage.getItem('cachymusic_hw_gain') === 'true',
            isUltrasonic: safeStorage.getItem('cachymusic_ultrasonic') !== 'false',
            ultrasonicCutoff: parseInt(safeStorage.getItem('cachymusic_ultrasonic_cutoff') || '32000', 10),
            ditherMode: safeStorage.getItem('cachymusic_dither_mode') || 'shaped',
            isAmbiophonics: safeStorage.getItem('cachymusic_ambiophonics') === 'true',
            bufferLatencyTarget: safeStorage.getItem('cachymusic_buffer_latency') || 'playback',
            isPeqBypassed: safeStorage.getItem('cachymusic_peq_bypassed') === 'true',
            peqGains,
            peqQs,

            // Desktop Web Notification preference (Opt-In, off by default)
            backgroundNotificationsEnabled: safeStorage.getItem('cachymusic_bg_notifications') === 'true',

            // Visualizer State & Physics
            activeVisualizerMode: visMode,
            animFrameId: null,
            lastRenderTime: (typeof performance !== 'undefined') ? performance.now() : 0,
            simPhase: 0,
            isVisualizerLoopRunning: false,
            smoothTurntableFidelity: (visMode === 'thematic' || visMode === 'badapple') ? 1.0 : 0.0,
            smoothBands: new Float32Array(NUM_BANDS),
            smoothBass: 0,
            smoothTreble: 0,
            peakValues: new Float32Array(NUM_BANDS),
            peakVelocity: new Float32Array(NUM_BANDS),
            peakHold: new Int32Array(NUM_BANDS),
            smoothDashLevels: new Float32Array(NUM_BANDS),
            yinYangAngle: 0,
            runeRingAngle: 0,
            atlasLuminance: 0.05,
            atlasRotationAngle: 0,
            atlasPrecessionAngle: 0,
            smoothHeartPulse: 1.0,
            turntableShockwaves: [],
            shockwaveRings: [],
            particles: createInitialParticles(),
            eclipseRotation: 0,
            euclidRotation: 0,
            paradiseTime: 0,
            abyssalTime: 0,
            dissonanceTime: 0,
            sentinelTime: 0,

            // Sleep Timer & Telemetry Logs
            sleepTimerInterval: null,
            sleepTimerRemainingSec: 0,
            sleepTimerMode: null,
            sleepTimerOriginalVolume: null,
            debugModeActive: safeStorage.getItem('cachymusic_debug_mode') === 'true',
            audioPlaybackDebugLogs: [],
            consecutiveSkipCount: 0,
            trackPlaybackRetryCount: 0,
            userExplicitlyPaused: true,
            isPlayPending: false,
            lastSyncedPlayingState: null,
            currentPlayRequestId: 0,
            currentTrackGeneration: 0,
            currentInspectedTrack: null
        };
    }

    setState(partial, explicitEvents = null) {
        if (!partial || typeof partial !== 'object') return;
        const keys = Object.keys(partial);
        if (keys.length === 0) return;

        Object.assign(this.state, partial);

        const eventsToEmit = new Set(Array.isArray(explicitEvents) ? explicitEvents : []);
        for (const k of keys) {
            if (k === 'activeTheme') eventsToEmit.add('theme:change');
            if (DSP_STATE_KEYS.has(k)) eventsToEmit.add('dsp:change');
            if (TRACK_STATE_KEYS.has(k)) eventsToEmit.add('track:change');
            if (PLAYBACK_STATE_KEYS.has(k)) eventsToEmit.add('playback:state');
            if (LIBRARY_STATE_KEYS.has(k)) eventsToEmit.add('library:update');
            if (k === 'activeVisualizerMode') eventsToEmit.add('visualizer:change');
            if (k === 'isLyricsView' || k === 'parsedLyrics' || k === 'activeLyricIndex') eventsToEmit.add('lyrics:change');
            if (k === 'playQueue') eventsToEmit.add('queue:change');
        }

        const detail = { patch: partial, state: this.state };
        for (const eventName of eventsToEmit) {
            this.dispatchEvent(new CustomEvent(eventName, { detail }));
        }
        this.dispatchEvent(new CustomEvent('state:change', { detail }));
    }

    emit(eventName, detail = null) {
        this.dispatchEvent(new CustomEvent(eventName, { detail: detail ?? { state: this.state } }));
    }

    subscribe(eventName, listener) {
        if (typeof listener !== 'function') return () => {};
        this.addEventListener(eventName, listener);
        return () => this.removeEventListener(eventName, listener);
    }
}

export const store = new WorkstationStore();

export function hasActiveDsp() {
    const s = store.state;
    const hasPeq = !s.isPeqBypassed && s.peqGains.some(g => g !== 0);
    const hasWorkletDsp = s.isUltrasonic || (s.ditherMode !== 'off') || s.isAmbiophonics
        || s.isSurroundWidener || s.isPhaseInvert || s.isMonoMix || (Math.abs(s.stereoBalance) > 0.005);
    return s.isAmpBoost || s.isBassBoost || s.isVocalBoost || s.isTrebleBoost
        || s.isLimiter || s.isCrossfeed || s.isSubsonic || hasPeq || hasWorkletDsp || (s.currentVolumeValue > 1.0);
}

export function emitShockwave(x, y, maxRadius, initialAlpha = 0.75) {
    const rings = store.state.shockwaveRings;
    if (rings.length >= 8) rings.shift();
    rings.push({
        x,
        y,
        r: 6,
        maxR: maxRadius,
        alpha: initialAlpha,
        speed: (maxRadius - 6) * 2.6
    });
}

export function emitTurntableShockwave(x, y, minRadius, maxRadius, initialAlpha = 0.65, color = '#ff1744') {
    const shockwaves = store.state.turntableShockwaves;
    if (shockwaves.length >= 10) shockwaves.shift();
    shockwaves.push({
        x,
        y,
        r: minRadius,
        minR: minRadius,
        maxR: maxRadius,
        alpha: initialAlpha,
        color,
        speed: (maxRadius - minRadius) * 2.4
    });
}
