# CachyMusic 3.0.0-dev.7.0 — closed-beta candidate

This is a runnable source/build kit for private initial acceptance testing, not a signed, device-certified binary distribution. The normal desktop path requires PHP 8.1+, Python 3.10+ and a current browser. The initial local-first configuration does not require MySQL, Node, an account, or Internet access after dependencies are installed. No prebuilt APK is included.

## 1. Protect your existing library

1. Close CachyMusic windows, then stop the managed service using the old or new launcher (`--stop`). Confirm `--status` reports no managed session. Do not delete the browser profile or clear site storage to update the app.
2. Back up your actual data directory, browser profile/site data, and original audio files before experimenting with metadata writing. Back up only while the browser and backend are closed. Default Linux data: `${XDG_DATA_HOME:-$HOME/.local/share}/cachymusic`; launcher Chromium profile: `~/.config/cachymusic`. Windows default data and launcher browser profile: `%LOCALAPPDATA%\CachyMusic`. An explicit data override or a legacy `data/` directory in the old source tree takes precedence. Keep the old source tree intact. A PWA in your ordinary browser has separate site storage; back that profile up as well.
3. Extract the new ZIP to a new directory. For an existing portable library, explicitly select its original absolute data path or copy the backed-up data to the new project's `data/` directory. Do not move or merge database files during playback. Explicit data overrides no longer import unrelated legacy files automatically.
4. Use the existing localhost port and browser profile to retain browser-origin data. Changing ports deliberately creates a separate site origin. The launcher refuses to reuse an older build or mismatched explicit storage settings. If it rejects startup, inspect the local launcher log; do not delete the database as a workaround.

## 2. Arch Linux / CachyOS — quickest test

From the extracted project (directory containing `index.html`):

```sh
sudo pacman -Syu --needed php python chromium
bash bin/cachymusic --stop
bash bin/cachymusic
```

You may instead use the separate Arch build kit: install `base-devel`, extract the kit, then run `makepkg -si` as your normal user in the folder containing `PKGBUILD` and the matching tarball. Run `cachymusic` afterward. The kit is not a precompiled pacman package. Stop with `cachymusic --stop`.

If testing with a deliberately fresh library (stop any old service first), run these in the same terminal:

```sh
export CACHYMUSIC_DATA_DIR="$HOME/cachymusic-initial-test/data"
export CACHYMUSIC_CACHE_DIR="$HOME/cachymusic-initial-test/cache"
export CACHY_PORT=18000
bash bin/cachymusic
```

The port is saved by the launcher. After the trial, stop it and explicitly set `CACHY_PORT` back to the old port (normally 8000), unset both directory overrides, and start the original or new build. Do not copy the trial library over the original. Existing browser data remains origin-specific.

## 3. Windows source test

Install PHP 8.1+, Python 3.10+, and a recent Edge/Chrome/Chromium browser. Make PHP and Python accessible on PATH (or place PHP in `php-win/` as described in COMPATIBILITY.md). From Command Prompt in the extracted project:

```bat
bin\cachymusic.bat --stop
bin\cachymusic.bat
```

For a fresh trial, set `CACHYMUSIC_DATA_DIR`, `CACHYMUSIC_CACHE_DIR`, and `CACHY_PORT=18000` to separate locations as above; use `set` in Command Prompt. Stop the trial and reset the variables and previous port before returning to the existing library. Native WASAPI exclusive mode is not provided by source mode.

## 4. Android initial sideload

Use the supplied Android source and the local build script, or run the repository's **Build installable Android debug APK** workflow in your own private repository. Local build requires JDK 17, Gradle 8.2 and Android SDK platform/build-tools 34. On Linux, run `bash tools/packager/build-apk-local.sh`; on Windows use `tools\packager\build-apk-local.bat`. Output: `tools/packager/android/app/build/outputs/apk/debug/app-debug.apk`. Verify the build output and SHA-256. A debug APK is for sideloading, not Play publication. Keep your signing key consistent; uninstalling an existing app may erase its private data. Do not uninstall simply to resolve a signature mismatch until you have a backup.

