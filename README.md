# CachyMusic Workstation

<div align="center">

**High-Fidelity Audio Workstation & Music Player with Studio DSP & Turntable Deck**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows%20%7C%20Android%20%7C%20iOS-informational.svg)]()
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-success.svg)](manifest.json)
[![WCAG](https://img.shields.io/badge/WCAG-2.1%20AA%2FAAA-brightgreen.svg)]()

</div>

---

##  Overview

**CachyMusic** is an open-source, high-fidelity music player engineered for music listeners. The name is inspired from my current OS called CachyOS.

---

##  Features

###  Focal Centerpiece & Workstation Ergonomics
- **Intuitive 3-Column Workstation Layout**:
  - **Left**: Collapsible Track Metadata Inspector & embedded artwork card.
  - **Center**: The primary vinyl turntable platter, tactile playback transport, timeline scrubber, and 10-band DSP console.
  - **Right**: Track library, playlist manager, and dynamic queue navigation.
- **Sliding Metadata Inspector**: One-click or hotkey (`KeyI`) sliding drawer that expands the center turntable deck across the workstation with smooth cubic-bezier transitions.
- **Tactile Turntable Platter**: Physics-driven vinyl platter with audio-reactive tonearm tracking, speed selection (33 RPM, 45 RPM, 78 RPM), and ambient album art glow backdrops.

###  Studio DSP & Audiophile Metrics
- **10-Band Graphic Equalizer**: Studio-grade parametric audio shaping (32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz) with one-click flat reset and custom frequency profiles.
- **Real-Time Embedded Audio Data**: Automatic ID3 tag and audio stream inspection displaying bitrate, sample rate, bit depth, channel configuration, codec format, dynamic range, and peak headroom.
- **Audiophile Format Support**: Native playback and streaming for FLAC, ALAC, WAV, AIFF, MP3, AAC, OGG, Opus, and WebM audio containers.

###  Progressive Web App & Multi-Device Freedom
- **Cross-Platform PWA**: Installable on Linux, Windows, macOS, Android, and iOS as a standalone desktop or mobile app.
- **Window Controls Overlay (WCO)**: Native desktop titlebar integration for modern Chromium and Edge browsers.
- **Hardware Back-Button Navigation**: Full HTML5 History API integration handling device back gestures and ESC hotkeys seamlessly across all modal dialogs.
- **LAN Audio Streaming**: Native multi-device streaming across your local Wi-Fi network.

###  Privacy & Security First
- **Clean Slate Architecture**: Zero telemetry, zero tracking, and zero unwanted network access.
- **Soulseek P2P Integration**: Built-in Nicotine+ headless integration that is **disconnected by default on startup**. Network connection and file sharing only initiate when explicitly requested by the user.
- **Sandboxed Directory Confinement**: Strict route whitelisting preventing directory traversal outside authorized library folders.

##  Installation & Quick Start

### Prerequisites
- **PHP 8.2+** with `php-curl`, `php-mbstring`
- Modern web browser (Brave, Chrome, Chromium, Firefox, Edge, Safari)
- *Optional*: **Nicotine+** (for Soulseek P2P network sharing)
- *Optional*: **FFmpeg** (for extended codec inspection)

### One-Click Desktop Installation (Linux)
Clone the repository and run the installer:

```bash
git clone https://github.com/Vi-En/CachyMusic.git
cd CachyMusic
./install.sh
```

This will:
1. Verify system dependencies.
2. Configure permissions for `bin/cachymusic`.
3. Symlink the launcher into `~/.local/bin/cachymusic`.
4. Install desktop application shortcuts and 512×512 icons into `~/.local/share/applications`.

Launch CachyMusic directly from your application menu or terminal:
```bash
cachymusic
```

### Manual / Developer Launch
You can also launch the server directly without installing:

```bash
php -S 127.0.0.1:8000 index.php
```

Then navigate to `http://127.0.0.1:8000/` in your browser.

### Arch Linux / CachyOS (AUR)
```bash
cd packaging/aur
makepkg -si
```

### Clean Uninstallation
To completely remove the desktop application and launcher:
```bash
./uninstall.sh
```
*(Your music library and playlists remain untouched.)*

---

##  Repository Structure

```
.
├── bin/                    # Desktop launcher script (cachymusic)
├── index.html              # Core application workstation interface
├── index.php               # Sandboxed static router & API dispatcher
├── install.sh              # User desktop application installer
├── manifest.json           # W3C Web App Manifest (PWA)
├── packaging/              # Distribution packaging (AUR, desktop entries)
├── php/                    # Backend modular REST API
│   ├── api/                # Endpoints (scan, stream, cover, soulseek, playlists)
│   ├── auth/               # Local authentication handlers
│   └── storage.php         # Library database and metadata abstraction
├── resources/              # Visual assets, SVG icons, fonts, fallback art
├── scripts/                # Frontend client logic & Web Audio engines
│   ├── audio.js            # Web Audio API engine & 10-band DSP filters
│   └── homepage.js         # Core UI interaction, state, and event loop
├── stylesheets/            # Modular CSS & 12 procedural design themes
├── sw.js                   # Service Worker for offline PWA caching
├── tools/                  # Packagers and helper utilities
└── uninstall.sh            # Clean desktop uninstaller
```

---

##  License

This project is licensed under the **GNU General Public License v3.0 or later** ([GPL-3.0-or-later](LICENSE)).

