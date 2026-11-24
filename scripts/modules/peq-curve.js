import {EQ_PLOT_INSETS} from './eq-spectrum.js';

// Calculated EQ response, independent of the live analyser spectrum.
export function renderPeqCurve(canvas, state, PEQ_FREQS) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const rect = canvas.getBoundingClientRect();
    if (!rect || rect.width < 16 || rect.height < 16) return;
    const fullW = rect.width;
    const fullH = rect.height;
    const {left, right, top, bottom} = EQ_PLOT_INSETS;
    const w = fullW - left - right;
    const h = fullH - top - bottom;
    if (w <= 0 || h <= 0) return;

    const targetW = Math.min(4096, Math.round(fullW * dpr));
    const targetH = Math.min(2048, Math.round(fullH * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(targetW / fullW, targetH / fullH);
    ctx.clearRect(0, 0, fullW, fullH);
    ctx.translate(left, top);

    const minFreq = 20;
    const maxFreq = 20000;
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const maxDb = 15;
    const zeroY = h / 2;

    const freqToX = (f) => ((Math.log10(f) - logMin) / (logMax - logMin)) * w;
    const dbToY = (db) => zeroY - (db / maxDb) * (h / 2);

    const palette = getComputedStyle(canvas);
    const color = name => palette.getPropertyValue(name).trim();
    const grid = color('--border-subtle');
    const axis = color('--text-muted');
    const accent = color('--accent-color');
    const trace = state.isPeqBypassed ? axis : accent;

    ctx.lineWidth = 1;
    const gridFreqs = [50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000];
    ctx.strokeStyle = grid;
    ctx.fillStyle = axis;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';

    let lastLabelX = -Infinity;
    gridFreqs.forEach(f => {
        const x = freqToX(f);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        const lbl = f >= 1000 ? `${f / 1000}k` : `${f}`;
        if (x - lastLabelX >= 28 && x < w - 8) {
            ctx.fillText(lbl, x, h + 13);
            lastLabelX = x;
        }
    });

    // Horizontal dB grid, shared plot area with the spectrum.
    const dbs = [15, 10, 5, 0, -5, -10, -15];
    dbs.forEach(d => {
        const y = dbToY(d);
        ctx.beginPath();
        ctx.strokeStyle = d === 0 ? axis : grid;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    });

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const d of [15, 0, -15]) ctx.fillText(`${d > 0 ? '+' : ''}${d} dB`, -6, dbToY(d));

    // 2. Calculate Combined Digital Biquad Frequency Response |H(e^jw)|^2
    const s = state;
    const sampleRate = (s.audioContext && s.audioContext.sampleRate) ? s.audioContext.sampleRate : 48000;
    const bandCoeffs = [];
    if (!s.isPeqBypassed) {
        for (let b = 0; b < PEQ_FREQS.length; b++) {
            const gainDb = s.peqGains[b];
            if (!gainDb) continue;
            const f0 = Math.min(PEQ_FREQS[b], sampleRate * 0.45);
            const Q = (s.peqQs && s.peqQs[b]) ? s.peqQs[b] : 1.414;
            const A = Math.pow(10, gainDb / 40);
            const w0 = (2 * Math.PI * f0) / sampleRate;
            const cosW0 = Math.cos(w0);
            const sinW0 = Math.sin(w0);

            let b0, b1, b2, a0, a1, a2;
            if (b === 0) {
                const alphaS = (sinW0 / 2) * Math.sqrt(Math.max(0.01, (A + 1 / A) * (1 / 0.7071 - 1) + 2));
                const twoSqrtA = 2 * Math.sqrt(A) * alphaS;
                b0 = A * ((A + 1) - (A - 1) * cosW0 + twoSqrtA);
                b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
                b2 = A * ((A + 1) - (A - 1) * cosW0 - twoSqrtA);
                a0 = (A + 1) + (A - 1) * cosW0 + twoSqrtA;
                a1 = -2 * ((A - 1) + (A + 1) * cosW0);
                a2 = (A + 1) + (A - 1) * cosW0 - twoSqrtA;
            } else if (b === PEQ_FREQS.length - 1) {
                const alphaS = (sinW0 / 2) * Math.sqrt(Math.max(0.01, (A + 1 / A) * (1 / 0.7071 - 1) + 2));
                const twoSqrtA = 2 * Math.sqrt(A) * alphaS;
                b0 = A * ((A + 1) + (A - 1) * cosW0 + twoSqrtA);
                b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
                b2 = A * ((A + 1) + (A - 1) * cosW0 - twoSqrtA);
                a0 = (A + 1) - (A - 1) * cosW0 + twoSqrtA;
                a1 = 2 * ((A - 1) - (A + 1) * cosW0);
                a2 = (A + 1) - (A - 1) * cosW0 - twoSqrtA;
            } else {
                const alpha = sinW0 / (2 * Math.max(0.4, Q));
                b0 = 1 + alpha * A;
                b1 = -2 * cosW0;
                b2 = 1 - alpha * A;
                a0 = 1 + alpha / A;
                a1 = -2 * cosW0;
                a2 = 1 - alpha / A;
            }
            bandCoeffs.push({
                b0: b0 / a0,
                b1: b1 / a0,
                b2: b2 / a0,
                a1: a1 / a0,
                a2: a2 / a0
            });
        }
    }

    const points = [];
    const numSteps = Math.min(300, Math.round(w));
    for (let stepIdx = 0; stepIdx <= numSteps; stepIdx++) {
        const x = (stepIdx / numSteps) * w;
        const freq = Math.pow(10, logMin + (x / w) * (logMax - logMin));
        let magSq = 1.0;

        if (bandCoeffs.length > 0 && freq < sampleRate * 0.495) {
            const omega = (2 * Math.PI * freq) / sampleRate;
            const cos1 = Math.cos(omega);
            const sin1 = Math.sin(omega);
            const cos2 = Math.cos(2 * omega);
            const sin2 = Math.sin(2 * omega);

            for (let c = 0; c < bandCoeffs.length; c++) {
                const k = bandCoeffs[c];
                const numRe = k.b0 + k.b1 * cos1 + k.b2 * cos2;
                const numIm = -k.b1 * sin1 - k.b2 * sin2;
                const denRe = 1 + k.a1 * cos1 + k.a2 * cos2;
                const denIm = -k.a1 * sin1 - k.a2 * sin2;
                const denMagSq = denRe * denRe + denIm * denIm;
                if (denMagSq > 1e-18) {
                    magSq *= (numRe * numRe + numIm * numIm) / denMagSq;
                }
            }
        }

        const totalGain = 10 * Math.log10(Math.max(1e-6, magSq));
        const y = dbToY(Math.max(-15, Math.min(15, totalGain)));
        points.push({ x, y, totalGain });
    }

    if (points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(0, zeroY);
        for (const { x, y } of points) ctx.lineTo(x, y);
        ctx.lineTo(w, zeroY);
        ctx.closePath();
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = trace;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (const { x, y } of points.slice(1)) ctx.lineTo(x, y);
        ctx.strokeStyle = trace;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // 5. Center Frequency Nodes
    PEQ_FREQS.forEach((f0, b) => {
        const x = freqToX(f0);
        const g = state.isPeqBypassed ? 0 : state.peqGains[b];
        const y = dbToY(g);

        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = g !== 0 ? accent : color('--bg-canvas');
        ctx.fill();
        ctx.strokeStyle = trace;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });

    ctx.restore();
}

