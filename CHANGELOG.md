# Changelog

All notable changes to **CachyMusic** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0-beta] - 2026-10-31

### Highlights
- **Android Physical Device Black Screen Fix & Wi-Fi Connection Manager**:
  - **Self-Contained Connection & Setup UI**: Replaced the unresponsive black screen caused by unreachable emulator loopback defaults (`10.0.2.2:8000`) with a native, audiophile-styled setup screen (`#0a0b0e` / `#00e5ff`) rendered via `loadDataWithBaseURL`.
  - **Wi-Fi Subnet Auto-Discovery Engine**: Multi-threaded subnet scanner (`ExecutorService` probing port 8000 across `192.168.x.1-254`) that automatically discovers active CachyMusic workstation servers on the local Wi-Fi and presents 1-tap `📡 CONNECT` quick-action cards.
  - **Persistent Host Configuration**: User-configured host addresses are securely remembered in Android `SharedPreferences` (`cachymusic_prefs`), booting directly into the lossless workstation on subsequent launches.
  - **Interactive Server Switcher**: Pressing the Android hardware/gesture **Back** button at the root screen displays a native dialog offering to switch servers or exit, preventing users from ever being trapped on unreachable endpoints.
  - **Graceful Error Recovery**: Comprehensive `onReceivedError` handling for both legacy and API 23+ `WebResourceRequest` main frame failures, displaying actionable diagnostic messages with instant **Retry** and **Scan Local Wi-Fi** triggers.
- **Cross-Platform Release Executables & Bundles (GitHub Release `v1.0.0-beta`)**:
  - **Linux Standalone Portable Package (`CachyMusic-v1.0.0-beta-linux.tar.gz`)**: Includes the pre-compiled 64-bit ELF `cachymusic` launcher binary, system menu assets, and automated `./install.sh` / `./uninstall.sh` scripts.
  - **Windows Standalone Executable Suite (`CachyMusic-v1.0.0-beta-windows.zip`)**: Includes the windowless `CachyMusic.vbs` runner, `cachymusic.bat` launcher, and native Edge/Chrome app-mode window integration.
  - **Android Native Signed APK (`CachyMusic-v1.0.0-beta.apk`)**: Compiled and signed release APK with Android 14 (`targetSdk 34`) support, hardware acceleration, cleartext local HTTP traffic, background audio playback, and wake lock.
  - **Android Studio Project Archive (`CachyMusic-v1.0.0-beta-android-project.zip`)**: Clean source archive ready for Android Studio import and customization.
- **Version Harmonization**:
  - Synchronized public beta version across `package.json`, `index.html`, `build.gradle`, and GitHub release tags as `1.0.0-beta`.

---

## [10.52.0] - 2026-10-31

### Highlights
- **Ergonomic Workstation Layout Swap (Metadata Inspector Left $\leftrightarrow$ Tracklist Right)**:
  - **Natural Visual Reading Flow**: Aligned layout with industry standards across modern music streaming and digital audio workstations (Spotify, Apple Music, Ableton, Logic Pro), placing contextual audio data/artwork on the left, the vinyl turntable deck in the center, and the actionable library, playlists, and queue on the right where user gaze naturally tracks.
  - **Semantic DOM & Accessibility Alignment**: Updated source order in [index.html](./index.html) (`.settingsPanel` $\to$ `.playerDeck` $\to$ `.trackListPanel`), ensuring keyboard tab navigation and screen readers traverse context before playback before library selection.
  - **Proportional Column Grid Across All 12 Themes**:
    - **Left Column**: Track Metadata Inspector (`#infoPanel` / `.settingsPanel`) dynamically sized at `minmax(17rem, 22rem)` (352px).
    - **Center Column**: Vinyl Player Deck (`.playerDeck`) dominating the workstation at `1fr` (628px, 44% of desktop viewport).
    - **Right Column**: Track Library, Playlists & Queue (`.trackListPanel`) sized at `minmax(18rem, 25rem)` (400px).
    - **Balanced Symmetry**: Equal 17px margins and 13px grid gutters framing the center stage.
  - **Leftward Collapsible / Sliding Metadata Inspector**:
    - Smooth cubic-bezier transitions (`0.35s cubic-bezier(0.16, 1, 0.3, 1)`) with `transform-origin: left center`.
    - Collapsing metadata inspector slides smoothly off to the left (`translateX(-45px) scaleX(0.7)`) and collapses column 1 to `0px`, smoothly expanding the center player deck from 628px to **977px** (68% of viewport) while keeping the right tracklist securely docked.
    - Fully controllable via `.metadataToggleBtn` ("METADATA") or global hotkey `KeyI`.
  - **Adaptive Tablet & Mobile Responsiveness**:
    - Tablets ($769\text{px} \le w \le 1024\text{px}$): 2-column master-detail layout allocating `minmax(22rem, 1.35fr)` to the Player Deck and `minmax(18rem, 1fr)` to the Track Library without squishing.
    - Mobile ($\le 768\text{px}$): Single-view full viewport stack seamlessly navigated via bottom tab bar (`PLAYER`, `TRACKS`, `INFO`, `SOULSEEK`).
