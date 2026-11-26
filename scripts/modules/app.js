import {installRecordingLease} from './recording-lease.js';
import {requestServerBrowse} from './server-scan.js';
import {initCompactMedia} from './compact-media.js';
import {initListeningHistory} from './listening-history.js';
import {playlistNavigationToken} from './library.js';
import {bindSettingsNavigation} from './settings-navigation.js';
import {bindTransportControls} from './transport-controls.js';
import {bindPlatterSwipe} from './platter-gesture.js';
import {installModalFocus} from './modal-focus.js';
import {findTrackIndex} from './track-session.js';
import {bindDisclosure} from './control-ui.js';
import {createProgressScrubber} from './progress-scrubber.js';
import { uiIcon } from './icons.js';
import {loadAllMetadataOverrides} from './local-library.js';
import { bindMetadataEditor } from './library.js';
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
    setLibraryTabActive,
    tabPlaylists,
    tabQueue,
    themeModal,
    themeModalBtn,
    themeQuickBtns,
    themeSelectCards,
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
import { installKeyboardShortcuts } from './keyboard-shortcuts.js';
import { setProgressFraction } from './player-progress.js';
import { hydrateActiveCustomThemeOnBoot } from './custom-theme-engine.js';
import {
    applyTheme,
    closeThemeModal,
    openThemeModal,
    openThemeStudio
} from './themes.js';
import * as audioEngineModule from './audio-engine.js';
import {
    checkHardwareGainStatus,
    closePeqModal,
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
    backToAllTracks,
    clearQueue,
    closeBatchAddModal,
    closeMetadataEditor,
    closePlaylistModal,
    closeSlskAccountModal,
    closeTrackActionMenu,
    createPlaylist,
    deletePlaylistById,
    importLocalAudioFiles,
    loadLibraryFromIndexedDB,
    loadPlaylists,
    moveQueueItem,
    openAddToPlaylistModal,
    openBatchAddModal,
    openPlaylistEditor,
    queuePlaylistTracks,
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
    saveLibraryToIndexedDB,
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
        if (!willCollapse) store.emit('ui:hydrate-artwork');
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
        if(runtime.hasPhpBackend&&!runtime.isAndroidNative)installRecordingLease(store,()=>console.warn('Recording reservation unavailable; playback continues.'));
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
        bindSettingsNavigation({storage:safeStorage, initialCategory:new URLSearchParams(window.location.search).get('cat') || safeStorage.getItem('cachymusic_settings_cat') || 'audio'});
        await checkHardwareGainStatus();
        setVolume(s.currentVolumeValue, true, false, {preserveMute:true,dispatchSystem:false});
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
            if (savedMetaVisible !== 'true' && !compactLayout.matches) {
                toggleMetadataPanel(false);
            }
        } catch (_) {}

        initMprisBridge();
        void hydrateActiveCustomThemeOnBoot().then(applied => {
            if (applied) {
                store.emit('visualizer:ensure-themes');
                store.emit('peq:redraw');
            }
        });
    }


    // Setup All Event Handlers
    function setupEventListeners() {
        installModalFocus();
        initListeningHistory({playTrack:index=>loadTrack(index,true,0,null,false,false,null)});
        initCompactMedia();
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

        bindTransportControls({ state: store.state, play: togglePlayPause, previous: prevTrack, next: nextTrack,
            setVolume, syncVolume: audioEngineModule.syncSoftwareVolume, updateVolumeIcon, volumeLevel,
            onOrderChange: () => store.emit('playback:order-change'), updateRepeat: updateRepeatUI,
            playButtons: [playPauseBtn, miniPlayBtn], previousButtons: [prevBtn, miniPrevBtn], nextButtons: [nextBtn, miniNextBtn],
            muteButtons: [muteBtn, miniMuteBtn], shuffleBtn, shufflePlayBtn, repeatBtn });

        // Continuous Native Media Event Synchronization
        attachAudioListeners(store.state.audio);

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
                for (const bar of [progressBar, miniProgressBar]) setProgressFraction(bar, pct);
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
        const libraryToolsToggleBtnEl = document.getElementById('libraryToolsToggleBtn');
        const syncSortActiveUi = () => {
            const active = store.state.currentSort && store.state.currentSort !== 'default';
            libraryToolsToggleBtnEl?.classList.toggle('has-active-sort', active);
            sortSelect?.setAttribute('data-sort-active', String(Boolean(active)));
        };
        if (sortSelect) {
            sortSelect.value = store.state.currentSort;
            sortSelect.addEventListener('change', (e) => {
                store.state.currentSort = e.target.value;
                try {
                    safeStorage.setItem('cachymusic_track_sort', store.state.currentSort);
                } catch (_) {}
                syncSortActiveUi();
                applySearchAndSort();
            });
        }
        syncSortActiveUi();

        // Main Tracks Refresh Button
        if (refreshTracksBtn) {
            refreshTracksBtn.addEventListener('click', async () => {
                refreshTracksBtn.textContent = 'Scanning…';
                refreshTracksBtn.disabled = true;
                store.state.dismissedTracksMap.clear();
                updateRestoreBtnUi();
                const path = (folderPathInput && folderPathInput.value.trim()) 
                    ? folderPathInput.value.trim() 
                    : (safeStorage.getItem('cachymusic_last_directory') || '');
                await scanDirectory(path);
                refreshTracksBtn.textContent = 'Scan complete';
                setTimeout(() => {
                    refreshTracksBtn.textContent = 'Rescan';
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

        bindDisclosure(libraryToolsToggleBtnEl, libraryControls);

        tabLibrary.addEventListener('click', () => {
            backToAllTracks();
            setLibraryTabActive('tabLibrary');
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
            backToPlaylistsView();
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
                setLibraryTabActive('tabQueue');
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
                formatPillBtns.forEach(p => {p.classList.remove('active');p.setAttribute('aria-pressed','false');});
                pill.classList.add('active');
                pill.setAttribute('aria-pressed','true');
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
                            loadTrack(masterIdx, true, 0, null, false, true);
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
        const diagnosticBtn=document.getElementById('audioDiagnosticBtn'),diagnosticStatus=document.getElementById('audioDiagnosticStatus');
        diagnosticBtn?.addEventListener('click',async()=>{
            diagnosticBtn.disabled=true;const result=document.getElementById('audioDiagnosticResult');result.hidden=true;result.value='';diagnosticStatus.textContent='Collecting audio diagnostics…';
            try{
                const report=await audioEngineModule.collectAudioDiagnostic({valid:()=>signalPathModal?.style.display==='flex'});
                if(signalPathModal?.style.display!=='flex')return;
                const runtime=getRuntime();report.platform={mode:runtime.mode,os:runtime.osFamily};
                const json=JSON.stringify(report,null,2);result.value=json;result.hidden=false;const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob);
                const a=document.createElement('a');a.href=url;a.download='cachymusic-audio-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
                diagnosticStatus.textContent='Report prepared locally. Copy the text below if the download is unavailable. Review before sharing.';
            }catch{diagnosticStatus.textContent='Could not prepare the audio report.';}finally{diagnosticBtn.disabled=false;}
        });
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

        // The picker owns its commit button.
        document.getElementById('bannerEditPlaylistBtn')?.addEventListener('click',openPlaylistEditor);
        document.getElementById('bannerQueueBtn')?.addEventListener('click',()=>queuePlaylistTracks(store.state.currentPlaylistId,store.state.currentPlaylistName));

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
                if (!confirm(`Delete playlist "${plName}"? Your audio files will be kept.`)) return;
                await deletePlaylistById(plid,plName);
            });
        }

        function openLibrarySettings() {
            switchWorkspace('settings');
            document.querySelector('#settingsCategoryNav [data-cat="library"]')?.click();
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
            const pct = total > 0 ? Math.min(100, Math.round((count / total) * 100)) : null;
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
        let folderBrowsePending=false;
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

                if(folderBrowsePending)return;
                folderBrowsePending=true;
                try {
                    const data=await requestServerBrowse({directory:curPath});
                    if (data.success && data.directory) {
                        if (folderPathInput) folderPathInput.value = data.directory;
                        const sInput = document.getElementById('settingsTabFolderPathInput');
                        if (sInput) sInput.value = data.directory;
                        setScanStatus(`Selected directory: ${data.directory}. Scanning library...`, false);
                        await scanDirectory(data.directory, true);
                        return;
                    }
                    if(data.cancelled){setScanStatus('Folder selection cancelled.', false);return;}
                    if(!data.fallback){setScanStatus(data.message||'Folder selection failed.',true);return;}
                } catch (err) {
                    setScanStatus(err?.message||'Native folder chooser unavailable.',true);
                    return;
                } finally {folderBrowsePending=false;}
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
                    showTrackLoadingOverlay('SCANNING DEVICE MUSIC...', 'Searching audio files across device storage...');
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

                // Browser file selection authorizes these files, not a guessed
                // server directory with the same basename. Native/manual path
                // scans use scanDirectory and its existing operation ownership.
                try { await importLocalAudioFiles(audioFiles, folderName); }
                finally { folderPickerInput.value = ''; }
            });
        }

        // Create Playlist in Tab (Dual Standalone IDB + PHP Backend via library.js)
        createPlaylistBtn.addEventListener('click', async () => {
            const name = newPlaylistInput.value.trim();
            if (!name) {
                newPlaylistInput.focus();
                return;
            }
            if(createPlaylistBtn.disabled)return;createPlaylistBtn.disabled=true;
            const navigation=playlistNavigationToken();try {const created=await createPlaylist(name);if(created){if(newPlaylistInput.value.trim()===name)newPlaylistInput.value='';if(navigation===playlistNavigationToken()&&playlistsView?.getClientRects().length)await openPlaylist(created.plid,created.name);else showToast('Playlist created.');}}finally{createPlaylistBtn.disabled=false;}
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

            if(modalCreateAndAddBtn.disabled)return;modalCreateAndAddBtn.disabled=true;try{const created=await createPlaylist(name,targetTrack);if(created&&store.state.selectedTrackForPlaylist===targetTrack){closePlaylistModal();showToast('Playlist created and song added.');}}finally{modalCreateAndAddBtn.disabled=false;}
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

        bindMetadataEditor();

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
                0
            );
            setScanStatus(`Reading ${audioFiles.length} standalone audio file(s)...`, false);
            const openedTracks = [];

            for (let i = 0; i < audioFiles.length; i++) {
                if (s.isTrackLoadingCancelled) break;
                const file = audioFiles[i];
                const pct = Math.round((i / audioFiles.length) * 100);
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
                    sampleRate: (parsed && parsed.sampleRate) ? parsed.sampleRate : 0,
                    bitDepth: (parsed && parsed.bitDepth) ? parsed.bitDepth : null,
                    channels: (parsed && parsed.channels) ? parsed.channels : null,
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
                const speed = parseFloat(btn.dataset.speed);
                if (s.isSoftwareDecoding && (s.isStandalonePlayback || s.currentTrackIndex < 0)) {
                    showToast("Playback speed changes require the standard audio element; standalone PCM plays at 1×.");
                    return;
                }
                speedBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                s.currentPlaybackSpeed = speed;
                if (s.audio) {
                    s.audio.playbackRate = speed;
                    try {
                        s.audio.preservesPitch = s.isPitchLockTempo;
                        s.audio.mozPreservesPitch = s.isPitchLockTempo;
                        s.audio.webkitPreservesPitch = s.isPitchLockTempo;
                    } catch (_) {}
                }

                mediaSessionController.syncPlaybackState(s.isPlaying);
                const basePeriod = 1.8;
                document.documentElement.style.setProperty('--platter-speed', `${(basePeriod / speed).toFixed(2)}s`);
                if (s.isSoftwareDecoding && speed !== 1) {
                    loadTrack(s.currentTrackIndex, !s.isSoftwarePaused, softwarePosition(), null, true);
                }
            });
        });

        // Taps are noninteractive; one deliberate touch swipe navigates.
        if(vinylTurntable)bindPlatterSwipe(vinylTurntable,{next:nextTrack,previous:prevTrack});

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

        const settingsTabOpenStudioBtn = document.getElementById('settingsTabOpenThemeStudioBtn');
        if (settingsTabOpenStudioBtn) {
            settingsTabOpenStudioBtn.addEventListener('click', () => {
                void openThemeStudio();
            });
        }
        const themeModalOpenStudioBtn = document.getElementById('themeModalOpenStudioBtn');
        if (themeModalOpenStudioBtn) {
            themeModalOpenStudioBtn.addEventListener('click', () => {
                closeThemeModal();
                void openThemeStudio();
            });
        }

        // Mini Player & Soulseek Studio Listeners
        scrubber.attach(miniProgressCon);

        if (miniDeckReturnBtn) bindFastAction(miniDeckReturnBtn, () => switchWorkspace('player', 'playerDeck'));
        const miniPlayerLeftEl = document.querySelector('.miniPlayerLeft');
        if (miniPlayerLeftEl) {
            miniPlayerLeftEl.style.cursor = 'pointer';
            bindFastAction(miniPlayerLeftEl, () => switchWorkspace('player', 'playerDeck'));
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

        function applyInitialUrlIntent() {
            const urlParams = new URLSearchParams(window.location.search);
            const tab = urlParams.get('tab');
            const view = urlParams.get('view');
            const modal = urlParams.get('modal');
            const hash = window.location.hash;

            if (tab === 'playlists' || hash === '#playlists') {
                tabPlaylists?.click();
            }
            if (view === 'soulseek' || tab === 'soulseek' || hash === '#soulseek') {
                switchWorkspace('soulseek');
                if (urlParams.get('slsk_open') === '1') setMobileSearchPanelCollapsed(false);
            } else if (view === 'settings' || tab === 'settings' || view === 'download' || tab === 'download' || hash === '#settings' || hash === '#download') {
                switchWorkspace(view === 'download' || tab === 'download' || hash === '#download' ? 'download' : 'settings');
            } else if (urlParams.get('panel')) {
                switchWorkspace('player', urlParams.get('panel'));
            }
            if (urlParams.get('lyrics') === '1' || hash === '#lyrics') {
                toggleLyricsView(true);
            }
            if (urlParams.get('vis')) {
                getVisualizerModule().then(m => m?.setVisualizerMode?.(urlParams.get('vis')));
            }
            applyTheme(urlParams.get('theme') || store.state.activeTheme, false);
            if (modal === 'theme' || hash === '#theme') {
                openThemeModal();
                if (urlParams.get('scroll_theme') === '1') {
                    const tc = document.querySelector('.themeModalCard');
                    if (tc) tc.scrollTop = tc.scrollHeight;
                }
            }
            if (modal === 'playlist') {
                const targetTrack = store.state.allTracks?.[0] || null;
                if (targetTrack) openAddToPlaylistModal(targetTrack);
            }
            if (modal === 'slsk' || modal === 'soulseek') {
                getP2pModule();
                openSlskAccountModal();
            }
            if (modal === 'signal' || hash === '#signal') {
                openSignalPathModal();
            }
            if (modal === 'peq' || modal === 'eq' || hash === '#peq') {
                setTimeout(() => {
                    const peqBtn = document.getElementById('playerPeqBtn');
                    if (peqBtn) peqBtn.click();
                    else openPeqModal();
                }, 80);
            }
            if (urlParams.get('play') === '1') {
                setTimeout(() => loadTrack(0, true), 300);
                try {
                    const cleanUrl = new URL(window.location.href);
                    cleanUrl.searchParams.delete('play');
                    window.history.replaceState({}, document.title, cleanUrl.pathname + (cleanUrl.search || '') + cleanUrl.hash);
                } catch (_) {}
            }
        }
        applyInitialUrlIntent();

        installKeyboardShortcuts({
            store,
            compactLayout,
            tabLibrary,
            tabQueue,
            queueView,
            muteBtn,
            switchWorkspace,
            nextTrack,
            prevTrack,
            togglePlayPause,
            seekAudio,
            setVolume,
            toggleLyricsView,
            toggleMetadataPanel,
            toggleTracklistPanel,
            getPosition: () => {
                const s = store.state;
                return playerCoreModule.nativePosition() ?? (s.isSoftwareDecoding ? softwarePosition() : (s.audio ? s.audio.currentTime : 0));
            },
            openPeqModal,
            closePeqModal,
            modalClosers: {
                themeModal: closeThemeModal,
                playlistModal: closePlaylistModal,
                trackActionMenuModal: closeTrackActionMenu,
                signalPathModal: closeSignalPathModal,
                sleepTimerModal: closeSleepTimerModal,
                slskAccountModal: closeSlskAccountModal,
                peqModal: closePeqModal,
                batchAddSongsModal: closeBatchAddModal,
                metadataEditorModal: closeMetadataEditor
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
