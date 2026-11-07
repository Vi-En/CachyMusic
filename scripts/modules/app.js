// CachyMusic - Application Orchestrator & Lifecycle Bootstrap
import './utils.js';
import './state.js';
import './ui-elements.js';
import './themes.js';
import './audio-engine.js';
import './player-core.js';
import './library.js';

// Dynamic Tier 3 Module Loaders (Visualizer, Lyrics, P2P/Soulseek, Settings)
let visualizerPromise = null;
function getVisualizerModule() {
    if (!visualizerPromise) {
        visualizerPromise = import('./visualizer.js').then(mod => {
            if (typeof window !== 'undefined') {
                Object.assign(window, mod);
            }
            if (typeof mod.setupVisualizerMode === 'function') {
                mod.setupVisualizerMode();
            }
            if (typeof mod.setupCanvas === 'function') {
                mod.setupCanvas();
            }
            if (typeof mod.startVisualizerLoop === 'function') {
                mod.startVisualizerLoop();
            }
            return mod;
        }).catch(err => {
            console.warn('Failed to load visualizer.js', err);
            visualizerPromise = null;
        });
    }
    return visualizerPromise;
}

let lyricsPromise = null;
function getLyricsModule() {
    if (!lyricsPromise) {
        lyricsPromise = import('./lyrics.js').then(mod => {
            if (typeof window !== 'undefined') {
                Object.assign(window, mod);
            }
            return mod;
        }).catch(err => {
            console.warn('Failed to load lyrics.js', err);
            lyricsPromise = null;
        });
    }
    return lyricsPromise;
}

let p2pPromise = null;
function getP2pModule() {
    if (!p2pPromise) {
        p2pPromise = import('./p2p.js').then(mod => {
            if (typeof window !== 'undefined') {
                Object.assign(window, mod);
            }
            if (typeof mod.initSoulseekEventListeners === 'function') {
                mod.initSoulseekEventListeners();
            }
            return mod;
        }).catch(err => {
            console.warn('Failed to load p2p.js', err);
            p2pPromise = null;
        });
    }
    return p2pPromise;
}

let settingsPromise = null;
function getSettingsModule() {
    if (!settingsPromise) {
        settingsPromise = import('./settings.js').then(mod => {
            if (typeof window !== 'undefined') {
                Object.assign(window, mod);
            }
            return mod;
        }).catch(err => {
            console.warn('Failed to load settings.js', err);
            settingsPromise = null;
        });
    }
    return settingsPromise;
}

