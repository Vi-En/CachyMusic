import assert from 'node:assert/strict';
import {createWorkletAcknowledgements} from '../scripts/modules/worklet-ack.js';
import {createAudioEditGuard} from '../scripts/modules/audio-change-policy.js';
import {createOutputHold} from '../scripts/modules/audio-output-hold.js';
import {createPreferenceStorage} from '../scripts/modules/preference-storage.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const acks=createWorkletAcknowledgements({timeout:10});let last;
const node={port:{postMessage:p=>last=p}};
assert(acks.pending(node));assert.throws(()=>acks.send(node,{}),/not registered/);await assert.rejects(acks.wait(node),/not registered/);
acks.register(node);assert.throws(()=>acks.register(node),/already registered/);await assert.rejects(acks.wait(node),/not sent/);
acks.send(node,{});const ack=acks.wait(node);acks.receive(node,{type:'status',revision:last.revision+1});assert(acks.pending(node));acks.receive(node,{type:'status',revision:last.revision});await ack;
node.port.postMessage=()=>{throw Error('send denied')};assert.throws(()=>acks.send(node,{}),/send denied/);assert(!acks.pending(node));acks.close(node);await assert.rejects(acks.wait(node),/replaced/);
// Stalled context must force silence, reject the edit and stop playback before release.
let ctx={state:'running',currentTime:0},target=1,stopped=false,released=false,edited=false;
const gate={context:ctx,gain:{value:1,cancelAndHoldAtTime(){},setValueAtTime(v){target=v},linearRampToValueAtTime(){}}};
const hold=createOutputHold(()=>({ctx,node:gate}),{timeoutMs:5,sleep:()=>wait(2)});
const guard=createAudioEditGuard({isPlaying:()=>true,pause(){},resume(){throw Error('unexpected resume')},identity:()=>0,acquire:()=>hold.acquire(),release:()=>{assert(stopped);hold.release();released=true},onUnsafe:()=>{stopped=true},delay:1});
await assert.rejects(guard(()=>{edited=true}),/did not reach silence/);assert.equal(target,0);assert(!edited);assert(stopped);await wait(20);assert(released);
const missing=createOutputHold(()=>({ctx,node:null}));await assert.rejects(missing.acquire(),/unavailable/);
// Stale intent is not a hardware error; don't pause the user's new track.
let epoch=0,unblock,entered,unsafe=0;const started=new Promise(r=>entered=r),block=new Promise(r=>unblock=r);
const staleGuard=createAudioEditGuard({isPlaying:()=>true,identity:()=>epoch,pause(){throw Error('must not pause new track')},resume(){},acquire:async()=>{entered();await block},onUnsafe:()=>unsafe++,delay:1});
const stale=staleGuard(()=>{throw Error('must not edit')});await started;epoch++;unblock();await assert.rejects(stale,/Playback changed/);await wait(10);assert.equal(unsafe,0);
// Read-your-writes even if readable local storage rejects writes and removals.
function tier(initial={}){const data=new Map(Object.entries(initial));return {deny:false,getItem:k=>data.get(k)??null,setItem(k,v){if(this.deny)throw Error('quota');data.set(k,v)},removeItem(k){if(this.deny)throw Error('denied');data.delete(k)}};}
const local=tier({amp:'false'}),session=tier();const prefs=createPreferenceStorage({local:()=>local,session:()=>session});local.deny=true;
assert.equal(prefs.setItem('amp','true'),'session');assert.equal(prefs.getItem('amp'),'true');assert.equal(prefs.removeItem('amp'),'session');assert.equal(prefs.getItem('amp'),null);
local.deny=false;assert.equal(prefs.setItem('amp','new'),'local');assert.equal(prefs.getItem('amp'),'new');session.deny=true;prefs.removeItem('amp');assert.equal(prefs.getItem('amp'),null);
const mem=createPreferenceStorage({local:()=>{throw Error('denied')},session:()=>undefined});assert.equal(mem.setItem('__proto__','safe'),'memory');assert.equal(mem.getItem('__proto__'),'safe');mem.removeItem('__proto__');assert.equal(mem.getItem('__proto__'),null);
console.log('PASS unregistered/unsent/replaced DSP acknowledgements, failed output gate, stale acquisition, and quota/denied preference writes');

// A newer parameter write invalidates an older acknowledgement as a start gate.
const latest=createWorkletAcknowledgements({timeout:100});const revisions=[];const processor={port:{postMessage:m=>revisions.push(m.revision)}};latest.register(processor);latest.send(processor,{});let settled=false;const ready=latest.wait(processor).then(()=>{settled=true;});latest.send(processor,{bassBoost:true});latest.receive(processor,{type:'status',revision:revisions[0]});await Promise.resolve();await Promise.resolve();assert.equal(settled,false,'old ack released newer parameters');latest.receive(processor,{type:'status',revision:revisions[1]});await ready;assert(!latest.pending(processor));
console.log('PASS latest-parameter acknowledgement despite intervening send');
