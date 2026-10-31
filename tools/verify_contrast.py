import re
import math

def srgb_to_linear(c):
    c = c / 255.0
    if c <= 0.03928:
        return c / 12.92
    else:
        return ((c + 0.055) / 1.055) ** 2.4

def relative_luminance(rgb):
    r, g, b = rgb
    rl = srgb_to_linear(r)
    gl = srgb_to_linear(g)
    bl = srgb_to_linear(b)
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl

def contrast_ratio(rgb1, rgb2):
    l1 = relative_luminance(rgb1)
    l2 = relative_luminance(rgb2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 3:
        hex_str = ''.join([c*2 for c in hex_str])
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

# Color palette definition for each theme
themes_data = {
    'default': {
        'bg_canvas': '#070a0e',
        'bg_surface': '#0d141c',
        'bg_surface_2': '#141f2c',
        'text_primary': '#f0f6fc',
        'text_secondary': '#a3c7ed',
        'text_muted': '#6e8fae',
        'accent': '#00e5ff',
        'text_on_accent': '#040e14',
    },
    'nms': {
        'bg_canvas': '#0a0808',
        'bg_surface': '#1a1012',
        'bg_surface_2': '#28161a',
        'text_primary': '#fff2f4',
        'text_secondary': '#fca5a5',
        'text_muted': '#d996a1',
        'accent': '#ff1744',
        'text_on_accent': '#ffffff',
    },
    'solar-eclipse': {
        'bg_canvas': '#060714',
        'bg_surface': '#0e112a',
        'bg_surface_2': '#181c42',
        'text_primary': '#f0f8ff',
        'text_secondary': '#a8cdfc',
        'text_muted': '#6f90bd',
        'accent': '#00f0ff',
        'text_on_accent': '#040716',
    },
    'euclid-horizon': {
        'bg_canvas': '#0b0906',
        'bg_surface': '#1a140e',
        'bg_surface_2': '#2a2014',
        'text_primary': '#fffbeb',
        'text_secondary': '#fde68a',
        'text_muted': '#d4b475',
        'accent': '#fbbf24',
        'text_on_accent': '#1c1202',
    },
    'alien-paradise': {
        'bg_canvas': '#0d060e',
        'bg_surface': '#1c0e1c',
        'bg_surface_2': '#2e142e',
        'text_primary': '#fff0f5',
        'text_secondary': '#f9a8d4',
        'text_muted': '#d88cb6',
        'accent': '#ff2a70',
        'text_on_accent': '#ffffff',
    },
    'abyssal-void': {
        'bg_canvas': '#030a09',
        'bg_surface': '#081a16',
        'bg_surface_2': '#0e2a23',
        'text_primary': '#ecfdf5',
        'text_secondary': '#6ee7b7',
        'text_muted': '#52b797',
        'accent': '#00ffaa',
        'text_on_accent': '#01170e',
    },
    'dissonance': {
        'bg_canvas': '#0b0512',
        'bg_surface': '#180c26',
        'bg_surface_2': '#28123c',
        'text_primary': '#faf5ff',
        'text_secondary': '#e9d5ff',
        'text_muted': '#c09ee0',
        'accent': '#d946ef',
        'text_on_accent': '#ffffff',
    },
    'sentinel': {
        'bg_canvas': '#060b12',
        'bg_surface': '#0c1826',
        'bg_surface_2': '#12263a',
        'text_primary': '#f0fdfa',
        'text_secondary': '#7dd3fc',
        'text_muted': '#64a8c9',
        'accent': '#00e5ff',
        'text_on_accent': '#03131a',
    },
    'minimalist-light': {
        'bg_canvas': '#f4f4f5',
        'bg_surface': '#ffffff',
        'bg_surface_2': '#eae7dd',
        'text_primary': '#000000',
        'text_secondary': '#27272a',
        'text_muted': '#52525b',
        'accent': '#000000',
        'text_on_accent': '#ffffff',
    },
    'minimalist-dark': {
        'bg_canvas': '#000000',
        'bg_surface': '#0d0d0d',
        'bg_surface_2': '#171717',
        'text_primary': '#ffffff',
        'text_secondary': '#d4d4d4',
        'text_muted': '#a1a1aa',
        'accent': '#ffffff',
        'text_on_accent': '#000000',
    },
    'minimalist-warm': {
        'bg_canvas': '#faf8f5',
        'bg_surface': '#ffffff',
        'bg_surface_2': '#f5f2eb',
        'text_primary': '#1c1917',
        'text_secondary': '#44403c',
        'text_muted': '#57534e',
        'accent': '#d97706',
        'text_on_accent': '#ffffff',
    },
    'minimalist-obsidian': {
        'bg_canvas': '#000000',
        'bg_surface': '#090a0f',
        'bg_surface_2': '#0f1118',
        'text_primary': '#ffffff',
        'text_secondary': '#cbd5e1',
        'text_muted': '#94a3b8',
        'accent': '#38bdf8',
        'text_on_accent': '#000000',
    }
}

print("=" * 78)
print("WCAG 2.1 CONTRAST AUDIT FOR ALL 12 THEMES")
print("Standards: WCAG AA >= 4.5:1 (normal text), >= 3:1 (large text/graphics)")
print("           WCAG AAA >= 7:1 (normal text), >= 4.5:1 (large text)")
print("=" * 78)

failures = 0
for theme_name, pal in themes_data.items():
    print(f"\n--- Theme: {theme_name.upper()} ---")
    
    # 1. Primary Text on Canvas
    cr_prim_canvas = contrast_ratio(hex_to_rgb(pal['text_primary']), hex_to_rgb(pal['bg_canvas']))
    status_prim = "AAA (PASS)" if cr_prim_canvas >= 7.0 else ("AA (PASS)" if cr_prim_canvas >= 4.5 else "FAIL")
    print(f"  Primary Text on Canvas:        {cr_prim_canvas:5.2f}:1  [{status_prim}]")
    if cr_prim_canvas < 4.5: failures += 1

    # 2. Primary Text on Surface
    cr_prim_surf = contrast_ratio(hex_to_rgb(pal['text_primary']), hex_to_rgb(pal['bg_surface']))
    status_prim_surf = "AAA (PASS)" if cr_prim_surf >= 7.0 else ("AA (PASS)" if cr_prim_surf >= 4.5 else "FAIL")
    print(f"  Primary Text on Surface:       {cr_prim_surf:5.2f}:1  [{status_prim_surf}]")
    if cr_prim_surf < 4.5: failures += 1

    # 3. Secondary Text on Surface
    cr_sec_surf = contrast_ratio(hex_to_rgb(pal['text_secondary']), hex_to_rgb(pal['bg_surface']))
    status_sec = "AAA (PASS)" if cr_sec_surf >= 7.0 else ("AA (PASS)" if cr_sec_surf >= 4.5 else "FAIL")
    print(f"  Secondary Text on Surface:     {cr_sec_surf:5.2f}:1  [{status_sec}]")
    if cr_sec_surf < 4.5: failures += 1

    # 4. Muted Text on Surface
    cr_mut_surf = contrast_ratio(hex_to_rgb(pal['text_muted']), hex_to_rgb(pal['bg_surface']))
    status_mut = "AAA (PASS)" if cr_mut_surf >= 7.0 else ("AA (PASS)" if cr_mut_surf >= 4.5 else "FAIL")
    print(f"  Muted Text on Surface:         {cr_mut_surf:5.2f}:1  [{status_mut}]")
    if cr_mut_surf < 4.5: failures += 1

    # 5. Text on Active Accent
    cr_accent = contrast_ratio(hex_to_rgb(pal['text_on_accent']), hex_to_rgb(pal['accent']))
    status_acc = "AAA (PASS)" if cr_accent >= 7.0 else ("AA (PASS)" if cr_accent >= 4.5 else "AA Large / Graphical (PASS)" if cr_accent >= 3.0 else "FAIL")
    print(f"  Text on Active Accent:         {cr_accent:5.2f}:1  [{status_acc}]")
    if cr_accent < 3.0: failures += 1

print("\n" + "=" * 78)
if failures == 0:
    print("ALL 12 THEMES COMPLIANT WITH WCAG STANDARDS! ZERO CONTRAST FAILURES.")
else:
    print(f"FAILED: {failures} contrast check(s) did not meet minimum standards.")
print("=" * 78)
