// SPDX-License-Identifier: GPL-3.0-or-later
// Local indexed media HTTP byte ranges. No redirects, remote origins or full-file fallback.
const LIMIT=4*1024*1024;
const ANDROID_PREFIX_BYTES = 64 * 1024;
const ANDROID_ORIGIN = 'https://appassets.androidplatform.net';
export function validatePcmRangeUrl(value,base=globalThis.location?.href){
    if(!base)throw Error('Local media origin unavailable');const u=new URL(value,base),b=new URL(base);
    if(u.origin!==b.origin||u.username||u.password||!['http:','https:'].includes(u.protocol))throw Error('External PCM source denied');
    const android=u.hostname==='appassets.androidplatform.net'&&u.pathname==='/android-media'&&u.searchParams.has('uri');
    const desktop=['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&u.pathname.endsWith('/php/api/stream.php')&&/^\d+$/.test(u.searchParams.get('tid')||'')&&[...u.searchParams.keys()].length===1;
    if(!android&&!desktop)throw Error('PCM source must be an indexed local media endpoint');return u.href;
}
async function getRange(url,start,end,expectedSize=null,allowShortEnd=false){
    if(end-start+1>LIMIT||start<0||end<start)throw Error('PCM range exceeds budget');
    const requestUrl = new URL(url);
    const headers = {};
    if (requestUrl.origin === ANDROID_ORIGIN) {
        // WebView can apply HTTP Range itself to an intercepted response stream.
        requestUrl.searchParams.set('pcmStart', String(start));
        requestUrl.searchParams.set('pcmEnd', String(end));
    } else {
        headers.Range = `bytes=${start}-${end}`;
    }
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),5000);
    try{
        const res=await fetch(requestUrl.href,{headers,redirect:'error',credentials:'same-origin',cache:'no-store',signal:ctrl.signal});
        const m=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('Content-Range')||'');
        const size = Number(m?.[3]);
        const last = allowShortEnd ? Math.min(end, size - 1) : end;
        if(res.status!==206||!m||Number(m[1])!==start||Number(m[2])!==last||!Number.isSafeInteger(size)||size<=last||last<start||(expectedSize!==null&&size!==expectedSize)){await res.body?.cancel();throw Error('Media endpoint returned an invalid byte range');}
        const n=last-start+1,bytes=new Uint8Array(n),reader=res.body?.getReader();if(!reader)throw Error('Readable range required');let offset=0;
        try{while(true){const {done,value}=await reader.read();if(done)break;if(offset+value.byteLength>n)throw Error('Oversized media response');bytes.set(value,offset);offset+=value.byteLength;}if(offset!==n)throw Error('Incomplete media range');}
        finally{try{await reader.cancel();}catch(_){}reader.releaseLock();}
        return {size,bytes:bytes.buffer};
    }finally{clearTimeout(timer);}
}
export class PcmRangeSource{
    constructor(url,size,prefix=null){
        this.url=validatePcmRangeUrl(url);if(!Number.isSafeInteger(size)||size<12)throw Error('Invalid media size');this.size=size;
        this.prefix = prefix instanceof ArrayBuffer && prefix.byteLength <= Math.min(size, ANDROID_PREFIX_BYTES) ? prefix : null;
    }
    static async open(value){
        const url=validatePcmRangeUrl(value);
        const android = new URL(url).origin === ANDROID_ORIGIN;
        const {size,bytes}=await getRange(url,0,android ? ANDROID_PREFIX_BYTES-1 : 0,null,android);
        return new PcmRangeSource(url,size,android ? bytes : null);
    }
    slice(start,end){return {arrayBuffer:async()=>{
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>this.size)throw Error('Invalid PCM range');
        if(start===end)return new ArrayBuffer(0);
        if(this.prefix && end<=this.prefix.byteLength)return this.prefix.slice(start,end);
        return (await getRange(this.url,start,end-1,this.size)).bytes;
    }};}
    descriptor(){return {kind:'local-range',url:this.url,size:this.size,prefix:this.prefix};}
}
