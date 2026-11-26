import assert from 'node:assert/strict';
import {createGraphLifecycle, createWorkletLoader, clearGraphNodes} from '../scripts/modules/audio-graph-lifecycle.js';
import {makeSpectrumBands, spectrumLevel} from '../scripts/modules/eq-spectrum.js';
let current = null, created = 0, cleared = 0, errors = 0, finish;
const create = () => current = {id: ++created, state:'running', close() {return new Promise(resolve => {finish = () => {this.state='closed'; resolve();};});}};
const owner = createGraphLifecycle({current:()=>current, create, clear(ctx){assert.equal(ctx,current);cleared++;current=null;},onError(){errors++;}});
assert.equal(owner.init(),owner.init());assert.equal(created,1);
const first=owner.ensure(true), second=owner.ensure(true), third=owner.ensure();
assert.equal(first,second);assert.equal(first,third);assert.equal(owner.init(),null);await Promise.resolve();finish();
assert.equal(await first,await second);assert.equal(created,2);assert.equal(cleared,1);assert.equal(owner.replacing,false);
current.close=async()=>{throw Error('close failed');};assert.equal(await owner.ensure(true),current);assert.equal(created,2);assert.equal(cleared,1);assert.equal(errors,1);
current.state='closed';await owner.ensure();assert.equal(created,3);assert.equal(cleared,2);
let add=0, installed=0, failed=0, resolveLoad, rejectLoad;
const loader=createWorkletLoader({current:()=>current,isCurrent:ctx=>current===ctx&&ctx.state!=='closed',install(){installed++;},failed(){failed++;}});
current.audioWorklet={addModule(){add++;return new Promise(r=>resolveLoad=r);}};
const pending=loader();assert.equal(pending,loader());await Promise.resolve();assert.equal(add,1);current=create();resolveLoad();await pending;assert.equal(installed,0);
current.audioWorklet={addModule(){add++;return new Promise((r,j)=>{rejectLoad=j;});}};const rejected=loader();await Promise.resolve();rejectLoad(Error('failed'));await rejected;await loader();assert.equal(failed,1);assert.equal(add,2);
current=create();current.audioWorklet={addModule:async()=>{add++;}};await Promise.all([loader(),loader(),loader()]);assert.equal(installed,1);assert.equal(add,3);
let disconnected=0,stopped=0;const node=()=>({disconnect(){disconnected++;},stop(){stopped++;},onended:()=>{}});
const source=node(),secondary=node(),state={audioSourceNode:source,softwareSourceNode:node(),analyser:node(),peqNodes:[node()],xfeedNetwork:{nodes:[node(),node()]},audio:{_mediaSourceNode:source,_mediaSourceContext:current},secondaryAudio:{_mediaSourceNode:secondary,_mediaSourceContext:current}};
clearGraphNodes(state);assert.equal(state.audioSourceNode,null);assert.equal(state.analyser,null);assert.equal(state.softwareSourceNode,null);assert.equal(state.xfeedNetwork,null);assert.equal(state.peqNodes.length,0);assert.equal(state.audio._mediaSourceContext,null);assert.equal(state.secondaryAudio._mediaSourceNode,null);assert(state.secondaryAudio._wasGraphBound);assert.equal(stopped,1);assert(disconnected>=7);
for(const sr of [22050,44100,48000,96000,192000]){const bands=makeSpectrumBands(sr,1024);assert.equal(bands.length,96);assert(bands.every(b=>!b||(b[0]>=1&&b[0]<b[1]&&b[1]<=1024)));const data=new Float32Array(1024).fill(-Infinity);assert(bands.every(b=>spectrumLevel(data,b)===0));data.fill(-25);assert(bands.every(b=>spectrumLevel(data,b)===(b?1:0)));}
assert.equal(spectrumLevel(Float32Array.of(-57.5),[0,1]),.5);
console.log('PASS: single-flight graph replacement, close failure, closed-context recovery, stale/deduplicated worklets, node cleanup, bounded logarithmic spectrum and silence');

