"""Local JSON persistence failure and recording identity counterexamples."""
import json, os, pathlib, subprocess, tempfile
root=pathlib.Path(__file__).resolve().parents[1]
if not __debug__: raise SystemExit('Assertions required')

def run(body, data):
    env={**os.environ,'CACHYMUSIC_DATA_DIR':str(data)}
    p=subprocess.run(['php','-n','-r',f'require {json.dumps(str(root / "php/storage.php"))}; '+body],env=env,capture_output=True,text=True,timeout=15)
    assert p.returncode==0, p.stderr
    return json.loads(p.stdout)

track='function tr($path,$mtime=1){return ["full_path"=>$path,"file_path"=>basename($path),"title"=>"Track","mtime"=>$mtime,"file_size"=>10];} '
checks=[]
def check(name, result):
    checks.append((name,bool(result)));print(('PASS ' if result else 'FAIL ')+name)
with tempfile.TemporaryDirectory() as d:
    a=run(track+'$a=Storage::upsertTrack(tr("/first/song.wav"));$p=Storage::createPlaylist("Keep","tester",[$a]);$b=Storage::upsertTrack(tr("/second/song.wav",2));echo json_encode([$a,$b,Storage::getTrackPath($a),Storage::getTrackPath($b)]);',d)
    check('distinct full paths preserve original track identity',a[0]!=a[1] and a[2:] == ['/first/song.wav','/second/song.wav'])
    b=run(track+'$a=Storage::upsertTrack(tr("/first/song.wav",3));echo json_encode([$a,Storage::getTrackPath($a)]);',d)
    check('same path retains stable ID',b==[a[0],'/first/song.wav'])
with tempfile.TemporaryDirectory() as d:
    run('Storage::read();echo json_encode(true);',d)
    p=pathlib.Path(d)/'library.json';p.write_text('{broken')
    r=run(track+'echo json_encode([Storage::setDefaultDirectory("/music"),Storage::createAccount("tester","hash"),Storage::upsertTrack(tr("/a/song.wav")),Storage::saveSoulseekAccount([]),Storage::setDefaultDirectory("")]);',d)
    for name,result in zip(['directory','account','track','peer preference','empty directory'],r):check(name+' rejects corrupt store',result is False)
    check('corrupt original bytes retained',p.read_text()=='{broken')
    r=run(track+'Storage::beginBatch();$id=Storage::upsertTrack(tr("/a/song.wav"));echo json_encode([$id,Storage::commitBatch()]);',d)
    check('invalid batch does not falsely commit',r==[False,False])
with tempfile.TemporaryDirectory() as d:
    r=run(track+'$a=Storage::upsertTrack(tr("/a/song.wav"));$p=getenv("CACHYMUSIC_DATA_DIR")."/library.json";rename($p,$p.".bak");mkdir($p);$result=Storage::updateTrackMetadata($a,["title"=>"New"]);echo json_encode($result);',d)
    check('metadata rejects unavailable store',r is False)
with tempfile.TemporaryDirectory() as d:
    r=run('Storage::read();$data=Storage::read();unset($data["tracks"]);echo json_encode(Storage::write($data));',d)
    check('reject invalid replacement structure',r is False)
with tempfile.TemporaryDirectory() as d:
    r=run(track+'Storage::read();Storage::beginBatch();$a=Storage::upsertTrack(tr("/a/song.wav"));$p=getenv("CACHYMUSIC_DATA_DIR")."/library.json";$old=file_get_contents($p);$data=json_decode($old,true);$data["tracks"][99]=["tid"=>99,"title"=>"Other","full_path"=>"/other.wav","file_path"=>"/other.wav"];file_put_contents($p,json_encode($data));$first=Storage::commitBatch();$second=Storage::commitBatch();echo json_encode([$first,$second,Storage::getTrackPath($a),Storage::getTrackPath(99)]);',d)
    check('conflicted batch clears staged identity and cannot be re-reported as success',r==[False,False,None,'/other.wav'])
