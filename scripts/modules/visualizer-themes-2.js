// CachyMusic - Turntable Center Visualizers (Abyssal Void, Dissonance, Sentinel, Heart, Brutalist, Touhou)
import { isFirefox } from './utils.js';
import { emitShockwave, emitTurntableShockwave, store } from './state.js';
import { getActiveTheme, isAtlasThemeActive } from './ui-elements.js';

    let abyssalTime = 0;
    function drawTurntableCenterAbyssalVoid(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
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
            const rangeLabels = ['100M', '250M', '500M'];
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

    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center DISSONANCE (No Man's Sky Interceptor)
    // Luminous Atlantideum violet crystals, Dissonance Resonator core,
    // Corrupted Sentinel scanning HUD, inverted mirror runes & purple haze
    // -------------------------------------------------------------------------
    let dissonanceTime = 0;
    function drawTurntableCenterDissonance(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0, bands = null) {
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
            ctx.shadowBlur = (10 + beatPulse * 10 * (0.35 + 0.65 * fidelity)) * s;
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
            ctx.shadowBlur = (12 + beatPulse * 16) * s;
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
                    ctx.shadowBlur = (6 + beatPulse * 8) * s;
                } else {
                    ctx.shadowBlur = 0;
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
                    ctx.shadowBlur = 6 * s;
                    ctx.fill();
                    ctx.restore();
                }
            }
            ctx.restore();

            // Corrupted Telemetry Glyphs: 16 // ECHO // DISSONANCE // ATLANTIDEUM
            ctx.font = `600 ${Math.max(9, Math.round(7.5 * s))}px "JetBrains Mono", monospace`;
            ctx.fillStyle = 'rgba(217, 70, 239, 0.9)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#d946ef';
            ctx.shadowBlur = 4 * s;
            const glyphs = ['16.16.16.16', 'ECHO // SEED', 'ATLANTIDEUM', 'NULL // VOID'];
            for (let g = 0; g < 4; g++) {
                const gAng = (g * Math.PI) / 2 + dissonanceTime * 0.05;
                ctx.save();
                ctx.rotate(gAng);
                ctx.translate(0, -maxRadius * 0.82);
                ctx.fillText(glyphs[g], 0, 0);
                ctx.restore();
            }

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
            ctx.shadowBlur = 10 * s;
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
                ctx.shadowBlur = 6 * s;
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
        ctx.shadowBlur = (10 + beatPulse * 12) * s;
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
            ctx.shadowBlur = (10 + beatPulse * 16) * s;
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
            ctx.shadowBlur = (8 + beatPulse * 8) * s;
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

    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center Sentinel Defense Nexus (No Man's Sky)
    // High-fidelity Aeron Enforcer Centerpiece: Volumetric atmospheric aura, 64-ray
    // dense laser frequency horizon, counter-rotating gyroscopic telemetry rings,
    // integrated holographic Wanted HUD arc, tactical radar with combat alert flare,
    // 32 floating 3D ion embers, and an articulated 3D-shaded Aeron Drone with
    // ceramic armor plates, flaring wing cowlings, exposed glowing heatsinks,
    // dual ion thrusters, and a convex multi-aperture cyclops eye.
    // -------------------------------------------------------------------------
    let sentinelTime = 0;
    function drawTurntableCenterSentinel(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0, bands = null) {
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
            ctx.shadowBlur = (10 + beatPulse * 10 * (0.35 + 0.65 * fidelity)) * s;
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

            // Degree Telemetry Glyphs
            const degLabels = ['090°', '180°', '270°', '360°'];
            ctx.font = `700 ${Math.max(5, Math.round(6.0 * s))}px "JetBrains Mono", monospace`;
            ctx.fillStyle = 'rgba(0, 229, 255, 0.75)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let d = 0; d < 4; d++) {
                const dAng = (d * Math.PI) / 2 + Math.PI / 4;
                const dx = Math.cos(dAng) * (gyroOuterR - 7 * s);
                const dy = Math.sin(dAng) * (gyroOuterR - 7 * s);
                ctx.fillText(degLabels[d], dx, dy);
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
                ctx.shadowBlur = (4 + bVal * 8) * s;
                ctx.stroke();

                // Radiant White Tip Spark Bead
                ctx.beginPath();
                ctx.arc(tipX, tipY, (1.0 + bVal * 1.8) * s, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = (6 + bVal * 10) * s;
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
                    ctx.shadowBlur = 0;
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
                ctx.shadowBlur = 12 * s;
                ctx.stroke();

                // Radar Contact Ping Blips
                [0.45, 0.72, 0.88].forEach((distMult) => {
                    const bx = radarSweepR * distMult;
                    const by = 0;
                    ctx.beginPath();
                    ctx.arc(bx, by, (1.8 + snarePulse * 1.5) * s, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowColor = '#ffffff';
                    ctx.shadowBlur = 8 * s;
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
                ctx.shadowBlur = 6 * s;
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
            ctx.shadowBlur = (8 + beatPulse * 10) * s;
            ctx.fillText('AERON WANTED // LVL 5', 0, -arcR - 7.5 * s);

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
                ctx.shadowBlur = (10 + beatPulse * 12) * s;
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
            ctx.shadowBlur = 6 * s;
            ctx.fillText('[ ATLAN PROTOCOL // SYS_PURGE ]', 0, arcR);
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
        ctx.shadowBlur = (12 + beatPulse * 14) * s;
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
            ctx.shadowBlur = (14 + beatPulse * 18) * s;
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
        ctx.shadowBlur = 6 * s;
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
        ctx.shadowBlur = 8 * s;
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
        ctx.shadowBlur = 6 * s;
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
        ctx.shadowBlur = 8 * s;
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
        ctx.shadowBlur = 8 * s;
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

        // 5. Multi-Ring Mechanical Cyclops Optic (Heart of the Aeron Drone)
        ctx.save();
        const eyeR = 12.5 * s;

        // Outer Gunmetal Bezel Collar
        ctx.beginPath();
        ctx.arc(0, 0, eyeR * 1.28, 0, Math.PI * 2);
        ctx.fillStyle = '#070b14';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.4, 1.8 * s);
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 8 * s;
        ctx.stroke();

        // 8 Recessed Socket Screws on Bezel
        for (let b = 0; b < 8; b++) {
            const bAng = (b * Math.PI) / 4;
            const bx = Math.cos(bAng) * eyeR * 1.14;
            const by = Math.sin(bAng) * eyeR * 1.14;
            ctx.beginPath();
            ctx.arc(bx, by, 1.0 * s, 0, Math.PI * 2);
            ctx.fillStyle = '#94a3b8';
            ctx.fill();
        }

        // Rotating Mechanical Iris Diaphragm Blades
        ctx.save();
        ctx.rotate(sentinelTime * 0.4);
        const irisBlades = 6;
        for (let ib = 0; ib < irisBlades; ib++) {
            const ibAng = (ib * Math.PI * 2) / irisBlades;
            const ix1 = Math.cos(ibAng) * (eyeR * 1.05);
            const iy1 = Math.sin(ibAng) * (eyeR * 1.05);
            const ix2 = Math.cos(ibAng + 0.5) * (eyeR * 0.72);
            const iy2 = Math.sin(ibAng + 0.5) * (eyeR * 0.72);
            ctx.beginPath();
            ctx.moveTo(ix1, iy1);
            ctx.lineTo(ix2, iy2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
            ctx.lineWidth = 0.9 * s;
            ctx.stroke();
        }
        ctx.restore();

        // Deep Convex Spherical Glass Lens (Instant Shift to Alert Crimson on Transients)
        const eyeColor = isCombat ? '#ff1744' : '#00e5ff';
        const eyeCoreGrad = ctx.createRadialGradient(0, 0, eyeR * 0.1, 0, 0, eyeR);
        eyeCoreGrad.addColorStop(0, '#ffffff');
        eyeCoreGrad.addColorStop(0.28, eyeColor);
        eyeCoreGrad.addColorStop(0.72, isCombat ? '#b71c1c' : '#0284c7');
        eyeCoreGrad.addColorStop(1, '#020617');
        ctx.beginPath();
        ctx.arc(0, 0, eyeR, 0, Math.PI * 2);
        ctx.fillStyle = eyeCoreGrad;
        ctx.shadowColor = eyeColor;
        ctx.shadowBlur = (16 + beatPulse * 24) * s;
        ctx.fill();

        // Glowing Optical Pupil Slit
        const pupilW = (2.2 + snarePulse * 2.0) * s;
        const pupilH = eyeR * 0.74;
        ctx.beginPath();
        ctx.ellipse(0, 0, pupilW, pupilH, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 12 * s;
        ctx.fill();

        // Horizontal Scanning Laser Needle
        if (playing) {
            const scanX = Math.sin(now * 0.0075) * (eyeR * 0.68);
            ctx.beginPath();
            ctx.moveTo(scanX, -eyeR * 0.82);
            ctx.lineTo(scanX, eyeR * 0.82);
            ctx.strokeStyle = isCombat ? '#ffffff' : '#e0f7fa';
            ctx.lineWidth = 1.1 * s;
            ctx.stroke();
        }

        // Specular Convex Glass Glare Arc (Gives Photorealistic 3D Lens Depth)
        ctx.beginPath();
        ctx.arc(0, 0, eyeR * 0.78, -Math.PI * 0.85, -Math.PI * 0.25);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.4 * s;
        ctx.stroke();

        ctx.restore();

        ctx.restore();
    }


    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center Touhou Heart & Yin-Yang Medallion
    // Rendered on the center hub of the vinyl turntable when Thematic Wave is active
    // Balanced, refined heartbeat response ("not too much" over-exaggeration)
    // -------------------------------------------------------------------------
    function drawTurntableCenterHeart(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
        if (!ctx || width === 0 || height === 0) return;
        const st = store.state;
        const turntableShockwaves = st.turntableShockwaves;

        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) * 0.48;

        // Hub radius: anchor center record label (~40% of turntable diameter)
        const hubRadius = Math.min(width, height) * 0.20;
        const s = hubRadius / 54;
        const heartPulse = st.smoothHeartPulse;

        if (playing) {
            st.runeRingAngle += dt * (1.2 + smoothTreble * 2.2 + beatPulse * 1.4);
            st.yinYangAngle += dt * (1.2 + smoothBass * 1.8 + smoothTreble * 2.0);
        } else {
            st.runeRingAngle += dt * 0.45;
            st.yinYangAngle += dt * 0.45;
        }
        const runeRingAngle = st.runeRingAngle;
        const yinYangAngle = st.yinYangAngle;

        // 1. Acoustic Shockwaves: Concentric soundwaves expanding across vinyl (high fidelity)
        if (playing && beatPulse > 0.40 && Math.random() < 0.36 && fidelity > 0.15) {
            emitTurntableShockwave(centerX, centerY, hubRadius, maxRadius, 0.72 * fidelity, '#ffffff');
        }

        for (let i = turntableShockwaves.length - 1; i >= 0; i--) {
            const sw = turntableShockwaves[i];
            sw.r += sw.speed * dt;
            const prog = (sw.r - sw.minR) / (sw.maxR - sw.minR);
            if (prog >= 1.0) {
                turntableShockwaves.splice(i, 1);
                continue;
            }
            const currentAlpha = sw.alpha * (1.0 - prog) * (0.35 + 0.65 * fidelity);
            ctx.save();
            ctx.strokeStyle = `rgba(255, 255, 255, ${currentAlpha})`;
            ctx.lineWidth = Math.max(0.8, 1.8 * (1.0 - prog * 0.5));
            ctx.setLineDash([Math.round(4 * s), Math.round(6 * s)]);
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // =====================================================================
        // OUTER VINYL RINGS ARCHITECTURE (Harmonic resonance & spectrum dots)
        // =====================================================================
        if (fidelity > 0.005) {
            ctx.save();
            ctx.globalAlpha = fidelity;

            // 2. Harmonic Outer Resonance Ring (Radiating across vinyl grooves)
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(runeRingAngle * 1.5 * fidelity);
            const harmonicRadius = hubRadius + (28 * s + smoothMid * 34 * s + snarePulse * 22 * s);
            const harmonicAlpha = Math.max(0.12, (0.28 + snarePulse * 0.35) * Math.max(0, 1.0 - (harmonicRadius / maxRadius)));
            ctx.strokeStyle = `rgba(255, 255, 255, ${harmonicAlpha})`;
            ctx.lineWidth = Math.max(0.8, 1.1 * s);
            ctx.setLineDash([Math.round(3 * s), Math.round(8 * s)]);
            ctx.beginPath();
            ctx.arc(0, 0, harmonicRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // 3. Primary Visualizer Dots Ring (Freely expanding across vinyl grooves)
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(-runeRingAngle * 2.2 * fidelity);
            const dotsRadius = hubRadius + (12 * s + smoothBass * 38 * s + beatPulse * 26 * s);
            const dotsAlpha = Math.max(0.20, (0.58 + beatPulse * 0.35) * Math.max(0, 1.0 - (dotsRadius / maxRadius)));
            ctx.strokeStyle = `rgba(255, 255, 255, ${dotsAlpha})`;
            ctx.lineWidth = Math.max(1.0, 1.4 * s);
            ctx.setLineDash([Math.round(4 * s), Math.round(6 * s)]);
            ctx.beginPath();
            ctx.arc(0, 0, dotsRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            ctx.restore();
        }

        // 4. Center Turntable Hub: Dark Disc with Crisp White Border
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#080808';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.2, (1.5 + beatPulse * 0.5) * s);
        ctx.stroke();
        ctx.restore();

        // 5. Ambient Radial Bloom inside the hub
        const glowR = hubRadius * (playing ? (0.85 + beatPulse * 0.30) : 0.75);
        const grad = ctx.createRadialGradient(centerX, centerY, 3, centerX, centerY, glowR);
        grad.addColorStop(0, 'rgba(255, 255, 255, ' + ((0.35 + beatPulse * 0.38) * (0.4 + 0.6 * fidelity)) + ')');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, ' + ((0.08 + beatPulse * 0.15) * (0.4 + 0.6 * fidelity)) + ')');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowR, 0, Math.PI * 2);
        ctx.fill();

        // 6. Inner Dashed Rune Ring with 8 Radial Trigram Ticks (Inside the hub)
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(runeRingAngle * fidelity);

        ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.65 + beatPulse * 0.30) + ')';
        ctx.lineWidth = Math.max(1, 1.3 * s);
        ctx.setLineDash([Math.round(5 * s), Math.round(5 * s)]);
        ctx.beginPath();
        ctx.arc(0, 0, 42 * s * heartPulse, 0, Math.PI * 2);
        ctx.stroke();

        // 8 Radial Trigram Ticks
        for (let a = 0; a < 8; a++) {
            const angle = (a * Math.PI) / 4;
            const r1 = 39 * s * heartPulse;
            const r2 = 45 * s * heartPulse;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
            ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
            ctx.stroke();
        }
        ctx.restore();

        // 7. Solid White Touhou Heart Silhouette with Soft Bloom
        ctx.save();
        ctx.translate(centerX, centerY);
        const hScale = s * heartPulse;
        ctx.scale(hScale, hScale);

        ctx.beginPath();
        ctx.moveTo(0, -9);
        // Left top lobe
        ctx.bezierCurveTo(-8, -24, -26, -22, -26, -6);
        // Left curve down to bottom apex
        ctx.bezierCurveTo(-26, 9, -14, 19, 0, 26);
        // Right curve up from bottom apex
        ctx.bezierCurveTo(14, 19, 26, 9, 26, -6);
        // Right top lobe back to top notch
        ctx.bezierCurveTo(26, -22, 8, -24, 0, -9);
        ctx.closePath();

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255, 255, 255, ' + (0.8 + beatPulse * 0.2) + ')';
        ctx.shadowBlur = (4 + beatPulse * 15 * (0.35 + 0.65 * fidelity)) * s;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Subtle dark contour line
        ctx.lineWidth = 1.0;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.stroke();

        // 8. Rotating Yin-Yang Medallion in Center of Heart
        ctx.save();
        ctx.translate(0, 1.5);
        ctx.rotate(yinYangAngle * fidelity);

        const r = 10.5;

        // Circular Medallion Outer Border
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // Black Right Half
        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
        ctx.fillStyle = '#000000';
        ctx.fill();

        // White Left Half
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Top Black Inner Semicircle
        ctx.beginPath();
        ctx.arc(0, -r / 2, r / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();

        // Bottom White Inner Semicircle
        ctx.beginPath();
        ctx.arc(0, r / 2, r / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // White Eye Dot in Top Black Semicircle
        ctx.beginPath();
        ctx.arc(0, -r / 2, 2.0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Black Eye Dot in Bottom White Semicircle
        ctx.beginPath();
        ctx.arc(0, r / 2, 2.0, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();

        ctx.restore(); // Yin-Yang restore
        ctx.restore(); // Heart restore
    }

    // -------------------------------------------------------------------------
    // Visualizer 3 Centerpieces: Unique Authentic Vessels & Cores for Each Theme
    // High-fidelity central entities with real-time reactive audio animation
    // -------------------------------------------------------------------------

    // 1. No Man's Sky (The Atlas): Majestic Atlas Interface Communion Platform
    function drawThematicAtlasPlatform(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
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
        ctx.fillText('// ATLAS INTERFACE // PROTOCOL 16.16.16 // KORE //', 0, 20 * s);

        ctx.restore();
    }

    // -------------------------------------------------------------------------
    // Brutalist Minimalism: Platter Center Hub & Thematic Core
    // Razor hairlines, zero blur, monolithic precision, stark high contrast
    // -------------------------------------------------------------------------
    function drawTurntableCenterBrutalist(ctx, width, height, variantOrLight, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
        if (!ctx || width === 0 || height === 0) return;
        const cx = width / 2;
        const cy = height / 2;
        const s = Math.min(1.25, Math.max(0.65, width / 180));

        ctx.save();
        ctx.translate(cx, cy);

        const variant = (variantOrLight === true || variantOrLight === 'light') ? 'light'
            : (variantOrLight === 'warm' ? 'warm' : (variantOrLight === 'obsidian' ? 'obsidian' : 'dark'));
        const isLight = (variant === 'light' || variant === 'warm');

        let fgColor = isLight ? '#000000' : '#ffffff';
        let bgColor = isLight ? '#ffffff' : '#0c0c0e';
        let subColor = isLight ? '#52525b' : '#a1a1aa';
        let hairline = isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.18)';
        let spindleFill = isLight ? '#f4f4f5' : '#000000';
        let badgeTag = 'MINIMALIST';

        if (variant === 'warm') {
            fgColor = '#1c1917';
            bgColor = '#faf8f5';
            subColor = '#d97706';
            hairline = 'rgba(217, 119, 6, 0.28)';
            spindleFill = '#f3eee6';
            badgeTag = 'WARM PAPER';
        } else if (variant === 'obsidian') {
            fgColor = '#38bdf8';
            bgColor = '#000000';
            subColor = '#94a3b8';
            hairline = 'rgba(56, 189, 248, 0.28)';
            spindleFill = '#050505';
            badgeTag = 'OBSIDIAN';
        }

        // 1. Center Matte Minimalist Label Disc
        const labelR = 48 * s;
        ctx.beginPath();
        ctx.arc(0, 0, labelR, 0, Math.PI * 2);
        ctx.fillStyle = bgColor;
        ctx.fill();
        ctx.lineWidth = 2.0 * s;
        ctx.strokeStyle = fgColor;
        ctx.stroke();

        // 2. Concentric calibrated hairline rings
        ctx.beginPath();
        ctx.arc(0, 0, labelR * 0.82, 0, Math.PI * 2);
        ctx.lineWidth = 0.8 * s;
        ctx.strokeStyle = hairline;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, labelR * 0.55, 0, Math.PI * 2);
        ctx.stroke();

        // 3. Spindle Hole Ring
        const spindleR = 10 * s;
        ctx.beginPath();
        ctx.arc(0, 0, spindleR, 0, Math.PI * 2);
        ctx.fillStyle = spindleFill;
        ctx.fill();
        ctx.lineWidth = 1.6 * s;
        ctx.strokeStyle = fgColor;
        ctx.stroke();

        // Spindle center pin
        ctx.beginPath();
        ctx.arc(0, 0, 3.5 * s, 0, Math.PI * 2);
        ctx.fillStyle = fgColor;
        ctx.fill();

        // 4. Clean Audio Reactive Ring (Zero clutter)
        if (playing) {
            const pulseR = spindleR + (12 + smoothBass * 16 + beatPulse * 8) * s;
            ctx.beginPath();
            ctx.arc(0, 0, Math.min(labelR * 0.82, pulseR), 0, Math.PI * 2);
            ctx.lineWidth = 1.2 * s;
            ctx.strokeStyle = fgColor;
            ctx.stroke();
        }

        // 5. 4 Cardinal Alignment Ticks
        const tLen = 4 * s;
        ctx.lineWidth = 1.0 * s;
        ctx.strokeStyle = fgColor;
        ctx.beginPath();
        ctx.moveTo(-labelR, 0); ctx.lineTo(-labelR + tLen, 0);
        ctx.moveTo(labelR, 0); ctx.lineTo(labelR - tLen, 0);
        ctx.moveTo(0, -labelR); ctx.lineTo(0, -labelR + tLen);
        ctx.moveTo(0, labelR); ctx.lineTo(0, labelR - tLen);
        ctx.stroke();

        // 6. Monospaced Circular Alignment Text
        ctx.save();
        ctx.font = `800 ${Math.max(5, Math.round(5.5 * s))}px monospace`;
        ctx.fillStyle = fgColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('33⅓ RPM • HI-FI', 0, -26 * s);
        ctx.fillStyle = subColor;
        ctx.fillText(badgeTag, 0, 26 * s);
        ctx.restore();

        ctx.restore();
    }

    function drawThematicBrutalistCore(ctx, cx, cy, s, isLight, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();
        ctx.translate(cx, cy);

        const fgColor = isLight ? '#000000' : '#ffffff';
        const subColor = isLight ? '#52525b' : '#a1a1aa';
        const hairline = isLight ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.2)';
        const hairlineSolid = isLight ? '#000000' : '#ffffff';

        // Minimalist Architectural Geometric Framework
        ctx.shadowBlur = 0;

        // Outer Calibrated Minimalist Reticle Ring
        const baseR = (30 + beatPulse * 6) * s;
        ctx.beginPath();
        ctx.arc(0, 0, baseR, 0, Math.PI * 2);
        ctx.strokeStyle = hairlineSolid;
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();

        // Secondary concentric hairline ring
        ctx.beginPath();
        ctx.arc(0, 0, baseR * 0.72, 0, Math.PI * 2);
        ctx.strokeStyle = hairline;
        ctx.lineWidth = 0.8 * s;
        ctx.setLineDash([3 * s, 3 * s]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 4 Cardinal Axis Hairlines & Millimeter Ticks
        const tickLen = 6 * s;
        ctx.strokeStyle = hairlineSolid;
        ctx.lineWidth = 1.0 * s;

        // Crosshairs
        ctx.beginPath();
        ctx.moveTo(-baseR - tickLen, 0); ctx.lineTo(-baseR + tickLen, 0);
        ctx.moveTo(baseR - tickLen, 0); ctx.lineTo(baseR + tickLen, 0);
        ctx.moveTo(0, -baseR - tickLen); ctx.lineTo(0, -baseR + tickLen);
        ctx.moveTo(0, baseR - tickLen); ctx.lineTo(0, baseR + tickLen);
        ctx.stroke();

        // Center Crosshair
        const centerCross = (5 + smoothBass * 3) * s;
        ctx.beginPath();
        ctx.moveTo(-centerCross, 0); ctx.lineTo(centerCross, 0);
        ctx.moveTo(0, -centerCross); ctx.lineTo(0, centerCross);
        ctx.stroke();

        // Dynamic Architectural Rotating Box Frame in the Center
        const boxSize = (14 + smoothBass * 8 + beatPulse * 4) * s;
        ctx.save();
        if (playing) {
            ctx.rotate((now * 0.0008) % (Math.PI * 2));
        }
        ctx.strokeStyle = hairlineSolid;
        ctx.lineWidth = 1.5 * s;
        ctx.strokeRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);

        // Inner solid core dot
        ctx.fillStyle = hairlineSolid;
        ctx.beginPath();
        ctx.arc(0, 0, 2.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Monospaced Architectural HUD Typography Above & Below
        ctx.font = `700 ${Math.max(6, Math.round(7 * s))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = fgColor;
        const dbVal = playing ? (-18 + Math.round((smoothBass + beatPulse) * 12)) : -48;
        ctx.fillText(`[ ${dbVal > 0 ? '+' : ''}${dbVal} dBFS ] LINEAR_RMS`, 0, -baseR - 10 * s);

        ctx.fillStyle = subColor;
        ctx.font = `600 ${Math.max(5, Math.round(6 * s))}px monospace`;
        ctx.fillText(isLight ? 'MINIMALIST // 0-CLUTTER // LIGHT' : 'MINIMALIST // 0-CLUTTER // DARK', 0, baseR + 10 * s);

        ctx.restore();
    }

    function drawThematicMinimalistWarmCore(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();
        ctx.translate(cx, cy);

        const fgColor = '#1c1917';
        const subColor = '#78716c';
        const amberColor = '#d97706';

        ctx.shadowBlur = 0;

        // Outer Calibrated Reticle Dial Ring in Terracotta Amber
        const baseR = (28 + beatPulse * 5) * s;
        ctx.beginPath();
        ctx.arc(0, 0, baseR, 0, Math.PI * 2);
        ctx.strokeStyle = amberColor;
        ctx.lineWidth = 1.4 * s;
        ctx.stroke();

        // Concentric ivory dial track
        ctx.beginPath();
        ctx.arc(0, 0, baseR * 0.74, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.25)';
        ctx.lineWidth = 0.8 * s;
        ctx.setLineDash([3 * s, 3 * s]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 12-Hour Geometric Studio Graduation Pips
        for (let a = 0; a < 12; a++) {
            const angle = (a / 12) * Math.PI * 2;
            const r1 = baseR - 3 * s;
            const r2 = baseR + (a % 3 === 0 ? 5 : 2) * s;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
            ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
            ctx.strokeStyle = (a % 3 === 0) ? amberColor : 'rgba(28, 25, 23, 0.4)';
            ctx.lineWidth = (a % 3 === 0) ? 1.2 * s : 0.8 * s;
            ctx.stroke();
        }

        // Tactile Center Rotating Amber Rotor
        const rotorSize = (14 + smoothBass * 7 + beatPulse * 4) * s;
        ctx.save();
        if (playing) {
            ctx.rotate((now * 0.0006) % (Math.PI * 2));
        }
        ctx.fillStyle = '#faf8f5';
        ctx.strokeStyle = amberColor;
        ctx.lineWidth = 1.4 * s;
        ctx.beginPath();
        ctx.arc(0, 0, rotorSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Amber Core Hotspot
        ctx.fillStyle = amberColor;
        ctx.beginPath();
        ctx.arc(0, 0, (2.8 + snarePulse * 1.5) * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Precision Editorial Typography Above & Below
        ctx.font = `700 ${Math.max(6, Math.round(7 * s))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = amberColor;
        const dbVal = playing ? (-18 + Math.round((smoothBass + beatPulse) * 12)) : -48;
        ctx.fillText(`[ ${dbVal > 0 ? '+' : ''}${dbVal} dBFS ] WARM_MASTER`, 0, -baseR - 8 * s);

        ctx.fillStyle = fgColor;
        ctx.font = `600 ${Math.max(5, Math.round(6 * s))}px monospace`;
        ctx.fillText('MINIMALIST // NORDIC PAPER // AMBER', 0, baseR + 10 * s);

        ctx.restore();
    }

    function drawThematicMinimalistObsidianCore(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        ctx.save();
        ctx.translate(cx, cy);

        const subColor = '#94a3b8';
        const cyanColor = '#38bdf8';

        ctx.shadowBlur = 0;

        // Outer Calibrated Reticle Dial Ring in Pure Platinum White
        const baseR = (28 + beatPulse * 6) * s;
        ctx.beginPath();
        ctx.arc(0, 0, baseR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();

        // Concentric Electric Cyan Reticle Ring with subtle pulse
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, baseR * 0.72, 0, Math.PI * 2);
        ctx.strokeStyle = cyanColor;
        ctx.shadowColor = cyanColor;
        ctx.shadowBlur = playing ? (6 + beatPulse * 8) * s : 3 * s;
        ctx.lineWidth = 1.0 * s;
        ctx.setLineDash([4 * s, 3 * s]);
        ctx.stroke();
        ctx.restore();

        // 4 Cardinal Axis Laser Hairlines
        const tickLen = 6 * s;
        ctx.strokeStyle = cyanColor;
        ctx.lineWidth = 1.0 * s;
        ctx.beginPath();
        ctx.moveTo(-baseR - tickLen, 0); ctx.lineTo(-baseR + tickLen, 0);
        ctx.moveTo(baseR - tickLen, 0); ctx.lineTo(baseR + tickLen, 0);
        ctx.moveTo(0, -baseR - tickLen); ctx.lineTo(0, -baseR + tickLen);
        ctx.moveTo(0, baseR - tickLen); ctx.lineTo(0, baseR + tickLen);
        ctx.stroke();

        // Precision Center Rotating Obsidian Diamond
        const diamondSize = (13 + smoothBass * 7 + beatPulse * 4) * s;
        ctx.save();
        if (playing) {
            ctx.rotate((now * 0.0009) % (Math.PI * 2));
        }
        ctx.strokeStyle = cyanColor;
        ctx.shadowColor = cyanColor;
        ctx.shadowBlur = (4 + beatPulse * 6) * s;
        ctx.lineWidth = 1.5 * s;
        ctx.strokeRect(-diamondSize / 2, -diamondSize / 2, diamondSize, diamondSize);

        // Core White Hotspot
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 5 * s;
        ctx.beginPath();
        ctx.arc(0, 0, 2.2 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Precision Monospaced Typography Above & Below
        ctx.font = `700 ${Math.max(6, Math.round(7 * s))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = cyanColor;
        const dbVal = playing ? (-18 + Math.round((smoothBass + beatPulse) * 12)) : -48;
        ctx.fillText(`[ ${dbVal > 0 ? '+' : ''}${dbVal} dBFS ] ZERO_WATT_RMS`, 0, -baseR - 8 * s);

        ctx.fillStyle = subColor;
        ctx.font = `600 ${Math.max(5, Math.round(6 * s))}px monospace`;
        ctx.fillText('MINIMALIST // OBSIDIAN OLED // ICE_CYAN', 0, baseR + 10 * s);

        ctx.restore();
    }


    // 2. Default: Touhou Spirit Core & Floating Yin-Yang Medallion
    function drawThematicDefaultCore(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        const runeRingAngle = store.state.runeRingAngle;
        const yinYangAngle = store.state.yinYangAngle;
        ctx.save();
        ctx.translate(cx, cy);

        const hScale = (0.75 + smoothBass * 0.18 + beatPulse * 0.22) * s;

        // Ambient Radial Bloom
        const glowR = (36 + beatPulse * 18) * s;
        const glowGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, glowR);
        glowGrad.addColorStop(0, `rgba(255, 255, 255, ${0.45 + beatPulse * 0.35})`);
        glowGrad.addColorStop(0.5, `rgba(255, 255, 255, ${0.12 + beatPulse * 0.15})`);
        glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Dashed Outer Rune Ring with 8 Radial Trigram Ticks
        ctx.save();
        ctx.rotate(runeRingAngle);
        const rRing = (28 + beatPulse * 4) * s;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.65 + beatPulse * 0.35})`;
        ctx.lineWidth = Math.max(0.8, 1.1 * s);
        ctx.setLineDash([Math.round(4 * s), Math.round(5 * s)]);
        ctx.beginPath();
        ctx.arc(0, 0, rRing, 0, Math.PI * 2);
        ctx.stroke();

        for (let a = 0; a < 8; a++) {
            const angle = (a * Math.PI) / 4;
            const r1 = rRing - 3 * s;
            const r2 = rRing + 3 * s;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
            ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
            ctx.stroke();
        }
        ctx.restore();

        // Counter-rotating Harmonic Ring
        ctx.save();
        ctx.rotate(-runeRingAngle * 1.4);
        const rInner = (20 + snarePulse * 4) * s;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + snarePulse * 0.35})`;
        ctx.lineWidth = Math.max(0.8, 1.0 * s);
        ctx.setLineDash([Math.round(2 * s), Math.round(4 * s)]);
        ctx.beginPath();
        ctx.arc(0, 0, rInner, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Solid White Touhou Heart Silhouette
        ctx.save();
        ctx.scale(hScale, hScale);
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.bezierCurveTo(-7, -20, -22, -18, -22, -5);
        ctx.bezierCurveTo(-22, 7, -12, 16, 0, 22);
        ctx.bezierCurveTo(12, 16, 22, 7, 22, -5);
        ctx.bezierCurveTo(22, -18, 7, -20, 0, -7);
        ctx.closePath();

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = (10 + beatPulse * 16) * s;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1.0;
        ctx.stroke();

        // Rotating Yin-Yang Medallion in Heart Center
        ctx.save();
        ctx.translate(0, 1.2);
        ctx.rotate(yinYangAngle);
        const r = 8.5;

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
        ctx.fillStyle = '#000000';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, -r / 2, r / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, r / 2, r / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, -r / 2, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, r / 2, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.restore();

        ctx.restore();

        // Subtitle Tag
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = `600 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('◆ REIMU RESONANCE CORE ◆', 0, 26 * s);

        ctx.restore();
    }

    // 3. Solar Eclipse: Helios Solar Scout Cruiser
    function drawThematicSolarCruiser(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
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
        ctx.shadowBlur = 8 * s;
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
        ctx.shadowBlur = (8 + beatPulse * 12) * s;
        ctx.fill();
        ctx.restore();

        // Telemetry Subtitle
        ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
        ctx.font = `600 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('// HELIOS-IV SOLAR SCOUT //', 0, 25 * s);

        ctx.restore();
    }

    // 4. Euclid Horizon: Orbital Space Station (No Man's Sky)
    function drawThematicSpaceStation(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
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
        ctx.fillText('// ORBITAL STATION // DOCKING RUNWAY ACTIVE //', 0, 26 * s);

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


    // 5. Alien Paradise: Bioluminescent Xenobiological Manta Bio-Vessel
    function drawThematicAlienBioManta(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
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
        ctx.fillText('// XENO-BIOLOGICAL MANTA //', 0, 24 * s);

        ctx.restore();
    }

    // 6. Emeril Drive: Relativistic Hyperspace Warp Jump Simulation (No Man's Sky)
    function drawThematicEmerilWarpTunnel(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
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
        ctx.fillText('// EMERIL WARP // HYPERSPACE JUMP // CADMIUM-EMERIL-INDIUM //', 0, 26 * s);

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


    // 7. Dissonance: Corrupted Atlantideum Harmonic Monolith Spire (No Man's Sky)
    function drawThematicHarmonicMonolith(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
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
            ctx.shadowBlur = (8 + beatPulse * 10) * s;
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
        ctx.shadowBlur = (14 + beatPulse * 20) * s;
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
        ctx.shadowBlur = 8 * s;
        ctx.textAlign = 'center';
        ctx.fillText('16.16.16', 0, -monoHTop * 0.35);
        ctx.fillText('ATLANTIS', 0, 0);
        ctx.fillText('ECHO // NULL', 0, monoHBot * 0.45);
        ctx.restore();

        ctx.fillStyle = 'rgba(217, 70, 239, 0.9)';
        ctx.font = `700 ${Math.max(6, Math.round(7.2 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.shadowColor = '#d946ef';
        ctx.shadowBlur = 6 * s;
        ctx.fillText('// HARMONIC RESONATOR // CORRUPTED ATLANTIDEUM //', 0, 26 * s);

        ctx.restore();
    }

    // 8. Sentinel Theme: Heavy Combat Patrol Drone (No Man's Sky Aeron Unit)
    function drawThematicSentinelDrone(ctx, cx, cy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
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
            ctx.shadowBlur = (12 + beatPulse * 18) * s;
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

        // Central Multi-Aperture Cyclops Optic
        const isAlertEye = (playing && beatPulse > 0.40);
        const eyeColor = isAlertEye ? '#ff3d00' : '#00e5ff';
        const eyeRadius = (4.8 + snarePulse * 1.5) * s;
        ctx.beginPath();
        ctx.arc(0, 0, eyeRadius, 0, Math.PI * 2);
        ctx.fillStyle = eyeColor;
        ctx.shadowColor = eyeColor;
        ctx.shadowBlur = (14 + beatPulse * 20) * s;
        ctx.fill();

        // White Pupil Hotspot
        ctx.beginPath();
        ctx.arc(0, 0, eyeRadius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8 * s;
        ctx.fill();

        // Scanner Laser Sweep Beam
        const scanX = Math.sin(now * 0.008) * (8 * s);
        ctx.beginPath();
        ctx.moveTo(scanX, -4 * s);
        ctx.lineTo(scanX, 4 * s);
        ctx.strokeStyle = isAlertEye ? '#ffffff' : '#00ffff';
        ctx.lineWidth = 1.0 * s;
        ctx.stroke();

        ctx.restore();

        // Floating 5-Star Alert HUD Reticle above Drone: [ ◆ ◆ ◆ ◆ ◆ ] WANTED LEVEL: 5
        ctx.save();
        const reticleY = -27 * s;
        ctx.fillStyle = '#ff3d00';
        ctx.shadowColor = '#ff3d00';
        ctx.shadowBlur = 8 * s;
        ctx.font = `800 ${Math.max(6, Math.round(7.5 * s))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('[ ◆ ◆ ◆ ◆ ◆ ] WANTED LEVEL: 5', 0, reticleY);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.9)';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 5 * s;
        ctx.fillText('// AERON ENFORCER // ATLAN_01 //', 0, 24 * s);
        ctx.restore();

        ctx.restore();
    }

    // Master Dispatcher for Thematic Centerpiece
    function drawThematicCenterpiece(ctx, cx, cy, width, height, currentTheme, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        if (!ctx || width === 0 || height === 0) return;
        const s = Math.min(0.96, Math.max(0.56, height / 102));
        const adjustedCy = cy - (3.5 * s);

        switch (currentTheme) {
            case 'nms':
                drawThematicAtlasPlatform(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'solar-eclipse':
                drawThematicSolarCruiser(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'euclid-horizon':
                drawThematicSpaceStation(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'alien-paradise':
                drawThematicAlienBioManta(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'abyssal-void':
                drawThematicEmerilWarpTunnel(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'dissonance':
                drawThematicHarmonicMonolith(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'sentinel':
                drawThematicSentinelDrone(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'minimalist-light':
            case 'brutalist-light':
                drawThematicBrutalistCore(ctx, cx, adjustedCy, s, true, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'minimalist-dark':
            case 'brutalist-dark':
                drawThematicBrutalistCore(ctx, cx, adjustedCy, s, false, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'minimalist-warm':
                drawThematicMinimalistWarmCore(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            case 'minimalist-obsidian':
                drawThematicMinimalistObsidianCore(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
            default:
                drawThematicDefaultCore(ctx, cx, adjustedCy, s, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);
                break;
        }
    }

    // -------------------------------------------------------------------------
    // Visualizer 3: Thematic Wave (Ethereal Touhou Ink Wave Visualizer)
    // Sinuous ink wings, dynamic mist, crest luminescence & spirit danmaku
    // -------------------------------------------------------------------------
    function drawThematicWave(ctx, width, height, bands, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
        const st = store.state;
        const centerX = width / 2;
        const centerY = height / 2;

        // Heart pulsing: strictly locked to track's bass and kick transients
        const targetHeartPulse = playing
            ? (1.0 + smoothBass * 0.28 + beatPulse * 0.36)
            : (1.0 + Math.sin(now * 0.002) * 0.03);
        st.smoothHeartPulse += (targetHeartPulse - st.smoothHeartPulse) * (1.0 - Math.exp(-22 * dt));
        const heartPulse = st.smoothHeartPulse;

        // Continuous delta-time rotation integration: smooth acceleration without angle jumping
        const runeSpeed = playing ? (1.2 + smoothTreble * 2.2 + beatPulse * 1.4) : 0.6;
        st.runeRingAngle += dt * runeSpeed * 1.0;

        const yinYangSpeed = playing ? (1.2 + smoothBass * 1.8 + smoothTreble * 2.0) : 0.7;
        st.yinYangAngle += dt * yinYangSpeed * 1.3;

        // Trigger expanding concentric ripple soundwaves on heavy kicks
        if (playing && beatPulse > 0.55 && Math.random() < 0.25) {
            emitShockwave(centerX, centerY, Math.min(width * 0.42, 115 * heartPulse), 0.75);
        }

        const currentTheme = getActiveTheme();
        const isNms = isAtlasThemeActive();

        // Ambient radial aura in dock center
        if (playing) {
            const glowR = Math.min(width * 0.45, (85 + smoothBass * 45 + beatPulse * 55) * heartPulse);
            const grad = ctx.createRadialGradient(centerX, centerY, 6, centerX, centerY, glowR);
            if (isNms) {
                grad.addColorStop(0, 'rgba(255, 23, 68, ' + (0.35 + beatPulse * 0.35) + ')');
                grad.addColorStop(0.4, 'rgba(124, 77, 255, ' + (0.12 + beatPulse * 0.12) + ')');
                grad.addColorStop(1, 'rgba(6, 7, 16, 0)');
            } else if (currentTheme === 'dissonance') {
                grad.addColorStop(0, 'rgba(217, 70, 239, ' + (0.35 + beatPulse * 0.35) + ')');
                grad.addColorStop(0.4, 'rgba(168, 85, 247, ' + (0.15 + beatPulse * 0.15) + ')');
                grad.addColorStop(1, 'rgba(6, 2, 12, 0)');
            } else {
                grad.addColorStop(0, 'rgba(255, 255, 255, ' + (0.24 + beatPulse * 0.32) + ')');
                grad.addColorStop(0.4, 'rgba(255, 255, 255, ' + (0.07 + beatPulse * 0.10) + ')');
                grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            }
            ctx.fillStyle = grad;
            ctx.fillRect(centerX - glowR, centerY - glowR, glowR * 2, glowR * 2);
        }

        // Draw Expanding Soundwave Ripple Rings
        updateAndDrawShockwaves(ctx, dt);

        // Symmetrical Sinuous Thematic Audio Wings (Left & Right Wings)
        const thematicLeftPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
        const thematicRightPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
        const thematicLeftMistPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
        const thematicRightMistPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
        const wingPoints = 36;
        const clearance = Math.min(width * 0.16, Math.max(54, height * 0.58));
        const wingWidth = (width / 2) - clearance;
        const wingHeadroom = Math.max(16, height * 0.24);
        const maxWingHeight = height - wingHeadroom - 4;
        const mistHeadroom = Math.max(22, height * 0.38);
        const maxMistHeight = height - mistHeadroom - 4;

        // Gradient for sleek translucent ink wings adapted to active theme
        const wingGrad = ctx.createLinearGradient(0, wingHeadroom, 0, height);
        switch (currentTheme) {
            case 'nms':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#ffab00');
                wingGrad.addColorStop(0.45, '#ff1744');
                wingGrad.addColorStop(0.75, 'rgba(213, 0, 0, 0.35)');
                wingGrad.addColorStop(1, 'rgba(124, 77, 255, 0.05)');
                break;
            case 'solar-eclipse':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#00f0ff');
                wingGrad.addColorStop(0.45, '#ff007f');
                wingGrad.addColorStop(0.75, 'rgba(179, 0, 89, 0.35)');
                wingGrad.addColorStop(1, 'rgba(0, 240, 255, 0.05)');
                break;
            case 'euclid-horizon':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#fbbf24');
                wingGrad.addColorStop(0.45, '#14b8a6');
                wingGrad.addColorStop(0.75, 'rgba(225, 29, 72, 0.35)');
                wingGrad.addColorStop(1, 'rgba(20, 184, 166, 0.05)');
                break;
            case 'alien-paradise':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#ff2a70');
                wingGrad.addColorStop(0.45, '#00ced1');
                wingGrad.addColorStop(0.75, 'rgba(250, 204, 21, 0.35)');
                wingGrad.addColorStop(1, 'rgba(0, 206, 209, 0.05)');
                break;
            case 'abyssal-void':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#00ffaa');
                wingGrad.addColorStop(0.45, '#10b981');
                wingGrad.addColorStop(0.75, 'rgba(5, 150, 105, 0.35)');
                wingGrad.addColorStop(1, 'rgba(16, 185, 129, 0.05)');
                break;
            case 'dissonance':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#d946ef');
                wingGrad.addColorStop(0.45, '#a855f7');
                wingGrad.addColorStop(0.75, 'rgba(126, 34, 206, 0.35)');
                wingGrad.addColorStop(1, 'rgba(88, 28, 135, 0.05)');
                break;
            case 'sentinel':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.18, '#00e5ff');
                wingGrad.addColorStop(0.45, '#ff3d00');
                wingGrad.addColorStop(0.75, 'rgba(0, 229, 255, 0.35)');
                wingGrad.addColorStop(1, 'rgba(11, 14, 23, 0.05)');
                break;
            case 'minimalist-light':
            case 'brutalist-light':
                wingGrad.addColorStop(0, '#000000');
                wingGrad.addColorStop(0.25, '#27272a');
                wingGrad.addColorStop(0.60, 'rgba(0, 0, 0, 0.25)');
                wingGrad.addColorStop(1, 'rgba(0, 0, 0, 0.02)');
                break;
            case 'minimalist-dark':
            case 'brutalist-dark':
                wingGrad.addColorStop(0, '#ffffff');
                wingGrad.addColorStop(0.25, '#e4e4e7');
                wingGrad.addColorStop(0.60, 'rgba(255, 255, 255, 0.25)');
                wingGrad.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
                break;
            case 'minimalist-warm':
                wingGrad.addColorStop(0, '#d97706');
                wingGrad.addColorStop(0.25, '#b45309');
                wingGrad.addColorStop(0.60, 'rgba(217, 119, 6, 0.25)');
                wingGrad.addColorStop(1, 'rgba(250, 248, 245, 0.02)');
                break;
            case 'minimalist-obsidian':
                wingGrad.addColorStop(0, '#38bdf8');
                wingGrad.addColorStop(0.25, '#0284c7');
                wingGrad.addColorStop(0.60, 'rgba(56, 189, 248, 0.25)');
                wingGrad.addColorStop(1, 'rgba(0, 0, 0, 0.02)');
                break;
            default:
                wingGrad.addColorStop(0, 'rgba(255, 255, 255, 0.94)');
                wingGrad.addColorStop(0.22, 'rgba(255, 255, 255, 0.62)');
                wingGrad.addColorStop(0.60, 'rgba(255, 255, 255, 0.20)');
                wingGrad.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
                break;
        }

        for (let i = 0; i < wingPoints; i++) {
            const progress = i / (wingPoints - 1);
            const bandIdx = Math.min(bands.length - 1, Math.floor(Math.pow(progress, 0.95) * (bands.length - 1)));
            const b = bands[bandIdx] || 0;

            const innerTaper = Math.min(1.0, progress * 4.0);
            const wingAmp = Math.min(maxWingHeight, (b * maxWingHeight * (0.82 + beatPulse * 0.14 + smoothMid * 0.10) + (playing ? 3.5 : 1.5)) * innerTaper);
            const mistAmp = Math.min(maxMistHeight, (b * maxMistHeight * (0.76 + smoothBass * 0.16) + (playing ? 2.5 : 1.2)) * innerTaper);

            const y = Math.max(wingHeadroom, height - wingAmp);
            const mistY = Math.max(mistHeadroom, height - mistAmp);

            const lx = (centerX - clearance) - progress * wingWidth;
            const rx = (centerX + clearance) + progress * wingWidth;

            thematicLeftPoints[i].x = lx;
            thematicLeftPoints[i].y = y;
            thematicRightPoints[i].x = rx;
            thematicRightPoints[i].y = y;
            thematicLeftMistPoints[i].x = lx;
            thematicLeftMistPoints[i].y = mistY;
            thematicRightMistPoints[i].x = rx;
            thematicRightMistPoints[i].y = mistY;
        }

        let mistFill = 'rgba(255, 255, 255, ' + (0.05 + smoothBass * 0.06) + ')';
        let crestShadow = 'rgba(255, 255, 255, ' + (0.8 + beatPulse * 0.2) + ')';
        if (currentTheme === 'nms') {
            mistFill = 'rgba(124, 77, 255, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#ff1744';
        } else if (currentTheme === 'solar-eclipse') {
            mistFill = 'rgba(255, 0, 128, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#00f0ff';
        } else if (currentTheme === 'euclid-horizon') {
            mistFill = 'rgba(225, 29, 72, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#fbbf24';
        } else if (currentTheme === 'alien-paradise') {
            mistFill = 'rgba(244, 63, 94, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#ff2a70';
        } else if (currentTheme === 'abyssal-void') {
            mistFill = 'rgba(5, 150, 105, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#00ffaa';
        } else if (currentTheme === 'dissonance') {
            mistFill = 'rgba(168, 85, 247, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#d946ef';
        } else if (currentTheme === 'sentinel') {
            mistFill = 'rgba(0, 229, 255, ' + (0.12 + smoothBass * 0.12) + ')';
            crestShadow = '#00e5ff';
        } else if (currentTheme === 'brutalist-light' || currentTheme === 'minimalist-light') {
            mistFill = 'rgba(0, 0, 0, ' + (0.03 + smoothBass * 0.04) + ')';
            crestShadow = 'rgba(0, 0, 0, 0.4)';
        } else if (currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-dark') {
            mistFill = 'rgba(255, 255, 255, ' + (0.03 + smoothBass * 0.04) + ')';
            crestShadow = 'rgba(255, 255, 255, 0.4)';
        } else if (currentTheme === 'minimalist-warm') {
            mistFill = 'rgba(217, 119, 6, ' + (0.04 + smoothBass * 0.05) + ')';
            crestShadow = '#d97706';
        } else if (currentTheme === 'minimalist-obsidian') {
            mistFill = 'rgba(56, 189, 248, ' + (0.04 + smoothBass * 0.05) + ')';
            crestShadow = '#38bdf8';
        }

        // --- Left Wing: Layer 1 Mist Wave ---
        ctx.beginPath();
        ctx.moveTo(centerX - clearance, height);
        ctx.lineTo(thematicLeftMistPoints[0].x, thematicLeftMistPoints[0].y);
        drawSplinePath(ctx, thematicLeftMistPoints);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = mistFill;
        ctx.fill();

        // --- Left Wing: Layer 2 Ethereal Ink Silhouette ---
        ctx.beginPath();
        ctx.moveTo(centerX - clearance, height);
        ctx.lineTo(thematicLeftPoints[0].x, thematicLeftPoints[0].y);
        drawSplinePath(ctx, thematicLeftPoints);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = wingGrad;
        ctx.fill();

        const thematicCrestStroke = (currentTheme === 'minimalist-light' || currentTheme === 'brutalist-light')
            ? '#09090b'
            : (currentTheme === 'minimalist-warm' ? '#9a3412' : (currentTheme === 'minimalist-obsidian' ? '#38bdf8' : '#ffffff'));

        // Left Crest Glow Line
        ctx.save();
        if (isFirefox) {
            ctx.beginPath();
            ctx.moveTo(thematicLeftPoints[0].x, thematicLeftPoints[0].y);
            drawSplinePath(ctx, thematicLeftPoints);
            ctx.lineWidth = (2.2 + beatPulse * 1.4) * 2.2;
            ctx.strokeStyle = crestShadow;
            ctx.globalAlpha = 0.42;
            ctx.stroke();

            ctx.lineWidth = 2.2 + beatPulse * 1.4;
            ctx.strokeStyle = thematicCrestStroke;
            ctx.globalAlpha = 1.0;
            ctx.stroke();
        } else {
            ctx.shadowColor = crestShadow;
            ctx.shadowBlur = Math.min(12, 6 + beatPulse * 8);
            ctx.lineWidth = 2.2 + beatPulse * 1.4;
            ctx.strokeStyle = thematicCrestStroke;
            ctx.beginPath();
            ctx.moveTo(thematicLeftPoints[0].x, thematicLeftPoints[0].y);
            drawSplinePath(ctx, thematicLeftPoints);
            ctx.stroke();
        }
        ctx.restore();

        // --- Right Wing: Layer 1 Mist Wave ---
        ctx.beginPath();
        ctx.moveTo(centerX + clearance, height);
        ctx.lineTo(thematicRightMistPoints[0].x, thematicRightMistPoints[0].y);
        drawSplinePath(ctx, thematicRightMistPoints);
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = mistFill;
        ctx.fill();

        // --- Right Wing: Layer 2 Ethereal Ink Silhouette ---
        ctx.beginPath();
        ctx.moveTo(centerX + clearance, height);
        ctx.lineTo(thematicRightPoints[0].x, thematicRightPoints[0].y);
        drawSplinePath(ctx, thematicRightPoints);
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = wingGrad;
        ctx.fill();

        // Right Crest Glow Line
        ctx.save();
        if (isFirefox) {
            ctx.beginPath();
            ctx.moveTo(thematicRightPoints[0].x, thematicRightPoints[0].y);
            drawSplinePath(ctx, thematicRightPoints);
            ctx.lineWidth = (2.2 + beatPulse * 1.4 + snarePulse * 0.8) * 2.2;
            ctx.strokeStyle = crestShadow;
            ctx.globalAlpha = 0.42;
            ctx.stroke();

            ctx.lineWidth = 2.2 + beatPulse * 1.4 + snarePulse * 0.8;
            ctx.strokeStyle = thematicCrestStroke;
            ctx.globalAlpha = 1.0;
            ctx.stroke();
        } else {
            ctx.shadowColor = crestShadow;
            ctx.shadowBlur = Math.min(12, 6 + beatPulse * 8 + snarePulse * 4);
            ctx.lineWidth = 2.2 + beatPulse * 1.4 + snarePulse * 0.8;
            ctx.strokeStyle = thematicCrestStroke;
            ctx.beginPath();
            ctx.moveTo(thematicRightPoints[0].x, thematicRightPoints[0].y);
            drawSplinePath(ctx, thematicRightPoints);
            ctx.stroke();
        }
        ctx.restore();

        // Distinct Thematic Centerpiece for each Theme (NMS Starship, Touhou Core, Solar Cruiser, Vector Speeder, Bio Manta, Deep Submersible)
        drawThematicCenterpiece(ctx, centerX, centerY, width, height, currentTheme, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble);

        // Floating Sakura Petals & Spirit Danmaku (Default Touhou Theme Only)
        if (currentTheme === 'default') {
            updateAndDrawParticles(ctx, width, height, dt, smoothBass * 1.8 + beatPulse * 2.5 + snarePulse * 1.2);
        }
    }

    // Alias for compatibility
    function drawBadAppleTouhou(...args) {
        return drawThematicWave(...args);
    }

    // Floating Petals / Spray Particles Physics (Exclusive to Default Touhou Theme)
    function updateAndDrawParticles(ctx, width, height, dt, impulse) {
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


    export {
        abyssalTime,
        dissonanceTime,
        drawBadAppleTouhou,
        drawThematicAlienBioManta,
        drawThematicAtlasPlatform,
        drawThematicBrutalistCore,
        drawThematicCenterpiece,
        drawThematicDefaultCore,
        drawThematicEmerilWarpTunnel,
        drawThematicHarmonicMonolith,
        drawThematicMinimalistObsidianCore,
        drawThematicMinimalistWarmCore,
        drawThematicSentinelDrone,
        drawThematicSolarCruiser,
        drawThematicSpaceStation,
        drawThematicWave,
        drawTurntableCenterAbyssalVoid,
        drawTurntableCenterBrutalist,
        drawTurntableCenterDissonance,
        drawTurntableCenterHeart,
        drawTurntableCenterSentinel,
        sentinelTime,
        updateAndDrawParticles
    };
