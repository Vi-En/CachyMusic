import assert from 'node:assert/strict';
import {requestServerScan,readServerDirectory} from '../scripts/modules/server-scan.js';
const id='a'.repeat(32),reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
function fixture(handler){const calls=[];return {calls,fetcher:async(url,options={})=>{const body=options.body?JSON.parse(options.body):null;calls.push({url,body});return handler(url,body,options,calls);}};}
const opts=f=>({fetcher:f.fetcher,makeId:()=>id,pollMs:1});
{
 const f=fixture((url,body)=>body?reply({id,phase:'queued'},202):url.includes('result=1')?reply({success:true,tracks:[]}):url.includes('id=')?reply({id,phase:'done'}):reply({enabled:true,ready:true}));
 const phases=[];assert.deepEqual(await requestServerScan({...opts(f),onPhase:p=>phases.push(p)}),{success:true,tracks:[]});assert.deepEqual(phases,['queued','done']);assert(!f.calls.some(c=>c.body?.action==='cancel'));
}
{
 let submissions=0;const f=fixture((url,body)=>{if(body?.action==='start'){if(++submissions===1)throw Error('lost response');return reply({id,phase:'done'});}return url.includes('result=1')?reply({success:true}):reply({enabled:true,ready:true});});
 assert((await requestServerScan(opts(f))).success);assert.equal(submissions,2);assert.equal(f.calls.filter(c=>c.body?.action==='start').every(c=>c.body.id===id),true);
}
{
 const f=fixture((url,body)=>body?reply({success:false,message:'busy'},409):reply({enabled:true,ready:true}));await assert.rejects(requestServerScan(opts(f)),/busy/);assert(!f.calls.some(c=>c.url.endsWith('/scan.php')));
}
{
 const f=fixture((url,body)=>url.endsWith('/scan.php')?reply({success:true}):reply({enabled:false,ready:false}));assert((await requestServerScan(opts(f))).success);assert.equal(f.calls.filter(c=>c.url.endsWith('/scan.php')).length,1);
}
{
 const f=fixture((url,body)=>body?reply({id,phase:'running'}):url.includes('id=')?reply({id,phase:'uncertain'}):reply({enabled:true,ready:true}));await assert.rejects(requestServerScan(opts(f)),/uncertain/);
}
{
 const owner=new AbortController();const f=fixture((url,body)=>body?.action==='cancel'?reply({id,phase:'cancelling'}):body?reply({id,phase:'running'}):reply({enabled:true,ready:true}));
 await assert.rejects(requestServerScan({...opts(f),signal:owner.signal,onPhase:()=>owner.abort()}),{name:'AbortError'});assert(f.calls.some(c=>c.body?.action==='cancel'&&c.body.id===id));
}
{
 // Abort before the submission response; cancellation must be attempted again
 // after that response, not silently leave a new job running.
 const owner=new AbortController();let resolveStart;const f=fixture((url,body)=>body?.action==='cancel'?reply({message:'not started yet'},404):body?new Promise(r=>{resolveStart=r;}):reply({enabled:true,ready:true}));
 const p=requestServerScan({...opts(f),signal:owner.signal});while(!resolveStart)await new Promise(r=>setTimeout(r,1));owner.abort();resolveStart(reply({id,phase:'queued'},202));await assert.rejects(p,{name:'AbortError'});assert(f.calls.filter(c=>c.body?.action==='cancel').length>=2);
}
{
 const f=fixture(()=>reply({directory:'/music'}));assert.equal(await readServerDirectory(f.fetcher),'/music');assert.equal(f.calls[0].url,'php/api/scan_jobs.php?directory=1');
}
console.log('PASS managed polling, same-ID submission retry, busy/error without synchronous fallback, unmanaged compatibility, uncertainty, cancellation before/after submission and read-only directory lookup');
const {requestServerMetadata}=await import('../scripts/modules/server-scan.js');
{
 const edit={tid:1,title:'Test',write_file:true};let submissions=0;
 const f=fixture((url,body)=>{if(body?.action==='start'){assert(url.endsWith('?metadata=1'));assert.deepEqual(body.edit,edit);if(++submissions===1)throw Error('lost response');return reply({id,phase:'done'});}return url.includes('result=1')?reply({success:true,tagWriteSuccess:true}):reply({enabled:true,ready:true});});
 assert.equal((await requestServerMetadata(edit,opts(f))).tagWriteSuccess,true);assert.equal(submissions,2);assert(f.calls.filter(c=>c.body?.action==='start').every(c=>c.body.id===id));
}
{
 const f=fixture((url,body)=>body?reply({success:false,message:'busy'},409):reply({enabled:true,ready:true}));await assert.rejects(requestServerMetadata({tid:1},opts(f)),/busy/);assert(!f.calls.some(c=>c.url.endsWith('/metadata.php')));
}
{
 const f=fixture((url,body)=>url.endsWith('/metadata.php')?reply({success:true}):reply({enabled:false,ready:false}));assert((await requestServerMetadata({tid:1},opts(f))).success);assert.deepEqual(f.calls.at(-1).body,{tid:1});
}
console.log('PASS managed edit polling, exact retry identity, busy refusal and explicit unmanaged route');
