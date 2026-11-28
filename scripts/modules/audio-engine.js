import {buildAudioDiagnostic} from './signal-path-model.js';
import {createAudioPreferencesUi} from './audio-preferences-ui.js';
import {createMixerWriteQueue} from './mixer-write-queue.js';
import {createDspControlTransaction, createLatestControlQueue} from './dsp-control-transaction.js';
import {createOutputHold} from './audio-output-hold.js';
import {createWorkletAcknowledgements} from './worklet-ack.js';
import {effectState} from './audio-settings-status.js';
import {createPeqWorkstation} from './peq-workstation.js';
import {createGraphLifecycle, createWorkletLoader, clearGraphNodes} from './audio-graph-lifecycle.js';
import {syncVolumeSliders} from './control-ui.js';
import {updateMarqueeText} from './player-marquee.js';
// CachyMusic - Audiophile DSP Engine (64-Bit Worklet & Web Audio Fallback)
import {
    getValidSampleRate,
    safeStorage,
    showToast
} from './utils.js';
import { PEQ_FREQS, hasActiveDsp, store } from './state.js';
import { miniVolumeSlider, volumeLevel, volumeSlider } from './ui-elements.js';
import { getRuntime } from './runtime-capabilities.js';
import { createPlaybackAudioContext, requireRunningGraph, canActivatePreparedWorklet } from './audio-context-policy.js';
import { appAttenuation, effectiveLimiterEnabled, requiresPeakProtection, createSoftClipCurve, createLinearCurve, computeLimiterProfile as computeLimiterProfilePolicy, getEffectiveAmplification as getEffectiveAmplificationPolicy, getPreAmpGainValue as getPreAmpGainValuePolicy, computeReplayGainMultiplier as computeReplayGainMultiplierPolicy, hasUserShapingDsp as hasUserShapingDspPolicy } from './audio-policies.js';





    const workletAcks=createWorkletAcknowledgements();
    export const outputHold=createOutputHold(()=>({ctx:store.state.audioContext,node:store.state.outputGate}));
    export async function acknowledgeAudioEdit(){
        const s=store.state;
        if(s.isNativePlaybackActive?.())return;
        if(s.audioContext&&s.audioContext.state!=='closed'&&!getConfirmedAudioRoute())throw Error('Audio route not ready');
        if (s.audioContext && s.audioContext.state !== 'closed' && (s.mathPrecision !== 'native' || hasUserShapingDsp()) && !s.dspWorkletNode && typeof s.audioContext.audioWorklet?.addModule === 'function') {
            await loadDspWorklet();
        }
        if(s.dspWorkletNode&&!s.dspWorkletNode._cachyConfigured&&(s.mathPrecision!=='native'||hasUserShapingDsp())&&s.audioContext?.state==='running'){
            const node=s.dspWorkletNode;await workletAcks.wait(node);
            if(s.dspWorkletNode===node&&!workletAcks.pending(node)){node._cachyConfigured=true;updateAudioRouting();}
        }
        if(getConfirmedAudioRoute()==='worklet'){
            const ctx=s.audioContext,node=s.dspWorkletNode;
            await workletAcks.wait(node);
            if(s.audioContext!==ctx||s.dspWorkletNode!==node||workletAcks.pending(node)||getConfirmedAudioRoute()!=='worklet')throw Error('DSP route changed during acknowledgement');
        }
    }

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
            controlTransaction.write('cachymusic_limiter', s.isLimiter ? 'true' : 'false');
        } else if (type === 'amp') {
            s.isAmpBoost = active;
            controlTransaction.write('cachymusic_amp_boost', s.isAmpBoost ? 'true' : 'false');
            updateAmpGain(now);
        } else if (type === 'bass') {
            s.isBassBoost = active;
            controlTransaction.write('cachymusic_bass_boost', s.isBassBoost ? 'true' : 'false');
            if (s.bassFilter && s.audioContext) {
                s.bassFilter.gain.setTargetAtTime(s.isBassBoost ? 3.8 : 0, now, 0.04);
            }
        } else if (type === 'vocal') {
            s.isVocalBoost = active;
            controlTransaction.write('cachymusic_vocal_boost', s.isVocalBoost ? 'true' : 'false');
            if (s.vocalFilter && s.audioContext) {
                s.vocalFilter.gain.setTargetAtTime(s.isVocalBoost ? 2.8 : 0, now, 0.04);
            }
        } else if (type === 'treble') {
            s.isTrebleBoost = active;
            controlTransaction.write('cachymusic_treble_boost', s.isTrebleBoost ? 'true' : 'false');
            if (s.trebleFilter && s.audioContext) {
                s.trebleFilter.gain.setTargetAtTime(s.isTrebleBoost ? 3.0 : 0, now, 0.04);
            }
        } else if (type === 'xfeed') {
            s.isCrossfeed = active;
            if (active && s.isAmbiophonics) { s.isAmbiophonics = false; controlTransaction.write('cachymusic_ambiophonics','false'); store.emit('audio:preferences-changed'); }
            controlTransaction.write('cachymusic_crossfeed', s.isCrossfeed ? 'true' : 'false');
        } else if (type === 'subsonic') {
            s.isSubsonic = active;
            controlTransaction.write('cachymusic_subsonic', s.isSubsonic ? 'true' : 'false');
            if (s.subsonicFilter && s.audioContext) {
                s.subsonicFilter.frequency.setTargetAtTime(s.isSubsonic ? 20 : 5, now, 0.04);
            }
        } else if (type === 'agp') {
            s.isAgpEnabled = active;
            controlTransaction.write('cachymusic_agp', s.isAgpEnabled ? 'true' : 'false');
        } else if (type === 'surround') {
            s.isSurroundWidener = active;
            controlTransaction.write('cachymusic_surround_ms', s.isSurroundWidener ? 'true' : 'false');
        } else if (type === 'phase') {
            s.isPhaseInvert = active;
            controlTransaction.write('cachymusic_phase_invert', s.isPhaseInvert ? 'true' : 'false');
        } else if (type === 'mono') {
            s.isMonoMix = active;
            controlTransaction.write('cachymusic_mono_mix', s.isMonoMix ? 'true' : 'false');
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

    let cachedDspBtns = null;
    function updateDspButtonsUi(emit = true) {
        const s = store.state;
        const route = s.isNativePlaybackActive?.() ? "native" : getConfirmedAudioRoute();
        const status = key => effectState(s,key,route,{ackPending:workletAcks.pending(s.dspWorkletNode)});
        const statusLabel = (key, on, off) => ({unsupported:"Unavailable",pending:"Pending",applied:on,off})[status(key)];
        if (!cachedDspBtns || !cachedDspBtns.length) {
            cachedDspBtns = Array.from(document.querySelectorAll('[data-target="limiter"], [data-target="amp"], [data-target="bass"], [data-target="vocal"], [data-target="treble"], [data-target="xfeed"], [data-target="subsonic"], [data-target="agp"], [data-target="surround"], [data-target="phase"], [data-target="mono"], [data-target="peq"]'));
        }
        const dspBtns = cachedDspBtns;
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
            btn.dataset.effectState=status(target);
            if(target==='limiter'){
                const auto=requiresPeakProtection(s)&&!s.isLimiter;
                btn.dataset.autoProtection=String(auto);
                btn.title=auto?'Automatic peak protection required by active processing. Enable manual limiting to retain protection when effects are off.':'Manual limiter; automatic peak protection remains enabled for gain-risk effects.';
                btn.setAttribute('aria-label',auto?'Limiter: automatic protection configured':'Manual limiter');
                const spec=btn.querySelector('.peqDspSpec');if(spec)spec.textContent=auto?(status(target)==='applied'?'Auto':status(target)==='pending'?'Pending':'Unavailable'):(status(target)==='applied'&&route==='fallback'?'Fallback':status(target)==='unsupported'?'Unavailable':'−0.6 dBFS');
            }
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            const dot = btn.querySelector('.dspDot');
            if (dot) dot.classList.toggle('active', isActive || (target==='limiter' && status(target)==='applied'));
        });

        const peqXfeedStatus = document.getElementById('peqXfeedStatus');
        if (peqXfeedStatus) peqXfeedStatus.textContent = statusLabel("xfeed","ON","OFF");
        const peqAgpStatus = document.getElementById('peqAgpStatus');
        if (peqAgpStatus) peqAgpStatus.textContent = statusLabel("agp","GUARD ON","BYPASS");
        const peqSurroundStatus = document.getElementById('peqSurroundStatus');
        if (peqSurroundStatus) peqSurroundStatus.textContent = statusLabel("surround","135% WIDE","100%");
        const peqPhaseStatus = document.getElementById('peqPhaseStatus');
        if (peqPhaseStatus) peqPhaseStatus.textContent = statusLabel("phase","180° INV","0° NORM");
        const peqMonoStatus = document.getElementById('peqMonoStatus');
        if (peqMonoStatus) peqMonoStatus.textContent = statusLabel("mono","MONO L+R","STEREO");

        const isPeqActive = !s.isPeqBypassed && s.peqGains.some(g => g !== 0);
        const playerPeqBadge = document.getElementById('playerPeqBadge');
        if (playerPeqBadge) {
            playerPeqBadge.textContent = isPeqActive ? (status('peq')==='applied'?'ACTIVE':'SET') : '10-BAND';
            playerPeqBadge.classList.toggle('active', isPeqActive);
        }

        const activeDspCount = ['amp','bass','vocal','treble','limiter','xfeed','surround','phase','mono'].filter(key=>status(key)==='applied').length;
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
            peqDspActiveSummary.textContent = activeDspCount > 0 ? `${activeDspCount} ACTIVE` : (s.isAgpEnabled ? 'AGP configured' : 'No active effects');
            peqDspActiveSummary.classList.toggle('active', activeDspCount > 0 || s.isAgpEnabled);
        }

        const playerPeqBtn = document.getElementById('playerPeqBtn');
        if (playerPeqBtn) {
            playerPeqBtn.classList.toggle('active', isPeqActive || activeDspCount > 0);
        }

        if (emit) {
            store.emit('ui:sync-dac-status');
            store.emit('ui:sync-track-badge');
        }
    }

    function syncBipolarSliderFill(slider, val, minVal, maxVal) {
        if (!slider) return;
        const span = (maxVal - minVal) || 1;
        const pct = Math.max(0, Math.min(100, ((val - minVal) / span) * 100));
        slider.style.setProperty('--fill-low', `${Math.min(50, pct).toFixed(2)}%`);
        slider.style.setProperty('--fill-high', `${Math.max(50, pct).toFixed(2)}%`);
        slider.dataset.polarity = val > 0.01 ? 'boost' : (val < -0.01 ? 'cut' : 'flat');
    }

    function restoreControlRoute() {
        const s=store.state, now=s.audioContext?.currentTime || 0;
        for (const [node,param,value] of [[s.bassFilter,'gain',s.isBassBoost?3.8:0],[s.vocalFilter,'gain',s.isVocalBoost?2.8:0],[s.trebleFilter,'gain',s.isTrebleBoost?3:0],[s.subsonicFilter,'frequency',s.isSubsonic?20:5]]) {
            node?.[param]?.setTargetAtTime(value,now,.04);
        }
        s.peqNodes?.forEach((node,i)=>{
            node.gain.setTargetAtTime(s.isPeqBypassed?0:s.peqGains[i],now,.04);
            node.Q.setTargetAtTime(s.peqQs[i],now,.03);
        });
        if(s.audio) for(const key of ['preservesPitch','mozPreservesPitch','webkitPreservesPitch']) s.audio[key]=s.isPitchLockTempo;
        updateAmpGain(now);updatePreAmpGain(now);updateLimiterState(now);updateAudioRouting();updateWorkletParams();
    }
    function refreshControlUi() {
        const s=store.state;
        PEQ_FREQS.forEach((_,i)=>{
            const gain=s.peqGains[i],slider=document.getElementById(`peqSlider-${i}`),db=document.getElementById(`peqFaderDb-${i}`),q=document.getElementById(`peqFaderQ-${i}`);
            if(slider){slider.value=gain;syncBipolarSliderFill(slider,gain,-15,15);}
            if(db){db.textContent=`${gain>0?'+':''}${gain.toFixed(1)}`;db.className=`peqFaderDb ${gain>0?'boost':gain<0?'cut':''}`;}
            if(q)q.textContent=`Q ${s.peqQs[i].toFixed(1)}`;
        });
        const balance=document.getElementById('peqStereoBalanceSlider'),label=document.getElementById('peqStereoBalanceValue');
        const pct=Math.round(s.stereoBalance*100);
        if(balance){balance.value=pct;syncBipolarSliderFill(balance,pct,-100,100);}
        if(label)label.textContent=Math.abs(pct)<=1?'CENTER':`${Math.abs(pct)}% ${pct<0?'L':'R'}`;
        const bypass=document.getElementById('peqBypassToggleBtn');bypass?.classList.toggle('bypassed',s.isPeqBypassed);
        const bypassText=document.getElementById('peqBypassStatusText');if(bypassText)bypassText.textContent=s.isPeqBypassed?'BYPASS':'ACTIVE';
        const pitchLock = document.getElementById('peqPitchLockBtn');
        if (pitchLock) { pitchLock.classList.toggle('active', s.isPitchLockTempo); pitchLock.setAttribute('aria-pressed', String(s.isPitchLockTempo)); pitchLock.textContent = s.isPitchLockTempo ? 'Pitch locked' : 'Pitch follows speed'; }
        updateDspButtonsUi();drawPeqCurve();store.emit('audio:preferences-changed');
    }
    const controlTransaction=createDspControlTransaction({state:store.state,storage:safeStorage,acknowledge:acknowledgeAudioEdit,restore:restoreControlRoute,refresh:committed=>{if(committed){updateDspButtonsUi();store.emit('audio:preferences-changed');}else refreshControlUi();}});
    function editAudioControl(change) {
        const run = store.state.withAudioEdit;
        const edit=checkpoint=>controlTransaction.run(change,checkpoint);
        return Promise.resolve().then(() => run ? run(edit) : edit()).catch(error => {
            console.warn('Audio control change failed', error);
            refreshControlUi();showToast('Audio change could not be completed.');
        });
    }
    const latestControl=createLatestControlQueue(editAudioControl,()=>store.state.audioEditIntent?.());

    function setupDspControls() {
        updateDspButtonsUi();
        const dspBtns = document.querySelectorAll('[data-target="limiter"], [data-target="amp"], [data-target="bass"], [data-target="vocal"], [data-target="treble"], [data-target="xfeed"], [data-target="subsonic"], [data-target="agp"], [data-target="surround"], [data-target="phase"], [data-target="mono"], [data-target="peq"]');
        dspBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.target === 'peq') toggleDspBoost('peq');
                else void editAudioControl(() => toggleDspBoost(btn.dataset.target));
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
            controlTransaction.write('cachymusic_peq_gains', JSON.stringify(s.peqGains));
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
            controlTransaction.write('cachymusic_peq_qs', JSON.stringify(s.peqQs));
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

    const {drawPeqCurve, refreshSpectrum, initPeqWorkstation} = createPeqWorkstation({getConfirmedAudioRoute, syncBipolarSliderFill, latestControl, editAudioControl, setPeqBandGain, setPeqBandQ, setPeqPreset, importAutoEqProfile, controlTransaction, updateWorkletParams, updatePreAmpGain, updateAudioRouting});

    // AudioWorklet 64-Bit Processor Loader
    const loadDspWorklet = createWorkletLoader({
        current: () => store.state.audioContext,
        isCurrent: ctx => store.state.audioContext === ctx && ctx.state !== 'closed' && !graphLifecycle.isClosing(ctx),
        install(targetCtx) {
            const s = store.state;
            const node = new AudioWorkletNode(targetCtx, 'cachymusic-dsp-processor', {
                numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2]
            });
            s.dspWorkletNode = node;
            node._cachyConfigured=false;
            workletAcks.register(node);
            node.onprocessorerror = error => {
                if (s.dspWorkletNode !== node) return;
                console.warn('[AudioWorklet] Processor failed; using fallback:', error);
                if(getConfirmedAudioRoute()==='worklet')store.emit('audio:processor-failed');
                releaseDspWorklet();
                updateAudioRouting();
            };
            node.port.onmessage = ({data}) => {
                if (s.dspWorkletNode !== node) return;
                workletAcks.receive(node,data);
                if(data?.type==='status'){
                    if(!node._cachyConfigured&&!workletAcks.pending(node)){
                        node._cachyConfigured=true;
                        updateAudioRouting();
                    }
                    updateDspButtonsUi(false);store.emit('audio:preferences-changed');return;
                }
                if(data?.type !== 'agp_telemetry') return;
                const status = document.getElementById('peqAgpStatus');
                if (status && s.isAgpEnabled && Number.isFinite(data.gainReductionDb)) {
                    status.textContent = data.gainReductionDb < -0.1 ? `${data.gainReductionDb.toFixed(1)} dB` : 'GUARD ON';
                }
            };
            updateWorkletParams();
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
        workletAcks.close(node);
        node.onprocessorerror = null;
        node.port.onmessage = null;
        try { node.port.close(); } catch (_) {}
        try { node.disconnect(); } catch (_) {}
    }

    function computeReplayGainMultiplier() { return computeReplayGainMultiplierPolicy(store.state); }

    function hasUserShapingDsp() { return hasUserShapingDspPolicy(store.state); }

    const sentWorkletParameters=new WeakMap();
    function updateWorkletParams() {
        const s = store.state;
        if (!s.dspWorkletNode || !s.dspWorkletNode.port) return;
        const sr = (s.audioContext && s.audioContext.sampleRate) ? s.audioContext.sampleRate : 48000;
        const rg = computeReplayGainMultiplier();
        const preAmp = getPreAmpGainValue();
        const amp = getEffectiveAmplification();
        const curTrack = s.allTracks[s.currentTrackIndex];
        const trackBits = (curTrack && curTrack.bitsPerSample) ? Number(curTrack.bitsPerSample) : 0;
        const usePrecision64 = s.mathPrecision !== '32';
        const quantBits = (trackBits === 16 && sr <= 48000 && !usePrecision64) ? 16 : 24;

        const node=s.dspWorkletNode,params={
            precision64: usePrecision64,
            agpEnabled: s.isAgpEnabled,
            limiterEnabled: effectiveLimiterEnabled(s),
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
        };
        const signature=JSON.stringify(params);
        if(sentWorkletParameters.get(node)===signature)return;
        workletAcks.send(node,params);sentWorkletParameters.set(node,signature);
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
    let mixerReadGeneration=0;
    let mixerModeChanging=false;
    async function checkHardwareGainStatus(checkpoint = () => {}, transition=false) {
        if(!transition && (mixerModeChanging||mixerWrites.busy||hwVolumeDebounceTimer!==null))return;
        const s = store.state;
        const generation=++mixerReadGeneration;
        const current=()=>generation===mixerReadGeneration;
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
                    if(!current())return;
                    checkpoint();
                    markHwGainUnavailable();
                    return;
                }
                data = await res.json();
            }

            if(!current())return;
            checkpoint();
            if (data && data.success) {
                s.hwVolumeBackend = data.backend || 'none';
                s.hwGainAvailable = Boolean(data.available);
                const pill = document.getElementById('settingsHardwareGainPill');
                const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
                const hwGainDot = document.getElementById('settingsHwGainDot');
                const hwGainText = document.getElementById('settingsHwGainText');
                const devTag = data.activeDevice ? `${s.hwVolumeBackend.toUpperCase()} • ${data.activeDevice}` : s.hwVolumeBackend.toUpperCase();
                if (pill) {
                    updateMarqueeText(pill, data.available ? `READY (${devTag})` : 'UNAVAILABLE');
                }
                if (!data.available) {
                    markHwGainUnavailable();
                    if (hwGainBtn) {
                        hwGainBtn.disabled = true;
                        hwGainBtn.classList.add('disabled');
                        hwGainBtn.classList.remove('active');
                        hwGainBtn.setAttribute('aria-disabled', 'true');
                        hwGainBtn.title = 'System Volume Control is unavailable on this platform or output interface.';
                    }
                    if (hwGainDot) hwGainDot.classList.remove('active');
                    if (hwGainText) updateMarqueeText(hwGainText, 'SYSTEM VOLUME: UNAVAILABLE');
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
                        updateMarqueeText(hwGainText, `SYSTEM VOLUME: ON (${s.hwVolumeBackend.toUpperCase()})`);
                    }
                }
                if (s.isHardwareGain && data.available && Number.isFinite(data.volume)) {
                    s.currentVolumeValue = Math.max(0, Math.min(1.5, data.volume));
                    syncVolumeSliders(s.currentVolumeValue, volumeSlider, miniVolumeSlider);
                    if (volumeLevel) {
                        const pct = Math.round(s.currentVolumeValue * 100);
                        volumeLevel.textContent = s.currentVolumeValue > 1.0 ? `${pct}% HW-AMP` : `${pct}%`;
                    }
                    store.emit('ui:sync-volume-icon', { volume: Math.min(1.0, s.currentVolumeValue) });
                    if (s.audio) {
                        // Preserve explicit application mute; mixer mute belongs to the OS.
                        s.audio.volume = appAttenuation(s);
                    }
                    syncSoftwareVolume();
                }
            } else {
                markHwGainUnavailable();
            }
        } catch (error) {
            if(!current())return;
            checkpoint();
            markHwGainUnavailable();
        }
    }

    function markHwGainUnavailable() {
        const s = store.state;
        const wasHardware = s.isHardwareGain;
        s.isHardwareGain = false;
        s.hwGainAvailable = false;
        safeStorage.setItem('cachymusic_hardware_gain','false');
        safeStorage.setItem('cachymusic_hw_gain','false');
        if(wasHardware)setVolume(s.hardwareAppGain,true,true,{preserveMute:true,dispatchSystem:false});
        const pill = document.getElementById('settingsHardwareGainPill');
        const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
        const hwGainDot = document.getElementById('settingsHwGainDot');
        const hwGainText = document.getElementById('settingsHwGainText');
        if (pill) {
            updateMarqueeText(
                pill,
                s.hasExternalDac
                    ? `DAC DETECTED (${s.detectedDacLabel}) • OS VOL ONLY`
                    : 'UNAVAILABLE'
            );
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
            updateMarqueeText(hwGainText, s.hasExternalDac ? 'SYSTEM VOLUME: BROWSER OS-LOCKED' : 'SYSTEM VOLUME: UNAVAILABLE');
        }
    }

    const mixerWrites=createMixerWriteQueue({
        enabled:()=>store.state.isHardwareGain && !mixerModeChanging,
        write:async vol=>{
            const rt=getRuntime();
            if(typeof window.AndroidBridge?.setHardwareStreamVolume==='function'){
                if(window.AndroidBridge.setHardwareStreamVolume(Math.max(0,Math.min(1,vol)))!==true)throw Error('Mixer write failed');
            } else if(rt.hasPhpBackend){
                const res=await fetch('php/api/hardware_volume.php?action=set_volume',{
                    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({volume:vol})
                });
                if(!res.ok||!(await res.json()).success)throw Error('Mixer write failed');
            } else throw Error('Mixer unavailable');
        },
        report:()=>{showToast('System volume update failed.');void checkHardwareGainStatus(undefined,true);}
    });
    function dispatchHardwareVolume(vol) {
        const rt=getRuntime();
        if (!store.state.isHardwareGain || mixerModeChanging || (!rt.hasHardwareGain && !window.AndroidBridge?.setHardwareStreamVolume)) return;
        mixerReadGeneration++;
        if(hwVolumeDebounceTimer)clearTimeout(hwVolumeDebounceTimer);
        hwVolumeDebounceTimer=setTimeout(()=>{
            hwVolumeDebounceTimer=null;
            if(store.state.isHardwareGain&&!mixerModeChanging)mixerWrites.submit(vol);
        },35);
    }

    // Audio preferences: commit each control independently.
    async function beginMixerTransition(){
        mixerModeChanging=true; mixerReadGeneration++;
        if(hwVolumeDebounceTimer){clearTimeout(hwVolumeDebounceTimer);hwVolumeDebounceTimer=null;}
        await mixerWrites.invalidate();
    }
    function endMixerTransition(){mixerModeChanging=false;}
    const setupNeutronSettingsControls=createAudioPreferencesUi({acknowledgeAudioEdit, audioBufferChangePending, checkDacCapabilities, checkHardwareGainStatus, ensureAudioEngineForSampleRate, getConfirmedAudioRoute, setVolume, syncSoftwareVolume, updateAmpGain, updateAudioRouting, updateDspButtonsUi, updateLimiterState, updateWorkletParams, workletAcks, beginMixerTransition, endMixerTransition});

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
        updateAudioRouting();
        store.emit('ui:sync-dac-status');
    }

    function setVolume(val, updateInput = false, persist = true, {preserveMute=false,dispatchSystem=true}={}) {
        const s = store.state;
        if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
            val = Number.isFinite(s.currentVolumeValue)?s.currentVolumeValue:0;
        }
        s.currentVolumeValue = Math.max(0, Math.min(1.5, val));
        if (persist) safeStorage.setItem('cachymusic_volume', s.currentVolumeValue.toString());
        syncVolumeSliders(s.currentVolumeValue, volumeSlider, miniVolumeSlider);

        if (s.isHardwareGain && s.hwGainAvailable && getRuntime().hasHardwareGain) {
            // Keep the pre-switch app attenuation; changing the OS mixer must not reset it.
            if (s.audio) {
                s.audio.volume = appAttenuation(s);
                // Do not clear application mute when adjusting the OS mixer.
            }
            if(dispatchSystem)dispatchHardwareVolume(s.currentVolumeValue);
            updateAmpGain(s.audioContext?.currentTime || 0);
            updateLimiterState(s.audioContext?.currentTime || 0);
            updateWorkletParams();
            updateAudioRouting();
        } else {
            // Standard HTML5 audio.volume clamped to [0.0, 1.0]
            const baseVol = appAttenuation(s);
            if (s.audio) {
                s.audio.volume = baseVol;
                if(!preserveMute&&!s.isHardwareGain)s.audio.muted = false;
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


    function initCoreNodes() {
        const s = store.state;
        if (!s.audioContext) return;
        const ctx = s.audioContext;
        if (!s.outputGate || s.outputGate.context !== ctx) {
            s.outputGate = ctx.createGain();
            outputHold.initialize(s.outputGate);
            s.outputGate.connect(ctx.destination);
        }
        if (!s.analyser || s.analyser.context !== ctx) {
            s.analyser = ctx.createAnalyser();
            s.analyser.fftSize = 2048; // FFT bin spacing is context sample rate / fftSize.
            s.analyser.smoothingTimeConstant = 0.38; // Smooth display at the cost of temporal resolution.
            s.analyser.minDecibels = -90; // Wide dynamic range captures delicate high-frequency air, harmonics & cymbals above 16kHz
            s.analyser.maxDecibels = -25;
        }
    }

    function ensureFallbackDspNodes() {
        const s = store.state;
        if (!s.audioContext) return;
        const ctx = s.audioContext;
        if (s.ampGainNode && s.ampGainNode.context === ctx) return;

        // -1. Subsonic High-Pass Filter: Infrasonic rumble eliminator at 20 Hz (Butterworth Q=0.707)
        s.subsonicFilter = ctx.createBiquadFilter();
        s.subsonicFilter.type = 'highpass';
        s.subsonicFilter.frequency.value = s.isSubsonic ? 20 : 5;
        s.subsonicFilter.Q.value = 0.707;

        // 0. ReplayGain / EBU R128 Loudness Normalization Stage
        s.replayGainNode = ctx.createGain();
        s.replayGainNode.gain.value = computeReplayGainMultiplier();

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
        s.ampGainNode.gain.value = getEffectiveAmplification();

        // 5. Dedicated Studio-Grade Transparent Brickwall Limiter (Master anti-clipping protection)
        s.dspLimiter = ctx.createDynamicsCompressor();
        const initProfile = computeLimiterProfile();
        if (!initProfile.isBypassed) {
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
        s.ceilingTrimGain.gain.value = effectiveLimiterEnabled(s) ? Math.pow(10, -0.6 / 20) : 1.0;

        // 7. Digital soft clipping stage.
        s.ampSoftClipper = ctx.createWaveShaper();
        s.ampSoftClipper.curve = effectiveLimiterEnabled(s) ? createSoftClipCurve(2048) : createLinearCurve(2048);
        // Reduce fallback waveshaper cost at higher graph rates. This is a policy,
        // not proof of alias-free processing.
        s.ampSoftClipper.oversample = (ctx.sampleRate >= 88200) ? 'none' : '2x';
    }

    function initDspNodes() {
        initCoreNodes();
        ensureFallbackDspNodes();
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
        newAudio._trackGeneration=oldAudio._trackGeneration;
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
        const target=s.audio?.muted?0:appAttenuation(s);
        const now=s.audioContext.currentTime;
        node.gain.cancelScheduledValues(now);
        if(immediate)node.gain.setValueAtTime(target,now);else node.gain.setTargetAtTime(target,now,0.01);
    }
    let previousCoreRoute = null;
    let confirmedRoute = null;
    export function getConfirmedAudioRoute() {
        const s = store.state;
        if (!s.outputGate || !confirmedRoute || confirmedRoute.ctx !== s.audioContext || s.audioContext?.state === 'closed') return null;
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
        const audible=s.isSoftwareDecoding?(!s.isSoftwarePaused&&Boolean(s.softwareSourceNode||s.activeDecodedBuffer?.streaming)):Boolean(s.audio&&!s.audio.paused);
        const usable=canActivatePreparedWorklet({configured:s.dspWorkletNode?._cachyConfigured,previousRoute:previousCoreRoute?.route,audible,held:outputHold.held});
        const route=(s.mathPrecision==='native'&&!hasUserShapingDsp())?'direct':usable?'worklet':'fallback';
        const topology=route==='fallback'?[Boolean(s.isSubsonic),Boolean(hasActiveDsp()),Boolean(s.isCrossfeed&&s.xfeedNetwork),effectiveLimiterEnabled(s)].join(':'):route;
        // Parameter-only edits do not disconnect the live audio route.
        if(previousCoreRoute?.active===active&&previousCoreRoute?.route===route&&previousCoreRoute?.ctx===s.audioContext&&(route!=='worklet'||previousCoreRoute?.worklet===s.dspWorkletNode)&&previousCoreRoute?.topology===topology){updateWorkletParams();store.emit('ui:sync-dac-status');return;}
        previousCoreRoute=null;
        confirmedRoute=null;
        try {
            updateLimiterState(s.audioContext.currentTime);
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
                activeSource.connect(s.outputGate);
                confirmedRoute = previousCoreRoute={active,route,ctx:s.audioContext,worklet:s.dspWorkletNode,topology};
                store.emit('ui:sync-dac-status');
                return;
            }

            // Primary Studio 64-Bit Single-Path Worklet Graph:
            // All filtering, EQ, crossfeed, R.A.C.E., M/S, AGP, soft-clip & final dither run strictly inside dspWorkletNode
            if (route==='worklet') {
                updateWorkletParams();
                activeSource.connect(s.dspWorkletNode);
                s.dspWorkletNode.connect(s.outputGate);
                confirmedRoute = previousCoreRoute={active,route,ctx:s.audioContext,worklet:s.dspWorkletNode,topology};
                store.emit('ui:sync-dac-status');
                return;
            }

            // Fallback Web Audio Biquad Graph (only when AudioWorklet is unavailable)
            if (route !== 'direct') loadDspWorklet();
            ensureFallbackDspNodes();
            updatePreAmpGain(s.audioContext.currentTime);
            let rootNode = activeSource;
            if (s.isSubsonic && s.subsonicFilter) {
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
                rootNode.connect(s.outputGate);
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
                if (effectiveLimiterEnabled(s) && s.dspLimiter && s.ampSoftClipper) {
                    s.ampGainNode.connect(s.dspLimiter);
                    if (s.ceilingTrimGain) {
                        s.dspLimiter.connect(s.ceilingTrimGain);
                        s.ceilingTrimGain.connect(s.ampSoftClipper);
                    } else {
                        s.dspLimiter.connect(s.ampSoftClipper);
                    }
                    terminalNode = s.ampSoftClipper;
                }
                terminalNode.connect(s.outputGate);
            }
            confirmedRoute = previousCoreRoute={active,route,ctx:s.audioContext,worklet:s.dspWorkletNode,topology};
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

    const graphClockStates=new WeakMap();
    function onGraphStateChange(event) {
        const ctx = event.currentTarget;
        const previous=graphClockStates.get(ctx);graphClockStates.set(ctx,ctx.state);
        if((ctx.state==='interrupted'||(previous==='running'&&ctx.state==='suspended'))&&store.state.audioContext===ctx&&!graphLifecycle.replacing)store.emit('audio:graph-interrupted');
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
            initCoreNodes();
            getOrCreateAudioSourceNode();
            updateAudioRouting();
            if (!getConfirmedAudioRoute()) throw new Error('Audio route not connected');
            if (s.mathPrecision !== 'native' || hasUserShapingDsp()) {
                loadDspWorklet();
            }
        } catch (error) {
            // Retain ownership of a partially initialized context until it
            // actually closes; the next ensure can safely recover it.
            confirmedRoute = previousCoreRoute = null;
            console.warn('Audio graph initialization failed:', error);
        }
        graphClockStates.set(ctx,ctx.state);
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
        if (['suspended','interrupted'].includes(ctx?.state) && getConfirmedAudioRoute() && !graphLifecycle.replacing && !pendingResumes.has(ctx)) {
            try {
                const task = ctx.resume();
                pendingResumes.set(ctx, task);
                task.catch(() => {}).finally(() => {if(pendingResumes.get(ctx)===task)pendingResumes.delete(ctx);});
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
        return ctx === s.audioContext && getConfirmedAudioRoute() ? resumeGraph(ctx) : null;
    }

    export async function requirePlaybackGraph() {
        const s=store.state,context=s.audioContext;
        try{
            if(context&&getConfirmedAudioRoute())updateAudioRouting();
            await requireRunningGraph({context,current:()=>s.audioContext,confirmed:getConfirmedAudioRoute,resume:resumeAudioGraph});
            if(getConfirmedAudioRoute()==='worklet'){
                const node=s.dspWorkletNode;await workletAcks.wait(node);
                if(s.audioContext!==context||s.dspWorkletNode!==node||context.state!=='running'||workletAcks.pending(node)||getConfirmedAudioRoute()!=='worklet')throw Error('DSP route changed before playback. Press Play to retry.');
            }
            return context;
        }
        catch(error){
            // A resume promise can stay pending indefinitely on some output
            // devices. Let a later explicit Play retry; an old completion must
            // not remove the new attempt or start any source on its own.
            if(context&&context.state!=='running')pendingResumes.delete(context);
            throw error;
        }
    }

    function initAudioContext(preferredRate = null) {
        return resumeGraph(graphLifecycle.init());
    }

    // Unlock or warm AudioContext on user gesture when playback is active/requested
    ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(ev => {
        window.addEventListener(ev, () => {
            const s = store.state;
            const ctx = s.audioContext;
            if ((!ctx || ctx.state === 'closed') && (s.isPlayPending || s.isSoftwareDecoding) && !s.isNativePlaybackActive?.()) {
                initAudioContext();
                return;
            }
            resumeGraph(ctx);
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
        const s = store.state;
        const targetGain = computeReplayGainMultiplier();
        if (s.replayGainNode && s.audioContext) {
            const now=s.audioContext.currentTime;
            s.replayGainNode.gain.cancelScheduledValues(now);
            if(!s.isSoftwareDecoding && s.audio?.paused)s.replayGainNode.gain.setValueAtTime(targetGain,now);
            else s.replayGainNode.gain.setTargetAtTime(targetGain,now,.04);
        }
        // Track-specific ReplayGain can change the required protection topology.
        updateAudioRouting();
        updateWorkletParams();
        store.emit('ui:sync-dac-status');
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

// On-demand, bounded graph observation. Never connect the meter to a destination,
// retain raw audio or acquire a microphone. Native output is not measured here.
export async function collectAudioDiagnostic({valid=()=>true, sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
    const s=store.state,ctx=s.audioContext,gate=s.outputGate,route=getConfirmedAudioRoute();
    const track=s.currentTrack,nativeActive=Boolean(s.isNativePlaybackActive?.()),source=s.audioSourceNode,software=s.softwareSourceGainNode;
    const snapshot=buildAudioDiagnostic(s,track,nativeActive,route,null);
    if(nativeActive||!route||!gate||ctx?.state!=='running'||!s.isPlaying)return snapshot;
    let split;const meters=[];
    try{
        split=ctx.createChannelSplitter(2);gate.connect(split);
        for(let i=0;i<2;i++){const meter=ctx.createAnalyser();meter.fftSize=2048;meters.push(meter);split.connect(meter,i);}
        const samples=new Float32Array(2048),totals=meters.map(()=>({peak:0,sum:0,finiteSamples:0,overFullScale:0,nonfinite:0}));
        for(let i=0;i<5;i++){
            await sleep(100);
            if(!valid()||s.audioContext!==ctx||s.outputGate!==gate||getConfirmedAudioRoute()!==route||s.currentTrack!==track||s.audioSourceNode!==source||s.softwareSourceGainNode!==software||ctx.state!=='running'||!s.isPlaying)return {...snapshot,levels:{status:'interrupted'}};
            meters.forEach((meter,j)=>{meter.getFloatTimeDomainData(samples);const t=totals[j];for(const v of samples){if(!Number.isFinite(v)){t.nonfinite++;continue;}const a=Math.abs(v);t.peak=Math.max(t.peak,a);t.sum+=v*v;t.finiteSamples++;if(a>1)t.overFullScale++;}});
        }
        snapshot.levels={status:'sampled',scope:'post-output-gate Web Audio graph; five short windows, not true peak or hardware',channels:totals.map(({sum,...t})=>({...t,rms:t.finiteSamples?Math.sqrt(sum/t.finiteSamples):null}))};
        return snapshot;
    }catch{return {...snapshot,levels:{status:'unavailable'}};}
    finally{if(split){try{gate.disconnect(split);}catch{}try{split.disconnect();}catch{}}for(const m of meters)try{m.disconnect();}catch{}}
}
