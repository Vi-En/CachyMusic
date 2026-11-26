import assert from 'node:assert/strict';
import {createLibraryGate,sameServerTransport} from '../scripts/modules/library-transition.js';
const gate=createLibraryGate();const idle={audio:{paused:true}};
for(const state of [{isPlaying:true},{isPlayPending:true},{audio:{paused:false}},{isSoftwareDecoding:true,isSoftwarePaused:false}])assert.equal(gate.beginRoot(state),null);
const first=gate.beginTransport(),second=gate.beginTransport();assert(gate.busy);assert.equal(gate.beginRoot(idle),null);first();first();assert(gate.busy);second();assert(!gate.busy);
const lease=gate.beginRoot(idle);assert(lease);assert(gate.rootPending);assert.equal(gate.beginTransport(),null);assert.equal(gate.beginRoot(idle),null);lease.confirm();assert(!gate.rootPending);const newer=gate.beginRoot(idle);lease.confirm();assert(gate.rootPending);newer.confirm();
const a={fullPath:'/music/a.wav',tid:1,src:'php/api/stream.php?tid=1'};
assert(sameServerTransport(a,{...a}));assert(!sameServerTransport(a,{...a,tid:2}));assert(!sameServerTransport(a,{...a,src:'php/api/stream.php?tid=2'}));assert(!sameServerTransport(a,{...a,fullPath:'/music/b.wav'}));assert(!sameServerTransport(a,{tid:1}));
console.log('PASS root transition ownership, active/pending playback exclusion, overlapping loads, idempotent release, stale owner and strict stream identity');
