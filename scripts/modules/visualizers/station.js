// Station — detailed scene and companion dock illustration.
import { emitTurntableShockwave, store } from '../state.js';
import { drawInstrumentRim } from './instrument-rim.js';
let euclidRotation = 0;
function drawScene(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
    if (!ctx || width === 0 || height === 0) return;
    const turntableShockwaves = store.state.turntableShockwaves;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) * 0.48;
    const hubRadius = Math.min(width, height) * 0.20;
    const s = hubRadius / 54;

    if (playing) {
        euclidRotation += dt * (0.65 + beatPulse * 1.6 + smoothBass * 0.8) * fidelity;
    } else {
        euclidRotation += dt * 0.18 * fidelity;
    }

    // 1. Acoustic Shockwaves (Portal Sun-Gold & Ruby)
    if (playing && fidelity > 0.15) {
        if (beatPulse > 0.38 && Math.random() < 0.45) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * fidelity, '#fbbf24');
        } else if (snarePulse > 0.42 && Math.random() < 0.40) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.80 * fidelity, '#e11d48');
        }
    }
    for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
        const sw = turntableShockwaves[i];
        sw.r += sw.speed * dt;
        const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
        if (prog >= 1.0) { turntableShockwaves.splice(i, 1); continue; }
        const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
        ctx.save();
        ctx.strokeStyle = sw.color === '#e11d48' ? `rgba(225, 29, 72, ${currentAlpha})` : `rgba(251, 191, 36, ${currentAlpha})`;
        ctx.shadowColor = sw.color || '#fbbf24';
        ctx.shadowBlur = (8 + beatPulse * 8 * (0.35 + 0.65 * fidelity)) * s;
        ctx.lineWidth = Math.max(1.0, (2.0 + beatPulse * 1.2) * (1.0 - prog * 0.5));
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // =====================================================================
    // FULL-PLATTER EUCLID PORTAL ARCHITECTURE: 16 Chevrons & Stargate Dial Wheel
    // =====================================================================
    if (fidelity > 0.005) {
        ctx.save();
        ctx.globalAlpha = fidelity;
        ctx.translate(centerX, centerY);

        // Ancient basalt stone platter
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#041014';
        ctx.fill();

        // Outer Ancient Dial Rim (Double Gold Border)
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius * 0.94, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(251, 191, 36, ${0.45 + beatPulse * 0.45})`;
        ctx.lineWidth = Math.max(1.8, 2.5 * s);
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = (10 + beatPulse * 16) * s;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, maxRadius * 0.86, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(20, 184, 166, 0.35)`;
        ctx.lineWidth = Math.max(1.0, 1.4 * s);
        ctx.stroke();

        // 16 Glowing Glyph Chevrons around the perimeter
        ctx.save();
        ctx.rotate(euclidRotation * 0.3);
        const chevrons = ['✦', 'ᚱ', 'ᛟ', 'ᚦ', 'ᚷ', 'ᛞ', 'ᚲ', '✦', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛝ', 'ᛟ'];
        const activeChevron = Math.floor(((now * 0.002) % 1) * 16);
        ctx.font = `${Math.max(10, Math.round(11 * s))}px serif, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let ch = 0; ch < 16; ch++) {
            const chAng = (ch * Math.PI * 2) / 16;
            ctx.save();
            ctx.rotate(chAng);
            ctx.translate(0, -maxRadius * 0.90);

            const isLit = (ch === activeChevron) || (beatPulse > 0.45 && ch % 2 === 0);
            if (isLit) {
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#fbbf24';
                ctx.shadowBlur = (14 + beatPulse * 14) * s;
            } else {
                ctx.fillStyle = `rgba(251, 191, 36, 0.45)`;
                ctx.shadowBlur = 0;
            }
            ctx.fillText(chevrons[ch], 0, 0);
            ctx.restore();
        }
        ctx.restore();

        // Concentric Carved Stone Dial Rings
        ctx.save();
        ctx.rotate(-euclidRotation * 0.2);
        for (let dr = 0; dr < 3; dr++) {
            const drR = hubRadius * 1.25 + dr * (maxRadius * 0.22);
            ctx.beginPath();
            ctx.arc(0, 0, drR, 0, Math.PI * 2);
            ctx.strokeStyle = dr % 2 === 0 ? `rgba(20, 184, 166, 0.22)` : `rgba(251, 191, 36, 0.25)`;
            ctx.setLineDash([Math.round(8 * s), Math.round(12 * s)]);
            ctx.stroke();
        }
        ctx.restore();
        ctx.restore();
    }

    // 2. Atmospheric Teal Hub Platter
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#061a20';
    ctx.fill();
    ctx.strokeStyle = `rgba(20, 184, 166, ${0.45 + snarePulse * 0.35})`;
    ctx.lineWidth = Math.max(1.2, 1.6 * s);
    ctx.stroke();
    ctx.restore();

    // 3. Gigantic Glowing Golden Circular Portal Halo
    const haloR = hubRadius * (0.80 + beatPulse * 0.28 + smoothBass * 0.16);
    ctx.save();
    ctx.translate(centerX, centerY);

    const haloGlow = ctx.createRadialGradient(0, 0, haloR * 0.5, 0, 0, haloR * 1.35);
    haloGlow.addColorStop(0, `rgba(251, 191, 36, ${0.12 + beatPulse * 0.20})`);
    haloGlow.addColorStop(0.65, `rgba(251, 191, 36, ${0.28 + beatPulse * 0.32})`);
    haloGlow.addColorStop(1, 'rgba(6, 26, 32, 0)');
    ctx.fillStyle = haloGlow;
    ctx.beginPath();
    ctx.arc(0, 0, haloR * 1.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.rotate(euclidRotation * 0.7 * fidelity);
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, Math.PI * 2);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = Math.max(1.8, (2.6 + beatPulse * 1.8) * s);
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = (12 + beatPulse * 18 * (0.35 + 0.65 * fidelity)) * s;
    ctx.stroke();

    ctx.rotate(-euclidRotation * 1.4 * fidelity);
    ctx.beginPath();
    ctx.arc(0, 0, haloR * 1.14, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(254, 240, 138, ${0.55 + snarePulse * 0.35})`;
    ctx.lineWidth = Math.max(1.0, 1.3 * s);
    ctx.setLineDash([Math.round(4 * s), Math.round(7 * s)]);
    ctx.stroke();
    ctx.restore();

    // 4. Hovering Atlas Diamond Monolith in Center of Halo
    const diamondScale = s * (1.0 + beatPulse * 0.35);
    const dw = 14 * diamondScale;
    const dh = 26 * diamondScale;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, -dh);
    ctx.lineTo(dw, 0);
    ctx.lineTo(0, dh);
    ctx.lineTo(-dw, 0);
    ctx.closePath();
    ctx.fillStyle = '#0a232b';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -dh);
    ctx.lineTo(dw, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = `rgba(225, 29, 72, ${0.75 + beatPulse * 0.25})`;
    ctx.fill();

    ctx.strokeStyle = beatPulse > 0.4 ? '#ffffff' : '#fbbf24';
    ctx.lineWidth = Math.max(1.0, 1.4 * s);
    ctx.shadowColor = '#e11d48';
    ctx.shadowBlur = (6 + beatPulse * 10) * s;
    ctx.stroke();

    const emberR = (3 + beatPulse * 5) * s;
    ctx.beginPath();
    ctx.arc(0, 0, emberR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 10 * s;
    ctx.fill();
    ctx.restore();

    // 5. Orbiting Mineral Ruby Fragments
    ctx.save();
    ctx.rotate(euclidRotation * 0.5 * fidelity);
    for (let m = 0; m < 5; m++) {
        const mAngle = (m * Math.PI * 2) / 5;
        const mDist = haloR * (0.65 + (m % 2) * 0.25);
        const mx = Math.cos(mAngle) * mDist;
        const my = Math.sin(mAngle) * mDist;
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(mAngle + euclidRotation * fidelity);
        ctx.fillStyle = m % 2 === 0 ? '#e11d48' : '#fbbf24';
        ctx.shadowColor = m % 2 === 0 ? '#e11d48' : '#fbbf24';
        ctx.shadowBlur = 4 * s;
        const mSize = (2.2 + beatPulse * 1.5) * s;
        ctx.fillRect(-mSize / 2, -mSize / 2, mSize, mSize);
        ctx.restore();
    }
    ctx.restore();

    ctx.restore();
}

function drawDockScene(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
    ctx.save();
    const hoverY = playing ? Math.sin(now * 0.0022) * (2.0 * s) : 0;
    const rollAng = playing ? Math.sin(now * 0.0012) * 0.025 : 0;
    ctx.translate(cx, cy + hoverY);
    ctx.rotate(rollAng);

    const glowR = (36 + smoothBass * 20 + beatPulse * 28) * s;
    const glowGrad = ctx.createRadialGradient(0, 0, 4 * s, 0, 0, glowR);
    glowGrad.addColorStop(0, 'rgba(251, 191, 36, 0.35)');
    glowGrad.addColorStop(0.4, 'rgba(20, 184, 166, 0.18)');
    glowGrad.addColorStop(1, 'rgba(10, 5, 21, 0)');
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();

    ctx.save();
    const arraySpread = 32 * s;
    [-arraySpread, arraySpread].forEach((bx, bIdx) => {
        ctx.beginPath();
        ctx.moveTo(bIdx === 0 ? -16 * s : 16 * s, -2 * s);
        ctx.lineTo(bx, -2 * s);
        ctx.lineTo(bx, 2 * s);
        ctx.lineTo(bIdx === 0 ? -16 * s : 16 * s, 2 * s);
        ctx.closePath();
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = '#14b8a6';
        ctx.lineWidth = 1.0 * s;
        ctx.stroke();

        const panW = 10 * s;
        const panH = 22 * s;
        const panX = bIdx === 0 ? bx - panW : bx;
        const panY = -panH / 2;
        ctx.beginPath();
        ctx.rect(panX, panY, panW, panH);
        const panGrad = ctx.createLinearGradient(panX, panY, panX + panW, panY + panH);
        panGrad.addColorStop(0, '#1e293b');
        panGrad.addColorStop(0.5, '#0e3a3f');
        panGrad.addColorStop(1, '#0a101d');
        ctx.fillStyle = panGrad;
        ctx.fill();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = Math.max(0.9, 1.2 * s);
        ctx.stroke();

        for (let c = 1; c < 4; c++) {
            ctx.beginPath();
            ctx.moveTo(panX, panY + (c * panH) / 4);
            ctx.lineTo(panX + panW, panY + (c * panH) / 4);
            ctx.strokeStyle = 'rgba(20, 184, 166, 0.45)';
            ctx.lineWidth = 0.7 * s;
            ctx.stroke();
        }

        const tipColor = bIdx === 0 ? '#f43f5e' : '#14b8a6';
        const strobeAlpha = Math.sin(now * 0.008 + bIdx * Math.PI) > 0 ? 0.95 : 0.25;
        ctx.beginPath();
        ctx.arc(bIdx === 0 ? panX : panX + panW, 0, 1.8 * s, 0, Math.PI * 2);
        ctx.fillStyle = tipColor;
        ctx.shadowColor = tipColor;
        ctx.shadowBlur = (8 * strobeAlpha) * s;
        ctx.fill();
    });
    ctx.restore();

    ctx.save();
    const hullW = 20 * s;
    const hullH = 24 * s;

    ctx.beginPath();
    ctx.moveTo(-hullW * 0.55, -hullH);
    ctx.lineTo(hullW * 0.55, -hullH);
    ctx.lineTo(hullW, -hullH * 0.55);
    ctx.lineTo(hullW, hullH * 0.55);
    ctx.lineTo(hullW * 0.55, hullH);
    ctx.lineTo(-hullW * 0.55, hullH);
    ctx.lineTo(-hullW, hullH * 0.55);
    ctx.lineTo(-hullW, -hullH * 0.55);
    ctx.closePath();
    const hullGrad = ctx.createLinearGradient(0, -hullH, 0, hullH);
    hullGrad.addColorStop(0, '#1e293b');
    hullGrad.addColorStop(0.35, '#0f172a');
    hullGrad.addColorStop(0.7, '#070b14');
    hullGrad.addColorStop(1, '#020408');
    ctx.fillStyle = hullGrad;
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = Math.max(1.2, 1.6 * s);
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = (10 + beatPulse * 12) * s;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-hullW * 0.55, -hullH);
    ctx.lineTo(-hullW * 0.45, -hullH * 0.35);
    ctx.lineTo(hullW * 0.45, -hullH * 0.35);
    ctx.lineTo(hullW * 0.55, -hullH);
    ctx.strokeStyle = 'rgba(20, 184, 166, 0.65)';
    ctx.lineWidth = 1.0 * s;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -hullH);
    ctx.lineTo(0, -hullH - 8 * s);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -hullH - 8 * s, 1.4 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#14b8a6';
    ctx.shadowColor = '#14b8a6';
    ctx.shadowBlur = 8 * s;
    ctx.fill();

    const bayW = 11 * s;
    const bayH = 14 * s;
    ctx.beginPath();
    ctx.rect(-bayW, -bayH / 2, bayW * 2, bayH);
    ctx.fillStyle = '#040208';
    ctx.fill();
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth = Math.max(1.0, 1.4 * s);
    ctx.stroke();

    const runwayGrad = ctx.createLinearGradient(0, -bayH / 2, 0, bayH / 2);
    runwayGrad.addColorStop(0, '#fbbf24');
    runwayGrad.addColorStop(0.5, '#ffffff');
    runwayGrad.addColorStop(1, '#fbbf24');
    ctx.beginPath();
    ctx.rect(-bayW * 0.85, -2.5 * s, bayW * 1.7, 5 * s);
    ctx.fillStyle = runwayGrad;
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = (12 + beatPulse * 16) * s;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-bayW, 0);
    ctx.lineTo(bayW, 0);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();

    [-bayW * 0.6, 0, bayW * 0.6].forEach((rx) => {
        ctx.beginPath();
        ctx.arc(rx, 0, (1.2 + snarePulse * 0.8) * s, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    });
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(251, 191, 36, 0.85)';
    ctx.font = `700 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 6 * s;

    const retW = 28 * s;
    ctx.strokeStyle = 'rgba(20, 184, 166, 0.65)';
    ctx.lineWidth = 1.0 * s;
    ctx.beginPath();
    ctx.moveTo(-retW, -8 * s);
    ctx.lineTo(-retW - 3 * s, -8 * s);
    ctx.lineTo(-retW - 3 * s, 8 * s);
    ctx.lineTo(-retW, 8 * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(retW, -8 * s);
    ctx.lineTo(retW + 3 * s, -8 * s);
    ctx.lineTo(retW + 3 * s, 8 * s);
    ctx.lineTo(retW, 8 * s);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
}

// Scale the existing scene into the new machined rim without cropping it.
export function drawCore(ctx, width, height, playing, now, dt, beat, snare, bass, mid, treble, fidelity, bands) {
    ctx.save();
    try {
        ctx.translate(width * .04, height * .04);
        ctx.scale(.92, .92);
        drawScene(ctx, width, height, playing, now, dt, beat, snare, bass, mid, treble, fidelity, bands);
    } finally { ctx.restore(); }
    drawInstrumentRim(ctx, width, height, 'station', playing ? beat : 0);
}
export { drawDockScene };
