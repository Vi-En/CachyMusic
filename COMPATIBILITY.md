# CachyMusic 3.0.0-dev.7.3 — platform compatibility

This revision shares one unified web frontend across 17 built-in themes (12 classic/minimalist + 5 Signature collections), optional OS appearance follow mode, custom themes, the DSP engine, audio graph lifecycle, and EQ spectrum renderer. Local-first playback works without optional Soulseek or desktop services. See `INITIAL-TEST.md` for backup, upgrade, and rollback procedures.

## Honest platform capability & limitation matrix

- **Android Chrome / Chromium:** Supports folder/file import, standalone install prompt (`beforeinstallprompt` when eligible), offline Service Worker critical core, Media Session controls, portrait/landscape, and system navigation insets. Background tab playback remains subject to Android browser suspension.
- **Android Native APK (`minSdk=24`, `targetSdk=34`, `versionCode=103`):** Syncs web assets via `syncWorkstationAssets` without browser SW caching, supplies theme-matched `NotificationThemeArt` across all 17 built-in themes + custom palettes, and supports foreground native playback. Requires current Android System WebView and explicit debug vs maintainer release signing keys.
- **iPhone / iPad Safari:** Supports Home Screen web-app installation via Share -> Add to Home Screen (surfaced in the accessible Installation Help sheet), offline critical shell, marquee pause/full-text dialog, and Media Session controls. Desktop `beforeinstallprompt`, File Handling API (`launchQueue`), Background Sync, and App Badging are not promised and degrade safely to plain browser / manual import workflows.
- **Windows / macOS / Linux Chromium & Edge:** Supports loopback launcher (`127.0.0.1`), desktop File Handling (`launchQueue` routed through explicit Play-now / Add-to-queue / Cancel confirmation), optional Window Controls Overlay (`0px` reset when hidden), keyboard shortcuts, and optional App Badging for active Soulseek transfers. Web File Handling and WCO remain feature-detected rather than assumed.
- **Firefox Desktop & Mobile:** Core playback, offline Service Worker critical shell, reduced motion, custom themes, and file/folder pickers work without install CTA deception (surfaces Installation Help / browser fallback rather than `prompt()`).

## Arch Linux / CachyOS

### Recommended source launch

On a current Arch installation, install PHP, Python and a recent browser:

```sh
sudo pacman -Syu --needed php python chromium
bash bin/cachymusic
```

No desktop environment is required for the local server. The launcher prefers Chromium-compatible app windows and falls back to the default browser. Browser media-session handling remains enabled. PipeWire with WirePlumber, PulseAudio, and ALSA system-volume integration are optional; an actual working system mixer is necessary. The app does not force an audio-server migration or directly control DAC hardware registers.

For optional SQLite and richer metadata extraction, install `php-sqlite` and `ffmpeg` and enable SQLite3 in `/etc/php/php.ini` if necessary. For desktop folder dialogs install `zenity` or `kdialog`. A GTK tray and MPRIS are optional (`python-gobject`, `python-dbus`, `gtk3`, `libayatana-appindicator`). To opt into the old native MPRIS bridge, start with `CACHYMUSIC_MPRIS=1 bash bin/cachymusic`; stop any existing managed instance first. Browser media controls are preferred by default to avoid duplicate sessions. Native bridge availability is not a guarantee of successful registration with the desktop D-Bus session.

### Arch package

From the project root:

```sh
bash packaging/aur/prepare-source.sh "$HOME/cachymusic-build"
cd "$HOME/cachymusic-build"
makepkg -si
```

Install `base-devel` first if absent, and run `makepkg` as an ordinary user. The separate Arch build kit already includes the generated PKGBUILD and matching source archive; there is no need to run the preparation step for that kit. It contains the PHP and Node service source, browser assets and Linux launcher, but does not include downloaded Node modules, a browser, PHP binaries or an already-built pacman package. The recipe is local, not an AUR publication. The new Arch CI job is intended to build and inspect the actual package.

After installing, run `cachymusic`. The source launcher and installed launcher use the same user data and state locations by default, provided an existing in-repo data directory or explicit environment override has not changed that location.

## Windows

Install PHP 8.1+ (prefer a currently supported release), Python 3.10+ and a recent Microsoft Edge, Chrome or Chromium-compatible browser. Ensure `php.exe` and Python are accessible on PATH; the launcher also recognizes `php-win/php.exe` or `php/php.exe` relative to the project. Enable PHP cURL for optional Soulseek, and SQLite3 if available. Use Command Prompt:

```bat
bin\cachymusic.bat
```

The launcher discovers commonly installed Edge/Chrome/Brave paths, even if they are not on PATH. It does not disable browser media-key handling. Windows source mode uses the supported single-process PHP CLI server rather than POSIX worker flags. Windows folders can contain spaces, non-ASCII characters and shell-special characters; the backend now uses canonical boundary checks and direct process arguments for metadata tools and the native folder dialog. Actual NTFS, network shares, non-ASCII case folding and removable-drive cases still require Windows tests. Native WASAPI exclusive mode and Windows system-volume bridge are not implemented; browser audio and player volume remain available. Optional FFmpeg/ffprobe on PATH expands metadata coverage; supported decoding depends on the browser and codec.

Do not launch with `python -m http.server` from the source root. The PHP router is required for its deny-by-default routes. The existing Electron packaging route in `packaging/desktop/` requires platform-specific audited runtime binaries; this revision does not ship or certify an Electron executable.

