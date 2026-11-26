// Public API counterexamples also executable against earlier source releases.
import assert from 'node:assert/strict';
let reads=0,worker;
globalThis.Worker=class {constructor(){worker=this;}postMessage(){}terminate(){}};
const file={name:'test.wav',size:0,slice(){reads++;return new Blob([])}};
const {createIndexer}=await import('../scripts/modules/indexing-client.js');
const failures=[];
for(const mode of ['dispose','worker-error']){
 const a=createIndexer();const p=a.parse(file);if(mode==='dispose')a.dispose();else worker.onerror();
 const rejected=await p.then(()=>false,()=>true);
 if(!rejected||reads)failures.push({mode,rejected,reads});
 a.dispose();reads=0;
}
assert.deepEqual(failures,[]);console.log('PASS cancelled/failed workers never parse metadata on the UI thread');
