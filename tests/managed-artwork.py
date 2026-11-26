"""Managed cold artwork isolation, authorization and recording request locking."""
import hashlib,json,os,pathlib,shutil,signal,socket,struct,subprocess,sys,tempfile,threading,time,urllib.parse,urllib.request,urllib.error,wave,zlib
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
if not __debug__:raise SystemExit('Assertions required')
if os.name!='posix':print('SKIP POSIX contention fixture');raise SystemExit(0)
import fcntl
checks=[]
def check(name,ok):
    checks.append(bool(ok));print(('PASS ' if ok else 'FAIL ')+name,flush=True)
def png(rgb):
    def chunk(t,b):return struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',2,2,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+rgb*2)*2))+chunk(b'IEND',b'')
with tempfile.TemporaryDirectory() as tmp:
    t=pathlib.Path(tmp);music=t/'media';music.mkdir();other=t/'other';other.mkdir();tools=t/'bin';tools.mkdir();data=t/'data';marker=t/'extract.log';cache=t/'cache'
    song=music/'song.wav';second=music/'second.wav'
    with wave.open(str(song),'wb') as w:w.setparams((1,2,8000,8000,'NONE','none'));w.writeframes(bytes(16000))
    second.write_bytes(song.read_bytes());side=music/'cover.png';red=png(b'\xff\0\0');blue=png(b'\0\0\xff');side.write_bytes(red)
    ffmpeg=shutil.which('ffmpeg');assert ffmpeg
    wrapper=tools/'ffmpeg';wrapper.write_text('#!/bin/sh\ncase "$*" in *"-frames:v 1 -c:v copy"*) printf x >> "$COVER_MARKER"; sleep 1.2;; esac\nexec "$REAL_FFMPEG" "$@"\n');wrapper.chmod(0o700)
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_')) and k!='PHP_CLI_SERVER_WORKERS'}
    env.update(HOME=tmp,USERPROFILE=tmp,CACHYMUSIC_DATA_DIR=str(data),CACHYMUSIC_CACHE_DIR=str(cache),PATH=str(tools)+os.pathsep+env['PATH'],COVER_MARKER=str(marker),REAL_FFMPEG=ffmpeg,CACHYMUSIC_SCAN_SESSION='d'*48)
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    base=f'http://127.0.0.1:{port}/php/api/';http=urllib.request.build_opener(urllib.request.ProxyHandler({}));children=[]
    def launch(args):
        p=subprocess.Popen(args,cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);children.append(p);return p
    def req(path,body=None,headers={}):
        r=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**headers})
        try:
            with http.open(r,timeout=20) as f:return f.status,f.read(),f.headers
        except urllib.error.HTTPError as e:return e.code,e.read(),e.headers
    def j(path,body=None):
        a,b,_=req(path,body);return a,json.loads(b)
    def wait(fn,timeout=12):
        until=time.monotonic()+timeout
        while time.monotonic()<until:
            try:
                v=fn()
                if v:return v
            except (OSError,ValueError):pass
            time.sleep(.05)
        raise AssertionError('Fixture timeout')
    def phase(id):return j('scan_jobs.php?id='+id)[1].get('phase')
    def result(id):return j('scan_jobs.php?id='+id+'&result=1')[1]
    def edit(id,tid,title,write):return j('scan_jobs.php?metadata=1',{'action':'start','id':id,'edit':{'tid':tid,'title':title,'write_file':write}})
    def terminal(id):return wait(lambda:(p if (p:=phase(id)) in ('done','cancelled','uncertain') else None))
    def cover(tid,extra=''):return req(f'cover.php?tid={tid}&defer=1'+extra)
    def stream(tid):return req(f'stream.php?tid={tid}',headers={'Range':'bytes=0-31'})
    def root_update(path):
        code='require "php/storage.php";exit(Storage::setDefaultDirectory('+json.dumps(str(path))+')?0:1);'
        subprocess.run(['php','-r',code],cwd=root,env=env,check=True,timeout=10)
    try:
        server=launch(['php','-S',f'127.0.0.1:{port}','index.php']);wait(lambda:req('launcher_health.php')[0]==200)
        # Fixture setup is an offline CLI operation; never bypass the managed HTTP contract.
        seed='require "php/api/scan.php";[, $body]=cachy_execute_scan([],'+json.dumps(str(music))+');echo $body;'
        scan=json.loads(subprocess.check_output(['php','-r',seed],cwd=root,env=env,timeout=20));assert scan['success'],scan
        tid=next(x['tid'] for x in scan['tracks'] if x['filename']=='song.wav');sid=next(x['tid'] for x in scan['tracks'] if x['filename']=='second.wav')
        if not (root/'php/cover_jobs.php').exists():
            answer=[];th=threading.Thread(target=lambda:answer.append(cover(tid)));th.start();wait(marker.exists);start=time.monotonic();a,b,_=stream(sid);elapsed=time.monotonic()-start;th.join();assert a==206 and b==second.read_bytes()[:32] and answer[0][:2]==(200,red)
            print(f'BASELINE exact range waited {elapsed:.3f}s during cold artwork');raise SystemExit(0)
        r=cover(tid);check('managed deferred request fails closed while worker absent',r[0]==503 and r[2].get('Retry-After')=='1' and not marker.exists())
        legacy=req(f'cover.php?tid={tid}');check('uncontrolled managed image returns uncached placeholder without extraction',legacy[0]==200 and legacy[2].get('Cache-Control')=='no-store' and legacy[2].get('Content-Type','').startswith('image/svg+xml') and not marker.exists())
        worker=launch(['php','php/scan_worker.php']);wait(lambda:j('scan_jobs.php')[1].get('ready'))
        worker.send_signal(signal.SIGSTOP)
        legacy=req(f'cover.php?tid={tid}');check('uncontrolled managed cold miss queues without extraction',legacy[0]==200 and legacy[2].get('Cache-Control')=='no-store' and not marker.exists())
        check('cold miss queues instead of extracting on HTTP thread',cover(tid)[0]==202 and not marker.exists())
        queue=data/'cover-jobs.json';before=queue.read_bytes();check('duplicate cold request coalesces without rewriting queue',cover(tid)[0]==202 and queue.read_bytes()==before)
        worker.send_signal(signal.SIGCONT);wait(marker.exists)
        start=time.monotonic();a,b,_=stream(sid);elapsed=time.monotonic()-start;check('exact range available during slow cold artwork',a==206 and b==second.read_bytes()[:32] and elapsed<.8);print(f'CANDIDATE exact range latency {elapsed:.3f}s')
        def ready(tid,extra=''):
            r=cover(tid,extra);return r if r[0]==200 else None
        r=wait(lambda:ready(tid));check('background extraction publishes exact sidecar bytes',r[1]==red)
        check('warm request returns exact cached bytes',cover(tid)[:2]==(200,red))
        check('warm missing thumbnail returns full image promptly',cover(tid,'&thumb=1')[0]==200)
        wait(lambda:list((cache/'covers').glob('*_thumb.jpg')))
        check('background thumbnail generated',cover(tid,'&thumb=1')[2].get('Content-Type')=='image/jpeg')
        # Queue authorization is revalidated by worker and HTTP endpoint.
        worker.send_signal(signal.SIGSTOP);side.write_bytes(blue);os.utime(side,(time.time()+2,time.time()+2));check('changed sidecar gets distinct cold job',cover(tid)[0]==202);old=set((cache/'covers').glob('*.img'))
        root_update(other);worker.send_signal(signal.SIGCONT);wait(lambda:not json.loads(queue.read_bytes())['jobs'])
        check('revoked queued source cannot publish',set((cache/'covers').glob('*.img'))==old and cover(tid)[0]==403)
        root_update(music);check('authorized replacement returns new source',wait(lambda:ready(tid))[1]==blue)
        # Fill the bounded queue with real path requests and refuse overflow.
        worker.send_signal(signal.SIGSTOP);files=[]
        for i in range(65):
            f=music/f'extra-{i}.wav';f.write_bytes(song.read_bytes());files.append(f)
        statuses=[req('cover.php?defer=1&path='+urllib.parse.quote(str(f),safe=''))[0] for f in files]
        check('bounded queue rejects excess work',statuses.count(202)==64 and statuses[-1]==503 and len(json.loads(queue.read_bytes())['jobs'])==64)
        # Discard test-only pending jobs, resume normal worker.
        queue.write_text(json.dumps({'session':'d'*48,'jobs':{}}));worker.send_signal(signal.SIGCONT)
        # Hold the real stripe lock from another process/descriptor.
        stripe=data/('recording-'+hashlib.sha256(str(song).encode()).hexdigest()[:3]+'.lock')
        with stripe.open('a') as h:
            fcntl.flock(h,fcntl.LOCK_SH);original=(data/'library.json').read_bytes();id='a'*32
            assert edit(id,tid,'conflict',True)[0]==202
            check('original-file edit rejects active shared reservation before commit',terminal(id)=='done' and not result(id)['success'] and (data/'library.json').read_bytes()==original)
            fcntl.flock(h,fcntl.LOCK_EX)
            check('stream refuses concurrent exclusive reservation',stream(tid)[0]==503)
            check('unrelated recording range remains available',stream(sid)[:2]==(206,second.read_bytes()[:32]))
        check('released reservation permits exact stream bytes',stream(tid)[:2]==(206,song.read_bytes()[:32]))
        # Existing writers use inode locks: a stream must respect those too.
        with song.open('rb') as h:
            fcntl.flock(h,fcntl.LOCK_EX);check('stream refuses concurrent inode writer',stream(tid)[0]==503)
        # Corrupt or aliased queue state cannot become executable input.
        queue.write_text('{}');side.write_bytes(red);os.utime(side,(time.time()+4,time.time()+4));check('corrupt queue fails closed',cover(tid)[0]==503)
    finally:
        for p in reversed(children):
            if p.poll() is None:
                p.send_signal(signal.SIGCONT);p.terminate()
                try:p.wait(timeout=5)
                except subprocess.TimeoutExpired:p.kill();p.wait()
print(f'{sum(checks)}/{len(checks)} passed');raise SystemExit(0 if all(checks) else 1)
