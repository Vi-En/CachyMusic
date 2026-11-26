import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    THEMES,
    VALID_THEME_IDS,
    THEME_VISUAL_PROFILES,
    getThemeNotificationProfile,
    normalizeThemeId,
} from '../scripts/modules/theme-catalog.js';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

// 1. Validate 12 theme notification profiles & aliases
assert.equal(VALID_THEME_IDS.length, 12);
for (const id of VALID_THEME_IDS) {
    const profile = getThemeNotificationProfile(id);
    assert.equal(profile.id, id);
    assert.equal(profile.name, THEMES[id].name);
    assert.equal(profile.chrome, THEMES[id].chrome);
    assert.ok(['segmented', 'liquid'].includes(profile.style), id);
    assert.match(profile.accent, /^#[0-9a-f]{6}$/i);
    assert.match(profile.secondary, /^#[0-9a-f]{6}$/i);
    assert.equal(profile.light, THEME_VISUAL_PROFILES[id].light);
}
assert.equal(getThemeNotificationProfile('atlas').id, 'nms');
assert.equal(getThemeNotificationProfile('cyberpunk').id, 'solar-eclipse');
assert.equal(getThemeNotificationProfile('unknown-theme').id, normalizeThemeId('unknown-theme'));

// Offscreen mobile playback must not activate a decorative spectrum.
assert.ok(!read('index.html').includes('miniVisCanvas'));
assert.ok(!read('scripts/modules/visualizer.js').includes('canRunMiniStrip'));
assert.ok(!read('sw.js').includes('visualizers/mini-strip.js'));
for (const selector of ['.cachyToast', '--toast-accent', 'prefers-reduced-motion']) {
    assert.ok(read('stylesheets/task-feedback.css').includes(selector));
}
console.log('PASS notification theme profiles and mobile spectrum scope');
