import assert from 'node:assert/strict';
import {buildPlaylistIndex, resolvePlaylistMembers, playlistSummary, moveMember, sameMembership, shuffleMembers, trackKey, canonicalizeMembership} from '../scripts/modules/playlist-model.js';
const a={id:'local_a',filename:'same.flac',duration:120},b={id:'local_b',filename:'same.flac',duration:180},c={tid:3,id:'server3',duration:0};
assert.deepEqual(resolvePlaylistMembers(['local_b','local_a','3','missing'],[a,b,c]),[b,a,c]);
assert.deepEqual(resolvePlaylistMembers(['local_a'],[a,{...a}]),[]);
assert.deepEqual(resolvePlaylistMembers(['local_a','local_a'],[a]),[a]);
assert.equal(playlistSummary({tracks:['local_b','local_a']},[a,b]).text,'2 tracks · 5 min');
assert.equal(playlistSummary({tracks:['local_b','missing']},[a,b]).text,'2 tracks · 1 unavailable');
assert.equal(playlistSummary({tracks:['3']},[c]).text,'1 track');
assert.deepEqual(moveMember(['a','b','c'],2,0),['c','a','b']);assert(sameMembership([1,2],['2','1']));assert(!sameMembership([1,1],[1,1]));assert(!sameMembership([1,2],[2,3]));assert.equal(trackKey({filename:'same.flac'}),'');assert.deepEqual(shuffleMembers([a,b,c],()=>0),[b,c,a]);
console.log('PASS saved order, missing/ambiguous members, exact duration, reorder, permutation and unbiased shuffle algorithm boundaries');

const collision={id:'3'};assert.equal(trackKey(c),'tid:3');assert.equal(trackKey(collision),'id:3');assert.deepEqual(resolvePlaylistMembers(['3'],[c,collision]),[]);assert.deepEqual(resolvePlaylistMembers(['3'],[c,collision],true),[c]);assert.deepEqual(resolvePlaylistMembers(['id:3','tid:3'],[c,collision]),[collision,c]);assert.deepEqual(canonicalizeMembership(['local_a','3','missing'],[a,c,collision]),['local:local_a','3','missing']);
console.log('PASS namespaced identity, ambiguous legacy refusal, lossless migration and server-only tid matching');
const {replacementMember,rebasePlaylistDraft,createPlaylistPickerIndex,classifyPlaylistSelection}=await import('../scripts/modules/playlist-model.js');
const ta={id:'local_a',title:'A'},tb={id:'local_b',title:'B'},tc={tid:21,title:'C'},lib=[ta,tb,tc],ix=buildPlaylistIndex(lib);
assert.deepEqual(replacementMember(['missing','local:local_a'],0,tb,ix),['local:local_b','local:local_a']);
assert.equal(replacementMember(['missing','local:local_a'],0,ta,ix),null);
assert.equal(replacementMember(['local:local_a'],0,tb,ix),null);
assert.equal(replacementMember(['42'],0,ta,ix,true),null);assert.deepEqual(replacementMember(['42'],0,tc,ix,true),['21']);
const base={name:'Old',tracks:['a','b']};assert.deepEqual(rebasePlaylistDraft(base,{name:'Mine',tracks:['a','b']},{name:'Old',tracks:['b','a','c']}),{name:'Mine',tracks:['b','a','c'],conflicts:[]});
assert.deepEqual(rebasePlaylistDraft(base,{name:'Old',tracks:['b','a']},{name:'Remote',tracks:['a','b']}),{name:'Remote',tracks:['b','a'],conflicts:[]});
assert.deepEqual(rebasePlaylistDraft(base,{name:'Mine',tracks:['b','a']},{name:'Remote',tracks:['a','b','c']}).conflicts,['name','track order or membership']);
assert.deepEqual(rebasePlaylistDraft(base,{name:'Mine',tracks:['b','a']},{name:'Mine',tracks:['b','a']}).conflicts,[]);
let textCalls=0;const catalog=createPlaylistPickerIndex(lib,t=>{textCalls++;return t.title.toLowerCase()});assert.equal(textCalls,0);assert.deepEqual(catalog.search('a'),[ta]);assert.equal(textCalls,3);assert.strictEqual(catalog.search('a'),catalog.search(' A '));catalog.search('b');assert.equal(textCalls,3);
const outcomes=classifyPlaylistSelection(new Map([['local:local_a',ta],['local:local_b',tb],['tid:21',tc],['missing',{}]]),{plid:'1',tracks:['21']},lib);assert.equal(outcomes.valid.length,0);assert.deepEqual(outcomes.already,['tid:21']);assert.deepEqual(outcomes.unsupported,['local:local_a','local:local_b']);assert.deepEqual(outcomes.unavailable,['missing']);
console.log('PASS explicit missing-member replacement, conservative three-way recovery, cached picker search and classified batch outcomes');

