import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const scope='https://fixture.invalid/app/';let listener,requests=[],responses=[],writes=0;
let blocked=null;
const self={location:new URL(scope),registration:{scope},addEventListener(name,fn){if(name==='fetch')listener=fn;}};
const caches={async open(){return {async match(req){assert(req.url.endsWith('/resources/images/default.svg'));return new Response('default',{headers:{'Content-Type':'image/svg+xml'}})},async put(){writes++}}}};
const network=async (url,opts)=>{requests.push([url,opts]);if(blocked)return blocked;assert(responses.length,'unexpected fetch');return responses.shift()};
vm.runInNewContext(code,{self,caches,URL,Request,Response,Set,encodeURIComponent,AbortController,Date,fetch:network,setTimeout:(fn,ms)=>setTimeout(fn,ms===500?0:ms),clearTimeout});
function trigger(path,destination='image',headers=new Headers(),method='GET') {let handled;listener({request:{url:new URL(path,scope).href,destination,headers,method},respondWith:p=>handled=p});return handled}
const pending=(status=202)=>new Response('',{status,headers:{'Retry-After':'1'}});
responses=[pending(),pending(503),new Response('artwork')];assert.equal(await (await trigger('php/api/cover.php?tid=1&thumb=1')).text(),'artwork');assert.equal(requests.length,3);for(const [url,opts] of requests){assert(new URL(url).searchParams.get('defer')==='1');assert(opts.cache==='no-store'&&opts.redirect==='error'&&opts.credentials==='same-origin')}
responses=[new Response('denied',{status:403})];assert.equal((await trigger('php/api/cover.php?tid=1')).status,403);
responses=[new Response('storage failure',{status:503})];assert.equal((await trigger('php/api/cover.php?tid=1')).status,503);
for(const path of ['php/api/stream.php?tid=1','/other/php/api/cover.php?tid=1','https://foreign.invalid/app/php/api/cover.php?tid=1'])assert.equal(trigger(path),undefined);
assert.equal(trigger('php/api/cover.php?tid=1','',new Headers()),undefined);assert.equal(trigger('php/api/cover.php?tid=1','image',new Headers({Range:'bytes=0-1'})),undefined);assert.equal(trigger('php/api/cover.php?tid=1','image',new Headers(),'POST'),undefined);
let resolve;blocked=new Promise(r=>resolve=r);const active=Array.from({length:24},(_,i)=>trigger('php/api/cover.php?tid='+i));assert.equal(await (await trigger('php/api/cover.php?tid=99')).text(),'default');resolve(new Response('ok'));await Promise.all(active);blocked=null;responses=[new Response('recovered')];assert.equal(await (await trigger('php/api/cover.php?tid=1')).text(),'recovered');assert.equal(writes,0);
console.log('PASS deferred artwork SW polling, retry scope, bounded concurrency, fail-closed status, no private CacheStorage writes');
