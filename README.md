# CachyMusic

<div align="center">

**High-Fidelity Music Player & Audiophile Audio Workstation**

[![Release](https://img.shields.io/github/v/release/Vi-En/CachyMusic?include_prereleases&label=release&color=00e5ff)](https://github.com/Vi-En/CachyMusic/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20Android%20%7C%20macOS%20%7C%20iOS-informational.svg)]()
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-success.svg)](manifest.json)
[![WCAG](https://img.shields.io/badge/WCAG-2.1%20AA%2FAAA-brightgreen.svg)]()

</div>

---

## Overview

**CachyMusic** is an open-source, high-fidelity music player engineered for music listeners. The name is inspired from my current OS called CachyOS.

It is a lightweight, self-contained music player and audio workstation that runs directly in your browser or installs as a standalone desktop app.

---

## Features

- **10-Band Graphic Equalizer**: Built-in parametric frequency shaping (32Hz to 16kHz) with one-click flat reset directly from the center deck.
- **Real-Time Audio Specs**: Instant readout of bit depth, sample rate, bitrate, codec format, dynamic range, and peak headroom for FLAC, WAV, ALAC, MP3, AAC, and OGG.
- **All-in-One & Zero-Config**: Runs out of the box using PHP's built-in server and atomic JSON storage. No databases (MySQL/PostgreSQL) and no Node build steps needed for playback.
- **Installable PWA**: Works on desktop (Linux, Windows, macOS) with Window Controls Overlay (WCO) titlebar integration and mobile (Android, iOS) with offline playback.

---

## Downloads & Releases (v1.0.0-beta)

Pre-built binaries and standalone executable packages are available on the [GitHub Releases](https://github.com/Vi-En/CachyMusic/releases/tag/v1.0.0) page:

| Platform | Package | Description |
|:---|:---|:---|
| **Android** | [`CachyMusic-v1.0.0-beta.apk`](https://github.com/Vi-En/CachyMusic/releases/download/v1.0.0/CachyMusic-v1.0.0-beta.apk) | Native signed APK with local Wi-Fi auto-discovery, background audio playback, and wake lock. |
| **Linux (64-bit)** | [`CachyMusic-v1.0.0-beta-linux.tar.gz`](https://github.com/Vi-En/CachyMusic/releases/download/v1.0.0/CachyMusic-v1.0.0-beta-linux.tar.gz) | Standalone package with native compiled `cachymusic` ELF executable, XDG desktop integration, and vector icons. |
| **Windows** | [`CachyMusic-v1.0.0-beta-windows.zip`](https://github.com/Vi-En/CachyMusic/releases/download/v1.0.0/CachyMusic-v1.0.0-beta-windows.zip) | Standalone zip package with silent `CachyMusic.vbs` runner, `cachymusic.bat` launcher, and Edge/Chrome app mode. |
| **Android Studio** | [`CachyMusic-v1.0.0-beta-android-project.zip`](https://github.com/Vi-En/CachyMusic/releases/download/v1.0.0/CachyMusic-v1.0.0-beta-android-project.zip) | Complete source project archive ready for Android Studio import. |

### Running on Android & Mobile Wi-Fi Streaming
1. Run CachyMusic on your PC/Mac/Linux workstation (`./cachymusic` or `php -S 0.0.0.0:8000 index.php`).
2. Ensure your smartphone or tablet is connected to the same Wi-Fi network.
3. Open **CachyMusic** on Android:
   - The app will automatically scan your local subnet and discover your computer with a 1-tap **`📡 CONNECT`** prompt.
   - Alternatively, enter your computer's IP address (displayed under the **DOWNLOAD HUB $\to$ MOBILE & WI-FI** tab in CachyMusic).
4. Tap Android's **Back** button at any time to switch servers or disconnect.

---

## Installation & Quick Start

### Prerequisites
- **PHP 8.2+** with `php-curl` and `php-mbstring`
- Any modern web browser (Brave, Chrome, Firefox, Edge, Safari)
- *Optional*: **Nicotine+** (for Soulseek P2P sharing)

### One-Click Desktop Installation (Linux)
Clone the repository and run the installer:

```bash
git clone https://github.com/Vi-En/CachyMusic.git
cd CachyMusic
./install.sh
```

This sets up:
1. System dependency checks.
2. The executable launcher at `~/.local/bin/cachymusic`.
3. Desktop menu entries and high-resolution icons at `~/.local/share/applications`.

Launch CachyMusic anytime from your application menu or terminal:
```bash
cachymusic
```

### Windows Quick Start
1. Download [`CachyMusic-v1.0.0-beta-windows.zip`](https://github.com/Vi-En/CachyMusic/releases/download/v1.0.0/CachyMusic-v1.0.0-beta-windows.zip) from GitHub Releases.
2. Extract the zip archive to any folder.
3. Double-click `CachyMusic.vbs` (runs silently in the background) or `cachymusic.bat`.
4. CachyMusic launches immediately as a dedicated windowed app.

### Manual / Developer Launch
You can also launch directly without installing:

```bash
php -S 127.0.0.1:8000 index.php
```

Then visit `http://127.0.0.1:8000/` in your browser.

### Arch Linux / CachyOS (AUR)
```bash
cd packaging/aur
makepkg -si
```

### Clean Uninstallation
To remove the application shortcuts and launcher:
```bash
./uninstall.sh
```
*(Your music files, local library, and playlists remain untouched.)*

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
