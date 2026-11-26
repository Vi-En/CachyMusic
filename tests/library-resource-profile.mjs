// Repeatable synthetic query-core stress test, not whole-app or battery profiling.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {queryLibrary} from '../scripts/modules/library-query.js';
const N=100000;
const records=Array.from({length:N},(_,i)=>({index:i,title:`Track ${String(i).padStart(6,'0')}`,album:`Album ${i%500}`,artist:`Artist ${i%200}`,duration:60+i%360,year:1990+i%37,genre:i%2?'jazz':'rock',search:`track ${i} artist ${i%200}`,format:i%2?'flac':'mp3',bitDepth:i%2?24:16,sampleRate:48000,inCurrentPlaylist:i%3===0}));
const options=[{query:'',sort:'default',formatFilter:'all',playlist:false},{query:'genre:jazz',sort:'title-desc',formatFilter:'lossless',playlist:false},{query:'artist 13',sort:'duration-desc',formatFilter:'all',playlist:false},{query:'',sort:'year-asc',formatFilter:'hires',playlist:true}];
const expected=options.map(o=>queryLibrary(records,o));
assert.equal(expected[0].length,N);assert.equal(expected[1].length,N/2);assert.equal(expected[1][0],99999);assert.equal(expected[3].length,16667);
global.gc?.();const heapStart=process.memoryUsage().heapUsed;const times=[];
for(let i=0;i<100;i++){const k=i%options.length,t=performance.now();const result=queryLibrary(records,options[k]);times.push(performance.now()-t);assert.deepEqual(result,expected[k]);}
global.gc?.();const heapEnd=process.memoryUsage().heapUsed;times.sort((a,b)=>a-b);
console.log(JSON.stringify({records:N,queries:times.length,p50Ms:times[50],p95Ms:times[95],maxMs:times.at(-1),heapStartBytes:heapStart,heapEndBytes:heapEnd,gcExposed:typeof global.gc==='function'}));
