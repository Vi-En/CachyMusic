import assert from 'node:assert/strict';
import {createIndexer} from '../scripts/modules/indexing-client.js';
const file={name:'fixture.wav'};
let fallbackCalls=0;
const fallback=async()=>{fallbackCalls++;return {title:'fallback'};};
function fake(){return {posted:[],terminations:0,postMessage(m){this.posted.push(m)},terminate(){this.terminations++},reply(meta){this.onmessage?.({data:{id:this.posted.at(-1).id,meta}})}};}
{
 const w=fake(),a=createIndexer({makeWorker:()=>w,fallback});const p=a.parse(file);await assert.rejects(a.parse(file),/already processing/);w.reply({title:'ok'});assert.deepEqual(await p,{title:'ok'});a.dispose();await assert.rejects(a.parse(file),{name:'AbortError'});assert.equal(w.terminations,1);
}
{
 const w=fake(),owner=new AbortController(),a=createIndexer({signal:owner.signal,makeWorker:()=>w,fallback});const p=a.parse(file);owner.abort();await assert.rejects(p,{name:'AbortError'});assert.equal(w.terminations,1);assert.equal(w.onmessage,null);await assert.rejects(a.parse(file),{name:'AbortError'});
}
{
 const w=fake(),a=createIndexer({makeWorker:()=>w,fallback,timeoutMs:10});await assert.rejects(a.parse(file),/timed out/);assert(a.closed);assert.equal(w.terminations,1);await assert.rejects(a.parse(file),{name:'AbortError'});
}
for(const event of ['onerror','onmessageerror']){
 const w=fake(),a=createIndexer({makeWorker:()=>w,fallback});const p=a.parse(file);w[event]();await assert.rejects(p,/worker.*failed/);assert(a.closed);
}
{
 const w=fake();w.postMessage=()=>{throw Error('post failed')};const a=createIndexer({makeWorker:()=>w,fallback});await assert.rejects(a.parse(file),/post failed/);assert(a.closed);
}
{
 const w=fake(),a=createIndexer({makeWorker:()=>w,fallback});const p=a.parse(file);w.onmessage({data:{id:1,error:'bad tags'}});await assert.rejects(p,/bad tags/);assert(!a.closed);const q=a.parse(file);w.reply({title:'next'});assert.equal((await q).title,'next');a.dispose();
}
assert.equal(fallbackCalls,0,'No worker failure may start fallback');
{
 const a=createIndexer({makeWorker:()=>{throw Error('unsupported')},fallback});assert.equal((await a.parse(file)).title,'fallback');a.dispose();assert.equal(fallbackCalls,1);
}
{
 const owner=new AbortController(),a=createIndexer({signal:owner.signal,makeWorker:()=>{throw Error('unsupported')},fallback});const p=a.parse(file);owner.abort();await assert.rejects(p,{name:'AbortError'});assert.equal(fallbackCalls,1);
}
{
 let finish,start;const started=new Promise(r=>start=r);const a=createIndexer({makeWorker:()=>null,fallback:()=>new Promise(r=>{finish=r;start()})});const p=a.parse(file);await started;a.dispose();finish({title:'obsolete'});await assert.rejects(p,{name:'AbortError'});
}
console.log('PASS 10 indexing lifecycle scenarios: serial admission, abort, timeout, worker failures, fallback ownership');
