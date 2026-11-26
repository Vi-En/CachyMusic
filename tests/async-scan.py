"""Actual single-worker PHP backend, managed CLI scan, exact range bytes and recovery."""
import json,os,pathlib,socket,subprocess,sys,tempfile,time,urllib.request,urllib.error,wave,threading
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
if os.name!='posix': print('SKIP POSIX single-server fixture');raise SystemExit(0)
if not __debug__:raise SystemExit('Assertions required')
checks=[]
def check(name,ok):
    checks.append(bool(ok));print(('PASS ' if ok else 'FAIL ')+name,flush=True)
with tempfile.TemporaryDirectory() as tmp:
    base=pathlib.Path(tmp);data=base/'data';music=base/'music';new=base/'new';tools=base/'bin';logs=base/'probe.log'
    for d in (music,new,tools):d.mkdir()
    def wav(path):
        with wave.open(str(path),'wb') as w:w.setparams((1,2,8000,8000,'NONE','none'));w.writeframes(bytes(range(256))*62+bytes(128))
    old=music/'original.wav';wav(old)
    for name in ['one.wav','two.wav','three.wav']:wav(new/name)
    secret=base/'private.txt';secret.write_text('PRIVATE-SIDECAR-FIXTURE');(new/'one.lrc').symlink_to(secret)
    # A slow probe is deterministic; the pure PHP WAV parser then handles it.
    probe=tools/'ffprobe';probe.write_text('#!/bin/sh\nfor last; do :; done\nprintf "%s\\n" "$last" >> "$SCAN_PROBE_LOG"\nsleep 0.8\n');probe.chmod(0o700)
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_')) and k!='PHP_CLI_SERVER_WORKERS'}
    env.update(HOME=tmp,USERPROFILE=tmp,CACHYMUSIC_DATA_DIR=str(data),CACHYMUSIC_CACHE_DIR=str(base/'cache'),PATH=str(tools)+os.pathsep+env['PATH'],SCAN_PROBE_LOG=str(logs),CACHYMUSIC_SCAN_SECONDS='20')
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    url=f'http://127.0.0.1:{port}/';opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));session='a'*48
    api='php/api/scan_jobs.php';children=[]
    def launch(args,extra={}):
        p=subprocess.Popen(args,cwd=root,env={**env,**extra},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);children.append(p);return p
    def call(path,body=None,headers={},timeout=10):
        req=urllib.request.Request(url+path,None if body is None else json.dumps(body).encode(),headers={**headers,**({'Content-Type':'application/json'} if body is not None else {})})
        try:
            with opener.open(req,timeout=timeout) as r:return r.status,r.read()
        except urllib.error.HTTPError as e:return e.code,e.read()
    def j(path,body=None):
        code,raw=call(path,body);return code,json.loads(raw)
    def wait_for(fn,timeout=8):
        end=time.monotonic()+timeout
        while time.monotonic()<end:
            try:
                v=fn()
                if v:return v
            except (OSError,ValueError):pass
            time.sleep(.05)
        raise AssertionError('Timed out waiting for fixture condition')
    def start(id,directory):return j(api,{'action':'start','id':id,'directory':str(directory),'preserveDirectory':False})
    def status(id):return j(api+'?id='+id)[1]
    def finish(id):return wait_for(lambda: (s if (s:=status(id)).get('phase') in ('done','cancelled','uncertain') else None))
    def result(id):return j(api+'?id='+id+'&result=1')
    def cancel(id):return j(api,{'action':'cancel','id':id})
    try:
        server=launch(['php','-S',f'127.0.0.1:{port}','index.php'],{'CACHYMUSIC_SCAN_SESSION':session})
        wait_for(lambda: call('php/api/launcher_health.php')[0]==200)
        # Fixture setup is an offline CLI operation; never bypass the managed HTTP contract.
        seed='require "php/api/scan.php";[, $body]=cachy_execute_scan([],'+json.dumps(str(music))+');echo $body;'
        oldscan=json.loads(subprocess.check_output(['php','-r',seed],cwd=root,env=env,timeout=20));assert oldscan['success'],oldscan
        tid=oldscan['tracks'][0]['tid'];lib=data/'library.json';original=lib.read_bytes();logs.write_text('')
        if not (root/'php/scan_worker.php').exists():
            # Baseline positive control: a full scan blocks a simultaneous range.
            out=[];t=threading.Thread(target=lambda:out.append(j('php/api/scan.php',{'directory':str(new),'preserveDirectory':True})),daemon=True);t.start()
            wait_for(lambda: logs.stat().st_size>0);begin=time.monotonic();code,raw=call(f'php/api/stream.php?tid={tid}',headers={'Range':'bytes=0-31'});elapsed=time.monotonic()-begin;t.join()
            assert code==206 and raw==old.read_bytes()[:32] and out[0][1].get('success');print(f'BASELINE concurrent range latency {elapsed:.3f}s; HTTP {code}; exact bytes verified');raise SystemExit(0)
        check('managed direct scan and legacy tracks routes reject without mutation',j('php/api/scan.php',{'directory':str(new)})[0]==409 and j('php/api/tracks.php')[0]==409 and lib.read_bytes()==original and logs.read_text()=='')
        check('managed worker absent is advertised unavailable without synchronous fallback',j(api)[1]=={'enabled':True,'ready':False} and start('0'*32,new)[0]==503)
        worker=launch(['php','php/scan_worker.php'],{'CACHYMUSIC_SCAN_SESSION':session})
        wait_for(lambda:j(api)[1].get('ready'))
        check('saved directory lookup is read-only',j(api+'?directory=1')[1]['directory']==str(music) and logs.read_text()=='' and lib.read_bytes()==original)
        id='1'*32;begin=time.monotonic();code,s=start(id,new);submit=time.monotonic()-begin
        check('job submission returns queued immediately',code==202 and s['phase']=='queued' and submit<.5)
        check('same request ID is idempotent',start(id,new)[0]==200)
        check('conflicting request ID and overlapping job rejected',start(id,music)[0]==409 and start('2'*32,new)[0]==409)
        wait_for(lambda: logs.stat().st_size>0)
        begin=time.monotonic();code,raw=call(f'php/api/stream.php?tid={tid}',headers={'Range':'bytes=0-31'});elapsed=time.monotonic()-begin
        check('media bytes remain available during slow scan on single HTTP worker',code==206 and raw==old.read_bytes()[:32] and elapsed<.5 and status(id)['phase']=='running')
        print(f'Managed concurrent range latency {elapsed:.4f}s; submit {submit:.4f}s',flush=True)
        # Finish one metadata record, then cancel while the next probe is active.
        wait_for(lambda:len(logs.read_text().splitlines())>=2)
        check('running cancellation accepted',cancel(id)[0]==200)
        check('cancelled scan leaves authoritative JSON unchanged',finish(id)['phase']=='cancelled' and lib.read_bytes()==original)
        resume=data/'scan-resume-v1.jsonl';assert resume.exists();records=resume.read_text().splitlines();assert len(records)>=2,records
        logged=logs.read_text().splitlines();first=logged[0];logs.write_text('')
        id='3'*32;assert start(id,new)[0]==202;assert finish(id)['phase']=='done';code,body=result(id)
        check('retry reuses validated completed metadata and commits complete library',code==200 and body.get('success') and body['count']==3 and first not in logs.read_text().splitlines() and not resume.exists())
        check('symlink lyrics are not returned or persisted',all('PRIVATE-SIDECAR-FIXTURE' not in str(t.get('lyrics')) for t in body['tracks']) and b'PRIVATE-SIDECAR-FIXTURE' not in lib.read_bytes())
        check('committed library contains exactly the new root and durable IDs',json.loads(lib.read_bytes())['default_directory']==str(new) and all(isinstance(t['tid'],int) for t in body['tracks']))
        # Source-side invalid IDs and unsafe state requests are not accepted.
        check('malformed job ID and invalid preserveDirectory rejected',j(api+'?id=../../library.json')[0]==400 and j(api,{'action':'start','id':'4'*32,'directory':str(music),'preserveDirectory':'yes'})[0]==400)
        # Interrupted job, restart using a new owner/session and retain checkpoint.
        other=base/'other';other.mkdir();wav(other/'slow.wav');wav(other/'slow2.wav');before=lib.read_bytes();logs.write_text('')
        id='5'*32;assert start(id,other)[0]==202;wait_for(lambda: logs.stat().st_size>0);worker.kill();worker.wait(timeout=4)
        check('worker loss reports uncertain, never a successful partial scan',finish(id)['phase']=='uncertain' and lib.read_bytes()==before)
        check('no new job accepted without worker',start('6'*32,other)[0]==503)
        # Fresh process in the same launch can accept an explicit new job only.
        worker=launch(['php','php/scan_worker.php'],{'CACHYMUSIC_SCAN_SESSION':session});wait_for(lambda:j(api)[1].get('ready'))
        id='7'*32;assert start(id,other)[0]==202;assert finish(id)['phase']=='done';code,body=result(id)
        check('explicit new job after worker restart completes',code==200 and body.get('success') and body['count']==2)
        # Replacing result bytes cannot cause another job's data to be returned.
        (data/'scan-job-result.json').write_text('{}');check('corrupt result fails closed',j(api+'?id='+id+'&result=1')[0]==503)
        restart_dir=base/'restart';restart_dir.mkdir();wav(restart_dir/'restart.wav');before=lib.read_bytes();logs.write_text('')
        id='8'*32;assert start(id,restart_dir)[0]==202;wait_for(lambda:logs.stat().st_size>0);worker.kill();worker.wait(timeout=4)
        worker=launch(['php','php/scan_worker.php'],{'CACHYMUSIC_SCAN_SESSION':session});wait_for(lambda:j(api)[1].get('ready'))
        check('same-session restart does not silently replay prior job',status(id)['phase']=='uncertain' and lib.read_bytes()==before)
    finally:
        for p in reversed(children):
            if p.poll() is None:
                p.terminate()
                try:p.wait(timeout=5)
                except subprocess.TimeoutExpired:p.kill();p.wait()
print(f'{sum(checks)}/{len(checks)} passed');raise SystemExit(0 if all(checks) else 1)
