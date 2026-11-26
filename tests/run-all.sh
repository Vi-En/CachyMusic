#!/usr/bin/env bash
set -euo pipefail
# Regression suites use Python assertions; never inherit an optimized interpreter.
unset PYTHONOPTIMIZE
export PYTHONDONTWRITEBYTECODE=1
cd "$(dirname "$0")/.."
while IFS= read -r -d '' file; do node --input-type=module --check < "$file"; done < <(find scripts -name '*.js' -print0)
node --check sw.js
node --check packaging/desktop/main.cjs
node --check server/soulseek-service.js
node --check server/tag-rewrite.mjs
find php -name '*.php' -print0 | xargs -0 -n1 php -l
php -l index.php
bash -n tools/packager/package-mobile.sh
python3 tests/static-checks.py
node --experimental-default-type=module tests/theme-catalog.mjs
python3 tests/ui-integrity-check.py
node tests/player-boundaries.mjs
node tests/mpris-order.mjs
python3 tests/backend-execution-boundaries.py
python3 tests/mpris-queue.py
node tests/mpris-ack-retry.mjs
python3 tests/operation-budgets.py
python3 tests/process-supervisor.py
python3 tests/async-scan.py
python3 tests/managed-metadata.py
python3 tests/recording-leases.py
python3 tests/recording-authority.py
node tests/recording-lease.mjs
python3 tests/managed-artwork.py
python3 tests/persistent-budgets.py
python3 tests/profile-admission.py
node tests/deferred-cover-sw.mjs
( data=$(mktemp -d); trap 'rm -rf "$data"' EXIT; CACHYMUSIC_DATA_DIR="$data" php -n tests/sql-track-contract.php )
python3 tests/folder-picker-transaction.py
python3 tests/media-authority.py
node tests/library-transition.mjs
node tests/server-scan-client.mjs
node tests/indexing-lifecycle.mjs
node tests/indexing-no-fallback.mjs
node tests/media-lifecycle.mjs
node tests/software-audio-decoder.mjs
node tests/library-query-controller.mjs
node tests/playlist-model.mjs
node tests/playlist-playback.mjs
python3 tests/playlist-storage-concurrency.py
python3 tests/storage-integrity.py
python3 tests/storage-aliases.py
if [[ "$(uname -s)" != MINGW* ]] && [[ "$(uname -s)" != MSYS* ]]; then python3 tests/storage-crash-recovery.py; fi
python3 tests/artwork-commit.py
python3 tests/artwork-boundaries.py
python3 tests/cover-index.py
python3 tests/portable-lookup.py
python3 tests/storage-maintenance.py
python3 tests/cover-cache-maintenance.py
python3 tests/cover-cache-admission.py
python3 tests/playlist-api.py
php -n tests/playlist-sql-read.php
( data=$(mktemp -d); trap 'rm -rf "$data"' EXIT; for mode in default missing failed; do CACHYMUSIC_DATA_DIR="$data/$mode" php -n tests/database-config.php "$mode"; done )
( data=$(mktemp -d); trap 'rm -rf "$data"' EXIT; CACHYMUSIC_DATA_DIR="$data" php -n tests/playlist-storage.php )
node tests/audio-graph-lifecycle.mjs
node tests/offline-journal.mjs
node tests/offline-save-integration.mjs
node tests/control-ui.mjs
node tests/listening-history.mjs
node tests/transport-controls.mjs
node --experimental-default-type=module tests/resource-lifecycle.mjs
node --experimental-default-type=module tests/deep-architecture.mjs
node --experimental-default-type=module tests/soulseek-ui-budget.mjs
node --experimental-default-type=module tests/persistence-ordering.mjs
node --experimental-default-type=module tests/ultrasonic-worklet.mjs
node tests/dsp-regression.cjs
node tests/dsp-transition-stress.cjs
node --experimental-default-type=module tests/audio-policies.mjs
node tests/audio-settings-status.mjs
node tests/audio-change-policy.mjs
node tests/audio-remediation.mjs
node tests/audio-failure-boundaries.mjs
node tests/pwa-cache-policy.mjs
node tests/dsp-control-transaction.mjs
node tests/mixer-write-queue.mjs
CACHY_SKIP_BENCH=1 node tests/dsp-active-eq.cjs
python3 tests/peak-regression.py
python3 tests/pcm-regression.py
python3 tests/flac-regression.py
node --experimental-default-type=module tests/pcm-scheduler.mjs
node tests/pcm-lifecycle.mjs
node --experimental-default-type=module tests/pcm-handoff-lifecycle.mjs
node --experimental-default-type=module tests/pcm-transition.mjs
node --experimental-default-type=module tests/pcm-range.mjs
node --experimental-default-type=module tests/playback-budget.mjs
node --experimental-default-type=module tests/library-query.mjs
python3 tests/metadata-regression.py
python3 tests/mp3-regression.py
python3 tests/container-tags.py
python3 tests/ogg-tags.py
python3 tests/mp4-tags.py
python3 tests/router-regression.py
python3 tests/desktop-compatibility.py
node tests/runtime-platforms.mjs
node tests/soulseek-transport.mjs
python3 tests/soulseek-transfer-identity.py
python3 tests/soulseek-lifecycle.py
python3 tests/android-soulseek-host.py
node --experimental-default-type=module tests/android-bridge.mjs
python3 tests/android-native-host.py
node --experimental-default-type=module tests/android-native-transport.mjs
python3 tests/android-artwork-engine.py
python3 tests/android-direct-decoder.py
node tests/performance-audit-regression.mjs

node tests/notification-theme-ui.mjs
node tests/pcm-worker-ownership.mjs

python3 tests/native-listening-journal.py

python3 tests/audio-loopback-analysis.py

python3 tests/desktop-staging.py

node tests/desktop-shell.mjs

python3 tests/dependency-audit-contract.py
python3 tests/router-alias-security.py
python3 tests/android-media-range-contract.py
python3 tests/android-flac-mask.py

node tests/pcm-transport-bounds.mjs

python3 tests/release-verify.py

python3 tests/source-inventory-contract.py

python3 tests/source-kit-reproducibility.py
