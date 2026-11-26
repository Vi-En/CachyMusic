import assert from 'node:assert/strict';
import {createAudioEditGuard} from '../scripts/modules/audio-change-policy.js';
import {createOutputHold} from '../scripts/modules/audio-output-hold.js';
import {createWorkletAcknowledgements} from '../scripts/modules/worklet-ack.js';
import {audioSettingsStatus,effectState} from '../scripts/modules/audio-settings-status.js';
import {bindPlatterSwipe} from '../scripts/modules/platter-gesture.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Inverted A1 reproduction: the replacement session must not hear an edit;
// the checkpoint rejects the stale mutation, and the stale owner never resumes.
let playing=true,epoch=0,held=false,resumed=0,commits=0,unblock,entered;
const started=new Promise(r=>entered=r),blocked=new Promise(r=>unblock=r);
const guard=createAudioEditGuard({isPlaying:()=>playing,pause:()=>{playing=false;epoch++;},resume:()=>{resumed++;playing=true;},identity:()=>epoch,acquire:async()=>{held=true;},release:()=>{held=false;},settle:0,delay:2});
const task=guard(async check=>{entered();await blocked;assert(held);check();commits++;});
await started;epoch++;playing=true;unblock();await assert.rejects(task,/Playback changed/);await wait(15);assert.equal(commits,0);assert.equal(resumed,0);assert.equal(held,false);
// The acknowledgement protocol rejects stale, malformed and out-of-order replies.
const ack=createWorkletAcknowledgements({timeout:25});let messages=[];
const node={port:{postMessage:m=>messages.push(m)}};
ack.register(node);ack.send(node,{bassBoost:true});ack.send(node,{bassBoost:false});
assert(ack.pending(node));const pending=ack.wait(node);ack.receive(node,{type:'status',revision:messages[0].revision});assert(ack.pending(node));ack.receive(node,{type:'status',revision:messages[1].revision});await pending;assert(!ack.pending(node));
ack.send(node,{});await assert.rejects(ack.wait(node),/timed out/);ack.send(node,{});const replaced=ack.wait(node);ack.close(node);await assert.rejects(replaced,/replaced/);
// Verify inherited hold, clock-based scheduling and recovery from suspension.
let current={state:'running',currentTime:0},events=[];
function gain(){return {value:1,cancelAndHoldAtTime:t=>events.push(['cancel',t]),setValueAtTime:(v,t)=>events.push(['set',v,t]),linearRampToValueAtTime:(v,t)=>events.push(['ramp',v,t])};}
let gate={gain:gain()};const hold=createOutputHold(()=>({ctx:current,node:gate}),{sleep:async()=>{current.currentTime+=.005;}});
await hold.acquire();assert(hold.held);assert(current.currentTime>=.018);assert.deepEqual(events[1],['ramp',0,.018]);gate={gain:gain()};hold.initialize(gate);assert.equal(gate.gain.value,0);hold.release();assert(!hold.held);assert.equal(events.at(-1)[1],1);
current.state='suspended';await hold.acquire();assert.equal(events.at(-1)[0],'set');hold.release();
const s={mathPrecision:'native',ditherMode:'off',isPhaseInvert:true,isMonoMix:true,isSurroundWidener:true,stereoBalance:.5};
assert.match(audioSettingsStatus(s,'fallback'),/Stereo widening.*Phase inversion.*Mono mix.*Stereo balance/);assert.equal(effectState(s,'phase','fallback'),'unsupported');assert.equal(effectState(s,'phase','worklet',{ackPending:true}),'pending');assert.equal(effectState(s,'phase','native'),'unsupported');
// Gesture identity, tap, scroll, multi-touch and cancellation.
const handlers={},el={addEventListener:(n,f)=>handlers[n]=f,removeEventListener:n=>delete handlers[n]};let next=0,prev=0,clock=0;
const dispose=bindPlatterSwipe(el,{next:()=>next++,previous:()=>prev++,clock:()=>clock});
const touch=(id,x,y)=>({identifier:id,clientX:x,clientY:y});
const start=(...t)=>handlers.touchstart({touches:t});const end=(...t)=>handlers.touchend({touches:[],changedTouches:t});
start(touch(1,100,0));end(touch(1,100,0));start(touch(1,100,0));end(touch(1,90,100));start(touch(1,100,0));start(touch(1,100,0),touch(2,0,0));end(touch(1,0,0));start(touch(1,100,0));handlers.touchcancel();end(touch(1,0,0));start(touch(1,100,0));end(touch(2,0,0));assert.equal(next+prev,0);
start(touch(1,100,0));end(touch(1,0,0));start(touch(2,0,0));end(touch(2,100,0));assert.equal(next,1);assert.equal(prev,1);dispose();assert.equal(Object.keys(handlers).length,0);
console.log('PASS stale checkpoint + held output, revision ack timeout/replacement, graph gain hold, truthful capabilities, touch ownership/cancellation');