Start with Web Audio/default playback. Enable experimental native playback only as a separate test after default playback passes. Test background mode, media keys, screen lock and audio-device changes on the Infinix Note 30 5G or other actual device. No APK was compiled on this host.

## Audio distortion isolation (priority P0 — dev.6.55)

Start at low physical listening volume. If output is harsh, stop playback immediately. Do not use an EQ, limiter or amplifier to conceal distortion.

1. Use a fresh isolated origin/profile (see the fresh-library instructions above) without deleting your existing library. Confirm version 3.0.0-dev.7.0. Start with Native/host precision, normal playback buffer, volume below 100%, speed 1×, all effects and EQ flat/off, no ReplayGain, dithering, OS gain override, continuous PCM or optional Android native playback.
2. Play a known-good local stereo WAV at 44.1 or 48 kHz, then a FLAC and an ordinary MP3/AAC. Compare the same files in another established player at the same physical output volume. Check a second output device if available (speaker/wired/Bluetooth/USB). Do not change several factors simultaneously.
3. Open Signal path and record the reported decode route, graph sample rate and processing status. These are software diagnostics, not hardware measurements. Note if distortion appears immediately, after seek, after backgrounding, at a track transition, or only while browsing artwork.
4. On Android only, if the regular route still distorts, separately test the supported Android native playback switch with effects disabled, then restore it. The delegated experimental MediaCodec-to-Web-Audio PCM stream is no longer auto-selected and is not a supported user-facing mode. Do not enable its developer flag for initial acceptance.
5. If it persists, provide the OS/device, browser/WebView version, file format/rate/depth, output connection, observed route and whether another player reproduces the problem. Keep private paths and credentials out of logs. Test any OS audio effects, mixer overload, Bluetooth profile or driver change separately at low volume.

The new unmuted graph acceptance measures decoded stereo WAV samples after the final application output gate. It passes at source rates 44.1/48/96 kHz, but does not test the physical audio device, OS mixer or Android vendor decoder. The original .44 also passed this fixture. The .45 fix addresses reproduced PCM transport defects, not a claim that every device-specific cause is solved.

## 5. Initial acceptance checklist

Use copies of a few non-sensitive local tracks, with different formats and album metadata. Begin at low application and hardware volume. Record platform, revision, reproduction steps, expected/actual result and a redacted log if an issue occurs.

| Area | Expected result |
|---|---|
| Startup / upgrade | Correct revision, existing library preserved, no unexpected port or storage switch |
| Import and rescan | Real files, accurate count/duration where known, no duplication or false success |
| Play and seek | Play/pause, previous/next, repeat, shuffle, queue and seek remain coherent |
| Playlist | Create, rename, bulk add, edit ordering, remove, relink missing members; restart and confirm persisted order |
| Playback ownership | Browse other playlists or search for nothing; queued song returns to original session; repeat off stops at end |
| Error recovery | Cancel dirty drafts, Undo where supported, failed saves retain draft, no modal obstruction |
| EQ / DSP | Ordinary changes hold/resume safely; expensive settings ask; cancel retains old values; no sudden loudness jump in your setup |
| Themes / UI | Check all 12 themes; desktop, narrow window and enlarged text; transport, notifications, tabs and settings remain usable |
| Offline / upgrade | Once installed and cached, test offline shell and locally stored files; reconnect and update without clearing storage |
| Endurance | Run playback for 2 hours, switch themes/workspaces, edit playlists; monitor memory/CPU and audio interruptions |
| Native Android | Lock screen, background service, interruptions, Bluetooth/USB, return to foreground, Previous/Next history |
| Optional Soulseek | Only after local playback passes; explicitly consent, verify login/cancel, authorized transfer and no unintended sharing |

