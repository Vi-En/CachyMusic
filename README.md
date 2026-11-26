# CachyMusic

**Source revision: 3.0.0-dev.6.74 — initial user-test release.** Runnable source/build kit, not a device-certified public release.

A private, local-first, cross-platform music player with integrated audio processing, local library management, online metadata lookup and optional Soulseek. Shared PWA interface; Android and desktop packaging provide native functionality beyond browser capabilities.

## Start here

- **[Initial testing and safe upgrade](INITIAL-TEST.md)** — first launch, backups, rollback, initial acceptance checklist and optional service boundaries.

- **[Platform compatibility and installation](COMPATIBILITY.md)** — Arch Linux, Windows and Android, requirements, startup commands and limitations.

- **[Android build instructions](ANDROID-APK-BUILD.md)**, **[desktop packaging](packaging/desktop/README.md)** and **[beta acceptance](BETA-ACCEPTANCE.md)** — platform build and release gates.
- **[Privacy, security and licensing](docs/PRIVACY-AND-LICENSING.md)** — local-only policy, network exceptions and release gates.

The primary mobile reference is the Infinix Note 30 5G; responsive layout is based on logical CSS viewport dimensions, not physical pixels. Experimental shared-clock PCM/FLAC transitions are available; universal gapless playback, bit-perfect hardware output and complete security certification are not claimed.

## What's new in dev.6

- Experimental Android native playback for indexed local audio, off by default. The service can continue the Play Queue, ordered playback and shuffle while the interface is closed. Background ordered playback and shuffle can each use up to 4,096 indexed tracks. The Play Queue can hold up to 512 indexed entries for background playback. Catalog size limits apply. During shuffle, Previous follows playback history. Android 14 emulator checks covered all three expanded playback modes after the activity closed. Playback on the physical reference phone remains pending.
- Android Soulseek validates public numeric IPv4 peer endpoints, rejects private and special-use ranges, and bounds direct file sockets; unavailable Android sharing is labeled explicitly. Local host tests cover the address policy and connection lifecycle.
- Developer build guide and release gates updated. No end-user component downloads added.

## Previous dev.5 changes

- Optional continuous WAV/AIFF/FLAC playback with one prebuffered successor on the same audio clock and DSP path; ordered/queue/repeat modes, guarded cancellation and fallback. Native streaming remains the default. Simulated scheduling verified, real device playback pending.
- Android Soulseek login cancellation, generation-isolated sockets, bounded executors and asynchronous native API bridge. Host-JVM local server and JS mock tests; APK and live transfers pending.
- Notification art is size-bounded and restricted to approved local/indexed resources. Accessible keyboard scrubbing, sleep-timer completion and stale playback retry fixes.

## Previous dev.4 changes

- Extended bundled incremental FLAC decoding through 32-bit mono/stereo; verified float32 output against FFmpeg for a real 32-bit libFLAC fixture. Native streaming remains preferred.
- Added conservative metadata writing for Ogg Vorbis/Opus and M4A/AAC/ALAC, on top of FLAC, MP3, WAV and AIFF. No audio re-encoding. Tagged copies and explicit desktop replacement; Android native writes remain unimplemented.
- Correctly assemble large Ogg headers and locate MP4 movie metadata beyond the initial file prefix.
- Hardened Android transfer token binding and exclusive download socket ownership; Android compilation and live peer tests pending. Upload serving is still absent.
- Earlier DSP, library, artwork, navigation, privacy and standalone packaging improvements retained.

## Develop

```sh
bash tests/run-all.sh
php -S 127.0.0.1:8000 index.php
```

Open `http://127.0.0.1:8000/` on the same machine. See the build guide for required development dependencies. The legacy local PHP server is not a public web service. Use the packaged application for native Soulseek capabilities and full offline distribution. Neither the Android APK nor portable Linux binaries are included in this source snapshot.

## Privacy

No developer telemetry, analytics or remote crash reporting is intended. Core local music functions require no Internet connection once installed. Explicit online metadata/cover/lyrics lookup and user-initiated Soulseek connectivity are intentional exceptions; providers and peers receive connection information and relevant user-selected query data. A hosted PWA also contacts its host to install/update. Never share files without authorization. Full network validation remains a release gate.

## License

CachyMusic: GPL-3.0-or-later (see `LICENSE`). No font binaries are bundled; typography uses installed system fonts. See `docs/PRIVACY-AND-LICENSING.md`. Third-party dependencies and codecs retain their respective licenses. Distribution requires applicable notices, provenance review and corresponding source. No music or provider artwork is bundled.

### dev.6.45 audio stability

Regular media playback remains the default. The experimental Android MediaCodec PCM bridge is no longer auto-selected; it is retained for isolated developer testing only. Stateful PCM operations are serialized and packet geometry is validated. See INITIAL-TEST.md for distortion isolation and the limits of browser waveform acceptance.
