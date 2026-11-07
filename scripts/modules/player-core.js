// CachyMusic - Core Audio Player, Software Decoder & Gapless Transport
    function initMprisBridge() {
        let lastReportedStatus = '';
        let lastReportedTitle = '';
        let lastReportedPos = -1;

        function reportState(force = false) {
            const track = allTracks[currentTrackIndex];
            const isPlaying = !audio.paused && !audio.ended;
            const status = isPlaying ? 'Playing' : (audio.currentTime > 0 ? 'Paused' : 'Stopped');
            const pos = Math.floor(audio.currentTime || 0);
            const title = track ? (track.title || track.filename || '') : '';

            if (!force && status === lastReportedStatus && title === lastReportedTitle && Math.abs(pos - lastReportedPos) < 2) {
                return;
            }

            lastReportedStatus = status;
            lastReportedTitle = title;
            lastReportedPos = pos;

            const payload = {
                status,
                position: audio.currentTime || 0,
                duration: audio.duration || (track ? track.duration : 0) || 0,
                title: track ? (track.title || track.filename || 'Unknown') : 'CachyMusic',
                artist: track ? (track.artist || 'Unknown Artist') : 'CachyOS',
                album: track ? (track.album || '') : '',
                artUrl: track && track.cover ? (track.cover.startsWith('http') ? track.cover : window.location.origin + '/' + track.cover) : '',
                volume: audio.volume,
                shuffle: isShuffle,
                repeat: repeatMode
            };

            fetch('php/api/mpris_state.php?action=update_state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(() => {});
        }

        let isPollingCommands = false;
        let consecutiveIdlePolls = 0;
        async function pollCommands() {
            if (isPollingCommands) {
                setTimeout(pollCommands, 500);
                return;
            }
            isPollingCommands = true;
            let hadCommand = false;
            try {
                if (document.hidden) {
                    consecutiveIdlePolls = 10;
                    return;
                }
                const res = await fetch('php/api/mpris_state.php?action=get_command');
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.command) {
                        hadCommand = true;
                        consecutiveIdlePolls = 0;
                        const cmd = data.command;
                        if (cmd === 'PlayPause') {
                            if (audio.paused) playAudio(true);
                            else pauseAudio();
                        } else if (cmd === 'Play') {
                            playAudio(true);
                        } else if (cmd === 'Pause') {
                            pauseAudio();
                        } else if (cmd === 'Stop') {
                            pauseAudio();
                            audio.currentTime = 0;
                        } else if (cmd === 'Next') {
                            nextTrack();
                        } else if (cmd === 'Previous') {
                            prevTrack();
                        } else if (cmd === 'Seek' && typeof data.offset === 'number') {
                            audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + data.offset));
                        } else if (cmd === 'SeekTo' && typeof data.position === 'number') {
                            audio.currentTime = Math.max(0, Math.min(audio.duration || 0, data.position));
                        } else if (cmd === 'SetVolume' && typeof data.volume === 'number') {
                            setVolume(Math.max(0, Math.min(1.5, data.volume)), true);
                        } else if (cmd === 'ToggleShuffle') {
                            isShuffle = !isShuffle;
                            if (shuffleBtn) {
                                shuffleBtn.classList.toggle('active', isShuffle);
                                shuffleBtn.setAttribute('title', isShuffle ? 'Shuffle Active' : 'Toggle Shuffle');
                            }
                        } else if (cmd === 'SetShuffle' && typeof data.shuffle === 'boolean') {
                            isShuffle = data.shuffle;
                            if (shuffleBtn) {
                                shuffleBtn.classList.toggle('active', isShuffle);
                                shuffleBtn.setAttribute('title', isShuffle ? 'Shuffle Active' : 'Toggle Shuffle');
                            }
                        } else if (cmd === 'SetLoopStatus' && typeof data.loopStatus === 'string') {
                            const ls = data.loopStatus.toLowerCase();
                            if (ls === 'track') repeatMode = 'one';
                            else if (ls === 'playlist') repeatMode = 'all';
                            else repeatMode = 'off';
                            if (typeof updateRepeatUI === 'function') updateRepeatUI();
                        }
                        reportState(true);
                    } else {
                        consecutiveIdlePolls++;
                    }
                }
            } catch (_) {
                consecutiveIdlePolls += 2;
            } finally {
                isPollingCommands = false;
                let nextDelay = 350;
                if (document.hidden) {
                    nextDelay = 2500;
                } else if (consecutiveIdlePolls > 10) {
                    nextDelay = 1200;
                } else if (consecutiveIdlePolls > 3) {
                    nextDelay = 700;
                }
                setTimeout(pollCommands, nextDelay);
            }
        }

        audio.addEventListener('play', () => reportState(true));
        audio.addEventListener('playing', () => reportState(true));
        audio.addEventListener('pause', () => reportState(true));
        audio.addEventListener('ended', () => reportState(true));
        audio.addEventListener('timeupdate', () => reportState(false));

        setTimeout(pollCommands, 500);
    }


    function updateMarqueeText(el, text) {
        if (!el) return;
        el.title = text || '';
        el.innerHTML = '';
        const span = document.createElement('span');
        span.className = 'marqueeContent';
        span.textContent = text || '';
        el.appendChild(span);

        requestAnimationFrame(() => {
            if (!el.isConnected) return;
            const overflow = span.scrollWidth - el.clientWidth;
            if (overflow > 6) {
                el.classList.add('isMarquee');
                const duration = Math.max(6, Math.min(22, Math.round(overflow / 24) + 4));
                span.style.setProperty('--marquee-overflow', `${Math.ceil(overflow) + 8}px`);
                span.style.setProperty('--marquee-duration', `${duration}s`);
            } else {
                el.classList.remove('isMarquee');
                span.style.removeProperty('--marquee-overflow');
                span.style.removeProperty('--marquee-duration');
            }
        });
    }

    function recomputeMarquees() {
        [trackName, artistName, albumName].forEach(el => {
            if (!el) return;
            const span = el.querySelector('.marqueeContent');
            if (!span) return;
            const overflow = span.scrollWidth - el.clientWidth;
            if (overflow > 6) {
                el.classList.add('isMarquee');
                const duration = Math.max(6, Math.min(22, Math.round(overflow / 24) + 4));
                span.style.setProperty('--marquee-overflow', `${Math.ceil(overflow) + 8}px`);
                span.style.setProperty('--marquee-duration', `${duration}s`);
            } else {
                el.classList.remove('isMarquee');
                span.style.removeProperty('--marquee-overflow');
                span.style.removeProperty('--marquee-duration');
            }
        });
    }

    if (typeof window !== 'undefined') {
        if (window.ResizeObserver) {
            const metaBox = document.querySelector('.trackMeta');
            if (metaBox) {
                const ro = new ResizeObserver(() => recomputeMarquees());
                ro.observe(metaBox);
            }
        }
        window.addEventListener('resize', () => recomputeMarquees(), { passive: true });
    }

    let currentPlayRequestId = 0;
    let currentTrackGeneration = 0;
    let activeLoadedMetadataHandler = null;

    // Load Track by Index in allTracks
    async function loadTrack(index, autoPlay = true, initialTime = 0) {
        if (!allTracks[index]) return;
        currentTrackIndex = index;
        trackPlaybackRetryCount = 0;
        stopSoftwarePlayback();
        activeDecodedBuffer = null;
        isSoftwareDecoding = false;
        // Supersede any in-flight playAudio() call from an earlier track selection
        currentPlayRequestId++;
        isPlayPending = false;
        if (playPendingTimeout) {
            clearTimeout(playPendingTimeout);
            playPendingTimeout = null;
        }

        if (isStandalonePlayback) {
            isStandalonePlayback = false;
            updateStandaloneBannerUi(false);
        }
        const track = allTracks[currentTrackIndex];

        // Cache currently loaded track state in localStorage
        if (track) {
            try {
                if (track.tid) safeStorage.setItem('cachymusic_last_track_tid', track.tid.toString());
                if (track.fullPath) safeStorage.setItem('cachymusic_last_track_path', track.fullPath);
                if (track.filename) safeStorage.setItem('cachymusic_last_track_filename', track.filename);
                if (track.id) safeStorage.setItem('cachymusic_last_track_id', track.id.toString());
                if (track.title) safeStorage.setItem('cachymusic_last_track_title', track.title);
            } catch (_) {}
        }

        let trackSrc = track.src || '';
        if (trackSrc.startsWith('../')) trackSrc = trackSrc.substring(3);

        const isKnownSoftware = alwaysSoftwareDecodeUrls.has(trackSrc) || (track.src && alwaysSoftwareDecodeUrls.has(track.src));

        // Ensure studio-fidelity AudioContext clock rate matches track (44.1k, 48k, 88.2k, 96k, 176.4k, 192k)
        const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
        await ensureAudioEngineForSampleRate(targetRate);

        if (currentTrackIndex !== index) return; // Guard against rapid skipping during context change

        // Apply EBU R128 / ReplayGain Loudness Leveling with -0.3 dBFS True-Peak protection (safeguards MP3/M4A ISPs)
        if (replayGainNode && audioContext) {
            let targetGain = 1.0;
            if (isReplayGain && typeof track.replayGain === 'number' && !isNaN(track.replayGain)) {
                targetGain = Math.pow(10, track.replayGain / 20);
                if (typeof track.replayPeak === 'number' && track.replayPeak > 0 && (targetGain * track.replayPeak) > 0.965) {
                    targetGain = 0.965 / track.replayPeak; // -0.31 dBFS true-peak guard band
                }
            }
            try {
                replayGainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.04);
            } catch (_) {}
        }

        const isCrossOrigin = trackSrc.startsWith('http://') || trackSrc.startsWith('https://');
        let needsCors = false;
        if (isCrossOrigin) {
            try {
                needsCors = new URL(trackSrc, window.location.href).origin !== window.location.origin;
            } catch (_) {}
        }
        if (needsCors) {
            audio.crossOrigin = 'anonymous';
        } else {
            audio.removeAttribute('crossorigin');
        }

        currentTrackGeneration++;
        audio._trackGeneration = currentTrackGeneration;
        if (!isKnownSoftware) {
            audio.src = trackSrc;
            audio._isFreshTrackLoad = true;
            try { audio.load(); } catch (_) {}
        } else {
            try {
                audio.pause();
                audio.removeAttribute('src');
                audio.load();
            } catch (_) {}
        }

        // Enforce timeframe: selected tracks must ALWAYS start at the beginning (0:00),
        // unless initialTime was explicitly provided (to restore last unfinished track on boot).
        const targetTime = (typeof initialTime === 'number' && !isNaN(initialTime) && initialTime > 0) ? initialTime : 0;

        if (targetTime > 0 && audio.readyState >= 1) {
            try { audio.currentTime = targetTime; } catch (_) {}
        }

        if (targetTime === 0) {
            try {
                safeStorage.removeItem('cachymusic_last_track_time');
            } catch (_) {}
        }

        const applyTargetTime = () => {
            if (targetTime > 0 && audio.duration && !isNaN(audio.duration) && targetTime >= (audio.duration - 1)) {
                // If saved time exceeded or reached duration, treat as ended and restart at 0:00
                audio.currentTime = 0;
                currentTimeEl.textContent = '0:00';
                if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
                progressBar.style.width = '0%';
                if (miniProgressBar) miniProgressBar.style.width = '0%';
                try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {}
                return;
            }

            try {
                audio.currentTime = targetTime;
            } catch (_) {}

            if (targetTime === 0) {
                currentTimeEl.textContent = '0:00';
                if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
                progressBar.style.width = '0%';
                if (miniProgressBar) miniProgressBar.style.width = '0%';
            } else {
                currentTimeEl.textContent = formatTime(targetTime);
                if (miniCurrentTime) miniCurrentTime.textContent = formatTime(targetTime);
                const dur = audio.duration || track.duration || 0;
                if (dur > 0) {
                    const pct = Math.min(100, Math.max(0, (targetTime / dur) * 100));
                    progressBar.style.width = `${pct}%`;
                    if (miniProgressBar) miniProgressBar.style.width = `${pct}%`;
                }
            }
        };

        if (activeLoadedMetadataHandler) {
            try { audio.removeEventListener('loadedmetadata', activeLoadedMetadataHandler); } catch (_) {}
        }
        activeLoadedMetadataHandler = applyTargetTime;
        if (!isKnownSoftware) {
            audio.addEventListener('loadedmetadata', applyTargetTime, { once: true });
        }

        // Center Deck Text - Real Tags or Fallback to Filename / Unknown
        updateEmptyPlayerState();
        updateMarqueeText(trackName, track.title ? track.title : (track.filename || 'Unknown'));
        updateMarqueeText(artistName, track.artist ? track.artist : 'Unknown');
        updateMarqueeText(albumName, track.album ? `Album: ${track.album}${track.year ? ' (' + track.year + ')' : ''}` : 'Album: Unknown');

        // Dynamic Audio Specifications Badge
        updateTrackBadgeUi(track);

        // Cover Artwork & Badge
        const coverSrc = track.cover || 'resources/images/default.svg';
        const hasCustomCover = Boolean(track.cover && !track.cover.includes('default.svg'));
        if (deckArtworkBackdrop) {
            deckArtworkBackdrop.onerror = () => { deckArtworkBackdrop.onerror = null; deckArtworkBackdrop.src = 'resources/images/default.svg'; };
            deckArtworkBackdrop.src = coverSrc;
            deckArtworkBackdrop.style.opacity = hasCustomCover ? '0.28' : '0.04';
        }
        if (deckArtworkAmbient) {
            deckArtworkAmbient.onerror = () => { deckArtworkAmbient.onerror = null; deckArtworkAmbient.src = 'resources/images/default.svg'; };
            deckArtworkAmbient.src = coverSrc;
            deckArtworkAmbient.style.opacity = hasCustomCover ? '0.35' : '0';
        }
        if (vinylArt) {
            vinylArt.onerror = () => { vinylArt.onerror = null; vinylArt.src = 'resources/images/default.svg'; };
            vinylArt.src = coverSrc;
        }
        if (coverArtPreview) {
            coverArtPreview.onerror = () => { coverArtPreview.onerror = null; coverArtPreview.src = 'resources/images/default.svg'; };
            coverArtPreview.src = coverSrc;
        }
        updateAmbientLighting(coverSrc);
        window.appendDebugTelemetry?.(`[LOAD] Track #${index + 1}: "${track.title || track.filename}" (${track.format || 'AUDIO'}, ${track.sampleRate || 44100}Hz)`);

        if (coverBadge) {
            if (track.cover) {
                coverBadge.textContent = 'COVER ART';
                coverBadge.style.color = 'inherit';
            } else {
                coverBadge.textContent = 'MUSIC ICON';
                coverBadge.style.color = '#888888';
            }
        }

        // Right Panel Metadata Inspector - Exact Embedded Tags or Unknown / N/A
        try { window.currentInspectedTrack = track; } catch (_) {}
        statTitle.textContent = track.title ? track.title : 'Unknown';
        statArtist.textContent = track.artist ? track.artist : 'Unknown';
        statAlbum.textContent = track.album ? track.album : 'Unknown';
        statGenre.textContent = (typeof normalizeGenre === 'function' ? normalizeGenre(track.genre) : track.genre) || 'N/A';
        statYear.textContent = track.year ? track.year.toString() : 'N/A';
        if (statTrack) statTrack.textContent = track.track ? track.track.toString() : 'N/A';
        statBitrate.textContent = track.bitrate ? `${track.bitrate} kbps` : 'N/A';
        if (statSampleRate) statSampleRate.textContent = track.sampleRate ? `${track.sampleRate} Hz` : 'N/A';
        if (statBitDepth) {
            const bd = track.bitDepth || ((track.sampleRate && track.sampleRate >= 88200) ? 24 : 16);
            statBitDepth.textContent = bd ? `${bd}-Bit` : 'N/A';
            statBitDepth.style.color = 'inherit';
        }
        updateDacStatusUi();
        if (statChannels) {
            statChannels.textContent = track.channels === 2 ? 'Stereo' : (track.channels === 1 ? 'Mono' : (track.channels ? `${track.channels} ch` : 'N/A'));
        }
        statFormat.textContent = track.format ? track.format.toUpperCase() : 'N/A';
        statSize.textContent = track.size ? track.size : 'N/A';
        statPath.textContent = track.filename ? track.filename : 'N/A';
        statPath.title = track.fullPath || track.filename || 'N/A';

        // Highlight active track in the list and handle virtualized window scrolling
        renderVirtualTrackWindow(true);
        const displayedIdx = displayedTracks.findIndex(t => (
            (track.id && t.id) ? t.id === track.id :
            ((track.tid && t.tid) ? t.tid === track.tid : t.filename === track.filename)
        ));
        if (displayedIdx !== -1) {
            const activeEl = trackList.querySelector(`.trackItem[data-index="${displayedIdx}"]`);
            if (activeEl) {
                activeEl.classList.add('active');
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                scrollToTrackIndex(displayedIdx, true);
            }
        }

        if (targetTime > 0) {
            currentTimeEl.textContent = formatTime(targetTime);
            if (miniCurrentTime) miniCurrentTime.textContent = formatTime(targetTime);
            const totalSec = track.duration || 0;
            if (totalSec > 0) {
                const pct = Math.min(100, Math.max(0, (targetTime / totalSec) * 100));
                progressBar.style.width = `${pct}%`;
                if (miniProgressBar) miniProgressBar.style.width = `${pct}%`;
            }
        } else {
            progressBar.style.width = '0%';
            if (miniProgressBar) miniProgressBar.style.width = '0%';
            currentTimeEl.textContent = '0:00';
            if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
        }
        totalDurationEl.textContent = formatTime(track.duration);
        if (miniTotalDuration) miniTotalDuration.textContent = formatTime(track.duration);
        updateMiniPlayerInfo(track);
        updateLyricsDisplay(track);
        if (targetTime > 0 && isLyricsView) {
            updateActiveLyric(targetTime);
        }

        // Native MediaSession Metadata sync (informs OS & browser of currently loaded track)
        if ('mediaSession' in navigator && window.MediaMetadata) {
            try {
                const resolvedCover = track.cover
                    ? new URL(track.cover, window.location.href).href
                    : new URL('resources/images/default.svg', window.location.href).href;
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.title || track.filename || 'Unknown Title',
                    artist: track.artist || 'Unknown Artist',
                    album: track.album || 'CachyMusic Workstation',
                    artwork: [
                        { src: resolvedCover, sizes: '512x512', type: track.cover ? 'image/png' : 'image/svg+xml' }
                    ]
                });
            } catch (_) {}
        }

        if (isKnownSoftware) {
            if (autoPlay) {
                playWithSoftwareDecoder(track, initialTime);
            } else {
                isSoftwarePaused = true;
                syncPlayPauseUI(false);
            }
            return;
        }

        if (autoPlay) {
            playAudio();
        } else {
            pauseAudio();
        }
    }

    // =========================================================================
    // Standalone / External File Playback Engine (VLC-Style Isolated Playback)
    // =========================================================================
    function updateStandaloneBannerUi(visible, track = null) {
        const banner = (typeof standaloneBanner !== 'undefined' && standaloneBanner) ? standaloneBanner : document.getElementById('standaloneBanner');
        const titleEl = (typeof standaloneBannerTitle !== 'undefined' && standaloneBannerTitle) ? standaloneBannerTitle : document.getElementById('standaloneBannerTitle');
        if (!banner) return;
        if (visible && track) {
            banner.style.display = 'flex';
            if (titleEl) {
                titleEl.textContent = track.title ? `${track.title}${track.artist ? ' - ' + track.artist : ''}` : (track.filename || 'Standalone Audio');
                titleEl.title = track.filename || track.title || '';
            }
        } else {
            banner.style.display = 'none';
        }
    }
    window.updateStandaloneBannerUi = updateStandaloneBannerUi;

    function exitStandalonePlayback(returnToLibrary = true) {
        isStandalonePlayback = false;
        updateStandaloneBannerUi(false);
        if (returnToLibrary && allTracks && allTracks.length > 0) {
            const targetIdx = (currentTrackIndex >= 0 && currentTrackIndex < allTracks.length) ? currentTrackIndex : 0;
            loadTrack(targetIdx, isPlaying);
        } else {
            pauseAudio();
            updateEmptyPlayerState();
        }
    }
    window.exitStandalonePlayback = exitStandalonePlayback;

    async function loadStandaloneTrack(indexOrTrack = 0, autoPlay = true) {
        let track = null;
        if (typeof indexOrTrack === 'number') {
            standaloneTrackIndex = Math.max(0, Math.min((standaloneTrackList.length || 1) - 1, indexOrTrack));
            track = standaloneTrackList[standaloneTrackIndex];
        } else if (indexOrTrack && typeof indexOrTrack === 'object') {
            track = indexOrTrack;
            standaloneTrackList = [track];
            standaloneTrackIndex = 0;
        }
        if (!track) return;

        isStandalonePlayback = true;
        updateStandaloneBannerUi(true, track);

        if (isSoftwareDecoding && softwareSourceNode) {
            try { softwareSourceNode.stop(); } catch (_) {}
            isSoftwareDecoding = false;
        }
        if (softwarePlaybackRaf) {
            cancelAnimationFrame(softwarePlaybackRaf);
            softwarePlaybackRaf = null;
        }

        let trackSrc = track.src || '';
        if (trackSrc.startsWith('../')) trackSrc = trackSrc.substring(3);

        const isKnownSoftware = alwaysSoftwareDecodeUrls.has(trackSrc) || (track.src && alwaysSoftwareDecodeUrls.has(track.src));

        const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
        await ensureAudioEngineForSampleRate(targetRate);

        if (replayGainNode && audioContext) {
            let targetGain = 1.0;
            if (isReplayGain && typeof track.replayGain === 'number' && !isNaN(track.replayGain)) {
                targetGain = Math.pow(10, track.replayGain / 20);
                if (typeof track.replayPeak === 'number' && track.replayPeak > 0 && (targetGain * track.replayPeak) > 0.965) {
                    targetGain = 0.965 / track.replayPeak;
                }
            }
            try {
                replayGainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.04);
            } catch (_) {}
        }

        currentTrackGeneration++;
        audio._trackGeneration = currentTrackGeneration;
        if (!isKnownSoftware) {
            audio.src = trackSrc;
            audio._isFreshTrackLoad = true;
            try { audio.load(); } catch (_) {}
        } else {
            try {
                audio.pause();
                audio.removeAttribute('src');
                audio.load();
            } catch (_) {}
        }

        audio.currentTime = 0;
        if (currentTimeEl) currentTimeEl.textContent = '0:00';
        if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
        if (progressBar) progressBar.style.width = '0%';
        if (miniProgressBar) miniProgressBar.style.width = '0%';

        updateEmptyPlayerState();
        if (trackName) updateMarqueeText(trackName, track.title ? track.title : (track.filename || 'Standalone Audio'));
        if (artistName) updateMarqueeText(artistName, track.artist ? track.artist : 'External File');
        if (albumName) updateMarqueeText(albumName, track.album ? `Album: ${track.album}${track.year ? ' (' + track.year + ')' : ''}` : 'Standalone File');

        updateTrackBadgeUi(track);
        const audioSrcBadge = document.getElementById('audioSourceBadge');
        if (audioSrcBadge) audioSrcBadge.textContent = 'STANDALONE';

        const coverSrc = track.cover || 'resources/images/default.svg';
        const hasCustomCover = Boolean(track.cover && !track.cover.includes('default.svg'));
        if (deckArtworkBackdrop) {
            deckArtworkBackdrop.onerror = () => { deckArtworkBackdrop.onerror = null; deckArtworkBackdrop.src = 'resources/images/default.svg'; };
            deckArtworkBackdrop.src = coverSrc;
            deckArtworkBackdrop.style.opacity = hasCustomCover ? '0.28' : '0.04';
        }
        if (deckArtworkAmbient) {
            deckArtworkAmbient.onerror = () => { deckArtworkAmbient.onerror = null; deckArtworkAmbient.src = 'resources/images/default.svg'; };
            deckArtworkAmbient.src = coverSrc;
            deckArtworkAmbient.style.opacity = hasCustomCover ? '0.35' : '0';
        }
        if (vinylArt) {
            vinylArt.onerror = () => { vinylArt.onerror = null; vinylArt.src = 'resources/images/default.svg'; };
            vinylArt.src = coverSrc;
        }
        if (coverArtPreview) {
            coverArtPreview.onerror = () => { coverArtPreview.onerror = null; coverArtPreview.src = 'resources/images/default.svg'; };
            coverArtPreview.src = coverSrc;
        }
        updateAmbientLighting(coverSrc);
        window.appendDebugTelemetry?.(`[STANDALONE LOAD] "${track.title || track.filename}" (${track.format || 'AUDIO'}, ${track.sampleRate || 44100}Hz)`);

        try { window.currentInspectedTrack = track; } catch (_) {}
        if (statTitle) statTitle.textContent = track.title ? track.title : (track.filename || 'Standalone Audio');
        if (statArtist) statArtist.textContent = track.artist ? track.artist : 'External File';
        if (statAlbum) statAlbum.textContent = track.album ? track.album : 'Standalone File';
        if (statGenre) statGenre.textContent = (typeof normalizeGenre === 'function' ? normalizeGenre(track.genre) : track.genre) || 'N/A';
        if (statYear) statYear.textContent = track.year ? track.year.toString() : 'N/A';
        if (statTrack) statTrack.textContent = track.track ? track.track.toString() : 'N/A';
        if (statBitrate) statBitrate.textContent = track.bitrate ? `${track.bitrate} kbps` : 'N/A';
        if (statSampleRate) statSampleRate.textContent = track.sampleRate ? `${track.sampleRate} Hz` : 'N/A';
        if (statBitDepth) {
            const bd = track.bitDepth || ((track.sampleRate && track.sampleRate >= 88200) ? 24 : 16);
            statBitDepth.textContent = bd ? `${bd}-Bit` : 'N/A';
            statBitDepth.style.color = 'inherit';
        }
        updateDacStatusUi();
        if (statChannels) {
            statChannels.textContent = track.channels === 2 ? 'Stereo' : (track.channels === 1 ? 'Mono' : (track.channels ? `${track.channels} ch` : 'N/A'));
        }
        if (statFormat) statFormat.textContent = track.format ? track.format.toUpperCase() : 'N/A';
        if (statSize) statSize.textContent = track.size ? track.size : 'N/A';
        if (statPath) {
            statPath.textContent = track.filename ? track.filename : 'Standalone File';
            statPath.title = track.fullPath || track.filename || 'Standalone File';
        }

        const activeEls = document.querySelectorAll('.trackItem.active');
        activeEls.forEach(el => el.classList.remove('active'));

        if (totalDurationEl) totalDurationEl.textContent = formatTime(track.duration);
        if (miniTotalDuration) miniTotalDuration.textContent = formatTime(track.duration);
        updateMiniPlayerInfo(track);
        updateSignalPathUi(track);
        if (typeof updateLyricsDisplay === 'function') {
            updateLyricsDisplay(track);
        }

        if ('mediaSession' in navigator && window.MediaMetadata) {
            try {
                const resolvedCover = track.cover
                    ? new URL(track.cover, window.location.href).href
                    : new URL('resources/images/default.svg', window.location.href).href;
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.title || track.filename || 'Standalone Audio',
                    artist: track.artist || 'External File',
                    album: track.album || 'CachyMusic Workstation',
                    artwork: [
                        { src: resolvedCover, sizes: '512x512', type: track.cover ? 'image/png' : 'image/svg+xml' }
                    ]
                });
            } catch (_) {}
        }

        if (isKnownSoftware) {
            if (autoPlay) {
                playWithSoftwareDecoder(track, 0);
            } else {
                isSoftwarePaused = true;
                syncPlayPauseUI(false);
            }
            return;
        }

        if (autoPlay) {
            playAudio();
        } else {
            pauseAudio();
        }
    }
    window.loadStandaloneTrack = loadStandaloneTrack;

    // =========================================================================
    // Lyrics Displayer & Turntable Toggle Logic
    // =========================================================================


    // Centralized Play/Pause UI Synchronizer
    let lastSyncedPlayingState = null;
    function syncPlayPauseUI(playing, force = false) {
        playing = !!playing;
        if (!force && lastSyncedPlayingState === playing) return;
        lastSyncedPlayingState = playing;
        isPlaying = playing;

        // Sync native MediaSession playbackState (stops OS & Chromium from falsely unpausing)
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
                if ('setPositionState' in navigator.mediaSession) {
                    const dur = isSoftwareDecoding ? (activeDecodedBuffer ? activeDecodedBuffer.duration : 0) : audio.duration;
                    const pos = isSoftwareDecoding ? (softwarePlaybackOffset + (audioContext ? (audioContext.currentTime - softwarePlaybackStartTime) : 0)) : (audio.currentTime || 0);
                    if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
                        navigator.mediaSession.setPositionState({
                            duration: Math.max(0, dur),
                            playbackRate: 1.0,
                            position: Math.max(0, Math.min(dur, pos || 0))
                        });
                    }
                }
            } catch (_) {}
        }

        // Center Player Deck Controls — icon toggled via CSS .playing class (instant, no image load)
        if (playPauseBtn) {
            playPauseBtn.setAttribute('title', playing ? 'Pause (Space)' : 'Play (Space)');
            playPauseBtn.classList.toggle('playing', playing);
        }

        // Vinyl Turntable, Tonearm, Background Disc Animation
        const isThematicActive = (activeVisualizerMode === 'thematic' || activeVisualizerMode === 'badapple');
        if (vinylTurntable) {
            vinylTurntable.classList.toggle('thematicFidelity', isThematicActive);
            vinylTurntable.classList.toggle('spinning', playing);
        }
        if (toneArm) toneArm.classList.toggle('active', playing);
        if (bgDisc) bgDisc.classList.toggle('fast', playing && isThematicActive);

        // Persistent Mini-Player Sync
        updateMiniPlayerPlayState(playing);

        // Synchronize Global Playback State Class on Body for Reactive CSS Hardware Animations
        document.body.classList.toggle('is-playing', playing);

        // Synchronize Header Studio Status Indicator
        const studioStatusEl = document.getElementById('studioUserStatus');
        if (studioStatusEl) {
            const textEl = studioStatusEl.querySelector('.statusText');
            if (textEl) {
                textEl.textContent = playing ? 'PLAYING' : 'READY';
            }
        }

        if (playing && typeof resumeVisualizerLoop === 'function') {
            resumeVisualizerLoop();
        }
    }

    // Render Repeat Button UI (with bold centered "1" for Repeat Current Track)
    function updateRepeatUI() {
        if (!repeatBtn) return;
        safeStorage.setItem('cachymusic_repeat_mode', repeatMode);

        if (repeatMode === 'one') {
            repeatBtn.classList.add('active', 'repeat-one');
            repeatBtn.setAttribute('title', 'Repeat Current Track (1) Active — Click to Turn Off');
            repeatBtn.style.opacity = '1';
            repeatBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                    <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="7.5" font-weight="900" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" fill="currentColor">1</text>
                </svg>
            `;
        } else if (repeatMode === 'all') {
            repeatBtn.classList.add('active');
            repeatBtn.classList.remove('repeat-one');
            repeatBtn.setAttribute('title', 'Repeat All Tracks Active — Click for Repeat One');
            repeatBtn.style.opacity = '1';
            repeatBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                </svg>
            `;
        } else { // 'off'
            repeatBtn.classList.remove('active', 'repeat-one');
            repeatBtn.setAttribute('title', 'Repeat Off — Click for Repeat All');
            repeatBtn.style.opacity = '0.45';
            repeatBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                </svg>
            `;
        }
    }

    let isPlayPending = false;
    let playPendingTimeout = null;
    // Explicit pause lock: when user pauses or starts app, locks out background unpausing
    let userExplicitlyPaused = true;
    let trackPlaybackRetryCount = 0;
    let consecutiveSkipCount = 0;
    window.audioPlaybackDebugLogs = [];

    let debugModeActive = false;
    try {
        debugModeActive = safeStorage.getItem('cachymusic_debug_mode') === 'true';
    } catch (_) {}


    // Play Audio (guarded against concurrent async race conditions and AbortError)
    async function playAudio(userInitiated = false) {
        if (isSoftwareDecoding) {
            userExplicitlyPaused = false;
            syncPlayPauseUI(true);
            resumeSoftwarePlayback();
            return;
        }

        const currentTrack = (isStandalonePlayback && standaloneTrackList.length > 0)
            ? standaloneTrackList[standaloneTrackIndex]
            : allTracks[currentTrackIndex];
        const currentSrc = currentTrack ? (currentTrack.src || '') : '';
        const cleanSrc = currentSrc.startsWith('../') ? currentSrc.substring(3) : currentSrc;
        const isKnownSoftware = currentTrack && (alwaysSoftwareDecodeUrls.has(cleanSrc) || (currentTrack.src && alwaysSoftwareDecodeUrls.has(currentTrack.src)));

        if (isKnownSoftware && !isSoftwareDecoding) {
            userExplicitlyPaused = false;
            syncPlayPauseUI(true);
            playWithSoftwareDecoder(currentTrack, 0);
            return;
        }

        if (!audio.src || audio.src === window.location.href) {
            // No track loaded — snap UI back to paused state and do nothing
            syncPlayPauseUI(false);
            return;
        }
        if (isPlayPending) {
            console.log('playAudio already pending, skipping concurrent call.');
            return;
        }

        const reqId = ++currentPlayRequestId;

        // User explicitly unpaused
        userExplicitlyPaused = false;

        // Lock immediately — before any await — so rapid clicks can't bypass the guard
        isPlayPending = true;
        if (playPendingTimeout) clearTimeout(playPendingTimeout);
        playPendingTimeout = setTimeout(() => {
            if (isPlayPending && reqId === currentPlayRequestId) {
                console.warn('isPlayPending safety timeout triggered, unlocking.');
                isPlayPending = false;
            }
        }, 4000);

        // Optimistically update UI so the user immediately sees the pause icon
        syncPlayPauseUI(true);

        try {
            const track = allTracks[currentTrackIndex];
            const targetRate = (track && track.sampleRate) ? getValidSampleRate(track.sampleRate) : 44100;
            if (!audioContext || audioContext.state === 'closed') {
                await ensureAudioEngineForSampleRate(targetRate);
            } else if (!audioSourceNode) {
                getOrCreateAudioSourceNode();
                updateAudioRouting();
            }
            if (reqId !== currentPlayRequestId) return;
            if (audioContext && audioContext.state !== 'running') {
                try {
                    await Promise.race([
                        audioContext.resume(),
                        new Promise(resolve => setTimeout(resolve, 300))
                    ]);
                } catch (_) {}
            }
            if (reqId !== currentPlayRequestId) return;
            if (audio.muted) {
                audio.muted = false;
            }
            if (audio.volume === 0 && currentVolumeValue > 0) {
                audio.volume = isHardwareGain ? 1.0 : Math.min(1.0, currentVolumeValue);
            }

            // If audio has an error state (e.g. from a past network timeout or worker stall), reload it
            // Only perform reload if it was NOT just loaded as a fresh track in loadTrack()
            if (audio.error && !audio._isFreshTrackLoad) {
                console.warn('Audio element has error state; recovering before play:', audio.error);
                const isDecodeErr = (audio.error.code === 3);
                const resumeTime = isDecodeErr ? 0 : (audio.currentTime || 0);
                const currentSrc = audio.src;
                audio.src = currentSrc;
                audio.load();
                if (resumeTime > 0) {
                    try { audio.currentTime = resumeTime; } catch (_) {}
                }
            }
            audio._isFreshTrackLoad = false;

            await audio.play();
            if (reqId !== currentPlayRequestId) return;
            // Reflect actual audio state — user may have paused during the async gap
            syncPlayPauseUI(!audio.paused);
        } catch (err) {
            if (reqId !== currentPlayRequestId) return;
            // Ignore AbortError if interrupted by a rapid pause click or track skip
            if (err.name !== 'AbortError') {
                console.warn('Audio playback error:', err);
            }
            if (audio.paused) {
                syncPlayPauseUI(false);
            }
        } finally {
            if (reqId === currentPlayRequestId) {
                if (playPendingTimeout) {
                    clearTimeout(playPendingTimeout);
                    playPendingTimeout = null;
                }
                isPlayPending = false;
            }
        }
    }

    // Pause Audio
    function pauseAudio() {
        userExplicitlyPaused = true;
        if (isSoftwareDecoding) {
            pauseSoftwarePlayback();
            syncPlayPauseUI(false);
            return;
        }
        try {
            audio.pause();
        } catch (err) {
            console.warn('Audio pause error:', err);
        }
        syncPlayPauseUI(false);
    }

    // Toggle Play/Pause (uses native audio.paused as ground truth)
    function togglePlayPause() {
        if (isSoftwareDecoding) {
            if (!isSoftwarePaused) {
                userExplicitlyPaused = true;
                pauseAudio();
            } else {
                userExplicitlyPaused = false;
                playAudio(true);
            }
            return;
        }
        // Nothing loaded yet — if library has tracks, start playback on current/first track
        if (!audio.src || audio.src === window.location.href) {
            if (allTracks && allTracks.length > 0) {
                const targetIdx = (currentTrackIndex >= 0 && allTracks[currentTrackIndex]) ? currentTrackIndex : 0;
                loadTrack(targetIdx, true);
                return;
            }
            syncPlayPauseUI(false);
            return;
        }
        // Always allow pause even if a play is still pending (e.g. buffering)
        if (!audio.paused) {
            userExplicitlyPaused = true;
            pauseAudio();
        } else if (!isPlayPending) {
            userExplicitlyPaused = false;
            playAudio(true);
        }
    }

    // =========================================================================
    // True Gapless Playback Engine (Dual-Buffer Pre-caching & 0ms Handoff)
    // =========================================================================
    function peekNextTrackIndex() {
        if (playQueue && playQueue.length > 0) {
            const queued = playQueue[0];
            const qIdx = allTracks.findIndex(t => (queued.id && t.id === queued.id) || (queued.tid && t.tid === queued.tid) || t.filename === queued.filename);
            if (qIdx !== -1) return qIdx;
        }

        const pool = displayedTracks.length > 0 ? displayedTracks : allTracks;
        if (pool.length === 0) return -1;

        let currentIdxInPool = pool.findIndex(t => {
            const cur = allTracks[currentTrackIndex];
            if (!cur) return false;
            if (cur.id && t.id) return t.id === cur.id;
            if (cur.tid && t.tid) return t.tid === cur.tid;
            return t.filename === cur.filename;
        });

        if (currentIdxInPool === -1) return -1;
        if (isShuffle && pool.length > 1) return -1;

        let nextIdx = currentIdxInPool + 1;
        if (nextIdx >= pool.length) {
            if (repeatMode === 'off') return -1;
            nextIdx = 0;
        }

        const target = pool[nextIdx];
        return allTracks.findIndex(t => target && ((t.id && t.id === target.id) || (t.tid && t.tid === target.tid) || t.filename === target.filename));
    }

    function checkAndPreloadNextTrack(currentTime, duration) {
        if (window.AndroidBridge || /Android/i.test(navigator.userAgent) || window.innerWidth <= 768) {
            return;
        }
        if (!duration || isNaN(duration) || duration < 8) return;
        if (duration - currentTime <= 5.0) {
            const nextMasterIdx = peekNextTrackIndex();
            if (nextMasterIdx !== -1 && nextMasterIdx !== preloadedNextTrackIndex && allTracks[nextMasterIdx]) {
                preloadedNextTrackIndex = nextMasterIdx;
                const nextTrack = allTracks[nextMasterIdx];
                let nextSrc = nextTrack.src || '';
                if (nextSrc.startsWith('../')) nextSrc = nextSrc.substring(3);

                if (!secondaryAudio) {
                    secondaryAudio = document.createElement('audio');
                    secondaryAudio.preload = 'auto';
                    secondaryAudio.crossOrigin = 'anonymous';
                }
                secondaryAudio.src = nextSrc;
                try {
                    secondaryAudio.load();
                } catch (_) {}
            }
        }
    }

    function executeGaplessHandoff(nextIndex) {
        // In Android WebView / mobile APK, bypass secondary audio swapping to ensure the canonical DOM-attached audio element is always used
        if (window.AndroidBridge || /Android/i.test(navigator.userAgent) || window.innerWidth <= 768) {
            return false;
        }
        if (!secondaryAudio || preloadedNextTrackIndex !== nextIndex || secondaryAudio.readyState < 2) {
            return false;
        }
        try {
            const oldAudio = audio;
            secondaryAudio.volume = oldAudio.volume;
            secondaryAudio.muted = oldAudio.muted;
            try {
                secondaryAudio.playbackRate = currentPlaybackSpeed || oldAudio.playbackRate || 1.0;
                secondaryAudio.preservesPitch = isPitchLockTempo;
                secondaryAudio.mozPreservesPitch = isPitchLockTempo;
                secondaryAudio.webkitPreservesPitch = isPitchLockTempo;
            } catch (_) {}

            // Swap active audio reference BEFORE pausing/clearing oldAudio so oldAudio events are ignored
            audio = secondaryAudio;
            secondaryAudio = oldAudio;
            currentTrackIndex = nextIndex;
            preloadedNextTrackIndex = -1;
            trackPlaybackRetryCount = 0;

            oldAudio.pause();
            oldAudio.removeAttribute('src');

            if (audioSourceNode) {
                try { audioSourceNode.disconnect(); } catch (_) {}
                audioSourceNode = null;
            }

            attachAudioListeners(audio);
            getOrCreateAudioSourceNode();
            updateAudioRouting();

            // ReplayGain leveling for the new track
            const nextTrack = allTracks[currentTrackIndex];
            if (nextTrack && replayGainNode && audioContext) {
                let targetGain = 1.0;
                if (isReplayGain && typeof nextTrack.replayGain === 'number' && !isNaN(nextTrack.replayGain)) {
                    targetGain = Math.pow(10, nextTrack.replayGain / 20);
                    if (typeof nextTrack.replayPeak === 'number' && nextTrack.replayPeak > 0 && (targetGain * nextTrack.replayPeak) > 0.965) {
                        targetGain = 0.965 / nextTrack.replayPeak; // -0.31 dBFS true-peak safety ceiling
                    }
                }
                try {
                    replayGainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.04);
                } catch (_) {}
            }

            userExplicitlyPaused = false;
            audio.play().then(() => {
                syncPlayPauseUI(true);
                if (typeof resumeVisualizerLoop === 'function') resumeVisualizerLoop();
            }).catch(console.warn);

            if (nextTrack) {
                if (trackName) updateMarqueeText(trackName, nextTrack.title ? nextTrack.title : (nextTrack.filename || 'Unknown'));
                if (artistName) updateMarqueeText(artistName, nextTrack.artist ? nextTrack.artist : 'Unknown');
                if (albumName) updateMarqueeText(albumName, nextTrack.album ? `Album: ${nextTrack.album}${nextTrack.year ? ' (' + nextTrack.year + ')' : ''}` : 'Album: Unknown');
                updateTrackBadgeUi(nextTrack);
                const coverSrc = nextTrack.cover || 'resources/images/default.svg';
                if (deckArtworkBackdrop) deckArtworkBackdrop.src = coverSrc;
                if (deckArtworkAmbient) deckArtworkAmbient.src = coverSrc;
                if (vinylArt) vinylArt.src = coverSrc;
                if (coverArtPreview) coverArtPreview.src = coverSrc;
                updateAmbientLighting(coverSrc);
                if (statTitle) statTitle.textContent = nextTrack.title || 'Unknown';
                if (statArtist) statArtist.textContent = nextTrack.artist || 'Unknown';
                if (statAlbum) statAlbum.textContent = nextTrack.album || 'Unknown';
                if (statGenre) statGenre.textContent = (typeof normalizeGenre === 'function' ? normalizeGenre(nextTrack.genre) : nextTrack.genre) || 'N/A';
                if (statYear) statYear.textContent = nextTrack.year ? nextTrack.year.toString() : 'N/A';
                if (statTrack) statTrack.textContent = nextTrack.track ? nextTrack.track.toString() : 'N/A';
                if (statBitrate) statBitrate.textContent = nextTrack.bitrate ? `${nextTrack.bitrate} kbps` : 'N/A';
                if (statSampleRate) statSampleRate.textContent = nextTrack.sampleRate ? `${nextTrack.sampleRate} Hz` : 'N/A';
                if (statFormat) statFormat.textContent = nextTrack.format ? nextTrack.format.toUpperCase() : 'N/A';
                if (statSize) statSize.textContent = nextTrack.size || 'N/A';
                if (statPath) {
                    statPath.textContent = nextTrack.filename || 'N/A';
                    statPath.title = nextTrack.fullPath || nextTrack.filename || 'N/A';
                }
                updateDacStatusUi();
                updateSignalPathUi(nextTrack);
                updateLyricsDisplay(nextTrack);
                updateMiniPlayerInfo(nextTrack);
                renderVirtualTrackWindow(true);
            }
            return true;
        } catch (e) {
            console.warn('Gapless handoff fallback:', e);
            return false;
        }
    }

    // Next Track (Sample-Accurate Gapless Aware)
    function nextTrack() {
        if (isStandalonePlayback && standaloneTrackList && standaloneTrackList.length > 0) {
            if (repeatMode === 'one') {
                audio.currentTime = 0;
                playAudio();
                return;
            }
            if (standaloneTrackList.length > 1) {
                if (standaloneTrackIndex + 1 < standaloneTrackList.length || repeatMode === 'all') {
                    standaloneTrackIndex = (standaloneTrackIndex + 1) % standaloneTrackList.length;
                    loadStandaloneTrack(standaloneTrackIndex, true);
                } else {
                    pauseAudio();
                    audio.currentTime = 0;
                }
            } else {
                if (repeatMode === 'all') {
                    audio.currentTime = 0;
                    playAudio();
                } else {
                    pauseAudio();
                    audio.currentTime = 0;
                }
            }
            return;
        }

        if (playQueue && playQueue.length > 0) {
            const nextQueuedTrack = playQueue.shift();
            updateQueueUi();
            const masterIdx = allTracks.findIndex(t =>
                (nextQueuedTrack.id && t.id === nextQueuedTrack.id) ||
                (nextQueuedTrack.tid && t.tid === nextQueuedTrack.tid) ||
                t.filename === nextQueuedTrack.filename
            );
            if (masterIdx !== -1) {
                if (!executeGaplessHandoff(masterIdx)) {
                    loadTrack(masterIdx, true);
                }
                return;
            }
        }

        const pool = displayedTracks.length > 0 ? displayedTracks : allTracks;
        if (pool.length === 0) return;

        let currentIdxInPool = pool.findIndex(t => {
            const cur = allTracks[currentTrackIndex];
            if (!cur) return false;
            if (cur.id && t.id) return t.id === cur.id;
            if (cur.tid && t.tid) return t.tid === cur.tid;
            return t.filename === cur.filename;
        });

        if (isShuffle && pool.length > 1) {
            let nextIdx = Math.floor(Math.random() * pool.length);
            let attempts = 0;
            while (nextIdx === currentIdxInPool && attempts < 10) {
                nextIdx = Math.floor(Math.random() * pool.length);
                attempts++;
            }
            const masterIdx = allTracks.findIndex(t => pool[nextIdx] && ((t.id && t.id === pool[nextIdx].id) || (t.tid && t.tid === pool[nextIdx].tid) || t.filename === pool[nextIdx].filename));
            if (masterIdx !== -1) {
                if (!executeGaplessHandoff(masterIdx)) {
                    loadTrack(masterIdx, true);
                }
            }
        } else {
            let nextIdx = currentIdxInPool + 1;
            if (nextIdx >= pool.length) {
                if (repeatMode === 'off') {
                    pauseAudio();
                    audio.currentTime = 0;
                    progressBar.style.width = '0%';
                    currentTimeEl.textContent = '0:00';
                    return;
                }
                nextIdx = 0;
            }
            const masterIdx = allTracks.findIndex(t => pool[nextIdx] && ((t.id && t.id === pool[nextIdx].id) || (t.tid && t.tid === pool[nextIdx].tid) || t.filename === pool[nextIdx].filename));
            if (masterIdx !== -1) {
                if (!executeGaplessHandoff(masterIdx)) {
                    loadTrack(masterIdx, true);
                }
            }
        }
    }

    // Previous Track
    function prevTrack() {
        if (isStandalonePlayback && standaloneTrackList && standaloneTrackList.length > 0) {
            if (audio.currentTime > 3) {
                audio.currentTime = 0;
            } else if (standaloneTrackList.length > 1) {
                standaloneTrackIndex = (standaloneTrackIndex - 1 + standaloneTrackList.length) % standaloneTrackList.length;
                loadStandaloneTrack(standaloneTrackIndex, true);
            } else {
                audio.currentTime = 0;
            }
            return;
        }

        if (audio.currentTime > 3) {
            audio.currentTime = 0;
            return;
        }

        const pool = displayedTracks.length > 0 ? displayedTracks : allTracks;
        if (pool.length === 0) return;

        let currentIdxInPool = pool.findIndex(t => {
            const cur = allTracks[currentTrackIndex];
            if (!cur) return false;
            if (cur.id && t.id) return t.id === cur.id;
            if (cur.tid && t.tid) return t.tid === cur.tid;
            return t.filename === cur.filename;
        });
        let prevIdx = currentIdxInPool - 1;
        if (prevIdx < 0) {
            prevIdx = pool.length - 1;
        }
        const masterIdx = allTracks.findIndex(t => pool[prevIdx] && ((t.id && t.id === pool[prevIdx].id) || (t.tid && t.tid === pool[prevIdx].tid) || t.filename === pool[prevIdx].filename));
        if (masterIdx !== -1) loadTrack(masterIdx, true);
    }

    // =========================================================================

    // Universal Web Audio Software Decoder Engine (Zero-Skip Hybrid Pipeline)
    // =========================================================================
    function updatePlaybackProgress(cur, dur) {
        if (isDraggingScrubber) return;
        const currentTrack = (isStandalonePlayback && standaloneTrackList.length > 0)
            ? standaloneTrackList[standaloneTrackIndex]
            : allTracks[currentTrackIndex];
        if (!isFinite(dur) || isNaN(dur) || dur <= 0) {
            if (currentTrack && currentTrack.duration && isFinite(currentTrack.duration)) {
                dur = Number(currentTrack.duration);
            }
        }
        if (currentTimeEl) currentTimeEl.textContent = formatTime(cur);
        if (miniCurrentTime) miniCurrentTime.textContent = formatTime(cur);

        if (dur && isFinite(dur) && dur > 0) {
            const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (miniProgressBar) miniProgressBar.style.width = `${pct}%`;
        }

        if (cur > 1.0 && consecutiveSkipCount > 0) {
            consecutiveSkipCount = 0;
        }

        if (isLyricsView) {
            updateActiveLyric(cur);
        }
    }

    function startSoftwareProgressLoop() {
        cancelSoftwareProgressLoop();
        function tick() {
            if (!isSoftwareDecoding || isSoftwarePaused || !activeDecodedBuffer) return;
            const cur = softwarePlaybackOffset + (audioContext ? (audioContext.currentTime - softwarePlaybackStartTime) : 0);
            const dur = activeDecodedBuffer.duration;
            updatePlaybackProgress(cur, dur);
            if (cur >= dur) {
                onSoftwarePlaybackEnded();
                return;
            }
            softwarePlaybackRaf = requestAnimationFrame(tick);
        }
        softwarePlaybackRaf = requestAnimationFrame(tick);
    }

    function cancelSoftwareProgressLoop() {
        if (softwarePlaybackRaf) {
            cancelAnimationFrame(softwarePlaybackRaf);
            softwarePlaybackRaf = null;
        }
    }

    function startSoftwareBufferPlayback() {
        if (!audioContext || !activeDecodedBuffer) return;
        if (softwareSourceNode) {
            try {
                softwareSourceNode.onended = null;
                softwareSourceNode.stop();
                softwareSourceNode.disconnect();
            } catch (_) {}
            softwareSourceNode = null;
        }

        softwareSourceNode = audioContext.createBufferSource();
        softwareSourceNode.buffer = activeDecodedBuffer;

        if (!softwareSourceGainNode) {
            softwareSourceGainNode = audioContext.createGain();
        }
        softwareSourceNode.connect(softwareSourceGainNode);
        updateAudioRouting();

        softwarePlaybackStartTime = audioContext.currentTime;
        softwareSourceNode.start(0, softwarePlaybackOffset);
        isSoftwarePaused = false;
        syncPlayPauseUI(true);
        startSoftwareProgressLoop();

        softwareSourceNode.onended = () => {
            if (!isSoftwareDecoding || isSoftwarePaused) return;
            const cur = softwarePlaybackOffset + (audioContext ? (audioContext.currentTime - softwarePlaybackStartTime) : 0);
            if (cur >= (activeDecodedBuffer.duration - 0.5)) {
                onSoftwarePlaybackEnded();
            }
        };
    }

    function pauseSoftwarePlayback() {
        if (!isSoftwareDecoding || isSoftwarePaused) return;
        cancelSoftwareProgressLoop();
        if (audioContext && softwarePlaybackStartTime > 0) {
            softwarePlaybackOffset += (audioContext.currentTime - softwarePlaybackStartTime);
        }
        if (softwareSourceNode) {
            try {
                softwareSourceNode.onended = null;
                softwareSourceNode.stop();
                softwareSourceNode.disconnect();
            } catch (_) {}
            softwareSourceNode = null;
        }
        isSoftwarePaused = true;
        syncPlayPauseUI(false);
    }

    function resumeSoftwarePlayback() {
        if (!isSoftwareDecoding || !activeDecodedBuffer) return;
        if (audioContext && audioContext.state !== 'running') {
            try { audioContext.resume(); } catch (_) {}
        }
        startSoftwareBufferPlayback();
    }

    function seekSoftwarePlayback(targetSec) {
        if (!isSoftwareDecoding || !activeDecodedBuffer) return;
        const dur = activeDecodedBuffer.duration;
        softwarePlaybackOffset = Math.max(0, Math.min(dur, targetSec));
        if (!isSoftwarePaused) {
            startSoftwareBufferPlayback();
        } else {
            updatePlaybackProgress(softwarePlaybackOffset, dur);
        }
    }

    function stopSoftwarePlayback() {
        cancelSoftwareProgressLoop();
        if (softwareSourceNode) {
            try {
                softwareSourceNode.onended = null;
                softwareSourceNode.stop();
                softwareSourceNode.disconnect();
            } catch (_) {}
            softwareSourceNode = null;
        }
        isSoftwareDecoding = false;
        isSoftwarePaused = false;
        softwarePlaybackStartTime = 0;
        softwarePlaybackOffset = 0;
    }

    function onSoftwarePlaybackEnded() {
        stopSoftwarePlayback();
        try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {}
        if (repeatMode === 'one') {
            loadTrack(currentTrackIndex, true, 0);
        } else {
            nextTrack();
        }
    }

    async function playWithSoftwareDecoder(track, startTime = 0) {
        if (!track) return;
        isSoftwareDecoding = true;
        isSoftwarePaused = false;
        userExplicitlyPaused = false;
        syncPlayPauseUI(true);

        try {
            if (audio) {
                try {
                    audio.pause();
                    audio.removeAttribute('src');
                    audio.load();
                } catch (_) {}
            }

            const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
            await ensureAudioEngineForSampleRate(targetRate);
            if (audioContext && audioContext.state !== 'running') {
                try { await audioContext.resume(); } catch (_) {}
            }

            let src = track.src || '';
            if (src.startsWith('../')) src = src.substring(3);

            logAudioPlaybackEvent('info', `Fetching stream bitstream for 32-bit software decode: "${track.title || track.filename}"`);
            if (typeof showCachyToast === 'function') {
                showCachyToast('Software Audio Engine', `Decoding 24-bit/audiophile stream: "${track.title || track.filename}"`, 'info');
            }

            const res = await fetch(src);
            if (!res.ok) throw new Error(`HTTP ${res.status} fetch failure`);
            const arrayBuf = await res.arrayBuffer();

            logAudioPlaybackEvent('info', `Decompressing bitstream into 32-bit floating point audio buffer (${(arrayBuf.byteLength / (1024 * 1024)).toFixed(2)} MB)...`);
            const decodedBuffer = await new Promise((resolve, reject) => {
                const p = audioContext.decodeAudioData(
                    arrayBuf,
                    buf => resolve(buf),
                    err => reject(err || new Error('decodeAudioData callback returned error'))
                );
                if (p && typeof p.then === 'function') {
                    p.then(resolve, reject);
                }
            });
            activeDecodedBuffer = decodedBuffer;

            track.duration = decodedBuffer.duration;
            if (totalDurationEl) totalDurationEl.textContent = formatTime(decodedBuffer.duration);
            if (miniTotalDuration) miniTotalDuration.textContent = formatTime(decodedBuffer.duration);

            softwarePlaybackOffset = Math.max(0, Math.min(decodedBuffer.duration, startTime));
            startSoftwareBufferPlayback();
            consecutiveSkipCount = 0;
            logAudioPlaybackEvent('info', `Web Audio Software Engine playing "${track.title || track.filename}" at ${decodedBuffer.sampleRate}Hz, ${decodedBuffer.numberOfChannels}ch, ${decodedBuffer.duration.toFixed(1)}s.`);
        } catch (err) {
            console.error('[AudioEngine] Software decoder fallback failed:', err);
            logAudioPlaybackEvent('error', `Web Audio software decode failure: ${err.message}`);
            isSoftwareDecoding = false;
            if (typeof showCachyToast === 'function') {
                showCachyToast('Playback Error', `File corrupted or unreadable. Skipping track...`, 'error');
            }
            setTimeout(() => nextTrack(), 1000);
        }
    }

    function attachAudioListeners(targetAudio) {
        if (!targetAudio || targetAudio._hasCachyListeners) return;
        targetAudio._hasCachyListeners = true;
        let isAudioBuffering = false;

        targetAudio.addEventListener('play', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            // Background Tab Protection:
            // If user explicitly paused CachyMusic and the tab is hidden in the background,
            // immediately halt any rogue/accidental unpause triggered by external media keys,
            // OS MPRIS signals, or YouTube media session transitions.
            if (userExplicitlyPaused && document.hidden) {
                targetAudio.pause();
                syncPlayPauseUI(false);
                return;
            }
            isAudioBuffering = false;
            syncPlayPauseUI(true);
        });
        targetAudio.addEventListener('playing', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            if (userExplicitlyPaused && document.hidden) {
                targetAudio.pause();
                syncPlayPauseUI(false);
                return;
            }
            isAudioBuffering = false;
            syncPlayPauseUI(true);
        });
        targetAudio.addEventListener('pause', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            // If pause was fired by the browser decoder while buffering and user did not request pause,
            // preserve user's playback state and avoid erratic UI flapping
            if (isAudioBuffering && !userExplicitlyPaused) {
                return;
            }
            syncPlayPauseUI(false);
            try {
                const cur = targetAudio.currentTime;
                const dur = targetAudio.duration;
                if (cur > 0 && (!dur || isNaN(dur) || cur < (dur - 1))) {
                    safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2));
                }
            } catch (_) {}
        });
        targetAudio.addEventListener('emptied', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            syncPlayPauseUI(false);
        });
        targetAudio.addEventListener('waiting', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            // Native audio decoder is buffering stream chunk
            if (!userExplicitlyPaused) {
                isAudioBuffering = true;
            }
        });
        targetAudio.addEventListener('stalled', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            console.warn('Audio stream buffer stalled, awaiting more chunk data');
            if (!userExplicitlyPaused) {
                isAudioBuffering = true;
            }
        });
        targetAudio.addEventListener('error', () => {
            // Discard errors from disposed audio elements, intentional src clears, or while software decoding is active
            if (targetAudio._isDisposed || targetAudio !== audio || isSoftwareDecoding) return;
            if (!targetAudio.src || targetAudio.src === window.location.href || !targetAudio.getAttribute('src')) {
                return;
            }
            const err = targetAudio.error;
            if (!err) return;
            console.error('Audio element error:', err);
            isAudioBuffering = false;
            syncPlayPauseUI(false);
            isPlayPending = false;

            if (playPendingTimeout) {
                clearTimeout(playPendingTimeout);
                playPendingTimeout = null;
            }

            const currentTrack = (isStandalonePlayback && standaloneTrackList.length > 0)
            ? standaloneTrackList[standaloneTrackIndex]
            : allTracks[currentTrackIndex];
            const trackTitle = currentTrack ? (currentTrack.title || currentTrack.filename || 'Current track') : 'Audio track';
            const errorCode = err ? err.code : 0;

            // Fatal error codes:
            // 3 = MEDIA_ERR_DECODE (corrupted audio frame or decoding bitstream failure)
            // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED (unsupported codec, 404, or unreadable source)
            const isFatalDecodeError = (errorCode === 3 || errorCode === 4);

            // If native browser decoder fails (code 3 or 4) on a local stream, attempt 1 automatic FFmpeg transcode fallback
            const currentAttrSrc = targetAudio.getAttribute('src') || targetAudio.src || '';
            if (isFatalDecodeError && trackPlaybackRetryCount === 0 && currentAttrSrc.includes('php/api/stream.php') && !currentAttrSrc.includes('transcode=1')) {
                trackPlaybackRetryCount++;
                const transcodeSrc = currentAttrSrc + (currentAttrSrc.includes('?') ? '&' : '?') + 'transcode=1';
                console.info(`[AudioEngine] Native decode error (${errorCode}) on "${trackTitle}"; attempting FFmpeg transcode fallback...`);
                userExplicitlyPaused = false;
                targetAudio.src = transcodeSrc;
                try { targetAudio.load(); } catch (_) {}
                playAudio();
                return;
            }

            // Universal Web Audio Software Decoder Fallback (for 24-bit FLAC, ALAC, AIFF & unsupported Android/browser codecs)
            if (isFatalDecodeError && currentTrack && !isSoftwareDecoding) {
                alwaysSoftwareDecodeUrls.add(currentAttrSrc);
                alwaysSoftwareDecodeUrls.add(targetAudio.src);
                try {
                    targetAudio.pause();
                    targetAudio.removeAttribute('src');
                    targetAudio.load();
                } catch (_) {}
                console.info(`[AudioEngine] HTML5 <audio> decode failure (${errorCode}) on "${trackTitle}". Switching to Web Audio Software Decoder...`);
                logAudioPlaybackEvent('info', `Native decoder unsuited for "${trackTitle}" (code ${errorCode}). Playing via 32-bit Web Audio Software Engine.`);
                playWithSoftwareDecoder(currentTrack, targetAudio.currentTime || 0);
                return;
            }

            if (isFatalDecodeError || trackPlaybackRetryCount >= 1) {
                userExplicitlyPaused = true;
                consecutiveSkipCount++;
                const errorDesc = errorCode === 3
                    ? 'Corrupted audio stream or decoder failure'
                    : (errorCode === 4 ? 'Format or file source not supported' : 'Playback stream timed out');

                logAudioPlaybackEvent('error', `Track "${trackTitle}" decode failure (code ${errorCode}): ${errorDesc}`, {
                    src: targetAudio.src,
                    track: currentTrack
                });
                console.warn(`[AudioEngine] Permanent playback error on "${trackTitle}": ${errorDesc}. Halting retry loop.`);

                if (consecutiveSkipCount >= 3) {
                    pauseAudio();
                    logAudioPlaybackEvent('warn', 'Consecutive skip limit reached (3 tracks failed). Halting auto-skip.');
                    if (typeof showCachyToast === 'function') {
                        showCachyToast('Playback Halted', 'Multiple tracks failed to decode. Check Audio Diagnostics in Settings.', 'error');
                    }
                    return;
                }

                if (typeof showCachyToast === 'function') {
                    showCachyToast('Playback Error', `"${trackTitle}": ${errorDesc}. Skipping track...`, 'warning');
                }

                // Reset dirty media element so subsequent tracks start with a completely fresh decoder pipeline
                resetMediaElementForNewAudioContext();

                // If in playlist or more tracks available, gracefully skip to next track without rapid flapping
                setTimeout(() => {
                    const pool = displayedTracks.length > 0 ? displayedTracks : allTracks;
                    let currentIdxInPool = pool.findIndex(t => {
                        const cur = allTracks[currentTrackIndex];
                        if (!cur) return false;
                        if (cur.id && t.id) return t.id === cur.id;
                        if (cur.tid && t.tid) return t.tid === cur.tid;
                        return t.filename === cur.filename;
                    });
                    if (currentIdxInPool === pool.length - 1 && repeatMode === 'off') {
                        // End of playlist and repeat is off: cleanly stop
                        pauseAudio();
                        targetAudio.currentTime = 0;
                        if (progressBar) progressBar.style.width = '0%';
                        if (currentTimeEl) currentTimeEl.textContent = '0:00';
                        try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {}
                    } else {
                        nextTrack();
                    }
                }, 1200);
                return;
            }

            // For transient network hiccups (code 2), attempt at most 1 automatic retry
            if (errorCode === 2 && targetAudio.src && !userExplicitlyPaused && trackPlaybackRetryCount === 0) {
                trackPlaybackRetryCount++;
                const savedTime = targetAudio.currentTime || 0;
                const currentSrc = targetAudio.src;
                console.log(`[AudioEngine] Transient network error; attempting single recovery for "${trackTitle}" at ${savedTime}s...`);

                setTimeout(() => {
                    if (!userExplicitlyPaused) {
                        targetAudio.src = currentSrc;
                        targetAudio.load();
                        if (savedTime > 0) {
                            try { targetAudio.currentTime = savedTime; } catch (_) {}
                        }
                        targetAudio.play().catch(playErr => {
                            console.warn('[AudioEngine] Recovery retry failed:', playErr);
                            syncPlayPauseUI(false);
                            userExplicitlyPaused = true;
                            if (typeof showCachyToast === 'function') {
                                showCachyToast('Network Error', `Could not recover stream for "${trackTitle}".`, 'error');
                            }
                        });
                    }
                }, 1500);
            }
        });

        let lastPersistedTime = 0;
        targetAudio.addEventListener('timeupdate', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            if (isSoftwareDecoding) return;
            if (isDraggingScrubber) return;
            const cur = targetAudio.currentTime;
            let dur = targetAudio.duration;
            const currentTrack = (isStandalonePlayback && standaloneTrackList.length > 0)
            ? standaloneTrackList[standaloneTrackIndex]
            : allTracks[currentTrackIndex];
            if (!isFinite(dur) || isNaN(dur) || dur <= 0) {
                if (currentTrack && currentTrack.duration && isFinite(currentTrack.duration)) {
                    dur = Number(currentTrack.duration);
                }
            }
            updatePlaybackProgress(cur, dur);

            // Periodically persist playback timeframe (throttled to 1.0s deltas)
            // so closing or refreshing the program remembers the unfinished timeframe
            if (cur > 0 && Math.abs(cur - lastPersistedTime) >= 1.0) {
                lastPersistedTime = cur;
                if (!dur || isNaN(dur) || cur < (dur - 1)) {
                    try {
                        safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2));
                    } catch (_) {}
                }
            }

            // Dual-Buffer Gapless Playback Engine:
            // When current track hits 5 seconds before completion, asynchronously pre-load
            // and decode the header and initial bitstream of the next track into the secondary buffer
            checkAndPreloadNextTrack(cur, dur);
        });

        targetAudio.addEventListener('ended', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            if (typeof targetAudio._trackGeneration === 'number' && targetAudio._trackGeneration !== currentTrackGeneration) {
                console.log('[AudioEngine] Stale ended event discarded for superseded track generation');
                return;
            }
            try {
                safeStorage.removeItem('cachymusic_last_track_time');
            } catch (_) {}

            const curTime = targetAudio.currentTime || 0;
            const currentTrack = (isStandalonePlayback && standaloneTrackList.length > 0)
            ? standaloneTrackList[standaloneTrackIndex]
            : allTracks[currentTrackIndex];
            const trackDur = targetAudio.duration || (currentTrack ? (currentTrack.duration || 0) : 0);
            const trackTitle = currentTrack ? (currentTrack.title || currentTrack.filename || 'Current track') : 'Audio track';

            // Premature Ended Guard:
            // If the track ends within 3.0 seconds (or with >5s remaining on an established track),
            // this is an unexpected stream disconnect/hiccup or buffer underflow, NOT a finished song.
            if ((trackDur > 5 && curTime < 3.0) || curTime === 0) {
                console.warn(`[AudioEngine] Premature stream end detected at ${curTime.toFixed(2)}s / ${trackDur.toFixed(2)}s for "${trackTitle}".`);
                logAudioPlaybackEvent('warn', `Premature stream termination at ${curTime.toFixed(2)}s on "${trackTitle}"`);
                window.appendDebugTelemetry?.(`[WARN] Premature stream end at ${curTime.toFixed(2)}s / ${trackDur.toFixed(2)}s for "${trackTitle}". Attempting reload...`, 'warn');
                if (trackPlaybackRetryCount < 2) {
                    trackPlaybackRetryCount++;
                    setTimeout(() => {
                        if (!userExplicitlyPaused) {
                            try { targetAudio.load(); } catch (_) {}
                            playAudio();
                        }
                    }, 400);
                    return;
                } else {
                    pauseAudio();
                    showToast(`Playback paused on "${trackTitle}". Stream buffer interrupted.`);
                    return;
                }
            } else {
                window.appendDebugTelemetry?.(`[EVENT] Track finished naturally at ${curTime.toFixed(1)}s`);
            }

            if (sleepTimerMode === 'end') {
                pauseAudio();
                cancelSleepTimer(false);
                showToast('🌙 Sleep timer: End of track reached. Playback paused.');
                return;
            }

            if (repeatMode === 'one') {
                targetAudio.currentTime = 0;
                playAudio();
            } else {
                nextTrack();
            }
        });

        targetAudio.addEventListener('loadedmetadata', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            if (targetAudio.duration && !isNaN(targetAudio.duration)) {
                totalDurationEl.textContent = formatTime(targetAudio.duration);
                if (miniTotalDuration) miniTotalDuration.textContent = formatTime(targetAudio.duration);
                if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && isFinite(targetAudio.duration) && targetAudio.duration > 0) {
                    try {
                        navigator.mediaSession.setPositionState({
                            duration: Math.max(0, targetAudio.duration),
                            playbackRate: targetAudio.playbackRate || 1.0,
                            position: Math.max(0, Math.min(targetAudio.duration, targetAudio.currentTime || 0))
                        });
                    } catch (_) {}
                }
            }
            try {
                if (currentPlaybackSpeed !== 1.0) {
                    targetAudio.playbackRate = currentPlaybackSpeed;
                }
                targetAudio.preservesPitch = isPitchLockTempo;
                targetAudio.mozPreservesPitch = isPitchLockTempo;
                targetAudio.webkitPreservesPitch = isPitchLockTempo;
            } catch (_) {}
        });

        targetAudio.addEventListener('seeked', () => {
            if (targetAudio._isDisposed || targetAudio !== audio) return;
            if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && targetAudio.duration && isFinite(targetAudio.duration) && targetAudio.duration > 0) {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: Math.max(0, targetAudio.duration),
                        playbackRate: targetAudio.playbackRate || 1.0,
                        position: Math.max(0, Math.min(targetAudio.duration, targetAudio.currentTime || 0))
                    });
                } catch (_) {}
            }
        });
    }


    // --- Migrated Core Track Status & Session Methods ---
    function resolveTrackFormat(track) {
        if (!track) return '';
        let fmt = (track.format || '').toUpperCase().trim();
        if (!fmt || fmt === 'AUDIO') {
            const fname = track.filename || track.fullPath || '';
            const dotIdx = fname.lastIndexOf('.');
            if (dotIdx !== -1 && dotIdx < fname.length - 1) {
                fmt = fname.substring(dotIdx + 1).toUpperCase().trim();
            }
        }
        return fmt || 'PCM';
    }

    function updateSignalPathUi(track = allTracks[currentTrackIndex]) {
        // Always keep player deck button label strictly as "SPA"
        if (signalPathLabel) {
            signalPathLabel.textContent = 'SPA';
        }

        const curTheme = getActiveTheme();
        const isMobileViewport = typeof window !== 'undefined' && window.innerWidth <= 768;
        const isLightSurface = (curTheme === 'minimalist-light' || curTheme === 'brutalist-light' || curTheme === 'minimalist-warm' || (curTheme === 'default' && !isMobileViewport));
        const hasTrack = Boolean(track && allTracks.length > 0);
        const format = hasTrack ? resolveTrackFormat(track) : 'NONE';
        const isLossless = hasTrack && ['FLAC', 'WAV', 'ALAC', 'AIFF', 'APE', 'WV', 'DSD', 'DSF', 'PCM'].includes(format);

        // Determine active DSP & EQ stages honestly
        const hasPeq = !isPeqBypassed && Array.isArray(peqGains) && peqGains.some(g => Math.abs(g) > 0.05);
        const maxBoostDb = (!isPeqBypassed && Array.isArray(peqGains)) ? Math.max(0, ...peqGains) : 0;
        const activeStages = [];
        if (isSubsonic) activeStages.push('20Hz Subsonic');
        if (hasPeq) activeStages.push('10-Band PEQ');
        if (isBassBoost) activeStages.push('Bass');
        if (isVocalBoost) activeStages.push('Vocal');
        if (isTrebleBoost) activeStages.push('Treble');
        if (isAmpBoost || currentVolumeValue > 1.0) activeStages.push('Pre-Amp');
        if (isCrossfeed) activeStages.push('HRTF Crossfeed');
        if (isSurroundWidener) activeStages.push('Surround M/S');
        if (isAmbiophonics) activeStages.push('Ambiophonics');
        if (isPhaseInvert) activeStages.push('180° Phase');
        if (isMonoMix) activeStages.push('Mono Sum');
        if (isAgpEnabled) activeStages.push('AGP Guard');
        if (isLimiter) activeStages.push('Peak Limiter');
        if (isUltrasonic) activeStages.push(`Ultrasonic (${Math.round(ultrasonicCutoff / 1000)}kHz)`);
        if (isReplayGain) activeStages.push('ReplayGain');

        const dspActive = hasActiveDsp();
        const workletPrecisionStr = isPrecision64 ? '64-Bit Double-Float Worklet' : '32-Bit Fast-Float Biquad';
        const shortEngineLabel = isPrecision64 ? '64-BIT WORKLET' : '32-BIT FLOAT';

        // 1. Update Top Summary Badge, Description & Indicator Dot
        if (!hasTrack) {
            if (signalPathBadgeBtn) signalPathBadgeBtn.dataset.signalState = 'idle';
            if (auditQualityBadge) {
                auditQualityBadge.textContent = `IDLE (${shortEngineLabel} READY)`;
                auditQualityBadge.className = 'signalQualityBadge highPrecision';
            }
            if (auditQualityDesc) {
                auditQualityDesc.textContent = `No audio track loaded. Browser Web Audio decodes streams to 32-bit IEEE 754 float; DSP worklet is configured for ${isPrecision64 ? '64-bit double-precision' : '32-bit single-precision'} math.`;
            }
            const dotCol = isLightSurface ? '#475569' : '#94a3b8';
            if (deckSignalDot) deckSignalDot.style.color = dotCol;
            if (auditQualityDot) auditQualityDot.style.color = dotCol;
        } else if (isLossless && !hasPeq && !isBassBoost && !isVocalBoost && !isTrebleBoost && !isCrossfeed && !isSurroundWidener && !isAmbiophonics && !isPhaseInvert && !isMonoMix) {
            if (signalPathBadgeBtn) signalPathBadgeBtn.dataset.signalState = 'bit-perfect';
            if (auditQualityBadge) {
                auditQualityBadge.textContent = `LOSSLESS ${format} → ${shortEngineLabel}`;
                auditQualityBadge.className = 'signalQualityBadge bitPerfect';
            }
            if (auditQualityDesc) {
                auditQualityDesc.textContent = `Lossless ${format} source decoded by Web Audio into 32-bit IEEE 754 float with flat EQ bypass${isUltrasonic || ditherMode !== 'off' ? ` and ${workletPrecisionStr.toLowerCase()} output conditioning` : ''}.`;
            }
            const dotCol = isLightSurface ? '#059669' : '#10b981';
            if (deckSignalDot) deckSignalDot.style.color = dotCol;
            if (auditQualityDot) auditQualityDot.style.color = dotCol;
        } else if (isLossless) {
            if (signalPathBadgeBtn) signalPathBadgeBtn.dataset.signalState = 'dsp';
            if (auditQualityBadge) {
                auditQualityBadge.textContent = `LOSSLESS ${format} → ${isPrecision64 ? '64-BIT' : '32-BIT'} DSP`;
                auditQualityBadge.className = 'signalQualityBadge dspEnhanced';
            }
            if (auditQualityDesc) {
                auditQualityDesc.textContent = `Lossless ${format} source decoded to 32-bit IEEE 754 float and actively shaped through ${workletPrecisionStr} (${activeStages.join(', ') || 'DSP Active'}).`;
            }
            const dotCol = isLightSurface ? '#b45309' : '#fbbf24';
            if (deckSignalDot) deckSignalDot.style.color = dotCol;
            if (auditQualityDot) auditQualityDot.style.color = dotCol;
        } else {
            if (signalPathBadgeBtn) signalPathBadgeBtn.dataset.signalState = 'lossy';
            if (auditQualityBadge) {
                auditQualityBadge.textContent = `${format} LOSSY → ${dspActive ? (isPrecision64 ? '64-BIT DSP' : '32-BIT DSP') : '32-BIT DECODE'}`;
                auditQualityBadge.className = 'signalQualityBadge highPrecision';
            }
            if (auditQualityDesc) {
                auditQualityDesc.textContent = `Compressed ${format} stream decoded by browser into 32-bit IEEE 754 floating-point PCM${activeStages.length > 0 ? `, processed via ${workletPrecisionStr} (${activeStages.join(', ')})` : ' with flat EQ response'}.`;
            }
            const dotCol = isLightSurface ? '#0284c7' : '#38bdf8';
            if (deckSignalDot) deckSignalDot.style.color = dotCol;
            if (auditQualityDot) auditQualityDot.style.color = dotCol;
        }

        // 2. Update Detailed 4-Stage Signal Chain Breakdown in Modal
        const stageSourceEl = document.getElementById('auditStageSource');
        const stageDecodeEl = document.getElementById('auditStageDecode');
        const stageDspEl = document.getElementById('auditStageDsp');
        const stageOutputEl = document.getElementById('auditStageOutput');

        const currentRate = audioContext ? audioContext.sampleRate : ((track && track.sampleRate) ? getValidSampleRate(track.sampleRate) : 44100);
        const rateStr = currentRate >= 1000 ? `${(currentRate / 1000).toFixed(1)} kHz` : `${currentRate} Hz`;

        if (stageSourceEl) {
            if (!hasTrack) {
                stageSourceEl.textContent = 'Idle (No track loaded)';
            } else {
                const bd = track.bitDepth || (isLossless ? ((currentRate >= 88200) ? 24 : 16) : null);
                const br = track.bitrate ? `${track.bitrate} kbps` : '';
                const ch = track.channels === 1 ? 'Mono' : 'Stereo';
                stageSourceEl.textContent = [
                    `${format} (${isLossless ? 'Lossless' : 'Lossy'})`,
                    bd ? `${bd}-Bit` : '',
                    rateStr,
                    br,
                    ch
                ].filter(Boolean).join(' • ');
            }
        }

        if (stageDecodeEl) {
            stageDecodeEl.textContent = `32-Bit IEEE 754 Float PCM @ ${rateStr}`;
        }

        if (stageDspEl) {
            const stagesText = activeStages.length > 0 ? activeStages.join(' + ') : 'Flat Bypass';
            stageDspEl.textContent = `${workletPrecisionStr} (${stagesText})`;
        }

        const ditherLabel = ditherMode === 'shaped'
            ? 'Psychoacoustic Shaped (>18 kHz)'
            : (ditherMode === 'tpdf' ? 'TPDF Flat Dither' : 'Unshaped Truncation (Off)');
        const volPct = Math.round(currentVolumeValue * 100);
        const gainModeStr = isHardwareGain ? `Hardware DAC Bridge (${volPct}%)` : `Digital Gain (${volPct}%)`;

        if (stageOutputEl) {
            stageOutputEl.textContent = `${ditherLabel} • ${gainModeStr}`;
        }

        // 3. Update Metrics Cards (Headroom, Latency, Precision) & Settings Telemetry
        let maxTotalBoost = maxBoostDb;
        if (isBassBoost) maxTotalBoost = Math.max(maxTotalBoost, 3.8);
        if (isTrebleBoost) maxTotalBoost = Math.max(maxTotalBoost, 3.0);
        if (isVocalBoost) maxTotalBoost = Math.max(maxTotalBoost, 2.8);
        const preampAttenDb = maxTotalBoost > 0 ? -(maxTotalBoost * 0.70) : 0;
        const volDb = currentVolumeValue > 0 ? (20 * Math.log10(currentVolumeValue)) : -60;
        const netHeadroomDb = Math.max(0, -(preampAttenDb + Math.min(0, volDb)));
        if (auditMetricHeadroom) {
            if (maxTotalBoost > 0) {
                auditMetricHeadroom.textContent = `${preampAttenDb.toFixed(1)} dB Pre-Amp (${netHeadroomDb.toFixed(1)} dB Guard)`;
            } else {
                auditMetricHeadroom.textContent = `+${Math.max(0.6, netHeadroomDb).toFixed(1)} dB (${currentVolumeValue > 1.0 ? 'Amplified' : 'Unity Guard'})`;
            }
        }

        let latencyMs = bufferLatencyTarget === 'interactive' ? 15.0 : 100.0;
        if (audioContext) {
            const ctxLat = ((audioContext.baseLatency || 0) + (audioContext.outputLatency || 0)) * 1000;
            if (ctxLat > 0) latencyMs = ctxLat;
        }
        const latencyModeStr = bufferLatencyTarget === 'interactive' ? 'Low-Latency' : 'Stable Buffer';
        if (auditMetricLatency) {
            auditMetricLatency.textContent = `~${latencyMs.toFixed(1)} ms (${latencyModeStr})`;
        }

        const auditMetricPrecision = document.getElementById('auditMetricPrecision');
        const auditMetricPrecisionDesc = document.getElementById('auditMetricPrecisionDesc');
        if (auditMetricPrecision) {
            auditMetricPrecision.textContent = isPrecision64
                ? '32-Bit Decode / 64-Bit DSP'
                : '32-Bit IEEE 754 Float';
        }
        if (auditMetricPrecisionDesc) {
            auditMetricPrecisionDesc.textContent = isPrecision64
                ? 'Browser decodes audio to 32-bit float; AudioWorklet computes biquad filters and dithering in 64-bit double float.'
                : 'Browser decodes and processes all audio stages in standard 32-bit single-precision IEEE 754 floating point.';
        }

        // Sync Settings Tab Telemetry Grid
        const settingsDspEngineVal = document.getElementById('settingsDspEngineVal');
        const settingsDspHeadroomVal = document.getElementById('settingsDspHeadroomVal');
        const settingsDspLatencyVal = document.getElementById('settingsDspLatencyVal');
        const settingsDspEqVal = document.getElementById('settingsDspEqVal');

        if (settingsDspEngineVal) {
            settingsDspEngineVal.textContent = isPrecision64 ? '64-Bit Worklet / 32-Bit Decode' : '32-Bit IEEE 754 Float';
        }
        if (settingsDspHeadroomVal) {
            settingsDspHeadroomVal.textContent = maxBoostDb > 0 ? `${preampAttenDb.toFixed(1)} dB AGP Active` : '0.0 dBFS True-Peak';
        }
        if (settingsDspLatencyVal) {
            settingsDspLatencyVal.textContent = `~${latencyMs.toFixed(0)} ms (${latencyModeStr})`;
        }
        if (settingsDspEqVal) {
            settingsDspEqVal.textContent = activeStages.length > 0 ? activeStages.slice(0, 2).join(' + ') : 'Linear Bypass';
        }
    }


    function findTrackIndexBySavedState(pool) {
        if (!pool || pool.length === 0) return -1;
        const savedTid = safeStorage.getItem('cachymusic_last_track_tid');
        const savedPath = safeStorage.getItem('cachymusic_last_track_path');
        const savedFilename = safeStorage.getItem('cachymusic_last_track_filename');
        const savedId = safeStorage.getItem('cachymusic_last_track_id');
        const savedTitle = safeStorage.getItem('cachymusic_last_track_title');

        if (!savedTid && !savedPath && !savedFilename && !savedId && !savedTitle) {
            return -1;
        }

        // 1. Exact TID or ID match
        let idx = pool.findIndex(t => {
            if (savedTid && t.tid && t.tid.toString() === savedTid.toString()) return true;
            if (savedId && t.id && t.id.toString() === savedId.toString()) return true;
            return false;
        });
        if (idx !== -1) return idx;

        // 2. Exact fullPath match
        if (savedPath) {
            idx = pool.findIndex(t => t.fullPath && t.fullPath === savedPath);
            if (idx !== -1) return idx;
        }

        // 3. Filename match
        if (savedFilename) {
            idx = pool.findIndex(t => t.filename && t.filename.toLowerCase() === savedFilename.toLowerCase());
            if (idx !== -1) return idx;
        }

        // 4. Title match
        if (savedTitle) {
            idx = pool.findIndex(t => t.title && t.title.toLowerCase() === savedTitle.toLowerCase());
            if (idx !== -1) return idx;
        }

        return -1;
    }

    // Restore cached session state: active playlist and last played song (loaded in paused state)
    async function restoreSessionState() {
        const urlParams = new URLSearchParams(window.location.search);
        const reqTrack = urlParams.get('track');

        if (urlParams.get('tab') === 'playlists' || window.location.hash === '#playlists') {
            if (tabPlaylists) tabPlaylists.click();
        }

        // Restore active playlist if previously open and still exists
        const savedPlid = safeStorage.getItem('cachymusic_last_playlist_id');
        const savedPlName = safeStorage.getItem('cachymusic_last_playlist_name');
        if (savedPlid) {
            const matchedPl = playlists.find(p => p.plid == savedPlid);
            if (matchedPl) {
                await openPlaylist(matchedPl.plid, matchedPl.name || savedPlName);
            } else {
                try {
                    safeStorage.removeItem('cachymusic_last_playlist_id');
                    safeStorage.removeItem('cachymusic_last_playlist_name');
                } catch (_) {}
            }
        }

        if (allTracks.length === 0) return;

        // Determine target track to load (paused on boot)
        let targetIdx = 0;
        if (reqTrack !== null && !isNaN(parseInt(reqTrack, 10)) && allTracks[parseInt(reqTrack, 10)]) {
            targetIdx = parseInt(reqTrack, 10);
        } else {
            // First search within displayedTracks (if a playlist is active)
            const pool = (currentPlaylistId !== null && displayedTracks.length > 0) ? displayedTracks : allTracks;
            let foundPoolIdx = findTrackIndexBySavedState(pool);
            if (foundPoolIdx !== -1) {
                const tr = pool[foundPoolIdx];
                const masterIdx = allTracks.findIndex(t => (tr.tid && t.tid == tr.tid) || (tr.fullPath && t.fullPath === tr.fullPath) || (t.id == tr.id));
                targetIdx = masterIdx !== -1 ? masterIdx : 0;
            } else {
                // If not found in current playlist, check global allTracks
                let foundGlobalIdx = findTrackIndexBySavedState(allTracks);
                if (foundGlobalIdx !== -1) {
                    targetIdx = foundGlobalIdx;
                } else if (currentPlaylistId !== null && displayedTracks.length > 0) {
                    const firstPlTrack = displayedTracks[0];
                    const masterIdx = allTracks.findIndex(t => (firstPlTrack.tid && t.tid == firstPlTrack.tid) || (firstPlTrack.fullPath && t.fullPath === firstPlTrack.fullPath) || (t.id == firstPlTrack.id));
                    targetIdx = masterIdx !== -1 ? masterIdx : 0;
                } else {
                    targetIdx = 0;
                }
            }
        }

        // Retrieve remembered playback timeframe from previous session if track has not ended
        let savedTime = 0;
        try {
            const rawTime = safeStorage.getItem('cachymusic_last_track_time');
            if (rawTime !== null && !isNaN(parseFloat(rawTime))) {
                const parsed = parseFloat(rawTime);
                const targetTrack = allTracks[targetIdx];
                const trackDur = (targetTrack && targetTrack.duration) ? Number(targetTrack.duration) : 0;
                // Only resume if the song had not finished playing (< dur - 1)
                if (parsed > 0 && (!trackDur || parsed < (trackDur - 1))) {
                    savedTime = parsed;
                }
            }
        } catch (_) {}

        if (allTracks[targetIdx]) {
            await loadTrack(targetIdx, false, savedTime);
            if (isLyricsView) {
                updateLyricsDisplay(allTracks[targetIdx]);
            }
        }
    }


    function getValidSampleRate(rate) {
        const r = Number(rate);
        const validRates = [44100, 48000, 88200, 96000, 176400, 192000];
        if (validRates.includes(r)) return r;
        return 44100;
    }

    // Update DAC Stream & Hardware Sample Rate Status Indicator
    function updateDacStatusUi() {
        const currentTrack = (isStandalonePlayback && standaloneTrackList.length > 0)
            ? standaloneTrackList[standaloneTrackIndex]
            : allTracks[currentTrackIndex];
        updateSignalPathUi(currentTrack);
        if (!statDacStream) return;
        const currentRate = audioContext ? audioContext.sampleRate : ((currentTrack && currentTrack.sampleRate) ? getValidSampleRate(currentTrack.sampleRate) : 44100);
        const rateStr = currentRate >= 1000 ? `${(currentRate / 1000).toFixed(1)} kHz` : `${currentRate} Hz`;
        const bd = (currentTrack && currentTrack.bitDepth) || ((currentRate >= 88200) ? 24 : 16);
        const bitStr = `${bd}-BIT`;
        const nyquistKhz = (currentRate / 2000).toFixed(1).replace(/\.0$/, '');

        const curTheme = getActiveTheme();
        const isLightSurface = (curTheme === 'default' || curTheme === 'minimalist-light' || curTheme === 'brutalist-light' || curTheme === 'minimalist-warm');

        if (!hasActiveDsp()) {
            statDacStream.textContent = `BIT-PERFECT DIRECT (${bitStr} • ${rateStr} • ${nyquistKhz}kHz BANDWIDTH)`;
            statDacStream.style.color = isLightSurface ? '#047857' : '#00ff88';
            statDacStream.title = `Direct hardware stream matching ${bitStr} • ${rateStr} (${nyquistKhz} kHz Nyquist bandwidth) with zero downsampling and zero DSP coloration.`;
        } else {
            const activeDsp = [];
            if (isAmpBoost) activeDsp.push('AMP');
            if (isBassBoost) activeDsp.push('BASS');
            if (isVocalBoost) activeDsp.push('VOCAL');
            if (isTrebleBoost) activeDsp.push('TREBLE');
            if (isLimiter) activeDsp.push('LIMITER');
            const dspStr = activeDsp.length > 0 ? activeDsp.join('+') : 'ACTIVE';
            statDacStream.textContent = `STUDIO DSP (${dspStr} • ${bitStr} • ${rateStr} • ${nyquistKhz}kHz)`;
            statDacStream.style.color = isLightSurface ? '#9a3412' : '#ffaa00';
            statDacStream.title = `Processing through ${isPrecision64 ? '64-bit' : '32-bit'} floating-point Web Audio DSP stage at ${rateStr} (${nyquistKhz} kHz bandwidth).`;
        }
    }

    // Dynamic Audio Specifications Badge (Strict audio attributes, no fluff)
    function updateTrackBadgeUi(track) {
        if (!trackBadge || !track) return;
        const badgeParts = [];
        const fmt = resolveTrackFormat(track);
        if (fmt) {
            badgeParts.push(fmt);
        }
        const bd = track.bitDepth || ((track.sampleRate && track.sampleRate >= 88200) ? 24 : 16);
        if (bd) {
            badgeParts.push(`${bd}-Bit`);
        }
        if (track.sampleRate) {
            badgeParts.push(track.sampleRate >= 1000 ? `${(track.sampleRate / 1000).toFixed(1)} kHz` : `${track.sampleRate} Hz`);
        }
        if (track.bitrate) {
            badgeParts.push(`${track.bitrate} kbps`);
        }
        if (track.channels === 2) {
            badgeParts.push('Stereo');
        } else if (track.channels === 1) {
            badgeParts.push('Mono');
        } else if (track.channels) {
            badgeParts.push(`${track.channels} ch`);
        }
        trackBadge.textContent = badgeParts.length > 0 ? badgeParts.join(' • ') : 'AUDIO';
    }



    function updateVolumeIcon(vol) {
        let pathHtml = '';
        if (vol === 0 || (audio && audio.muted)) {
            pathHtml = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
        } else if (vol < 0.5) {
            pathHtml = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
        } else {
            pathHtml = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
        }

        if (volumeIcon) volumeIcon.innerHTML = pathHtml;
        const miniVolIcon = document.getElementById('miniVolumeIcon');
        if (miniVolIcon) miniVolIcon.innerHTML = pathHtml;
    }

    let lastPositionStateUpdate = 0;
    function updateMediaSessionPositionState(force = false) {
        if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
        const now = performance.now();
        if (!force && (now - lastPositionStateUpdate < 800)) return;
        lastPositionStateUpdate = now;
        try {
            const dur = isSoftwareDecoding ? (activeDecodedBuffer ? activeDecodedBuffer.duration : 0) : (audio ? audio.duration : 0);
            const pos = isSoftwareDecoding ? (softwarePlaybackOffset + (audioContext && !isSoftwarePaused ? (audioContext.currentTime - softwarePlaybackStartTime) : 0)) : (audio ? (audio.currentTime || 0) : 0);
            if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
                navigator.mediaSession.setPositionState({
                    duration: Math.max(0, dur),
                    playbackRate: currentPlaybackSpeed || 1.0,
                    position: Math.max(0, Math.min(dur, pos || 0))
                });
            }
        } catch (_) {}
    }

    function setupMediaSessionActionHandlers() {
        if (!('mediaSession' in navigator)) return;
        try {
            navigator.mediaSession.setActionHandler('play', () => { resumeAudio(); });
            navigator.mediaSession.setActionHandler('pause', () => { pauseAudio(); });
            navigator.mediaSession.setActionHandler('stop', () => { pauseAudio(); });
            navigator.mediaSession.setActionHandler('previoustrack', () => { playPrevTrack(); });
            navigator.mediaSession.setActionHandler('nexttrack', () => { playNextTrack(); });
            navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                const skip = (details && details.seekOffset) || 10;
                const cur = isSoftwareDecoding ? softwarePlaybackOffset : (audio ? audio.currentTime : 0);
                seekAudio(Math.max(0, cur - skip));
            });
            navigator.mediaSession.setActionHandler('seekforward', (details) => {
                const skip = (details && details.seekOffset) || 10;
                const cur = isSoftwareDecoding ? softwarePlaybackOffset : (audio ? audio.currentTime : 0);
                seekAudio(cur + skip);
            });
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details && details.seekTime !== undefined && !isNaN(details.seekTime)) {
                    seekAudio(details.seekTime);
                }
            });
        } catch (e) {
            console.warn('[MediaSession] Error setting action handlers:', e);
        }
    }

    // Attach top-level Player Core functions and state to window for cross-module accessibility
    if (typeof window !== "undefined") {
        try { window.activeLoadedMetadataHandler = activeLoadedMetadataHandler; } catch (_) {}
        try { window.attachAudioListeners = attachAudioListeners; } catch (_) {}
        try { window.cancelSoftwareProgressLoop = cancelSoftwareProgressLoop; } catch (_) {}
        try { window.checkAndPreloadNextTrack = checkAndPreloadNextTrack; } catch (_) {}
        try { window.consecutiveSkipCount = consecutiveSkipCount; } catch (_) {}
        try { window.currentPlayRequestId = currentPlayRequestId; } catch (_) {}
        try { window.currentTrackGeneration = currentTrackGeneration; } catch (_) {}
        try { window.debugModeActive = debugModeActive; } catch (_) {}
        try { window.executeGaplessHandoff = executeGaplessHandoff; } catch (_) {}
        try { window.findTrackIndexBySavedState = findTrackIndexBySavedState; } catch (_) {}
        try { window.getValidSampleRate = getValidSampleRate; } catch (_) {}
        try { window.initMprisBridge = initMprisBridge; } catch (_) {}
        try { window.isPlayPending = isPlayPending; } catch (_) {}
        try { window.lastPositionStateUpdate = lastPositionStateUpdate; } catch (_) {}
        try { window.lastSyncedPlayingState = lastSyncedPlayingState; } catch (_) {}
        try { window.loadTrack = loadTrack; } catch (_) {}
        try { window.nextTrack = nextTrack; } catch (_) {}
        try { window.updateMarqueeText = updateMarqueeText; } catch (_) {}
        try { window.recomputeMarquees = recomputeMarquees; } catch (_) {}
        try { window.onSoftwarePlaybackEnded = onSoftwarePlaybackEnded; } catch (_) {}
        try { window.pauseAudio = pauseAudio; } catch (_) {}
        try { window.pauseSoftwarePlayback = pauseSoftwarePlayback; } catch (_) {}
        try { window.peekNextTrackIndex = peekNextTrackIndex; } catch (_) {}
        try { window.playAudio = playAudio; } catch (_) {}
        try { window.playPendingTimeout = playPendingTimeout; } catch (_) {}
        try { window.playWithSoftwareDecoder = playWithSoftwareDecoder; } catch (_) {}
        try { window.prevTrack = prevTrack; } catch (_) {}
        try { window.resolveTrackFormat = resolveTrackFormat; } catch (_) {}
        try { window.restoreSessionState = restoreSessionState; } catch (_) {}
        try { window.resumeSoftwarePlayback = resumeSoftwarePlayback; } catch (_) {}
        try { window.seekSoftwarePlayback = seekSoftwarePlayback; } catch (_) {}
        try { window.setupMediaSessionActionHandlers = setupMediaSessionActionHandlers; } catch (_) {}
        try { window.startSoftwareBufferPlayback = startSoftwareBufferPlayback; } catch (_) {}
        try { window.startSoftwareProgressLoop = startSoftwareProgressLoop; } catch (_) {}
        try { window.stopSoftwarePlayback = stopSoftwarePlayback; } catch (_) {}
        try { window.syncPlayPauseUI = syncPlayPauseUI; } catch (_) {}
        try { window.togglePlayPause = togglePlayPause; } catch (_) {}
        try { window.trackPlaybackRetryCount = trackPlaybackRetryCount; } catch (_) {}
        try { window.updateDacStatusUi = updateDacStatusUi; } catch (_) {}
        try { window.updateMediaSessionPositionState = updateMediaSessionPositionState; } catch (_) {}
        try { window.updatePlaybackProgress = updatePlaybackProgress; } catch (_) {}
        try { window.updateRepeatUI = updateRepeatUI; } catch (_) {}
        try { window.updateSignalPathUi = updateSignalPathUi; } catch (_) {}
        try { window.updateTrackBadgeUi = updateTrackBadgeUi; } catch (_) {}
        try { window.updateVolumeIcon = updateVolumeIcon; } catch (_) {}
        try { window.userExplicitlyPaused = userExplicitlyPaused; } catch (_) {}
    }

    export {
        activeLoadedMetadataHandler,
        attachAudioListeners,
        cancelSoftwareProgressLoop,
        checkAndPreloadNextTrack,
        consecutiveSkipCount,
        currentPlayRequestId,
        currentTrackGeneration,
        debugModeActive,
        executeGaplessHandoff,
        exitStandalonePlayback,
        findTrackIndexBySavedState,
        getValidSampleRate,
        initMprisBridge,
        isPlayPending,
        lastPositionStateUpdate,
        lastSyncedPlayingState,
        loadStandaloneTrack,
        loadTrack,
        nextTrack,
        onSoftwarePlaybackEnded,
        pauseAudio,
        pauseSoftwarePlayback,
        peekNextTrackIndex,
        playAudio,
        playPendingTimeout,
        playWithSoftwareDecoder,
        prevTrack,
        resolveTrackFormat,
        restoreSessionState,
        resumeSoftwarePlayback,
        seekSoftwarePlayback,
        setupMediaSessionActionHandlers,
        startSoftwareBufferPlayback,
        startSoftwareProgressLoop,
        stopSoftwarePlayback,
        syncPlayPauseUI,
        togglePlayPause,
        trackPlaybackRetryCount,
        updateDacStatusUi,
        updateMediaSessionPositionState,
        updatePlaybackProgress,
        updateRepeatUI,
        updateSignalPathUi,
        updateTrackBadgeUi,
        updateVolumeIcon,
        userExplicitlyPaused
    };