- **Comprehensive Quality Assurances**:
  - **0 Contrast Violations**: 100% WCAG AA/AAA compliance verified across all 12 themes $\times$ 13 views/modals via headless Brave CDP crawler.
  - **29/29 E2E Tests Passing**: All transport controls, hotkeys, modal dialogs, and workspace switches verified.
  - **Daemon & Nicotine Status**: PHP daemon active on `http://127.0.0.1:8000`, Nicotine+ offline by default (`auto_connect_startup = False`).

---

## [10.51.0] - 2026-10-31

### Highlights
- **Main Player Layout & Focal Hierarchy Overhaul (Across All 12 Themes)**:
  - **Focal Centerpiece Architecture**: Redesigned `.playerDeck` layout with intentional vertical rhythm, replacing loose `space-between` scattering with cohesive proximity grouping (`justify-content: flex-start; gap: clamp(0.35rem, 0.7vh, 0.65rem)`).
  - **Expanded Turntable Platter & Stage**: Heightened `.turntableStage` (from 290px to 320px) with 14px rounded chassis borders, ambient backdrop glow, and dynamic expansion up to 48vh (27rem platter) when metadata inspector is collapsed.
  - **Typographic Hierarchy & Polish**: `#trackName` promoted to `font-weight: 900` with optical `letter-spacing: -0.015em`, `#artistName` weighted at `700`, `#albumName` at `600`, and `.metaBadgeRow` centered with unified pill styling.
  - **Tactile Scrubber Console**: Seamless monospaced tabular timestamps (`ui-monospace`), expanded interactive track with responsive hover growth (`0.52rem` to `0.74rem`), and glowing playhead.
  - **Hero Media Controller**: `#playPauseBtn` expanded to `clamp(3.8rem, 6.2vh, 4.75rem)` with deep elevation shadow and kinetic pulsing glow ring; `#prevBtn` and `#nextBtn` enlarged with smooth hover lift (`translateY(-2px) scale(1.08)`).
  - **Volume & Studio DSP Strip**: Perfectly centered volume console (`width: clamp(14rem, 60%, 22rem)`) and sleek 10-band pro-audio workstation launcher (`max-width: 34rem`).
- **Nicotine+ Disconnected by Default**:
  - Configured `auto_connect_startup = False` across `~/.config/nicotine/config`, [tools/setup-nicotine.sh](./tools/setup-nicotine.sh), [bin/cachymusic](./bin/cachymusic), and [php/api/soulseek.php](./php/api/soulseek.php).
  - Headless daemon boots in idle/offline mode; network connection and file sharing are only initiated on explicit user click of "CONNECT".
- **Zero Contrast Issues Maintained**:
  - Calibrated `.wsBadge.offline` across dark, light, and warm palettes (`#ff6b81` on dark headers, `#991b1b` on light/warm headers, `#ffffff` on active tabs). Headless CDP crawl verified **0 contrast issues across all 13 views/modals in all 12 themes**.
  - All 29 E2E tests passing with 0 runtime exceptions and 0 network 404s.

---

## [10.50.0] - 2026-10-30

### Highlights
- **Collapsible & Sliding Metadata Inspector Panel**:
  - **In-Deck Quick Toggle**: Added `#metadataToggleBtn` ("METADATA") directly inside the central player deck header (`#deckTopControls`), featuring an info icon glyph and synchronized active states.
  - **Fluid Desktop Grid Redistribution**: Toggling the metadata panel smoothly collapses the right-hand panel (`#infoPanel` / `.settingsPanel`) with GPU-accelerated `transform: translateX(45px) scaleX(0.7)` and fade-out, reducing its grid column to `0px` and automatically expanding the central vinyl player deck from 643.5px to 1021.5px.
  - **Hardware-Accelerated Transitions**: Applied `cubic-bezier(0.16, 1, 0.3, 1)` easing across `transform`, `opacity`, `width`, and `grid-template-columns` for a silky 350ms slide.
  - **Keyboard Shortcut**: Bound `KeyI` / `i` to toggle the metadata inspector, with input field and `contenteditable` suppression.
  - **Mobile Responsive Drawer Parity**: On viewports <= 768px, clicking the metadata toggle smoothly navigates directly between the central player deck and the metadata inspector view, with synchronized bottom navigation bar indicators.
  - **Session State Persistence**: Remembers collapsed or expanded panel preference across page reloads via `safeStorage` (`cachymusic_metadata_visible`).
