"""Real loopback PHP/launcher integration; runs on Linux and Windows without a browser."""
from pathlib import Path
import json, os, secrets, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error, urllib.parse, wave
root = Path(__file__).resolve().parents[1]
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def run(*args, env=None, check=True):
    return subprocess.run(args, cwd=root, env=env, check=check, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)

# Exercise Windows comparison rules on every host; actual Windows filesystem is a separate CI gate.
script = r'''require 'php/platform.php';
if (!cachy_path_within('c:\Users\Music\a.wav','C:/users/music',true)) exit(1);
if (cachy_path_within('c:\Users\Music-other\a.wav','C:/users/music',true)) exit(2);
if (cachy_path_within('/home/Case/file','/home/case',false)) exit(3);
if (!cachy_path_within('/home/Case/file','/home/Case',false)) exit(4);
if (cachy_run_args([PHP_BINARY,'-r','echo $argv[1];',$argv[1]]) !== $argv[1]) exit(5);
'''
run('php','-r',script,'a path with spaces % ! &')
print('PASS canonical Windows/POSIX path boundary and direct subprocess arguments')
with tempfile.TemporaryDirectory(prefix='cachy compat ') as tmp:
    tmp=Path(tmp)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
        env={**os.environ, 'XDG_STATE_HOME':str(tmp/'state'), 'LOCALAPPDATA':str(tmp/'state'), 'HOME':str(tmp), 'USERPROFILE':str(tmp), 'CACHYMUSIC_DATA_DIR':str(tmp/'data'), 'CACHYMUSIC_CACHE_DIR':str(tmp/'cache'), 'CACHY_PORT':str(port), 'CACHYMUSIC_MPRIS':'0'}
        # No service may be substituted for the real backend.
        sock.listen()
        args=(sys.executable,str(root/'bin/desktop-launcher.py'))
        result=run(*args,'--background',env=env,check=False)
        assert result.returncode != 0,(result.stdout,result.stderr)
    print('PASS occupied-port failure; no arbitrary service reuse')
    # Explicit invalid storage must fail before starting a backend or creating a fallback.
    bad=tmp/'not-a-directory';bad.write_text('keep me')
    for key in ('CACHYMUSIC_DATA_DIR','CACHYMUSIC_CACHE_DIR'):
        rejected=run(*args,'--background',env={**env,key:str(bad)},check=False)
        assert rejected.returncode!=0,(key,rejected.stdout,rejected.stderr)
        assert 'No managed' in run(*args,'--status',env=env).stdout
        assert bad.read_text()=='keep me'
        assert not (tmp/'.local/share/cachymusic').exists()
    print('PASS invalid explicit storage fails closed without fallback')
    corrupt=tmp/'corrupt-data';corrupt.mkdir();(corrupt/'library.json').write_text('{broken')
    rejected=run(*args,'--background',env={**env,'CACHYMUSIC_DATA_DIR':str(corrupt)},check=False)
    assert rejected.returncode!=0 and (corrupt/'library.json').read_text()=='{broken'
    assert 'No managed' in run(*args,'--status',env=env).stdout
    print('PASS malformed existing library rejected and preserved')
    oversize=tmp/'oversized-data';oversize.mkdir();oversize_library=oversize/'library.json'
    oversize_library.write_text(json.dumps({'tracks':{},'playlists':[],'padding':'x'*2048}));old=oversize_library.read_bytes()
    rejected=run(*args,'--background',env={**env,'CACHYMUSIC_DATA_DIR':str(oversize),'CACHYMUSIC_LIBRARY_MAX_BYTES':'1024'},check=False)
    try:assert rejected.returncode!=0 and oversize_library.read_bytes()==old
    finally:
        if rejected.returncode==0:run(*args,'--stop',env={**env,'CACHYMUSIC_DATA_DIR':str(oversize)},check=False)
    print('PASS configured library byte limit enforced before launching services')

    music=tmp/'Music é 音楽';music.mkdir()
    song=music/'Track 100% !.wav'
    with wave.open(str(song),'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000);w.writeframes(bytes(16000))
    def request(path, body=None, headers=None):
        h=dict(headers or {})
        if body is not None:h['Content-Type']='application/json'
        req=urllib.request.Request(f'http://127.0.0.1:{port}{path}',data=json.dumps(body).encode() if body is not None else None,headers=h)
        with http.open(req,timeout=15) as r:return r.status,r.read(),r.headers
    def managed_scan(directory=''):
        deadline=time.monotonic()+15
        while not json.loads(request('/php/api/scan_jobs.php')[1]).get('ready'):
            assert time.monotonic()<deadline;time.sleep(.05)
        job=secrets.token_hex(16)
        start=json.loads(request('/php/api/scan_jobs.php',{'action':'start','id':job,'directory':directory,'preserveDirectory':False})[1]);assert start['id']==job
        while True:
            phase=json.loads(request('/php/api/scan_jobs.php?id='+job)[1])['phase']
            if phase=='done':return json.loads(request('/php/api/scan_jobs.php?id='+job+'&result=1')[1])
            assert phase in ('queued','running','committing') and time.monotonic()<deadline,phase;time.sleep(.05)
    try:
        result=run(*args,'--background',env=env)
        assert str(port) in result.stdout,result.stdout
        assert 'running' in run(*args,'--status',env=env).stdout
        h=json.loads(request('/php/api/launcher_health.php')[1]); assert h['app']=='CachyMusic' and len(h['instance'])==48
        run(*args,'--background',env=env)
        assert json.loads(request('/php/api/launcher_health.php')[1])==h
        for key,value in [('CACHY_PORT',str(port+1 if port<65535 else port-1)),('CACHYMUSIC_DATA_DIR',str(tmp/'different-data')),('CACHYMUSIC_CACHE_DIR',str(tmp/'different-cache'))]:
            rejected=run(*args,'--background',env={**env,key:value},check=False)
            assert rejected.returncode!=0 and 'different' in rejected.stderr,(key,rejected.stderr)
            assert json.loads(request('/php/api/launcher_health.php')[1])==h
        session=(tmp/'state'/'CachyMusic'/'Launcher' if os.name=='nt' else tmp/'state'/'cachymusic')/'launcher-session.json'
        saved=json.loads(session.read_text())
        assert saved['version']==json.loads((root/'package.json').read_text())['version']
        for changes in ({'version':'old-version'},{'root':str(tmp/'other-build')}):
            session.write_text(json.dumps({**saved,**changes}))
            rejected=run(*args,'--background',env=env,check=False)
            assert rejected.returncode!=0 and 'different CachyMusic build' in rejected.stderr,rejected.stderr
        session.write_text(json.dumps(saved))
        print('PASS old build, changed origin and changed storage are refused without replacing active service')

        capability=json.loads(request('/php/api/lan_info.php')[1]); assert capability['osFamily']==('windows' if os.name=='nt' else 'linux');assert capability['lanUrl'] is None
        if os.name=='nt':assert capability['hardwareGain'] is False
        assert request('/scripts/modules/audio-engine.js')[0]==200
        try: request('/php/platform.php');raise AssertionError('Private helper served')
        except urllib.error.HTTPError as e:assert e.code==404
        data=managed_scan(str(music));assert data.get('success') and data['count']==1,data
        try:request('/php/api/tracks.php',headers={'If-None-Match':'"tracks-legacy"'});raise AssertionError('Managed legacy scan accepted')
        except urllib.error.HTTPError as e:assert e.code==409 and 'no-store' in e.headers.get('Cache-Control','')
        assert managed_scan()['success']
        path='/php/api/stream.php?path='+urllib.parse.quote(str(song),safe='')
        code,content,headers=request(path,headers={'Range':'bytes=0-43'});assert code==206 and content==song.read_bytes()[:44],(code,content)
        token=headers.get('X-Cachy-Media-Version');assert token and len(token)==64
        assert request(path,headers={'Range':'bytes=44-55','X-Cachy-Media-Version':token})[1]==song.read_bytes()[44:56]
        replacement=song.with_suffix('.tmp');replacement.write_bytes(song.read_bytes()[:-2]+b'\x01\x02');old_mtime=song.stat().st_mtime;os.utime(replacement,(old_mtime+5,old_mtime+5));replacement.replace(song)
        for range_value,expected,status in [('bytes=44-55',token,412),('bytes=-','',416),('bytes=0-1,4-5','',416),('bytes=0-1junk','',416)]:
            try:request(path,headers={'Range':range_value,'X-Cachy-Media-Version':expected});raise AssertionError('Invalid range/version accepted')
            except urllib.error.HTTPError as e:assert e.code==status,(e.code,status)
        assert request(path,headers={'Range':'bytes=0-43'})[2]['X-Cachy-Media-Version']!=token
        print('PASS same-size media replacement rejected and malformed/multiple ranges denied')
        # A replacement with a preserved mtime but different length must invalidate metadata.
        assert managed_scan(str(music)).get('success')
        same_mtime=song.stat().st_mtime
        with wave.open(str(song),'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000);w.writeframes(bytes(32000))
        os.utime(song,(same_mtime,same_mtime))
        refreshed=managed_scan(str(music));assert refreshed.get('success')
        track=managed_scan()['tracks'][0]
        assert abs(float(track['duration'])-2)<.01,track
        print('PASS same-mtime changed-size metadata refreshed')
        deadline=time.monotonic()+5
        while True:
            cap=json.loads(request('/php/api/scan_jobs.php')[1])
            if cap.get('ready'):break
            assert time.monotonic()<deadline,cap;time.sleep(.1)
        assert cap['enabled'] is True
        job_id='a'*32
        queued=json.loads(request('/php/api/scan_jobs.php',{'action':'start','id':job_id,'directory':str(music),'preserveDirectory':False})[1]);assert queued['id']==job_id
        deadline=time.monotonic()+15
        while True:
            phase=json.loads(request('/php/api/scan_jobs.php?id='+job_id)[1])['phase']
            if phase=='done':break
            assert phase in ('queued','running','committing') and time.monotonic()<deadline,phase;time.sleep(.1)
        result=json.loads(request('/php/api/scan_jobs.php?id='+job_id+'&result=1')[1]);assert result['success'] and result['count']==1
        print('PASS actual managed asynchronous worker ownership and Unicode scan result')
        print('PASS managed startup, identity reuse, platform capability discovery, private route denial, Unicode WAV indexing and exact HTTP Range bytes')
    finally:
        stopped=run(*args,'--stop',env=env,check=False)
        assert stopped.returncode==0,(stopped.stdout,stopped.stderr)
    assert 'No managed' in run(*args,'--status',env=env).stdout
    try:request('/php/api/launcher_health.php');raise AssertionError('Backend still running')
    except OSError:pass
    print('PASS owned shutdown and status')
