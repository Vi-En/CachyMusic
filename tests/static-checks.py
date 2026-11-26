from pathlib import Path
import re, json, xml.etree.ElementTree as ET
root = Path(__file__).resolve().parents[1]
read = lambda p: (root/p).read_text()
assert 'itunes.apple.com' not in read('scripts/modules/library.js')
assert 'document.cookie' not in read('scripts/modules/utils.js')
assert 'max-age=31536000' not in read('scripts/theme-preload.js')
assert not any(p.suffix.lower() in {'.ttf','.otf','.woff','.woff2'} for p in (root/'resources').rglob('*'))
assert 'resources/fonts/' not in read('sw.js')
assert "connect-src 'self' blob: https://musicbrainz.org" in read('index.html')
assert "script-src 'self';" in read('index.html')
assert "'unsafe-inline'" not in read('index.html').split('script-src',1)[1].split(';',1)[0]
assert 'skipWaiting()' not in read('sw.js')
assert "@import url('./theme-identities.css');" in read('stylesheets/homepage.css')
css = read('stylesheets/theme-identities.css')
for theme in ['nms','solar-eclipse','euclid-horizon','alien-paradise','abyssal-void','dissonance','sentinel','minimalist-light','minimalist-dark','minimalist-warm','minimalist-obsidian']:
    assert f'data-theme=\"{theme}\"' in css or f'data-theme="{theme}"' in css, theme
assert 'loadCore(theme)' in read('scripts/modules/visualizer.js')
assert not (root/'scripts/modules/visualizer-themes-1.js').exists()
assert not (root/'scripts/modules/visualizer-themes-2.js').exists()
assert 'syncDitherAutoFallback' not in read('scripts/modules/audio-engine.js')
assert 'getUserMedia' not in read('scripts/modules/audio-engine.js')
assert 'if (!s.audioContext && (s.isPlaying || s.isSoftwareDecoding))' in read('scripts/modules/audio-engine.js')
assert 'cache.addAll' in read('sw.js')
assert 'onversionchange' in read('scripts/modules/local-library.js')
assert 'MAX_ACTIVE_BITMAPS = 2' in read('scripts/modules/artwork-cache.js')
assert 'visualizerFrameIntervalMs' in read('scripts/modules/visualizer.js')
assert 'createPlaybackAudioContext(AudioCtx, latencyHint)' in read('scripts/modules/audio-engine.js')
assets = re.findall(r"'\./([^']*)'", read('sw.js').split('// Cache only')[0])
assert all((root/p).exists() for p in assets)
assert json.loads(read('package.json'))['license'] == 'GPL-3.0-or-later'
app = ET.parse(root/'tools/packager/android/app/src/main/AndroidManifest.xml').getroot().find('application')
assert app.attrib['{http://schemas.android.com/apk/res/android}allowBackup'] == 'false'
assert '127.0.0.1:8000' in read('package.json')
assert 'android:protectionLevel="signature"' in read('tools/packager/android/app/src/main/AndroidManifest.xml')
assert 'MEDIA_COMMAND_PERMISSION' in read('tools/packager/android/app/src/main/java/org/cachymusic/app/MainActivity.java')
assert "($input['write_file']??false)===true" in read('php/metadata_edit.php')
assert 'metaWriteFile' in read('index.html')
# Soulseek search is a single responsive form with progressively disclosed optional controls.
soulseek_html = read('index.html')
for control_id in ('slskSearchForm', 'slskSearchInput', 'slskSearchSubmitBtn',
                   'slskPanelToggleBar', 'slskPanelCollapsible', 'slskTextFilterToggleBtn',
                   'slskConnectionToggleBtn', 'slskToolbar', 'slskMobileTransfersBtn'):
    assert soulseek_html.count(f'id="{control_id}"') == 1, control_id
assert 'aria-controls="slskPanelCollapsible"' in soulseek_html
assert 'aria-controls="slskToolbar"' in soulseek_html
assert "@import url('./soulseek-responsive.css');" in read('stylesheets/homepage.css')
slsk_css = read('stylesheets/soulseek-responsive.css')
assert '.slskTextFiltersCon:not(.open) { display: none; }' in slsk_css
assert '.slskControlsPanel.is-collapsed .slskPanelCollapsible { display: none; }' in slsk_css
assert "slskPanelToggleBar?.setAttribute('aria-expanded'" in read('scripts/modules/ui-elements.js')
assert "slskConnectionToggleBtn.setAttribute('aria-expanded'" in read('scripts/modules/soulseek-controls.js')
# Ensure relative JS imports exist and are covered by the offline app cache.
for file in (root/'scripts').rglob('*.js'):
    for target in re.findall(r"(?:from\s+|import\s*)['\"](\.[^'\"]+)['\"]",file.read_text()):
        dependency=(file.parent/target).resolve()
        assert dependency.is_file(), (file,target)
        if dependency.suffix=='.js': assert dependency.relative_to(root).as_posix() in assets, (file,target)
print(f'Static checks passed; {len(assets)} precache assets exist.')
