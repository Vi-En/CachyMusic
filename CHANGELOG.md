# Changelog

All notable changes to **CachyMusic** are documented in this file.

---

## [2.0.0] - 2026-11-14
- **Standalone Cross-Platform PWA Mode**: Full client-side execution across Linux, Windows, Android, iOS, and macOS without requiring PHP or external databases, with automatic runtime capability adaptation (`runtime-capabilities.js`), pure-JS metadata/artwork extraction (`tag-parser.js` for ID3v2, FLAC, WAV, Ogg Vorbis/Opus, MP4/M4A/ALAC), IndexedDB offline library persistence (`local-library.js`), and bumped Service Worker cache (`cachymusic-v2.0.0`).
- **Modular ES6 Architecture & Single Namespace**: Removed legacy monolithic bundles (`scripts/homepage.js`, `scripts/index.js`, `scripts/register.js`), removed sample tracks/assets, and isolated exports solely on `window.__cachyMusic`.
- **64-Bit DSP Worklet & Native Platform Bridges**: Upgraded AudioWorklet DSP pipeline (`dsp-worklet-processor.js`), added OS MediaSession sync + opt-in background track notifications (`media-session.js`), Android native `MediaPlaybackService.java` foreground service (`versionCode 20`, `versionName "2.0.0"`), and hardened Linux MPRIS2 integration.
- **Layered CSS Architecture**: Split stylesheets cleanly into cascade layers (`tokens.css`, `themes.css`, `layout.css`, `components.css`, `homepage.css`) using continuous `clamp()` typography, `100dvh`, OKLCH WCAG 2.1 AAA palettes, and zero `!important` rules.
- **Cross-Platform PHP Backend & Security**: Added OS-agnostic path/binary helpers (`php/platform.php`), SQLite3 WAL + atomic POSIX `rename()` JSON fallback (`php/storage.php`), pure-PHP WAV/OGG/M4A/cover tag parsers, and `aes-256-gcm` Soulseek credential encryption (`php/api/soulseek.php`).
- **Multi-Platform Packaging**: Updated Arch `PKGBUILD` (`pkgver=2.0.0`), Windows launchers (`cachymusic.bat`, `CachyMusic.vbs`), Android APK build, and added Debian (`packaging/debian/build-deb.sh`) and AppImage (`packaging/appimage/build-appimage.sh`) packagers.

## [1.3.0] - 2026-11-07
- **Track Metadata & ID3 Tag Editor**: Added a fully responsive modal editor (`#metadataEditorModal`) accessible from the left inspector panel and track context menu (`•••`). Modifies Title, Artist, Album, Genre, Year, Track #, and Comments.
- **Physical Tag Writing & Atomic Persistence**: Backed by `metaflac` (lossless in-place FLAC tagging) and `ffmpeg` (`-codec copy` with atomic temporary-file renaming), with real-time in-memory, player deck, left panel, and IndexedDB library cache synchronization.
- **Studio Console Vertical PEQ Faders**: Refactored Parametric Equalizer sliders on mobile into vertical faders with metallic caps, thumb glow, and exact ISO frequency labels.
- **Harmonic Triad Theme Palette**: Redesigned mobile theme selector preview badges into circular discs with 3-gem circular harmonic color palettes.
- **Mobile Soulseek Ergonomics**: Relocated power button to the front brand bar with neon glow indicators, integrated one-tap offline reconnection banner, and enhanced dedicated transfers drawer view.
- **WCAG 2.1 AAA Accessibility**: 100% compliant across all 12 themes with 0 contrast issues.

## [1.2.0] - 2026-11-05
- **Soulseek P2P Client Overhaul**: Fixed live search result rendering crash caused by undefined `escapeRegex` module export, and resolved passive event listener warning on account settings save.
- **Auto-Healing Directory Storage**: Hardened directory safety check against unauthorized/malformed paths and auto-healed stale configurations to default downloads folder.
- **Service Worker Hardening**: Guarded against non-HTTP/Chrome extension scheme caching errors and included all dynamic ES modules in PWA pre-caching.
- **Marquee Text Animation**: Added side-scrolling text overflow marquee animations for long track, artist, and album titles.
- **Mobile Soulseek Responsive Layout**: Redesigned Soulseek Settings modal, transfers drawer, and workspace diagnostic banner with responsive z-indexes and touch-friendly targets.
- **Mobile Turntable Navigation**: Streamlined player stage by relocating lyrics toggle to the bottom-right of the turntable container.

## [1.1.9] - 2026-11-03
- Added full Search by Genre support with ID3 numeric code normalization (e.g. `(13)` / `13` -> Pop) and `genre:<term>` query filtering.
- Removed background vinyl disc and ambient aura glow elements across minimalist themes for an ultra-clean listening experience.
- Optimized mobile skip buttons by eliminating sticky hover states and delegating visual feedback to active button presses.
- Added standalone external audio playback allowing direct playback of local files without modifying or polluting the main library.
- Refined turntable boundaries to prevent container overflow, aligned player workspace tabs, and ensured dynamic visualizer adaptation across all themes.

