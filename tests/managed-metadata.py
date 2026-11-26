"""Real single HTTP worker, delayed real packet writer, durable deferred edit protocol."""
import base64,json,os,pathlib,shutil,signal,socket,struct,subprocess,sys,tempfile,threading,time,urllib.request,urllib.error,wave,zlib
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
if not __debug__:raise SystemExit('Assertions required')
if os.name!='posix':print('SKIP POSIX signal fixture');raise SystemExit(0)
node=shutil.which('node');assert node and shutil.which('ffmpeg')
checks=[]
def check(name,ok):
    checks.append(bool(ok));print(('PASS ' if ok else 'FAIL ')+name,flush=True)
with tempfile.TemporaryDirectory() as tmp:
    t=pathlib.Path(tmp);music=t/'music';music.mkdir();tools=t/'bin';tools.mkdir();data=t/'data';marker=t/'writer.log'
    wav=music/'range.wav';ogg=music/'edit.ogg'
    with wave.open(str(wav),'wb') as w:w.setparams((1,2,8000,8000,'NONE','none'));w.writeframes(bytes(range(256))*62+bytes(128))
    subprocess.run(['ffmpeg','-v','error','-i',str(wav),'-c:a','libvorbis',str(ogg)],check=True,timeout=15)
    def pcm():return subprocess.check_output(['ffmpeg','-v','error','-i',str(ogg),'-f','s16le','-'],timeout=15)
    original_pcm=pcm()
    wrapper=tools/'node';wrapper.write_text('#!/bin/sh\nprintf x >> "$EDIT_MARKER"\nsleep 1.4\nexec "$REAL_NODE" "$@"\n');wrapper.chmod(0o700)
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_')) and k!='PHP_CLI_SERVER_WORKERS'}
    env.update(HOME=tmp,USERPROFILE=tmp,CACHYMUSIC_DATA_DIR=str(data),CACHYMUSIC_CACHE_DIR=str(t/'cache'),PATH=str(tools)+os.pathsep+env['PATH'],EDIT_MARKER=str(marker),REAL_NODE=node,CACHYMUSIC_SCAN_SESSION='c'*48)
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    base=f'http://127.0.0.1:{port}/php/api/';http=urllib.request.build_opener(urllib.request.ProxyHandler({}));children=[]
    def launch(args):
        p=subprocess.Popen(args,cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);children.append(p);return p
    def req(path,body=None,headers={}):
        r=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**headers})
        try:
            with http.open(r,timeout=12) as f:return f.status,f.read()
        except urllib.error.HTTPError as e:return e.code,e.read()
    def j(path,body=None):
        status,raw=req(path,body);return status,json.loads(raw)
    def wait(fn,timeout=10):
        end=time.monotonic()+timeout
        while time.monotonic()<end:
            try:
                v=fn()
                if v:return v
            except (OSError,ValueError):pass
            time.sleep(.03)
        raise AssertionError('Fixture timeout')
    def job(id,edit):return j('scan_jobs.php?metadata=1',{'action':'start','id':id,'edit':edit})
    def phase(id):return j('scan_jobs.php?id='+id)[1].get('phase')
    def result(id):return j('scan_jobs.php?id='+id+'&result=1')[1]
    def terminal(id):return wait(lambda: (p if (p:=phase(id)) in ('done','cancelled','uncertain') else None))
    def edit(title,write=True):return {'tid':tid,'title':title,'write_file':write}
    try:
        server=launch(['php','-S',f'127.0.0.1:{port}','index.php']);wait(lambda:req('launcher_health.php')[0]==200)
        # Fixture setup is an offline CLI operation; never bypass the managed HTTP contract.
        seed='require "php/api/scan.php";[, $body]=cachy_execute_scan([],'+json.dumps(str(music))+');echo $body;'
        scan=json.loads(subprocess.check_output(['php','-r',seed],cwd=root,env=env,timeout=20));assert scan['success'],scan
        tid=next(x['tid'] for x in scan['tracks'] if x['filename']=='edit.ogg');rangeid=next(x['tid'] for x in scan['tracks'] if x['filename']=='range.wav')
        lib=data/'library.json';payload=data/'scan-job-edit.json';original=lib.read_bytes()
        if not (root/'php/metadata_edit.php').exists():
            out=[];th=threading.Thread(target=lambda:out.append(j('metadata.php',edit('Baseline'))));th.start();wait(marker.exists);begin=time.monotonic();status,raw=req(f'stream.php?tid={rangeid}',headers={'Range':'bytes=0-31'});elapsed=time.monotonic()-begin;th.join();assert status==206 and raw==wav.read_bytes()[:32] and out[0][1]['tagWriteSuccess'] and pcm()==original_pcm,out
            print(f'BASELINE exact range waited {elapsed:.3f}s during tag rewrite');raise SystemExit(0)
        check('managed direct mutation rejected while worker absent',j('metadata.php',edit('bypass'))[0]==409 and lib.read_bytes()==original and not marker.exists())
        check('managed worker unavailable rejected without fallback',job('0'*32,edit('no worker'))[0]==503)
        worker=launch(['php','php/scan_worker.php']);wait(lambda:j('scan_jobs.php')[1].get('ready'))
        id='1'*32;body=edit('Background rewrite');check('edit queued',job(id,body)[0]==202);wait(marker.exists)
        check('publication cannot be cancelled',j('scan_jobs.php',{'action':'cancel','id':id})[0]==409)
        check('same request idempotent and different payload rejected',job(id,body)[0]==200 and job(id,edit('conflict'))[0]==409)
        begin=time.monotonic();status,raw=req(f'stream.php?tid={rangeid}',headers={'Range':'bytes=0-31'});elapsed=time.monotonic()-begin
        check('exact range available during slow original-file rewrite',status==206 and raw==wav.read_bytes()[:32] and elapsed<.8 and phase(id)=='committing');print(f'CANDIDATE exact range latency {elapsed:.3f}s')
        check('real writer completed and decoded audio unchanged',terminal(id)=='done' and result(id).get('tagWriteSuccess') and pcm()==original_pcm)
        check('successful payload removed and repeat returns original result',not payload.exists() and job(id,body)[0]==200 and result(id).get('tagWriteSuccess') and marker.read_text()=='x')
        # Paused worker allows deterministic queued cancellation and stale context tests.
        worker.send_signal(signal.SIGSTOP)
        id='2'*32;before=lib.read_bytes();assert job(id,edit('cancel',False))[0]==202
        check('queued cancel deletes payload without mutation',j('scan_jobs.php',{'action':'cancel','id':id})[0]==200 and phase(id)=='cancelled' and not payload.exists() and lib.read_bytes()==before)
        worker.send_signal(signal.SIGCONT);time.sleep(.1);worker.send_signal(signal.SIGSTOP)
        id='3'*32;assert job(id,edit('tamper',False))[0]==202;payload.write_bytes(b'{}');worker.send_signal(signal.SIGCONT)
        check('tampered payload cannot publish',terminal(id)=='done' and result(id).get('success') is False and lib.read_bytes()==before and not payload.exists())
        worker.send_signal(signal.SIGSTOP);id='4'*32;assert job(id,edit('stale',False))[0]==202
        os.utime(ogg,ns=(ogg.stat().st_atime_ns,ogg.stat().st_mtime_ns+2_000_000_000));worker.send_signal(signal.SIGCONT)
        check('changed recording version rejected',terminal(id)=='done' and result(id).get('success') is False and lib.read_bytes()==before)
        worker.send_signal(signal.SIGSTOP);id='5'*32;assert job(id,edit('stale record',False))[0]==202
        code='require "php/storage.php"; exit(Storage::updateTrackMetadata('+str(tid)+',["title"=>"Independent edit"])?0:1);'
        subprocess.run(['php','-r',code],cwd=root,env=env,check=True,timeout=10);independent=lib.read_bytes();worker.send_signal(signal.SIGCONT)
        check('changed library record rejected',terminal(id)=='done' and result(id).get('success') is False and lib.read_bytes()==independent)
        worker.send_signal(signal.SIGSTOP);id='6'*32;assert job(id,edit('do not replay',False))[0]==202;worker.kill();worker.wait(timeout=5)
        check('worker death marks edit uncertain',terminal(id)=='uncertain' and lib.read_bytes()==independent)
        worker=launch(['php','php/scan_worker.php']);wait(lambda:j('scan_jobs.php')[1].get('ready'))
        check('restart removes staged edit without replay',phase(id)=='uncertain' and not payload.exists() and lib.read_bytes()==independent)
        id='7'*32;assert job(id,edit('fresh',False))[0]==202
        check('new edit after restart succeeds',terminal(id)=='done' and result(id).get('success') and result(id)['track']['title']=='fresh')
        id='e'*32;assert job(id,{**edit('fractional track',False),'track_num':'3/12'})[0]==202
        check('fractional track number preserved in metadata and persistent library',terminal(id)=='done' and result(id)['track']['track_num']=='3/12' and json.loads(lib.read_bytes())['tracks'][str(tid)]['track_num']=='3/12')
        before=lib.read_bytes();id='8'*32;check('invalid write flag rejected without publication',job(id,{'tid':tid,'title':'bad','write_file':'true'})[0]==202 and terminal(id)=='done' and result(id).get('success') is False and lib.read_bytes()==before)
        def chunk(k,b):return struct.pack('>I',len(b))+k+b+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
        art=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0\xff\0\0'))+chunk(b'IEND',b'')
        id='9'*32;assert job(id,{**edit('Artwork',False),'cover_data':'data:image/png;base64,'+base64.b64encode(art).decode()})[0]==202
        check('managed artwork commit visible at authorized cover endpoint',terminal(id)=='done' and result(id).get('success') and req(f'cover.php?tid={tid}')==(200,art))
        other=t/'new-root';other.mkdir();worker.send_signal(signal.SIGSTOP);id='a'*32;assert job(id,edit('stale authority',False))[0]==202
        code='require "php/storage.php";exit(Storage::setDefaultDirectory('+json.dumps(str(other))+')?0:1);'
        subprocess.run(['php','-r',code],cwd=root,env=env,check=True,timeout=10);before=lib.read_bytes();worker.send_signal(signal.SIGCONT)
        check('revoked authority rejects queued edit',terminal(id)=='done' and result(id).get('success') is False and lib.read_bytes()==before)
        check('revoked authority rejects new edit submission',job('b'*32,edit('denied',False))[0]==403)
    finally:
        for p in reversed(children):
            if p.poll() is None:
                p.send_signal(signal.SIGCONT);p.terminate()
                try:p.wait(timeout=5)
                except subprocess.TimeoutExpired:p.kill();p.wait()
print(f'{sum(checks)}/{len(checks)} passed');raise SystemExit(0 if all(checks) else 1)
