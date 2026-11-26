# CachyMusic 3.0.0-dev.7.0 — Initial-test Android APK build kit

This archive contains **the full updated CachyMusic source** with the audited Soulseek results screen, storage ordering fixes, deferred network interface, responsive settings, Custom Theme Studio, 3-plane WCAG 2.2 contrast overhaul, the Android native host, its Soulseek client, and an APK build workflow. **It is not an already compiled APK.** The packaging environment that prepared this kit had no Android SDK/Gradle tools or network access to install them. No build-success or installation claim is made.

## Easiest: build online via GitHub Actions

1. Extract the archive. Put the **contents of `CachyMusic-3.0.0-dev.7.0/`** (including `.github/`) at the root of a private GitHub repository. Preserve the directory structure.
2. Open the repository's **Actions** tab, select **Build installable Android debug APK**, then **Run workflow** on the repository's default branch.
3. When the workflow completes successfully, open that run's **Artifacts**, download `CachyMusic-debug-apk-<commit SHA>`, and unzip it.
4. Install `app-debug.apk` on the Android device. For USB debugging/ADB: `adb install -r app-debug.apk`.

The workflow installs JDK 17, Gradle 8.2, Android SDK platform 34 and build-tools 34.0.0, then runs Android lint, unit tests, and `assembleDebug`. It copies the **latest** shared web UI via `syncWorkstationAssets`; no manual frontend copying is needed. Successful completion is required before relying on the output. The Debug APK is signed with a development key (not a release signing key).

## Local build using Android Studio or SDK tools

Install JDK 17, Gradle 8.2, SDK platform 34, build-tools 34.0.0, and Android SDK command-line tools. Set `ANDROID_HOME`, then run:

```bash
bash tools/packager/build-apk-local.sh
```

On Windows run `tools\packager\build-apk-local.bat` in Command Prompt instead.

Output: `tools/packager/android/app/build/outputs/apk/debug/app-debug.apk`.

Alternatively, open `tools/packager/android/` in Android Studio and run the `assembleDebug` Gradle task. **Keep the entire project tree**; the Gradle task reads web assets three directories above `app/`.

## Installation and testing limitations

- The APK is for **local development/sideload testing**, not Google Play release. `targetSdk` remains 34 and needs an independently verified migration before store release.
- Debug signing keys vary between machines. Updating an installed app signed under another key fails; **back up settings and library records before uninstalling** an older copy.
- Android 7.0+ is indicated by `minSdk 24`, subject to actual device capabilities.
- The native Soulseek login, file transfer, Android playback/background handling and audio output have not been physically tested on the Infinix Note 30 5G as part of this build-kit preparation.
- Do not interpret a Web Audio sample-rate display as confirmation of a physical DAC's output rate.

## Project identity

- Application ID: `org.cachymusic.app`
- Version name: `3.0.0-dev.7.0`
- Version code: `100`
- Source input: latest Android build-kit source plus audited changes in this revision

## Existing docs

- `BETA-ACCEPTANCE.md` and `INITIAL-TEST.md` describe test gates, backup/rollback, and release limitations.
- `INITIAL-TEST.md` describes safe initial testing and rollback.

## Full audit

See [`COMPATIBILITY.md`](COMPATIBILITY.md) and the separate release assessment for verification and outstanding acceptance gates.
