import { parseAudioFileMetadata } from './tag-parser.js';
import { optimizeTrackArtwork } from './artwork-cache.js';

// One in-flight file per import. A failed worker must not silently move heavy
// work onto the playback/UI thread; only initial worker unavailability allows fallback.
export function createIndexer({ signal, timeoutMs=20000,
    makeWorker=()=>new Worker(new URL('./indexing-worker.js',import.meta.url),{type:'module'}),
    fallback=async file=>optimizeTrackArtwork(await parseAudioFileMetadata(file)) }={}) {
    let worker=null, sequence=0, pending=null, closed=false, busy=false;
    const abortError=()=>new DOMException('Indexer closed','AbortError');
    try { if(!signal?.aborted)worker=makeWorker(); } catch {}
    function close(error=abortError()) {
        if(closed)return;
        closed=true;
        signal?.removeEventListener('abort',onAbort);
        const previous=worker;worker=null;
        if(previous){previous.onmessage=null;previous.onerror=null;previous.onmessageerror=null;previous.terminate();}
        const job=pending;pending=null;
        if(job){clearTimeout(job.timer);job.reject(error);}
    }
    function onAbort(){close();}
    if(signal?.aborted)close();else signal?.addEventListener('abort',onAbort,{once:true});
    if(worker){
        worker.onmessage=({data})=>{
            const job=pending;if(!job||data?.id!==job.id)return;
            pending=null;clearTimeout(job.timer);
            data.error?job.reject(Error(data.error)):job.resolve(data.meta);
        };
        worker.onerror=()=>close(Error('Indexing worker failed'));
        worker.onmessageerror=()=>close(Error('Indexing worker message failed'));
    }
    return {
        get closed(){return closed;},
        async parse(file){
            if(closed)throw abortError();
            if(busy)throw Error('Indexer already processing a file');
            busy=true;
            try{
                if(!worker){
                    // Yield before compatibility parsing so cancellation can be delivered.
                    await new Promise(resolve=>setTimeout(resolve,0));
                    if(closed)throw abortError();
                    const result=await fallback(file);
                    if(closed)throw abortError();
                    return result;
                }
                const result=await new Promise((resolve,reject)=>{
                    const id=++sequence;
                    const timer=setTimeout(()=>close(Error('Indexing timed out')),timeoutMs);
                    pending={id,resolve,reject,timer};
                    try{worker.postMessage({id,file});}catch(error){close(error);}
                });
                if(closed)throw abortError();
                return result;
            }finally{busy=false;}
        },
        dispose:()=>close()
    };
}
