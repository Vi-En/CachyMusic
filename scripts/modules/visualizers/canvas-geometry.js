import { store } from '../state.js';

export function updateAndDrawShockwaves(ctx, dt) {
    const shockwaveRings = store.state.shockwaveRings;
    if (shockwaveRings.length === 0) return;
    ctx.save();
    for (let i = shockwaveRings.length - 1; i >= 0; i--) {
        const ring = shockwaveRings[i];
        ring.r += ring.speed * dt;
        const progress = ring.r / ring.maxR;
        if (progress >= 1.0) {
            shockwaveRings.splice(i, 1);
            continue;
        }
        const currentAlpha = ring.alpha * (1.0 - progress);
        ctx.strokeStyle = `rgba(255, 255, 255, ${currentAlpha})`;
        ctx.lineWidth = 1.6 * (1.0 - progress * 0.5);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

export function drawSplinePath(ctx, points) {
    if (!points || points.length === 0) return;
    if (points.length === 1) {
        ctx.lineTo(points[0].x, points[0].y);
        return;
    }
    if (points.length === 2) {
        ctx.lineTo(points[1].x, points[1].y);
        return;
    }
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
}
