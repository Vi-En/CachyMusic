# CachyMusic

<div align="center">

**High-Fidelity Music Player**

[![Release](https://img.shields.io/github/v/release/Vi-En/CachyMusic?include_prereleases&label=release&color=00e5ff)](https://github.com/Vi-En/CachyMusic/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20Android%20%7C%20macOS%20%7C%20iOS-informational.svg)]()
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-success.svg)](manifest.json)
[![WCAG](https://img.shields.io/badge/WCAG-2.1%20AA%2FAAA-brightgreen.svg)]()

</div>

---
## EXPECT BUGS, VISUAL ISSUES, AND SUCH IN THIS BETA.

## Overview

**CachyMusic** is an open-source music player. The name is inspired from my current OS called CachyOS.

It is a lightweight, self-contained music player and audio workstation that runs directly in your browser or installs as a standalone desktop app.

---

## Features

- **10-Band Parametric Equalizer & 64-Bit DSP**: Built-in ISO parametric EQ (`32 Hz` – `16 kHz`), 20 Hz subsonic HPF, Bauer/Meier HRTF crossfeed, and AudioWorklet precision DSP.
- **Standalone Cross-Platform PWA**: Imports folders or individual audio files directly in Chromium, Firefox, Safari/iOS, Android, Windows, and macOS with IndexedDB persistence and offline Service Worker caching (`sw.js`).
- **Real-Time Audio Specs & Tag Editor**: Client-side and PHP metadata/artwork extraction across FLAC, WAV, ALAC, M4A, MP3, OGG/Opus, and AIFF, plus confirmation-gated tag & cover editing.
- **Optional Zero-Config Desktop Host**: Also runs out of the box via PHP built-in server with SQLite3 / atomic JSON storage (`php/storage.php`), Linux MPRIS2 integration, and native Android APK foreground service playback.

---

## Downloads & Releases (v2.0.1)

| Platform | Package | Description |
|:---|:---|:---|
| **PWA / Web** | [`index.html`](index.html) / [`manifest.json`](manifest.json) | Install directly as a standalone offline-ready Progressive Web App on Android, Windows, Linux, iOS, and macOS. |
| **Android** | [`CachyMusic-v2.0.1.apk`](https://github.com/Vi-En/CachyMusic/releases/download/v2.0.1/CachyMusic-v2.0.1.apk) | Native self-contained standalone APK with USB-C DAC/IEM (`Moondrop May`) hardware bridge & `MediaPlaybackService`. |
| **Linux (64-bit)** | [`CachyMusic-v2.0.1-linux.tar.gz`](https://github.com/Vi-En/CachyMusic/releases/download/v2.0.1/CachyMusic-v2.0.1-linux.tar.gz) | Standalone package with launcher (`bin/cachymusic`), MPRIS2 daemon, and AUR/Debian/AppImage scripts. |
| **Windows** | [`CachyMusic-v2.0.1-windows.zip`](https://github.com/Vi-En/CachyMusic/releases/download/v2.0.1/CachyMusic-v2.0.1-windows.zip) | Standalone zip package with silent `CachyMusic.vbs` runner, `cachymusic.bat` launcher, and PWA/PHP launch support. |
| **Android Studio** | [`CachyMusic-v2.0.1-android-project.zip`](https://github.com/Vi-En/CachyMusic/releases/download/v2.0.1/CachyMusic-v2.0.1-android-project.zip) | Complete source project archive ready for Android Studio import. |


---

## Repository Structure

```
.
├── bin/                    # Cross-platform desktop launchers, tray & MPRIS2 daemon
├── index.html              # Main PWA application entrypoint
├── index.php               # Optional PHP static router & API dispatcher
├── install.sh              # Linux user desktop installer
├── manifest.json           # W3C Web App Manifest (PWA)
├── packaging/              # Distribution packaging (AUR, Debian, AppImage, desktop entry)
├── php/                    # Optional desktop REST API, platform helpers & SQLite3/JSON storage
│   ├── api/                # Endpoints (scan, stream, cover, metadata, soulseek, playlists, mpris)
│   ├── auth/               # Local account authentication
│   ├── platform.php        # Cross-platform OS path, CORS & binary detection helpers
│   └── storage.php         # Library SQLite3 WAL & atomic JSON abstraction
├── resources/              # App icons, typography & fallback UI SVG artwork
├── scripts/                # Modular ES6 client workstation, DSP AudioWorklet & theme bootstrap
│   ├── dsp-worklet-processor.js
│   ├── theme-preload.js
│   └── modules/            # Audio engine, player, tag parser, offline IndexedDB library & UI modules
├── stylesheets/            # Layered CSS architecture (tokens, themes, layout, components)
├── sw.js                   # Service Worker for offline PWA caching
├── tools/                  # Android packager & Nicotine+ plugin tooling
└── uninstall.sh            # Desktop uninstaller
```

---

## License

This project is licensed under the **GNU General Public License v3.0 or later** ([GPL-3.0-or-later](LICENSE)).
