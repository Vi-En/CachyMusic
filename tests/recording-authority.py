"""Real HTTP + independent process authority coordination; no device claims."""
import json, os, pathlib, socket, subprocess, tempfile, time, urllib.request, urllib.error, wave, sys
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
if not __debug__:raise SystemExit('Assertions required')
checks=[]
def check(name,result):
    checks.append(bool(result));print(('PASS ' if result else 'FAIL ')+name,flush=True)
with tempfile.TemporaryDirectory() as tmp:
    t=pathlib.Path(tmp);old=t/'old';new=t/'new';data=t/'data';old.mkdir();new.mkdir()
    for p in [old/'one.wav',new/'two.wav']:
        with wave.open(str(p),'wb') as w:w.setparams((1,2,8000,8000,'NONE','none'));w.writeframes(bytes(16000))
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_')) and k!='PHP_CLI_SERVER_WORKERS'};env.update(HOME=tmp,USERPROFILE=tmp,CACHYMUSIC_DATA_DIR=str(data),CACHYMUSIC_CACHE_DIR=str(t/'cache'))
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    server=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','index.php'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    http=urllib.request.build_opener(urllib.request.ProxyHandler({}));base=f'http://127.0.0.1:{port}/php/api/'
    def req(route,body=None,headers=None):
        r=urllib.request.Request(base+route,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(headers or {})})
        try:
            with http.open(r,timeout=15) as f:return f.status,f.read()
        except urllib.error.HTTPError as e:return e.code,e.read()
    def scan(p):return json.loads(req('scan.php',{'directory':str(p)})[1])
    def lease(owner,action='renew'):return req('recording_lease.php',{'owner':owner,'action':action,'tid':tid,'path':path})[0]
    def cli(code):return json.loads(subprocess.check_output(['php','-r','require "php/storage.php";'+code],cwd=root,env=env,timeout=10))
    try:
        for i in range(100):
            try:
                if req('launcher_health.php')[0]==200:break
            except OSError:time.sleep(.03)
        else:raise AssertionError('Server startup')
        seeded=scan(old);assert seeded['success'];tid=seeded['tracks'][0]['tid'];path=seeded['tracks'][0]['fullPath'];lib=data/'library.json';journal=data/'recording-leases.json';a='a'*32;b='b'*32
        assert lease(a)==200 and lease(b)==200
        before=lib.read_bytes();result=scan(new)
        check('active clients block root replacement atomically',not result.get('success') and lib.read_bytes()==before)
        # Reset baseline after its known unsafe change so other cases remain independent.
        if result.get('success'):assert scan(old)['success']
        before=lib.read_bytes();check('same-root scan remains available',scan(old).get('success') is True)
        check('unrelated metadata write remains available',req('metadata.php',{'tid':tid,'title':'updated'})[0]==200)
        before=lib.read_bytes();check('direct root setter obeys same guard',cli('echo json_encode(Storage::setDefaultDirectory('+json.dumps(str(new))+'));') is False and lib.read_bytes()==before)
        if json.loads(lib.read_bytes())['default_directory']!=str(old):assert scan(old)['success']
        before=lib.read_bytes();check('peer root mutation obeys same guard',cli('$x=Storage::getSoulseekAccount();$x["downloads_dir"]='+json.dumps(str(new))+';echo json_encode(Storage::saveSoulseekAccount($x));') is False and lib.read_bytes()==before)
        assert lease(a,'release')==200;before=lib.read_bytes();result=scan(new)
        check('releasing one client does not permit root change',not result.get('success') and lib.read_bytes()==before)
        if result.get('success'):assert scan(old)['success']
        check('old audio still available during protected root transition',req(f'stream.php?tid={tid}',headers={'Range':'bytes=0-31'})==(206,(old/'one.wav').read_bytes()[:32]))
        assert lease(b,'release')==200
        check('all releases permit root replacement',scan(new).get('success') is True)
        check('old reservation cannot be renewed after root revocation',lease(a)==409)
        assert scan(old)['success'];assert lease(a)==200
        state=json.loads(journal.read_text());state['leases'][a]['expires']=int(time.time())-1;journal.write_text(json.dumps(state))
        check('expired lease does not block root change',scan(new).get('success') is True)
        assert scan(old)['success'];journal.write_text('{corrupt');before=lib.read_bytes()
        result=scan(new);check('corrupt lease journal refuses root mutation without modifying bytes',not result.get('success') and lib.read_bytes()==before and journal.read_text()=='{corrupt')
        journal.unlink();assert scan(old)['success']
        if os.name=='posix':
            import fcntl
            lock=data/'recording-authority.lock'
            # Model an independent original-file edit or root publisher at its
            # critical section. Both operations must reject a competing guard.
            with lock.open('a+b') as h:
                fcntl.flock(h,fcntl.LOCK_SH|fcntl.LOCK_NB);before=lib.read_bytes();result=scan(new)
                check('shared authority guard prevents root publication',not result.get('success') and lib.read_bytes()==before)
            if result.get('success'):assert scan(old)['success']
            with lock.open('a+b') as h:
                fcntl.flock(h,fcntl.LOCK_EX|fcntl.LOCK_NB);before=lib.read_bytes()
                check('exclusive root guard prevents stale renewal',lease(a)==409)
                assert lease(a,'release')==200
                check('exclusive root guard prevents original-file edit',req('metadata.php',{'tid':tid,'title':'blocked','write_file':True})[0]==409 and lib.read_bytes()==before)
            lease(a,'release')
        check('root transition resumes after guard release',scan(new).get('success') is True)
    finally:server.terminate();server.wait(timeout=5)
print(f'{sum(checks)}/{len(checks)} passed');raise SystemExit(0 if all(checks) else 1)
