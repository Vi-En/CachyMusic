"""Actual PHP HTTP edit/cover/scan and storage crash-window counterexamples."""
import base64, hashlib, json, os, pathlib, socket, struct, subprocess, tempfile, time, urllib.request, urllib.error, wave, zlib
root=pathlib.Path(__file__).resolve().parents[1]
if not __debug__: raise SystemExit('Assertions required')
checks=[]
def check(name, result):
    checks.append(bool(result)); print(('PASS ' if result else 'FAIL ')+name, flush=True)
def png(color):
    def chunk(t,b): return struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0'+color))+chunk(b'IEND',b'')
red,blue,green=png(b'\xff\0\0'),png(b'\0\0\xff'),png(b'\0\xff\0')
with tempfile.TemporaryDirectory() as temp:
    t=pathlib.Path(temp);data=t/'data';cache=t/'cache';music=t/'Music';music.mkdir();(cache/'covers').mkdir(parents=True)
    song=music/'song.wav'
    def wav(n):
        with wave.open(str(song),'wb') as f:f.setparams((1,2,8000,n,'NONE','not compressed'));f.writeframes(bytes(n*2))
    wav(8000)
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))};env.update(HOME=temp,USERPROFILE=temp,CACHYMUSIC_DATA_DIR=str(data),CACHYMUSIC_CACHE_DIR=str(cache))
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    proc=subprocess.Popen(['php','-n','-S',f'127.0.0.1:{port}','-t',str(root),str(root/'index.php')],env=env,cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    http=urllib.request.build_opener(urllib.request.ProxyHandler({}));base=f'http://127.0.0.1:{port}/php/api/'
    def req(path,body=None,headers=None):
        h={'Content-Type':'application/json',**(headers or {})};r=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers=h)
        try:
            with http.open(r,timeout=15) as f:return f.status,f.headers,f.read()
        except urllib.error.HTTPError as e:return e.code,e.headers,e.read()
    def edit(title,art):return req('metadata.php',{'tid':1,'title':title,'comment':'saved comment','cover_data':'data:image/png;base64,'+base64.b64encode(art).decode()})
    def row():return json.loads((data/'library.json').read_text())['tracks']['1']
    def cover(query=''):return req('cover.php?tid=1'+query)
    try:
        for i in range(100):
            try:req('launcher_health.php');break
            except OSError:time.sleep(.05)
        scan=json.loads(req('scan.php',{'directory':str(music)})[2]);assert scan['success'] and scan['tracks'][0]['tid']==1,scan
        legacy=cache/'covers';(legacy/'tid_1.none').touch()
        result=edit('Red',red);check('edit succeeds despite previous negative cache',result[0]==200 and json.loads(result[2])['success'])
        check('new artwork overrides negative cache',cover()[2]==red)
        check('comment persisted in authoritative library',row().get('comment')=='saved comment')
        (legacy/'tid_1.none').unlink(missing_ok=True)
        check('committed artwork reference matches content',row().get('artwork_hash')==hashlib.sha256(red).hexdigest())
        old=cover();etag=old[1].get('ETag','');check('editable artwork revalidates HTTP cache','no-cache' in old[1].get('Cache-Control',''))
        # Real competing process holds the stable library sidecar lock while edit stages.
        if os.name=='posix':
            import fcntl
            with (data/'library.json.lock').open('a') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX)
                fail=edit('Blue not committed',blue)
            check('failed metadata commit reports failure',fail[0]>=400 and not json.loads(fail[2])['success'])
            check('failed commit keeps old title and artwork',row()['title']=='Red' and cover()[2]==red)
        result=edit('Green',green);check('subsequent edit succeeds',result[0]==200)
        check('new revision rejects prior ETag',req('cover.php?tid=1',headers={'If-None-Match':etag})[0]==200 and cover()[2]==green)
        current=cover();check('matching ETag returns 304',req('cover.php?tid=1',headers={'If-None-Match':current[1].get('ETag','')})[0]==304)
        # Cache eviction must not erase user data.
        import shutil
        shutil.rmtree(cache/'covers');check('artwork survives cache eviction',cover()[2]==green)
        # Simulate the crash window after staging but before publishing JSON.
        helper=root/'php/artwork_store.php'
        if helper.exists():
            script='require '+json.dumps(str(helper))+'; echo cm_artwork_stage(1,base64_decode($argv[1])).PHP_EOL; fflush(STDOUT); sleep(60);'
            writer=subprocess.Popen(['php','-n','-r',script,base64.b64encode(blue).decode()],env=env,text=True,stdout=subprocess.PIPE)
            try:staged=writer.stdout.readline().strip()
            finally:writer.kill();writer.wait(timeout=5)
            check('uncommitted staged blob stays invisible',staged==hashlib.sha256(blue).hexdigest() and cover()[2]==green)
        else:check('uncommitted staged blob stays invisible',False)
        thumb=cover('&thumb=1');check('thumb route uses committed artwork, not stale legacy thumb',thumb[0]==200 and (thumb[2]==green or thumb[1].get('ETag','').endswith(hashlib.sha256(green).hexdigest()+'-128\"')))
        wav(16000);sc=json.loads(req('scan.php',{'directory':str(music)})[2]);check('changed source size rescan keeps edited artwork',sc['success'] and sc['tracks'][0]['hasCover'] and cover()[2]==green and row().get('artwork_hash')==hashlib.sha256(green).hexdigest())
        if helper.exists():
            committed=data/'artwork-1'/(hashlib.sha256(green).hexdigest()+'.img');committed.write_bytes(blue)
            check('tampered blob rejected rather than serving different art',cover()[0]==503)
            # Verify a stale track path cannot attach artwork or metadata to a replacement.
            code='require '+json.dumps(str(root/'php/storage.php'))+'; echo json_encode(Storage::updateTrackMetadata(1,["title"=>"stale"],"/obsolete"));'
            out=subprocess.check_output(['php','-n','-r',code],env=env,text=True)
            check('stale expected path rejected',json.loads(out) is False)
            original=(data/'library.json').read_bytes()
            code='require '+json.dumps(str(root/'php/storage.php'))+'; echo json_encode(Storage::updateTrackMetadata(1,["title"=>"not synced"]));'
            out=subprocess.check_output(['php','-n','-d','disable_functions=fsync','-r',code],env=env,text=True)
            check('unavailable file sync fails without publishing',json.loads(out) is False and (data/'library.json').read_bytes()==original)
        else:
            check('tampered blob rejected rather than serving different art',False)
            check('stale expected path rejected',False)
            check('unavailable file sync fails without publishing',False)
    finally:
        proc.terminate();proc.wait(timeout=5)
print(f'{sum(checks)}/{len(checks)} passed')
raise SystemExit(0 if all(checks) else 1)