## [1.1.8] - 2026-11-02
- Eliminated tab switching latency and animation stutter with instant 0ms touch and click response.
- Added pointerdown fast-path for mobile tab navigation and desktop workspace switching.
- Isolated panel and workspace rendering with CSS layout containment to prevent frame drops.

## [1.1.7] - 2026-11-02
- Fixed lyrics displayer layout and eliminated rogue scrollbars causing mobile deck misalignment.
- Enforced strict zero-overflow boundaries on turntable stage and player deck during lyrics view.
- Added responsive lyrics padding and smooth vertical-only autoscroll for synchronized playback.

## [1.1.6] - 2026-11-02
- Resolved playback freeze on FLAC tracks with embedded high-resolution artwork by sanitizing stream headers on-the-fly.
- Prevented duplicate error cascades from halting the player during audio pipeline transitions.
- Synchronized track metadata, artwork, and playback progress seamlessly when using software audio decoding.

## [1.1.5] - 2026-11-02
- Fixed audio skipping on unsupported formats with universal software audio decoding.
- Centered the mobile turntable and improved library loading speed.

## [1.1.4] - 2026-11-01
- Fixed FLAC audio playback on mobile, corrected turntable needle position, and centered the record player.
- Added faster music library scanning with an accurate progress bar and estimated time remaining.

## [1.1.3] - 2026-11-01
- Fixed mobile audio skipping, turntable tonearm alignment, and layout overlap.
- Added browser container PWA support, disabled unavailable hardware gain, and improved contrast.

## [1.1.2] - 2026-11-01
- Fixed mobile audio skipping and decoder errors with direct file streaming.
- Fixed tonearm needle angle to accurately follow vinyl grooves.
- Guaranteed continuous audio output across all tracks.

## [1.1.1] - 2026-11-01
- Fixed mobile audio skipping and improved song playback stability.
- Added 3-dot track options menu, debug audio diagnostics, and faster music folder loading.
- Fixed turntable sizing and turntable needle layout on mobile.

## [1.1.0-beta] - 2026-11-01
- Added a loading screen with a cancel button when scanning music folders.
- Fixed the app forgetting your chosen music folder after restarting.
- Removed placeholder tracks and prompts you to choose a music folder on first launch.
- Fixed the Signal Path & Audit (`SPA`) button on mobile and updated it to show accurate audio processing info.
- Simplified the settings menu, cleaned up mobile playlists, and made animations smoother on phones.

## [1.0.0-beta] - 2026-10-31
- Made the Android app completely standalone so it works offline without needing a PC.
- Fixed mobile black screen and layout issues across different phone screen sizes.
- Improved text and button contrast across all themes.
- Added standalone release packages for Android, Linux, and Windows.

## [10.52.0] - 2026-10-31
- Swapped the track info panel to the left and the song list to the right for a more natural layout.

## [10.51.0] - 2026-10-31
- Improved the main player layout and made the play and skip buttons easier to press.
- Set Soulseek / Nicotine+ to stay offline until you manually click connect.

## [10.50.0] - 2026-10-30
- Made the track metadata panel collapsible so the player can take up more space.
- Improved text readability across all themes.

## [10.49.0] - 2026-10-30
- Fixed a layout bug where the center player deck was squished between the side panels.

## [10.48.0] - 2026-10-30
- Fixed seekbar dragging issues on touchscreens and connected the mini-player controls.
- Updated the default album art icon and improved offline app support.

## [10.39.0] - 2026-10-24
- Added automatic gain protection to prevent audio clipping and organized Settings into simple categories.
- Improved folder scanning speed for large music libraries.

## [10.38.0] - 2026-10-19
- Fixed unreadable white-on-white text in light themes and improved button contrast.

## [10.37.0] - 2026-10-19
- Moved the audio enhancer controls into the Equalizer window to keep the main player clean.

## [10.36.0] - 2026-10-19
- Fixed audio settings and folder paths not saving properly between sessions.

## [10.35.0] - 2026-10-19
- Simplified the theme picker in Settings and added the Minimalist Warm and Obsidian themes.
- Removed unnecessary icons from buttons and menus.

## [10.34.0] - 2026-10-18
- Reorganized the Settings page and added audio buffer latency options.

## [10.33.0] - 2026-10-17
- Added a peak limiter and dithering options to prevent audio distortion.

## [10.32.0] - 2026-10-16
- Added a 10-band equalizer with AutoEQ profile import.

## [10.31.0] - 2026-10-15
- Added headphone crossfeed for more natural stereo listening.

## [10.30.0] - 2026-10-14
- Added bass, vocal, and treble enhancement toggles.

## [10.20.0] - 2026-10-10
- Added Soulseek search and download support alongside the track info panel.

## [10.10.0] - 2026-10-05
- Added ReplayGain volume normalization and gapless playback.

## [10.0.0] - 2026-10-01
- Initial release of CachyMusic with local music playback, turntable visuals, and custom themes.
