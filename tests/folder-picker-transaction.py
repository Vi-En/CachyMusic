"""Actual single-threaded PHP: read-only chooser, range serving, root compare-and-set and playlist boundaries."""
import json, os, pathlib, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error, wave, threading
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
if os.name!='posix': print('SKIP POSIX fake chooser fixture');raise SystemExit(0)
if not __debug__:raise SystemExit('Assertions required')
checks=[]
def check(name,ok):
    checks.append(bool(ok));print(('PASS ' if ok else 'FAIL ')+name,flush=True)
with tempfile.TemporaryDirectory() as tmp:
    t=pathlib.Path(tmp);music=t/'music';chosen=t/'chosen';tools=t/'bin';data=t/'data';marker=t/'picker.log';music.mkdir();chosen.mkdir();tools.mkdir()
    with wave.open(str(music/'test.wav'),'wb') as w:w.setparams((1,2,8000,8000,'NONE','none'));w.writeframes(bytes(range(256))*62+bytes(128))
    old=music/'test.wav';(chosen/'other.wav').write_bytes(old.read_bytes())
    picker=tools/'zenity';picker.write_text('#!/bin/sh\nprintf x >> "$PICKER_MARKER"\nsleep 1\nprintf "%s\\n" "$PICKER_CHOICE"\n');picker.chmod(0o700)
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_')) and k!='PHP_CLI_SERVER_WORKERS'};env.update(HOME=tmp,USERPROFILE=tmp,PATH=str(tools)+os.pathsep+env['PATH'],CACHYMUSIC_DATA_DIR=str(data),CACHYMUSIC_CACHE_DIR=str(t/'cache'),PICKER_MARKER=str(marker),PICKER_CHOICE=str(chosen))
    children=[]
    def launch(args,extra):
        p=subprocess.Popen(args,env={**env,**extra},cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);children.append(p);return p
    def server(extra):
        with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
        p=launch(['php','-S',f'127.0.0.1:{port}','index.php'],extra);return p,f'http://127.0.0.1:{port}/php/api/'
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def raw(base,path,body=None,headers={},method=None):
        req=urllib.request.Request(base+path,data=body,headers=headers,method=method)
        try:
            with opener.open(req,timeout=8) as f:return f.status,f.read()
        except urllib.error.HTTPError as e:return e.code,e.read()
    def j(base,path,body=None):
        code,out=raw(base,path,None if body is None else json.dumps(body).encode(),{'Content-Type':'application/json'});return code,json.loads(out)
    def wait(fn,seconds=8):
        end=time.monotonic()+seconds
        while time.monotonic()<end:
            try:
                v=fn()
                if v:return v
            except (OSError,ValueError):pass
            time.sleep(.03)
        raise AssertionError('fixture wait expired')
    try:
        p,base=server({});wait(lambda:j(base,'launcher_health.php')[0]==200)
        scan=j(base,'scan.php',{'directory':str(music)})[1];assert scan['success'];tid=scan['tracks'][0]['tid'];lib=data/'library.json';original=lib.read_bytes()
        code,out=j(base,'browse_folder.php',{'initialDir':str(music)});check('legacy chooser selects without publishing root',code==200 and out.get('directory')==str(chosen) and lib.read_bytes()==original)
        # restore baseline after the legacy implementation mutates it
        if lib.read_bytes()!=original:lib.write_bytes(original)
        code,out=j(base,'scan.php',{'directory':str(chosen),'expectedDirectory':str(t/'wrong')});check('stale explicit root rejected without mutation',code==409 and out.get('code')=='root_changed' and lib.read_bytes()==original)
        if lib.read_bytes()!=original:lib.write_bytes(original)
        code,out=j(base,'scan.php',{'directory':str(chosen),'preserveDirectory':'false'});check('malformed preserve flag rejected',code==400 and lib.read_bytes()==original)
        if lib.read_bytes()!=original:lib.write_bytes(original)
        for name,body,status in [('array playlist name',{'action':'create','name':['bad']},400),('nested track id',{'action':'create','name':'bad','tracks':[[1]]},400),('NUL name',{'action':'create','name':'bad\0name'},400),('oversized request',{'action':'create','name':'x'*1050000},413),('array action',{'action':['create'],'name':'bad'},400)]:
            code,out=j(base,'playlists.php',body);check(name+' rejected',code==status and lib.read_bytes()==original)
            if lib.read_bytes()!=original:lib.write_bytes(original)
        code,_=raw(base,'playlists.php',b'{',{'Content-Type':'application/json'});check('invalid JSON rejected',code==400)
        p.terminate();p.wait(timeout=5);marker.unlink(missing_ok=True)
        session='b'*48;extra={'CACHYMUSIC_SCAN_SESSION':session};p,base=server(extra);wait(lambda:j(base,'launcher_health.php')[0]==200);worker=launch(['php','php/scan_worker.php'],extra);wait(lambda:j(base,'scan_jobs.php')[1].get('ready'))
        if not (root/'php/folder_picker.php').exists():
            result=[];th=threading.Thread(target=lambda:result.append(j(base,'browse_folder.php',{'initialDir':str(music)})));th.start();wait(marker.exists);begin=time.monotonic();code,out=raw(base,f'stream.php?tid={tid}',headers={'Range':'bytes=0-31'});elapsed=time.monotonic()-begin;th.join();print(f'BASELINE picker range {elapsed:.3f}s HTTP {code} exact={out==old.read_bytes()[:32]}');check('picker leaves root and exact old stream available',code==206 and out==old.read_bytes()[:32] and lib.read_bytes()==original);raise SystemExit(1 if not all(checks) else 0)
        code,_=j(base,'browse_folder.php',{'initialDir':str(music)});check('managed direct blocking picker rejected',code==409 and not marker.exists())
        id='1'*32;body={'action':'start','id':id,'directory':str(music),'preserveDirectory':True,'kind':'browse'}
        check('picker queued in managed worker',j(base,'scan_jobs.php',body)[0]==202);wait(marker.exists)
        begin=time.monotonic();code,out=raw(base,f'stream.php?tid={tid}',headers={'Range':'bytes=0-31'});elapsed=time.monotonic()-begin
        check('picker does not block exact range response',code==206 and out==old.read_bytes()[:32] and elapsed<.8);print(f'CANDIDATE picker range {elapsed:.3f}s HTTP {code}')
        wait(lambda:j(base,'scan_jobs.php?id='+id)[1].get('phase')=='done');code,out=j(base,'scan_jobs.php?id='+id+'&result=1');check('managed picker result is read-only',code==200 and out.get('directory')==str(chosen) and lib.read_bytes()==original)
        id='2'*32;marker.unlink();body['id']=id;assert j(base,'scan_jobs.php',body)[0]==202;wait(marker.exists);assert j(base,'scan_jobs.php',{'action':'cancel','id':id})[0]==200
        wait(lambda:j(base,'scan_jobs.php?id='+id)[1].get('phase')=='cancelled');check('cancelled picker preserves root',lib.read_bytes()==original)
        id='3'*32;check('managed stale root precondition accepted for worker evaluation',j(base,'scan_jobs.php',{'action':'start','id':id,'directory':str(chosen),'preserveDirectory':False,'expectedDirectory':str(t/'wrong')})[0]==202)
        wait(lambda:j(base,'scan_jobs.php?id='+id)[1].get('phase')=='done');code,out=j(base,'scan_jobs.php?id='+id+'&result=1');check('worker rejects stale root before publication',code==200 and out.get('code')=='root_changed' and lib.read_bytes()==original)
    finally:
        for p in reversed(children):
            if p.poll() is None:
                p.terminate()
                try:p.wait(timeout=5)
                except subprocess.TimeoutExpired:p.kill();p.wait()
print(f'{sum(checks)}/{len(checks)} passed');raise SystemExit(0 if all(checks) else 1)