- **Comprehensive Contrast Overhaul (100% WCAG AA/AAA across all 12 Themes)**:
  - Calibrated typography, badges, icons, tabs, and interactive controls across all 12 procedural themes: `default`, `nms`, `solar-eclipse`, `euclid-horizon`, `alien-paradise`, `abyssal-void`, `dissonance`, `sentinel`, `minimalist-light`, `minimalist-dark`, `minimalist-warm`, and `minimalist-obsidian`.
  - Resolved active-state button contrast edge cases in neon themes: upgraded `solar-eclipse` and `alien-paradise` active button fills and glyphs to high-contrast deep black (`#000000`), yielding 5.56:1 and 13.8:1 contrast ratios.
  - Elevated `.libTab`, `#trackBadge`, `#artistName`, `#albumName`, `#currentTime`, and `#totalDuration` across `minimalist-light`, `minimalist-warm`, and `minimalist-obsidian` to exceed strict 4.5:1 WCAG AA standards.
  - Verified via headless browser CDP DOM crawler: **PASS with 0 contrast issues across all 13 views, tabs, and modals in all 12 themes** on both desktop and mobile viewports.

---

## [10.49.0] - 2026-10-30

### Highlights
- **Workstation Layout & Visual Restoration (Reversion to v10.47 Baseline)**:
  - **Crushed Player Deck Elimination**: Resolved severe layout collapse where the central vinyl player deck (`.playerDeck`) was compressed into a ~38px sliver between the library and inspector panels. Restored full 3-column workstation geometry (Left Library: ~26.4% / 380px, Center Vinyl Deck: ~44.4% / 640px, Right Metadata Inspector: ~23.5% / 338px).
  - **Purged Conflicting Landing Stylesheet**: Permanently removed stray `<link rel="stylesheet" href="stylesheets/index.css">` from [index.html](./index.html) which had overridden root flex direction and injected an oversized 75rem rotating cog watermark disc into the workstation background.
  - **Full Document Tree Restoration**: Replaced the truncated 986-line HTML structure with the comprehensive 2,126-line baseline from v10.47, restoring all embedded audio data cards, 10-band parametric equalizer modals, sleep timer pickers, and workspace containers.
  - **Top Action Controls Alignment**: Restored `#themeModalBtn` (with live `#topThemeLabel`), `#toggleFolderBtn`, `#topSettingsBtn`, and `#userStatus` in [index.html](./index.html) top navigation, aligning with original workstation specifications.
  - **PHP Backend Security & Metadata Integrity**: Re-synced [php/api/scan.php](./php/api/scan.php), [php/api/cover.php](./php/api/cover.php), and [php/api/soulseek.php](./php/api/soulseek.php) with clean v10.47 security jailing, ReplayGain metadata extraction, and 200 OK SVG cover fallbacks.
  - **Contrast & E2E Validation**: 100% WCAG AA/AAA compliance verified across all 12 procedural themes; 29/29 E2E tests passing with 0 console runtime exceptions and 0 network 404s.

---

## [10.48.0] - 2026-10-30

### Highlights
- **Edge-Case Hardening & Defensive Engineering**:
  - **Non-Finite / NaN Audio Scrubber Guards**: Sealed `commitSeek()`, `updateScrubberVisual()`, and `seekMiniAudio()` in [scripts/homepage.js](./scripts/homepage.js) against `NaN` and `Infinity` calculations resulting from empty touch events or zero-width bounding boxes, eliminating native `HTMLMediaElement` non-finite `currentTime` TypeErrors.
  - **Touchcancel Scrubber Unlock**: Added global `touchcancel` listeners preventing seekbars and playback timers from freezing during phone calls, system notifications, or cancelled swipe gestures.
  - **Mini Player Complete Feature Parity**: Connected previously unwired `#miniMuteBtn` and `#miniProgressCon` click/scrub listeners, synchronizing mute states, volume icons, and seek offsets with the main audio engine.
  - **ContentEditable Keyboard Isolation**: Guarded playback hotkeys (`Space`, `KeyM`, `KeyE`, `ArrowKeys`) against triggering while editing `contenteditable` nodes or input fields.
  - **Extended Duration & FormatTime Precision**: Hardened `formatTime()` against `Infinity` and negative values, and added standard `h:mm:ss` formatting for long tracks, symphonies, DJ sets, and podcasts exceeding 1 hour.
  - **Favicon 404 Resolution**: Configured [index.php](./index.php) and [index.html](./index.html) with native SVG app icon routing and apple-touch-icon links, permanently eliminating root `/favicon.ico` 404 network errors.
  - **Purged Obsolete Form Artifacts**: Cleaned up stray legacy login card fragments from [index.html](./index.html), removing unclosed `<form>` and `<div class="others">` nodes that triggered contrast warnings.
  - **Scanner Spl Exception Safety**: Added `RecursiveIteratorIterator::CATCH_GET_CHILD` in [php/api/scan.php](./php/api/scan.php) to transparently bypass permission-denied directories without aborting scans.
  - **In-Memory Storage Sandbox Fallback**: Enhanced `safeStorage` in [scripts/homepage.js](./scripts/homepage.js) with an in-memory session map fallback when `localStorage`, `sessionStorage`, and `document.cookie` are completely blocked by strict browser privacy sandboxes.
