import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createInstallController } from '../scripts/modules/pwa-install.js';
import { clampBadgeCount, clearAppBadge, updateAppBadge } from '../scripts/modules/app-badge.js';
import { requestWithPreflight } from '../scripts/modules/permission-preflight.js';

function makeElement(id) {
    return {
        id,
        style: {},
        className: '',
        textContent: '',
        disabled: false,
        open: false,
        listeners: {},
        attrs: {},
        classList: {
            set: new Set(),
            toggle(c, f) { if (f === undefined ? !this.set.has(c) : f) this.set.add(c); else this.set.delete(c); }
        },
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return this.attrs[k] ?? null; },
        removeAttribute(k) { delete this.attrs[k]; },
        addEventListener(n, fn) { (this.listeners[n] ||= []).push(fn); },
        removeEventListener(n, fn) { this.listeners[n] = (this.listeners[n] || []).filter(f => f !== fn); },
        click() { for (const fn of this.listeners.click || []) fn(); if (this.onclick) this.onclick(); },
        showModal() { this.open = true; },
        close() { this.open = false; for (const fn of this.listeners.close || []) fn(); },
        focus() {}
    };
}

function makeFakeDom({ standalone = false, wcoVisible = true, wcoHeight = 42 } = {}) {
    const els = new Map();
    for (const id of [
        'installAppBtn', 'downloadPwaStatusPill', 'pwaInstallHint',
        'installHelpDialog', 'installHelpCloseBtn',
        'fileLaunchDialog', 'fileLaunchSummary', 'fileLaunchPlayBtn', 'fileLaunchQueueBtn'
    ]) {
        els.set(id, makeElement(id));
    }
    const rootStyleVars = {};
    const doc = {
        activeElement: null,
        body: { classList: els.get('installAppBtn').classList },
        documentElement: {
            style: {
                setProperty(k, v) { rootStyleVars[k] = v; }
            }
        },
        getElementById: (id) => els.get(id) || null
    };
    const winListeners = {};
    const wcoListeners = {};
    let launchConsumer = null;
    const wco = {
        visible: wcoVisible,
        getTitlebarAreaRect: () => ({ height: wcoHeight }),
        addEventListener: (n, fn) => { (wcoListeners[n] ||= []).push(fn); },
        removeEventListener: (n, fn) => { wcoListeners[n] = (wcoListeners[n] || []).filter(f => f !== fn); }
    };
    const win = {
        navigator: { standalone, windowControlsOverlay: wco },
        launchQueue: { setConsumer: (fn) => { launchConsumer = fn; } },
        matchMedia: (q) => ({
            matches: standalone && q.includes('standalone'),
            addEventListener() {}
        }),
        addEventListener: (n, fn) => { (winListeners[n] ||= []).push(fn); }
    };
    return {
        els,
        rootStyleVars,
        doc,
        win,
        fireWin(n, e) { for (const fn of winListeners[n] || []) fn(e); },
        setWco(vis, h = 0) {
            wco.visible = vis;
            wcoHeight = h;
            for (const fn of wcoListeners.geometrychange || []) fn();
        },
        async fireLaunch(files) {
            await launchConsumer({ files });
        }
    };
}

// 1. Install state machine: help-only fallback -> prompt-ready -> accepted waits for appinstalled -> standalone
{
    const launched = [];
    const env = makeFakeDom({ standalone: false, wcoVisible: true, wcoHeight: 40 });
    const ctrl = createInstallController({
        win: env.win,
        doc: env.doc,
        onLaunchFiles: (files, action) => launched.push({ names: files.map(f => f.name), action })
    });
    ctrl.init();
    assert.equal(ctrl.getState(), 'help-only');
    assert.equal(env.rootStyleVars['--wco-titlebar-height'], '40px');
    env.setWco(false, 0);
    assert.equal(env.rootStyleVars['--wco-titlebar-height'], '0px', 'WCO height must reset to 0px when hidden');

    // Help fallback without beforeinstallprompt opens dialog cleanly (never throws alert or toggles download workspace)
    await ctrl.promptInstall();
    assert.equal(env.els.get('installHelpDialog').open, true);

    // beforeinstallprompt transitions state to prompt-ready and consumes once
    let prompted = 0;
    env.fireWin('beforeinstallprompt', {
        preventDefault() {},
        async prompt() { prompted++; },
        userChoice: Promise.resolve({ outcome: 'accepted' })
    });
    assert.equal(ctrl.getState(), 'prompt-ready');
    await ctrl.promptInstall();
    assert.equal(prompted, 1);
    assert.notEqual(ctrl.getState(), 'standalone', 'Accepted prompt must not immediately claim installed');

    // appinstalled transitions cleanly to standalone
    env.fireWin('appinstalled', {});
    assert.equal(ctrl.getState(), 'standalone');
    assert.equal(env.els.get('installAppBtn').style.display, 'none');

    // LaunchQueue consumer filters valid audio handles and routes user choice without bypassing dialog
    await env.fireLaunch([
        { getFile: async () => ({ name: 'track.flac', type: 'audio/flac' }) },
        { getFile: async () => ({ name: 'notes.txt', type: 'text/plain' }) },
        { getFile: async () => { throw new Error('revoked'); } }
    ]);
    assert.equal(env.els.get('fileLaunchDialog').open, true);
    env.els.get('fileLaunchQueueBtn').click();
    assert.deepEqual(launched, [{ names: ['track.flac'], action: 'queue' }]);
    ctrl.destroy();
}

