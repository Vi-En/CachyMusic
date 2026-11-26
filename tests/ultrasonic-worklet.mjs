// Worklet-level regression: a user-requested cutoff must not masquerade as
// active when it lies above the audio graph's usable Nyquist region.
import assert from 'node:assert/strict';
let DspProcessor;
globalThis.AudioWorkletProcessor = class {
    constructor() { this.port = {onmessage:null, postMessage() {}}; }
};
globalThis.registerProcessor = (name, ctor) => {
    assert.equal(name,'cachymusic-dsp-processor');
    DspProcessor = ctor;
};

globalThis.sampleRate = 48000;
await import('../scripts/dsp-worklet-processor.js');
assert(DspProcessor);
const bypass = new DspProcessor();
bypass.port.onmessage({data:{ultrasonicEnabled:true, ultrasonicCutoff:32000}});
assert.equal(bypass.ultrasonicCutoff,23520);
assert.equal(bypass.uCoeffs[0],1);
const samples=new Float32Array(128);
for(let i=0;i<samples.length;i++) samples[i]=Math.sin(2*Math.PI*i*18000/48000)*0.5;
const outL=new Float32Array(128),outR=new Float32Array(128);
bypass.process([[samples,samples]], [[outL,outR]]);
for(let i=0;i<samples.length;i++){
    assert(Math.abs(outL[i]-samples[i]) < 1e-6);
    assert(Math.abs(outR[i]-samples[i]) < 1e-6);
}

// A compatible graph uses the actual low-pass filter coefficients.
globalThis.sampleRate = 96000;
const active = new DspProcessor();
active.port.onmessage({data:{ultrasonicEnabled:true, ultrasonicCutoff:32000}});
assert.equal(active.ultrasonicCutoff,32000);
assert.notEqual(active.uCoeffs[0],1);
let originalEnergy=0, filteredEnergy=0;
for(let block=0;block<24;block++) {
    const buf=new Float32Array(128),yL=new Float32Array(128),yR=new Float32Array(128);
    for(let i=0;i<128;i++) buf[i]=Math.sin(2*Math.PI*(block*128+i)*40000/96000)*0.3;
    active.process([[buf,buf]], [[yL,yR]]);
    if (block>=5) for(let i=0;i<128;i++) {
        originalEnergy+=buf[i]*buf[i];filteredEnergy+=yL[i]*yL[i];
    }
}
assert(filteredEnergy < originalEnergy*0.3,`32k filter insufficiently attenuated 40k tone: ${filteredEnergy/originalEnergy}`);
console.log('PASS: DSP worklet ultrasonic bypass below cutoff and attenuation at compatible graph rate');