- **Play/Pause Icon Morphing & Button Transitions**:
  - Implemented fluid GPU-accelerated CSS icon morphing on `.playPauseBtn` and `.miniPlayBtn` in [stylesheets/homepage.css](./stylesheets/homepage.css), transitioning smoothly between `.icon-play` and `.icon-pause` using coordinated opacity (`0` <-> `1`) and transform (`scale(1)` <-> `scale(0.4) rotate(±45deg)`) with `transform-origin: 12px 12px`.
  - Added responsive tactile active press states (`transform: scale(0.86)`) across all playback, shuffle, repeat, mute, and workspace buttons.
- **Music Icons & Album Art Redesign**:
  - Redesigned fallback iconography with a bespoke high-fidelity 512×512 dark radial vinyl album cover SVG in [resources/images/default.svg](./resources/images/default.svg) featuring concentric vinyl groove rings, center turntable label disc, and a glowing cyan-to-teal musical notation glyph (`#00e5ff` to `#0077b6`).
  - Purged all legacy fallback references to `bad-apple.png` across [index.html](./index.html) and [scripts/homepage.js](./scripts/homepage.js).
  - Fixed [php/api/cover.php](./php/api/cover.php) to return HTTP 200 SVG delivery with aggressive browser caching headers (`Cache-Control: public, max-age=604800, stale-while-revalidate=2592000`) instead of HTTP 404, eliminating broken image placeholders across track lists, album cards, turntable vinyl, and player decks.
- **Port 8000 Daemon Reversion**:
  - Reverted background daemon to default port `8000` (`http://127.0.0.1:8000`), persisting state in `~/.local/state/cachymusic/port`.
  - Fixed duplicate PEQ toggle event listener conflict on `#playerPeqBtn` between `initPeqWorkstation()` and `setupDspControls()`.
- **Universal Progressive Web App (PWA) Standards & Cross-Platform Ergonomics**:
  - **W3C Web App Manifest Specification**: Updated [manifest.json](./manifest.json) with unique `id`, `display_override: ["window-controls-overlay", "standalone", "minimal-ui"]`, quick shortcuts (Library, Player, Equalizer, Soulseek), and full maskable and any-purpose icons across all standard dimensions (192x192, 512x512).
  - **Resilient Service Worker (v10.47+)**: Upgraded [sw.js](./sw.js) with `Promise.allSettled` precaching to prevent individual asset fetch failures from aborting offline installation, SPA navigation fallback to `./index.html`, JSON 503 error fallbacks for API requests, and LRU cache pruning for album artwork caches.
  - **Window Controls Overlay (WCO)**: Integrated native desktop titlebar overlay support in Chromium and Edge, implementing dynamic `geometrychange` observers, CSS titlebar draggable regions (`app-region: drag` on [.topBar](./stylesheets/homepage.css)), and interactive element exclusions (`app-region: no-drag`).
  - **Hardware Back-Button & Modal History Stack**: Implemented a comprehensive History API (`pushState` and `popstate`) modal management engine in [scripts/homepage.js](./scripts/homepage.js), enabling Android hardware back buttons, swipe-back gestures, and browser navigation to dismiss all 7 modals (`themeModal`, `peqModal`, `playlistModal`, `signalPathModal`, `sleepTimerModal`, `slskAccountModal`, `batchAddSongsModal`) gracefully without leaving the application.
  - **Adaptive Viewports & Foldables**: Added CSS Container Queries (`@container`) on `.trackListPanel` and `.playerDeck`, viewport segments query (`@media (horizontal-viewport-segments: 2)`) for dual-screen foldables (e.g. Surface Duo, Galaxy Fold), and mobile pull-to-refresh elimination (`overscroll-behavior-y: none`).
  - **Dynamic System Theme-Color Synchronization**: Bound live `<meta name="theme-color">` updates to `applyTheme()`, synchronizing mobile browser chrome and system status bars across all 12 procedural themes.
  - **AudioContext Touch Unlock & Mobile Wakeup**: Added unified pointer and touch gesture warmups (`click`, `pointerdown`, `touchstart`) to wake suspended Web Audio graphs immediately on iOS Safari and Android PWAs.
- **Backend Security Hardening & Data Integrity**:
  - **Deny-by-Default Static Router Whitelist**: Overhauled [index.php](./index.php) to enforce strict static route whitelisting, completely blocking direct file enumeration and path traversal into `data/library.json`, `.auth_secret`, internal PHP files, and dotfiles.
  - **Soulseek Directory Jailing & Atomic Auth Secret Generation**: Enforced strict directory confinement in [php/api/soulseek.php](./php/api/soulseek.php) to user home and workspace roots, rejecting root and system directories (`/etc`, `/usr`, `/var`, `/sys`, `/proc`). Replaced non-atomic secret writes with atomic `tempnam()` and `rename()`.
  - **UTF-8 Sanitization & Truncation Guards**: Guarded [php/storage.php](./php/storage.php) with `JSON_INVALID_UTF8_SUBSTITUTE` and protected `library.json` against empty overwrites during temporary parse interruptions.
  - **ID3/Flac Scan Robustness**: Hardened [php/api/scan.php](./php/api/scan.php) against negative/zero tag sizes preventing PHP 8 `ValueError`.
  - **RFC 7233 Audio Streaming Range Fix**: Fixed audio stream chunking in [php/api/stream.php](./php/api/stream.php) for suffix ranges (`bytes=-N`) and 0-byte edge cases, ensuring chunk caps apply exclusively to Range requests.
