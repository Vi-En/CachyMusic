import { circle, ring, radialBars, label, drawDial, createDock } from './record-dial.js';
// Orchid Matrix: modular violet geometry with octagonal node framing and crisp spectral bars.
export function drawCore(ctx, w, h, playing, now, dt, beat, snare, bass, mid, treble, fidelity, bands) {
    drawDial(ctx, w, h, c => {
        circle(c, .987, '#140f21', '#a855f7', .008);
        ring(c, .90, '#2e1d4c', .006);
        c.strokeStyle = '#6b21a8';
        c.lineWidth = .006;
        c.beginPath();
        for (let i = 0; i <= 8; i++) {
            const a = (Math.PI * 2 * i) / 8 + Math.PI / 8;
            const x = Math.cos(a) * .84;
            const y = Math.sin(a) * .84;
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
        }
        c.closePath();
        c.stroke();
        radialBars(c, bands, playing, 64, .54, .27, '#c084fc', mid, .009);
        circle(c, .45, '#1d1430', '#9333ea', .01);
        ring(c, .36, '#d8b4fe', .014, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (playing ? .16 + .8 * bass : .14));
        label(c, 'ORCHID', -.115, '#f3e8ff', .076, 'system-ui, sans-serif');
        circle(c, .044, '#c084fc', '#140f21', .009);
        label(c, 'MATRIX', .14, '#c4b5fd', .06, 'system-ui, sans-serif');
    });
}
export const drawDockScene = createDock(drawCore);
