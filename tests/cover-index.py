"""Actual PHP lookup projection: generation, corruption, privacy and fallback boundaries."""
import hashlib,json,os,pathlib,subprocess,tempfile
root=pathlib.Path(__file__).resolve().parents[1]
if not __debug__:raise SystemExit('Assertions required')
if os.name!='posix':print('SKIP POSIX-only index');raise SystemExit(0)
with tempfile.TemporaryDirectory() as tmp:
    data=pathlib.Path(tmp);lib=data/'library.json';idx=data/'cover-index-v1'/'1.idx'
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))};env['CACHYMUSIC_DATA_DIR']=tmp
    def snapshot(title, path, artwork=None):
        row={'tid':1,'full_path':path,'title':title,'lyrics':'PRIVATE LYRICS'}
        if artwork is not None:row['artwork_hash']=artwork
        return {'tracks':{'1':row,'65':{'tid':65,'full_path':'/other.wav'},'2':{'tid':2,'full_path':'/unrelated.wav'}},'playlists':[], 'default_directory':'/music','soulseek':{'username':'PRIVATE USER','password':'PRIVATE PASSWORD','downloads_dir':'/downloads','shared_dir':'/share'},'accounts':[{'password':'PRIVATE ACCOUNT'}]}
    def publish(value):
        stage=data/'test-publish';stage.write_text(json.dumps(value));stage.replace(lib)
    require='require '+json.dumps(str(root/'php/storage.php'))+'; require '+json.dumps(str(root/'php/cover_index.php'))+'; '
    def lookup(id=1):
        p=subprocess.run(['php','-n','-r',require+'echo json_encode(cm_cover_snapshot('+str(id)+'));'],env=env,text=True,capture_output=True,timeout=10);assert p.returncode==0,p.stderr;return json.loads(p.stdout)
    publish(snapshot('old','/music/old.wav'));one=lookup();assert one['tracks']['1']=={'full_path':'/music/old.wav'} and '65' in one['tracks'] and '2' not in one['tracks'];assert idx.is_file() and idx.stat().st_mode&0o777==0o600 and idx.parent.stat().st_mode&0o777==0o700
    initial=idx.read_bytes();assert not any(x in initial for x in [b'PRIVATE',b'lyrics',b'accounts',b'password',b'username',b'/unrelated.wav']);assert hashlib.sha256(initial[65:]).hexdigest().encode()==initial[:64]
    assert lookup()==one and idx.read_bytes()==initial
    # Actual atomic library replacement invalidates an old index even if the track ID is reused.
    art='a'*64;publish(snapshot('new','/music/new.wav',art));two=lookup();assert two['tracks']['1']=={'full_path':'/music/new.wav','artwork_hash':art} and idx.read_bytes()!=initial
    # Replay old valid bytes, then damage the current bytes; neither is accepted.
    idx.write_bytes(initial);assert lookup()==two and idx.read_bytes()!=initial
    idx.write_bytes(b'0'*64+b'\n{}');assert lookup()==two and hashlib.sha256(idx.read_bytes()[65:]).hexdigest().encode()==idx.read_bytes()[:64]
    # Unsafe projection permissions trigger authoritative reconstruction, never acceptance.
    idx.chmod(0o644);assert lookup()==two and idx.stat().st_mode&0o777==0o600
    old=idx.read_bytes();outside=data/'outside';outside.write_bytes(old);idx.unlink();idx.symlink_to(outside)
    assert lookup()==two and idx.is_symlink() and outside.read_bytes()==old;idx.unlink()
    assert lookup()==two and idx.is_file()
    # Source corruption must not fall through to a previous successful lookup.
    lib.write_text('{broken');assert lookup()==[];assert idx.is_file()
    publish(snapshot('last','/music/last.wav'));assert lookup()['tracks']['1']['full_path']=='/music/last.wav'
    # Directory permission problem disables the optimization; authoritative data survives.
    idx.parent.chmod(0o755);full=lookup();assert full['tracks']['1']['title']=='last' and '2' in full['tracks'];idx.parent.chmod(0o700)
    # Warm all buckets from one snapshot; the full projection shares the same allowlist.
    def warm(extra='fn()=>true'):
        p=subprocess.run(['php','-n','-r',require+'echo json_encode(cm_cover_warm_generation('+extra+'));'],env=env,text=True,capture_output=True,timeout=10);assert p.returncode==0,p.stderr;return json.loads(p.stdout)
    assert warm() is True
    files=list(idx.parent.glob('*.idx'));assert len(files)==64
    assert all(b'PRIVATE' not in f.read_bytes() for f in files)
    assert lookup(2)['tracks']['2']['full_path']=='/unrelated.wav'
    generation={f.name:f.read_bytes() for f in files};assert warm() is True;assert all(f.read_bytes()==generation[f.name] for f in files)
    publish(snapshot('next','/music/next.wav'));assert warm('fn()=>false') is False;assert lookup()['tracks']['1']['full_path']=='/music/next.wav';assert warm() is True
    print('PASS all-bucket warming, no credential projection, unchanged generation no rewrite, cancellation and stale generation fallback')
    print('PASS private projection, same-bucket isolation, generation invalidation, stale replay, checksum failure, insecure mode and symlink fallback, corrupt source refusal, full-snapshot fallback and no credentials')
