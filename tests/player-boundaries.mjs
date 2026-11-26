import assert from 'node:assert/strict';
import {describeSignalPath, resolveTrackFormat} from '../scripts/modules/signal-path-model.js';
import {renderSignalPath} from '../scripts/modules/signal-path-ui.js';
import {createProgressScrubber} from '../scripts/modules/progress-scrubber.js';
import {createMprisClient} from '../scripts/modules/mpris-client.js';
const track = {filename:'test.flac', sampleRate:192000, bitDepth:24, duration:120};
const state = {peqGains:[0],isPeqBypassed:false,currentVolumeValue:1,ditherMode:'off',isPrecision64:true};
assert.equal(resolveTrackFormat(track),'FLAC');
assert.equal(resolveTrackFormat({filename:'unknown'}),'UNKNOWN');
let info = describeSignalPath(state,track,false,null,false);
assert.equal(info.label,'UNVERIFIED'); assert.equal(info.latency,'Unavailable'); assert.equal(info.trim,'Not measured'); assert(!info.output.includes('192'));
state.audioContext={sampleRate:48000,state:'running',baseLatency:.01};
info=describeSignalPath(state,track,false,'direct',false);assert.equal(info.label,'BYPASS');assert.match(info.output,/48.0 kHz graph/);assert.match(info.latency,/partial/);assert.equal(info.trim,'Not measured');
state.peqGains=[6]; state.audioContext.outputLatency=.02;
info=describeSignalPath(state,track,false,'worklet',true);assert.match(info.trim,/-4.2 dB configured trim/);assert.match(info.dsp,/PEQ/);assert.match(info.latency,/30.0 ms/);
const nodes = new Map();const doc={getElementById(id){if(!nodes.has(id)) nodes.set(id,{style:{},dataset:{},setAttribute(k,v){this[k]=v}});return nodes.get(id);}};
renderSignalPath(state,track,false,'worklet',true,doc);renderSignalPath(state,track,true,'worklet',true,doc);
assert.equal(nodes.get('auditStageDecode').textContent,'Unavailable');assert.equal(nodes.get('settingsDspHeadroomVal').textContent,'Not measured');assert.equal(nodes.get('auditMetricPrecision').textContent,'Unavailable');assert.equal(nodes.get('signalPathLabel').textContent,'Signal path');
console.log('PASS signal diagnostics: unknown graph, actual graph rate, configured trim, partial latency, native transition clears stale fields');
// Pointer and frame fixture; no browser globals required.
class Element extends EventTarget { constructor(){super();this.classList={add(){},remove(){}};} getBoundingClientRect(){return {left:0,width:100};} }
function fire(el,type,props={}){const e=new Event(type,{cancelable:true});Object.assign(e,props);el.dispatchEvent(e);}
let duration=120, position=24, trackIdentity=1, dragging=false, paint=[], seeks=[], hover=[], raf=new Map(), nextFrame=0;
const scrub=createProgressScrubber({duration:()=>duration,position:()=>position,identity:()=>trackIdentity,seek:v=>seeks.push(v),paint:(p,d)=>paint.push([p,d]),dragging:v=>dragging=v,hover:(p,d)=>hover.push([p,d]),requestFrame:fn=>{raf.set(++nextFrame,fn);return nextFrame;},cancelFrame:id=>raf.delete(id)});
const main=new Element(), mini=new Element();scrub.attach(main,true);scrub.attach(mini);
const ptr=(el,type,x,id=1)=>fire(el,type,{pointerId:id,pointerType:'touch',clientX:x});
ptr(main,'pointerdown',40);assert(dragging);ptr(mini,'pointerdown',80,2);ptr(mini,'pointerup',80,2);assert.equal(seeks.length,0);ptr(main,'pointermove',60);assert.equal(raf.size,1);ptr(main,'pointerup',65);assert.deepEqual(seeks,[78]);assert.equal(raf.size,0);assert(!dragging);
ptr(main,'pointerdown',90);ptr(main,'pointercancel',90);assert.deepEqual(paint.at(-1),[.2,120]);
ptr(main,'pointerdown',10);trackIdentity++;ptr(main,'pointerup',90);assert.equal(seeks.length,1);
fire(mini,'keydown',{key:'End'});assert.equal(seeks.at(-1),120);duration=0;ptr(main,'pointerdown',40);assert(!dragging);duration=120;
fire(main,'mousemove',{clientX:20});fire(main,'mouseleave');assert.equal(raf.size,0);assert.equal(hover.at(-1)[0],null);scrub.dispose();ptr(main,'pointerdown',50);assert(!dragging);
console.log('PASS shared scrubbers: ownership, cancellation, stale track, keyboard, no duration, hover frame cleanup and disposal');
// HTTP fixture: one outstanding report, one latest queued report; pagehide aborts both.
const host=new EventTarget();host.location={origin:'http://localhost'};const page={hidden:false};
const s={allTracks:[track],currentTrackIndex:0,audio:{paused:true,currentTime:1,duration:120,volume:.5}};
const requests=[];const fakeFetch=(url,opt)=>new Promise((resolve,reject)=>{const record={url,opt,resolve,reject};requests.push(record);opt.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});
const client=createMprisClient({state:s,actions:{},fetchRequest:fakeFetch,host,page});
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
client.start();client.start();assert.equal(requests.length,1);s.audio.currentTime=2;client.reportState(true);s.audio.currentTime=3;client.reportState(true);assert.equal(requests.length,1);requests[0].resolve({ok:true});await flush();assert.equal(requests.length,2);assert.equal(JSON.parse(requests[1].opt.body).position,3);
await new Promise(resolve=>setTimeout(resolve,550));assert.equal(requests.filter(r=>r.url.includes('get_command')).length,1);host.dispatchEvent(new Event('pagehide'));assert(requests[1].opt.signal.aborted);assert(requests[2].opt.signal.aborted);await flush();client.reportState(true);assert.equal(requests.length,3);host.dispatchEvent(new Event('pageshow'));assert.equal(requests.length,4);client.dispose();await flush();assert(requests[3].opt.signal.aborted);
console.log('PASS MPRIS: duplicate start, single-flight POST, newest state coalescing, pagehide abort, pageshow restart and dispose');
const {findTrackIndex,findSavedTrackIndex,rememberTrack}=await import('../scripts/modules/track-session.js');
const a={id:'A',filename:'track.flac',fullPath:'/a/track.flac'},b={id:'B',filename:'track.flac',fullPath:'/b/track.flac'};
assert.equal(findTrackIndex([a,b],{...b}),1);assert.equal(findTrackIndex([a,b],{filename:'track.flac'}),-1);assert.equal(findTrackIndex([a,b],{id:'C',filename:'track.flac'}),-1);
const db=new Map();const storage={setItem:(k,v)=>db.set(k,v),getItem:k=>db.get(k)??null,removeItem:k=>db.delete(k)};
rememberTrack(storage,{...a,tid:'legacy',title:'Old'});storage.setItem('cachymusic_last_track_time','60');rememberTrack(storage,b);assert.equal(storage.getItem('cachymusic_last_track_tid'),null);assert.equal(storage.getItem('cachymusic_last_track_title'),null);assert.equal(storage.getItem('cachymusic_last_track_time'),null);assert.equal(findSavedTrackIndex([a,b],storage),1);assert.equal(findSavedTrackIndex([a],storage),-1);
console.log('PASS session identity: duplicate filenames, missing strong keys, stale ID and offset removal');

const {mergeTracks,dismissalKey}=await import('../scripts/modules/track-session.js');
const c={id:'A',filename:a.filename,fullPath:'/c/track.flac'};
assert.equal(findTrackIndex([a,b],c),-1);
assert.deepEqual(mergeTracks([a,b],[c,{...b}]),[a,b,c]);
const x={id:'local_one',fullPath:'track.flac',filename:'track.flac'},y={id:'local_two',fullPath:'track.flac',filename:'track.flac'};
assert.equal(findTrackIndex([x],y),-1);assert.deepEqual(mergeTracks([x],[y,{...x}]),[x,y]);assert.notEqual(dismissalKey(x),dismissalKey(y));
rememberTrack(storage,y);assert.equal(findSavedTrackIndex([x],storage),-1);
assert.equal(findTrackIndex([{filename:'same',fullPath:'/1'},{filename:'same',fullPath:'/2'}],{filename:'same',fullPath:'/2'}),1);
assert.deepEqual(mergeTracks([a,b],[]),[a,b]);
console.log('PASS audit identity counterexamples: conflicting paths, missing IDs, local relative paths, non-destructive merge');