- **Audiophile DSP Worklet & Studio Engine**:
  - **Anti-Denormal Subnormal Protection**: Added subnormal floating-point flushes (`abs(x) < 1e-15`) in [scripts/dsp-worklet-processor.js](./scripts/dsp-worklet-processor.js) to eliminate x86/ARM CPU penalties during silence or decay.
  - **Continuous Parameter Smoothing**: Implemented real-time parameter smoothing for Mid/Side stereo width, Left/Right balance, and Automatic Gain Protection lookahead headroom.
  - **Interactive Equalizer Hotkey & Button Wiring**: Bound the 'E' / 'KeyE' keyboard shortcut to toggle the 10-Band Parametric Equalizer modal, and wired `#playerPeqBtn` click handlers to open/close PEQ workstation controls.
- **Contrast & Theme Verification**:
  - Verified 100% WCAG AA/AAA compliance across all 12 procedural themes on both desktop (1920x1080) and mobile (390x844) viewports with 0 contrast violations across all 13 views and modals.

---

## [10.39.0] - 2026-10-24

### Highlights
- **64-Bit Audiophile Sound Processor Overhaul (`CachyMusicDspProcessor`)**:
  - **Automatic Gain Protection (AGP)**: Engineered a 64-bit true-peak lookahead envelope follower (`-0.20 dBFS` ceiling, `0.4ms` transient attack, `420ms` musical release, and soft-knee `tanh` safety guard) with live gain-reduction telemetry (`agp_telemetry`) displayed directly on the Studio DSP workstation button (`-X.X dB`).
  - **Parametric EQ with Per-Band Q-Factor & AutoEq Q-Import**: Upgraded the 10-band Parametric Equalizer to support independent per-band Q-Factors (`0.4` to `12.0`), interactive `.peqFaderQBtn` badges beneath every fader (`0.7` Wide, `1.0` Musical, `1.4` Default, `2.2` Narrow, `3.5` Surgical, `5.0` Notch), full AutoEq `Q` parsing, and real-time bandwidth-accurate frequency response curve rendering on `#peqCurveCanvas`.
  - **Subsonic 20Hz & Ultrasonic IMD Filters**: Added a 64-bit 2nd-order Butterworth 20Hz subsonic high-pass filter (`#playerSubsonicBtn`) alongside the 64-bit ultrasonic low-pass filter to eliminate turntable rumble and DC offset while preserving driver headroom.
  - **Mid/Side Holographic Surround, Stereo Balance, Mono Sum & 180° Phase Polarity**: Implemented Mid/Side spatial matrix expansion (`135%` stereo width, `#playerSurroundBtn`), constant-power Left/Right Stereo Balance (`#peqStereoBalanceSlider`), phase-coherent Mono summation (`#playerMonoBtn`), and 180° phase polarity inversion (`#playerPhaseBtn`).
  - **Independent Pitch-Lock Tempo vs. Analog Vinyl Pitch**: Added a dedicated turntable speed mode toggle (`#peqPitchLockBtn`) switching `audio.preservesPitch` between time-stretched tempo lock and natural analog vinyl pitch shift (`speed = pitch`), persisting speed across track transitions.
  - **2nd-Order Psychoacoustic Noise-Shaped Dithering**: Upgraded TPDF dithering with a 2nd-order error-feedback psychoacoustic noise shaper (`H(z) = 1 - 1.5z⁻¹ + 0.65z⁻²`) that shifts quantization noise out of the ear's sensitive `1–4 kHz` band.
- **De-Cluttered Categorized Settings Workspace (`#settingsWorkspace` & `#settingsCategoryNav`)**:
  - Replaced the single-page "wall of settings" with a focused 2-column sub-grouped workspace organized into 4 primary category tabs (`AUDIO & DSP ENGINE` active by default, `THEMES & VISUALIZER`, `LIBRARY & FOLDERS`, `TIMERS & CLIENTS`, plus `ALL OVERVIEW`).
  - Split each category into 2 balanced side-by-side sub-cards (`Precision & Signal Chain` + `Hardware & Stage Filters`; `Active Theme & Palette` + `Real-Time Visualizer`; `Local Directory Scanner` + `Quick Directory Presets`; `Audiophile Sleep Timer` + `Apps & Mobile Streaming`) with concise 1-line descriptions and distinct parent-child surface shading.
