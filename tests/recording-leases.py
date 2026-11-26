#!/usr/bin/env python3
"""Real local HTTP and filesystem checks; no physical playback claim."""
import json,os,pathlib,socket,subprocess,tempfile,time,urllib.request,urllib.error,wave,sys
root=pathlib.Path(__file__).resolve().parents[1]
if not __debug__: raise SystemExit('Assertions required')
with tempfile.TemporaryDirectory() as tmp:
    t=pathlib.Path(tmp);music=t/'music';music.mkdir();data=t/'data';wav=music/'test.wav'
    with wave.open(str(wav),'wb') as w:w.setparams((1,2,8000,8000,'NONE','none'));w.writeframes(bytes(16000))
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_')) and k!='PHP_CLI_SERVER_WORKERS'}
    env.update(HOME=tmp,USERPROFILE=tmp,CACHYMUSIC_DATA_DIR=str(data),CACHYMUSIC_CACHE_DIR=str(t/'cache'))
    seed='require "php/api/scan.php";[, $body]=cachy_execute_scan([],'+json.dumps(str(music))+');echo $body;'
    scan=json.loads(subprocess.check_output(['php','-r',seed],cwd=root,env=env,timeout=30));assert scan['success'],scan
    tid=scan['tracks'][0]['tid'];path=scan['tracks'][0]['fullPath'];journal=data/'recording-leases.json';lib=data/'library.json';original=lib.read_bytes();original_audio=wav.read_bytes()
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    server=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','index.php'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    http=urllib.request.build_opener(urllib.request.ProxyHandler({}));base=f'http://127.0.0.1:{port}/php/api/'
    def req(route,body=None,headers=None):
        r=urllib.request.Request(base+route,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(headers or {})})
        try:
            with http.open(r,timeout=10) as f:return f.status,f.read()
        except urllib.error.HTTPError as e:return e.code,e.read()
    def renew(owner,**overrides):return req('recording_lease.php',{'action':'renew','owner':owner,'tid':tid,'path':path,**overrides})[0]
    def release(owner):return req('recording_lease.php',{'action':'release','owner':owner})[0]
    def edit(title):return req('metadata.php',{'tid':tid,'title':title,'write_file':True})
    def check(name,condition):
        assert condition,name
        print('PASS '+name,flush=True)
    try:
        for i in range(100):
            try:
                if req('launcher_health.php')[0]==200:break
            except OSError:time.sleep(.03)
        else:raise AssertionError('Server startup')
        a='a'*32;b='b'*32
        check('method and media identity validation',req('recording_lease.php')[0]==405 and renew('bad')==400 and renew(a,path=path+'x')==409 and renew(a,tid='0')==400)
        check('two clients reserve same recording',renew(a)==200 and renew(b)==200 and len(json.loads(journal.read_bytes())['leases'])==2)
        check('journal stores hashes not file paths',path.encode() not in journal.read_bytes())
        check('active reservations reject original edits before library mutation',edit('blocked')[0]==409 and lib.read_bytes()==original and wav.read_bytes()==original_audio)
        check('read-only playback unchanged during reservations',req(f'stream.php?tid={tid}',headers={'Range':'bytes=0-31'})==(206,original_audio[:32]))
        check('releasing one client preserves other reservation',release(a)==200 and edit('still blocked')[0]==409 and lib.read_bytes()==original)
        check('duplicate release harmless',release(a)==200)
        state=json.loads(journal.read_bytes());state['leases'][b]['expires']=int(time.time())-1;journal.write_text(json.dumps(state))
        code='require "php/recording_leases.php";exit(cm_recording_has_lease('+json.dumps(path)+')?1:0);'
        check('expired client no longer blocks recording',subprocess.run(['php','-r',code],cwd=root,env=env,timeout=10).returncode==0)
        check('renewal restores active reservation',renew(b)==200 and edit('blocked again')[0]==409)
        check('release permits original-file edit',release(b)==200 and edit('allowed')[0]==200 and json.loads(lib.read_bytes())['tracks'][str(tid)]['title']=='allowed')
        after=lib.read_bytes();journal.write_text('{broken')
        check('corrupt journal blocks original writes without affecting playback',edit('corrupt')[0]==503 and lib.read_bytes()==after and req(f'stream.php?tid={tid}',headers={'Range':'bytes=0-31'})[0]==206)
        check('corrupt journal preserved',journal.read_text()=='{broken')
        journal.unlink();target=t/'outside';target.write_text('private');journal.symlink_to(target)
        check('unsafe journal alias rejected',renew(a)==503 and edit('alias')[0]==503 and target.read_text()=='private')
        journal.unlink();assert renew(a)==200
        # A separate process owns the exclusive path lock. No reservation can be
        # granted while a rewrite is in progress.
        guard='require "php/recording_lock.php";$h=cm_recording_lock('+json.dumps(path)+',true);if (!$h) exit(1);echo "ready\\n";flush();sleep(5);'
        child=subprocess.Popen(['php','-r',guard],cwd=root,env=env,stdout=subprocess.PIPE,text=True)
        try:
            assert child.stdout.readline().strip()=='ready'
            check('renewal cannot race exclusive edit guard',renew(b)==409)
        finally:child.terminate();child.wait(timeout=5)
        check('renewal after edit guard release',renew(b)==200)
        # Capacity must be bounded; do not silently evict a live reservation.
        state=json.loads(journal.read_bytes());row=next(iter(state['leases'].values()));state['leases']={f'{i:032x}':row for i in range(128)};journal.write_text(json.dumps(state))
        check('capacity rejects a new live client',renew(a)==409 and len(json.loads(journal.read_bytes())['leases'])==128)
    finally:server.terminate();server.wait(timeout=5)
