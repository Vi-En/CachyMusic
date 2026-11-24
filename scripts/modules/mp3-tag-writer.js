// Conservative ID3v2.3/2.4 writer. Reuses unchanged frames and copies the audio tail verbatim.
// Reject unusual tags rather than silently corrupting them. Only creates a new Blob.
const ascii = b=>String.fromCharCode(...b);
const encoder=new TextEncoder();
const pack=(parts)=>{let n=parts.reduce((a,b)=>a+b.length,0),r=new Uint8Array(n),p=0;for(const b of parts){r.set(b,p);p+=b.length;}return r;};
const syncEncode=n=>{if(n>0x0fffffff)throw Error('ID3 tag too large');return Uint8Array.of((n>>>21)&127,(n>>>14)&127,(n>>>7)&127,n&127);};
function syncDecode(b){if(b.length!==4||b.some(v=>v&128))throw Error('Invalid synchsafe size');return b.reduce((n,v)=>(n<<7)|v,0);}
const int32=n=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n);return b;};
const utf16=s=>{let b=new Uint8Array(s.length*2+2);b[0]=255;b[1]=254;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);b[i*2+2]=c&255;b[i*2+3]=c>>>8;}return b;};
const fieldIds={title:'TIT2',artist:'TPE1',album:'TALB',genre:'TCON',track_num:'TRCK'};
export async function readId3(blob){
  if(!(blob instanceof Blob))throw Error('Invalid MP3');
  const head=new Uint8Array(await blob.slice(0,10).arrayBuffer());let version=4,offset=0,frames=[];
  if(ascii(head.slice(0,3))==='ID3') {
    version=head[3];if(![3,4].includes(version)||head[4]!==0||head[5]!==0)throw Error('Unsupported ID3 version, extended header or flags; original left unchanged');
    const size=syncDecode(head.slice(6,10));offset=10+size;if(size>32*1024*1024||offset>blob.size)throw Error('Invalid ID3 size');
    const tag=new Uint8Array(await blob.slice(10,offset).arrayBuffer());let p=0;
    while(p<tag.length&&tag[p]!==0){if(frames.length>=100000||p+10>tag.length)throw Error('Truncated ID3 frame');const id=ascii(tag.slice(p,p+4));if(!/^[A-Z0-9]{4}$/.test(id))throw Error('Invalid ID3 frame ID');
      const n=version===4?syncDecode(tag.slice(p+4,p+8)):new DataView(tag.buffer).getUint32(p+4);if(!n||n>tag.length-p-10)throw Error('Invalid ID3 frame size');
      if(tag[p+8]||tag[p+9])throw Error('Unsupported ID3 frame flags');frames.push({id,body:tag.slice(p+10,p+10+n),raw:tag.slice(p,p+10+n)});p+=10+n;
    }
    if(tag.slice(p).some(v=>v!==0))throw Error('Invalid ID3 padding');
  }
  return {version,offset,frames};
}
export function buildId3({version,frames},fields,picture=null){
  const encodeText=s=>version===4?encoder.encode(s):utf16(s);const encoding=version===4?3:1;
  const frame=(id,body)=>pack([encoder.encode(id),version===4?syncEncode(body.length):int32(body.length),Uint8Array.of(0,0),body]);
  const textBody=s=>pack([Uint8Array.of(encoding),encodeText(String(s))]);
  const changed=new Set(Object.keys(fieldIds).filter(k=>Object.hasOwn(fields,k)).map(k=>fieldIds[k]));
  if(Object.hasOwn(fields,'year')){changed.add('TYER');changed.add('TDRC');}
  if(Object.hasOwn(fields,'comment'))changed.add('COMM');if(Object.hasOwn(fields,'lyrics'))changed.add('USLT');
  const isFront=f=>{if(f.id!=='APIC'||f.body.length<4)return false;const end=f.body.indexOf(0,1);return end>=1&&f.body[end+1]===3;};
  const retained=frames.filter(f=>!changed.has(f.id)&&!(picture&&isFront(f))).map(f=>f.raw);
  for(const [key,id] of Object.entries(fieldIds))if(fields[key]!=null&&String(fields[key])!=='')retained.push(frame(id,textBody(fields[key])));
  if(fields.year!=null&&String(fields.year)!=='')retained.push(frame(version===3?'TYER':'TDRC',textBody(fields.year)));
  for(const [key,id] of [['comment','COMM'],['lyrics','USLT']])if(fields[key]!=null&&String(fields[key])!==''){
    const description=version===4?Uint8Array.of(0):Uint8Array.of(255,254,0,0);
    retained.push(frame(id,pack([Uint8Array.of(encoding),encoder.encode('eng'),description,encodeText(String(fields[key]))])));
  }
  if(picture){if(!['image/png','image/jpeg'].includes(picture.mime)||picture.bytes.length>10*1024*1024)throw Error('Unsupported cover');retained.push(frame('APIC',pack([Uint8Array.of(0),encoder.encode(picture.mime),Uint8Array.of(0,3,0),picture.bytes])));}
  const tag=pack(retained);if(tag.length>32*1024*1024)throw Error('ID3 metadata too large');const header=pack([encoder.encode('ID3'),Uint8Array.of(version,0,0),syncEncode(tag.length)]);
  return pack([header,tag]);
}
export async function rewriteMp3(blob,fields,picture=null){
  if(!(blob instanceof Blob)||blob.size<4)throw Error('Invalid MP3');
  const parsed=await readId3(blob),offset=parsed.offset;
  const audio=new Uint8Array(await blob.slice(offset,offset+4).arrayBuffer());if(audio.length<4||audio[0]!==255||(audio[1]&224)!==224||((audio[1]>>1)&3)!==1)throw Error('Expected MPEG Layer III audio after tags');
  const tag=buildId3(parsed,fields,picture);
  return {blob:new Blob([tag,blob.slice(offset)],{type:'audio/mpeg'}),originalAudioOffset:offset,newAudioOffset:tag.length};
}
