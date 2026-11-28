import { circle, ring, bandLevel, label, drawDial, createDock } from './record-dial.js';
// Paper Sonata: editorial warm-cream platter with burgundy score staves and harmonic ribbon.
export function drawCore(ctx, w, h, playing, now, dt, beat, snare, bass, mid, treble, fidelity, bands) {
    drawDial(ctx, w, h, c => {
        circle(c, .987, '#f6f1e6', '#7c2d36', .01);
        for (let r = .91; r > .55; r -= .045) ring(c, r, '#ded4c2', .004);
        ring(c, .82, '#a84752', .006);
        c.strokeStyle = '#7c2d36';
        c.lineWidth = .012;
        c.beginPath();
        const count = 48;
        for (let i = 0; i <= count; i++) {
            const a = -Math.PI / 2 + (Math.PI * 2 * i) / count;
            const lv = bandLevel(bands, i % count, count, playing, mid);
            const r = .62 + lv * .21;
            const x = Math.cos(a) * r;
            const y = Math.sin(a) * r;
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
        }
        c.closePath();
        c.stroke();
        circle(c, .47, '#fbf8f1', '#b49f89', .009);
        ring(c, .40, '#7c2d36', .005);
        label(c, 'Sonata', -.125, '#3b1c20', .145, 'Georgia, serif');
        circle(c, .04, '#7c2d36', '#f6f1e6', .008);
        label(c, 'OPUS III', .155, '#6e524a', .058, 'Georgia, serif');
    });
}
export const drawDockScene = createDock(drawCore);
