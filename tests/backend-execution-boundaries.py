"""Actual PHP subprocess and HTTP boundaries; no physical mixer operations."""
import json, os, pathlib, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error, wave
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
if not __debug__: raise SystemExit('Assertions required')
if os.name!='posix': print('SKIP POSIX disposable mixer fixture'); raise SystemExit(0)
import fcntl
checks=[]
def check(name, ok):
    checks.append(bool(ok));print(('PASS ' if ok else 'FAIL ')+name,flush=True)
with tempfile.TemporaryDirectory() as tmp:
    t=pathlib.Path(tmp); music=t/'music';music.mkdir();outside=t/'outside.wav';state=t/'state'/'cachymusic';state.mkdir(parents=True); tools=t/'bin';tools.mkdir();log=t/'mixer.log'
    with wave.open(str(outside),'wb') as w:w.setparams((1,2,8000,8000,'NONE','none'));w.writeframes(bytes(16000))
    (music/'real.wav').write_bytes(outside.read_bytes());(music/'alias.wav').symlink_to(outside)
    mixer=tools/'wpctl';mixer.write_text('#!/bin/sh\ncase "$1" in\nget-volume) echo "Volume: 0.50";;\ninspect) echo \'node.description = "Fixture"\';;\nset-volume|set-mute) printf "%s\\n" "$*" >> "$CM_TEST_MIXER_LOG";;\n*) exit 1;;\nesac\n');mixer.chmod(0o700)
    dialog=tools/'zenity';dialog.write_text('#!/bin/sh\nexit 1\n');dialog.chmod(0o700)
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))};env.update(HOME=tmp,USERPROFILE=tmp,XDG_STATE_HOME=str(t/'state'),CACHYMUSIC_DATA_DIR=str(t/'data'),CACHYMUSIC_CACHE_DIR=str(t/'cache'),CACHYMUSIC_PACKAGED='1',PATH=str(tools)+os.pathsep+env['PATH'],CM_TEST_MIXER_LOG=str(log))
    require='require '+json.dumps(str(root/'php/platform.php'))+'; '
    def php(code):
        return subprocess.run(['php','-n','-r',require+code],env=env,capture_output=True,text=True,timeout=5)
    p=php('echo json_encode(cachy_run_args([PHP_BINARY,"-n","-r","echo str_repeat(\\"x\\", 16);"],16));');check('exact stdout cap accepted',p.returncode==0 and json.loads(p.stdout)=='x'*16)
    p=php('echo json_encode(cachy_run_args([PHP_BINARY,"-n","-r","echo str_repeat(\\"x\\", 17);"],16));');check('oversized stdout rejected',p.returncode==0 and p.stdout=='null')
    p=php('echo json_encode(cachy_run_args([PHP_BINARY,"-n","-r","fwrite(STDERR,str_repeat(\\"x\\",4096));echo \\"ok\\";"],16));');check('oversized stderr rejected',p.returncode==0 and p.stdout=='null')
    start=time.monotonic();p=php('echo json_encode(cachy_run_args([PHP_BINARY,"-n","-r","usleep(1200000);echo \\"late\\";"],16,0.15));');check('monotonic child deadline',p.returncode==0 and p.stdout=='null' and time.monotonic()-start<0.8)
    p=php('echo json_encode(cachy_run_args([PHP_BINARY,"-n","-r","echo \\"partial\\";exit(7);"],16));');check('nonzero exit rejected',p.returncode==0 and p.stdout=='null')
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    proc=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','-t',str(root),str(root/'index.php')],env=env,cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    client=urllib.request.build_opener(urllib.request.ProxyHandler({}));base=f'http://127.0.0.1:{port}/php/api/'
    def req(path,body=None,method=None):
        data=None if body is None else json.dumps(body).encode();r=urllib.request.Request(base+path,data=data,method=method,headers={'Content-Type':'application/json'})
        try:
            with client.open(r,timeout=8) as f:return f.status,json.loads(f.read())
        except urllib.error.HTTPError as e:
            try:return e.code,json.loads(e.read())
            except ValueError:return e.code,None
        except (ValueError, OSError):return 0,None
    try:
        for _ in range(100):
            if req('launcher_health.php')[0]==200:break
            time.sleep(.03)
        hw='hardware_volume.php?action='
        r=req(hw+'status');check('fixture mixer status',r[0]==200 and r[1].get('available') and r[1].get('volume')==.5)
        r=req(hw+'set_volume&volume=1.25');check('GET cannot mutate mixer',r[0]==405 and not log.exists())
        r=req(hw+'set_volume',{'volume':1e308});check('out-of-range volume rejected',r[0]==400)
        r=req(hw+'toggle_mute',{'muted':'garbage'});check('malformed mute rejected',r[0]==400)
        r=req(hw+'set_volume',{'volume':.6});check('valid explicit mixer update',r[0]==200 and r[1]['success'] and 'set-volume @DEFAULT_AUDIO_SINK@ 0.60' in log.read_text())
        check('GET cannot change scan directory',req('scan.php?directory='+urllib.parse.quote(str(music),safe=''))[0]==405)
        r=req('scan.php',{'directory':['bad']});check('malformed scan input rejected',r[0]==400)
        r=req('scan.php',{'directory':str(music)});check('scan excludes outside symlink',r[0]==200 and r[1]['success'] and r[1]['count']==1 and r[1]['tracks'][0]['filename']=='real.wav')
        def head(path):
            try:
                with client.open(urllib.request.Request(base+path,method='HEAD'),timeout=5) as f:return f.status
            except urllib.error.HTTPError as e:return e.code
        check('stream rejects overflowing IDs',head('stream.php?tid=92233720368547758080')==400)
        check('stream rejects conflicting ID aliases',head('stream.php?tid=1&id=1')==400)
        check('stream rejects embedded NUL paths',head('stream.php?path=x%00y')==400)
        tid=next(track['tid'] for track in r[1]['tracks'] if track['filename']=='real.wav')
        def exact_range(id):
            try:
                with client.open(urllib.request.Request(base+'stream.php?tid='+str(id),headers={'Range':'bytes=0-43'}),timeout=5) as f:return f.status==206 and f.read()==(music/'real.wav').read_bytes()[:44] and bool(f.headers.get('X-Cachy-Media-Version'))
            except (ValueError,OSError):return False
        check('stream accepts valid indexed track with exact range bytes',exact_range(tid))
        idx=t/'data'/'cover-index-v1'/f'{tid%64}.idx';old_index=idx.read_bytes() if idx.exists() else None
        other=t/'other';other.mkdir()
        assert req('scan.php',{'directory':str(other)})[1]['success']
        check('stream denies previously authorized track after root revocation',head('stream.php?tid='+str(tid))==403)
        if old_index is not None:idx.write_bytes(old_index)
        check('stream rejects stale index replay after root revocation',head('stream.php?tid='+str(tid))==403)
        assert req('scan.php',{'directory':str(music)})[1]['success']
        if idx.exists():idx.write_bytes(b'corrupt fixture')
        check('stream recovers corrupt lookup without changing valid media',exact_range(tid))
        check('GET cannot open native folder chooser',req('browse_folder.php')[0]==405)
        r=req('browse_folder.php',{'initialDir':['bad']});check('malformed folder input rejected',r[0]==400)
        mp='mpris_state.php?action='
        r=req(mp+'send_command',{'command':'unknown'});check('unknown MPRIS command rejected',r[0]==400)
        r=req(mp+'send_command',{'command':'SetVolume','volume':99});check('out-of-range MPRIS volume rejected',r[0]==400)
        r=req(mp+'send_command',{'command':'Next'});check('valid command published',r[0]==200 and r[1]['success'])
        r=req(mp+'get_command');check('GET cannot consume command',r[0]==405)
        owner='a'*32; r=req(mp+'get_command',{'client':owner});check('POST claims command then acknowledges exactly once',r[0]==200 and r[1].get('command')=='Next' and req(mp+'ack_command',{'client':owner,'id':r[1]['id'],'outcome':'dispatched'})[0]==200 and req(mp+'get_command',{'client':owner})[1].get('command') is None)
        lock=(state/'mpris_command.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        try:check('competing mailbox lock rejects write',req(mp+'send_command',{'command':'Next'})[0]==503)
        finally:lock.close()
        payload={'status':'Playing','position':1,'duration':2,'volume':.5,'title':'Fixture'}
        r=req(mp+'update_state',payload);check('valid state published',r[0]==200 and r[1]['success'])
        dest=state/'mpris_player_state.json';dest.unlink();dest.mkdir()
        r=req(mp+'update_state',payload);check('failed state write not reported successful',r[0]==503)
        dest.rmdir()
    finally:proc.terminate();proc.wait(timeout=5)
print(f'{sum(checks)}/{len(checks)} passed');raise SystemExit(0 if all(checks) else 1)
