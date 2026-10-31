#!/usr/bin/env bash
# ==============================================================================
# CachyMusic - Clean Uninstaller
# ==============================================================================
set -euo pipefail

BIN_TARGET="$HOME/.local/bin/cachymusic"
DESKTOP_TARGET="$HOME/.local/share/applications/cachymusic.desktop"
ICON_TARGET="$HOME/.local/share/icons/hicolor/512x512/apps/cachymusic.png"

echo "========================================================"
echo "          CachyMusic Uninstallation                     "
echo "========================================================"

# Stop running background services if any
if [ -f "$BIN_TARGET" ]; then
    echo "Stopping any running CachyMusic background services..."
    "$BIN_TARGET" --stop 2>/dev/null || true
fi

# Remove desktop entry
if [ -f "$DESKTOP_TARGET" ]; then
    rm -f "$DESKTOP_TARGET"
    echo "  ✓ Removed $DESKTOP_TARGET"
fi

# Remove binary symlink
if [ -L "$BIN_TARGET" ] || [ -f "$BIN_TARGET" ]; then
    rm -f "$BIN_TARGET"
    echo "  ✓ Removed $BIN_TARGET"
fi

# Remove icon
if [ -f "$ICON_TARGET" ]; then
    rm -f "$ICON_TARGET"
    echo "  ✓ Removed $ICON_TARGET"
fi

# Update desktop cache
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
    echo "  ✓ Refreshed desktop database"
fi

echo ""
echo "========================================================"
echo "  CachyMusic has been cleanly removed from your system. "
echo "  (Your music library files and playlists were preserved)"
echo "========================================================"
