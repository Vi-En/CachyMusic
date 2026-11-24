// SPDX-License-Identifier: GPL-3.0-or-later
// Native FLAC subset (RFC 9639). Worker-only decoding; integer prediction with safe-number guards.
// Mono/stereo, <=32-bit, known duration. Unsupported or malformed streams fail closed.
import { PcmReader } from './pcm-reader.js';
const MAX_WINDOW = 1024 * 1024;
const MAX_METADATA = 64 * 1024 * 1024;
const fail = message => { throw new Error(`FLAC: ${message}`); };
async function bytes(file, start, count) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || start < 0 || count < 0 || count > MAX_WINDOW || start + count > file.size) fail('invalid read');
    const result = new Uint8Array(await file.slice(start, start + count).arrayBuffer());
    if (result.length !== count) fail('short read');
    return result;
}
const u24 = (b,p) => b[p]*65536+b[p+1]*256+b[p+2];
const view = b => new DataView(b.buffer,b.byteOffset,b.byteLength);
export async function inspectFlac(file) {
    const sig = await bytes(file,0,4);
    if (String.fromCharCode(...sig) !== 'fLaC') fail('not native FLAC');
    let p=4, format=null, last=false, points=[];
    for(let blocks=0; !last; blocks++) {
        if(blocks>=256 || p>MAX_METADATA) fail('metadata budget exceeded');
        const h=await bytes(file,p,4), type=h[0]&127, n=u24(h,1); last=!!(h[0]&128); p+=4;
        if(p+n>file.size || p+n>MAX_METADATA || type===127 || (!format&&type!==0)) fail('bad metadata block');
        if(type===0){
            if(format||n!==34) fail('invalid STREAMINFO');
            const b=await bytes(file,p,n), v=view(b), minBlock=v.getUint16(0), maxBlock=v.getUint16(2), maxFrame=u24(b,7);
            const sampleRate=b[10]*4096+b[11]*16+(b[12]>>4), channels=((b[12]>>1)&7)+1, bits=(((b[12]&1)<<4)|(b[13]>>4))+1;
            const frames=(b[13]&15)*2**32+v.getUint32(14);
            if(minBlock<16||maxBlock<minBlock||maxFrame>MAX_WINDOW||sampleRate<8000||sampleRate>384000||channels>2||bits<4||bits>32||!frames) fail('unsupported stream geometry');
            format={codec:'flac',streaming:true,minBlock,maxBlock,maxFrame,sampleRate,channels,numberOfChannels:channels,bits,frames,duration:frames/sampleRate};
        }else if(type===3){
            if(n%18||n>MAX_WINDOW||points.length) fail('invalid SEEKTABLE');
            const b=await bytes(file,p,n),v=view(b); let previous=-1, previousOffset=-1;
            for(let i=0;i<n;i+=18){const sample=v.getBigUint64(i), offset=v.getBigUint64(i+8); if(sample===0xffffffffffffffffn)continue;
                if(sample>BigInt(Number.MAX_SAFE_INTEGER)||offset>BigInt(Number.MAX_SAFE_INTEGER))fail('oversized seek point');
                const s=Number(sample),o=Number(offset);if(s<=previous||o<=previousOffset||s>=format.frames||!v.getUint16(i+16))fail('invalid seek point');
                points.push({sample:s,offset:o});previous=s;previousOffset=o;
            }
        }
        p+=n;
    }
    if(p>=file.size||points.some(x=>x.offset>=file.size-p))fail('invalid frame offset');
    return {...format,offset:p,points};
}
// Non-reflected CRCs, polynomials 0x07 and 0x8005. Table avoids per-bit loops on frame payloads.
function crcTable(bits,poly){const t=new Uint16Array(256),mask=2**bits-1;for(let i=0;i<256;i++){let x=i<<(bits-8);for(let j=0;j<8;j++)x=((x<<1)^((x&(1<<(bits-1)))?poly:0))&mask;t[i]=x;}return t;}
const crc8=crcTable(8,7),crc16=crcTable(16,0x8005);
function checksum(b,n,t,bits){let c=0;for(let i=0;i<n;i++)c=((c<<8)&(2**bits-1))^t[((c>>>(bits-8))^b[i])&255];return c;}
class Bits {
    constructor(data){this.data=data;this.pos=0;}
    read(n){if(n<0||n>33||this.pos+n>this.data.length*8)fail('truncated frame');let val=0;while(n){const off=this.pos&7,k=Math.min(n,8-off);val=val*2**k+((this.data[this.pos>>3]>>(8-off-k))&((1<<k)-1));this.pos+=k;n-=k;}return val;}
    signed(n){if(!n)return 0;const x=this.read(n);return x>=2**(n-1)?x-2**n:x;}
    unary(){let q=0;while(this.pos+8<=this.data.length*8 && !(this.pos&7) && this.data[this.pos>>3]===0){this.pos+=8;q+=8;if(q>1048576)fail('Rice quotient budget');}while(this.read(1)===0){if(++q>1048576)fail('Rice quotient budget');}return q;}
    number(){const first=this.read(8);if(first<128)return first;let count=0;for(let mask=128;first&mask;mask>>=1)count++;if(count<2||count>7)fail('invalid frame number');let n=first&((1<<(7-count))-1);for(let i=1;i<count;i++){const v=this.read(8);if((v&192)!==128)fail('invalid frame number continuation');n=n*64+(v&63);}if(n < 2**([0,0,7,11,16,21,26,31][count]))fail('overlong frame number');return n;}
}
const fixed=[[ ],[1],[2,-1],[3,-3,1],[4,-6,4,-1]];
function subframe(r,n,width){
    if(r.read(1)!==0)fail('invalid subframe padding');const type=r.read(6),wasted=r.read(1)?r.unary()+1:0; width-=wasted;
    if(width<1||width>33)fail('unsupported subframe bit depth');
    const a=new Float64Array(n);let order,coeff,shift=0;
    if(type===0)a.fill(r.signed(width));
    else if(type===1){for(let i=0;i<n;i++)a[i]=r.signed(width);}
    else {
        if(type>=8&&type<=12){order=type-8;coeff=fixed[order];}
        else if(type>=32){order=(type&31)+1;}
        else fail('reserved subframe type');
        if(order>n)fail('invalid predictor order');for(let i=0;i<order;i++)a[i]=r.signed(width);
        if(!coeff){const precision=r.read(4)+1;if(precision===16)fail('invalid LPC precision');shift=r.signed(5);if(shift<0)fail('unsupported negative LPC shift');coeff=Array.from({length:order},()=>r.signed(precision));}
        const method=r.read(2);if(method>1)fail('invalid residual coding');const riceBits=4+method,partitionOrder=r.read(4),partitions=2**partitionOrder;
        if(n%partitions||n/partitions<order)fail('invalid residual partitions');const size=n/partitions;
        for(let p=0;p<partitions;p++){
            const k=r.read(riceBits),escape=k===2**riceBits-1,raw=escape?r.read(5):0;
            for(let i=p?size*p:order;i<size*(p+1);i++){
                let residual;if(escape)residual=r.signed(raw);else {const u=r.unary()*2**k+r.read(k);if(u>0xffffffff)fail('residual overflow');residual=u%2?-(u+1)/2:u/2;}
                let predicted=0;for(let j=0;j<order;j++)predicted+=coeff[j]*a[i-j-1];
                if(!Number.isSafeInteger(predicted))fail('predictor overflow');a[i]=Math.floor(predicted/2**shift)+residual;
                if(a[i]<-(2**(width-1))||a[i]>=2**(width-1))fail('sample overflow');
            }
        }
    }
    if(wasted)for(let i=0;i<n;i++)a[i]*=2**wasted;return a;
}
export function decodeFlacFrame(data,f){
    const r=new Bits(data);if(r.read(15)!==0x7ffc)fail('invalid frame sync');const variable=r.read(1),blockCode=r.read(4),rateCode=r.read(4),assignment=r.read(4),depthCode=r.read(3);
    if(r.read(1)||!blockCode||rateCode===15||assignment>10||depthCode===3)fail('reserved frame header');
    const number=r.number();let n=blockCode===1?192:blockCode<=5?576*2**(blockCode-2):blockCode===6?r.read(8)+1:blockCode===7?r.read(16)+1:256*2**(blockCode-8);
    const rates=[f.sampleRate,88200,176400,192000,8000,16000,22050,24000,32000,44100,48000,96000];
    const rate=rateCode<12?rates[rateCode]:rateCode===12?r.read(8)*1000:rateCode===13?r.read(16):r.read(16)*10;
    const depth=[f.bits,8,12,0,16,20,24,32][depthCode],channels=assignment<=7?assignment+1:2;
    if(rate!==f.sampleRate||depth!==f.bits||channels!==f.channels||n>f.maxBlock)fail('frame geometry mismatch');
    const sample=variable?number:number*f.maxBlock;if(!Number.isSafeInteger(sample)||sample+n>f.frames||(n<f.minBlock&&sample+n!==f.frames))fail('invalid frame position');
    const hEnd=r.pos/8;if(r.read(8)!==checksum(data,hEnd,crc8,8))fail('header checksum mismatch');
    const a=subframe(r,n,depth+(assignment===9?1:0)),b=channels===2?subframe(r,n,depth+((assignment===8||assignment===10)?1:0)):null;
    if((r.pos&7)&&r.read(8-(r.pos&7)))fail('nonzero frame padding');const end=r.pos/8;if(r.read(16)!==checksum(data,end,crc16,16))fail('frame checksum mismatch');
    const out=Array.from({length:channels},()=>new Float32Array(n)),scale=2**(depth-1);
    for(let i=0;i<n;i++){
        let l=a[i],rr=b?.[i];if(assignment===8)rr=l-rr;else if(assignment===9)l+=rr;else if(assignment===10){const mid=l*2+(Math.abs(rr)%2);l=(mid+rr)/2;rr=(mid-rr)/2;}
        if(l<-scale||l>=scale||(channels===2&&(rr<-scale||rr>=scale)))fail('decorrelated sample overflow');out[0][i]=l/scale;if(b)out[1][i]=rr/scale;
    }
    return {sample,count:n,bytes:end+2,channels:out};
}
// Only a small rolling decoded frame cache and one encoded window are held. Seektable is optional;
// without it, far forward seeks may be rejected rather than monopolize the worker.
export class FlacReader extends PcmReader {
    constructor(file,format,rate){
        super(file,format,rate);
        this.cursor=format.offset;this.sample=0;this.cache=[];this.cachedFrames=0;this.index=[];
        this.window=file.prefix?.byteLength>format.offset
            ? {start:0,data:new Uint8Array(file.prefix)} : null;
    }
    async next(){
        const f=this.format,needed=Math.min(f.maxFrame||MAX_WINDOW,this.blob.size-this.cursor);
        if(needed<6)fail('missing frame');
        const refill=async()=>{this.window={start:this.cursor,data:await bytes(this.blob,this.cursor,Math.min(MAX_WINDOW,this.blob.size-this.cursor))};};
        if(!this.window||this.cursor<this.window.start||this.cursor>=this.window.start+this.window.data.length||(f.maxFrame&&this.cursor+needed>this.window.start+this.window.data.length))await refill();
        const decode=()=>decodeFlacFrame(this.window.data.subarray(this.cursor-this.window.start,this.cursor-this.window.start+needed),f);
        let frame;try{frame=decode();}catch(e){if(!f.maxFrame&&e.message==='FLAC: truncated frame'&&this.window.start!==this.cursor&&this.window.start+this.window.data.length<this.blob.size){await refill();frame=decode();}else throw e;}
        if(frame.sample!==this.sample)fail('non-contiguous or invalid seek point');
        if(this.index.length<8192&&(!this.index.length||frame.sample-this.index.at(-1).sample>=f.sampleRate*5))this.index.push({sample:frame.sample,offset:this.cursor-f.offset});
        this.cursor+=frame.bytes;this.sample+=frame.count;this.cache.push(frame);this.cachedFrames+=frame.count;while(this.cache.length>1&&(this.cachedFrames>f.sampleRate+2*f.maxBlock||this.cache.length>256))this.cachedFrames-=this.cache.shift().count;return frame;
    }
    async readNative(start,end){
        const f=this.format, out=Array.from({length:f.channels},()=>new Float32Array(end-start));let pos=start;
        const earliest=this.cache[0]?.sample??this.sample;
        const points=[...f.points,...this.index];let best=null;for(const x of points)if(x.sample<=start&&(!best||x.sample>best.sample))best=x;
        if(start<earliest||(best&&best.sample>this.sample)){this.sample=best?.sample??0;this.cursor=f.offset+(best?.offset??0);this.cache=[];this.cachedFrames=0;}
        const deadline=Date.now()+4000;let frames=0;
        while(pos<end){
            let frame=this.cache.find(x=>x.sample<=pos&&x.sample+x.count>pos);
            while(!frame){if(this.sample>pos||this.sample>=f.frames||++frames>8192||Date.now()>deadline)fail('seek or decoding budget exceeded');const x=await this.next();if(x.sample+x.count>pos)frame=x;}
            const n=Math.min(end-pos,frame.sample+frame.count-pos);for(let c=0;c<f.channels;c++)out[c].set(frame.channels[c].subarray(pos-frame.sample,pos-frame.sample+n),pos-start);pos+=n;
        }
        return out;
    }
}
