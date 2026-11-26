// Exercise the actual player-core handoff functions with a deterministic shared audio clock.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PcmStream} from '../scripts/modules/pcm-stream.js';
import {nextPcmCandidate,sameCandidate,canScheduleSuccessor} from '../scripts/modules/pcm-transition.js';
const core=fs.readFileSync(new URL('../scripts/modules/player-core.js',import.meta.url),'utf8');
const region=core.slice(core.indexOf('function releaseDirectFormat('),core.indexOf('function startPcmPlayback('));
const selected=region.slice(0,region.indexOf('async function preparePcmInput('))+region.slice(region.indexOf('function makePcmStream('));
const subscriptions=core.slice(core.indexOf("store.subscribe('playback:order-change'"),core.indexOf("store.subscribe('ui:sync-signal-path'"));
class WorkerFixture{
    postMessage(msg){queueMicrotask(()=>{if(!this.closed)this.onmessage?.({data:msg.type==='init'?{id:msg.id,frames:msg.format.frames}:{id:msg.id,channels:[new Float32Array(msg.count)]}});});}
    terminate(){this.closed=true;}
}
globalThis.Worker=WorkerFixture;
const tick=()=>new Promise(r=>setImmediate(r));
function harness(prepare){
    const clock={state:'running',sampleRate:48000,currentTime:1,createBuffer(){return {copyToChannel(){}};},createBufferSource(){return {connect(){},disconnect(){},start(){},stop(){this.stopped=true;}};}};
    const a={id:'a'},b={id:'b',src:'b.wav'},c={id:'c',src:'c.wav'};
    const state={allTracks:[a,b,c],displayedTracks:[a,b,c],currentTrackIndex:0,currentTrack:a,repeatMode:'off',playQueue:[b],mathPrecision:'native',audioContext:clock,softwareSourceGainNode:{},isSoftwarePaused:false};
    const format={frames:4800,duration:.1,channels:1};
    const noop=()=>{};const handlers=new Map(),events=[],released=[];let completions=0,requests=0;
    const store={state,subscribe(name,fn){handlers.set(name,fn);},emit(name,detail){events.push({name,index:state.currentTrackIndex});handlers.get(name)?.({detail});}};
    const context={PcmStream,nextPcmCandidate,sameCandidate,canScheduleSuccessor,store,continuousPcmEnabled:()=>true,audioBufferChangePending:()=>false,hasActiveDsp:()=>false,canStreamPcmTrack:()=>true,preparePcmInput:async t=>{requests++;return prepare?prepare(t):{file:new Blob(),format:{...format}};},closeAndroidDirectPcm:id=>released.push(id),syncPlayPauseUI:noop,startSoftwareProgressLoop:noop,cancelSoftwareProgressLoop:noop,showCachyToast:noop,onSoftwarePlaybackEnded(){completions++;},historyNeighbor:()=>null,seekPlaylistHistory:noop,recordPlaylistVisit:noop,rememberTrack:noop,safeStorage:{},presentTrackOnDeck:noop,totalDurationEl:null,miniTotalDuration:null,updatePlaybackProgress:noop,mediaSessionController:{updatePositionState:noop},syncPlaylistShuffle:noop,updateShuffleButton:noop,refreshNativeOrder:noop};
    vm.runInNewContext('let pcmStream=null,pendingPcm=null,pcmFile=null,pcmStartEpoch=0,trackLoadToken=0,currentTrackGeneration=0,currentPlayRequestId=0,nativeQueueEdits=0;\n'+selected+'\n'+subscriptions+'\nthis.api={makePcmStream,checkPcmSuccessor,stopPcmStream, get pending(){return pendingPcm;},get current(){return pcmStream;},set current(v){pcmStream=v;}};',context);
    const api=context.api;
    return {api,clock,state,a,b,c,store,events,released,get completions(){return completions;},get requests(){return requests;},async start(){const s=api.makePcmStream(new Blob(),{...format});api.current=s;await s.start(0);await tick();return s;},stop(){api.stopPcmStream();}};
}
const cases=[
 ['successor terminal callback first adopts and completes exactly once',async()=>{const h=harness();try{const old=await h.start(),next=h.api.pending.stream;assert(next.started);h.clock.currentTime=next.endTime+.01;await next.pump();assert.equal(h.state.currentTrackIndex,1);assert.equal(h.state.playQueue.length,0);assert.equal(h.completions,1);await old.pump();assert.equal(h.completions,1);}finally{h.stop();}}],
 ['worker failure after audible boundary pauses successor at actual position',async()=>{const h=harness();try{const old=await h.start(),next=h.api.pending.stream;h.clock.currentTime=next.anchor+.04;next.fail(Error('decoder interrupted'));assert.equal(h.state.currentTrackIndex,1);assert.equal(h.state.playQueue.length,0);assert.equal(h.state.isSoftwarePaused,true);assert.equal(h.state.userExplicitlyPaused,true);assert.ok(Math.abs(h.state.softwarePlaybackOffset-.04)<1e-8);assert(old.closed);assert.equal(h.api.current,null);assert.equal(h.completions,0);}finally{h.stop();}}],
 ['worker failure before boundary leaves current playback unchanged',async()=>{const h=harness();try{const old=await h.start(),next=h.api.pending.stream;next.fail(Error('decoder interrupted'));assert.equal(h.state.currentTrackIndex,0);assert.equal(h.state.playQueue.length,1);assert.equal(h.state.isSoftwarePaused,false);assert.equal(h.api.current,old);assert.equal(h.api.pending,null);}finally{h.stop();}}],
 ['queue edit cancels already scheduled obsolete nodes immediately',async()=>{const h=harness();try{await h.start();const next=h.api.pending.stream,nodes=[...next.nodes];h.state.playQueue=[h.c];h.store.emit('library:update-queue');assert.equal(h.api.pending,null);assert(next.closed);assert(nodes.every(n=>n.stopped));}finally{h.stop();}}],
 ['repeat order change invalidates queued successor immediately',async()=>{const h=harness();try{await h.start();const next=h.api.pending.stream;h.state.repeatMode='one';h.store.emit('playback:order-change');assert.equal(h.api.pending,null);assert(next.closed);}finally{h.stop();}}],
 ['unavailable preparation clears pending job',async()=>{const h=harness(async()=>null);try{await h.start();assert.equal(h.api.pending,null);assert.equal(h.requests,1);}finally{h.stop();}}],
 ['stale async result releases direct session before worker creation',async()=>{let resolve;const h=harness(()=>new Promise(r=>{resolve=r;}));try{await h.start();h.b.src='replacement.wav';resolve({file:null,format:{codec:'android-direct',sessionId:'obsolete',frames:4800,duration:.1,channels:1}});await tick();assert.deepEqual(h.released,['obsolete']);assert.equal(h.api.pending,null);}finally{h.stop();}}],
 ['valid boundary commits current identity before queue notification',async()=>{const h=harness();try{const old=await h.start();h.clock.currentTime=old.endTime+.001;await old.pump();assert.equal(h.state.currentTrackIndex,1);assert.equal(h.events.find(e=>e.name==='library:update-queue').index,1);assert.equal(h.completions,0);}finally{h.stop();}}],
 ['empty successor or unscheduled final frames cannot qualify',async()=>{const ctx={currentTime:0,state:'running'},destination={};const current={started:true,ctx,destination,cursor:10,frames:10,first:0,scheduledFrames:9,endTime:1};const successor={ready:[[]],ctx,destination};assert.equal(Boolean(canScheduleSuccessor(current,successor)),false);current.scheduledFrames=10;successor.ready=[];assert.equal(Boolean(canScheduleSuccessor(current,successor)),false);successor.ready=[[1]];assert.equal(Boolean(canScheduleSuccessor(current,successor)),true);}],
];
let failures=0;for(const [name,test] of cases){try{await test();console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name+': '+e.stack);}}if(failures)process.exitCode=1;