Do not perform destructive original-file metadata tests on irreplaceable audio. A failure in default local playback, saved-library integrity or application startup is a release blocker; stop testing destructive paths and retain your backups.

## 6. Optional services and automated checks

MySQL is disabled by default even if mysqli is installed or ambient DB variables exist. Only after running the disposable acceptance workflow and reviewing the migration, set `CACHYMUSIC_PLAYLIST_SQL=1` and supply `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` locally. The legacy read-only MySQL connector may be enabled with `CACHYMUSIC_DB_ENABLED=1`; playlist writes still require the transactional flag and migrated schema. An unavailable configured database produces an error instead of silently falling back. Never commit real credentials. Do not point the fixture workflows at a real library.

Run `bash tests/run-all.sh` on a development machine with the tools described in BETA-ACCEPTANCE.md. GitHub workflows cover source/Android verification, desktop compatibility, browser acceptance, SQL acceptance and manual browser endurance. For production acceptance, all relevant target-platform gates must pass. Current external blockers: real cross-tab IndexedDB, secure-origin service worker/AudioWorklet, live MySQL, native APK compilation and physical-device tests. See the separate release assessment for executed evidence.

## 7. Logs and rollback

Linux launcher state: `${XDG_STATE_HOME:-$HOME/.local/state}/cachymusic`; Windows: `%LOCALAPPDATA%\CachyMusic\Launcher`. `launcher.log` and `php-server.log` are local diagnostics, overwritten on the next launch. They can contain private paths: redact them before sharing. Keep the previous source/Arch kit and backup. To revert, stop the new service, restore the backed-up data/profile only if needed and while closed, then start the old build on the same origin. Do not restore over newer data without first backing it up. A downgrade is not guaranteed schema-compatible; use your pre-upgrade backup. If an unmanaged service occupies the port, stop it using its own launcher, not a blanket process kill.

## Interface and listening history (dev.6.55)

Open Details / Lyrics and choose Media card for the theme-aware in-app playback card. Its waveform is the live Web Audio input, not the DAC output; native playback and reduced-motion settings can make it unavailable. The Android Quick Settings media card remains owned by System UI; the app supplies MediaSession metadata, artwork and actions, not its layout or waveform.

In Library, open Sort & tools and choose Listening history. Week means Monday–Sunday in local time; month and year are calendar periods. Counts start on this build and are stored locally per application origin. A play qualifies after 30 seconds of observed playback or half of a shorter song. Suspended background execution can undercount. Recording can be disabled and existing records cleared from that dialog. Clear history does not delete music or playlists. No account synchronization is provided.

Test play/pause both ways, keyboard focus, reduced-motion settings, Soulseek mobile sorting and connection controls, and library reflow at large font sizes. On the affected audio device, repeat the low-volume audio isolation procedure above before enabling effects.

## Listening-history v2 migration and acceptance

Back up the browser profile before upgrading. The database upgrade preserves legacy day counts as unverified recording keys and creates an all-time aggregate plus per-visit receipts. Old and new identities are not automatically merged. Do not run an old release against the upgraded profile; use a separate backed-up profile for rollback. History is local to the app origin/profile. Clearing history deletes both aggregates and receipt records and invalidates old generations. New qualified visits are recorded only after the current visit changes. Full native background journal integration is not implemented; suspended WebView intervals are intentionally excluded. Recording keys are source/fingerprint identities, not audio-content hashes. Source replacement, file-tag rewrites or unresolved metadata can result in separate entries.

Before public use, run `python tests/listening-history-real-idb.py` on a browser that permits local HTTP navigation, and test Android MediaSession speed and Back navigation on the affected device. Severe distortion on the affected physical device remains a release blocker: compare the same known-good files at low listening level with a reference player, using both a fresh profile and a backed-up migrated profile. Do not enable gain enhancement to mask distortion.


## Native listening journal (dev.6.55)

