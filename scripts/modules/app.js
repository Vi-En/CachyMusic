import {dismissalKey, findTrackIndex} from './track-session.js';
import {bindDisclosure} from './control-ui.js';
import {createProgressScrubber} from './progress-scrubber.js';
import { uiIcon } from './icons.js';
import {loadAllMetadataOverrides} from './local-library.js';
import { setupMetadataLookup } from './library.js';
// CachyMusic - Application Orchestrator & Lifecycle Bootstrap
import {
    formatTime,
    safeStorage,
    setScanStatus,
    showToast
} from './utils.js';
import { PEQ_FREQS, store } from './state.js';
import {
    applyRuntimeUiAdaptation,
    detectRuntimeCapabilities,
    getRuntime
} from './runtime-capabilities.js';
import { mediaSessionController } from './media-session.js';
import {
    backToLibraryBtn,
    bannerAddTracksBtn,
    bindFastAction,
    browseFolderBtn,
    cancelActiveTrackLoading,
    cancelSleepTimerBtn,
    clearQueueBtn,
    closeFolderTrayBtn,
    closeModalBtn,
    closeSleepTimerModalBtn,
    closeThemeModalBtn,
    closeSignalPathModalBtn,
    compactLayout,
    createPlaylistBtn,
    currentTimeEl,
    customSleepInput,
    deleteCurrentPlaylistBtn,
    folderPathInput,
    folderPickerInput,
    folderTray,
    hideTrackLoadingOverlay,
    infoPanelEl,
    libraryControls,
    localFileInput,
    lyricsToggleBtn,
    metadataToggleBtn,
    miniCurrentTime,
    miniDeckReturnBtn,
    miniMuteBtn,
    miniNextBtn,
    miniPlayBtn,
    miniPrevBtn,
    miniProgressBar,
    miniProgressCon,
    miniVolumeSlider,
    modalCreateAndAddBtn,
    modalNewPlaylistName,
    muteBtn,
    newPlaylistInput,
    nextBtn,
    openSignalAuditBtn,
    playPauseBtn,
    playlistBanner,
    playlistModal,
    playlistsView,
    prevBtn,
    progressBar,
    progressCon,
    progressHover,
    queueView,
    quickNewPlaylistBtn,
    refreshTracksBtn,
    repeatBtn,
    restoreTracksBtn,
    scanFolderBtn,
    setCustomSleepBtn,
    setMobileSearchPanelCollapsed,
    settingsReturnBtn,
    showTrackLoadingOverlay,
    shuffleBtn,
    shufflePlayBtn,
    signalPathBadgeBtn,
    signalPathModal,
    sleepTimerBtn,
    sleepTimerModal,
    slskAccountBtn,
    slskAccountModal,
    slskModalPowerBtn,
    slskPowerBtn,
    sortSelect,
    speedBtns,
    standaloneCloseBtn,
    standaloneResumeLibraryBtn,
    switchWorkspace,
    tabLibrary,
    tabPlaylists,
    tabQueue,
    themeModal,
    themeModalBtn,
    themeQuickBtns,
    themeSelectCards,
    toggleFolderBtn,
    topSettingsBtn,
    trackList,
    trackListPanelEl,
    trackSearch,
    turntableCenterCanvas,
    updateEmptyPlayerState,
    updateTrackLoadingOverlay,
    vinylTurntable,
    visModeBtns,
    visPillBtns,
    visualizerDock,
    volumeLevel,
    volumeSlider,
    wsDownloadBtn,
    wsPlayerBtn,
    wsSettingsBtn,
    wsSoulseekBtn
} from './ui-elements.js';
import {
    applyTheme,
    closeThemeModal,
    openThemeModal
} from './themes.js';
import * as audioEngineModule from './audio-engine.js';
import {
    checkHardwareGainStatus,
    closePeqModal,
    dispatchHardwareVolume,
    initAudioContext,
    initPeqWorkstation,
    openPeqModal,
    setVolume,
    setupDspControls,
    setupNeutronSettingsControls
} from './audio-engine.js';
import * as playerCoreModule from './player-core.js';
import {
    attachAudioListeners,
    exitStandalonePlayback,
    initMprisBridge,
    loadStandaloneTrack,
    loadTrack,
    nextTrack,
    pauseAudio,
    playAudio,
    prevTrack,
    restoreSessionState,
    seekAudio,
    softwarePosition,
    setupMediaSessionActionHandlers,
    togglePlayPause,
    updateRepeatUI,
    updateVolumeIcon
} from './player-core.js';
import * as libraryModule from './library.js';
import {
    addToQueue,
    addTrackToPlaylist,
    applySearchAndSort,
    backToPlaylistsView,
    cancelMetadataConfirmation,
    clearQueue,
    closeBatchAddModal,
    closeMetadataEditor,
    closePlaylistModal,
    closeSlskAccountModal,
    closeTrackActionMenu,
    createPlaylist,
    deletePlaylistById,
    executeSaveMetadata,
    handleCoverFileSelect,
    importLocalAudioFiles,
    loadLibraryFromIndexedDB,
    loadPlaylists,
    moveQueueItem,
    openAddToPlaylistModal,
    openBatchAddModal,
    openMetadataEditor,
    openPlaylist,
    parseAudioFileMetadata,
    playPlaylistDirectly,
    promptLocalDirectoryOrFiles,
    removeFromQueue,
    removeTrackFromCurrentPlaylist,
    removeTrackFromMainList,
    renderPlaylistsView,
    renderQueueView,
    requestSaveMetadataConfirmation,
    revertCover,
    saveLibraryToIndexedDB,
    saveMetadata,
    scanDirectory,
    updateRestoreBtnUi,
    updateTrackMetadataDisplay
} from './library.js';

