import assert from 'node:assert/strict';
import {PcmStream} from '../scripts/modules/pcm-stream.js';
import {nextPcmCandidate,sameCandidate,canScheduleSuccessor,sameTrack} from '../scripts/modules/pcm-transition.js';
const a={id:'a'},b={id:'b'},c={id:'c'}, state={allTracks:[a,b,c],displayedTracks:[a,b,c],currentTrackIndex:0,repeatMode:'off',playQueue:[]};
assert.equal(nextPcmCandidate(state).track,b);
state.playQueue=[c];assert.equal(nextPcmCandidate(state).track,c);
const queued=nextPcmCandidate(state);state.playQueue=[{id:'c'}];assert.equal(sameCandidate(queued,nextPcmCandidate(state)),false);
state.repeatMode='one';assert.equal(nextPcmCandidate(state).track,a);
state.repeatMode='off';state.playQueue=[];state.currentTrackIndex=2;assert.equal(nextPcmCandidate(state),null);
state.repeatMode='all';assert.equal(nextPcmCandidate(state).track,a);
state.isShuffle=true;assert.equal(nextPcmCandidate(state),null);
class WorkerMock{postMessage(m){queueMicrotask(()=>{if(!this.closed)this.onmessage({data:m.type==='init'?{id:m.id,frames:m.format.frames}:{id:m.id,channels:[new Float32Array(m.count)]}});});}terminate(){this.closed=true;}}
globalThis.Worker=WorkerMock;
const ctx={sampleRate:48000,currentTime:1,events:[],createBuffer(c,n,r){return {n,duration:n/r,copyToChannel(){}}},createBufferSource(){return {connect(){},disconnect(){},start(t){ctx.events.push({t,n:this.buffer.n,node:this});},stop(){this.stopped=true;}}}};
const destination={};const callbacks={onStart(){},onEnd(){},onError(e){throw e;}};
const first=new PcmStream(ctx,destination,new Blob(),{frames:28001,duration:28001/48000},callbacks);
const second=new PcmStream(ctx,destination,new Blob(),{frames:33601,duration:33601/48000},callbacks);
await first.start(0);clearInterval(first.timer);await second.prepare(0);assert.equal(second.started,false);
assert.ok(canScheduleSuccessor(first,second));const boundary=first.endTime;second.startPrepared(boundary,{notify:false});clearInterval(second.timer);
assert.equal(first.nextTime,boundary);assert.equal(ctx.events[3].t,boundary);assert.equal(second.anchor,boundary);
for(let i=1;i<ctx.events.length;i++) assert.ok(Math.abs(ctx.events[i-1].t+ctx.events[i-1].n/48000-ctx.events[i].t)<1e-10);
const nodes=[...second.nodes];second.stop();assert.ok(nodes.every(n=>n.stopped));first.stop();
const expired=new PcmStream(ctx,destination,new Blob(),{frames:24000,duration:.5},callbacks);await expired.prepare(0);
assert.throws(()=>expired.startPrepared(ctx.currentTime),/clock/);expired.stop();
console.log('PASS PCM successor: exact shared-clock boundary, queue/repeat/shuffle selection, cancellation, expired scheduling rejection');

const old={id:'reuse',fullPath:'/music/old.wav',src:'blob:old'},replacement={id:'reuse',fullPath:'/music/new.wav',src:'blob:new'};
assert(!sameTrack(old,replacement));
const conflict={allTracks:[a,replacement],displayedTracks:[a,replacement],currentTrackIndex:0,repeatMode:'off',playQueue:[old]};assert.equal(nextPcmCandidate(conflict),null);
const ambiguous={...conflict,allTracks:[a,{id:'reuse'},{id:'reuse'}],playQueue:[{id:'reuse'}]};assert.equal(nextPcmCandidate(ambiguous),null);
console.log('PASS conflicting and ambiguous prebuffer identity cannot select an unrelated recording');

const mutable={id:'file',src:'blob:fixture',fileSize:100,lastModified:123};const catalog={allTracks:[a,mutable],displayedTracks:[a,mutable],currentTrackIndex:0,repeatMode:'off',playQueue:[]};
const prepared=nextPcmCandidate(catalog);mutable.title='Edited';assert(sameCandidate(prepared,nextPcmCandidate(catalog)));mutable.fileSize=101;assert(!sameCandidate(prepared,nextPcmCandidate(catalog)));assert(!sameTrack({...mutable,fileSize:100},mutable));const later=nextPcmCandidate(catalog);mutable._fileBlob=new Blob(['new']);assert(!sameCandidate(later,nextPcmCandidate(catalog)));console.log('PASS prepared successor invalidates on changed file attributes/blob, not title-only updates');
