// CachyMusic - High-Fidelity Canvas Visualizer Engine (Liquid Wave & Segmented Bars)
import { safeStorage } from './utils.js';
import { visualizerFrameIntervalMs } from './visualizer-budget.js';
import { NUM_BANDS, emitShockwave, store } from './state.js';
import {
    bgDisc,
    ctx,
    getActiveTheme,
    playerDeckEl,
    settingsPanelEl,
    signalPathModal,
    statPeakLevel,
    turntableCenterCanvas,
    turntableCenterCtx,
    turntableCenterVis,
    vinylLabel,
    vinylTurntable,
    visModeBtns,
    visPillBtns,
    visualizerCanvas,
    visualizerDock,
    persistentMiniPlayer,
    miniVisStrip,
    miniVisCanvas
} from './ui-elements.js';
import { getThemeNotificationProfile } from './theme-catalog.js';
import { loadCore } from './visualizers/registry.js';
import { drawSolidWave, emitSparkle, updateAndDrawSparkles } from './visualizers/liquid-wave.js';
import { drawVerticalDash, drawRoundedRect } from './visualizers/segmented-bars.js';
import { drawMiniThemeStrip, resetMiniThemeStrip } from './visualizers/mini-strip.js';
import { drawSplinePath, updateAndDrawShockwaves } from './visualizers/canvas-geometry.js';

