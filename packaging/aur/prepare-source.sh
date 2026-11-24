#!/usr/bin/env bash
# Local source-only Arch build recipe; no network or system mutation.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
out="${1:?Usage: prepare-source.sh OUTPUT_DIRECTORY}"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
version=$(sed -n 's/^pkgver=//p' "$here/PKGBUILD")
name="cachymusic-$version"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/$name/packaging/aur"
for item in index.html index.php manifest.json sw.js schema.sql LICENSE package.json resources scripts stylesheets php bin server; do
    cp -r "$root/$item" "$work/$name/"
done
rm -rf "$work/$name/resources/audio" "$work/$name/bin/__pycache__"
cp "$here/cachymusic.desktop" "$work/$name/packaging/aur/"
tar -C "$work" -czf "$out/$name.tar.gz" "$name"
hash=$(sha256sum "$out/$name.tar.gz" | cut -d' ' -f1)
sed "s/SOURCE_SHA256/$hash/" "$here/PKGBUILD" > "$out/PKGBUILD"
printf 'Source recipe prepared at %s. Run makepkg -si as a regular user on Arch.\n' "$out"
