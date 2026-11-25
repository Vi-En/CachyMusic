import {store, PEQ_FREQS, PEQ_Q_STEPS} from './state.js';
import {showToast, pushModalState, popModalState} from './utils.js';
import {effectState} from './audio-settings-status.js';
import {renderPeqCurve} from './peq-curve.js';
import {createSpectrumView} from './eq-spectrum.js';

// The workstation owns DOM bindings and spectrum presentation; the engine owns DSP transactions.
export function createPeqWorkstation({getConfirmedAudioRoute, syncBipolarSliderFill, latestControl, editAudioControl, setPeqBandGain, setPeqBandQ, setPeqPreset, importAutoEqProfile, controlTransaction, updateWorkletParams, updatePreAmpGain, updateAudioRouting}) {
    let initialized = false;
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

        if (!peqGrid || initialized) return;
        initialized = true;
        spectrumView?.dispose();
        spectrumView = createSpectrumView({
            eqCanvas: document.getElementById('peqSpectrumCanvas'),
            desktopCanvas: document.getElementById('desktopSpectrumCanvas'),
            status: document.getElementById('peqSpectrumStatus'),
            getSignal: getSpectrumSignal
        });
        refreshSpectrum();


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
                void latestControl(`gain-${i}`, () => {
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
            });
            slider.addEventListener('dblclick', () => { void editAudioControl(() => {
                slider.value = 0;
                setPeqBandGain(i, 0);
                syncBipolarSliderFill(slider, 0, -15, 15);
                const dbEl = document.getElementById(`peqFaderDb-${i}`);
                if (dbEl) {
                    dbEl.textContent = '0.0';
                    dbEl.className = 'peqFaderDb';
                }
                drawPeqCurve();
            }); });

            const qBtn = col.querySelector('.peqFaderQBtn');
            if (qBtn) {
                qBtn.addEventListener('click', () => { void editAudioControl(() => {
                    const curQ = s.peqQs[i] || 1.41;
                    let nextIdx = PEQ_Q_STEPS.findIndex(q => q > curQ + 0.05);
                    if (nextIdx === -1) nextIdx = 0;
                    const nextQ = PEQ_Q_STEPS[nextIdx];
                    setPeqBandQ(i, nextQ);
                    qBtn.textContent = `Q ${nextQ.toFixed(1)}`;
                    drawPeqCurve();
                }); });
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
                    playerPeqBadge.textContent = isPeqActive ? (effectState(s,'peq',s.isNativePlaybackActive?.()?'native':getConfirmedAudioRoute())==='applied'?'ACTIVE':'SET') : '10-BAND';
                    playerPeqBadge.classList.toggle('active', isPeqActive);
                }
            }
        }
        updateBypassUi();

        if (bypassBtn) {
            bypassBtn.addEventListener('click', () => { void editAudioControl(() => {
                s.isPeqBypassed = !s.isPeqBypassed;
                controlTransaction.write('cachymusic_peq_bypassed', s.isPeqBypassed ? 'true' : 'false');
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
            }); });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => { void editAudioControl(() => {
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
            }); });
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
                void latestControl('balance',()=>{
                s.stereoBalance = Math.max(-1.0, Math.min(1.0, rawPct / 100));
                syncBipolarSliderFill(balanceSlider, rawPct, -100, 100);
                controlTransaction.write('cachymusic_stereo_balance', s.stereoBalance.toFixed(2));
                if (balanceValueEl) balanceValueEl.textContent = formatStereoBalanceText(s.stereoBalance);
                updateWorkletParams();
                updateAudioRouting();
                });
            });
        }

        if (balanceResetBtn) {
            balanceResetBtn.addEventListener('click', () => { void editAudioControl(() => {
                s.stereoBalance = 0;
                controlTransaction.write('cachymusic_stereo_balance', '0');
                if (balanceSlider) {
                    balanceSlider.value = 0;
                    syncBipolarSliderFill(balanceSlider, 0, -100, 100);
                }
                if (balanceValueEl) balanceValueEl.textContent = formatStereoBalanceText(0);
                updateWorkletParams();
                updateAudioRouting();
            }); });
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
                pitchLockBtn.textContent = s.isPitchLockTempo ? 'Pitch locked' : 'Pitch follows speed';
                pitchLockBtn.setAttribute('aria-pressed', String(s.isPitchLockTempo));
                pitchLockBtn.classList.toggle('active', s.isPitchLockTempo);
            }
        }
        applyAudioPitchLockMode();

        if (pitchLockBtn) {
            pitchLockBtn.addEventListener('click', () => { void editAudioControl(() => {
                s.isPitchLockTempo = !s.isPitchLockTempo;
                controlTransaction.write('cachymusic_pitch_lock', s.isPitchLockTempo ? 'true' : 'false');
                applyAudioPitchLockMode();
                showToast(s.isPitchLockTempo ? 'Pitch-Lock Enabled: Independent Tempo' : 'Pitch follows playback speed');
            }); });
        }

        if (presetSelect) {
            presetSelect.addEventListener('change', () => { const preset=presetSelect.value; void editAudioControl(() => {
                setPeqPreset(preset);
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
                    controlTransaction.write('cachymusic_peq_bypassed', 'false');
                    updateBypassUi();
                    for (let i=0;i<PEQ_FREQS.length;i++) if (s.peqNodes?.[i] && s.audioContext) s.peqNodes[i].gain.setTargetAtTime(s.peqGains[i],s.audioContext.currentTime,.04);
                    updateWorkletParams(); updatePreAmpGain(s.audioContext?.currentTime || 0); updateAudioRouting();
                }
                drawPeqCurve();
            }); });
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
            autoEqApplyBtn.addEventListener('click', () => { void editAudioControl(() => {
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
                        controlTransaction.write('cachymusic_peq_bypassed', 'false');
                        updateBypassUi();
                        for (let i=0;i<PEQ_FREQS.length;i++) if (s.peqNodes?.[i] && s.audioContext) s.peqNodes[i].gain.setTargetAtTime(s.peqGains[i],s.audioContext.currentTime,.04);
                        updateWorkletParams(); updatePreAmpGain(s.audioContext?.currentTime || 0); updateAudioRouting();
                    }
                    drawPeqCurve();
                }
            }); });
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

    return {drawPeqCurve, refreshSpectrum, initPeqWorkstation};
}
