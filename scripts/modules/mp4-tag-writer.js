// SPDX-License-Identifier: GPL-3.0-or-later
// Conservative, nonfragmented audio-only ISO BMFF/iTunes metadata writer.
// Keep mdat and original chunk offsets fixed. Move the moov to EOF if it was not
// there already, substituting a same-size free atom at the original location.
const LIMIT=32*1024*1024, enc=new TextEncoder();
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const type=b=>String.fromCharCode(...b);
const read=async(blob,p,n)=>new Uint8Array(await blob.slice(p,p+n).arrayBuffer());
const u32=n=>{const b=new Uint8Array(4);view(b).setUint32(0,n);return b;};
const join=parts=>{const n=parts.reduce((s,x)=>s+x.length,0);if(n>LIMIT)throw Error('MP4 metadata limit exceeded');const b=new Uint8Array(n);let p=0;for(const x of parts){b.set(x,p);p+=x.length;}return b;};
const atom=(t,...parts)=>{const body=join(parts),name=Uint8Array.from(t,c=>c.charCodeAt(0));return join([u32(body.length+8),name,body]);};
function header(h,p,end){if(h.length<8)throw Error('Truncated MP4 header');const v=view(h),t=type(h.subarray(4,8));let n=v.getUint32(0),head=8;if(n===1){if(h.length<16)throw Error('Truncated MP4 extended size');const big=v.getBigUint64(8);if(big>BigInt(Number.MAX_SAFE_INTEGER))throw Error('MP4 atom too large');n=Number(big);head=16;}else if(!n)throw Error('Unbounded MP4 atom is unsupported');if(n<head||p+n>end)throw Error('Invalid MP4 atom size');return {t,p,n,head,end:p+n};}
export async function mp4TopLevel(blob){let p=0;const atoms=[];while(p<blob.size){if(atoms.length>=4096)throw Error('Too many MP4 atoms');const a=header(await read(blob,p,16),p,blob.size);atoms.push(a);p=a.end;}return atoms;}
function children(b,start=0,end=b.length){const list=[];let p=start;while(p<end){if(list.length>=100000)throw Error('Too many child atoms');const a=header(b.subarray(p,Math.min(p+16,end)),p,end);list.push({...a,raw:b.subarray(p,a.end),body:b.subarray(p+a.head,a.end)});p=a.end;}return list;}
function one(list,t,required=true){const xs=list.filter(a=>a.t===t);if(xs.length>1||(!xs.length&&required))throw Error(`Missing or duplicate MP4 ${t}`);return xs[0];}
export async function readMp4Movie(blob){const top=await mp4TopLevel(blob),moov=one(top,'moov');if(moov.n>LIMIT)throw Error('MP4 metadata exceeds limit');return {top,moov,bytes:await read(blob,moov.p,moov.n)};}
const map={title:'\xA9nam',artist:'\xA9ART',album:'\xA9alb',genre:'\xA9gen',year:'\xA9day',comment:'\xA9cmt',lyrics:'\xA9lyr',track_num:'trkn'};
const data=(kind,bytes)=>atom('data',u32(kind),u32(0),bytes);
function rewriteIlst(list,fields,picture){
    const changed=new Set(Object.keys(map).filter(k=>Object.hasOwn(fields,k)).map(k=>map[k]));if(changed.has('\xA9gen'))changed.add('gnre');if(picture)changed.add('covr');
    const old=children(list),result=old.filter(x=>!changed.has(x.t)).map(x=>x.raw);
    for(const [k,t] of Object.entries(map)){const value=fields[k];if(value==null||String(value)==='')continue;
        if(k==='track_num'){const m=/^(\d{1,5})(?:\/(\d{1,5}))?$/.exec(String(value));if(!m||Number(m[1])>65535||Number(m[2]||0)>65535)throw Error('Invalid track number');const b=new Uint8Array(8);view(b).setUint16(2,Number(m[1]));view(b).setUint16(4,Number(m[2]||0));result.push(atom(t,data(0,b)));}
        else result.push(atom(t,data(1,enc.encode(String(value)))));
    }
    if(picture){if(!['image/png','image/jpeg'].includes(picture.mime)||picture.bytes.length>10*1024*1024)throw Error('Unsupported MP4 artwork');result.push(atom('covr',data(picture.mime==='image/png'?14:13,picture.bytes)));}
    return atom('ilst',...result);
}
function replace(list,t,replacement){const old=one(list,t,false);return old?list.map(x=>x===old?replacement:x.raw):[...list.map(x=>x.raw),replacement];}
function rewriteUdta(old,fields,picture){
    const list=old?children(old.body):[],meta=one(list,'meta',false);let m=[];
    if(meta){if(meta.body.length<4||view(meta.body).getUint32(0)!==0)throw Error('Unsupported MP4 meta flags');m=children(meta.body,4);const h=one(m,'hdlr');if(h.body.length<12||type(h.body.subarray(8,12))!=='mdir'||one(m,'keys',false))throw Error('Unsupported non-iTunes MP4 metadata');}
    else{const h=join([u32(0),u32(0),enc.encode('mdir'),enc.encode('appl'),new Uint8Array(9)]);m=children(atom('hdlr',h));}
    const ilst=one(m,'ilst',false),newMeta=atom('meta',u32(0),...replace(m,'ilst',rewriteIlst(ilst?.body||new Uint8Array(),fields,picture)));
    return atom('udta',...replace(list,'meta',newMeta));
}
function validateTrack(trak,mdats){
    const mdia=one(children(trak.body),'mdia'),ml=children(mdia.body),hdlr=one(ml,'hdlr');if(hdlr.body.length<12||type(hdlr.body.subarray(8,12))!=='soun')throw Error('Only audio-only M4A is supported');
    const minf=children(one(ml,'minf').body),dref=one(children(one(minf,'dinf').body),'dref');if(dref.body.length<8||view(dref.body).getUint32(4)!==1)throw Error('Unsupported data references');const refs=children(dref.body,8);if(refs.length!==1||refs[0].t!=='url '||refs[0].body.length!==4||view(refs[0].body).getUint32(0)!==1)throw Error('External MP4 media references denied');
    const stbl=children(one(minf,'stbl').body),stsd=one(stbl,'stsd');if(stsd.body.length<8||view(stsd.body).getUint32(4)!==1)throw Error('Unsupported audio sample descriptions');const desc=children(stsd.body,8);if(desc.length!==1||!['mp4a','alac'].includes(desc[0].t)||desc[0].body.length<8||view(desc[0].body).getUint16(6)!==1)throw Error('Unsupported or external MP4 audio description');
    const offsets=stbl.filter(a=>['stco','co64'].includes(a.t));if(offsets.length!==1||offsets[0].body.length<8)throw Error('Invalid MP4 chunk offsets');const a=offsets[0],v=view(a.body),count=v.getUint32(4),step=a.t==='stco'?4:8;if(count<1||8+count*step!==a.body.length)throw Error('Invalid MP4 chunk offset table');
    for(let i=0;i<count;i++){const p=8+i*step,n=step===4?v.getUint32(p):Number(v.getBigUint64(p));if(!Number.isSafeInteger(n)||!mdats.some(x=>n>=x.p+x.head&&n<x.end))throw Error('MP4 chunk points outside media');}
    if(stbl.some(x=>['saio','saiz','senc','subs'].includes(x.t)))throw Error('Unsupported auxiliary sample layout');
}
export async function rewriteMp4(blob,fields,picture=null){
    const {top,moov,bytes}=await readMp4Movie(blob);if(top.some(x=>!['ftyp','free','skip','wide','mdat','moov'].includes(x.t))||top[0]?.t!=='ftyp')throw Error('Unsupported fragmented or extended MP4 layout');
    const mdats=top.filter(x=>x.t==='mdat');if(!mdats.length)throw Error('No MP4 media data');
    const root=children(bytes)[0],list=children(root.body);if(list.some(x=>!['mvhd','trak','udta','free','iods'].includes(x.t)))throw Error('Unsupported MP4 movie layout');validateTrack(one(list,'trak'),mdats);
    const newMoov=atom('moov',...replace(list,'udta',rewriteUdta(one(list,'udta',false),fields,picture)));
    const parts=[blob.slice(0,moov.p)];if(moov.end<blob.size){const free=new Uint8Array(moov.n);view(free).setUint32(0,moov.n);free.set(enc.encode('free'),4);parts.push(free,blob.slice(moov.end));}parts.push(newMoov);
    return {blob:new Blob(parts,{type:'audio/mp4'})};
}
