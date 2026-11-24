import { store, NUM_BANDS } from '../state.js';
import { getActiveTheme } from '../ui-elements.js';

export function drawVerticalDash(ctx, width, height, bands, playing, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble) {
    const currentTheme = getActiveTheme();
    const { smoothDashLevels, peakValues, peakVelocity, peakHold } = store.state;
    const totalSegments = 16;
    const legendHeight = 12;
    const paddingX = 14;
    const availableW = Math.max(1, width - (paddingX * 2));

    // Frame-rate independent attack & decay physics for column dynamics
    const colAttack = 1.0 - Math.exp(-34 * dt);
    const colDecay = 1.0 - Math.exp(-9.8 * dt);

    // Theme-specific column count & geometry
    let colCount = 56;
    if (currentTheme === 'solar-eclipse') colCount = 48;
    else if (currentTheme === 'alien-paradise') colCount = 50;
    else if (currentTheme === 'euclid-horizon') colCount = 52;
    else if (currentTheme === 'nms') colCount = 52;
    else if (currentTheme === 'abyssal-void') colCount = 54;
    else if (currentTheme === 'dissonance') colCount = 52;
    else if (currentTheme === 'sentinel') colCount = 52;
    else if (currentTheme === 'brutalist-light' || currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-dark' || currentTheme === 'minimalist-warm' || currentTheme === 'minimalist-obsidian') colCount = 48;

    colCount = Math.max(1, Math.min(colCount, Math.floor(availableW / 2)));
    const colWidth = availableW / colCount;
    const barWidth = Math.max(0.5, colWidth - Math.min(3.5, colWidth * .3));
    const headerSpace = 16;
    const footerSpace = legendHeight + 4;
    const usableH = Math.max(22, height - headerSpace - footerSpace);
    const segmentGap = Math.max(1.0, Math.min(2.0, (usableH / totalSegments) * 0.35));
    const segmentHeight = Math.max(1.8, (usableH - (totalSegments - 1) * segmentGap) / totalSegments);

    // 1. THEME-SPECIFIC BACKGROUND HUD & OSCILLOSCOPE GRIDS
    if (currentTheme === 'nms') {
        // Atlas Telemetry Scan HUD grid & coordinates
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.12)';
        ctx.lineWidth = 0.8;
        for (let g = 1; g <= 4; g++) {
            const gy = height - legendHeight - 4 - g * ((height - 24) / 5);
            ctx.beginPath();
            ctx.moveTo(paddingX, gy);
            ctx.lineTo(width - paddingX, gy);
            ctx.setLineDash([4, 6]);
            ctx.stroke();
        }
        // Beat scanline sweep
        if (playing && beatPulse > 0.3) {
            const scanX = paddingX + ((performance.now() * 0.25) % availableW);
            const scanGrad = ctx.createLinearGradient(scanX - 25, 0, scanX + 25, 0);
            scanGrad.addColorStop(0, 'rgba(255, 23, 68, 0)');
            scanGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.35)');
            scanGrad.addColorStop(1, 'rgba(255, 23, 68, 0)');
            ctx.fillStyle = scanGrad;
            ctx.fillRect(scanX - 25, 0, 50, height);
        }
        // HUD Top Banner
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(0, 229, 255, 0.65)';
        ctx.fillText('Spectrum', paddingX + 2, 11);
        ctx.restore();
    } else if (currentTheme === 'abyssal-void') {
        // Deep Trench Hydrophone CRT Oscilloscope Graticule
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 170, 0.12)';
        ctx.lineWidth = 0.8;
        const dbLabels = ['+3dB', '0dB', '-6dB', '-18dB', '-36dB'];
        for (let g = 0; g < dbLabels.length; g++) {
            const gy = height - legendHeight - 4 - (g + 1) * ((height - 26) / (dbLabels.length + 1));
            ctx.beginPath();
            ctx.moveTo(paddingX, gy);
            ctx.lineTo(width - paddingX, gy);
            ctx.setLineDash([2, 5]);
            ctx.stroke();
            ctx.font = '7px monospace';
            ctx.fillStyle = 'rgba(0, 255, 170, 0.45)';

        }
        // Oscilloscope sonar sweep indicator
        const sweepX = paddingX + ((performance.now() * 0.18) % availableW);
        ctx.strokeStyle = 'rgba(0, 255, 170, ' + (0.25 + beatPulse * 0.35) + ')';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(sweepX, 0);
        ctx.lineTo(sweepX, height - legendHeight - 2);
        ctx.stroke();
        ctx.restore();
    } else if (currentTheme === 'euclid-horizon') {
        // Synthwave Horizon Perspective Baseline Grid
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.15)';
        ctx.lineWidth = 0.8;
        for (let g = 1; g <= 3; g++) {
            const gy = height - legendHeight - 2 - g * 12;
            ctx.beginPath();
            ctx.moveTo(paddingX, gy);
            ctx.lineTo(width - paddingX, gy);
            ctx.stroke();
        }
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(251, 191, 36, 0.65)';
        ctx.fillText('Spectrum', paddingX + 2, 11);
        ctx.restore();
    } else if (currentTheme === 'solar-eclipse') {
        // Celestial Solar Prominence Header
        ctx.save();
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(0, 240, 255, 0.65)';
        ctx.fillText('Spectrum', paddingX + 2, 11);
        ctx.restore();
    } else if (currentTheme === 'alien-paradise') {
        ctx.save();
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(244, 63, 94, 0.65)';
        ctx.fillText('Spectrum', paddingX + 2, 11);
        ctx.restore();
    } else if (currentTheme === 'dissonance') {
        // Corrupted Sentinel Spectrum Scanner HUD
        ctx.save();
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.14)';
        ctx.lineWidth = 0.8;
        for (let g = 1; g <= 4; g++) {
            const gy = height - footerSpace - g * (usableH / 5);
            ctx.beginPath();
            ctx.moveTo(paddingX, gy);
            ctx.lineTo(width - paddingX, gy);
            ctx.setLineDash([3, 6]);
            ctx.stroke();
        }
        if (playing && beatPulse > 0.3) {
            const scanX = paddingX + ((performance.now() * 0.22) % availableW);
            const scanGrad = ctx.createLinearGradient(scanX - 25, 0, scanX + 25, 0);
            scanGrad.addColorStop(0, 'rgba(168, 85, 247, 0)');
            scanGrad.addColorStop(0.5, 'rgba(217, 70, 239, 0.35)');
            scanGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
            ctx.fillStyle = scanGrad;
            ctx.fillRect(scanX - 25, headerSpace, 50, usableH);
        }
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(217, 70, 239, 0.75)';
        ctx.fillText('Spectrum', paddingX + 2, 11);
        ctx.restore();
    } else if (currentTheme === 'sentinel') {
        // Sentinel Security Patrol HUD Sweep & Wanted Level Banner
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.14)';
        ctx.lineWidth = 0.8;
        for (let g = 1; g <= 4; g++) {
            const gy = height - legendHeight - 4 - g * ((height - 24) / 5);
            ctx.beginPath();
            ctx.moveTo(paddingX, gy);
            ctx.lineTo(width - paddingX, gy);
            ctx.setLineDash([4, 6]);
            ctx.stroke();
        }
        if (playing && beatPulse > 0.3) {
            const scanX = paddingX + ((performance.now() * 0.24) % availableW);
            const scanGrad = ctx.createLinearGradient(scanX - 25, 0, scanX + 25, 0);
            scanGrad.addColorStop(0, 'rgba(0, 229, 255, 0)');
            scanGrad.addColorStop(0.5, 'rgba(255, 61, 0, 0.35)');
            scanGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
            ctx.fillStyle = scanGrad;
            ctx.fillRect(scanX - 25, 0, 50, height);
        }
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(0, 229, 255, 0.85)';
        ctx.fillText('Spectrum', paddingX + 2, 11);
        ctx.restore();
    } else if (currentTheme === 'brutalist-light' || currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-dark' || currentTheme === 'minimalist-warm' || currentTheme === 'minimalist-obsidian') {
        const isLt = (currentTheme === 'brutalist-light' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-warm');
        ctx.save();
        let gridCol = isLt ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
        if (currentTheme === 'minimalist-warm') gridCol = 'rgba(217, 119, 6, 0.12)';
        else if (currentTheme === 'minimalist-obsidian') gridCol = 'rgba(56, 189, 248, 0.12)';
        ctx.strokeStyle = gridCol;
        ctx.lineWidth = 0.8;
        for (let g = 1; g <= 4; g++) {
            const gy = height - legendHeight - 4 - g * ((height - 24) / 5);
            ctx.beginPath();
            ctx.moveTo(paddingX, gy);
            ctx.lineTo(width - paddingX, gy);
            ctx.stroke();
        }
        ctx.font = '700 8px monospace';
        const headerText = 'Spectrum';
        let textCol = isLt ? '#000000' : '#ffffff';
        if (currentTheme === 'minimalist-warm') {

            textCol = '#1c1917';
        } else if (currentTheme === 'minimalist-obsidian') {

            textCol = '#38bdf8';
        }
        ctx.fillStyle = textCol;
        ctx.fillText(headerText, paddingX + 2, 11);
        ctx.restore();
    }

    // Color definitions for each theme
    let peakColor = '#ffffff';
    let peakGlow = 'rgba(255, 255, 255, 0.95)';
    let midColor = 'rgba(255, 255, 255, 0.92)';
    let midGlow = 'rgba(255, 255, 255, 0.45)';
    let lowColor = 'rgba(255, 255, 255, 0.78)';
    let lowGlow = 'transparent';
    let unlitColor = 'rgba(255, 255, 255, 0.07)';
    let diamondColor = '#ffffff';

    if (currentTheme === 'nms') {
        peakColor = '#ff1744'; peakGlow = 'rgba(255, 23, 68, 0.95)';
        midColor = '#ffab00'; midGlow = 'rgba(255, 171, 0, 0.65)';
        lowColor = 'rgba(0, 229, 255, 0.85)'; lowGlow = 'rgba(0, 229, 255, 0.4)';
        unlitColor = 'rgba(0, 229, 255, 0.06)'; diamondColor = '#ff1744';
    } else if (currentTheme === 'solar-eclipse') {
        peakColor = '#ff007f'; peakGlow = 'rgba(255, 0, 127, 0.95)';
        midColor = '#3b82f6'; midGlow = 'rgba(59, 130, 246, 0.65)';
        lowColor = 'rgba(0, 240, 255, 0.85)'; lowGlow = 'rgba(0, 240, 255, 0.4)';
        unlitColor = 'rgba(0, 240, 255, 0.06)'; diamondColor = '#00f0ff';
    } else if (currentTheme === 'euclid-horizon') {
        peakColor = '#e11d48'; peakGlow = 'rgba(225, 29, 72, 0.95)';
        midColor = '#fbbf24'; midGlow = 'rgba(251, 191, 36, 0.65)';
        lowColor = 'rgba(20, 184, 166, 0.85)'; lowGlow = 'rgba(20, 184, 166, 0.4)';
        unlitColor = 'rgba(20, 184, 166, 0.06)'; diamondColor = '#fbbf24';
    } else if (currentTheme === 'alien-paradise') {
        peakColor = '#ff2a70'; peakGlow = 'rgba(255, 42, 112, 0.95)';
        midColor = '#facc15'; midGlow = 'rgba(250, 204, 21, 0.65)';
        lowColor = 'rgba(0, 206, 209, 0.85)'; lowGlow = 'rgba(0, 206, 209, 0.4)';
        unlitColor = 'rgba(0, 206, 209, 0.06)'; diamondColor = '#ff2a70';
    } else if (currentTheme === 'abyssal-void') {
        peakColor = '#00ffaa'; peakGlow = 'rgba(0, 255, 170, 0.95)';
        midColor = '#6ee7b7'; midGlow = 'rgba(110, 231, 183, 0.65)';
        lowColor = 'rgba(16, 185, 129, 0.85)'; lowGlow = 'rgba(16, 185, 129, 0.4)';
        unlitColor = 'rgba(16, 185, 129, 0.06)'; diamondColor = '#00ffaa';
    } else if (currentTheme === 'dissonance') {
        peakColor = '#fae8ff'; peakGlow = 'rgba(217, 70, 239, 0.95)';
        midColor = '#d946ef'; midGlow = 'rgba(217, 70, 239, 0.75)';
        lowColor = 'rgba(168, 85, 247, 0.88)'; lowGlow = 'rgba(168, 85, 247, 0.45)';
        unlitColor = 'rgba(168, 85, 247, 0.12)'; diamondColor = '#d946ef';
    } else if (currentTheme === 'sentinel') {
        peakColor = '#ff3d00'; peakGlow = 'rgba(255, 61, 0, 0.95)';
        midColor = '#00e5ff'; midGlow = 'rgba(0, 229, 255, 0.65)';
        lowColor = 'rgba(248, 250, 252, 0.85)'; lowGlow = 'rgba(248, 250, 252, 0.4)';
        unlitColor = 'rgba(0, 229, 255, 0.06)'; diamondColor = '#00e5ff';
    } else if (currentTheme === 'brutalist-light' || currentTheme === 'minimalist-light') {
        peakColor = '#000000'; peakGlow = 'rgba(0, 0, 0, 0.35)';
        midColor = '#27272a'; midGlow = 'rgba(0, 0, 0, 0.15)';
        lowColor = 'rgba(39, 39, 42, 0.85)'; lowGlow = 'transparent';
        unlitColor = 'rgba(0, 0, 0, 0.05)'; diamondColor = '#000000';
    } else if (currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-dark') {
        peakColor = '#ffffff'; peakGlow = 'rgba(255, 255, 255, 0.75)';
        midColor = '#e4e4e7'; midGlow = 'rgba(255, 255, 255, 0.25)';
        lowColor = 'rgba(228, 228, 231, 0.85)'; lowGlow = 'transparent';
        unlitColor = 'rgba(255, 255, 255, 0.05)'; diamondColor = '#ffffff';
    } else if (currentTheme === 'minimalist-warm') {
        peakColor = '#d97706'; peakGlow = 'rgba(217, 119, 6, 0.45)';
        midColor = '#b45309'; midGlow = 'rgba(180, 83, 9, 0.2)';
        lowColor = '#1c1917'; lowGlow = 'transparent';
        unlitColor = 'rgba(28, 25, 23, 0.05)'; diamondColor = '#d97706';
    } else if (currentTheme === 'minimalist-obsidian') {
        peakColor = '#38bdf8'; peakGlow = 'rgba(56, 189, 248, 0.85)';
        midColor = '#ffffff'; midGlow = 'rgba(255, 255, 255, 0.35)';
        lowColor = '#e2e8f0'; lowGlow = 'transparent';
        unlitColor = 'rgba(255, 255, 255, 0.05)'; diamondColor = '#38bdf8';
    }

    // 2. COLUMN EQUALIZER PHYSICS & SEGMENTS RENDERING
    for (let i = 0; i < colCount; i++) {
        const x = paddingX + i * colWidth + (colWidth - barWidth) / 2;
        const bandVal = bands[Math.floor((i / colCount) * bands.length)] || 0;
        const shapedVal = Math.pow(bandVal, 1.25);
        const transientPop = (i < 18 ? beatPulse * 1.4 : (i < 38 ? snarePulse * 1.2 : smoothTreble * 1.1));

        const targetSegments = playing
            ? Math.max(0, Math.min(15.6, shapedVal * 12.8 + transientPop * 2.2))
            : 0;

        if (targetSegments > smoothDashLevels[i]) {
            smoothDashLevels[i] += (targetSegments - smoothDashLevels[i]) * colAttack;
        } else {
            smoothDashLevels[i] += (targetSegments - smoothDashLevels[i]) * colDecay;
        }
        const currentLevel = smoothDashLevels[i];

        if (currentLevel >= peakValues[i]) {
            peakValues[i] = currentLevel;
            peakVelocity[i] = 0;
            peakHold[i] = 20;
        } else {
            if (peakHold[i] > 0) {
                peakHold[i]--;
            } else {
                peakVelocity[i] += 26 * dt;
                peakValues[i] = Math.max(0, peakValues[i] - peakVelocity[i] * dt);
            }
        }

        const fullSegments = Math.floor(currentLevel);
        const fraction = currentLevel - fullSegments;

        // Render Segments per Theme
        for (let s = 0; s < totalSegments; s++) {
            const y = height - footerSpace - segmentHeight - s * (segmentHeight + segmentGap);
            const isMidSeg = s >= 8 && s < 12;
            const isPeakZone = s >= 12;
            const isLit = s < fullSegments;
            const isPartial = s === fullSegments && fraction > 0.03;

            const segColor = isPeakZone ? peakColor : (isMidSeg ? midColor : lowColor);
            ctx.fillStyle = (isLit || isPartial) ? segColor : unlitColor;

            // THEME-SPECIFIC SEGMENT SHAPES!
            if (currentTheme === 'nms') {
                // Slanted Tech Chevron / Tactical Trapezoid
                ctx.beginPath();
                ctx.moveTo(x + 2, y);
                ctx.lineTo(x + barWidth, y);
                ctx.lineTo(x + barWidth - 2, y + segmentHeight);
                ctx.lineTo(x, y + segmentHeight);
                ctx.closePath();
                ctx.fill();
            } else if (currentTheme === 'solar-eclipse') {
                // Glowing Circular Plasma Node / Eclipse Bead
                const cyNode = y + segmentHeight / 2;
                const cxNode = x + barWidth / 2;
                const radNode = Math.min(barWidth, segmentHeight) * 0.48;
                ctx.beginPath();
                ctx.arc(cxNode, cyNode, radNode, 0, Math.PI * 2);
                ctx.fill();
            } else if (currentTheme === 'euclid-horizon') {
                // Wireframe Dual-Stroke Laser Synth Bar
                ctx.fillRect(x, y, barWidth, segmentHeight);
                if (isLit) {
                    ctx.strokeStyle = isPeakZone ? '#fbbf24' : (isMidSeg ? '#14b8a6' : 'rgba(251, 191, 36, 0.7)');
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x, y, barWidth, segmentHeight);
                }
            } else if (currentTheme === 'alien-paradise') {
                // Smooth Organic Capsule Pod
                drawRoundedRect(ctx, x, y, barWidth, segmentHeight, segmentHeight * 0.45);
            } else if (currentTheme === 'abyssal-void') {
                // Digital CRT Phosphor Pip
                ctx.fillRect(x, y, barWidth, segmentHeight);
                // CRT Scanline notch
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.fillRect(x, y + segmentHeight * 0.5, barWidth, 0.6);
            } else if (currentTheme === 'dissonance') {
                // Angular Corrupted Sentinel Crystal Prism Segment
                const inset = Math.min(1.5, Math.max(0.8, barWidth * 0.14));
                ctx.beginPath();
                ctx.moveTo(x + inset, y);
                ctx.lineTo(x + barWidth - inset, y);
                ctx.lineTo(x + barWidth, y + segmentHeight / 2);
                ctx.lineTo(x + barWidth - inset, y + segmentHeight);
                ctx.lineTo(x + inset, y + segmentHeight);
                ctx.lineTo(x, y + segmentHeight / 2);
                ctx.closePath();
                ctx.fill();
                if (isLit && isPeakZone) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            } else if (currentTheme === 'sentinel') {
                // Ceramic Armor Angled Tactical Plate
                const inset = 1.0;
                ctx.beginPath();
                ctx.moveTo(x + inset, y);
                ctx.lineTo(x + barWidth, y);
                ctx.lineTo(x + barWidth - inset, y + segmentHeight);
                ctx.lineTo(x, y + segmentHeight);
                ctx.closePath();
                ctx.fill();
                if (isLit && isPeakZone) {
                    ctx.strokeStyle = '#ff3d00';
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            } else if (currentTheme === 'brutalist-light' || currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-dark' || currentTheme === 'minimalist-warm' || currentTheme === 'minimalist-obsidian') {
                // Pure Minimalist Rectilinear Segment: Sharp 0px corners, high-contrast flat fill
                ctx.fillRect(x, y, barWidth, segmentHeight);
                if (isLit && isPeakZone) {
                    let strokeCol = '#ffffff';
                    if (currentTheme === 'minimalist-light' || currentTheme === 'brutalist-light') strokeCol = '#000000';
                    else if (currentTheme === 'minimalist-warm') strokeCol = '#d97706';
                    else if (currentTheme === 'minimalist-obsidian') strokeCol = '#38bdf8';
                    ctx.strokeStyle = strokeCol;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x, y, barWidth, segmentHeight);
                }
            } else {
                // Default Studio Phosphor Rounded Bar
                drawRoundedRect(ctx, x, y, barWidth, segmentHeight, 1);
            }
            ctx.shadowBlur = 0;
        }

        // 3. THEME-SPECIFIC FLOATING PEAK CAPS!
        const peakSeg = Math.min(totalSegments - 1, Math.floor(peakValues[i]));
        if (peakSeg > fullSegments && peakSeg >= 1) {
            const peakY = height - footerSpace - segmentHeight - peakSeg * (segmentHeight + segmentGap);
            const pcx = x + barWidth / 2;
            const pcy = peakY + segmentHeight / 2;

            if (currentTheme === 'nms') {
                // Atlas Holographic Diamond with Target Brackets [ ◆ ]
                ctx.save();
                ctx.translate(pcx, pcy);
                ctx.rotate(Math.PI / 4);
                ctx.fillStyle = diamondColor;
                ctx.shadowColor = diamondColor;
                ctx.shadowBlur = Math.min(4, 2 + beatPulse * 2);
                const dSize = Math.max(2.2, Math.min(segmentHeight, barWidth * 0.45, 5.0));
                ctx.fillRect(-dSize / 2, -dSize / 2, dSize, dSize);
                ctx.restore();
                // Telemetry bracket
                ctx.strokeStyle = '#00e5ff';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(pcx - barWidth * 0.45, pcy - 2);
                ctx.lineTo(pcx - barWidth * 0.45, pcy + 2);
                ctx.moveTo(pcx + barWidth * 0.45, pcy - 2);
                ctx.lineTo(pcx + barWidth * 0.45, pcy + 2);
                ctx.stroke();
            } else if (currentTheme === 'solar-eclipse') {
                // Solar Eclipse Corona Orb with Pulsing Halo
                ctx.save();
                ctx.fillStyle = '#ff007f';
                ctx.shadowColor = '#00f0ff';
                ctx.shadowBlur = Math.min(4, 2 + beatPulse * 2);
                const orbR = Math.max(1.8, Math.min(barWidth * 0.38, segmentHeight * 0.85, 4.0));
                ctx.beginPath();
                ctx.arc(pcx, pcy, orbR, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#00f0ff';
                ctx.lineWidth = 1.0;
                ctx.stroke();
                ctx.restore();
            } else if (currentTheme === 'euclid-horizon') {
                // Horizon Speed Vector Blip
                ctx.save();
                ctx.fillStyle = '#fbbf24';
                ctx.shadowColor = '#fbbf24';
                ctx.shadowBlur = 3;
                ctx.fillRect(x - 1, peakY, barWidth + 2, Math.min(2.2, segmentHeight));
                ctx.fillStyle = '#14b8a6';
                ctx.fillRect(pcx - 1, peakY - 3, 2, 2);
                ctx.restore();
            } else if (currentTheme === 'alien-paradise') {
                // Floating Bioluminescent Spore Bead
                ctx.save();
                const bobY = pcy + Math.sin(performance.now() * 0.005 + i) * 1.0;
                ctx.fillStyle = '#ff2a70';
                ctx.shadowColor = '#00ced1';
                ctx.shadowBlur = Math.min(4, 2 + beatPulse * 2);
                const sporeR = Math.max(1.6, Math.min(barWidth * 0.36, segmentHeight * 0.8, 3.8));
                ctx.beginPath();
                ctx.arc(pcx, bobY, sporeR, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            } else if (currentTheme === 'abyssal-void') {
                // Sonar Radar Blip & Ripple Ring
                ctx.save();
                ctx.fillStyle = '#00ffaa';
                ctx.shadowColor = '#00ffaa';
                ctx.shadowBlur = 3;
                ctx.fillRect(x, peakY, barWidth, Math.min(2.0, segmentHeight));
                // Radar ping ripple
                ctx.strokeStyle = 'rgba(0, 255, 170, ' + (0.4 + beatPulse * 0.4) + ')';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.arc(pcx, pcy, Math.min(barWidth * 0.65, 6.0), 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            } else if (currentTheme === 'dissonance') {
                // Floating Luminous Atlantideum Shard Diamond Cap
                ctx.save();
                ctx.fillStyle = '#fae8ff';
                ctx.shadowColor = '#d946ef';
                ctx.shadowBlur = Math.min(4, 2 + beatPulse * 2);
                const capH = Math.max(1.8, Math.min(segmentHeight, 3.5));
                const capW = Math.max(3.0, Math.min(barWidth * 0.7, 8.0));
                ctx.beginPath();
                ctx.moveTo(pcx, pcy - capH);
                ctx.lineTo(pcx + capW * 0.5, pcy);
                ctx.lineTo(pcx, pcy + capH);
                ctx.lineTo(pcx - capW * 0.5, pcy);
                ctx.closePath();
                ctx.fill();
                // Inner luminous crystal core
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(pcx, pcy, Math.min(capH, capW) * 0.28, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            } else if (currentTheme === 'sentinel') {
                // Sentinel Laser Targeter Pip with Crosshair
                ctx.save();
                ctx.fillStyle = '#ff3d00';
                ctx.shadowColor = '#ff3d00';
                ctx.shadowBlur = Math.min(4, 2 + beatPulse * 2);
                ctx.fillRect(x, peakY, barWidth, Math.min(2.0, segmentHeight));
                // Optical targeting pip
                ctx.fillStyle = '#00e5ff';
                ctx.beginPath();
                ctx.arc(pcx, pcy, Math.min(1.4, segmentHeight * 0.5), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            } else if (currentTheme === 'brutalist-light' || currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-dark' || currentTheme === 'minimalist-warm' || currentTheme === 'minimalist-obsidian') {
                // Pure Minimalist Peak Cap: Sharp solid horizontal tick mark
                ctx.save();
                let capCol = '#ffffff';
                if (currentTheme === 'minimalist-light' || currentTheme === 'brutalist-light') capCol = '#000000';
                else if (currentTheme === 'minimalist-warm') capCol = '#d97706';
                else if (currentTheme === 'minimalist-obsidian') capCol = '#38bdf8';
                ctx.fillStyle = capCol;
                ctx.shadowBlur = 0;
                ctx.fillRect(x, peakY, barWidth, Math.min(2.0, segmentHeight));
                ctx.restore();
            } else {
                // Default Studio Phosphor LED Peak Bar
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = 'rgba(255, 255, 255, 0.95)';
                ctx.shadowBlur = Math.min(4, 2 + beatPulse * 2);
                drawRoundedRect(ctx, x, peakY, barWidth, segmentHeight, 1);
                ctx.shadowBlur = 0;
            }
        }
    }

    // 4. THEME-SPECIFIC FLOOR BASELINE & LABELS (Full 20Hz - 24kHz High-Fidelity Bandwidth)
    if (currentTheme === 'nms') {
        // Atlas Telemetry Baseline
        ctx.fillStyle = '#ff1744';
        ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.5);
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(0, 229, 255, 0.8)';
    } else if (currentTheme === 'solar-eclipse') {
        // Solar Prominence Plasma Floor
        const solGrad = ctx.createLinearGradient(paddingX, 0, width - paddingX, 0);
        solGrad.addColorStop(0, '#00f0ff');
        solGrad.addColorStop(0.5, '#ff007f');
        solGrad.addColorStop(1, '#00f0ff');
        ctx.fillStyle = solGrad;
        ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.8);
        ctx.font = '8px monospace';
        ctx.fillStyle = '#00f0ff';
    } else if (currentTheme === 'euclid-horizon') {
        // Synthwave Horizon Sun Arc & Floor
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.8);
        ctx.font = '8px monospace';
        ctx.fillStyle = '#fbbf24';
    } else if (currentTheme === 'alien-paradise') {
        // Undulating Mycelial Wave Baseline
        ctx.strokeStyle = '#ff2a70';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(paddingX, height - legendHeight - 2);
        for (let xPos = paddingX; xPos <= width - paddingX; xPos += 10) {
            const waveY = height - legendHeight - 2 + Math.sin(xPos * 0.05 + performance.now() * 0.003) * 1.5;
            ctx.lineTo(xPos, waveY);
        }
        ctx.stroke();
        ctx.font = '8px monospace';
        ctx.fillStyle = '#00ced1';
    } else if (currentTheme === 'abyssal-void') {
        // CRT Hydrophone Sonar Floor
        ctx.fillStyle = '#00ffaa';
        ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.8);
        ctx.font = '8px monospace';
        ctx.fillStyle = '#00ffaa';
    } else if (currentTheme === 'dissonance') {
        // Corrupted Sentinel Dissonance Floor Baseline
        ctx.fillStyle = '#d946ef';
        ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.8);
        ctx.font = '8px monospace';
        ctx.fillStyle = '#d946ef';
    } else if (currentTheme === 'sentinel') {
        // Sentinel Security Enforcement Floor Baseline
        ctx.fillStyle = '#ff3d00';
        ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.8);
        ctx.font = '8px monospace';
        ctx.fillStyle = '#00e5ff';
    } else if (currentTheme === 'brutalist-light' || currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-dark' || currentTheme === 'minimalist-warm' || currentTheme === 'minimalist-obsidian') {
        const isLt = (currentTheme === 'brutalist-light' || currentTheme === 'minimalist-light' || currentTheme === 'minimalist-warm');
        let floorCol = isLt ? '#000000' : '#ffffff';
        if (currentTheme === 'minimalist-warm') floorCol = '#d97706';
        else if (currentTheme === 'minimalist-obsidian') floorCol = '#38bdf8';
        ctx.fillStyle = floorCol;
        ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1.5);
        ctx.font = '700 8px monospace';
        ctx.fillStyle = floorCol;
    } else {
        // Default Studio Floor
        ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.24 + beatPulse * 0.40) + ')';
        ctx.fillRect(paddingX, height - legendHeight - 2, availableW, 1);
        ctx.save();
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.28 + (beatPulse + snarePulse) * 0.20) + ')';
        ctx.restore();
    }
}

export function drawRoundedRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
}
