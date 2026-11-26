"""HTTP revocation across media, artwork and metadata; authority CAS and idle trim."""
import base64,json,os,pathlib,socket,subprocess,tempfile,time,urllib.request,urllib.error,wave,struct,zlib,sys
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
if not __debug__:raise SystemExit('Assertions required')
def chunk(t,b):return struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b)&0xffffffff)
art=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0\xff\0\0'))+chunk(b'IEND',b'')
checks=[]
def check(name,v):checks.append(bool(v));print(('PASS ' if v else 'FAIL ')+name,flush=True)
with tempfile.TemporaryDirectory() as d:
    t=pathlib.Path(d);old=t/'old';new=t/'new';data=t/'data';cache=t/'cache';old.mkdir();new.mkdir()
    for p in (old/'one.wav',new/'two.wav'):
        with wave.open(str(p),'wb') as w:w.setparams((1,2,8000,8000,'NONE','none'));w.writeframes(bytes(16000))
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))};env.update(HOME=d,USERPROFILE=d,CACHYMUSIC_DATA_DIR=str(data),CACHYMUSIC_CACHE_DIR=str(cache))
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    p=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','index.php'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));base=f'http://127.0.0.1:{port}/php/api/'
    def req(path,body=None,headers={}):
        r=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**headers})
        try:
            with opener.open(r,timeout=10) as f:return f.status,f.read()
        except urllib.error.HTTPError as e:return e.code,e.read()
    try:
        for i in range(100):
            try:req('launcher_health.php');break
            except OSError:time.sleep(.05)
        a=json.loads(req('scan.php',{'directory':str(old)})[1]);assert a['success'];tid=a['tracks'][0]['tid'];q=f'?tid={tid}'
        edit=req('metadata.php',{'tid':tid,'title':'original','cover_data':'data:image/png;base64,'+base64.b64encode(art).decode()});assert edit[0]==200,edit
        check('authorized edited artwork',req('cover.php'+q)==(200,art));check('authorized metadata',req('metadata.php'+q)[0]==200)
        if os.name=='posix':
            # Link an existing indexed recording after publication: access must
            # be rejected even when its previously committed artwork is cached.
            alias=t/'private-alias.wav';os.link(old/'one.wav',alias)
            saved=(data/'library.json').read_bytes()
            check('multiply linked stream rejected',req('stream.php'+q,headers={'Range':'bytes=0-31'})[0]==403)
            check('multiply linked artwork rejected',req('cover.php'+q)[0]==403)
            check('multiply linked metadata read rejected',req('metadata.php'+q)[0]==403)
            check('multiply linked metadata write rejected',req('metadata.php',{'tid':tid,'title':'aliased'})[0]==403 and (data/'library.json').read_bytes()==saved)
            check('scan excludes multiply linked recording',json.loads(req('scan.php',{'directory':str(old)})[1])['count']==0)
            alias.unlink()
            check('ordinary single-link stream still available',req('stream.php'+q,headers={'Range':'bytes=0-31'})[0]==206)
        before=json.loads((data/'library.json').read_text());auth=[before.get('default_directory',''),before.get('soulseek',{}).get('downloads_dir',''),before.get('soulseek',{}).get('shared_dir','')]
        a=json.loads(req('scan.php',{'directory':str(new)})[1]);assert a['success'];lib=data/'library.json';snapshot=lib.read_bytes()
        check('revoked media stream rejected',req('stream.php'+q,headers={'Range':'bytes=0-31'})[0]==403)
        check('revoked committed artwork rejected',req('cover.php'+q)[0]==403)
        check('revoked metadata read rejected',req('metadata.php'+q)[0]==403)
        check('revoked metadata update rejected',req('metadata.php',{'tid':tid,'title':'wrong'})[0]==403 and lib.read_bytes()==snapshot)
        if (root/'php/media_access.php').exists():
            prefix='require '+json.dumps(str(root/'php/storage.php'))+';'
            code=prefix+'echo json_encode(Storage::updateTrackMetadata('+str(tid)+',["title"=>"stale"],'+json.dumps(str(old/'one.wav'))+','+json.dumps(auth)+'));'
            # PHP JSON array literal is valid for this scalar list.
            r=subprocess.run(['php','-r',code],env=env,capture_output=True,text=True,timeout=10);check('stale metadata authority CAS rejects',r.returncode==0 and r.stdout=='false' and lib.read_bytes()==snapshot)
        a=json.loads(req('scan.php',{'directory':str(old)})[1]);assert a['success'];check('re-authorized artwork preserved',req('cover.php'+q)==(200,art))
        if (root/'php/media_access.php').exists():
            covers=cache/'covers';covers.mkdir(exist_ok=True,parents=True);x=covers/('1'*64+'.img');y=covers/('2'*64+'.img');x.write_bytes(b'x'*6);y.write_bytes(b'y'*6);os.utime(x,(1,1));unknown=covers/'unknown.txt';unknown.write_bytes(b'keep');
            code='require '+json.dumps(str(root/'php/platform.php'))+';require '+json.dumps(str(root/'php/cover_cache_budget.php'))+';echo json_encode(cm_cover_cache_trim('+json.dumps(str(covers))+'));'
            r=subprocess.run(['php','-r',code],env={**env,'CACHYMUSIC_COVER_CACHE_BYTES':'6','CACHYMUSIC_COVER_CACHE_ENTRIES':'1'},capture_output=True,text=True,timeout=10);check('idle trim removes eligible over-budget entries',r.returncode==0 and not x.exists() and y.exists() and unknown.read_bytes()==b'keep')
    finally:p.terminate();p.wait(timeout=5)
print(f'{sum(checks)}/{len(checks)} passed');raise SystemExit(0 if all(checks) else 1)
