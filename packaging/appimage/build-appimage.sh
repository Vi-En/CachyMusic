#!/usr/bin/env bash
# CachyMusic v2.0.2 — Linux AppImage Builder
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERSION="2.0.2"
ARCH="${ARCH:-x86_64}"
APPDIR="$PROJECT_ROOT/dist/CachyMusic.AppDir"
OUT_APPIMAGE="$PROJECT_ROOT/dist/CachyMusic-${VERSION}-${ARCH}.AppImage"

rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/share/cachymusic" "$APPDIR/usr/bin" \
         "$APPDIR/usr/share/icons/hicolor/512x512/apps"

cp -r "$PROJECT_ROOT/index.html" "$PROJECT_ROOT/index.php" \
      "$PROJECT_ROOT/manifest.json" "$PROJECT_ROOT/sw.js" \
      "$PROJECT_ROOT/schema.sql" "$PROJECT_ROOT/resources" \
      "$PROJECT_ROOT/scripts" "$PROJECT_ROOT/stylesheets" \
      "$PROJECT_ROOT/php" "$PROJECT_ROOT/bin" \
      "$APPDIR/usr/share/cachymusic/"

rm -rf "$APPDIR/usr/share/cachymusic/resources/audio"
chmod +x "$APPDIR/usr/share/cachymusic/bin/cachymusic"

cat > "$APPDIR/AppRun" <<'EOF'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "${0}")")"
exec "$HERE/usr/share/cachymusic/bin/cachymusic" "$@"
EOF
chmod +x "$APPDIR/AppRun"

cp "$PROJECT_ROOT/packaging/aur/cachymusic.desktop" "$APPDIR/cachymusic.desktop"
if [ -f "$PROJECT_ROOT/resources/images/icon-512.png" ]; then
    cp "$PROJECT_ROOT/resources/images/icon-512.png" "$APPDIR/cachymusic.png"
    cp "$PROJECT_ROOT/resources/images/icon-512.png" "$APPDIR/usr/share/icons/hicolor/512x512/apps/cachymusic.png"
fi

if command -v appimagetool >/dev/null 2>&1; then
    ARCH="$ARCH" appimagetool "$APPDIR" "$OUT_APPIMAGE"
    echo "[Packaging] Built AppImage: $OUT_APPIMAGE"
else
    echo "[Packaging] Staged AppDir at $APPDIR (install appimagetool to produce $OUT_APPIMAGE)"
fi
