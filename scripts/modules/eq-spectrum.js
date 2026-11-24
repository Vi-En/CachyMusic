// Read the existing pre-DSP analyser. This view does not own audio nodes,
// create a context, change FFT settings or affect the playback path.
export const EQ_PLOT_INSETS = Object.freeze({left: 42, right: 12, top: 10, bottom: 19});
export const SPECTRUM_MIN_HZ = 20;
export const SPECTRUM_MAX_HZ = 20000;
export const SPECTRUM_FLOOR_DB = -90;
export const SPECTRUM_CEILING_DB = -25;

export function makeSpectrumBands(sampleRate, binCount, count = 96) {
    const hzPerBin = sampleRate / (2 * binCount);
    const ratio = SPECTRUM_MAX_HZ / SPECTRUM_MIN_HZ;
    return Array.from({length: count}, (_, i) => {
        const lo = SPECTRUM_MIN_HZ * ratio ** (i / count);
        const hi = SPECTRUM_MIN_HZ * ratio ** ((i + 1) / count);
        if (lo >= sampleRate / 2 || hi < hzPerBin || binCount < 2) return null;
        const start = Math.max(1, Math.min(binCount - 1, Math.floor(lo / hzPerBin)));
        return [start, Math.min(binCount, Math.max(start + 1, Math.ceil(hi / hzPerBin)))];
    });
}

export function spectrumLevel(data, band) {
    if (!band) return 0;
    let peak = -Infinity;
    for (let i = band[0]; i < band[1]; i++) if (data[i] > peak) peak = data[i];
    return Math.max(0, Math.min(1, (peak - SPECTRUM_FLOOR_DB) / (SPECTRUM_CEILING_DB - SPECTRUM_FLOOR_DB)));
}

export function createSpectrumView({eqCanvas, desktopCanvas, status, getSignal, host = window, doc = document}) {
    const targets = [eqCanvas, desktopCanvas].filter(Boolean);
    let frame = null, last = -Infinity, bins = null, bands = null, signature = '', disposed = false;
    let source = null, pageActive = true, shownCanvas = null;
    const contexts = new WeakMap();
    const mobile = host.matchMedia('(max-width: 768px), (max-height: 500px) and (orientation: landscape)');
    const reduced = host.matchMedia('(prefers-reduced-motion: reduce)');
    function visible(canvas) {
        return canvas && canvas.getClientRects().length && canvas.clientWidth > 0 && canvas.clientHeight > 0;
    }
    function clear(canvas) {
        const ctx = canvas && contexts.get(canvas);
        if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }
    function setStatus(text) { if (status && status.textContent !== text) status.textContent = text; }
    function draw(canvas, data, config) {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        const dpr = Math.min(2, host.devicePixelRatio || 1);
        const width = Math.round(w * dpr), height = Math.round(h * dpr);
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        contexts.set(canvas, ctx);
        ctx.setTransform(width / w, 0, 0, height / h, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = host.getComputedStyle(canvas).getPropertyValue('--accent-color').trim() || '#888';
        ctx.globalAlpha = canvas === eqCanvas ? .23 : .58;
        const pad = canvas === eqCanvas ? EQ_PLOT_INSETS : {left: 0, right: 0, top: 0, bottom: 0};
        const plotW = Math.max(1, w - pad.left - pad.right);
        const plotH = Math.max(1, h - pad.top - pad.bottom);
        const step = plotW / config.length;
        for (let i = 0; i < config.length; i++) {
            const level = spectrumLevel(data, config[i]);
            if (level <= 0) continue;
            const bar = level * plotH;
            ctx.fillRect(pad.left + i * step, h - pad.bottom - bar, Math.max(.5, step - 1), bar);
        }
        ctx.globalAlpha = 1;
    }
    function stop() {
        if (frame !== null) host.cancelAnimationFrame(frame);
        frame = null; last = -Infinity; source = null; shownCanvas = null;
        for (const canvas of targets) clear(canvas);
    }
    function tick(now) {
        frame = null;
        if (disposed || !pageActive || doc.hidden) { stop(); return; }
        const canvas = visible(eqCanvas) ? eqCanvas : visible(desktopCanvas) ? desktopCanvas : null;
        if (!canvas) { stop(); return; }
        if (shownCanvas !== canvas) {
            clear(shownCanvas); shownCanvas = canvas; last = -Infinity;
        }
        const signal = getSignal();
        if (!signal?.analyser || signal.context?.state !== 'running') {
            stop(); setStatus(signal?.reason || 'Spectrum unavailable'); return;
        }
        const interval = 1000 / (reduced.matches ? 10 : mobile.matches ? 24 : 30);
        if (source !== signal.analyser) { source = signal.analyser; last = -Infinity; }
        if (now - last >= interval) {
            const analyser = signal.analyser;
            const next = `${signal.context.sampleRate}:${analyser.frequencyBinCount}`;
            if (signature !== next) {
                signature = next; bins = new Float32Array(analyser.frequencyBinCount);
                bands = makeSpectrumBands(signal.context.sampleRate, bins.length);
            }
            try {
                analyser.getFloatFrequencyData(bins);
                draw(canvas, bins, bands);
                setStatus(`Input spectrum · ${Math.round(signal.context.sampleRate / analyser.fftSize)} Hz FFT bins`);
            } catch (_) { stop(); setStatus('Spectrum unavailable'); return; }
            last = now;
        }
        frame = host.requestAnimationFrame(tick);
    }
    function refresh() {
        if (disposed) return;
        if (!pageActive || doc.hidden || !targets.some(visible)) { stop(); return; }
        if (frame === null) frame = host.requestAnimationFrame(tick);
    }
    const resize = new host.ResizeObserver(refresh);
    targets.forEach(canvas => resize.observe(canvas));
    doc.addEventListener('visibilitychange', refresh);
    const hide = () => { pageActive = false; stop(); };
    const show = () => { pageActive = true; refresh(); };
    host.addEventListener('pagehide', hide);
    host.addEventListener('pageshow', show);
    return {refresh, stop, dispose() {
        disposed = true; stop(); resize.disconnect();
        doc.removeEventListener('visibilitychange', refresh);
        host.removeEventListener('pagehide', hide);
        host.removeEventListener('pageshow', show);
    }};
}
