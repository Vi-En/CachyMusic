#!/usr/bin/env bash
# CachyMusic — Linux AppImage Builder
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERSION="3.0.0-dev.7.3"
ARCH="${ARCH:-x86_64}"
APPDIR="$PROJECT_ROOT/dist/CachyMusic.AppDir"
OUT_APPIMAGE="$PROJECT_ROOT/dist/CachyMusic-${VERSION}-${ARCH}.AppImage"

rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/share/cachymusic" "$APPDIR/usr/bin" \
         "$APPDIR/usr/share/icons/hicolor/512x512/apps"

cp -r "$PROJECT_ROOT/index.html" "$PROJECT_ROOT/index.php" \
      "$PROJECT_ROOT/manifest.json" "$PROJECT_ROOT/sw.js" \
      "$PROJECT_ROOT/schema.sql" "$PROJECT_ROOT/LICENSE" "$PROJECT_ROOT/THIRD-PARTY-NOTICES.md" "$PROJECT_ROOT/resources" \
      "$PROJECT_ROOT/scripts" "$PROJECT_ROOT/stylesheets" \
      "$PROJECT_ROOT/php" "$PROJECT_ROOT/bin" "$PROJECT_ROOT/server" "$PROJECT_ROOT/package.json" \
      "$APPDIR/usr/share/cachymusic/"
for doc in INITIAL-TEST.md BETA-ACCEPTANCE.md; do
    [ -f "$PROJECT_ROOT/$doc" ] && cp "$PROJECT_ROOT/$doc" "$APPDIR/usr/share/cachymusic/"
done

rm -rf "$APPDIR/usr/share/cachymusic/resources/audio"
find "$APPDIR/usr/share/cachymusic" -type d -name __pycache__ -prune -exec rm -rf {} +
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
