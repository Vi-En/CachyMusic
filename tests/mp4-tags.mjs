import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {rewriteMp4} from '../scripts/modules/mp4-tag-writer.js';
import {parseAudioFileMetadata} from '../scripts/modules/tag-parser.js';
const [src,dst,pic]=process.argv.slice(2),source=new Blob([await readFile(src)]),bytes=new Uint8Array(await readFile(pic));
const result=await rewriteMp4(source,{title:'新曲',artist:'Test Artist',lyrics:'[00:01.00] A line',track_num:'3/12'},{bytes,mime:'image/png',width:192,height:192});
await writeFile(dst,new Uint8Array(await result.blob.arrayBuffer()));
const meta=await parseAudioFileMetadata(new File([result.blob],'test.m4a'));assert.equal(meta.title,'新曲');assert.equal(meta.lyrics,'[00:01.00] A line');assert.equal(meta.track,'3');assert(meta.cover);
await assert.rejects(rewriteMp4(source.slice(0,source.size-5),{}));
