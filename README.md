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

- **10-Band Graphic Equalizer**: Built-in parametric frequency shaping (32Hz to 16kHz) with one-click flat reset directly from the center deck.
- **Real-Time Audio Specs**: Instant readout of bit depth, sample rate, bitrate, codec format, dynamic range, and peak headroom for FLAC, WAV, ALAC, MP3, AAC, and OGG.
- **All-in-One & Zero-Config**: Runs out of the box using PHP's built-in server and atomic JSON storage. No databases (MySQL/PostgreSQL) and no Node build steps needed for playback.
- **Installable PWA**: Works on desktop (Linux, Windows, macOS) with Window Controls Overlay (WCO) titlebar integration and mobile (Android, iOS) with offline playback.

---

## Downloads & Releases (v1.2.0)

| Platform | Package | Description |
|:---|:---|:---|
| **Android** | [`CachyMusic-v1.2.0.apk`](https://github.com/Vi-En/CachyMusic/releases/download/v1.2.0/CachyMusic-v1.2.0.apk) | Native self-contained standalone APK. |
| **Linux (64-bit)** | [`CachyMusic-v1.2.0-linux.tar.gz`](https://github.com/Vi-En/CachyMusic/releases/download/v1.2.0/CachyMusic-v1.2.0-linux.tar.gz) | Standalone package with native compiled `cachymusic` ELF executable. |
| **Windows** | [`CachyMusic-v1.2.0-windows.zip`](https://github.com/Vi-En/CachyMusic/releases/download/v1.2.0/CachyMusic-v1.2.0-windows.zip) | Standalone zip package with silent `CachyMusic.vbs` runner, `cachymusic.bat` launcher, and Edge/Chrome app mode. |
| **Android Studio** | [`CachyMusic-v1.2.0-android-project.zip`](https://github.com/Vi-En/CachyMusic/releases/download/v1.2.0/CachyMusic-v1.2.0-android-project.zip) | Complete source project archive ready for Android Studio import. |


---

## Repository Structure

```
.
├── bin/                    # Desktop launcher script (cachymusic)
├── index.html              # Main application interface
├── index.php               # Static router & API dispatcher
├── install.sh              # User desktop installer
├── manifest.json           # W3C Web App Manifest (PWA)
├── packaging/              # Distribution packaging (AUR, desktop entries)
├── php/                    # Backend REST API
│   ├── api/                # Endpoints (scan, stream, cover, soulseek, playlists)
│   ├── auth/               # Local authentication
│   └── storage.php         # Library database and file abstraction
├── resources/              # Icons, fonts, sample tracks, and default artwork
├── scripts/                # Frontend client logic & Web Audio engine
│   ├── audio.js            # Web Audio API engine & 10-band DSP filters
│   └── homepage.js         # UI interactions, player state, and events
├── stylesheets/            # Stylesheets and 12 procedural color themes
├── sw.js                   # Service Worker for offline PWA caching
├── tools/                  # Helper utilities and mobile packaging
└── uninstall.sh            # Desktop uninstaller
```

---

## License

This project is licensed under the **GNU General Public License v3.0 or later** ([GPL-3.0-or-later](LICENSE)).