let activeCore = null;
let requestedCore = null;
let waveModule = null;
let wavePromise = null;
let particlesModule = null;
let particlesPromise = null;
const mobileViewportQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 768px)') : null;
const reducedMotionMediaQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
let cachedMobileViewport = mobileViewportQuery ? mobileViewportQuery.matches : (typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
let cachedReducedMotion = reducedMotionMediaQuery ? reducedMotionMediaQuery.matches : false;
mobileViewportQuery?.addEventListener?.('change', e => { cachedMobileViewport = e.matches; });
reducedMotionMediaQuery?.addEventListener?.('change', e => { cachedReducedMotion = e.matches; });

function ensureVisualizerThemeModules() {
    const mode = store.state.activeVisualizerMode;
    const theme = getActiveTheme();
    if (mode === 'thematic') {
        if (requestedCore !== theme) {
            requestedCore = theme;
            activeCore = null;
            store.state.turntableShockwaves.length = 0;
            loadCore(theme).then(renderer => {
                if (requestedCore === theme) {
                    activeCore = renderer;
                    store.emit('visualizer:resume');
                }
            }).catch(error => {
                if (requestedCore === theme) requestedCore = null;
                console.warn('Theme visualizer unavailable:', error);
            });
        }
        if (!wavePromise) wavePromise = import('./visualizers/themed-wave.js').then(module => {
            waveModule = module;
            store.emit('visualizer:resume');
        }).catch(error => { wavePromise = null; console.warn('Theme wave unavailable:', error); });
    } else if (mode === 'wave' && theme === 'default' && !particlesPromise) {
        particlesPromise = import('./visualizers/particles.js').then(module => {
            particlesModule = module;
        }).catch(error => { particlesPromise = null; console.warn('Wave particles unavailable:', error); });
    }
}
store.subscribe('visualizer:ensure-themes', ensureVisualizerThemeModules);

    function setupVisualizerMode() {
        setVisualizerMode(store.state.activeVisualizerMode);
    }

    function setVisualizerMode(mode) {
        const s = store.state;
        const nextMode = ['wave','dash','thematic','artwork'].includes(mode)?mode:(mode==='badapple'?'thematic':'artwork');
        document.documentElement.dataset.presentation=nextMode;
        store.setState({ activeVisualizerMode: nextMode }, ['visualizer:change']);
        ensureVisualizerThemeModules();
        safeStorage.setItem('cachymusic_vis_mode', nextMode);
        if (statPeakLevel) statPeakLevel.textContent = 'Unavailable';

        visPillBtns.forEach(b => {
            const m = b.dataset.mode;
            const matches = (m === nextMode) || (nextMode === 'thematic' && (m === 'badapple' || m === 'thematic'));
            b.classList.toggle('active', matches);
        });
        visModeBtns.forEach(b => {
            const m = b.dataset.mode;
            const matches = (m === nextMode) || (nextMode === 'thematic' && (m === 'badapple' || m === 'thematic'));
            b.classList.toggle('active', matches);
        });

        // Reset peak drops for dash mode & pulse state
        s.peakValues.fill(0);
        s.peakVelocity.fill(0);
        s.peakHold.fill(0);
        s.smoothDashLevels.fill(0);
        s.smoothHeartPulse = 1.0;

        const isThematic = (nextMode === 'thematic' || nextMode === 'badapple');
        if (turntableCenterVis) {
            turntableCenterVis.style.display = 'none';
        }
        if (vinylLabel) {
            vinylLabel.style.opacity = '1';
        }
        if (vinylTurntable) {
            vinylTurntable.classList.toggle('thematicFidelity', isThematic);
            vinylTurntable.classList.toggle('spinning', s.isPlaying);
        }
        if (bgDisc) {
            bgDisc.classList.toggle('fast', s.isPlaying && isThematic);
        }
        if (typeof s.resumeVisualizerLoop === 'function') {
            s.resumeVisualizerLoop();
        }
    }

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
    let cachedMiniW = 0;
    let cachedMiniH = 0;
    let lastMiniW = 0;
    let lastMiniH = 0;
    let lastMiniDpr = 0;
    const miniVisCtx = miniVisCanvas ? miniVisCanvas.getContext('2d') : null;

    function clearMiniStrip() {
        if (miniVisStrip) miniVisStrip.classList.remove('is-active');
        if (miniVisCtx && miniVisCanvas) {
            miniVisCtx.clearRect(0, 0, miniVisCanvas.width, miniVisCanvas.height);
        }
        resetMiniThemeStrip();
    }

    function canRunMiniStrip(st) {
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
        return window.innerWidth <= 768
            && !reducedMotion
            && Boolean(persistentMiniPlayer && persistentMiniPlayer.style.display !== 'none')
            && Boolean(miniVisStrip && miniVisCanvas && miniVisCtx)
            && Boolean(st?.isPlaying && st?.analyser)
            && !st?.isNativePlaybackActive?.();
    }

    function syncMiniStripVisibility(st, isMobileViewport, reducedMotion) {
        const active = isMobileViewport
            && !reducedMotion
            && Boolean(persistentMiniPlayer && persistentMiniPlayer.style.display !== 'none')
            && Boolean(miniVisStrip && miniVisCanvas && miniVisCtx)
            && Boolean(st.isPlaying && st.analyser)
            && !st.isNativePlaybackActive?.();
        if (miniVisStrip) {
            const wasActive = miniVisStrip.classList.contains('is-active');
            miniVisStrip.classList.toggle('is-active', active);
            miniVisStrip.dataset.visStyle = getThemeNotificationProfile(getActiveTheme()).style;
            if (wasActive && !active) {
                clearMiniStrip();
            }
        }
        return active;
    }

    function syncMiniStripResolution(w, h) {
        if (!miniVisCanvas || w <= 0 || h <= 0) return 1;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const pw = Math.round(w * dpr);
        const ph = Math.round(h * dpr);
        if (miniVisCanvas.width !== pw || miniVisCanvas.height !== ph || dpr !== lastMiniDpr) {
            miniVisCanvas.width = pw;
            miniVisCanvas.height = ph;
            lastMiniW = w;
            lastMiniH = h;
            lastMiniDpr = dpr;
        }
        return dpr;
    }

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
                if (typeof store.state.resumeVisualizerLoop === 'function') store.state.resumeVisualizerLoop();
            }
        }
        if (miniVisStrip) {
            const mw = Math.round(miniVisStrip.clientWidth || miniVisStrip.getBoundingClientRect().width);
            const mh = Math.round(miniVisStrip.clientHeight || miniVisStrip.getBoundingClientRect().height);
            if (mw > 0 && mh > 0) {
                cachedMiniW = mw;
                cachedMiniH = mh;
                syncMiniStripResolution(mw, mh);
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
                    if (cachedCenterW > 0 && cachedCenterH > 0 && typeof store.state.resumeVisualizerLoop === 'function') {
                        store.state.resumeVisualizerLoop();
                    }
                } else if (entry.target === miniVisStrip) {
                    cachedMiniW = Math.round(entry.contentRect.width);
                    cachedMiniH = Math.round(entry.contentRect.height);
                    if (cachedMiniW > 0 && cachedMiniH > 0) {
                        syncMiniStripResolution(cachedMiniW, cachedMiniH);
                    }
                }
            }
        });
        if (visualizerDock) resizeObs.observe(visualizerDock);
        if (turntableCenterCanvas) resizeObs.observe(turntableCenterCanvas);
        if (miniVisStrip) resizeObs.observe(miniVisStrip);
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



    let visualizerInitialized = false;
    function startVisualizerLoop() {
        if (visualizerInitialized) return;
        visualizerInitialized = true;
        let rawFreqArray = new Uint8Array(1024);
        let timeSamples = new Float32Array(2048);
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
        let drMeterFrameCounter = 60;
        let lastPeakText = '';
        const resetPeak = () => {
            lastPeakText = '';
            drMeterFrameCounter = 60;
            if (statPeakLevel) statPeakLevel.textContent = 'Unavailable';
        };
        store.subscribe('track:change', resetPeak);
        store.subscribe('visualizer:change', resetPeak);

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
            const minFreq = 20;
            // Display range is capped by Nyquist.
            const nyquist = sampleRate / 2;
            const maxFreq = Math.min(24000, nyquist);
            const logRatio = Math.log(maxFreq / minFreq);
            precomputedBands = new Array(NUM_BANDS);
            for (let b = 0; b < NUM_BANDS; b++) {
                const f0 = minFreq * Math.exp((b / NUM_BANDS) * logRatio);
                const f1 = minFreq * Math.exp(((b + 1) / NUM_BANDS) * logRatio);
                const startBin = Math.min(binCount - 1, Math.max(0, Math.floor(f0 / hzPerBin)));
                const endBin = Math.max(startBin + 1, Math.min(binCount, Math.ceil(f1 / hzPerBin)));
                const count = endBin - startBin;
                const normB = b / (NUM_BANDS - 1);
                // Decorative spectrum weighting; not calibrated SPL or equal-loudness compensation.
                const tilt = 0.94 + Math.pow(normB, 1.1) * 0.65;
                precomputedBands[b] = { startBin, endBin, count, tilt };
            }
            return precomputedBands;
        }

        store.state.resumeVisualizerLoop = function() {
            const st = store.state;
            const miniReady = canRunMiniStrip(st);
            if (document.hidden || (!miniReady && (st.currentWorkspace !== 'player' || st.activeVisualizerMode === 'artwork'))) return;
            if (!st.isVisualizerLoopRunning) {
                st.isVisualizerLoopRunning = true;
                idleFramesAfterPause = 0;
                st.lastRenderTime = performance.now();
                st.animFrameId = requestAnimationFrame(renderFrame);
            }
        };

        function stop() {
            const st = store.state;
            if (st.animFrameId != null) cancelAnimationFrame(st.animFrameId);
            st.animFrameId = null;
            st.isVisualizerLoopRunning = false;
            clearMiniStrip();
            resetPeak();
        }
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stop();
            else store.state.resumeVisualizerLoop();
        });
        window.addEventListener('pagehide', stop);
        window.addEventListener('pageshow', () => store.state.resumeVisualizerLoop());
        store.subscribe('visualizer:resume', () => store.state.resumeVisualizerLoop());
        store.subscribe('visualizer:change', () => {
            if (store.state.activeVisualizerMode === 'artwork' && !canRunMiniStrip(store.state)) stop();
        });
        store.subscribe('workspace:change', ({ detail }) => {
            if (detail?.viewName === 'player' || canRunMiniStrip(store.state)) {
                refreshCanvasDimensions();
                store.state.resumeVisualizerLoop();
            } else stop();
        });

        function renderFrame(now) {
            store.state.animFrameId = null;
            try { renderFrameBody(now); }
            catch (error) {
                store.state.isVisualizerLoopRunning = false;
                clearMiniStrip();
                console.warn('Visualizer stopped; album artwork restored:', error);
                // Reset any partially applied canvas transforms or clips.
                if (visualizerCanvas) visualizerCanvas.width = visualizerCanvas.width;
                if (turntableCenterCanvas) turntableCenterCanvas.width = turntableCenterCanvas.width;
                if (miniVisCanvas) miniVisCanvas.width = miniVisCanvas.width;
                lastCanvasDpr = lastCenterDpr = lastMiniDpr = 0;
                setVisualizerMode('artwork');
            }
        }
        function renderFrameBody(now) {
            const st = store.state;
            const isPlaying = st.isPlaying;
            const activeVisualizerMode = st.activeVisualizerMode;
            const smoothBands = st.smoothBands;
            const analyser = st.analyser;
            const audioContext = st.audioContext;
            const isMobileViewport = mobileViewportQuery ? cachedMobileViewport : window.innerWidth <= 768;
            const reducedMotion = cachedReducedMotion;
            const isMiniVisVisible = syncMiniStripVisibility(st, isMobileViewport, reducedMotion);

            if (!isMiniVisVisible && (st.currentWorkspace !== 'player' || activeVisualizerMode==='artwork')) {
                if (statPeakLevel) statPeakLevel.textContent = 'Unavailable';
                lastPeakText = '';
                st.isVisualizerLoopRunning = false;
                return;
            }

            if (document.hidden) {
                if (statPeakLevel) statPeakLevel.textContent = 'Unavailable';
                lastPeakText = '';
                clearMiniStrip();
                st.isVisualizerLoopRunning = false;
                return;
            }

            if (!isPlaying) {
                if (statPeakLevel && lastPeakText !== '') statPeakLevel.textContent = 'Unavailable';
                lastPeakText = '';
                idleFramesAfterPause++;
                const targetFidelity = (activeVisualizerMode === 'thematic' || activeVisualizerMode === 'badapple') ? 1.0 : 0.0;
                const isFidelityTransitioning = Math.abs(targetFidelity - st.smoothTurntableFidelity) > 0.002;
                const isAlreadySilent = (st.smoothBass < 0.002 && smoothMid < 0.002 && st.smoothTreble < 0.002 && beatPulse < 0.002);
                if (!isFidelityTransitioning && ((isAlreadySilent && idleFramesAfterPause > 2) || idleFramesAfterPause > 45)) {
                    st.isVisualizerLoopRunning = false;
                    return;
                }
            } else {
                idleFramesAfterPause = 0;
            }

            const elapsed = now - st.lastRenderTime;
            const frameBudget = visualizerFrameIntervalMs({
                mobile: isMobileViewport,
                reducedMotion,
                saveData: typeof navigator !== 'undefined' && navigator.connection?.saveData === true
            });
            if (elapsed < frameBudget) {
                st.animFrameId = requestAnimationFrame(renderFrame);
                return;
            }
            const dt = Math.min(elapsed / 1000, 0.1);
            st.lastRenderTime = now;

            const showDeckVisuals = st.currentWorkspace === 'player' && activeVisualizerMode !== 'artwork';
            if (isMobileViewport) {
                const isDeckActive = showDeckVisuals && Boolean(playerDeckEl && playerDeckEl.classList.contains('mobileActive') && !st.isLyricsView);
                const isInfoActive = showDeckVisuals && Boolean(settingsPanelEl && settingsPanelEl.classList.contains('mobileActive'));
                const isSignalOpen = showDeckVisuals && Boolean(signalPathModal && signalPathModal.style.display === 'flex');
                if (!isDeckActive && !isInfoActive && !isSignalOpen && !isMiniVisVisible) {
                    st.isVisualizerLoopRunning = false;
                    return;
                }
            }

            let width = (!showDeckVisuals || isMobileViewport) ? 0 : cachedDockW;
            let height = (!showDeckVisuals || isMobileViewport) ? 0 : cachedDockH;
            if (showDeckVisuals && !isMobileViewport && (width === 0 || height === 0) && visualizerDock) {
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
                    if (rawFreqArray.length !== analyser.frequencyBinCount) {
                        rawFreqArray = new Uint8Array(analyser.frequencyBinCount);
                    }
                    analyser.getByteFrequencyData(rawFreqArray);
                    hasRealData = true; // silence is valid input, not a reason to simulate music

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

                // The analyser is pre-DSP. Only report a sampled source peak, not
                // track DR, a calibrated spectrum peak, or physical DAC headroom.
                if (++drMeterFrameCounter >= 30 && statPeakLevel && statPeakLevel.getClientRects().length > 0) {
                    drMeterFrameCounter = 0;
                    try {
                        if (timeSamples.length !== analyser.fftSize) timeSamples = new Float32Array(analyser.fftSize);
                        analyser.getFloatTimeDomainData(timeSamples);
                        let peak = 0;
                        for (let i = 0; i < timeSamples.length; i++) peak = Math.max(peak, Math.abs(timeSamples[i]));
                        const txt = peak > 0 ? `${(20 * Math.log10(peak)).toFixed(1)} dBFS` : 'Silence';
                        if (txt !== lastPeakText) { statPeakLevel.textContent = txt; lastPeakText = txt; }
                    } catch (_) { statPeakLevel.textContent = 'Unavailable'; lastPeakText = ''; }
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
                // No analyser (for example, native direct playback) or no data:
                // decay to zero instead of generating a fictitious spectrum.
                const decay = Math.exp(-8.5 * dt);
                for (let b = 0; b < NUM_BANDS; b++) smoothBands[b] *= decay;
                if (statPeakLevel && lastPeakText !== '') {
                    statPeakLevel.textContent = 'Unavailable'; lastPeakText = '';
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
            st.smoothBass += (currentBass - st.smoothBass) * (1.0 - Math.exp(-18 * dt));

            const currentMid = (smoothBands[12] + smoothBands[16] + smoothBands[20] + smoothBands[24] + smoothBands[28]) / 5;
            smoothMid += (currentMid - smoothMid) * (1.0 - Math.exp(-14 * dt));

            const currentTreble = (smoothBands[42] + smoothBands[46] + smoothBands[50] + smoothBands[54] + smoothBands[58]) / 5;
            st.smoothTreble += (currentTreble - st.smoothTreble) * (1.0 - Math.exp(-14 * dt));
            const smoothBass = st.smoothBass;
            const smoothTreble = st.smoothTreble;

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
                        if (waveModule) waveModule.drawThematicWave(ctx, width, height, filteredBands, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, activeCore?.drawDockScene);
                        else drawSolidWave(ctx, width, height, filteredBands, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, particlesModule?.updateAndDrawParticles);
                        break;
                    }
                    case 'wave':
                    default:
                        drawSolidWave(ctx, width, height, filteredBands, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, particlesModule?.updateAndDrawParticles);
                        break;
                }
                ctx.restore();
            }

            // 5. Turntable Center Visualizer (Signature animated hub across all themes and modes)
            // Visualizer fidelity smoothly transitions so activating Thematic Core blossoms into full-feature design!
            const targetFidelity = (activeVisualizerMode === 'thematic' || activeVisualizerMode === 'badapple') ? 1.0 : 0.0;
            st.smoothTurntableFidelity += (targetFidelity - st.smoothTurntableFidelity) * (1.0 - Math.exp(-6.0 * dt));
            if (Math.abs(targetFidelity - st.smoothTurntableFidelity) < 0.001) {
                st.smoothTurntableFidelity = targetFidelity;
            }
            const fidelity = st.smoothTurntableFidelity;

            const currentDeckEl = playerDeckEl || document.querySelector('.playerDeck');
            const isTurntableVisible = showDeckVisuals && !st.isLyricsView &&
                (window.innerWidth > 768 || (currentDeckEl && currentDeckEl.classList.contains('mobileActive')));

            const currentCenterVis = turntableCenterVis || document.getElementById('turntableCenterVis');
            const currentCenterCanvas = turntableCenterCanvas || document.getElementById('turntableCenterCanvas');
            const currentCenterCtx = turntableCenterCtx || (currentCenterCanvas ? currentCenterCanvas.getContext('2d') : null);

            const compactMode = isMobileViewport && ['wave', 'dash'].includes(activeVisualizerMode);
            const showCore = isTurntableVisible && ((activeVisualizerMode === 'thematic' && Boolean(activeCore)) || compactMode);
            const display = showCore ? 'flex' : 'none';
            const opacity = showCore ? '0' : '1';
            if (currentCenterVis && currentCenterVis.style.display !== display) currentCenterVis.style.display = display;
            if (vinylLabel && vinylLabel.style.opacity !== opacity) vinylLabel.style.opacity = opacity;
            if (showCore && currentCenterCanvas && currentCenterCtx) {
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

                    if (compactMode) {
                        // The dock is hidden on phones. Draw the selected mode inside the circular platter.
                        const scale = Math.min(centerDims.width, centerDims.height) / 250;
                        currentCenterCtx.translate(centerDims.width / 2, centerDims.height / 2);
                        currentCenterCtx.scale(scale, scale);
                        currentCenterCtx.translate(-100, -55);
                        if (activeVisualizerMode === 'dash') drawVerticalDash(currentCenterCtx, 200, 110, smoothBands, isPlaying, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                        else drawSolidWave(currentCenterCtx, 200, 110, filteredBands, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                    } else {
                        activeCore.drawCore(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity, filteredBands);
                    }
                    currentCenterCtx.restore();
                    currentCenterCtx.restore();
                }
            }

            // 6. Theme-matched mobile mini-player visualizer strip
            if (isMiniVisVisible && miniVisStrip && miniVisCanvas && miniVisCtx) {
                let mw = cachedMiniW;
                let mh = cachedMiniH;
                if (mw === 0 || mh === 0) {
                    mw = Math.round(miniVisStrip.clientWidth || miniVisStrip.getBoundingClientRect().width);
                    mh = Math.round(miniVisStrip.clientHeight || miniVisStrip.getBoundingClientRect().height);
                    cachedMiniW = mw;
                    cachedMiniH = mh;
                }
                if (mw > 0 && mh > 0) {
                    const mdpr = syncMiniStripResolution(mw, mh);
                    miniVisCtx.save();
                    miniVisCtx.scale(mdpr, mdpr);
                    miniVisCtx.clearRect(0, 0, mw, mh);
                    drawMiniThemeStrip(miniVisCtx, mw, mh, smoothBands, isPlaying, now, dt, beatPulse, getActiveTheme());
                    miniVisCtx.restore();
                }
            }

            if (st.isVisualizerLoopRunning) {
                st.animFrameId = requestAnimationFrame(renderFrame);
            }
        }

        store.state.resumeVisualizerLoop();
    }

    export {
        setupVisualizerMode,
        setVisualizerMode,
        refreshCanvasDimensions,
        syncTurntableCenterCanvas,
        syncCanvasResolution,
        setupCanvas,
        emitShockwave,
        updateAndDrawShockwaves,
        emitSparkle,
        updateAndDrawSparkles,
        drawSplinePath,
        startVisualizerLoop,
        drawSolidWave,
        drawVerticalDash,
        drawRoundedRect
    };
