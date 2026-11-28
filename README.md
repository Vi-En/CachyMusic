# CachyMusic

**Version `3.0.0-dev.7.4`** — local-first, privacy-respecting cross-platform audio workstation and Progressive Web App with a 64-bit Web Audio DSP worklet engine, 10-band parametric equalizer, 17 visual themes, Custom Theme Studio, local library indexing, metadata/artwork editing, and optional Soulseek integration.

## Key Capabilities

- **Audio Engine & DSP:** 64-bit Web Audio `AudioWorklet` pipeline (with Web Audio fallback), 10-band parametric EQ, Bauer crossfeed, ReplayGain, Sonic/Ultrasonic conditioning, peak limiter/soft clipper, optional continuous PCM playback for lossless tracks, and optional platform system-volume integration (Android `AudioManager` / Linux PipeWire & ALSA).
- **UI & Visualization:** 17 distinct themes with dedicated turntable/visualizer modules (`studio`, `carbon-signal`, `paper-sonata`, `blue-note-console`, `copper-reel`, `orchid-matrix`, plus classic/expressive/minimalist variants), OS appearance follow mode, Custom Theme Studio, responsive portrait/short-landscape/desktop layouts, and continuous marquee text containment.
- **Library & Tagging:** Virtualized local library, playlists, Play Queue, listening history, and conservative dependency-free metadata/artwork writers (FLAC, MP3 ID3v2.3/v2.4, Ogg Vorbis/Opus, MP4/M4A, WAV/AIFF).
- **Optional Integrations:** MusicBrainz / Cover Art Archive / LRCLIB lookup (explicit per-action user trigger), optional Soulseek client (`slsk-client` service on desktop, Java socket client on Android), and optional opt-in SQL playlist backend (`schema.sql`).

## Quick Start

### Linux / CachyOS / Arch Source Launch

Requires **PHP 8.1+**, **Python 3.10+**, and a Chromium/Firefox browser (optional: `php-sqlite`, `ffmpeg`, `nodejs` 22+ for Soulseek):

```sh
bash bin/cachymusic
```

Use `--background`, `--status`, and `--stop` for managed service control. You can also build a Debian package (`bash packaging/debian/build-deb.sh`) or Arch source tarball (`bash packaging/aur/prepare-source.sh <dir>`).

### Windows Source Launch

Requires **PHP 8.1+**, **Python 3.10+**, and Edge/Chrome/Chromium on `PATH`:

```bat
bin\cachymusic.bat
```

### Android APK Build

Requires **JDK 17**, **Gradle 8.2+**, and **Android SDK Platform / Build-Tools 34** (`minSdk 24`, `targetSdk 34`):

```sh
bash tools/packager/build-apk-local.sh
```

On Windows run `tools\packager\build-apk-local.bat`. Output is written to `tools/packager/android/app/build/outputs/apk/debug/app-debug.apk`. Pre-release debug APKs use development signing keys; retain consistent signing keys across upgrades.

## Development & Verification

```sh
bash tests/run-all.sh
php -S 127.0.0.1:8000 index.php
```

> Do not serve the root directory with `python -m http.server`; the PHP router in [index.php](index.php) enforces loopback and API access boundaries.

### Scope & Platform Limitations

- Core local playback works offline without telemetry, analytics, or bundled copyrighted media/fonts.
- Browser/Chromium builds do not expose direct USB DAC hardware registers; Web Audio sample rate displays reflect browser audio graph rates rather than guaranteed physical DAC clocks.
- Android native background playback and Linux/Windows desktop builds should be validated on target hardware before production rollout.

## Privacy & Licensing

- **License:** [GPL-3.0-or-later](LICENSE)
- **Third-Party Notices:** [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
- **Privacy, Security & Licensing Policy:** [docs/PRIVACY-AND-LICENSING.md](docs/PRIVACY-AND-LICENSING.md)
