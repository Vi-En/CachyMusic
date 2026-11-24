// Packaged desktop shell. No external browser or runtime installer is launched.
const {app,BrowserWindow,session,dialog}=require('electron');
const {spawn}=require('node:child_process');
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
function launch(exe,args,env){const p=spawn(exe,args,{cwd:player,env,stdio:'ignore',windowsHide:true});children.push(p);p.on('error',()=>{if(!stopping){dialog.showErrorBox('CachyMusic','A bundled service failed to start. Reinstall a verified package.');app.quit();}});p.on('exit',()=>{if(!stopping){dialog.showErrorBox('CachyMusic','A bundled service stopped unexpectedly.');app.quit();}});return p;}
function check(url,headers){return new Promise((resolve,reject)=>{const req=http.get(url,{headers,timeout:1000},r=>{r.resume();r.on('end',()=>resolve(r.statusCode===200));});req.on('timeout',()=>req.destroy());req.on('error',reject);});}
async function waitFor(url,headers){for(let i=0;i<40;i++){try{if(await check(url,headers))return;}catch(_){}await new Promise(r=>setTimeout(r,150));}throw Error('Bundled service did not become ready.');}
function allowedRemote(u){return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&((u.hostname==='musicbrainz.org'&&u.pathname.startsWith('/ws/2/recording'))||(u.hostname==='lrclib.net'&&u.pathname==='/api/search')||(u.hostname==='coverartarchive.org'&&u.pathname.startsWith('/release/'))||((u.hostname==='archive.org'||u.hostname.endsWith('.archive.org'))&&u.pathname.includes('/items/')));}
async function init(){
  for(const f of [php,node,path.join(player,'server','soulseek-service.js'),path.join(player,'node_modules','slsk-client','package.json')])if(!fs.existsSync(f))throw Error('Missing bundled runtime: '+path.basename(f));
  await available(port);await available(slskPort);
  const data=path.join(app.getPath('userData'),'data'),cache=path.join(app.getPath('userData'),'cache');fs.mkdirSync(data,{recursive:true,mode:0o700});fs.mkdirSync(cache,{recursive:true,mode:0o700});
  const env={...process.env,CACHYMUSIC_PACKAGED:'1',CACHYMUSIC_LOCAL_TOKEN:token,CACHYMUSIC_SOULSEEK_TOKEN:slskToken,CACHYMUSIC_SOULSEEK_PORT:String(slskPort),CACHYMUSIC_DATA_DIR:data,CACHYMUSIC_CACHE_DIR:cache,PATH:[path.join(runtime,'tools'),path.dirname(php),path.dirname(node)].join(path.delimiter)};
  delete env.PHP_CLI_SERVER_WORKERS; // portable process ownership; concurrency remains a future native-core concern
  launch(node,[path.join(player,'server','soulseek-service.js')],env);
  launch(php,['-S',`127.0.0.1:${port}`,path.join(player,'index.php')],env);
  await waitFor(`${origin}/`,{'X-Cachy-App-Token':token});
  await waitFor(`http://127.0.0.1:${slskPort}/health`,{'X-Cachy-Local':'1','X-Cachy-Token':slskToken});
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
