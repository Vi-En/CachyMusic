# CachyMusic

<div align="center">

**Local-First High-Fidelity Music Player & Audio Workstation**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20Android%20%7C%20PWA-informational.svg)]()
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-success.svg)](manifest.json)

</div>

---

## Overview

**CachyMusic** is an open-source, local-first, cross-platform music player and audio workstation. It runs as an offline-capable Progressive Web App (PWA) with native desktop launchers and an Android WebView/native host wrapper.

---

## Features

- **10-Band Parametric Equalizer & DSP**: Built-in AudioWorklet DSP with parametric EQ, subsonic high-pass filter, Bauer/Meier crossfeed, peak limiting, transactional DSP control persistence, real-time EQ spectrum view, and experimental shared-clock WAV/AIFF/FLAC playback transitions.
- **Standalone Offline PWA**: Import folders or audio files directly in modern browsers with IndexedDB + OPFS persistence, an atomic offline write journal, bounded artwork caching, and scope-isolated Service Worker shell caching (`sw.js`).
- **Playlists & Optional SQL Backend**: Playlist workspace with revision-checked mutations, JSON storage by default, and an optional MySQL schema/migration (`schema.sql`, `php/migrations/playlist-revision.sql`, opt-in via `CACHYMUSIC_PLAYLIST_SQL=1`).
- **Themes & Visualizers**: Twelve visual themes with lazily loaded canvas visualizers.
- **Metadata & Tag Editing**: Client-side and desktop metadata/artwork parsing across FLAC, WAV, AIFF, MP3, Ogg Vorbis/Opus, and M4A/MP4, optional explicit online lookup (MusicBrainz, Cover Art Archive, LRCLIB), and conservative non-re-encoding tag writing.
- **Desktop & Android Hosts**:
  - **Linux / Windows**: Managed loopback PHP desktop host (`bin/cachymusic`, `bin/cachymusic.bat`) with SQLite3/JSON storage, optional Linux MPRIS2/tray integration, and AUR/Debian/AppImage/Electron packaging recipes.
  - **Android**: Native host (`tools/packager/android/`) with bundled WebView UI, media notification service, experimental native background playback, and an embedded Java Soulseek client.
- **Optional Soulseek Integration**: User-initiated Soulseek search and download support via the local Node.js adapter (`server/soulseek-service.js`) on desktop or the embedded native client on Android.

---

## Quick Start

### Linux (Arch / CachyOS & General Linux)

Requires PHP 8.1+, Python 3.10+, and a Chromium-compatible or default browser (optional: `php-sqlite`, `ffmpeg`, `nodejs`, `zenity`/`kdialog`).

```sh
bash bin/cachymusic
```

Or install a user desktop entry:

```sh
bash install.sh
```

To build a local Arch package:

```sh
bash packaging/aur/prepare-source.sh "$HOME/cachymusic-build"
cd "$HOME/cachymusic-build" && makepkg -si
```

### Windows

Requires PHP 8.1+, Python 3.10+, and Edge/Chrome/Chromium on `PATH` (or local `php-win/php.exe`).

```bat
bin\cachymusic.bat
```

### Direct Local Development Server

```sh
php -S 127.0.0.1:8000 index.php
```

Open `http://127.0.0.1:8000/` on the same machine. Keep the local PHP server bound to loopback (`127.0.0.1`).

### Optional Desktop Soulseek Adapter

Requires Node.js 22+ and `slsk-client`:

```sh
npm install
```

### Android APK

Requires JDK 17, Gradle 8.2+, and Android SDK platform 34 / build-tools 34.0.0 with `ANDROID_HOME` set:

```sh
bash tools/packager/build-apk-local.sh
```

On Windows:

```bat
tools\packager\build-apk-local.bat
```

---

## Repository Structure

```text
.
├── bin/                    # Cross-platform desktop launchers, tray & MPRIS2 bridge
├── index.html              # Main PWA application entrypoint
├── index.php               # Loopback PHP static router & API dispatcher
├── install.sh              # Linux user desktop installer
├── LICENSE                 # GNU General Public License v3.0 or later
├── manifest.json           # Web App Manifest (PWA)
├── package.json            # Node.js package manifest for optional Soulseek adapter
├── packaging/              # AUR, Debian, AppImage & portable Electron packaging scripts
├── php/                    # Loopback desktop REST API, metadata readers, SQL & storage layer
├── resources/              # App icons, SVG assets & bundled font (SIL OFL 1.1)
├── schema.sql              # Database schema
├── scripts/                # Modular ES6 client, DSP AudioWorklet & theme visualizers
├── server/                 # Local Soulseek Node.js service & tag rewrite helper
├── stylesheets/            # Layered CSS stylesheets & theme definitions
├── sw.js                   # Offline application-shell Service Worker
├── tools/                  # Android Gradle project, local APK builders & Nicotine+ plugin
└── uninstall.sh            # Linux user desktop uninstaller
```

---

## Privacy

CachyMusic is local-first with no developer telemetry, analytics, or remote crash reporting. Core playback and library features work offline once installed. Online metadata/artwork/lyrics lookups (MusicBrainz, Cover Art Archive, LRCLIB) and Soulseek connections only occur when explicitly initiated by the user.

---

## License

CachyMusic is licensed under the **GNU General Public License v3.0 or later** ([GPL-3.0-or-later](LICENSE)).
The bundled `NMSFuturaProBook_Kerned.ttf` font is separately licensed under the **SIL Open Font License 1.1** (`resources/fonts/OFL.txt`).
