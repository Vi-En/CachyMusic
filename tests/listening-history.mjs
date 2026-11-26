import assert from 'node:assert/strict';
import {createListeningCounter,periodStart,localDay,rankListening,recordingKey,createRankAccumulator} from '../scripts/modules/listening-history-model.js';
const plays=[];const c=createListeningCounter(t=>plays.push(t));let now=0;
const sample=(p,d=180,playing=true,rate=1,key='tid:1',dt=1000)=>{now+=dt;c.sample({key},key,p,d,playing,rate,now);};
for(let i=0;i<=29;i++)sample(i);assert.equal(plays.length,0);
sample(30);assert.equal(plays.length,1);for(let i=31;i<=90;i++)sample(i);assert.equal(plays.length,1);
c.reset();sample(0);sample(120);sample(121);assert.equal(plays.length,1,'seek is not listening');c.breakSample();sample(150);for(let i=151;i<=178;i++)sample(i);assert.equal(plays.length,1);sample(179);assert.equal(plays.length,2);
c.reset();for(let i=0;i<=10;i++)sample(i,20);assert.equal(plays.length,3,'short track');
c.reset();sample(0);sample(25,180,true,1,'tid:1',25000);assert.equal(plays.length,3,'suspended interval');
c.reset();for(let i=0;i<=30;i++)sample(i*2,180,true,2);assert.equal(plays.length,4,'rate adjusted');
c.reset();for(let i=0;i<=45;i++)sample(i,180,false);assert.equal(plays.length,4,'paused playback');
const sun=new Date(2026,10,29,12);assert.equal(localDay(sun),'2026-11-29');assert.equal(periodStart('week',sun),'2026-11-23');assert.equal(periodStart('month',sun),'2026-11-01');assert.equal(periodStart('year',sun),'2026-01-01');assert.equal(periodStart('all',sun),'0000-01-01');
assert.equal(periodStart('week',new Date(2027,0,1)),'2026-12-28');
assert.deepEqual(rankListening([{key:'b',title:'B',count:2},{key:'a',title:'A',count:2},{key:'c',title:'C',count:3}]).map(x=>x.key),['c','a','b']);
console.log('PASS qualified listening, seek/pause/suspension rejection, single count per visit, speed, calendar boundaries and stable rank');

const a={tid:13,fullPath:'/music/first.flac',fileSize:20,lastModified:123,title:'First'};
assert.notEqual(recordingKey(a),recordingKey({...a,fullPath:'/music/second.flac'}));
assert.notEqual(recordingKey(a),recordingKey({...a,lastModified:124}));
assert.equal(recordingKey(a),recordingKey({...a,tid:99,title:'Edited'}));
assert.notEqual(recordingKey({tid:13,title:'Unknown'}),recordingKey({tid:13,title:'Unknown'}));
const local={id:'local_aaa',fullPath:'album/track.flac',fileSize:20,lastModified:123};
assert.equal(recordingKey(local),recordingKey({...local,title:'Edited'}));
console.log('PASS source fingerprint identity, metadata changes with immutable file attributes, reused row IDs and unresolved objects');

const rows=Array.from({length:100000},(_,i)=>({key:String(i),title:`Track ${i}`,count:(i*13)%127}));const top=createRankAccumulator();rows.forEach(r=>top.add(r));assert.equal(top.result().count,rows.length);assert.deepEqual(top.result().items,rankListening(rows).slice(0,50));console.log('PASS bounded exact top-50 ranking over 100,000 records');
