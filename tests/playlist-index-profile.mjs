// Isolated host benchmark; real UI timing is in playlist-repair-browser.py.
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {buildPlaylistIndex, trackKey} from '../scripts/modules/playlist-model.js';
const priorIndex=library=>{const map=new Map(),put=(k,t)=>{if(!map.has(k))map.set(k,t);else if(map.get(k)!==t)map.set(k,null);};for(const track of library){const key=trackKey(track);if(key)put(key,track);for(const k of new Set([track.id,track.tid,track.fullPath].filter(v=>v!=null&&String(v)!=='').map(String))){if(!/^(local|tid|id|path):/.test(k))put(k,track);}}return map;};
const tracks=Array.from({length:100000},(_,i)=>({id:'local_'+i,title:'Track '+i,fullPath:'/fixture/'+i+'.flac'}));
const results={prior:[],revised:[]};
for(let trial=0;trial<12;trial++)for(const label of trial%2===0?['prior','revised']:['revised','prior']){global.gc?.();const build=label==='prior'?priorIndex:buildPlaylistIndex,t=performance.now();const index=build(tracks),ms=performance.now()-t;assert.equal(index.size,300000);assert.equal(index.get('local:local_0'),tracks[0]);if(trial>=2)results[label].push(ms);}
for(const [label,values] of Object.entries(results)){values.sort((a,b)=>a-b);console.log(JSON.stringify({label,trials:values.length,p50Ms:(values[4]+values[5])/2,minMs:values[0],maxMs:values.at(-1)}));}
