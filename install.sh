#!/usr/bin/env bash
# ==============================================================================
# CachyMusic - Seamless Desktop & System Installer
# ==============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_TARGET="$HOME/.local/bin"
DESKTOP_TARGET="$HOME/.local/share/applications"
ICON_TARGET="$HOME/.local/share/icons/hicolor/512x512/apps"

echo "========================================================"
echo "          CachyMusic Installation Setup                 "
echo "========================================================"
echo "Project Path: $APP_DIR"

# 1. Check prerequisites
echo ""
echo "[1/5] Checking prerequisites..."
if ! command -v php >/dev/null 2>&1; then
    echo "  [ERROR] PHP is required but not found in PATH."
    echo "          Please install PHP (e.g. 'sudo pacman -S php' or 'sudo apt install php')."
    exit 1
fi
echo "  ✓ PHP detected ($(php -v | head -n1 | cut -d' ' -f1-2))"

if command -v node >/dev/null 2>&1; then
    echo "  ✓ Node.js detected ($(node -v)) - Soulseek microservice enabled"
else
    echo "  ! Node.js not found (Soulseek microservice will be optional)"
fi

# Detect browser
BROWSER_FOUND=""
for candidate in brave brave-browser google-chrome google-chrome-stable chromium chromium-browser firefox; do
    if command -v "$candidate" >/dev/null 2>&1; then
        BROWSER_FOUND="$candidate"
        break
    fi
done
if [ -n "$BROWSER_FOUND" ]; then
    echo "  ✓ Standalone App Runtime: $BROWSER_FOUND"
else
    echo "  ✓ Standalone App Runtime: xdg-open (system default browser)"
fi

# 2. Ensure executable permissions
echo ""
echo "[2/5] Configuring permissions..."
chmod +x "$APP_DIR/bin/cachymusic"
echo "  ✓ Made $APP_DIR/bin/cachymusic executable"

# 3. Create necessary user directories
echo ""
echo "[3/5] Setting up user application paths..."
mkdir -p "$BIN_TARGET"
mkdir -p "$DESKTOP_TARGET"
mkdir -p "$ICON_TARGET"

# Install application icon
if [ -f "$APP_DIR/resources/images/icon-512.png" ]; then
    cp "$APP_DIR/resources/images/icon-512.png" "$ICON_TARGET/cachymusic.png"
    echo "  ✓ Installed 512x512 desktop icon to $ICON_TARGET/cachymusic.png"
fi

# Symlink launcher into ~/.local/bin
ln -sf "$APP_DIR/bin/cachymusic" "$BIN_TARGET/cachymusic"
echo "  ✓ Symlinked executable to $BIN_TARGET/cachymusic"

# 4. Generate .desktop entry
echo ""
echo "[4/5] Generating desktop application entry..."
DESKTOP_FILE="$DESKTOP_TARGET/cachymusic.desktop"
cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Version=1.0
Type=Application
Name=CachyMusic
GenericName=Audio Workstation & Player
Comment=Cross-platform zero-dependency audio player and workstation
Exec=$BIN_TARGET/cachymusic %U
Icon=cachymusic
Terminal=false
StartupNotify=true
StartupWMClass=cachymusic
Categories=AudioVideo;Audio;Player;Music;
Keywords=audio;music;player;workstation;soulseek;cachy;
MimeType=audio/mpeg;audio/flac;audio/ogg;audio/wav;audio/x-wav;audio/mp4;audio/aac;
EOF
chmod +x "$DESKTOP_FILE"
echo "  ✓ Created desktop entry at $DESKTOP_FILE"

# 5. Refresh system desktop database
echo ""
echo "[5/5] Updating desktop environment caches..."
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_TARGET" 2>/dev/null || true
    echo "  ✓ Updated desktop database"
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
    echo "  ✓ Updated icon cache"
fi

echo ""
echo "========================================================"
echo "          CachyMusic Successfully Installed!            "
echo "========================================================"
echo "You can now launch CachyMusic in three ways:"
echo "  1. App Launcher: Search for 'CachyMusic' in your desktop menu / rofi / dmenu"
echo "  2. Terminal:     Run 'cachymusic' from anywhere"
echo "  3. In-App PWA:   Open http://localhost:8000 and click 'INSTALL APP'"
echo ""
echo "To uninstall anytime, simply run: ./uninstall.sh"
echo "========================================================"
