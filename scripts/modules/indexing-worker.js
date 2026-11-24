import { parseAudioFileMetadata } from './tag-parser.js';
import { optimizeTrackArtwork } from './artwork-cache.js';
self.onmessage=async({data})=>{
  const {id,file}=data;
  try{const meta=await optimizeTrackArtwork(await parseAudioFileMetadata(file));self.postMessage({id,meta});}
  catch{self.postMessage({id,error:'Metadata read failed'});}
};
