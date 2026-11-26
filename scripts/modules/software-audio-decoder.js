import {DecodeBudgetError,MAX_PCM_BYTES} from './decode-budget.js';
// Browser decoder compatibility for FLAC files with prepended ID3 tags.
export function stripId3ToFlacMagic(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 16) return null;
    const bytes = new Uint8Array(arrayBuffer);
    // Only scan when file begins with ID3v2 header ('I','D','3')
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;
    // Syncsafe ID3v2 tag size + 10-byte header
    let startOffset = 10 + ((bytes[6] & 0x7f) << 21) + ((bytes[7] & 0x7f) << 14) + ((bytes[8] & 0x7f) << 7) + (bytes[9] & 0x7f);
    if (startOffset + 4 <= bytes.length
        && bytes[startOffset] === 0x66 && bytes[startOffset + 1] === 0x4c
        && bytes[startOffset + 2] === 0x61 && bytes[startOffset + 3] === 0x43) {
        return arrayBuffer.slice(startOffset);
    }
    const scanLimit = Math.min(bytes.length - 4, 262144);
    for (let i = 10; i < scanLimit; i++) {
        if (bytes[i] === 0x66 && bytes[i + 1] === 0x4c && bytes[i + 2] === 0x61 && bytes[i + 3] === 0x43) {
            return arrayBuffer.slice(i);
        }
    }
    return null;
}

export async function decodeBufferWithAudioContext(ctx, rawArrayBuf, onStrip = () => {}) {
    const attemptDecode = (buf) => new Promise((resolve, reject) => {
        const p = ctx.decodeAudioData(
            buf,
            decoded => resolve(decoded),
            err => reject(err || new Error('decodeAudioData callback returned error'))
        );
        if (p && typeof p.then === 'function') {
            p.then(resolve, reject);
        }
    });
    const head = rawArrayBuf && rawArrayBuf.byteLength >= 16 ? new Uint8Array(rawArrayBuf, 0, 3) : null;
    const hasId3Header = Boolean(head && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33);
    if (hasId3Header) {
        const stripped = stripId3ToFlacMagic(rawArrayBuf);
        if (stripped) {
            onStrip();
            return await attemptDecode(stripped);
        }
    }
    // Zero-copy decode avoids duplicating large 50-90MB FLAC ArrayBuffers on 4GB devices
    return await attemptDecode(rawArrayBuf);
}


// decodeAudioData cannot be cancelled. Time out the caller without releasing
// ownership of the underlying allocation; avoid overlapping large fallback jobs.
export function createBoundedDecoder({timeoutMs=20000,decode=decodeBufferWithAudioContext}={}) {
    let inFlight=null;
    return async function decodeOwned(ctx,bytes,onStrip){
        if(inFlight)throw Error('A previous compatibility decode is still finishing. Retry later.');
        const task=Promise.resolve().then(()=>decode(ctx,bytes,onStrip));
        inFlight=task;
        task.then(()=>{if(inFlight===task)inFlight=null;},()=>{if(inFlight===task)inFlight=null;});
        let timer;
        try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Compatibility decode timed out. Retry later.')),timeoutMs);})]);}
        finally{clearTimeout(timer);}
    };
}

// Reject malformed decoder output before it can enter the audio graph. Yield
// between bounded chunks so large (but permitted) audio buffers do not block UI.
export async function validateDecodedAudioBuffer(buffer,{maxBytes=MAX_PCM_BYTES,current=()=>true,yieldTurn=()=>new Promise(r=>setTimeout(r,0))}={}){
    const {length,numberOfChannels,sampleRate,duration}=buffer||{};
    if(!Number.isSafeInteger(length)||length<=0||!Number.isInteger(numberOfChannels)||numberOfChannels<1||numberOfChannels>2||!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>384000||!Number.isFinite(duration)||duration<=0||Math.abs(duration-length/sampleRate)>1/sampleRate)throw Error('Unsupported decoded audio geometry.');
    if(length*numberOfChannels*4>maxBytes)throw new DecodeBudgetError('decoded');
    for(let channel=0;channel<numberOfChannels;channel++){
        const samples=buffer.getChannelData(channel);
        if(!(samples instanceof Float32Array)||samples.length!==length)throw Error('Invalid decoded audio channel.');
        for(let start=0;start<length;start+=262144){
            if(!current())throw new DOMException('Obsolete compatibility decode','AbortError');
            const end=Math.min(start+262144,length);
            for(let i=start;i<end;i++)if(!Number.isFinite(samples[i]))throw Error('Nonfinite decoded audio sample.');
            if(end<length)await yieldTurn();
        }
    }
    if(!current())throw new DOMException('Obsolete compatibility decode','AbortError');
    return buffer;
}
