import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const stores = new Map();
let failInstall = false;
let claims = 0;
let skips = 0;

function makeCaches() {
    return {
        async keys() { return [...stores.keys()]; },
        async delete(k) { return stores.delete(k); },
        async open(k) {
            if (!stores.has(k)) stores.set(k, new Map());
            const store = stores.get(k);
            return {
                async addAll(requests) {
                    if (failInstall) throw Error('missing asset');
                    for (const r of requests) store.set(r.url, new Response('shell'));
                },
                async put(r, resp) {
                    const url = typeof r === 'string' ? r : r.url;
                    store.set(url, resp);
                },
                async keys() {
                    return [...store.keys()].map(u => new Request(u));
                },
                async delete(r) {
                    const url = typeof r === 'string' ? r : r.url;
                    return store.delete(url);
                },
                async match(r, { ignoreSearch } = {}) {
                    const u = new URL(typeof r === 'string' ? r : r.url);
                    if (ignoreSearch) {
                        for (const [kUrl, resp] of store.entries()) {
                            const ku = new URL(kUrl);
                            if (ku.origin === u.origin && ku.pathname === u.pathname) return resp.clone();
                        }
                        return undefined;
                    }
                    return store.get(u.href)?.clone();
                }
            };
        }
    };
}

function worker(scope, fetchImpl = null) {
    const listeners = {};
    const self = {
        registration: { scope },
        location: new URL(scope),
        clients: { async claim() { claims++; } },
        skipWaiting() { skips++; return Promise.resolve(); },
        addEventListener: (n, fn) => { listeners[n] = fn; }
    };
    const ctx = {
        self,
        caches: makeCaches(),
        URL,
        Request,
        Response,
        Set,
        Promise,
        encodeURIComponent,
        fetch: fetchImpl || (async () => { throw Error('offline'); })
    };
    vm.runInNewContext(script, ctx);
    return {
        event(n, data) {
            let wait;
            listeners[n]({ data, waitUntil: p => { wait = p; } });
            return wait;
        },
        fetch(path, options) {
            let result;
            listeners.fetch({ request: new Request(new URL(path, scope), options), respondWith: p => { result = p; } });
            return result;
        }
    };
}

const a = worker('https://example.test/a/');
const b = worker('https://example.test/b/');
await a.event('install');
await b.event('install');
assert.equal(stores.size, 2);
assert.equal(skips, 0, 'install must never auto-skipWaiting');

const oldA = 'cachymusic-shell:' + encodeURIComponent('https://example.test/a/') + ':old';
stores.set(oldA, new Map());
stores.set('cachymusic-v-old-legacy', new Map());
stores.set('unrelated', new Map());
await a.event('activate');
assert(!stores.has(oldA));
assert.equal(stores.size, 4);
assert.equal(claims, 1);

// Critical asset served offline; optional asset only cached lazily into runtime cache on fetch.
assert.equal(await (await a.fetch('scripts/modules/utils.js?v=1')).text(), 'shell');
assert.equal(await (await b.fetch('index.html')).text(), 'shell');
assert.equal(typeof a.fetch('scripts/modules/p2p.js')?.then, 'function');
assert.equal((await a.fetch('scripts/modules/p2p.js')).status, 503, 'optional asset offline miss returns 503');

// Online optional fetch stores into runtime cache and serves subsequent offline hit.
const onlineA = worker('https://example.test/c/', async () => new Response('optional-ok', { status: 200 }));
await onlineA.event('install');
assert.equal(await (await onlineA.fetch('scripts/modules/p2p.js')).text(), 'optional-ok');
assert.ok([...stores.keys()].some(k => k.includes(':runtime:')), 'optional runtime cache populated lazily');

// Explicit message gate triggers skipWaiting; unrelated messages do not.
await a.event('message', { type: 'OTHER' });
assert.equal(skips, 0);
await a.event('message', { type: 'CACHY_SKIP_WAITING' });
assert.equal(skips, 1);

assert.equal(a.fetch('php/api/stream.php?file=x'), undefined);
assert.equal(a.fetch('resources/audio/private.flac'), undefined);
assert.equal(a.fetch('index.html', { headers: { Range: 'bytes=0-9' } }), undefined);
assert.equal(a.fetch('https://foreign.test/a/index.html'), undefined);
assert.equal(a.fetch('index.html', { method: 'POST' }), undefined);
assert.equal(a.fetch('/b/index.html'), undefined);

const broken = worker('https://example.test/broken/');
failInstall = true;
await assert.rejects(broken.event('install'), /missing asset/);
assert.equal((await broken.fetch('index.html')).status, 503);
assert.equal(await (await a.fetch('index.html')).text(), 'shell');

// Android native bootstrap must not reload for an unrelated registration.
const init = readFileSync(new URL('../scripts/pwa-init.js', import.meta.url), 'utf8');
async function nativeBootstrap(registrations) {
    let reload = 0;
    const window = { AndroidBridge: { isAndroid: () => true }, location: { href: 'https://example.test/a/index.html', reload() { reload++; } } };
    vm.runInNewContext(init, { window, navigator: { serviceWorker: { getRegistrations: async () => registrations } }, URL });
    await new Promise(r => setTimeout(r, 0));
    return reload;
}
let removed = 0;
const makeReg = (scope, scriptURL) => ({ scope, active: { scriptURL }, async unregister() { removed++; return true; } });
assert.equal(await nativeBootstrap([makeReg('https://example.test/b/', 'https://example.test/b/sw.js')]), 0);
assert.equal(removed, 0);
assert.equal(await nativeBootstrap([makeReg('https://example.test/a/', 'https://example.test/a/sw.js?v=old')]), 1);
assert.equal(removed, 1);

// Browser takeover refreshes same-origin cover elements only, once, without reloading when not user-approved.
const origin = 'https://example.test/a/';
const image = src => ({ src, getAttribute() { return this.src; } });
const imgs = [image('php/api/cover.php?tid=1'), image('/b/php/api/cover.php?tid=1'), image('https://foreign.test/a/php/api/cover.php?tid=1'), image('resources/images/default.svg')];
let change;
const serviceWorker = { controller: {}, addEventListener(n, fn) { assert.equal(n, 'controllerchange'); change = fn; } };
vm.runInNewContext(init, { window: { location: { href: origin + 'index.html' }, addEventListener() {} }, navigator: { serviceWorker }, document: { querySelectorAll() { return imgs; } }, URL });
change();
assert.equal(imgs[0].src, origin + 'php/api/cover.php?tid=1&cm_refresh=1');
assert.equal(imgs[1].src, '/b/php/api/cover.php?tid=1');
assert.equal(imgs[2].src, 'https://foreign.test/a/php/api/cover.php?tid=1');
assert.equal(imgs[3].src, 'resources/images/default.svg');
change();
assert.equal(imgs[0].src, origin + 'php/api/cover.php?tid=1&cm_refresh=1');

console.log('PASS tiered SW critical/optional cache scopes, lazy runtime caching, explicit CACHY_SKIP_WAITING, private/range/cross-origin exclusion, native unregister ownership & cover refresh');