The optional service-owned Android MediaPlayer route records qualified visits even when the WebView is suspended. It writes a bounded private outbox (up to 1,024 pending receipts); the app imports up to four batches of 32 receipts per synchronization invocation when it resumes or polls the service. A malformed receipt or acknowledgement failure no longer prevents the other valid receipts in the batch from being attempted. Failed receipts are retained for retry. Receipt acknowledgement occurs only after the browser database transaction completes. On opt-out, new native records stop; earlier unsynchronized receipts remain pending until tracking is enabled again or history is cleared. Clear history also clears the native outbox and advances the browser generation; the stores are not a single atomic cross-platform transaction, so a failed clear must be reported and retried. Incomplete deletion persists a tracking-pause marker in the app profile; retry Clear history before enabling tracking again. History writes and deletion request strict IndexedDB durability on supporting browsers; this is not a guarantee against arbitrary storage failure. Legacy and unmatched native identities are not silently merged. Mid-track backend handoffs are conservatively suppressed and can undercount. WebView-only playback during full suspension may still be undercounted. Native journal code has host-JVM and simulated bridge tests; APK build, real IndexedDB and device acceptance remain mandatory.

Test: play a known recording for >30 seconds with native playback enabled; lock screen, allow at least two tracks to advance, return, and verify the counts once only. Repeat after restart. Disable history, play another track, enable again and verify no additional play from the disabled period. Clear history; restart and verify no stale entries return. Test a native-to-Web Audio handoff and a repeat-one transition. Check warnings and back up the profile before trying migration or rollback.

Rankings offer Play only for a uniquely resolved recording in the current library; starting that recording exits the previous playlist playback session, but leaves the explicit Up next queue intact. Unverified and ambiguous rows are retained without playback actions.

## Physical audio gate

The accompanying optional reference-audio ZIP contains synthetic stereo tones at deliberately low digital peak levels. Do not treat them as hardware calibration. Start at a low physical output volume; compare the same file in another established player using the same output device and system mixer. Test wired/USB/Bluetooth separately where applicable. Stop playback immediately on severe distortion, clipping, loud clicks or unexpected volume. Record the OS, device, browser or WebView version, source format and sample rate, selected playback route, effects settings, output type and whether the other player also distorts. Do not share account credentials, personal music paths or raw user databases. Passing the in-browser waveform fixture is not a physical hardware pass.

## Beta qualification (dev.6.55)

This source kit is intended for a restricted, opt-in beta after the applicable acceptance gates pass. It is not a signed public release or a guarantee of device audio safety. Begin with a separate backed-up profile, standard local playback and all optional processing off. Do not enable the experimental direct PCM route for beta acceptance. If distortion, unexpected volume, data corruption or repeated crashes occur, stop the trial and preserve the original profile for rollback.

See `BETA-ACCEPTANCE.md` for the precise scope and maintainer test procedure. The runner in `tests/beta-acceptance.py` records failures and environment blocks separately; it never certifies physical audio or manual acceptance. Native history now rotates pending receipts to prevent repeated acknowledgement failures from starving other recordings. Conflicting new receipt IDs are rejected; legacy ID-only receipts retain existing idempotency semantics. The explicit clear operation advances beyond the larger of the cached and database generations. A native generation ahead of both still requires explicit native/profile recovery; never reset the user's data automatically.

## Independent audio isolation (dev.6.55)

Use the separately supplied physical-audio-acceptance ZIP. Begin with its low-amplitude 44.1 kHz WAV and low device volume. Compare a known-good player, CachyMusic with all optional processing off, and `compare.html` in a supported browser on the same device and output. Stop immediately on distortion. During stable CachyMusic playback, open Signal path and choose Export audio diagnostics (the output-gate sample is not a physical capture). Copy or download the diagnostic JSON. Do not export music, paths, account data or raw recordings. A clean browser graph does not establish clean physical playback. Test the original affected device and migrated settings as well as a fresh profile. See the physical kit README for decision rules.

## Audio recovery changes (dev.6.55)

