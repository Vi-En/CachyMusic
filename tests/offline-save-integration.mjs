// Simulated durable stores with atomic transaction commit/abort. The OPFS and
// IndexedDB APIs are mocked; browser crash recovery requires device validation.
import assert from 'node:assert/strict';
import {pendingAudioRecord} from '../scripts/modules/offline-write-journal.js';
const tables = new Map(['library','tracks','artwork'].map(n=>[n,new Map()]));
let failPut=false, failDelete=false;
const db={close(){},transaction(names,mode){
    names=Array.isArray(names)?names:[names];
    const copies=new Map(names.map(n=>[n,new Map(tables.get(n))]));
    let aborted=false;const tx={error:null,abort(){aborted=true;},objectStore(n){const m=copies.get(n);return {
        getAll(){return {result:[...m.values()]}},clear(){m.clear()},put(r){if(n==='tracks'&&failPut)throw Error('DataCloneError');m.set(r.storageKey??r.key,r);},delete(k){m.delete(k)}
    };}};
    setTimeout(()=>{if(aborted){tx.onabort?.();return;}if(mode==='readwrite')for(const [n,m] of copies)tables.set(n,m);tx.oncomplete?.();},1);return tx;
}};
globalThis.window={addEventListener(){},indexedDB:{open(){const r={};queueMicrotask(()=>{r.result=db;r.onsuccess();});return r;}}};
const files=new Map();let tail=Promise.resolve();let writes=0;
const dir={async getFileHandle(key){return {async createWritable(){return {async write(blob){assert(tables.get('library').has(pendingAudioRecord(key).key),'journal must commit before writing');files.set(key,blob);writes++;},async close(){},async abort(){}};}};},async removeEntry(key){if(failDelete)throw Error('device busy');if(!files.delete(key)){const e=Error('missing');e.name='NotFoundError';throw e;}}};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request(name,options,callback){const next=tail.then(callback);tail=next.catch(()=>{});return next;}},storage:{async getDirectory(){return {async getDirectoryHandle(){return dir;}};}}}});
const {saveLibraryToLocalDb}=await import('../scripts/modules/local-library.js');
const original={id:'original',filename:'same.flac',_fileBlob:new Blob(['first'])};
assert.equal(await saveLibraryToLocalDb([original],'Music'),true);assert(original.opfsKey);assert(files.has(original.opfsKey));assert(!tables.get('library').has(pendingAudioRecord(original.opfsKey).key));assert.equal(writes,1);
const second={id:'second',filename:'same.flac',_fileBlob:new Blob(['second'])};
failPut=true;failDelete=true;const warn=console.warn;console.warn=()=>{};
try{assert.equal(await saveLibraryToLocalDb([original,second],'Music'),false);}finally{console.warn=warn;}
assert.equal(second.opfsKey,null);assert.equal(tables.get('tracks').size,1);assert.equal(files.size,2);
const abandoned=[...files.keys()].find(k=>k!==original.opfsKey);assert(tables.get('library').has(pendingAudioRecord(abandoned).key));
failPut=false;failDelete=false;
assert.equal(await saveLibraryToLocalDb([original,second],'Music'),true);assert(second.opfsKey);assert.notEqual(second.opfsKey,abandoned);assert(!files.has(abandoned));assert(files.has(original.opfsKey));assert(files.has(second.opfsKey));assert.equal(tables.get('tracks').size,2);assert.equal([...tables.get('library').keys()].filter(k=>k.startsWith('pending_audio:')).length,0);
// Snapshot membership is captured synchronously, before the write queue runs.
const list=[original];const save=saveLibraryToLocalDb(list,'Music');list.push(second);assert.equal(await save,true);assert.equal(tables.get('tracks').size,1);assert(files.has(second.opfsKey),'committed audio is never swept, including undo candidates');
console.log('PASS journal commit before OPFS write, atomic publish, synchronous clone-error abort, failed removal recovery, preserved old audio and queued snapshot membership');
