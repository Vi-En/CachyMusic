import assert from 'node:assert/strict';
import {createLibraryQueryController} from '../scripts/modules/library-query-controller.js';
let now=0,seq=0,current=0;const calls=[],published=[],tasks=new Map(),workers=[];
const timers={setTimeout(fn,ms){tasks.set(++seq,{fn,at:now+ms});return seq},clearTimeout(id){tasks.delete(id)}};
function advance(ms){now+=ms;for(const [id,t] of tasks)if(t.at<=now){tasks.delete(id);t.fn()}}
const c=createLibraryQueryController({createWorker(){const w={postMessage(data){calls.push(data)},terminate(){w.terminated=true}};workers.push(w);return w},prepare:job=>job.tracks,query:r=>r.map((_,i)=>i),publish:(j,r)=>published.push([j.id,r]),isCurrent:j=>j.id===current,timers,timeoutMs:10});
function submit(id,useWorker=true){current=id;c.submit({id,tracks:[{},{}],options:{}},useWorker)}
submit(1);submit(2);submit(3);assert.deepEqual(calls.map(j=>j.id),[1]);
workers[0].onmessage({data:{id:1,indices:[0]}});assert.deepEqual(published,[]);assert.deepEqual(calls.map(j=>j.id),[1,3]);
workers[0].onmessage({data:{id:3,indices:[1]}});assert.deepEqual(published,[[3,[1]]]);assert.equal(tasks.size,0);
submit(4);submit(5);advance(10);assert.equal(workers[0].terminated,true);assert.deepEqual(published.at(-1),[5,[0,1]]);
workers[0].onmessage({data:{id:4,indices:[1]}});assert.equal(published.length,2);submit(6);assert.deepEqual(published.at(-1),[6,[0,1]]);
const make=()=>createLibraryQueryController({createWorker(){const w={postMessage(){},terminate(){w.terminated=true}};workers.push(w);return w},prepare:j=>j.tracks,query:()=>[0],publish:(j,r)=>published.push([j.id,r]),isCurrent:j=>j.id===current,timers,timeoutMs:10});
const d=make();current=7;d.submit({id:7,tracks:[{}],options:{}});workers.at(-1).onmessage({data:{id:7,indices:[99]}});assert.deepEqual(published.at(-1),[7,[0]]);assert.equal(workers.at(-1).terminated,true);
const e=make();current=8;e.submit({id:8,tracks:[{}],options:{}});current=9;e.submit({id:9,tracks:[{}],options:{}},false);advance(10);assert.deepEqual(published.at(-1),[9,[0]]);assert.equal(tasks.size,0);e.dispose();
console.log('Library query controller: latest-only results, deadline fallback, invalid response, superseded local request passed.');
