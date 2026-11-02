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

    export {
        ambientCanvas,
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
        showThemeLoadingOverlay,
        updateAudioDiagnosticsUi,
        updateDebugHudState,
        updateSleepTimerStatusUi
    };
