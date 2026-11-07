// CachyMusic - UI Elements & Workspace Shell
    // DOM Elements - Player & Audio
    let audio = document.getElementById('audioPlayer');
    if (audio) audio.crossOrigin = 'anonymous';

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
    let playQueue = [];
    let currentFormatFilter = 'all';

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
    let sleepTimerInterval = null;
    let sleepTimerRemainingSec = 0;
    let sleepTimerMode = null;
    let sleepTimerOriginalVolume = null;

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

    let openPeqModal = null;
    let closePeqModal = null;

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
    const dismissedTracksMap = new Map();

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
    const validThemeIds = [
        'default', 'nms', 'solar-eclipse', 'euclid-horizon', 'alien-paradise',
        'abyssal-void', 'dissonance', 'sentinel',
        'minimalist-light', 'minimalist-dark', 'minimalist-warm', 'minimalist-obsidian',
        'brutalist-light', 'brutalist-dark'
    ];
    let activeTheme = safeStorage.getItem('cachymusic_active_theme') || (document.documentElement && document.documentElement.getAttribute('data-theme')) || 'default';
    if (activeTheme === 'brutalist-minimalism-light' || activeTheme === 'brutalist-light') activeTheme = 'minimalist-light';
    if (activeTheme === 'brutalist-minimalism-dark' || activeTheme === 'brutalist-dark') activeTheme = 'minimalist-dark';
    if (!validThemeIds.includes(activeTheme)) {
        activeTheme = (activeTheme === 'atlas' || activeTheme === 'spotify' || activeTheme === 'apple') ? 'nms' : 'default';
    }
    function getActiveTheme() {
        if (typeof document !== 'undefined' && document.documentElement) {
            const dt = document.documentElement.getAttribute('data-theme');
            if (dt) return dt;
        }
        if (typeof window !== 'undefined' && window.activeTheme) {
            return window.activeTheme;
        }
        return activeTheme || (typeof safeStorage !== 'undefined' ? safeStorage.getItem('cachymusic_active_theme') : null) || 'default';
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
    let currentWorkspace = 'player'; // 'player' | 'soulseek' | 'download' | 'settings'
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
    let deferredInstallPrompt = null;

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

    let lastRenderedMiniTrack = null;
    function updateMiniPlayerInfo(track) {
        if (!track) return;
        if (lastRenderedMiniTrack === track) return;
        lastRenderedMiniTrack = track;
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
        const settingsTabFolderPathInput = document.getElementById('settingsTabFolderPathInput');
        if (settingsTabFolderPathInput) {
            const currentPath = (folderPathInput && folderPathInput.value) || safeStorage.getItem('cachymusic_last_directory') || '';
            if (currentPath) settingsTabFolderPathInput.value = currentPath;
        }

        const settingsTabScanStatus = document.getElementById('settingsTabScanStatus');
        if (settingsTabScanStatus) {
            if (allTracks && allTracks.length > 0) {
                settingsTabScanStatus.textContent = `● ${allTracks.length} tracks currently loaded in library.`;
                settingsTabScanStatus.style.color = 'var(--accent-color, #00f0ff)';
            } else {
                settingsTabScanStatus.textContent = '● Ready to scan local music library.';
                settingsTabScanStatus.style.color = 'var(--text-secondary, #888888)';
            }
        }

        const settingsTabCurrentThemeBadge = document.getElementById('settingsTabCurrentThemeBadge');
        if (settingsTabCurrentThemeBadge && typeof activeTheme !== 'undefined') {
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
            settingsTabCurrentThemeBadge.textContent = labels[activeTheme] || activeTheme.toUpperCase();
        }

        const settingsTabSleepStatusBadge = document.getElementById('settingsTabSleepStatusBadge');
        if (settingsTabSleepStatusBadge) {
            if (sleepTimerMode === 'end') {
                settingsTabSleepStatusBadge.textContent = 'PAUSE AT END OF TRACK';
                settingsTabSleepStatusBadge.classList.add('active');
            } else if (sleepTimerInterval && sleepTimerRemainingSec > 0) {
                const m = Math.floor(sleepTimerRemainingSec / 60);
                const s = sleepTimerRemainingSec % 60;
                settingsTabSleepStatusBadge.textContent = `${m}:${s < 10 ? '0' : ''}${s} REMAINING`;
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
                b.classList.toggle('active', is64 === isPrecision64);
            });
        }
        if (precisionPill) {
            precisionPill.textContent = isPrecision64 ? '64-BIT DOUBLE FLOAT' : '32-BIT FAST FLOAT';
        }

        // 2. Hardware Analog Gain (PipeWire / ALSA Bridge)
        const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
        const hwGainDot = document.getElementById('settingsHwGainDot');
        const hwGainText = document.getElementById('settingsHwGainText');
        const hwGainPill = document.getElementById('settingsHardwareGainPill');
        if (hwGainBtn) hwGainBtn.classList.toggle('active', isHardwareGain);
        if (hwGainDot) hwGainDot.classList.toggle('active', isHardwareGain);
        if (hwGainText) {
            hwGainText.textContent = isHardwareGain ? `HARDWARE GAIN: ON (${hwVolumeBackend.toUpperCase()})` : 'HARDWARE GAIN: OFF';
        }
        if (hwGainPill && hwVolumeBackend !== 'none') {
            hwGainPill.textContent = `READY (${hwVolumeBackend.toUpperCase()})`;
        }

        // 3. Ultrasonic IMD Filter
        const ultrasonicBtn = document.getElementById('settingsUltrasonicToggleBtn');
        const ultrasonicDot = document.getElementById('settingsUltrasonicDot');
        const ultrasonicText = document.getElementById('settingsUltrasonicText');
        const ultrasonicSelect = document.getElementById('settingsUltrasonicCutoffSelect');
        const ultrasonicPill = document.getElementById('settingsUltrasonicPill');
        if (ultrasonicBtn) ultrasonicBtn.classList.toggle('active', isUltrasonic);
        if (ultrasonicDot) ultrasonicDot.classList.toggle('active', isUltrasonic);
        if (ultrasonicText) {
            ultrasonicText.textContent = isUltrasonic ? 'ULTRASONIC FILTER: ON' : 'ULTRASONIC FILTER: OFF';
        }
        if (ultrasonicPill) {
            ultrasonicPill.textContent = isUltrasonic ? `ACTIVE (${Math.round(ultrasonicCutoff / 1000)} kHz)` : 'BYPASS';
        }
        if (ultrasonicSelect) {
            ultrasonicSelect.value = ultrasonicCutoff.toString();
        }

        // 4. Dithering & Noise Shaping
        const ditherBtns = document.querySelectorAll('.ditherModeBtn');
        const ditherPill = document.getElementById('settingsDitherPill');
        if (ditherBtns.length > 0) {
            ditherBtns.forEach(b => {
                const mode = b.getAttribute('data-dither');
                b.classList.toggle('active', mode === ditherMode);
            });
        }
        if (ditherPill) {
            ditherPill.textContent = ditherMode === 'shaped' ? 'SHAPED (>18 kHz)' : (ditherMode === 'tpdf' ? 'TPDF FLAT' : 'OFF (TRUNCATE)');
        }

        // 5. Speaker Ambiophonics R.A.C.E.
        const ambiBtn = document.getElementById('settingsAmbiToggleBtn');
        const ambiDot = document.getElementById('settingsAmbiDot');
        const ambiText = document.getElementById('settingsAmbiText');
        const ambiPill = document.getElementById('settingsAmbiPill');
        if (ambiBtn) ambiBtn.classList.toggle('active', isAmbiophonics);
        if (ambiDot) ambiDot.classList.toggle('active', isAmbiophonics);
        if (ambiText) {
            ambiText.textContent = isAmbiophonics ? 'AMBIOPHONICS: ON (R.A.C.E.)' : 'AMBIOPHONICS: OFF (SPEAKERS ONLY)';
        }
        if (ambiPill) {
            ambiPill.textContent = isAmbiophonics ? 'ACTIVE (R.A.C.E.)' : 'BYPASS';
        }

        // 6. Audio Buffer & Latency Tuning
        const bufferBtns = document.querySelectorAll('.bufferLatencyBtn');
        const bufferPill = document.getElementById('settingsBufferPill');
        if (bufferBtns.length > 0) {
            bufferBtns.forEach(b => {
                const latency = b.getAttribute('data-latency');
                b.classList.toggle('active', latency === bufferLatencyTarget);
            });
        }
        if (bufferPill) {
            bufferPill.textContent = bufferLatencyTarget === 'interactive' ? 'STUDIO LOW-LATENCY (~15ms)' : 'PLAYBACK (~100ms)';
        }

        // 7. Spectrum Visualizer Mode
        const visModeBtns = document.querySelectorAll('.visModeBtn');
        if (visModeBtns.length > 0 && typeof activeVisualizerMode !== 'undefined') {
            visModeBtns.forEach(b => {
                const m = b.dataset.mode;
                const matches = (m === activeVisualizerMode) || (activeVisualizerMode === 'thematic' && (m === 'badapple' || m === 'thematic'));
                b.classList.toggle('active', matches);
            });
        }

        if (typeof updateSignalPathUi === 'function') {
            updateSignalPathUi();
        }
    }

    function switchWorkspace(viewName, targetMobilePanel = null) {
        currentWorkspace = viewName;

        if (viewName === 'soulseek') {
            if (typeof window.getP2pModule === 'function') window.getP2pModule();
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

            if (allTracks[currentTrackIndex]) {
                updateMiniPlayerInfo(allTracks[currentTrackIndex]);
            }
            updateMiniPlayerPlayState(isPlaying);

            if (typeof soulseekController !== 'undefined') {
                if (typeof soulseekController.setSubView === 'function') {
                    soulseekController.setSubView('results');
                }
                soulseekController.checkStatus();
                soulseekController.startTransfersPolling();
            }
        } else if (viewName === 'download') {
            if (typeof window.getP2pModule === 'function') window.getP2pModule();
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

            if (allTracks[currentTrackIndex]) {
                updateMiniPlayerInfo(allTracks[currentTrackIndex]);
            }
            updateMiniPlayerPlayState(isPlaying);

            if (typeof soulseekController !== 'undefined') {
                soulseekController.stopTransfersPolling();
            }

            if (typeof fetchLanStreamingUrl === 'function') {
                fetchLanStreamingUrl();
            }
        } else if (viewName === 'settings') {
            if (typeof window.getSettingsModule === 'function') window.getSettingsModule();
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

            if (allTracks[currentTrackIndex]) {
                updateMiniPlayerInfo(allTracks[currentTrackIndex]);
            }
            updateMiniPlayerPlayState(isPlaying);

            if (typeof soulseekController !== 'undefined') {
                soulseekController.stopTransfersPolling();
            }

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

            if (typeof soulseekController !== 'undefined') {
                soulseekController.stopTransfersPolling();
            }

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
                        if (allTracks && allTracks[currentTrackIndex]) updateMiniPlayerInfo(allTracks[currentTrackIndex]);
                        updateMiniPlayerPlayState(isPlaying);
                    }
                    if (typeof renderVirtualTrackWindow === 'function') {
                        renderVirtualTrackWindow(true);
                    }
                } else if (activeTarget === 'settingsPanel') {
                    document.body.classList.add('mobile-tab-info');
                    if (persistentMiniPlayer) {
                        persistentMiniPlayer.style.display = 'flex';
                        if (allTracks && allTracks[currentTrackIndex]) updateMiniPlayerInfo(allTracks[currentTrackIndex]);
                        updateMiniPlayerPlayState(isPlaying);
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

            if (typeof resumeVisualizerLoop === 'function') {
                resumeVisualizerLoop();
            }

            if (typeof resizeVisualizerCanvas === 'function') {
                resizeVisualizerCanvas();
            }
        }
    }

    // No sample placeholder tracks — user chooses music directory first
    const fallbackTracks = [];

    // =========================================================================

    // Blocking Track Loading Overlay & IndexedDB Library Persistence
    // =========================================================================
    let isTrackLoadingCancelled = false;
    let activeScanAbortController = null;

    function showTrackLoadingOverlay(title = 'LOADING MUSIC LIBRARY...', statusText = 'Indexing audio files and metadata. Please wait...', progressPct = null) {
        isTrackLoadingCancelled = false;
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
        activeScanAbortController = null;
    }

    function cancelActiveTrackLoading() {
        isTrackLoadingCancelled = true;
        if (activeScanAbortController) {
            try { activeScanAbortController.abort(); } catch (_) {}
            activeScanAbortController = null;
        }
        if (window.AndroidBridge && typeof window.AndroidBridge.cancelScan === 'function') {
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
        const hasTracks = Array.isArray(allTracks) && allTracks.length > 0;

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
        updateSignalPathUi();
    }


    // Attach top-level UI elements and helpers to window for cross-module accessibility
    if (typeof window !== "undefined") {
        try { window.activeListLabel = activeListLabel; } catch (_) {}
        try { window.activeScanAbortController = activeScanAbortController; } catch (_) {}
        try { window.activeTheme = activeTheme; } catch (_) {}
        try { window.albumName = albumName; } catch (_) {}
        try { window.artistName = artistName; } catch (_) {}
        try { window.audio = audio; } catch (_) {}
        try { window.auditMetricHeadroom = auditMetricHeadroom; } catch (_) {}
        try { window.auditMetricLatency = auditMetricLatency; } catch (_) {}
        try { window.auditQualityBadge = auditQualityBadge; } catch (_) {}
        try { window.auditQualityDesc = auditQualityDesc; } catch (_) {}
        try { window.auditQualityDot = auditQualityDot; } catch (_) {}
        try { window.backToLibraryBtn = backToLibraryBtn; } catch (_) {}
        try { window.bannerAddTracksBtn = bannerAddTracksBtn; } catch (_) {}
        try { window.bgDisc = bgDisc; } catch (_) {}
        try { window.bindFastAction = bindFastAction; } catch (_) {}
        try { window.browseFolderBtn = browseFolderBtn; } catch (_) {}
        try { window.cachedAllPanelsList = cachedAllPanelsList; } catch (_) {}
        try { window.cachedMobileTabBtns = cachedMobileTabBtns; } catch (_) {}
        try { window.cancelActiveTrackLoading = cancelActiveTrackLoading; } catch (_) {}
        try { window.cancelSleepTimerBtn = cancelSleepTimerBtn; } catch (_) {}
        try { window.clearQueueBtn = clearQueueBtn; } catch (_) {}
        try { window.closeFolderTrayBtn = closeFolderTrayBtn; } catch (_) {}
        try { window.closeModalBtn = closeModalBtn; } catch (_) {}
        try { window.closePeqModal = closePeqModal; } catch (_) {}
        try { window.closeSignalPathModalBtn = closeSignalPathModalBtn; } catch (_) {}
        try { window.closeSleepTimerModalBtn = closeSleepTimerModalBtn; } catch (_) {}
        try { window.closeThemeModalBtn = closeThemeModalBtn; } catch (_) {}
        try { window.coverArtPreview = coverArtPreview; } catch (_) {}
        try { window.coverBadge = coverBadge; } catch (_) {}
        try { window.createPlaylistBtn = createPlaylistBtn; } catch (_) {}
        try { window.ctx = ctx; } catch (_) {}
        try { window.currentFormatFilter = currentFormatFilter; } catch (_) {}
        try { window.currentPlaylistTitle = currentPlaylistTitle; } catch (_) {}
        try { window.currentTimeEl = currentTimeEl; } catch (_) {}
        try { window.currentWorkspace = currentWorkspace; } catch (_) {}
        try { window.customSleepInput = customSleepInput; } catch (_) {}
        try { window.deckArtworkAmbient = deckArtworkAmbient; } catch (_) {}
        try { window.deckArtworkBackdrop = deckArtworkBackdrop; } catch (_) {}
        try { window.deckSignalDot = deckSignalDot; } catch (_) {}
        try { window.deferredInstallPrompt = deferredInstallPrompt; } catch (_) {}
        try { window.deleteCurrentPlaylistBtn = deleteCurrentPlaylistBtn; } catch (_) {}
        try { window.dismissedTracksMap = dismissedTracksMap; } catch (_) {}
        try { window.downloadWorkspace = downloadWorkspace; } catch (_) {}
        try { window.fallbackTracks = fallbackTracks; } catch (_) {}
        try { window.folderPathInput = folderPathInput; } catch (_) {}
        try { window.folderPickerInput = folderPickerInput; } catch (_) {}
        try { window.folderTray = folderTray; } catch (_) {}
        try { window.getActiveTheme = getActiveTheme; } catch (_) {}
        try { window.gridContainer = gridContainer; } catch (_) {}
        try { window.hideTrackLoadingOverlay = hideTrackLoadingOverlay; } catch (_) {}
        try { window.infoPanelEl = infoPanelEl; } catch (_) {}
        try { window.installAppBtn = installAppBtn; } catch (_) {}
        try { window.isAtlasThemeActive = isAtlasThemeActive; } catch (_) {}
        try { window.isTrackLoadingCancelled = isTrackLoadingCancelled; } catch (_) {}
        try { window.lastRenderedMiniTrack = lastRenderedMiniTrack; } catch (_) {}
        try { window.libraryControls = libraryControls; } catch (_) {}
        try { window.localFileInput = localFileInput; } catch (_) {}
        try { window.lyricsArtistName = lyricsArtistName; } catch (_) {}
        try { window.lyricsCon = lyricsCon; } catch (_) {}
        try { window.lyricsContent = lyricsContent; } catch (_) {}
        try { window.lyricsScrollArea = lyricsScrollArea; } catch (_) {}
        try { window.lyricsToggleBtn = lyricsToggleBtn; } catch (_) {}
        try { window.lyricsTrackName = lyricsTrackName; } catch (_) {}
        try { window.metadataToggleBtn = metadataToggleBtn; } catch (_) {}
        try { window.metadataEditorModal = metadataEditorModal; } catch (_) {}
        try { window.closeMetaEditorModalBtn = closeMetaEditorModalBtn; } catch (_) {}
        try { window.metaEditCancelBtn = metaEditCancelBtn; } catch (_) {}
        try { window.metaEditorForm = metaEditorForm; } catch (_) {}
        try { window.metaEditSaveBtn = metaEditSaveBtn; } catch (_) {}
        try { window.metaEditTitle = metaEditTitle; } catch (_) {}
        try { window.metaEditArtist = metaEditArtist; } catch (_) {}
        try { window.metaEditAlbum = metaEditAlbum; } catch (_) {}
        try { window.metaEditGenre = metaEditGenre; } catch (_) {}
        try { window.metaEditYear = metaEditYear; } catch (_) {}
        try { window.metaEditTrackNum = metaEditTrackNum; } catch (_) {}
        try { window.metaEditComment = metaEditComment; } catch (_) {}
        try { window.metaEditorThumb = metaEditorThumb; } catch (_) {}
        try { window.metaEditorFileTitle = metaEditorFileTitle; } catch (_) {}
        try { window.metaEditorFilePath = metaEditorFilePath; } catch (_) {}
        try { window.metaEditorStatus = metaEditorStatus; } catch (_) {}
        try { window.metaEditorFormatPill = metaEditorFormatPill; } catch (_) {}
        try { window.metaEditorBitratePill = metaEditorBitratePill; } catch (_) {}
        try { window.metaEditorSampleRatePill = metaEditorSampleRatePill; } catch (_) {}
        try { window.metaEditorBitDepthPill = metaEditorBitDepthPill; } catch (_) {}
        try { window.infoPanelEditMetaBtn = infoPanelEditMetaBtn; } catch (_) {}
        try { window.trackMenuEditMetaBtn = trackMenuEditMetaBtn; } catch (_) {}
        try { window.miniArtPreview = miniArtPreview; } catch (_) {}
        try { window.miniArtist = miniArtist; } catch (_) {}
        try { window.miniCurrentTime = miniCurrentTime; } catch (_) {}
        try { window.miniDeckReturnBtn = miniDeckReturnBtn; } catch (_) {}
        try { window.miniMuteBtn = miniMuteBtn; } catch (_) {}
        try { window.miniNextBtn = miniNextBtn; } catch (_) {}
        try { window.miniPlayBtn = miniPlayBtn; } catch (_) {}
        try { window.miniPlayImg = miniPlayImg; } catch (_) {}
        try { window.miniPrevBtn = miniPrevBtn; } catch (_) {}
        try { window.miniProgressBar = miniProgressBar; } catch (_) {}
        try { window.miniProgressCon = miniProgressCon; } catch (_) {}
        try { window.miniTitle = miniTitle; } catch (_) {}
        try { window.miniTotalDuration = miniTotalDuration; } catch (_) {}
        try { window.miniTurntableThumb = miniTurntableThumb; } catch (_) {}
        try { window.miniVolumeSlider = miniVolumeSlider; } catch (_) {}
        try { window.modalCreateAndAddBtn = modalCreateAndAddBtn; } catch (_) {}
        try { window.modalNewPlaylistName = modalNewPlaylistName; } catch (_) {}
        try { window.modalPlaylistList = modalPlaylistList; } catch (_) {}
        try { window.modalTrackTitle = modalTrackTitle; } catch (_) {}
        try { window.muteBtn = muteBtn; } catch (_) {}
        try { window.newPlaylistInput = newPlaylistInput; } catch (_) {}
        try { window.nextBtn = nextBtn; } catch (_) {}
        try { window.openPeqModal = openPeqModal; } catch (_) {}
        try { window.openSignalAuditBtn = openSignalAuditBtn; } catch (_) {}
        try { window.persistentMiniPlayer = persistentMiniPlayer; } catch (_) {}
        try { window.playPauseBtn = playPauseBtn; } catch (_) {}
        try { window.playPauseImg = playPauseImg; } catch (_) {}
        try { window.playQueue = playQueue; } catch (_) {}
        try { window.playerDeckEl = playerDeckEl; } catch (_) {}
        try { window.playlistBanner = playlistBanner; } catch (_) {}
        try { window.playlistList = playlistList; } catch (_) {}
        try { window.playlistModal = playlistModal; } catch (_) {}
        try { window.playlistsView = playlistsView; } catch (_) {}
        try { window.presetPathBtns = presetPathBtns; } catch (_) {}
        try { window.prevBtn = prevBtn; } catch (_) {}
        try { window.progressBar = progressBar; } catch (_) {}
        try { window.progressCon = progressCon; } catch (_) {}
        try { window.progressHover = progressHover; } catch (_) {}
        try { window.queueCountBadge = queueCountBadge; } catch (_) {}
        try { window.queueCountSummary = queueCountSummary; } catch (_) {}
        try { window.queueList = queueList; } catch (_) {}
        try { window.queueView = queueView; } catch (_) {}
        try { window.quickNewPlaylistBtn = quickNewPlaylistBtn; } catch (_) {}
        try { window.refreshTracksBtn = refreshTracksBtn; } catch (_) {}
        try { window.repeatBtn = repeatBtn; } catch (_) {}
        try { window.restoreTracksBtn = restoreTracksBtn; } catch (_) {}
        try { window.scanFolderBtn = scanFolderBtn; } catch (_) {}
        try { window.scanStatus = scanStatus; } catch (_) {}
        try { window.setCustomSleepBtn = setCustomSleepBtn; } catch (_) {}
        try { window.setMobilePanelsInactive = setMobilePanelsInactive; } catch (_) {}
        try { window.setMobileSearchPanelCollapsed = setMobileSearchPanelCollapsed; } catch (_) {}
        try { window.setMobileTabActive = setMobileTabActive; } catch (_) {}
        try { window.settingsPanelEl = settingsPanelEl; } catch (_) {}
        try { window.settingsReturnBtn = settingsReturnBtn; } catch (_) {}
        try { window.settingsWorkspace = settingsWorkspace; } catch (_) {}
        try { window.showTrackLoadingOverlay = showTrackLoadingOverlay; } catch (_) {}
        try { window.shuffleBtn = shuffleBtn; } catch (_) {}
        try { window.shufflePlayBtn = shufflePlayBtn; } catch (_) {}
        try { window.signalPathBadgeBtn = signalPathBadgeBtn; } catch (_) {}
        try { window.signalPathLabel = signalPathLabel; } catch (_) {}
        try { window.signalPathModal = signalPathModal; } catch (_) {}
        try { window.sleepStatusCard = sleepStatusCard; } catch (_) {}
        try { window.sleepStatusRemaining = sleepStatusRemaining; } catch (_) {}
        try { window.sleepTimerBtn = sleepTimerBtn; } catch (_) {}
        try { window.sleepTimerInterval = sleepTimerInterval; } catch (_) {}
        try { window.sleepTimerLabel = sleepTimerLabel; } catch (_) {}
        try { window.sleepTimerModal = sleepTimerModal; } catch (_) {}
        try { window.sleepTimerMode = sleepTimerMode; } catch (_) {}
        try { window.sleepTimerOriginalVolume = sleepTimerOriginalVolume; } catch (_) {}
        try { window.sleepTimerRemainingSec = sleepTimerRemainingSec; } catch (_) {}
        try { window.standaloneBanner = standaloneBanner; } catch (_) {}
        try { window.standaloneBannerTitle = standaloneBannerTitle; } catch (_) {}
        try { window.standaloneResumeLibraryBtn = standaloneResumeLibraryBtn; } catch (_) {}
        try { window.standaloneCloseBtn = standaloneCloseBtn; } catch (_) {}
        try { window.slskAccountAlert = slskAccountAlert; } catch (_) {}
        try { window.slskAccountBtn = slskAccountBtn; } catch (_) {}
        try { window.slskAccountModal = slskAccountModal; } catch (_) {}
        try { window.slskActiveSearchMeta = slskActiveSearchMeta; } catch (_) {}
        try { window.slskChangeDirBtn = slskChangeDirBtn; } catch (_) {}
        try { window.slskChangeSharedDirBtn = slskChangeSharedDirBtn; } catch (_) {}
        try { window.slskClearSubFilterBtn = slskClearSubFilterBtn; } catch (_) {}
        try { window.slskCloseAccountModalBtn = slskCloseAccountModalBtn; } catch (_) {}
        try { window.slskCloseDrawerBtn = slskCloseDrawerBtn; } catch (_) {}
        try { window.slskControlsPanel = slskControlsPanel; } catch (_) {}
        try { window.slskDownloadsPathText = slskDownloadsPathText; } catch (_) {}
        try { window.slskExcludeFilterClearBtn = slskExcludeFilterClearBtn; } catch (_) {}
        try { window.slskExcludeFilterInput = slskExcludeFilterInput; } catch (_) {}
        try { window.slskFilterChips = slskFilterChips; } catch (_) {}
        try { window.slskInResultFilterClearBtn = slskInResultFilterClearBtn; } catch (_) {}
        try { window.slskInResultFilterInput = slskInResultFilterInput; } catch (_) {}
        try { window.slskIncludeFilterClearBtn = slskIncludeFilterClearBtn; } catch (_) {}
        try { window.slskIncludeFilterInput = slskIncludeFilterInput; } catch (_) {}
        try { window.slskLogoutBtn = slskLogoutBtn; } catch (_) {}
        try { window.slskMobileActiveFilter = slskMobileActiveFilter; } catch (_) {}
        try { window.slskMobileTransferCount = slskMobileTransferCount; } catch (_) {}
        try { window.slskMobileTransfersBtn = slskMobileTransfersBtn; } catch (_) {}
        try { window.slskModalDownloadDir = slskModalDownloadDir; } catch (_) {}
        try { window.slskModalPassword = slskModalPassword; } catch (_) {}
        try { window.slskModalPowerBtn = slskModalPowerBtn; } catch (_) {}
        try { window.slskModalSharedDir = slskModalSharedDir; } catch (_) {}
        try { window.slskModalSyncPlayerDirBtn = slskModalSyncPlayerDirBtn; } catch (_) {}
        try { window.slskModalSyncSharePlayerDirBtn = slskModalSyncSharePlayerDirBtn; } catch (_) {}
        try { window.slskModalUsername = slskModalUsername; } catch (_) {}
        try { window.slskPanelToggleBar = slskPanelToggleBar; } catch (_) {}
        try { window.slskPanelToggleChevron = slskPanelToggleChevron; } catch (_) {}
        try { window.slskPlaceholder = slskPlaceholder; } catch (_) {}
        try { window.slskPowerBtn = slskPowerBtn; } catch (_) {}
        try { window.slskPowerBtnText = slskPowerBtnText; } catch (_) {}
        try { window.slskRefreshStatusBtn = slskRefreshStatusBtn; } catch (_) {}
        try { window.slskResultCount = slskResultCount; } catch (_) {}
        try { window.slskResultsList = slskResultsList; } catch (_) {}
        try { window.slskSaveAccountBtn = slskSaveAccountBtn; } catch (_) {}
        try { window.slskScanDownloadsBtn = slskScanDownloadsBtn; } catch (_) {}
        try { window.slskSearchClearBtn = slskSearchClearBtn; } catch (_) {}
        try { window.slskSearchInput = slskSearchInput; } catch (_) {}
        try { window.slskSearchSubmitBtn = slskSearchSubmitBtn; } catch (_) {}
        try { window.slskSearchingState = slskSearchingState; } catch (_) {}
        try { window.slskSearchingTitle = slskSearchingTitle; } catch (_) {}
        try { window.slskSharedPathText = slskSharedPathText; } catch (_) {}
        try { window.slskSortSelect = slskSortSelect; } catch (_) {}
        try { window.slskStartDaemonBtn = slskStartDaemonBtn; } catch (_) {}
        try { window.slskStatusDot = slskStatusDot; } catch (_) {}
        try { window.slskStatusPill = slskStatusPill; } catch (_) {}
        try { window.slskStatusText = slskStatusText; } catch (_) {}
        try { window.slskSuggestedChips = slskSuggestedChips; } catch (_) {}
        try { window.slskSuggestedRow = slskSuggestedRow; } catch (_) {}
        try { window.slskSyncCurrentDirBtn = slskSyncCurrentDirBtn; } catch (_) {}
        try { window.slskToggleTransfersBtn = slskToggleTransfersBtn; } catch (_) {}
        try { window.slskTransferCount = slskTransferCount; } catch (_) {}
        try { window.slskTransfersDrawer = slskTransfersDrawer; } catch (_) {}
        try { window.slskTransfersHeader = slskTransfersHeader; } catch (_) {}
        try { window.slskTransfersList = slskTransfersList; } catch (_) {}
        try { window.slskTransfersSummary = slskTransfersSummary; } catch (_) {}
        try { window.slskUsername = slskUsername; } catch (_) {}
        try { window.sortSelect = sortSelect; } catch (_) {}
        try { window.soulseekWorkspace = soulseekWorkspace; } catch (_) {}
        try { window.speedBtns = speedBtns; } catch (_) {}
        try { window.statAlbum = statAlbum; } catch (_) {}
        try { window.statArtist = statArtist; } catch (_) {}
        try { window.statBitDepth = statBitDepth; } catch (_) {}
        try { window.statBitrate = statBitrate; } catch (_) {}
        try { window.statChannels = statChannels; } catch (_) {}
        try { window.statDacStream = statDacStream; } catch (_) {}
        try { window.statDynamicRange = statDynamicRange; } catch (_) {}
        try { window.statFormat = statFormat; } catch (_) {}
        try { window.statGenre = statGenre; } catch (_) {}
        try { window.statPath = statPath; } catch (_) {}
        try { window.statPeakLevel = statPeakLevel; } catch (_) {}
        try { window.statSampleRate = statSampleRate; } catch (_) {}
        try { window.statSize = statSize; } catch (_) {}
        try { window.statTitle = statTitle; } catch (_) {}
        try { window.statTrack = statTrack; } catch (_) {}
        try { window.statYear = statYear; } catch (_) {}
        try { window.switchWorkspace = switchWorkspace; } catch (_) {}
        try { window.syncSettingsTabValues = syncSettingsTabValues; } catch (_) {}
        try { window.tabLibrary = tabLibrary; } catch (_) {}
        try { window.tabPlaylists = tabPlaylists; } catch (_) {}
        try { window.tabQueue = tabQueue; } catch (_) {}
        try { window.themeModal = themeModal; } catch (_) {}
        try { window.themeModalBtn = themeModalBtn; } catch (_) {}
        try { window.themeQuickBtns = themeQuickBtns; } catch (_) {}
        try { window.themeSelectCards = themeSelectCards; } catch (_) {}
        try { window.toggleFolderBtn = toggleFolderBtn; } catch (_) {}
        try { window.toggleMobileSearchPanel = toggleMobileSearchPanel; } catch (_) {}
        try { window.toneArm = toneArm; } catch (_) {}
        try { window.topSettingsBtn = topSettingsBtn; } catch (_) {}
        try { window.topThemeLabel = topThemeLabel; } catch (_) {}
        try { window.totalDurationEl = totalDurationEl; } catch (_) {}
        try { window.trackBadge = trackBadge; } catch (_) {}
        try { window.trackCount = trackCount; } catch (_) {}
        try { window.trackList = trackList; } catch (_) {}
        try { window.trackListPanelEl = trackListPanelEl; } catch (_) {}
        try { window.trackName = trackName; } catch (_) {}
        try { window.trackSearch = trackSearch; } catch (_) {}
        try { window.turntableCenterCanvas = turntableCenterCanvas; } catch (_) {}
        try { window.turntableCenterCtx = turntableCenterCtx; } catch (_) {}
        try { window.turntableCenterVis = turntableCenterVis; } catch (_) {}
        try { window.turntableCon = turntableCon; } catch (_) {}
        try { window.upcomingLibraryList = upcomingLibraryList; } catch (_) {}
        try { window.updateEmptyPlayerState = updateEmptyPlayerState; } catch (_) {}
        try { window.updateMiniPlayerInfo = updateMiniPlayerInfo; } catch (_) {}
        try { window.updateMiniPlayerPlayState = updateMiniPlayerPlayState; } catch (_) {}
        try { window.updateTrackLoadingOverlay = updateTrackLoadingOverlay; } catch (_) {}
        try { window.validThemeIds = validThemeIds; } catch (_) {}
        try { window.vinylArt = vinylArt; } catch (_) {}
        try { window.vinylLabel = vinylLabel; } catch (_) {}
        try { window.vinylTurntable = vinylTurntable; } catch (_) {}
        try { window.visModeBtns = visModeBtns; } catch (_) {}
        try { window.visPillBtns = visPillBtns; } catch (_) {}
        try { window.visualizerCanvas = visualizerCanvas; } catch (_) {}
        try { window.visualizerDock = visualizerDock; } catch (_) {}
        try { window.volumeIcon = volumeIcon; } catch (_) {}
        try { window.volumeLevel = volumeLevel; } catch (_) {}
        try { window.volumeSlider = volumeSlider; } catch (_) {}
        try { window.wsDownloadBtn = wsDownloadBtn; } catch (_) {}
        try { window.wsPlayerBtn = wsPlayerBtn; } catch (_) {}
        try { window.wsSettingsBtn = wsSettingsBtn; } catch (_) {}
        try { window.wsSoulseekBadge = wsSoulseekBadge; } catch (_) {}
        try { window.wsSoulseekBtn = wsSoulseekBtn; } catch (_) {}
        try { window.metadataEditorModal = metadataEditorModal; } catch (_) {}
        try { window.closeMetaEditorModalBtn = closeMetaEditorModalBtn; } catch (_) {}
        try { window.metaEditCancelBtn = metaEditCancelBtn; } catch (_) {}
        try { window.metaEditorForm = metaEditorForm; } catch (_) {}
        try { window.metaEditSaveBtn = metaEditSaveBtn; } catch (_) {}
        try { window.metaEditTitle = metaEditTitle; } catch (_) {}
        try { window.metaEditArtist = metaEditArtist; } catch (_) {}
        try { window.metaEditAlbum = metaEditAlbum; } catch (_) {}
        try { window.metaEditGenre = metaEditGenre; } catch (_) {}
        try { window.metaEditYear = metaEditYear; } catch (_) {}
        try { window.metaEditTrackNum = metaEditTrackNum; } catch (_) {}
        try { window.metaEditComment = metaEditComment; } catch (_) {}
        try { window.metaEditorThumb = metaEditorThumb; } catch (_) {}
        try { window.metaEditorFileTitle = metaEditorFileTitle; } catch (_) {}
        try { window.metaEditorFilePath = metaEditorFilePath; } catch (_) {}
        try { window.metaEditorStatus = metaEditorStatus; } catch (_) {}
        try { window.metaEditorFormatPill = metaEditorFormatPill; } catch (_) {}
        try { window.metaEditorBitratePill = metaEditorBitratePill; } catch (_) {}
        try { window.metaEditorSampleRatePill = metaEditorSampleRatePill; } catch (_) {}
        try { window.metaEditorBitDepthPill = metaEditorBitDepthPill; } catch (_) {}
        try { window.infoPanelEditMetaBtn = infoPanelEditMetaBtn; } catch (_) {}
        try { window.trackMenuEditMetaBtn = trackMenuEditMetaBtn; } catch (_) {}
    }

    export {
        activeListLabel,
        activeScanAbortController,
        activeTheme,
        albumName,
        artistName,
        audio,
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
        closePeqModal,
        closeSignalPathModalBtn,
        closeSleepTimerModalBtn,
        closeThemeModalBtn,
        coverArtPreview,
        coverBadge,
        createPlaylistBtn,
        ctx,
        currentFormatFilter,
        currentPlaylistTitle,
        currentTimeEl,
        currentWorkspace,
        customSleepInput,
        deckArtworkAmbient,
        deckArtworkBackdrop,
        deckSignalDot,
        deferredInstallPrompt,
        deleteCurrentPlaylistBtn,
        dismissedTracksMap,
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
        isTrackLoadingCancelled,
        lastRenderedMiniTrack,
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
        openPeqModal,
        openSignalAuditBtn,
        persistentMiniPlayer,
        playPauseBtn,
        playPauseImg,
        playQueue,
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
        sleepTimerInterval,
        sleepTimerLabel,
        sleepTimerModal,
        sleepTimerMode,
        sleepTimerOriginalVolume,
        sleepTimerRemainingSec,
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
        validThemeIds,
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
