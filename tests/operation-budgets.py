"""Local scan publication and subprocess resource boundaries, disposable profiles."""
import json, os, pathlib, subprocess, sys, tempfile, time, wave
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
if not __debug__: raise SystemExit('Assertions required')
if os.name!='posix': print('SKIP POSIX disposable scan and process fixture');raise SystemExit(0)
checks=[]
def check(name,ok):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+name,flush=True)
with tempfile.TemporaryDirectory() as tmp:
    base=pathlib.Path(tmp);data=base/'data'; old=base/'old'; new=base/'new'; deep=base/'deep'
    for p in [old,new,deep]:p.mkdir()
    def wav(path):
        with wave.open(str(path),'wb') as w:w.setparams((1,2,8000,8000,'NONE','none'));w.writeframes(bytes(16000))
    wav(old/'old.wav');wav(new/('a'*100+'.wav'));wav(new/('b'*100+'.wav'))
    for i in range(3):(new/f'entry{i}.txt').write_text('ignored')
    d=deep
    for i in range(14):d=d/'d';d.mkdir()
    wav(d/'deep.wav')
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))}
    env.update(HOME=tmp,USERPROFILE=tmp,CACHYMUSIC_DATA_DIR=str(data),CACHYMUSIC_CACHE_DIR=str(base/'cache'))
    api=json.dumps(str(root/'php/api/scan.php'))
    def scan(path,**limits):
        code='$_SERVER["SCRIPT_FILENAME"]="scan.php";$_SERVER["REQUEST_METHOD"]="POST";$_POST=["directory"=>'+json.dumps(str(path))+'];require '+api+';'
        p=subprocess.run(['php','-n','-r',code],env={**env,**limits},capture_output=True,text=True,timeout=20)
        try:return json.loads(p.stdout)
        except ValueError:return {'error':p.stdout[:100],'stderr':p.stderr[:100]}
    assert scan(old)['success'];lib=data/'library.json';baseline=lib.read_bytes()
    for name,limits,path in [('track ceiling',{'CACHYMUSIC_SCAN_TRACKS':'1'},new),('entry ceiling',{'CACHYMUSIC_SCAN_ENTRIES':'2'},new),('response ceiling',{'CACHYMUSIC_SCAN_BYTES':'1024'},new),('depth ceiling',{},deep),('invalid administrator config',{'CACHYMUSIC_SCAN_SECONDS':'nonsense'},new)]:
        lib.write_bytes(baseline);r=scan(path,**limits)
        check(name+' fails without publishing any local state',r.get('success') is False and r.get('code')=='scan_budget' and lib.read_bytes()==baseline)
    if os.name=='posix':
        import fcntl
        lib.write_bytes(baseline)
        with (data/'scan.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            r=scan(new);check('second scan refuses occupied profile lock',r.get('success') is False and lib.read_bytes()==baseline)
    # Fake probe monopolizes the per-file deadline; the entire local scan must fail closed.
    lib.write_bytes(baseline)
    tools=base/'bin';tools.mkdir();probe=tools/'ffprobe';probe.write_text('#!/bin/sh\nsleep 4\n');probe.chmod(0o700)
    start=time.monotonic();r=scan(new,CACHYMUSIC_SCAN_SECONDS='1',PATH=str(tools)+os.pathsep+env['PATH']);elapsed=time.monotonic()-start
    check('whole-scan deadline bounds probe and preserves prior library',r.get('success') is False and r.get('code')=='scan_budget' and lib.read_bytes()==baseline and elapsed<2.5)
    lib.write_bytes(baseline);r=scan(new,CACHYMUSIC_SCAN_TRACKS='2')
    check('exact track ceiling accepted and directory committed with records',r.get('success') is True and r.get('count')==2 and json.loads(lib.read_bytes())['default_directory']==str(new))
    # Read-only scan whose root was changed after snapshot cannot publish stale IDs.
    require='require '+json.dumps(str(root/'php/storage.php'))+'; '
    code=require+'Storage::beginBatch();$p=getenv("CACHYMUSIC_DATA_DIR")."/library.json";$d=json_decode(file_get_contents($p),true);$d["default_directory"]="/changed";file_put_contents($p,json_encode($d));echo json_encode(Storage::commitBatch(true));'
    p=subprocess.run(['php','-n','-r',code],env=env,capture_output=True,text=True,timeout=5)
    check('read-only scan rejects concurrent root change',p.stdout=='false')
    # A scan with only a provisional directory change must also reject stale track IDs.
    code=require+'Storage::beginBatch();Storage::setDefaultDirectory("/new-root");$p=getenv("CACHYMUSIC_DATA_DIR")."/library.json";$d=json_decode(file_get_contents($p),true);$d["tracks"]=[];file_put_contents($p,json_encode($d));echo json_encode(Storage::commitBatch(true));'
    p=subprocess.run(['php','-n','-r',code],env=env,capture_output=True,text=True,timeout=5)
    check('directory-only commit rejects concurrent track change',p.stdout=='false' and json.loads(lib.read_bytes())['default_directory']=='/changed')
    require='require '+json.dumps(str(root/'php/platform.php'))+'; '

    def process(args,cap=1024,timeout=2,normal=False):
        # Python supplies JSON rather than embedding shell syntax in a child command.
        code=require+'echo json_encode(cachy_run_process(json_decode('+json.dumps(json.dumps(args))+',true),'+str(cap)+','+str(timeout)+'));'
        # PHP double-quoted string can interpolate $; fixture arguments contain no dollars.
        p=subprocess.run(['php']+([] if normal else ['-n'])+['-r',code],env=env,capture_output=True,text=True,timeout=6)
        try:return json.loads(p.stdout)
        except ValueError:return {'error':p.stderr}
    if sys.platform.startswith('linux'):
        # Use the native descriptor probe, without Python interpreter startup.
        r=process(['/usr/bin/readlink','/proc/self/fd/1'])
        if not (r and r.get('stdout','').startswith('pipe:')): print('Descriptor probe diagnostic:',repr(r),flush=True)
        check('POSIX subprocess stdout is a pipe, not a disk spool',bool(r and r.get('stdout','').startswith('pipe:')))
        r=process([sys.executable,'-S','-c','import sys; sys.stdout.write("x"*65536); sys.stderr.write("y"*65536)'],65536)
        check('simultaneous exact output limits preserve all bytes',bool(r and r.get('stdout')=='x'*65536 and r.get('stderr')=='y'*65536))
        r=process([sys.executable,'-S','-c','import sys; sys.stderr.write("x"*2000000)'],32)
        check('stderr flood rejected',r is None)
        have_group=subprocess.run(['php','-r','echo (int)(function_exists("posix_getpgid")&&function_exists("posix_kill")&&is_executable("/usr/bin/setsid"));'],capture_output=True,text=True).stdout=='1'
        if have_group:
            marker=base/'escaped';child='import time,pathlib;time.sleep(0.8);pathlib.Path('+repr(str(marker))+').write_text("escaped")'
            parent='import subprocess,sys,time;subprocess.Popen([sys.executable,"-c",'+repr(child)+']);time.sleep(3)'
            control=process([sys.executable,'-c',parent],1024,5,normal=True);assert control and control['exitcode']==0 and marker.exists(), 'Invalid process-group positive control';marker.unlink()
            r=process([sys.executable,'-c',parent],1024,.25,normal=True);time.sleep(1)
            check('Linux timed-out live leader and ordinary descendants terminated',r is None and not marker.exists())
print(f'{sum(checks)}/{len(checks)} passed');raise SystemExit(0 if all(checks) else 1)
