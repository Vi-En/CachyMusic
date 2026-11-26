import assert from 'node:assert/strict';
import {PcmStream} from '../scripts/modules/pcm-stream.js';
let fixtureFrames=48000;
class FakeWorker {
  postMessage(msg){queueMicrotask(()=>{if(!this.closed)this.onmessage({data:msg.type==='init'?{id:msg.id,frames:fixtureFrames}:{id:msg.id,channels:[new Float32Array(msg.count),new Float32Array(msg.count)]}});});}
  terminate(){this.closed=true;}
}
globalThis.Worker=FakeWorker;
const context={sampleRate:48000,currentTime:2,scheduled:[],createBuffer(ch,n,rate){return {duration:n/rate,copyToChannel(){}};},createBufferSource(){return {connect(){},disconnect(){},start(t){context.scheduled.push({t,duration:this.buffer.duration,node:this});},stop(){this.stopped=true;}};}};
let started=0,ended=0,error=null;
const stream=new PcmStream(context,{},new Blob(),{duration:1},{onStart(){started++;},onEnd(){ended++;},onError(e){error=e;}});
await stream.start(.1);clearInterval(stream.timer);await new Promise(r=>setImmediate(r));
assert.equal(started,1);assert.equal(error,null);assert.equal(context.scheduled[0].t,2.12);
for(let i=1;i<context.scheduled.length;i++)assert.ok(Math.abs(context.scheduled[i-1].t+context.scheduled[i-1].duration-context.scheduled[i].t)<1e-10);
context.currentTime=2.52;assert.ok(Math.abs(stream.position()-.5)<1e-10);await stream.pump();
context.currentTime=3.03;await stream.pump();assert.equal(ended,1);assert.equal(error,null);assert.ok(stream.closed);
fixtureFrames=480000;
const underrun=new PcmStream(context,{},new Blob(),{duration:1},{onStart(){},onEnd(){},onError(e){error=e;}});await underrun.start(0);clearInterval(underrun.timer);await new Promise(r=>setImmediate(r));context.currentTime=underrun.nextTime+.001;
assert.ok(underrun.cursor<underrun.frames);await underrun.pump();assert.match(error.message,/underrun/);assert.ok(underrun.closed);
underrun.stop();assert.equal(underrun.requests.size,0);
const cancelled=new PcmStream(context,{},new Blob(),{duration:1},{onStart(){throw Error('Cancelled stream started');},onEnd(){},onError(){}});const pending=cancelled.start(0);cancelled.stop();await assert.rejects(pending);assert.ok(cancelled.closed);
context.scheduled=[];
const quick=new PcmStream(context,{},new Blob(),{duration:1},{onStart(){},onEnd(){},onError(e){throw e;}});
await quick.start(0,true);
assert.equal(quick.fastStart,true);
assert.equal(context.scheduled[0].t,context.currentTime+0.035);
quick.stop();
console.log('PASS PCM scheduler prebuffer, contiguous start times, seek clock, terminal cleanup, explicit underrun and cancellation');

const missed=new PcmStream(context,{},new Blob(),{duration:1},{onStart(){throw Error('past-due start');},onEnd(){},onError(){}});
await missed.prepare(0);const originalBuffer=context.createBuffer;
context.createBuffer=(...args)=>{context.currentTime+=.2;return originalBuffer(...args);};
assert.throws(()=>missed.startPrepared(context.currentTime+.1),/deadline/);
assert.equal(missed.nodes.size,0);missed.stop();context.createBuffer=originalBuffer;
console.log('PASS missed buffer-copy scheduling deadline rejected without retained sources');

const suspended=new PcmStream(context,{},new Blob(),{duration:1},{onStart(){throw Error('suspended start');},onEnd(){},onError(){}});
await suspended.prepare(0);context.state='suspended';assert.throws(()=>suspended.startPrepared(context.currentTime+.1),/not running/);assert.equal(suspended.nodes.size,0);suspended.stop();context.state='running';
console.log('PASS suspended PCM clock rejected at prepared start');

// Transferred data is checked independently of the worker's own validation.
const callback={onStart(){},onEnd(){},onError(){}};
const invalidFrames=new PcmStream(context,{},new Blob(),{duration:1},callback);fixtureFrames=NaN;await assert.rejects(invalidFrames.prepare(0),/frame count/);invalidFrames.stop();fixtureFrames=48000;
const layout=new PcmStream(context,{},new Blob(),{duration:1,channels:1},callback);await assert.rejects(layout.prepare(0),/layout changed/);layout.stop();
class MalformedWorker extends FakeWorker {postMessage(m){queueMicrotask(()=>{if(!this.closed){const channel=new Float32Array(m.count||0);if(channel.length)channel[0]=Infinity;this.onmessage({data:m.type==='init'?{id:m.id,frames:48000}:{id:m.id,channels:[channel]}});}});}}
const malformed=new PcmStream(context,{},new Blob(),{duration:1,channels:1},{...callback,worker:new MalformedWorker()});await assert.rejects(malformed.prepare(0),/Nonfinite/);malformed.stop();
const startFailure=new PcmStream(context,{},new Blob(),{duration:1},callback);await startFailure.prepare(0);const originalSource=context.createBufferSource;let disconnected=0;context.createBufferSource=()=>({connect(){},disconnect(){disconnected++;},start(){throw Error('start denied');},stop(){}});assert.throws(()=>startFailure.startPrepared(context.currentTime+.1),/start denied/);assert.equal(startFailure.nodes.size,0);assert.equal(disconnected,1);startFailure.stop();context.createBufferSource=originalSource;
const double=new PcmStream(context,{},new Blob(),{duration:1},callback);const preparing=double.prepare(0);await assert.rejects(double.prepare(0),/prepared twice/);await preparing;double.stop();
console.log('PASS invalid frame count, changed channel geometry, nonfinite transfer, failed node start cleanup and single preparation');

const callbackFail=new PcmStream(context,{},new Blob(),{duration:1},{onStart(){throw Error('UI callback failed')},onEnd(){},onError(e){error=e}});await callbackFail.prepare(0);assert.throws(()=>callbackFail.startPrepared(context.currentTime+.1),/UI callback failed/);assert.equal(callbackFail.nodes.size,0);callbackFail.fail(Error('UI callback failed'));assert(callbackFail.closed);assert.match(error.message,/UI callback failed/);const stopInCallback=new PcmStream(context,{},new Blob(),{duration:1},{onStart(){stopInCallback.stop()},onEnd(){},onError(){}});await stopInCallback.start(0);assert(stopInCallback.closed);assert.equal(stopInCallback.nodes.size,0);assert.equal(stopInCallback.timer,undefined);console.log('PASS PCM start callback failure and synchronous cancellation release sources and do not install timer');
