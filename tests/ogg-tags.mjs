import {readFile,writeFile} from 'node:fs/promises';
import {rewriteOgg,readOggHeaders} from '../scripts/modules/ogg-tag-writer.js';
import assert from 'node:assert/strict';
import {parseAudioFileMetadata} from '../scripts/modules/tag-parser.js';
const [src,dst,pic]=process.argv.slice(2),source=new Blob([await readFile(src)]),bytes=new Uint8Array(await readFile(pic));
const result=await rewriteOgg(source,{title:'新曲',artist:'Test Artist',lyrics:'[00:01.00] A line'},{bytes,mime:'image/png',width:192,height:192});
await writeFile(dst,new Uint8Array(await result.blob.arrayBuffer()));
assert.equal((await readOggHeaders(source)).codec,(await readOggHeaders(result.blob)).codec);
const truncated=new Blob([await source.slice(0,source.size-5).arrayBuffer()]);await assert.rejects(rewriteOgg(truncated,{}));

const longLyrics='A'.repeat(70000);
const grown=await rewriteOgg(result.blob,{lyrics:longLyrics});
const metadata=await parseAudioFileMetadata(new File([grown.blob],src.endsWith('.opus')?'test.opus':'test.ogg'));
assert.equal(metadata.lyrics,longLyrics);assert.equal(metadata.title,'新曲');assert(metadata.cover);
