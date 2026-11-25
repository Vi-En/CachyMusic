// Compact theme-matched segmented-bar and liquid-wave strip renderer for mobile mini-player.
import { getThemeNotificationProfile } from '../theme-catalog.js';
import { NUM_BANDS } from '../state.js';

const MAX_COLS = 28;
const smoothCols = new Float32Array(MAX_COLS);
const peakCols = new Float32Array(MAX_COLS);
const wavePoints = Array.from({ length: 24 }, () => ({ x: 0, y: 0 }));

export function resetMiniThemeStrip() {
    smoothCols.fill(0);
    peakCols.fill(0);
}

function drawSegmentedStrip(ctx, width, height, bands, playing, dt, beatPulse, profile) {
    const colCount = Math.max(12, Math.min(MAX_COLS, Math.floor(width / 10)));
    const padX = 2;
    const usableW = Math.max(1, width - padX * 2);
    const colStep = usableW / colCount;
    const barW = Math.max(2, colStep - Math.max(1.5, colStep * 0.28));
    const segments = 5;
    const segGap = 1.5;
    const usableH = Math.max(8, height - 2);
    const segH = Math.max(1.5, (usableH - (segments - 1) * segGap) / segments);
    const attack = 1 - Math.exp(-26 * dt);
    const decay = 1 - Math.exp(-9 * dt);

    for (let c = 0; c < colCount; c++) {
        const bIdx = Math.min(NUM_BANDS - 1, Math.floor((c / colCount) * (NUM_BANDS * 0.92)));
        const raw = playing ? Math.min(1, Math.max(0, (bands[bIdx] || 0) * (1 + beatPulse * 0.14))) : 0;
        const rate = raw > smoothCols[c] ? attack : decay;
        smoothCols[c] += (raw - smoothCols[c]) * rate;
        if (smoothCols[c] > peakCols[c]) {
            peakCols[c] = smoothCols[c];
        } else {
            peakCols[c] = Math.max(smoothCols[c], peakCols[c] - dt * 0.65);
        }

        const x = padX + c * colStep + (colStep - barW) * 0.5;
        const activeSegs = Math.round(smoothCols[c] * segments);
        const peakSeg = Math.min(segments - 1, Math.floor(peakCols[c] * segments));

        // Base unlit guide tick so strip remains anchored to theme cleanly
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = profile.secondary;
        ctx.fillRect(x, height - segH - 1, barW, segH);

        for (let s = 0; s < activeSegs; s++) {
            const y = height - 1 - (s + 1) * segH - s * segGap;
            ctx.globalAlpha = s >= segments - 2 ? 0.96 : 0.72 + s * 0.06;
            ctx.fillStyle = s === segments - 1 ? profile.secondary : profile.accent;
            ctx.fillRect(x, y, barW, segH);
        }

        if (playing && peakCols[c] > 0.08 && peakSeg >= activeSegs) {
            const py = height - 1 - (peakSeg + 1) * segH - peakSeg * segGap;
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = profile.secondary;
            ctx.fillRect(x, py, barW, Math.max(1.2, segH * 0.65));
        }
    }
    ctx.globalAlpha = 1;
}

function drawLiquidStrip(ctx, width, height, bands, playing, now, dt, beatPulse, profile) {
    const count = wavePoints.length;
    const step = width / (count - 1);
    const phase = (now || 0) * 0.0024;
    const attack = 1 - Math.exp(-22 * dt);
    const decay = 1 - Math.exp(-8 * dt);
    const maxAmp = Math.max(6, height - 3);

    // Undertow wave
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let i = 0; i < count; i++) {
        const bIdx = Math.min(NUM_BANDS - 1, Math.floor((i / (count - 1)) * (NUM_BANDS * 0.55)));
        const target = playing ? Math.min(1, (bands[bIdx] || 0) * (0.78 + beatPulse * 0.2)) : 0;
        const rate = target > smoothCols[i] ? attack : decay;
        smoothCols[i] += (target - smoothCols[i]) * rate;
        const ripple = playing ? (Math.sin(phase * 1.15 + i * 0.45) * 1.1) : 0;
        const y = Math.max(2, height - 2 - smoothCols[i] * maxAmp * 0.78 - ripple);
        wavePoints[i].x = i * step;
        wavePoints[i].y = y;
    }
    ctx.lineTo(wavePoints[0].x, wavePoints[0].y);
    for (let i = 0; i < count - 1; i++) {
        const mx = (wavePoints[i].x + wavePoints[i + 1].x) * 0.5;
        const my = (wavePoints[i].y + wavePoints[i + 1].y) * 0.5;
        ctx.quadraticCurveTo(wavePoints[i].x, wavePoints[i].y, mx, my);
    }
    ctx.lineTo(width, wavePoints[count - 1].y);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = profile.secondary;
    ctx.fill();

    // Primary foreground wave
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let i = 0; i < count; i++) {
        const bIdx = Math.min(NUM_BANDS - 1, Math.floor((i / (count - 1)) * (NUM_BANDS * 0.88)));
        const raw = playing ? Math.min(1, (bands[bIdx] || 0) * (0.95 + beatPulse * 0.16)) : 0;
        const ripple = playing ? (Math.cos(phase * 1.5 - i * 0.55) * 1.2) : 0;
        const y = Math.max(1.5, height - 1.5 - Math.max(smoothCols[i] * 0.45, raw) * maxAmp - ripple);
        wavePoints[i].x = i * step;
        wavePoints[i].y = y;
    }
    ctx.lineTo(wavePoints[0].x, wavePoints[0].y);
    for (let i = 0; i < count - 1; i++) {
        const mx = (wavePoints[i].x + wavePoints[i + 1].x) * 0.5;
        const my = (wavePoints[i].y + wavePoints[i + 1].y) * 0.5;
        ctx.quadraticCurveTo(wavePoints[i].x, wavePoints[i].y, mx, my);
    }
    ctx.lineTo(width, wavePoints[count - 1].y);
    ctx.lineTo(width, height);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, profile.accent);
    grad.addColorStop(1, profile.secondary);
    ctx.globalAlpha = 0.52;
    ctx.fillStyle = grad;
    ctx.fill();

    // Crisp crest stroke
    ctx.beginPath();
    ctx.moveTo(wavePoints[0].x, wavePoints[0].y);
    for (let i = 0; i < count - 1; i++) {
        const mx = (wavePoints[i].x + wavePoints[i + 1].x) * 0.5;
        const my = (wavePoints[i].y + wavePoints[i + 1].y) * 0.5;
        ctx.quadraticCurveTo(wavePoints[i].x, wavePoints[i].y, mx, my);
    }
    ctx.lineTo(width, wavePoints[count - 1].y);
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = profile.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
}

export function drawMiniThemeStrip(ctx, width, height, bands, playing, now, dt, beatPulse, themeId) {
    if (!ctx || width <= 0 || height <= 0) return;
    const profile = getThemeNotificationProfile(themeId);
    if (profile.style === 'liquid') {
        drawLiquidStrip(ctx, width, height, bands, playing, now, dt, beatPulse, profile);
    } else {
        drawSegmentedStrip(ctx, width, height, bands, playing, dt, beatPulse, profile);
    }
}
