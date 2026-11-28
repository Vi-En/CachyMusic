// Measured overflow text controller (batch read/write, WeakMap element keys, RTL-aware, pauseable + full-text fallback).
import { store } from './state.js';
import { safeStorage, showToast } from './utils.js';
import { trackName, artistName, albumName } from './ui-elements.js';
import { scheduleRead, scheduleWrite, cancelScheduled } from './frame-scheduler.js';

const MARQUEE_PAUSE_KEY = 'cachymusic_marquee_paused';
const elementKeyMap = new WeakMap();
let nextElementKeyId = 1;
let listenersBound = false;
let marqueeTriggerEl = null;

function getElementKey(el) {
    if (el.id) return `marquee:${el.id}`;
    let id = elementKeyMap.get(el);
    if (!id) {
        id = `marquee:el-${nextElementKeyId++}`;
        elementKeyMap.set(el, id);
    }
    return id;
}

export function isMarqueePaused() {
    return safeStorage.getItem(MARQUEE_PAUSE_KEY) === 'true';
}

function isReducedMotionActive() {
    if (typeof document === 'undefined') return false;
    if (document.documentElement?.dataset?.reducedMotion === 'true') return true;
    return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

function syncOverflowControls() {
    if (typeof document === 'undefined') return;
    const actionsEl = document.getElementById('trackOverflowActions');
    const pauseBtn = document.getElementById('marqueePauseToggleBtn');
    const paused = isMarqueePaused();
    const reduced = isReducedMotionActive();
    document.documentElement?.classList?.toggle('is-marquee-paused', paused || (typeof document !== 'undefined' && document.hidden));
    if (pauseBtn) {
        pauseBtn.setAttribute('aria-pressed', String(paused));
        pauseBtn.textContent = paused ? 'Resume scroll' : 'Pause scroll';
        pauseBtn.setAttribute('title', paused ? 'Resume scrolling text' : 'Pause scrolling text');
        pauseBtn.hidden = reduced;
    }
    if (actionsEl) {
        const hasOverflow = [trackName, artistName, albumName].some(el => el?.classList?.contains('isMarquee'));
        const isEmpty = Boolean(document.querySelector('.playerDeck')?.classList?.contains('empty-deck'));
        actionsEl.hidden = isEmpty || !hasOverflow;
    }
}

export function setMarqueePaused(paused) {
    safeStorage.setItem(MARQUEE_PAUSE_KEY, paused ? 'true' : 'false');
    syncOverflowControls();
    recomputeMarquees();
    return paused;
}

export function openFullTrackTextDialog(track = store.state.currentTrack || store.state.allTracks?.[store.state.currentTrackIndex]) {
    if (typeof document === 'undefined') return false;
    const dialog = document.getElementById('trackFullTextDialog');
    const body = document.getElementById('trackFullTextBody');
    if (!dialog || !body) return false;
    const fields = [
        ['Title', track?.title || trackName?.textContent || '—'],
        ['Artist', track?.artist || artistName?.textContent || '—'],
        ['Album', track?.album || albumName?.textContent?.replace(/^Album:\s*/i, '') || '—'],
        ['Filename', track?.filename || track?.fullPath || '—'],
    ];
    const rows = fields.map(([label, val]) => {
        const row = document.createElement('div');
        row.className = 'trackFullTextRow';
        const dt = document.createElement('strong');
        dt.textContent = `${label}: `;
        const dd = document.createElement('span');
        dd.dir = 'auto';
        dd.textContent = String(val || '—');
        row.append(dt, dd);
        return row;
    });
    body.replaceChildren(...rows);
    marqueeTriggerEl = document.activeElement;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
    return true;
}

function applyMeasurement(el, span, clientW, scrollW, isRtl) {
    if (!el.isConnected || span.parentNode !== el) return;
    if (clientW <= 0) {
        el.classList.remove('isMarquee');
        span.style.removeProperty('--marquee-overflow');
        span.style.removeProperty('--marquee-duration');
        span.style.removeProperty('--marquee-sign');
        syncOverflowControls();
        return;
    }
    const overflow = scrollW - clientW;
    const active = overflow > 4;
    el.classList.toggle('isMarquee', active);
    if (active) {
        const dist = Math.ceil(overflow) + 12;
        const dur = Math.max(7, Math.min(28, Math.round((overflow / 26) * 2) + 4));
        span.style.setProperty('--marquee-overflow', `${dist}px`);
        span.style.setProperty('--marquee-duration', `${dur}s`);
        span.style.setProperty('--marquee-sign', isRtl ? '1' : '-1');
    } else {
        span.style.removeProperty('--marquee-overflow');
        span.style.removeProperty('--marquee-duration');
        span.style.removeProperty('--marquee-sign');
    }
    syncOverflowControls();
}

export function updateMarqueeText(el, text) {
    if (!el) return;
    const clean = text || '';
    el.title = clean;
    let span = el.firstElementChild;
    if (!span || !span.classList.contains('marqueeContent') || el.childElementCount !== 1) {
        span = document.createElement('span');
        span.className = 'marqueeContent';
        span.textContent = clean;
        el.replaceChildren(span);
    } else if (span.textContent !== clean) {
        span.textContent = clean;
    }
    const key = getElementKey(el);
    cancelScheduled(key);
    scheduleRead(key, () => {
        if (!el.isConnected || span.parentNode !== el) return;
        const clientW = el.clientWidth <= 0 ? 0 : el.clientWidth;
        const scrollW = clientW > 0 ? span.scrollWidth : 0;
        const isRtl = clientW > 0 && typeof getComputedStyle === 'function' && getComputedStyle(el).direction === 'rtl';
        scheduleWrite(key, () => applyMeasurement(el, span, clientW, scrollW, isRtl));
    });
}

export function recomputeMarquees() {
    cancelScheduled('marquee:batch');
    scheduleRead('marquee:batch', () => {
        const results = [];
        for (const el of [trackName, artistName, albumName]) {
            const span = el?.querySelector('.marqueeContent');
            if (!el || !span || !el.isConnected || span.parentNode !== el) continue;
            const clientW = el.clientWidth;
            const scrollW = clientW > 0 ? span.scrollWidth : 0;
            const isRtl = clientW > 0 && typeof getComputedStyle === 'function' && getComputedStyle(el).direction === 'rtl';
            results.push({ el, span, clientW, scrollW, isRtl });
        }
        if (results.length === 0) {
            scheduleWrite('marquee:batch', syncOverflowControls);
            return;
        }
        scheduleWrite('marquee:batch', () => {
            for (let i = 0; i < results.length; i++) {
                const { el, span, clientW, scrollW, isRtl } = results[i];
                applyMeasurement(el, span, clientW, scrollW, isRtl);
            }
        });
    });
}

export function bindMeasuredOverflowLifecycle() {
    if (typeof window === 'undefined' || listenersBound) return;
    listenersBound = true;
    const metaBox = document.querySelector('.trackMeta');
    const observer = window.ResizeObserver && metaBox ? new window.ResizeObserver(recomputeMarquees) : null;
    let started = false;
    const start = () => {
        if (started) return;
        started = true;
        if (metaBox?.isConnected) observer?.observe(metaBox);
        window.addEventListener('resize', recomputeMarquees, { passive: true });
        document.addEventListener('visibilitychange', syncOverflowControls);
    };
    const stop = () => {
        if (!started) return;
        started = false;
        observer?.disconnect();
        window.removeEventListener('resize', recomputeMarquees);
        document.removeEventListener('visibilitychange', syncOverflowControls);
        cancelScheduled('marquee:batch');
    };
    start();
    if (typeof document !== 'undefined' && document.fonts?.ready) {
        document.fonts.ready.then(recomputeMarquees).catch(() => {});
    }
    store.subscribe('workspace:change', recomputeMarquees);
    store.subscribe('motion:change', () => { syncOverflowControls(); recomputeMarquees(); });
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', start);

    document.getElementById('marqueePauseToggleBtn')?.addEventListener('click', () => {
        setMarqueePaused(!isMarqueePaused());
    });
    document.getElementById('trackFullTextBtn')?.addEventListener('click', () => {
        openFullTrackTextDialog();
    });
    document.getElementById('trackFullTextCopyBtn')?.addEventListener('click', async () => {
        const text = document.getElementById('trackFullTextBody')?.innerText || '';
        try {
            await navigator.clipboard?.writeText(text);
            showToast('Track info copied');
        } catch (_) {}
    });
    document.getElementById('trackFullTextDialog')?.addEventListener('close', () => {
        marqueeTriggerEl?.focus?.({ preventScroll: true });
        marqueeTriggerEl = null;
    });
    syncOverflowControls();
}

bindMeasuredOverflowLifecycle();
