import assert from 'node:assert/strict';
import {createMixerWriteQueue} from '../scripts/modules/mixer-write-queue.js';
let active=0,max=0,events=[],release,started,enabled=true;
const wait=new Promise(r=>release=r),ready=new Promise(r=>started=r);
const queue=createMixerWriteQueue({enabled:()=>enabled,write:async value=>{active++;max=Math.max(max,active);events.push(value);if(value===.1){started();await wait;}active--;}});
queue.submit(.1);await ready;queue.submit(.2);queue.submit(.3);queue.submit(.4);release();await queue.drain();assert.deepEqual(events,[.1,.4]);assert.equal(max,1);
let done;const blocked=new Promise(r=>done=r);const queue2=createMixerWriteQueue({enabled:()=>enabled,write:async value=>{events.push(value);await blocked;}});
queue2.submit(.5);await Promise.resolve();queue2.submit(.6);enabled=false;const invalidation=queue2.invalidate();done();await invalidation;assert.deepEqual(events,[.1,.4,.5]);assert(!queue2.busy);
console.log('PASS one in-flight mixer write, coalesced latest value and mode transition invalidation');
