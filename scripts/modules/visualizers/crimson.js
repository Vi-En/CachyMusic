// Crimson — detailed scene and companion dock illustration.
import { emitTurntableShockwave, store } from '../state.js';
import { drawInstrumentRim } from './instrument-rim.js';
let atlasLuminance = 0.05;
let atlasRotationAngle = 0;
let atlasPrecessionAngle = 0;

function drawScene(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
    if (!ctx || width === 0 || height === 0) return;
    const turntableShockwaves = store.state.turntableShockwaves;

    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) * 0.48;
    const hubRadius = Math.min(width, height) * 0.20;
    const s = hubRadius / 54;

    // 0. Dynamic Beat Strength & Core Luminance Calculation
    // At rest / quiet: dormant dark obsidian-garnet (~0.05).
    // On heavy beats & drops: ignites up to 1.0 (blazing incandescent crimson & laser white).
    const rawBeatEnergy = Math.min(1.0, 
        beatPulse * 1.15 + 
        snarePulse * 0.75 + 
        smoothBass * 0.90 + 
        smoothMid * 0.30
    );
    const targetLuminance = playing ? Math.min(1.0, 0.05 + rawBeatEnergy * 0.95) : 0.04;

    if (targetLuminance > atlasLuminance) {
        // Explosive instantaneous ignition on musical transients
        atlasLuminance += (targetLuminance - atlasLuminance) * (1.0 - Math.exp(-22.0 * dt));
    } else {
        // Smooth, organic thermal cooldown (cooling celestial plasma)
        atlasLuminance += (targetLuminance - atlasLuminance) * (1.0 - Math.exp(-4.2 * dt));
    }
    atlasLuminance = Math.max(0.04, Math.min(1.0, atlasLuminance));

    // Dynamic Rotational Surge on Beat Transients & Luminance (Scaled by Fidelity: 0 rotation in resting mode)
    if (playing) {
        const rotAccel = (0.25 + atlasLuminance * 2.6 + beatPulse * 1.2) * fidelity;
        atlasRotationAngle += dt * rotAccel;
        const precAccel = (0.18 + atlasLuminance * 1.3 + smoothTreble * 0.8) * fidelity;
        atlasPrecessionAngle += dt * precAccel;
    } else {
        atlasRotationAngle += dt * 0.15 * fidelity;
        atlasPrecessionAngle += dt * 0.08 * fidelity;
    }

    // 1. Acoustic Laser Shockwaves (Concentric ripples only ignite when beat energy surges and fidelity is high)
    if (playing && atlasLuminance > 0.38 && fidelity > 0.15) {
        if (beatPulse > 0.36 && Math.random() < 0.46) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.85 * atlasLuminance * fidelity, '#ff1744');
        } else if (snarePulse > 0.42 && Math.random() < 0.38) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.80 * atlasLuminance * fidelity, '#00e5ff');
        }
    }

    for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
        const sw = turntableShockwaves[i];
        sw.r += sw.speed * dt;
        const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
        if (prog >= 1.0) {
            turntableShockwaves.splice(i, 1);
            continue;
        }
        const currentAlpha = sw.alpha * (1.0 - prog) * Math.min(1.0, atlasLuminance * 1.3) * (0.35 + 0.65 * fidelity);
        ctx.save();
        ctx.strokeStyle = sw.color === '#00e5ff' ? `rgba(0, 229, 255, ${currentAlpha})` : `rgba(255, 23, 68, ${currentAlpha})`;
        ctx.shadowColor = sw.color || '#ff1744';
        ctx.shadowBlur = (8 + atlasLuminance * 12 * (0.35 + 0.65 * fidelity)) * s;
        ctx.lineWidth = Math.max(1.0, (2.0 + atlasLuminance * 1.4) * (1.0 - prog * 0.5));
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // =====================================================================
    // FULL-PLATTER ATLAS ARCHITECTURE: Hexagonal Telemetry Matrix (Outer Platter)
    // Unlocked and smoothly bloomed when Thematic Core is active!
    // =====================================================================
    if (fidelity > 0.005) {
        ctx.save();
        ctx.globalAlpha = fidelity;
        ctx.translate(centerX, centerY);

        // Platter base circle
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#050711';
        ctx.fill();

        // Outer Atlas Containment Laser Rim
        ctx.beginPath();
        ctx.arc(0, 0, maxRadius * 0.94, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 23, 68, ${0.40 + atlasLuminance * 0.50})`;
        ctx.lineWidth = Math.max(1.5, 2.0 * s);
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = (8 + atlasLuminance * 16) * s;
        ctx.stroke();

        // Outer Hexagonal Grid & Radar Crosshairs
        ctx.save();
        ctx.rotate(atlasRotationAngle * 0.2);
        const hexR = maxRadius * 0.82;
        ctx.beginPath();
        for (let h = 0; h < 6; h++) {
            const hAng = (h * Math.PI) / 3;
            const hx = Math.cos(hAng) * hexR;
            const hy = Math.sin(hAng) * hexR;
            if (h === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(0, 229, 255, ${0.20 + atlasLuminance * 0.35})`;
        ctx.lineWidth = Math.max(1.0, 1.4 * s);
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = (6 + atlasLuminance * 10) * s;
        ctx.stroke();

        // 12 Telemetry Spokes & Sector Pointers
        for (let sp = 0; sp < 12; sp++) {
            const spAng = (sp * Math.PI) / 6;
            ctx.beginPath();
            ctx.moveTo(Math.cos(spAng) * hubRadius * 1.2, Math.sin(spAng) * hubRadius * 1.2);
            ctx.lineTo(Math.cos(spAng) * maxRadius * 0.92, Math.sin(spAng) * maxRadius * 0.92);
            ctx.strokeStyle = sp % 3 === 0 ? `rgba(255, 23, 68, ${0.25 + atlasLuminance * 0.4})` : `rgba(0, 229, 255, 0.12)`;
            ctx.lineWidth = sp % 3 === 0 ? 1.4 * s : 0.8 * s;
            ctx.stroke();
        }
        ctx.restore();

        // Telemetry Text Stamps around the perimeter
        ctx.save();
        ctx.rotate(-atlasRotationAngle * 0.15);
        ctx.fillStyle = `rgba(0, 229, 255, ${0.45 + atlasLuminance * 0.45})`;
        ctx.font = `${Math.max(9, Math.round(8 * s))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const glyphs = ['I', 'II', 'III', 'IV'];
        for (let g = 0; g < 4; g++) {
            const gAng = (g * Math.PI) / 2;
            ctx.save();
            ctx.rotate(gAng);
            ctx.translate(0, -maxRadius * 0.88);
            ctx.fillText(glyphs[g], 0, 0);
            ctx.restore();
        }
        ctx.restore();
        ctx.restore();
    }

    // 2. Center Hub Void Platter: Obsidian Diamond Disc with Beat-Responsive Rim
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#060710';
    ctx.fill();
    const platterAlpha = 0.20 + atlasLuminance * 0.80;
    ctx.strokeStyle = atlasLuminance > 0.65 ? `rgba(255, 255, 255, ${platterAlpha})` : `rgba(255, 23, 68, ${platterAlpha})`;
    ctx.lineWidth = Math.max(1.0, (1.2 + atlasLuminance * 1.6) * s);
    ctx.shadowColor = atlasLuminance > 0.65 ? '#ffffff' : '#ff1744';
    ctx.shadowBlur = (atlasLuminance * 22 * (0.35 + 0.65 * fidelity)) * s;
    ctx.stroke();
    ctx.restore();

    // 3. Ambient Radial Nebula Glow (Quiet dark aura when dim, flares into blazing bloom on beat)
    const glowR = hubRadius * (0.50 + atlasLuminance * 0.75);
    const grad = ctx.createRadialGradient(centerX, centerY, 2, centerX, centerY, glowR);
    grad.addColorStop(0, `rgba(255, 23, 68, ${0.04 + atlasLuminance * 0.76})`);
    grad.addColorStop(0.35, `rgba(255, 171, 0, ${atlasLuminance * 0.38})`);
    grad.addColorStop(0.65, `rgba(124, 77, 255, ${atlasLuminance * 0.30})`);
    grad.addColorStop(1, 'rgba(6, 7, 16, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, glowR, 0, Math.PI * 2);
    ctx.fill();

    // 4. Concentric Orbital Coordinate Rings (The Anomaly Telemetry)
    ctx.save();
    ctx.translate(centerX, centerY);

    // Outer Ring 1 (Cyan telemetry ellipse with rotating glyph markers)
    const r1 = (44 + smoothTreble * 14 + atlasLuminance * 16) * s;
    ctx.save();
    ctx.rotate(atlasRotationAngle * 0.45);
    ctx.scale(1, 0.45);
    ctx.beginPath();
    ctx.arc(0, 0, r1, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 229, 255, ${0.15 + atlasLuminance * 0.75})`;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = (atlasLuminance * 16) * s;
    ctx.lineWidth = Math.max(0.7, (0.9 + atlasLuminance * 1.5) * s);
    ctx.setLineDash([Math.round(5 * s), Math.round(7 * s)]);
    ctx.stroke();
    ctx.restore();

    // Outer Ring 2 (Crimson telemetry ellipse with 16-point coordinates)
    const r2 = (38 + smoothBass * 16 + atlasLuminance * 22) * s;
    ctx.save();
    ctx.rotate(-atlasRotationAngle * 0.65);
    ctx.scale(0.55, 1);
    ctx.beginPath();
    ctx.arc(0, 0, r2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 23, 68, ${0.18 + atlasLuminance * 0.75})`;
    ctx.shadowColor = '#ff1744';
    ctx.shadowBlur = (atlasLuminance * 18) * s;
    ctx.lineWidth = Math.max(0.7, (0.9 + atlasLuminance * 1.6) * s);
    ctx.setLineDash([Math.round(6 * s), Math.round(5 * s)]);
    ctx.stroke();
    ctx.restore();

    // Inner Ring 3 (Golden telemetry radar ticks - erupts into view on heavy beats)
    if (atlasLuminance > 0.45) {
        ctx.save();
        ctx.rotate(atlasRotationAngle * 1.1);
        const r3 = (26 + atlasLuminance * 18) * s;
        ctx.beginPath();
        ctx.arc(0, 0, r3, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 171, 0, ${(atlasLuminance - 0.45) * 1.5})`;
        ctx.lineWidth = Math.max(0.8, 1.2 * s);
        ctx.setLineDash([Math.round(3 * s), Math.round(9 * s)]);
        ctx.stroke();
        ctx.restore();
    }

    // 4b. Orbiting Telemetry Coordinates: // 16 // 16 // 16 // 16 //
    ctx.save();
    ctx.rotate(atlasRotationAngle * 0.35);
    ctx.font = `bold ${Math.max(6, Math.round(7.5 * s))}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(0, 229, 255, ${0.12 + atlasLuminance * 0.78})`;
    const runeDist = r1 * 0.95;
    for (let r = 0; r < 4; r++) {
        const rAngle = (r * Math.PI) / 2;
        const rx = Math.cos(rAngle) * runeDist;
        const ry = Math.sin(rAngle) * runeDist * 0.45;
        ctx.fillText('•', rx, ry);
    }
    ctx.restore();

    // 5. 3D Floating Crimson Octahedron (The ATLAS Entity)
    // Starts as a dormant, dark obsidian-garnet crystal, then blazes into searing radiant ruby & white!
    const coreScale = s * (0.92 + atlasLuminance * 0.46);
    const stretchY = 1.0 + (beatPulse * 0.22 - snarePulse * 0.08) * atlasLuminance;
    const stretchX = 1.0 + (snarePulse * 0.16 - beatPulse * 0.06) * atlasLuminance;
    const H = 34 * coreScale * stretchY;
    const R = 22 * coreScale * stretchX;

    const rotY = atlasRotationAngle;
    const tiltX = Math.sin(atlasPrecessionAngle) * 0.25;

    function project(x, y, z) {
        const y1 = y * Math.cos(tiltX) - z * Math.sin(tiltX);
        const z1 = y * Math.sin(tiltX) + z * Math.cos(tiltX);
        return { px: x, py: -z1, depth: y1 };
    }

    const topPt = project(0, 0, H);
    const botPt = project(0, 0, -H);

    const eqPts = [];
    for (let i = 0; i < 4; i++) {
        const angle = rotY + (i * Math.PI) / 2;
        const x = Math.cos(angle) * R;
        const y = Math.sin(angle) * R;
        eqPts.push(project(x, y, 0));
    }

    const faces = [];
    for (let i = 0; i < 4; i++) {
        const nextI = (i + 1) % 4;
        faces.push({
            pts: [topPt, eqPts[i], eqPts[nextI]],
            isTop: true,
            avgDepth: (topPt.depth + eqPts[i].depth + eqPts[nextI].depth) / 3
        });
        faces.push({
            pts: [botPt, eqPts[nextI], eqPts[i]],
            isTop: false,
            avgDepth: (botPt.depth + eqPts[nextI].depth + eqPts[i].depth) / 3
        });
    }

    faces.sort((a, b) => a.avgDepth - b.avgDepth);

    for (let f of faces) {
        const p0 = f.pts[0];
        const p1 = f.pts[1];
        const p2 = f.pts[2];

        const v1x = p1.px - p0.px;
        const v1y = p1.py - p0.py;
        const v2x = p2.px - p0.px;
        const v2y = p2.py - p0.py;
        const cross = v1x * v2y - v1y * v2x;

        const isFront = cross > 0;
        const lightNorm = isFront ? 0.75 : 0.35;
        const lightFactor = Math.min(1.0, lightNorm + (f.isTop ? 0.2 : 0.0) + (p1.depth > 0 ? 0.15 : -0.1));

        ctx.beginPath();
        ctx.moveTo(p0.px, p0.py);
        ctx.lineTo(p1.px, p1.py);
        ctx.lineTo(p2.px, p2.py);
        ctx.closePath();

        // Dynamic Facet Color:
        // When dim (atlasLuminance ~ 0.05): Dark obsidian garnet (#220408 to #3a0812)
        // As beat strength rises (atlasLuminance -> 1.0): Blazes into radiant incandescent crimson (#ff1744) -> cherry ruby -> white-hot core
        const baseDimRed = 30 + 38 * lightFactor; // 30..68 (dark obsidian)
        const maxBrightRed = 212 + 43 * lightFactor; // 212..255 (flaming crimson)
        const redVal = Math.min(255, Math.round(baseDimRed + (maxBrightRed - baseDimRed) * atlasLuminance));

        // Green and Blue stay near zero in dim state (deep garnet), then swell on heavy beats for searing incandescence
        const peakHeat = Math.max(0, (atlasLuminance - 0.40) / 0.60);
        const greenVal = Math.min(220, Math.round(5 + 10 * lightFactor + peakHeat * (65 + snarePulse * 85)));
        const blueVal = Math.min(230, Math.round(10 + 15 * lightFactor + peakHeat * (85 + snarePulse * 90)));
        const alphaVal = isFront 
            ? Math.min(1.0, 0.60 + atlasLuminance * 0.40) 
            : Math.min(1.0, 0.30 + atlasLuminance * 0.65);

        ctx.fillStyle = `rgba(${redVal}, ${greenVal}, ${blueVal}, ${alphaVal})`;
        ctx.fill();

        // Facet edges flare from subtle dormant contour to razor-sharp laser white with crimson bloom
        if (atlasLuminance > 0.58 && isFront) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.65 + atlasLuminance * 0.35})`;
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = (atlasLuminance * 20) * s;
        } else {
            const edgeAlpha = 0.20 + atlasLuminance * 0.80;
            ctx.strokeStyle = isFront
                ? `rgba(255, 40, 80, ${edgeAlpha})`
                : `rgba(200, 15, 45, ${edgeAlpha * 0.7})`;
            ctx.shadowColor = '#ff1744';
            ctx.shadowBlur = (atlasLuminance * 16) * s;
        }
        ctx.lineWidth = Math.max(0.7, (0.8 + atlasLuminance * 1.5) * s);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // 6. Atlas Core Singularity Spark (Dormant garnet ember -> blazing stellar pulsar)
    const sparkBaseR = 2.5 * coreScale;
    const sparkMaxR = 10.0 * coreScale;
    const sparkR = sparkBaseR + (sparkMaxR - sparkBaseR) * atlasLuminance;

    const sparkGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, sparkR);
    if (atlasLuminance > 0.38) {
        sparkGrad.addColorStop(0, '#ffffff');
        sparkGrad.addColorStop(0.35, '#ff1744');
        sparkGrad.addColorStop(0.75, `rgba(255, 23, 68, ${atlasLuminance * 0.75})`);
        sparkGrad.addColorStop(1, 'rgba(255, 23, 68, 0)');
    } else {
        sparkGrad.addColorStop(0, `rgba(255, 60, 80, ${0.35 + atlasLuminance * 0.65})`);
        sparkGrad.addColorStop(0.5, `rgba(180, 10, 30, ${0.20 + atlasLuminance * 0.40})`);
        sparkGrad.addColorStop(1, 'rgba(255, 23, 68, 0)');
    }
    ctx.fillStyle = sparkGrad;
    ctx.beginPath();
    ctx.arc(0, 0, sparkR, 0, Math.PI * 2);
    ctx.fill();

    // Anamorphic Cross-Diffraction Laser Spikes (Ignite on heavy beat energy)
    if (playing && atlasLuminance > 0.42) {
        const flareIntensity = (atlasLuminance - 0.42) / 0.58;
        ctx.save();
        ctx.rotate(atlasRotationAngle * 1.25);
        const flareLen = (18 + flareIntensity * 58) * coreScale;
        const flareWidth = Math.max(1.0, (1.2 + flareIntensity * 2.4) * s);
        for (let f = 0; f < 4; f++) {
            const fAngle = (f * Math.PI) / 2;
            ctx.save();
            ctx.rotate(fAngle);
            const fGrad = ctx.createLinearGradient(0, 0, flareLen, 0);
            fGrad.addColorStop(0, `rgba(255, 255, 255, ${flareIntensity})`);
            fGrad.addColorStop(0.25, `rgba(255, 23, 68, ${flareIntensity * 0.9})`);
            fGrad.addColorStop(0.65, `rgba(0, 229, 255, ${flareIntensity * 0.5})`);
            fGrad.addColorStop(1, 'rgba(255, 23, 68, 0)');
            ctx.strokeStyle = fGrad;
            ctx.lineWidth = flareWidth;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(flareLen, 0);
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }

    ctx.restore();
}

function drawDockScene(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
    ctx.save();

    const hoverY = playing ? Math.sin(now * 0.0024) * (2.2 * s) : Math.sin(now * 0.0012) * (1.0 * s);
    const platY = cy + hoverY;
    ctx.translate(cx, platY);

    const auraR = (34 + smoothBass * 24 + beatPulse * 30) * s;
    const auraGrad = ctx.createRadialGradient(0, -8 * s, 4 * s, 0, -8 * s, auraR);
    auraGrad.addColorStop(0, 'rgba(255, 23, 68, 0.45)');
    auraGrad.addColorStop(0.35, 'rgba(213, 0, 0, 0.22)');
    auraGrad.addColorStop(0.7, 'rgba(124, 77, 255, 0.08)');
    auraGrad.addColorStop(1, 'rgba(8, 2, 12, 0)');
    ctx.beginPath();
    ctx.arc(0, -8 * s, auraR, 0, Math.PI * 2);
    ctx.fillStyle = auraGrad;
    ctx.fill();

    ctx.save();
    const baseW = 38 * s;
    const baseH = 16 * s;
    const baseY = 10 * s;

    ctx.beginPath();
    ctx.ellipse(0, baseY + 6 * s, baseW * 1.05, baseH * 0.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(2, 4, 10, 0.85)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-baseW, baseY);
    ctx.lineTo(-baseW * 0.65, baseY + baseH * 0.7);
    ctx.lineTo(baseW * 0.65, baseY + baseH * 0.7);
    ctx.lineTo(baseW, baseY);
    ctx.lineTo(baseW * 0.65, baseY - baseH * 0.6);
    ctx.lineTo(-baseW * 0.65, baseY - baseH * 0.6);
    ctx.closePath();
    const platBaseGrad = ctx.createLinearGradient(0, baseY - baseH * 0.6, 0, baseY + baseH * 0.7);
    platBaseGrad.addColorStop(0, '#1a050d');
    platBaseGrad.addColorStop(0.5, '#0d0208');
    platBaseGrad.addColorStop(1, '#050104');
    ctx.fillStyle = platBaseGrad;
    ctx.fill();
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = Math.max(1.0, 1.4 * s);
    ctx.shadowColor = '#ff1744';
    ctx.shadowBlur = (8 + beatPulse * 10) * s;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, baseY - baseH * 0.55);
    ctx.lineTo(baseW * 0.85, baseY);
    ctx.lineTo(0, baseY + baseH * 0.55);
    ctx.lineTo(-baseW * 0.85, baseY);
    ctx.closePath();
    const floorGrad = ctx.createLinearGradient(0, baseY - baseH * 0.55, 0, baseY + baseH * 0.55);
    floorGrad.addColorStop(0, '#2d0818');
    floorGrad.addColorStop(0.5, '#12030a');
    floorGrad.addColorStop(1, '#060105');
    ctx.fillStyle = floorGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 23, 68, 0.75)';
    ctx.lineWidth = 1.0 * s;
    ctx.stroke();

    [-baseW * 0.55, -baseW * 0.25, baseW * 0.25, baseW * 0.55].forEach((gx) => {
        ctx.beginPath();
        ctx.moveTo(gx, baseY);
        ctx.lineTo(0, baseY);
        ctx.strokeStyle = `rgba(255, 23, 68, ${0.45 + beatPulse * 0.45})`;
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();
    });

    const wellR = (7.5 + beatPulse * 3.5) * s;
    ctx.beginPath();
    ctx.ellipse(0, baseY, wellR, wellR * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ff1744';
    ctx.shadowBlur = (14 + beatPulse * 20) * s;
    ctx.fill();

    if (playing && beatPulse > 0.28) {
        const rippleR = wellR * (1.2 + beatPulse * 1.5);
        ctx.beginPath();
        ctx.ellipse(0, baseY, rippleR, rippleR * 0.55, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.85 * (1.0 - beatPulse * 0.5)})`;
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();
    }

    [-baseW * 0.7, -baseW * 0.35, baseW * 0.35, baseW * 0.7].forEach((px, pIdx) => {
        const py = (pIdx === 0 || pIdx === 3) ? baseY : baseY - baseH * 0.35;
        const pilH = (8 + ((pIdx % 2) * 4)) * s;
        ctx.beginPath();
        ctx.moveTo(px - 1.8 * s, py);
        ctx.lineTo(px, py - pilH);
        ctx.lineTo(px + 1.8 * s, py);
        ctx.closePath();
        ctx.fillStyle = '#0a0106';
        ctx.fill();
        ctx.strokeStyle = '#ff1744';
        ctx.lineWidth = 0.9 * s;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py - pilH, 1.2 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = 6 * s;
        ctx.fill();
    });
    ctx.restore();

    const coreCenterY = -12 * s - (beatPulse * 3.5 * s);
    const coreW = (13 + smoothBass * 4 + beatPulse * 5) * s;
    const coreH = (22 + smoothBass * 5 + beatPulse * 7) * s;

    ctx.save();
    ctx.translate(0, coreCenterY);
    const haloRot = now * 0.0018;
    ctx.rotate(haloRot);
    const haloRingR = coreH * 0.82;
    ctx.beginPath();
    ctx.ellipse(0, 0, haloRingR, haloRingR * 0.45, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 23, 68, 0.45)';
    ctx.lineWidth = 1.0 * s;
    ctx.stroke();

    for (let sh = 0; sh < 4; sh++) {
        const shAng = (sh * Math.PI) / 2;
        const shx = Math.cos(shAng) * haloRingR;
        const shy = Math.sin(shAng) * haloRingR * 0.45;
        ctx.save();
        ctx.translate(shx, shy);
        ctx.rotate(shAng + haloRot);
        ctx.beginPath();
        ctx.moveTo(0, -3.2 * s);
        ctx.lineTo(2.2 * s, 0);
        ctx.lineTo(0, 3.2 * s);
        ctx.lineTo(-2.2 * s, 0);
        ctx.closePath();
        ctx.fillStyle = '#060105';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8 * s;
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = 6 * s;
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(0, coreCenterY);
    ctx.beginPath();
    ctx.moveTo(-coreW * 1.15, -coreH * 0.35);
    ctx.lineTo(-coreW * 0.7, -coreH * 0.75);
    ctx.lineTo(-coreW * 0.5, 0);
    ctx.lineTo(-coreW * 0.7, coreH * 0.75);
    ctx.lineTo(-coreW * 1.15, coreH * 0.35);
    ctx.closePath();
    ctx.fillStyle = '#080106';
    ctx.fill();
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 1.1 * s;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(coreW * 1.15, -coreH * 0.35);
    ctx.lineTo(coreW * 0.7, -coreH * 0.75);
    ctx.lineTo(coreW * 0.5, 0);
    ctx.lineTo(coreW * 0.7, coreH * 0.75);
    ctx.lineTo(coreW * 1.15, coreH * 0.35);
    ctx.closePath();
    ctx.fillStyle = '#080106';
    ctx.fill();
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 1.1 * s;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -coreH);
    ctx.lineTo(coreW, 0);
    ctx.lineTo(0, coreH);
    ctx.lineTo(-coreW, 0);
    ctx.closePath();
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreH);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.25, '#ff5252');
    coreGrad.addColorStop(0.65, '#d50000');
    coreGrad.addColorStop(0.9, '#5f091c');
    coreGrad.addColorStop(1, '#1a0105');
    ctx.fillStyle = coreGrad;
    ctx.shadowColor = '#ff1744';
    ctx.shadowBlur = (16 + beatPulse * 24) * s;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.0, 1.4 * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -coreH);
    ctx.lineTo(0, coreH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();

    ctx.restore();

    ctx.fillStyle = 'rgba(255, 23, 68, 0.9)';
    ctx.font = `700 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff1744';
    ctx.shadowBlur = 6 * s;

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
    drawInstrumentRim(ctx, width, height, 'crimson', playing ? beat : 0);
}
export { drawDockScene };
