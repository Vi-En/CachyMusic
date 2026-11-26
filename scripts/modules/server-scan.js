// One protocol for managed desktop scans. Unmanaged PHP retains its explicit
// compatibility route; an unavailable managed worker must not trigger a blocking scan.
const API='php/api/scan_jobs.php';
const abortError=()=>new DOMException('Scan cancelled','AbortError');
function delay(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted){reject(abortError());return;}const finish=()=>{signal?.removeEventListener('abort',abort);resolve();};const timer=setTimeout(finish,ms);const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(abortError());};signal?.addEventListener('abort',abort,{once:true});});}
const jobId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
async function boundedFetch(fetcher,url,options={},timeoutMs=15000){
    const owner=new AbortController();const signal=options.signal;
    const relay=()=>owner.abort();if(signal?.aborted)throw abortError();
    signal?.addEventListener('abort',relay,{once:true});
    const timer=setTimeout(relay,timeoutMs);
    try{return await fetcher(url,{...options,signal:owner.signal});}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',relay);}
}
const post=(fetcher,payload,signal)=>boundedFetch(fetcher,API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal});
async function dataOf(response){const data=await response.json();if(!response.ok)throw Error(data?.message||`Scan HTTP ${response.status}`);return data;}
export async function readServerDirectory(fetcher=fetch){const data=await dataOf(await boundedFetch(fetcher,API+'?directory=1',{cache:'no-store'}));if(typeof data.directory!=='string')throw Error('Invalid server directory response');return data.directory;}
export async function requestServerScan({directory='',preserveDirectory=false,kind='scan',expectedDirectory,edit,signal,onPhase=()=>{},fetcher=fetch,makeId=jobId,pollMs=350,maxWaitMs=3650000}={}){
    if(signal?.aborted)throw abortError();
    let capability=await dataOf(await boundedFetch(fetcher,API,{cache:'no-store',signal}));
    for(let i=0;capability.enabled===true&&capability.ready!==true&&i<8;i++){
        await delay(250,signal);capability=await dataOf(await boundedFetch(fetcher,API,{cache:'no-store',signal}));
    }
    if(capability.enabled===false){
        const response=await fetcher(kind==='metadata'?'php/api/metadata.php':kind==='browse'?'php/api/browse_folder.php':'php/api/scan.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(kind==='metadata'?edit:kind==='browse'?{initialDir:directory}:{directory,preserveDirectory,...(expectedDirectory!==undefined?{expectedDirectory}:{})}),cache:'no-store',signal});
        return dataOf(response);
    }
    if(capability.enabled!==true||capability.ready!==true)throw Error('Background scan worker unavailable. Restart the desktop backend.');
    const id=makeId();const request=kind==='metadata'?{action:'start',id,edit}:{action:'start',id,directory,preserveDirectory,...(kind==='browse'?{kind}: {}),...(expectedDirectory!==undefined?{expectedDirectory}:{})};
    const submit=()=>kind==='metadata'?boundedFetch(fetcher,API+'?metadata=1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),cache:'no-store'},30000):post(fetcher,request);
    let submitted=false,finished=false;
    const start=performance.now();
    const cancel=()=>{if(submitted&&!finished)void post(fetcher,{action:'cancel',id}).catch(()=>{});};
    signal?.addEventListener('abort',cancel,{once:true});
    try{
        // A lost response can be retried using the exact same identifier.
        // Never resubmit under a new ID or switch to synchronous scanning.
        let response;submitted=true;
        try{response=await submit();}catch(error){if(signal?.aborted)throw error;response=await submit();}
        let state=await dataOf(response);
        while(true){
            if(signal?.aborted)throw abortError();
            if(state.id!==id)throw Error('Scan job identity changed');
            onPhase(state.phase);
            if(state.phase==='done'){
                const result=await dataOf(await boundedFetch(fetcher,API+`?id=${id}&result=1`,{cache:'no-store',signal}));finished=true;return result;
            }
            if(state.phase==='cancelled'){finished=true;throw abortError();}
            if(state.phase==='uncertain'){finished=true;throw Error('Operation outcome uncertain after worker shutdown. Refresh the library before retrying.');}
            if(!['queued','running','cancelling','committing'].includes(state.phase))throw Error('Unknown scan job state');
            if(performance.now()-start>maxWaitMs)throw Error('Scan exceeded the client wait limit; requesting cancellation.');
            await delay(pollMs,signal);
            state=await dataOf(await boundedFetch(fetcher,API+`?id=${id}`,{cache:'no-store',signal}));
        }
    }finally{signal?.removeEventListener('abort',cancel);cancel();}
}

export function requestServerMetadata(edit,options={}) {return requestServerScan({...options,kind:"metadata",edit,maxWaitMs:310000});}

export function requestServerBrowse(options={}) {return requestServerScan({...options,kind:"browse",maxWaitMs:310000});}
