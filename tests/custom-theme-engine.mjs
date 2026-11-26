/**
 * Unit & VM regression tests for Custom Theme Schema, Textures, Preload FOUC Hydration,
 * JSON Import/Export Sanitization, and Frame Scheduler batching.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
    CUSTOM_THEME_SCHEMA_VERSION,
    buildPreloadSnapshot,
    createDefaultCustomTheme,
    parseImportedThemeJson,
    serializeThemeForExport,
    validateAndNormalizeCustomTheme
} from '../scripts/modules/custom-theme-schema.js';
import { TEXTURE_CATALOG, buildProceduralTextureUrl } from '../scripts/modules/custom-theme-textures.js';
import { cancelScheduled, flushSyncForTest, scheduleRead, scheduleWrite } from '../scripts/modules/frame-scheduler.js';

// 1. Schema validation & injection defense
const dirty = {
    id: '../../bad',
    name: '<script>alert(1)</script>Neon Studio',
    mode: 'ultraviolet',
    colors: { bgCanvas: 'javascript:alert(1)', accent: '#38bdf8' },
    backgrounds: {
        canvas: { mode: 'image', imageAssetId: 'bad/path', blurPx: 999, scrimOpacity: -5, opacity: 5 },
        panels: { mode: 'gradient', gradient: { type: 'linear', angle: 999, stops: [{ color: '#112233', pos: -10 }, { color: '#445566', pos: 250 }] } }
    },
    typography: {
        displayFont: 'nonexistent',
        displayCustomName: 'Roboto"; background: url(https://evil.test);',
        scale: 4.5
    },
    geometry: { panelRadius: 999, panelBorderStyle: 'solid;position:fixed', density: 'ultra' },
    motion: { viewTransition: 'slide-morph', durationScale: 12, customBezier: [5, -9, 2, 99] }
};
const clean = validateAndNormalizeCustomTheme(dirty);
assert.equal(clean.schemaVersion, CUSTOM_THEME_SCHEMA_VERSION);
assert.match(clean.id, /^custom:t_/);
assert.equal(clean.name, 'alert(1)Neon Studio');
assert.equal(clean.mode, 'dark');
assert.match(clean.colors.bgCanvas, /^#[0-9a-f]{6}$/);
assert.equal(clean.backgrounds.canvas.mode, 'solid');
assert.equal(clean.backgrounds.canvas.blurPx, 24);
assert.equal(clean.backgrounds.canvas.scrimOpacity, 0);
assert.equal(clean.backgrounds.canvas.opacity, 1);
assert.equal(clean.typography.displayCustomName, '', 'Unsafe font family containing CSS injection must be rejected');
assert.equal(clean.typography.scale, 1.2);
assert.equal(clean.geometry.panelRadius, 28);
assert.equal(clean.geometry.panelBorderStyle, 'solid');
assert.equal(clean.motion.durationScale, 2);
assert.equal(clean.motion.customBezier[0], 1);

// 2. Procedural SVG textures: zero external hosts, valid encoded SVG data URI
assert.equal(TEXTURE_CATALOG.length, 11);
for (const tex of TEXTURE_CATALOG) {
    const cssUrl = buildProceduralTextureUrl(tex.id, '#38bdf8', 0.25, 32);
    if (tex.id === 'none') assert.equal(cssUrl, 'none');
    else {
        assert.ok(cssUrl.startsWith('url("data:image/svg+xml,'), tex.id);
        assert.ok(!cssUrl.includes('http://') && !cssUrl.includes('https://'), tex.id);
    }
}

// 3. Export / Import roundtrip + malicious JSON rejection
const base = createDefaultCustomTheme('Emerald Glass', 'abyssal-void');
base.backgrounds.canvas.mode = 'texture';
base.backgrounds.canvas.textureId = 'topo-contour';
const exported = serializeThemeForExport(base, {});
const imported = parseImportedThemeJson(exported);
assert.equal(imported.theme.name, 'Emerald Glass');
assert.equal(imported.theme.backgrounds.canvas.mode, 'texture');
assert.equal(imported.theme.backgrounds.canvas.textureId, 'topo-contour');
assert.notEqual(imported.theme.id, base.id, 'Import allocates a fresh unique custom theme ID');

assert.throws(() => parseImportedThemeJson('{"name":"Bad","custom":"expression(alert(1))"}'), /disallowed/i);
assert.throws(() => parseImportedThemeJson('{"format":"cachymusic-custom-theme","theme":{},"assets":{"a1":"https://evil.example/a.png"}}'), /Invalid embedded/i);

// 4. theme-preload.js FOUC-free hydration for custom snapshots + safe fallback when corrupted
const preloadSrc = fs.readFileSync(new URL('../scripts/theme-preload.js', import.meta.url), 'utf8');
const runPreload = (storeMap) => {
    const attrs = {};
    const styleProps = {};
    const storage = {
        getItem: (k) => (k in storeMap ? storeMap[k] : null),
        setItem: (k, v) => { storeMap[k] = v; }
    };
    let chromeColor = '';
    const root = {
        setAttribute: (k, v) => { attrs[k] = v; },
        classList: { add() {} },
        style: { setProperty: (k, v) => { styleProps[k] = v; } }
    };
    const doc = {
        cookie: '',
        documentElement: root,
        querySelector: () => ({ setAttribute: (k, v) => { if (k === 'content') chromeColor = v; } })
    };
    vm.runInNewContext(preloadSrc, {
        document: doc,
        window: { location: { search: '' }, localStorage: storage, sessionStorage: storage },
        localStorage: storage,
        sessionStorage: storage,
        URLSearchParams,
        navigator: { userAgent: '' }
    });
    return { attrs, styleProps, chromeColor };
};

const snap = buildPreloadSnapshot(base);
const customBoot = runPreload({
    cachymusic_active_theme: base.id,
    cachymusic_custom_theme_snapshot: JSON.stringify(snap)
});
assert.equal(customBoot.attrs['data-theme'], 'custom');
assert.equal(customBoot.attrs['data-custom-theme-id'], base.id);
assert.equal(customBoot.chromeColor, base.colors.bgCanvas);
assert.equal(customBoot.styleProps['--accent-color'], base.colors.accent);

const corruptBoot = runPreload({
    cachymusic_active_theme: base.id,
    cachymusic_custom_theme_snapshot: '{not json'
});
assert.equal(corruptBoot.attrs['data-theme'], 'default', 'Corrupt snapshot must fail closed to default');

// 5. Two-phase frame scheduler strictly executes reads before writes and deduplicates by key
const trace = [];
scheduleWrite('a', () => trace.push('write-a-stale'));
scheduleRead('m', () => trace.push('read-m-stale'));
scheduleWrite('a', () => trace.push('write-a-final'));
scheduleRead('m', () => trace.push('read-m-final'));
scheduleRead('c', () => trace.push('read-cancelled'));
cancelScheduled('c');
flushSyncForTest();
assert.deepEqual(trace, ['read-m-final', 'write-a-final']);

console.log('PASS custom theme schema, SVG textures, JSON safety, preload hydration & frame scheduler');