## Shared desktop lifecycle

- Normal launch verifies the app-specific readiness response before opening the player. It refuses a foreign service on the selected port and retains the existing saved port, avoiding silent origin changes that would isolate PWA data.
- `--background` starts the managed services without opening the UI; `--status` checks the instance; `--stop` requests normal owned shutdown. The same arguments work with `bin/cachymusic.bat` on Windows. The desktop backend remains running after the browser window closes until explicitly stopped. No arbitrary process-name or PID-file kill is used by this launcher.
- The default address is `http://127.0.0.1:8000`. If an old unmanaged CachyMusic instance is already running there, stop it with the original launcher first. An explicit `CACHY_PORT` can choose a different origin, but doing so does not migrate IndexedDB or installed-PWA state. Existing running sessions take precedence. A forced supervisor crash may require manual recovery; logs are in the launcher state directory and are overwritten at next launch, not continuously rotated.
- Linux state: `${XDG_STATE_HOME:-$HOME/.local/state}/cachymusic`. Windows state: `%LOCALAPPDATA%\CachyMusic\Launcher`. PHP library data follows `php/platform.php`; the browser profile and database are separate from PHP storage. Back up both before migration. Legacy Soulseek data in the old `server/` directory is not silently migrated to the new managed data location.
- Optional desktop Soulseek needs Node.js 22+, PHP cURL and `slsk-client` installed in a location visible to Node. For source mode, `npm install` from the project root is an explicit dependency-install step, not done by the launcher. For an installed read-only Arch package, install dependencies in a user-writable prefix and set `NODE_PATH` to its `node_modules` before launch. No dependency download occurs automatically. The managed service is loopback-only and starts with a per-launch token; if missing or occupied it remains unavailable while local playback remains usable. This is not a claim of live Soulseek protocol compatibility.
- The local loopback server is not a hardened multi-user or Internet-facing service. Keep it bound to loopback. The instance marker detects accidental service conflicts; it is not an authentication mechanism against malicious local software.

## Android

`minSdk=24` (Android 7.0) and `targetSdk=34` are preserved; a current, supported Android System WebView is required for modern JavaScript, Web Audio and AudioWorklet support. An OS version alone does not guarantee those capabilities. Android uses its existing native host rather than PHP/Node/Python. File selection now accepts audio whose MIME type is incorrectly declared by storage providers; the frontend still validates files. System-volume capability respects fixed-volume devices, and the manifest declares MODIFY_AUDIO_SETTINGS. This is Android stream volume, not proof of direct DAC gain.

Install JDK 17, Gradle 8.2 and SDK platform/build-tools 34. Run `bash tools/packager/build-apk-local.sh` on Linux or `tools\packager\build-apk-local.bat` on Windows. Alternatively use the existing GitHub Actions Android workflow. The project syncs the same latest PWA assets into the APK automatically. Retain the signing key to update an existing install. The debug APK is for development/sideloading; it is not a Play-ready package.

As of November 24, 2026, new mobile apps and updates submitted to Google Play generally need target API 36. This revision deliberately does not change the validated source-level API 34 baseline or adopt a new Android Gradle Plugin without an actual compilation and behavior-change test. See https://developer.android.com/google/play/requirements/target-sdk and https://developer.android.com/build/releases/about-agp. Minimum API can stay 24 if a subsequent migration passes old-device testing.

The native playback path does not expose FFT data to the Web Audio graph. The EQ spectrum is unavailable in that mode rather than fabricated. Android PWA mode does not have the APK native bridge. Test the browser/PWA and APK as separate delivery paths.

## Validation and acceptance gates

Executed on the Linux build host (not an Arch desktop):

- Real PHP loopback server startup, application identity, duplicate launch reuse, occupied-port rejection, owned shutdown.
- Unicode WAV indexing and exact 44-byte HTTP Range delivery from a folder containing non-ASCII characters and spaces; filename includes percent and exclamation characters.
- Simulated Windows/POSIX canonical path-boundary rules and direct argument passing; real Windows path semantics remain to be tested.
- OS capability separation and optional MPRIS, simulated Android bridge and standalone PWA fallback.
- Full regression suite, including DSP output equivalence (573,440 samples), graph lifecycle, local HTTP security, metadata writers, resource lifecycle, mock Soulseek and Java host tests. Exit code 0.
- 103 precache references checked. Service-worker install/update/offline behavior on deployed browsers was not rerun.

New CI definitions target an Arch container (including `makepkg`) and Windows 2025 runner (real PHP/launcher integration). They have not been executed here. The existing Android CI build still requires actual execution. The Arch recipe is staged and checksummed locally, not built with pacman here.

Before claiming production compatibility, complete clean installs and upgrades on Arch/CachyOS (Wayland KDE/GNOME, X11 where needed), Windows 11 and any supported Windows 10 installation, Android 7/API 24 with supported WebView, Android 14/API 34, Android 15/16 and the reference Infinix device. Verify local import/rescan, removable storage, Unicode/long paths, media keys, output hotplug, Bluetooth/USB DAC, pause/resume and interruptions, 2-hour playback resource measurements, seek/gapless, PWA offline/update, background playback and live Soulseek transfers. For Android validate both native transport and Web Audio paths. Physical output sample rate, bit-perfect output, memory-leak absence, and hardware audio latency remain uncertified.
