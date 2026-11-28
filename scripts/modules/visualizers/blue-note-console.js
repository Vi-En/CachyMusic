import { circle, ring, bandLevel, label, drawDial, createDock } from './record-dial.js';
// Blue Note Console: deep navy broadcast workstation dial with calibrated meter ticks and cyan readout arc.
export function drawCore(ctx, w, h, playing, now, dt, beat, snare, bass, mid, treble, fidelity, bands) {
    drawDial(ctx, w, h, c => {
        circle(c, .987, '#0b1424', '#38bdf8', .008);
        ring(c, .90, '#1e3a5f', .007);
        ring(c, .84, '#2563eb', .004);
        const ticks = 48;
        c.lineCap = 'butt';
        for (let i = 0; i < ticks; i++) {
            const a = -Math.PI / 2 + (Math.PI * 2 * i) / ticks;
            const lv = bandLevel(bands, i, ticks, playing, treble);
            const active = lv > .18;
            c.strokeStyle = active ? '#60a5fa' : '#1e293b';
            c.lineWidth = .018;
            c.beginPath();
            c.moveTo(Math.cos(a) * .56, Math.sin(a) * .56);
            c.lineTo(Math.cos(a) * (.62 + lv * .20), Math.sin(a) * (.62 + lv * .20));
            c.stroke();
        }
        circle(c, .48, '#0f1e36', '#60a5fa', .009);
        ring(c, .38, '#1e3a5f', .006);
        ring(c, .38, '#93c5fd', .018, -Math.PI * .8, -Math.PI * .8 + Math.PI * 1.6 * (playing ? Math.min(1, .2 + bass * .8) : .15));
        label(c, 'BLUE NOTE', -.12, '#dbeafe', .076, 'ui-monospace, monospace');
        circle(c, .042, '#60a5fa', '#0b1424', .01);
        label(c, 'CONSOLE', .145, '#93c5fd', .06, 'ui-monospace, monospace');
    });
}
export const drawDockScene = createDock(drawCore);