- **Universal Parent-Child & Foreground-Background Contrast Calibration Across All 12 Themes**:
  - Verified all 12 themes (`default`, `nms`, `solar-eclipse`, `euclid-horizon`, `alien-paradise`, `abyssal-void`, `dissonance`, `sentinel`, `minimalist-light`, `minimalist-dark`, `minimalist-warm`, `minimalist-obsidian`) across all 7 views/modals (`player`, `settings`, `download`, `soulseek`, `peqModal`, `themeModal`, `signalModal`) using a live headless Chromium DOM `getComputedStyle()` contrast scanner (`0` contrast failures across all 84 theme×view combinations).
  - Fixed `default` theme `#settingsWorkspace` white-on-white typography by targeting the exact DOM hierarchy (`.settingsSectionHeader`, `.settingsSectionTitle`, `.settingsSectionDesc`, `.settingsRowItem`, `.settingsRowTitle`, `.settingsRowDesc`, `.settingsThemePickerCurrent`, `.settingsThemePickerSub`) with a 4-tier studio surface hierarchy (`#f1f5f9` canvas → `#ffffff` section panel → `#f8fafc` recessed setting row → `#ffffff` telemetry box / `#0f172a` active control).
  - Fixed `.peqDspBtn.active *` `1:1` contrast collision with `.dspBtn.active *` in the Equalizer & Studio DSP workstation modal, and calibrated accent badge/button fills across all dark, sci-fi, and minimalist themes.
- **Performance, Hardware Tax Reduction & Backend Security Hardening**:
  - **Eliminated `O(N²)` Disk I/O in `Storage`**: Added static in-memory caching, an `O(1)` path-to-TID lookup index, and transactional batch writes (`Storage::beginBatch()` / `Storage::commitBatch()`) in `php/storage.php`, reducing a 1,000-track scan from 2,000+ disk operations to 1 read + 1 atomic write.
  - **Eliminated Idle Visualizer CPU Burn**: Optimized `renderFrame` in `scripts/homepage.js` to halt `requestAnimationFrame` after 2 static frames when paused with zero wave energy, and routed all 4 minimalist themes to `drawTurntableCenterBrutalist` with variant palettes.
  - **Directory Scan Sandboxing & Inclusion Guard**: Guarded top-level scan execution in `php/api/scan.php` (`$isDirectScanRequest`) so `php/api/soulseek.php` metadata extraction never prematurely terminates; added strict path traversal and system directory sandboxing, max recursion depth (`12`), and track cap (`25,000`).
  - **Hardened File Permissions & iOS Profile Generator**: Restricted storage/download directory permissions from `0777` to `0750`, auto-generated `data/.htaccess`, validated audio extensions on Soulseek track imports, and implemented the dynamic Apple WebClip `.mobileconfig` generator in `php/api/ios_profile.php`.

---

## [10.38.0] - 2026-10-19

### Highlights
- **Universal WCAG AAA / AA Contrast Overhaul Across All 12 Themes**: Executed a comprehensive contrast audit and mathematical calibration across all procedural themes (Default Studio Hi-Fi, The Atlas, Planetary Warp, Space Station, Alien Paradise, Emeril Drive, Dissonance, Sentinel, Minimalist Light, Minimalist Dark, Minimalist Warm Paper, and Minimalist Obsidian OLED), verifying 100% compliance across normal text, large headings, status badges, and interactive controls.
- **Elimination of Light Theme Contrast Bleed**: Replaced legacy negative selectors (`:not([data-theme="brutalist-light"])`) that previously leaked dark theme colors (`#ffffff !important` text) into light themes (`minimalist-light` and `minimalist-warm`), permanently resolving white-on-white text in Settings, Tracklist, and Metadata cards.
- **Minimalist Light & Dark Selector Harmonization**: Expanded selector matching across over 1,500 CSS rules to bind both `minimalist-light`/`brutalist-light` and `minimalist-dark`/`brutalist-dark` seamlessly, restoring full high-contrast styling across all UI components.
- **Dedicated Complete Design Suites for Minimalist Warm & Obsidian**: Built complete, bespoke component suites for `minimalist-warm` (Nordic Ivory Paper `#faf8f5`, Charcoal `#1c1917`, Terracotta Amber `#d97706` with 15.5:1 to 17.5:1 contrast) and `minimalist-obsidian` (Pitch-Black OLED `#000000`, Ice Cyan `#38bdf8`, Platinum White `#ffffff` with 19.8:1 to 21:1 contrast) across all tabs, workspaces, modals, tables, and drawers.
- **Dynamic Text-on-Accent for Active States**: Refactored all active toggle buttons (`.enginePrecisionBtn.active`, `.ditherModeBtn.active`, `.bufferLatencyBtn.active`, `.visModeBtn.active`, `.peqDspBtn.active`, `.settingsQuickBtn.active`) to use calibrated `var(--text-on-accent)`, eliminating dark-on-crimson, dark-on-purple, and neon-on-white contrast friction.
- **Muted Text Calibration**: Re-anchored `--text-muted` across Sentinel (`#64a8c9`), Abyssal Void (`#52b797`), NMS (`#d996a1`), Alien Paradise (`#d88cb6`), and Dissonance (`#c09ee0`), elevating contrast ratios to 6.8:1 – 9.2:1 (exceeding WCAG AA and meeting WCAG AAA).

---

## [10.37.0] - 2026-10-19

