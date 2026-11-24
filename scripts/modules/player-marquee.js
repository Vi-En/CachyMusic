// Track title rendering and responsive marquee measurement.
import { trackName, artistName, albumName } from './ui-elements.js';

function measure(el, span) {
    if (!el.isConnected || span.parentNode !== el) return;
    const overflow = span.scrollWidth - el.clientWidth;
    el.classList.toggle('isMarquee', overflow > 6);
    if (overflow > 6) {
        span.style.setProperty('--marquee-overflow', `${Math.ceil(overflow) + 8}px`);
        span.style.setProperty('--marquee-duration', `${Math.max(6, Math.min(22, Math.round(overflow / 24) + 4))}s`);
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
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', start);
}