// Dynamic Tier 3 Module Loaders (Visualizer, Lyrics, P2P/Soulseek, Settings)
let visualizerPromise = null;
function getVisualizerModule() {
    if (!visualizerPromise) {
        visualizerPromise = import('./visualizer.js').then(mod => {
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
        lyricsPromise = import('./lyrics.js').catch(err => {
            console.warn('Failed to load lyrics.js', err);
            lyricsPromise = null;
        });
    }
    return lyricsPromise;
}

let p2pPromise = null;
let loadedP2pModule = null;
function getP2pModule() {
    if (!p2pPromise) {
        p2pPromise = import('./p2p.js').then(mod => {
            loadedP2pModule = mod;
            if (typeof window !== 'undefined' && window.__cachyMusic) {
                window.__cachyMusic.p2p = mod;
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
        settingsPromise = import('./settings.js').catch(err => {
            console.warn('Failed to load settings.js', err);
            settingsPromise = null;
        });
    }
    return settingsPromise;
}

const toggleLyricsView = (forcedState) => getLyricsModule().then(m => m && m.toggleLyricsView && m.toggleLyricsView(forcedState));
const openSleepTimerModal = () => getSettingsModule().then(m => m && m.openSleepTimerModal && m.openSleepTimerModal());
const closeSleepTimerModal = () => getSettingsModule().then(m => m && m.closeSleepTimerModal && m.closeSleepTimerModal());
const setSleepTimer = (mins) => getSettingsModule().then(m => m && m.setSleepTimer && m.setSleepTimer(mins));
const cancelSleepTimer = (notify) => getSettingsModule().then(m => m && m.cancelSleepTimer && m.cancelSleepTimer(notify));
const openSignalPathModal = () => getSettingsModule().then(m => m && m.openSignalPathModal && m.openSignalPathModal());
const closeSignalPathModal = () => getSettingsModule().then(m => m && m.closeSignalPathModal && m.closeSignalPathModal());
const setupPwaInstallPrompt = () => import('./pwa-install.js').then(m => m.setupPwaInstallPrompt());
let downloadWorkspaceInitialized = false;
const setupDownloadWorkspace = () => getP2pModule().then(m => {
    if (!m || downloadWorkspaceInitialized) return m;
    downloadWorkspaceInitialized = true;
    m.setupDownloadWorkspace();
    return m;
});

store.subscribe('track:change', ({ detail }) => {
    if (store.state.isLyricsView && detail && detail.track) {
        getLyricsModule().then(m => m && m.updateLyricsDisplay && m.updateLyricsDisplay(detail.track));
    }
});

store.subscribe('workspace:change', ({ detail }) => {
    const ws = detail?.viewName;
    if (ws === 'soulseek') {
        getP2pModule().then(m => {
            const controller = m?.soulseekController;
            if (!controller || store.state.currentWorkspace !== 'soulseek') return;
            controller.checkStatus();
            if (controller.activeSubView === 'transfers') controller.startTransfersPolling();
        });
    } else if (ws === 'download') {
        setupDownloadWorkspace().then(m => m && m.fetchLanStreamingUrl && m.fetchLanStreamingUrl());
    }
});

    // Toggle Collapsible / Sliding Metadata Inspector Panel
    function toggleMetadataPanel(forcedState) {
        if (compactLayout.matches) {
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
        document.body.classList.toggle('metadata-expanded', !willCollapse);
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
        if (compactLayout.matches) {
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
        const s = store.state;
        if (s.isInitialized) return;
        s.isInitialized = true;

        const runtime = await detectRuntimeCapabilities();
        applyRuntimeUiAdaptation(runtime);
        if (typeof window !== 'undefined' && window.__cachyMusic) {
            window.__cachyMusic.runtime = runtime;
        }

        setupEventListeners();
        document.querySelectorAll('.settingHintBtn[title]').forEach((button, index) => {
            const row = button.closest('.settingsRowItem');
            if (!row) return;
            const help = document.createElement('p');
            help.id = `settings-help-${index}`;
            help.className = 'settingsHelpText';
            help.textContent = button.title;
            help.hidden = true;
            row.insertBefore(help, row.firstElementChild.nextSibling);
            button.removeAttribute('title');
            button.innerHTML = uiIcon('info');
            button.setAttribute('aria-controls', help.id);
            button.setAttribute('aria-expanded', 'false');
            button.addEventListener('click', () => {
                help.hidden = !help.hidden;
                button.setAttribute('aria-expanded', String(!help.hidden));
            });
        });
        setupMediaSessionActionHandlers();
        getVisualizerModule();
        if (s.currentWorkspace === 'player') {
            const urlParams = new URLSearchParams(window.location.search);
            const initPanel = urlParams.get('panel') || 'playerDeck';
            if (compactLayout.matches || urlParams.get('panel')) {
                switchWorkspace('player', initPanel);
            }
        }
        setupDspControls();
        initPeqWorkstation();
        setupNeutronSettingsControls();
        checkHardwareGainStatus();
        setVolume(s.currentVolumeValue, true);
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
        if (runtime.isAndroidNative && savedMode!=='local' && window.AndroidBridge && typeof window.AndroidBridge.getSavedLibraryJson === 'function') {
            try {
                const rawJson = window.AndroidBridge.getSavedLibraryJson();
                if (rawJson) {
                    const parsed = JSON.parse(rawJson);
                    if (parsed && Array.isArray(parsed.tracks) && parsed.tracks.length > 0) {
                        const overrides=await loadAllMetadataOverrides();
                        s.allTracks = parsed.tracks.map(t=>({...t,...(overrides.get(String(t.tid||t.id||t.fullPath||t.filename))||{})}));
                        const dirName = parsed.directory || savedDir || 'Music Folder';
                        if (folderPathInput) folderPathInput.value = dirName;
                        const sInput = document.getElementById('settingsTabFolderPathInput');
                        if (sInput) sInput.value = dirName;
                        try { safeStorage.setItem('cachymusic_last_directory', dirName); } catch (_) {}
                        applySearchAndSort();
                        setScanStatus(`Restored ${s.allTracks.length} tracks from "${dirName}".`, false);
                    }
                }
            } catch (err) {
                console.warn('AndroidBridge saved library restore error:', err);
            }
        }

        // 2. Only hit scan.php on startup if PHP backend is active and directory mode isn't pure browser IndexedDB
        if (s.allTracks.length === 0 && runtime.hasPhpBackend && !['browser_idb','local'].includes(savedMode)) {
            await scanDirectory(savedDir, false, true);
        }

        // 3. If still empty, check localStorage cached Android tracks
        if (s.allTracks.length === 0) {
            try {
                const cachedRaw = safeStorage.getItem('cachymusic_android_tracks');
                if (cachedRaw) {
                    const cached = JSON.parse(cachedRaw);
                    if (Array.isArray(cached) && cached.length > 0) {
                        s.allTracks = cached;
                        applySearchAndSort();
                        setScanStatus(`Restored ${cached.length} tracks from saved library.`, false);
                    }
                }
            } catch (err) {
                console.warn('Error restoring cached tracks:', err);
            }
        }

        // 4. If still empty, check IndexedDB / OPFS / FileSystemDirectoryHandle saved library
        if (s.allTracks.length === 0) {
            const idbLib = await loadLibraryFromIndexedDB();
            if (idbLib && Array.isArray(idbLib.tracks) && idbLib.tracks.length > 0) {
                s.allTracks = idbLib.tracks;
                if (idbLib.directory) {
                    if (folderPathInput) folderPathInput.value = idbLib.directory;
                    const sInput = document.getElementById('settingsTabFolderPathInput');
                    if (sInput) sInput.value = idbLib.directory;
                    try { safeStorage.setItem('cachymusic_last_directory', idbLib.directory); } catch (_) {}
                }
                applySearchAndSort();
                setScanStatus(`Restored ${s.allTracks.length} tracks from "${idbLib.directory || 'Saved Folder'}".`, false);
            }
        }

        updateEmptyPlayerState();
        await restoreSessionState();

        // Restore saved metadata panel state (persisted across sessions)
        try {
            const savedMetaVisible = safeStorage.getItem('cachymusic_metadata_visible');
            if (savedMetaVisible === 'false' && !compactLayout.matches) {
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
                store.state.isShuffle = !store.state.isShuffle;
                store.emit('playback:order-change');
                shuffleBtn.classList.toggle('active', store.state.isShuffle);
                shuffleBtn.setAttribute('title', store.state.isShuffle ? 'Shuffle Active' : 'Toggle Shuffle');
                shuffleBtn.blur();
            });
        }

        if (shufflePlayBtn) {
            shufflePlayBtn.addEventListener('click', () => {
                store.state.isShuffle = true;
                store.emit('playback:order-change');
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
                if (store.state.repeatMode === 'all') {
                    store.state.repeatMode = 'one';
                } else if (store.state.repeatMode === 'one') {
                    store.state.repeatMode = 'off';
                } else {
                    store.state.repeatMode = 'all';
                }
                updateRepeatUI();
                repeatBtn.blur();
            });
        }

        // Continuous Native Media Event Synchronization
        attachAudioListeners(store.state.audio);

        const ensureContextRunning = () => {
            const s = store.state;
            const ctx = s.audioContext;
            // Existing suspended graphs are unlocked by audio-engine.js.
            // Warm a missing graph only while playback has actually been requested.
            if ((!ctx || ctx.state === 'closed') && (s.isPlayPending || s.isSoftwareDecoding) && playerCoreModule.nativePosition() === null) initAudioContext();
        };
        ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evt => {
            window.addEventListener(evt, ensureContextRunning, { passive: true });
        });

        // Remember playback position of currently playing track when window closes / navigates away
        function persistCurrentPlaybackTimeOnExit() {
            const activeAudio = store.state.audio;
            if (!activeAudio || store.state.isStandalonePlayback) return;
            try {
                const s = store.state;
                const cur = playerCoreModule.nativePosition() ?? (s.isSoftwareDecoding ? softwarePosition() : activeAudio.currentTime);
                const dur = playerCoreModule.nativeDuration() ?? (s.isSoftwareDecoding ? s.activeDecodedBuffer?.duration : activeAudio.duration);
                if (cur > 0 && (!dur || isNaN(dur) || cur < (dur - 1))) {
                    safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2));
                } else {
                    safeStorage.removeItem('cachymusic_last_track_time');
                }
            } catch (_) {}
        }
        window.addEventListener('beforeunload', persistCurrentPlaybackTimeOnExit);
        window.addEventListener('pagehide', persistCurrentPlaybackTimeOnExit);

        // Keep OS media session synced as paused when tab is hidden while paused
        document.addEventListener('visibilitychange', () => {
            const activeAudio = store.state.audio;
            if (playerCoreModule.nativePosition()!==null)return;
            if (document.hidden && (store.state.userExplicitlyPaused || !activeAudio || activeAudio.paused)) {
                mediaSessionController.syncPlaybackState('paused');
            }
        });

        // Initial Repeat UI sync
        updateRepeatUI();



        // Both scrubbers share one pointer owner and one track-generation guard.
        const getDuration = () => {
            const s = store.state;
            const track = s.isStandalonePlayback ? s.standaloneTrackList?.[s.standaloneTrackIndex] : s.allTracks[s.currentTrackIndex];
            const native = playerCoreModule.nativeDuration();
            const candidates = [native !== null ? native : s.isSoftwareDecoding ? s.activeDecodedBuffer?.duration : s.audio?.duration, track?.duration];
            return candidates.find(v => Number.isFinite(v) && v > 0) || 0;
        };
        const getPosition = () => playerCoreModule.nativePosition() ?? (store.state.isSoftwareDecoding ? softwarePosition() : store.state.audio?.currentTime || 0);
        const tooltip = document.getElementById('progressHoverTooltip');
        const scrubber = createProgressScrubber({
            duration:getDuration, position:getPosition, identity:() => playerCoreModule.currentTrackGeneration,
            seek:seekAudio, dragging:active => {store.state.isDraggingScrubber = active;},
            paint:(pct, dur, el) => {
                for (const bar of [progressBar, miniProgressBar]) if (bar) bar.style.width = `${pct * 100}%`;
                const time = formatTime(pct * dur);
                for (const label of [currentTimeEl, miniCurrentTime]) if (label) label.textContent = time;
                if (tooltip && el === progressCon) {tooltip.textContent = time; tooltip.style.left = `${pct * 100}%`;}
            },
            hover:(pct, dur) => {
                if (progressHover) progressHover.style.width = `${(pct ?? 0) * 100}%`;
                if (tooltip) {
                    tooltip.style.opacity = pct === null ? '0' : '1';
                    if (pct !== null) {tooltip.textContent = formatTime(pct * dur); tooltip.style.left = `${pct * 100}%`;}
                }
            }
        });
        scrubber.attach(progressCon, true);
        window.addEventListener('pagehide', () => scrubber.cancel());

        // Mobile Viewport Navigation Switcher (Instant 0ms Pointerdown Fast-Path)
        const mobileTabBtns = document.querySelectorAll('.mobileTabBtn');
        mobileTabBtns.forEach(btn => {
            bindFastAction(btn, () => {
                const target = btn.dataset.target;
                if (target === 'soulseekWorkspace') {
                    switchWorkspace('soulseek');
                } else if (target === 'settingsWorkspace' || target === 'downloadWorkspace') {
                    switchWorkspace('settings');
                } else {
                    switchWorkspace('player', target);
                }
            });
        });

        compactLayout.addEventListener('change', () => {
            if (store.state.currentWorkspace === 'player') switchWorkspace('player');
        });

        // Volume Deck & Scroll Control
        const volumeDeck = document.querySelector('.volumeDeck');

        function handleVolumeWheel(e) {
            e.preventDefault();
            // Determine scroll direction (supports vertical wheel & horizontal scroll / trackpad)
            const delta = e.deltaY !== 0 ? -e.deltaY : e.deltaX;
            if (delta === 0) return;

            // 5% step normally, 1% fine step if Shift key is held
            const step = (e.shiftKey ? 0.01 : 0.05) * (delta > 0 ? 1 : -1);
            let targetVol = Math.round((store.state.currentVolumeValue + step) * 100) / 100;
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
            const s = store.state;
            if (!s.audio) return;
            s.audio.muted = !s.audio.muted;
            audioEngineModule.syncSoftwareVolume();
            if (s.audio.muted) {
                volumeLevel.textContent = '0%';
                updateVolumeIcon(0);
                if (s.isHardwareGain) {
                    dispatchHardwareVolume(0);
                }
            } else {
                setVolume(s.currentVolumeValue, true);
            }
        });

        // Search Input (Debounced 80ms for fluid typing without layout stutter)
        let searchDebounceTimer = null;
        const trackSearchClearBtn = document.getElementById('trackSearchClearBtn');
        const syncSearchClearBtn = () => {
            if (!trackSearchClearBtn) return;
            trackSearchClearBtn.style.display = trackSearch.value.trim().length > 0 ? 'inline-flex' : 'none';
        };
        trackSearch.addEventListener('input', (e) => {
            store.state.searchQuery = e.target.value;
            syncSearchClearBtn();
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                applySearchAndSort();
            }, 80);
        });
        if (trackSearchClearBtn) {
            trackSearchClearBtn.addEventListener('click', () => {
                trackSearch.value = '';
                store.state.searchQuery = '';
                syncSearchClearBtn();
                applySearchAndSort();
                trackSearch.focus();
            });
        }

        // Sort Select
        if (sortSelect) {
            sortSelect.value = store.state.currentSort;
            sortSelect.addEventListener('change', (e) => {
                store.state.currentSort = e.target.value;
                try {
                    safeStorage.setItem('cachymusic_track_sort', store.state.currentSort);
                } catch (_) {}
                applySearchAndSort();
            });
        }

        // Main Tracks Refresh Button
        if (refreshTracksBtn) {
            refreshTracksBtn.addEventListener('click', async () => {
                refreshTracksBtn.textContent = 'REFRESHING...';
                refreshTracksBtn.disabled = true;
                store.state.dismissedTracksMap.clear();
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
                const s = store.state;
                const count = s.dismissedTracksMap.size;
                if (count === 0) return;
                const active = s.allTracks[s.currentTrackIndex];
                for (const [, item] of s.dismissedTracksMap.entries()) {
                    const alreadyExists = findTrackIndex(s.allTracks, item.track) >= 0;
                    if (!alreadyExists) {
                        const insertIdx = Math.min(item.originalIndex ?? s.allTracks.length, s.allTracks.length);
                        s.allTracks.splice(insertIdx, 0, item.track);
                    }
                }
                s.dismissedTracksMap.clear();
                if (active) s.currentTrackIndex = findTrackIndex(s.allTracks, active);
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

        bindDisclosure(libraryToolsToggleBtnEl, libraryControls);

        tabLibrary.addEventListener('click', () => {
            tabLibrary.classList.add('active');
            tabPlaylists.classList.remove('active');
            if (tabQueue) tabQueue.classList.remove('active');
            trackList.style.display = 'flex';
            playlistsView.style.display = 'none';
            if (queueView) queueView.style.display = 'none';
            if (quickFormatFilterBarEl) quickFormatFilterBarEl.style.display = 'flex';
            if (store.state.currentPlaylistId) {
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
                store.state.currentFormatFilter = pill.dataset.filter || 'all';
                applySearchAndSort();
            });
        });

        // Queue Controls & Item Action Delegation
        if (clearQueueBtn) {
            clearQueueBtn.addEventListener('click', clearQueue);
        }

        if (queueView) {
            queueView.addEventListener('click', (e) => {
                const s = store.state;
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
                    if (idx >= 0 && idx < s.playQueue.length) {
                        const masterIdx = findTrackIndex(s.allTracks, s.playQueue[idx]);
                        if (masterIdx !== -1) {
                            s.playQueue.splice(idx, 1);
                            store.emit('library:update-queue');
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
                if (store.state.currentPlaylistId) {
                    playPlaylistDirectly(store.state.currentPlaylistId, store.state.currentPlaylistName, false);
                }
            });
        }

        const bannerShuffleBtn = document.getElementById('bannerShuffleBtn');
        if (bannerShuffleBtn) {
            bannerShuffleBtn.addEventListener('click', () => {
                if (store.state.currentPlaylistId) {
                    playPlaylistDirectly(store.state.currentPlaylistId, store.state.currentPlaylistName, true);
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
                switchWorkspace(store.state.currentWorkspace === 'settings' ? 'player' : 'settings');
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

        // Theme Modal: All 3 categories are displayed side-by-side in multi-column layout

        if (deleteCurrentPlaylistBtn) {
            deleteCurrentPlaylistBtn.addEventListener('click', async () => {
                const plid = store.state.currentPlaylistId;
                const plName = store.state.currentPlaylistName;
                if (!plid) return;
                if (!confirm(`Delete playlist "${plName}"?`)) return;
                await deletePlaylistById(plid);
            });
        }

        function openLibrarySettings() {
            switchWorkspace('settings');
            document.querySelector('#settingsCategoryNav [data-cat="library"]')?.click();
        }

        // Compact screens use the Library settings for importing music.
        if (toggleFolderBtn) {
            toggleFolderBtn.addEventListener('click', () => {
                if (compactLayout.matches) {
                    openLibrarySettings();
                    return;
                }
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
                openLibrarySettings();
                if (getRuntime().hasPhpBackend && !compactLayout.matches) {
                    document.getElementById('settingsTabFolderPathInput')?.focus();
                }
            });
        }

        // Native Android Bridge progress, cancellation & discovery receivers (registered on window.__cachyMusic.android)
        function handleAndroidScanProgress(count, total, folderName, etaSec) {
            if (store.state.isTrackLoadingCancelled) return;
            const pct = total > 0 ? Math.min(98, Math.round((count / total) * 100)) : 50;
            const etaText = (typeof etaSec === 'number' && etaSec > 0)
                ? ` • ETA: ~${etaSec}s`
                : (count > 0 && total > 0 && count < total ? ' • Fast index in progress...' : '');
            showTrackLoadingOverlay(
                'LOADING MUSIC LIBRARY...',
                `Scanning "${folderName || 'Device Storage'}" — ${count}${total > 0 ? ' / ' + total : ''} tracks indexed${etaText}`,
                pct
            );
        }

        function handleAndroidScanCancelled() {
            hideTrackLoadingOverlay();
            setScanStatus('Directory scan cancelled.', false);
            updateEmptyPlayerState();
        }

        async function handleAndroidTracksDiscovered(tracks, folderName) {
            hideTrackLoadingOverlay();
            if (store.state.isTrackLoadingCancelled) return;

            if (!Array.isArray(tracks) || tracks.length === 0) {
                const errStr = `No supported audio tracks found in "${folderName || 'Selected Folder'}".`;
                setScanStatus(`${errStr} Please configure your directory manually in Settings -> Library & Folders.`, true);
                updateEmptyPlayerState(errStr);
                return;
            }

            setScanStatus(`Loaded ${tracks.length} track(s) from "${folderName}".`, false);
            if (folderPathInput) folderPathInput.value = folderName;
            const sInput = document.getElementById('settingsTabFolderPathInput');
            if (sInput) sInput.value = folderName;

            const overrides=await loadAllMetadataOverrides();
            tracks=tracks.map(t=>({...t,...(overrides.get(String(t.tid||t.id||t.fullPath||t.filename))||{})}));
            store.state.allTracks = tracks;
            try {
                safeStorage.setItem('cachymusic_last_directory', folderName);
                safeStorage.setItem('cachymusic_directory_mode', 'android');
                safeStorage.removeItem('cachymusic_android_tracks');
            } catch (e) {
                console.warn('Could not cache tracks to localStorage, using IndexedDB:', e);
            }
            saveLibraryToIndexedDB(tracks, folderName);

            updateEmptyPlayerState();
            applySearchAndSort();
            if (store.state.allTracks.length > 0 && !store.state.isPlaying) {
                loadTrack(0, false);
            }
        }

        if (typeof window !== 'undefined' && window.__cachyMusic) {
            window.__cachyMusic.android = {
                onScanProgress: handleAndroidScanProgress,
                onScanCancelled: handleAndroidScanCancelled,
                onTracksDiscovered: handleAndroidTracksDiscovered
            };
        }

        // Folder Browse Action (Native Android SAF -> File System Access API -> Native OS Dialog -> HTML5 File/Folder Picker)
        async function openFolderBrowser() {
            const rt = getRuntime();
            if (rt.isAndroidNative && window.AndroidBridge && typeof window.AndroidBridge.openFolderPicker === 'function') {
                setScanStatus('Opening system folder directory picker...', false);
                try {
                    window.AndroidBridge.openFolderPicker();
                    return;
                } catch (err) {
                    console.warn('AndroidBridge.openFolderPicker error:', err);
                }
            }

            if (rt.hasPhpBackend) {
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
            } else if (rt.hasDirectoryPicker) {
                setScanStatus('Opening local music folder picker...', false);
                const tracks = await promptLocalDirectoryOrFiles();
                if (tracks && tracks.length > 0) return;
            }

            const mobileInput = document.getElementById('mobileAudioFilesInput');
            if ((rt.isIOS || !folderPickerInput) && (mobileInput || localFileInput)) {
                setScanStatus('Select local audio files to build offline library...', false);
                (mobileInput || localFileInput).click();
                return;
            }

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
                const rt = getRuntime();
                if (rt.isAndroidNative && window.AndroidBridge && typeof window.AndroidBridge.scanDeviceMusic === 'function') {
                    setScanStatus('Scanning device music library...', false);
                    showTrackLoadingOverlay('SCANNING DEVICE MUSIC...', 'Searching audio files across device storage...', 15);
                    window.AndroidBridge.scanDeviceMusic();
                } else {
                    const mobileInput = document.getElementById('mobileAudioFilesInput');
                    if (mobileInput) {
                        mobileInput.click();
                    } else if (localFileInput) {
                        localFileInput.click();
                    } else {
                        openFolderBrowser();
                    }
                }
            });
        }

        const mobileAudioFilesInput = document.getElementById('mobileAudioFilesInput');
        if (mobileAudioFilesInput) {
            mobileAudioFilesInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;
                await importLocalAudioFiles(files, 'Imported Audio Files');
                mobileAudioFilesInput.value = '';
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
                    setScanStatus(`${msg} Please choose another folder or import audio files directly.`, true);
                    updateEmptyPlayerState(msg);
                    folderPickerInput.value = '';
                    return;
                }

                const rt = getRuntime();
                let serverScanned = false;

                if (rt.hasPhpBackend) {
                    showTrackLoadingOverlay(
                        'LOADING MUSIC LIBRARY...',
                        `Scanning ${audioFiles.length} audio files from "${folderName}"...`,
                        10
                    );
                    setScanStatus(`Reading ${audioFiles.length} audio files from "${folderName}"...`, false);

                    const candidatePaths = [
                        folderPathInput ? folderPathInput.value.trim() : '',
                        `~/Music/${folderName}`,
                        `~/Downloads/${folderName}`,
                        `~/${folderName}`,
                        folderName
                    ].filter(Boolean);

                    for (const cand of candidatePaths) {
                        if (store.state.isTrackLoadingCancelled) break;
                        try {
                            store.state.activeScanAbortController = new AbortController();
                            const res = await fetch(`php/api/scan.php?directory=${encodeURIComponent(cand)}`, {
                                signal: store.state.activeScanAbortController.signal
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
                                    if (store.state.dismissedTracksMap.size > 0) {
                                        store.state.allTracks = data.tracks.filter(t => !store.state.dismissedTracksMap.has(dismissalKey(t)));
                                    } else {
                                        store.state.allTracks = data.tracks;
                                    }
                                    saveLibraryToIndexedDB(store.state.allTracks, resolvedDir);
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
                            store.state.activeScanAbortController = null;
                        }
                    }
                }

                if (!serverScanned && !store.state.isTrackLoadingCancelled) {
                    await importLocalAudioFiles(audioFiles, folderName);
                } else {
                    hideTrackLoadingOverlay();
                }
                folderPickerInput.value = '';
            });
        }

        // Create Playlist in Tab (Dual Standalone IDB + PHP Backend via library.js)
        createPlaylistBtn.addEventListener('click', async () => {
            const name = newPlaylistInput.value.trim();
            if (!name) {
                newPlaylistInput.focus();
                return;
            }
            const created = await createPlaylist(name);
            if (created) {
                newPlaylistInput.value = '';
                renderPlaylistsView();
                showToast(`Playlist "${created.name}" created!`, 'OPEN', () => {
                    openPlaylist(created.plid, created.name);
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
            const targetTrack = store.state.selectedTrackForPlaylist;
            if (!name || !targetTrack) {
                if (modalNewPlaylistName) modalNewPlaylistName.focus();
                return;
            }

            const created = await createPlaylist(name);
            if (created) {
                await addTrackToPlaylist(created.plid, targetTrack.tid || targetTrack.id, targetTrack);
                closePlaylistModal();
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
                    const track = store.state.selectedTrackForMenu;
                    if (!track) return;
                    addToQueue(track, true);
                    closeTrackActionMenu();
                    showToast(`Added to Play Next: "${track.title || track.filename}"`);
                });
            }

            if (enqueueBtn) {
                enqueueBtn.addEventListener('click', () => {
                    const track = store.state.selectedTrackForMenu;
                    if (!track) return;
                    addToQueue(track, false);
                    closeTrackActionMenu();
                    showToast(`Added to Up Next Queue: "${track.title || track.filename}"`);
                });
            }

            if (addToPlaylistBtn) {
                addToPlaylistBtn.addEventListener('click', () => {
                    const track = store.state.selectedTrackForMenu;
                    if (!track) return;
                    closeTrackActionMenu();
                    openAddToPlaylistModal(track);
                });
            }

            if (viewInfoBtn) {
                viewInfoBtn.addEventListener('click', () => {
                    const track = store.state.selectedTrackForMenu;
                    if (!track) return;
                    closeTrackActionMenu();
                    updateTrackMetadataDisplay(track);
                    if (compactLayout.matches) {
                        switchWorkspace('player', 'settingsPanel');
                    } else {
                        toggleMetadataPanel(true);
                    }
                });
            }

            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    const track = store.state.selectedTrackForMenu;
                    if (!track) return;
                    closeTrackActionMenu();
                    if (store.state.currentPlaylistId !== null) {
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

            const coverFileInput = document.getElementById('metaEditorCoverFileInput');
            const uploadOverlayBtn = document.getElementById('metaEditorUploadOverlayBtn');
            const browseCoverBtn = document.getElementById('metaEditorBrowseCoverBtn');
            const revertCoverBtn = document.getElementById('metaEditorRevertCoverBtn');

            if (uploadOverlayBtn && coverFileInput) {
                uploadOverlayBtn.addEventListener('click', () => coverFileInput.click());
            }
            if (browseCoverBtn && coverFileInput) {
                browseCoverBtn.addEventListener('click', () => coverFileInput.click());
            }
            if (coverFileInput) {
                coverFileInput.addEventListener('change', function() {
                    if (this.files && this.files[0]) {
                        handleCoverFileSelect(this.files[0]);
                    }
                });
            }
            if (revertCoverBtn) {
                revertCoverBtn.addEventListener('click', () => {
                    revertCover();
                });
            }
            if (closeBtn) {
                closeBtn.addEventListener('click', () => closeMetadataEditor());
            }
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => closeMetadataEditor());
            }
            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (typeof requestSaveMetadataConfirmation === 'function') {
                        requestSaveMetadataConfirmation(e);
                    } else {
                        saveMetadata(e);
                    }
                });
            }
            if (confirmCancelBtn) {
                confirmCancelBtn.addEventListener('click', () => cancelMetadataConfirmation());
            }
            if (confirmProceedBtn) {
                confirmProceedBtn.addEventListener('click', () => executeSaveMetadata());
            }
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) closeMetadataEditor();
                });
            }
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    if (typeof requestSaveMetadataConfirmation === 'function') {
                        requestSaveMetadataConfirmation(e);
                    } else {
                        saveMetadata(e);
                    }
                });
            }
            if (infoEditBtn) {
                infoEditBtn.addEventListener('click', () => {
                    const s = store.state;
                    const track = s.currentInspectedTrack || (Array.isArray(s.allTracks) && s.allTracks[s.currentTrackIndex]) || null;
                    if (track) {
                        openMetadataEditor(track);
                    } else {
                        showToast('No active track loaded to edit metadata');
                    }
                });
            }
        }
        setupMetadataEditorModal();
        setupMetadataLookup();

        async function handleOpenStandaloneAudioFiles(files) {
            const s = store.state;
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
                if (s.isTrackLoadingCancelled) break;
                const file = audioFiles[i];
                const pct = Math.min(98, Math.round(((i + 1) / audioFiles.length) * 100));
                updateTrackLoadingOverlay(`Reading metadata (${i + 1}/${audioFiles.length}): ${file.name}`, pct);
                if (i % 5 === 0 || i === audioFiles.length - 1) {
                    setScanStatus(`Reading audio metadata (${i + 1}/${audioFiles.length})...`, false);
                }


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
                    bitDepth: (parsed && parsed.bitDepth) ? parsed.bitDepth : null,
                    channels: (parsed && parsed.channels) ? parsed.channels : 2,
                    format: (parsed && parsed.format) ? parsed.format : (file.name.split('.').pop() || 'audio'),
                    size: (parsed && parsed.size) ? parsed.size : (file.size ? (file.size / (1024 * 1024)).toFixed(2) + ' MB' : 'N/A'),
                    cover: (parsed && parsed.cover) ? parsed.cover : null,
                    src: null,
                    _fileBlob: file,
                    isStandalone: true
                });
            }

            hideTrackLoadingOverlay();
            if (!s.isTrackLoadingCancelled && openedTracks.length > 0) {
                setScanStatus(`Loaded ${openedTracks.length} standalone file(s).`, false);
                s.standaloneTrackList = openedTracks;
                s.standaloneTrackIndex = 0;
                s.isStandalonePlayback = true;
                await loadStandaloneTrack(0, true);
            }
        }

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
                const s = store.state;
                if(s.isSoftwareDecoding){showToast("Playback speed changes require the native decoder; PCM fallback plays at 1×.");return;}
                speedBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const speed = parseFloat(btn.dataset.speed);
                s.currentPlaybackSpeed = speed;
                if (s.audio) {
                    s.audio.playbackRate = speed;
                    try {
                        s.audio.preservesPitch = s.isPitchLockTempo;
                        s.audio.mozPreservesPitch = s.isPitchLockTempo;
                        s.audio.webkitPreservesPitch = s.isPitchLockTempo;
                    } catch (_) {}
                }

                const basePeriod = 1.8;
                document.documentElement.style.setProperty('--platter-speed', `${(basePeriod / speed).toFixed(2)}s`);
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
        scrubber.attach(miniProgressCon);

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
        if (miniMuteBtn) {
            miniMuteBtn.addEventListener('click', () => {
                const s = store.state;
                if (!s.audio) return;
                s.audio.muted = !s.audio.muted;
                audioEngineModule.syncSoftwareVolume();
                if (s.audio.muted) {
                    volumeLevel.textContent = '0%';
                    updateVolumeIcon(0);
                    if (s.isHardwareGain) dispatchHardwareVolume(0);
                } else {
                    setVolume(s.currentVolumeValue, true);
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
        if (wsDownloadBtn) bindFastAction(wsDownloadBtn, () => switchWorkspace('settings'));

        // Soulseek / P2P toolbar power triggers (loads P2P module on demand)
        if (slskPowerBtn) {
            slskPowerBtn.addEventListener('click', () => {
                getP2pModule().then(m => m && m.soulseekController && m.soulseekController.togglePower());
            });
        }
        if (slskModalPowerBtn) {
            slskModalPowerBtn.addEventListener('click', () => {
                getP2pModule().then(m => m && m.soulseekController && m.soulseekController.togglePower());
            });
        }
        if (slskAccountBtn) {
            slskAccountBtn.addEventListener('click', () => {
                getP2pModule();
            });
        }

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('view') === 'soulseek' || window.location.hash === '#soulseek') {
            switchWorkspace('soulseek');
            if (urlParams.get('slsk_open') === '1') {
                setMobileSearchPanelCollapsed(false);
            }
        } else if (urlParams.get('view') === 'settings' || window.location.hash === '#settings' || urlParams.get('tab') === 'settings') {
            switchWorkspace('settings');
        } else if (urlParams.get('panel')) {
            switchWorkspace('player', urlParams.get('panel'));
        }
        if (urlParams.get('lyrics') === '1' || window.location.hash === '#lyrics') {
            toggleLyricsView(true);
        }
        if (urlParams.get('vis')) {
            getVisualizerModule().then(m => m && m.setVisualizerMode && m.setVisualizerMode(urlParams.get('vis')));
        }
        if (urlParams.get('theme')) {
            applyTheme(urlParams.get('theme'), false);
        } else {
            applyTheme(store.state.activeTheme, false);
        }
        if (urlParams.get('modal') === 'theme' || window.location.hash === '#theme') {
            openThemeModal();
            if (urlParams.get('scroll_theme') === '1') {
                const tc = document.querySelector('.themeModalCard');
                if (tc) tc.scrollTop = tc.scrollHeight;
            }
        }
        if (urlParams.get('modal') === 'playlist') {
            const targetTrack = (store.state.allTracks && store.state.allTracks.length > 0) ? store.state.allTracks[0] : null;
            if (targetTrack) openAddToPlaylistModal(targetTrack);
        }
        if (urlParams.get('modal') === 'slsk' || urlParams.get('modal') === 'soulseek') {
            getP2pModule();
            openSlskAccountModal();
        }
        if (urlParams.get('modal') === 'signal' || window.location.hash === '#signal') {
            openSignalPathModal();
        }
        if (urlParams.get('modal') === 'peq' || urlParams.get('modal') === 'eq' || window.location.hash === '#peq') {
            setTimeout(() => {
                const peqBtn = document.getElementById('playerPeqBtn');
                if (peqBtn) peqBtn.click();
                else openPeqModal();
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
                    if (compactLayout.matches) {
                        switchWorkspace('player', 'trackListPanel');
                        tabLibrary.click();
                    }
                    searchEl.focus();
                    searchEl.select();
                    return;
                }
            }

            // Workspace Hotkeys (Alt+S for Soulseek, Alt+P for Player, Alt+D for Settings (legacy shortcut))
            if (e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                switchWorkspace(store.state.currentWorkspace === 'soulseek' ? 'player' : 'soulseek');
                return;
            }
            if (e.altKey && (e.code === 'KeyD' || e.key === 'd' || e.key === 'D')) {
                e.preventDefault();
                switchWorkspace(store.state.currentWorkspace === 'settings' ? 'player' : 'settings');
                return;
            }
            if (e.altKey && (e.code === 'KeyO' || e.key === 'o' || e.key === 'O')) {
                e.preventDefault();
                switchWorkspace(store.state.currentWorkspace === 'settings' ? 'player' : 'settings');
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
                else {
                    const s = store.state;
                    const curTime = playerCoreModule.nativePosition() ?? (s.isSoftwareDecoding ? softwarePosition() : (s.audio ? s.audio.currentTime : 0));
                    seekAudio(curTime + 5);
                }
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                if (e.shiftKey) prevTrack();
                else {
                    const s = store.state;
                    const curTime = playerCoreModule.nativePosition() ?? (s.isSoftwareDecoding ? softwarePosition() : (s.audio ? s.audio.currentTime : 0));
                    seekAudio(Math.max(0, curTime - 5));
                }
            } else if (e.code === 'ArrowUp') {
                e.preventDefault();
                setVolume(store.state.currentVolumeValue + 0.05, true);
            } else if (e.code === 'ArrowDown') {
                e.preventDefault();
                setVolume(store.state.currentVolumeValue - 0.05, true);
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

        // Downloads and P2P controls initialize on first workspace visit.
        // Local listening should not parse the entire network client at startup.
    }

    // Single Coordinator Namespace (Zero loose window.* property pollution)
    if (typeof window !== 'undefined') {
        window.__cachyMusic = {
            store,
            player: playerCoreModule,
            engine: audioEngineModule,
            library: libraryModule,
            p2p: loadedP2pModule,
            runtime: getRuntime(),
            android: {
                onTracksDiscovered: null,
                onScanProgress: null,
                onScanCancelled: null
            },
            peq: {
                frequencies: PEQ_FREQS,
                getGains: () => [...store.state.peqGains],
                setGain: audioEngineModule.setPeqBandGain,
                setPreset: audioEngineModule.setPeqPreset,
                importProfile: audioEngineModule.importAutoEqProfile
            }
        };
    }

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
