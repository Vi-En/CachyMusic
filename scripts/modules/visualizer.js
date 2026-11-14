// CachyMusic - High-Fidelity Canvas Visualizer Engine (Liquid Wave & Segmented Bars)
import { isFirefox, safeStorage } from './utils.js';
import { NUM_BANDS, emitShockwave, store } from './state.js';
import {
    auditMetricHeadroom,
    bgDisc,
    ctx,
    getActiveTheme,
    playerDeckEl,
    settingsPanelEl,
    signalPathModal,
    statDynamicRange,
    statPeakLevel,
    turntableCenterCanvas,
    turntableCenterCtx,
    turntableCenterVis,
    vinylLabel,
    vinylTurntable,
    visModeBtns,
    visPillBtns,
    visualizerCanvas,
    visualizerDock
} from './ui-elements.js';
import * as themes1 from './visualizer-themes-1.js';
import * as themes2 from './visualizer-themes-2.js';

const { updateAndDrawParticles } = themes2;

    function loadVisualizerThemes1() {
        return Promise.resolve(themes1);
    }

    function loadVisualizerThemes2() {
        return Promise.resolve(themes2);
    }

    function setupVisualizerMode() {
        setVisualizerMode(store.state.activeVisualizerMode);

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
        const s = store.state;
        const nextMode = (mode === 'badapple' || mode === 'thematic') ? 'thematic' : mode;
        store.setState({ activeVisualizerMode: nextMode }, ['visualizer:change']);
        safeStorage.setItem('cachymusic_vis_mode', nextMode);

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
            turntableCenterVis.style.display = 'flex';
        }
        if (vinylLabel) {
            vinylLabel.style.opacity = '0';
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

    function updateAndDrawShockwaves(ctx, dt) {
        const shockwaveRings = store.state.shockwaveRings;
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

        store.state.resumeVisualizerLoop = function() {
            const st = store.state;
            if (!st.isVisualizerLoopRunning) {
                st.isVisualizerLoopRunning = true;
                idleFramesAfterPause = 0;
                st.lastRenderTime = performance.now();
                st.animFrameId = requestAnimationFrame(renderFrame);
            }
        };

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && typeof store.state.resumeVisualizerLoop === 'function') {
                store.state.resumeVisualizerLoop();
            }
        });

        store.subscribe('visualizer:resume', () => {
            if (typeof store.state.resumeVisualizerLoop === 'function') store.state.resumeVisualizerLoop();
        });
        store.subscribe('workspace:change', ({ detail }) => {
            if (detail && detail.viewName === 'player') {
                if (typeof store.state.resumeVisualizerLoop === 'function') store.state.resumeVisualizerLoop();
                refreshCanvasDimensions();
            }
        });

        function renderFrame(now) {
            const st = store.state;
            const isPlaying = st.isPlaying;
            const activeVisualizerMode = st.activeVisualizerMode;
            const smoothBands = st.smoothBands;
            const analyser = st.analyser;
            const audioContext = st.audioContext;

            if (st.currentWorkspace !== 'player') {
                st.isVisualizerLoopRunning = false;
                return;
            }

            if (document.hidden) {
                st.isVisualizerLoopRunning = false;
                return;
            }

            if (!isPlaying) {
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
            if (elapsed < 7) {
                st.animFrameId = requestAnimationFrame(renderFrame);
                return;
            }
            const dt = Math.min(elapsed / 1000, 0.1);
            st.lastRenderTime = now;

            const isMobileViewport = window.innerWidth <= 768;
            if (isMobileViewport) {
                const isDeckActive = Boolean(playerDeckEl && playerDeckEl.classList.contains('mobileActive') && !st.isLyricsView);
                const isInfoActive = Boolean(settingsPanelEl && settingsPanelEl.classList.contains('mobileActive'));
                const isSignalOpen = Boolean(signalPathModal && signalPathModal.style.display === 'flex');
                if (!isDeckActive && !isInfoActive && !isSignalOpen) {
                    st.isVisualizerLoopRunning = false;
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
                            let maxBoost = (!st.isPeqBypassed && Array.isArray(st.peqGains)) ? Math.max(0, ...st.peqGains) : 0;
                            if (st.isBassBoost) maxBoost = Math.max(maxBoost, 3.8);
                            if (st.isTrebleBoost) maxBoost = Math.max(maxBoost, 3.0);
                            if (st.isVocalBoost) maxBoost = Math.max(maxBoost, 2.8);
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
                st.simPhase += isPlaying ? dt * 3.2 : dt * 0.7;
                for (let b = 0; b < NUM_BANDS; b++) {
                    let target = 0;
                    if (isPlaying) {
                        const normB = b / (NUM_BANDS - 1);
                        const wave1 = Math.sin(st.simPhase * 1.8 + b * 0.14) * 0.28;
                        const wave2 = Math.cos(st.simPhase * 2.6 + b * 0.22) * 0.18;
                        const bassImpulse = (b < 12) ? Math.max(0, Math.sin(st.simPhase * 3.0)) * 0.42 * (1.0 - b / 12) : 0;
                        const midImpulse = (b >= 16 && b <= 34) ? Math.max(0, Math.sin(st.simPhase * 2.2 + 1.2)) * 0.32 : 0;
                        const highImpulse = (b > 38) ? Math.max(0, Math.sin(st.simPhase * 4.0 + 2.0)) * 0.24 * normB : 0;
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
                        themes2.drawThematicWave(ctx, width, height, filteredBands, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
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
            st.smoothTurntableFidelity += (targetFidelity - st.smoothTurntableFidelity) * (1.0 - Math.exp(-6.0 * dt));
            if (Math.abs(targetFidelity - st.smoothTurntableFidelity) < 0.001) {
                st.smoothTurntableFidelity = targetFidelity;
            }
            const fidelity = st.smoothTurntableFidelity;

            const currentDeckEl = playerDeckEl || document.querySelector('.playerDeck');
            const isTurntableVisible = !st.isLyricsView &&
                (window.innerWidth > 768 || (currentDeckEl && currentDeckEl.classList.contains('mobileActive')));

            const currentCenterVis = turntableCenterVis || document.getElementById('turntableCenterVis');
            const currentCenterCanvas = turntableCenterCanvas || document.getElementById('turntableCenterCanvas');
            const currentCenterCtx = turntableCenterCtx || (currentCenterCanvas ? currentCenterCanvas.getContext('2d') : null);

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

                    switch (currentTheme) {
                        case 'nms':
                            themes1.drawTurntableCenterAtlasCore(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            break;
                        case 'solar-eclipse':
                            themes1.drawTurntableCenterSolarEclipse(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            break;
                        case 'euclid-horizon':
                            themes1.drawTurntableCenterEuclidPortal(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            break;
                        case 'alien-paradise':
                            themes1.drawTurntableCenterAlienParadise(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            break;
                        case 'abyssal-void':
                            themes2.drawTurntableCenterAbyssalVoid(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            break;
                        case 'dissonance':
                            themes2.drawTurntableCenterDissonance(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity, filteredBands);
                            break;
                        case 'sentinel':
                            themes2.drawTurntableCenterSentinel(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity, filteredBands);
                            break;
                        case 'minimalist-light':
                        case 'brutalist-light':
                            themes2.drawTurntableCenterBrutalist(currentCenterCtx, centerDims.width, centerDims.height, 'light', isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            break;
                        case 'minimalist-dark':
                        case 'brutalist-dark':
                            themes2.drawTurntableCenterBrutalist(currentCenterCtx, centerDims.width, centerDims.height, 'dark', isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            break;
                        case 'minimalist-warm':
                            themes2.drawTurntableCenterBrutalist(currentCenterCtx, centerDims.width, centerDims.height, 'warm', isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            break;
                        case 'minimalist-obsidian':
                            themes2.drawTurntableCenterBrutalist(currentCenterCtx, centerDims.width, centerDims.height, 'obsidian', isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            break;
                        default:
                            themes2.drawTurntableCenterHeart(currentCenterCtx, centerDims.width, centerDims.height, isPlaying, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity);
                            break;
                    }
                    currentCenterCtx.restore();
                    currentCenterCtx.restore();
                }
            }

            if (st.isVisualizerLoopRunning) {
                st.animFrameId = requestAnimationFrame(renderFrame);
            }
        }

        store.state.isVisualizerLoopRunning = true;
        store.state.animFrameId = requestAnimationFrame(renderFrame);
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
        drawRoundedRect,
        loadVisualizerThemes1,
        loadVisualizerThemes2
    };