if (typeof window !== 'undefined') {
    window.getVisualizerModule = getVisualizerModule;
    window.getLyricsModule = getLyricsModule;
    window.getP2pModule = getP2pModule;
    window.getSettingsModule = getSettingsModule;
    window.toggleMetadataPanel = toggleMetadataPanel;
    window.toggleTracklistPanel = toggleTracklistPanel;

    window.setupVisualizerMode = function() {
        getVisualizerModule().then(m => m && m.setupVisualizerMode && m.setupVisualizerMode());
    };
    window.setVisualizerMode = function(mode) {
        getVisualizerModule().then(m => m && m.setVisualizerMode && m.setVisualizerMode(mode));
    };
    window.startVisualizerLoop = function() {
        getVisualizerModule().then(m => m && m.startVisualizerLoop && m.startVisualizerLoop());
    };
    window.setupCanvas = function() {
        getVisualizerModule().then(m => m && m.setupCanvas && m.setupCanvas());
    };
    window.toggleLyricsView = function(forcedState) {
        getLyricsModule().then(m => m && m.toggleLyricsView && m.toggleLyricsView(forcedState));
    };
    window.updateLyricsDisplay = function(track) {
        if (isLyricsView) {
            getLyricsModule().then(m => m && m.updateLyricsDisplay && m.updateLyricsDisplay(track));
        }
    };
    window.updateActiveLyric = function(time) {
        if (isLyricsView) {
            getLyricsModule().then(m => m && m.updateActiveLyric && m.updateActiveLyric(time));
        }
    };
    window.openSleepTimerModal = function() {
        getSettingsModule().then(m => m && m.openSleepTimerModal && m.openSleepTimerModal());
    };
    window.closeSleepTimerModal = function() {
        getSettingsModule().then(m => m && m.closeSleepTimerModal && m.closeSleepTimerModal());
    };
    window.openSignalPathModal = function() {
        getSettingsModule().then(m => m && m.openSignalPathModal && m.openSignalPathModal());
    };
    window.closeSignalPathModal = function() {
        getSettingsModule().then(m => m && m.closeSignalPathModal && m.closeSignalPathModal());
    };
    window.showThemeLoadingOverlay = function(name, sub) {
        getSettingsModule().then(m => m && m.showThemeLoadingOverlay && m.showThemeLoadingOverlay(name, sub));
    };
    window.updateDebugHudState = function() {
        getSettingsModule().then(m => m && m.updateDebugHudState && m.updateDebugHudState());
    };
    window.setupPwaInstallPrompt = function() {
        getP2pModule().then(m => m && m.setupPwaInstallPrompt && m.setupPwaInstallPrompt());
    };
    window.setupDownloadWorkspace = function() {
        getP2pModule().then(m => m && m.setupDownloadWorkspace && m.setupDownloadWorkspace());
    };
}

    // Toggle Collapsible / Sliding Metadata Inspector Panel
    function toggleMetadataPanel(forcedState) {
        if (window.innerWidth <= 768) {
            // Mobile View: toggle directly between playerDeck and settingsPanel (Metadata Inspector)
            const isInfoActive = (infoPanelEl && infoPanelEl.classList.contains('mobileActive')) || document.body.classList.contains('mobile-tab-info');
            if (isInfoActive) {
                switchWorkspace('player', 'playerDeck');
            } else {
                switchWorkspace('player', 'settingsPanel');
            }
            return;
        }

        const isCollapsed = document.body.classList.contains('metadata-collapsed');
        const willCollapse = (forcedState !== undefined) ? !forcedState : !isCollapsed;

        document.body.classList.toggle('metadata-collapsed', willCollapse);
        if (metadataToggleBtn) {
            metadataToggleBtn.classList.toggle('active', !willCollapse);
            metadataToggleBtn.setAttribute('aria-pressed', String(!willCollapse));
            metadataToggleBtn.setAttribute('title', willCollapse ? 'Expand Metadata Inspector (I)' : 'Collapse Metadata Inspector (I)');
        }

        try {
            safeStorage.setItem('cachymusic_metadata_visible', willCollapse ? 'false' : 'true');
        } catch (_) {}
    }


    // Toggle Collapsible / Sliding Tracklist Panel (Desktop Zen Stage)
    function toggleTracklistPanel(forcedState) {
        if (window.innerWidth <= 768) {
            const isTracksActive = (trackListPanelEl && trackListPanelEl.classList.contains('mobileActive')) || document.body.classList.contains('mobile-tab-tracks');
            if (isTracksActive) {
                switchWorkspace('player', 'playerDeck');
            } else {
                switchWorkspace('player', 'trackListPanel');
            }
            return;
        }

        const isCollapsed = document.body.classList.contains('tracklist-collapsed');
        const willCollapse = (forcedState !== undefined) ? !forcedState : !isCollapsed;

        document.body.classList.toggle('tracklist-collapsed', willCollapse);
        const tracklistToggleBtn = document.getElementById('tracklistToggleBtn');
        if (tracklistToggleBtn) {
            tracklistToggleBtn.classList.toggle('active', !willCollapse);
            tracklistToggleBtn.setAttribute('aria-pressed', String(!willCollapse));
            tracklistToggleBtn.setAttribute('title', willCollapse ? 'Expand Tracklist Panel (T)' : 'Collapse Tracklist Panel (T)');
        }

        try {
            safeStorage.setItem('cachymusic_tracklist_visible', willCollapse ? 'false' : 'true');
        } catch (_) {}
    }

    async function init() {
        if (isInitialized) return;
        isInitialized = true;

        setupEventListeners();
        getVisualizerModule();
        if (currentWorkspace === 'player') {
            const urlParams = new URLSearchParams(window.location.search);
            const initPanel = urlParams.get('panel') || 'playerDeck';
            if (window.innerWidth <= 768 || urlParams.get('panel')) {
                switchWorkspace('player', initPanel);
            }
        }
        setupDspControls();
        initPeqWorkstation();
        setupNeutronSettingsControls();
        checkHardwareGainStatus();
        setVolume(currentVolumeValue, true);
        await loadPlaylists();

        // Restore saved directory or cached library on startup
        const savedDir = (safeStorage.getItem('cachymusic_last_directory') || '').trim();
        const savedMode = (safeStorage.getItem('cachymusic_directory_mode') || '').trim();
        if (savedDir) {
            if (folderPathInput) folderPathInput.value = savedDir;
            const sInput = document.getElementById('settingsTabFolderPathInput');
            if (sInput) sInput.value = savedDir;
        }

        // 1. Check Android Native Bridge saved library first (on APK)
        if (window.AndroidBridge && typeof window.AndroidBridge.getSavedLibraryJson === 'function') {
            try {
                const rawJson = window.AndroidBridge.getSavedLibraryJson();
                if (rawJson) {
                    const parsed = JSON.parse(rawJson);
                    if (parsed && Array.isArray(parsed.tracks) && parsed.tracks.length > 0) {
                        allTracks = parsed.tracks;
                        const dirName = parsed.directory || savedDir || 'Music Folder';
                        if (folderPathInput) folderPathInput.value = dirName;
                        const sInput = document.getElementById('settingsTabFolderPathInput');
                        if (sInput) sInput.value = dirName;
                        try { safeStorage.setItem('cachymusic_last_directory', dirName); } catch (_) {}
                        applySearchAndSort();
                        setScanStatus(`Restored ${allTracks.length} tracks from "${dirName}".`, false);
                    }
                }
            } catch (err) {
                console.warn('AndroidBridge saved library restore error:', err);
            }
        }

        // 2. If not restored from AndroidBridge and not a pure browser-blob directory, try scanning saved server directory
        if (allTracks.length === 0 && savedMode !== 'browser_idb') {
            await scanDirectory(savedDir, false, true);
        }

        // 3. If still empty, check localStorage cached Android tracks
        if (allTracks.length === 0) {
            try {
                const cachedRaw = safeStorage.getItem('cachymusic_android_tracks');
                if (cachedRaw) {
                    const cached = JSON.parse(cachedRaw);
                    if (Array.isArray(cached) && cached.length > 0) {
                        allTracks = cached;
                        applySearchAndSort();
                        setScanStatus(`Restored ${cached.length} tracks from saved library.`, false);
                    }
                }
            } catch (err) {
                console.warn('Error restoring cached tracks:', err);
            }
        }

        // 4. If still empty, check IndexedDB saved library (browser folder picker / local files)
        if (allTracks.length === 0) {
            const idbLib = await loadLibraryFromIndexedDB();
            if (idbLib && Array.isArray(idbLib.tracks) && idbLib.tracks.length > 0) {
                allTracks = idbLib.tracks;
                if (idbLib.directory) {
                    if (folderPathInput) folderPathInput.value = idbLib.directory;
                    const sInput = document.getElementById('settingsTabFolderPathInput');
                    if (sInput) sInput.value = idbLib.directory;
                    try { safeStorage.setItem('cachymusic_last_directory', idbLib.directory); } catch (_) {}
                }
                applySearchAndSort();
                setScanStatus(`Restored ${allTracks.length} tracks from "${idbLib.directory || 'Saved Folder'}".`, false);
            }
        }

        updateEmptyPlayerState();
        await restoreSessionState();

        // Restore saved metadata panel state (persisted across sessions)
        try {
            const savedMetaVisible = safeStorage.getItem('cachymusic_metadata_visible');
            if (savedMetaVisible === 'false' && window.innerWidth > 768) {
                toggleMetadataPanel(false);
            }
        } catch (_) {}

        initMprisBridge();
    }


    // Setup All Event Handlers
    function setupEventListeners() {
        if (visPillBtns && visPillBtns.length > 0) {
            visPillBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    getVisualizerModule().then(m => m && m.setVisualizerMode && m.setVisualizerMode(btn.dataset.mode));
                });
            });
        }
        if (visModeBtns && visModeBtns.length > 0) {
            visModeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    getVisualizerModule().then(m => m && m.setVisualizerMode && m.setVisualizerMode(btn.dataset.mode));
                });
            });
        }
        if (visualizerDock) {
            visualizerDock.addEventListener('click', () => {
                getVisualizerModule();
            });
        }
        if (turntableCenterCanvas) {
            turntableCenterCanvas.addEventListener('click', () => {
                getVisualizerModule();
            });
        }

        if (metadataToggleBtn) {
            metadataToggleBtn.addEventListener('click', () => toggleMetadataPanel());
        }

        if (lyricsToggleBtn) {
            lyricsToggleBtn.addEventListener('click', () => toggleLyricsView());
        }

        const tracklistToggleBtn = document.getElementById('tracklistToggleBtn');
        if (tracklistToggleBtn) {
            tracklistToggleBtn.addEventListener('click', () => toggleTracklistPanel());
        }

        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => {
                togglePlayPause();
                playPauseBtn.blur();
            });
        }
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                prevTrack();
                prevBtn.blur();
            });
            ['touchend', 'pointerup'].forEach(evt => {
                prevBtn.addEventListener(evt, () => prevBtn.blur(), { passive: true });
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                nextTrack();
                nextBtn.blur();
            });
            ['touchend', 'pointerup'].forEach(evt => {
                nextBtn.addEventListener(evt, () => nextBtn.blur(), { passive: true });
            });
        }

        if (shuffleBtn) {
            shuffleBtn.addEventListener('click', () => {
                isShuffle = !isShuffle;
                shuffleBtn.classList.toggle('active', isShuffle);
                shuffleBtn.setAttribute('title', isShuffle ? 'Shuffle Active' : 'Toggle Shuffle');
                shuffleBtn.blur();
            });
        }

        if (shufflePlayBtn) {
            shufflePlayBtn.addEventListener('click', () => {
                isShuffle = true;
                if (shuffleBtn) {
                    shuffleBtn.classList.add('active');
                    shuffleBtn.setAttribute('title', 'Shuffle Active');
                }
                nextTrack();
                shufflePlayBtn.blur();
            });
        }

        if (repeatBtn) {
            repeatBtn.addEventListener('click', () => {
                if (repeatMode === 'all') {
                    repeatMode = 'one';
                } else if (repeatMode === 'one') {
                    repeatMode = 'off';
                } else {
                    repeatMode = 'all';
                }
                updateRepeatUI();
                repeatBtn.blur();
            });
        }

        // Continuous Native Media Event Synchronization
        attachAudioListeners(audio);

        const ensureContextRunning = () => {
            if (!audioContext || audioContext.state === 'closed') {
                initAudioContext();
            } else if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
        };
        ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evt => {
            window.addEventListener(evt, ensureContextRunning, { passive: true });
        });

        // Remember playback position of currently playing track when window closes / navigates away
        function persistCurrentPlaybackTimeOnExit() {
            if (!audio) return;
            try {
                const cur = audio.currentTime;
                const dur = audio.duration;
                if (cur > 0 && (!dur || isNaN(dur) || cur < (dur - 1))) {
                    safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2));
                } else {
                    safeStorage.removeItem('cachymusic_last_track_time');
                }
            } catch (_) {}
        }
        window.addEventListener('beforeunload', persistCurrentPlaybackTimeOnExit);
        window.addEventListener('pagehide', persistCurrentPlaybackTimeOnExit);

        // MediaSession API Integration (Explicit OS & Browser Media Control Integration)
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.setActionHandler('play', () => {
                    if (isPlaying && !audio.paused) return; // Prevent echo loop
                    userExplicitlyPaused = false;
                    playAudio(true);
                });
                navigator.mediaSession.setActionHandler('pause', () => {
                    if (!isPlaying && audio.paused) return; // Prevent echo loop
                    userExplicitlyPaused = true;
                    pauseAudio();
                });
                navigator.mediaSession.setActionHandler('stop', () => {
                    if (!isPlaying && audio.paused) return; // Prevent echo loop
                    userExplicitlyPaused = true;
                    pauseAudio();
                });
                navigator.mediaSession.setActionHandler('previoustrack', () => {
                    userExplicitlyPaused = false;
                    prevTrack();
                });
                navigator.mediaSession.setActionHandler('nexttrack', () => {
                    userExplicitlyPaused = false;
                    nextTrack();
                });
                navigator.mediaSession.setActionHandler('seekto', (details) => {
                    if (details.seekTime !== undefined && !isNaN(details.seekTime)) {
                        audio.currentTime = details.seekTime;
                    }
                });
                navigator.mediaSession.setActionHandler('seekforward', (details) => {
                    const skip = details.seekOffset || 10;
                    if (audio.duration && !isNaN(audio.duration)) {
                        audio.currentTime = Math.min(audio.duration, audio.currentTime + skip);
                    }
                });
                navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                    const skip = details.seekOffset || 10;
                    audio.currentTime = Math.max(0, audio.currentTime - skip);
                });
            } catch (err) {
                console.warn('MediaSession handler registration:', err);
            }
        }

        // Keep OS media session locked as paused when tab is hidden while paused
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && (userExplicitlyPaused || audio.paused)) {
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'paused';
                }
            }
        });

        // Initial Repeat UI sync
        updateRepeatUI();



        // Scrubber Dragging & Seeking (Mouse & Touch) - Defer audio.currentTime to mouseup/touchend
        let pendingSeekPct = null;

        function getClientX(e) {
            if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
            if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
            return e.clientX;
        }

        function updateScrubberVisual(e) {
            const rect = progressCon.getBoundingClientRect();
            if (!rect || rect.width <= 0) return;
            const clientX = getClientX(e);
            if (typeof clientX !== 'number' || isNaN(clientX) || !isFinite(clientX)) return;
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            if (isNaN(pct) || !isFinite(pct)) return;
            pendingSeekPct = pct;
            progressBar.style.width = `${pct * 100}%`;
            const dur = (isSoftwareDecoding && activeDecodedBuffer)
                ? activeDecodedBuffer.duration
                : (audio.duration || ((allTracks[currentTrackIndex] && allTracks[currentTrackIndex].duration) || 0));
            if (dur && !isNaN(dur) && isFinite(dur)) {
                currentTimeEl.textContent = formatTime(pct * dur);
            }
        }

        function commitSeek() {
            if (pendingSeekPct !== null && typeof pendingSeekPct === 'number' && !isNaN(pendingSeekPct) && isFinite(pendingSeekPct)) {
                if (isSoftwareDecoding) {
                    const totalDur = activeDecodedBuffer ? activeDecodedBuffer.duration : ((allTracks[currentTrackIndex] && allTracks[currentTrackIndex].duration) || 0);
                    if (totalDur > 0) {
                        const targetSec = Math.max(0, Math.min(totalDur, pendingSeekPct * totalDur));
                        seekSoftwarePlayback(targetSec);
                    }
                } else if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
                    const targetSec = Math.max(0, Math.min(audio.duration, pendingSeekPct * audio.duration));
                    if (!isNaN(targetSec) && isFinite(targetSec)) {
                        audio.currentTime = targetSec;
                        try {
                            const cur = audio.currentTime;
                            const dur = audio.duration;
                            if (cur > 0 && cur < dur - 1) {
                                safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2));
                            }
                        } catch (_) {}
                    }
                }
            }
            pendingSeekPct = null;
            isDraggingScrubber = false;
        }

        const progressHoverTooltip = document.getElementById('progressHoverTooltip');

        progressCon.addEventListener('mousedown', (e) => {
            isDraggingScrubber = true;
            progressCon.classList.add('dragging');
            updateScrubberVisual(e);
        });

        window.addEventListener('mousemove', (e) => {
            if (isDraggingScrubber) {
                updateScrubberVisual(e);
            }
        });

        window.addEventListener('mouseup', () => {
            if (isDraggingScrubber) {
                commitSeek();
                progressCon.classList.remove('dragging');
            }
        });

        progressCon.addEventListener('touchstart', (e) => {
            isDraggingScrubber = true;
            progressCon.classList.add('dragging');
            updateScrubberVisual(e);
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (isDraggingScrubber) {
                updateScrubberVisual(e);
            }
        }, { passive: true });

        window.addEventListener('touchend', () => {
            if (isDraggingScrubber) {
                commitSeek();
                progressCon.classList.remove('dragging');
            }
        });

        window.addEventListener('touchcancel', () => {
            if (isDraggingScrubber) {
                pendingSeekPct = null;
                isDraggingScrubber = false;
                progressCon.classList.remove('dragging');
            }
        });

        let cachedProgressRect = null;
        let isHoverPending = false;
        progressCon.addEventListener('mouseenter', () => {
            cachedProgressRect = progressCon.getBoundingClientRect();
        });
        progressCon.addEventListener('mousemove', (e) => {
            if (isHoverPending) return;
            isHoverPending = true;
            const clientX = getClientX(e);
            requestAnimationFrame(() => {
                isHoverPending = false;
                if (!cachedProgressRect) cachedProgressRect = progressCon.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (clientX - cachedProgressRect.left) / cachedProgressRect.width));
                progressHover.style.width = `${pct * 100}%`;
                if (progressHoverTooltip) {
                    const totalDur = (audio.duration && !isNaN(audio.duration) && audio.duration > 0)
                        ? audio.duration
                        : ((allTracks[currentTrackIndex] && allTracks[currentTrackIndex].duration) || 0);
                    if (totalDur > 0) {
                        progressHoverTooltip.textContent = formatTime(pct * totalDur);
                        progressHoverTooltip.style.left = `${pct * 100}%`;
                        progressHoverTooltip.style.opacity = '1';
                    }
                }
            });
        }, { passive: true });

        progressCon.addEventListener('mouseleave', () => {
            cachedProgressRect = null;
            isHoverPending = false;
            progressHover.style.width = '0%';
            if (progressHoverTooltip) {
                progressHoverTooltip.style.opacity = '0';
            }
        });

        // Mobile Viewport Navigation Switcher (Instant 0ms Pointerdown Fast-Path)
        const mobileTabBtns = document.querySelectorAll('.mobileTabBtn');
        mobileTabBtns.forEach(btn => {
            bindFastAction(btn, () => {
                const target = btn.dataset.target;
                if (target === 'soulseekWorkspace') {
                    switchWorkspace('soulseek');
                } else if (target === 'downloadWorkspace') {
                    switchWorkspace('download');
                } else if (target === 'settingsWorkspace') {
                    switchWorkspace('settings');
                } else {
                    switchWorkspace('player', target);
                }
            });
        });

        // Viewport Resize Synchronizer: Smooth transition between Desktop 3-column & Mobile 1-panel mode
        let lastInnerWidth = window.innerWidth;
        window.addEventListener('resize', () => {
            const currentW = window.innerWidth;
            if ((lastInnerWidth <= 768 && currentW > 768) || (lastInnerWidth > 768 && currentW <= 768)) {
                if (currentWorkspace === 'player') {
                    if (currentW <= 768) {
                        const activeMobile = document.querySelector('.panel.mobileActive');
                        const target = activeMobile ? (activeMobile.classList.contains('trackListPanel') ? 'trackListPanel' : activeMobile.classList.contains('settingsPanel') ? 'settingsPanel' : 'playerDeck') : 'playerDeck';
                        switchWorkspace('player', target);
                    } else {
                        switchWorkspace('player');
                    }
                }
            }
            lastInnerWidth = currentW;
        }, { passive: true });

        // Volume Deck & Scroll Control
        const volumeDeck = document.querySelector('.volumeDeck');

        function handleVolumeWheel(e) {
            e.preventDefault();
            // Determine scroll direction (supports vertical wheel & horizontal scroll / trackpad)
            const delta = e.deltaY !== 0 ? -e.deltaY : e.deltaX;
            if (delta === 0) return;

            // 5% step normally, 1% fine step if Shift key is held
            const step = (e.shiftKey ? 0.01 : 0.05) * (delta > 0 ? 1 : -1);
            let targetVol = Math.round((currentVolumeValue + step) * 100) / 100;
            targetVol = Math.max(0, Math.min(1.5, targetVol));

            setVolume(targetVol, true);
        }

        if (volumeDeck) {
            volumeDeck.addEventListener('wheel', handleVolumeWheel, { passive: false });
        } else if (volumeSlider) {
            volumeSlider.addEventListener('wheel', handleVolumeWheel, { passive: false });
        }

        volumeSlider.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            setVolume(vol, false);
        });

        muteBtn.addEventListener('click', () => {
            audio.muted = !audio.muted;
            if (audio.muted) {
                volumeLevel.textContent = '0%';
                updateVolumeIcon(0);
                if (isHardwareGain) {
                    dispatchHardwareVolume(0);
                }
            } else {
                setVolume(currentVolumeValue, true);
            }
        });

        // Search Input (Debounced 80ms for fluid typing without layout stutter)
        let searchDebounceTimer = null;
        trackSearch.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                applySearchAndSort();
            }, 80);
        });

        // Sort Select
        if (sortSelect) {
            sortSelect.value = currentSort;
            sortSelect.addEventListener('change', (e) => {
                currentSort = e.target.value;
                try {
                    safeStorage.setItem('cachymusic_track_sort', currentSort);
                } catch (_) {}
                applySearchAndSort();
            });
        }

        // Main Tracks Refresh Button
        if (refreshTracksBtn) {
            refreshTracksBtn.addEventListener('click', async () => {
                refreshTracksBtn.textContent = 'REFRESHING...';
                refreshTracksBtn.disabled = true;
                dismissedTracksMap.clear();
                updateRestoreBtnUi();
                const path = (folderPathInput && folderPathInput.value.trim()) 
                    ? folderPathInput.value.trim() 
                    : (safeStorage.getItem('cachymusic_last_directory') || '');
                await scanDirectory(path);
                refreshTracksBtn.textContent = 'REFRESHED';
                setTimeout(() => {
                    refreshTracksBtn.textContent = 'REFRESH';
                    refreshTracksBtn.disabled = false;
                }, 1200);
            });
        }

        // Restore Removed Main Tracks
        if (restoreTracksBtn) {
            restoreTracksBtn.addEventListener('click', () => {
                const count = dismissedTracksMap.size;
                if (count === 0) return;
                for (const [key, item] of dismissedTracksMap.entries()) {
                    const alreadyExists = allTracks.some(t => (item.track.tid && t.tid == item.track.tid) || (item.track.fullPath && t.fullPath === item.track.fullPath) || (t.id == item.track.id));
                    if (!alreadyExists) {
                        const insertIdx = Math.min(item.originalIndex ?? allTracks.length, allTracks.length);
                        allTracks.splice(insertIdx, 0, item.track);
                    }
                }
                dismissedTracksMap.clear();
                applySearchAndSort();
                updateRestoreBtnUi();
                showToast(`Restored ${count} track${count === 1 ? '' : 's'} to list.`);
            });
        }

        // Quick New Playlist Shortcut from Library Toolbar
        if (quickNewPlaylistBtn) {
            quickNewPlaylistBtn.addEventListener('click', () => {
                tabPlaylists.click();
                setTimeout(() => {
                    if (newPlaylistInput) {
                        newPlaylistInput.focus();
                        newPlaylistInput.select();
                    }
                }, 100);
            });
        }


        // Library vs Playlists vs Up Next Queue Tabs
        const quickFormatFilterBarEl = document.getElementById('quickFormatFilterBar');
        const libraryToolsToggleBtnEl = document.getElementById('libraryToolsToggleBtn');
        const libraryToolsChevronEl = document.getElementById('libraryToolsChevron');

        if (libraryToolsToggleBtnEl && libraryControls) {
            libraryToolsToggleBtnEl.addEventListener('click', () => {
                const isCollapsed = libraryControls.classList.toggle('mobileCollapsed');
                libraryToolsToggleBtnEl.classList.toggle('active', !isCollapsed);
                libraryToolsToggleBtnEl.setAttribute('aria-expanded', String(!isCollapsed));
                if (libraryToolsChevronEl) {
                    libraryToolsChevronEl.textContent = isCollapsed ? '▾' : '▴';
                }
            });
        }

        tabLibrary.addEventListener('click', () => {
            tabLibrary.classList.add('active');
            tabPlaylists.classList.remove('active');
            if (tabQueue) tabQueue.classList.remove('active');
            trackList.style.display = 'flex';
            playlistsView.style.display = 'none';
            if (queueView) queueView.style.display = 'none';
            if (quickFormatFilterBarEl) quickFormatFilterBarEl.style.display = 'flex';
            if (currentPlaylistId) {
                playlistBanner.style.display = 'flex';
                libraryControls.style.display = 'none';
                if (libraryToolsToggleBtnEl) libraryToolsToggleBtnEl.style.display = 'none';
            } else {
                playlistBanner.style.display = 'none';
                libraryControls.style.display = 'flex';
                if (libraryToolsToggleBtnEl) libraryToolsToggleBtnEl.style.display = '';
            }
        });

        tabPlaylists.addEventListener('click', () => {
            tabPlaylists.classList.add('active');
            tabLibrary.classList.remove('active');
            if (tabQueue) tabQueue.classList.remove('active');
            trackList.style.display = 'none';
            libraryControls.style.display = 'none';
            if (quickFormatFilterBarEl) quickFormatFilterBarEl.style.display = 'none';
            playlistBanner.style.display = 'none';
            if (queueView) queueView.style.display = 'none';
            playlistsView.style.display = 'flex';
            renderPlaylistsView();
        });

        if (tabQueue) {
            tabQueue.addEventListener('click', () => {
                tabQueue.classList.add('active');
                tabLibrary.classList.remove('active');
                tabPlaylists.classList.remove('active');
                trackList.style.display = 'none';
                libraryControls.style.display = 'none';
                if (quickFormatFilterBarEl) quickFormatFilterBarEl.style.display = 'none';
                playlistBanner.style.display = 'none';
                playlistsView.style.display = 'none';
                if (queueView) queueView.style.display = 'flex';
                renderQueueView();
            });
        }

        // Quick Quality Format Filter Bar (ALL, HI-RES, LOSSLESS, MP3/AAC)
        const formatPillBtns = document.querySelectorAll('.formatFilterPill');
        formatPillBtns.forEach(pill => {
            pill.addEventListener('click', () => {
                formatPillBtns.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                currentFormatFilter = pill.dataset.filter || 'all';
                applySearchAndSort();
            });
        });

        // Queue Controls & Item Action Delegation
        if (clearQueueBtn) {
            clearQueueBtn.addEventListener('click', clearQueue);
        }

        if (queueView) {
            queueView.addEventListener('click', (e) => {
                const moveUpBtn = e.target.closest('.moveUpBtn');
                if (moveUpBtn) {
                    const idx = parseInt(moveUpBtn.dataset.idx, 10);
                    moveQueueItem(idx, idx - 1);
                    return;
                }
                const moveDownBtn = e.target.closest('.moveDownBtn');
                if (moveDownBtn) {
                    const idx = parseInt(moveDownBtn.dataset.idx, 10);
                    moveQueueItem(idx, idx + 1);
                    return;
                }
                const playNowBtn = e.target.closest('.queuePlayNowBtn');
                if (playNowBtn) {
                    const idx = parseInt(playNowBtn.dataset.idx, 10);
                    if (idx >= 0 && idx < playQueue.length) {
                        const track = playQueue.splice(idx, 1)[0];
                        updateQueueUi();
                        const masterIdx = allTracks.findIndex(t =>
                            (track.id && t.id === track.id) ||
                            (track.tid && t.tid === track.tid) ||
                            t.filename === track.filename
                        );
                        if (masterIdx !== -1) {
                            loadTrack(masterIdx, true);
                        }
                    }
                    return;
                }
                const removeBtn = e.target.closest('.queueRemoveBtn');
                if (removeBtn) {
                    const idx = parseInt(removeBtn.dataset.idx, 10);
                    removeFromQueue(idx);
                    return;
                }
                const enqueueUpcomingBtn = e.target.closest('.enqueueUpcomingBtn');
                if (enqueueUpcomingBtn) {
                    const id = enqueueUpcomingBtn.dataset.id;
                    const track = allTracks.find(t => (t.id && t.id == id) || (t.tid && t.tid == id) || t.filename == id);
                    if (track) addToQueue(track, false);
                    return;
                }
            });
        }

        // Sleep Timer Modal & Triggers
        if (sleepTimerBtn) {
            sleepTimerBtn.addEventListener('click', openSleepTimerModal);
        }
        if (closeSleepTimerModalBtn) {
            closeSleepTimerModalBtn.addEventListener('click', closeSleepTimerModal);
        }
        if (sleepTimerModal) {
            sleepTimerModal.addEventListener('click', (e) => {
                if (e.target === sleepTimerModal) closeSleepTimerModal();
            });
        }
        const sleepOptBtns = document.querySelectorAll('.sleepOptBtn');
        sleepOptBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mins = btn.dataset.minutes;
                setSleepTimer(mins);
            });
        });
        if (setCustomSleepBtn && customSleepInput) {
            setCustomSleepBtn.addEventListener('click', () => {
                const val = parseInt(customSleepInput.value, 10);
                if (!isNaN(val) && val > 0) {
                    setSleepTimer(val);
                    customSleepInput.value = '';
                } else {
                    showToast('Please enter valid minutes (e.g., 20)');
                }
            });
            customSleepInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    setCustomSleepBtn.click();
                }
            });
        }
        if (cancelSleepTimerBtn) {
            cancelSleepTimerBtn.addEventListener('click', () => cancelSleepTimer(true));
        }

        // Signal Path Inspector Modal & Triggers
        if (signalPathBadgeBtn) {
            signalPathBadgeBtn.addEventListener('click', openSignalPathModal);
        }
        if (openSignalAuditBtn) {
            openSignalAuditBtn.addEventListener('click', openSignalPathModal);
        }
        if (closeSignalPathModalBtn) {
            closeSignalPathModalBtn.addEventListener('click', closeSignalPathModal);
        }
        if (signalPathModal) {
            signalPathModal.addEventListener('click', (e) => {
                if (e.target === signalPathModal) closeSignalPathModal();
            });
            const initUrlParams = new URLSearchParams(window.location.search);
            if (initUrlParams.get('modal') === 'signal' || window.location.hash === '#signal') {
                openSignalPathModal();
            }
            if (initUrlParams.get('modal') === 'theme' || window.location.hash === '#theme') {
                openThemeModal();
            }
            if (initUrlParams.get('tab') === 'playlists' || window.location.hash === '#playlists') {
                if (tabPlaylists) tabPlaylists.click();
            }
            if (initUrlParams.get('tab') === 'settings' || initUrlParams.get('view') === 'settings' || window.location.hash === '#settings') {
                switchWorkspace('settings');
            }
            if (initUrlParams.get('tab') === 'soulseek' || initUrlParams.get('view') === 'soulseek' || window.location.hash === '#soulseek') {
                switchWorkspace('soulseek');
            }
            if (initUrlParams.get('tab') === 'download' || initUrlParams.get('view') === 'download' || window.location.hash === '#download') {
                switchWorkspace('download');
            }
        }

        if (backToLibraryBtn) {
            backToLibraryBtn.addEventListener('click', backToPlaylistsView);
        }

        const bannerPlayAllBtn = document.getElementById('bannerPlayAllBtn');
        if (bannerPlayAllBtn) {
            bannerPlayAllBtn.addEventListener('click', () => {
                if (currentPlaylistId) {
                    playPlaylistDirectly(currentPlaylistId, currentPlaylistName, false);
                }
            });
        }

        const bannerShuffleBtn = document.getElementById('bannerShuffleBtn');
        if (bannerShuffleBtn) {
            bannerShuffleBtn.addEventListener('click', () => {
                if (currentPlaylistId) {
                    playPlaylistDirectly(currentPlaylistId, currentPlaylistName, true);
                }
            });
        }

        if (bannerAddTracksBtn) {
            bannerAddTracksBtn.addEventListener('click', openBatchAddModal);
        }

        const closeBatchAddModalBtn = document.getElementById('closeBatchAddModalBtn');
        if (closeBatchAddModalBtn) {
            closeBatchAddModalBtn.addEventListener('click', closeBatchAddModal);
        }

        const doneBatchAddBtn = document.getElementById('doneBatchAddBtn');
        if (doneBatchAddBtn) {
            doneBatchAddBtn.addEventListener('click', closeBatchAddModal);
        }

        const batchAddSongsModal = document.getElementById('batchAddSongsModal');
        if (batchAddSongsModal) {
            batchAddSongsModal.addEventListener('click', (e) => {
                if (e.target === batchAddSongsModal) closeBatchAddModal();
            });
        }

        // Playlist Quick Presets Chips
        document.querySelectorAll('.playlistChipBtn').forEach(chip => {
            chip.addEventListener('click', () => {
                const input = document.getElementById('newPlaylistInput');
                if (input) {
                    input.value = chip.dataset.name;
                    input.focus();
                }
            });
        });

        // Top Navigation Bar & Dedicated Settings Workspace Triggers
        const topSettingsBtn = document.getElementById('topSettingsBtn');
        if (topSettingsBtn) {
            bindFastAction(topSettingsBtn, () => {
                switchWorkspace(currentWorkspace === 'settings' ? 'player' : 'settings');
            });
        }

        const wsSettingsBtn = document.getElementById('wsSettingsBtn');
        if (wsSettingsBtn) {
            bindFastAction(wsSettingsBtn, () => {
                switchWorkspace('settings');
            });
        }

        const settingsReturnBtn = document.getElementById('settingsReturnBtn');
        if (settingsReturnBtn) {
            bindFastAction(settingsReturnBtn, () => {
                switchWorkspace('player');
            });
        }

        // Dedicated Settings Workspace Actions:
        // 1. Theme Overhaul Modal Trigger
        const settingsTabOpenThemeModalBtn = document.getElementById('settingsTabOpenThemeModalBtn');
        if (settingsTabOpenThemeModalBtn) {
            settingsTabOpenThemeModalBtn.addEventListener('click', openThemeModal);
        }
        const settingsThemeBtn = document.getElementById('settingsThemeBtn');
        if (settingsThemeBtn) {
            settingsThemeBtn.addEventListener('click', openThemeModal);
        }

        // 2. Folder Scanner inside Settings
        const settingsTabFolderPathInput = document.getElementById('settingsTabFolderPathInput');
        const settingsTabBrowseBtn = document.getElementById('settingsTabBrowseBtn');
        const settingsTabScanBtn = document.getElementById('settingsTabScanBtn');

        if (settingsTabFolderPathInput) {
            settingsTabFolderPathInput.addEventListener('input', (e) => {
                if (folderPathInput) folderPathInput.value = e.target.value;
            });
            settingsTabFolderPathInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const p = settingsTabFolderPathInput.value.trim() || (safeStorage.getItem('cachymusic_last_directory') || '');
                    scanDirectory(p, true);
                }
            });
        }
        if (folderPathInput) {
            folderPathInput.addEventListener('input', (e) => {
                if (settingsTabFolderPathInput) settingsTabFolderPathInput.value = e.target.value;
            });
        }
        if (settingsTabBrowseBtn) {
            settingsTabBrowseBtn.addEventListener('click', openFolderBrowser);
        }
        if (settingsTabScanBtn) {
            settingsTabScanBtn.addEventListener('click', () => {
                const path = (settingsTabFolderPathInput ? settingsTabFolderPathInput.value.trim() : '') || (folderPathInput ? folderPathInput.value.trim() : '') || (safeStorage.getItem('cachymusic_last_directory') || '');
                scanDirectory(path, true);
            });
        }

        // 3. DSP & Audiophile Signal Audit
        const settingsTabOpenSignalAuditBtn = document.getElementById('settingsTabOpenSignalAuditBtn');
        if (settingsTabOpenSignalAuditBtn) {
            settingsTabOpenSignalAuditBtn.addEventListener('click', openSignalPathModal);
        }
        const settingsSignalAuditBtn = document.getElementById('settingsSignalAuditBtn');
        if (settingsSignalAuditBtn) {
            settingsSignalAuditBtn.addEventListener('click', openSignalPathModal);
        }

        // 4. Sleep Timer inside Settings
        document.querySelectorAll('.settingsSleepPresetBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mins = btn.dataset.mins;
                setSleepTimer(mins);
            });
        });
        const settingsTabCancelSleepBtn = document.getElementById('settingsTabCancelSleepBtn');
        if (settingsTabCancelSleepBtn) {
            settingsTabCancelSleepBtn.addEventListener('click', () => cancelSleepTimer(true));
        }
        const settingsTabOpenSleepModalBtn = document.getElementById('settingsTabOpenSleepModalBtn');
        if (settingsTabOpenSleepModalBtn) {
            settingsTabOpenSleepModalBtn.addEventListener('click', openSleepTimerModal);
        }
        const settingsSleepTimerBtn = document.getElementById('settingsSleepTimerBtn');
        if (settingsSleepTimerBtn) {
            settingsSleepTimerBtn.addEventListener('click', openSleepTimerModal);
        }

        // 5. Cross-Platform App & Downloads inside Settings
        const settingsTabOpenDownloadHubBtn = document.getElementById('settingsTabOpenDownloadHubBtn');
        if (settingsTabOpenDownloadHubBtn) {
            settingsTabOpenDownloadHubBtn.addEventListener('click', () => {
                switchWorkspace('download');
            });
        }
        const settingsDownloadBtn = document.getElementById('settingsDownloadBtn');
        if (settingsDownloadBtn) {
            settingsDownloadBtn.addEventListener('click', () => {
                switchWorkspace('download');
            });
        }
        const settingsTabPwaInstallBtn = document.getElementById('settingsTabPwaInstallBtn');
        if (settingsTabPwaInstallBtn) {
            settingsTabPwaInstallBtn.addEventListener('click', () => {
                if (deferredInstallPrompt) {
                    deferredInstallPrompt.prompt();
                    deferredInstallPrompt.userChoice.then(() => { deferredInstallPrompt = null; });
                } else {
                    switchWorkspace('download');
                }
            });
        }

        // Theme Modal: All 3 categories are displayed side-by-side in multi-column layout

        deleteCurrentPlaylistBtn.addEventListener('click', async () => {
            if (!currentPlaylistId) return;
            if (!confirm(`Delete playlist "${currentPlaylistName}"?`)) return;

            try {
                const res = await fetch('php/api/playlists.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'delete', plid: currentPlaylistId })
                });
                const data = await res.json();
                if (data.success) {
                    playlists = playlists.filter(p => p.plid != currentPlaylistId);
                    backToPlaylistsView();
                    renderPlaylistsView();
                }
            } catch (e) {
                console.warn('Delete playlist API error:', e);
            }
        });

        // Folder Scan Tray Toggle
        if (toggleFolderBtn) {
            toggleFolderBtn.addEventListener('click', () => {
                folderTray.style.display = folderTray.style.display === 'flex' ? 'none' : 'flex';
            });
        }

        if (closeFolderTrayBtn) {
            closeFolderTrayBtn.addEventListener('click', () => {
                folderTray.style.display = 'none';
            });
        }

        if (scanFolderBtn) {
            scanFolderBtn.addEventListener('click', () => {
                const path = (folderPathInput ? folderPathInput.value.trim() : '') || (safeStorage.getItem('cachymusic_last_directory') || '');
                scanDirectory(path, true);
            });
        }

        if (folderPathInput) {
            folderPathInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (scanFolderBtn) scanFolderBtn.click();
                }
            });
        }

        // Blocking Track Loading Overlay Cancel Button & Empty Player Prompt Actions
        const cancelTrackLoadingBtnEl = document.getElementById('cancelTrackLoadingBtn');
        if (cancelTrackLoadingBtnEl) {
            cancelTrackLoadingBtnEl.addEventListener('click', cancelActiveTrackLoading);
        }

        const playerChooseDirBtn = document.getElementById('playerChooseDirBtn');
        if (playerChooseDirBtn) {
            playerChooseDirBtn.addEventListener('click', openFolderBrowser);
        }

        const playerOpenDirSettingsBtn = document.getElementById('playerOpenDirSettingsBtn');
        if (playerOpenDirSettingsBtn) {
            playerOpenDirSettingsBtn.addEventListener('click', () => {
                switchWorkspace('settings');
                const libCatBtn = document.querySelector('#settingsCategoryNav .settingsCatBtn[data-cat="library"]');
                if (libCatBtn) libCatBtn.click();
                setTimeout(() => {
                    const sInput = document.getElementById('settingsTabFolderPathInput');
                    if (sInput) sInput.focus();
                }, 80);
            });
        }

        // Native Android Bridge progress, cancellation & discovery receivers
        window.onAndroidScanProgress = function(count, total, folderName, etaSec) {
            if (isTrackLoadingCancelled) return;
            const pct = total > 0 ? Math.min(98, Math.round((count / total) * 100)) : 50;
            const etaText = (typeof etaSec === 'number' && etaSec > 0)
                ? ` • ETA: ~${etaSec}s`
                : (count > 0 && total > 0 && count < total ? ' • Fast index in progress...' : '');
            showTrackLoadingOverlay(
                'LOADING MUSIC LIBRARY...',
                `Scanning "${folderName || 'Device Storage'}" — ${count}${total > 0 ? ' / ' + total : ''} tracks indexed${etaText}`,
                pct
            );
        };

        window.onAndroidScanCancelled = function() {
            hideTrackLoadingOverlay();
            setScanStatus('Directory scan cancelled.', false);
            updateEmptyPlayerState();
        };

        window.onAndroidTracksDiscovered = function(tracks, folderName) {
            hideTrackLoadingOverlay();
            if (isTrackLoadingCancelled) return;

            if (!Array.isArray(tracks) || tracks.length === 0) {
                const errStr = `No supported audio tracks found in "${folderName || 'Selected Folder'}".`;
                setScanStatus(`${errStr} Please configure your directory manually in Settings → Library & Folders.`, true);
                updateEmptyPlayerState(errStr);
                return;
            }

            setScanStatus(`Loaded ${tracks.length} track(s) from "${folderName}".`, false);
            if (folderPathInput) folderPathInput.value = folderName;
            const sInput = document.getElementById('settingsTabFolderPathInput');
            if (sInput) sInput.value = folderName;

            allTracks = tracks;
            try {
                const cacheData = tracks.map(t => ({
                    id: t.id,
                    filename: t.filename,
                    fullPath: t.fullPath,
                    title: t.title,
                    artist: t.artist,
                    album: t.album,
                    duration: t.duration,
                    bitrate: t.bitrate,
                    sampleRate: t.sampleRate,
                    channels: t.channels || 2,
                    format: t.format,
                    size: t.size,
                    src: t.src,
                    cover: t.cover
                }));
                safeStorage.setItem('cachymusic_last_directory', folderName);
                safeStorage.setItem('cachymusic_directory_mode', 'android');
                safeStorage.setItem('cachymusic_android_tracks', JSON.stringify(cacheData));
            } catch (e) {
                console.warn('Could not cache tracks to localStorage, using IndexedDB:', e);
            }
            saveLibraryToIndexedDB(tracks, folderName);

            updateEmptyPlayerState();
            applySearchAndSort();
            if (allTracks.length > 0 && !isPlaying) {
                loadTrack(0, false);
            }
        };

        // Folder Browse Action (Native Android SAF -> Native OS Dialog -> Web Folder Picker Fallback)
        async function openFolderBrowser() {
            if (window.AndroidBridge && typeof window.AndroidBridge.openFolderPicker === 'function') {
                setScanStatus('Opening system folder directory picker...', false);
                try {
                    window.AndroidBridge.openFolderPicker();
                    return;
                } catch (err) {
                    console.warn('AndroidBridge.openFolderPicker error:', err);
                }
            }

            setScanStatus('Opening folder selection dialog...', false);
            const curPath = (folderPathInput ? folderPathInput.value.trim() : '') || (safeStorage.getItem('cachymusic_last_directory') || '');

            try {
                const res = await fetch('php/api/browse_folder.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initialDir: curPath })
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.directory) {
                        if (folderPathInput) folderPathInput.value = data.directory;
                        const sInput = document.getElementById('settingsTabFolderPathInput');
                        if (sInput) sInput.value = data.directory;
                        setScanStatus(`Selected directory: ${data.directory}. Scanning library...`, false);
                        await scanDirectory(data.directory, true);
                        return;
                    } else if (data.cancelled) {
                        setScanStatus('Folder selection cancelled.', false);
                        return;
                    }
                }
            } catch (err) {
                console.warn('Native folder chooser error:', err);
            }

            // Fallback: trigger HTML5 directory picker input
            if (folderPickerInput) {
                setScanStatus('Select folder in directory picker...', false);
                folderPickerInput.click();
            }
        }

        if (browseFolderBtn) {
            browseFolderBtn.addEventListener('click', openFolderBrowser);
        }

        const mobileScanFolderBtn = document.getElementById('mobileScanFolderBtn');
        if (mobileScanFolderBtn) {
            mobileScanFolderBtn.addEventListener('click', openFolderBrowser);
        }

        const settingsChooseFolderBtn = document.getElementById('settingsChooseFolderBtn');
        if (settingsChooseFolderBtn) {
            settingsChooseFolderBtn.addEventListener('click', openFolderBrowser);
        }

        const settingsScanDeviceMusicBtn = document.getElementById('settingsScanDeviceMusicBtn');
        if (settingsScanDeviceMusicBtn) {
            settingsScanDeviceMusicBtn.addEventListener('click', () => {
                if (window.AndroidBridge && typeof window.AndroidBridge.scanDeviceMusic === 'function') {
                    setScanStatus('Scanning device music library...', false);
                    showTrackLoadingOverlay('SCANNING DEVICE MUSIC...', 'Searching audio files across device storage...', 15);
                    window.AndroidBridge.scanDeviceMusic();
                } else {
                    setScanStatus('Native device scanner available on Android APK. Please choose a folder or configure path manually.', true);
                }
            });
        }

        if (folderPickerInput) {
            folderPickerInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;

                const firstRel = files[0].webkitRelativePath || '';
                const folderName = firstRel ? firstRel.split('/')[0] : 'Selected Folder';
                
                const audioFiles = files.filter(f => /\.(mp3|flac|wav|ogg|m4a|aac|opus|webm|alac|aiff)$/i.test(f.name));
                if (audioFiles.length === 0) {
                    const msg = `No supported audio files found in "${folderName}".`;
                    setScanStatus(`${msg} Please choose another folder or configure path manually in Settings.`, true);
                    updateEmptyPlayerState(msg);
                    folderPickerInput.value = '';
                    return;
                }

                showTrackLoadingOverlay(
                    'LOADING MUSIC LIBRARY...',
                    `Scanning ${audioFiles.length} audio files from "${folderName}"...`,
                    10
                );
                setScanStatus(`Reading ${audioFiles.length} audio files from "${folderName}"...`, false);

                // Check candidate server paths matching the selected folder name
                const candidatePaths = [
                    folderPathInput ? folderPathInput.value.trim() : '',
                    `~/Music/${folderName}`,
                    `~/Downloads/${folderName}`,
                    `~/${folderName}`,
                    folderName
                ].filter(Boolean);

                let serverScanned = false;
                for (const cand of candidatePaths) {
                    if (isTrackLoadingCancelled) break;
                    try {
                        activeScanAbortController = new AbortController();
                        const res = await fetch(`php/api/scan.php?directory=${encodeURIComponent(cand)}`, {
                            signal: activeScanAbortController.signal
                        });
                        if (res.ok) {
                            const data = await res.json();
                            if (data.success && Array.isArray(data.tracks) && data.tracks.length > 0) {
                                const resolvedDir = data.directory || cand;
                                if (folderPathInput) folderPathInput.value = resolvedDir;
                                const sInput = document.getElementById('settingsTabFolderPathInput');
                                if (sInput) sInput.value = resolvedDir;
                                try {
                                    safeStorage.setItem('cachymusic_last_directory', resolvedDir);
                                    safeStorage.setItem('cachymusic_directory_mode', 'server');
                                } catch (_) {}
                                if (dismissedTracksMap.size > 0) {
                                    allTracks = data.tracks.filter(t => !dismissedTracksMap.has(t.fullPath || t.filename || t.id));
                                } else {
                                    allTracks = data.tracks;
                                }
                                saveLibraryToIndexedDB(allTracks, resolvedDir);
                                setScanStatus(`Scanned ${data.count} audio tracks from ${resolvedDir}`, false);
                                hideTrackLoadingOverlay();
                                updateEmptyPlayerState();
                                applySearchAndSort();
                                loadTrack(0, false);
                                serverScanned = true;
                                break;
                            }
                        }
                    } catch (err) {
                        if (err && err.name === 'AbortError') break;
                    } finally {
                        activeScanAbortController = null;
                    }
                }

                // If not available on server path, load files directly in browser with ID3 metadata parser
                if (!serverScanned && !isTrackLoadingCancelled) {
                    if (folderPathInput) folderPathInput.value = folderName;
                    const sInput = document.getElementById('settingsTabFolderPathInput');
                    if (sInput) sInput.value = folderName;
                    const importedTracks = [];
                    for (let i = 0; i < audioFiles.length; i++) {
                        if (isTrackLoadingCancelled) break;
                        const file = audioFiles[i];
                        const pct = Math.min(98, Math.round(((i + 1) / audioFiles.length) * 100));
                        updateTrackLoadingOverlay(
                            `Reading track metadata (${i + 1} / ${audioFiles.length}): ${file.name}`,
                            pct
                        );
                        const url = URL.createObjectURL(file);
                        const parsed = await parseAudioFileMetadata(file);
                        importedTracks.push({
                            id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                            tid: null,
                            filename: file.name,
                            fullPath: file.webkitRelativePath || file.name,
                            title: parsed.title,
                            artist: parsed.artist,
                            album: parsed.album,
                            genre: parsed.genre,
                            year: parsed.year,
                            track: parsed.track,
                            duration: parsed.duration || 0,
                            bitrate: parsed.bitrate,
                            sampleRate: parsed.sampleRate,
                            bitDepth: parsed.bitDepth,
                            channels: parsed.channels,
                            format: parsed.format,
                            size: parsed.size,
                            cover: parsed.cover,
                            src: url,
                            _fileBlob: file
                        });
                    }
                    hideTrackLoadingOverlay();
                    if (!isTrackLoadingCancelled && importedTracks.length > 0) {
                        allTracks = importedTracks;
                        try {
                            safeStorage.setItem('cachymusic_last_directory', folderName);
                            safeStorage.setItem('cachymusic_directory_mode', 'browser_idb');
                        } catch (_) {}
                        saveLibraryToIndexedDB(allTracks, folderName);
                        updateEmptyPlayerState();
                        applySearchAndSort();
                        loadTrack(0, false);
                        setScanStatus(`Loaded ${importedTracks.length} track(s) from "${folderName}".`, false);
                    }
                } else {
                    hideTrackLoadingOverlay();
                }
                folderPickerInput.value = '';
            });
        }

        // Create Playlist in Tab
        createPlaylistBtn.addEventListener('click', async () => {
            const name = newPlaylistInput.value.trim();
            if (!name) {
                newPlaylistInput.focus();
                return;
            }

            try {
                const res = await fetch('php/api/playlists.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create', name })
                });
                const data = await res.json();
                if (data.success) {
                    playlists.push({ plid: data.plid, name: data.name, track_count: 0 });
                    try { safeStorage.setItem('cachymusic_cached_playlists', JSON.stringify(playlists)); } catch (err) {}
                    newPlaylistInput.value = '';
                    renderPlaylistsView();
                    showToast(`Playlist "${data.name}" created!`, 'OPEN', () => {
                        openPlaylist(data.plid, data.name);
                    });
                    return;
                }
            } catch (e) {
                console.warn('Create playlist API error, saving locally:', e);
                const localId = Date.now();
                playlists.push({ plid: localId, name, track_count: 0 });
                try { safeStorage.setItem('cachymusic_cached_playlists', JSON.stringify(playlists)); } catch (err) {}
                newPlaylistInput.value = '';
                renderPlaylistsView();
                showToast(`Playlist "${name}" created offline!`, 'OPEN', () => {
                    openPlaylist(localId, name);
                });
            }
        });

        newPlaylistInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                createPlaylistBtn.click();
            }
        });

        closeModalBtn.addEventListener('click', closePlaylistModal);
        playlistModal.addEventListener('click', (e) => {
            if (e.target === playlistModal) closePlaylistModal();
        });

        modalCreateAndAddBtn.addEventListener('click', async () => {
            const name = modalNewPlaylistName.value.trim();
            if (!name || !selectedTrackForPlaylist) {
                if (modalNewPlaylistName) modalNewPlaylistName.focus();
                return;
            }

            try {
                const res = await fetch('php/api/playlists.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create', name })
                });
                const data = await res.json();
                if (data.success) {
                    const newPl = { plid: data.plid, name: data.name, track_count: 0 };
                    playlists.push(newPl);
                    await addTrackToPlaylist(data.plid, selectedTrackForPlaylist.tid || selectedTrackForPlaylist.id, selectedTrackForPlaylist);
                    closePlaylistModal();
                }
            } catch (e) {
                console.warn('Create and add playlist error:', e);
            }
        });

        modalNewPlaylistName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                modalCreateAndAddBtn.click();
            }
        });

        function setupTrackActionMenuModal() {
            const modal = document.getElementById('trackActionMenuModal');
            const closeBtn = document.getElementById('closeTrackMenuBtn');
            const playNextBtn = document.getElementById('trackMenuPlayNextBtn');
            const enqueueBtn = document.getElementById('trackMenuEnqueueBtn');
            const addToPlaylistBtn = document.getElementById('trackMenuAddToPlaylistBtn');
            const editMetaBtn = document.getElementById('trackMenuEditMetaBtn');
            const viewInfoBtn = document.getElementById('trackMenuViewInfoBtn');
            const removeBtn = document.getElementById('trackMenuRemoveBtn');

            if (closeBtn) closeBtn.addEventListener('click', closeTrackActionMenu);
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) closeTrackActionMenu();
                });
            }

            if (playNextBtn) {
                playNextBtn.addEventListener('click', () => {
                    if (!selectedTrackForMenu) return;
                    const track = selectedTrackForMenu;
                    addToQueue(track, true);
                    closeTrackActionMenu();
                    showToast(`Added to Play Next: "${track.title || track.filename}"`);
                });
            }

            if (enqueueBtn) {
                enqueueBtn.addEventListener('click', () => {
                    if (!selectedTrackForMenu) return;
                    const track = selectedTrackForMenu;
                    addToQueue(track, false);
                    closeTrackActionMenu();
                    showToast(`Added to Up Next Queue: "${track.title || track.filename}"`);
                });
            }

            if (addToPlaylistBtn) {
                addToPlaylistBtn.addEventListener('click', () => {
                    if (!selectedTrackForMenu) return;
                    const track = selectedTrackForMenu;
                    closeTrackActionMenu();
                    openAddToPlaylistModal(track);
                });
            }

            if (viewInfoBtn) {
                viewInfoBtn.addEventListener('click', () => {
                    if (!selectedTrackForMenu) return;
                    const track = selectedTrackForMenu;
                    closeTrackActionMenu();
                    if (typeof updateTrackMetadataDisplay === 'function') {
                        updateTrackMetadataDisplay(track);
                    }
                    if (window.innerWidth <= 768) {
                        switchWorkspace('player', 'settingsPanel');
                    } else {
                        const metaTab = document.getElementById('tabMetadata');
                        if (metaTab) metaTab.click();
                    }
                });
            }

            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    if (!selectedTrackForMenu) return;
                    const track = selectedTrackForMenu;
                    closeTrackActionMenu();
                    if (currentPlaylistId !== null) {
                        removeTrackFromCurrentPlaylist(track);
                    } else {
                        removeTrackFromMainList(track);
                    }
                });
            }
        }
        setupTrackActionMenuModal();

        function setupMetadataEditorModal() {
            const modal = document.getElementById('metadataEditorModal');
            const closeBtn = document.getElementById('closeMetaEditorModalBtn');
            const cancelBtn = document.getElementById('metaEditCancelBtn');
            const form = document.getElementById('metaEditorForm');
            const saveBtn = document.getElementById('metaEditSaveBtn');
            const infoEditBtn = document.getElementById('infoPanelEditMetaBtn');
            const confirmCancelBtn = document.getElementById('metaEditConfirmCancelBtn');
            const confirmProceedBtn = document.getElementById('metaEditConfirmProceedBtn');

            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    if (typeof closeMetadataEditor === 'function') closeMetadataEditor();
                });
            }
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    if (typeof closeMetadataEditor === 'function') closeMetadataEditor();
                });
            }
            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (typeof requestSaveMetadataConfirmation === 'function') {
                        requestSaveMetadataConfirmation(e);
                    } else if (typeof saveMetadata === 'function') {
                        saveMetadata(e);
                    }
                });
            }
            if (confirmCancelBtn) {
                confirmCancelBtn.addEventListener('click', () => {
                    if (typeof cancelMetadataConfirmation === 'function') {
                        cancelMetadataConfirmation();
                    }
                });
            }
            if (confirmProceedBtn) {
                confirmProceedBtn.addEventListener('click', () => {
                    if (typeof executeSaveMetadata === 'function') {
                        executeSaveMetadata();
                    }
                });
            }
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        if (typeof closeMetadataEditor === 'function') closeMetadataEditor();
                    }
                });
            }
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    if (typeof requestSaveMetadataConfirmation === 'function') {
                        requestSaveMetadataConfirmation(e);
                    } else if (typeof saveMetadata === 'function') {
                        saveMetadata(e);
                    }
                });
            }
            if (infoEditBtn) {
                infoEditBtn.addEventListener('click', () => {
                    const track = window.currentInspectedTrack || (Array.isArray(allTracks) && allTracks[currentTrackIndex]) || null;
                    if (track) {
                        if (typeof openMetadataEditor === 'function') openMetadataEditor(track);
                    } else {
                        showToast('No active track loaded to edit metadata');
                    }
                });
            }
        }
        setupMetadataEditorModal();

        async function handleOpenStandaloneAudioFiles(files) {
            const rawFiles = Array.from(files || []);
            const audioFiles = rawFiles.filter(f => {
                const name = (f.name || '').toLowerCase();
                return f.type.startsWith('audio/') || /\.(mp3|flac|wav|ogg|m4a|aac|opus|alac|aiff)$/i.test(name);
            });
            if (audioFiles.length === 0) return;

            showTrackLoadingOverlay(
                'OPENING AUDIO FILE...',
                `Reading ${audioFiles.length} audio file(s)...`,
                15
            );
            setScanStatus(`Reading ${audioFiles.length} standalone audio file(s)...`, false);
            const openedTracks = [];

            for (let i = 0; i < audioFiles.length; i++) {
                if (isTrackLoadingCancelled) break;
                const file = audioFiles[i];
                const pct = Math.min(98, Math.round(((i + 1) / audioFiles.length) * 100));
                updateTrackLoadingOverlay(`Reading metadata (${i + 1}/${audioFiles.length}): ${file.name}`, pct);
                if (i % 5 === 0 || i === audioFiles.length - 1) {
                    setScanStatus(`Reading audio metadata (${i + 1}/${audioFiles.length})...`, false);
                }
                const url = URL.createObjectURL(file);

                let parsed = null;
                try {
                    parsed = await parseAudioFileMetadata(file);
                } catch (_) {
                    parsed = { title: file.name.replace(/\.[^/.]+$/, ''), artist: 'External Audio', album: 'Standalone File', duration: 0 };
                }

                openedTracks.push({
                    id: 'standalone_' + Date.now() + '_' + i + '_' + Math.random().toString(36).substr(2, 4),
                    tid: null,
                    filename: file.name,
                    fullPath: file.name,
                    title: (parsed && parsed.title) ? parsed.title : file.name.replace(/\.[^/.]+$/, ''),
                    artist: (parsed && parsed.artist) ? parsed.artist : 'External Audio',
                    album: (parsed && parsed.album) ? parsed.album : 'Standalone File',
                    genre: (parsed && parsed.genre) ? parsed.genre : 'N/A',
                    year: (parsed && parsed.year) ? parsed.year : '',
                    track: (parsed && parsed.track) ? parsed.track : null,
                    duration: (parsed && parsed.duration) ? parsed.duration : 0,
                    bitrate: (parsed && parsed.bitrate) ? parsed.bitrate : 0,
                    sampleRate: (parsed && parsed.sampleRate) ? parsed.sampleRate : 44100,
                    bitDepth: (parsed && parsed.bitDepth) ? parsed.bitDepth : 16,
                    channels: (parsed && parsed.channels) ? parsed.channels : 2,
                    format: (parsed && parsed.format) ? parsed.format : (file.name.split('.').pop() || 'audio'),
                    size: (parsed && parsed.size) ? parsed.size : (file.size ? (file.size / (1024 * 1024)).toFixed(2) + ' MB' : 'N/A'),
                    cover: (parsed && parsed.cover) ? parsed.cover : null,
                    src: url,
                    _fileBlob: file,
                    isStandalone: true
                });
            }

            hideTrackLoadingOverlay();
            if (!isTrackLoadingCancelled && openedTracks.length > 0) {
                setScanStatus(`Loaded ${openedTracks.length} standalone file(s).`, false);
                standaloneTrackList = openedTracks;
                standaloneTrackIndex = 0;
                isStandalonePlayback = true;
                await loadStandaloneTrack(0, true);
            }
        }
        window.handleOpenStandaloneAudioFiles = handleOpenStandaloneAudioFiles;

        localFileInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;
            await handleOpenStandaloneAudioFiles(files);
            localFileInput.value = '';
        });

        // Drag & Drop external audio files onto the workstation window (VLC-style)
        window.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        });

        window.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const dt = e.dataTransfer;
            if (!dt || !dt.files || dt.files.length === 0) return;
            await handleOpenStandaloneAudioFiles(dt.files);
        });

        // W3C File Handling API (Launch Queue - when user opens audio files with CachyMusic from desktop/OS file manager)
        if (typeof window !== 'undefined' && 'launchQueue' in window && window.LaunchParams && 'files' in window.LaunchParams.prototype) {
            try {
                window.launchQueue.setConsumer(async (launchParams) => {
                    if (!launchParams.files || launchParams.files.length === 0) return;
                    const loadedFiles = [];
                    for (const handle of launchParams.files) {
                        try {
                            const file = await handle.getFile();
                            if (file) loadedFiles.push(file);
                        } catch (_) {}
                    }
                    if (loadedFiles.length > 0) {
                        await handleOpenStandaloneAudioFiles(loadedFiles);
                    }
                });
            } catch (_) {}
        }

        if (standaloneResumeLibraryBtn) {
            standaloneResumeLibraryBtn.addEventListener('click', () => {
                exitStandalonePlayback(true);
            });
        }
        if (standaloneCloseBtn) {
            standaloneCloseBtn.addEventListener('click', () => {
                exitStandalonePlayback(false);
            });
        }

        speedBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                speedBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const speed = parseFloat(btn.dataset.speed);
                currentPlaybackSpeed = speed;
                audio.playbackRate = speed;
                try {
                    audio.preservesPitch = isPitchLockTempo;
                    audio.mozPreservesPitch = isPitchLockTempo;
                    audio.webkitPreservesPitch = isPitchLockTempo;
                } catch (_) {}

                if (speed === 1) {
                    vinylTurntable.style.animationDuration = '2.2s';
                } else {
                    vinylTurntable.style.animationDuration = `${2.2 / speed}s`;
                }
            });
        });

        // Mobile & Touch Ergonomics: Tactile Vinyl Swiping & Tapping
        if (vinylTurntable) {
            let touchStartX = 0;
            let touchStartY = 0;
            let touchStartTime = 0;

            vinylTurntable.addEventListener('touchstart', (e) => {
                if (!e.touches || e.touches.length !== 1) return;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                touchStartTime = Date.now();
            }, { passive: true });

            vinylTurntable.addEventListener('touchend', (e) => {
                if (!e.changedTouches || e.changedTouches.length !== 1) return;
                const dx = e.changedTouches[0].clientX - touchStartX;
                const dy = e.changedTouches[0].clientY - touchStartY;
                const dt = Date.now() - touchStartTime;

                if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 600) {
                    if (dx < 0) {
                        nextTrack();
                        showToast('Next Track ⏭');
                    } else {
                        prevTrack();
                        showToast('Previous Track ⏮');
                    }
                } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 300) {
                    togglePlayPause();
                }
            }, { passive: true });
        }

        // Theme Overhaul Listeners
        if (themeModalBtn) {
            themeModalBtn.addEventListener('click', openThemeModal);
        }
        if (closeThemeModalBtn) {
            closeThemeModalBtn.addEventListener('click', closeThemeModal);
        }
        if (themeModal) {
            themeModal.addEventListener('click', (e) => {
                if (e.target === themeModal) closeThemeModal();
            });
        }

        themeSelectCards.forEach(card => {
            card.addEventListener('click', () => {
                const t = card.dataset.theme || 'default';
                applyTheme(t, true);
                closeThemeModal();
            });
        });

        themeQuickBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const t = btn.dataset.theme || 'default';
                applyTheme(t, true);
            });
        });

        if (new URLSearchParams(window.location.search).get('modal') === 'theme') {
            openThemeModal();
        }

        // Mini Player & Soulseek Studio Listeners
        function seekMiniAudio(e) {
            if (!miniProgressCon) return;
            const rect = miniProgressCon.getBoundingClientRect();
            if (!rect || rect.width <= 0) return;
            const clientX = getClientX(e);
            if (typeof clientX !== 'number' || isNaN(clientX) || !isFinite(clientX)) return;
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            if (isNaN(pct) || !isFinite(pct)) return;
            if (miniProgressBar) miniProgressBar.style.width = `${pct * 100}%`;
            if (progressBar) progressBar.style.width = `${pct * 100}%`;
            if (isSoftwareDecoding) {
                const totalDur = activeDecodedBuffer ? activeDecodedBuffer.duration : ((allTracks[currentTrackIndex] && allTracks[currentTrackIndex].duration) || 0);
                if (totalDur > 0) {
                    seekSoftwarePlayback(pct * totalDur);
                }
                return;
            }
            if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
                const targetSec = Math.max(0, Math.min(audio.duration, pct * audio.duration));
                if (!isNaN(targetSec) && isFinite(targetSec)) {
                    audio.currentTime = targetSec;
                    if (miniCurrentTime) miniCurrentTime.textContent = formatTime(audio.currentTime);
                    currentTimeEl.textContent = formatTime(audio.currentTime);
                    try {
                        const cur = audio.currentTime;
                        const dur = audio.duration;
                        if (cur > 0 && cur < dur - 1) {
                            safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2));
                        }
                    } catch (_) {}
                }
            }
        }

        if (miniPlayBtn) miniPlayBtn.addEventListener('click', () => {
            togglePlayPause();
            miniPlayBtn.blur();
        });
        if (miniPrevBtn) miniPrevBtn.addEventListener('click', () => {
            prevTrack();
            miniPrevBtn.blur();
        });
        if (miniNextBtn) miniNextBtn.addEventListener('click', () => {
            nextTrack();
            miniNextBtn.blur();
        });
        if (miniDeckReturnBtn) bindFastAction(miniDeckReturnBtn, () => switchWorkspace('player', 'playerDeck'));
        const miniPlayerLeftEl = document.querySelector('.miniPlayerLeft');
        if (miniPlayerLeftEl) {
            miniPlayerLeftEl.style.cursor = 'pointer';
            bindFastAction(miniPlayerLeftEl, () => switchWorkspace('player', 'playerDeck'));
        }
        if (miniProgressCon) {
            miniProgressCon.addEventListener('click', seekMiniAudio);
        }
        if (miniMuteBtn) {
            miniMuteBtn.addEventListener('click', () => {
                audio.muted = !audio.muted;
                if (audio.muted) {
                    volumeLevel.textContent = '0%';
                    updateVolumeIcon(0);
                    if (isHardwareGain) dispatchHardwareVolume(0);
                } else {
                    setVolume(currentVolumeValue, true);
                }
            });
        }
        if (miniVolumeSlider) {
            miniVolumeSlider.addEventListener('input', (e) => {
                setVolume(parseFloat(e.target.value), true);
            });
        }

        if (wsPlayerBtn) bindFastAction(wsPlayerBtn, () => switchWorkspace('player'));
        if (wsSoulseekBtn) bindFastAction(wsSoulseekBtn, () => switchWorkspace('soulseek'));
        if (wsDownloadBtn) bindFastAction(wsDownloadBtn, () => switchWorkspace('download'));

        // Soulseek / P2P toolbar power triggers (loads P2P module on demand)
        if (slskPowerBtn) {
            slskPowerBtn.addEventListener('click', () => {
                getP2pModule().then(m => m.soulseekController && m.soulseekController.togglePower());
            });
        }
        if (slskModalPowerBtn) {
            slskModalPowerBtn.addEventListener('click', () => {
                getP2pModule().then(m => m.soulseekController && m.soulseekController.togglePower());
            });
        }
        if (slskAccountBtn) {
            slskAccountBtn.addEventListener('click', () => {
                getP2pModule().then(() => openSlskAccountModal());
            });
        }

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('view') === 'soulseek' || window.location.hash === '#soulseek') {
            switchWorkspace('soulseek');
            if (urlParams.get('slsk_open') === '1') {
                setMobileSearchPanelCollapsed(false);
            }
        } else if (urlParams.get('view') === 'download' || window.location.hash === '#download') {
            switchWorkspace('download');
        } else if (urlParams.get('view') === 'settings' || window.location.hash === '#settings' || urlParams.get('tab') === 'settings') {
            switchWorkspace('settings');
        } else if (urlParams.get('panel')) {
            switchWorkspace('player', urlParams.get('panel'));
        }
        if (urlParams.get('lyrics') === '1' || window.location.hash === '#lyrics') {
            toggleLyricsView(true);
        }
        if (urlParams.get('vis')) {
            setVisualizerMode(urlParams.get('vis'));
        }
        if (urlParams.get('theme')) {
            applyTheme(urlParams.get('theme'), false);
        } else {
            applyTheme(activeTheme, false);
        }
        if (urlParams.get('modal') === 'theme' || window.location.hash === '#theme') {
            openThemeModal();
            if (urlParams.get('scroll_theme') === '1') {
                const tc = document.querySelector('.themeModalCard');
                if (tc) tc.scrollTop = tc.scrollHeight;
            }
        }
        if (urlParams.get('modal') === 'playlist') {
            const dummyTrack = (allTracks && allTracks.length > 0) ? allTracks[0] : { title: 'Solar Echoes', artist: 'Antigravity Sound', filename: 'solar_echoes.flac' };
            openAddToPlaylistModal(dummyTrack);
        }
        if (urlParams.get('modal') === 'slsk' || urlParams.get('modal') === 'soulseek') {
            openSlskAccountModal();
        }
        if (urlParams.get('modal') === 'signal' || window.location.hash === '#signal') {
            openSignalPathModal();
        }
        if (urlParams.get('modal') === 'peq' || urlParams.get('modal') === 'eq' || window.location.hash === '#peq') {
            setTimeout(() => {
                if (playerEqBtn) playerEqBtn.click();
            }, 80);
        }
        if (urlParams.get('play') === '1') {
            setTimeout(() => {
                loadTrack(0, true);
            }, 300);
            try {
                const cleanUrl = new URL(window.location.href);
                cleanUrl.searchParams.delete('play');
                window.history.replaceState({}, document.title, cleanUrl.pathname + (cleanUrl.search ? cleanUrl.search : '') + cleanUrl.hash);
            } catch (_) {}
        }

        window.addEventListener('keydown', (e) => {
            // Dismiss open modals or unfocus search on Escape key
            if (e.code === 'Escape') {
                if (document.activeElement && document.activeElement.id === 'trackSearch') {
                    document.activeElement.blur();
                    return;
                }
                if (themeModal && themeModal.style.display === 'flex') {
                    closeThemeModal();
                    return;
                }
                if (playlistModal && playlistModal.style.display === 'flex') {
                    closePlaylistModal();
                    return;
                }
                if (signalPathModal && signalPathModal.style.display === 'flex') {
                    closeSignalPathModal();
                    return;
                }
                if (sleepTimerModal && sleepTimerModal.style.display === 'flex') {
                    closeSleepTimerModal();
                    return;
                }
                if (slskAccountModal && slskAccountModal.style.display === 'flex') {
                    closeSlskAccountModal();
                    return;
                }
                const peqModalEl = document.getElementById('peqModal');
                if (peqModalEl && peqModalEl.style.display === 'flex') {
                    if (typeof closePeqModal === 'function') closePeqModal();
                    else peqModalEl.style.display = 'none';
                    return;
                }
                const batchModalEl = document.getElementById('batchAddSongsModal');
                if (batchModalEl && batchModalEl.style.display === 'flex') {
                    closeBatchAddModal();
                    return;
                }
                const metaModalEl = document.getElementById('metadataEditorModal');
                if (metaModalEl && (metaModalEl.style.display === 'flex' || window.getComputedStyle(metaModalEl).display === 'flex')) {
                    if (typeof closeMetadataEditor === 'function') closeMetadataEditor();
                    else metaModalEl.style.display = 'none';
                    return;
                }
            }

            // Quick Search Shortcut: '/' or 'Cmd+K' / 'Ctrl+K'
            const isSearchTrigger = (e.key === '/' || ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')));
            if (isSearchTrigger && !['input', 'select', 'textarea'].includes(document.activeElement.tagName.toLowerCase()) && !document.activeElement.isContentEditable) {
                const searchEl = document.getElementById('trackSearch');
                if (searchEl) {
                    e.preventDefault();
                    searchEl.focus();
                    searchEl.select();
                    return;
                }
            }

            // Workspace Hotkeys (Alt+S for Soulseek, Alt+P for Player, Alt+D for Download)
            if (e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                switchWorkspace(currentWorkspace === 'soulseek' ? 'player' : 'soulseek');
                return;
            }
            if (e.altKey && (e.code === 'KeyD' || e.key === 'd' || e.key === 'D')) {
                e.preventDefault();
                switchWorkspace(currentWorkspace === 'download' ? 'player' : 'download');
                return;
            }
            if (e.altKey && (e.code === 'KeyO' || e.key === 'o' || e.key === 'O')) {
                e.preventDefault();
                switchWorkspace(currentWorkspace === 'settings' ? 'player' : 'settings');
                return;
            }
            if (e.altKey && (e.code === 'KeyP' || e.key === 'p' || e.key === 'P')) {
                e.preventDefault();
                switchWorkspace('player');
                return;
            }

            if (['input', 'select', 'textarea'].includes(document.activeElement.tagName.toLowerCase()) || document.activeElement.isContentEditable) return;

            // Quick Queue Hotkey: 'Q' toggles Up Next queue view
            if ((e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                if (tabQueue && queueView && queueView.style.display !== 'none') {
                    tabLibrary.click();
                } else if (tabQueue) {
                    tabQueue.click();
                }
                return;
            }

            // Quick Equalizer Hotkey: 'E' toggles 10-Band Parametric Equalizer modal
            if ((e.code === 'KeyE' || e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                const peqBtn = document.getElementById('playerPeqBtn');
                if (peqBtn) {
                    peqBtn.click();
                } else {
                    const peqModalEl = document.getElementById('peqModal');
                    if (peqModalEl && (peqModalEl.style.display === 'flex' || window.getComputedStyle(peqModalEl).display === 'flex')) {
                        if (typeof closePeqModal === 'function') closePeqModal();
                        else peqModalEl.style.display = 'none';
                    } else if (typeof openPeqModal === 'function') {
                        openPeqModal();
                    }
                }
                return;
            }

            // Background Tab & Focus Protection:
            // Never capture spacebar or media playback keys if the tab is hidden or window is not focused!
            // (Completely prevents YouTube spacebar / media hotkey leakage from unpausing CachyMusic)
            if (document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus())) return;

            if (e.code === 'Space') {
                e.preventDefault();
                togglePlayPause();
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                if (e.shiftKey) nextTrack();
                else audio.currentTime = Math.min(audio.currentTime + 5, audio.duration || 0);
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                if (e.shiftKey) prevTrack();
                else audio.currentTime = Math.max(audio.currentTime - 5, 0);
            } else if (e.code === 'ArrowUp') {
                e.preventDefault();
                setVolume(currentVolumeValue + 0.05, true);
            } else if (e.code === 'ArrowDown') {
                e.preventDefault();
                setVolume(currentVolumeValue - 0.05, true);
            } else if (e.code === 'KeyM') {
                e.preventDefault();
                muteBtn.click();
            } else if (e.code === 'KeyL') {
                e.preventDefault();
                toggleLyricsView();
            } else if (e.code === 'KeyI' || e.key === 'i' || e.key === 'I') {
                e.preventDefault();
                toggleMetadataPanel();
            } else if ((e.code === 'KeyT' || e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                toggleTracklistPanel();
            } else if ((e.code === 'KeyN' || e.key === 'n') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                nextTrack();
            } else if ((e.code === 'KeyP' || e.key === 'p') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                prevTrack();
            }
        });

        // Setup PWA & Desktop Installation Handler
        setupPwaInstallPrompt();

        // Setup Download Hub & Cross-Platform Client Switcher
        setupDownloadWorkspace();
    }


    window.CachyMusicApp = {
        init,
        getAllTracks: () => allTracks,
        getAudioContext: () => audioContext,
        loadTrack,
        playAudio,
        pauseAudio,
        nextTrack,
        prevTrack,
        scanDirectory,
        setDspBoost,
        toggleReplayGain,
        playWithSoftwareDecoder,
        isSoftwareDecoding: () => isSoftwareDecoding,
        peq: {
            frequencies: PEQ_FREQS,
            getGains: () => [...peqGains],
            setGain: setPeqBandGain,
            setPreset: setPeqPreset,
            importProfile: importAutoEqProfile
        },
        updateDacStatusUi
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    export {
        getVisualizerModule,
        getLyricsModule,
        getP2pModule,
        getSettingsModule,
        toggleMetadataPanel,
        toggleTracklistPanel,
        init,
        setupEventListeners
    };
