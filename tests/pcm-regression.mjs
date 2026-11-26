import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectPcm,PcmReader} from '../scripts/modules/pcm-reader.js';
const file=new Blob([readFileSync(process.argv[2])]);const format=await inspectPcm(file);
assert.equal(format.channels,2);assert.equal(format.sampleRate,44100);assert.equal(format.bits,Number(process.argv[3]));
const reader=new PcmReader(file,format,44100);
const a=await reader.readFrames(10,1000),b=await reader.readFrames(10,300),c=await reader.readFrames(310,700);
for(let ch=0;ch<2;ch++)assert.deepEqual(a[ch],new Float32Array([...b[ch],...c[ch]]));
const reference=readFileSync(process.argv[4]);for(let i=0;i<1000;i++)for(let ch=0;ch<2;ch++)assert.equal(a[ch][i],reference.readFloatLE((i+10)*8+ch*4));
const r=new PcmReader(file,format,48000),whole=await r.readFrames(20,1000),part1=await r.readFrames(20,600),part2=await r.readFrames(620,400);
for(let ch=0;ch<2;ch++)assert.deepEqual(whole[ch],new Float32Array([...part1[ch],...part2[ch]]));
assert.ok(whole[0].every(Number.isFinite));assert.ok(r.outputFrames>format.frames);
await assert.rejects(r.readFrames(0,100000));await assert.rejects(inspectPcm(file.slice(0,25)));
// A million-frame logical source avoids reading the full file; track the requested ranges.
let maxSlice=0;const counted={size:file.size,slice(a,b){maxSlice=Math.max(maxSlice,b-a);return file.slice(a,b);}};const fmt2=await inspectPcm(counted);await new PcmReader(counted,fmt2,48000).readFrames(1000,9600);assert.ok(maxSlice<100000);
console.log(`PASS PCM ${format.bits}-bit, ${format.little?'LE':'BE'}: exact native samples, continuous resample chunks, bounded reads (${maxSlice} bytes), malformed-header rejection`);
