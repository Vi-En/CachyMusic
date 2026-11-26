"""Real HTTP counterexamples for cover identity, sidecar boundaries and metadata IDs."""
import http.client, json, os, pathlib, socket, struct, subprocess, tempfile, time, urllib.request, urllib.error, wave, zlib, sys
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
if not __debug__: raise SystemExit('Assertions required')
checks=[]
def check(name,result):
    checks.append(bool(result));print(('PASS ' if result else 'FAIL ')+name,flush=True)
def png(rgb):
    def chunk(t,b):return struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',2,2,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+rgb*2)*2))+chunk(b'IEND',b'')
red,blue=png(b'\xff\0\0'),png(b'\0\0\xff')
with tempfile.TemporaryDirectory() as tmp:
    t=pathlib.Path(tmp);music=t/'Music';music.mkdir();cache=t/'cache';(cache/'covers').mkdir(parents=True);data=t/'data';private=t/'private.txt';private.write_bytes(b'PRIVATE FIXTURE NOT AN IMAGE')
    song=music/'song.wav'
    with wave.open(str(song),'wb') as f:f.setparams((1,2,8000,8000,'NONE','not compressed'));f.writeframes(bytes(16000))
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))};env.update(HOME=tmp,USERPROFILE=tmp,CACHYMUSIC_DATA_DIR=str(data),CACHYMUSIC_CACHE_DIR=str(cache))
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    proc=subprocess.Popen(['php','-n','-S',f'127.0.0.1:{port}','-t',str(root),str(root/'index.php')],env=env,cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    client=urllib.request.build_opener(urllib.request.ProxyHandler({}));base=f'http://127.0.0.1:{port}/php/api/'
    def req(path,body=None,headers=None):
        r=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(headers or {})})
        try:
            with client.open(r,timeout=15) as f:
                try:body=f.read()
                except http.client.IncompleteRead as e:body=e.partial
                return f.status,f.headers,body
        except urllib.error.HTTPError as e:return e.code,e.headers,e.read()
    def q(path):return urllib.parse.quote(str(path),safe='')
    def cover(params='tid=1'):return req('cover.php?'+params)
    try:
        for i in range(100):
            try:req('launcher_health.php');break
            except OSError:time.sleep(.05)
        scan=json.loads(req('scan.php',{'directory':str(music)})[2]);assert scan['success'] and scan['tracks'][0]['tid']==1,scan
        for invalid in ([1],True,1.5,'1junk','92233720368547758080'):
            before=(data/'library.json').read_bytes();r=req('metadata.php',{'tid':invalid,'title':'wrong target'})
            check('reject metadata ID '+repr(invalid),r[0]==400 and before==(data/'library.json').read_bytes())
        check('canonical string metadata ID accepted',req('metadata.php',{'tid':'1','title':'valid'})[0]==200)
        check('reject array cover ID',cover('tid[]=1')[0]==400)
        check('reject malformed path',cover('path[]=x')[0]==400)
        check('reject conflicting cover selectors',cover('tid=1&path='+q(song))[0]==400)
        check('unknown track cannot acquire cache via path',cover('tid=999&path='+q(song))[0]==400 and not list((cache/'covers').glob('tid_999*')))
        # Clear legacy caches so every later counterexample is independent.
        def clear():
            for p in (cache/'covers').iterdir():
                if p.is_file() or p.is_symlink():p.unlink()
        clear();side=music/'cover.png';side.write_bytes(private.read_bytes())
        r=cover();check('nonimage sidecar bytes not exposed',private.read_bytes() not in r[2]);clear();side.unlink()
        if os.name=='posix':
            side.symlink_to(private);r=cover();check('sidecar symlink not exposed',private.read_bytes() not in r[2]);side.unlink();clear()
        clear();side.write_bytes(red);r=cover();check('valid sidecar served',r[2]==red);old=r[1].get('ETag','')
        side.write_bytes(blue);os.utime(side,(time.time()+2,time.time()+2));r=req('cover.php?tid=1',headers={'If-None-Match':old});check('changed sidecar invalidates cache and ETag',r[0]==200 and r[2]==blue)
        side.unlink();r=cover();check('removed sidecar not served from stale cache',r[2]!=red and r[2]!=blue)
        clear();r=cover();side.write_bytes(red);r=cover();check('new sidecar invalidates negative cache',r[2]==red)
        # Valid cache for nonexistent ID must not bypass current library identity.
        (cache/'covers'/'tid_999.img').write_bytes(red);check('unbound legacy ID cache ignored',cover('tid=999')[0]==404)
        # A cached track path resolving outside configured roots is rejected.
        if os.name=='posix':
            outside=t/'outside.wav';outside.write_bytes(song.read_bytes());song.unlink();song.symlink_to(outside);clear();check('indexed path canonicalized before authorization',cover()[0]==403)
    finally:proc.terminate();proc.wait(timeout=5)
print(f'{sum(checks)}/{len(checks)} passed');raise SystemExit(0 if all(checks) else 1)