// Compare with the prior algorithm on deterministic adversarial catalogs.
const legacyReference=library=>{const map=new Map(),put=(k,t)=>{if(!map.has(k))map.set(k,t);else if(map.get(k)!==t)map.set(k,null);};for(const track of library){const key=trackKey(track);if(key)put(key,track);for(const k of new Set([track.id,track.tid,track.fullPath].filter(v=>v!=null&&String(v)!=='').map(String))){if(!/^(local|tid|id|path):/.test(k))put(k,track);}}return map;};
const aliases=[undefined,null,'',0,1,2,'local_1','id:2','path:x','tid:1','local:local_1','/path','1','2'];
for(let seed=0;seed<100;seed++){const input=Array.from({length:60},(_,i)=>({id:aliases[(i*7+seed)%aliases.length],tid:aliases[(i*3+seed*5)%aliases.length],fullPath:aliases[(i*11+seed*3)%aliases.length]}));input.push(input[0],input[1]);assert.deepEqual(buildPlaylistIndex(input),legacyReference(input));}
console.log('PASS optimized identity index matches prior map semantics across 100 adversarial catalogs');

const {createPlaylistPickerIndexAsync}=await import('../scripts/modules/playlist-model.js');
let chunks=0;const asyncCatalog=await createPlaylistPickerIndexAsync(lib,t=>t.title.toLowerCase(),{chunkSize:1,yieldToHost:async()=>{chunks++;}});assert.equal(chunks,3);assert.deepEqual(asyncCatalog.index,buildPlaylistIndex(lib));assert.deepEqual(asyncCatalog.search('a'),[ta]);
let active=true;const cancelled=await createPlaylistPickerIndexAsync(lib,t=>t.title,{chunkSize:1,isCurrent:()=>active,yieldToHost:async()=>{active=false;}});assert.equal(cancelled,null);
console.log('PASS cooperative catalog index equivalence and cancellation before publishing');

const {searchPlaylistTracksAsync}=await import('../scripts/modules/playlist-model.js');
const searchFixture=Array.from({length:257},(_,i)=>({id:'local_search_'+i,title:`Track ${i}`,artist:`Artist ${i%7}`}));
let normalizations=0;const searchText=t=>`${t.title} ${t.artist}`.toLowerCase();
const indexed=createPlaylistPickerIndex(searchFixture,t=>{normalizations++;return searchText(t);});
let current=true,turns=0;
const aborted=await indexed.searchAsync('track',{chunkSize:8,isCurrent:()=>current,yieldToHost:async()=>{if(++turns===3)current=false;}});
assert.equal(aborted,null);assert.equal(normalizations,16);
const expected=createPlaylistPickerIndex(searchFixture,searchText);
for(const q of ['artist 4',' TRACK 2 ','artist 0 track 23','nonexistent','']){
 const r=await indexed.searchAsync(q,{chunkSize:17,yieldToHost:async()=>{}});assert.deepEqual(r,expected.search(q));
}
assert.equal(normalizations,searchFixture.length,'cancelled text cache did not reuse work');
let clock=0,maxSlice=0,inSlice=0;
const budgeted=await searchPlaylistTracksAsync(searchFixture,'track',t=>{inSlice++;clock+=.25;return searchText(t);},{chunkSize:2048,budgetMs:5,now:()=>clock,yieldToHost:async()=>{maxSlice=Math.max(maxSlice,inSlice);inSlice=0;}});
assert.deepEqual(budgeted,searchFixture);assert(maxSlice<=32&&inSlice<=32,'time budget ignored');
assert.equal(await indexed.searchAsync('',{isCurrent:()=>false}),null,'cancelled cached result');
console.log('PASS cooperative search parity, partial-cache reuse, time slicing, cached-result cancellation and latest-owner guard');

