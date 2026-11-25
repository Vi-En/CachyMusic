// Track title rendering and responsive marquee measurement.
import { store } from './state.js';
import { trackName, artistName, albumName } from './ui-elements.js';

function measure(el, span) {
    if (!el.isConnected || span.parentNode !== el) return;
    if (el.clientWidth <= 0) {
        el.classList.remove('isMarquee');
        return;
    }
    const overflow = span.scrollWidth - el.clientWidth;
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
    el.title = text || '';
    const span = document.createElement('span');
    span.className = 'marqueeContent';
    span.textContent = text || '';
    el.replaceChildren(span);
    requestAnimationFrame(() => measure(el, span));
}
export function recomputeMarquees() {
    for (const el of [trackName, artistName, albumName]) {
        const span = el?.querySelector('.marqueeContent');
        if (span) measure(el, span);
    }
}
// The player shell lasts for the document lifetime.
if (typeof window !== 'undefined') {
    const metaBox = document.querySelector('.trackMeta');
    const observer = window.ResizeObserver && metaBox ? new ResizeObserver(recomputeMarquees) : null;
    const start = () => { observer?.observe(metaBox); window.addEventListener('resize', recomputeMarquees, {passive: true}); };
    const stop = () => { observer?.disconnect(); window.removeEventListener('resize', recomputeMarquees); };
    start();
    if (typeof document !== 'undefined' && document.fonts?.ready) {
        document.fonts.ready.then(recomputeMarquees).catch(() => {});
    }
    store.subscribe('workspace:change', () => requestAnimationFrame(recomputeMarquees));
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', start);
}
