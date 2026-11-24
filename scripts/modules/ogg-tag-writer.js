// SPDX-License-Identifier: GPL-3.0-or-later
// Single-stream Ogg Opus/Vorbis tagging. Audio pages retain their lacing, granules,
// flags and body; only the page sequence and checksum are changed.
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const LIMIT=32*1024*1024;
const ascii=b=>String.fromCharCode(...b);
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const read=async(b,p,n)=>new Uint8Array(await b.slice(p,p+n).arrayBuffer());
const join=parts=>{const n=parts.reduce((s,b)=>s+b.length,0);if(n>LIMIT)throw Error('Ogg header budget exceeded');const o=new Uint8Array(n);let p=0;for(const b of parts){o.set(b,p);p+=b.length;}return o;};
const int=(n,le=true)=>{const b=new Uint8Array(4);view(b).setUint32(0,n,le);return b;};
const str=(s,le=true)=>{const b=enc.encode(s);return [int(b.length,le),b];};
const table=Uint32Array.from({length:256},(_,i)=>{let x=i<<24;for(let j=0;j<8;j++)x=(x<<1)^((x>>>31)?0x04c11db7:0);return x>>>0;});
export function oggCrc(b){let c=0;for(let i=0;i<b.length;i++)c=((c<<8)^table[((c>>>24)^((i>=22&&i<26)?0:b[i]))&255])>>>0;return c;}
export async function readOggPage(blob,offset){
    const h=await read(blob,offset,27);if(h.length!==27||ascii(h.subarray(0,4))!=='OggS'||h[4]||h[5]&~7)throw Error('Invalid Ogg page header');
    const laces=await read(blob,offset+27,h[26]);if(!laces.length||laces.length!==h[26])throw Error('Invalid Ogg lacing');
    const size=27+laces.length+laces.reduce((a,b)=>a+b,0),page=await read(blob,offset,size);if(page.length!==size||oggCrc(page)!==view(page).getUint32(22,true))throw Error('Invalid Ogg page checksum');
    const v=view(page);return {page,laces,body:page.subarray(27+laces.length),serial:v.getUint32(14,true),seq:v.getUint32(18,true),flags:page[5],granule:v.getBigUint64(6,true),next:offset+size};
}
// Read complete packets, not pages. A comment may span hundreds of pages.
export async function readOggHeaders(blob,{strictBoundary=false}={}){
    let offset=0,serial=null,seq=0,parts=[],length=0,total=0,packets=[],codec=null,needed=2;
    while(offset<blob.size&&packets.length<needed){
        const pg=await readOggPage(blob,offset);offset=pg.next;
        if(serial===null)serial=pg.serial;
        if(pg.serial!==serial||pg.seq!==seq||Boolean(pg.flags&2)!==(seq===0)||Boolean(pg.flags&1)!==Boolean(parts.length)||pg.flags&4)throw Error('Unsupported multiplexed or malformed Ogg stream');seq++;
        total+=pg.body.length;if(total>LIMIT||seq>65536)throw Error('Ogg headers too large');
        let p=0;
        for(let i=0;i<pg.laces.length;i++){
            const n=pg.laces[i];parts.push(pg.body.subarray(p,p+n));length+=n;p+=n;if(length>LIMIT)throw Error('Ogg packet too large');
            if(n===255)continue;
            const packet=join(parts);parts=[];length=0;packets.push(packet);
            if(packets.length===1){if(ascii(packet.subarray(0,8))==='OpusHead'&&packet.length>=19)codec='opus';else if(packet[0]===1&&ascii(packet.subarray(1,7))==='vorbis'&&packet.length>=30){codec='vorbis';needed=3;}else throw Error('Unsupported Ogg codec');}
            if(packets.length===needed){if(strictBoundary&&(i!==pg.laces.length-1||pg.granule!==0n))throw Error('Audio and header packets share a page; original left unchanged');return {packets,codec,serial,seq,offset};}
        }
    }
    throw Error('Incomplete Ogg headers');
}
const map={title:'TITLE',artist:'ARTIST',album:'ALBUM',genre:'GENRE',year:'DATE',track_num:'TRACKNUMBER',comment:'COMMENT',lyrics:'LYRICS'};
const aliases={year:['YEAR'],track_num:['TRACK'],lyrics:['UNSYNCEDLYRICS']};
function b64(bytes){const chunks=[];for(let i=0;i<bytes.length;i+=8192)chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));return btoa(chunks.join(''));}
function editComments(packet,codec,fields,picture){
    const prefix=codec==='opus'?enc.encode('OpusTags'):Uint8Array.of(3,...enc.encode('vorbis'));
    if(!prefix.every((b,i)=>packet[i]===b))throw Error('Wrong Ogg comment signature');
    const v=view(packet);let p=prefix.length;
    const num=()=>{if(p+4>packet.length)throw Error('Truncated Ogg comments');const n=v.getUint32(p,true);p+=4;return n;};
    const text=()=>{const n=num();if(n>packet.length-p)throw Error('Truncated Ogg comment');const s=dec.decode(packet.subarray(p,p+n));p+=n;return s;};
    const vendor=text(),n=num();if(n>100000)throw Error('Too many Ogg comments');
    const keys=new Set(Object.keys(map).filter(k=>Object.hasOwn(fields,k)).flatMap(k=>[map[k],...(aliases[k]||[])]));const entries=[];
    for(let i=0;i<n;i++){const s=text(),key=s.split('=',1)[0].toUpperCase();if(keys.has(key))continue;
        if(picture&&key==='METADATA_BLOCK_PICTURE'){let type;try{const x=atob(s.slice(s.indexOf('=')+1,s.indexOf('=')+9));type=view(Uint8Array.from(x,c=>c.charCodeAt(0))).getUint32(0);}catch{throw Error('Malformed existing Ogg cover');}if(type===3)continue;}
        if(picture&&['COVERART','COVERARTMIME'].includes(key))throw Error('Legacy cover tags conflict; original left unchanged');entries.push(s);
    }
    // Opus allows padding and opaque appended data; reject nonzero suffix rather than silently discard it.
    if(codec==='vorbis'?(p+1!==packet.length||packet[p]!==1):packet.subarray(p).some(x=>x!==0))throw Error('Unsupported Ogg comment suffix');
    for(const [k,tag] of Object.entries(map))if(fields[k]!=null&&String(fields[k])!=='')entries.push(`${tag}=${fields[k]}`);
    if(picture){if(!['image/png','image/jpeg'].includes(picture.mime)||picture.bytes.length>10*1024*1024)throw Error('Unsupported picture');const block=join([int(3,false),...str(picture.mime,false),...str('',false),int(picture.width,false),int(picture.height,false),int(picture.mime==='image/png'?32:24,false),int(0,false),int(picture.bytes.length,false),picture.bytes]);entries.push('METADATA_BLOCK_PICTURE='+b64(block));}
    return join([prefix,...str(vendor),int(entries.length),...entries.flatMap(s=>str(s)),...(codec==='vorbis'?[Uint8Array.of(1)]:[])]);
}
function packetPages(packet,serial,seq){
    const laces=Array(Math.floor(packet.length/255)).fill(255);laces.push(packet.length%255);const result=[];let pos=0;
    for(let k=0;k<laces.length;k+=255){const seg=laces.slice(k,k+255),n=seg.reduce((a,b)=>a+b,0),last=k+seg.length===laces.length;const pg=new Uint8Array(27+seg.length+n),v=view(pg);pg.set(enc.encode('OggS'));pg[5]=(seq===0?2:0)|(k?1:0);v.setBigUint64(6,last?0n:0xffffffffffffffffn,true);v.setUint32(14,serial,true);v.setUint32(18,seq++,true);pg[26]=seg.length;pg.set(seg,27);pg.set(packet.subarray(pos,pos+n),27+seg.length);pos+=n;v.setUint32(22,oggCrc(pg),true);result.push(pg);}
    return result;
}
// Yield one page at a time for desktop writes. The browser uses bounded batches instead of retaining all audio bytes.
export async function* oggRewritePages(blob,fields,picture=null){
    const h=await readOggHeaders(blob,{strictBoundary:true});if(h.codec==='vorbis'&&(h.packets[2][0]!==5||ascii(h.packets[2].subarray(1,7))!=='vorbis'))throw Error('Invalid Vorbis setup packet');
    h.packets[1]=editComments(h.packets[1],h.codec,fields,picture);let seq=0;
    for(const packet of h.packets)for(const page of packetPages(packet,h.serial,seq)){seq++;yield page;}
    let p=h.offset,oldSeq=h.seq,continued=false,ended=false;
    while(p<blob.size){const pg=await readOggPage(blob,p);if(ended||pg.serial!==h.serial||pg.seq!==oldSeq++||pg.flags&2||Boolean(pg.flags&1)!==continued)throw Error('Unsupported chained or malformed Ogg audio');p=pg.next;continued=pg.laces.at(-1)===255;ended=Boolean(pg.flags&4);if(ended&&continued)throw Error('Truncated Ogg audio packet');const v=view(pg.page);v.setUint32(18,seq++,true);v.setUint32(22,oggCrc(pg.page),true);yield pg.page;}
    if(!ended)throw Error('Missing Ogg end-of-stream');
}
export async function rewriteOgg(blob,fields,picture=null){
    // Browser export uses a bounded-size result; desktop streams to disk without this limit.
    if(blob.size>128*1024*1024)throw Error('Ogg browser tag export exceeds 128 MiB; use desktop file writing');
    const parts=[];for await(const pg of oggRewritePages(blob,fields,picture))parts.push(pg);
    return {blob:new Blob(parts,{type:'audio/ogg'})};
}
