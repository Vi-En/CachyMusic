// Packaged desktop shell. No external browser or runtime installer is launched.
const {app,BrowserWindow,session,dialog}=require('electron');
const {spawn,execFileSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs');const path=require('node:path');const net=require('node:net');const http=require('node:http');
const player=path.join(__dirname,'player');
const runtime=path.join(process.resourcesPath,'cachymusic-runtime');
let children=[],windowRef,stopping=false;
const suffix=process.platform==='win32'?'.exe':'';
const php=path.join(runtime,'php','php'+suffix),node=path.join(runtime,'node','node'+suffix);
const port=18478,slskPort=18479,origin=`http://127.0.0.1:${port}`;
const token=randomBytes(32).toString('hex'),slskToken=randomBytes(32).toString('hex');
function available(port){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
function launch(exe,args,env,required=true){const p=spawn(exe,args,{cwd:player,env,stdio:'ignore',windowsHide:true});children.push(p);p.on('error',()=>{if(required&&!stopping){dialog.showErrorBox('CachyMusic','A bundled service failed to start. Reinstall a verified package.');app.quit();}});p.on('exit',()=>{if(required&&!stopping){dialog.showErrorBox('CachyMusic','A bundled service stopped unexpectedly.');app.quit();}});return p;}
function check(url,headers){return new Promise((resolve,reject)=>{const req=http.get(url,{headers,timeout:1000},r=>{r.resume();r.on('end',()=>resolve(r.statusCode===200));});req.on('timeout',()=>req.destroy());req.on('error',reject);});}
async function waitFor(url,headers,attempts=40){for(let i=0;i<attempts;i++){try{if(await check(url,headers))return;}catch(_){}await new Promise(r=>setTimeout(r,150));}throw Error('Bundled service did not become ready.');}
function allowedRemote(u){return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&((u.hostname==='musicbrainz.org'&&u.pathname.startsWith('/ws/2/recording'))||(u.hostname==='lrclib.net'&&u.pathname==='/api/search')||(u.hostname==='coverartarchive.org'&&u.pathname.startsWith('/release/'))||((u.hostname==='archive.org'||u.hostname.endsWith('.archive.org'))&&u.pathname.includes('/items/')));}
async function init(){
  for(const f of [php])if(!fs.existsSync(f))throw Error('Missing bundled runtime: '+path.basename(f));
  await available(port);
  const data=path.join(app.getPath('userData'),'data'),cache=path.join(app.getPath('userData'),'cache');fs.mkdirSync(data,{recursive:true,mode:0o700});fs.mkdirSync(cache,{recursive:true,mode:0o700});
  const env={...process.env,CACHYMUSIC_PACKAGED:'1',CACHYMUSIC_MANAGED_SERVICES:'1',CACHYMUSIC_SOULSEEK_DISABLED:'1',CACHYMUSIC_LOCAL_TOKEN:token,CACHYMUSIC_SOULSEEK_TOKEN:slskToken,CACHYMUSIC_SOULSEEK_PORT:String(slskPort),CACHYMUSIC_DATA_DIR:data,CACHYMUSIC_CACHE_DIR:cache,PATH:[path.join(runtime,'tools'),path.dirname(php),path.dirname(node)].join(path.delimiter)};
  delete env.CACHYMUSIC_WINDOWS_PYTHON; delete env.CACHYMUSIC_WINDOWS_PROCESS_HELPER; delete env.CACHYMUSIC_WINDOWS_REQUIRE_SUPERVISOR; delete env.CACHYMUSIC_LOOKUP_KEY;
  if(process.platform==='win32'){
    env.CACHYMUSIC_WINDOWS_REQUIRE_SUPERVISOR='1';
    const python=path.join(runtime,'python','python.exe'),helper=path.join(player,'bin','cachymusic-process.py');
    if(fs.existsSync(python)&&fs.existsSync(helper)){
      try{const probe=execFileSync(python,[helper,'--probe'],{cwd:player,env,windowsHide:true,timeout:5000,encoding:'utf8',maxBuffer:4096});
        if(probe.trim()==='CMP1'){env.CACHYMUSIC_WINDOWS_PYTHON=python;env.CACHYMUSIC_WINDOWS_PROCESS_HELPER=helper;}
      }catch(_){} // fail closed for external tools, keep core playback available
    }
  }
  delete env.PHP_CLI_SERVER_WORKERS; // portable process ownership; concurrency remains a future native-core concern
  try{execFileSync(php,['-r','require "php/storage.php"; exit(Storage::preflightLibrary()?0:1);'],{cwd:player,env,stdio:'ignore',windowsHide:true,timeout:15000});}catch(_){throw Error('Existing library.json is unsafe, invalid or exceeds its configured limit. Back up the profile and inspect it before starting.');}
  // An optional peer service must not prevent core audio startup or tear down
  // an active playback session when its process exits.
  if([node,path.join(player,'server','soulseek-service.js'),path.join(player,'node_modules','slsk-client','package.json')].every(f=>fs.existsSync(f))){
    let peer;
    try{
      await available(slskPort);
      peer=launch(node,[path.join(player,'server','soulseek-service.js')],env,false);
      await waitFor(`http://127.0.0.1:${slskPort}/health`,{'X-Cachy-Local':'1','X-Cachy-Token':slskToken},4);
      if(peer.exitCode===null)env.CACHYMUSIC_SOULSEEK_DISABLED='0';
    }catch(_){try{peer?.kill();}catch(_){}}
  }
  if(process.platform==='win32')env.CACHYMUSIC_LOOKUP_KEY=randomBytes(32).toString('hex');
  if(env.CACHYMUSIC_DB_ENABLED!=='1'&&env.CACHYMUSIC_PLAYLIST_SQL!=='1'){env.CACHYMUSIC_SCAN_SESSION=randomBytes(24).toString('hex');launch(php,[path.join(player,'php','scan_worker.php')],env,false);}else delete env.CACHYMUSIC_SCAN_SESSION;
  launch(php,['-S',`127.0.0.1:${port}`,path.join(player,'index.php')],env);
  await waitFor(`${origin}/`,{'X-Cachy-App-Token':token});
  const ses=session.fromPartition('persist:cachymusic');
  ses.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));ses.setPermissionCheckHandler(()=>false);
  ses.webRequest.onBeforeRequest((details,cb)=>{try{const u=new URL(details.url);cb({cancel:!(u.origin===origin||['blob:','data:'].includes(u.protocol)||(details.resourceType==='xhr'&&allowedRemote(u)&&details.method==='GET'))});}catch(_){cb({cancel:true});}});
  ses.webRequest.onBeforeSendHeaders((details,cb)=>{const h=details.requestHeaders;if(new URL(details.url).origin===origin)h['X-Cachy-App-Token']=token;else{for(const k of Object.keys(h))if(['cookie','referer','authorization','x-cachy-app-token'].includes(k.toLowerCase()))delete h[k];}cb({requestHeaders:h});});
  windowRef=new BrowserWindow({width:1280,height:800,minWidth:320,minHeight:500,backgroundColor:'#101215',webPreferences:{session:ses,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,devTools:false}});
  windowRef.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  windowRef.webContents.on('will-navigate',(e,url)=>{if(new URL(url).origin!==origin)e.preventDefault();});
  windowRef.webContents.on('will-attach-webview',e=>e.preventDefault());
  await windowRef.loadURL(origin);
}
if(!app.requestSingleInstanceLock())app.quit();else{
app.on('second-instance',()=>{if(windowRef){if(windowRef.isMinimized())windowRef.restore();windowRef.focus();}});
app.whenReady().then(init).catch(e=>{dialog.showErrorBox('CachyMusic',e.message);app.quit();});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>{stopping=true;for(const p of children)try{p.kill();}catch(_){}});
}
