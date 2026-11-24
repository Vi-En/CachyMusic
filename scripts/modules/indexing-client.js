import { parseAudioFileMetadata } from './tag-parser.js';
import { optimizeTrackArtwork } from './artwork-cache.js';
// One worker per import, bounded queue; no CPU-heavy tag parsing on UI thread when supported.
export function createIndexer() {
    let worker=null,sequence=0;const pending=new Map();
    try {worker=new Worker(new URL('./indexing-worker.js',import.meta.url),{type:'module'});}
    catch{}
    const dispose=()=>{worker?.terminate();worker=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Indexer closed'));}pending.clear();};
    if(worker){worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(Error(data.error)):p.resolve(data.meta);};worker.onerror=dispose;}
    return {async parse(file){if(!worker)return optimizeTrackArtwork(await parseAudioFileMetadata(file));
        try{return await new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Indexing timed out'));dispose();},20000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,file});});}
        catch{return optimizeTrackArtwork(await parseAudioFileMetadata(file));}},dispose};
}