### Highlights
- **Studio DSP Integrated into Equalizer Workstation**: Relocated the entire Studio DSP enhancer cluster (`AMP`, `BASS`, `VOCAL`, `TREBLE`, `LIMITER`, `CROSSFEED`) from the player deck into the dedicated Equalizer workstation modal (`#peqModal`), grouping all audio equalization and harmonic enhancers together into a unified `.peqDspStrip` rack.
- **De-Cluttered Player Deck Workstation Launcher**: Replaced the cramped multi-button DSP strip on the player deck with a sleek, consolidated Equalizer & Studio DSP workstation launcher (`#eqDeckModule` / `#playerPeqBtn`) featuring clean title/subtitle typography and live status badges (`10-BAND` / `ACTIVE`, and dynamic `+X DSP` active counts).
- **Responsive Mobile Spacing Architecture**: Engineered adaptive CSS grid scaling for the Studio DSP rack (6-column desktop layout gracefully condensing to 3x2 on tablets and mobile devices with >= 48px touch targets), eliminating horizontal overflow and cramped touch targets on mobile app screens.
- **High-Contrast Theme Overhauls**: Implemented dedicated high-contrast styles for the Studio DSP rack and workstation launcher across all themes, featuring inverted tactile states, distinct active borders, and WCAG AAA compliance across Minimalist Light, Minimalist Dark, Minimalist Warm Paper, and Minimalist Obsidian OLED.

---

## [10.36.0] - 2026-10-19

### Highlights
- **Settings Workspace Functional Verification & Audit**: Completed comprehensive audit of all 30 interactive buttons, input elements, and status indicators inside `#settingsWorkspace` across both Audio Engine/DSP and Interface/System Integration columns.
- **Storage Persistence Key Alignment**: Unified localStorage key naming between initialization and runtime event handlers for `isPrecision64` (`cachymusic_precision_64` / `cachymusic_engine_precision`) and `isHardwareGain` (`cachymusic_hardware_gain` / `cachymusic_hw_gain`) to ensure settings persist across reloads.
- **Live State Synchronization**: Extended `syncSettingsTabValues()` to synchronize all DSP pipeline toggles, badges, hardware gain status, ultrasonic filter cutoffs, dithering modes, ambiophonics states, buffer latency modes, and visualizer engines whenever the user switches into the Settings tab.
- **Bi-Directional Folder Path Synchronization**: Added automatic two-way binding between the player tray `#folderPathInput` and the Settings `#settingsTabFolderPathInput` across quick preset clicks, folder browser dialogs, HTML5 directory pickers, and library scans.

### Fixed
- Fixed directory preset buttons (`.presetPathBtn`) not updating the Settings tab input field `#settingsTabFolderPathInput` on click.
- Fixed native folder browser selection not reflecting selected directory in `#settingsTabFolderPathInput`.
- Fixed potential desynchronization between active audio worklet parameters and Settings workspace status pills when navigating tabs.

---

## [10.35.0] - 2026-10-19

### Highlights
- **Equalizer & DSP Architectural Separation**: Separated the 10-Band Parametric Equalizer into its own dedicated player deck module (`#eqDeckModule`), distinct from the Studio DSP processing cluster.
- **Headphone Crossfeed Relocation**: Moved Bauer Headphone Crossfeed (`#playerXfeedBtn`) out of the quick DSP cluster directly into the Studio Equalizer workstation modal (`#peqModal`) with live status feedback.
- **Icon-Free Clean Interface**: Completely removed decorative emojis and icons from the Equalizer triggers, PEQ workstation header, AutoEq importer, and the Theme Overhaul modal while preserving tactile color palette preview swatches.
- **Settings Theme Picker Streamlined**: Replaced the cluttered 10-button quick theme grid in the Settings workspace with a single ergonomic button (`#settingsTabOpenThemeModalBtn`) displaying the active theme badge and launching the full theme selector.
- **Minimalist Theme Renaming**: Renamed Monolithic Brutalism themes to Minimalist editions: `minimalist-light` (*Minimalist Light*) and `minimalist-dark` (*Minimalist Dark*) with seamless backward compatibility for saved presets.
- **Two New Modernist Minimalist Themes**:
  - `minimalist-warm` (**Minimalist Warm Paper**): Nordic alabaster ivory paper (`#faf8f5`), deep warm umber typography (`#1c1917`), and terracotta amber accents (`#d97706`) with WCAG AAA 15:1 contrast.
  - `minimalist-obsidian` (**Minimalist Obsidian OLED**): True pitch-black zero-watt background (`#000000`), micro-hairline borders (`#1e2230`), pure platinum white typography (`#ffffff`), and electric ice cyan accents (`#38bdf8`) with 21:1 contrast.
- **Metadata Inspector Streamlining**: Removed the redundant "Audit Signal Path" button from the track inspector panel, reducing visual noise while preserving signal path metrics.

