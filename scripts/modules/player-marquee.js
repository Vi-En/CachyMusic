// Track title rendering and responsive batched marquee measurement (zero interleaved reflows).
import { store } from './state.js';
import { trackName, artistName, albumName } from './ui-elements.js';
import { scheduleRead, scheduleWrite } from './frame-scheduler.js';

function applyMeasurement(el, span, clientW, scrollW) {
    if (!el.isConnected || span.parentNode !== el) return;
    if (clientW <= 0) {
        el.classList.remove('isMarquee');
        return;
    }
    const overflow = scrollW - clientW;
    el.classList.toggle('isMarquee', overflow > 4);
    if (overflow > 4) {
        span.style.setProperty('--marquee-overflow', `${Math.ceil(overflow) + 12}px`);
        span.style.setProperty('--marquee-duration', `${Math.max(7, Math.min(28, Math.round((overflow / 26) * 2) + 4))}s`);
    } else {
        span.style.removeProperty('--marquee-overflow');
        span.style.removeProperty('--marquee-duration');
    }
}

export function updateMarqueeText(el, text) {
    if (!el) return;
    const clean = text || '';
    el.title = clean;
    const span = document.createElement('span');
    span.className = 'marqueeContent';
    span.textContent = clean;
    el.replaceChildren(span);
    const key = `marquee:${el.id || 'el'}`;
    scheduleRead(key, () => {
        if (!el.isConnected || span.parentNode !== el) return;
        const clientW = el.clientWidth <= 0 ? 0 : el.clientWidth;
        const scrollW = clientW > 0 ? span.scrollWidth : 0;
        scheduleWrite(key, () => applyMeasurement(el, span, clientW, scrollW));
    });
}

export function recomputeMarquees() {
    scheduleRead('marquee:batch', () => {
        const results = [];
        for (const el of [trackName, artistName, albumName]) {
            const span = el?.querySelector('.marqueeContent');
            if (!el || !span || !el.isConnected || span.parentNode !== el) continue;
            const clientW = el.clientWidth;
            const scrollW = clientW > 0 ? span.scrollWidth : 0;
            results.push({ el, span, clientW, scrollW });
        }
        if (results.length === 0) return;
        scheduleWrite('marquee:batch', () => {
            for (let i = 0; i < results.length; i++) {
                const { el, span, clientW, scrollW } = results[i];
                applyMeasurement(el, span, clientW, scrollW);
            }
        });
    });
}

if (typeof window !== 'undefined') {
    const metaBox = document.querySelector('.trackMeta');
    const observer = window.ResizeObserver && metaBox ? new ResizeObserver(recomputeMarquees) : null;
    const start = () => { observer?.observe(metaBox); window.addEventListener('resize', recomputeMarquees, { passive: true }); };
    const stop = () => { observer?.disconnect(); window.removeEventListener('resize', recomputeMarquees); };
    start();
    if (typeof document !== 'undefined' && document.fonts?.ready) {
        document.fonts.ready.then(recomputeMarquees).catch(() => {});
    }
    store.subscribe('workspace:change', recomputeMarquees);
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', start);
}
