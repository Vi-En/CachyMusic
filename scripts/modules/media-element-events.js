import {finishListeningVisit,observeListening,interruptListening} from './listening-history.js';
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
    // The element may still dispatch queued events after another transport or
    // track has taken ownership. Delayed recovery must additionally own the
    // original user intent and (for same-element retry) the original source.
    const ownsMedia = (audio = targetAudio) => Boolean(audio && audio === s.audio
        && !audio._isDisposed && !nativeActive() && !s.isSoftwareDecoding
        && (typeof audio._trackGeneration !== 'number' || audio._trackGeneration === trackGeneration()));
    const recoveryOwned = (generation, intent, audio, src) => ownsMedia(audio)
        && generation === trackGeneration() && intent === playbackIntent()
        && !s.audioEditPaused && (src === undefined || audio.src === src);

    targetAudio.addEventListener('play', () => {
        if (!ownsMedia() || targetAudio.paused) return;
        if (s.userExplicitlyPaused || s.audioEditPaused) {
            targetAudio.pause();
            syncPlayPauseUI(false);
            return;
        }
        isAudioBuffering = false;
        syncPlayPauseUI(true);
    });
    targetAudio.addEventListener('playing', () => {
        if (!ownsMedia() || targetAudio.paused) return;
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
        if (!ownsMedia() || !targetAudio.paused) return;
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
        if (!ownsMedia()) return;
        syncPlayPauseUI(false);
    });
    targetAudio.addEventListener('waiting', () => {
        if (!ownsMedia()) return;
        if (!s.userExplicitlyPaused) isAudioBuffering = true;
    });
    targetAudio.addEventListener('seeking', () => {
        if (!ownsMedia()) return;
        if (!s.userExplicitlyPaused) isAudioBuffering = true;
    });
    targetAudio.addEventListener('stalled', () => {
        if (!ownsMedia()) return;
        if (!s.userExplicitlyPaused) isAudioBuffering = true;
    });
    targetAudio.addEventListener('error', () => {
        if (!ownsMedia()) return;
        if (!targetAudio.src || targetAudio.src === window.location.href || !targetAudio.getAttribute('src')) {
            return;
        }
        const err = targetAudio.error;
        if (!err) return;
        // An asynchronous decoder error is not permission to resume playback
        // or skip tracks while the user or an audio edit owns the pause.
        if (s.userExplicitlyPaused || s.audioEditPaused) {
            if (err.code === 3 || err.code === 4) rememberSoftwareDecoder(targetAudio.getAttribute('src') || targetAudio.src);
            return;
        }
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
            const resumeAt = Number.isFinite(targetAudio.currentTime) ? targetAudio.currentTime : 0;
            try {
                targetAudio.pause();
                targetAudio.removeAttribute('src');
                targetAudio.load();
            } catch (_) {}
            logAudioPlaybackEvent('info', `Native decoder unsuited for "${trackTitle}" (code ${errorCode}). Playing via 32-bit Web Audio Software Engine.`);
            playWithSoftwareDecoder(currentTrack, resumeAt);
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
                if(!recoveryOwned(errorGeneration,errorIntent,recoveryAudio))return;
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
            const currentSrc = targetAudio.src, retryGeneration=trackGeneration(), retryIntent=playbackIntent();
            setTimeout(() => {
                if (recoveryOwned(retryGeneration,retryIntent,targetAudio,currentSrc) && !s.userExplicitlyPaused) {
                    targetAudio.src = currentSrc;
                    targetAudio.load();
                    if (savedTime > 0) {
                        try { targetAudio.currentTime = savedTime; } catch (_) {}
                    }
                    // Re-enter the controller so graph state, parameter acknowledgement
                    // and transport intent are checked before starting the decoder.
                    const attempt = playAudio();
                    const attemptIntent = playbackIntent();
                    Promise.resolve(attempt).catch(() => {
                        if(!recoveryOwned(retryGeneration,attemptIntent,targetAudio,currentSrc)||s.userExplicitlyPaused)return;
                        syncPlayPauseUI(false);
                        s.userExplicitlyPaused = true;
                        showCachyToast('Network Error', `Could not recover stream for "${trackTitle}".`, 'error');
                    });
                }
            }, 1500);
        }
    });

    for(const event of ['seeking','waiting','pause','stalled'])targetAudio.addEventListener(event,()=>{if(ownsMedia())interruptListening();});
    let lastPersistedTime = 0;
    targetAudio.addEventListener('timeupdate', () => {
        if (!ownsMedia()) return;
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
        observeListening(currentTrack,cur,dur,!targetAudio.paused && !targetAudio.ended && !targetAudio.seeking && targetAudio.readyState>=3 && !s.audioEditPaused && !s.isPlayPending && s.audioContext?.state==='running', targetAudio.playbackRate);
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
        if (!ownsMedia() || !targetAudio.ended || targetAudio.seeking || s.userExplicitlyPaused || s.audioEditPaused) return;
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
                const retryGeneration=trackGeneration(), retryIntent=playbackIntent(), currentSrc=targetAudio.src;
                setTimeout(() => {
                    if (recoveryOwned(retryGeneration,retryIntent,targetAudio,currentSrc) && !s.userExplicitlyPaused) {
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
        if (!s.isStandalonePlayback) { try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {} }
        finishListeningVisit();
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
        if (!ownsMedia()) return;
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
        if (!ownsMedia() || targetAudio.seeking) return;
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
