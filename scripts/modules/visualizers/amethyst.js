import { setCanvasShadowBlur } from './canvas-shadow.js';
// Amethyst — detailed scene and companion dock illustration.
import { emitTurntableShockwave, store } from '../state.js';
import { drawInstrumentRim } from './instrument-rim.js';
let dissonanceTime = 0;
function drawScene(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0, bands = null) {
    if (!ctx || width === 0 || height === 0) return;
    const turntableShockwaves = store.state.turntableShockwaves;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) * 0.48;
    const hubRadius = Math.min(width, height) * 0.20;
    const s = hubRadius / 54;

    if (playing) {
        dissonanceTime += dt * (0.85 + beatPulse * 1.2 + smoothBass * 0.6) * Math.max(0.4, fidelity);
    } else {
        dissonanceTime += dt * 0.22 * Math.max(0.4, fidelity);
    }

    // Chromatic glitch displacement on heavy transient kicks & snares
    const isGlitching = playing && (beatPulse > 0.52 || snarePulse > 0.58) && Math.random() < 0.40;
    const jitterX = isGlitching ? (Math.random() - 0.5) * 3.5 * s : 0;
    const jitterY = isGlitching ? (Math.random() - 0.5) * 3.5 * s : 0;

    // 1. Acoustic Shockwaves (Luminous Atlantideum Violet & Radiant Fuchsia with Hexagonal Geometry)
    if (playing && fidelity > 0.15) {
        if (beatPulse > 0.38 && Math.random() < 0.45) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * fidelity, '#d946ef');
        } else if (snarePulse > 0.42 && Math.random() < 0.40) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.80 * fidelity, '#a855f7');
        }
    }
    for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
        const sw = turntableShockwaves[i];
        sw.r += sw.speed * dt;
        const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
        if (prog >= 1.0) { turntableShockwaves.splice(i, 1); continue; }
        const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
        ctx.save();
        ctx.strokeStyle = sw.color === '#d946ef' ? `rgba(217, 70, 239, ${currentAlpha})` : `rgba(168, 85, 247, ${currentAlpha})`;
        ctx.shadowColor = sw.color || '#d946ef';
        setCanvasShadowBlur(ctx, (10 + beatPulse * 10 * (0.35 + 0.65 * fidelity)) * s);
        ctx.lineWidth = Math.max(1.0, (2.2 + beatPulse * 1.5) * (1.0 - prog * 0.5));
        ctx.beginPath();
        const sides = 6;
        for (let side = 0; side < sides; side++) {
            const sang = (side * Math.PI * 2) / sides + dissonanceTime * 0.15;
            const sx = sw.x + Math.cos(sang) * sw.r;
            const sy = sw.y + Math.sin(sang) * sw.r;
            if (side === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }

    // =====================================================================
    // FULL-PLATTER DISSONANCE ARCHITECTURE: Corrupted Planetary Scanner
    // =====================================================================
    if (fidelity > 0.005) {
        ctx.save();
        ctx.globalAlpha = fidelity;
        ctx.translate(centerX + jitterX, centerY + jitterY);

        // Dark corrupted twilight void disk
        const voidGrad = ctx.createRadialGradient(0, 0, hubRadius * 0.8, 0, 0, maxRadius);
        voidGrad.addColorStop(0, '#0f031c');
        voidGrad.addColorStop(0.45, '#06010d');
        voidGrad.addColorStop(0.85, '#030006');
        voidGrad.addColorStop(1, '#000000');
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
        ctx.fillStyle = voidGrad;
        ctx.fill();

        // Atmospheric purple haze ring
        const hazeGrad = ctx.createRadialGradient(0, 0, hubRadius * 0.9, 0, 0, maxRadius);
        hazeGrad.addColorStop(0, `rgba(168, 85, 247, ${0.22 + smoothBass * 0.15})`);
        hazeGrad.addColorStop(0.5, `rgba(217, 70, 239, ${0.14 + snarePulse * 0.10})`);
        hazeGrad.addColorStop(1, 'rgba(3, 0, 6, 0)');
        ctx.fillStyle = hazeGrad;
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
        ctx.fill();

        // Corrupted Vinyl Grooves (Micro-rings with harmonic audio breathing)
        ctx.save();
        ctx.lineWidth = 0.6 * s;
        for (let g = 1; g <= 6; g++) {
            const gr = hubRadius + (maxRadius - hubRadius) * (g / 7);
            const gAlpha = 0.08 + Math.sin(dissonanceTime * 1.5 + g) * 0.04 + (g % 2 === 0 ? smoothBass * 0.08 : 0);
            ctx.strokeStyle = g % 2 === 0 ? `rgba(217, 70, 239, ${gAlpha})` : `rgba(168, 85, 247, ${gAlpha})`;
            ctx.beginPath();
            ctx.arc(0, 0, gr, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();

        // Outer Corrupted Perimeter Ring with Hot Neon Edge
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius * 0.95, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(217, 70, 239, ${0.55 + beatPulse * 0.45})`;
        ctx.lineWidth = Math.max(1.8, 2.2 * s);
        ctx.shadowColor = '#d946ef';
        setCanvasShadowBlur(ctx, (12 + beatPulse * 16) * s);
        ctx.stroke();

        // -----------------------------------------------------------------
        // CIRCULAR DISSONANCE HARMONIC RESONATOR EQUALIZER (48 Radial Spires)
        // -----------------------------------------------------------------
        ctx.save();
        const numSpires = 48;
        const eqInnerR = hubRadius * 1.32;
        const eqMaxSpireLen = (maxRadius * 0.76 - eqInnerR);
        ctx.rotate(dissonanceTime * 0.12);

        for (let sp = 0; sp < numSpires; sp++) {
            const ang = (sp * Math.PI * 2) / numSpires;
            let val = 0;
            if (bands && bands.length > 0) {
                const bIdx = Math.floor((sp / numSpires) * bands.length);
                val = bands[bIdx] || 0;
            } else {
                const waveHarmonic = Math.sin(sp * 0.35 + dissonanceTime * 2.8) * 0.5 + 0.5;
                val = playing ? (waveHarmonic * (0.35 + smoothBass * 0.45 + (sp % 4 === 0 ? beatPulse * 0.4 : 0))) : (Math.sin(sp * 0.28 + dissonanceTime) * 0.12 + 0.14);
            }
            const spireLen = Math.max(2.5 * s, val * eqMaxSpireLen * (0.85 + beatPulse * 0.35));
            const x1 = Math.cos(ang) * eqInnerR;
            const y1 = Math.sin(ang) * eqInnerR;
            const x2 = Math.cos(ang) * (eqInnerR + spireLen);
            const y2 = Math.sin(ang) * (eqInnerR + spireLen);

            const isHighSpire = val > 0.45 || (sp % 6 === 0);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = isHighSpire ? '#fae8ff' : (sp % 2 === 0 ? '#d946ef' : 'rgba(168, 85, 247, 0.7)');
            ctx.lineWidth = Math.max(1.0, (isHighSpire ? 2.2 : 1.4) * s);
            if (isHighSpire) {
                ctx.shadowColor = '#d946ef';
                setCanvasShadowBlur(ctx, (6 + beatPulse * 8) * s);
            } else {
                setCanvasShadowBlur(ctx, 0);
            }
            ctx.stroke();

            if (val > 0.38) {
                const tipR = (1.4 + beatPulse * 1.2) * s;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(x2 - tipR / 2, y2 - tipR / 2, tipR, tipR);
            }
        }
        ctx.restore();

        // 36 Degree Calibration Ticks (Corrupted Sentinel Telemetry)
        ctx.save();
        ctx.rotate(-dissonanceTime * 0.18);
        for (let t = 0; t < 36; t++) {
            const tAng = (t * Math.PI * 2) / 36;
            const isMajor = t % 3 === 0;
            const isCardinal = t % 9 === 0;
            const innerR = maxRadius * (isCardinal ? 0.85 : (isMajor ? 0.89 : 0.91));
            ctx.beginPath();
            ctx.moveTo(Math.cos(tAng) * innerR, Math.sin(tAng) * innerR);
            ctx.lineTo(Math.cos(tAng) * maxRadius * 0.94, Math.sin(tAng) * maxRadius * 0.94);
            ctx.strokeStyle = isCardinal ? '#d946ef' : (isMajor ? '#a855f7' : 'rgba(168, 85, 247, 0.35)');
            ctx.lineWidth = isCardinal ? 2.2 * s : (isMajor ? 1.4 * s : 0.8 * s);
            ctx.stroke();

            // Inverted Mirror Diamonds at the 4 cardinal positions
            if (isCardinal) {
                const imR = maxRadius * 0.83;
                const imX = Math.cos(tAng) * imR;
                const imY = Math.sin(tAng) * imR;
                const dSize = 3.5 * s;
                ctx.save();
                ctx.translate(imX, imY);
                ctx.rotate(tAng);
                ctx.beginPath();
                ctx.moveTo(0, -dSize);
                ctx.lineTo(dSize * 0.7, 0);
                ctx.lineTo(0, dSize);
                ctx.lineTo(-dSize * 0.7, 0);
                ctx.closePath();
                ctx.fillStyle = '#fae8ff';
                ctx.shadowColor = '#d946ef';
                setCanvasShadowBlur(ctx, 6 * s);
                ctx.fill();
                ctx.restore();
            }
        }
        ctx.restore();

        // Concentric Guidance Rings (Echo Locator Grid)
        const locatorRings = [hubRadius * 1.30, maxRadius * 0.77];
        for (let lr = 0; lr < locatorRings.length; lr++) {
            ctx.beginPath();
            ctx.arc(0, 0, locatorRings[lr], 0, Math.PI * 2);
            ctx.strokeStyle = lr === 0 ? `rgba(217, 70, 239, ${0.32 + snarePulse * 0.25})` : 'rgba(168, 85, 247, 0.22)';
            ctx.lineWidth = 0.9 * s;
            ctx.setLineDash([Math.round(4 * s), Math.round(6 * s)]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Rotating Corrupted Sentinel Scanner Sweep with Dual Lasers
        const sweepAngle = dissonanceTime * 1.5;
        ctx.save();
        ctx.rotate(sweepAngle);
        const sweepGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius * 0.94);
        sweepGrad.addColorStop(0, `rgba(217, 70, 239, ${0.48 + beatPulse * 0.25})`);
        sweepGrad.addColorStop(0.6, 'rgba(168, 85, 247, 0.15)');
        sweepGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, maxRadius * 0.94, -0.42, 0);
        ctx.closePath();
        ctx.fillStyle = sweepGrad;
        ctx.fill();

        // Lead Laser Needles (Dual focused beams)
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(maxRadius * 0.94, 0);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.4, 2.0 * s);
        ctx.shadowColor = '#d946ef';
        setCanvasShadowBlur(ctx, 10 * s);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(maxRadius * 0.93 * Math.cos(-0.06), maxRadius * 0.93 * Math.sin(-0.06));
        ctx.strokeStyle = 'rgba(217, 70, 239, 0.85)';
        ctx.lineWidth = Math.max(0.8, 1.2 * s);
        ctx.stroke();
        ctx.restore();

        // Floating Atlantideum Spore Motes in Space
        for (let m = 0; m < 24; m++) {
            const mAng = (m * 15.0 * Math.PI) / 180 + dissonanceTime * 0.08;
            const mDist = hubRadius * 1.15 + ((m * 13) % Math.round(maxRadius * 0.85 - hubRadius));
            const mx = Math.cos(mAng) * mDist;
            const my = Math.sin(mAng) * mDist;
            const mSize = (m % 3 === 0 ? 2.2 : 1.3) * s;
            ctx.fillStyle = m % 2 === 0 ? '#d946ef' : '#c084fc';
            ctx.shadowColor = '#d946ef';
            setCanvasShadowBlur(ctx, 6 * s);
            ctx.fillRect(mx - mSize / 2, my - mSize / 2, mSize, mSize);
        }

        ctx.restore();
    }

    // =====================================================================
    // 2. CENTER HUB DISK: Deep Obsidian Void with Armored Hexagonal Rim
    // =====================================================================
    ctx.save();
    ctx.translate(centerX + jitterX, centerY + jitterY);

    ctx.beginPath();
    ctx.arc(0, 0, hubRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0214';
    ctx.fill();
    ctx.strokeStyle = `rgba(217, 70, 239, ${0.55 + snarePulse * 0.35})`;
    ctx.lineWidth = Math.max(1.5, 2.0 * s);
    ctx.shadowColor = '#d946ef';
    setCanvasShadowBlur(ctx, (10 + beatPulse * 12) * s);
    ctx.stroke();

    // Harmonic Concentric Frequency Ring inside Hub
    const hubRingR = hubRadius * (0.82 + smoothBass * 0.12);
    ctx.beginPath();
    ctx.arc(0, 0, hubRingR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(168, 85, 247, ${0.35 + beatPulse * 0.35})`;
    ctx.lineWidth = 1.0 * s;
    ctx.setLineDash([Math.round(3 * s), Math.round(4 * s)]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Hexagonal Corrupted Sentinel Armored Base Plate
    const hexR = hubRadius * 0.72;
    ctx.beginPath();
    for (let h = 0; h < 6; h++) {
        const hAng = (h * Math.PI) / 3 - Math.PI / 6;
        const hx = Math.cos(hAng) * hexR;
        const hy = Math.sin(hAng) * hexR;
        if (h === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fillStyle = '#140526';
    ctx.fill();
    ctx.strokeStyle = `rgba(168, 85, 247, ${0.50 + beatPulse * 0.40})`;
    ctx.lineWidth = Math.max(1.0, 1.4 * s);
    ctx.stroke();

    // =====================================================================
    // 3. CENTRAL ATLANTIDEUM CRYSTAL CLUSTER: 5-PIECE RADIANT SHARDS
    // =====================================================================
    // Dynamic anti-gravity hover & transient vertical expansion
    const floatBob = playing ? Math.sin(dissonanceTime * 2.4) * (3.0 * s * fidelity) : Math.sin(dissonanceTime * 1.2) * (1.2 * s);
    const recoilY = playing ? (-beatPulse * 4.0 * s) : 0;
    ctx.translate(0, floatBob + recoilY);

    // Radiant core aura
    const coreGlowR = hubRadius * (0.65 + beatPulse * 0.45);
    const coreGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, coreGlowR);
    coreGlow.addColorStop(0, `rgba(217, 70, 239, ${0.60 + beatPulse * 0.40})`);
    coreGlow.addColorStop(0.5, `rgba(168, 85, 247, ${0.30 + smoothBass * 0.30})`);
    coreGlow.addColorStop(1, 'rgba(10, 2, 20, 0)');
    ctx.fillStyle = coreGlow;
    ctx.beginPath();
    ctx.arc(0, 0, coreGlowR, 0, Math.PI * 2);
    ctx.fill();

    const crystalScale = s * (1.0 + beatPulse * 0.25);

    // Helper: Draw a faceted Atlantideum Shard Diamond
    function drawRadiantShard(cx, cy, w, hTop, hBottom, rot, gradTop, gradBottom, glowColor, strokeColor) {
        ctx.save();
        ctx.translate(cx, cy);
        if (rot !== 0) ctx.rotate(rot);

        ctx.beginPath();
        ctx.moveTo(0, -hTop);
        ctx.lineTo(w, 0);
        ctx.lineTo(0, hBottom);
        ctx.lineTo(-w, 0);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, -hTop, 0, hBottom);
        grad.addColorStop(0, gradTop);
        grad.addColorStop(0.35, '#d946ef');
        grad.addColorStop(0.75, '#7e22ce');
        grad.addColorStop(1, gradBottom);
        ctx.fillStyle = grad;
        ctx.shadowColor = glowColor;
        setCanvasShadowBlur(ctx, (10 + beatPulse * 16) * s);
        ctx.fill();

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(0.8, 1.0 * s);
        ctx.stroke();

        // Facet reflection spine
        ctx.beginPath();
        ctx.moveTo(0, -hTop);
        ctx.lineTo(0, hBottom);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 0.8 * s;
        ctx.stroke();

        ctx.restore();
    }

    // Outer Left Wing Shard (Smallest)
    drawRadiantShard(-18 * crystalScale, 4 * crystalScale, 3.8 * crystalScale, 13 * crystalScale, 11 * crystalScale, -0.55, '#f5d0fe', '#3b0764', '#a855f7', '#e9d5ff');

    // Outer Right Wing Shard (Smallest)
    drawRadiantShard(18 * crystalScale, 4 * crystalScale, 3.8 * crystalScale, 13 * crystalScale, 11 * crystalScale, 0.55, '#f5d0fe', '#3b0764', '#a855f7', '#e9d5ff');

    // Flanking Left Vanguard Shard
    drawRadiantShard(-10 * crystalScale, 1 * crystalScale, 5.5 * crystalScale, 20 * crystalScale, 16 * crystalScale, -0.28, '#fae8ff', '#4a044e', '#d946ef', '#ffffff');

    // Flanking Right Vanguard Shard
    drawRadiantShard(10 * crystalScale, 1 * crystalScale, 5.5 * crystalScale, 20 * crystalScale, 16 * crystalScale, 0.28, '#fae8ff', '#4a044e', '#d946ef', '#ffffff');

    // Central Prime Radiant Spire (Towering Obelisk)
    drawRadiantShard(0, -2 * crystalScale, 8.5 * crystalScale, 28 * crystalScale, 24 * crystalScale, 0, '#ffffff', '#2e0249', '#d946ef', '#ffffff');

    // ---------------------------------------------------------------------
    // 3 ORBITING INVERTED MIRROR SATELLITES (Cosmic Dissonance Collector Shards)
    // ---------------------------------------------------------------------
    for (let sat = 0; sat < 3; sat++) {
        const satAng = dissonanceTime * 0.8 + (sat * Math.PI * 2) / 3;
        const satDistX = hubRadius * 0.78 * Math.cos(satAng);
        const satDistY = hubRadius * 0.44 * Math.sin(satAng); // Elliptical 3D tilt

        ctx.save();
        ctx.translate(satDistX, satDistY);
        const satSize = 2.8 * s;
        ctx.beginPath();
        ctx.moveTo(0, -satSize);
        ctx.lineTo(satSize * 0.7, 0);
        ctx.lineTo(0, satSize);
        ctx.lineTo(-satSize * 0.7, 0);
        ctx.closePath();
        ctx.fillStyle = sat % 2 === 0 ? '#fae8ff' : '#d946ef';
        ctx.shadowColor = '#d946ef';
        setCanvasShadowBlur(ctx, (8 + beatPulse * 8) * s);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.6 * s;
        ctx.stroke();

        // Subtle energy tether arc back to center
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-satDistX * 0.35, -satDistY * 0.35);
        ctx.strokeStyle = `rgba(217, 70, 239, ${0.25 + beatPulse * 0.25})`;
        ctx.lineWidth = 0.6 * s;
        ctx.stroke();

        ctx.restore();
    }

    ctx.restore();
}

function drawDockScene(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
    ctx.save();

    const hoverY = playing ? Math.sin(now * 0.0026) * (3.0 * s) : Math.sin(now * 0.0014) * (1.2 * s);
    ctx.translate(cx, cy + hoverY);

    const auraR = (34 + smoothBass * 22 + beatPulse * 28) * s;
    const auraGrad = ctx.createRadialGradient(0, 0, 4 * s, 0, 0, auraR);
    auraGrad.addColorStop(0, 'rgba(217, 70, 239, 0.45)');
    auraGrad.addColorStop(0.35, 'rgba(168, 85, 247, 0.22)');
    auraGrad.addColorStop(0.7, 'rgba(126, 34, 206, 0.08)');
    auraGrad.addColorStop(1, 'rgba(10, 2, 20, 0)');
    ctx.beginPath();
    ctx.arc(0, 0, auraR, 0, Math.PI * 2);
    ctx.fillStyle = auraGrad;
    ctx.fill();

    if (playing && beatPulse > 0.25) {
        const waveR = (16 + beatPulse * 24) * s;
        ctx.beginPath();
        ctx.ellipse(0, 14 * s, waveR, waveR * 0.42, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(217, 70, 239, ${0.75 * (1.0 - beatPulse * 0.5)})`;
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();
    }

    for (let sat = 0; sat < 4; sat++) {
        const satAng = (sat * Math.PI) / 2 + now * 0.0018;
        const satDistX = 24 * s * Math.cos(satAng);
        const satDistY = 12 * s * Math.sin(satAng);
        ctx.save();
        ctx.translate(satDistX, satDistY);
        ctx.rotate(satAng);
        const satSz = 3.2 * s;
        ctx.beginPath();
        ctx.moveTo(0, -satSz);
        ctx.lineTo(satSz * 0.7, 0);
        ctx.lineTo(0, satSz);
        ctx.lineTo(-satSz * 0.7, 0);
        ctx.closePath();
        ctx.fillStyle = sat % 2 === 0 ? '#fae8ff' : '#d946ef';
        ctx.shadowColor = '#d946ef';
        setCanvasShadowBlur(ctx, (8 + beatPulse * 10) * s);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8 * s;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-satDistX * 0.45, -satDistY * 0.45);
        ctx.strokeStyle = `rgba(217, 70, 239, ${0.35 + beatPulse * 0.35})`;
        ctx.lineWidth = 0.8 * s;
        ctx.stroke();
        ctx.restore();
    }

    const monoW = (11 + beatPulse * 3.5) * s;
    const monoHTop = (24 + beatPulse * 5) * s;
    const monoHBot = 16 * s;

    ctx.beginPath();
    ctx.moveTo(0, -monoHTop);
    ctx.lineTo(-monoW, 0);
    ctx.lineTo(0, monoHBot);
    ctx.closePath();
    const monoGradL = ctx.createLinearGradient(-monoW, -monoHTop, 0, monoHBot);
    monoGradL.addColorStop(0, '#f5d0fe');
    monoGradL.addColorStop(0.3, '#d946ef');
    monoGradL.addColorStop(0.7, '#6b21a8');
    monoGradL.addColorStop(1, '#1e0538');
    ctx.fillStyle = monoGradL;
    ctx.shadowColor = '#d946ef';
    setCanvasShadowBlur(ctx, (14 + beatPulse * 20) * s);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.0, 1.4 * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -monoHTop);
    ctx.lineTo(monoW, 0);
    ctx.lineTo(0, monoHBot);
    ctx.closePath();
    const monoGradR = ctx.createLinearGradient(monoW, -monoHTop, 0, monoHBot);
    monoGradR.addColorStop(0, '#ffffff');
    monoGradR.addColorStop(0.35, '#c084fc');
    monoGradR.addColorStop(0.75, '#581c87');
    monoGradR.addColorStop(1, '#0e021a');
    ctx.fillStyle = monoGradR;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.0, 1.4 * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -monoHTop);
    ctx.lineTo(0, monoHBot);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();

    ctx.save();
    ctx.font = `800 ${Math.max(5, Math.round(5.5 * s))}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#d946ef';
    setCanvasShadowBlur(ctx, 8 * s);
    ctx.textAlign = 'center';



    ctx.restore();

    ctx.fillStyle = 'rgba(217, 70, 239, 0.9)';
    ctx.font = `700 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.shadowColor = '#d946ef';
    setCanvasShadowBlur(ctx, 6 * s);

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
    drawInstrumentRim(ctx, width, height, 'amethyst', playing ? beat : 0);
}
export { drawDockScene };
