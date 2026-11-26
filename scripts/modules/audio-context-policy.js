// Prefer the output-device native rate by default. Explicit track-rate AudioContexts
// can run DSP at 192 kHz on a 48 kHz phone output, increasing CPU cost while the OS
// still resamples. Source format and actual output rate are reported separately.
export function createPlaybackAudioContext(AudioCtor, latencyHint) {
    try { return new AudioCtor({latencyHint}); }
    catch (_) { return new AudioCtor(); }
}

// A confirmed connection is not a running render clock. Never start a source
// while resume is unresolved, interrupted, rejected or owned by another graph.
export async function requireRunningGraph({context, current, confirmed, resume, timeoutMs=1200}) {
    const check=()=>context&&current()===context&&confirmed();
    if(!check())throw Error('Audio output route is not connected.');
    if(context.state==='running')return context;
    if(context.state==='closed')throw Error('Audio output is closed.');
    let timer;
    try{
        await Promise.race([Promise.resolve().then(resume),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Audio output did not resume. Press Play to retry.')),timeoutMs);})]);
    }finally{clearTimeout(timer);}
    if(!check()||context.state!=='running')throw Error('Audio output is not running. Check the output device and press Play to retry.');
    return context;
}

// Do not hot-swap a late worklet into an audible fallback route. The prepared
// processor is eligible at the next paused boundary or while output is held.
export function canActivatePreparedWorklet({configured,previousRoute,audible,held}){
    return Boolean(configured&&(previousRoute==='worklet'||!audible||held));
}

// The element can remain pending while waiting for media data. A deadline
// settles the controller request; the owner must pause on failure, rather
// than treating a late promise resolution as permission to start.
export async function startMediaWithDeadline(media,{timeoutMs=8000}={}){
    let timer;
    try{return await Promise.race([Promise.resolve(media.play()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Media playback did not start. Press Play to retry.')),timeoutMs);})]);}
    finally{clearTimeout(timer);}
}
