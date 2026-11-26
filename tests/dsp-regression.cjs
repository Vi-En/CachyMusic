
const fs=require('fs'),vm=require('vm');
const ctx={sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}}}},registerProcessor(name,cls){ctx.Processor=cls}};
vm.createContext(ctx);
const limiter=fs.readFileSync(require('path').join(__dirname,'../scripts/modules/peak-limiter.js'),'utf8').replace('export class','class');
vm.runInContext(limiter+'\n'+fs.readFileSync(process.argv[2] || require('path').join(__dirname,'../scripts/dsp-worklet-processor.js'),'utf8').replace(/^import .*?;\n/,''),ctx);
function run(options,signal,n=48000) {
 const p=new ctx.Processor();p.port.onmessage({data:options});
 let max=0, err=0, peakIndex=-1, nons=0;
 for(let off=0;off<n;off+=128) {
  const L=new Float32Array(128),R=new Float32Array(128),oL=new Float32Array(128),oR=new Float32Array(128);
  for(let i=0;i<128;i++) L[i]=R[i]=signal(off+i);
  p.process([[L,R]],[[oL,oR]]);
  for(let i=0;i<128 && off+i<n;i++) { const mag=Math.abs(oL[i]);if(mag>max){max=mag;peakIndex=off+i};if(!Number.isFinite(oL[i]))nons++;err=Math.max(err,Math.abs(oL[i]-L[i]));}
 }
 return {peak:max,peakIndex,maxAbsDifference:err,nonFinite:nons,ceiling:p.agpCeiling,lookahead:p.lookaheadSamples};
}
const flat={agpEnabled:false,limiterEnabled:false,subsonicEnabled:false,ultrasonicEnabled:false,ditherMode:'off',peqBypassed:true,linearGainTarget:1};
const results = {flat:run(flat,i=>.9*Math.sin(2*Math.PI*1000*i/48000)),limiterImpulse:run({...flat,limiterEnabled:true},i=>i===4800?1.5:0),limiterSine:run({...flat,limiterEnabled:true},i=>1.5*Math.sin(2*Math.PI*1000*i/48000)),ditherSilence:run({...flat,ditherMode:'shaped',quantizationBits:16},()=>0)};
const assert = require('node:assert/strict');
assert.equal(results.flat.maxAbsDifference,0,'flat bypass must null');
for (const id of ['limiterImpulse','limiterSine']) {
  assert.ok(results[id].peak <= results[id].ceiling, id+' sample ceiling exceeded');
  assert.ok(results[id].peak > 0.9, id+' unexpected attenuation');
}
for (const r of Object.values(results)) assert.equal(r.nonFinite,0);
console.log(JSON.stringify(results,null,2));
