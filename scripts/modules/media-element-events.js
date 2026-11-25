import {playbackPool, playlistNeighbor} from './playlist-playback.js';
import {store} from './state.js';
import {safeStorage, formatTime, showCachyToast, showToast} from './utils.js';
import {findTrackIndex} from './track-session.js';
import {currentTimeEl, progressBar, totalDurationEl, miniTotalDuration} from './ui-elements.js';
import {appendDebugTelemetry, cancelSleepTimer, logAudioPlaybackEvent} from './settings.js';
import {mediaSessionController} from './media-session.js';
import {updatePlaybackProgress} from './player-progress.js';

// Media element owns events; player core owns transport intent and generation.
export function createMediaElementListener({nativeActive, trackGeneration, playbackIntent, clearPendingPlay, syncPlayPauseUI, clearSeekStallTimer, clearNoDataStallTimer, rememberSoftwareDecoder, playWithSoftwareDecoder, pauseAudio, nextTrack, playAudio, checkAndPreloadNextTrack, mprisSyncHook}) {
return function attachAudioListeners(targetAudio) {
    const s = store.state;
    if (!targetAudio || targetAudio._hasCachyListeners) return;
    targetAudio._hasCachyListeners = true;
    let isAudioBuffering = false;

    targetAudio.addEventListener('play', () => {
        if (nativeActive() || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (s.userExplicitlyPaused || s.audioEditPaused) {
            targetAudio.pause();
            syncPlayPauseUI(false);
            return;
        }
        isAudioBuffering = false;
        syncPlayPauseUI(true);
    });
    targetAudio.addEventListener('playing', () => {
        if (nativeActive() || targetAudio._isDisposed || targetAudio !== s.audio) return;
        clearSeekStallTimer();
        if (s.userExplicitlyPaused || s.audioEditPaused) {
            targetAudio.pause();
            syncPlayPauseUI(false);
            return;
        }
        isAudioBuffering = false;
        syncPlayPauseUI(true);
    });
    targetAudio.addEventListener('pause', () => {
        if (nativeActive() || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (isAudioBuffering && !s.userExplicitlyPaused) return;
        syncPlayPauseUI(false);
        if (s.isStandalonePlayback) return;
        try {
            const cur = targetAudio.currentTime;
            const dur = targetAudio.duration;
            if (cur > 0 && (!dur || isNaN(dur) || cur < (dur - 1))) {
                safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2));
            }
        } catch (_) {}
    });
    targetAudio.addEventListener('emptied', () => {
        if (nativeActive() || targetAudio._isDisposed || targetAudio !== s.audio) return;
        syncPlayPauseUI(false);
    });
    targetAudio.addEventListener('waiting', () => {
        if (nativeActive() || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (!s.userExplicitlyPaused) isAudioBuffering = true;
    });
    targetAudio.addEventListener('seeking', () => {
        if (nativeActive() || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (!s.userExplicitlyPaused) isAudioBuffering = true;
    });
    targetAudio.addEventListener('stalled', () => {
        if (nativeActive() || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (!s.userExplicitlyPaused) isAudioBuffering = true;
    });
    targetAudio.addEventListener('error', () => {
        if (nativeActive() || targetAudio._isDisposed || targetAudio !== s.audio || s.isSoftwareDecoding) return;
        if (!targetAudio.src || targetAudio.src === window.location.href || !targetAudio.getAttribute('src')) {
            return;
        }
        const err = targetAudio.error;
        if (!err) return;
        console.error('Audio element error:', err);
        clearNoDataStallTimer();
        isAudioBuffering = false;
        syncPlayPauseUI(false);
        s.isPlayPending = false;

        clearPendingPlay();

        const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
            ? s.standaloneTrackList[s.standaloneTrackIndex]
            : s.allTracks[s.currentTrackIndex];
        const trackTitle = currentTrack ? (currentTrack.title || currentTrack.filename || 'Current track') : 'Audio track';
        const errorCode = err ? err.code : 0;
        const isFatalDecodeError = (errorCode === 3 || errorCode === 4);

        const currentAttrSrc = targetAudio.getAttribute('src') || targetAudio.src || '';
        if (isFatalDecodeError && currentTrack && !s.isSoftwareDecoding) {
            rememberSoftwareDecoder(currentAttrSrc);
            if(s.userExplicitlyPaused)return;
            rememberSoftwareDecoder(targetAudio.src);
            try {
                targetAudio.pause();
                targetAudio.removeAttribute('src');
                targetAudio.load();
            } catch (_) {}
            logAudioPlaybackEvent('info', `Native decoder unsuited for "${trackTitle}" (code ${errorCode}). Playing via 32-bit Web Audio Software Engine.`);
            playWithSoftwareDecoder(currentTrack, targetAudio.currentTime || 0);
            return;
        }

        if (isFatalDecodeError || s.trackPlaybackRetryCount >= 1) {
            s.userExplicitlyPaused = true;
            s.consecutiveSkipCount++;
            const errorDesc = errorCode === 3
                ? 'Corrupted audio stream or decoder failure'
                : (errorCode === 4 ? 'Format or file source not supported' : 'Playback stream timed out');

            logAudioPlaybackEvent('error', `Track "${trackTitle}" decode failure (code ${errorCode}): ${errorDesc}`, {
                src: targetAudio.src,
                track: currentTrack
            });

            if (s.consecutiveSkipCount >= 3) {
                pauseAudio();
                logAudioPlaybackEvent('warn', 'Consecutive skip limit reached (3 tracks failed). Halting auto-skip.');
                showCachyToast('Playback Halted', 'Multiple tracks failed to decode. Check Audio Diagnostics in Settings.', 'error');
                return;
            }

            showCachyToast('Playback Error', `"${trackTitle}": ${errorDesc}. Skipping track...`, 'warning');
            store.emit('audio:reset-element');

            const errorGeneration=trackGeneration(), errorIntent=playbackIntent();
            const recoveryAudio = s.audio;
            setTimeout(() => {
                if(errorGeneration!==trackGeneration() || errorIntent!==playbackIntent() || s.audio!==recoveryAudio)return;
                const pool = playbackPool(s);
                const currentIdxInPool = findTrackIndex(pool, s.allTracks[s.currentTrackIndex]);
                if (!s.playQueue.length && (s.playlistPlayback ? playlistNeighbor(s)<0 : currentIdxInPool === pool.length - 1 && s.repeatMode === 'off')) {
                    pauseAudio();
                    try { recoveryAudio.currentTime = 0; } catch (_) {}
                    if (progressBar) progressBar.style.width = '0%';
                    if (currentTimeEl) currentTimeEl.textContent = '0:00';
                    try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {}
                } else {
                    nextTrack();
                }
            }, 1200);
            return;
        }

        if (errorCode === 2 && targetAudio.src && !s.userExplicitlyPaused && s.trackPlaybackRetryCount === 0) {
            s.trackPlaybackRetryCount++;
            const savedTime = targetAudio.currentTime || 0;
            const currentSrc = targetAudio.src, retryGeneration=trackGeneration();
            setTimeout(() => {
                if (retryGeneration===trackGeneration() && s.audio===targetAudio && !s.userExplicitlyPaused) {
                    targetAudio.src = currentSrc;
                    targetAudio.load();
                    if (savedTime > 0) {
                        try { targetAudio.currentTime = savedTime; } catch (_) {}
                    }
                    targetAudio.play().catch(() => {
                        if(retryGeneration!==trackGeneration()||s.audio!==targetAudio)return;
                        syncPlayPauseUI(false);
                        s.userExplicitlyPaused = true;
                        showCachyToast('Network Error', `Could not recover stream for "${trackTitle}".`, 'error');
                    });
                }
            }, 1500);
        }
    });

    let lastPersistedTime = 0;
    targetAudio.addEventListener('timeupdate', () => {
        if (nativeActive() || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (s.isSoftwareDecoding || s.isDraggingScrubber) return;
        const cur = targetAudio.currentTime;
        let dur = targetAudio.duration;
        const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
            ? s.standaloneTrackList[s.standaloneTrackIndex]
            : s.allTracks[s.currentTrackIndex];
        if (!isFinite(dur) || isNaN(dur) || dur <= 0) {
            if (currentTrack && currentTrack.duration && isFinite(currentTrack.duration)) {
                dur = Number(currentTrack.duration);
            }
        }
        updatePlaybackProgress(cur, dur);
        mediaSessionController.updatePositionState(false);

        if (!s.isStandalonePlayback && cur > 0 && Math.abs(cur - lastPersistedTime) >= 5.0) {
            lastPersistedTime = cur;
            if (!dur || isNaN(dur) || cur < (dur - 1)) {
                try { safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2)); } catch (_) {}
            }
        }
        checkAndPreloadNextTrack(cur, dur);
        mprisSyncHook(false);
    });

    targetAudio.addEventListener('ended', () => {
        if (nativeActive() || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (typeof targetAudio._trackGeneration === 'number' && targetAudio._trackGeneration !== trackGeneration()) {
            return;
        }
        if (!s.isStandalonePlayback) { try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {} }

        const curTime = targetAudio.currentTime || 0;
        const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
            ? s.standaloneTrackList[s.standaloneTrackIndex]
            : s.allTracks[s.currentTrackIndex];
        const trackDur = targetAudio.duration || (currentTrack ? (currentTrack.duration || 0) : 0);
        const trackTitle = currentTrack ? (currentTrack.title || currentTrack.filename || 'Current track') : 'Audio track';

        if ((trackDur > 5 && curTime < 3.0) || curTime === 0) {
            logAudioPlaybackEvent('warn', `Premature stream termination at ${curTime.toFixed(2)}s on "${trackTitle}"`);
            appendDebugTelemetry(`[WARN] Premature stream end at ${curTime.toFixed(2)}s / ${trackDur.toFixed(2)}s for "${trackTitle}". Attempting reload...`, 'warn');
            if (s.trackPlaybackRetryCount < 2) {
                s.trackPlaybackRetryCount++;
                const retryGeneration=trackGeneration();
                setTimeout(() => {
                    if (retryGeneration===trackGeneration() && s.audio===targetAudio && !s.userExplicitlyPaused) {
                        try { targetAudio.load(); } catch (_) {}
                        playAudio();
                    }
                }, 400);
                return;
            }
            pauseAudio();
            showToast(`Playback paused on "${trackTitle}". Stream buffer interrupted.`);
            return;
        }
        appendDebugTelemetry(`[EVENT] Track finished naturally at ${curTime.toFixed(1)}s`);

        if (s.sleepTimerMode === 'end') {
            pauseAudio();
            cancelSleepTimer(false);
            showToast('Sleep timer: End of track reached. Playback paused.');
            return;
        }

        if (s.repeatMode === 'one') {
            targetAudio.currentTime = 0;
            playAudio();
        } else {
            nextTrack(false);
        }
    });

    targetAudio.addEventListener('loadedmetadata', () => {
        if (nativeActive() || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (targetAudio.duration && !isNaN(targetAudio.duration)) {
            if (totalDurationEl) totalDurationEl.textContent = formatTime(targetAudio.duration);
            if (miniTotalDuration) miniTotalDuration.textContent = formatTime(targetAudio.duration);
            mediaSessionController.updatePositionState(true);
        }
        try {
            if (s.currentPlaybackSpeed !== 1.0) {
                targetAudio.playbackRate = s.currentPlaybackSpeed;
            }
            targetAudio.preservesPitch = s.isPitchLockTempo;
            targetAudio.mozPreservesPitch = s.isPitchLockTempo;
            targetAudio.webkitPreservesPitch = s.isPitchLockTempo;
        } catch (_) {}
    });

    targetAudio.addEventListener('seeked', () => {
        if (nativeActive() || targetAudio._isDisposed || targetAudio !== s.audio) return;
        clearSeekStallTimer();
        isAudioBuffering = false;
        if (!s.userExplicitlyPaused && !s.audioEditPaused && targetAudio.paused && !s.isSoftwareDecoding) {
            s.isPlayPending = false;
            playAudio(true);
        }
        mediaSessionController.updatePositionState(true);
        mprisSyncHook(true);
    });
}

}
