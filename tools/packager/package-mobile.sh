#!/usr/bin/env bash
# Developer-only: build APK from the shared frontend and native Android project.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android"
mode="${1:-debug}"
case "$mode" in debug) task=assembleDebug; output=debug/app-debug.apk;; release) task=assembleRelease; output=release/app-release-unsigned.apk;; *) echo 'Usage: package-mobile.sh [debug|release]' >&2; exit 2;; esac
if [[ -n "${GRADLE_BIN:-}" ]]; then gradle_cmd="$GRADLE_BIN"; elif [[ -x "$root/gradlew" ]]; then gradle_cmd="$root/gradlew"; else gradle_cmd="$(command -v gradle || true)"; fi
[[ -n "$gradle_cmd" ]] || { echo 'Install Gradle 8.2 or generate the wrapper in tools/packager/android (see DEVELOPMENT.md).' >&2; exit 1; }
(cd "$root" && "$gradle_cmd" --no-daemon "$task")
apk="$root/app/build/outputs/apk/$output"
[[ -f "$apk" ]] || { echo "Expected APK missing: $apk" >&2; exit 1; }
printf 'APK: %s\n' "$apk"
if [[ "$mode" == release ]]; then echo 'Unsigned release: sign using your own release key before distribution.'; fi
