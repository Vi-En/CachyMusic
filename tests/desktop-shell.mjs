import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../packaging/desktop/main.cjs',import.meta.url),'utf8');
async function fixture(mode){
    const children=[],errors=[],launches=[];let quit=0,loaded,finish,preflights=0,probes=0;const windows=mode.startsWith('windows-');
    const ready=new Promise(r=>finish=r);
    const app=new EventEmitter();Object.assign(app,{requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),getPath:()=>'/fixture-data',quit(){quit++;finish();}});
    const ses={setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onBeforeRequest(){},onBeforeSendHeaders(){}}};
    class BrowserWindow{constructor(){this.webContents={setWindowOpenHandler(){},on(){}};}async loadURL(u){loaded=u;finish();}}
    const modules={electron:{app,BrowserWindow,session:{fromPartition:()=>ses},dialog:{showErrorBox:(...v)=>errors.push(v)}},'node:child_process':{execFileSync(exe,args,opt){if(exe.endsWith('/python/python.exe')){probes++;assert(args[0].endsWith('/bin/cachymusic-process.py'));assert.equal(args[1],'--probe');assert.equal(opt.timeout,5000);assert.equal(opt.maxBuffer,4096);if(mode==='windows-bad')throw Error('bad probe');return mode==='windows-invalid'?'wrong':'CMP1\n';}preflights++;assert(exe.endsWith(windows?'/php/php.exe':'/php/php'));assert(args[1].includes('Storage::preflightLibrary'));assert.equal(opt.timeout,15000);if(mode==='invalid-profile')throw Error('invalid');},spawn(exe,args,opt){const p=new EventEmitter();p.exitCode=null;p.kill=()=>{p.exitCode=0;p.emit('exit',0);};children.push(p);launches.push({exe,args,env:{...opt.env}});return p;}},'node:crypto':{randomBytes:n=>Buffer.alloc(n,1)},'node:fs':{existsSync:f=>!((mode==='core'||windows)&&(f.includes('/node/')||f.includes('node_modules')))&&!(mode==='windows-missing'&&f.includes('/python/')),mkdirSync(){}},'node:path':path,'node:net':{createServer(){const s=new EventEmitter();s.listen=(port,host,fn)=>queueMicrotask(()=>mode==='occupied'&&port===18479?s.emit('error',Error('occupied')):fn());s.close=fn=>fn();return s;}},'node:http':{get(url,opts,cb){const req=new EventEmitter();req.destroy=()=>req.emit('error',Error('timeout'));queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.resume=()=>queueMicrotask(()=>res.emit('end'));cb(res);});return req;}}};
    vm.runInNewContext(source,{require:n=>modules[n],__dirname:'/fixture/app',process:{platform:windows?'win32':'linux',resourcesPath:'/fixture',env:{}},setTimeout,Buffer,URL,console});
    let timer;try{await Promise.race([ready,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('startup stalled')),1000))]);}finally{clearTimeout(timer);}
    assert.equal(preflights,1);if(mode==='invalid-profile'){assert.equal(quit,1);assert.equal(launches.length,0);assert.equal(errors.length,1);return;}
    assert.equal(loaded,'http://127.0.0.1:18478');assert.equal(quit,0);assert.equal(errors.length,0);
    const phpIndex=launches.findIndex(x=>x.exe.endsWith(windows?'/php/php.exe':'/php/php')&&x.args[0]==='-S');assert(phpIndex>=0);
    const php=launches[phpIndex];if(windows){assert.equal(php.env.CACHYMUSIC_WINDOWS_REQUIRE_SUPERVISOR,'1');assert.match(php.env.CACHYMUSIC_LOOKUP_KEY,/^[a-f0-9]{64}$/);assert.equal(probes,mode==='windows-missing'?0:1);if(mode==='windows-valid'){assert(php.env.CACHYMUSIC_WINDOWS_PYTHON.endsWith('/python/python.exe'));assert(php.env.CACHYMUSIC_WINDOWS_PROCESS_HELPER.endsWith('/bin/cachymusic-process.py'));}else{assert.equal(php.env.CACHYMUSIC_WINDOWS_PYTHON,undefined);assert.equal(php.env.CACHYMUSIC_WINDOWS_PROCESS_HELPER,undefined);}}assert.equal(php.env.CACHYMUSIC_SOULSEEK_DISABLED,mode==='full'?'0':'1');
    const workerIndex=launches.findIndex(x=>x.exe.endsWith(windows?'/php/php.exe':'/php/php')&&x.args[0].endsWith('/php/scan_worker.php'));assert(workerIndex>=0&&workerIndex!==phpIndex);
    assert.match(php.env.CACHYMUSIC_SCAN_SESSION,/^[a-f0-9]{48}$/);assert.equal(launches[workerIndex].env.CACHYMUSIC_SCAN_SESSION,php.env.CACHYMUSIC_SCAN_SESSION);
    if(mode==='full'){children[0].emit('exit',1);assert.equal(quit,0,'optional peer failure terminated playback');}
    else assert.equal(launches.length,2);
    children[workerIndex].emit('exit',1);assert.equal(quit,0,'optional scan failure terminated playback');
    children[phpIndex].emit('exit',1);assert.equal(quit,1,'required PHP failure did not quit');
}
for(const mode of ['core','occupied','full','invalid-profile','windows-valid','windows-bad','windows-invalid','windows-missing'])await fixture(mode);
console.log('PASS portable core startup without peer dependency, occupied peer port, optional peer and scan worker exit isolation, shared scan session, required service failure and Windows supervisor probe/deny (shell stubs)');
