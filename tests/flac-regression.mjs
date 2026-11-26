import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectFlac,FlacReader} from '../scripts/modules/flac-reader.js';
const data=readFileSync(process.argv[2]), reference=readFileSync(process.argv[3]);
const file=new Blob([data]);let peakRead=0;const tracked={size:file.size,slice(a,b){peakRead=Math.max(peakRead,b-a);return file.slice(a,b);}};
const f=await inspectFlac(tracked),r=new FlacReader(tracked,f,f.sampleRate);
assert.equal(reference.length,f.frames*f.channels*4);
for(let start=0;start<f.frames;start+=4001){const n=Math.min(4001,f.frames-start);const ch=await r.readFrames(start,n);for(let i=0;i<n;i++)for(let c=0;c<f.channels;c++)assert.equal(ch[c][i],reference.readFloatLE(((start+i)*f.channels+c)*4),`sample ${start+i} ch ${c}`);}
for(const start of [Math.floor(f.frames*.8),10,Math.floor(f.frames*.4)]){const n=Math.min(777,f.frames-start),a=await r.readFrames(start,n);for(let i=0;i<n;i++)for(let c=0;c<f.channels;c++)assert.equal(a[c][i],reference.readFloatLE(((start+i)*f.channels+c)*4));}
const newRate=f.sampleRate===48000?44100:48000;const rr=new FlacReader(tracked,f,newRate);const a=await rr.readFrames(100,1000),b=await rr.readFrames(100,400),c=await rr.readFrames(500,600);for(let ch=0;ch<f.channels;ch++)assert.deepEqual(a[ch],new Float32Array([...b[ch],...c[ch]]));
assert.ok(peakRead<=1048576);await assert.rejects(inspectFlac(file.slice(0,20)));
const broken=Buffer.from(data);broken[f.offset+10]^=1;const bad=new Blob([broken]);await assert.rejects(new FlacReader(bad,await inspectFlac(bad),f.sampleRate).readFrames(0,100));
console.log(`PASS FLAC ${f.bits}-bit ${f.channels}ch ${f.sampleRate}Hz: ${f.frames} exact sample frames, forward/backward seek, resampling continuity, CRC rejection (max read ${peakRead} bytes)`);
