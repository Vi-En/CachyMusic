"""Verify synchronized version metadata, manifest identity, and maskable icon geometry."""
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
pkg = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
version = pkg['version']
assert re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?', version), f'Bad version: {version}'

aur_ver = re.sub(r'-dev\.', '.dev', version) if '-dev.' in version else version.replace('-', '.')
deb_ver = re.sub(r'-dev\.', '~dev', version) if '-dev.' in version else version.replace('-', '~')

lock = json.loads((ROOT / 'package-lock.json').read_text(encoding='utf-8'))
assert lock['version'] == version, lock['version']
assert lock['packages']['']['version'] == version

assert f"const CACHE_VERSION = '{version}';" in (ROOT / 'sw.js').read_text(encoding='utf-8'), 'sw.js CACHE_VERSION mismatch'
assert f'?v={version}' in (ROOT / 'index.html').read_text(encoding='utf-8'), 'index.html ?v= mismatch'
assert f"sw.js?v={version}" in (ROOT / 'scripts/pwa-init.js').read_text(encoding='utf-8'), 'pwa-init.js ?v= mismatch'
assert f"dsp-worklet-processor.js?v={version}" in (ROOT / 'scripts/modules/audio-graph-lifecycle.js').read_text(encoding='utf-8'), 'dsp-worklet ?v= mismatch'

gradle = (ROOT / 'tools/packager/android/app/build.gradle').read_text(encoding='utf-8')
assert f'versionName "{version}"' in gradle, 'Android versionName mismatch'
m_code = re.search(r'versionCode\s+(\d+)', gradle)
assert m_code and int(m_code.group(1)) >= 102, f'Unexpected Android versionCode: {m_code}'

desktop_pkg = json.loads((ROOT / 'packaging/desktop/package.json').read_text(encoding='utf-8'))
assert desktop_pkg['version'] == version, desktop_pkg['version']

assert f'VERSION="{deb_ver}"' in (ROOT / 'packaging/debian/build-deb.sh').read_text(encoding='utf-8'), 'Debian version mismatch'
assert f'pkgver={aur_ver}' in (ROOT / 'packaging/aur/PKGBUILD').read_text(encoding='utf-8'), 'PKGBUILD pkgver mismatch'
assert f'VERSION="{version}"' in (ROOT / 'packaging/appimage/build-appimage.sh').read_text(encoding='utf-8'), 'AppImage version mismatch'

manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
assert manifest['id'] == 'com.cachymusic.audioworkstation'
assert manifest['scope'] == './'
assert manifest['start_url'] == './index.html'

for size in (192, 512):
    icon_rel = f'resources/images/icon-maskable-{size}.png'
    raw = (ROOT / icon_rel).read_bytes()
    assert raw[:8] == b'\x89PNG\r\n\x1a\n', icon_rel
    w, h = struct.unpack('>II', raw[16:24])
    assert (w, h) == (size, size), (icon_rel, w, h)
    assert any(ic.get('src') == icon_rel and ic.get('purpose') == 'maskable' and ic.get('sizes') == f'{size}x{size}' for ic in manifest['icons']), icon_rel

print(f'PASS version sync ({version}, Android versionCode={m_code.group(1)}), immutable manifest identity, and dedicated maskable PNGs')
