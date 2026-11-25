import { setCanvasShadowBlur } from './canvas-shadow.js';
import { isFirefox } from '../utils.js';
import { emitShockwave, store } from '../state.js';
import { getActiveTheme, isAtlasThemeActive } from '../ui-elements.js';
import { drawSplinePath, updateAndDrawShockwaves } from './canvas-geometry.js';
import { updateAndDrawParticles } from './particles.js';

const thematicLeftPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
const thematicRightPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
const thematicLeftMistPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
const thematicRightMistPoints = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));

export function drawThematicWave(ctx, width, height, bands, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, drawDockScene) {
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
        setCanvasShadowBlur(ctx, Math.min(12, 6 + beatPulse * 8));
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
        setCanvasShadowBlur(ctx, Math.min(12, 6 + beatPulse * 8 + snarePulse * 4));
        ctx.lineWidth = 2.2 + beatPulse * 1.4 + snarePulse * 0.8;
        ctx.strokeStyle = thematicCrestStroke;
        ctx.beginPath();
        ctx.moveTo(thematicRightPoints[0].x, thematicRightPoints[0].y);
        drawSplinePath(ctx, thematicRightPoints);
        ctx.stroke();
    }
    ctx.restore();

    // Distinct Thematic Centerpiece for each Theme (NMS Starship, Touhou Core, Solar Cruiser, Vector Speeder, Bio Manta, Deep Submersible)
    if (drawDockScene) {
        const scale = Math.min(.96, Math.max(.56, height / 102));
        drawDockScene(ctx, centerX, centerY - 3.5 * scale, scale, playing, now, dt, beatPulse, snarePulse, smoothBass, smoothMid, smoothTreble, bands);
    }

    // Floating Sakura Petals & Spirit Danmaku (Default Touhou Theme Only)
    if (currentTheme === 'default') {
        updateAndDrawParticles(ctx, width, height, dt, smoothBass * 1.8 + beatPulse * 2.5 + snarePulse * 1.2);
    }
}
