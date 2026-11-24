// SPDX-License-Identifier: GPL-3.0-or-later
import { PcmRangeSource } from './pcm-range.js';
import { PcmReader } from './pcm-reader.js';
import { FlacReader } from './flac-reader.js';
let reader;
self.onmessage=async({data})=>{
    try{
        if(data.type==='init'){const file=data.file?.kind==='local-range'?new PcmRangeSource(data.file.url,data.file.size,data.file.prefix):data.file;reader=new (data.format.codec==='flac'?FlacReader:PcmReader)(file,data.format,data.rate);self.postMessage({id:data.id,frames:reader.outputFrames});return;}
        if(data.type!=='read'||!reader)throw Error('PCM worker not initialized');
        const channels=await reader.readFrames(data.first,data.count);self.postMessage({id:data.id,channels},channels.map(a=>a.buffer));
    }catch(e){self.postMessage({id:data.id,error:e.message});}
};
