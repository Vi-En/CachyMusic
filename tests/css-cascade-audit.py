"""Audit deterministic @layer CSS discipline and compositor-only progress bar compliance."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# 1. Every stylesheet except homepage.css must live inside @layer
for css_path in sorted((ROOT / 'stylesheets').glob('*.css')):
    if css_path.name == 'homepage.css':
        continue
    assert '@layer ' in css_path.read_text(), f'Unlayered stylesheet found: {css_path.name}'

# 2. Verify homepage.css declares custom-theme strictly before utilities
homepage = (ROOT / 'stylesheets/homepage.css').read_text()
layer_line = next(l for l in homepage.splitlines() if l.strip().startswith('@layer '))
layers = [x.strip().rstrip(';') for x in layer_line.replace('@layer', '').split(',')]
assert layers.index('identities') < layers.index('refinements') < layers.index('custom-theme') < layers.index('utilities'), layers

# 3. Verify theme-identities.css does not crush border-medium / border-subtle to translucent --quiet-line
identities = (ROOT / 'stylesheets/theme-identities.css').read_text()
assert '--border-medium: var(--quiet-line)' not in identities
assert '--border-subtle: var(--quiet-line)' not in identities
assert not re.search(r'--quiet-line\s*:\s*color-mix\(in oklch,\s*var\(--text-primary\)\s*(?:7|8|14)%', identities)

# 4. Verify compositor-only progress bar updates (no .style.width on progressBar/miniProgressBar)
for js_path in sorted((ROOT / 'scripts').rglob('*.js')):
    txt = js_path.read_text()
    assert not re.search(r'(?:progressBar|miniProgressBar)\s*\.style\.width\s*=', txt), js_path.name

# 5. Verify custom-theme.css enforces reduced-motion & reduced-transparency guards
ct_css = (ROOT / 'stylesheets/custom-theme.css').read_text()
assert 'prefers-reduced-motion: reduce' in ct_css
assert 'prefers-reduced-transparency: reduce' in ct_css
assert 'view-transition' in ct_css

print('PASS @layer cascade discipline, preserved border contrast tokens, compositor progress bar & reduced-motion guards')
