// Shared main/mini seek control. Owns pointer capture and pending animation frames.
export function createProgressScrubber({duration, position, identity, seek, paint, dragging, hover, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame}) {
    let active = null, dragFrame = null, hoverFrame = null, latestX = null;
    const disposers = [];
    const percent = (el, x) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && Number.isFinite(x) ? Math.max(0, Math.min(1, (x - rect.left) / rect.width)) : null;
    };
    function renderDrag() {
        if (!active || active.identity !== identity()) return;
        const pct = percent(active.el, latestX);
        if (pct !== null) paint(pct, active.duration, active.el);
    }
    function finish(commit, x) {
        if (!active) return;
        const old = active;
        active = null;
        if (dragFrame !== null) cancelFrame(dragFrame);
        dragFrame = null;
        old.el.classList.remove('dragging');
        dragging(false);
        try { if (old.el.hasPointerCapture?.(old.pointer)) old.el.releasePointerCapture(old.pointer); } catch (_) {}
        const pct = percent(old.el, x);
        if (commit && pct !== null && identity() === old.identity && duration() > 0) seek(pct * duration());
        else { const dur = duration(); paint(dur > 0 ? Math.min(1, Math.max(0, position() / dur)) : 0, dur, old.el); }
    }
    function attach(el, withHover = false) {
        if (!el) return;
        const on = (name, fn) => { el.addEventListener(name, fn); disposers.push(() => el.removeEventListener(name, fn)); };
        on('pointerdown', e => {
            if (active || (e.pointerType === 'mouse' && e.button !== 0) || !(duration() > 0) || percent(el, e.clientX) === null) return;
            active = {el, pointer:e.pointerId, identity:identity(), duration:duration()};
            latestX = e.clientX; dragging(true); el.classList.add('dragging');
            try { el.setPointerCapture?.(e.pointerId); } catch (_) {}
            renderDrag();
        });
        const owns = e => active?.el === el && active.pointer === e.pointerId;
        on('pointermove', e => {
            if (!owns(e)) return;
            latestX = e.clientX;
            if (dragFrame === null) dragFrame = requestFrame(() => { dragFrame = null; renderDrag(); });
        });
        on('pointerup', e => { if (owns(e)) finish(true, e.clientX); });
        for (const type of ['pointercancel','lostpointercapture']) on(type, e => { if (owns(e)) finish(false); });
        on('keydown', e => {
            const dur = duration();
            const delta = {ArrowRight:5,ArrowUp:5,ArrowLeft:-5,ArrowDown:-5,PageUp:dur/10,PageDown:-dur/10};
            if (!Object.hasOwn(delta, e.key) && e.key !== 'Home' && e.key !== 'End') return;
            e.preventDefault(); e.stopPropagation();
            if (dur > 0 && !active) seek(e.key === 'Home' ? 0 : e.key === 'End' ? dur : Math.max(0, Math.min(dur, position() + delta[e.key])));
        });
        if (withHover) {
            let hoverX;
            on('mousemove', e => {
                hoverX = e.clientX;
                if (hoverFrame === null) hoverFrame = requestFrame(() => {
                    hoverFrame = null;
                    const pct = percent(el, hoverX), dur = duration();
                    hover(pct !== null && dur > 0 ? pct : null, dur);
                });
            });
            on('mouseleave', () => { if (hoverFrame !== null) cancelFrame(hoverFrame); hoverFrame = null; hover(null, 0); });
        }
    }
    return {attach, cancel() {finish(false); if (hoverFrame !== null) cancelFrame(hoverFrame); hoverFrame = null; hover(null,0);}, dispose() {this.cancel(); for (const remove of disposers.splice(0)) remove();}};
}
