/**
 * Automated WCAG 2.2 FG / MG / BG Contrast Audit across all 12 built-in themes
 * and adversarial Auto-Fix Solver verification.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    auditThemeContrast,
    autoFixThemeContrast,
    contrastRatio,
    oklchToSrgb,
    parseColor,
    srgbToHex
} from '../scripts/modules/color-contrast.js';
import { createDefaultCustomTheme } from '../scripts/modules/custom-theme-schema.js';

const themesCss = fs.readFileSync(new URL('../stylesheets/themes.css', import.meta.url), 'utf8');
const blocks = [...themesCss.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
const parsedThemes = new Map();

for (const [, selRaw, body] of blocks) {
    const sel = selRaw.replace(/\s+/g, ' ').trim();
    const matches = [...sel.matchAll(/data-theme="([^"]+)"/g)].map(m => m[1]);
    const id = matches[0] || (sel.includes(':root') ? 'default' : null);
    if (!id || !body.includes('--bg-canvas')) continue;
    const props = {};
    for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
        props[m[1]] = m[2].trim();
    }
    parsedThemes.set(id, props);
}

assert.equal(parsedThemes.size, 12, 'Expected 12 built-in theme blocks in stylesheets/themes.css');

for (const [id, props] of parsedThemes.entries()) {
    const resolveHex = (key, fallback = '#888888') => {
        const p = parseColor(props[key] || fallback);
        assert.ok(p, `${id}: unparseable ${key} (${props[key]})`);
        return p;
    };
    const bgCanvas = resolveHex('--bg-canvas');
    const surface1 = resolveHex('--bg-surface-1');
    const surface2 = resolveHex('--bg-surface-2');
    const textPrimary = resolveHex('--text-primary');
    const textSecondary = resolveHex('--text-secondary');
    const textMuted = resolveHex('--text-muted');
    const accent = resolveHex('--accent-color');
    const textOnAccent = resolveHex('--text-on-accent');
    const borderControl = resolveHex('--border-control');
    const borderFocus = resolveHex('--border-focus');

    const audit = auditThemeContrast({
        bgCanvas,
        surface1,
        surface2,
        textPrimary,
        textSecondary,
        textMuted,
        accent,
        textOnAccent,
        borderControl,
        borderFocus
    });

    assert.ok(audit.metrics.primaryTextOnBg >= 7.0, `${id} AAA text on canvas failed: ${audit.metrics.primaryTextOnBg}`);
    assert.ok(audit.metrics.primaryTextOnSurface1 >= 7.0, `${id} AAA text on surface1 failed: ${audit.metrics.primaryTextOnSurface1}`);
    assert.ok(audit.metrics.secondaryTextOnSurface1 >= 4.5, `${id} AA secondary text failed: ${audit.metrics.secondaryTextOnSurface1}`);
    assert.ok(audit.metrics.mutedTextOnSurface2 >= 4.5, `${id} AA muted text on surface2 failed: ${audit.metrics.mutedTextOnSurface2}`);
    assert.ok(audit.metrics.textOnAccent >= 4.5, `${id} text-on-accent failed: ${audit.metrics.textOnAccent}`);
    assert.ok(audit.metrics.controlBorderOnSurface1 >= 3.0, `${id} WCAG 1.4.11 control border on S1 failed: ${audit.metrics.controlBorderOnSurface1}`);
    assert.ok(audit.metrics.controlBorderOnSurface2 >= 3.0, `${id} WCAG 1.4.11 control border on S2 failed: ${audit.metrics.controlBorderOnSurface2}`);
    assert.ok(audit.metrics.focusBorderOnSurface1 >= 4.5, `${id} focus ring failed: ${audit.metrics.focusBorderOnSurface1}`);
    assert.ok(audit.checks.planeSeparation, `${id} BG<->MG plane separation failed (${audit.metrics.planeDeltaL})`);
}

// Test autoFixThemeContrast on worst-case adversarial dark & light inputs
const brokenDark = createDefaultCustomTheme('Broken Dark', 'default');
brokenDark.colors.bgCanvas = '#0f1014';
brokenDark.colors.surface1 = '#101115';
brokenDark.colors.surface2 = '#111216';
brokenDark.colors.textPrimary = '#22242a';
brokenDark.colors.textSecondary = '#282a32';
brokenDark.colors.textMuted = '#2b2d36';
brokenDark.colors.accent = '#1b50ff';
brokenDark.colors.textOnAccent = '#1a38a0';
brokenDark.colors.borderControl = '#181920';
brokenDark.colors.borderFocus = '#1c1e26';
brokenDark.backgrounds.canvas.mode = 'image';
brokenDark.backgrounds.canvas.scrimOpacity = 0.05;

const fixedDark = autoFixThemeContrast(brokenDark);
const darkAudit = auditThemeContrast(fixedDark.colors);
assert.equal(darkAudit.allPass, true, `Adversarial dark theme failed after autoFix: ${JSON.stringify(darkAudit)}`);
assert.ok(darkAudit.checks.planeSeparation, 'BG<->MG plane separation restored on dark theme');
assert.ok(fixedDark.backgrounds.canvas.scrimOpacity >= 0.55, 'Image scrim protection enforced');

const brokenLight = createDefaultCustomTheme('Broken Light', 'minimalist-light');
brokenLight.colors.bgCanvas = '#f8f8f8';
brokenLight.colors.surface1 = '#f7f7f7';
brokenLight.colors.surface2 = '#f6f6f6';
brokenLight.colors.textPrimary = '#d5d5d5';
brokenLight.colors.textSecondary = '#d0d0d0';
brokenLight.colors.textMuted = '#cccccc';
brokenLight.colors.accent = '#f4e04d';
brokenLight.colors.textOnAccent = '#ffffff';
brokenLight.colors.borderControl = '#ededed';
brokenLight.colors.borderFocus = '#e0e0e0';

const fixedLight = autoFixThemeContrast(brokenLight);
const lightAudit = auditThemeContrast(fixedLight.colors);
assert.equal(lightAudit.allPass, true, `Adversarial light theme failed after autoFix: ${JSON.stringify(lightAudit)}`);
assert.ok(contrastRatio(srgbToHex(oklchToSrgb(0.95, 0.01, 90)), '#000000') > 15);

console.log('PASS all 12 built-in themes WCAG 2.2 FG/MG/BG contrast & Auto-Fix solver');
