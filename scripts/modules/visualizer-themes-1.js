// CachyMusic - Turntable Center Visualizers (Atlas, Solar Eclipse, Euclid, Alien Paradise)
    let atlasLuminance = 0.05;
    let atlasRotationAngle = 0;
    let atlasPrecessionAngle = 0;

    function drawTurntableCenterAtlasCore(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
        if (!ctx || width === 0 || height === 0) return;

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
            const glyphs = ['16 // 16 // 16', 'ATLAS // MATRIX', 'EUCLID // SECTOR', 'ANOMALY // LOC'];
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
            ctx.fillText('// 16 //', rx, ry);
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

    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center PLANETARY WARP (Solar Eclipse Reference)
    // Dark celestial sphere, blazing magenta solar corona, electric cyan rings,
    // and starship banking with curved relativistic lightspeed trails along its orbit.
    // -------------------------------------------------------------------------
    let eclipseRotation = 0;
    window.__setEclipseRotation = (r) => { eclipseRotation = r; };
    window.__pauseEclipseRotation = false;
    function drawTurntableCenterSolarEclipse(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
        if (!ctx || width === 0 || height === 0) return;
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) * 0.48;
        const hubRadius = Math.min(width, height) * 0.20;
        const s = hubRadius / 54;
        const orbitTilt = -0.32;
        const ringAspect = 0.58;
        const shipOrbitR = hubRadius * (1.72 + smoothBass * 0.12);

        if (!window.__pauseEclipseRotation) {
            if (playing) {
                eclipseRotation += dt * (0.6 + beatPulse * 1.8 + snarePulse * 1.2) * fidelity;
            } else {
                eclipseRotation += dt * 0.18 * fidelity;
            }
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
            ctx.shadowBlur = (8 + beatPulse * 8 * (0.35 + 0.65 * fidelity)) * s;
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
                ctx.shadowBlur = (r === 2 ? 10 + beatPulse * 12 : 4) * s;
                ctx.stroke();
            }

            // B. Dedicated Starship Orbit Guide Track
            ctx.beginPath();
            ctx.arc(0, 0, shipOrbitR, startAng, endAng);
            ctx.strokeStyle = `rgba(0, 240, 255, ${0.28 + beatPulse * 0.28})`;
            ctx.lineWidth = Math.max(1.0, 1.5 * s);
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = (8 + beatPulse * 10) * s;
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
            ctx.shadowBlur = (10 + beatPulse * 16) * s;
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
            ctx.shadowBlur = (12 + beatPulse * 18) * s;
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
            ctx.shadowBlur = 6 * s;
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
            ctx.shadowBlur = 6 * s;
            ctx.stroke();
            ctx.restore();

            // C. Relativistic Warp Specks / Speed Streaks
            ctx.save();
            for (let i = 3; i < K - 1; i += 3) {
                const pt = trailPts[i];
                const sparkAlpha = Math.sin(pt.u * Math.PI) * (0.6 + beatPulse * 0.4);
                ctx.fillStyle = i % 2 === 0 ? `rgba(255, 255, 255, ${sparkAlpha})` : `rgba(0, 240, 255, ${sparkAlpha})`;
                ctx.shadowColor = '#00f0ff';
                ctx.shadowBlur = 4 * s;
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
            ctx.shadowBlur = (6 + beatPulse * 8) * s;
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
            ctx.shadowBlur = 4 * s;
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
            ctx.shadowBlur = (12 + beatPulse * 16) * s;
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
        ctx.shadowBlur = (8 + beatPulse * 14) * s;
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

    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center EUCLID PORTAL (Image 2 Reference)
    // Golden Circular Portal Halo, floating Atlas diamond monolith, ruby crystals
    // -------------------------------------------------------------------------
    let euclidRotation = 0;
    function drawTurntableCenterEuclidPortal(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
        if (!ctx || width === 0 || height === 0) return;
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

    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center ALIEN PARADISE (Image 3 Reference)
    // Retro turquoise skies, floating Atlas spire, ascending beacon vapor beams
    // -------------------------------------------------------------------------
    let paradiseTime = 0;
    function drawTurntableCenterAlienParadise(ctx, width, height, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, fidelity = 1.0) {
        if (!ctx || width === 0 || height === 0) return;
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

    // -------------------------------------------------------------------------
    // Visualizer Component: Turntable Center ABYSSAL VOID (Image 4 Reference)
    // Radiant emerald crescent, colossal gas giant silhouette, twin sub-light trails
    // -------------------------------------------------------------------------

    // Attach visualizer theme drawing routines to window
    if (typeof window !== "undefined") {
        try { window.atlasLuminance = atlasLuminance; } catch (_) {}
        try { window.atlasRotationAngle = atlasRotationAngle; } catch (_) {}
        try { window.atlasPrecessionAngle = atlasPrecessionAngle; } catch (_) {}
        try { window.drawTurntableCenterAlienParadise = drawTurntableCenterAlienParadise; } catch (_) {}
        try { window.drawTurntableCenterAtlasCore = drawTurntableCenterAtlasCore; } catch (_) {}
        try { window.drawTurntableCenterEuclidPortal = drawTurntableCenterEuclidPortal; } catch (_) {}
        try { window.drawTurntableCenterSolarEclipse = drawTurntableCenterSolarEclipse; } catch (_) {}
        try { window.eclipseRotation = eclipseRotation; } catch (_) {}
        try { window.euclidRotation = euclidRotation; } catch (_) {}
        try { window.paradiseTime = paradiseTime; } catch (_) {}
    }

    export {
        atlasLuminance,
        atlasRotationAngle,
        atlasPrecessionAngle,
        drawTurntableCenterAlienParadise,
        drawTurntableCenterAtlasCore,
        drawTurntableCenterEuclidPortal,
        drawTurntableCenterSolarEclipse,
        eclipseRotation,
        euclidRotation,
        paradiseTime
    };
