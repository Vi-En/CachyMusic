import assert from 'node:assert/strict';
import {PcmStream} from '../scripts/modules/pcm-stream.js';
class WorkerFixture {
    postMessage(msg){queueMicrotask(()=>{if(!this.closed)this.onmessage?.({data:msg.type==='init'?{id:msg.id,frames:48000}:{id:msg.id,channels:[new Float32Array(msg.count)]}});});}
    terminate(){this.closed=true;}
}
globalThis.Worker=WorkerFixture;
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(callbacks={}){const ctx={state:'running',sampleRate:48000,currentTime:2,createBuffer(){return {copyToChannel(){}};},createBufferSource(){return {connect(){},disconnect(){},start(){},stop(){}};}};let ends=0,errors=0;const s=new PcmStream(ctx,{},new Blob(),{duration:1,channels:1},{onEnd(){ends++;},onError(){errors++;},...callbacks});return {s,ctx,get ends(){return ends;},get errors(){return errors;}};}
const cases=[
 ['cancellation during progress cannot emit natural end',async()=>{const f=fixture();try{await f.s.start(0);await tick();f.ctx.currentTime=f.s.nextTime+.01;f.s.onProgress=()=>f.s.stop();await f.s.pump();assert.equal(f.ends,0);assert.equal(f.errors,0);assert.equal(f.s.nodes.size,0);}finally{f.s.stop();}}],
 ['seek during terminal progress cannot close new seek',async()=>{const f=fixture();try{await f.s.start(0);await tick();f.ctx.currentTime=f.s.nextTime+.01;let seek;f.s.onProgress=()=>{f.s.onProgress=null;seek=f.s.seek(.25);};await f.s.pump();assert.equal(await seek,true);assert.equal(f.ends,0);assert.equal(f.errors,0);assert.equal(f.s.closed,false);}finally{f.s.stop();}}],
 ['synchronous seek from start callback owns timer installation',async()=>{const f=fixture();try{await f.s.prepare(0);let seek;f.s.onStart=()=>{f.s.onStart=null;seek=f.s.seek(.25);};f.s.startPrepared(f.ctx.currentTime+.12);assert.equal(f.s.timer,null);assert.equal(await seek,true);assert.ok(f.s.timer);assert.equal(f.s.first,12000);}finally{f.s.stop();}}],
 ['queued node callback after removal cannot restart pump',async()=>{const f=fixture();try{await f.s.start(0);await tick();const node=[...f.s.nodes][0],stale=node.onended;f.s.clearScheduledNodes();f.s.nextTime=f.ctx.currentTime+1;let pumps=0;f.s.pump=()=>{pumps++;};stale();assert.equal(pumps,0);}finally{f.s.stop();}}],
 ['normal natural end once and clears nodes',async()=>{const f=fixture();try{await f.s.start(0);await tick();f.ctx.currentTime=f.s.nextTime+.01;await f.s.pump();await f.s.pump();assert.equal(f.ends,1);assert.equal(f.errors,0);assert.equal(f.s.nodes.size,0);}finally{f.s.stop();}}],
];
let failures=0;for(const [name,test] of cases){try{await test();console.log('PASS '+name);}catch(error){failures++;console.error('FAIL '+name+': '+error.message);}}if(failures)process.exitCode=1;
