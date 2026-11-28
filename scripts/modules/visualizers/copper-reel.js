import { circle, ring, radialBars, label, drawDial, createDock } from './record-dial.js';
// Copper Reel: warm dark bronze tape-reel platter with tri-spoke flange geometry and amber analog grooves.
export function drawCore(ctx, w, h, playing, now, dt, beat, snare, bass, mid, treble, fidelity, bands) {
    drawDial(ctx, w, h, c => {
        const copper = c.createLinearGradient(-.9, -.9, .9, .9);
        copper.addColorStop(0, '#c88255');
        copper.addColorStop(.5, '#4c2c1d');
        copper.addColorStop(1, '#261610');
        circle(c, .987, '#1d130f', '#b46e46', .01);
        circle(c, .90, '#2a1a13', copper, .014);
        for (let r = .82; r > .54; r -= .038) ring(c, r, '#4b2d1f', .004);
        radialBars(c, bands, playing, 54, .56, .25, '#e2a072', bass, .01);
        c.save();
        if (playing) c.rotate((now * 0.0007) % (Math.PI * 2));
        for (let i = 0; i < 3; i++) {
            const a = (Math.PI * 2 * i) / 3;
            c.strokeStyle = '#d18e62';
            c.lineWidth = .028;
            c.beginPath();
            c.moveTo(Math.cos(a) * .12, Math.sin(a) * .12);
            c.lineTo(Math.cos(a) * .45, Math.sin(a) * .45);
            c.stroke();
        }
        c.restore();
        circle(c, .32, '#2d1b13', '#c88255', .012);
        label(c, 'COPPER', -.105, '#f5dcc8', .072, 'system-ui, sans-serif');
        circle(c, .048, '#e2a072', '#1d130f', .01);
        label(c, 'REEL', .135, '#d6a584', .06, 'system-ui, sans-serif');
    });
}
export const drawDockScene = createDock(drawCore);
