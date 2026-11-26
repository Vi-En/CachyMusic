import assert from 'node:assert/strict';
import {AndroidDirectPcmReader,openAndroidDirectPcm} from '../scripts/modules/android-pcm-reader.js';
import {readBoundedAudio} from '../scripts/modules/decode-budget.js';
const format={sessionId:'fixture',sampleRate:48000,channels:2,isFloat:true,frames:48000};
let read=false, cancelled=false;
const response=new Response(new ReadableStream({pull(c){read=true;c.enqueue(new Uint8Array(4096));},cancel(){cancelled=true;return new Promise(()=>{});}}));
// Cancel must not delay reporting the oversized body. Pull may prefetch one chunk.
let deadline;
try{await Promise.race([assert.rejects(readBoundedAudio(response,16),/memory limit/),new Promise((_,reject)=>deadline=setTimeout(()=>reject(Error('cleanup blocked error reporting')),500))]);}finally{clearTimeout(deadline);}
assert(cancelled);
const oversizedResponse={ok:true,status:200,headers:new Headers({'Content-Length':'9000000'}),body:new ReadableStream({cancel(){cancelled=true;}}),arrayBuffer(){throw Error('full packet allocation must not be requested');}};
const reader=new AndroidDirectPcmReader(format,48000,async()=>oversizedResponse);
await assert.rejects(reader.fetchChunk(-1,256),/memory limit/);
globalThis.location={href:'https://appassets.androidplatform.net/index.html'};
const source='/android-media?uri=content%3A%2F%2Fmedia%2Ffixture';
const descriptor={ok:true,sessionId:'fixture',sampleRate:48000,channels:2,durationUs:1e30,isFloat:true};let closes=0;
globalThis.fetch=async url=>{if(url.includes('/android-pcm-close')){closes++;return new Response('');}return new Response(JSON.stringify(descriptor));};
await assert.rejects(openAndroidDirectPcm(source),/Unknown track duration/);assert.equal(closes,1);
await assert.rejects(openAndroidDirectPcm(source+'&uri=content%3A%2F%2Fmedia%2Fother'),/Invalid Android media/);
console.log('PASS bounded packet allocation, non-blocking rejected-body cancellation, unsafe frame-count and duplicate URI rejection');
