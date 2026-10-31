#!/usr/bin/env bash
# ==============================================================================
# CachyMusic macOS Standalone Launcher (.command)
# Double-click in Finder to run CachyMusic on macOS
# ==============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "========================================================"
echo "          CachyMusic Audio Workstation (macOS)          "
echo "========================================================"

if ! command -v php >/dev/null 2>&1; then
    echo "[ERROR] PHP is required but not found in PATH."
    echo "Please install PHP via Homebrew: 'brew install php'"
    read -rp "Press enter to exit..."
    exit 1
fi

PORT="${CACHY_PORT:-8000}"
URL="http://127.0.0.1:$PORT"

# Check if already listening
if ! curl -s -o /dev/null -m 0.5 "$URL" 2>/dev/null; then
    echo "Starting CachyMusic backend on port $PORT..."
    PHP_CLI_SERVER_WORKERS=4 nohup php -S "127.0.0.1:$PORT" index.php >/dev/null 2>&1 &
    PHP_PID=$!
    trap 'kill "$PHP_PID" 2>/dev/null || true' EXIT INT TERM
    sleep 0.8
fi

# Launch in standalone window mode if Chrome or Brave exists, else open default browser
if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="$URL" --user-data-dir="$HOME/Library/Application Support/CachyMusic"
elif [ -d "/Applications/Brave Browser.app" ]; then
    open -na "Brave Browser" --args --app="$URL" --user-data-dir="$HOME/Library/Application Support/CachyMusic"
else
    open "$URL"
fi

echo "CachyMusic is running at $URL"
