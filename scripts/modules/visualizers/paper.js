import { circle, ring, bandLevel, drawDial, createDock } from './record-dial.js';
// Ink printed on a light disc. The horizontal cut is a spectrum, not a waveform claim.
export function drawCore(ctx, w, h, playing, now, dt, beat, snare, bass, mid, treble, fidelity, bands) {
    drawDial(ctx, w, h, c => {
        circle(c, .987, '#f4f2ed', '#2c2d2d', .009);
        ring(c, .91, '#b4b1aa', .005); ring(c, .87, '#d3d0c8', .004);
        c.fillStyle = '#1d2427';
        for (let i = 0; i < 32; i++) {
            const x = -.75 + 1.5 * i / 31;
            const height = .018 + bandLevel(bands, i, 32, playing, mid) * .44;
            c.fillRect(x-.008, -height, .016, height*2);
        }
        c.strokeStyle = '#777a78'; c.lineWidth = .005;
        c.beginPath(); c.moveTo(-.68,.55);c.lineTo(.68,.55);c.stroke();
        c.fillStyle = '#303435';c.font = '.16px Georgia, serif';c.textAlign='center';c.textBaseline='middle';c.fillText('Paper',0,-.59);
        circle(c,.034,'#2c2d2d');
    });
}
export const drawDockScene = createDock(drawCore);
