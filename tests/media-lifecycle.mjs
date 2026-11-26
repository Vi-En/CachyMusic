// Execute the production listener with isolated dependencies and a deterministic event/timer harness.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../scripts/modules/media-element-events.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function','function');
function harness(){
    const track={id:'a',title:'A',duration:120,src:'blob:a'};
    const audio=new EventTarget();Object.assign(audio,{src:track.src,currentTime:1,duration:120,paused:false,ended:true,readyState:4,_trackGeneration:1,loads:0,getAttribute(){return this.src;},load(){this.loads++;},pause(){this.paused=true;}});
    const state={audio,allTracks:[track],currentTrackIndex:0,trackPlaybackRetryCount:0,playQueue:[],repeatMode:'off',isSoftwareDecoding:false,userExplicitlyPaused:false,standaloneTrackList:[]};
    let generation=1,intent=1,native=false,plays=0,next=0,visits=0,clears=0,errors=0,fallbacks=0,resets=0;const timers=[],ui=[],writes=[];
    const noop=()=>{};const context={store:{state,emit(){resets++;}},safeStorage:{setItem(...x){writes.push(x);},removeItem(...x){writes.push(x);}},formatTime:String,showCachyToast(){errors++;},showToast:noop,findTrackIndex:()=>0,playbackPool:()=>[track],playlistNeighbor:()=>-1,currentTimeEl:null,progressBar:null,totalDurationEl:null,miniTotalDuration:null,appendDebugTelemetry:noop,cancelSleepTimer:noop,logAudioPlaybackEvent:noop,mediaSessionController:{updatePositionState:noop},updatePlaybackProgress:noop,finishListeningVisit(){visits++;},observeListening:noop,interruptListening:noop,setTimeout(fn){timers.push(fn);},window:{location:{href:'http://localhost/'}},console:{error:noop}};
    vm.runInNewContext(source+'\nthis.create=createMediaElementListener;',context);
    const deps={nativeActive:()=>native,trackGeneration:()=>generation,playbackIntent:()=>intent,clearPendingPlay(){intent++;},syncPlayPauseUI(v){ui.push(v);},clearSeekStallTimer(){clears++;},clearNoDataStallTimer:noop,rememberSoftwareDecoder:noop,playWithSoftwareDecoder(){fallbacks++;},pauseAudio:noop,nextTrack(){next++;},playAudio(){plays++;return Promise.resolve();},checkAndPreloadNextTrack:noop,mprisSyncHook:noop};
    context.create(deps)(audio);
    return {state,audio,timers,ui,writes,fire(type){audio.dispatchEvent(new Event(type));},setGeneration(v){generation=v;},advanceIntent(){intent++;},setNative(v){native=v;},get plays(){return plays;},get next(){return next;},get visits(){return visits;},get clears(){return clears;},get errors(){return errors;},get fallbacks(){return fallbacks;},get resets(){return resets;}};
}
const cases=[
 ['premature end retries through controller',()=>{const h=harness();h.fire('ended');assert.equal(h.timers.length,1);h.timers.shift()();assert.equal(h.plays,1);assert.equal(h.audio.loads,1);}],
 ['software ownership suppresses stale media events',()=>{const h=harness();h.state.isSoftwareDecoding=true;h.audio.currentTime=40;for(const e of ['play','playing','pause','emptied','waiting','seeking','stalled','ended','loadedmetadata','seeked'])h.fire(e);assert.deepEqual(h.ui,[]);assert.deepEqual(h.writes,[]);assert.equal(h.next,0);assert.equal(h.visits,0);assert.equal(h.clears,0);}],
 ['generation mismatch suppresses events',()=>{const h=harness();h.setGeneration(2);h.audio.currentTime=40;for(const e of ['play','playing','pause','emptied','seeked','ended'])h.fire(e);assert.deepEqual(h.ui,[]);assert.deepEqual(h.writes,[]);assert.equal(h.next,0);assert.equal(h.clears,0);}],
 ['premature recovery cancelled by newer intent',()=>{const h=harness();h.fire('ended');h.advanceIntent();h.timers.shift()();assert.equal(h.plays,0);assert.equal(h.audio.loads,0);}],
 ['network retry cancelled after source replacement',()=>{const h=harness();h.audio.error={code:2};h.fire('error');assert.equal(h.timers.length,1);h.audio.src='blob:b';h.timers.shift()();assert.equal(h.audio.src,'blob:b');assert.equal(h.plays,0);}],
 ['network retry cancelled when native/software owns playback',()=>{for(const kind of ['native','software','edit']){const h=harness();h.audio.error={code:2};h.fire('error');if(kind==='native')h.setNative(true);else if(kind==='software')h.state.isSoftwareDecoding=true;else h.state.audioEditPaused=true;h.timers.shift()();assert.equal(h.plays,0,kind);}}],
 ['explicit pause prevents error-driven automatic skip',()=>{const h=harness();h.state.userExplicitlyPaused=true;h.state.trackPlaybackRetryCount=1;h.audio.error={code:2};h.fire('error');assert.equal(h.resets,0);assert.equal(h.timers.length,0);assert.equal(h.next,0);}],
 ['audio edit pause prevents error-driven decoder fallback',()=>{const h=harness();h.state.audioEditPaused=true;h.audio.error={code:3};h.fire('error');assert.equal(h.fallbacks,0);assert.equal(h.timers.length,0);}],
 ['valid natural completion remains functional',()=>{const h=harness();h.audio.currentTime=120;h.fire('ended');assert.equal(h.next,1);assert.equal(h.visits,1);}],
 ['stale queued end after seek does not advance',()=>{const h=harness();h.audio.currentTime=50;h.audio.ended=false;h.fire('ended');assert.equal(h.next,0);assert.equal(h.visits,0);}],
 ['stale pause or play events use live element state',()=>{const h=harness();h.fire('pause');assert.deepEqual(h.ui,[]);h.audio.paused=true;h.fire('playing');assert.deepEqual(h.ui,[]);}],
];
let failures=0;for(const [name,test] of cases){try{test();console.log('PASS '+name);}catch(error){failures++;console.error('FAIL '+name+': '+error.message);}}
if(failures)process.exitCode=1;
