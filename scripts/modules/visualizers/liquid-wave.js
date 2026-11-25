import { setCanvasShadowBlur } from './canvas-shadow.js';
import { isFirefox } from '../utils.js';
import { NUM_BANDS, store, emitShockwave } from '../state.js';
import { getActiveTheme, isAtlasThemeActive } from '../ui-elements.js';
import { drawSplinePath, updateAndDrawShockwaves } from './canvas-geometry.js';

const crestSparkles = [];
export function emitSparkle(x, y, intensity = 1.0) {
    if (crestSparkles.length >= 24) crestSparkles.shift();
    crestSparkles.push({
        x,
        y,
        life: 1.0,
        decay: 2.2 + Math.random() * 1.5,
        size: 2.0 + Math.random() * 2.8,
        intensity
    });
}

export function updateAndDrawSparkles(ctx, dt) {
    const currentTheme = getActiveTheme();
    if (currentTheme !== 'default') {
        crestSparkles.length = 0;
        return;
    }
    for (let i = crestSparkles.length - 1; i >= 0; i--) {
        const sp = crestSparkles[i];
        sp.life -= sp.decay * dt;
        if (sp.life <= 0) {
            crestSparkles.splice(i, 1);
            continue;
        }
        ctx.save();
        ctx.translate(sp.x, sp.y);
        const a = sp.life * sp.intensity;
        ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.95)';
        setCanvasShadowBlur(ctx, 6);
        const s = sp.size * (0.5 + sp.life * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.4, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.4, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

// Smooth Catmull-Rom Spline Path Generator (passes exactly through all peaks and valleys with C1 continuity)


// =========================================================================


const solidWaveUndertowPoints = Array.from({ length: NUM_BANDS }, () => ({ x: 0, y: 0 }));
const solidWaveMidPoints = Array.from({ length: NUM_BANDS }, () => ({ x: 0, y: 0 }));
const solidWaveForePoints = Array.from({ length: NUM_BANDS }, () => ({ x: 0, y: 0 }));

export function drawSolidWave(ctx, width, height, bands, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, drawParticles) {
    const pointsCount = bands.length;
    const step = width / (pointsCount - 1);

    // Shockwave trigger on heavy drum kicks
    if (playing && beatPulse > 0.52 && Math.random() < 0.25) {
        emitShockwave(width * 0.18, height - 16, Math.min(width * 0.45, 110), 0.75);
    }

    // Headroom: leaves 24% atmospheric breathing space at top so the wave is never easily filled
    const topHeadroom = Math.max(12, height * 0.24);
    const maxForegroundHeight = height - topHeadroom - 4;

    const currentTheme = getActiveTheme();

    // Layer 1: Ambient Deep Translucent Undertow (Sub-bass & Kick weight)
    const undertowHeadroom = Math.max(18, height * 0.44);
    const maxUndertowHeight = height - undertowHeadroom;
    const undertowPoints = solidWaveUndertowPoints;
    for (let i = 0; i < pointsCount; i++) {
        const x = i * step;
        const bassWeight = Math.max(0, 1.0 - (i / (pointsCount * 0.65)));
        const b = bands[Math.floor(i * 0.35)] * bassWeight;
        const h = Math.min(maxUndertowHeight, b * maxUndertowHeight * (0.80 + smoothBass * 0.25) + (playing ? 2 : 1));
        const pt = undertowPoints[i];
        pt.x = x;
        pt.y = Math.max(undertowHeadroom, height - h);
    }
    ctx.beginPath();
    ctx.moveTo(undertowPoints[0].x, height);
    ctx.lineTo(undertowPoints[0].x, undertowPoints[0].y);
    drawSplinePath(ctx, undertowPoints);
    ctx.lineTo(undertowPoints[undertowPoints.length - 1].x, height);
    ctx.closePath();

    let undertowFill = 'rgba(255, 255, 255, ' + (0.05 + smoothBass * 0.08) + ')';
    let midFill = 'rgba(255, 255, 255, ' + (0.08 + smoothMid * 0.10 + snarePulse * 0.06) + ')';
    if (currentTheme === 'nms') {
        undertowFill = 'rgba(124, 77, 255, ' + (0.14 + smoothBass * 0.18) + ')';
        midFill = 'rgba(0, 229, 255, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
    } else if (currentTheme === 'solar-eclipse') {
        undertowFill = 'rgba(255, 0, 128, ' + (0.14 + smoothBass * 0.18) + ')';
        midFill = 'rgba(0, 240, 255, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
    } else if (currentTheme === 'euclid-horizon') {
        undertowFill = 'rgba(225, 29, 72, ' + (0.14 + smoothBass * 0.18) + ')';
        midFill = 'rgba(251, 191, 36, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
    } else if (currentTheme === 'alien-paradise') {
        undertowFill = 'rgba(244, 63, 94, ' + (0.14 + smoothBass * 0.18) + ')';
        midFill = 'rgba(0, 206, 209, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
    } else if (currentTheme === 'abyssal-void') {
        undertowFill = 'rgba(5, 150, 105, ' + (0.14 + smoothBass * 0.18) + ')';
        midFill = 'rgba(0, 255, 170, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
    } else if (currentTheme === 'dissonance') {
        undertowFill = 'rgba(126, 34, 206, ' + (0.14 + smoothBass * 0.18) + ')';
        midFill = 'rgba(217, 70, 239, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
    } else if (currentTheme === 'sentinel') {
        undertowFill = 'rgba(14, 20, 36, ' + (0.16 + smoothBass * 0.18) + ')';
        midFill = 'rgba(0, 229, 255, ' + (0.16 + smoothMid * 0.16 + snarePulse * 0.12) + ')';
    } else if (currentTheme === 'brutalist-light' || currentTheme === 'minimalist-light') {
        undertowFill = 'rgba(0, 0, 0, ' + (0.04 + smoothBass * 0.05) + ')';
        midFill = 'rgba(0, 0, 0, ' + (0.08 + smoothMid * 0.08 + snarePulse * 0.05) + ')';
    } else if (currentTheme === 'brutalist-dark' || currentTheme === 'minimalist-dark') {
        undertowFill = 'rgba(255, 255, 255, ' + (0.04 + smoothBass * 0.05) + ')';
        midFill = 'rgba(255, 255, 255, ' + (0.08 + smoothMid * 0.08 + snarePulse * 0.05) + ')';
    } else if (currentTheme === 'minimalist-warm') {
        undertowFill = 'rgba(217, 119, 6, ' + (0.06 + smoothBass * 0.08) + ')';
        midFill = 'rgba(28, 25, 23, ' + (0.08 + smoothMid * 0.08 + snarePulse * 0.05) + ')';
    } else if (currentTheme === 'minimalist-obsidian') {
        undertowFill = 'rgba(56, 189, 248, ' + (0.06 + smoothBass * 0.08) + ')';
        midFill = 'rgba(255, 255, 255, ' + (0.08 + smoothMid * 0.08 + snarePulse * 0.05) + ')';
    }
    ctx.fillStyle = undertowFill;
    ctx.fill();

    // Layer 2: Mid-range Harmonic Wave (reacts to vocals, chords, synths)
    const midHeadroom = Math.max(16, height * 0.34);
    const maxMidHeight = height - midHeadroom;
    const midPoints = solidWaveMidPoints;
    for (let i = 0; i < pointsCount; i++) {
        const x = i * step;
        const b = bands[i];
        const h = Math.min(maxMidHeight, b * maxMidHeight * (0.78 + smoothMid * 0.20 + snarePulse * 0.10) + (playing ? 2.5 : 1.2));
        const pt = midPoints[i];
        pt.x = x;
        pt.y = Math.max(midHeadroom, height - h);
    }
    ctx.beginPath();
    ctx.moveTo(midPoints[0].x, height);
    ctx.lineTo(midPoints[0].x, midPoints[0].y);
    drawSplinePath(ctx, midPoints);
    ctx.lineTo(midPoints[midPoints.length - 1].x, height);
    ctx.closePath();
    ctx.fillStyle = midFill;
    ctx.fill();

    // Layer 3: Solid Foreground Liquid Wave (Direct High-Fidelity Musical Spectrum)
    const forePoints = solidWaveForePoints;
    let minY = height;
    for (let i = 0; i < pointsCount; i++) {
        const x = i * step;
        const b = bands[i];
        const dynamicLift = 0.88 + beatPulse * 0.14 + snarePulse * 0.08;
        const amp = Math.min(maxForegroundHeight, b * maxForegroundHeight * dynamicLift + (playing ? 3.5 : 1.5));
        const y = Math.max(topHeadroom, height - amp);
        if (y < minY) minY = y;
        const pt = forePoints[i];
        pt.x = x;
        pt.y = y;
    }

    ctx.beginPath();
    ctx.moveTo(forePoints[0].x, height);
    ctx.lineTo(forePoints[0].x, forePoints[0].y);
    drawSplinePath(ctx, forePoints);
    ctx.lineTo(forePoints[forePoints.length - 1].x, height);
    ctx.closePath();

    const liquidGrad = ctx.createLinearGradient(0, minY, 0, height);
    let waveShadowColor = 'rgba(255, 255, 255, ' + (0.85 + beatPulse * 0.15) + ')';
    switch (currentTheme) {
        case 'nms':
            liquidGrad.addColorStop(0, '#ffffff');
            liquidGrad.addColorStop(0.12, '#ffab00');
            liquidGrad.addColorStop(0.35, '#ff1744');
            liquidGrad.addColorStop(0.70, 'rgba(213, 0, 0, 0.45)');
            liquidGrad.addColorStop(1, 'rgba(124, 77, 255, 0.05)');
            waveShadowColor = '#ff1744';
            break;
        case 'solar-eclipse':
            liquidGrad.addColorStop(0, '#ffffff');
            liquidGrad.addColorStop(0.15, '#00f0ff');
            liquidGrad.addColorStop(0.40, '#ff007f');
            liquidGrad.addColorStop(0.75, 'rgba(179, 0, 89, 0.40)');
            liquidGrad.addColorStop(1, 'rgba(0, 240, 255, 0.05)');
            waveShadowColor = '#00f0ff';
            break;
        case 'euclid-horizon':
            liquidGrad.addColorStop(0, '#ffffff');
            liquidGrad.addColorStop(0.15, '#fbbf24');
            liquidGrad.addColorStop(0.40, '#14b8a6');
            liquidGrad.addColorStop(0.75, 'rgba(225, 29, 72, 0.35)');
            liquidGrad.addColorStop(1, 'rgba(20, 184, 166, 0.05)');
            waveShadowColor = '#fbbf24';
            break;
        case 'alien-paradise':
            liquidGrad.addColorStop(0, '#ffffff');
            liquidGrad.addColorStop(0.15, '#ff2a70');
            liquidGrad.addColorStop(0.40, '#00ced1');
            liquidGrad.addColorStop(0.75, 'rgba(250, 204, 21, 0.35)');
            liquidGrad.addColorStop(1, 'rgba(0, 206, 209, 0.05)');
            waveShadowColor = '#ff2a70';
            break;
        case 'abyssal-void':
            liquidGrad.addColorStop(0, '#ffffff');
            liquidGrad.addColorStop(0.15, '#00ffaa');
            liquidGrad.addColorStop(0.40, '#10b981');
            liquidGrad.addColorStop(0.75, 'rgba(5, 150, 105, 0.35)');
            liquidGrad.addColorStop(1, 'rgba(16, 185, 129, 0.05)');
            waveShadowColor = '#00ffaa';
            break;
        case 'dissonance':
            liquidGrad.addColorStop(0, '#ffffff');
            liquidGrad.addColorStop(0.15, '#d946ef');
            liquidGrad.addColorStop(0.40, '#a855f7');
            liquidGrad.addColorStop(0.75, 'rgba(126, 34, 206, 0.35)');
            liquidGrad.addColorStop(1, 'rgba(88, 28, 135, 0.05)');
            waveShadowColor = '#d946ef';
            break;
        case 'sentinel':
            liquidGrad.addColorStop(0, '#ffffff');
            liquidGrad.addColorStop(0.15, '#00e5ff');
            liquidGrad.addColorStop(0.40, '#ff3d00');
            liquidGrad.addColorStop(0.75, 'rgba(0, 229, 255, 0.35)');
            liquidGrad.addColorStop(1, 'rgba(11, 14, 23, 0.05)');
            waveShadowColor = '#00e5ff';
            break;
        case 'minimalist-light':
        case 'brutalist-light':
            liquidGrad.addColorStop(0, '#000000');
            liquidGrad.addColorStop(0.35, '#27272a');
            liquidGrad.addColorStop(0.70, 'rgba(0, 0, 0, 0.35)');
            liquidGrad.addColorStop(1, 'rgba(0, 0, 0, 0.04)');
            waveShadowColor = 'rgba(0, 0, 0, 0.3)';
            break;
        case 'minimalist-dark':
        case 'brutalist-dark':
            liquidGrad.addColorStop(0, '#ffffff');
            liquidGrad.addColorStop(0.35, '#e4e4e7');
            liquidGrad.addColorStop(0.70, 'rgba(255, 255, 255, 0.35)');
            liquidGrad.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
            waveShadowColor = 'rgba(255, 255, 255, 0.3)';
            break;
        case 'minimalist-warm':
            liquidGrad.addColorStop(0, '#d97706');
            liquidGrad.addColorStop(0.35, '#b45309');
            liquidGrad.addColorStop(0.70, 'rgba(217, 119, 6, 0.35)');
            liquidGrad.addColorStop(1, 'rgba(250, 248, 245, 0.04)');
            waveShadowColor = 'rgba(217, 119, 6, 0.35)';
            break;
        case 'minimalist-obsidian':
            liquidGrad.addColorStop(0, '#38bdf8');
            liquidGrad.addColorStop(0.35, '#0284c7');
            liquidGrad.addColorStop(0.70, 'rgba(56, 189, 248, 0.35)');
            liquidGrad.addColorStop(1, 'rgba(0, 0, 0, 0.04)');
            waveShadowColor = 'rgba(56, 189, 248, 0.4)';
            break;
        default:
            liquidGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
            liquidGrad.addColorStop(0.18, 'rgba(255, 255, 255, 0.65)');
            liquidGrad.addColorStop(0.50, 'rgba(255, 255, 255, 0.22)');
            liquidGrad.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
            break;
    }
    ctx.fillStyle = liquidGrad;
    ctx.fill();

    // Luminous Crest Ridge with Glow (+25% bloom on beat/snare pulses)
    const crestStrokeColor = (currentTheme === 'minimalist-light' || currentTheme === 'brutalist-light')
        ? '#09090b'
        : (currentTheme === 'minimalist-warm' ? '#9a3412' : (currentTheme === 'minimalist-obsidian' ? '#38bdf8' : '#ffffff'));
    ctx.save();
    if (isFirefox) {
        // Ethereal Multi-Pass Vector Glow for Firefox/Gecko:
        // High-fidelity blooming crest rendered in pure hardware rasterization with 0% CPU blur overhead
        ctx.beginPath();
        ctx.moveTo(forePoints[0].x, forePoints[0].y);
        drawSplinePath(ctx, forePoints);
        ctx.lineWidth = (2.0 + beatPulse * 1.2 + snarePulse * 0.6) * 2.2;
        ctx.strokeStyle = waveShadowColor;
        ctx.globalAlpha = 0.42;
        ctx.stroke();

        ctx.lineWidth = 2.0 + beatPulse * 1.2 + snarePulse * 0.6;
        ctx.strokeStyle = crestStrokeColor;
        ctx.globalAlpha = 1.0;
        ctx.stroke();
    } else {
        ctx.shadowColor = waveShadowColor;
        setCanvasShadowBlur(ctx, Math.min(12, 4 + beatPulse * 8 + snarePulse * 4));
        ctx.lineWidth = 2.0 + beatPulse * 1.2 + snarePulse * 0.6;
        ctx.strokeStyle = crestStrokeColor;
        ctx.beginPath();
        ctx.moveTo(forePoints[0].x, forePoints[0].y);
        drawSplinePath(ctx, forePoints);
        ctx.stroke();
    }
    ctx.restore();

    // THEME-SPECIFIC DISTINCT WAVEFORM OVERLAYS
    if (currentTheme === 'nms') {
        // Atlas Segmented Vector Laser Nodes along peaks
        ctx.save();
        ctx.fillStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        setCanvasShadowBlur(ctx, 8);
        for (let i = 2; i < pointsCount - 2; i += 3) {
            if (bands[i] > 0.35) {
                const nx = forePoints[i].x;
                const ny = forePoints[i].y;
                ctx.beginPath();
                ctx.arc(nx, ny, 2.4 + beatPulse * 1.5, 0, Math.PI * 2);
                ctx.fill();
                // Technical laser crosshair
                ctx.strokeStyle = 'rgba(255, 23, 68, 0.6)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(nx - 5, ny); ctx.lineTo(nx + 5, ny);
                ctx.moveTo(nx, ny - 5); ctx.lineTo(nx, ny + 5);
                ctx.stroke();
            }
        }
        ctx.restore();
    } else if (currentTheme === 'solar-eclipse') {
        // Solar Prominence Plasma Loops leaping above the wave on kicks
        if (playing && beatPulse > 0.35) {
            ctx.save();
            for (let i = 4; i < pointsCount - 4; i += 7) {
                if (bands[i] > 0.40) {
                    const px = forePoints[i].x;
                    const py = forePoints[i].y;
                    const loopH = (15 + beatPulse * 30) * (bands[i] || 0.5);
                    ctx.beginPath();
                    ctx.moveTo(px - 8, py);
                    ctx.quadraticCurveTo(px, py - loopH, px + 8, py);
                    ctx.strokeStyle = 'rgba(255, 0, 128, 0.85)';
                    ctx.shadowColor = '#00f0ff';
                    setCanvasShadowBlur(ctx, 10);
                    ctx.lineWidth = 1.8;
                    ctx.stroke();
                }
            }
            ctx.restore();
        }
    } else if (currentTheme === 'abyssal-void') {
        // Hydrophone Sonar Oscilloscope CRT Graticule Lines
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 170, 0.15)';
        ctx.lineWidth = 0.8;
        const numGrids = 4;
        for (let g = 1; g <= numGrids; g++) {
            const gy = height - (g * (height / (numGrids + 1)));
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(width, gy);
            ctx.setLineDash([3, 5]);
            ctx.stroke();
        }
        ctx.restore();
    } else if (currentTheme === 'dissonance') {
        // Corrupted Sentinel Spectrum CRT Telemetry Lines
        ctx.save();
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.16)';
        ctx.lineWidth = 0.8;
        const numGrids = 4;
        for (let g = 1; g <= numGrids; g++) {
            const gy = height - (g * (height / (numGrids + 1)));
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(width, gy);
            ctx.setLineDash([3, 6]);
            ctx.stroke();
        }
        ctx.restore();
    } else if (currentTheme === 'sentinel') {
        // Sentinel Security Patrol CRT Telemetry Grid & Scanning nodes
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.14)';
        ctx.lineWidth = 0.8;
        const numGrids = 4;
        for (let g = 1; g <= numGrids; g++) {
            const gy = height - (g * (height / (numGrids + 1)));
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(width, gy);
            ctx.setLineDash([4, 6]);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Crest Sparkles emission on snare snaps, vocal spikes & prominent crests (Default theme only)
    if (currentTheme === 'default' && playing && (snarePulse > 0.20 || beatPulse > 0.35)) {
        for (let i = 3; i < pointsCount - 3; i += 3) {
            if (bands[i] > 0.45 && bands[i] >= bands[i - 1] && bands[i] >= bands[i + 1]) {
                if (Math.random() < 0.32) {
                    emitSparkle(forePoints[i].x, forePoints[i].y, snarePulse + 0.35);
                }
            }
        }
    }

    // Draw Expanding Shockwaves & Crest Sparkles
    updateAndDrawShockwaves(ctx, dt);
    if (currentTheme === 'default') {
        updateAndDrawSparkles(ctx, dt);
    }

    // Floating spray particles triggered on bass surges and beat hits (Default theme only)
    if (playing && currentTheme === 'default') {
        drawParticles?.(ctx, width, height, dt, smoothBass * 1.6 + beatPulse * 2.2 + snarePulse * 1.2);
    }
}
