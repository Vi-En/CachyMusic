// Native FLAC only; preserves every encoded audio-frame byte using Blob slices.
// Rejects unsupported/corrupt metadata rather than rewriting unknown input.
const enc=new TextEncoder(), dec=new TextDecoder('utf-8',{fatal:true});
const u32=(n,little=false)=>{const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,n,little);return a;};
const str=(s,little=true)=>{const b=enc.encode(s);return [u32(b.length,little),b];};
const join=parts=>{let n=parts.reduce((s,b)=>s+b.length,0);const o=new Uint8Array(n);let p=0;for(const b of parts){o.set(b,p);p+=b.length;}return o;};
function comments(bytes) {
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let p=0;
    const integer=()=>{if(p+4>bytes.length)throw Error('Truncated FLAC comments');const x=v.getUint32(p,true);p+=4;return x;};
    const text=()=>{const n=integer();if(n>bytes.length-p)throw Error('Truncated FLAC comment');const s=dec.decode(bytes.subarray(p,p+n));p+=n;return s;};
    const vendor=text(), count=integer();if(count>100000)throw Error('Excessive FLAC comments');
    const entries=[];for(let i=0;i<count;i++)entries.push(text());return {vendor,entries};
}
const map={title:'TITLE',artist:'ARTIST',album:'ALBUM',genre:'GENRE',year:'DATE',track_num:'TRACKNUMBER',comment:'COMMENT',lyrics:'LYRICS'};
export async function rewriteFlac(blob, fields, picture=null) {
    if(!(blob instanceof Blob)||blob.size<42)throw Error('Invalid FLAC file');
    if(dec.decode(await blob.slice(0,4).arrayBuffer())!=='fLaC')throw Error('Only native FLAC without a leading foreign tag is supported');
    let p=4,last=false,blocks=[],total=0,commentSeen=false;
    while(!last) {
        if(p+4>blob.size||blocks.length>1024)throw Error('Malformed FLAC metadata');
        const h=new Uint8Array(await blob.slice(p,p+4).arrayBuffer());last=!!(h[0]&128);const type=h[0]&127,n=h[1]*65536+h[2]*256+h[3];p+=4;total+=n;
        if(p+n>blob.size||total>32*1024*1024||type===127||(!blocks.length&&(type!==0||n!==34))||(type===0&&blocks.length))throw Error('Invalid or oversized FLAC metadata');
        const data=new Uint8Array(await blob.slice(p,p+n).arrayBuffer());p+=n;
        if(type===4) {
            if(commentSeen)throw Error('Multiple FLAC comment blocks are unsupported');commentSeen=true;
            const {vendor,entries}=comments(data);blocks.push({type,data:makeComments(vendor,entries,fields)});
        } else if(type===6&&picture&&data.length>=4&&new DataView(data.buffer).getUint32(0)===3) { /* replace front cover only */ }
        else blocks.push({type,data});
    }
    if(p>=blob.size)throw Error('FLAC file contains no audio frames');
    if(!commentSeen)blocks.push({type:4,data:makeComments('CachyMusic',[],fields)});
    if(picture) {
        if(!['image/jpeg','image/png'].includes(picture.mime)||picture.bytes.length>10*1024*1024)throw Error('Invalid embedded image');
        blocks.push({type:6,data:join([u32(3),...str(picture.mime,false),...str('',false),u32(picture.width),u32(picture.height),u32(picture.mime==='image/png'?32:24),u32(0),u32(picture.bytes.length),picture.bytes])});
    }
    const parts=[enc.encode('fLaC')];
    blocks.forEach(({type,data},i)=>{const n=data.length;if(n>0xffffff)throw Error('FLAC metadata block too large');parts.push(Uint8Array.of(type|(i===blocks.length-1?128:0),n>>>16,(n>>>8)&255,n&255),data);});
    return {blob:new Blob([...parts,blob.slice(p)],{type:'audio/flac'}),originalAudioOffset:p,newAudioOffset:parts.reduce((s,b)=>s+b.length,0)};
}
function makeComments(vendor,entries,fields) {
    const keys=new Set(Object.keys(map).filter(k=>Object.hasOwn(fields,k)).map(k=>map[k]));
    const next=entries.filter(s=>!keys.has(s.split('=',1)[0].toUpperCase()));
    for(const [k,v] of Object.entries(fields))if(map[k]&&v!=null&&String(v)!=='')next.push(`${map[k]}=${String(v)}`);
    return join([...str(vendor),u32(next.length,true),...next.flatMap(s=>str(s))]);
}
