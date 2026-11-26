"""Exercise encrypted content-bound Windows lookup contract on any PHP with sodium.
The native Windows dispatcher and filesystem behavior require separate acceptance.
"""
import json, os, pathlib, subprocess, tempfile, hashlib
root=pathlib.Path(__file__).resolve().parents[1]
if not __debug__:raise SystemExit('Assertions required')
key='01'*32
with tempfile.TemporaryDirectory() as tmp:
    d=pathlib.Path(tmp);data=d/'data';cache=d/'cache';data.mkdir();cache.mkdir();lib=data/'library.json';idx=cache/'lookup-encrypted-v1'/'1.idx'
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))};env.update(CACHYMUSIC_DATA_DIR=str(data),CACHYMUSIC_CACHE_DIR=str(cache),CACHYMUSIC_MANAGED_SERVICES='1',CACHYMUSIC_LOOKUP_KEY=key)
    req='require "php/storage.php"; require "php/cover_index.php"; '
    def php(code,env=env,opts=()):
        p=subprocess.run(['php',*opts,'-r',req+code],cwd=root,env=env,text=True,capture_output=True,timeout=15);assert p.returncode==0,(p.stdout,p.stderr);return p.stdout
    def snapshot(path):return {'tracks':{'1':{'full_path':path,'title':'PRIVATE TITLE','lyrics':'SECRET LYRICS'},'65':{'full_path':'/music/other.wav'},'2':{'full_path':'/music/unrelated.wav'}},'default_directory':'/music','soulseek':{'password':'SECRET PASSWORD','downloads_dir':'/downloads','shared_dir':'/share'},'playlists':[]}
    def lookup(id=1,env=env,opts=()):return json.loads(php(f'echo json_encode(cm_portable_lookup_snapshot({id}));',env,opts))
    def publish(path):lib.write_text(json.dumps(snapshot(path)))
    publish('/music/old.wav')
    # Capability absence always uses the authoritative reader, never a stale cache.
    fallback=lookup(env={**env,'CACHYMUSIC_LOOKUP_KEY':''});assert fallback['tracks']['1']['title']=='PRIVATE TITLE' and not idx.exists()
    if php('echo function_exists("sodium_crypto_aead_xchacha20poly1305_ietf_encrypt")?"1":"0";')!='1':
        assert lookup()==fallback;print('SKIP encrypted projection; sodium unavailable, authoritative fallback passed');raise SystemExit(0)
    one=lookup();assert one['tracks']['1']=={'full_path':'/music/old.wav'} and '65' in one['tracks'] and '2' not in one['tracks'];assert idx.exists();old=idx.read_bytes();assert old.startswith(b'CMI1') and not any(v in old for v in [b'PRIVATE',b'SECRET',b'/music',b'/downloads'])
    assert lookup()==one and idx.read_bytes()==old
    # Inspect decrypted projection with the synthetic session key; no credentials or unrelated tracks.
    clear=php('echo sodium_crypto_aead_xchacha20poly1305_ietf_decrypt(substr(file_get_contents('+json.dumps(str(idx))+'),28),"CachyMusic lookup v1:".pack("N",1).hash("sha256",file_get_contents('+json.dumps(str(lib))+'),true),substr(file_get_contents('+json.dumps(str(idx))+'),4,24),hex2bin(getenv("CACHYMUSIC_LOOKUP_KEY")));')
    assert 'SECRET' not in clear and 'PRIVATE' not in clear and 'unrelated' not in clear
    # Same inode, same length, same mtime: raw content, not stat timestamps, determines validity.
    st=lib.stat();publish('/music/new.wav');os.utime(lib,ns=(st.st_atime_ns,st.st_mtime_ns));assert lib.stat().st_size==st.st_size and lib.stat().st_mtime_ns==st.st_mtime_ns
    two=lookup();assert two['tracks']['1']['full_path']=='/music/new.wav' and idx.read_bytes()!=old
    idx.write_bytes(old);assert lookup()==two and idx.read_bytes()!=old
    damaged=bytearray(idx.read_bytes());damaged[-1]^=1;idx.write_bytes(damaged);assert lookup()==two and idx.read_bytes()!=damaged
    current=idx.read_bytes();assert lookup(env={**env,'CACHYMUSIC_LOOKUP_KEY':'02'*32})==two and idx.read_bytes()!=current
    # Replay ciphertext to another bucket must not be accepted.
    (idx.parent/'2.idx').write_bytes(idx.read_bytes());assert lookup(2,env={**env,'CACHYMUSIC_LOOKUP_KEY':'02'*32})['tracks']['2']['full_path']=='/music/unrelated.wav'
    # Broken source and over-budget source must not accept a valid previous generation.
    lib.write_text('{bad');assert lookup()==[];publish('/music/new.wav');assert lookup()==two
    oversized=lib.read_bytes()+b' '*2048;lib.write_bytes(oversized);assert lookup(env={**env,'CACHYMUSIC_LIBRARY_MAX_BYTES':'1024'})==[];publish('/music/new.wav');assert lookup()==two
    assert lookup(env={**env,'CACHYMUSIC_MANAGED_SERVICES':'0'})['tracks']['1']['title']=='PRIVATE TITLE'
    if os.name=='posix':
        outside=d/'outside';outside.write_bytes(b'untouched');idx.unlink();idx.symlink_to(outside);assert lookup()==two and outside.read_bytes()==b'untouched' and idx.is_symlink();idx.unlink()
        outside_dir=d/'outside-dir';outside_dir.mkdir();idx.parent.rename(cache/'saved');idx.parent.symlink_to(outside_dir,target_is_directory=True);assert lookup()['tracks']['1']['title']=='PRIVATE TITLE' and list(outside_dir.iterdir())==[]
        idx.parent.unlink();(cache/'saved').rename(idx.parent)
    print('PASS encrypted lookup, credential exclusion, exact-byte generation, same-size/time invalidation, tampering, key rotation, bucket binding, corrupt source, alias and capability fallback')