### Added
- Dedicated `#audioProcessingBar` flex container housing `#dspDeck` (`AMP`, `BASS`, `VOCAL`, `TREBLE`, `LIMITER`) and `#eqDeckModule` with text badge `#playerPeqBadge`.
- Integrated Headphone Staging toolbar group (`.peqXfeedGroup`) inside `#peqModal` with responsive toggle button and active state pill (`#peqXfeedStatus`).
- New procedural visualizer core routines: `drawThematicMinimalistWarmCore` (amber rotor dial) and `drawThematicMinimalistObsidianCore` (ice cyan diamond reticle).
- CSS theme rules and custom properties for `[data-theme="minimalist-warm"]` and `[data-theme="minimalist-obsidian"]`.
- Single modal launcher `.settingsThemePickerBtn` with active theme preview, sublabel, and high-contrast trigger action.

### Changed
- Converted PEQ trigger button `#playerPeqBtn` to an icon-free, high-contrast module with dynamic active state text.
- Stripped decorative emojis (`🎚️`, `●`, `⚡`, `🎨`, `🚀`, `🎧`, `🏛`, `✓`) from modal headers, action buttons, and active status indicators.
- Updated `applyTheme` in `scripts/homepage.js` to alias legacy `brutalist-light`/`brutalist-dark` and support new minimalist themes.
- Updated liquid wave and segmented dash visualizer color palettes for both light, dark, warm, and obsidian minimalist variants.

### Removed
- Removed `#openSignalAuditBtn` from the track metadata panel in `index.html`.
- Removed decorative emojis across theme selection cards.

---

## [10.34.0] - 2026-10-18

### Highlights
- **Settings Workspace Overhaul**: Redesigned the Settings workspace into a balanced, icon-free 2-column layout dividing Studio Audio Architecture and Interface & System Integration.
- **Contrast & Accessibility Enforcement**: Calibrated all child components, badges, descriptions, and inputs for WCAG AAA contrast compliance across all 10 procedural themes.
- **Neutron-Inspired DSP Engine Controls**: Added interactive hardware controls for 64-bit float math, TPDF dithering, and low-latency vs audiophile playback buffer tuning.

### Added
- Procedural theme badges for real-time status in settings cards.
- Interactive buffer latency calibration toggle (~15ms low-latency studio vs ~100ms audiophile playback).
- Dynamic headphone crossfeed filter parameters tuned to Meier and Bauer HRTF curves.

---

## [10.33.0] - 2026-10-17

### Highlights
- **64-Bit Float Audio Pipeline**: Implemented IEEE 754 double-precision internal intermediate processing across all Web Audio DSP nodes.
- **True-Peak Brickwall Limiter**: Dedicated lookahead peak limiter with -0.6 dBFS true-peak ceiling, preventing inter-sample clipping on compressed MP3 and AAC audio.
- **TPDF Dither Engine**: Triangular Probability Density Function dither applied on output DAC word length truncation to eliminate quantization distortion.

---

## [10.32.0] - 2026-10-16

### Highlights
- **10-Band Parametric Equalizer (PEQ)**: ISO standard 1-octave center frequencies (31 Hz, 62 Hz, 125 Hz, 250 Hz, 500 Hz, 1 kHz, 2 kHz, 4 kHz, 8 kHz, 16 kHz) with ±15 dB range.
- **AutoEQ Profile Importer**: Interactive least-squares curve fitter converting parametric EQ text profiles (Oratory1990, Crinacle, Rtings) into hardware biquad filter coefficients.
- **Real-Time Frequency Response Display**: High-DPI canvas graph rendering mathematical biquad filter transfer functions in real time.

---

## [10.31.0] - 2026-10-15

### Highlights
- **Bauer Headphone Crossfeed**: Acoustically models interaural time difference (ITD) and interaural level difference (ILD) to simulate natural loudspeaker stereo listening in headphones, eradicating fatigue.

---

## [10.30.0] - 2026-10-14

### Highlights
- **Studio DSP Enhancement Rack**: Clean analog amplification (+3.6 dB), Harman sub-bass enhancement (+3.8 dB at 95 Hz), pinna ear-gain vocal clarity (+2.8 dB at 3.0 kHz), and air-band shimmer (+3.0 dB at 10.0 kHz).

---

## [10.20.0] - 2026-10-10

### Highlights
- **Soulseek P2P Integration**: Built-in decentralized peer-to-peer music search, download manager, and instant FLAC audio streaming pipeline.
- **Metadata Inspector**: Real-time ID3v2, FLAC Vorbis comment, sample rate, bit depth, codec bitrate, and true-peak headroom inspector.

---

## [10.10.0] - 2026-10-05

### Highlights
- **ReplayGain 2.0 / ITU-R BS.1770**: Accurate integrated LUFS loudness normalization with automatic pre-amp gain matching.
- **Gapless Playback Engine**: Seamless Web Audio buffer scheduling for continuous live recordings and classical movements.

---

## [10.0.0] - 2026-10-01

### Highlights
- **Initial Major Release of CachyMusic**:
  - High-performance local audio playback engine.
  - Multi-engine visualizers: Liquid Wave, Segmented Hi-Fi LED Dash, Thematic Starship/HUD centerpieces.
  - Procedural No Man's Sky theme suite and Studio Noir styling.
  - Mobile-responsive responsive drawer navigation and touch controls.
