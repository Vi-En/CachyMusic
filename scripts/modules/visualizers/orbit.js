import { setCanvasShadowBlur } from './canvas-shadow.js';
// Orbit — detailed scene and companion dock illustration.
import { emitTurntableShockwave, store } from '../state.js';
import { drawInstrumentRim } from './instrument-rim.js';
let eclipseRotation = 0;
function drawScene(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
    if (!ctx || width === 0 || height === 0) return;
    const turntableShockwaves = store.state.turntableShockwaves;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) * 0.48;
    const hubRadius = Math.min(width, height) * 0.20;
    const s = hubRadius / 54;
    const orbitTilt = -0.32;
    const ringAspect = 0.58;
    const shipOrbitR = hubRadius * (1.72 + smoothBass * 0.12);

    if (playing) {
        eclipseRotation += dt * (0.6 + beatPulse * 1.8 + snarePulse * 1.2) * fidelity;
    } else {
        eclipseRotation += dt * 0.18 * fidelity;
    }

    // 1. Acoustic Shockwaves (Electric Cyan & Magenta)
    if (playing && fidelity > 0.15) {
        if (beatPulse > 0.38 && Math.random() < 0.45) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * fidelity, '#00f0ff');
        } else if (snarePulse > 0.42 && Math.random() < 0.40) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.80 * fidelity, '#ff007f');
        }
    }
    for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
        const sw = turntableShockwaves[i];
        sw.r += sw.speed * dt;
        const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
        if (prog >= 1.0) { turntableShockwaves.splice(i, 1); continue; }
        const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
        ctx.save();
        ctx.strokeStyle = sw.color === '#ff007f' ? `rgba(255, 0, 127, ${currentAlpha})` : `rgba(0, 240, 255, ${currentAlpha})`;
        ctx.shadowColor = sw.color || '#00f0ff';
        setCanvasShadowBlur(ctx, (8 + beatPulse * 8 * (0.35 + 0.65 * fidelity)) * s);
        ctx.lineWidth = Math.max(1.0, (2.0 + beatPulse * 1.2) * (1.0 - prog * 0.5));
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // =====================================================================
    // FULL-PLATTER PLANETARY WARP ARCHITECTURE: 3D Celestial Orbit
    // =====================================================================
    ctx.save();
    ctx.translate(centerX, centerY);

    const cosTilt = Math.cos(orbitTilt);
    const sinTilt = Math.sin(orbitTilt);

    function getOrbitPoint(theta) {
        const ex = Math.cos(theta) * shipOrbitR;
        const ey = Math.sin(theta) * shipOrbitR * ringAspect;
        return {
            x: ex * cosTilt - ey * sinTilt,
            y: ex * sinTilt + ey * cosTilt,
            ex,
            ey
        };
    }

    function getOrbitTangent(theta) {
        const dex = -Math.sin(theta) * shipOrbitR;
        const dey = Math.cos(theta) * shipOrbitR * ringAspect;
        const vx = dex * cosTilt - dey * sinTilt;
        const vy = dex * sinTilt + dey * cosTilt;
        const len = Math.hypot(vx, vy) || 1;
        return {
            vx: vx / len,
            vy: vy / len,
            nx: -vy / len,
            ny: vx / len,
            angle: Math.atan2(vy, vx)
        };
    }

    const trailSpan = 0.42 + beatPulse * 0.95 + snarePulse * 0.45 + smoothBass * 0.35;
    const K = 32;
    const trailPts = [];
    for (let i = 0; i <= K; i++) {
        const u = i / K; // 0 at tail tip, 1 at ship engine nozzle
        const th = eclipseRotation - trailSpan * (1 - u);
        const p = getOrbitPoint(th);
        const t = getOrbitTangent(th);
        trailPts.push({ u, x: p.x, y: p.y, ey: p.ey, nx: t.nx, ny: t.ny, angle: t.angle });
    }

    const headPt = trailPts[K];
    const tailPt = trailPts[0];

    // Draw orbital ring arcs (isFront = false for back Z < 0; isFront = true for front Z >= 0)
    function drawRingArcs(isFront) {
        ctx.save();
        ctx.rotate(orbitTilt);
        ctx.scale(1, ringAspect);

        const startAng = isFront ? -0.02 : Math.PI - 0.02;
        const endAng = isFront ? Math.PI + 0.02 : Math.PI * 2 + 0.02;

        // A. Planetary dust rings
        const totalRings = 9;
        for (let r = 0; r < totalRings; r++) {
            if (r === 4 || r === 7) continue; // Cassini division gaps
            const rRad = hubRadius * 1.20 + (r / (totalRings - 1)) * (maxRadius * 0.88 - hubRadius * 1.20);
            const rAlpha = (r % 2 === 0 ? 0.30 : 0.16) + (r === 2 ? beatPulse * 0.35 : snarePulse * 0.2);
            ctx.beginPath();
            ctx.arc(0, 0, rRad, startAng, endAng);
            ctx.strokeStyle = r % 2 === 0 ? `rgba(0, 240, 255, ${rAlpha})` : `rgba(255, 0, 128, ${rAlpha})`;
            ctx.lineWidth = Math.max(0.8, (r === 2 ? 2.4 : 1.2) * s);
            ctx.shadowColor = r % 2 === 0 ? '#00f0ff' : '#ff007f';
            setCanvasShadowBlur(ctx, (r === 2 ? 10 + beatPulse * 12 : 4) * s);
            ctx.stroke();
        }

        // B. Dedicated Starship Orbit Guide Track
        ctx.beginPath();
        ctx.arc(0, 0, shipOrbitR, startAng, endAng);
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.28 + beatPulse * 0.28})`;
        ctx.lineWidth = Math.max(1.0, 1.5 * s);
        ctx.shadowColor = '#00f0ff';
        setCanvasShadowBlur(ctx, (8 + beatPulse * 10) * s);
        ctx.stroke();

        // Subtle dashed telemetry harmonic guide along ship orbit
        ctx.beginPath();
        ctx.arc(0, 0, shipOrbitR, startAng, endAng);
        ctx.setLineDash([4 * s, 10 * s]);
        ctx.strokeStyle = `rgba(255, 0, 128, ${0.22 + snarePulse * 0.22})`;
        ctx.lineWidth = 1 * s;
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();
    }

    // Draw relativistic lightspeed trail ribbon, beams, and warp particles
    function drawLightspeedTrail() {
        // A. Curved Tapered Warp Ribbon
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= K; i++) {
            const pt = trailPts[i];
            const w = 3.6 * s * Math.pow(pt.u, 1.3);
            const px = pt.x + pt.nx * w;
            const py = pt.y + pt.ny * w;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        for (let i = K; i >= 0; i--) {
            const pt = trailPts[i];
            const w = 3.6 * s * Math.pow(pt.u, 1.3);
            const px = pt.x - pt.nx * w;
            const py = pt.y - pt.ny * w;
            ctx.lineTo(px, py);
        }
        ctx.closePath();
        const ribbonGrad = ctx.createLinearGradient(tailPt.x, tailPt.y, headPt.x, headPt.y);
        ribbonGrad.addColorStop(0, 'rgba(255, 0, 127, 0)');
        ribbonGrad.addColorStop(0.35, `rgba(255, 0, 127, ${0.25 + beatPulse * 0.20})`);
        ribbonGrad.addColorStop(0.70, `rgba(0, 240, 255, ${0.45 + beatPulse * 0.30})`);
        ribbonGrad.addColorStop(1, `rgba(255, 255, 255, ${0.80 + beatPulse * 0.20})`);
        ctx.fillStyle = ribbonGrad;
        ctx.shadowColor = '#00f0ff';
        setCanvasShadowBlur(ctx, (10 + beatPulse * 16) * s);
        ctx.fill();
        ctx.restore();

        // B. Triple Ion Jet Stream Curved Lines
        // 1. Center Hyperdrive Beam
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= K; i++) {
            const pt = trailPts[i];
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        }
        const coreGrad = ctx.createLinearGradient(tailPt.x, tailPt.y, headPt.x, headPt.y);
        coreGrad.addColorStop(0, 'rgba(255, 0, 128, 0)');
        coreGrad.addColorStop(0.35, 'rgba(255, 0, 128, 0.4)');
        coreGrad.addColorStop(0.75, '#00f0ff');
        coreGrad.addColorStop(1, '#ffffff');
        ctx.strokeStyle = coreGrad;
        ctx.lineWidth = Math.max(1.0, (2.2 + beatPulse * 1.6) * s);
        ctx.shadowColor = '#00f0ff';
        setCanvasShadowBlur(ctx, (12 + beatPulse * 18) * s);
        ctx.stroke();
        ctx.restore();

        // 2 & 3. Port & Starboard Ion Streams
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= K; i++) {
            const pt = trailPts[i];
            const offset = 2.4 * s * pt.u;
            const px = pt.x - pt.nx * offset;
            const py = pt.y - pt.ny * offset;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.75 + beatPulse * 0.25})`;
        ctx.lineWidth = Math.max(0.7, 1.2 * s);
        ctx.shadowColor = '#00f0ff';
        setCanvasShadowBlur(ctx, 6 * s);
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i <= K; i++) {
            const pt = trailPts[i];
            const offset = 2.4 * s * pt.u;
            const px = pt.x + pt.nx * offset;
            const py = pt.y + pt.ny * offset;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.75 + beatPulse * 0.25})`;
        ctx.lineWidth = Math.max(0.7, 1.2 * s);
        ctx.shadowColor = '#00f0ff';
        setCanvasShadowBlur(ctx, 6 * s);
        ctx.stroke();
        ctx.restore();

        // C. Relativistic Warp Specks / Speed Streaks
        ctx.save();
        for (let i = 3; i < K - 1; i += 3) {
            const pt = trailPts[i];
            const sparkAlpha = Math.sin(pt.u * Math.PI) * (0.6 + beatPulse * 0.4);
            ctx.fillStyle = i % 2 === 0 ? `rgba(255, 255, 255, ${sparkAlpha})` : `rgba(0, 240, 255, ${sparkAlpha})`;
            ctx.shadowColor = '#00f0ff';
            setCanvasShadowBlur(ctx, 4 * s);
            const sparkSize = (1.2 + beatPulse * 0.8) * s;
            ctx.fillRect(pt.x - sparkSize / 2, pt.y - sparkSize / 2, sparkSize, sparkSize);
        }
        ctx.restore();
    }

    // Draw Starship (sleek arrow delta explorer)
    function drawStarship() {
        ctx.save();
        ctx.translate(headPt.x, headPt.y);
        ctx.rotate(headPt.angle);

        // Twin engine nozzle plasma flares
        const nozzleGlowR = (5 + beatPulse * 10) * s;
        for (const engY of [-2.4 * s, 2.4 * s]) {
            const engGrad = ctx.createRadialGradient(-2.5 * s, engY, 0, -2.5 * s, engY, nozzleGlowR);
            engGrad.addColorStop(0, '#ffffff');
            engGrad.addColorStop(0.4, '#00f0ff');
            engGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
            ctx.fillStyle = engGrad;
            ctx.beginPath();
            ctx.arc(-2.5 * s, engY, nozzleGlowR, 0, Math.PI * 2);
            ctx.fill();
        }

        // Starship hull (sleek arrow delta explorer)
        ctx.beginPath();
        ctx.moveTo(5.5 * s, 0);                 // Needle nose
        ctx.lineTo(-3.8 * s, -4.5 * s);         // Port wingtip
        ctx.lineTo(-2.2 * s, -1.8 * s);         // Port engine mount
        ctx.lineTo(-1.2 * s, 0);                // Aft keel indent
        ctx.lineTo(-2.2 * s, 1.8 * s);          // Starboard engine mount
        ctx.lineTo(-3.8 * s, 4.5 * s);          // Starboard wingtip
        ctx.closePath();
        ctx.fillStyle = '#060b18';
        ctx.fill();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = Math.max(1.0, 1.3 * s);
        ctx.shadowColor = '#00f0ff';
        setCanvasShadowBlur(ctx, (6 + beatPulse * 8) * s);
        ctx.stroke();

        // Cockpit canopy luminescent glass
        ctx.beginPath();
        ctx.moveTo(2.8 * s, 0);
        ctx.lineTo(0.2 * s, -1.2 * s);
        ctx.lineTo(-0.8 * s, 0);
        ctx.lineTo(0.2 * s, 1.2 * s);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        setCanvasShadowBlur(ctx, 4 * s);
        ctx.fill();

        ctx.restore();
    }

    // =====================================================================
    // LAYER 1: Deep Space Void & Background Stars & Outer Lensing Ring
    // =====================================================================
    if (fidelity > 0.005) {
        ctx.save();
        ctx.globalAlpha = fidelity;

        // Deep space void disk
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#030510';
        ctx.fill();

        // Distant stars / cosmic dust motes
        for (let st = 0; st < 36; st++) {
            const stAng = (st * 137.5 * Math.PI) / 180 + eclipseRotation * 0.05;
            const stDist = hubRadius * 1.1 + ((st * 7) % Math.round(maxRadius - hubRadius * 1.2));
            const stX = Math.cos(stAng) * stDist;
            const stY = Math.sin(stAng) * stDist;
            const stSize = (st % 3 === 0 ? 1.8 : 1.0) * s;
            ctx.fillStyle = st % 2 === 0 ? 'rgba(0, 240, 255, 0.65)' : 'rgba(255, 0, 128, 0.65)';
            ctx.fillRect(stX, stY, stSize, stSize);
        }

        // Outer Gravitational Lensing Distortion Ring
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius * 0.93, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.35 + beatPulse * 0.35})`;
        ctx.lineWidth = Math.max(1.5, 2.2 * s);
        ctx.shadowColor = '#00f0ff';
        setCanvasShadowBlur(ctx, (12 + beatPulse * 16) * s);
        ctx.stroke();

        ctx.restore();
    }

    // =====================================================================
    // LAYER 2: Back Orbital Half (Background, Z < 0)
    //          Rendered BEFORE the planet sphere so the planet naturally
    //          and smoothly occludes the back rings, trail, and ship.
    // =====================================================================
    if (fidelity > 0.005) {
        ctx.save();
        ctx.globalAlpha = fidelity;

        // Back half of rings (ey <= 0)
        drawRingArcs(false);

        // Back portion of lightspeed trail (ey <= 2)
        ctx.save();
        ctx.rotate(orbitTilt);
        ctx.beginPath();
        ctx.rect(-maxRadius * 2, -maxRadius * 2, maxRadius * 4, maxRadius * 2 + 2);
        ctx.clip();
        ctx.rotate(-orbitTilt);
        drawLightspeedTrail();
        ctx.restore();

        // Starship (when orbiting through the back hemisphere)
        if (headPt.ey < 0) {
            drawStarship();
        }

        ctx.restore();
    }

    // =====================================================================
    // LAYER 3: Blazing Solar Corona Flare on the upper-left (Behind the planet)
    // =====================================================================
    const starOffsetDist = hubRadius * 0.48;
    const starAngle = -Math.PI * 0.72;
    const starX = Math.cos(starAngle) * starOffsetDist;
    const starY = Math.sin(starAngle) * starOffsetDist;
    const coronaR = hubRadius * (1.1 + beatPulse * 0.65 + smoothBass * 0.35);
    const coronaGrad = ctx.createRadialGradient(starX, starY, 4, starX, starY, coronaR);
    coronaGrad.addColorStop(0, '#ffffff');
    coronaGrad.addColorStop(0.2, `rgba(255, 255, 255, ${0.9 + beatPulse * 0.1})`);
    coronaGrad.addColorStop(0.35, `rgba(255, 0, 128, ${0.75 + beatPulse * 0.25})`);
    coronaGrad.addColorStop(0.65, `rgba(179, 0, 89, ${0.35 + snarePulse * 0.25})`);
    coronaGrad.addColorStop(1, 'rgba(5, 8, 20, 0)');
    ctx.fillStyle = coronaGrad;
    ctx.beginPath();
    ctx.arc(starX, starY, coronaR, 0, Math.PI * 2);
    ctx.fill();

    // =====================================================================
    // LAYER 4: Colossal Planetary Dark Sphere & Atmospheric Rim
    // =====================================================================
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, hubRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#050713';
    ctx.fill();

    // Iridescent cyan atmospheric rim light illuminated by the star
    const rimGrad = ctx.createRadialGradient(starX, starY, hubRadius * 0.85, starX, starY, hubRadius * 1.15);
    rimGrad.addColorStop(0, 'rgba(0, 240, 255, 0)');
    rimGrad.addColorStop(0.7, `rgba(0, 240, 255, ${0.45 + beatPulse * 0.40})`);
    rimGrad.addColorStop(0.95, '#00f0ff');
    rimGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = Math.max(1.5, (2.2 + beatPulse * 1.4) * s);
    ctx.shadowColor = '#00f0ff';
    setCanvasShadowBlur(ctx, (8 + beatPulse * 14) * s);
    ctx.stroke();
    ctx.restore();

    // Diamond-Ring Effect: Blinding flash on strong kicks
    if (beatPulse > 0.38) {
        ctx.save();
        const dFlashX = starX + Math.cos(starAngle) * (hubRadius * 0.55);
        const dFlashY = starY + Math.sin(starAngle) * (hubRadius * 0.55);
        const dFlashR = (12 + beatPulse * 28) * s;
        const dfGrad = ctx.createRadialGradient(dFlashX, dFlashY, 0, dFlashX, dFlashY, dFlashR);
        dfGrad.addColorStop(0, '#ffffff');
        dfGrad.addColorStop(0.3, `rgba(255, 240, 200, ${beatPulse * 0.9})`);
        dfGrad.addColorStop(0.6, `rgba(255, 0, 128, ${beatPulse * 0.5})`);
        dfGrad.addColorStop(1, 'rgba(255, 0, 128, 0)');
        ctx.fillStyle = dfGrad;
        ctx.beginPath();
        ctx.arc(dFlashX, dFlashY, dFlashR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // =====================================================================
    // LAYER 5: Front Orbital Half (Foreground, Z >= 0)
    //          Rendered AFTER the planet sphere with ZERO circular cutout,
    //          so the starship and its relativistic trail fly smoothly
    //          and gloriously IN FRONT OF the planet!
    // =====================================================================
    if (fidelity > 0.005) {
        ctx.save();
        ctx.globalAlpha = fidelity;

        // Front half of rings (ey >= 0)
        drawRingArcs(true);

        // Front portion of lightspeed trail (ey >= -2)
        ctx.save();
        ctx.rotate(orbitTilt);
        ctx.beginPath();
        ctx.rect(-maxRadius * 2, -2, maxRadius * 4, maxRadius * 2 + 2);
        ctx.clip();
        ctx.rotate(-orbitTilt);
        drawLightspeedTrail();
        ctx.restore();

        // Starship (when orbiting through the front hemisphere)
        if (headPt.ey >= 0) {
            drawStarship();
        }

        ctx.restore();
    }

    ctx.restore(); // Restore platter center translation
}

function drawDockScene(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
    ctx.save();
    const hoverY = playing ? Math.sin(now * 0.003) * (2.4 * s) : 0;
    ctx.translate(cx, cy + hoverY);

    // Solar Corona Ring & Prominence Plasma Flares
    const coronaR = (17 + beatPulse * 5) * s;
    ctx.save();
    const coronaGrad = ctx.createRadialGradient(0, 0, coronaR * 0.6, 0, 0, coronaR * 1.8);
    coronaGrad.addColorStop(0, '#ffffff');
    coronaGrad.addColorStop(0.25, '#00f0ff');
    coronaGrad.addColorStop(0.65, '#ff007f');
    coronaGrad.addColorStop(1, 'rgba(255, 0, 127, 0)');
    ctx.fillStyle = coronaGrad;
    ctx.beginPath();
    ctx.arc(0, 0, coronaR * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // 8 Solar Prominence Flares
    for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 + now * 0.0012;
        const flareLen = (coronaR * 1.1) + Math.sin(now * 0.006 + i) * (5 * s) + (beatPulse * 9 * s);
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * (coronaR * 0.8), Math.sin(angle) * (coronaR * 0.8));
        ctx.lineTo(Math.cos(angle) * flareLen, Math.sin(angle) * flareLen);
        ctx.strokeStyle = i % 2 === 0 ? '#00f0ff' : '#ff007f';
        ctx.lineWidth = Math.max(0.8, (1.2 + beatPulse * 0.8) * s);
        ctx.stroke();
    }

    // Dark Eclipse Core Disc
    ctx.beginPath();
    ctx.arc(0, 0, coronaR * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = '#06020c';
    ctx.fill();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = Math.max(0.9, 1.2 * s);
    ctx.shadowColor = '#00f0ff';
    setCanvasShadowBlur(ctx, 8 * s);
    ctx.stroke();
    ctx.restore();

    // Helios Solar Scout Cruiser
    ctx.save();
    // Left Wing Crescent
    ctx.beginPath();
    ctx.moveTo(-4 * s, 0);
    ctx.bezierCurveTo(-14 * s, -14 * s, -28 * s, -10 * s, -25 * s, 6 * s);
    ctx.bezierCurveTo(-22 * s, 10 * s, -12 * s, 6 * s, -4 * s, 4 * s);
    ctx.closePath();
    const wingGradL = ctx.createLinearGradient(-26 * s, 0, 0, 0);
    wingGradL.addColorStop(0, '#00f0ff');
    wingGradL.addColorStop(0.6, '#7928ca');
    wingGradL.addColorStop(1, '#ff007f');
    ctx.fillStyle = wingGradL;
    ctx.fill();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = Math.max(0.8, 1.1 * s);
    ctx.stroke();

    // Right Wing Crescent
    ctx.beginPath();
    ctx.moveTo(4 * s, 0);
    ctx.bezierCurveTo(14 * s, -14 * s, 28 * s, -10 * s, 25 * s, 6 * s);
    ctx.bezierCurveTo(22 * s, 10 * s, 12 * s, 6 * s, 4 * s, 4 * s);
    ctx.closePath();
    const wingGradR = ctx.createLinearGradient(26 * s, 0, 0, 0);
    wingGradR.addColorStop(0, '#00f0ff');
    wingGradR.addColorStop(0.6, '#7928ca');
    wingGradR.addColorStop(1, '#ff007f');
    ctx.fillStyle = wingGradR;
    ctx.fill();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = Math.max(0.8, 1.1 * s);
    ctx.stroke();

    // Center Sensor Fuselage
    ctx.beginPath();
    ctx.moveTo(0, -16 * s);
    ctx.lineTo(3.5 * s, -4 * s);
    ctx.lineTo(3.0 * s, 8 * s);
    ctx.lineTo(0, 11 * s);
    ctx.lineTo(-3.0 * s, 8 * s);
    ctx.lineTo(-3.5 * s, -4 * s);
    ctx.closePath();
    ctx.fillStyle = '#0a0212';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.0 * s;
    ctx.stroke();

    // Solar Ion Discharge Trail
    const trailLen = (12 + smoothBass * 22 + beatPulse * 25) * s;
    const trailGrad = ctx.createLinearGradient(0, 11 * s, 0, 11 * s + trailLen);
    trailGrad.addColorStop(0, '#ff007f');
    trailGrad.addColorStop(0.5, '#00f0ff');
    trailGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.beginPath();
    ctx.moveTo(-2 * s, 11 * s);
    ctx.lineTo(0, 11 * s + trailLen);
    ctx.lineTo(2 * s, 11 * s);
    ctx.closePath();
    ctx.fillStyle = trailGrad;
    ctx.shadowColor = '#00f0ff';
    setCanvasShadowBlur(ctx, (8 + beatPulse * 12) * s);
    ctx.fill();
    ctx.restore();

    // Telemetry Subtitle
    ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
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
    drawInstrumentRim(ctx, width, height, 'orbit', playing ? beat : 0);
}
export { drawDockScene };
