// Shared drawing primitives for the five quieter editions. All dimensions are
// relative to the circular record; callers supply only existing analyser data.
const TAU = Math.PI * 2;
export function circle(ctx, r, fill, stroke, lineWidth = .008) {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
}
export function ring(ctx, r, color, lineWidth = .008, start = 0, end = TAU) {
    ctx.beginPath(); ctx.arc(0, 0, r, start, end);
    ctx.lineWidth = lineWidth; ctx.strokeStyle = color; ctx.stroke();
}
export function bandLevel(bands, index, count, playing, fallback = 0) {
    if (!playing) return 0;
    const value = bands?.length ? bands[Math.min(bands.length - 1, Math.floor(index * bands.length / count))] : fallback;
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
export function radialBars(ctx, bands, playing, count, inner, travel, color, fallback = 0, width = .012) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + TAU * i / count;
        const level = bandLevel(bands, i, count, playing, fallback);
        const outer = inner + .012 + travel * level;
        const x = Math.cos(angle), y = Math.sin(angle);
        ctx.moveTo(x * inner, y * inner); ctx.lineTo(x * outer, y * outer);
    }
    ctx.stroke();
}
export function label(ctx, text, y, color, size = .07, font = 'system-ui, sans-serif') {
    ctx.fillStyle = color; ctx.font = `500 ${size}px ${font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, y);
}
export function drawDial(ctx, width, height, draw) {
    const r = Math.min(width, height) / 2;
    if (r <= 0) return;
    ctx.save();
    try { ctx.translate(width / 2, height / 2); ctx.scale(r, r); ctx.shadowBlur = 0; draw(ctx); }
    finally { ctx.restore(); }
}
// Small dock uses the same design, without duplicating art or maintaining a second scene.
export function createDock(drawCore) {
    return function drawDockScene(ctx, cx, cy, scale, playing, now, dt, beat, snare, bass, mid, treble, bands) {
        const size = 78 * scale;
        ctx.save();
        try { ctx.translate(cx - size / 2, cy - size / 2); drawCore(ctx, size, size, playing, now, dt, beat, snare, bass, mid, treble, 1, bands); }
        finally { ctx.restore(); }
    };
}
