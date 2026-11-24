// Bloom — detailed scene and companion dock illustration.
import { emitTurntableShockwave, store } from '../state.js';
import { drawInstrumentRim } from './instrument-rim.js';
let paradiseTime = 0;
function drawScene(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
    if (!ctx || width === 0 || height === 0) return;
    const turntableShockwaves = store.state.turntableShockwaves;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) * 0.48;
    const hubRadius = Math.min(width, height) * 0.20;
    const s = hubRadius / 54;

    if (playing) {
        paradiseTime += dt * (0.8 + beatPulse * 0.8) * fidelity;
    } else {
        paradiseTime += dt * 0.20 * fidelity;
    }

    // 1. Acoustic Shockwaves (Hot Fuchsia & Turquoise)
    if (playing && fidelity > 0.15) {
        if (beatPulse > 0.38 && Math.random() < 0.45) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * fidelity, '#ff2a70');
        } else if (snarePulse > 0.42 && Math.random() < 0.40) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.80 * fidelity, '#00ced1');
        }
    }
    for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
        const sw = turntableShockwaves[i];
        sw.r += sw.speed * dt;
        const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
        if (prog >= 1.0) { turntableShockwaves.splice(i, 1); continue; }
        const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
        ctx.save();
        ctx.strokeStyle = sw.color === '#ff2a70' ? `rgba(255, 42, 112, ${currentAlpha})` : `rgba(0, 206, 209, ${currentAlpha})`;
        ctx.shadowColor = sw.color || '#ff2a70';
        ctx.shadowBlur = (8 + beatPulse * 8 * (0.35 + 0.65 * fidelity)) * s;
        ctx.lineWidth = Math.max(1.0, (2.0 + beatPulse * 1.2) * (1.0 - prog * 0.5));
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // =====================================================================
    // FULL-PLATTER ALIEN PARADISE ARCHITECTURE: Retro-Synth Bio-Deck
    // =====================================================================
    if (fidelity > 0.005) {
        ctx.save();
        ctx.globalAlpha = fidelity;
        ctx.translate(centerX, centerY);

        // Fluorescent jungle night base
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#05181a';
        ctx.fill();

        // Outer Neon Synth Compass Ring
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius * 0.94, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 42, 112, ${0.5 + beatPulse * 0.4})`;
        ctx.lineWidth = Math.max(1.8, 2.2 * s);
        ctx.shadowColor = '#ff2a70';
        ctx.shadowBlur = (10 + beatPulse * 14) * s;
        ctx.stroke();

        // 36 Degree Calibration Ticks (Hi-Fi Tape Deck Styling)
        ctx.save();
        ctx.rotate(paradiseTime * 0.25);
        for (let t = 0; t < 36; t++) {
            const tAng = (t * Math.PI * 2) / 36;
            const isMajor = t % 3 === 0;
            const innerR = maxRadius * (isMajor ? 0.88 : 0.91);
            ctx.beginPath();
            ctx.moveTo(Math.cos(tAng) * innerR, Math.sin(tAng) * innerR);
            ctx.lineTo(Math.cos(tAng) * maxRadius * 0.93, Math.sin(tAng) * maxRadius * 0.93);
            ctx.strokeStyle = isMajor ? '#00ced1' : `rgba(255, 42, 112, 0.35)`;
            ctx.lineWidth = isMajor ? 1.8 * s : 0.9 * s;
            ctx.stroke();
        }
        ctx.restore();

        // Topographic Biosphere Elevation Rings
        ctx.save();
        ctx.rotate(-paradiseTime * 0.15);
        const topoRings = 5;
        for (let tr = 0; tr < topoRings; tr++) {
            const trRad = hubRadius * 1.2 + tr * (maxRadius * 0.15);
            ctx.beginPath();
            for (let a = 0; a <= Math.PI * 2; a += 0.15) {
                const waveWobble = Math.sin(a * 4 + paradiseTime + tr) * (4 + beatPulse * 6) * s;
                const dist = trRad + waveWobble;
                const ax = Math.cos(a) * dist;
                const ay = Math.sin(a) * dist;
                if (a === 0) ctx.moveTo(ax, ay);
                else ctx.lineTo(ax, ay);
            }
            ctx.closePath();
            ctx.strokeStyle = tr % 2 === 0 ? `rgba(0, 206, 209, ${0.18 + snarePulse * 0.25})` : `rgba(250, 204, 21, 0.18)`;
            ctx.lineWidth = Math.max(0.8, 1.2 * s);
            ctx.stroke();
        }
        ctx.restore();
        ctx.restore();
    }

    // 2. Retro Turquoise Sky Hub
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#0a2527';
    ctx.fill();
    ctx.strokeStyle = `rgba(0, 206, 209, ${0.45 + snarePulse * 0.35})`;
    ctx.lineWidth = Math.max(1.2, 1.6 * s);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(centerX, centerY);

    // 3. Huge Glowing White Horizon Arch in Background (from Image 3)
    const archR = hubRadius * 0.82;
    ctx.beginPath();
    ctx.arc(0, hubRadius * 0.32, archR, Math.PI * 1.05, -Math.PI * 0.05);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 + beatPulse * 0.45})`;
    ctx.lineWidth = Math.max(2.0, (3.2 + beatPulse * 2.0) * s);
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = (8 + beatPulse * 12) * s;
    ctx.stroke();

    // 4. Ascending Rocket Vapor Light Trails (Shooting straight up into the sky)
    const numBeacons = 5;
    for (let b = 0; b < numBeacons; b++) {
        const bx = (b - 2) * (hubRadius * 0.35);
        const beaconEnergy = b === 2 ? beatPulse : (b % 2 === 0 ? snarePulse : smoothTreble);
        const bHeight = hubRadius * (0.60 + beaconEnergy * 0.65);
        ctx.beginPath();
        ctx.moveTo(bx, hubRadius * 0.4);
        ctx.lineTo(bx, hubRadius * 0.4 - bHeight);
        ctx.strokeStyle = b === 2 ? '#ffffff' : `rgba(0, 206, 209, ${0.4 + beaconEnergy * 0.5})`;
        ctx.lineWidth = Math.max(0.8, (b === 2 ? 1.8 : 1.1) * s);
        ctx.shadowColor = b === 2 ? '#ffffff' : '#00ced1';
        ctx.shadowBlur = 6 * s;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(bx, hubRadius * 0.4 - bHeight, (1.6 + beaconEnergy * 1.6) * s, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }

    // 5. Floating Retro Turquoise Atlas Spire with Ember Eye (Hovering in Center)
    const spireScale = s * (1.0 + beatPulse * 0.32);
    const sw = 13 * spireScale;
    const sh = 28 * spireScale;
    const floatOffset = Math.sin(paradiseTime * 2.0) * 3 * s;

    ctx.save();
    ctx.translate(0, -hubRadius * 0.12 + floatOffset);

    ctx.beginPath();
    ctx.moveTo(0, -sh);
    ctx.lineTo(sw, 0);
    ctx.lineTo(0, sh);
    ctx.lineTo(-sw, 0);
    ctx.closePath();
    ctx.fillStyle = '#134e4a';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -sh);
    ctx.lineTo(0, sh);
    ctx.lineTo(-sw, 0);
    ctx.closePath();
    ctx.fillStyle = `rgba(0, 206, 209, ${0.65 + snarePulse * 0.25})`;
    ctx.fill();

    ctx.strokeStyle = beatPulse > 0.4 ? '#ffffff' : '#00ced1';
    ctx.lineWidth = Math.max(1.0, 1.4 * s);
    ctx.shadowColor = '#00ced1';
    ctx.shadowBlur = (8 + beatPulse * 12) * s;
    ctx.stroke();

    const emberR = (4 + beatPulse * 6) * s;
    const emberGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, emberR);
    emberGrad.addColorStop(0, '#ffffff');
    emberGrad.addColorStop(0.35, '#ff2a70');
    emberGrad.addColorStop(1, 'rgba(255, 42, 112, 0)');
    ctx.fillStyle = emberGrad;
    ctx.beginPath();
    ctx.arc(0, 0, emberR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 6. Swirling Golden Canopy Spores / Flora Pollen
    for (let p = 0; p < 6; p++) {
        const pAngle = paradiseTime * 1.2 + (p * Math.PI * 2) / 6;
        const pDist = hubRadius * (0.65 + Math.sin(paradiseTime * 2.0 + p) * 0.20);
        const px = Math.cos(pAngle) * pDist;
        const py = Math.sin(pAngle) * pDist * 0.6 + hubRadius * 0.15;
        ctx.fillStyle = p % 2 === 0 ? '#facc15' : '#ff2a70';
        ctx.shadowColor = p % 2 === 0 ? '#facc15' : '#ff2a70';
        ctx.shadowBlur = 4 * s;
        ctx.beginPath();
        ctx.arc(px, py, (1.8 + beatPulse * 1.2) * s, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawDockScene(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
    ctx.save();
    const hoverY = playing ? Math.sin(now * 0.0028) * (2.8 * s) : 0;
    ctx.translate(cx, cy + hoverY);

    const flap = Math.sin(now * 0.0036) * (6 * s);

    // Translucent Bioluminescent Manta Body
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, -18 * s);
    ctx.bezierCurveTo(-10 * s, -14 * s, -28 * s, -6 * s + flap, -30 * s, 4 * s + flap);
    ctx.bezierCurveTo(-26 * s, 10 * s + flap, -12 * s, 8 * s, -4 * s, 12 * s);
    ctx.lineTo(0, 14 * s);
    ctx.lineTo(4 * s, 12 * s);
    ctx.bezierCurveTo(12 * s, 8 * s, 26 * s, 10 * s + flap, 30 * s, 4 * s + flap);
    ctx.bezierCurveTo(28 * s, -6 * s + flap, 10 * s, -14 * s, 0, -18 * s);
    ctx.closePath();

    const mantaGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 28 * s);
    mantaGrad.addColorStop(0, 'rgba(255, 42, 112, 0.9)');
    mantaGrad.addColorStop(0.45, 'rgba(0, 206, 209, 0.75)');
    mantaGrad.addColorStop(0.85, 'rgba(250, 204, 21, 0.35)');
    mantaGrad.addColorStop(1, 'rgba(0, 206, 209, 0.05)');
    ctx.fillStyle = mantaGrad;
    ctx.shadowColor = '#00ced1';
    ctx.shadowBlur = (10 + beatPulse * 14) * s;
    ctx.fill();

    ctx.strokeStyle = '#00ced1';
    ctx.lineWidth = Math.max(0.8, 1.2 * s);
    ctx.stroke();
    ctx.restore();

    // Luminous Ventral Photophore Nodes (Spine Bio-Lights)
    const spineNodes = [-11 * s, -6 * s, -1 * s, 4 * s, 9 * s];
    spineNodes.forEach((ny, idx) => {
        const nodePulse = Math.sin(now * 0.005 + idx * 0.8) * 0.3 + 0.7;
        const nodeR = (1.8 + beatPulse * 1.4) * s * nodePulse;
        ctx.beginPath();
        ctx.arc(0, ny, nodeR, 0, Math.PI * 2);
        ctx.fillStyle = idx % 2 === 0 ? '#ff2a70' : '#facc15';
        ctx.shadowColor = idx % 2 === 0 ? '#ff2a70' : '#facc15';
        ctx.shadowBlur = (6 + beatPulse * 8) * s;
        ctx.fill();
    });

    // Trailing Bioluminescent Antennae / Filaments
    ctx.save();
    [-3.5 * s, 3.5 * s].forEach((tx, i) => {
        ctx.beginPath();
        ctx.moveTo(tx, 14 * s);
        const wave1 = Math.sin(now * 0.004 + i) * (4 * s);
        const wave2 = Math.cos(now * 0.004 + i) * (6 * s);
        ctx.bezierCurveTo(tx + wave1, 20 * s, tx - wave2, 26 * s, tx + wave2, (32 + smoothBass * 14) * s);
        ctx.strokeStyle = `rgba(0, 206, 209, ${0.5 + snarePulse * 0.4})`;
        ctx.lineWidth = Math.max(0.7, 1.0 * s);
        ctx.shadowColor = '#00ced1';
        ctx.shadowBlur = 6 * s;
        ctx.stroke();
    });
    ctx.restore();

    // Subtitle
    ctx.fillStyle = 'rgba(0, 206, 209, 0.75)';
    ctx.font = `600 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';

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
    drawInstrumentRim(ctx, width, height, 'bloom', playing ? beat : 0);
}
export { drawDockScene };
