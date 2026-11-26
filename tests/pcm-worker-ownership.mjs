import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../scripts/modules/pcm-worker.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const responses=[], events=[];let active=0,peak=0;const pending=[];
class Reader {
 constructor(_file,format){this.tag=format.tag;this.outputFrames=100;events.push('open:'+this.tag)}
 async readFrames(first,count){active++;peak=Math.max(peak,active);events.push('read:'+this.tag+':'+first);await new Promise(r=>pending.push(r));active--;return [new Float32Array(count).fill(first)];}
 close(){assert.equal(active,0);events.push('close:'+this.tag)}
}
const self={postMessage(data){responses.push(data)}};
vm.runInNewContext(src,{self,PcmReader:Reader,FlacReader:Reader,AndroidDirectPcmReader:Reader,PcmRangeSource:Reader,Float32Array,Error,Promise});
const send=(data)=>self.onmessage({data});const tick=()=>new Promise(r=>setImmediate(r));
send({type:'init',id:1,format:{codec:'wav',tag:'A'},rate:48000});send({type:'read',id:2,first:0,count:4});send({type:'read',id:3,first:50,count:4});send({type:'init',id:4,format:{codec:'wav',tag:'B'},rate:48000});send({type:'read',id:5,first:12,count:4});send({type:'close',id:6});await tick();assert.equal(pending.length,1);
for(let i=0;i<3;i++){assert.equal(pending.length,1);pending.shift()();await tick()}
assert.equal(peak,1);assert.deepEqual(events,['open:A','read:A:0','read:A:50','close:A','open:B','read:B:12','close:B']);assert.deepEqual(responses.map(r=>r.id),[1,2,3,4,5,6]);assert.equal(responses[2].channels[0][0],50);console.log('PASS serialized PCM worker read, seek, replacement and close ownership');