let partial=null, builds=0;
const partialOwner=createGraphLifecycle({current:()=>partial,ready:ctx=>ctx.complete,create(){return partial={state:'running',complete:++builds>1,async close(){this.state='closed';}};},clear(){partial=null;},onError(){}});
assert.equal(partialOwner.init(),null);assert.equal(partialOwner.init(),null);assert.equal(builds,1);
const repaired=await partialOwner.ensure();assert.equal(repaired.complete,true);assert.equal(builds,2);
console.log('PASS incomplete graph rejected, closed before reconstruction');
let unclosed={state:'running',async close(){}}, replacements=0;
const guarded=createGraphLifecycle({current:()=>unclosed,create(){replacements++;},clear(){throw Error('must not clear live context');},onError(){}});
assert.equal(await guarded.ensure(true),null);assert.equal(replacements,0);
let release,old={state:'running',close(){return new Promise(r=>{release=()=>{this.state='closed';r();};});}}, newest=old;
const stale=createGraphLifecycle({current:()=>newest,create(){replacements++;},clear(){throw Error('must not clear new owner');},onError(){}});
const transition=stale.ensure(true);await Promise.resolve();assert(stale.isClosing(old));newest={state:'running'};release();assert.equal(await transition,null);assert.equal(replacements,0);assert.equal(stale.isClosing(old),false);
console.log('PASS unconfirmed close and stale teardown cannot replace a different graph');

const {requireRunningGraph}=await import('../scripts/modules/audio-context-policy.js');
let clock={state:'suspended'},active=clock,connected=true;
const attempt=()=>requireRunningGraph({context:clock,current:()=>active,confirmed:()=>connected,resume:async()=>{},timeoutMs:10});
await assert.rejects(attempt(),/not running/);clock.state='running';assert.equal(await attempt(),clock);
connected=false;await assert.rejects(attempt(),/not connected/);connected=true;
clock.state='suspended';await assert.rejects(requireRunningGraph({context:clock,current:()=>active,confirmed:()=>true,resume:()=>new Promise(()=>{}),timeoutMs:5}),/did not resume/);
await assert.rejects(requireRunningGraph({context:clock,current:()=>active,confirmed:()=>true,resume:async()=>{clock.state='running';active={state:'running'};}}),/not running/);
console.log('PASS playback gate rejects disconnected, suspended, timed-out and superseded graph ownership');

const {canActivatePreparedWorklet}=await import('../scripts/modules/audio-context-policy.js');
assert.equal(canActivatePreparedWorklet({configured:false,held:true}),false);
assert.equal(canActivatePreparedWorklet({configured:true,previousRoute:'fallback',audible:true,held:false}),false);
assert.equal(canActivatePreparedWorklet({configured:true,previousRoute:'fallback',audible:true,held:true}),true);
assert.equal(canActivatePreparedWorklet({configured:true,previousRoute:'fallback',audible:false}),true);
assert.equal(canActivatePreparedWorklet({configured:true,previousRoute:'worklet',audible:true}),true);
console.log('PASS acknowledged worklet eligibility and no late audible hot-swap');

// A stalled close must not hang playback or create a second physical graph.
let lateClose,closeCalls=0,lateGraph={state:'running',close(){closeCalls++;return new Promise(r=>lateClose=()=>{this.state='closed';r();});}},newGraphCount=0;
const bounded=createGraphLifecycle({current:()=>lateGraph,create(){newGraphCount++;return lateGraph={state:'running'};},clear(){lateGraph=null;},closeTimeoutMs:8,onError(){}});
const waitingClose=bounded.ensure(true);assert.equal(await waitingClose,null);assert.equal(await bounded.ensure(true),null);assert.equal(closeCalls,1);assert.equal(bounded.init(),null);assert.equal(newGraphCount,0);lateClose();await new Promise(r=>setImmediate(r));assert.equal(newGraphCount,1);assert.equal(bounded.replacing,false);
let lateLoad,lateInstalls=0,loadFailures=0;const loadCtx={state:'running',audioWorklet:{addModule:()=>new Promise(r=>lateLoad=r)}};
const boundedLoader=createWorkletLoader({current:()=>loadCtx,isCurrent:c=>c===loadCtx,install(){lateInstalls++;},failed(){loadFailures++;},timeoutMs:8});
await boundedLoader();assert.equal(loadFailures,1);lateLoad();await new Promise(r=>setImmediate(r));assert.equal(lateInstalls,0);await boundedLoader();assert.equal(loadFailures,1);
console.log('PASS bounded graph close and module load; no concurrent context or late processor installation');
const {startMediaWithDeadline}=await import('../scripts/modules/audio-context-policy.js');
await assert.rejects(startMediaWithDeadline({play:()=>new Promise(()=>{})},{timeoutMs:8}),/did not start/);
await assert.rejects(startMediaWithDeadline({play:()=>Promise.reject(Error('codec unavailable'))}),/codec unavailable/);
assert.equal(await startMediaWithDeadline({play:()=>Promise.resolve('started')}),'started');
console.log('PASS bounded media start and rejection propagation');
