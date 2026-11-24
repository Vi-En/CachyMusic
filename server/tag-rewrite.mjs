import {rewriteMp4,mp4TopLevel} from '../scripts/modules/mp4-tag-writer.js';
// SPDX-License-Identifier: GPL-3.0-or-later
// Local desktop helper; no network access, codecs, or shell. Invoked only by indexed metadata API.
import {openAsBlob} from 'node:fs';
import {createHash} from 'node:crypto';
import {readOggHeaders,readOggPage,oggRewritePages} from '../scripts/modules/ogg-tag-writer.js';
import {constants} from 'node:fs';
import {open as openFile} from 'node:fs/promises';
async function fingerprint(blob,mp4){
    if(mp4){const hash=createHash('sha256');for(const a of await mp4TopLevel(blob)){if(a.t!=='mdat')continue;hash.update(`${a.p}:${a.n}:`);for await(const part of blob.slice(a.p,a.end).stream())hash.update(part);}return hash.digest('hex');}
    const h=await readOggHeaders(blob,{strictBoundary:true}),hash=createHash('sha256');
    for(let i=0;i<h.packets.length;i++)if(i!==1)hash.update(h.packets[i]);
    let p=h.offset;while(p<blob.size){const pg=await readOggPage(blob,p);p=pg.next;const normalized=pg.page.slice();normalized.fill(0,18,26);hash.update(normalized);}return hash.digest('hex');
}
async function main(){
    const [src,dst]=process.argv.slice(2);if(!src||!dst||src===dst)throw Error('Invalid paths');
    const chunks=[];let n=0;for await(const chunk of process.stdin){n+=chunk.length;if(n>15*1024*1024)throw Error('Input exceeds budget');chunks.push(chunk);}
    const {fields,picture}=JSON.parse(Buffer.concat(chunks));if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('Invalid fields');
    const cover=picture?{...picture,bytes:Buffer.from(picture.bytes,'base64')}:null;
    const mp4=/\.(m4a|alac)$/i.test(src),source=await openAsBlob(src),before=await fingerprint(source,mp4);
    const parts=mp4?(await rewriteMp4(source,fields,cover)).blob.stream():oggRewritePages(source,fields,cover);
    const out=await openFile(dst,constants.O_WRONLY|constants.O_TRUNC|(constants.O_NOFOLLOW||0));
    try{for await(const page of parts){let p=0;while(p<page.length){const {bytesWritten}=await out.write(page,p,page.length-p);if(!bytesWritten)throw Error('Short write');p+=bytesWritten;}}await out.sync();}finally{await out.close();}
    const result=await openAsBlob(dst);if(before!==await fingerprint(result,mp4))throw Error('Audio page fingerprint mismatch');
}
try{await main();}catch(e){console.error(String(e.message).slice(0,300));process.exitCode=1;}
