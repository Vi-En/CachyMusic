import re
import os

css_path = 'stylesheets/homepage.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

print(f"Original CSS: {len(css)} bytes, {css.count(chr(10))} lines")

# 1. Update lines 300-355: Root variables for brutalist-light, brutalist-dark, minimalist-warm, minimalist-obsidian
root_light_target = """[data-theme="brutalist-light"]
{
    --bg-canvas: #f4f3ef;
    --bg-surface-1: #ffffff;
    --bg-surface-2: #eae7dd;
    --bg-surface-3: #ddd8cb;
    --bg-glass: rgba(244, 243, 239, 0.96);

    --border-subtle: #000000;
    --border-medium: #000000;
    --border-bold: #000000;
    --border-focus: #000000;

    --text-primary: #000000;
    --text-secondary: #262626;
    --text-muted: #525252;
    --text-disabled: #8a8a8a;
    --text-accent: #000000;
    --text-on-accent: #ffffff;

    --accent-color: #000000;
    --accent-hover: #262626;
    --accent-glow: rgba(0, 0, 0, 0.18);
    --accent-surface: rgba(0, 0, 0, 0.08);
    --ambient-aura-1: rgba(0, 0, 0, 0.06);
    --ambient-aura-2: rgba(0, 0, 0, 0.02);
}"""

root_light_replacement = """[data-theme="brutalist-light"],
[data-theme="minimalist-light"]
{
    --bg-canvas: #f4f3ef;
    --bg-surface-1: #ffffff;
    --bg-surface-2: #eae7dd;
    --bg-surface-3: #ddd8cb;
    --bg-glass: rgba(244, 243, 239, 0.96);

    --border-subtle: #d0cbbd;
    --border-medium: #000000;
    --border-bold: #000000;
    --border-focus: #000000;

    --text-primary: #000000;
    --text-secondary: #262626;
    --text-muted: #525252;
    --text-disabled: #8a8a8a;
    --text-accent: #000000;
    --text-on-accent: #ffffff;

    --accent-color: #000000;
    --accent-hover: #262626;
    --accent-glow: rgba(0, 0, 0, 0.18);
    --accent-surface: rgba(0, 0, 0, 0.08);
    --ambient-aura-1: rgba(0, 0, 0, 0.06);
    --ambient-aura-2: rgba(0, 0, 0, 0.02);

    --bg-base: #f4f4f5;
    --panel-bg: #ffffff;
    --card-bg: #f4f4f5;
    --border-color: #000000;
}"""

root_dark_target = """[data-theme="brutalist-dark"]
{
    --bg-canvas: #000000;
    --bg-surface-1: #0d0d0d;
    --bg-surface-2: #171717;
    --bg-surface-3: #262626;
    --bg-glass: rgba(0, 0, 0, 0.94);

    --border-subtle: #333333;
    --border-medium: #ffffff;
    --border-bold: #ffffff;
    --border-focus: #ffffff;

    --text-primary: #ffffff;
    --text-secondary: #d4d4d4;
    --text-muted: #8a8a8a;
    --text-disabled: #525252;
    --text-accent: #ffffff;
    --text-on-accent: #000000;

    --accent-color: #ffffff;
    --accent-hover: #e5e5e5;
    --accent-glow: rgba(255, 255, 255, 0.28);
    --accent-surface: rgba(255, 255, 255, 0.14);
    --ambient-aura-1: rgba(255, 255, 255, 0.10);
    --ambient-aura-2: rgba(255, 255, 255, 0.03);
}"""

