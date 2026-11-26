// Synthetic membership lookup comparison, not a whole-application benchmark.
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {buildPlaylistIndex,buildPlaylistLookupIndex} from '../scripts/modules/playlist-model.js';
const library=Array.from({length:100000},(_,i)=>({id:`local_profile_${i}`,fullPath:`/fixture/${i}.flac`}));
const keys=Array.from({length:1000},(_,i)=>`local:local_profile_${i*97}`);
const fns=[()=>buildPlaylistIndex(library),()=>buildPlaylistLookupIndex(library,keys)];
for(const fn of fns)fn();
const data=[[],[]];
for(let trial=0;trial<12;trial++)for(const i of (trial%2?[1,0]:[0,1])){
 global.gc?.();const before=process.memoryUsage().heapUsed,t=performance.now(),map=fns[i](),elapsed=performance.now()-t;
 for(const key of keys)assert(map.get(key));global.gc?.();const after=process.memoryUsage().heapUsed;
 data[i].push({ms:elapsed,entries:map.size,retainedHeapDeltaBytes:after-before});
}
const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];
const results=data.map((rows,i)=>({kind:i?'membership-scoped':'full',entries:rows[0].entries,trials:rows.length,p50Ms:median(rows.map(r=>r.ms)),p50HeapDeltaBytes:median(rows.map(r=>r.retainedHeapDeltaBytes))}));
console.log(JSON.stringify(results,null,2));console.log('PASS all requested keys resolved in both lookup variants');
