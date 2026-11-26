// Compare active-filter traversal with the previous full scan. Optional argument:
// path to an actual previous worklet source for release-to-release comparison.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const root = path.join(__dirname, '..');
const current = fs.readFileSync(path.join(root, 'scripts/dsp-worklet-processor.js'), 'utf8');
const oldLoop = 'for (let f = 0; f < NUM_EQ_FILTERS; f++) {\n                if (!this.eqActive[f]) continue;';
const newLoop = 'for (let active = 0; active < this.activeEqCount; active++) {\n                const f = this.activeEqIndices[active];';
assert.ok(current.includes(newLoop));
const reference = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : current.replace(newLoop, oldLoop);
const limiter = fs.readFileSync(path.join(root, 'scripts/modules/peak-limiter.js'), 'utf8').replace('export class', 'class');
function processor(source, rate) {
    const factory = new Function('sampleRate', 'AudioWorkletProcessor', 'registerProcessor', limiter + '\n' + source.replace(/^import .*?;\n/m, ''));
    let C;
    factory(rate, class { constructor() { this.port = { postMessage() {} }; } }, (_, cls) => { C = cls; });
    return new C();
}
const flat = {agpEnabled:false, limiterEnabled:false, subsonicEnabled:false, ultrasonicEnabled:false, ditherMode:'off', peqBypassed:true, linearGainTarget:1};
const gains = [2,-1,0,3,0,-2,0,0,1,-3];
const scenarios = [flat, {...flat, peqBypassed:false, peqGains:gains}, {...flat, peqBypassed:false, peqGains:gains, peqQs:[1,2,3,4,1,2,1,1,1,1], bassBoost:true, vocalBoost:true, trebleBoost:true, subsonicEnabled:true, ultrasonicEnabled:true, ultrasonicCutoff:4000, linearGainTarget:1.5, limiterEnabled:true, crossfeedEnabled:true, ditherMode:'shaped', quantizationBits:16}, {...flat, peqBypassed:false, peqGains:Array(10).fill(0), precision64:false, monoMix:true, stereoBalance:.2, ditherMode:'tpdf', quantizationBits:24}, flat];
let samples = 0;
for (const rate of [44100, 48000, 96000, 192000]) {
    const a = processor(reference, rate), b = processor(current, rate);
    let pos = 0;
    for (const settings of scenarios) {
        a.port.onmessage({data:settings}); b.port.onmessage({data:settings});
        for (let block=0; block<96; block++) {
            const n = [64,128,256][block%3];
            const L = Float32Array.from({length:n}, (_,i) => .78*Math.sin((i+pos)*.045)+.12*Math.sin((i+pos)*1.16));
            const R = Float32Array.from({length:n}, (_,i) => .68*Math.cos((i+pos)*.051));
            const x = [new Float32Array(n), new Float32Array(n)], y = [new Float32Array(n), new Float32Array(n)];
            a.process([[L,R]],[x]); b.process([[L,R]],[y]);
            assert.deepEqual(x,y, `rate ${rate}, block ${block}, sample ${pos}`);
            assert.ok(y.every(ch=>ch.every(Number.isFinite)));
            pos+=n; samples+=2*n;
        }
    }
}
console.log(`PASS exact Float32 output equality: ${samples} samples; 4 rates, changing EQ/DSP, 3 block sizes`);
if (process.env.CACHY_SKIP_BENCH) process.exit(0);
// Isolated Node/V8 throughput; not AudioWorklet scheduling or phone power.
const input = [[Float32Array.from({length:128}, (_,i)=>Math.sin(i*.07)*.5), Float32Array.from({length:128}, (_,i)=>Math.cos(i*.07)*.5)]];
const output = [[new Float32Array(128),new Float32Array(128)]];
function bench(p, count) { const start=performance.now(); for(let i=0;i<count;i++) p.process(input,output); return performance.now()-start; }
function median(values) { return values.sort((a,b)=>a-b)[Math.floor(values.length/2)]; }
for (const [name, opts] of [['flat',flat],['six active bands',{...flat,peqBypassed:false,peqGains:gains}]]) {
    const a=processor(reference,48000), b=processor(current,48000);
    a.port.onmessage({data:opts}); b.port.onmessage({data:opts});
    bench(a,5000);bench(b,5000);
    const before=[],after=[];
    for(let i=0;i<5;i++) { if(i%2){after.push(bench(b,4000));before.push(bench(a,4000));}else{before.push(bench(a,4000));after.push(bench(b,4000));} }
    console.log(`${name}: old ${median(before).toFixed(2)} ms, new ${median(after).toFixed(2)} ms per 512k stereo frames (median of 5)`);
}
