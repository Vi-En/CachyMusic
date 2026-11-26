// Compare against a separately extracted, unchanged prior playlist-model.js renamed to .mjs.
import {performance} from 'node:perf_hooks';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';import * as next from '../scripts/modules/playlist-model.js';
if(!process.argv[2])throw Error('Usage: node --expose-gc tests/playlist-canonical-compare.mjs BASELINE_PLAYLIST_MODEL_MJS');
if(!global.gc)throw Error('Run with --expose-gc');
const prior=await import(pathToFileURL(resolve(process.argv[2])).href);
const lib=Array.from({length:100000},(_,i)=>({id:`local_${i}`,fullPath:`/fixture/${i}.flac`}));const keys=Array.from({length:1000},(_,i)=>`local:local_${i*97}`);const variants=[prior,next];const values=[[],[]];for(const m of variants)for(let i=0;i<4;i++)m.buildPlaylistLookupIndex(lib,keys);
for(let t=0;t<16;t++)for(const i of t%2?[1,0]:[0,1]){global.gc();const start=performance.now();const map=variants[i].buildPlaylistLookupIndex(lib,keys);const ms=performance.now()-start;assert.equal(map.size,1000);for(const key of keys)assert(map.get(key));values[i].push(ms);}
console.log(JSON.stringify(values.map((v,i)=>({version:i?'6.40':'6.39',p50:v.slice().sort((a,b)=>a-b)[8],min:Math.min(...v),max:Math.max(...v),trials:v})),null,2));
