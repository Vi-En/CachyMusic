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
    if (!response.ok) throw new Error(`Audio fetch failed (${response.status})`);
    const length=Number(response.headers.get('content-length'));
    if (length>limit) throw new DecodeBudgetError('compressed');
    if (!response.body) throw new Error('Streaming response unavailable.');
    const reader=response.body.getReader(), chunks=[]; let total=0;
    try { for (;;) { const {value,done}=await reader.read(); if(done)break; total+=value.byteLength;
        if(total>limit)throw new DecodeBudgetError('compressed'); chunks.push(value); }
    } catch(err) {await reader.cancel().catch(()=>{});throw err;} finally {reader.releaseLock();}
    const result=new Uint8Array(total);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result.buffer;
}
