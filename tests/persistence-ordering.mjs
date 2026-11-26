import assert from 'node:assert/strict';
let opens = 0;
let activeWrites = 0;
let maxActiveWrites = 0;
let orderedCommits = [];
let completes = 0;
const listeners = {};
class FakeDB {
  close() {}
  transaction(stores, mode) {
    const tx = {
      error: null,
      objectStore() {return {put(record) { if (record?.directoryName) tx.label = record.directoryName; }, clear(){}, getAll(){return {result:[]}}};}
    };
    if (mode === 'readwrite') {
      activeWrites++;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      setTimeout(() => {
        orderedCommits.push(tx.label || 'handle');
        activeWrites--;
        completes++;
        tx.oncomplete?.();
      }, 8);
    }
    return tx;
  }
}
globalThis.window={addEventListener(name,fn){listeners[name]=fn},indexedDB:{open(){opens++;const r={};queueMicrotask(()=>{r.result=new FakeDB();r.onsuccess?.()});return r;}}};
const {saveLibraryToLocalDb,saveDirectoryHandle}=await import('../scripts/modules/local-library.js');
const a=saveLibraryToLocalDb([{id:'A',filename:'first.flac',src:'http://localhost/stream1'}],'first');
const b=saveLibraryToLocalDb([{id:'B',filename:'second.flac',src:'http://localhost/stream2'}],'second');
const c=saveLibraryToLocalDb([{id:'C',filename:'third.flac',src:'http://localhost/stream3'}],'third');
assert.deepEqual(await Promise.all([a,b,c]),[true,true,true]);
assert.equal(maxActiveWrites,1,'Library commits must serialize, not race');
assert.deepEqual(orderedCommits,['first','second','third']);
const before=completes;
assert.equal(await saveDirectoryHandle({kind:'directory',name:'Music'}),true);
assert.equal(completes,before+1,'Directory handle save must await the transaction, not only schedule it');
assert.equal(opens,1);
listeners.pagehide?.();
console.log('PASS: serialized local-library commits and awaited persisted folder handle');
