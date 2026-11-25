// CachyMusic - Audio Settings, Sleep Timer & Telemetry HUD
import { formatTime, popModalState, pushModalState, safeStorage, showCachyToast, showToast } from './utils.js';
import { store } from './state.js';
import {
    signalPathModal,
    sleepStatusCard,
    sleepStatusRemaining,
    sleepTimerBtn,
    sleepTimerLabel,
    sleepTimerModal
} from './ui-elements.js';

    // Audiophile Sleep Timer Engine
    // Gentle 12-second logarithmic volume fade-out prevents sleep interruption
    // =========================================================================
    function setSleepTimer(minutes) {
        const s = store.state;
        const mins = Number(minutes);
        if (minutes !== 'end' && (!Number.isSafeInteger(mins) || mins <= 0 || !Number.isSafeInteger(mins * 60000))) return;
        cancelSleepTimer(false);
        if (minutes === 'end') {
            s.sleepTimerMode = 'end';
            store.emit('playback:sleep-mode-change');
            s.sleepTimerRemainingSec = 0;
            if (sleepTimerLabel) sleepTimerLabel.textContent = 'Sleep: End';
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

        s.sleepTimerMode = 'countdown';
        s.sleepTimerRemainingSec = mins * 60;
        const deadline = Date.now() + mins * 60000;
        let lastRemaining = s.sleepTimerRemainingSec;

        updateSleepTimerStatusUi();
        if (sleepStatusCard) sleepStatusCard.style.display = 'flex';
        if (sleepTimerBtn) sleepTimerBtn.classList.add('hasActiveTimer');
        const settingsTabCancelSleepBtn = document.getElementById('settingsTabCancelSleepBtn');
        if (settingsTabCancelSleepBtn) settingsTabCancelSleepBtn.style.display = '';
        showToast(`Sleep timer set: ${mins} minute${mins === 1 ? '' : 's'}`);
        closeSleepTimerModal();

        const tick = () => {
            s.sleepTimerRemainingSec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            if (s.sleepTimerRemainingSec === lastRemaining) return;
            lastRemaining = s.sleepTimerRemainingSec;
            updateSleepTimerStatusUi();

            // Audiophile 12-second logarithmic gentle fade-out
            if (s.sleepTimerRemainingSec <= 12 && s.sleepTimerRemainingSec > 0) {
                if (s.sleepTimerOriginalVolume === null) s.sleepTimerOriginalVolume = s.currentVolumeValue;
                const ratio = Math.max(0, s.sleepTimerRemainingSec / 12);
                const fadedVol = s.sleepTimerOriginalVolume * Math.pow(ratio, 1.4);
                store.emit('audio:set-volume', { volume: fadedVol, persist: false });
            }

            if (s.sleepTimerRemainingSec <= 0) {
                store.emit('playback:pause');
                cancelSleepTimer(false);
                showToast('Sleep timer finished: Playback paused.');
            }
        };
        s.sleepTimerTick = tick;
        s.sleepTimerInterval = setInterval(tick, 1000);
    }

    function updateSleepTimerStatusUi() {
        const rem = store.state.sleepTimerRemainingSec;
        const m = Math.floor(rem / 60);
        const s = rem % 60;
        const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;
        if (sleepTimerLabel) sleepTimerLabel.textContent = `Sleep: ${timeStr}`;
        if (sleepStatusRemaining) sleepStatusRemaining.textContent = `${timeStr} remaining`;
        const settingsTabSleepStatusBadge = document.getElementById('settingsTabSleepStatusBadge');
        if (settingsTabSleepStatusBadge) {
            settingsTabSleepStatusBadge.textContent = `${timeStr} REMAINING`;
            settingsTabSleepStatusBadge.classList.add('active');
        }
    }

    function cancelSleepTimer(showFeedback = true) {
        const s = store.state;
        if (s.sleepTimerInterval) {
            clearInterval(s.sleepTimerInterval);
            s.sleepTimerInterval = null;
        }
        s.sleepTimerTick = null;
        if (s.sleepTimerOriginalVolume !== null) {
            store.emit('audio:set-volume', { volume: s.sleepTimerOriginalVolume, persist: false });
            s.sleepTimerOriginalVolume = null;
        }
        const endedMode = s.sleepTimerMode === 'end';
        s.sleepTimerMode = null;
        if (endedMode) store.emit('playback:sleep-mode-change');
        s.sleepTimerRemainingSec = 0;
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

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) store.state.sleepTimerTick?.();
    });

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
        store.emit('ui:sync-signal-path');
        if (signalPathModal) signalPathModal.style.display = 'flex';
        pushModalState('signalPathModal');
    }

    function closeSignalPathModal() {
        if (signalPathModal) signalPathModal.style.display = 'none';
        popModalState('signalPathModal');
    }


    function updateDebugHudState() {
        const s = store.state;
        const hud = document.getElementById('debugHudContainer');
        const pill = document.getElementById('settingsDebugPill');
        const enableBtn = document.getElementById('debugModeEnableBtn');
        const disableBtn = document.getElementById('debugModeDisableBtn');

        if (hud) {
            hud.style.display = s.debugModeActive ? 'flex' : 'none';
        }
        if (pill) {
            pill.textContent = s.debugModeActive ? 'ENABLED (HUD)' : 'DISABLED';
            pill.className = `settingsEnginePill ${s.debugModeActive ? 'active' : ''}`;
        }
        if (enableBtn) enableBtn.classList.toggle('active', s.debugModeActive);
        if (disableBtn) disableBtn.classList.toggle('active', !s.debugModeActive);

        if (s.debugModeActive) {
            const logList = document.getElementById('debugHudLogList');
            if (logList) {
                const entries = s.audioPlaybackDebugLogs.slice(-50).map(text => {
                    const row = document.createElement('div');
                    row.className = 'debugHudLogEntry';
                    row.textContent = text;
                    return row;
                });
                logList.replaceChildren(...entries);
                logList.scrollTop = logList.scrollHeight;
            }
            refreshDebugHudTelemetry();
        }
    }

    function setDebugMode(enabled) {
        const s = store.state;
        s.debugModeActive = Boolean(enabled);
        try {
            safeStorage.setItem('cachymusic_debug_mode', s.debugModeActive ? 'true' : 'false');
        } catch (_) {}
        updateDebugHudState();
        if (s.debugModeActive) {
            appendDebugTelemetry('[SYSTEM] Debug Mode enabled. Monitoring Web Audio pipeline & MediaStore IPC.');
            showCachyToast('Debug Mode Active', 'Real-time Audio Diagnostics HUD visible.', 'info');
        }
    }

    function appendDebugTelemetry(msg, level = 'info') {
        const logs = store.state.audioPlaybackDebugLogs;
        const time = new Date().toLocaleTimeString();
        const entryText = `[${time}] ${msg}`;
        logs.push(entryText);
        if (logs.length > 80) logs.shift();

        const logList = document.getElementById('debugHudLogList');
        if (logList && store.state.debugModeActive) {
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
        if (logBox && store.state.currentWorkspace === 'settings') {
            logBox.textContent = logs.join('\n');
            logBox.scrollTop = logBox.scrollHeight;
        }

        refreshDebugHudTelemetry();
    }

    function refreshDebugHudTelemetry() {
        const s = store.state;
        if (!s.debugModeActive) return;
        const curTrack = s.allTracks[s.currentTrackIndex];
        const audio = s.audio;
        const trackEl = document.getElementById('debugHudTrack');
        const codecEl = document.getElementById('debugHudCodec');
        const html5El = document.getElementById('debugHudHtml5');
        const ctxEl = document.getElementById('debugHudAudioCtx');
        const srcEl = document.getElementById('debugHudSrc');

        if (trackEl) {
            trackEl.textContent = curTrack
                ? `#${s.currentTrackIndex + 1}: ${curTrack.title || curTrack.filename} (${formatTime(curTrack.duration)})`
                : 'None loaded';
        }
        if (codecEl && curTrack) {
            const fmt = (curTrack.format || 'AUDIO').toUpperCase();
            const rate = curTrack.sampleRate ? `${curTrack.sampleRate}Hz` : 'Rate unknown';
            const depth = curTrack.bitDepth ? `${curTrack.bitDepth}-Bit` : 'Depth unknown';
            codecEl.textContent = `${fmt} • ${depth} • ${rate}`;
        }
        if (html5El) {
            if (s.isSoftwareDecoding && s.activeDecodedBuffer) {
                const cur = Math.max(0,s.softwarePlaybackOffset + (s.audioContext && !s.isSoftwarePaused && s.softwarePlaybackStartTime>0 ? Math.max(0,s.audioContext.currentTime - s.softwarePlaybackStartTime) : 0));
                const dur = s.activeDecodedBuffer.duration;
                const state = s.isSoftwarePaused ? 'PAUSED' : 'PLAYING';
                html5El.textContent = `SOFTWARE ENGINE • ${state} (${cur.toFixed(1)}s / ${dur.toFixed(1)}s) • 32-bit Float PCM`;
                html5El.title = `Decoded: ${s.activeDecodedBuffer.sampleRate}Hz, ${s.activeDecodedBuffer.numberOfChannels}ch, ${s.activeDecodedBuffer.streaming ? "bounded PCM streaming" : "Web Audio Buffer"}`;
            } else if (s.isSoftwareDecoding) {
                html5El.textContent = 'SOFTWARE ENGINE • DECOMPRESSING BITSTREAM...';
                html5El.title = 'Decoding FLAC/audio container into 32-bit Float PCM buffer...';
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
            const ctxState = s.audioContext ? s.audioContext.state : 'None';
            const sRate = s.audioContext ? `${s.audioContext.sampleRate}Hz` : '--';
            ctxEl.textContent = `State: ${ctxState} | Clock: ${sRate}`;
        }
        if (srcEl && audio) {
            const srcStr = audio.src || 'none';
            srcEl.textContent = srcStr.length > 70 ? srcStr.substring(0, 67) + '...' : srcStr;
            srcEl.title = srcStr;
        }
    }

    function logAudioPlaybackEvent(level, msg, meta = {}) {
        appendDebugTelemetry(`[${level.toUpperCase()}] ${msg}`, level);
        updateAudioDiagnosticsUi(meta);
    }

    function updateAudioDiagnosticsUi(meta = {}) {
        const s = store.state;
        const streamVal = document.getElementById('debugStreamStatus');
        const formatVal = document.getElementById('debugFormatVal');
        const pipeVal = document.getElementById('debugPipelineState');
        const skipVal = document.getElementById('debugSkipStatus');
        const curTrack = s.allTracks[s.currentTrackIndex];
        const audio = s.audio;

        const native=Boolean(s.isNativePlaybackActive?.());
        const diagPill=document.getElementById('settingsAudioDebugPill');
        if(diagPill)diagPill.textContent=s.audioEditPaused?'Applying audio change':s.isPlaying?'Playing':curTrack?'Paused':'No active playback';
        if (streamVal) {
            if (native || s.isSoftwareDecoding) {
                streamVal.textContent=`${native?'Native Android':'Software decoder'} · ${s.isPlaying?'Playing':'Paused'}`;
                streamVal.style.color='inherit';
            } else if (audio && audio.error) {
                streamVal.textContent = `Error (Code ${audio.error.code})`;
                streamVal.style.color = 'var(--status-danger)';
            } else if (audio && !audio.paused) {
                streamVal.textContent = 'Media element playing';
                streamVal.style.color = 'var(--status-success)';
            } else {
                streamVal.textContent = 'Standby / Paused';
                streamVal.style.color = 'inherit';
            }
        }
        if (formatVal && !curTrack) formatVal.textContent="No track loaded";
        if (formatVal && curTrack) {
            const fmt = (curTrack.format || 'AUDIO').toUpperCase();
            const rate = curTrack.sampleRate ? `${curTrack.sampleRate / 1000} kHz` : 'Rate unknown';
            const depth = curTrack.bitDepth ? `${curTrack.bitDepth}-Bit` : 'Depth unknown';
            const br = curTrack.bitrate ? `${curTrack.bitrate} kbps` : '';
            formatVal.textContent = `${rate} • ${depth} • ${fmt} ${br ? '• ' + br : ''}`;
        }
        if (pipeVal) {
            const ctxState = s.audioContext?.state || 'not initialized';
            if (native) pipeVal.textContent='Native playback · Web Audio DSP bypassed';
            else if (s.isSoftwareDecoding && s.activeDecodedBuffer) {
                const swState = s.isSoftwarePaused ? 'Software Paused' : 'Software Engine Active';
                pipeVal.textContent = `${swState} · AudioContext: ${ctxState}`;
            } else if (s.isSoftwareDecoding) {
                pipeVal.textContent = `Decompressing Bitstream... · AudioContext: ${ctxState}`;
            } else if (audio) {
                const rStates = [
                    'Idle (No Data)',
                    'Metadata Loaded',
                    'Decoding Frame',
                    'Buffering Stream',
                    'Ready (Buffered)'
                ];
                const r = rStates[audio.readyState] || 'Ready';
                pipeVal.textContent = `${r} · AudioContext: ${ctxState}`;
            }
        }
        if (skipVal) {
            skipVal.textContent = s.consecutiveSkipCount > 0 ? `${s.consecutiveSkipCount} skip(s) logged` : 'No abnormal skips (0)';
            skipVal.style.color = s.consecutiveSkipCount > 0 ? 'var(--status-warning)' : 'inherit';
        }
        refreshDebugHudTelemetry();
    }

    store.subscribe('workspace:change', ({ detail }) => {
        if (detail?.viewName !== 'settings') return;
        const logBox = document.getElementById('settingsAudioDebugLog');
        if (logBox) logBox.textContent = store.state.audioPlaybackDebugLogs.join('\n');
        updateAudioDiagnosticsUi();
    });

    store.subscribe('telemetry:log', ({ detail }) => {
        if (detail) logAudioPlaybackEvent(detail.level || 'info', detail.msg || '', detail.meta || {});
    });

    export {
        appendDebugTelemetry,
        cancelSleepTimer,
        closeSignalPathModal,
        closeSleepTimerModal,
        logAudioPlaybackEvent,
        openSignalPathModal,
        openSleepTimerModal,
        refreshDebugHudTelemetry,
        setDebugMode,
        setSleepTimer,
        updateAudioDiagnosticsUi,
        updateDebugHudState,
        updateSleepTimerStatusUi
    };
