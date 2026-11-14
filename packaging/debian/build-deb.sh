#!/usr/bin/env bash
# CachyMusic v2.0.0 — Debian (.deb) Package Builder
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERSION="2.0.0"
ARCH="all"
PKG_NAME="cachymusic_${VERSION}_${ARCH}"
STAGING_DIR="$PROJECT_ROOT/dist/$PKG_NAME"
OUT_DEB="$PROJECT_ROOT/dist/${PKG_NAME}.deb"

rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR/DEBIAN" \
         "$STAGING_DIR/usr/share/cachymusic" \
         "$STAGING_DIR/usr/bin" \
         "$STAGING_DIR/usr/share/applications" \
         "$STAGING_DIR/usr/share/icons/hicolor/512x512/apps"

cp -r "$PROJECT_ROOT/index.html" "$PROJECT_ROOT/index.php" \
      "$PROJECT_ROOT/manifest.json" "$PROJECT_ROOT/sw.js" \
      "$PROJECT_ROOT/schema.sql" "$PROJECT_ROOT/resources" \
      "$PROJECT_ROOT/scripts" "$PROJECT_ROOT/stylesheets" \
      "$PROJECT_ROOT/php" "$PROJECT_ROOT/bin" \
      "$STAGING_DIR/usr/share/cachymusic/"

rm -rf "$STAGING_DIR/usr/share/cachymusic/resources/audio"
chmod +x "$STAGING_DIR/usr/share/cachymusic/bin/cachymusic" \
         "$STAGING_DIR/usr/share/cachymusic/bin/cachymusic-mpris.py" \
         "$STAGING_DIR/usr/share/cachymusic/bin/cachymusic-tray.py"

ln -sf "/usr/share/cachymusic/bin/cachymusic" "$STAGING_DIR/usr/bin/cachymusic"
cp "$PROJECT_ROOT/packaging/aur/cachymusic.desktop" "$STAGING_DIR/usr/share/applications/cachymusic.desktop"
if [ -f "$PROJECT_ROOT/resources/images/icon-512.png" ]; then
    cp "$PROJECT_ROOT/resources/images/icon-512.png" "$STAGING_DIR/usr/share/icons/hicolor/512x512/apps/cachymusic.png"
fi

cat > "$STAGING_DIR/DEBIAN/control" <<EOF
Package: cachymusic
Version: ${VERSION}
Section: sound
Priority: optional
Architecture: ${ARCH}
Depends: php-cli | php, python3, python3-gi
Recommends: php-sqlite3, python3-dbus, ffmpeg
Maintainer: CachyMusic Team <noreply@cachymusic.org>
Description: CachyMusic Audio Workstation & Standalone PWA
 High-fidelity 64-bit DSP audio player with vinyl turntable deck,
 10-band parametric EQ, MPRIS2 desktop bridge, and offline PWA mode.
EOF

if command -v dpkg-deb >/dev/null 2>&1; then
    dpkg-deb --build --root-owner-group "$STAGING_DIR" "$OUT_DEB"
    echo "[Packaging] Built Debian package: $OUT_DEB"
else
    echo "[Packaging] Staged Debian root at $STAGING_DIR (install dpkg-deb to assemble .deb)"
fi