root_dark_replacement = """[data-theme="brutalist-dark"],
[data-theme="minimalist-dark"]
{
    --bg-canvas: #000000;
    --bg-surface-1: #0d0d0d;
    --bg-surface-2: #171717;
    --bg-surface-3: #262626;
    --bg-glass: rgba(0, 0, 0, 0.94);

    --border-subtle: #333333;
    --border-medium: #ffffff;
    --border-bold: #ffffff;
    --border-focus: #ffffff;

    --text-primary: #ffffff;
    --text-secondary: #d4d4d4;
    --text-muted: #8a8a8a;
    --text-disabled: #525252;
    --text-accent: #ffffff;
    --text-on-accent: #000000;

    --accent-color: #ffffff;
    --accent-hover: #e5e5e5;
    --accent-glow: rgba(255, 255, 255, 0.28);
    --accent-surface: rgba(255, 255, 255, 0.14);
    --ambient-aura-1: rgba(255, 255, 255, 0.10);
    --ambient-aura-2: rgba(255, 255, 255, 0.03);

    --bg-base: #000000;
    --panel-bg: #0d0d0d;
    --card-bg: #171717;
    --border-color: #333333;
}

[data-theme="minimalist-warm"]
{
    --bg-canvas: #faf8f5;
    --bg-surface-1: #ffffff;
    --bg-surface-2: #f5f2eb;
    --bg-surface-3: #ebe6dc;
    --bg-glass: rgba(250, 248, 245, 0.95);

    --border-subtle: #e2ded6;
    --border-medium: #d97706;
    --border-bold: #b45309;
    --border-focus: #d97706;

    --text-primary: #1c1917;
    --text-secondary: #44403c;
    --text-muted: #57534e;
    --text-disabled: #8d857d;
    --text-accent: #b45309;
    --text-on-accent: #ffffff;

    --accent-color: #d97706;
    --accent-hover: #b45309;
    --accent-glow: rgba(217, 119, 6, 0.35);
    --accent-surface: rgba(217, 119, 6, 0.12);
    --ambient-aura-1: rgba(217, 119, 6, 0.15);
    --ambient-aura-2: rgba(217, 119, 6, 0.03);

    --status-success: #059669;
    --status-warning: #d97706;
    --status-danger: #dc2626;

    --bg-base: #faf8f5;
    --panel-bg: #ffffff;
    --card-bg: #f5f2eb;
    --border-color: #e2ded6;
}

[data-theme="minimalist-obsidian"]
{
    --bg-canvas: #000000;
    --bg-surface-1: #090a0f;
    --bg-surface-2: #0f1118;
    --bg-surface-3: #181b24;
    --bg-glass: rgba(0, 0, 0, 0.94);

    --border-subtle: #1e2230;
    --border-medium: #38bdf8;
    --border-bold: #38bdf8;
    --border-focus: #38bdf8;

    --text-primary: #ffffff;
    --text-secondary: #cbd5e1;
    --text-muted: #94a3b8;
    --text-disabled: #475569;
    --text-accent: #38bdf8;
    --text-on-accent: #000000;

    --accent-color: #38bdf8;
    --accent-hover: #7dd3fc;
    --accent-glow: rgba(56, 189, 248, 0.45);
    --accent-surface: rgba(56, 189, 248, 0.14);
    --ambient-aura-1: rgba(56, 189, 248, 0.20);
    --ambient-aura-2: rgba(56, 189, 248, 0.04);

    --status-success: #10b981;
    --status-warning: #f59e0b;
    --status-danger: #ef4444;

    --bg-base: #000000;
    --panel-bg: #090a0f;
    --card-bg: #0f1118;
    --border-color: #1e2230;
}"""

if root_light_target in css:
    css = css.replace(root_light_target, root_light_replacement, 1)
    print("✓ Replaced root brutalist-light variables with brutalist-light & minimalist-light")
else:
    print("! Could not find root_light_target exact string")

if root_dark_target in css:
    css = css.replace(root_dark_target, root_dark_replacement, 1)
    print("✓ Replaced root brutalist-dark variables with brutalist-dark, minimalist-dark, minimalist-warm & minimalist-obsidian")
else:
    print("! Could not find root_dark_target exact string")

# 2. Update negative selectors
neg_light_count = css.count(':not([data-theme="brutalist-light"])')
css = css.replace(':not([data-theme="brutalist-light"])', ':not(:is([data-theme="brutalist-light"], [data-theme="minimalist-light"], [data-theme="minimalist-warm"]))')
print(f"✓ Replaced {neg_light_count} negative brutalist-light selectors to exclude all light themes")

neg_dark_count = css.count(':not([data-theme="brutalist-dark"])')
css = css.replace(':not([data-theme="brutalist-dark"])', ':not(:is([data-theme="brutalist-dark"], [data-theme="minimalist-dark"]))')
print(f"✓ Replaced {neg_dark_count} negative brutalist-dark selectors to exclude minimalist-dark")

# 3. Update brutalist theme selectors throughout the stylesheet
# :root[data-theme="brutalist-light"] -> :root:is([data-theme="brutalist-light"], [data-theme="minimalist-light"])
root_bl_count = css.count(':root[data-theme="brutalist-light"]')
css = css.replace(':root[data-theme="brutalist-light"]', ':root:is([data-theme="brutalist-light"], [data-theme="minimalist-light"])')
print(f"✓ Replaced {root_bl_count} :root[data-theme=\"brutalist-light\"] selectors")

root_bd_count = css.count(':root[data-theme="brutalist-dark"]')
css = css.replace(':root[data-theme="brutalist-dark"]', ':root:is([data-theme="brutalist-dark"], [data-theme="minimalist-dark"])')
print(f"✓ Replaced {root_bd_count} :root[data-theme=\"brutalist-dark\"] selectors")

