// CachyMusic - Centralized Workstation State
import { safeStorage } from './utils.js';

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

export {
    VALID_SORT_OPTIONS,
    PEQ_FREQS,
    PEQ_Q_STEPS,
    NUM_BANDS,
    MAX_PARTICLES,
    hasActiveDsp,
    emitTurntableShockwave
};
