import { circle, ring, radialBars, label, drawDial, createDock } from './record-dial.js';
// A physical hi-fi dial, with a brushed silver rim and an actual spectrum ring.
export function drawCore(ctx, w, h, playing, now, dt, beat, snare, bass, mid, treble, fidelity, bands) {
    drawDial(ctx, w, h, c => {
        const metal = c.createLinearGradient(-.85, -.85, .85, .85);
        metal.addColorStop(0, '#bfc5c9'); metal.addColorStop(.35, '#4b535b');
        metal.addColorStop(.65, '#919ca4'); metal.addColorStop(1, '#363d44');
        circle(c, .987, metal, '#9ca7af', .007);
        circle(c, .88, '#11171d', '#0a0d10', .015);
        for (let r = .82; r > .48; r -= .036) ring(c, r, '#30383e', .004);
        radialBars(c, bands, playing, 72, .53, .29, '#b7d4df', bass, .009);
        circle(c, .43, '#d0d4d5', '#6f777d', .012);
        circle(c, .345, '#242c32', '#f0f2f1', .007);
        ring(c, .275, '#75838d', .005);
        ring(c, .275, '#dfeef0', .016, -Math.PI/2, -Math.PI/2 + Math.PI*2 * (playing ? .15 + .8*bass : .10));
        label(c, 'CACHY', -.12, '#e1e6e8', .085);
        circle(c, .046, '#b7c0c4', '#0a1015', .009);
        label(c, 'STUDIO', .15, '#acb7be', .063);
    });
}
export const drawDockScene = createDock(drawCore);
