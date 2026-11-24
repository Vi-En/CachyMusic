import { store } from '../state.js';
import { getActiveTheme } from '../ui-elements.js';

export function updateAndDrawParticles(ctx, width, height, dt, impulse) {
    const currentTheme = getActiveTheme();
    if (currentTheme !== 'default') {
        return;
    }
    const particles = store.state.particles;

    ctx.save();
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Velocity & Audio Updraft
        p.y += p.vy * dt * 60;
        p.x += p.vx * dt * 60;
        p.rot += p.vRot;

        if (impulse > 0.4) {
            p.y -= (impulse * 0.8) * dt * 60;
            p.x += (Math.sin(p.y * 10 + i) * 0.04) * impulse;
        }

        // Screen boundary reset
        if (p.y < 0) {
            p.y = 1.0;
            p.x = Math.random();
        }
        if (p.x < 0) p.x = 1.0;
        if (p.x > 1.0) p.x = 0;

        const px = p.x * width;
        const py = p.y * height;
        const dynamicAlpha = Math.min(1.0, p.alpha * (0.8 + Math.min(1.0, impulse) * 0.6));

        ctx.fillStyle = `rgba(255, 255, 255, ${dynamicAlpha})`;
        if (i % 2 === 0) {
            ctx.beginPath();
            ctx.ellipse(px, py, p.size * 1.2, p.size * 0.6, p.rot, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const cos = Math.cos(p.rot);
            const sin = Math.sin(p.rot);
            const s1 = p.size * 1.3;
            const s2 = p.size * 0.8;
            ctx.beginPath();
            ctx.moveTo(px + sin * s1, py - cos * s1);
            ctx.lineTo(px + cos * s2, py + sin * s2);
            ctx.lineTo(px - sin * s1, py + cos * s1);
            ctx.lineTo(px - cos * s2, py - sin * s2);
            ctx.closePath();
            ctx.fill();
        }
    }
    ctx.restore();
}
