import {renderPeqCurve} from './peq-curve.js';
import {createSpectrumView} from './eq-spectrum.js';
import {createGraphLifecycle, createWorkletLoader, clearGraphNodes} from './audio-graph-lifecycle.js';
import {syncVolumeSliders} from './control-ui.js';
// CachyMusic - Audiophile DSP Engine (64-Bit Worklet & Web Audio Fallback)
import {
    getValidSampleRate,
    popModalState,
    pushModalState,
    safeStorage,
    showCachyToast,
    showToast
} from './utils.js';
import { PEQ_FREQS, PEQ_Q_STEPS, hasActiveDsp, store } from './state.js';
import { miniVolumeSlider, volumeLevel, volumeSlider } from './ui-elements.js';
import { logAudioPlaybackEvent, setDebugMode, updateAudioDiagnosticsUi, updateDebugHudState } from './settings.js';
import { getRuntime } from './runtime-capabilities.js';
import { createPlaybackAudioContext } from './audio-context-policy.js';
import { ultrasonicFilterStatus } from './ultrasonic-status.js';
import { createSoftClipCurve, createLinearCurve, computeLimiterProfile as computeLimiterProfilePolicy, getEffectiveAmplification as getEffectiveAmplificationPolicy, getPreAmpGainValue as getPreAmpGainValuePolicy, computeReplayGainMultiplier as computeReplayGainMultiplierPolicy, hasUserShapingDsp as hasUserShapingDspPolicy } from './audio-policies.js';





    function computeLimiterProfile() { return computeLimiterProfilePolicy(store.state); }

    function updateLimiterState(now = 0) {
        const s = store.state;
        if (!s.dspLimiter || !s.audioContext) return;
        const profile = computeLimiterProfile();

        if (profile.isBypassed) {
            s.dspLimiter.threshold.setTargetAtTime(0, now, 0.02);
            s.dspLimiter.knee.setTargetAtTime(0, now, 0.02);
            s.dspLimiter.ratio.setTargetAtTime(1.0, now, 0.02);
            s.dspLimiter.attack.setTargetAtTime(0.0018, now, 0.02);
            s.dspLimiter.release.setTargetAtTime(0.090, now, 0.02);
            if (s.ceilingTrimGain) {
                s.ceilingTrimGain.gain.setTargetAtTime(1.0, now, 0.02);
            }
            if (s.ampSoftClipper) {
                s.ampSoftClipper.curve = createLinearCurve(2048);
            }
        } else {
            s.dspLimiter.threshold.setTargetAtTime(profile.threshold, now, 0.02);
            s.dspLimiter.knee.setTargetAtTime(profile.knee, now, 0.02);
            s.dspLimiter.ratio.setTargetAtTime(profile.ratio, now, 0.02);
            s.dspLimiter.attack.setTargetAtTime(profile.attack, now, 0.02);
            s.dspLimiter.release.setTargetAtTime(profile.release, now, 0.02);
            if (s.ceilingTrimGain) {
                s.ceilingTrimGain.gain.setTargetAtTime(Math.pow(10, -0.6 / 20), now, 0.02);
            }
            if (s.ampSoftClipper) {
                s.ampSoftClipper.curve = createSoftClipCurve(2048);
            }
        }
    }

    function getEffectiveAmplification() { return getEffectiveAmplificationPolicy(store.state); }

    function updateAmpGain(now = 0) {
        const s = store.state;
        if (!s.ampGainNode || !s.audioContext) return;
        const targetLinear = getEffectiveAmplification();
        s.ampGainNode.gain.setTargetAtTime(targetLinear, now, 0.04);
    }

    function getPreAmpGainValue() { return getPreAmpGainValuePolicy(store.state); }

    function updatePreAmpGain(now = 0) {
        const s = store.state;
        if (!s.preAmpGainNode || !s.audioContext) return;
        const target = getPreAmpGainValue();
        s.preAmpGainNode.gain.setTargetAtTime(target, now, 0.025);
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
                output: merger,
                nodes: [splitter, merger, directGainL, directGainR, directShelfL, directShelfR, filterL, filterR, delayL, delayR, crossGainL, crossGainR]
            };
        } catch (e) {
            console.warn('Crossfeed initialization warning:', e);
            return null;
        }
    }

    function setDspBoost(type, active) {
        const s = store.state;
        // A preference toggle must not create a live audio device while idle.
        // Playback initializes its own graph; an already-playing route still
        // needs to be constructed immediately for the changed DSP setting.
        if (!s.audioContext && (s.isPlaying || s.isSoftwareDecoding)) {
            const track = s.allTracks[s.currentTrackIndex];
            const targetRate = (track && track.sampleRate) ? getValidSampleRate(track.sampleRate) : 44100;
            initAudioContext(targetRate);
        }
        const now = s.audioContext ? s.audioContext.currentTime : 0;

        if (type === 'limiter') {
            s.isLimiter = active;
            safeStorage.setItem('cachymusic_limiter', s.isLimiter ? 'true' : 'false');
        } else if (type === 'amp') {
            s.isAmpBoost = active;
            safeStorage.setItem('cachymusic_amp_boost', s.isAmpBoost ? 'true' : 'false');
            updateAmpGain(now);
        } else if (type === 'bass') {
            s.isBassBoost = active;
            safeStorage.setItem('cachymusic_bass_boost', s.isBassBoost ? 'true' : 'false');
            if (s.bassFilter && s.audioContext) {
                s.bassFilter.gain.setTargetAtTime(s.isBassBoost ? 3.8 : 0, now, 0.04);
            }
        } else if (type === 'vocal') {
            s.isVocalBoost = active;
            safeStorage.setItem('cachymusic_vocal_boost', s.isVocalBoost ? 'true' : 'false');
            if (s.vocalFilter && s.audioContext) {
                s.vocalFilter.gain.setTargetAtTime(s.isVocalBoost ? 2.8 : 0, now, 0.04);
            }
        } else if (type === 'treble') {
            s.isTrebleBoost = active;
            safeStorage.setItem('cachymusic_treble_boost', s.isTrebleBoost ? 'true' : 'false');
            if (s.trebleFilter && s.audioContext) {
                s.trebleFilter.gain.setTargetAtTime(s.isTrebleBoost ? 3.0 : 0, now, 0.04);
            }
        } else if (type === 'xfeed') {
            s.isCrossfeed = active;
            safeStorage.setItem('cachymusic_crossfeed', s.isCrossfeed ? 'true' : 'false');
        } else if (type === 'subsonic') {
            s.isSubsonic = active;
            safeStorage.setItem('cachymusic_subsonic', s.isSubsonic ? 'true' : 'false');
            if (s.subsonicFilter && s.audioContext) {
                s.subsonicFilter.frequency.setTargetAtTime(s.isSubsonic ? 20 : 5, now, 0.04);
            }
        } else if (type === 'agp') {
            s.isAgpEnabled = active;
            safeStorage.setItem('cachymusic_agp', s.isAgpEnabled ? 'true' : 'false');
        } else if (type === 'surround') {
            s.isSurroundWidener = active;
            safeStorage.setItem('cachymusic_surround_ms', s.isSurroundWidener ? 'true' : 'false');
        } else if (type === 'phase') {
            s.isPhaseInvert = active;
            safeStorage.setItem('cachymusic_phase_invert', s.isPhaseInvert ? 'true' : 'false');
        } else if (type === 'mono') {
            s.isMonoMix = active;
            safeStorage.setItem('cachymusic_mono_mix', s.isMonoMix ? 'true' : 'false');
        }

        updateWorkletParams();
        updatePreAmpGain(now);
        updateAudioRouting();
        updateLimiterState(now);
        updateDspButtonsUi();
        store.emit('dsp:change');
    }

    function toggleDspBoost(type) {
        const s = store.state;
        if (type === 'limiter') setDspBoost('limiter', !s.isLimiter);
        else if (type === 'amp') setDspBoost('amp', !s.isAmpBoost);
        else if (type === 'bass') setDspBoost('bass', !s.isBassBoost);
        else if (type === 'vocal') setDspBoost('vocal', !s.isVocalBoost);
        else if (type === 'treble') setDspBoost('treble', !s.isTrebleBoost);
        else if (type === 'xfeed') setDspBoost('xfeed', !s.isCrossfeed);
        else if (type === 'subsonic') setDspBoost('subsonic', !s.isSubsonic);
        else if (type === 'agp') setDspBoost('agp', !s.isAgpEnabled);
        else if (type === 'surround') setDspBoost('surround', !s.isSurroundWidener);
        else if (type === 'phase') setDspBoost('phase', !s.isPhaseInvert);
        else if (type === 'mono') setDspBoost('mono', !s.isMonoMix);
        else if (type === 'peq') {
            const peqModal = document.getElementById('peqModal');
            if (peqModal) {
                const isCurrentlyOpen = peqModal.style.display === 'flex' || window.getComputedStyle(peqModal).display === 'flex';
                if (isCurrentlyOpen) {
                    if (typeof s.closePeqModal === 'function') s.closePeqModal();
                    else peqModal.style.display = 'none';
                } else {
                    if (typeof s.openPeqModal === 'function') s.openPeqModal();
                    else {
                        peqModal.style.display = 'flex';
                        setTimeout(drawPeqCurve, 40);
                    }
                }
            }
        }
    }

    function updateDspButtonsUi() {
        const s = store.state;
        const dspBtns = document.querySelectorAll('[data-target="limiter"], [data-target="amp"], [data-target="bass"], [data-target="vocal"], [data-target="treble"], [data-target="xfeed"], [data-target="subsonic"], [data-target="agp"], [data-target="surround"], [data-target="phase"], [data-target="mono"], [data-target="peq"]');
        dspBtns.forEach(btn => {
            const target = btn.dataset.target;
            const isActive = (target === 'limiter' && s.isLimiter) ||
                             (target === 'amp' && s.isAmpBoost) ||
                             (target === 'bass' && s.isBassBoost) ||
                             (target === 'vocal' && s.isVocalBoost) ||
                             (target === 'treble' && s.isTrebleBoost) ||
                             (target === 'xfeed' && s.isCrossfeed) ||
                             (target === 'subsonic' && s.isSubsonic) ||
                             (target === 'agp' && s.isAgpEnabled) ||
                             (target === 'surround' && s.isSurroundWidener) ||
                             (target === 'phase' && s.isPhaseInvert) ||
                             (target === 'mono' && s.isMonoMix) ||
                             (target === 'peq' && !s.isPeqBypassed && s.peqGains.some(g => g !== 0));
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            const dot = btn.querySelector('.dspDot');
            if (dot) dot.classList.toggle('active', isActive);
        });

        const peqXfeedStatus = document.getElementById('peqXfeedStatus');
        if (peqXfeedStatus) peqXfeedStatus.textContent = s.isCrossfeed ? 'ON' : 'OFF';
        const peqAgpStatus = document.getElementById('peqAgpStatus');
        if (peqAgpStatus) peqAgpStatus.textContent = s.isAgpEnabled ? 'GUARD ON' : 'BYPASS';
        const peqSurroundStatus = document.getElementById('peqSurroundStatus');
        if (peqSurroundStatus) peqSurroundStatus.textContent = s.isSurroundWidener ? '135% WIDE' : '100%';
        const peqPhaseStatus = document.getElementById('peqPhaseStatus');
        if (peqPhaseStatus) peqPhaseStatus.textContent = s.isPhaseInvert ? '180° INV' : '0° NORM';
        const peqMonoStatus = document.getElementById('peqMonoStatus');
        if (peqMonoStatus) peqMonoStatus.textContent = s.isMonoMix ? 'MONO L+R' : 'STEREO';

        const isPeqActive = !s.isPeqBypassed && s.peqGains.some(g => g !== 0);
        const playerPeqBadge = document.getElementById('playerPeqBadge');
        if (playerPeqBadge) {
            playerPeqBadge.textContent = isPeqActive ? 'ACTIVE' : '10-BAND';
            playerPeqBadge.classList.toggle('active', isPeqActive);
        }

        const activeDspCount = [s.isAmpBoost, s.isBassBoost, s.isVocalBoost, s.isTrebleBoost, s.isLimiter, s.isCrossfeed, s.isSurroundWidener, s.isPhaseInvert, s.isMonoMix].filter(Boolean).length;
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
            peqDspActiveSummary.textContent = activeDspCount > 0 ? `${activeDspCount} ACTIVE` : (s.isAgpEnabled ? 'AGP GUARD READY' : 'ALL BYPASSED');
            peqDspActiveSummary.classList.toggle('active', activeDspCount > 0 || s.isAgpEnabled);
        }

        const playerPeqBtn = document.getElementById('playerPeqBtn');
        if (playerPeqBtn) {
            playerPeqBtn.classList.toggle('active', isPeqActive || activeDspCount > 0);
        }

        store.emit('ui:sync-dac-status');
        store.emit('ui:sync-track-badge');
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
        const s = store.state;
        if (bandIndex < 0 || bandIndex >= PEQ_FREQS.length) return;
        const clampedGain = Math.max(-15, Math.min(15, Number(gainDb) || 0));
        s.peqGains[bandIndex] = clampedGain;
        try {
            safeStorage.setItem('cachymusic_peq_gains', JSON.stringify(s.peqGains));
        } catch (_) {}

        if (s.peqNodes && s.peqNodes[bandIndex] && s.audioContext) {
            const now = s.audioContext.currentTime;
            s.peqNodes[bandIndex].gain.setTargetAtTime(s.isPeqBypassed ? 0 : clampedGain, now, 0.04);
        }
        updateWorkletParams();
        updatePreAmpGain(s.audioContext ? s.audioContext.currentTime : 0);
        updateAudioRouting();
        updateLimiterState(s.audioContext ? s.audioContext.currentTime : 0);
        updateDspButtonsUi();
    }

    function setPeqBandQ(bandIndex, qVal) {
        const s = store.state;
        if (bandIndex < 0 || bandIndex >= PEQ_FREQS.length) return;
        const clampedQ = Math.max(0.4, Math.min(8.0, Number(qVal) || 1.41));
        s.peqQs[bandIndex] = clampedQ;
        try {
            safeStorage.setItem('cachymusic_peq_qs', JSON.stringify(s.peqQs));
        } catch (_) {}

        if (s.peqNodes && s.peqNodes[bandIndex] && s.audioContext) {
            s.peqNodes[bandIndex].Q.setTargetAtTime(clampedQ, s.audioContext.currentTime, 0.03);
        }
        updateWorkletParams();
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

    function drawPeqCurve() {
        renderPeqCurve(document.getElementById('peqCurveCanvas'), store.state, PEQ_FREQS);
    }

    let spectrumView = null;
    function refreshSpectrum() { spectrumView?.refresh(); }
    function getSpectrumSignal() {
        const s = store.state;
        if (!s.isPlaying) return {reason: 'Spectrum · paused'};
        if (!s.isSoftwareDecoding && (!s.audio || s.audio.paused || !s.audio.getAttribute('src'))) {
            return {reason: 'Spectrum unavailable for this playback route'};
        }
        if (!getConfirmedAudioRoute() || s.analyser?.context !== s.audioContext) return {reason: 'Spectrum unavailable'};
        return {analyser: s.analyser, context: s.audioContext};
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
        spectrumView?.dispose();
        spectrumView = createSpectrumView({
            eqCanvas: document.getElementById('peqSpectrumCanvas'),
            desktopCanvas: document.getElementById('desktopSpectrumCanvas'),
            status: document.getElementById('peqSpectrumStatus'),
            getSignal: getSpectrumSignal
        });
        refreshSpectrum();

        function syncBipolarSliderFill(slider, val, minVal, maxVal) {
            if (!slider) return;
            const span = (maxVal - minVal) || 1;
            const pct = Math.max(0, Math.min(100, ((val - minVal) / span) * 100));
            slider.style.setProperty('--fill-low', `${Math.min(50, pct).toFixed(2)}%`);
            slider.style.setProperty('--fill-high', `${Math.max(50, pct).toFixed(2)}%`);
            slider.dataset.polarity = val > 0.01 ? 'boost' : (val < -0.01 ? 'cut' : 'flat');
        }

        // Populate 10 Tactile Vertical Faders
        const s = store.state;
        peqGrid.innerHTML = '';
        PEQ_FREQS.forEach((freq, i) => {
            const col = document.createElement('div');
            col.className = 'peqFaderCol';
            const val = s.peqGains[i] || 0;
            const qVal = (s.peqQs && s.peqQs[i]) ? s.peqQs[i] : 1.41;
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
                    const sgn = gain > 0 ? '+' : '';
                    dbEl.textContent = `${sgn}${gain.toFixed(1)}`;
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
                    const curQ = s.peqQs[i] || 1.41;
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
            if (bypassBtn) bypassBtn.classList.toggle('bypassed', s.isPeqBypassed);
            if (bypassText) bypassText.textContent = s.isPeqBypassed ? 'BYPASS' : 'ACTIVE';
            if (playerEqBtn) {
                const isPeqActive = !s.isPeqBypassed && s.peqGains.some(g => g !== 0);
                const activeDspCount = [s.isAmpBoost, s.isBassBoost, s.isVocalBoost, s.isTrebleBoost, s.isLimiter, s.isCrossfeed].filter(Boolean).length;
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
                s.isPeqBypassed = !s.isPeqBypassed;
                safeStorage.setItem('cachymusic_peq_bypassed', s.isPeqBypassed ? 'true' : 'false');
                updateBypassUi();
                for (let i = 0; i < PEQ_FREQS.length; i++) {
                    if (s.peqNodes[i] && s.audioContext) {
                        s.peqNodes[i].gain.setTargetAtTime(s.isPeqBypassed ? 0 : s.peqGains[i], s.audioContext.currentTime, 0.04);
                    }
                }
                updateWorkletParams();
                updatePreAmpGain(s.audioContext ? s.audioContext.currentTime : 0);
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
            const initBalPct = Math.round(s.stereoBalance * 100);
            balanceSlider.value = initBalPct;
            syncBipolarSliderFill(balanceSlider, initBalPct, -100, 100);
            if (balanceValueEl) balanceValueEl.textContent = formatStereoBalanceText(s.stereoBalance);
            balanceSlider.addEventListener('input', (e) => {
                const rawPct = parseInt(e.target.value, 10) || 0;
                s.stereoBalance = Math.max(-1.0, Math.min(1.0, rawPct / 100));
                syncBipolarSliderFill(balanceSlider, rawPct, -100, 100);
                safeStorage.setItem('cachymusic_stereo_balance', s.stereoBalance.toFixed(2));
                if (balanceValueEl) balanceValueEl.textContent = formatStereoBalanceText(s.stereoBalance);
                updateWorkletParams();
                updateAudioRouting();
            });
        }

        if (balanceResetBtn) {
            balanceResetBtn.addEventListener('click', () => {
                s.stereoBalance = 0;
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
            const audioEl = s.audio;
            if (!audioEl) return;
            try {
                audioEl.preservesPitch = s.isPitchLockTempo;
                audioEl.mozPreservesPitch = s.isPitchLockTempo;
                audioEl.webkitPreservesPitch = s.isPitchLockTempo;
            } catch (_) {}
            if (pitchLockBtn) {
                pitchLockBtn.textContent = s.isPitchLockTempo ? 'PITCH-LOCK TEMPO' : 'ANALOG VINYL PITCH';
                pitchLockBtn.classList.toggle('active', s.isPitchLockTempo);
            }
        }
        applyAudioPitchLockMode();

        if (pitchLockBtn) {
            pitchLockBtn.addEventListener('click', () => {
                s.isPitchLockTempo = !s.isPitchLockTempo;
                safeStorage.setItem('cachymusic_pitch_lock', s.isPitchLockTempo ? 'true' : 'false');
                applyAudioPitchLockMode();
                showToast(s.isPitchLockTempo ? 'Pitch-Lock Enabled: Independent Tempo' : 'Pitch follows playback speed');
            });
        }

        if (presetSelect) {
            presetSelect.addEventListener('change', () => {
                setPeqPreset(presetSelect.value);
                for (let i = 0; i < PEQ_FREQS.length; i++) {
                    const slider = document.getElementById(`peqSlider-${i}`);
                    const dbEl = document.getElementById(`peqFaderDb-${i}`);
                    const g = s.peqGains[i];
                    if (slider) {
                        slider.value = g;
                        syncBipolarSliderFill(slider, g, -15, 15);
                    }
                    if (dbEl) {
                        const sgn = g > 0 ? '+' : '';
                        dbEl.textContent = `${sgn}${g.toFixed(1)}`;
                        dbEl.className = `peqFaderDb ${g > 0 ? 'boost' : (g < 0 ? 'cut' : '')}`;
                    }
                }
                if (s.isPeqBypassed) {
                    s.isPeqBypassed = false;
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
                        const g = s.peqGains[i];
                        if (slider) {
                            slider.value = g;
                            syncBipolarSliderFill(slider, g, -15, 15);
                        }
                        if (dbEl) {
                            const sgn = g > 0 ? '+' : '';
                            dbEl.textContent = `${sgn}${g.toFixed(1)}`;
                            dbEl.className = `peqFaderDb ${g > 0 ? 'boost' : (g < 0 ? 'cut' : '')}`;
                        }
                    }
                    if (autoEqDrawer) autoEqDrawer.style.display = 'none';
                    if (s.isPeqBypassed) {
                        s.isPeqBypassed = false;
                        safeStorage.setItem('cachymusic_peq_bypassed', 'false');
                        updateBypassUi();
                    }
                    drawPeqCurve();
                }
            });
        }

        s.openPeqModal = function() {
            if (!peqModal) return;
            peqModal.style.display = 'flex';
            pushModalState('peqModal');
            refreshSpectrum();
            drawPeqCurve();
            requestAnimationFrame(() => {
                drawPeqCurve();
                setTimeout(drawPeqCurve, 60);
            });
        };

        s.closePeqModal = function() {
            if (!peqModal) return;
            peqModal.style.display = 'none';
            popModalState('peqModal');
            spectrumView?.stop();
            refreshSpectrum();
        };

        if (closeBtn) closeBtn.addEventListener('click', s.closePeqModal);

        if (peqModal) {
            peqModal.addEventListener('click', (e) => {
                if (e.target === peqModal) s.closePeqModal();
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
    const loadDspWorklet = createWorkletLoader({
        current: () => store.state.audioContext,
        isCurrent: ctx => store.state.audioContext === ctx && ctx.state !== 'closed',
        install(targetCtx) {
            const s = store.state;
            const node = new AudioWorkletNode(targetCtx, 'cachymusic-dsp-processor', {
                numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2]
            });
            s.dspWorkletNode = node;
            node.onprocessorerror = error => {
                if (s.dspWorkletNode !== node) return;
                console.warn('[AudioWorklet] Processor failed; using fallback:', error);
                releaseDspWorklet();
                updateAudioRouting();
            };
            node.port.onmessage = ({data}) => {
                if (s.dspWorkletNode !== node || data?.type !== 'agp_telemetry') return;
                const status = document.getElementById('peqAgpStatus');
                if (status && s.isAgpEnabled && Number.isFinite(data.gainReductionDb)) {
                    status.textContent = data.gainReductionDb < -0.1 ? `${data.gainReductionDb.toFixed(1)} dB` : 'GUARD ON';
                }
            };
            updateAudioRouting();
        },
        failed(error) {
            console.warn('[AudioWorklet] Fallback to native Web Audio graph:', error);
            releaseDspWorklet();
            updateAudioRouting();
        }
    });

    function releaseDspWorklet() {
        const s = store.state;
        const node = s.dspWorkletNode;
        if (!node) return;
        s.dspWorkletNode = null;
        node.onprocessorerror = null;
        node.port.onmessage = null;
        try { node.port.close(); } catch (_) {}
        try { node.disconnect(); } catch (_) {}
    }

    function computeReplayGainMultiplier() { return computeReplayGainMultiplierPolicy(store.state); }

    function hasUserShapingDsp() { return hasUserShapingDspPolicy(store.state); }

    function updateWorkletParams() {
        const s = store.state;
        if (!s.dspWorkletNode || !s.dspWorkletNode.port) return;
        const sr = (s.audioContext && s.audioContext.sampleRate) ? s.audioContext.sampleRate : 48000;
        const rg = computeReplayGainMultiplier();
        const preAmp = getPreAmpGainValue();
        const amp = getEffectiveAmplification();
        const curTrack = s.allTracks[s.currentTrackIndex];
        const trackBits = (curTrack && curTrack.bitsPerSample) ? Number(curTrack.bitsPerSample) : 0;
        const usePrecision64 = (s.mathPrecision === '64') && s.isPrecision64;
        const quantBits = (trackBits === 16 && sr <= 48000 && !usePrecision64) ? 16 : 24;

        s.dspWorkletNode.port.postMessage({
            precision64: usePrecision64,
            agpEnabled: s.isAgpEnabled,
            limiterEnabled: Boolean(s.isLimiter || s.currentVolumeValue > 1.0),
            subsonicEnabled: s.isSubsonic,
            ultrasonicEnabled: s.isUltrasonic,
            ultrasonicCutoff: s.ultrasonicCutoff,
            ditherMode: s.ditherMode,
            quantizationBits: quantBits,
            linearGainTarget: rg * preAmp * amp,
            peqBypassed: s.isPeqBypassed,
            peqGains: Array.isArray(s.peqGains) ? [...s.peqGains] : new Array(10).fill(0),
            peqQs: Array.isArray(s.peqQs) ? [...s.peqQs] : new Array(10).fill(1.41),
            bassBoost: s.isBassBoost,
            vocalBoost: s.isVocalBoost,
            trebleBoost: s.isTrebleBoost,
            crossfeedEnabled: s.isCrossfeed,
            ambiophonicsEnabled: s.isAmbiophonics,
            ambiophonicsDelaySamples: Math.max(1, Math.min(32, Math.round(0.000083 * sr))),
            ambiophonicsAttenuation: 0.65,
            phaseInvert: s.isPhaseInvert,
            monoMix: s.isMonoMix,
            stereoWidth: s.isSurroundWidener ? 1.35 : 1.0,
            stereoBalance: s.stereoBalance
        });
    }

    // Enumeration does not verify the active physical output or DAC rate.
    async function checkDacCapabilities() {
        const s = store.state;
        let description = 'Physical output not verified';
        try {
            const outputs = (await navigator.mediaDevices?.enumerateDevices?.() || []).filter(device => device.kind === 'audiooutput');
            if (outputs.length) description = `${outputs.length} browser-reported output(s); active hardware not verified`;
        } catch (_) { /* Browser may redact device information. */ }
        s.hasExternalDac = false;
        s.detectedDacLabel = description;
        document.documentElement.removeAttribute('data-dac');
        const badge = document.getElementById('settingsDetectedDacBadge');
        if (badge) badge.textContent = description;
        await checkHardwareGainStatus();
        return {hasDac:false, dacLabel:description};
    }

    // System Volume Control (Android AudioManager / Linux PipeWire / ALSA Bridge)
    let hwVolumeDebounceTimer = null;
    async function checkHardwareGainStatus() {
        const s = store.state;
        const rt = getRuntime();
        const hasAndroidBridge = typeof window !== 'undefined' && Boolean(window.AndroidBridge && typeof window.AndroidBridge.getHardwareVolumeStatusJson === 'function');
        if (!rt.hasHardwareGain && !hasAndroidBridge) {
            markHwGainUnavailable();
            return;
        }
        try {
            let data = null;
            if (hasAndroidBridge) {
                data = JSON.parse(window.AndroidBridge.getHardwareVolumeStatusJson() || '{}');
            } else if (rt.hasPhpBackend) {
                const res = await fetch('php/api/hardware_volume.php?action=status');
                if (!res.ok) {
                    markHwGainUnavailable();
                    return;
                }
                data = await res.json();
            }

            if (data && data.success) {
                s.hwVolumeBackend = data.backend || 'none';
                s.hwGainAvailable = Boolean(data.available);
                const pill = document.getElementById('settingsHardwareGainPill');
                const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
                const hwGainDot = document.getElementById('settingsHwGainDot');
                const hwGainText = document.getElementById('settingsHwGainText');
                const devTag = data.activeDevice ? `${s.hwVolumeBackend.toUpperCase()} • ${data.activeDevice}` : s.hwVolumeBackend.toUpperCase();
                if (pill) {
                    pill.textContent = data.available ? `READY (${devTag})` : 'UNAVAILABLE';
                }
                if (!data.available) {
                    s.isHardwareGain = false;
                    if (hwGainBtn) {
                        hwGainBtn.disabled = true;
                        hwGainBtn.classList.add('disabled');
                        hwGainBtn.classList.remove('active');
                        hwGainBtn.setAttribute('aria-disabled', 'true');
                        hwGainBtn.title = 'System Volume Control is unavailable on this platform or output interface.';
                    }
                    if (hwGainDot) hwGainDot.classList.remove('active');
                    if (hwGainText) hwGainText.textContent = 'SYSTEM VOLUME: UNAVAILABLE';
                } else {
                    if (hwGainBtn) {
                        hwGainBtn.disabled = false;
                        hwGainBtn.classList.remove('disabled');
                        hwGainBtn.removeAttribute('aria-disabled');
                        hwGainBtn.title = hasAndroidBridge
                            ? 'Direct Android AudioManager / USB DAC physical stream volume control.'
                            : 'Direct PipeWire/ALSA physical volume bridge.';
                    }
                    if (typeof s.syncHwGainDraftUi === 'function') {
                        s.syncHwGainDraftUi();
                    } else if (hwGainText && s.isHardwareGain) {
                        hwGainText.textContent = `SYSTEM VOLUME: ON (${s.hwVolumeBackend.toUpperCase()})`;
                    }
                }
                if (s.isHardwareGain && data.available && typeof data.volume === 'number') {
                    s.currentVolumeValue = Math.max(0, Math.min(1.5, data.volume));
                    syncVolumeSliders(s.currentVolumeValue, volumeSlider, miniVolumeSlider);
                    if (volumeLevel) {
                        const pct = Math.round(s.currentVolumeValue * 100);
                        volumeLevel.textContent = s.currentVolumeValue > 1.0 ? `${pct}% HW-AMP` : `${pct}%`;
                    }
                    store.emit('ui:sync-volume-icon', { volume: Math.min(1.0, s.currentVolumeValue) });
                    if (s.audio) {
                        s.audio.volume = 1.0; // Unity media gain; physical output is not verified.
                        s.audio.muted = data.muted || false;
                    }
                    syncSoftwareVolume();
                }
            } else {
                markHwGainUnavailable();
            }
        } catch (_) {
            markHwGainUnavailable();
        }
    }

    function markHwGainUnavailable() {
        const s = store.state;
        const wasHardware = s.isHardwareGain;
        s.isHardwareGain = false;
        s.hwGainAvailable = false;
        if (wasHardware) {
            if (s.audio) s.audio.volume = Math.max(0, Math.min(1, s.currentVolumeValue));
            syncSoftwareVolume();
        }
        const pill = document.getElementById('settingsHardwareGainPill');
        const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
        const hwGainDot = document.getElementById('settingsHwGainDot');
        const hwGainText = document.getElementById('settingsHwGainText');
        if (pill) {
            pill.textContent = s.hasExternalDac
                ? `DAC DETECTED (${s.detectedDacLabel}) • OS VOL ONLY`
                : 'UNAVAILABLE';
        }
        if (hwGainBtn) {
            hwGainBtn.disabled = true;
            hwGainBtn.classList.add('disabled');
            hwGainBtn.classList.remove('active');
            hwGainBtn.setAttribute('aria-disabled', 'true');
            hwGainBtn.title = s.hasExternalDac
                ? 'Browser sandbox blocks direct USB DAC hardware volume registers; use system volume or CachyMusic Android APK / Linux PHP Desktop.'
                : 'System Volume Control is unavailable on this platform or output interface.';
        }
        if (hwGainDot) hwGainDot.classList.remove('active');
        if (hwGainText) {
            hwGainText.textContent = s.hasExternalDac ? 'SYSTEM VOLUME: BROWSER OS-LOCKED' : 'SYSTEM VOLUME: UNAVAILABLE';
        }
    }

    function dispatchHardwareVolume(vol) {
        const rt = getRuntime();
        const hasAndroidBridge = typeof window !== 'undefined' && Boolean(window.AndroidBridge && typeof window.AndroidBridge.setHardwareStreamVolume === 'function');
        if (!store.state.isHardwareGain || (!rt.hasHardwareGain && !hasAndroidBridge)) return;
        if (hwVolumeDebounceTimer) clearTimeout(hwVolumeDebounceTimer);
        hwVolumeDebounceTimer = setTimeout(() => {
            if (hasAndroidBridge) {
                try {
                    window.AndroidBridge.setHardwareStreamVolume(Math.max(0, Math.min(1.0, vol)));
                } catch (_) {}
                return;
            }
            if (rt.hasPhpBackend) {
                fetch('php/api/hardware_volume.php?action=set_volume', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ volume: vol })
                }).catch(() => {});
            }
        }, 35);
    }

    // Neutron HiFi™ Settings Controls Wiring
    function setupNeutronSettingsControls() {
        const s = store.state;
        const applyAudioBtn = document.getElementById('settingsApplyAudioBtn');
        const discardAudioBtn = document.getElementById('settingsDiscardAudioBtn');
        const applyAudioStatus = document.getElementById('settingsApplyAudioStatus');

        function snapshotCommittedAudioState() {
            return {
                mathPrecision: s.mathPrecision || (s.isPrecision64 ? '64' : '32'),
                isHardwareGain: Boolean(s.isHardwareGain),
                isUltrasonic: Boolean(s.isUltrasonic),
                ultrasonicCutoff: parseInt(s.ultrasonicCutoff, 10) || 32000,
                ditherMode: s.ditherMode || 'tpdf',
                isAmbiophonics: Boolean(s.isAmbiophonics),
                bufferLatencyTarget: s.bufferLatencyTarget || 'playback',
                debugModeActive: Boolean(s.debugModeActive)
            };
        }

        let draft = snapshotCommittedAudioState();

        function getPendingDiffList() {
            const committed = snapshotCommittedAudioState();
            const diffs = [];
            if (draft.mathPrecision !== committed.mathPrecision) {
                diffs.push(`Precision: ${draft.mathPrecision === 'native' ? 'Native' : (draft.mathPrecision === '64' ? '64-Bit' : '32-Bit')}`);
            }
            if (draft.isHardwareGain !== committed.isHardwareGain) {
                diffs.push(`Hardware Gain: ${draft.isHardwareGain ? 'ON' : 'OFF'}`);
            }
            if (draft.isUltrasonic !== committed.isUltrasonic || draft.ultrasonicCutoff !== committed.ultrasonicCutoff) {
                diffs.push(`Ultrasonic: ${draft.isUltrasonic ? Math.round(draft.ultrasonicCutoff / 1000) + 'kHz' : 'OFF'}`);
            }
            if (draft.ditherMode !== committed.ditherMode) {
                diffs.push(`Dither: ${draft.ditherMode.toUpperCase()}`);
            }
            if (draft.isAmbiophonics !== committed.isAmbiophonics) {
                diffs.push(`Ambiophonics: ${draft.isAmbiophonics ? 'ON' : 'OFF'}`);
            }
            if (draft.bufferLatencyTarget !== committed.bufferLatencyTarget) {
                diffs.push(`Buffer: ${draft.bufferLatencyTarget === 'interactive' ? 'Low-Latency' : 'Playback'}`);
            }
            if (draft.debugModeActive !== committed.debugModeActive) {
                diffs.push(`Debug HUD: ${draft.debugModeActive ? 'ON' : 'OFF'}`);
            }
            return diffs;
        }

        function refreshPendingAudioBanner() {
            const diffs = getPendingDiffList();
            const count = diffs.length;
            if (applyAudioBtn) {
                applyAudioBtn.textContent = count > 0
                    ? `APPLY AUDIO SETTINGS (${count} PENDING)`
                    : 'APPLY AUDIO SETTINGS';
                applyAudioBtn.style.boxShadow = count > 0
                    ? '0 0 16px var(--accent-glow, rgba(0,240,255,0.4))'
                    : '';
            }
            if (discardAudioBtn) {
                discardAudioBtn.style.display = count > 0 ? '' : 'none';
            }
            if (applyAudioStatus) {
                if (count > 0) {
                    applyAudioStatus.textContent = `Staged (not active yet): ${diffs.join(' • ')}. Click Apply to activate.`;
                    applyAudioStatus.style.color = 'var(--accent-primary, #38bdf8)';
                } else {
                    applyAudioStatus.textContent = 'Saved audio preferences match the controls. Processing depends on the active playback mode.';
                    applyAudioStatus.style.color = '';
                }
            }
        }

        // 1. Math Precision Architecture (Native Bypass | 64-Bit Studio | 32-Bit Fast)
        const precisionBtns = document.querySelectorAll('.enginePrecisionBtn');
        const precisionPill = document.getElementById('settingsEnginePrecisionPill');
        const updatePrecisionUi = () => {
            const cur = draft.mathPrecision;
            precisionBtns.forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-precision') === cur);
            });
            if (precisionPill) {
                precisionPill.textContent = cur === 'native'
                    ? 'NATIVE (SOURCE BYPASS)'
                    : (cur === '64' ? '64-BIT DOUBLE FLOAT' : '32-BIT FAST FLOAT');
            }
        };
        updatePrecisionUi();
        precisionBtns.forEach(b => {
            b.addEventListener('click', () => {
                const nextMode = b.getAttribute('data-precision') || '64';
                draft.mathPrecision = (nextMode === 'native' || nextMode === '32' || nextMode === '64') ? nextMode : '64';
                updatePrecisionUi();
                refreshPendingAudioBanner();
            });
        });

        // 2. System Volume Control (Android AudioManager / Linux PipeWire / ALSA)
        const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
        const hwGainDot = document.getElementById('settingsHwGainDot');
        const hwGainText = document.getElementById('settingsHwGainText');
        const updateHwGainUi = () => {
            if (!s.hwGainAvailable) {
                if (hwGainBtn) hwGainBtn.classList.remove('active');
                if (hwGainDot) hwGainDot.classList.remove('active');
                if (hwGainText) {
                    hwGainText.textContent = s.hasExternalDac ? 'SYSTEM VOLUME: BROWSER OS-LOCKED' : 'SYSTEM VOLUME: UNAVAILABLE';
                }
                return;
            }
            if (hwGainBtn) hwGainBtn.classList.toggle('active', draft.isHardwareGain);
            if (hwGainDot) hwGainDot.classList.toggle('active', draft.isHardwareGain);
            if (hwGainText) {
                hwGainText.textContent = draft.isHardwareGain
                    ? `SYSTEM VOLUME: ON (${String(s.hwVolumeBackend || 'READY').toUpperCase()})`
                    : 'SYSTEM VOLUME: OFF';
            }
        };
        s.syncHwGainDraftUi = updateHwGainUi;
        s.syncHwGainCapabilitiesUi = () => {
            const pill = document.getElementById('settingsHardwareGainPill');
            if (!s.hwGainAvailable && pill) {
                pill.textContent = s.hasExternalDac
                    ? `DAC DETECTED (${s.detectedDacLabel}) • OS VOL ONLY`
                    : 'UNAVAILABLE';
            }
            updateHwGainUi();
        };
        updateHwGainUi();
        if (hwGainBtn) {
            hwGainBtn.addEventListener('click', () => {
                if (hwGainBtn.disabled || hwGainBtn.classList.contains('disabled') || !s.hwGainAvailable) return;
                draft.isHardwareGain = !draft.isHardwareGain;
                updateHwGainUi();
                refreshPendingAudioBanner();
            });
        }

        // 3. Ultrasonic IMD Filter
        const ultrasonicBtn = document.getElementById('settingsUltrasonicToggleBtn');
        const ultrasonicDot = document.getElementById('settingsUltrasonicDot');
        const ultrasonicText = document.getElementById('settingsUltrasonicText');
        const ultrasonicSelect = document.getElementById('settingsUltrasonicCutoffSelect');
        const ultrasonicPill = document.getElementById('settingsUltrasonicPill');
        const updateUltrasonicUi = () => {
            if (ultrasonicBtn) ultrasonicBtn.classList.toggle('active', draft.isUltrasonic);
            if (ultrasonicDot) ultrasonicDot.classList.toggle('active', draft.isUltrasonic);
            if (ultrasonicText) {
                ultrasonicText.textContent = draft.isUltrasonic ? 'ULTRASONIC FILTER: ON' : 'ULTRASONIC FILTER: OFF';
            }
            if (ultrasonicPill) {
                ultrasonicPill.textContent = ultrasonicFilterStatus({enabled:draft.isUltrasonic, cutoffHz:draft.ultrasonicCutoff, contextRateHz:s.audioContext?.sampleRate, workletReady:Boolean(s.dspWorkletNode) && draft.isUltrasonic === s.isUltrasonic && draft.ultrasonicCutoff === s.ultrasonicCutoff}).text;
            }
            if (ultrasonicSelect) {
                ultrasonicSelect.value = draft.ultrasonicCutoff.toString();
            }
        };
        updateUltrasonicUi();
        if (ultrasonicBtn) {
            ultrasonicBtn.addEventListener('click', () => {
                draft.isUltrasonic = !draft.isUltrasonic;
                updateUltrasonicUi();
                refreshPendingAudioBanner();
            });
        }
        if (ultrasonicSelect) {
            ultrasonicSelect.addEventListener('change', () => {
                draft.ultrasonicCutoff = parseInt(ultrasonicSelect.value, 10) || 32000;
                updateUltrasonicUi();
                refreshPendingAudioBanner();
            });
        }

        // 4. Dithering & Noise Shaping
        const ditherBtns = document.querySelectorAll('.ditherModeBtn');
        const ditherPill = document.getElementById('settingsDitherPill');
        const updateDitherUi = () => {
            ditherBtns.forEach(b => {
                const mode = b.getAttribute('data-dither');
                b.classList.toggle('active', mode === draft.ditherMode);
            });
            if (ditherPill) {
                ditherPill.textContent = draft.ditherMode === 'shaped'
                    ? 'Noise-shaped'
                    : (draft.ditherMode === 'tpdf' ? 'TPDF' : 'Off');
            }
        };
        updateDitherUi();
        ditherBtns.forEach(b => {
            b.addEventListener('click', () => {
                if (b.disabled || b.classList.contains('disabled')) return;
                draft.ditherMode = b.getAttribute('data-dither') || 'tpdf';
                updateDitherUi();
                refreshPendingAudioBanner();
            });
        });

        const scanDacBtn = document.getElementById('settingsScanDacBtn');
        if (scanDacBtn) {
            scanDacBtn.addEventListener('click', async () => {
                const origText = scanDacBtn.textContent;
                scanDacBtn.disabled = true;
                scanDacBtn.textContent = 'SCANNING...';
                try {
                    const res = await checkDacCapabilities(true);
                    showCachyToast('Audio output', res.dacLabel, 'info');
                } finally {
                    scanDacBtn.textContent = origText;
                    scanDacBtn.disabled = false;
                }
            });
        }

        // 5. Speaker Ambiophonics R.A.C.E.
        const ambiBtn = document.getElementById('settingsAmbiToggleBtn');
        const ambiDot = document.getElementById('settingsAmbiDot');
        const ambiText = document.getElementById('settingsAmbiText');
        const ambiPill = document.getElementById('settingsAmbiPill');
        const updateAmbiUi = () => {
            if (ambiBtn) ambiBtn.classList.toggle('active', draft.isAmbiophonics);
            if (ambiDot) ambiDot.classList.toggle('active', draft.isAmbiophonics);
            if (ambiText) {
                ambiText.textContent = draft.isAmbiophonics ? 'AMBIOPHONICS: ON (R.A.C.E.)' : 'AMBIOPHONICS: OFF (SPEAKERS ONLY)';
            }
            if (ambiPill) {
                ambiPill.textContent = draft.isAmbiophonics ? 'ACTIVE (R.A.C.E.)' : 'BYPASS';
            }
        };
        updateAmbiUi();
        if (ambiBtn) {
            ambiBtn.addEventListener('click', () => {
                draft.isAmbiophonics = !draft.isAmbiophonics;
                updateAmbiUi();
                refreshPendingAudioBanner();
            });
        }

        // 6. Audio Buffer & Latency Tuning
        const bufferBtns = document.querySelectorAll('.bufferLatencyBtn');
        const bufferPill = document.getElementById('settingsBufferPill');
        const updateBufferUi = () => {
            bufferBtns.forEach(b => {
                const latency = b.getAttribute('data-latency');
                b.classList.toggle('active', latency === draft.bufferLatencyTarget);
            });
            if (bufferPill) {
                bufferPill.textContent = draft.bufferLatencyTarget === 'interactive'
                    ? 'LOW LATENCY'
                    : 'STABLE';
            }
        };
        updateBufferUi();
        bufferBtns.forEach(b => {
            b.addEventListener('click', () => {
                draft.bufferLatencyTarget = b.getAttribute('data-latency') || 'playback';
                updateBufferUi();
                refreshPendingAudioBanner();
            });
        });

        // 7. Settings Confirmation & Apply / Discard Action Handlers
        const syncAllSettingsDraftUi = () => {
            updatePrecisionUi();
            updateHwGainUi();
            updateUltrasonicUi();
            updateDitherUi();
            updateAmbiUi();
            updateBufferUi();
            updateDebugDraftUi();
            refreshPendingAudioBanner();
        };

        if (discardAudioBtn) {
            discardAudioBtn.addEventListener('click', () => {
                draft = snapshotCommittedAudioState();
                syncAllSettingsDraftUi();
                showToast('Pending audio settings discarded.');
            });
        }

        if (applyAudioBtn) {
            applyAudioBtn.addEventListener('click', async () => {
                const prevHwGain = s.isHardwareGain;
                const prevLatency = s.bufferLatencyTarget;
                const prevDebug = s.debugModeActive;

                s.mathPrecision = draft.mathPrecision;
                s.isPrecision64 = (s.mathPrecision === '64');
                s.isHardwareGain = Boolean(draft.isHardwareGain && s.hwGainAvailable);
                s.isUltrasonic = Boolean(draft.isUltrasonic);
                s.ultrasonicCutoff = parseInt(draft.ultrasonicCutoff, 10) || 32000;
                s.ditherMode = draft.ditherMode || 'tpdf';
                s.isAmbiophonics = Boolean(draft.isAmbiophonics);
                s.bufferLatencyTarget = draft.bufferLatencyTarget || 'playback';

                try {
                    safeStorage.setItem('cachymusic_engine_precision', s.mathPrecision);
                    safeStorage.setItem('cachymusic_precision_64', s.isPrecision64 ? 'true' : 'false');
                    safeStorage.setItem('cachymusic_hardware_gain', s.isHardwareGain ? 'true' : 'false');
                    safeStorage.setItem('cachymusic_hw_gain', s.isHardwareGain ? 'true' : 'false');
                    safeStorage.setItem('cachymusic_ultrasonic', s.isUltrasonic ? 'true' : 'false');
                    safeStorage.setItem('cachymusic_ultrasonic_cutoff', s.ultrasonicCutoff.toString());
                    safeStorage.setItem('cachymusic_dither_mode', s.ditherMode);
                    safeStorage.setItem('cachymusic_ambiophonics', s.isAmbiophonics ? 'true' : 'false');
                    safeStorage.setItem('cachymusic_buffer_latency', s.bufferLatencyTarget);
                } catch (_) {}

                if (draft.debugModeActive !== prevDebug) {
                    setDebugMode(draft.debugModeActive);
                }

                if (s.isHardwareGain !== prevHwGain) {
                    if (s.isHardwareGain) {
                        await checkHardwareGainStatus();
                    } else if (s.audio) {
                        s.audio.volume = Math.min(1.0, s.currentVolumeValue);
                    }
                }

                if (s.bufferLatencyTarget !== prevLatency && audioBufferChangePending() && !s.isPlaying
                    && !s.isSoftwareDecoding && !s.audio?.getAttribute('src')) {
                    const curTrack = s.allTracks[s.currentTrackIndex];
                    const sr = (curTrack && curTrack.sampleRate) ? getValidSampleRate(curTrack.sampleRate) : 44100;
                    await ensureAudioEngineForSampleRate(sr, true);
                }

                draft = snapshotCommittedAudioState();
                syncAllSettingsDraftUi();
                updateWorkletParams();
                updateAudioRouting();
                store.emit('ui:sync-signal-path');

                if (applyAudioStatus) {
                    applyAudioStatus.textContent = audioBufferChangePending()
                        ? 'Settings saved. Buffer profile takes effect on the next Web Audio track.'
                        : 'Audio preferences saved. Applicable processing updates during playback.';
                    applyAudioStatus.style.color = 'var(--status-success)';
                }
                showCachyToast('Audio settings saved', applyAudioStatus?.textContent || '', 'success');
                logAudioPlaybackEvent('info', `Applied audio settings (Precision=${s.mathPrecision}, Dither=${s.ditherMode}, Ultrasonic=${s.isUltrasonic ? s.ultrasonicCutoff + 'Hz' : 'OFF'}, Latency=${s.bufferLatencyTarget}).`);
            });
        }

        // 7b. Opt-in Desktop Background Web Notifications (Default OFF)
        const bgNotifToggle = document.getElementById('settingsBgNotificationsToggle');
        const rt = getRuntime();
        if (bgNotifToggle && (typeof Notification === 'undefined' || rt.isAndroidNative
            || rt.osFamily === 'android' || rt.isIOS)) {
            s.backgroundNotificationsEnabled = false;
            bgNotifToggle.disabled = true;
            bgNotifToggle.closest('.settingsRowItem').style.display = 'none';
        } else if (bgNotifToggle) {
            if (s.backgroundNotificationsEnabled && Notification.permission !== 'granted') {
                s.backgroundNotificationsEnabled = false;
                safeStorage.setItem('cachymusic_bg_notifications', 'false');
            }
            const syncBgNotifUi = () => {
                const on = Boolean(s.backgroundNotificationsEnabled);
                if ('checked' in bgNotifToggle) bgNotifToggle.checked = on;
                bgNotifToggle.classList.toggle('active', on);
                bgNotifToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
            };
            syncBgNotifUi();
            bgNotifToggle.addEventListener('click', async () => {
                const wantsEnable = !s.backgroundNotificationsEnabled;
                let allowed = !wantsEnable || Notification.permission === 'granted';
                if (wantsEnable && Notification.permission === 'default') {
                    bgNotifToggle.disabled = true;
                    try { allowed = await Notification.requestPermission() === 'granted'; }
                    catch (_) { allowed = false; }
                    finally { bgNotifToggle.disabled = false; }
                }
                s.backgroundNotificationsEnabled = wantsEnable && allowed;
                safeStorage.setItem('cachymusic_bg_notifications', String(s.backgroundNotificationsEnabled));
                syncBgNotifUi();
                showToast(allowed ? `Background alerts ${wantsEnable ? 'enabled' : 'disabled'}`
                    : 'Browser notification permission is required.');
            });
        }

        // 8. Playback Diagnostics & Debug Log Actions
        document.querySelectorAll('#settingsCopyDebugLogBtn, #debugHudCopyBtn').forEach(button => {
            button.addEventListener('click', async () => {
                const logs = s.audioPlaybackDebugLogs.join('\n') || 'No telemetry events logged yet.';
                try {
                    await navigator.clipboard.writeText(logs);
                    showToast('Playback Diagnostics Copied');
                } catch (_) {
                    showToast('Could not copy diagnostics.');
                }
            });
        });
        document.querySelectorAll('#settingsClearDebugLogBtn, #debugHudClearBtn').forEach(button => {
            button.addEventListener('click', () => {
                s.audioPlaybackDebugLogs.length = 0;
                s.consecutiveSkipCount = 0;
                document.getElementById('debugHudLogList')?.replaceChildren();
                const logBox = document.getElementById('settingsAudioDebugLog');
                if (logBox) logBox.textContent = '[AudioEngine] Diagnostics log cleared.';
                updateAudioDiagnosticsUi();
                showToast('Diagnostics Log Cleared');
            });
        });

        // 9. On-Screen Audio Diagnostics & Debug Mode Controls (staged until Apply)
        const debugEnableBtn = document.getElementById('debugModeEnableBtn');
        const debugDisableBtn = document.getElementById('debugModeDisableBtn');
        const debugPill = document.getElementById('settingsDebugPill');
        function updateDebugDraftUi() {
            if (debugPill) {
                debugPill.textContent = draft.debugModeActive ? 'ENABLED (HUD)' : 'DISABLED';
                debugPill.className = `settingsEnginePill ${draft.debugModeActive ? 'active' : ''}`;
            }
            if (debugEnableBtn) debugEnableBtn.classList.toggle('active', draft.debugModeActive);
            if (debugDisableBtn) debugDisableBtn.classList.toggle('active', !draft.debugModeActive);
        }
        if (debugEnableBtn) {
            debugEnableBtn.addEventListener('click', () => {
                draft.debugModeActive = true;
                updateDebugDraftUi();
                refreshPendingAudioBanner();
            });
        }
        if (debugDisableBtn) {
            debugDisableBtn.addEventListener('click', () => {
                draft.debugModeActive = false;
                updateDebugDraftUi();
                refreshPendingAudioBanner();
            });
        }

        const hudCloseBtn = document.getElementById('debugHudCloseBtn');
        if (hudCloseBtn) {
            hudCloseBtn.addEventListener('click', () => {
                setDebugMode(false);
                draft.debugModeActive = false;
                updateDebugDraftUi();
                refreshPendingAudioBanner();
            });
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

        // Initial DAC & Hardware Output Capability Scan + Hotplug Listener
        checkDacCapabilities(false);
        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', () => checkDacCapabilities(false));
        }
        if (navigator.usb && navigator.usb.addEventListener) {
            navigator.usb.addEventListener('connect', () => checkDacCapabilities(false));
            navigator.usb.addEventListener('disconnect', () => checkDacCapabilities(false));
        }

        // Ensure sleep timer cancel button is hidden initially if no timer is active
        const initCancelSleepBtn = document.getElementById('settingsTabCancelSleepBtn');
        if (initCancelSleepBtn && !s.sleepTimerMode) {
            initCancelSleepBtn.style.display = 'none';
        }

        updateDebugHudState();

        // 7. Settings Category Sub-Navigation Filter Bar (Balanced 2-Column Sub-Groupings)
        const catBtns = document.querySelectorAll('#settingsCategoryNav .settingsCatBtn');
        const settingsGrid = document.getElementById('settingsLayoutGrid');
        if (catBtns.length > 0 && settingsGrid) {
            const searchInput=document.getElementById('settingsSearchInput');
            const searchStatus=document.getElementById('settingsSearchStatus');
            let currentCategory='audio';
            const applySettingsCategory = (cat) => {
                if(!Array.from(catBtns).some(b=>b.dataset.cat===cat))cat='audio';
                currentCategory=cat;
                const query=(searchInput?.value||'').trim().toLowerCase();let count=0;
                catBtns.forEach(b => {
                    const selected = b.getAttribute('data-cat') === cat;
                    b.classList.toggle('active', selected);
                    if (selected) b.setAttribute('aria-current', 'page');
                    else b.removeAttribute('aria-current');
                });
                settingsGrid.setAttribute('data-active-cat', cat);

                const audioCol = document.getElementById('settingsColAudio');
                const sysCol = document.getElementById('settingsColSystem');
                if (audioCol) audioCol.style.display = '';
                if (sysCol) sysCol.style.display = '';

                const panels = settingsGrid.querySelectorAll('.settingsSectionPanel[data-settings-cat]');
                panels.forEach(panel => {
                    const panelCats = (panel.getAttribute('data-settings-cat') || '').split(/\s+/);
                    const isMatch = query ? panel.textContent.toLowerCase().includes(query) : (cat === 'all') || panelCats.includes(cat);
                    if (isMatch) count++;
                    // Searching a collapsed advanced section must expose its match.
                    if (query && isMatch) {
                        panel.querySelectorAll('details.settingsAdvancedDetails').forEach(details => {
                            if (details.textContent.toLowerCase().includes(query)) details.open = true;
                        });
                    }
                    panel.style.display = isMatch ? '' : 'none';
                });
                if(searchStatus)searchStatus.textContent=query?`${count} matching sections`:'';
            };
            searchInput?.addEventListener('input',()=>applySettingsCategory(currentCategory));

            catBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    if(searchInput)searchInput.value='';
                    const cat = btn.getAttribute('data-cat') || 'audio';
                    try { safeStorage.setItem('cachymusic_settings_cat', cat); } catch (_) {}
                    applySettingsCategory(cat);
                    // Keep the selected category visible in the compact mobile rail.
                    if (window.matchMedia('(max-width: 768px)').matches) {
                        btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
                    }
                });
            });

            const urlParams = new URLSearchParams(window.location.search);
            const urlCat = urlParams.get('cat');
            const savedCat = urlCat || safeStorage.getItem('cachymusic_settings_cat') || 'audio';
            applySettingsCategory(savedCat);
        }
    }

    function toggleReplayGain(active) {
        const s = store.state;
        s.isReplayGain = typeof active === 'boolean' ? active : !s.isReplayGain;
        try {
            safeStorage.setItem('cachymusic_replaygain', s.isReplayGain ? 'true' : 'false');
        } catch (_) {}
        const targetGain = computeReplayGainMultiplier();
        if (s.replayGainNode && s.audioContext) {
            s.replayGainNode.gain.setTargetAtTime(targetGain, s.audioContext.currentTime, 0.04);
        }
        updateWorkletParams();
        store.emit('ui:sync-dac-status');
    }

    function setVolume(val, updateInput = false, persist = true) {
        const s = store.state;
        if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
            val = 0.8;
        }
        s.currentVolumeValue = Math.max(0, Math.min(1.5, val));
        if (persist) safeStorage.setItem('cachymusic_volume', s.currentVolumeValue.toString());
        syncVolumeSliders(s.currentVolumeValue, volumeSlider, miniVolumeSlider);

        if (s.isHardwareGain && s.hwGainAvailable && getRuntime().hasHardwareGain) {
            // Bit-Perfect System Volume Control: Keep software digital stream at 0 dBFS full precision
            if (s.audio) {
                s.audio.volume = 1.0;
                s.audio.muted = false;
            }
            dispatchHardwareVolume(s.currentVolumeValue);
        } else {
            // Standard HTML5 audio.volume clamped to [0.0, 1.0]
            const baseVol = Math.min(1.0, s.currentVolumeValue);
            if (s.audio) {
                s.audio.volume = baseVol;
                s.audio.muted = false;
            }

            if (s.audioContext) {
                const now = s.audioContext.currentTime;
                updateAmpGain(now);
                updateLimiterState(now);
                updateWorkletParams();
                updateAudioRouting();
            }
        }

        syncSoftwareVolume();
        const pct = Math.round(s.currentVolumeValue * 100);
        if (volumeLevel) {
            if (s.currentVolumeValue > 1.0) {
                volumeLevel.textContent = s.isHardwareGain ? `${pct}% HW-AMP` : `${pct}% AMP`;
                volumeLevel.classList.add('amplified');
                volumeLevel.setAttribute('title', s.isHardwareGain ? `System Volume Control: ${pct}%` : `Volume: 100% + Amplification setting: ${pct - 100}%`);
            } else {
                volumeLevel.textContent = `${pct}%`;
                volumeLevel.classList.remove('amplified');
                volumeLevel.removeAttribute('title');
            }
        }
        store.emit('ui:sync-volume-icon', { volume: Math.min(1.0, s.currentVolumeValue) });
    }


    // =========================================================================
    // High-Fidelity Audio Visualizer Engine
    // 60-band perceptual log binning, dual-stage smoothing, 3 reworked modes
    // =========================================================================


    function initDspNodes() {
        const s = store.state;
        if (!s.audioContext) return;
        const ctx = s.audioContext;
        s.analyser = ctx.createAnalyser();
        s.analyser.fftSize = 2048; // FFT bin spacing is context sample rate / fftSize.
        s.analyser.smoothingTimeConstant = 0.38; // Smooth display at the cost of temporal resolution.
        s.analyser.minDecibels = -90; // Wide dynamic range captures delicate high-frequency air, harmonics & cymbals above 16kHz
        s.analyser.maxDecibels = -25;

        // -1. Subsonic High-Pass Filter: Infrasonic rumble eliminator at 20 Hz (Butterworth Q=0.707)
        s.subsonicFilter = ctx.createBiquadFilter();
        s.subsonicFilter.type = 'highpass';
        s.subsonicFilter.frequency.value = s.isSubsonic ? 20 : 5;
        s.subsonicFilter.Q.value = 0.707;

        // 0. ReplayGain / EBU R128 Loudness Normalization Stage
        s.replayGainNode = ctx.createGain();
        s.replayGainNode.gain.value = 1.0;

        // 0.5. Dynamic Headroom Pre-Amp Gain Stage
        s.preAmpGainNode = ctx.createGain();
        s.preAmpGainNode.gain.value = getPreAmpGainValue();

        // 0.8. Bauer Headphone Crossfeed Network (Meier / Bauer Acoustic HRTF Simulation)
        s.xfeedNetwork = createCrossfeedNetwork(ctx);

        // 10-Band Parametric Equalizer (ISO standard 1-octave frequencies from 31 Hz to 16 kHz)
        s.peqNodes = PEQ_FREQS.map((freq, i) => {
            const f = ctx.createBiquadFilter();
            if (i === 0) f.type = 'lowshelf';
            else if (i === PEQ_FREQS.length - 1) f.type = 'highshelf';
            else f.type = 'peaking';
            f.frequency.value = freq;
            f.Q.value = (s.peqQs && typeof s.peqQs[i] === 'number') ? s.peqQs[i] : 1.41;
            f.gain.value = (s.peqGains && typeof s.peqGains[i] === 'number' && !s.isPeqBypassed) ? s.peqGains[i] : 0;
            return f;
        });

        // 1. Bass Boost Filter: Low-shelf filter at 95 Hz (+3.8 dB Harman sub-bass target)
        s.bassFilter = ctx.createBiquadFilter();
        s.bassFilter.type = 'lowshelf';
        s.bassFilter.frequency.value = 95;
        s.bassFilter.gain.value = s.isBassBoost ? 3.8 : 0;

        // 2. Vocal Boost Filter: Peaking bandpass at 3000 Hz (+2.8 dB Pinna Ear-Gain presence)
        s.vocalFilter = ctx.createBiquadFilter();
        s.vocalFilter.type = 'peaking';
        s.vocalFilter.frequency.value = 3000;
        s.vocalFilter.Q.value = 1.2;
        s.vocalFilter.gain.value = s.isVocalBoost ? 2.8 : 0;

        // 3. Treble Boost Filter: High-shelf filter at 10000 Hz (+3.0 dB Air Band & high shimmer)
        s.trebleFilter = ctx.createBiquadFilter();
        s.trebleFilter.type = 'highshelf';
        s.trebleFilter.frequency.value = 10000;
        s.trebleFilter.gain.value = s.isTrebleBoost ? 3.0 : 0;

        // 4. Clean Amplification Gain Stage (raw unconstrained gain)
        s.ampGainNode = ctx.createGain();
        s.ampGainNode.gain.value = s.isAmpBoost ? getEffectiveAmplification() : 1.0;

        // 5. Dedicated Studio-Grade Transparent Brickwall Limiter (Master anti-clipping protection)
        s.dspLimiter = ctx.createDynamicsCompressor();
        const initProfile = computeLimiterProfile();
        if (s.isLimiter && !initProfile.isBypassed) {
            s.dspLimiter.threshold.value = initProfile.threshold;
            s.dspLimiter.knee.value = initProfile.knee;
            s.dspLimiter.ratio.value = initProfile.ratio;
            s.dspLimiter.attack.value = initProfile.attack;
            s.dspLimiter.release.value = initProfile.release;
        } else {
            s.dspLimiter.threshold.value = 0;
            s.dspLimiter.knee.value = 0;
            s.dspLimiter.ratio.value = 1.0;
            s.dspLimiter.attack.value = 0.0018;
            s.dspLimiter.release.value = 0.090;
        }

        // 6. Sample-peak output trim (not a DAC reconstruction guarantee)
        s.ceilingTrimGain = ctx.createGain();
        s.ceilingTrimGain.gain.value = s.isLimiter ? Math.pow(10, -0.6 / 20) : 1.0;

        // 7. Digital soft clipping stage.
        s.ampSoftClipper = ctx.createWaveShaper();
        s.ampSoftClipper.curve = s.isLimiter ? createSoftClipCurve(2048) : createLinearCurve(2048);
        // Reduce fallback waveshaper cost at higher graph rates. This is a policy,
        // not proof of alias-free processing.
        s.ampSoftClipper.oversample = (ctx.sampleRate >= 88200) ? 'none' : '2x';
    }

    function resetMediaElementForNewAudioContext() {
        const s = store.state;
        if (!s.audio) return;
        const oldAudio = s.audio;
        if (s.audioSourceNode) { try { s.audioSourceNode.disconnect(); } catch (_) {} s.audioSourceNode = null; }
        confirmedRoute = previousCoreRoute = null;
        const source = oldAudio.getAttribute('src');
        const position = oldAudio.currentTime || 0;
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
            oldAudio.load();
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
        newAudio.playbackRate = oldAudio.playbackRate;
        if ('preservesPitch' in oldAudio) newAudio.preservesPitch = oldAudio.preservesPitch;
        if (source) {
            newAudio.src = source;
            if (position > 0) {
                newAudio.addEventListener('loadedmetadata', () => {
                    if (newAudio.getAttribute('src') === source) newAudio.currentTime = Math.min(position, newAudio.duration);
                }, { once: true });
            }
        }
        oldAudio._mediaSourceNode = null;
        oldAudio._mediaSourceContext = null;
        if (oldAudio.parentNode) {
            oldAudio.parentNode.replaceChild(newAudio, oldAudio);
        }
        s.audio = newAudio;
        store.emit('audio:attach-listeners', { audio: newAudio });
    }

    function getOrCreateAudioSourceNode() {
        const s = store.state;
        if (!s.audioContext || s.audioContext.state === 'closed' || !s.audio) return null;
        if (s.audioSourceNode && s.audioSourceNode.context === s.audioContext && s.audio._mediaSourceNode === s.audioSourceNode) return s.audioSourceNode;
        if (s.audioSourceNode) { try { s.audioSourceNode.disconnect(); } catch (_) {} s.audioSourceNode = null; }
        if (s.audio._wasGraphBound || (s.audio._mediaSourceContext && s.audio._mediaSourceContext !== s.audioContext)) resetMediaElementForNewAudioContext();
        if (s.audio._mediaSourceNode && s.audio._mediaSourceContext === s.audioContext) {
            s.audioSourceNode = s.audio._mediaSourceNode;
            return s.audioSourceNode;
        }
        try {
            s.audioSourceNode = s.audioContext.createMediaElementSource(s.audio);
            s.audio._mediaSourceNode = s.audioSourceNode;
            s.audio._mediaSourceContext = s.audioContext;
            return s.audioSourceNode;
        } catch (_) {
            // Chromium safety fallback: if element was attached to an earlier context, refresh it
            resetMediaElementForNewAudioContext();
            try {
                s.audioSourceNode = s.audioContext.createMediaElementSource(s.audio);
                s.audio._mediaSourceNode = s.audioSourceNode;
                s.audio._mediaSourceContext = s.audioContext;
            } catch (e2) {
                console.error('Failed to create MediaElementSource on replacement element:', e2);
            }
            return s.audioSourceNode;
        }
    }

    // Software PCM does not pass through HTMLMediaElement.volume/muted.
    // Apply those controls to its dedicated upstream gain, before any DSP.
    function syncSoftwareVolume(immediate=false) {
        const s=store.state,node=s.softwareSourceGainNode;
        if(!node||!s.audioContext||node.context!==s.audioContext)return;
        const target=s.audio?.muted?0:(s.isHardwareGain&&s.hwGainAvailable&&getRuntime().hasHardwareGain?1:Math.max(0,Math.min(1,s.currentVolumeValue)));
        const now=s.audioContext.currentTime;
        node.gain.cancelScheduledValues(now);
        if(immediate)node.gain.setValueAtTime(target,now);else node.gain.setTargetAtTime(target,now,0.01);
    }
    let previousCoreRoute = null;
    let confirmedRoute = null;
    export function getConfirmedAudioRoute() {
        const s = store.state;
        if (!confirmedRoute || confirmedRoute.ctx !== s.audioContext || s.audioContext?.state === 'closed') return null;
        const active = s.isSoftwareDecoding && s.softwareSourceGainNode ? s.softwareSourceGainNode : s.audioSourceNode;
        return confirmedRoute.active === active && (confirmedRoute.route !== 'worklet' || confirmedRoute.worklet === s.dspWorkletNode) ? confirmedRoute.route : null;
    }
    function disconnectRouteNodes(s) {
        const nodes = [s.audioSourceNode, s.softwareSourceGainNode, s.subsonicFilter,
            s.replayGainNode, s.preAmpGainNode, s.xfeedNetwork?.output, ...(s.peqNodes || []),
            s.bassFilter, s.vocalFilter, s.trebleFilter, s.ampGainNode, s.dspLimiter,
            s.ceilingTrimGain, s.ampSoftClipper, s.dspWorkletNode];
        for (const node of nodes) { try { node?.disconnect(); } catch (_) {} }
    }
    function updateAudioRouting() {
        const s = store.state;
        if (!s.audioContext || s.audioContext.state === 'closed') {
            confirmedRoute = previousCoreRoute = null;
            return;
        }
        if (!s.audioSourceNode) {
            getOrCreateAudioSourceNode();
        }
        if (!s.audioSourceNode) {
            confirmedRoute = previousCoreRoute = null;
            return;
        }
        if(s.isSoftwareDecoding)syncSoftwareVolume(previousCoreRoute?.active!==s.softwareSourceGainNode);
        const active=s.isSoftwareDecoding&&s.softwareSourceGainNode?s.softwareSourceGainNode:s.audioSourceNode;
        const route=(s.mathPrecision==='native'&&!hasUserShapingDsp())?'direct':s.dspWorkletNode?'worklet':'fallback';
        // Parameter-only changes do not tear down a live worklet graph.
        if(route!=='fallback'&&previousCoreRoute?.active===active&&previousCoreRoute?.route===route&&previousCoreRoute?.ctx===s.audioContext&&previousCoreRoute?.worklet===s.dspWorkletNode){updateWorkletParams();store.emit('ui:sync-dac-status');return;}
        previousCoreRoute=null;
        confirmedRoute=null;
        try {
            disconnectRouteNodes(s);

            // Active source: if in software decoding buffer mode, route through softwareSourceGainNode
            const activeSource = (s.isSoftwareDecoding && s.softwareSourceGainNode)
                ? s.softwareSourceGainNode
                : s.audioSourceNode;

            // Parallel visualizer FFT tap directly on active source (zero double processing)
            if (s.analyser) {
                activeSource.connect(s.analyser);
            }

            // Native Host Bypass mode: skip worklet DSP math & re-dither when user EQ/FX are flat
            if (s.mathPrecision === 'native' && !hasUserShapingDsp()) {
                activeSource.connect(s.audioContext.destination);
                confirmedRoute = previousCoreRoute={active,route,ctx:s.audioContext,worklet:s.dspWorkletNode};
                store.emit('ui:sync-dac-status');
                return;
            }

            // Primary Studio 64-Bit Single-Path Worklet Graph:
            // All filtering, EQ, crossfeed, R.A.C.E., M/S, AGP, soft-clip & final dither run strictly inside dspWorkletNode
            if (s.dspWorkletNode) {
                updateWorkletParams();
                activeSource.connect(s.dspWorkletNode);
                s.dspWorkletNode.connect(s.audioContext.destination);
                confirmedRoute = previousCoreRoute={active,route,ctx:s.audioContext,worklet:s.dspWorkletNode};
                store.emit('ui:sync-dac-status');
                return;
            }

            // Fallback Web Audio Biquad Graph (only when AudioWorklet is unavailable)
            updatePreAmpGain(s.audioContext.currentTime);
            let rootNode = activeSource;
            if (s.isSubsonic && s.subsonicFilter && s.mathPrecision !== 'native') {
                activeSource.connect(s.subsonicFilter);
                rootNode = s.subsonicFilter;
            }
            if (s.replayGainNode) {
                rootNode.connect(s.replayGainNode);
                rootNode = s.replayGainNode;
            }
            if (s.preAmpGainNode) {
                rootNode.connect(s.preAmpGainNode);
                rootNode = s.preAmpGainNode;
            }

            if ((s.mathPrecision === 'native' && !hasUserShapingDsp()) || !hasActiveDsp()) {
                rootNode.connect(s.audioContext.destination);
            } else {
                let current = rootNode;

                // Bauer Headphone Crossfeed (if active)
                if (s.isCrossfeed && s.xfeedNetwork) {
                    current.connect(s.xfeedNetwork.input);
                    current = s.xfeedNetwork.output;
                }

                // 10-Band Parametric Equalizer Stage
                if (s.peqNodes && s.peqNodes.length > 0) {
                    for (const peqBand of s.peqNodes) {
                        current.connect(peqBand);
                        current = peqBand;
                    }
                }

                // Full Studio DSP & Dynamics Engine Route:
                current.connect(s.bassFilter);
                s.bassFilter.connect(s.vocalFilter);
                s.vocalFilter.connect(s.trebleFilter);
                s.trebleFilter.connect(s.ampGainNode);

                // Only route through DynamicsCompressor + SoftClipper when Limiter or Volume Overdrive (>100%) is active
                let terminalNode = s.ampGainNode;
                if ((s.isLimiter || s.currentVolumeValue > 1.0) && s.dspLimiter && s.ampSoftClipper) {
                    s.ampGainNode.connect(s.dspLimiter);
                    if (s.ceilingTrimGain) {
                        s.dspLimiter.connect(s.ceilingTrimGain);
                        s.ceilingTrimGain.connect(s.ampSoftClipper);
                    } else {
                        s.dspLimiter.connect(s.ampSoftClipper);
                    }
                    terminalNode = s.ampSoftClipper;
                }
                terminalNode.connect(s.audioContext.destination);
            }
            confirmedRoute = {active, route, ctx:s.audioContext, worklet:s.dspWorkletNode};
        } catch (e) {
            console.warn('Audio routing update warning:', e);
            disconnectRouteNodes(s);
            if (s.dspWorkletNode) { releaseDspWorklet(); updateAudioRouting(); return; }
        }
        store.emit('ui:sync-dac-status');
    }

    let appliedBufferLatency;
    function audioBufferChangePending() {
        const s = store.state;
        return Boolean(s.audioContext && s.audioContext.state !== 'closed' && appliedBufferLatency !== s.bufferLatencyTarget);
    }

    function onGraphStateChange(event) {
        const ctx = event.currentTarget;
        if (ctx.state === 'closed' && !graphLifecycle.replacing && store.state.audioContext === ctx) {
            clearClosedGraph(ctx);
            store.emit('audio:graph-lost');
            store.emit('ui:sync-dac-status');
        }
        refreshSpectrum();
    }

    function clearClosedGraph(ctx) {
        const s = store.state;
        if (s.audioContext !== ctx) return;
        ctx.removeEventListener('statechange', onGraphStateChange);
        releaseDspWorklet();
        clearGraphNodes(s);
        s.audioContext = null;
        confirmedRoute = previousCoreRoute = null;
        appliedBufferLatency = undefined;
        // Both media elements may have belonged to the closed context.
        if (s.secondaryAudio?._wasGraphBound) {
            s.secondaryAudio.pause();
            s.secondaryAudio.removeAttribute('src');
            s.secondaryAudio.load();
            s.secondaryAudio = null;
            s.preloadedNextTrackIndex = -1;
        }
        if (s.audio?._wasGraphBound) resetMediaElementForNewAudioContext();
    }

    function createGraph() {
        const s = store.state;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        const latencyHint = s.bufferLatencyTarget === 'interactive' ? 'interactive' : 'playback';
        const ctx = createPlaybackAudioContext(AudioCtx, latencyHint);
        s.audioContext = ctx;
        appliedBufferLatency = latencyHint;
        try {
            initDspNodes();
            getOrCreateAudioSourceNode();
            updateAudioRouting();
            if (!getConfirmedAudioRoute()) throw new Error('Audio route not connected');
            loadDspWorklet();
        } catch (error) {
            // Retain ownership of a partially initialized context until it
            // actually closes; the next ensure can safely recover it.
            confirmedRoute = previousCoreRoute = null;
            console.warn('Audio graph initialization failed:', error);
        }
        ctx.addEventListener('statechange', onGraphStateChange);
        refreshSpectrum();
        store.emit('ui:sync-dac-status');
        return ctx;
    }

    const graphLifecycle = createGraphLifecycle({
        current: () => store.state.audioContext,
        create: createGraph,
        clear: clearClosedGraph,
        ready: ctx => ctx === store.state.audioContext && Boolean(store.state.analyser && getConfirmedAudioRoute())
    });

    const pendingResumes = new WeakMap();
    function resumeGraph(ctx) {
        if (ctx?.state === 'suspended' && getConfirmedAudioRoute() && !graphLifecycle.replacing && !pendingResumes.has(ctx)) {
            try {
                const task = ctx.resume();
                pendingResumes.set(ctx, task);
                task.catch(() => {}).finally(() => pendingResumes.delete(ctx));
            } catch (_) {}
        }
        return ctx;
    }

    export function resumeAudioGraph() {
        const ctx = resumeGraph(store.state.audioContext);
        return (ctx && pendingResumes.get(ctx)) || Promise.resolve();
    }

    async function ensureAudioEngineForSampleRate(targetRate = 44100, forceRecreate = false) {
        const s = store.state;
        // Reconfiguration is safe only at a track boundary or while idle.
        const force = forceRecreate && !s.isSoftwareDecoding && !s.audio?.getAttribute('src');
        // Gesture-triggered resume should happen synchronously for an existing graph.
        if (!force && getConfirmedAudioRoute()) resumeGraph(s.audioContext);
        const ctx = await graphLifecycle.ensure(force);
        if (ctx && !s.audioSourceNode) { getOrCreateAudioSourceNode(); updateAudioRouting(); }
        store.emit('ui:sync-dac-status');
        return resumeGraph(ctx);
    }

    function initAudioContext(preferredRate = null) {
        return resumeGraph(graphLifecycle.init());
    }

    // Unlock AudioContext on any user interaction if suspended
    ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(ev => {
        window.addEventListener(ev, () => {
            resumeGraph(store.state.audioContext);
        }, { passive: true });
    });

    function openPeqModal() {
        if (typeof store.state.openPeqModal === 'function') store.state.openPeqModal();
    }

    function closePeqModal() {
        if (typeof store.state.closePeqModal === 'function') store.state.closePeqModal();
    }

    store.subscribe('audio:set-volume', (e) => {
        const detail = e?.detail || {};
        setVolume(detail.volume, true, detail.persist !== false);
    });
    store.subscribe('audio:reset-element', () => {
        if (graphLifecycle.replacing) return;
        resetMediaElementForNewAudioContext();
        if (store.state.audioContext?.state !== 'closed') updateAudioRouting();
    });
    store.subscribe('peq:redraw', drawPeqCurve);
    for (const event of ['audio:spectrum-refresh', 'ui:sync-dac-status', 'workspace:change', 'visualizer:change', 'theme:change']) {
        store.subscribe(event, refreshSpectrum);
    }
    store.subscribe('theme:change', () => requestAnimationFrame(drawPeqCurve));
    store.subscribe('dsp:change', () => updateWorkletParams());
    store.subscribe('track:change', () => {
        updateWorkletParams();
        toggleReplayGain(store.state.isReplayGain);
    });

    export {
        checkDacCapabilities,
        checkHardwareGainStatus,
        closePeqModal,
        computeLimiterProfile,
        createCrossfeedNetwork,
        createLinearCurve,
        createSoftClipCurve,
        dispatchHardwareVolume,
        drawPeqCurve,
        ensureAudioEngineForSampleRate,
        audioBufferChangePending,
        getEffectiveAmplification,
        getOrCreateAudioSourceNode,
        getPreAmpGainValue,
        hasUserShapingDsp,
        syncSoftwareVolume,
        hwVolumeDebounceTimer,
        importAutoEqProfile,
        initAudioContext,
        initDspNodes,
        initPeqWorkstation,
        loadDspWorklet,
        markHwGainUnavailable,
        openPeqModal,
        resetMediaElementForNewAudioContext,
        setDspBoost,
        setPeqBandGain,
        setPeqBandQ,
        setPeqPreset,
        setVolume,
        setupDspControls,
        setupNeutronSettingsControls,
        toggleDspBoost,
        toggleReplayGain,
        updateAmpGain,
        updateAudioRouting,
        updateDspButtonsUi,
        updateLimiterState,
        updatePreAmpGain,
        updateWorkletParams
    };
