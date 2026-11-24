#!/usr/bin/env bash
# Build a local, installable (debug-signed) APK from CachyMusic's latest bundled frontend.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$SCRIPT_DIR/android"
if ! command -v java >/dev/null 2>&1; then
  echo 'ERROR: Java JDK 17 is required.' >&2; exit 1
fi
if [[ -x "$ANDROID_DIR/gradlew" ]]; then
  GRADLE_CMD="$ANDROID_DIR/gradlew"
elif [[ -n "${GRADLE_BIN:-}" && -x "${GRADLE_BIN}" ]]; then
  GRADLE_CMD="$GRADLE_BIN"
elif command -v gradle >/dev/null 2>&1; then
  GRADLE_CMD="$(command -v gradle)"
else
  echo 'ERROR: Gradle 8.2 is required. Or use GitHub Actions Build installable Android debug APK.' >&2; exit 1
fi
if [[ -z "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]]; then
  echo 'ERROR: Set ANDROID_HOME to an installed Android SDK (platform 34 + build-tools 34.0.0).' >&2; exit 1
fi
(cd "$ANDROID_DIR" && "$GRADLE_CMD" --no-daemon lintDebug testDebugUnitTest assembleDebug)
APK="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
test -s "$APK" || { echo 'ERROR: APK not generated' >&2; exit 1; }
echo "Built: $APK"
sha256sum "$APK"
