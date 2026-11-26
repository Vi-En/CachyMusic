// The browser-native streaming path is preferred. Whole-file Web Audio decode is a
// compatibility fallback, not a general streaming decoder. Reject unknown/large inputs.
export const MAX_COMPRESSED_BYTES = 32 * 1024 * 1024;
export const MAX_PCM_BYTES = 64 * 1024 * 1024;
export class DecodeBudgetError extends Error {
    constructor(reason) {
        super(reason === 'unknown' ? 'This file has no reliable duration or channel metadata for compatibility playback.'
            : 'This file exceeds the memory limit for compatibility playback.');
    }
}
export function pcmBytes(seconds, rate, channels) {
    if (![seconds,rate,channels].every(x=>Number.isFinite(x)&&x>0)) return Infinity;
    return Math.ceil(seconds * rate) * Math.ceil(channels) * 4;
}
export function validateDecodeBudget(track, rate) {
    // Unknown duration or channel count cannot safely be decoded by this fallback.
    const seconds = Number(track.duration), channels = Number(track.channels);
    const bytes = pcmBytes(seconds, rate, channels);
    if (bytes > MAX_PCM_BYTES) throw new DecodeBudgetError(Number.isFinite(bytes) ? 'decoded' : 'unknown');
}
export async function readBoundedAudio(response, limit=MAX_COMPRESSED_BYTES) {
    if (!response.ok) {void response.body?.cancel().catch(()=>{});throw new Error(`Audio fetch failed (${response.status})`);}
    const length=Number(response.headers.get('content-length'));
    if (length>limit) {void response.body?.cancel().catch(()=>{});throw new DecodeBudgetError('compressed');}
    if (!response.body) throw new Error('Streaming response unavailable.');
    const reader=response.body.getReader(), chunks=[]; let total=0;
    try { for (;;) { const {value,done}=await reader.read(); if(done)break; total+=value.byteLength;
        if(total>limit)throw new DecodeBudgetError('compressed'); chunks.push(value); }
    } catch(err) {void reader.cancel().catch(()=>{});throw err;} finally {reader.releaseLock();}
    const result=new Uint8Array(total);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result.buffer;
}

// One deadline covers headers and body, without forgetting cancellation by the
// track owner. A deadline is a recoverable error, not a silent track abort.
export async function fetchBoundedAudio(url,{signal,timeoutMs=15000,fetcher=fetch,limit=MAX_COMPRESSED_BYTES}={}){
    const ctrl=new AbortController();let expired=false,timer;
    const cancel=()=>ctrl.abort();
    if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
    try{
        if(ctrl.signal.aborted)throw new DOMException('Obsolete audio fetch','AbortError');
        timer=setTimeout(()=>{expired=true;ctrl.abort();},timeoutMs);
        const response=await fetcher(url,{signal:ctrl.signal});
        const bytes=await readBoundedAudio(response,limit);
        if(ctrl.signal.aborted)throw new DOMException('Obsolete audio fetch','AbortError');
        return bytes;
    }catch(error){if(expired)throw Error('Compatibility audio fetch timed out. Press Play to retry.');throw error;}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
