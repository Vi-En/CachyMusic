import re

css_path = 'stylesheets/homepage.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# Find the start of THEME 1: MINIMALIST (WARM PAPER / EDITORIAL)
start_marker = "/* ========================================================================= */\n/* THEME 1: MINIMALIST (WARM PAPER / EDITORIAL)                              */"
# Find the start of Mobile responsive adjustments
end_marker = "/* Mobile responsive adjustments */"

start_idx = css.find(start_marker)
end_idx = css.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print(f"Error: could not find markers. start: {start_idx}, end: {end_idx}")
    exit(1)

print(f"Found theme block from index {start_idx} to {end_idx} ({end_idx - start_idx} chars)")

warm_and_obsidian_css = """/* ========================================================================= */
/* THEME 1: MINIMALIST (WARM PAPER / EDITORIAL) - COMPLETE WCAG AAA SUITE   */
/* Aesthetic: Nordic Warm Ivory Paper, High Contrast Charcoal, Terracotta    */
/* ========================================================================= */

:root[data-theme="minimalist-warm"],
[data-theme="minimalist-warm"] {
    --bg-canvas: #faf8f5;
    --bg-surface-1: #ffffff;
    --bg-surface-2: #f5f2eb;
    --bg-surface-3: #ebe6dc;
    --bg-glass: rgba(250, 248, 245, 0.95);

    --border-subtle: #e2ded6;
    --border-medium: #d97706;
    --border-bold: #b45309;
    --border-focus: #d97706;

    --text-primary: #1c1917;
    --text-secondary: #44403c;
    --text-muted: #57534e;
    --text-disabled: #8d857d;
    --text-accent: #b45309;
    --text-on-accent: #ffffff;

    --accent-color: #d97706;
    --accent-hover: #b45309;
    --accent-glow: rgba(217, 119, 6, 0.35);
    --accent-surface: rgba(217, 119, 6, 0.12);
    --ambient-aura-1: rgba(217, 119, 6, 0.15);
    --ambient-aura-2: rgba(217, 119, 6, 0.03);

    --status-success: #059669;
    --status-warning: #d97706;
    --status-danger: #dc2626;

    --bg-base: #faf8f5;
    --panel-bg: #ffffff;
    --card-bg: #f5f2eb;
    --border-color: #e2ded6;
}

:root[data-theme="minimalist-warm"] body,
[data-theme="minimalist-warm"] body {
    background: #faf8f5 !important;
    color: #1c1917 !important;
}

/* 1. Global Canvas & Top Navigation */
[data-theme="minimalist-warm"] .topBar {
    background: #ffffff !important;
    border-bottom: 2px solid #e2ded6 !important;
    box-shadow: 0 1px 4px rgba(28, 25, 23, 0.05) !important;
}

[data-theme="minimalist-warm"] .brandLogo {
    color: #1c1917 !important;
    font-weight: 800 !important;
    text-shadow: none !important;
}

[data-theme="minimalist-warm"] .brandBadge {
    background: #f5f2eb !important;
    color: #b45309 !important;
    border: 1px solid #d97706 !important;
}

[data-theme="minimalist-warm"] .workspaceSwitcher {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    border-radius: 8px !important;
}

[data-theme="minimalist-warm"] .wsTabBtn {
    background: transparent !important;
    border: none !important;
    color: #44403c !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-warm"] .wsTabBtn:hover {
    background: #ebe6dc !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .wsTabBtn.active {
    background: #1c1917 !important;
    color: #ffffff !important;
    border-color: #1c1917 !important;
    border-radius: 6px !important;
}

[data-theme="minimalist-warm"] .wsTabBtn.active .wsLabel,
[data-theme="minimalist-warm"] .wsTabBtn.active .wsCount,
[data-theme="minimalist-warm"] .wsTabBtn.active * {
    color: #ffffff !important;
}

[data-theme="minimalist-warm"] #topThemeLabel,
[data-theme="minimalist-warm"] .topThemeLabel {
    color: #b45309 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .themeModalBtn {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .themeModalBtn:hover {
    border-color: #d97706 !important;
}

/* 2. Panels, Left Tracklist & Right Inspector */
[data-theme="minimalist-warm"] .panel,
[data-theme="minimalist-warm"] .playerDeck {
    background: #ffffff !important;
    border: 1.5px solid #e2ded6 !important;
    box-shadow: 0 2px 8px rgba(28, 25, 23, 0.04) !important;
    border-radius: 10px !important;
}

[data-theme="minimalist-warm"] .panelHeader h2,
[data-theme="minimalist-warm"] .panelTitle {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .panelHeader .panelSub,
[data-theme="minimalist-warm"] .panelSub {
    color: #57534e !important;
    font-weight: 600 !important;
}

[data-theme="minimalist-warm"] .panelCount,
[data-theme="minimalist-warm"] .badge {
    background: #f5f2eb !important;
    color: #b45309 !important;
    border: 1px solid #e2ded6 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .searchContainer input,
[data-theme="minimalist-warm"] #searchInput,
[data-theme="minimalist-warm"] #trackSearch {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
    border-radius: 6px !important;
}

[data-theme="minimalist-warm"] .searchContainer input::placeholder,
[data-theme="minimalist-warm"] #searchInput::placeholder,
[data-theme="minimalist-warm"] #trackSearch::placeholder {
    color: #8d857d !important;
}

[data-theme="minimalist-warm"] .searchContainer input:focus,
[data-theme="minimalist-warm"] #searchInput:focus,
[data-theme="minimalist-warm"] #trackSearch:focus {
    border-color: #d97706 !important;
    box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.2) !important;
}

[data-theme="minimalist-warm"] .sortSelect,
[data-theme="minimalist-warm"] #sortSelect {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
    border-radius: 6px !important;
}

[data-theme="minimalist-warm"] .tracklistHeader,
[data-theme="minimalist-warm"] #tracklistHeader {
    background: #f5f2eb !important;
    color: #57534e !important;
    border-bottom: 1.5px solid #e2ded6 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .trackItem {
    border-bottom: 1px solid #f5f2eb !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .trackItem:hover {
    background: #faf8f5 !important;
}

[data-theme="minimalist-warm"] .trackItem.active,
[data-theme="minimalist-warm"] .trackItem.playing {
    background: #fef3c7 !important;
    border-left: 3px solid #d97706 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .trackItem.active .trackTitle,
[data-theme="minimalist-warm"] .trackItem.playing .trackTitle {
    color: #b45309 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .trackArtist,
[data-theme="minimalist-warm"] .trackDuration,
[data-theme="minimalist-warm"] .trackNum {
    color: #57534e !important;
}

[data-theme="minimalist-warm"] .trackFormat,
[data-theme="minimalist-warm"] .formatBadge {
    background: #f5f2eb !important;
    color: #b45309 !important;
    border: 1px solid #d97706 !important;
    font-weight: 800 !important;
}

/* Metadata Inspector */
[data-theme="minimalist-warm"] .metaInspector,
[data-theme="minimalist-warm"] .inspectorCard {
    background: #ffffff !important;
    border: 1.5px solid #e2ded6 !important;
}

[data-theme="minimalist-warm"] .metaRow {
    border-bottom: 1px solid #f5f2eb !important;
}

[data-theme="minimalist-warm"] .metaKey {
    color: #57534e !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-warm"] .metaVal {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .albumArtWrapper {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
}

/* 3. Center Player Deck & Turntable */
[data-theme="minimalist-warm"] .trackTitle {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .trackArtist,
[data-theme="minimalist-warm"] #albumName,
[data-theme="minimalist-warm"] .albumName {
    color: #57534e !important;
    font-weight: 600 !important;
}

[data-theme="minimalist-warm"] #currentTime,
[data-theme="minimalist-warm"] #totalDuration,
[data-theme="minimalist-warm"] .timeDisplay {
    color: #57534e !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-warm"] .seekbarRail,
[data-theme="minimalist-warm"] .progressRail,
[data-theme="minimalist-warm"] .seekSlider {
    background: #e2ded6 !important;
}

[data-theme="minimalist-warm"] .seekbarFill,
[data-theme="minimalist-warm"] .progressFill {
    background: #d97706 !important;
}

[data-theme="minimalist-warm"] .seekbarThumb {
    background: #b45309 !important;
    border: 2px solid #ffffff !important;
    box-shadow: 0 1px 4px rgba(28, 25, 23, 0.2) !important;
}

[data-theme="minimalist-warm"] .transportBtn,
[data-theme="minimalist-warm"] .subBtn,
[data-theme="minimalist-warm"] #shuffleBtn,
[data-theme="minimalist-warm"] #repeatBtn,
[data-theme="minimalist-warm"] #stopBtn {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
    border-radius: 6px !important;
}

[data-theme="minimalist-warm"] .transportBtn:hover,
[data-theme="minimalist-warm"] .subBtn:hover {
    border-color: #d97706 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] #shuffleBtn.active,
[data-theme="minimalist-warm"] #repeatBtn.active,
[data-theme="minimalist-warm"] .subBtn.active {
    background: #1c1917 !important;
    border-color: #d97706 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-warm"] #shuffleBtn.active svg path,
[data-theme="minimalist-warm"] #repeatBtn.active svg path,
[data-theme="minimalist-warm"] .subBtn.active svg path {
    fill: #ffffff !important;
}

[data-theme="minimalist-warm"] #playBtn,
[data-theme="minimalist-warm"] .playBtn {
    background: #d97706 !important;
    color: #ffffff !important;
    border: 2px solid #b45309 !important;
    box-shadow: 0 2px 8px rgba(217, 119, 6, 0.3) !important;
}

[data-theme="minimalist-warm"] #playBtn:hover,
[data-theme="minimalist-warm"] .playBtn:hover {
    background: #b45309 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-warm"] .volumeLevel {
    color: #57534e !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-warm"] .volumeSlider {
    background: #e2ded6 !important;
}

[data-theme="minimalist-warm"] #muteBtn {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .audioProcessingBar {
    width: 100%;
}

[data-theme="minimalist-warm"] .eqDeckBtn {
    background: #ffffff !important;
    border: 1.5px solid #d97706 !important;
    color: #1c1917 !important;
    border-radius: 8px !important;
    box-shadow: 2px 2px 0px #d97706 !important;
}

[data-theme="minimalist-warm"] .eqDeckBtn.active {
    background: #d97706 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-warm"] .eqDeckBtn.active .eqDeckTitle,
[data-theme="minimalist-warm"] .eqDeckBtn.active .eqDeckSub {
    color: #ffffff !important;
}

[data-theme="minimalist-warm"] .eqDeckTitle {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .eqDeckSub {
    color: #57534e !important;
    font-weight: 600 !important;
}

[data-theme="minimalist-warm"] .eqDeckBadge {
    background: #f5f2eb !important;
    border: 1px solid #e2ded6 !important;
    color: #57534e !important;
}

[data-theme="minimalist-warm"] .eqDeckDspBadge {
    background: #fef3c7 !important;
    border: 1px solid #d97706 !important;
    color: #b45309 !important;
}

[data-theme="minimalist-warm"] .eqDeckBtn.active .eqDeckBadge,
[data-theme="minimalist-warm"] .eqDeckBtn.active .eqDeckDspBadge {
    background: #ffffff !important;
    color: #1c1917 !important;
    border-color: #ffffff !important;
}

/* 4. Parametric Equalizer Workstation Modal (#peqModal) */
[data-theme="minimalist-warm"] .peqModalCard {
    background: #ffffff !important;
    border: 2px solid #d97706 !important;
    box-shadow: 4px 4px 0px #d97706 !important;
    border-radius: 8px !important;
}

[data-theme="minimalist-warm"] .peqHeaderTitle h3 {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .peqHeaderSub {
    color: #57534e !important;
    font-weight: 600 !important;
}

[data-theme="minimalist-warm"] .peqBypassBtn,
[data-theme="minimalist-warm"] .peqResetBtn,
[data-theme="minimalist-warm"] .peqCloseBtn {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
    border-radius: 6px !important;
}

[data-theme="minimalist-warm"] .peqBypassBtn.active {
    background: #dc2626 !important;
    border-color: #dc2626 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-warm"] .peqCanvasContainer {
    background: #faf8f5 !important;
    border: 1.5px solid #e2ded6 !important;
    border-radius: 6px !important;
}

[data-theme="minimalist-warm"] .peqDbLabel {
    color: #57534e !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-warm"] .peqDspStrip {
    background: #f5f2eb !important;
    border: 1.5px solid #d97706 !important;
    border-radius: 6px !important;
}

[data-theme="minimalist-warm"] .peqSectionBadge {
    background: #d97706 !important;
    color: #ffffff !important;
    border: 1px solid #d97706 !important;
    border-radius: 4px !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .peqDspTitle {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .peqDspSummaryPill {
    background: #ffffff !important;
    color: #1c1917 !important;
    border: 1px solid #e2ded6 !important;
    border-radius: 4px !important;
}

[data-theme="minimalist-warm"] .peqDspSummaryPill.active {
    background: #d97706 !important;
    color: #ffffff !important;
    border-color: #d97706 !important;
}

[data-theme="minimalist-warm"] .peqDspBtn {
    background: #ffffff !important;
    border: 1.5px solid #d97706 !important;
    color: #1c1917 !important;
    border-radius: 6px !important;
    box-shadow: 2px 2px 0px rgba(217, 119, 6, 0.25) !important;
}

[data-theme="minimalist-warm"] .peqDspBtn.active {
    background: #d97706 !important;
    color: #ffffff !important;
    border-color: #d97706 !important;
    box-shadow: none !important;
}

[data-theme="minimalist-warm"] .peqDspBtn.active .peqDspName,
[data-theme="minimalist-warm"] .peqDspBtn.active .peqDspSpec {
    color: #ffffff !important;
}

[data-theme="minimalist-warm"] .peqDspBtn.active .dspDot {
    background: #ffffff !important;
}

[data-theme="minimalist-warm"] .peqToolbarRow,
[data-theme="minimalist-warm"] .peqFadersGrid {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    border-radius: 6px !important;
}

[data-theme="minimalist-warm"] .peqSelect {
    background: #ffffff !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .peqAutoEqBtn {
    background: #ffffff !important;
    border: 1.5px solid #d97706 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .peqXfeedGroup .actionBtn.active,
[data-theme="minimalist-warm"] #peqXfeedToggleBtn.active {
    background: #d97706 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-warm"] .peqAutoEqDrawer {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
}

[data-theme="minimalist-warm"] .peqAutoEqTextarea {
    background: #ffffff !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .peqFaderDb {
    color: #57534e !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-warm"] .peqFaderDb.boost {
    color: #b45309 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .peqFaderDb.cut {
    color: #dc2626 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .peqFaderHz {
    color: #57534e !important;
    font-weight: 700 !important;
}

/* 5. Settings Workspace (#settingsWorkspace) */
[data-theme="minimalist-warm"] .settingsWorkspace {
    background: #faf8f5 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .settingsHubHeaderLeft h2,
[data-theme="minimalist-warm"] .settingsSectionTitle,
[data-theme="minimalist-warm"] .settingsRowTitle {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .settingsSubtitle,
[data-theme="minimalist-warm"] .settingsSectionDesc,
[data-theme="minimalist-warm"] .settingsRowDesc,
[data-theme="minimalist-warm"] .settingsCardNote {
    color: #57534e !important;
}

[data-theme="minimalist-warm"] .settingsSectionPanel {
    background: #ffffff !important;
    border: 1.5px solid #e2ded6 !important;
    box-shadow: 0 2px 8px rgba(28, 25, 23, 0.04) !important;
    border-radius: 8px !important;
}

[data-theme="minimalist-warm"] .settingsSectionHeader {
    border-bottom: 1.5px solid #e2ded6 !important;
}

[data-theme="minimalist-warm"] .settingsSectionBadge,
[data-theme="minimalist-warm"] .settingsBadge {
    background: #f5f2eb !important;
    color: #b45309 !important;
    border: 1px solid #d97706 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .settingsEnginePill,
[data-theme="minimalist-warm"] .settingsThemeBadge {
    background: #d97706 !important;
    color: #ffffff !important;
    border-radius: 4px !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .settingsDspMetricItem {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    border-radius: 6px !important;
}

[data-theme="minimalist-warm"] .settingsDspKey {
    color: #57534e !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-warm"] .settingsDspVal {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .settingsOptionToggles .actionBtn,
[data-theme="minimalist-warm"] .enginePrecisionBtn,
[data-theme="minimalist-warm"] .ditherModeBtn,
[data-theme="minimalist-warm"] .bufferLatencyBtn,
[data-theme="minimalist-warm"] .toggleActiveBtn,
[data-theme="minimalist-warm"] .visModeBtn,
[data-theme="minimalist-warm"] .presetPathBtn,
[data-theme="minimalist-warm"] .settingsReturnBtn {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
    border-radius: 6px !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-warm"] .settingsOptionToggles .actionBtn.active,
[data-theme="minimalist-warm"] .enginePrecisionBtn.active,
[data-theme="minimalist-warm"] .ditherModeBtn.active,
[data-theme="minimalist-warm"] .bufferLatencyBtn.active,
[data-theme="minimalist-warm"] .visModeBtn.active,
[data-theme="minimalist-warm"] .themeQuickBtn.active {
    background: #d97706 !important;
    color: #ffffff !important;
    border-color: #d97706 !important;
}

[data-theme="minimalist-warm"] .toggleActiveBtn.active {
    background: #1c1917 !important;
    border-color: #d97706 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-warm"] .settingsThemePickerBtn {
    background: #ffffff !important;
    border: 1.5px solid #d97706 !important;
    border-radius: 8px !important;
    box-shadow: 2px 2px 0px #d97706 !important;
}

[data-theme="minimalist-warm"] .settingsThemePickerSub {
    color: #57534e !important;
}

[data-theme="minimalist-warm"] .settingsThemePickerCurrent {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .settingsThemePickerAction {
    background: #d97706 !important;
    color: #ffffff !important;
    border-radius: 6px !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .settingsInput,
[data-theme="minimalist-warm"] #settingsTabFolderPathInput {
    background: #ffffff !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .settingsScanStatusBox,
[data-theme="minimalist-warm"] #settingsTabScanStatus {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
    border-left: 4px solid #d97706 !important;
}

[data-theme="minimalist-warm"] .settingsSleepBadge {
    background: #f5f2eb !important;
    border: 1px solid #d97706 !important;
    color: #b45309 !important;
    font-weight: 800 !important;
}

/* 6. Soulseek Workspace (#soulseekWorkspace) */
[data-theme="minimalist-warm"] .slskWorkspace,
[data-theme="minimalist-warm"] .slskToolbar {
    background: #ffffff !important;
    border: 1.5px solid #e2ded6 !important;
}

[data-theme="minimalist-warm"] .slskLogo {
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .slskBadge {
    background: #f5f2eb !important;
    color: #b45309 !important;
    border: 1px solid #d97706 !important;
}

[data-theme="minimalist-warm"] .slskStatusPill {
    background: #f5f2eb !important;
    border: 1px solid #e2ded6 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .slskSearchInput,
[data-theme="minimalist-warm"] #slskSearchInput {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .slskSubmitBtn,
[data-theme="minimalist-warm"] #slskSearchSubmitBtn {
    background: #d97706 !important;
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .slskFilterPill,
[data-theme="minimalist-warm"] .slskChip {
    background: #f5f2eb !important;
    border: 1px solid #e2ded6 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .slskFilterPill.active,
[data-theme="minimalist-warm"] .slskChip.active {
    background: #d97706 !important;
    color: #ffffff !important;
    border-color: #d97706 !important;
}

[data-theme="minimalist-warm"] .slskFilterPill.active *,
[data-theme="minimalist-warm"] .slskChip.active * {
    color: #ffffff !important;
}

[data-theme="minimalist-warm"] .slskResultsCon,
[data-theme="minimalist-warm"] .slskResultsList {
    background: #ffffff !important;
    border: 1.5px solid #e2ded6 !important;
}

[data-theme="minimalist-warm"] .slskResultsHeader {
    background: #f5f2eb !important;
    color: #57534e !important;
    border-bottom: 1.5px solid #e2ded6 !important;
}

[data-theme="minimalist-warm"] .slskResultsHeader .col,
[data-theme="minimalist-warm"] .slskResultsHeader .col * {
    color: #57534e !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .slskResultRow {
    border-bottom: 1px solid #f5f2eb !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .slskResultRow:hover {
    background: #faf8f5 !important;
}

[data-theme="minimalist-warm"] .slskResultTitle {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .slskResultPath,
[data-theme="minimalist-warm"] .slskSizeVal,
[data-theme="minimalist-warm"] .slskPeerUser,
[data-theme="minimalist-warm"] .slskPeerSpeed {
    color: #57534e !important;
}

[data-theme="minimalist-warm"] .slskBitrateVal {
    color: #b45309 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .slskBtnPrimary,
[data-theme="minimalist-warm"] .slskDlBtn {
    background: #d97706 !important;
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .slskTransfersDrawer {
    background: #ffffff !important;
    border: 1.5px solid #e2ded6 !important;
}

[data-theme="minimalist-warm"] .slskTransfersHeader {
    background: #f5f2eb !important;
    color: #1c1917 !important;
    border-bottom: 1.5px solid #e2ded6 !important;
}

[data-theme="minimalist-warm"] .slskTransferBarCon {
    background: #e2ded6 !important;
}

[data-theme="minimalist-warm"] .slskTransferBarFill {
    background: #d97706 !important;
}

[data-theme="minimalist-warm"] .slskModalCard {
    background: #ffffff !important;
    border: 2px solid #d97706 !important;
    color: #1c1917 !important;
}

/* 7. Download Hub Workspace (#downloadWorkspace) */
[data-theme="minimalist-warm"] .downloadWorkspace {
    background: #faf8f5 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .downloadWorkspace .downloadReturnBtn {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .pkgCard,
[data-theme="minimalist-warm"] .downloadCard {
    background: #ffffff !important;
    border: 1.5px solid #e2ded6 !important;
    box-shadow: 0 2px 8px rgba(28, 25, 23, 0.04) !important;
}

[data-theme="minimalist-warm"] .pkgCard h3,
[data-theme="minimalist-warm"] .downloadCardTitle {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .pkgCard p,
[data-theme="minimalist-warm"] .downloadCardDesc {
    color: #57534e !important;
}

[data-theme="minimalist-warm"] .downloadWorkspace pre,
[data-theme="minimalist-warm"] .downloadWorkspace code {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    color: #1c1917 !important;
    font-family: monospace !important;
}

[data-theme="minimalist-warm"] .copyCodeBtn {
    background: #ffffff !important;
    border: 1.5px solid #d97706 !important;
    color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .copyCodeBtn:hover {
    background: #d97706 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-warm"] .archTab {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
    color: #57534e !important;
}

[data-theme="minimalist-warm"] .archTab.active {
    background: #1c1917 !important;
    color: #ffffff !important;
    border-color: #1c1917 !important;
}

[data-theme="minimalist-warm"] .lanStreamingBox {
    background: #f5f2eb !important;
    border: 1.5px solid #d97706 !important;
    color: #1c1917 !important;
}

/* 8. Theme Modal & Modals */
[data-theme="minimalist-warm"] .themeModalCard,
[data-theme="minimalist-warm"] .modalCard {
    background: #ffffff !important;
    border: 2px solid #d97706 !important;
}

[data-theme="minimalist-warm"] .themeCategoryHeader h4 {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .themeCategoryCount {
    background: #f5f2eb !important;
    color: #b45309 !important;
    border: 1px solid #d97706 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .themeSelectCard {
    background: #f5f2eb !important;
    border: 1.5px solid #e2ded6 !important;
}

[data-theme="minimalist-warm"] .themeSelectCard:hover {
    border-color: #d97706 !important;
}

[data-theme="minimalist-warm"] .themeSelectCard.active {
    border-color: #d97706 !important;
    box-shadow: 3px 3px 0px #d97706 !important;
    background: #ffffff !important;
}

[data-theme="minimalist-warm"] .themeCardTitle {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .themeCardDesc {
    color: #57534e !important;
}

[data-theme="minimalist-warm"] .themeActivePill {
    background: #d97706 !important;
    color: #ffffff !important;
    font-weight: 800 !important;
}

/* 9. Mobile Tab Bar & Persistent Mini-Player */
[data-theme="minimalist-warm"] .mobileTabBar {
    background: #ffffff !important;
    border-top: 2px solid #e2ded6 !important;
}

[data-theme="minimalist-warm"] .mobileTabBtn .mobileTabIcon,
[data-theme="minimalist-warm"] .mobileTabBtn .mobileTabLabel {
    color: #57534e !important;
}

[data-theme="minimalist-warm"] .mobileTabBtn.active {
    background: #f5f2eb !important;
    color: #d97706 !important;
}

[data-theme="minimalist-warm"] .mobileTabBtn.active .mobileTabIcon,
[data-theme="minimalist-warm"] .mobileTabBtn.active .mobileTabLabel {
    color: #d97706 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .persistentMiniPlayer {
    background: #ffffff !important;
    border-top: 2px solid #d97706 !important;
}

[data-theme="minimalist-warm"] #miniTrackTitle {
    color: #1c1917 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] #miniArtist {
    color: #57534e !important;
}

[data-theme="minimalist-warm"] .miniDeckReturnBtn,
[data-theme="minimalist-warm"] #miniDeckReturnBtn {
    background: #d97706 !important;
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-warm"] .miniDeckReturnBtn *,
[data-theme="minimalist-warm"] #miniDeckReturnBtn * {
    color: #ffffff !important;
}


/* ========================================================================= */
/* THEME 2: MINIMALIST (OBSIDIAN OLED) - COMPLETE WCAG AAA SUITE             */
/* Aesthetic: Pure Pitch-Black Void, Platinum White, Electric Ice Cyan       */
/* ========================================================================= */

:root[data-theme="minimalist-obsidian"],
[data-theme="minimalist-obsidian"] {
    --bg-canvas: #000000;
    --bg-surface-1: #090a0f;
    --bg-surface-2: #0f1118;
    --bg-surface-3: #181b24;
    --bg-glass: rgba(0, 0, 0, 0.94);

    --border-subtle: #1e2230;
    --border-medium: #38bdf8;
    --border-bold: #38bdf8;
    --border-focus: #38bdf8;

    --text-primary: #ffffff;
    --text-secondary: #cbd5e1;
    --text-muted: #94a3b8;
    --text-disabled: #475569;
    --text-accent: #38bdf8;
    --text-on-accent: #000000;

    --accent-color: #38bdf8;
    --accent-hover: #7dd3fc;
    --accent-glow: rgba(56, 189, 248, 0.45);
    --accent-surface: rgba(56, 189, 248, 0.14);
    --ambient-aura-1: rgba(56, 189, 248, 0.20);
    --ambient-aura-2: rgba(56, 189, 248, 0.04);

    --status-success: #10b981;
    --status-warning: #f59e0b;
    --status-danger: #ef4444;

    --bg-base: #000000;
    --panel-bg: #090a0f;
    --card-bg: #0f1118;
    --border-color: #1e2230;
}

:root[data-theme="minimalist-obsidian"] body,
[data-theme="minimalist-obsidian"] body {
    background: #000000 !important;
    color: #ffffff !important;
}

/* 1. Global Canvas & Top Navigation */
[data-theme="minimalist-obsidian"] .topBar {
    background: #000000 !important;
    border-bottom: 1.5px solid #1e2230 !important;
    box-shadow: 0 1px 12px rgba(0, 0, 0, 0.9) !important;
}

[data-theme="minimalist-obsidian"] .brandLogo {
    color: #ffffff !important;
    font-weight: 800 !important;
    text-shadow: 0 0 10px rgba(56, 189, 248, 0.4) !important;
}

[data-theme="minimalist-obsidian"] .brandBadge {
    background: #0f1118 !important;
    color: #38bdf8 !important;
    border: 1px solid #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] .workspaceSwitcher {
    background: #090a0f !important;
    border: 1.5px solid #1e2230 !important;
    border-radius: 6px !important;
}

[data-theme="minimalist-obsidian"] .wsTabBtn {
    background: transparent !important;
    border: none !important;
    color: #94a3b8 !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-obsidian"] .wsTabBtn:hover {
    background: #181b24 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .wsTabBtn.active {
    background: #38bdf8 !important;
    color: #000000 !important;
    border-color: #38bdf8 !important;
    border-radius: 4px !important;
}

[data-theme="minimalist-obsidian"] .wsTabBtn.active .wsLabel,
[data-theme="minimalist-obsidian"] .wsTabBtn.active .wsCount,
[data-theme="minimalist-obsidian"] .wsTabBtn.active * {
    color: #000000 !important;
}

[data-theme="minimalist-obsidian"] #topThemeLabel,
[data-theme="minimalist-obsidian"] .topThemeLabel {
    color: #38bdf8 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .themeModalBtn {
    background: #0f1118 !important;
    border: 1px solid #1e2230 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .themeModalBtn:hover {
    border-color: #38bdf8 !important;
}

/* 2. Panels, Left Tracklist & Right Inspector */
[data-theme="minimalist-obsidian"] .panel,
[data-theme="minimalist-obsidian"] .playerDeck {
    background: #090a0f !important;
    border: 1.5px solid #1e2230 !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.9) !important;
    border-radius: 8px !important;
}

[data-theme="minimalist-obsidian"] .panelHeader h2,
[data-theme="minimalist-obsidian"] .panelTitle {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .panelHeader .panelSub,
[data-theme="minimalist-obsidian"] .panelSub {
    color: #94a3b8 !important;
    font-weight: 600 !important;
}

[data-theme="minimalist-obsidian"] .panelCount,
[data-theme="minimalist-obsidian"] .badge {
    background: #0f1118 !important;
    color: #38bdf8 !important;
    border: 1px solid #1e2230 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .searchContainer input,
[data-theme="minimalist-obsidian"] #searchInput,
[data-theme="minimalist-obsidian"] #trackSearch {
    background: #0f1118 !important;
    border: 1.5px solid #1e2230 !important;
    color: #ffffff !important;
    border-radius: 4px !important;
}

[data-theme="minimalist-obsidian"] .searchContainer input::placeholder,
[data-theme="minimalist-obsidian"] #searchInput::placeholder,
[data-theme="minimalist-obsidian"] #trackSearch::placeholder {
    color: #64748b !important;
}

[data-theme="minimalist-obsidian"] .searchContainer input:focus,
[data-theme="minimalist-obsidian"] #searchInput:focus,
[data-theme="minimalist-obsidian"] #trackSearch:focus {
    border-color: #38bdf8 !important;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.3) !important;
}

[data-theme="minimalist-obsidian"] .sortSelect,
[data-theme="minimalist-obsidian"] #sortSelect {
    background: #0f1118 !important;
    border: 1.5px solid #1e2230 !important;
    color: #ffffff !important;
    border-radius: 4px !important;
}

[data-theme="minimalist-obsidian"] .tracklistHeader,
[data-theme="minimalist-obsidian"] #tracklistHeader {
    background: #0f1118 !important;
    color: #94a3b8 !important;
    border-bottom: 1.5px solid #1e2230 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .trackItem {
    border-bottom: 1px solid #181b24 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .trackItem:hover {
    background: #141722 !important;
}

[data-theme="minimalist-obsidian"] .trackItem.active,
[data-theme="minimalist-obsidian"] .trackItem.playing {
    background: rgba(56, 189, 248, 0.12) !important;
    border-left: 3px solid #38bdf8 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .trackItem.active .trackTitle,
[data-theme="minimalist-obsidian"] .trackItem.playing .trackTitle {
    color: #38bdf8 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .trackArtist,
[data-theme="minimalist-obsidian"] .trackDuration,
[data-theme="minimalist-obsidian"] .trackNum {
    color: #94a3b8 !important;
}

[data-theme="minimalist-obsidian"] .trackFormat,
[data-theme="minimalist-obsidian"] .formatBadge {
    background: rgba(56, 189, 248, 0.15) !important;
    color: #38bdf8 !important;
    border: 1px solid #38bdf8 !important;
    font-weight: 800 !important;
}

/* Metadata Inspector */
[data-theme="minimalist-obsidian"] .metaInspector,
[data-theme="minimalist-obsidian"] .inspectorCard {
    background: #090a0f !important;
    border: 1.5px solid #1e2230 !important;
}

[data-theme="minimalist-obsidian"] .metaRow {
    border-bottom: 1px solid #181b24 !important;
}

[data-theme="minimalist-obsidian"] .metaKey {
    color: #94a3b8 !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-obsidian"] .metaVal {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .albumArtWrapper {
    background: #0f1118 !important;
    border: 1.5px solid #1e2230 !important;
}

/* 3. Center Player Deck & Turntable */
[data-theme="minimalist-obsidian"] .trackTitle {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .trackArtist,
[data-theme="minimalist-obsidian"] #albumName,
[data-theme="minimalist-obsidian"] .albumName {
    color: #94a3b8 !important;
    font-weight: 600 !important;
}

[data-theme="minimalist-obsidian"] #currentTime,
[data-theme="minimalist-obsidian"] #totalDuration,
[data-theme="minimalist-obsidian"] .timeDisplay {
    color: #94a3b8 !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-obsidian"] .seekbarRail,
[data-theme="minimalist-obsidian"] .progressRail,
[data-theme="minimalist-obsidian"] .seekSlider {
    background: #1e2230 !important;
}

[data-theme="minimalist-obsidian"] .seekbarFill,
[data-theme="minimalist-obsidian"] .progressFill {
    background: #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] .seekbarThumb {
    background: #38bdf8 !important;
    border: 2px solid #000000 !important;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.6) !important;
}

[data-theme="minimalist-obsidian"] .transportBtn,
[data-theme="minimalist-obsidian"] .subBtn,
[data-theme="minimalist-obsidian"] #shuffleBtn,
[data-theme="minimalist-obsidian"] #repeatBtn,
[data-theme="minimalist-obsidian"] #stopBtn {
    background: #0f1118 !important;
    border: 1px solid #1e2230 !important;
    color: #ffffff !important;
    border-radius: 4px !important;
}

[data-theme="minimalist-obsidian"] .transportBtn:hover,
[data-theme="minimalist-obsidian"] .subBtn:hover {
    border-color: #38bdf8 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] #shuffleBtn.active,
[data-theme="minimalist-obsidian"] #repeatBtn.active,
[data-theme="minimalist-obsidian"] .subBtn.active {
    background: #38bdf8 !important;
    border-color: #38bdf8 !important;
    color: #000000 !important;
}

[data-theme="minimalist-obsidian"] #shuffleBtn.active svg path,
[data-theme="minimalist-obsidian"] #repeatBtn.active svg path,
[data-theme="minimalist-obsidian"] .subBtn.active svg path {
    fill: #000000 !important;
}

[data-theme="minimalist-obsidian"] #playBtn,
[data-theme="minimalist-obsidian"] .playBtn {
    background: #38bdf8 !important;
    color: #000000 !important;
    border: 2px solid #38bdf8 !important;
    box-shadow: 0 0 16px rgba(56, 189, 248, 0.45) !important;
}

[data-theme="minimalist-obsidian"] #playBtn:hover,
[data-theme="minimalist-obsidian"] .playBtn:hover {
    background: #7dd3fc !important;
    color: #000000 !important;
}

[data-theme="minimalist-obsidian"] .volumeLevel {
    color: #94a3b8 !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-obsidian"] .volumeSlider {
    background: #1e2230 !important;
}

[data-theme="minimalist-obsidian"] #muteBtn {
    background: #0f1118 !important;
    border: 1px solid #1e2230 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .eqDeckBtn {
    background: #090a0f !important;
    border: 1.5px solid #38bdf8 !important;
    color: #ffffff !important;
    border-radius: 4px !important;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.3) !important;
}

[data-theme="minimalist-obsidian"] .eqDeckBtn.active {
    background: #38bdf8 !important;
    color: #000000 !important;
}

[data-theme="minimalist-obsidian"] .eqDeckBtn.active .eqDeckTitle,
[data-theme="minimalist-obsidian"] .eqDeckBtn.active .eqDeckSub {
    color: #000000 !important;
}

[data-theme="minimalist-obsidian"] .eqDeckTitle {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .eqDeckSub {
    color: #94a3b8 !important;
    font-weight: 600 !important;
}

[data-theme="minimalist-obsidian"] .eqDeckBadge {
    background: #0f1118 !important;
    border: 1px solid #1e2230 !important;
    color: #94a3b8 !important;
}

[data-theme="minimalist-obsidian"] .eqDeckDspBadge {
    background: rgba(56, 189, 248, 0.15) !important;
    border: 1px solid #38bdf8 !important;
    color: #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] .eqDeckBtn.active .eqDeckBadge,
[data-theme="minimalist-obsidian"] .eqDeckBtn.active .eqDeckDspBadge {
    background: #000000 !important;
    color: #38bdf8 !important;
    border-color: #000000 !important;
}

/* 4. Parametric Equalizer Workstation Modal (#peqModal) */
[data-theme="minimalist-obsidian"] .peqModalCard {
    background: #000000 !important;
    border: 2px solid #38bdf8 !important;
    box-shadow: 0 0 24px rgba(56, 189, 248, 0.35) !important;
    border-radius: 6px !important;
}

[data-theme="minimalist-obsidian"] .peqHeaderTitle h3 {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .peqHeaderSub {
    color: #94a3b8 !important;
    font-weight: 600 !important;
}

[data-theme="minimalist-obsidian"] .peqBypassBtn,
[data-theme="minimalist-obsidian"] .peqResetBtn,
[data-theme="minimalist-obsidian"] .peqCloseBtn {
    background: #0f1118 !important;
    border: 1.5px solid #1e2230 !important;
    color: #ffffff !important;
    border-radius: 4px !important;
}

[data-theme="minimalist-obsidian"] .peqBypassBtn.active {
    background: #ef4444 !important;
    border-color: #ef4444 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .peqCanvasContainer {
    background: #050608 !important;
    border: 1px solid #1e2230 !important;
    border-radius: 4px !important;
}

[data-theme="minimalist-obsidian"] .peqDbLabel {
    color: #94a3b8 !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-obsidian"] .peqDspStrip {
    background: #090a0f !important;
    border: 1.5px solid #38bdf8 !important;
    border-radius: 4px !important;
    box-shadow: 0 0 16px rgba(56, 189, 248, 0.15) !important;
}

[data-theme="minimalist-obsidian"] .peqSectionBadge {
    background: #38bdf8 !important;
    color: #000000 !important;
    border: 1px solid #38bdf8 !important;
    border-radius: 3px !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .peqDspTitle {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .peqDspSummaryPill {
    background: #000000 !important;
    color: #94a3b8 !important;
    border: 1px solid #1e2230 !important;
    border-radius: 3px !important;
}

[data-theme="minimalist-obsidian"] .peqDspSummaryPill.active {
    background: rgba(56, 189, 248, 0.2) !important;
    color: #38bdf8 !important;
    border-color: #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] .peqDspBtn {
    background: #000000 !important;
    border: 1.5px solid #38bdf8 !important;
    color: #ffffff !important;
    border-radius: 4px !important;
    box-shadow: 0 0 6px rgba(56, 189, 248, 0.2) !important;
}

[data-theme="minimalist-obsidian"] .peqDspBtn.active {
    background: #38bdf8 !important;
    color: #000000 !important;
    border-color: #38bdf8 !important;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.6) !important;
}

[data-theme="minimalist-obsidian"] .peqDspBtn.active .peqDspName,
[data-theme="minimalist-obsidian"] .peqDspBtn.active .peqDspSpec {
    color: #000000 !important;
}

[data-theme="minimalist-obsidian"] .peqDspBtn.active .dspDot {
    background: #000000 !important;
}

[data-theme="minimalist-obsidian"] .peqToolbarRow,
[data-theme="minimalist-obsidian"] .peqFadersGrid {
    background: #090a0f !important;
    border: 1px solid #1e2230 !important;
    border-radius: 4px !important;
}

[data-theme="minimalist-obsidian"] .peqSelect {
    background: #000000 !important;
    border: 1.5px solid #1e2230 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .peqAutoEqBtn {
    background: #000000 !important;
    border: 1.5px solid #38bdf8 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .peqXfeedGroup .actionBtn.active,
[data-theme="minimalist-obsidian"] #peqXfeedToggleBtn.active {
    background: #38bdf8 !important;
    color: #000000 !important;
}

[data-theme="minimalist-obsidian"] .peqAutoEqDrawer {
    background: #090a0f !important;
    border: 1.5px solid #1e2230 !important;
}

[data-theme="minimalist-obsidian"] .peqAutoEqTextarea {
    background: #000000 !important;
    border: 1.5px solid #1e2230 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .peqFaderDb {
    color: #94a3b8 !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-obsidian"] .peqFaderDb.boost {
    color: #38bdf8 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .peqFaderDb.cut {
    color: #f87171 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .peqFaderHz {
    color: #94a3b8 !important;
    font-weight: 700 !important;
}

/* 5. Settings Workspace (#settingsWorkspace) */
[data-theme="minimalist-obsidian"] .settingsWorkspace {
    background: #000000 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .settingsHubHeaderLeft h2,
[data-theme="minimalist-obsidian"] .settingsSectionTitle,
[data-theme="minimalist-obsidian"] .settingsRowTitle {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .settingsSubtitle,
[data-theme="minimalist-obsidian"] .settingsSectionDesc,
[data-theme="minimalist-obsidian"] .settingsRowDesc,
[data-theme="minimalist-obsidian"] .settingsCardNote {
    color: #94a3b8 !important;
}

[data-theme="minimalist-obsidian"] .settingsSectionPanel {
    background: #090a0f !important;
    border: 1px solid #1e2230 !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.8) !important;
    border-radius: 6px !important;
}

[data-theme="minimalist-obsidian"] .settingsSectionHeader {
    border-bottom: 1px solid #1e2230 !important;
}

[data-theme="minimalist-obsidian"] .settingsSectionBadge,
[data-theme="minimalist-obsidian"] .settingsBadge {
    background: #0f1118 !important;
    color: #38bdf8 !important;
    border: 1px solid #38bdf8 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .settingsEnginePill,
[data-theme="minimalist-obsidian"] .settingsThemeBadge {
    background: #38bdf8 !important;
    color: #000000 !important;
    border-radius: 4px !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .settingsDspMetricItem {
    background: #0f1118 !important;
    border: 1px solid #1e2230 !important;
    border-radius: 4px !important;
}

[data-theme="minimalist-obsidian"] .settingsDspKey {
    color: #94a3b8 !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-obsidian"] .settingsDspVal {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .settingsOptionToggles .actionBtn,
[data-theme="minimalist-obsidian"] .enginePrecisionBtn,
[data-theme="minimalist-obsidian"] .ditherModeBtn,
[data-theme="minimalist-obsidian"] .bufferLatencyBtn,
[data-theme="minimalist-obsidian"] .toggleActiveBtn,
[data-theme="minimalist-obsidian"] .visModeBtn,
[data-theme="minimalist-obsidian"] .presetPathBtn,
[data-theme="minimalist-obsidian"] .settingsReturnBtn {
    background: #0f1118 !important;
    border: 1px solid #232738 !important;
    color: #ffffff !important;
    border-radius: 4px !important;
    font-weight: 700 !important;
}

[data-theme="minimalist-obsidian"] .settingsOptionToggles .actionBtn.active,
[data-theme="minimalist-obsidian"] .enginePrecisionBtn.active,
[data-theme="minimalist-obsidian"] .ditherModeBtn.active,
[data-theme="minimalist-obsidian"] .bufferLatencyBtn.active,
[data-theme="minimalist-obsidian"] .visModeBtn.active,
[data-theme="minimalist-obsidian"] .themeQuickBtn.active {
    background: #38bdf8 !important;
    color: #000000 !important;
    border-color: #38bdf8 !important;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.4) !important;
}

[data-theme="minimalist-obsidian"] .toggleActiveBtn.active {
    background: #38bdf8 !important;
    color: #000000 !important;
    border-color: #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] .settingsThemePickerBtn {
    background: #090a0f !important;
    border: 1.5px solid #38bdf8 !important;
    border-radius: 6px !important;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.25) !important;
}

[data-theme="minimalist-obsidian"] .settingsThemePickerSub {
    color: #94a3b8 !important;
}

[data-theme="minimalist-obsidian"] .settingsThemePickerCurrent {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .settingsThemePickerAction {
    background: #38bdf8 !important;
    color: #000000 !important;
    border-radius: 4px !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .settingsInput,
[data-theme="minimalist-obsidian"] #settingsTabFolderPathInput {
    background: #000000 !important;
    border: 1.5px solid #1e2230 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .settingsScanStatusBox,
[data-theme="minimalist-obsidian"] #settingsTabScanStatus {
    background: #090a0f !important;
    border: 1px solid #1e2230 !important;
    color: #ffffff !important;
    border-left: 3px solid #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] .settingsSleepBadge {
    background: #0f1118 !important;
    border: 1px solid #38bdf8 !important;
    color: #38bdf8 !important;
    font-weight: 800 !important;
}

/* 6. Soulseek Workspace (#soulseekWorkspace) */
[data-theme="minimalist-obsidian"] .slskWorkspace,
[data-theme="minimalist-obsidian"] .slskToolbar {
    background: #090a0f !important;
    border: 1.5px solid #1e2230 !important;
}

[data-theme="minimalist-obsidian"] .slskLogo {
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .slskBadge {
    background: #0f1118 !important;
    color: #38bdf8 !important;
    border: 1px solid #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] .slskStatusPill {
    background: #0f1118 !important;
    border: 1px solid #1e2230 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .slskSearchInput,
[data-theme="minimalist-obsidian"] #slskSearchInput {
    background: #0f1118 !important;
    border: 1.5px solid #1e2230 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .slskSubmitBtn,
[data-theme="minimalist-obsidian"] #slskSearchSubmitBtn {
    background: #38bdf8 !important;
    color: #000000 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .slskFilterPill,
[data-theme="minimalist-obsidian"] .slskChip {
    background: #0f1118 !important;
    border: 1px solid #1e2230 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .slskFilterPill.active,
[data-theme="minimalist-obsidian"] .slskChip.active {
    background: #38bdf8 !important;
    color: #000000 !important;
    border-color: #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] .slskFilterPill.active *,
[data-theme="minimalist-obsidian"] .slskChip.active * {
    color: #000000 !important;
}

[data-theme="minimalist-obsidian"] .slskResultsCon,
[data-theme="minimalist-obsidian"] .slskResultsList {
    background: #090a0f !important;
    border: 1.5px solid #1e2230 !important;
}

[data-theme="minimalist-obsidian"] .slskResultsHeader {
    background: #0f1118 !important;
    color: #94a3b8 !important;
    border-bottom: 1.5px solid #1e2230 !important;
}

[data-theme="minimalist-obsidian"] .slskResultsHeader .col,
[data-theme="minimalist-obsidian"] .slskResultsHeader .col * {
    color: #94a3b8 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .slskResultRow {
    border-bottom: 1px solid #181b24 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .slskResultRow:hover {
    background: #141722 !important;
}

[data-theme="minimalist-obsidian"] .slskResultTitle {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .slskResultPath,
[data-theme="minimalist-obsidian"] .slskSizeVal,
[data-theme="minimalist-obsidian"] .slskPeerUser,
[data-theme="minimalist-obsidian"] .slskPeerSpeed {
    color: #94a3b8 !important;
}

[data-theme="minimalist-obsidian"] .slskBitrateVal {
    color: #38bdf8 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .slskBtnPrimary,
[data-theme="minimalist-obsidian"] .slskDlBtn {
    background: #38bdf8 !important;
    color: #000000 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .slskTransfersDrawer {
    background: #090a0f !important;
    border: 1.5px solid #1e2230 !important;
}

[data-theme="minimalist-obsidian"] .slskTransfersHeader {
    background: #0f1118 !important;
    color: #ffffff !important;
    border-bottom: 1.5px solid #1e2230 !important;
}

[data-theme="minimalist-obsidian"] .slskTransferBarCon {
    background: #181b24 !important;
}

[data-theme="minimalist-obsidian"] .slskTransferBarFill {
    background: #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] .slskModalCard {
    background: #000000 !important;
    border: 2px solid #38bdf8 !important;
    color: #ffffff !important;
}

/* 7. Download Hub Workspace (#downloadWorkspace) */
[data-theme="minimalist-obsidian"] .downloadWorkspace {
    background: #000000 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .downloadWorkspace .downloadReturnBtn {
    background: #0f1118 !important;
    border: 1.5px solid #1e2230 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .pkgCard,
[data-theme="minimalist-obsidian"] .downloadCard {
    background: #090a0f !important;
    border: 1.5px solid #1e2230 !important;
}

[data-theme="minimalist-obsidian"] .pkgCard h3,
[data-theme="minimalist-obsidian"] .downloadCardTitle {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .pkgCard p,
[data-theme="minimalist-obsidian"] .downloadCardDesc {
    color: #94a3b8 !important;
}

[data-theme="minimalist-obsidian"] .downloadWorkspace pre,
[data-theme="minimalist-obsidian"] .downloadWorkspace code {
    background: #050608 !important;
    border: 1px solid #1e2230 !important;
    color: #38bdf8 !important;
    font-family: monospace !important;
}

[data-theme="minimalist-obsidian"] .copyCodeBtn {
    background: #0f1118 !important;
    border: 1.5px solid #38bdf8 !important;
    color: #ffffff !important;
}

[data-theme="minimalist-obsidian"] .copyCodeBtn:hover {
    background: #38bdf8 !important;
    color: #000000 !important;
}

[data-theme="minimalist-obsidian"] .archTab {
    background: #0f1118 !important;
    border: 1px solid #1e2230 !important;
    color: #94a3b8 !important;
}

[data-theme="minimalist-obsidian"] .archTab.active {
    background: #38bdf8 !important;
    color: #000000 !important;
    border-color: #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] .lanStreamingBox {
    background: #090a0f !important;
    border: 1.5px solid #38bdf8 !important;
    color: #ffffff !important;
}

/* 8. Theme Modal & Modals */
[data-theme="minimalist-obsidian"] .themeModalCard,
[data-theme="minimalist-obsidian"] .modalCard {
    background: #000000 !important;
    border: 2px solid #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] .themeCategoryHeader h4 {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .themeCategoryCount {
    background: #0f1118 !important;
    color: #38bdf8 !important;
    border: 1px solid #38bdf8 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .themeSelectCard {
    background: #090a0f !important;
    border: 1.5px solid #1e2230 !important;
}

[data-theme="minimalist-obsidian"] .themeSelectCard:hover {
    border-color: #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] .themeSelectCard.active {
    border-color: #38bdf8 !important;
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.4) !important;
    background: #0f1118 !important;
}

[data-theme="minimalist-obsidian"] .themeCardTitle {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .themeCardDesc {
    color: #94a3b8 !important;
}

[data-theme="minimalist-obsidian"] .themeActivePill {
    background: #38bdf8 !important;
    color: #000000 !important;
    font-weight: 800 !important;
}

/* 9. Mobile Tab Bar & Persistent Mini-Player */
[data-theme="minimalist-obsidian"] .mobileTabBar {
    background: #000000 !important;
    border-top: 1.5px solid #1e2230 !important;
}

[data-theme="minimalist-obsidian"] .mobileTabBtn .mobileTabIcon,
[data-theme="minimalist-obsidian"] .mobileTabBtn .mobileTabLabel {
    color: #94a3b8 !important;
}

[data-theme="minimalist-obsidian"] .mobileTabBtn.active {
    background: #090a0f !important;
    color: #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] .mobileTabBtn.active .mobileTabIcon,
[data-theme="minimalist-obsidian"] .mobileTabBtn.active .mobileTabLabel {
    color: #38bdf8 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .persistentMiniPlayer {
    background: #000000 !important;
    border-top: 1.5px solid #38bdf8 !important;
}

[data-theme="minimalist-obsidian"] #miniTrackTitle {
    color: #ffffff !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] #miniArtist {
    color: #94a3b8 !important;
}

[data-theme="minimalist-obsidian"] .miniDeckReturnBtn,
[data-theme="minimalist-obsidian"] #miniDeckReturnBtn {
    background: #38bdf8 !important;
    color: #000000 !important;
    font-weight: 800 !important;
}

[data-theme="minimalist-obsidian"] .miniDeckReturnBtn *,
[data-theme="minimalist-obsidian"] #miniDeckReturnBtn * {
    color: #000000 !important;
}

"""

new_css = css[:start_idx] + warm_and_obsidian_css + css[end_idx:]

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(new_css)

print(f"✓ Replaced end minimalist suite: {len(new_css)} bytes, {new_css.count(chr(10))} lines")
