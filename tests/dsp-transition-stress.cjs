// Offline production-processor stress, not a realtime worklet-thread test.
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'../scripts');
const source=fs.readFileSync(path.join(root,'modules/peak-limiter.js'),'utf8').replace('export class','class')+'\n'+fs.readFileSync(path.join(root,'dsp-worklet-processor.js'),'utf8').replace(/^import .*?;\n/,'');
const results=[];
for(const rate of [44100,48000,96000,192000]){
 const context={sampleRate:rate,AudioWorkletProcessor:class{constructor(){this.port={postMessage:x=>{this.last=x;}}}},registerProcessor(_,cls){context.Processor=cls}};vm.createContext(context);vm.runInContext(source,context);
 for(const limiter of [true,false]){
  const proc=new context.Processor(),L=new Float32Array(128),R=new Float32Array(128),oL=new Float32Array(128),oR=new Float32Array(128);let max=0,count=0,revision=0;
  for(let b=0;b<300;b++){
   if(b%7===0){const mode=Math.floor(b/7)%4;const gains=Array.from({length:10},(_,i)=>mode===0?0:((i+b)%3===0?12:-5));
    proc.port.onmessage({data:{revision:++revision,precision64:mode!==2,agpEnabled:false,limiterEnabled:limiter,subsonicEnabled:mode===1,ultrasonicEnabled:false,ditherMode:'off',peqBypassed:mode===0,peqGains:gains,peqQs:Array(10).fill(1.41),linearGainTarget:mode===0?1:2.2,bassBoost:mode!==0,vocalBoost:mode===2,trebleBoost:mode===3,crossfeedEnabled:mode===1,ambiophonicsEnabled:mode===2,phaseInvert:mode===3,monoMix:mode===1,stereoWidth:1.35,stereoBalance:mode===3?.4:0}});
    assert.equal(proc.last.revision,revision);
   }
   for(let i=0;i<128;i++){const n=b*128+i;L[i]=n%257===0?.99:.98*Math.sin(2*Math.PI*1000*n/rate);R[i]=n%251===0?-.99:.96*Math.sin(2*Math.PI*1200*n/rate);}
   proc.process([[L,R]],[[oL,oR]]);for(const channel of [oL,oR])for(const sample of channel){assert(Number.isFinite(sample));max=Math.max(max,Math.abs(sample));count++;}
  }
  if(limiter)assert(max<=proc.agpCeiling+1e-6,`Limiter ceiling exceeded: ${rate}: ${max}`);
  results.push({rate,limiter,samples:count,revisions:revision,peak:+max.toFixed(6),ceiling:limiter?+proc.agpCeiling.toFixed(6):null});
 }
}
console.log(JSON.stringify(results,null,2));
console.log('PASS offline changing-parameter processor stress; limiter-off peaks are observations, not safety guarantees');
