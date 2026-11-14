// CachyMusic - UI Elements & Workspace Shell
import { formatTime, safeStorage, setScanStatus, showToast } from './utils.js';
import { store } from './state.js';

    // DOM Elements - Player & Audio (live reference stored on store.state.audio)
    const audioPlayerEl = store.state.audio || document.getElementById('audioPlayer');
    if (audioPlayerEl) {
        audioPlayerEl.crossOrigin = 'anonymous';
        store.state.audio = audioPlayerEl;
    }

    const vinylTurntable = document.getElementById('vinylTurntable');
    const toneArm = document.getElementById('toneArm');
    const vinylArt = document.getElementById('vinylArt');
    const vinylLabel = document.getElementById('vinylLabel');
    const deckArtworkBackdrop = document.getElementById('deckArtworkBackdrop');
    const deckArtworkAmbient = document.getElementById('deckArtworkAmbient');
    const turntableCenterVis = document.getElementById('turntableCenterVis');
    const turntableCenterCanvas = document.getElementById('turntableCenterCanvas');
    const turntableCenterCtx = turntableCenterCanvas ? turntableCenterCanvas.getContext('2d') : null;
    const bgDisc = document.querySelector('.bgDisc');
    const visualizerDock = document.getElementById('visualizerDock');
    const visualizerCanvas = document.getElementById('visualizerCanvas');
    const ctx = visualizerCanvas ? visualizerCanvas.getContext('2d') : null;
    const playerDeckEl = document.querySelector('.playerDeck');
    const trackListPanelEl = document.querySelector('.trackListPanel');
    const settingsPanelEl = document.querySelector('.settingsPanel');
    const infoPanelEl = document.getElementById('infoPanel');
    const cachedMobileTabBtns = Array.from(document.querySelectorAll('.mobileTabBtn'));
    const cachedAllPanelsList = [playerDeckEl, trackListPanelEl, settingsPanelEl].filter(Boolean);

    function setMobileTabActive(targetId) {
        for (let i = 0; i < cachedMobileTabBtns.length; i++) {
            const b = cachedMobileTabBtns[i];
            b.classList.toggle('active', b.dataset.target === targetId);
        }
    }

    function setMobilePanelsInactive() {
        for (let i = 0; i < cachedAllPanelsList.length; i++) {
            cachedAllPanelsList[i].classList.remove('mobileActive');
        }
    }

    function bindFastAction(el, action) {
        if (!el) return;
        let lastActionTime = 0;
        const handler = (e) => {
            if (e.type === 'pointerdown' && e.pointerType === 'mouse' && e.button !== 0) return;
            const now = performance.now();
            if (now - lastActionTime < 320) return;
            lastActionTime = now;
            action(e);
        };
        el.addEventListener('pointerdown', handler, { passive: true });
        el.addEventListener('click', (e) => {
            e.preventDefault();
            handler(e);
        });
    }

    // DOM Elements - Deck Actions (Metadata Inspector & Lyrics Toggles)
    const metadataToggleBtn = document.getElementById('metadataToggleBtn');
    const lyricsToggleBtn = document.getElementById('lyricsToggleBtn');
    const lyricsCon = document.getElementById('lyricsCon');
    const turntableCon = document.getElementById('turntableCon');
    const lyricsTrackName = document.getElementById('lyricsTrackName');
    const lyricsArtistName = document.getElementById('lyricsArtistName');
    const lyricsContent = document.getElementById('lyricsContent');
    const lyricsScrollArea = document.getElementById('lyricsScrollArea');

    const trackName = document.getElementById('trackName');
    const artistName = document.getElementById('artistName');
    const albumName = document.getElementById('albumName');
    const trackBadge = document.getElementById('trackBadge');
    const currentTimeEl = document.getElementById('currentTime');
    const totalDurationEl = document.getElementById('totalDuration');
    const progressCon = document.getElementById('progressCon');
    const progressBar = document.getElementById('progressBar');
    const progressHover = document.getElementById('progressHover');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playPauseImg = document.getElementById('playPauseImg');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const shufflePlayBtn = document.getElementById('shufflePlayBtn');
    const repeatBtn = document.getElementById('repeatBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const muteBtn = document.getElementById('muteBtn');
    const volumeLevel = document.getElementById('volumeLevel');
    const volumeIcon = document.getElementById('volumeIcon');
    const speedBtns = document.querySelectorAll('.speedBtn');

    // DOM Elements - Library, Playlists & Up Next Queue
    const tabLibrary = document.getElementById('tabLibrary');
    const tabPlaylists = document.getElementById('tabPlaylists');
    const tabQueue = document.getElementById('tabQueue');
    const queueView = document.getElementById('queueView');
    const queueList = document.getElementById('queueList');
    const upcomingLibraryList = document.getElementById('upcomingLibraryList');
    const queueCountBadge = document.getElementById('queueCountBadge');
    const queueCountSummary = document.getElementById('queueCountSummary');
    const clearQueueBtn = document.getElementById('clearQueueBtn');

    // DOM Elements - Audiophile Sleep Timer
    const sleepTimerBtn = document.getElementById('sleepTimerBtn');
    const sleepTimerLabel = document.getElementById('sleepTimerLabel');
    const sleepTimerModal = document.getElementById('sleepTimerModal');
    const closeSleepTimerModalBtn = document.getElementById('closeSleepTimerModalBtn');
    const sleepStatusCard = document.getElementById('sleepStatusCard');
    const sleepStatusRemaining = document.getElementById('sleepStatusRemaining');
    const cancelSleepTimerBtn = document.getElementById('cancelSleepTimerBtn');
    const customSleepInput = document.getElementById('customSleepInput');
    const setCustomSleepBtn = document.getElementById('setCustomSleepBtn');

    // DOM Elements - Signal Path Inspector & Audio Audit
    const signalPathBadgeBtn = document.getElementById('signalPathBadgeBtn');
    const signalPathLabel = document.getElementById('signalPathLabel');
    const deckSignalDot = document.getElementById('deckSignalDot');
    const openSignalAuditBtn = document.getElementById('openSignalAuditBtn');
    const signalPathModal = document.getElementById('signalPathModal');
    const closeSignalPathModalBtn = document.getElementById('closeSignalPathModalBtn');
    const auditQualityDot = document.getElementById('auditQualityDot');
    const auditQualityBadge = document.getElementById('auditQualityBadge');
    const auditQualityDesc = document.getElementById('auditQualityDesc');
    const auditMetricHeadroom = document.getElementById('auditMetricHeadroom');
    const auditMetricLatency = document.getElementById('auditMetricLatency');
    const statDynamicRange = document.getElementById('statDynamicRange');
    const statPeakLevel = document.getElementById('statPeakLevel');

    const libraryControls = document.getElementById('libraryControls');
    const playlistBanner = document.getElementById('playlistBanner');
    const currentPlaylistTitle = document.getElementById('currentPlaylistTitle');
    const backToLibraryBtn = document.getElementById('backToLibraryBtn');
    const deleteCurrentPlaylistBtn = document.getElementById('deleteCurrentPlaylistBtn');
    const standaloneBanner = document.getElementById('standaloneBanner');
    const standaloneBannerTitle = document.getElementById('standaloneBannerTitle');
    const standaloneResumeLibraryBtn = document.getElementById('standaloneResumeLibraryBtn');
    const standaloneCloseBtn = document.getElementById('standaloneCloseBtn');
    const trackList = document.getElementById('trackList');
    const playlistsView = document.getElementById('playlistsView');
    const playlistList = document.getElementById('playlistList');
    const newPlaylistInput = document.getElementById('newPlaylistInput');
    const createPlaylistBtn = document.getElementById('createPlaylistBtn');
    const trackCount = document.getElementById('trackCount');
    const activeListLabel = document.getElementById('activeListLabel');
    const trackSearch = document.getElementById('trackSearch');
    const sortSelect = document.getElementById('sortSelect');
    const refreshTracksBtn = document.getElementById('refreshTracksBtn');
    const restoreTracksBtn = document.getElementById('restoreTracksBtn');
    const quickNewPlaylistBtn = document.getElementById('quickNewPlaylistBtn');
    const bannerAddTracksBtn = document.getElementById('bannerAddTracksBtn');
    const localFileInput = document.getElementById('localFileInput');

    // DOM Elements - Folder Tray
    const toggleFolderBtn = document.getElementById('toggleFolderBtn');
    const folderTray = document.getElementById('folderTray');
    const closeFolderTrayBtn = document.getElementById('closeFolderTrayBtn');
    const folderPathInput = document.getElementById('folderPathInput');
    const scanFolderBtn = document.getElementById('scanFolderBtn');
    const browseFolderBtn = document.getElementById('browseFolderBtn');
    const folderPickerInput = document.getElementById('folderPickerInput');
    const presetPathBtns = document.querySelectorAll('.presetPathBtn');
    const scanStatus = document.getElementById('scanStatus');

    // DOM Elements - Metadata Inspector
    const coverArtPreview = document.getElementById('coverArtPreview');
    const coverBadge = document.getElementById('coverBadge');
    const statTitle = document.getElementById('statTitle');
    const statArtist = document.getElementById('statArtist');
    const statAlbum = document.getElementById('statAlbum');
    const statGenre = document.getElementById('statGenre');
    const statYear = document.getElementById('statYear');
    const statTrack = document.getElementById('statTrack');
    const statBitrate = document.getElementById('statBitrate');
    const statSampleRate = document.getElementById('statSampleRate');
    const statChannels = document.getElementById('statChannels');
    const statFormat = document.getElementById('statFormat');
    const statSize = document.getElementById('statSize');
    const statPath = document.getElementById('statPath');
    const statBitDepth = document.getElementById('statBitDepth');
    const statDacStream = document.getElementById('statDacStream');

    // DOM Elements - Playlist Modal
    const playlistModal = document.getElementById('playlistModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalTrackTitle = document.getElementById('modalTrackTitle');
    const modalPlaylistList = document.getElementById('modalPlaylistList');
    const modalNewPlaylistName = document.getElementById('modalNewPlaylistName');
    const modalCreateAndAddBtn = document.getElementById('modalCreateAndAddBtn');

    // DOM Elements - Metadata & ID3 Tag Editor Modal
    const metadataEditorModal = document.getElementById('metadataEditorModal');
    const closeMetaEditorModalBtn = document.getElementById('closeMetaEditorModalBtn');
    const metaEditCancelBtn = document.getElementById('metaEditCancelBtn');
    const metaEditorForm = document.getElementById('metaEditorForm');
    const metaEditSaveBtn = document.getElementById('metaEditSaveBtn');
    const metaEditTitle = document.getElementById('metaEditTitle');
    const metaEditArtist = document.getElementById('metaEditArtist');
    const metaEditAlbum = document.getElementById('metaEditAlbum');
    const metaEditGenre = document.getElementById('metaEditGenre');
    const metaEditYear = document.getElementById('metaEditYear');
    const metaEditTrackNum = document.getElementById('metaEditTrackNum');
    const metaEditComment = document.getElementById('metaEditComment');
    const metaEditorThumb = document.getElementById('metaEditorThumb');
    const metaEditorFileTitle = document.getElementById('metaEditorFileTitle');
    const metaEditorFilePath = document.getElementById('metaEditorFilePath');
    const metaEditorStatus = document.getElementById('metaEditorStatus');
    const metaEditorFormatPill = document.getElementById('metaEditorFormatPill');
    const metaEditorBitratePill = document.getElementById('metaEditorBitratePill');
    const metaEditorSampleRatePill = document.getElementById('metaEditorSampleRatePill');
    const metaEditorBitDepthPill = document.getElementById('metaEditorBitDepthPill');
    const infoPanelEditMetaBtn = document.getElementById('infoPanelEditMetaBtn');
    const trackMenuEditMetaBtn = document.getElementById('trackMenuEditMetaBtn');

    // DOM Elements - Theme Overhaul
    function getActiveTheme() {
        if (typeof document !== 'undefined' && document.documentElement) {
            const dt = document.documentElement.getAttribute('data-theme');
            if (dt) return dt;
        }
        return store.state.activeTheme || safeStorage.getItem('cachymusic_active_theme') || 'default';
    }
    function isAtlasThemeActive() {
        return getActiveTheme() === 'nms';
    }
    const themeModal = document.getElementById('themeModal');
    const themeModalBtn = document.getElementById('themeModalBtn');
    const closeThemeModalBtn = document.getElementById('closeThemeModalBtn');
    const topThemeLabel = document.getElementById('topThemeLabel');
    const themeSelectCards = document.querySelectorAll('.themeSelectCard');
    const themeQuickBtns = document.querySelectorAll('.themeQuickBtn');

    // Visualizer Controls
    const visPillBtns = document.querySelectorAll('.visPillBtn');
    const visModeBtns = document.querySelectorAll('.visModeBtn');

    // Workspace Switcher, Soulseek Studio, Download Hub & Settings Workspace Elements
    const wsPlayerBtn = document.getElementById('wsPlayerBtn');
    const wsSoulseekBtn = document.getElementById('wsSoulseekBtn');
    const wsSoulseekBadge = document.getElementById('wsSoulseekBadge');
    const wsDownloadBtn = document.getElementById('wsDownloadBtn');
    const wsSettingsBtn = document.getElementById('wsSettingsBtn');
    const topSettingsBtn = document.getElementById('topSettingsBtn');
    const installAppBtn = document.getElementById('installAppBtn');
    const gridContainer = document.querySelector('.gridContainer');
    const soulseekWorkspace = document.getElementById('soulseekWorkspace');
    const downloadWorkspace = document.getElementById('downloadWorkspace');
    const settingsWorkspace = document.getElementById('settingsWorkspace');
    const settingsReturnBtn = document.getElementById('settingsReturnBtn');
    const persistentMiniPlayer = document.getElementById('persistentMiniPlayer');

    // Persistent Mini-Player Elements
    const miniArtPreview = document.getElementById('miniArtPreview');
    const miniTurntableThumb = document.getElementById('miniTurntableThumb');
    const miniTitle = document.getElementById('miniTitle');
    const miniArtist = document.getElementById('miniArtist');
    const miniPrevBtn = document.getElementById('miniPrevBtn');
    const miniPlayBtn = document.getElementById('miniPlayBtn');
    const miniPlayImg = document.getElementById('miniPlayImg');
    const miniNextBtn = document.getElementById('miniNextBtn');
    const miniCurrentTime = document.getElementById('miniCurrentTime');
    const miniTotalDuration = document.getElementById('miniTotalDuration');
    const miniProgressCon = document.getElementById('miniProgressCon');
    const miniProgressBar = document.getElementById('miniProgressBar');
    const miniVolumeSlider = document.getElementById('miniVolumeSlider');
    const miniMuteBtn = document.getElementById('miniMuteBtn');
    const miniDeckReturnBtn = document.getElementById('miniDeckReturnBtn');

    // Soulseek Elements
    const slskStatusPill = document.getElementById('slskStatusPill');
    const slskStatusDot = document.getElementById('slskStatusDot');
    const slskStatusText = document.getElementById('slskStatusText');
    const slskUsername = document.getElementById('slskUsername');
    const slskStartDaemonBtn = document.getElementById('slskStartDaemonBtn');
    const slskChangeDirBtn = document.getElementById('slskChangeDirBtn');
    const slskDownloadsPathText = document.getElementById('slskDownloadsPathText');
    const slskChangeSharedDirBtn = document.getElementById('slskChangeSharedDirBtn');
    const slskSharedPathText = document.getElementById('slskSharedPathText');
    const slskSyncCurrentDirBtn = document.getElementById('slskSyncCurrentDirBtn');
    const slskPowerBtn = document.getElementById('slskPowerBtn');
    const slskPowerBtnText = document.getElementById('slskPowerBtnText');
    const slskAccountBtn = document.getElementById('slskAccountBtn');
    const slskAccountModal = document.getElementById('slskAccountModal');
    const slskCloseAccountModalBtn = document.getElementById('slskCloseAccountModalBtn');
    const slskModalPowerBtn = document.getElementById('slskModalPowerBtn');
    const slskModalUsername = document.getElementById('slskModalUsername');
    const slskModalPassword = document.getElementById('slskModalPassword');
    const slskModalDownloadDir = document.getElementById('slskModalDownloadDir');
    const slskModalSyncPlayerDirBtn = document.getElementById('slskModalSyncPlayerDirBtn');
    const slskModalSharedDir = document.getElementById('slskModalSharedDir');
    const slskModalSyncSharePlayerDirBtn = document.getElementById('slskModalSyncSharePlayerDirBtn');
    const slskAccountAlert = document.getElementById('slskAccountAlert');
    const slskSaveAccountBtn = document.getElementById('slskSaveAccountBtn');
    const slskLogoutBtn = document.getElementById('slskLogoutBtn');
    const slskRefreshStatusBtn = document.getElementById('slskRefreshStatusBtn');
    const slskToggleTransfersBtn = document.getElementById('slskToggleTransfersBtn');
    const slskTransferCount = document.getElementById('slskTransferCount');
    const slskSearchInput = document.getElementById('slskSearchInput');
    const slskSearchClearBtn = document.getElementById('slskSearchClearBtn');
    const slskSearchSubmitBtn = document.getElementById('slskSearchSubmitBtn');
    const slskFilterChips = document.querySelectorAll('.slskChip');
    const slskIncludeFilterInput = document.getElementById('slskIncludeFilterInput');
    const slskIncludeFilterClearBtn = document.getElementById('slskIncludeFilterClearBtn');
    const slskExcludeFilterInput = document.getElementById('slskExcludeFilterInput');
    const slskExcludeFilterClearBtn = document.getElementById('slskExcludeFilterClearBtn');
    const slskInResultFilterInput = slskIncludeFilterInput || document.getElementById('slskInResultFilterInput');
    const slskInResultFilterClearBtn = slskIncludeFilterClearBtn || document.getElementById('slskInResultFilterClearBtn');
    const slskSuggestedRow = document.getElementById('slskSuggestedRow');
    const slskSuggestedChips = document.getElementById('slskSuggestedChips');
    const slskClearSubFilterBtn = document.getElementById('slskClearSubFilterBtn');
    const slskSortSelect = document.getElementById('slskSortSelect');
    const slskResultsList = document.getElementById('slskResultsList');
    const slskPlaceholder = document.getElementById('slskPlaceholder');
    const slskSearchingState = document.getElementById('slskSearchingState');
    const slskSearchingTitle = document.getElementById('slskSearchingTitle');
    const slskResultCount = document.getElementById('slskResultCount');
    const slskActiveSearchMeta = document.getElementById('slskActiveSearchMeta');
    const slskTransfersDrawer = document.getElementById('slskTransfersDrawer');
    const slskTransfersHeader = document.getElementById('slskTransfersHeader');
    const slskTransfersSummary = document.getElementById('slskTransfersSummary');
    const slskTransfersList = document.getElementById('slskTransfersList');
    const slskCloseDrawerBtn = document.getElementById('slskCloseDrawerBtn');
    const slskScanDownloadsBtn = document.getElementById('slskScanDownloadsBtn');
    const slskControlsPanel = document.getElementById('slskControlsPanel');
    const slskPanelToggleBar = document.getElementById('slskPanelToggleBar');
    const slskPanelToggleChevron = document.getElementById('slskPanelToggleChevron');
    const slskMobileActiveFilter = document.getElementById('slskMobileActiveFilter');
    const slskMobileTransfersBtn = document.getElementById('slskMobileTransfersBtn');
    const slskMobileTransferCount = document.getElementById('slskMobileTransferCount');

    function setMobileSearchPanelCollapsed(collapsed) {
        if (!slskControlsPanel) return;
        if (collapsed) {
            slskControlsPanel.classList.add('is-collapsed');
        } else {
            slskControlsPanel.classList.remove('is-collapsed');
        }
    }

    function toggleMobileSearchPanel() {
        if (!slskControlsPanel) return;
        const isCollapsed = slskControlsPanel.classList.contains('is-collapsed');
        setMobileSearchPanelCollapsed(!isCollapsed);
    }

    function updateMiniPlayerInfo(track) {
        if (!track) return;
        if (store.state.lastRenderedMiniTrack === track) return;
        store.state.lastRenderedMiniTrack = track;
        if (miniTitle) miniTitle.textContent = track.title || track.filename || 'Unknown Track';
        if (miniArtist) miniArtist.textContent = track.artist || 'Unknown Artist';
        if (miniArtPreview) {
            miniArtPreview.onerror = () => { miniArtPreview.onerror = null; miniArtPreview.src = 'resources/images/default.svg'; };
            miniArtPreview.src = track.cover || 'resources/images/default.svg';
        }
        if (miniTotalDuration) miniTotalDuration.textContent = formatTime(track.duration || 0);
    }

    function updateMiniPlayerPlayState(playing) {
        // Icon toggled via CSS .playing class (instant, no image load)
        if (miniPlayBtn) {
            miniPlayBtn.classList.toggle('playing', playing);
        }
        if (miniTurntableThumb) {
            miniTurntableThumb.classList.toggle('playing', playing);
        }
    }

    function syncSettingsTabValues() {
        const s = store.state;
        const settingsTabFolderPathInput = document.getElementById('settingsTabFolderPathInput');
        if (settingsTabFolderPathInput) {
            const currentPath = (folderPathInput && folderPathInput.value) || safeStorage.getItem('cachymusic_last_directory') || '';
            if (currentPath) settingsTabFolderPathInput.value = currentPath;
        }

        const settingsTabScanStatus = document.getElementById('settingsTabScanStatus');
        if (settingsTabScanStatus) {
            if (s.allTracks && s.allTracks.length > 0) {
                settingsTabScanStatus.textContent = `● ${s.allTracks.length} tracks currently loaded in library.`;
                settingsTabScanStatus.style.color = 'var(--accent-color, #00f0ff)';
            } else {
                settingsTabScanStatus.textContent = '● Ready to scan local music library.';
                settingsTabScanStatus.style.color = 'var(--text-secondary, #888888)';
            }
        }

        const settingsTabCurrentThemeBadge = document.getElementById('settingsTabCurrentThemeBadge');
        if (settingsTabCurrentThemeBadge && s.activeTheme) {
            const labels = {
                default: 'DEFAULT STUDIO HI-FI',
                nms: 'THE ATLAS',
                'solar-eclipse': 'PLANETARY WARP',
                'euclid-horizon': 'SPACE STATION',
                'alien-paradise': 'ALIEN PARADISE',
                'abyssal-void': 'EMERIL DRIVE',
                dissonance: 'DISSONANCE',
                sentinel: 'SENTINEL',
                'minimalist-light': 'MINIMALIST (LIGHT)',
                'minimalist-dark': 'MINIMALIST (DARK)',
                'minimalist-warm': 'MINIMALIST (WARM PAPER)',
                'minimalist-obsidian': 'MINIMALIST (OBSIDIAN OLED)',
                'brutalist-light': 'MINIMALIST (LIGHT)',
                'brutalist-dark': 'MINIMALIST (DARK)'
            };
            settingsTabCurrentThemeBadge.textContent = labels[s.activeTheme] || s.activeTheme.toUpperCase();
        }

        const settingsTabSleepStatusBadge = document.getElementById('settingsTabSleepStatusBadge');
        if (settingsTabSleepStatusBadge) {
            if (s.sleepTimerMode === 'end') {
                settingsTabSleepStatusBadge.textContent = 'PAUSE AT END OF TRACK';
                settingsTabSleepStatusBadge.classList.add('active');
            } else if (s.sleepTimerInterval && s.sleepTimerRemainingSec > 0) {
                const m = Math.floor(s.sleepTimerRemainingSec / 60);
                const remSec = s.sleepTimerRemainingSec % 60;
                settingsTabSleepStatusBadge.textContent = `${m}:${remSec < 10 ? '0' : ''}${remSec} REMAINING`;
                settingsTabSleepStatusBadge.classList.add('active');
            } else {
                settingsTabSleepStatusBadge.textContent = 'INACTIVE';
                settingsTabSleepStatusBadge.classList.remove('active');
            }
        }

        // 1. Math Precision Architecture
        const precisionBtns = document.querySelectorAll('.enginePrecisionBtn');
        const precisionPill = document.getElementById('settingsEnginePrecisionPill');
        if (precisionBtns.length > 0) {
            precisionBtns.forEach(b => {
                const is64 = b.getAttribute('data-precision') === '64';
                b.classList.toggle('active', is64 === s.isPrecision64);
            });
        }
        if (precisionPill) {
            precisionPill.textContent = s.isPrecision64 ? '64-BIT DOUBLE FLOAT' : '32-BIT FAST FLOAT';
        }

        // 2. Hardware Analog Gain (PipeWire / ALSA Bridge)
        const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
        const hwGainDot = document.getElementById('settingsHwGainDot');
        const hwGainText = document.getElementById('settingsHwGainText');
        const hwGainPill = document.getElementById('settingsHardwareGainPill');
        if (hwGainBtn) hwGainBtn.classList.toggle('active', s.isHardwareGain);
        if (hwGainDot) hwGainDot.classList.toggle('active', s.isHardwareGain);
        if (hwGainText) {
            hwGainText.textContent = s.isHardwareGain ? `HARDWARE GAIN: ON (${s.hwVolumeBackend.toUpperCase()})` : 'HARDWARE GAIN: OFF';
        }
        if (hwGainPill && s.hwVolumeBackend !== 'none') {
            hwGainPill.textContent = `READY (${s.hwVolumeBackend.toUpperCase()})`;
        }

        // 3. Ultrasonic IMD Filter
        const ultrasonicBtn = document.getElementById('settingsUltrasonicToggleBtn');
        const ultrasonicDot = document.getElementById('settingsUltrasonicDot');
        const ultrasonicText = document.getElementById('settingsUltrasonicText');
        const ultrasonicSelect = document.getElementById('settingsUltrasonicCutoffSelect');
        const ultrasonicPill = document.getElementById('settingsUltrasonicPill');
        if (ultrasonicBtn) ultrasonicBtn.classList.toggle('active', s.isUltrasonic);
        if (ultrasonicDot) ultrasonicDot.classList.toggle('active', s.isUltrasonic);
        if (ultrasonicText) {
            ultrasonicText.textContent = s.isUltrasonic ? 'ULTRASONIC FILTER: ON' : 'ULTRASONIC FILTER: OFF';
        }
        if (ultrasonicPill) {
            ultrasonicPill.textContent = s.isUltrasonic ? `ACTIVE (${Math.round(s.ultrasonicCutoff / 1000)} kHz)` : 'BYPASS';
        }
        if (ultrasonicSelect) {
            ultrasonicSelect.value = s.ultrasonicCutoff.toString();
        }

        // 4. Dithering & Noise Shaping
        const ditherBtns = document.querySelectorAll('.ditherModeBtn');
        const ditherPill = document.getElementById('settingsDitherPill');
        if (ditherBtns.length > 0) {
            ditherBtns.forEach(b => {
                const mode = b.getAttribute('data-dither');
                b.classList.toggle('active', mode === s.ditherMode);
            });
        }
        if (ditherPill) {
            ditherPill.textContent = s.ditherMode === 'shaped' ? 'SHAPED (>18 kHz)' : (s.ditherMode === 'tpdf' ? 'TPDF FLAT' : 'OFF (TRUNCATE)');
        }

        // 5. Speaker Ambiophonics R.A.C.E.
        const ambiBtn = document.getElementById('settingsAmbiToggleBtn');
        const ambiDot = document.getElementById('settingsAmbiDot');
        const ambiText = document.getElementById('settingsAmbiText');
        const ambiPill = document.getElementById('settingsAmbiPill');
        if (ambiBtn) ambiBtn.classList.toggle('active', s.isAmbiophonics);
        if (ambiDot) ambiDot.classList.toggle('active', s.isAmbiophonics);
        if (ambiText) {
            ambiText.textContent = s.isAmbiophonics ? 'AMBIOPHONICS: ON (R.A.C.E.)' : 'AMBIOPHONICS: OFF (SPEAKERS ONLY)';
        }
        if (ambiPill) {
            ambiPill.textContent = s.isAmbiophonics ? 'ACTIVE (R.A.C.E.)' : 'BYPASS';
        }

        // 6. Audio Buffer & Latency Tuning
        const bufferBtns = document.querySelectorAll('.bufferLatencyBtn');
        const bufferPill = document.getElementById('settingsBufferPill');
        if (bufferBtns.length > 0) {
            bufferBtns.forEach(b => {
                const latency = b.getAttribute('data-latency');
                b.classList.toggle('active', latency === s.bufferLatencyTarget);
            });
        }
        if (bufferPill) {
            bufferPill.textContent = s.bufferLatencyTarget === 'interactive' ? 'STUDIO LOW-LATENCY (~15ms)' : 'PLAYBACK (~100ms)';
        }

        // 7. Background Web Notification toggle (Opt-In)
        const bgNotifToggle = document.getElementById('settingsBgNotificationsToggle');
        if (bgNotifToggle) {
            bgNotifToggle.checked = !!s.backgroundNotificationsEnabled;
        }

        // 8. Spectrum Visualizer Mode
        const visModeBtnsEl = document.querySelectorAll('.visModeBtn');
        if (visModeBtnsEl.length > 0 && s.activeVisualizerMode) {
            visModeBtnsEl.forEach(b => {
                const m = b.dataset.mode;
                const matches = (m === s.activeVisualizerMode) || (s.activeVisualizerMode === 'thematic' && (m === 'badapple' || m === 'thematic'));
                b.classList.toggle('active', matches);
            });
        }

        store.emit('ui:sync-signal-path');
    }

    function switchWorkspace(viewName, targetMobilePanel = null) {
        const s = store.state;
        s.currentWorkspace = viewName;
        const currentTrack = s.allTracks[s.currentTrackIndex];

        if (viewName === 'soulseek') {
            document.body.classList.remove('view-player', 'view-download', 'view-settings');
            document.body.classList.add('view-soulseek');

            if (wsPlayerBtn) wsPlayerBtn.classList.remove('active');
            if (wsSoulseekBtn) wsSoulseekBtn.classList.add('active');
            if (wsDownloadBtn) wsDownloadBtn.classList.remove('active');
            if (wsSettingsBtn) wsSettingsBtn.classList.remove('active');
            if (topSettingsBtn) topSettingsBtn.classList.remove('active');
            if (installAppBtn) installAppBtn.classList.remove('active');

            if (gridContainer) gridContainer.style.display = 'none';
            if (soulseekWorkspace) soulseekWorkspace.style.display = 'flex';
            if (downloadWorkspace) downloadWorkspace.style.display = 'none';
            if (settingsWorkspace) settingsWorkspace.style.display = 'none';
            if (persistentMiniPlayer) persistentMiniPlayer.style.display = 'flex';

            setMobilePanelsInactive();
            setMobileTabActive('soulseekWorkspace');
            document.body.classList.remove('mobile-tab-player', 'mobile-tab-tracks', 'mobile-tab-info');

            if (currentTrack) updateMiniPlayerInfo(currentTrack);
            updateMiniPlayerPlayState(s.isPlaying);
        } else if (viewName === 'download') {
            document.body.classList.remove('view-player', 'view-soulseek', 'view-settings');
            document.body.classList.add('view-download');

            if (wsPlayerBtn) wsPlayerBtn.classList.remove('active');
            if (wsSoulseekBtn) wsSoulseekBtn.classList.remove('active');
            if (wsDownloadBtn) wsDownloadBtn.classList.add('active');
            if (wsSettingsBtn) wsSettingsBtn.classList.remove('active');
            if (topSettingsBtn) topSettingsBtn.classList.remove('active');
            if (installAppBtn) installAppBtn.classList.add('active');

            if (gridContainer) gridContainer.style.display = 'none';
            if (soulseekWorkspace) soulseekWorkspace.style.display = 'none';
            if (downloadWorkspace) downloadWorkspace.style.display = 'flex';
            if (settingsWorkspace) settingsWorkspace.style.display = 'none';
            if (persistentMiniPlayer) persistentMiniPlayer.style.display = 'flex';

            setMobilePanelsInactive();
            setMobileTabActive('downloadWorkspace');
            document.body.classList.remove('mobile-tab-player', 'mobile-tab-tracks', 'mobile-tab-info');

            if (currentTrack) updateMiniPlayerInfo(currentTrack);
            updateMiniPlayerPlayState(s.isPlaying);
        } else if (viewName === 'settings') {
            document.body.classList.remove('view-player', 'view-soulseek', 'view-download');
            document.body.classList.add('view-settings');

            if (wsPlayerBtn) wsPlayerBtn.classList.remove('active');
            if (wsSoulseekBtn) wsSoulseekBtn.classList.remove('active');
            if (wsDownloadBtn) wsDownloadBtn.classList.remove('active');
            if (wsSettingsBtn) wsSettingsBtn.classList.add('active');
            if (topSettingsBtn) topSettingsBtn.classList.add('active');
            if (installAppBtn) installAppBtn.classList.remove('active');

            if (gridContainer) gridContainer.style.display = 'none';
            if (soulseekWorkspace) soulseekWorkspace.style.display = 'none';
            if (downloadWorkspace) downloadWorkspace.style.display = 'none';
            if (settingsWorkspace) settingsWorkspace.style.display = 'flex';
            if (persistentMiniPlayer) persistentMiniPlayer.style.display = 'flex';

            setMobilePanelsInactive();
            setMobileTabActive('settingsWorkspace');
            document.body.classList.remove('mobile-tab-player', 'mobile-tab-tracks', 'mobile-tab-info');

            if (currentTrack) updateMiniPlayerInfo(currentTrack);
            updateMiniPlayerPlayState(s.isPlaying);
            syncSettingsTabValues();
        } else {
            document.body.classList.remove('view-soulseek', 'view-download', 'view-settings');
            document.body.classList.add('view-player');

            if (wsPlayerBtn) wsPlayerBtn.classList.add('active');
            if (wsSoulseekBtn) wsSoulseekBtn.classList.remove('active');
            if (wsDownloadBtn) wsDownloadBtn.classList.remove('active');
            if (wsSettingsBtn) wsSettingsBtn.classList.remove('active');
            if (topSettingsBtn) topSettingsBtn.classList.remove('active');
            if (installAppBtn) installAppBtn.classList.remove('active');

            if (gridContainer) gridContainer.style.display = '';
            if (soulseekWorkspace) soulseekWorkspace.style.display = 'none';
            if (downloadWorkspace) downloadWorkspace.style.display = 'none';
            if (settingsWorkspace) settingsWorkspace.style.display = 'none';
            if (persistentMiniPlayer) persistentMiniPlayer.style.display = 'none';

            if (targetMobilePanel || window.innerWidth <= 768) {
                const activeTarget = targetMobilePanel || 'playerDeck';
                setMobileTabActive(activeTarget);

                if (playerDeckEl) {
                    playerDeckEl.classList.toggle('mobileActive', activeTarget === 'playerDeck');
                    playerDeckEl.style.display = '';
                }
                if (trackListPanelEl) {
                    trackListPanelEl.classList.toggle('mobileActive', activeTarget === 'trackListPanel');
                    trackListPanelEl.style.display = '';
                }
                if (settingsPanelEl) {
                    settingsPanelEl.classList.toggle('mobileActive', activeTarget === 'settingsPanel');
                    settingsPanelEl.style.display = '';
                }

                document.body.classList.remove('mobile-tab-player', 'mobile-tab-tracks', 'mobile-tab-info');
                if (activeTarget === 'playerDeck') {
                    document.body.classList.add('mobile-tab-player');
                    if (persistentMiniPlayer) persistentMiniPlayer.style.display = 'none';
                } else if (activeTarget === 'trackListPanel') {
                    document.body.classList.add('mobile-tab-tracks');
                    if (persistentMiniPlayer) {
                        persistentMiniPlayer.style.display = 'flex';
                        if (currentTrack) updateMiniPlayerInfo(currentTrack);
                        updateMiniPlayerPlayState(s.isPlaying);
                    }
                } else if (activeTarget === 'settingsPanel') {
                    document.body.classList.add('mobile-tab-info');
                    if (persistentMiniPlayer) {
                        persistentMiniPlayer.style.display = 'flex';
                        if (currentTrack) updateMiniPlayerInfo(currentTrack);
                        updateMiniPlayerPlayState(s.isPlaying);
                    }
                }
                if (metadataToggleBtn) {
                    metadataToggleBtn.classList.toggle('active', activeTarget === 'settingsPanel');
                    metadataToggleBtn.setAttribute('aria-pressed', String(activeTarget === 'settingsPanel'));
                }
            } else {
                setMobilePanelsInactive();
                if (playerDeckEl) playerDeckEl.style.display = '';
                if (trackListPanelEl) trackListPanelEl.style.display = '';
                if (settingsPanelEl) settingsPanelEl.style.display = '';
                document.body.classList.remove('mobile-tab-player', 'mobile-tab-tracks', 'mobile-tab-info');
                if (persistentMiniPlayer) persistentMiniPlayer.style.display = 'none';
                if (metadataToggleBtn) {
                    const isCol = document.body.classList.contains('metadata-collapsed');
                    metadataToggleBtn.classList.toggle('active', !isCol);
                    metadataToggleBtn.setAttribute('aria-pressed', String(!isCol));
                }
            }
        }

        store.emit('workspace:change', { viewName, targetMobilePanel });
    }

    // No sample placeholder tracks — user chooses music directory first
    const fallbackTracks = [];

    // =========================================================================

    // Blocking Track Loading Overlay & IndexedDB Library Persistence
    // =========================================================================
    function showTrackLoadingOverlay(title = 'LOADING MUSIC LIBRARY...', statusText = 'Indexing audio files and metadata. Please wait...', progressPct = null) {
        store.state.isTrackLoadingCancelled = false;
        const overlay = document.getElementById('trackLoadingOverlay');
        const titleEl = document.getElementById('trackLoadingTitle');
        const statusEl = document.getElementById('trackLoadingStatusText');
        const barEl = document.getElementById('trackLoadingProgressBar');
        if (titleEl && title) titleEl.textContent = title;
        if (statusEl && statusText) statusEl.textContent = statusText;
        if (barEl) {
            if (typeof progressPct === 'number') {
                barEl.classList.remove('indeterminate');
                barEl.style.width = `${Math.max(2, Math.min(100, progressPct))}%`;
            } else {
                barEl.classList.add('indeterminate');
                barEl.style.width = '40%';
            }
        }
        if (overlay) {
            overlay.style.display = 'flex';
        }
    }

    function updateTrackLoadingOverlay(statusText, progressPct = null) {
        const statusEl = document.getElementById('trackLoadingStatusText');
        const barEl = document.getElementById('trackLoadingProgressBar');
        if (statusEl && statusText) statusEl.textContent = statusText;
        if (barEl && typeof progressPct === 'number') {
            barEl.classList.remove('indeterminate');
            barEl.style.width = `${Math.max(2, Math.min(100, progressPct))}%`;
        }
    }

    function hideTrackLoadingOverlay() {
        const overlay = document.getElementById('trackLoadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        store.state.activeScanAbortController = null;
    }

    function cancelActiveTrackLoading() {
        store.state.isTrackLoadingCancelled = true;
        if (store.state.activeScanAbortController) {
            try { store.state.activeScanAbortController.abort(); } catch (_) {}
            store.state.activeScanAbortController = null;
        }
        if (typeof window !== 'undefined' && window.AndroidBridge && typeof window.AndroidBridge.cancelScan === 'function') {
            try { window.AndroidBridge.cancelScan(); } catch (_) {}
        }
        hideTrackLoadingOverlay();
        setScanStatus('Track loading cancelled by user.', false);
        showToast('Track loading cancelled');
    }

    // Update Player Empty Prompt when no music directory is loaded
    function updateEmptyPlayerState(errorMsg = '') {
        const promptEl = document.getElementById('playerEmptyPrompt');
        const errorHintEl = document.getElementById('playerEmptyErrorHint');
        const hasTracks = Array.isArray(store.state.allTracks) && store.state.allTracks.length > 0;

        if (promptEl) {
            promptEl.style.display = hasTracks ? 'none' : 'flex';
        }
        if (errorHintEl) {
            if (!hasTracks && errorMsg) {
                errorHintEl.textContent = `${errorMsg} Please set the directory manually in Settings → Library & Folders.`;
                errorHintEl.style.display = 'block';
            } else {
                errorHintEl.style.display = 'none';
            }
        }
        if (trackName) trackName.style.display = hasTracks ? '' : 'none';
        if (artistName) artistName.style.display = hasTracks ? '' : 'none';
        if (albumName) albumName.style.display = hasTracks ? '' : 'none';
        if (trackBadge) trackBadge.style.display = hasTracks ? '' : 'none';

        if (!hasTracks) {
            if (miniTitle) miniTitle.textContent = 'No Track Loaded';
            if (miniArtist) miniArtist.textContent = 'Choose directory';
        }
        store.emit('ui:sync-signal-path');
    }


    export {
        activeListLabel,
        albumName,
        artistName,
        auditMetricHeadroom,
        auditMetricLatency,
        auditQualityBadge,
        auditQualityDesc,
        auditQualityDot,
        backToLibraryBtn,
        bannerAddTracksBtn,
        bgDisc,
        bindFastAction,
        browseFolderBtn,
        cachedAllPanelsList,
        cachedMobileTabBtns,
        cancelActiveTrackLoading,
        cancelSleepTimerBtn,
        clearQueueBtn,
        closeFolderTrayBtn,
        closeModalBtn,
        closeMetaEditorModalBtn,
        closeSignalPathModalBtn,
        closeSleepTimerModalBtn,
        closeThemeModalBtn,
        coverArtPreview,
        coverBadge,
        createPlaylistBtn,
        ctx,
        currentPlaylistTitle,
        currentTimeEl,
        customSleepInput,
        deckArtworkAmbient,
        deckArtworkBackdrop,
        deckSignalDot,
        deleteCurrentPlaylistBtn,
        downloadWorkspace,
        fallbackTracks,
        folderPathInput,
        folderPickerInput,
        folderTray,
        getActiveTheme,
        gridContainer,
        hideTrackLoadingOverlay,
        infoPanelEditMetaBtn,
        infoPanelEl,
        installAppBtn,
        isAtlasThemeActive,
        libraryControls,
        localFileInput,
        lyricsArtistName,
        lyricsCon,
        lyricsContent,
        lyricsScrollArea,
        lyricsToggleBtn,
        lyricsTrackName,
        metadataEditorModal,
        metadataToggleBtn,
        metaEditAlbum,
        metaEditArtist,
        metaEditCancelBtn,
        metaEditComment,
        metaEditGenre,
        metaEditSaveBtn,
        metaEditTitle,
        metaEditTrackNum,
        metaEditYear,
        metaEditorBitDepthPill,
        metaEditorBitratePill,
        metaEditorFilePath,
        metaEditorFileTitle,
        metaEditorFormatPill,
        metaEditorForm,
        metaEditorSampleRatePill,
        metaEditorStatus,
        metaEditorThumb,
        miniArtPreview,
        miniArtist,
        miniCurrentTime,
        miniDeckReturnBtn,
        miniMuteBtn,
        miniNextBtn,
        miniPlayBtn,
        miniPlayImg,
        miniPrevBtn,
        miniProgressBar,
        miniProgressCon,
        miniTitle,
        miniTotalDuration,
        miniTurntableThumb,
        miniVolumeSlider,
        modalCreateAndAddBtn,
        modalNewPlaylistName,
        modalPlaylistList,
        modalTrackTitle,
        muteBtn,
        newPlaylistInput,
        nextBtn,
        openSignalAuditBtn,
        persistentMiniPlayer,
        playPauseBtn,
        playPauseImg,
        playerDeckEl,
        playlistBanner,
        playlistList,
        playlistModal,
        playlistsView,
        presetPathBtns,
        prevBtn,
        progressBar,
        progressCon,
        progressHover,
        queueCountBadge,
        queueCountSummary,
        queueList,
        queueView,
        quickNewPlaylistBtn,
        refreshTracksBtn,
        repeatBtn,
        restoreTracksBtn,
        scanFolderBtn,
        scanStatus,
        setCustomSleepBtn,
        setMobilePanelsInactive,
        setMobileSearchPanelCollapsed,
        setMobileTabActive,
        settingsPanelEl,
        settingsReturnBtn,
        settingsWorkspace,
        showTrackLoadingOverlay,
        shuffleBtn,
        shufflePlayBtn,
        signalPathBadgeBtn,
        signalPathLabel,
        signalPathModal,
        sleepStatusCard,
        sleepStatusRemaining,
        sleepTimerBtn,
        sleepTimerLabel,
        sleepTimerModal,
        standaloneBanner,
        standaloneBannerTitle,
        standaloneResumeLibraryBtn,
        standaloneCloseBtn,
        slskAccountAlert,
        slskAccountBtn,
        slskAccountModal,
        slskActiveSearchMeta,
        slskChangeDirBtn,
        slskChangeSharedDirBtn,
        slskClearSubFilterBtn,
        slskCloseAccountModalBtn,
        slskCloseDrawerBtn,
        slskControlsPanel,
        slskDownloadsPathText,
        slskExcludeFilterClearBtn,
        slskExcludeFilterInput,
        slskFilterChips,
        slskInResultFilterClearBtn,
        slskInResultFilterInput,
        slskIncludeFilterClearBtn,
        slskIncludeFilterInput,
        slskLogoutBtn,
        slskMobileActiveFilter,
        slskMobileTransferCount,
        slskMobileTransfersBtn,
        slskModalDownloadDir,
        slskModalPassword,
        slskModalPowerBtn,
        slskModalSharedDir,
        slskModalSyncPlayerDirBtn,
        slskModalSyncSharePlayerDirBtn,
        slskModalUsername,
        slskPanelToggleBar,
        slskPanelToggleChevron,
        slskPlaceholder,
        slskPowerBtn,
        slskPowerBtnText,
        slskRefreshStatusBtn,
        slskResultCount,
        slskResultsList,
        slskSaveAccountBtn,
        slskScanDownloadsBtn,
        slskSearchClearBtn,
        slskSearchInput,
        slskSearchSubmitBtn,
        slskSearchingState,
        slskSearchingTitle,
        slskSharedPathText,
        slskSortSelect,
        slskStartDaemonBtn,
        slskStatusDot,
        slskStatusPill,
        slskStatusText,
        slskSuggestedChips,
        slskSuggestedRow,
        slskSyncCurrentDirBtn,
        slskToggleTransfersBtn,
        slskTransferCount,
        slskTransfersDrawer,
        slskTransfersHeader,
        slskTransfersList,
        slskTransfersSummary,
        slskUsername,
        sortSelect,
        soulseekWorkspace,
        speedBtns,
        statAlbum,
        statArtist,
        statBitDepth,
        statBitrate,
        statChannels,
        statDacStream,
        statDynamicRange,
        statFormat,
        statGenre,
        statPath,
        statPeakLevel,
        statSampleRate,
        statSize,
        statTitle,
        statTrack,
        statYear,
        switchWorkspace,
        syncSettingsTabValues,
        tabLibrary,
        tabPlaylists,
        tabQueue,
        themeModal,
        themeModalBtn,
        themeQuickBtns,
        themeSelectCards,
        toggleFolderBtn,
        toggleMobileSearchPanel,
        toneArm,
        topSettingsBtn,
        topThemeLabel,
        totalDurationEl,
        trackBadge,
        trackCount,
        trackList,
        trackListPanelEl,
        trackMenuEditMetaBtn,
        trackName,
        trackSearch,
        turntableCenterCanvas,
        turntableCenterCtx,
        turntableCenterVis,
        turntableCon,
        upcomingLibraryList,
        updateEmptyPlayerState,
        updateMiniPlayerInfo,
        updateMiniPlayerPlayState,
        updateTrackLoadingOverlay,
        vinylArt,
        vinylLabel,
        vinylTurntable,
        visModeBtns,
        visPillBtns,
        visualizerCanvas,
        visualizerDock,
        volumeIcon,
        volumeLevel,
        volumeSlider,
        wsDownloadBtn,
        wsPlayerBtn,
        wsSettingsBtn,
        wsSoulseekBadge,
        wsSoulseekBtn
    };