# [data-theme="brutalist-light"] -> :is([data-theme="brutalist-light"], [data-theme="minimalist-light"])
bl_count = css.count('[data-theme="brutalist-light"]')
css = css.replace('[data-theme="brutalist-light"]', ':is([data-theme="brutalist-light"], [data-theme="minimalist-light"])')
print(f"✓ Replaced {bl_count} [data-theme=\"brutalist-light\"] selectors")

bd_count = css.count('[data-theme="brutalist-dark"]')
css = css.replace('[data-theme="brutalist-dark"]', ':is([data-theme="brutalist-dark"], [data-theme="minimalist-dark"])')
print(f"✓ Replaced {bd_count} [data-theme=\"brutalist-dark\"] selectors")

# 4. Fix .settingsScanStatusBox in default theme (lines 29350-29356)
old_scan_box = """:root[data-theme="default"] .settingsScanStatusBox,
:root:not([data-theme]) .settingsScanStatusBox,
[data-theme="default"] .settingsScanStatusBox {
    background: #f3f4f6 !important;
    color: #111111 !important;
    border-left-color: #111111 !important;
}"""

new_scan_box = """:root[data-theme="default"] .settingsScanStatusBox,
:root:not([data-theme]) .settingsScanStatusBox,
[data-theme="default"] .settingsScanStatusBox {
    background: rgba(0, 229, 255, 0.08) !important;
    color: #f0f6fc !important;
    border: 1px solid rgba(0, 229, 255, 0.28) !important;
    border-left: 4px solid #00e5ff !important;
}"""

if old_scan_box in css:
    css = css.replace(old_scan_box, new_scan_box, 1)
    print("✓ Fixed .settingsScanStatusBox in default theme")
else:
    print("! Could not find old_scan_box exact string")

# 5. Fix .toggleActiveBtn.active base style (prevent neon green 1.34:1 on light backgrounds)
old_toggle_active = """.toggleActiveBtn.active {
    background: rgba(0, 255, 136, 0.12) !important;
    border-color: #00ff88 !important;
    color: #00ff88 !important;
    box-shadow: 0 0 12px rgba(0, 255, 136, 0.25) !important;
}"""

new_toggle_active = """.toggleActiveBtn.active {
    background: var(--accent-surface, rgba(0, 255, 136, 0.12)) !important;
    border-color: var(--accent-color, #00ff88) !important;
    color: var(--accent-color, #00ff88) !important;
    box-shadow: 0 0 12px var(--accent-glow, rgba(0, 255, 136, 0.25)) !important;
}

:is([data-theme="brutalist-light"], [data-theme="minimalist-light"]) .toggleActiveBtn.active {
    background: #000000 !important;
    border-color: #000000 !important;
    color: #ffffff !important;
    box-shadow: none !important;
}

[data-theme="minimalist-warm"] .toggleActiveBtn.active {
    background: #1c1917 !important;
    border-color: #d97706 !important;
    color: #ffffff !important;
    box-shadow: none !important;
}"""

if old_toggle_active in css:
    css = css.replace(old_toggle_active, new_toggle_active, 1)
    print("✓ Fixed .toggleActiveBtn.active contrast on light and dark themes")

# 6. Fix active buttons in settings using var(--text-on-accent)
old_settings_active = """.settingsOptionToggles .actionBtn.active,
.enginePrecisionBtn.active,
.ditherModeBtn.active,
.bufferLatencyBtn.active {
    background: var(--accent-color, #00f0ff) !important;
    border-color: var(--accent-color, #00f0ff) !important;
    color: #000000 !important;
    font-weight: 800 !important;
    box-shadow: 0 0 12px var(--accent-glow, rgba(0, 240, 255, 0.35)) !important;
}"""

new_settings_active = """.settingsOptionToggles .actionBtn.active,
.enginePrecisionBtn.active,
.ditherModeBtn.active,
.bufferLatencyBtn.active {
    background: var(--accent-color, #00f0ff) !important;
    border-color: var(--accent-color, #00f0ff) !important;
    color: var(--text-on-accent, #000000) !important;
    font-weight: 800 !important;
    box-shadow: 0 0 12px var(--accent-glow, rgba(0, 240, 255, 0.35)) !important;
}"""

if old_settings_active in css:
    css = css.replace(old_settings_active, new_settings_active, 1)
    print("✓ Updated settings active toggles to use var(--text-on-accent)")

# 7. Write updated CSS to file
with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)

print(f"✓ Successfully wrote updated CSS: {len(css)} bytes, {css.count(chr(10))} lines")