const {buildPlaylistLookupIndex,buildPlaylistLookupIndexAsync}=await import('../scripts/modules/playlist-model.js');
// Selective lookup must preserve collisions and missing keys exactly, not pick a winner.
for(let seed=0;seed<100;seed++){
 const items=Array.from({length:60},(_,i)=>({id:aliases[(i*7+seed)%aliases.length],tid:aliases[(i*3+seed*5)%aliases.length],fullPath:aliases[(i*11+seed*3)%aliases.length]}));items.push(items[0]);
 const full=buildPlaylistIndex(items),keys=[...full.keys()].filter((_,i)=>(i+seed)%3===0).concat('nonexistent');
 const wanted=new Map([...full].filter(([k])=>keys.includes(k)));
 assert.deepEqual(buildPlaylistLookupIndex(items,keys),wanted);
 assert.deepEqual(await buildPlaylistLookupIndexAsync(items,keys,{chunkSize:7,yieldToHost:async()=>{}}),wanted);
}
let lookupOwner=true;
assert.equal(await buildPlaylistLookupIndexAsync(lib,['local:local_a'],{chunkSize:1,isCurrent:()=>lookupOwner,yieldToHost:async()=>{lookupOwner=false;}}),null);
const large=Array.from({length:100000},(_,i)=>({id:`local_${i}`,fullPath:`/library/${i}.flac`}));
const scoped=buildPlaylistLookupIndex(large,['local:local_0','local:local_99999']);assert.equal(scoped.size,2);assert.strictEqual(scoped.get('local:local_99999'),large.at(-1));
assert.deepEqual(classifyPlaylistSelection(new Map([['local:local_a',ta]]),{plid:'local_pl_1',tracks:[]},buildPlaylistIndex(lib)).valid,[['local:local_a',ta]]);
assert.deepEqual(canonicalizeMembership(['local_a'],buildPlaylistIndex(lib)),['local:local_a']);
console.log('PASS scoped lookup parity across 100 adversarial catalogs, bounded key retention, cancellation, shared fresh commit index');
const {buildPlaylistMutationIndex}=await import('../scripts/modules/playlist-model.js');
assert.equal(buildPlaylistMutationIndex(large,['local:local_0','local:local_99999']).size,2);
assert.deepEqual(buildPlaylistMutationIndex(lib,['local_a']),buildPlaylistIndex(lib));
assert.deepEqual(canonicalizeMembership(['local:local_a','id:unknown'],[]),['local:local_a','id:unknown']);
console.log('PASS canonical-only mutation lookup, conservative legacy fallback, unresolved canonical preservation');

const {preparePlaylistEdit}=await import('../scripts/modules/playlist-model.js');
let identityReads=0;
const measured=[{get id(){identityReads++;return 'local_a';}},{get id(){identityReads++;return 'local_b';}}];
const unchanged=['local:local_a','id:missing'];
assert.equal(preparePlaylistEdit(measured,unchanged,[...unchanged].reverse()).size,0);
assert.equal(identityReads,0,'existing canonical reorder scanned catalog');
assert.equal(preparePlaylistEdit(measured,unchanged,['local:local_a','local:local_b']).get('local:local_b'),measured[1]);
assert(identityReads>0,'replacement must validate fresh catalog');
assert.throws(()=>preparePlaylistEdit(measured,unchanged,['local:local_a','local:gone']),/no longer available/);
assert.throws(()=>preparePlaylistEdit([...measured,{id:'local_b'}],unchanged,['local:local_b']),/no longer available/);
assert.deepEqual(canonicalizeMembership(['local_a'],preparePlaylistEdit(measured,['local_a'],['local_a'])),['local:local_a']);
assert.equal(preparePlaylistEdit([{tid:1},{tid:2}],['1','2'],['2','1'],true).size,0);
assert.throws(()=>preparePlaylistEdit([{tid:1}],['1'],['1','2'],true),/no longer available/);
console.log('PASS reorder-only no scan, missing existing preservation, fresh new-member rejection, legacy migration and server validation');
