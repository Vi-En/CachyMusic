// Shared keyboard focus policy for the existing modal components. No change to
// their open/close commands or their application-specific cleanup callbacks.
const SELECTOR = '[role="dialog"][aria-modal="true"]';
const CONTROLS = 'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]';
export function visibleDialog(doc = document) {
    const dialogs = [...doc.querySelectorAll(SELECTOR)].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    // DOM order is the tie-breaker for overlays with the same stacking level.
    return dialogs.sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0)).at(-1) || null;
}
function tabbable(dialog) {
    return [...dialog.querySelectorAll(CONTROLS)].filter(el => !el.disabled && el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
}
export function installModalFocus(doc = document) {
    let active = null;
    const origins = new WeakMap();
    let lastOutside = doc.activeElement;
    const focus = el => el?.focus({preventScroll:true});
    const sync = () => {
        const next = visibleDialog(doc);
        if (next === active) return;
        const previous = active;
        active = next;
        if (previous && !previous.getClientRects().length) {
            const origin = origins.get(previous);
            origins.delete(previous);
            if (origin?.isConnected && origin.getClientRects().length && (!next || next.contains(origin))) focus(origin);
        }
        if (next) {
            if (!origins.has(next)) origins.set(next, previous?.contains(doc.activeElement) ? doc.activeElement : lastOutside);
            if (!next.contains(doc.activeElement)) {
                if (!next.hasAttribute('tabindex')) next.tabIndex = -1;
                focus(tabbable(next)[0] || next);
            }
        }
    };
    const onFocus = e => {
        if (!active) lastOutside = e.target;
        else if (!active.contains(e.target) && visibleDialog(doc) === active) focus(tabbable(active)[0] || active);
    };
    const onKey = e => {
        if (e.key !== 'Tab' || !active) return;
        const controls = tabbable(active);
        const index = controls.indexOf(doc.activeElement);
        if (!controls.length || index === -1 || (e.shiftKey ? index===0 : index===controls.length-1)) {
            e.preventDefault();
            focus(controls[e.shiftKey ? controls.length-1 : 0] || active);
        }
    };
    const observer = new MutationObserver(sync);
    // Observe only overlay visibility changes, not animated descendants.
    for (const dialog of doc.querySelectorAll(SELECTOR)) observer.observe(dialog,{attributes:true,attributeFilter:['style','class','hidden']});
    doc.addEventListener('focusin',onFocus);
    doc.addEventListener('keydown',onKey,true);
    sync();
    return () => {observer.disconnect();doc.removeEventListener('focusin',onFocus);doc.removeEventListener('keydown',onKey,true);};
}
