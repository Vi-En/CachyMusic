// A shallow, bounded bezel around the artwork. No extra canvas, assets or filters.
const TAU = 2 * Math.PI;
const RIMS = Object.freeze({
    crimson: {base:'#211117', edge:'#94404d', ink:'#f595a3', ticks:24, major:6, shape:'facets'},
    orbit: {base:'#101727', edge:'#41597b', ink:'#a1d9e9', ticks:48, major:12, shape:'arcs'},
    station: {base:'#211d18', edge:'#8b7857', ink:'#ead3a4', ticks:32, major:8, shape:'slots'},
    bloom: {base:'#25161f', edge:'#9c5e85', ink:'#d5e5c0', ticks:12, major:3, shape:'petals'},
    jade: {base:'#0b1d17', edge:'#306954', ink:'#8fe6ba', ticks:60, major:5, shape:'arcs'},
    amethyst: {base:'#21152e', edge:'#79569b', ink:'#ddbcff', ticks:18, major:3, shape:'facets'},
    alloy: {base:'#18212a', edge:'#647e91', ink:'#bddbe9', ticks:16, major:4, shape:'slots'}
});
export function drawInstrumentRim(ctx, width, height, name, beat = 0) {
    const p = RIMS[name];
    const r = Math.min(width, height) / 2;
    if (!p || r <= 0) return;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(r, r);
    ctx.shadowBlur = 0;
    // All marks remain within the .99-radius canvas mask.
    ctx.beginPath(); ctx.arc(0, 0, .952, 0, TAU);
    ctx.lineWidth = .068; ctx.strokeStyle = p.base; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, .986, 0, TAU);
    ctx.lineWidth = .008; ctx.strokeStyle = p.edge; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, .912, 0, TAU);
    ctx.lineWidth = .009; ctx.stroke();
    for (let i = 0; i < p.ticks; i++) {
        const angle = TAU * i / p.ticks;
        const major = i % p.major === 0;
        ctx.save(); ctx.rotate(angle);
        ctx.globalAlpha = major ? .8 + .2 * Math.min(1, beat) : .45;
        ctx.strokeStyle = p.ink; ctx.fillStyle = p.ink;
        ctx.lineWidth = major ? .012 : .005;
        if (p.shape === 'slots' && major) {
            ctx.fillRect(-.018, -.977, .036, .045);
        } else if (p.shape === 'petals') {
            ctx.beginPath(); ctx.ellipse(0, -.951, .023, .009, 0, 0, TAU); ctx.fill();
        } else {
            ctx.beginPath(); ctx.moveTo(0, -.976);
            ctx.lineTo(p.shape === 'facets' ? .013 : 0, major ? -.927 : -.951); ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();
}
