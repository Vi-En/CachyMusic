"""Offline profile maintenance, safe quarantine, and abandoned-artwork reporting."""
import hashlib, json, os, pathlib, subprocess, tempfile, time
root=pathlib.Path(__file__).resolve().parents[1]
if not __debug__: raise SystemExit('Assertions required')
with tempfile.TemporaryDirectory() as tmp:
    d=pathlib.Path(tmp);library=d/'library.json';lock=d/'library.json.lock';lock.touch()
    art=d/'artwork-1';art.mkdir();payload=b'authoritative fixture';key=hashlib.sha256(payload).hexdigest();committed=art/(key+'.img');committed.write_bytes(payload)
    orphan=b'orphan fixture';(art/(hashlib.sha256(orphan).hexdigest()+'.img')).write_bytes(orphan);(art/'.cm-write-artstage').write_bytes(b'not to move')
    original=json.dumps({'tracks':{'1':{'tid':1,'artwork_hash':key}},'playlists':{'1':{'tracks':[1]}}}).encode();library.write_bytes(original)
    old=d/'.cm-write-abcdef';old.write_bytes(b'abandoned JSON');os.utime(old,(time.time()-172800,)*2)
    old_long=d/'.cm-write-0cu12edoltl64XMpdyZ';old_long.write_bytes(b'abandoned long name');os.utime(old_long,(time.time()-172800,)*2)
    recent=d/'.cm-write-recent';recent.write_bytes(b'new');unsafe=d/'.cm-write-not.valid';unsafe.write_bytes(b'unknown')
    if os.name=='posix':
        (d/'.cm-write-aliase').symlink_to(library);os.link(library,d/'.cm-write-hardlk')
        # The library itself is now multi-linked; refuse until removed.
    cmd=['php','-n',str(root/'bin/cachymusic-storage-audit.php'),'--data-dir',tmp]
    def invoke(*args):return subprocess.run(cmd+list(args),text=True,capture_output=True,timeout=10)
    if os.name=='posix':
        assert invoke('--quarantine-abandoned').returncode!=0 and old.exists();(d/'.cm-write-hardlk').unlink()
        other=d/'other';other.write_bytes(b'other');os.link(other,d/'.cm-write-hardlk');os.utime(other,(time.time()-172800,)*2)
    def result(*args):
        p=invoke(*args);assert p.returncode==0,(p.stdout,p.stderr);return json.loads(p.stdout)
    report=result();assert report['inspection_only'] and report['abandoned_candidates']==2 and report['recent_stages']==1 and report['artwork_referenced']==1 and report['artwork_unreferenced']==1 and report['artwork_stages']==1 and report['artwork_missing_or_unsafe']==0 and report['quarantined']==0,report
    expected=sum(f.stat().st_size for f in d.rglob('*') if not f.is_symlink() and f.is_file() and f.stat().st_nlink==1)
    assert report['profile_regular_bytes']==expected and report['profile_regular_files']>0,report
    assert old.exists() and old_long.exists() and library.read_bytes()==original and not list(d.glob('recovery-quarantine-*'))
    if os.name=='posix':
        import fcntl
        with lock.open('r+b') as f:
            fcntl.flock(f,fcntl.LOCK_EX);assert invoke('--quarantine-abandoned').returncode!=0 and old.exists()
    library.write_bytes(b'{broken');assert invoke('--quarantine-abandoned').returncode!=0 and old.exists() and library.read_bytes()==b'{broken';library.write_bytes(original)
    committed.write_bytes(b'bad hash');assert result()['artwork_missing_or_unsafe']==1 and invoke('--quarantine-abandoned').returncode!=0 and old.exists();committed.write_bytes(payload)
    report=result('--quarantine-abandoned');q=d/report['quarantine_directory'];assert report['quarantined']==2 and report['quarantine_failed']==0 and not old.exists() and not old_long.exists() and (q/old.name).read_bytes()==b'abandoned JSON' and (q/old_long.name).read_bytes()==b'abandoned long name'
    assert recent.exists() and unsafe.exists() and library.read_bytes()==original and committed.read_bytes()==payload and (art/'.cm-write-artstage').exists() and (art/(hashlib.sha256(orphan).hexdigest()+'.img')).read_bytes()==orphan
    if os.name=='posix':assert (d/'.cm-write-aliase').is_symlink() and (d/'.cm-write-hardlk').exists() and (q.stat().st_mode & 0o777)==0o700
    after=result('--quarantine-abandoned');assert after['quarantined']==0 and after['quarantine_directory'] is None
    print('PASS inspection, aged-stage quarantine (short and long names), fresh/unsafe exclusions, lock and corruption refusal, authoritative artwork verification, byte preservation, repeated-run safety')