# A valid snapshot can still fail its durable write under lock contention.
# Separate processes contend for the real sidecar, not a mocked write method.
import concurrent.futures
with tempfile.TemporaryDirectory() as d:
    run(track+'Storage::upsertTrack(tr("/a/song.wav"));echo json_encode(true);',d)
    before=(pathlib.Path(d)/'library.json').read_bytes()
    lockfile=pathlib.Path(d)/'library.json.lock'
    if os.name=='posix':
        import fcntl
        with lockfile.open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            cases={'metadata':'Storage::updateTrackMetadata(1,["title"=>"Changed"])','account':'Storage::createAccount("tester","hash")','directory':'Storage::setDefaultDirectory("/music")','track':'Storage::upsertTrack(tr("/b/song.wav"))','peer preference':'Storage::saveSoulseekAccount(["username"=>"tester"])'}
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
                futures={name:pool.submit(run,track+'echo json_encode('+expr+');',d) for name,expr in cases.items()}
                for name,future in futures.items():check(name+' rejects lock timeout',future.result() is False)
        check('lock failure leaves original bytes intact',(pathlib.Path(d)/'library.json').read_bytes()==before)
with tempfile.TemporaryDirectory() as d:
    r=run(track+'$d=Storage::read();$d["tracks"]=[1=>tr("/same.wav")+["tid"=>1],2=>tr("/same.wav")+["tid"=>2]];Storage::write($d);echo json_encode([Storage::getCachedTracks(),Storage::getTrackByPath("/same.wav"),Storage::upsertTrack(tr("/same.wav"))]);',d)
    check('ambiguous legacy paths are not assigned to either recording',r==[[],None,False])
with tempfile.TemporaryDirectory() as d:
    r=run(track+'Storage::beginBatch();$a=Storage::upsertTrack(tr("/a/song.wav"));Storage::beginBatch();$b=Storage::upsertTrack(tr("/b/song.wav"));$inner=Storage::commitBatch();$outer=Storage::commitBatch();echo json_encode([$a,$b,$inner,$outer,Storage::getTrackPath($a),Storage::getTrackPath($b)]);',d)
    check('valid nested batch preserves both track identities',r==[1,2,True,True,'/a/song.wav','/b/song.wav'])
with tempfile.TemporaryDirectory() as d:
    r=run(track+'Storage::read();Storage::beginBatch();$p=getenv("CACHYMUSIC_DATA_DIR")."/library.json";$data=json_decode(file_get_contents($p),true);$data["tracks"][1]=tr("/other.wav")+["tid"=>1];file_put_contents($p,json_encode($data));echo json_encode(Storage::commitBatch());',d)
    check('read-only scan batch rejects changed track snapshot',r is False)
with tempfile.TemporaryDirectory() as d:
    import wave
    music=pathlib.Path(d)/'music';music.mkdir();data=pathlib.Path(d)/'data';data.mkdir()
    for folder in ['one','two']:
        sub=music/folder;sub.mkdir()
        with wave.open(str(sub/'song.wav'),'wb') as f:f.setparams((1,2,8000,8000,'NONE','not compressed'));f.writeframes(bytes(16000))
    api=json.dumps(str(root/'php/api/scan.php'))
    def scan(path):
        env={**os.environ,'CACHYMUSIC_DATA_DIR':str(data),'HOME':d,'USERPROFILE':d}
        code='$_SERVER["SCRIPT_FILENAME"]="scan.php";$_SERVER["REQUEST_METHOD"]="POST";$_POST='+('[]' if path is None else '["directory"=>'+json.dumps(str(path))+']')+';require '+api+';'
        p=subprocess.run(['php','-n','-r',code],env=env,text=True,capture_output=True,timeout=20)
        assert p.returncode==0,p.stderr
        return json.loads(p.stdout)
    result=scan(music)
    check('actual scan indexes both same-name tracks',result.get('success') and result.get('count')==2 and len({t['tid'] for t in result['tracks']})==2)
    cached=scan(music)
    check('cached scan preserves actual track IDs',cached.get('success') and {t['fullPath']:t['tid'] for t in cached['tracks']}=={t['fullPath']:t['tid'] for t in result['tracks']})
    (data/'library.json').write_text('{broken')
    check('actual scan reports corrupt store failure',scan(music).get('success') is False)
    check('implicit directory scan reports corrupt store failure',scan(None).get('success') is False)
print(f'{sum(v for _,v in checks)}/{len(checks)} passed')
raise SystemExit(0 if all(v for _,v in checks) else 1)
