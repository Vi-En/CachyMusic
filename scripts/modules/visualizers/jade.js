// Jade — detailed scene and companion dock illustration.
import { emitTurntableShockwave, store } from '../state.js';
import { drawInstrumentRim } from './instrument-rim.js';
let abyssalTime = 0;
function drawScene(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
    if (!ctx || width === 0 || height === 0) return;
    const turntableShockwaves = store.state.turntableShockwaves;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) * 0.48;
    const hubRadius = Math.min(width, height) * 0.20;
    const s = hubRadius / 54;

    if (playing) {
        abyssalTime += dt * (0.8 + beatPulse * 0.8) * fidelity;
    } else {
        abyssalTime += dt * 0.20 * fidelity;
    }

    // 1. Acoustic Shockwaves (Radiant Emerald)
    if (playing && beatPulse > 0.38 && fidelity > 0.15) {
        emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * fidelity, '#00ffaa');
    }
    for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
        const sw = turntableShockwaves[i];
        sw.r += sw.speed * dt;
        const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
        if (prog >= 1.0) { turntableShockwaves.splice(i, 1); continue; }
        const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
        ctx.save();
        ctx.strokeStyle = `rgba(0, 255, 170, ${currentAlpha})`;
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = (8 + beatPulse * 8 * (0.35 + 0.65 * fidelity)) * s;
        ctx.lineWidth = Math.max(1.0, (2.0 + beatPulse * 1.2) * (1.0 - prog * 0.5));
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // =====================================================================
    // FULL-PLATTER ABYSSAL VOID ARCHITECTURE: Naval Sonar Scope Console
    // =====================================================================
    if (fidelity > 0.005) {
        ctx.save();
        ctx.globalAlpha = fidelity;
        ctx.translate(centerX, centerY);

        // Dark deep trench sonar cathode disk
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#010a0c';
        ctx.fill();

        // Outer Azimuth Compass Ring (000° to 359°)
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius * 0.94, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 170, ${0.5 + beatPulse * 0.45})`;
        ctx.lineWidth = Math.max(1.8, 2.4 * s);
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = (10 + beatPulse * 16) * s;
        ctx.stroke();

        // 36 Compass Degree Tick Marks
        for (let c = 0; c < 36; c++) {
            const cAng = (c * Math.PI * 2) / 36;
            const isCardinal = c % 9 === 0;
            const isMajor = c % 3 === 0;
            const cInner = maxRadius * (isCardinal ? 0.86 : (isMajor ? 0.89 : 0.91));
            ctx.beginPath();
            ctx.moveTo(Math.cos(cAng) * cInner, Math.sin(cAng) * cInner);
            ctx.lineTo(Math.cos(cAng) * maxRadius * 0.93, Math.sin(cAng) * maxRadius * 0.93);
            ctx.strokeStyle = isCardinal ? '#00ffaa' : `rgba(0, 255, 170, 0.35)`;
            ctx.lineWidth = isCardinal ? 2.0 * s : 1.0 * s;
            ctx.stroke();
        }

        // Cardinal Degree Text: 000°, 090°, 180°, 270°
        ctx.font = `${Math.max(9, Math.round(8 * s))}px monospace`;
        ctx.fillStyle = `rgba(0, 255, 170, 0.85)`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cardinals = ['000° N', '090° E', '180° S', '270° W'];
        for (let cd = 0; cd < 4; cd++) {
            const cdAng = (cd * Math.PI) / 2;
            ctx.save();
            ctx.rotate(cdAng);
            ctx.translate(0, -maxRadius * 0.82);
            ctx.fillText(cardinals[cd], 0, 0);
            ctx.restore();
        }

        // Concentric Distance Range Rings (100M, 250M, 500M)
        const rangeRings = [hubRadius * 1.3, hubRadius * 1.8, maxRadius * 0.72];
        const rangeLabels = ['I', 'II', 'III'];
        for (let rg = 0; rg < rangeRings.length; rg++) {
            ctx.beginPath();
            ctx.arc(0, 0, rangeRings[rg], 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 255, 170, 0.22)`;
            ctx.lineWidth = 0.9 * s;
            ctx.setLineDash([Math.round(4 * s), Math.round(6 * s)]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = `rgba(0, 255, 170, 0.5)`;
            ctx.fillText(rangeLabels[rg], rangeRings[rg] - 14 * s, -4 * s);
        }

        // Tactical Crosshairs (North-South & East-West)
        ctx.beginPath();
        ctx.moveTo(-maxRadius * 0.92, 0);
        ctx.lineTo(maxRadius * 0.92, 0);
        ctx.moveTo(0, -maxRadius * 0.92);
        ctx.lineTo(0, maxRadius * 0.92);
        ctx.strokeStyle = `rgba(0, 255, 170, 0.15)`;
        ctx.lineWidth = 0.8 * s;
        ctx.stroke();

        // Active 360° Rotating Radar Sweep Line across the entire platter!
        const sweepAngle = abyssalTime * 1.8;
        ctx.save();
        ctx.rotate(sweepAngle);
        // Phosphor Persistence Cone (Fading sector behind sweep line)
        const sweepGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius * 0.92);
        sweepGrad.addColorStop(0, 'rgba(0, 255, 170, 0.45)');
        sweepGrad.addColorStop(1, 'rgba(0, 255, 170, 0.08)');
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, maxRadius * 0.92, -0.45, 0);
        ctx.closePath();
        ctx.fillStyle = sweepGrad;
        ctx.fill();

        // Main Sweep Laser Line
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(maxRadius * 0.93, 0);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.2, 1.8 * s);
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = 12 * s;
        ctx.stroke();
        ctx.restore();

        ctx.restore();
    }

    // 2. Cosmic Void Background Hub
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#020707';
    ctx.fill();
    ctx.strokeStyle = `rgba(16, 185, 129, ${0.35 + snarePulse * 0.35})`;
    ctx.lineWidth = Math.max(1.2, 1.6 * s);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(centerX, centerY);

    // 3. Radiant Emerald Crescent Glow in Upper-Right (Illuminating the Gas Giant)
    const crescentAngle = Math.PI * 0.25;
    const crescentDist = hubRadius * 0.25;
    const cx = Math.cos(crescentAngle) * crescentDist;
    const cy = -Math.sin(crescentAngle) * crescentDist;

    const crescentR = hubRadius * (0.88 + beatPulse * 0.32 + smoothBass * 0.18);
    const glowGrad = ctx.createRadialGradient(cx, cy, crescentR * 0.4, cx, cy, crescentR * 1.4);
    glowGrad.addColorStop(0, `rgba(0, 255, 170, ${0.45 + beatPulse * 0.45})`);
    glowGrad.addColorStop(0.4, `rgba(16, 185, 129, ${0.28 + beatPulse * 0.25})`);
    glowGrad.addColorStop(0.8, `rgba(5, 150, 105, ${0.10 + snarePulse * 0.15})`);
    glowGrad.addColorStop(1, 'rgba(2, 7, 7, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, crescentR * 1.4, 0, Math.PI * 2);
    ctx.fill();

    // 4. Distant Giant Gas Planet Silhouette with Radiant Rim Arc
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, crescentR, -Math.PI * 0.65, Math.PI * 0.35);
    ctx.strokeStyle = beatPulse > 0.4 ? '#ffffff' : '#00ffaa';
    ctx.lineWidth = Math.max(2.0, (2.8 + beatPulse * 2.0) * s);
    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur = (14 + beatPulse * 20) * s;
    ctx.stroke();
    ctx.restore();

    // 5. Silhouetted Moon Disc on the Crescent Rim (from Image 4)
    const moonR = hubRadius * 0.18;
    const moonX = cx - crescentR * 0.35;
    const moonY = cy + crescentR * 0.35;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fillStyle = '#020707';
    ctx.fill();
    ctx.strokeStyle = `rgba(0, 255, 170, ${0.5 + beatPulse * 0.4})`;
    ctx.lineWidth = 1 * s;
    ctx.stroke();

    // 6. Colossal Foreground Planet Rim (Blocking the lower-left)
    ctx.beginPath();
    ctx.arc(-hubRadius * 0.6, hubRadius * 0.6, hubRadius * 1.1, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.fillStyle = '#020707';
    ctx.fill();
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();

    // 7. Twin Luminous Starlight Sub-Light Engine Trails (Cutting diagonally across the horizon)
    const trailAngle = -Math.PI * 0.28;
    const trailStartX = -hubRadius * 0.9;
    const trailStartY = hubRadius * 0.7;
    const trailLen = hubRadius * (1.6 + beatPulse * 0.6);
    const endX = trailStartX + Math.cos(trailAngle) * trailLen;
    const endY = trailStartY + Math.sin(trailAngle) * trailLen;

    ctx.save();
    for (let t = -1; t <= 1; t += 2) {
        const offset = t * 2.2 * s;
        const perpAngle = trailAngle + Math.PI / 2;
        const ox = Math.cos(perpAngle) * offset;
        const oy = Math.sin(perpAngle) * offset;

        ctx.beginPath();
        ctx.moveTo(trailStartX + ox, trailStartY + oy);
        ctx.lineTo(endX + ox, endY + oy);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 + snarePulse * 0.3})`;
        ctx.lineWidth = Math.max(0.8, (1.2 + beatPulse * 0.8) * s);
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = (6 + beatPulse * 8) * s;
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(endX, endY, (2.2 + beatPulse * 1.5) * s, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur = 10 * s;
    ctx.fill();
    ctx.restore();

    ctx.restore();
}

function drawDockScene(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
    ctx.save();
    ctx.translate(cx, cy);

    const numRings = 7;
    const maxRingR = 46 * s;
    ctx.save();
    for (let r = 0; r < numRings; r++) {
        const prog = ((now * 0.0018 + r / numRings) % 1.0);
        const ringR = Math.max(3 * s, prog * maxRingR);
        const ringAlpha = Math.sin(prog * Math.PI) * (0.45 + beatPulse * 0.45);
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = (r % 2 === 0)
            ? `rgba(0, 255, 170, ${ringAlpha})`
            : `rgba(16, 185, 129, ${ringAlpha})`;
        ctx.lineWidth = Math.max(1.0, (1.2 + prog * 2.2) * s);
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = (8 + beatPulse * 14) * s;
        ctx.stroke();
    }
    ctx.restore();

    const numStreaks = 36;
    ctx.save();
    for (let k = 0; k < numStreaks; k++) {
        const baseAng = (k * Math.PI * 2) / numStreaks;
        const ang = baseAng + Math.sin(k * 2.1 + now * 0.0008) * 0.08;
        const rStart = (4 + ((k * 13) % 16)) * s;
        const streakLen = (14 + smoothBass * 28 + beatPulse * 38) * s;
        const rEnd = rStart + streakLen;

        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);

        const isMint = (k % 3 === 0);
        const isWhite = (k % 5 === 0);
        const streakColor = isWhite ? '#ffffff' : (isMint ? '#00ffaa' : '#10b981');

        ctx.beginPath();
        ctx.moveTo(cosA * rStart, sinA * rStart);
        ctx.lineTo(cosA * rEnd, sinA * rEnd);
        ctx.strokeStyle = streakColor;
        ctx.lineWidth = Math.max(0.8, (1.1 + beatPulse * 1.4) * s);
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = (6 + beatPulse * 10) * s;
        ctx.stroke();

        if (isWhite || isMint) {
            ctx.beginPath();
            ctx.arc(cosA * rEnd, sinA * rEnd, (1.1 + beatPulse * 1.1) * s, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#00ffaa';
            ctx.shadowBlur = 8 * s;
            ctx.fill();
        }
    }
    ctx.restore();

    const coreR = (11 + smoothBass * 6 + beatPulse * 9) * s;
    const vortexGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
    vortexGrad.addColorStop(0, '#ffffff');
    vortexGrad.addColorStop(0.3, '#00ffaa');
    vortexGrad.addColorStop(0.65, '#059669');
    vortexGrad.addColorStop(0.9, '#022c22');
    vortexGrad.addColorStop(1, 'rgba(2, 44, 34, 0)');
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
    ctx.fillStyle = vortexGrad;
    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur = (18 + beatPulse * 28) * s;
    ctx.fill();

    ctx.save();
    ctx.rotate(now * 0.005);
    for (let sp = 0; sp < 4; sp++) {
        const spAng = (sp * Math.PI) / 2;
        ctx.beginPath();
        ctx.arc(0, 0, coreR * 0.65, spAng, spAng + 0.85);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.3 * s;
        ctx.stroke();
    }
    ctx.restore();

    if (playing && beatPulse > 0.38) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, coreR * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 24 * s;
        ctx.fill();
        ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = 'rgba(0, 255, 170, 0.9)';
    ctx.font = `700 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur = 6 * s;

    const retW = 30 * s;
    ctx.strokeStyle = 'rgba(0, 255, 170, 0.65)';
    ctx.lineWidth = 1.0 * s;
    ctx.beginPath();
    ctx.moveTo(-retW, -6 * s);
    ctx.lineTo(-retW - 3 * s, -6 * s);
    ctx.lineTo(-retW - 3 * s, 6 * s);
    ctx.lineTo(-retW, 6 * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(retW, -6 * s);
    ctx.lineTo(retW + 3 * s, -6 * s);
    ctx.lineTo(retW + 3 * s, 6 * s);
    ctx.lineTo(retW, 6 * s);
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
    drawInstrumentRim(ctx, width, height, 'jade', playing ? beat : 0);
}
export { drawDockScene };
