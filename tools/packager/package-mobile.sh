#!/usr/bin/env bash
# ==============================================================================
# CachyMusic Standalone Android APK Packager
# Builds a 100% self-contained, offline Android music player APK.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ANDROID_DIR="$SCRIPT_DIR/android"
ASSETS_DIR="$ANDROID_DIR/app/src/main/assets"

echo "=== Packaging CachyMusic Standalone Android APK ==="

# 1. Sync web assets into Android app assets directory
echo "Syncing frontend workstation assets..."
rm -rf "$ASSETS_DIR"
mkdir -p "$ASSETS_DIR"
cp "$PROJECT_ROOT/index.html" "$ASSETS_DIR/"
cp "$PROJECT_ROOT/manifest.json" "$ASSETS_DIR/"
cp -r "$PROJECT_ROOT/stylesheets" "$ASSETS_DIR/"
cp -r "$PROJECT_ROOT/scripts" "$ASSETS_DIR/"
cp -r "$PROJECT_ROOT/resources" "$ASSETS_DIR/"
rm -rf "$ASSETS_DIR/resources/audio"

# 2. Setup mock API stubs for offline standalone operation
mkdir -p "$ASSETS_DIR/php/api"
echo '{"success": true, "playlists": []}' > "$ASSETS_DIR/php/api/playlists.php"
echo '{"success": true, "tracks": [], "count": 0, "directory": "", "needsDirectory": true}' > "$ASSETS_DIR/php/api/scan.php"
echo '{"success": false, "status": "offline", "message": "Standalone mode"}' > "$ASSETS_DIR/php/api/soulseek.php"
echo '{"success": true, "available": false, "supported": false, "backend": "android-unsupported"}' > "$ASSETS_DIR/php/api/hardware_volume.php"
echo '{"success": true, "command": null}' > "$ASSETS_DIR/php/api/mpris_state.php"
echo '{"success": true, "message": "Standalone mode"}' > "$ASSETS_DIR/php/api/metadata.php"
echo '{"success": true, "lan_ip": "127.0.0.1", "port": 8000}' > "$ASSETS_DIR/php/api/lan_info.php"
echo '{"success": true, "folders": []}' > "$ASSETS_DIR/php/api/browse_folder.php"
cp "$PROJECT_ROOT/resources/images/default.svg" "$ASSETS_DIR/php/api/cover.php"

# 3. Locate Gradle and Android SDK
GRADLE_BIN="${GRADLE_BIN:-}"
if [ -z "$GRADLE_BIN" ]; then
    if [ -x "$ANDROID_DIR/gradlew" ]; then
        GRADLE_BIN="$ANDROID_DIR/gradlew"
    elif command -v gradle >/dev/null 2>&1; then
        GRADLE_BIN="$(command -v gradle)"
    else
        # Search common user wrapper dist locations
        GRADLE_FOUND=$(find "$HOME/.gradle/wrapper/dists" -name gradle -type f -perm /111 2>/dev/null | head -n 1 || true)
        if [ -n "$GRADLE_FOUND" ]; then
            GRADLE_BIN="$GRADLE_FOUND"
        else
            echo "Error: gradle binary not found." >&2
            exit 1
        fi
    fi
fi

# Ensure local.properties points to Android SDK
if [ ! -f "$ANDROID_DIR/local.properties" ] && [ -d "${ANDROID_HOME:-$HOME/.android-sdk}" ]; then
    echo "sdk.dir=${ANDROID_HOME:-$HOME/.android-sdk}" > "$ANDROID_DIR/local.properties"
fi

# 4. Compile and assemble release APK
echo "Compiling release APK via Gradle..."
(cd "$ANDROID_DIR" && "$GRADLE_BIN" assembleRelease)

OUT_APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
if [ -f "$OUT_APK" ]; then
    echo "=== Build Successful! ==="
    echo "APK Output: $OUT_APK ($(du -h "$OUT_APK" | cut -f1))"
else
    echo "Error: APK output not found." >&2
    exit 1
fi
