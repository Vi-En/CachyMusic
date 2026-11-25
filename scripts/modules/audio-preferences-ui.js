import {store} from './state.js';
import {safeStorage, getValidSampleRate, showToast, showCachyToast} from './utils.js';
import {audioSettingsStatus} from './audio-settings-status.js';
import {confirmAudioChange} from './audio-change-policy.js';
import {getRuntime} from './runtime-capabilities.js';
import {miniVolumeSlider, volumeSlider} from './ui-elements.js';
import {setDebugMode, updateAudioDiagnosticsUi, updateDebugHudState} from './settings.js';
import {syncVolumeSliders} from './control-ui.js';
import {ultrasonicFilterStatus} from './ultrasonic-status.js';

// Preference UI and transactions request graph/mixer operations through explicit callbacks.
export function createAudioPreferencesUi({acknowledgeAudioEdit, audioBufferChangePending, checkDacCapabilities, checkHardwareGainStatus, ensureAudioEngineForSampleRate, getConfirmedAudioRoute, setVolume, syncSoftwareVolume, updateAmpGain, updateAudioRouting, updateDspButtonsUi, updateLimiterState, updateWorkletParams, workletAcks, beginMixerTransition, endMixerTransition}) {
    let initialized = false;
    return function setupNeutronSettingsControls() {
        if (initialized) return;
        initialized = true;
        const s = store.state;
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
        let applying = false;
        let failed=false;

        function refreshPendingAudioBanner() {
            if (applyAudioStatus) applyAudioStatus.textContent = applying ? 'Updating audio settings…' : audioSettingsStatus(s, getConfirmedAudioRoute(), {bufferPending:audioBufferChangePending(), nativeActive:Boolean(s.isNativePlaybackActive?.()),ackPending:workletAcks.pending(s.dspWorkletNode),failed});
        }

        async function requestPreference(key, value) {
            if (applying) { showToast('Audio update in progress. Try again when it finishes.'); return; }
            if(snapshotCommittedAudioState()[key] === value)return;
            applying = true;
            failed=false;
            refreshPendingAudioBanner();
            try {
                if (!await confirmAudioChange(key, value)) return;
                refreshPendingAudioBanner();
                draft = {...snapshotCommittedAudioState(), [key]:value};
                if (key === 'debugModeActive') { setDebugMode(value); return; }
                // An active source keeps its graph until the next safe track boundary.
                const edit = checkpoint => commitPreference(key, checkpoint);
                await (s.withAudioEdit ? s.withAudioEdit(edit) : edit());
            } catch (error) {
                failed=true;
                console.warn('Audio preference change failed', error);
                showToast('Audio configuration could not be fully updated.');
            } finally {
                applying = false;
                draft = snapshotCommittedAudioState();
                syncAllSettingsDraftUi();
            }
        }

        // 1. Math Precision Architecture (Native Bypass | 64-Bit Studio | 32-Bit Fast)
        const precisionBtns = document.querySelectorAll('.enginePrecisionBtn');
        const precisionPill = document.getElementById('settingsEnginePrecisionPill');
        const updatePrecisionUi = () => {
            const cur = draft.mathPrecision;
            precisionBtns.forEach(b => {
                const selected = b.getAttribute('data-precision') === cur; b.classList.toggle('active', selected); b.setAttribute('aria-pressed', String(selected));
            });
            if (precisionPill) {
                precisionPill.textContent = cur === 'native'
                    ? 'Bypass when effects are off'
                    : (cur === '64' ? '64-bit internal' : '32-bit rounding');
            }
        };
        updatePrecisionUi();
        precisionBtns.forEach(b => {
            b.addEventListener('click', () => {
                const nextMode = b.getAttribute('data-precision') || '64';
                void requestPreference('mathPrecision', nextMode);
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
            if (hwGainBtn) { hwGainBtn.classList.toggle('active', draft.isHardwareGain); hwGainBtn.setAttribute('aria-pressed', String(draft.isHardwareGain)); }
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
                void requestPreference('isHardwareGain', !s.isHardwareGain);
            });
        }

        // 3. Ultrasonic IMD Filter
        const ultrasonicBtn = document.getElementById('settingsUltrasonicToggleBtn');
        const ultrasonicDot = document.getElementById('settingsUltrasonicDot');
        const ultrasonicText = document.getElementById('settingsUltrasonicText');
        const ultrasonicSelect = document.getElementById('settingsUltrasonicCutoffSelect');
        const ultrasonicPill = document.getElementById('settingsUltrasonicPill');
        const updateUltrasonicUi = () => {
            if (ultrasonicBtn) { ultrasonicBtn.classList.toggle('active', draft.isUltrasonic); ultrasonicBtn.setAttribute('aria-pressed', String(draft.isUltrasonic)); }
            if (ultrasonicDot) ultrasonicDot.classList.toggle('active', draft.isUltrasonic);
            if (ultrasonicText) {
                ultrasonicText.textContent = draft.isUltrasonic ? 'ULTRASONIC FILTER: ON' : 'ULTRASONIC FILTER: OFF';
            }
            if (ultrasonicPill) {
                ultrasonicPill.textContent = ultrasonicFilterStatus({enabled:draft.isUltrasonic, cutoffHz:draft.ultrasonicCutoff, contextRateHz:s.audioContext?.sampleRate, workletReady:getConfirmedAudioRoute()==='worklet' && !s.isNativePlaybackActive?.() && draft.isUltrasonic === s.isUltrasonic && draft.ultrasonicCutoff === s.ultrasonicCutoff}).text;
            }
            if (ultrasonicSelect) {
                ultrasonicSelect.value = draft.ultrasonicCutoff.toString();
            }
        };
        updateUltrasonicUi();
        if (ultrasonicBtn) {
            ultrasonicBtn.addEventListener('click', () => {
                void requestPreference('isUltrasonic', !s.isUltrasonic);
            });
        }
        if (ultrasonicSelect) {
            ultrasonicSelect.addEventListener('change', () => {
                const next = parseInt(ultrasonicSelect.value, 10) || 32000;
                updateUltrasonicUi();
                void requestPreference('ultrasonicCutoff', next);
            });
        }

        // 4. Dithering & Noise Shaping
        const ditherBtns = document.querySelectorAll('.ditherModeBtn');
        const ditherPill = document.getElementById('settingsDitherPill');
        const updateDitherUi = () => {
            ditherBtns.forEach(b => {
                const mode = b.getAttribute('data-dither');
                b.classList.toggle('active', mode === draft.ditherMode); b.setAttribute('aria-pressed', String(mode === draft.ditherMode));
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
                void requestPreference('ditherMode', b.getAttribute('data-dither') || 'tpdf');
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
            if (ambiBtn) { ambiBtn.classList.toggle('active', draft.isAmbiophonics); ambiBtn.setAttribute('aria-pressed', String(draft.isAmbiophonics)); }
            if (ambiDot) ambiDot.classList.toggle('active', draft.isAmbiophonics);
            if (ambiText) {
                ambiText.textContent = draft.isAmbiophonics ? 'AMBIOPHONICS: ON (R.A.C.E.)' : 'AMBIOPHONICS: OFF (SPEAKERS ONLY)';
            }
            if (ambiPill) {
                ambiPill.textContent = draft.isAmbiophonics ? 'Enabled preference' : 'Off';
            }
        };
        updateAmbiUi();
        if (ambiBtn) {
            ambiBtn.addEventListener('click', () => {
                void requestPreference('isAmbiophonics', !s.isAmbiophonics);
            });
        }

        // 6. Audio Buffer & Latency Tuning
        const bufferBtns = document.querySelectorAll('.bufferLatencyBtn');
        const bufferPill = document.getElementById('settingsBufferPill');
        const updateBufferUi = () => {
            bufferBtns.forEach(b => {
                const latency = b.getAttribute('data-latency');
                b.classList.toggle('active', latency === draft.bufferLatencyTarget); b.setAttribute('aria-pressed', String(latency === draft.bufferLatencyTarget));
            });
            if (bufferPill) {
                bufferPill.textContent = draft.bufferLatencyTarget === 'interactive'
                    ? 'Low latency'
                    : 'Stable';
            }
        };
        updateBufferUi();
        bufferBtns.forEach(b => {
            b.addEventListener('click', () => {
                void requestPreference('bufferLatencyTarget', b.getAttribute('data-latency') || 'playback');
            });
        });

        // Synchronize the controls with committed values.
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

        store.subscribe('audio:preferences-changed', () => { if (!applying) { draft = snapshotCommittedAudioState(); syncAllSettingsDraftUi(); } });
        store.subscribe('ui:sync-dac-status', () => { updateDspButtonsUi(false); if (!applying) { draft = snapshotCommittedAudioState(); updateUltrasonicUi(); refreshPendingAudioBanner(); } });
        async function commitPreference(key, checkpoint=()=>{}) {
                const before={...snapshotCommittedAudioState(),isCrossfeed:s.isCrossfeed,isPrecision64:s.isPrecision64,hardwareAppGain:s.hardwareAppGain};
                const priorMedia=s.audio,priorVolume=s.audio?.volume,priorSlider=s.currentVolumeValue;
                const persist=()=>{
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

                safeStorage.setItem('cachymusic_crossfeed',String(s.isCrossfeed));
                safeStorage.setItem('cachymusic_hw_app_gain',String(s.hardwareAppGain));
                };
                const prevHwGain=s.isHardwareGain,prevLatency=s.bufferLatencyTarget;
                checkpoint();
                const changingMixer=key==='isHardwareGain';
                try {
                if(changingMixer){
                    await beginMixerTransition();checkpoint();
                }
                s[key] = draft[key];
                s.isPrecision64 = s.mathPrecision === '64';
                s.isHardwareGain = Boolean(s.isHardwareGain && s.hwGainAvailable);
                if (s.isAmbiophonics && s.isCrossfeed) { s.isCrossfeed = false; updateDspButtonsUi(); }

                if (s.isHardwareGain !== prevHwGain) {
                    if (s.isHardwareGain) {
                        s.hardwareAppGain=Math.max(0,Math.min(1,s.currentVolumeValue));
                        await checkHardwareGainStatus(checkpoint,true);
                        checkpoint();
                        if(!s.isHardwareGain)throw Error("System mixer unavailable");
                    } else {
                        setVolume(s.hardwareAppGain,true,true,{preserveMute:true,dispatchSystem:false});
                    }

                }

                if (s.bufferLatencyTarget !== prevLatency && audioBufferChangePending() && !s.isPlaying
                    && !s.isSoftwareDecoding && !s.audio?.getAttribute('src')) {
                    const curTrack = s.allTracks[s.currentTrackIndex];
                    const sr = (curTrack && curTrack.sampleRate) ? getValidSampleRate(curTrack.sampleRate) : 44100;
                    await ensureAudioEngineForSampleRate(sr, true);
                    checkpoint();
                }

                updateAmpGain(s.audioContext?.currentTime || 0);
                updateLimiterState(s.audioContext?.currentTime || 0);
                updateWorkletParams();
                updateAudioRouting();
                store.emit('dsp:change');
                store.emit('ui:sync-signal-path');
                checkpoint();
                await acknowledgeAudioEdit();
                checkpoint();
                persist();
                } catch(error) {
                    Object.assign(s,before);
                    try {
                        if(s.audio===priorMedia && Number.isFinite(priorVolume))s.audio.volume=priorVolume;
                        s.currentVolumeValue=priorSlider;safeStorage.setItem('cachymusic_volume',String(priorSlider));syncVolumeSliders(priorSlider,volumeSlider,miniVolumeSlider);
                        syncSoftwareVolume();
                        updateAmpGain(s.audioContext?.currentTime||0);updateLimiterState(s.audioContext?.currentTime||0);updateAudioRouting();
                        await acknowledgeAudioEdit();
                    } catch(rollbackError) {
                        const failure=new AggregateError([error,rollbackError],'Audio preference update and recovery failed');
                        failure.recoveryFailed=true;throw failure;
                    }
                    throw error;
                } finally { if(changingMixer)endMixerTransition(); }
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

        // Diagnostic overlay controls.
        const debugEnableBtn = document.getElementById('debugModeEnableBtn');
        const debugDisableBtn = document.getElementById('debugModeDisableBtn');
        const debugPill = document.getElementById('settingsDebugPill');
        function updateDebugDraftUi() {
            if (debugPill) {
                debugPill.textContent = draft.debugModeActive ? 'On' : 'Off';
                debugPill.className = `settingsEnginePill ${draft.debugModeActive ? 'active' : ''}`;
            }
            if (debugEnableBtn) debugEnableBtn.classList.toggle('active', draft.debugModeActive);
            if (debugDisableBtn) debugDisableBtn.classList.toggle('active', !draft.debugModeActive);
        }
        if (debugEnableBtn) {
            debugEnableBtn.addEventListener('click', () => {
                void requestPreference('debugModeActive', true);
            });
        }
        if (debugDisableBtn) {
            debugDisableBtn.addEventListener('click', () => {
                void requestPreference('debugModeActive', false);
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

    }

}
