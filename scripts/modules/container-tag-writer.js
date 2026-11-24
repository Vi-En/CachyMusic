// SPDX-License-Identifier: GPL-3.0-or-later
// Conservative RIFF/WAVE and FORM/AIFF ID3 chunk editing; every non-ID3 chunk is copied verbatim.
import { readId3, buildId3 } from './mp3-tag-writer.js';
const ascii=b=>String.fromCharCode(...b);
const read=async(blob,start,end)=>new Uint8Array(await blob.slice(start,end).arrayBuffer());
export async function rewritePcmContainer(blob,fields,picture=null){
    if(!(blob instanceof Blob)||blob.size<20)throw Error('Invalid PCM container');
    const h=await read(blob,0,12),kind=ascii(h.subarray(0,4)),form=ascii(h.subarray(8));
    const wav=kind==='RIFF'&&form==='WAVE',aiff=kind==='FORM'&&form==='AIFF';
    if(!wav&&!aiff)throw Error('Only standard RIFF WAVE and FORM AIFF are supported');
    const size=new DataView(h.buffer).getUint32(4,wav)+8;
    if(size!==blob.size)throw Error('Container size mismatch; original left unchanged');
    let pos=12,tag=null,parts=[],audio=null,format=false,count=0;
    while(pos<size){
        if(++count>4096||pos+8>size)throw Error('Invalid container chunk table');
        const ch=await read(blob,pos,pos+8),id=ascii(ch.subarray(0,4)),n=new DataView(ch.buffer).getUint32(4,wav),end=pos+8+n+(n&1);
        if(end>size)throw Error('Truncated container chunk');
        if(id.toLowerCase()==='id3 '){
            if(tag||n<10||n>32*1024*1024+10)throw Error('Invalid or duplicate ID3 chunk');
            tag=await readId3(blob.slice(pos+8,pos+8+n));if(!tag.offset||tag.offset!==n)throw Error('Invalid embedded ID3 tag length');
        }else{
            if(id===(wav?'fmt ':'COMM')){if(format)throw Error('Duplicate format chunk');format=true;}
            if(id===(wav?'data':'SSND')){if(audio)throw Error('Duplicate audio chunk');audio={offset:pos+8,size:n};}
            // Existing legacy text may override a newly written ID3 tag in other players.
            // Refuse conflicting fields rather than silently deleting the original legacy metadata.
            if(aiff&&((id==='NAME'&&Object.hasOwn(fields,'title'))||(id==='AUTH'&&Object.hasOwn(fields,'artist'))||(id==='ANNO'&&Object.hasOwn(fields,'comment'))))throw Error('Conflicting legacy AIFF metadata; edit a copy with a compatible tag tool');
            if(wav&&id==='LIST'&&n>=4&&ascii(await read(blob,pos+8,pos+12))==='INFO'){
                const map={INAM:'title',IART:'artist',IPRD:'album',IGNR:'genre',ICRD:'year',ITRK:'track_num',ICMT:'comment'};
                let p=pos+12,limit=pos+8+n,entries=0;
                while(p<limit){if(++entries>4096||p+8>limit)throw Error('Invalid LIST INFO');const x=await read(blob,p,p+8),key=ascii(x.subarray(0,4)),length=new DataView(x.buffer).getUint32(4,true);p+=8+length+(length&1);if(p>limit)throw Error('Invalid LIST INFO');if(map[key]&&Object.hasOwn(fields,map[key]))throw Error('Conflicting legacy WAV metadata; edit a copy with a compatible tag tool');}
            }
            parts.push(blob.slice(pos,end));
        }
        pos=end;
    }
    if(!format||!audio)throw Error('Missing required audio chunks');
    const newTag=buildId3(tag||{version:3,frames:[]},fields,picture),chunk=new Uint8Array(8);
    chunk.set(new TextEncoder().encode(wav?'id3 ':'ID3 '));new DataView(chunk.buffer).setUint32(4,newTag.length,wav);
    const newSize=12+parts.reduce((n,p)=>n+p.size,0)+8+newTag.length+(newTag.length&1);
    if(newSize-8>0xffffffff)throw Error('Container exceeds 32-bit size limit');new DataView(h.buffer).setUint32(4,newSize-8,wav);
    return {blob:new Blob([h,...parts,chunk,newTag,new Uint8Array(newTag.length&1)],{type:wav?'audio/wav':'audio/aiff'})};
}