Regular and preloaded media startup now has an 8-second start deadline after graph readiness; the graph resume/close and worklet initialization have their own bounded waits. Press Pause to cancel a pending play, or retry once the output is available. The application does not automatically start a second audio graph while an earlier close is unresolved. If an audio context remains stuck after a failed close, reload the application; do not repeatedly start additional playback engines. Audio output suspension during playback pauses transport and requires an explicit Play command.

Whole-file compatibility fetches use a 15-second network deadline, and decode waits use a 20-second deadline; the browser's underlying decode cannot be cancelled, so another compatibility allocation is not permitted until the earlier decode settles. Invalid/nonfinite decoded geometry is rejected; compatibility decoding is limited to mono/stereo rather than guessing surround mapping. Ordinary browser-native decoding remains available for formats it supports. File-URL identity alone is not used to reuse decoded buffers.

The previous physical-audio acceptance kit remains compatible. On the affected device compare low-volume reference audio with effects disabled, then test seek, pause/resume, output interruption and a manual retry. Test Android audio focus, wired-device disconnection, native mute and actual device output separately. Host JVM mocks cannot certify OEM behavior. Do not intentionally test at unsafe physical volume.

## dev.6.55 stability additions

Desktop incremental PCM reads now carry a media-version token derived from the opened file's filesystem identity, size and modification/change timestamps. If the file is replaced or its token changes, playback stops rather than mixing incompatible chunks; reload the recording to retry. This is not a content hash and does not detect every in-place edit at coarse filesystem timestamp resolution. Android provider-based reads still need device acceptance. Optional prebuffering now declines contradictory or ambiguous track identities. Unknown Android service status blocks a competing backend until release is confirmed. The portable core-only staging option avoids installing the optional peer runtime; peer failure is isolated from local playback. Follow BETA-ACCEPTANCE.md for dependency and external acceptance gates.

## dev.6.55 acceptance changes

The local Linux backend can now restart immediately on its existing port after an orderly shutdown. The source package includes a prior-archive upgrade/restore fixture and a Debian package-build/extraction smoke test. Keep the original backup until actual browser-profile acceptance passes. Do not use the older launcher immediately on a port still in TIME_WAIT; the isolated rollback fixture uses a separate port. Android incremental PCM providers without regular seekable descriptors are rejected rather than treated as valid sources. Native source contracts and host-JVM tests are not a substitute for an actual APK.

## dev.6.55 transport and distribution changes

Prepared continuous-PCM successors are invalidated when known source metadata or the local File changes; Android direct PCM packet and descriptor reads now have explicit preallocation limits. The desktop scan cache checks size in addition to mtime. A source change that preserves all observable attributes is still not a content hash. Experimental Android direct PCM remains developer-only.

No font binaries are bundled. The theme formerly using the NMS-derived font uses Futura/Century Gothic if installed, otherwise system UI; typography may vary by device. The release includes THIRD-PARTY-NOTICES.md. Portable staging now refuses unlisted runtime files, changed digests, unresolved symlinks, unreviewed notices and preexisting Electron app payloads. Supply the exact reviewed runtime manifest described in that notice; this is not a vulnerability or legal certification.

Before production, verify all actual output routes and the original distortion using low-volume reference playback. Use the dev.6.51 physical acceptance kit. A real hardware result remains mandatory; report the device, OS, output connection and whether a separate player distorts.


For optional offline storage inspection and non-destructive quarantine, follow the dev.6.63 local profile maintenance instructions in `BETA-ACCEPTANCE.md`. Stop every backend and back up the complete profile first. The default command is inspection-only.

## dev.6.70 beta stop conditions
Start with a fresh disposable local JSON profile and a separate copy of your music. Back up the entire old profile. Start at low volume with effects off. Stop immediately for harsh output, spikes, repeated unintended track changes, lost playlists, or damaged tags. Do not retry an uncertain write until checking both the source file and library. See BETA-ACCEPTANCE.md for scope limitations.
