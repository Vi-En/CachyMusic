import { setCanvasShadowBlur } from './canvas-shadow.js';
// Alloy — detailed scene and companion dock illustration.
import { emitTurntableShockwave, store } from '../state.js';
import { drawInstrumentRim } from './instrument-rim.js';
let sentinelTime = 0;
function drawScene(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0, bands = null) {
    if (!ctx || width === 0 || height === 0) return;
    const turntableShockwaves = store.state.turntableShockwaves;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) * 0.48;
    const hubRadius = Math.min(width, height) * 0.21;
    const s = hubRadius / 54;

    if (playing) {
        sentinelTime += dt * (0.85 + beatPulse * 0.85) * fidelity;
    } else {
        sentinelTime += dt * 0.20 * fidelity;
    }

    const isCombat = playing && (beatPulse > 0.38);

    // 1. Acoustic Shockwaves (Aeron Patrol Cyan & Alert Crimson)
    if (playing && fidelity > 0.15) {
        if (beatPulse > 0.38 && Math.random() < 0.45) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * fidelity, '#ff2a00');
        } else if (snarePulse > 0.42 && Math.random() < 0.40) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.80 * fidelity, '#00e5ff');
        }
    }
    for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
        const sw = turntableShockwaves[i];
        sw.r += sw.speed * dt;
        const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
        if (prog >= 1.0) { turntableShockwaves.splice(i, 1); continue; }
        const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
        ctx.save();
        ctx.strokeStyle = sw.color === '#ff2a00' ? `rgba(255, 42, 0, ${currentAlpha})` : `rgba(0, 229, 255, ${currentAlpha})`;
        ctx.shadowColor = sw.color || '#00e5ff';
        setCanvasShadowBlur(ctx, (10 + beatPulse * 10 * (0.35 + 0.65 * fidelity)) * s);
        ctx.lineWidth = Math.max(1.0, (2.2 + beatPulse * 1.5) * (1.0 - prog * 0.5));
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // =====================================================================
    // FULL-PLATTER ARCHITECTURE: 360° Planetary Security Nexus
    // =====================================================================
    if (fidelity > 0.005) {
        ctx.save();
        ctx.globalAlpha = fidelity;
        ctx.translate(centerX, centerY);

        // 1. Base Carbon Void Disc with Atmospheric Radial Energy Aura
        const bgGrad = ctx.createRadialGradient(0, 0, hubRadius * 0.5, 0, 0, maxRadius);
        bgGrad.addColorStop(0, '#090e17');
        bgGrad.addColorStop(0.45, '#05080e');
        bgGrad.addColorStop(0.85, '#03050a');
        bgGrad.addColorStop(1, '#020306');
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
        ctx.fillStyle = bgGrad;
        ctx.fill();

        // Atmospheric Breathing Halo
        const haloGrad = ctx.createRadialGradient(0, 0, hubRadius, 0, 0, maxRadius * 0.95);
        haloGrad.addColorStop(0, isCombat ? 'rgba(255, 42, 0, 0.14)' : 'rgba(0, 229, 255, 0.12)');
        haloGrad.addColorStop(0.4, isCombat ? 'rgba(255, 42, 0, 0.05)' : 'rgba(0, 229, 255, 0.04)');
        haloGrad.addColorStop(1, 'rgba(2, 4, 8, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius * 0.95, 0, Math.PI * 2);
        ctx.fillStyle = haloGrad;
        ctx.fill();

        // 2. High-Tech Precision Outer Bezel & Calibration Teeth
        ctx.save();
        ctx.rotate(-sentinelTime * 0.05);
        const outerRimR = maxRadius * 0.97;
        const innerRimR = maxRadius * 0.925;
        ctx.beginPath();
        ctx.arc(0, 0, outerRimR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
        ctx.lineWidth = 1.0;
        ctx.stroke();

        // Micro-Calibration Teeth on Perimeter
        const teethCount = 48;
        for (let t = 0; t < teethCount; t++) {
            const tAng = (t * Math.PI * 2) / teethCount;
            const isCardinal = (t % 12 === 0);
            const isSub = (t % 4 === 0);
            const rStart = isCardinal ? innerRimR * 0.96 : (isSub ? innerRimR * 0.98 : innerRimR);
            const cosT = Math.cos(tAng);
            const sinT = Math.sin(tAng);
            ctx.beginPath();
            ctx.moveTo(cosT * rStart, sinT * rStart);
            ctx.lineTo(cosT * outerRimR, sinT * outerRimR);
            ctx.strokeStyle = isCardinal ? '#ff2a00' : (isSub ? '#00e5ff' : 'rgba(248, 250, 252, 0.22)');
            ctx.lineWidth = isCardinal ? 1.8 : (isSub ? 1.2 : 0.8);
            ctx.stroke();
        }

        // 4 Cardinal Aeron Reticle Brackets (0°, 90°, 180°, 270°)
        for (let c = 0; c < 4; c++) {
            const cAng = (c * Math.PI) / 2;
            ctx.save();
            ctx.rotate(cAng);
            ctx.translate(outerRimR * 0.99, 0);
            ctx.beginPath();
            ctx.moveTo(-6 * s, -4 * s);
            ctx.lineTo(0, 0);
            ctx.lineTo(-6 * s, 4 * s);
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 1.4 * s;
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();

        // 3. Counter-Rotating Gyroscopic Telemetry Rings
        // Outer Gyro Ring (Segmented Telemetry Track with Degree Glyphs)
        ctx.save();
        ctx.rotate(sentinelTime * 0.08);
        const gyroOuterR = maxRadius * 0.87;
        const segments = 4;
        const segGap = 0.22;
        const segSpan = (Math.PI * 2 / segments) - segGap;
        for (let sg = 0; sg < segments; sg++) {
            const sgStart = sg * (Math.PI * 2 / segments) + segGap / 2;
            const sgEnd = sgStart + segSpan;
            ctx.beginPath();
            ctx.arc(0, 0, gyroOuterR, sgStart, sgEnd);
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
            ctx.lineWidth = 1.2 * s;
            ctx.stroke();

            // Bracket corner tick
            const cosStart = Math.cos(sgStart);
            const sinStart = Math.sin(sgStart);
            ctx.beginPath();
            ctx.moveTo(cosStart * (gyroOuterR - 3 * s), sinStart * (gyroOuterR - 3 * s));
            ctx.lineTo(cosStart * (gyroOuterR + 3 * s), sinStart * (gyroOuterR + 3 * s));
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5 * s;
            ctx.stroke();
        }

        ctx.restore();

        // Inner Gyro Ring (Precision Dotted Telemetry)
        ctx.save();
        ctx.rotate(-sentinelTime * 0.12);
        const gyroInnerR = maxRadius * 0.76;
        ctx.beginPath();
        ctx.arc(0, 0, gyroInnerR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(248, 250, 252, 0.18)';
        ctx.lineWidth = 1.0;
        ctx.setLineDash([3 * s, 5 * s]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // 4. 64-Ray High-Density Laser Audio Horizon (Radial Frequency Telemetry)
        const numRays = 64;
        const rayBaseR = hubRadius * 1.16;
        const maxRayLen = (gyroInnerR * 0.94 - rayBaseR);
        ctx.save();
        let prevTipX = 0, prevTipY = 0, firstTipX = 0, firstTipY = 0;
        for (let sp = 0; sp < numRays; sp++) {
            const spAng = (sp * Math.PI * 2) / numRays + sentinelTime * 0.03;
            let bVal = 0.16;
            if (bands && bands.length > 0) {
                const bIdx = Math.floor((sp / numRays) * bands.length);
                bVal = bands[bIdx] || 0.16;
            } else if (playing) {
                bVal = 0.18 + 0.32 * Math.sin(now * 0.0035 + sp * 0.28);
            }
            const rayLen = bVal * maxRayLen * (0.88 + beatPulse * 0.38);
            const cosA = Math.cos(spAng);
            const sinA = Math.sin(spAng);
            const startX = cosA * rayBaseR;
            const startY = sinA * rayBaseR;
            const tipX = cosA * (rayBaseR + rayLen);
            const tipY = sinA * (rayBaseR + rayLen);

            // Filament color grading: Bass = Fiery Crimson/Orange, Mid = Gold/Amber, Treble = Neon Cyan/White
            const normSp = sp / numRays;
            let strokeColor = '#00e5ff';
            if (normSp < 0.25 || normSp > 0.75) {
                strokeColor = '#ff2a00';
            } else if (normSp < 0.40 || normSp > 0.60) {
                strokeColor = '#ff9100';
            }

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(tipX, tipY);
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = Math.max(0.9, (1.2 + bVal * 1.6) * s);
            ctx.shadowColor = strokeColor;
            setCanvasShadowBlur(ctx, (4 + bVal * 8) * s);
            ctx.stroke();

            // Radiant White Tip Spark Bead
            ctx.beginPath();
            ctx.arc(tipX, tipY, (1.0 + bVal * 1.8) * s, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#ffffff';
            setCanvasShadowBlur(ctx, (6 + bVal * 10) * s);
            ctx.fill();

            // Faint perimeter wave mesh connection between tips
            if (sp === 0) {
                firstTipX = tipX;
                firstTipY = tipY;
            } else {
                ctx.beginPath();
                ctx.moveTo(prevTipX, prevTipY);
                ctx.lineTo(tipX, tipY);
                ctx.strokeStyle = `rgba(0, 229, 255, ${0.12 + bVal * 0.25})`;
                ctx.lineWidth = 0.6 * s;
                setCanvasShadowBlur(ctx, 0);
                ctx.stroke();
            }
            prevTipX = tipX;
            prevTipY = tipY;
        }
        if (numRays > 1) {
            ctx.beginPath();
            ctx.moveTo(prevTipX, prevTipY);
            ctx.lineTo(firstTipX, firstTipY);
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
            ctx.lineWidth = 0.6 * s;
            ctx.stroke();
        }
        ctx.restore();

        // 5. Tactical Combat Radar Sweep with Alert Flaring
        if (playing) {
            ctx.save();
            ctx.rotate(now * 0.002);
            const radarSweepR = gyroInnerR * 0.98;
            const sweepGrad = ctx.createRadialGradient(0, 0, hubRadius, 0, 0, radarSweepR);
            if (isCombat) {
                sweepGrad.addColorStop(0, 'rgba(255, 42, 0, 0.45)');
                sweepGrad.addColorStop(0.5, 'rgba(255, 42, 0, 0.18)');
                sweepGrad.addColorStop(1, 'rgba(255, 42, 0, 0)');
            } else {
                sweepGrad.addColorStop(0, 'rgba(0, 229, 255, 0.35)');
                sweepGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.12)');
                sweepGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
            }
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, radarSweepR, -0.42, 0);
            ctx.closePath();
            ctx.fillStyle = sweepGrad;
            ctx.fill();

            // Leading Tactical Radar Ray
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(radarSweepR, 0);
            ctx.strokeStyle = isCombat ? '#ff2a00' : '#00e5ff';
            ctx.lineWidth = 1.8 * s;
            ctx.shadowColor = isCombat ? '#ff2a00' : '#00e5ff';
            setCanvasShadowBlur(ctx, 12 * s);
            ctx.stroke();

            // Radar Contact Ping Blips
            [0.45, 0.72, 0.88].forEach((distMult) => {
                const bx = radarSweepR * distMult;
                const by = 0;
                ctx.beginPath();
                ctx.arc(bx, by, (1.8 + snarePulse * 1.5) * s, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#ffffff';
                setCanvasShadowBlur(ctx, 8 * s);
                ctx.fill();
            });
            ctx.restore();
        }

        // 6. 32 Floating 3D Ion Particles (Atmospheric Energy Dust)
        ctx.save();
        const numParticles = 32;
        for (let p = 0; p < numParticles; p++) {
            const pSpeed = 0.0007 + (p % 4) * 0.0003;
            const pPhase = (now * pSpeed + p * 1.37) % (Math.PI * 2);
            const pOrbitR = hubRadius * 1.15 + ((p * 37) % Math.round(maxRadius * 0.65 - hubRadius));
            const pTilt = 0.55 + ((p % 5) * 0.08); // 3D elliptical tilt
            const px = Math.cos(pPhase) * pOrbitR;
            const py = Math.sin(pPhase) * pOrbitR * pTilt;
            const pAlpha = 0.35 + 0.55 * Math.abs(Math.sin(pPhase));
            const pSize = (1.2 + ((p % 3) * 0.7) + beatPulse * 0.6) * s;
            const isAmberParticle = (p % 3 === 0);

            ctx.beginPath();
            ctx.arc(px, py, pSize, 0, Math.PI * 2);
            ctx.fillStyle = isAmberParticle ? `rgba(255, 145, 0, ${pAlpha})` : `rgba(0, 229, 255, ${pAlpha})`;
            ctx.shadowColor = isAmberParticle ? '#ff9100' : '#00e5ff';
            setCanvasShadowBlur(ctx, 6 * s);
            ctx.fill();
        }
        ctx.restore();

        // 7. Integrated Holographic Wanted HUD Arc (Top Arc - Conformal Geometry)
        ctx.save();
        const arcR = gyroOuterR + 1.5 * s;
        const arcSpan = 0.44; // radians on each side of -Math.PI / 2
        const arcStart = -Math.PI / 2 - arcSpan;
        const arcEnd = -Math.PI / 2 + arcSpan;

        // Curved Conformal Carbon Backing Strip
        ctx.beginPath();
        ctx.arc(0, 0, arcR + 15 * s, arcStart, arcEnd);
        ctx.arc(0, 0, arcR - 9 * s, arcEnd, arcStart, true);
        ctx.closePath();
        ctx.fillStyle = 'rgba(6, 10, 18, 0.94)';
        ctx.fill();
        ctx.strokeStyle = isCombat ? 'rgba(255, 42, 0, 0.75)' : 'rgba(0, 229, 255, 0.55)';
        ctx.lineWidth = 1.0 * s;
        ctx.stroke();

        // Telemetry Arc Text: AERON WANTED // LVL 5 (Upper portion of backing strip)
        ctx.font = `800 ${Math.max(6, Math.round(7.5 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff3d00';
        ctx.shadowColor = '#ff2a00';
        setCanvasShadowBlur(ctx, (8 + beatPulse * 10) * s);


        // 5 Holographic Wanted Diamond Glyphs along the arc (Lower portion of backing strip)
        const pipsCount = 5;
        for (let p = 0; p < pipsCount; p++) {
            const pFrac = (p - (pipsCount - 1) / 2) / (pipsCount - 1);
            const pipAngle = -Math.PI / 2 + pFrac * (arcSpan * 1.25);
            const pipR = arcR - 1.5 * s;
            const pipX = Math.cos(pipAngle) * pipR;
            const pipY = Math.sin(pipAngle) * pipR;

            ctx.save();
            ctx.translate(pipX, pipY);
            ctx.rotate(pipAngle + Math.PI / 4);
            const pipSz = (4.0 + beatPulse * 1.8) * s;
            ctx.fillStyle = '#ff2a00';
            ctx.shadowColor = '#ff2a00';
            setCanvasShadowBlur(ctx, (10 + beatPulse * 12) * s);
            ctx.fillRect(-pipSz / 2, -pipSz / 2, pipSz, pipSz);

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.0 * s;
            ctx.strokeRect(-pipSz / 2, -pipSz / 2, pipSz, pipSz);

            // Flaring diamond corona on heavy transients
            if (playing && beatPulse > 0.35) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.lineWidth = 0.6 * s;
                ctx.strokeRect(-pipSz * 0.9, -pipSz * 0.9, pipSz * 1.8, pipSz * 1.8);
            }
            ctx.restore();
        }
        ctx.restore();

        // 8. Integrated Holographic Diagnostics Arc (Bottom Arc - Conformal Geometry)
        ctx.save();
        const diagSpan = 0.42;
        const diagStart = Math.PI / 2 - diagSpan;
        const diagEnd = Math.PI / 2 + diagSpan;

        ctx.beginPath();
        ctx.arc(0, 0, arcR + 9 * s, diagStart, diagEnd);
        ctx.arc(0, 0, arcR - 9 * s, diagEnd, diagStart, true);
        ctx.closePath();
        ctx.fillStyle = 'rgba(6, 10, 18, 0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.60)';
        ctx.lineWidth = 1.0 * s;
        ctx.stroke();

        ctx.font = `700 ${Math.max(5, Math.round(6.5 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        setCanvasShadowBlur(ctx, 6 * s);

        ctx.restore();

        ctx.restore();
    }

    // =====================================================================
    // CENTRAL HUB: Articulated 3D Sentinel Drone Centerpiece (Aeron Unit)
    // =====================================================================
    ctx.save();
    ctx.translate(centerX, centerY);

    // 1. Anti-Gravity Drone Hover Physics & Dynamic Banking
    const hoverY = playing
        ? (Math.sin(sentinelTime * 2.2) * (2.8 * s) - (beatPulse * 3.8 * s))
        : (Math.sin(sentinelTime * 1.1) * (1.0 * s));
    const bankAng = playing
        ? (Math.sin(now * 0.0022) * 0.035 + snarePulse * 0.025)
        : 0;

    // Base Docking Ring (Deep Carbon Gimbal Platform behind the Drone)
    ctx.beginPath();
    ctx.arc(0, 0, hubRadius, 0, Math.PI * 2);
    const dockGrad = ctx.createRadialGradient(0, 0, hubRadius * 0.25, 0, 0, hubRadius);
    dockGrad.addColorStop(0, '#0c1422');
    dockGrad.addColorStop(0.65, '#070b14');
    dockGrad.addColorStop(1, '#03050a');
    ctx.fillStyle = dockGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.75)';
    ctx.lineWidth = Math.max(1.6, 2.2 * s);
    ctx.shadowColor = '#00e5ff';
    setCanvasShadowBlur(ctx, (12 + beatPulse * 14) * s);
    ctx.stroke();

    // 12 Recessed Socket Hex Bolts on Hub Rim
    for (let b = 0; b < 12; b++) {
        const bAng = (b * Math.PI * 2) / 12;
        const bx = Math.cos(bAng) * (hubRadius * 0.92);
        const by = Math.sin(bAng) * (hubRadius * 0.92);
        ctx.beginPath();
        ctx.arc(bx, by, 1.2 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#94a3b8';
        ctx.fill();
    }

    // Inner Mechanical Circuit Trench
    ctx.beginPath();
    ctx.arc(0, 0, hubRadius * 0.78, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 229, 255, ${0.25 + beatPulse * 0.35})`;
    ctx.lineWidth = 1.0 * s;
    ctx.setLineDash([4 * s, 4 * s]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Hover Transform Applied to Floating Drone Chassis
    ctx.translate(0, hoverY);
    ctx.rotate(bankAng);

    // 2. Twin Ion Plasma Thruster Plumes
    const thrusterX = 15 * s;
    const thrusterY = 17 * s;
    const plumeLen = (20 + smoothBass * 34 + beatPulse * 44) * s;
    const plumeW = (6.0 + beatPulse * 3.5) * s;
    [-thrusterX, thrusterX].forEach(tx => {
        ctx.save();
        const jetGrad = ctx.createLinearGradient(tx, thrusterY, tx, thrusterY + plumeLen);
        if (isCombat) {
            jetGrad.addColorStop(0, '#ffffff');
            jetGrad.addColorStop(0.25, '#ff2a00');
            jetGrad.addColorStop(0.65, 'rgba(255, 42, 0, 0.45)');
            jetGrad.addColorStop(1, 'rgba(255, 42, 0, 0)');
        } else {
            jetGrad.addColorStop(0, '#ffffff');
            jetGrad.addColorStop(0.25, '#00e5ff');
            jetGrad.addColorStop(0.65, 'rgba(0, 229, 255, 0.45)');
            jetGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
        }
        ctx.beginPath();
        ctx.moveTo(tx - plumeW / 2, thrusterY);
        ctx.quadraticCurveTo(tx - plumeW * 0.65, thrusterY + plumeLen * 0.5, tx, thrusterY + plumeLen);
        ctx.quadraticCurveTo(tx + plumeW * 0.65, thrusterY + plumeLen * 0.5, tx + plumeW / 2, thrusterY);
        ctx.closePath();
        ctx.fillStyle = jetGrad;
        ctx.shadowColor = isCombat ? '#ff2a00' : '#00e5ff';
        setCanvasShadowBlur(ctx, (14 + beatPulse * 18) * s);
        ctx.fill();

        // Inner Blazing White Core Jet
        ctx.beginPath();
        ctx.moveTo(tx - plumeW * 0.25, thrusterY);
        ctx.lineTo(tx, thrusterY + plumeLen * 0.55);
        ctx.lineTo(tx + plumeW * 0.25, thrusterY);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
    });

    // 3. Articulated Ceramic Armor Wing Cowlings with Exposed Glowing Heatsinks
    const flareSpread = playing ? (beatPulse * 4.8 * s) : 0;

    // --- Left Wing Cowling ---
    ctx.save();
    // Exposed Glowing Orange Heatsink Grille behind Left Armor Plate
    ctx.beginPath();
    ctx.moveTo(-10 * s, -10 * s);
    ctx.lineTo(-24 * s - flareSpread * 0.6, -4 * s);
    ctx.lineTo(-26 * s - flareSpread * 0.6, 8 * s);
    ctx.lineTo(-12 * s, 12 * s);
    ctx.closePath();
    ctx.fillStyle = '#1e1b18';
    ctx.fill();
    for (let sl = 0; sl < 4; sl++) {
        const sly = -2 * s + sl * 3.2 * s;
        ctx.beginPath();
        ctx.moveTo(-12 * s, sly);
        ctx.lineTo(-22 * s - flareSpread * 0.4, sly - 2 * s);
        ctx.strokeStyle = `rgba(255, 87, 34, ${0.75 + beatPulse * 0.25})`;
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();
    }

    // Left Outer Ceramic Wing Armor Plate
    ctx.beginPath();
    ctx.moveTo(-10 * s, -15 * s);
    ctx.lineTo(-28 * s - flareSpread, -6 * s);
    ctx.lineTo(-30 * s - flareSpread, 8 * s);
    ctx.lineTo(-14 * s, 15 * s);
    ctx.lineTo(-8 * s, 4 * s);
    ctx.closePath();
    const lWingGrad = ctx.createLinearGradient(-30 * s, -15 * s, -8 * s, 15 * s);
    lWingGrad.addColorStop(0, '#ffffff');
    lWingGrad.addColorStop(0.4, '#e2e8f0');
    lWingGrad.addColorStop(0.8, '#94a3b8');
    lWingGrad.addColorStop(1, '#334155');
    ctx.fillStyle = lWingGrad;
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = Math.max(1.2, 1.5 * s);
    ctx.shadowColor = '#00e5ff';
    setCanvasShadowBlur(ctx, 6 * s);
    ctx.stroke();

    // Left Wing Specular Edge Chamfer
    ctx.beginPath();
    ctx.moveTo(-10 * s, -15 * s);
    ctx.lineTo(-28 * s - flareSpread, -6 * s);
    ctx.lineTo(-30 * s - flareSpread, 8 * s);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();

    // Left Wing Hazard Stripe Accent
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(-30 * s - flareSpread, 1 * s);
    ctx.lineTo(-14 * s, 11 * s);
    ctx.strokeStyle = '#ff2a00';
    ctx.lineWidth = 3.2 * s;
    ctx.shadowColor = '#ff2a00';
    setCanvasShadowBlur(ctx, 8 * s);
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // --- Right Wing Cowling ---
    ctx.save();
    // Exposed Glowing Orange Heatsink Grille behind Right Armor Plate
    ctx.beginPath();
    ctx.moveTo(10 * s, -10 * s);
    ctx.lineTo(24 * s + flareSpread * 0.6, -4 * s);
    ctx.lineTo(26 * s + flareSpread * 0.6, 8 * s);
    ctx.lineTo(12 * s, 12 * s);
    ctx.closePath();
    ctx.fillStyle = '#1e1b18';
    ctx.fill();
    for (let sl = 0; sl < 4; sl++) {
        const sly = -2 * s + sl * 3.2 * s;
        ctx.beginPath();
        ctx.moveTo(12 * s, sly);
        ctx.lineTo(22 * s + flareSpread * 0.4, sly - 2 * s);
        ctx.strokeStyle = `rgba(255, 87, 34, ${0.75 + beatPulse * 0.25})`;
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();
    }

    // Right Outer Ceramic Wing Armor Plate
    ctx.beginPath();
    ctx.moveTo(10 * s, -15 * s);
    ctx.lineTo(28 * s + flareSpread, -6 * s);
    ctx.lineTo(30 * s + flareSpread, 8 * s);
    ctx.lineTo(14 * s, 15 * s);
    ctx.lineTo(8 * s, 4 * s);
    ctx.closePath();
    const rWingGrad = ctx.createLinearGradient(30 * s, -15 * s, 8 * s, 15 * s);
    rWingGrad.addColorStop(0, '#ffffff');
    rWingGrad.addColorStop(0.4, '#e2e8f0');
    rWingGrad.addColorStop(0.8, '#94a3b8');
    rWingGrad.addColorStop(1, '#334155');
    ctx.fillStyle = rWingGrad;
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = Math.max(1.2, 1.5 * s);
    ctx.shadowColor = '#00e5ff';
    setCanvasShadowBlur(ctx, 6 * s);
    ctx.stroke();

    // Right Wing Specular Edge Chamfer
    ctx.beginPath();
    ctx.moveTo(10 * s, -15 * s);
    ctx.lineTo(28 * s + flareSpread, -6 * s);
    ctx.lineTo(30 * s + flareSpread, 8 * s);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();

    // Right Wing Hazard Stripe Accent
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(30 * s + flareSpread, 1 * s);
    ctx.lineTo(14 * s, 11 * s);
    ctx.strokeStyle = '#ff2a00';
    ctx.lineWidth = 3.2 * s;
    ctx.shadowColor = '#ff2a00';
    setCanvasShadowBlur(ctx, 8 * s);
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // 4. Main Aeron Drone Body Chassis (Matte White Faceted Armor Shell)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, -28 * s);
    ctx.lineTo(13 * s, -13 * s);
    ctx.lineTo(15 * s, 6 * s);
    ctx.lineTo(9 * s, 20 * s);
    ctx.lineTo(-9 * s, 20 * s);
    ctx.lineTo(-15 * s, 6 * s);
    ctx.lineTo(-13 * s, -13 * s);
    ctx.closePath();
    const bodyGrad = ctx.createLinearGradient(0, -28 * s, 0, 20 * s);
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(0.35, '#f8fafc');
    bodyGrad.addColorStop(0.7, '#cbd5e1');
    bodyGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = Math.max(1.2, 1.6 * s);
    ctx.shadowColor = '#00e5ff';
    setCanvasShadowBlur(ctx, 8 * s);
    ctx.stroke();

    // Central Facet Ridge (Illuminated 3D Spine)
    ctx.beginPath();
    ctx.moveTo(0, -28 * s);
    ctx.lineTo(0, 20 * s);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();

    // Top Spire Sensor Fin
    ctx.beginPath();
    ctx.moveTo(0, -27 * s);
    ctx.lineTo(6 * s, -16 * s);
    ctx.lineTo(-6 * s, -16 * s);
    ctx.closePath();
    ctx.fillStyle = '#060a12';
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 0.9 * s;
    ctx.stroke();
    ctx.restore();

    // Recessed twin radiator banks, with no circular focal element.
    drawHullVents(ctx, s, 1, playing ? beatPulse : 0);

    ctx.restore();
}

function drawDockScene(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
    ctx.save();

    // Anti-gravity levitation hover & mechanical banking
    const hoverY = playing ? Math.sin(now * 0.0036) * (3.2 * s) : Math.sin(now * 0.0018) * (1.2 * s);
    const bankAngle = playing ? (Math.sin(now * 0.0024) * 0.04 + (snarePulse * 0.03)) : 0;
    const droneY = cy + hoverY;

    ctx.translate(cx, droneY);
    ctx.rotate(bankAngle);

    // Lateral Ion Repulsor Jet Thrusters (Left & Right)
    const thrusterX = 14 * s;
    const thrusterY = 6 * s;
    const plumeLen = (18 + smoothBass * 32 + beatPulse * 38) * s;
    const plumeW = (4.8 + beatPulse * 2.8) * s;
    const isCombatJet = (playing && beatPulse > 0.40);

    [-thrusterX, thrusterX].forEach((tx) => {
        ctx.save();
        const jetGrad = ctx.createLinearGradient(tx, thrusterY, tx, thrusterY + plumeLen);
        if (isCombatJet) {
            jetGrad.addColorStop(0, '#ffffff');
            jetGrad.addColorStop(0.2, '#ff3d00');
            jetGrad.addColorStop(0.6, 'rgba(255, 61, 0, 0.45)');
            jetGrad.addColorStop(1, 'rgba(255, 61, 0, 0)');
        } else {
            jetGrad.addColorStop(0, '#ffffff');
            jetGrad.addColorStop(0.2, '#00e5ff');
            jetGrad.addColorStop(0.6, 'rgba(0, 229, 255, 0.45)');
            jetGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
        }

        ctx.beginPath();
        ctx.moveTo(tx - plumeW / 2, thrusterY);
        ctx.quadraticCurveTo(tx - plumeW * 0.6, thrusterY + plumeLen * 0.5, tx, thrusterY + plumeLen);
        ctx.quadraticCurveTo(tx + plumeW * 0.6, thrusterY + plumeLen * 0.5, tx + plumeW / 2, thrusterY);
        ctx.closePath();
        ctx.fillStyle = jetGrad;
        ctx.shadowColor = isCombatJet ? '#ff3d00' : '#00e5ff';
        setCanvasShadowBlur(ctx, (12 + beatPulse * 18) * s);
        ctx.fill();
        ctx.restore();
    });

    // Articulated Lateral Ceramic Flare Winglets
    const flareSpread = playing ? (beatPulse * 3.8 * s) : 0;
    ctx.save();
    // Left Winglet
    ctx.beginPath();
    ctx.moveTo(-6 * s, -8 * s);
    ctx.lineTo(-24 * s - flareSpread, -2 * s);
    ctx.lineTo(-26 * s - flareSpread, 8 * s);
    ctx.lineTo(-12 * s, 6 * s);
    ctx.lineTo(-6 * s, 10 * s);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = Math.max(0.9, 1.2 * s);
    ctx.stroke();

    // Right Winglet
    ctx.beginPath();
    ctx.moveTo(6 * s, -8 * s);
    ctx.lineTo(24 * s + flareSpread, -2 * s);
    ctx.lineTo(26 * s + flareSpread, 8 * s);
    ctx.lineTo(12 * s, 6 * s);
    ctx.lineTo(6 * s, 10 * s);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = Math.max(0.9, 1.2 * s);
    ctx.stroke();
    ctx.restore();

    // Main Drone Body (Hardened Graphite Core & Matte Ceramic Shell)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, -22 * s);
    ctx.lineTo(10 * s, -10 * s);
    ctx.lineTo(12 * s, 4 * s);
    ctx.lineTo(7 * s, 14 * s);
    ctx.lineTo(-7 * s, 14 * s);
    ctx.lineTo(-12 * s, 4 * s);
    ctx.lineTo(-10 * s, -10 * s);
    ctx.closePath();
    const hullGrad = ctx.createLinearGradient(0, -22 * s, 0, 14 * s);
    hullGrad.addColorStop(0, '#ffffff');
    hullGrad.addColorStop(0.35, '#e2e8f0');
    hullGrad.addColorStop(0.7, '#1e293b');
    hullGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = hullGrad;
    ctx.fill();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = Math.max(1.0, 1.4 * s);
    ctx.stroke();

    // Central Graphite Inset
    ctx.beginPath();
    ctx.moveTo(0, -16 * s);
    ctx.lineTo(6 * s, -6 * s);
    ctx.lineTo(6 * s, 8 * s);
    ctx.lineTo(-6 * s, 8 * s);
    ctx.lineTo(-6 * s, -6 * s);
    ctx.closePath();
    ctx.fillStyle = '#070a12';
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.8 * s;
    ctx.stroke();

    drawHullVents(ctx, s, 0.58, playing ? beatPulse : 0);

    ctx.restore();

    // Floating 5-Star Alert HUD Reticle above Drone: [ ◆ ◆ ◆ ◆ ◆ ] WANTED LEVEL: 5
    ctx.save();
    const reticleY = -27 * s;
    ctx.fillStyle = '#ff3d00';
    ctx.shadowColor = '#ff3d00';
    setCanvasShadowBlur(ctx, 8 * s);
    ctx.font = `800 ${Math.max(6, Math.round(7.5 * s))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';

    ctx.fillStyle = 'rgba(0, 229, 255, 0.9)';
    ctx.shadowColor = '#00e5ff';
    setCanvasShadowBlur(ctx, 5 * s);

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
    drawInstrumentRim(ctx, width, height, 'alloy', playing ? beat : 0);
}
export { drawDockScene };

function drawHullVents(ctx, scale, size, energy) {
    const s = scale * size;
    ctx.save();
    setCanvasShadowBlur(ctx, 0);
    for (const side of [-1, 1]) {
        const x = side < 0 ? -10 * s : 3 * s;
        ctx.fillStyle = '#18232e';
        ctx.fillRect(x, -9 * s, 7 * s, 19 * s);
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = Math.max(.6, s * .55);
        ctx.strokeRect(x, -9 * s, 7 * s, 19 * s);
        ctx.fillStyle = `rgba(100, 208, 220, ${0.45 + Math.min(1, Math.max(0, energy)) * 0.4})`;
        for (let row = 0; row < 4; row++) ctx.fillRect(x + s, (-6 + row * 4) * s, 5 * s, s);
    }
    ctx.restore();
}
