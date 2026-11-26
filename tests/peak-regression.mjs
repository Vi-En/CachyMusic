import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {PeakLimiter} from '../scripts/modules/peak-limiter.js';
const rate=48000,limiter=new PeakLimiter(rate),frames=rate*2;
let max=0;const data=Buffer.alloc(frames*8),original=Buffer.alloc(frames*8);
for(let i=0;i<frames;i++){
    const x=i<1000||i>=frames-1000?0:1.22*Math.sin(2*Math.PI*12000*i/rate+Math.PI/4);
    limiter.process(x,x*.5);
    max=Math.max(max,Math.abs(limiter.left));assert.ok(Number.isFinite(limiter.left));assert.ok(Math.abs(limiter.right-limiter.left*.5)<1e-12);
    data.writeFloatLE(limiter.left,i*8);data.writeFloatLE(limiter.right,i*8+4);original.writeFloatLE(x,i*8);original.writeFloatLE(x*.5,i*8+4);
}
assert.ok(max<.9332543);assert.ok(max>.5);
writeFileSync(process.argv[2],original);writeFileSync(process.argv[3],data);
limiter.reset();limiter.process(0,0);assert.equal(limiter.left,0);assert.equal(limiter.gain,1);
console.log('PASS stereo-linked intersample estimation, state reset and sample ceiling');