// 2. Dismissed outcome marks dismissed cleanly
{
    const env = makeFakeDom();
    const ctrl = createInstallController({ win: env.win, doc: env.doc });
    ctrl.init();
    env.fireWin('beforeinstallprompt', {
        preventDefault() {},
        async prompt() {},
        userChoice: Promise.resolve({ outcome: 'dismissed' })
    });
    await ctrl.promptInstall();
    assert.equal(ctrl.getState(), 'dismissed');
    ctrl.destroy();
}

// 3. App Badge clamping, clearing, and feature absence
assert.equal(clampBadgeCount(-5), 0);
assert.equal(clampBadgeCount(Number.NaN), 0);
assert.equal(clampBadgeCount(1200), 999);
let badgeState = null;
const mockNav = {
    async setAppBadge(n) { badgeState = n; },
    async clearAppBadge() { badgeState = 0; }
};
assert.equal(await updateAppBadge(4, mockNav), true);
assert.equal(badgeState, 4);
assert.equal(await updateAppBadge(0, mockNav), true);
assert.equal(badgeState, 0);
assert.equal(await clearAppBadge(mockNav), true);
assert.equal(await updateAppBadge(2, {}), false);

// 4. Manifest & static invariants check
const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.id, 'com.cachymusic.audioworkstation');
assert.equal(manifest.scope, './');
assert.equal(manifest.start_url, './index.html');
assert.ok(manifest.icons.some(i => i.src === 'resources/images/icon-maskable-192.png' && i.purpose === 'maskable'));
assert.ok(manifest.icons.some(i => i.src === 'resources/images/icon-maskable-512.png' && i.purpose === 'maskable'));
assert.ok(Array.isArray(manifest.file_handlers) && manifest.file_handlers.length === 1);

// 5. Contextual permission preflight preserves synchronous Continue callback & Not-now no-op
{
    const preflightEls = new Map();
    for (const id of [
        'permissionPreflightDialog', 'permissionPreflightTitle',
        'permPreflightWhat', 'permPreflightWhy', 'permPreflightStorage',
        'permPreflightRevoke', 'permPreflightNotNowBtn', 'permPreflightContinueBtn'
    ]) {
        preflightEls.set(id, makeElement(id));
    }
    const prevDoc = globalThis.document;
    globalThis.document = {
        activeElement: null,
        getElementById: (id) => preflightEls.get(id) || null
    };
    try {
        let calledSyncInsideClick = false;
        let inClickHandler = false;
        let cancelled = false;
        requestWithPreflight({
            title: 'Allow notifications?',
            what: 'Track changes',
            why: 'Optional background info',
            storageNote: 'Local only',
            revocationNote: 'Toggle off anytime',
            onContinue() { calledSyncInsideClick = inClickHandler; },
            onCancel() { cancelled = true; }
        });
        assert.equal(preflightEls.get('permissionPreflightDialog').open, true);
        inClickHandler = true;
        preflightEls.get('permPreflightContinueBtn').click();
        inClickHandler = false;
        assert.equal(calledSyncInsideClick, true, 'onContinue must run synchronously inside Continue click');
        assert.equal(cancelled, false);
        assert.equal(preflightEls.get('permissionPreflightDialog').open, false);

        let continuedOnCancel = false;
        requestWithPreflight({
            title: 'Allow storage?',
            onContinue() { continuedOnCancel = true; },
            onCancel() { cancelled = true; }
        });
        preflightEls.get('permPreflightNotNowBtn').click();
        assert.equal(continuedOnCancel, false);
        assert.equal(cancelled, true);
    } finally {
        globalThis.document = prevDoc;
    }
}

console.log('PASS PWA install state machine, WCO 0px reset, launchQueue dialog, manifest maskable/file_handlers, preflight sync activation, and AppBadge policy');
