import assert from 'node:assert/strict';

const listeners = new Map();
const docListeners = new Map();
const classes = new Set();
const attrs = new Map();
const docRoot = {
    classList: { toggle: (c, v) => v ? classes.add(c) : classes.delete(c), contains: c => classes.has(c) },
    dataset: {},
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: k => attrs.get(k) ?? null,
};
globalThis.window = {
    location: { search: '' },
    ResizeObserver: class { constructor() { this.observed = 0; this.disconnected = 0; } observe() { this.observed++; } disconnect() { this.disconnected++; } },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
};
globalThis.getComputedStyle = el => ({ direction: el._dir || 'ltr' });
globalThis.localStorage = (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
globalThis.requestAnimationFrame = fn => { fn(performance.now()); return 1; };

function makeNode(id = '', { width = 100, scroll = 200, dir = 'ltr' } = {}) {
    const classSet = new Set();
    const styleMap = new Map();
    const el = {
        id,
        _dir: dir,
        isConnected: true,
        clientWidth: width,
        children: [],
        firstElementChild: null,
        childElementCount: 0,
        parentNode: null,
        textContent: '',
        classList: {
            add: c => classSet.add(c),
            remove: c => classSet.delete(c),
            contains: c => classSet.has(c),
            toggle: (c, on) => on ? classSet.add(c) : classSet.delete(c),
        },
        get className() { return [...classSet].join(' '); },
        set className(v) { classSet.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classSet.add(c)); },
        style: {
            setProperty: (k, v) => styleMap.set(k, String(v)),
            removeProperty: k => styleMap.delete(k),
            getPropertyValue: k => styleMap.get(k) || '',
        },
        setAttribute() {},
        replaceChildren(...nodes) {
            this.children = nodes;
            this.childElementCount = nodes.length;
            this.firstElementChild = nodes[0] || null;
            nodes.forEach(n => { n.parentNode = this; });
        },
        querySelector() { return this.firstElementChild; },
    };
    el._scrollVal = scroll;
    Object.defineProperty(el, 'scrollWidth', { get() { return el._scrollVal; } });
    return el;
}

const overflowActions = { hidden: true };
const pauseBtn = { hidden: false, textContent: '', _attrs: new Map(), setAttribute(k, v) { this._attrs.set(k, String(v)); }, getAttribute: function (k) { return this._attrs.get(k); }, addEventListener() {} };
const fullBtn = { addEventListener() {} };
const metaBox = makeNode('metaBox');
globalThis.document = {
    documentElement: docRoot,
    hidden: false,
    fonts: { ready: Promise.resolve() },
    createElement() {
        return makeNode('', { width: 100, scroll: 220 });
    },
    querySelector: sel => sel === '.trackMeta' ? metaBox : null,
    querySelectorAll: () => [],
    getElementById: id => ({ trackOverflowActions: overflowActions, marqueePauseToggleBtn: pauseBtn, trackFullTextBtn: fullBtn }[id] || null),
    addEventListener(t, fn) { if (!docListeners.has(t)) docListeners.set(t, new Set()); docListeners.get(t).add(fn); },
    removeEventListener(t, fn) { docListeners.get(t)?.delete(fn); },
};

const { updateMarqueeText, setMarqueePaused, isMarqueePaused, bindMeasuredOverflowLifecycle } = await import('../scripts/modules/player-marquee.js');

// 1. Two idless elements must not share a scheduler key; in-place DOM reuse preserves node identity.
const elA = makeNode('', { width: 120, scroll: 260, dir: 'ltr' });
const elB = makeNode('', { width: 120, scroll: 260, dir: 'rtl' });
updateMarqueeText(elA, 'First Long Title That Overflows');
const spanRefA = elA.firstElementChild;
updateMarqueeText(elA, 'Second Longer Title That Still Overflows');
assert.equal(elA.firstElementChild, spanRefA, 'Marquee span reused without cloning accessible nodes');
updateMarqueeText(elB, 'العربية عنوان طويل للاختبار');
await new Promise(r => setTimeout(r, 10));
assert.equal(elA.classList.contains('isMarquee'), true);
assert.equal(elA.firstElementChild.style.getPropertyValue('--marquee-sign'), '-1');
assert.equal(elB.classList.contains('isMarquee'), true);
assert.equal(elB.firstElementChild.style.getPropertyValue('--marquee-sign'), '1', 'RTL marquee scrolls opposite LTR');

// 2. Hidden / zero-width suspends marquee cleanly.
elA.clientWidth = 0;
updateMarqueeText(elA, 'Changed at zero width');
assert.equal(elA.classList.contains('isMarquee'), false, 'Zero-width suspends marquee');

// 3. Explicit user pause persists and hides animation without losing text.
setMarqueePaused(true);
assert.equal(isMarqueePaused(), true);
assert.equal(classes.has('is-marquee-paused'), true);
assert.equal(pauseBtn.getAttribute('aria-pressed'), 'true');
setMarqueePaused(false);
assert.equal(classes.has('is-marquee-paused'), false);

// 4. Lifecycle registration is idempotent.
const beforePageshow = listeners.get('pageshow').size;
bindMeasuredOverflowLifecycle();
assert.equal(listeners.get('pageshow').size, beforePageshow, 'pageshow listener not duplicated');

console.log('PASS WeakMap idless marquee keys, node reuse, RTL direction, zero-width suspend, persistent pause, idempotent lifecycle');
