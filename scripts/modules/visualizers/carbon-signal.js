import { circle, ring, radialBars, label, drawDial, createDock } from './record-dial.js';
// Carbon Signal: matte structural carbon platter with 1px teal framing and telemetry tick ring.
export function drawCore(ctx, w, h, playing, now, dt, beat, snare, bass, mid, treble, fidelity, bands) {
    drawDial(ctx, w, h, c => {
        circle(c, .987, '#11161c', '#2dd4bf', .008);
        ring(c, .92, '#1f2933', .006);
        ring(c, .845, '#134e4a', .005);
        for (let r = .79; r > .52; r -= .045) ring(c, r, '#18212a', .004);
        radialBars(c, bands, playing, 60, .55, .28, '#2dd4bf', bass, .01);
        circle(c, .44, '#0c1117', '#2b3945', .009);
        ring(c, .36, '#0f766e', .006);
        ring(c, .36, '#5eead4', .016, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (playing ? .18 + .78 * (bass * .7 + mid * .3) : .12));
        label(c, 'CARBON', -.115, '#e2e8f0', .078, 'ui-monospace, monospace');
        circle(c, .042, '#2dd4bf', '#090d12', .01);
        label(c, 'SIGNAL', .135, '#94a3b8', .062, 'ui-monospace, monospace');
    });
}
export const drawDockScene = createDock(drawCore);
