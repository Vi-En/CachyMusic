"""Bounded cache writes, concurrent admission and preservation of non-disposable data."""
import json,os,pathlib,subprocess,tempfile,sys,time
root=pathlib.Path(__file__).resolve().parents[1]
if not __debug__:raise SystemExit('Assertions required')
if os.name!='posix':print('SKIP POSIX file identity fixture');raise SystemExit(0)
with tempfile.TemporaryDirectory() as tmp:
    d=pathlib.Path(tmp);covers=d/'covers';covers.mkdir();authoritative=d/'persistent.img';authoritative.write_bytes(b'protected');legacy=covers/'tid_1.img';legacy.write_bytes(b'legacy');unknown=covers/'unrecognized';unknown.write_bytes(b'unknown');alias=covers/('f'*64+'.img');alias.symlink_to(authoritative)
    hard=covers/('e'*64+'.img');os.link(authoritative,hard)
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))};env.update(CACHYMUSIC_COVER_CACHE_BYTES='10',CACHYMUSIC_COVER_CACHE_ENTRIES='2')
    prefix='require '+json.dumps(str(root/'php/platform.php'))+';require '+json.dumps(str(root/'php/cover_cache_budget.php'))+';'
    def path(i):return covers/(f'{i:064x}'+'.img')
    def code(p,n):return prefix+'echo json_encode(cm_cover_cache_publish('+json.dumps(str(p))+',str_repeat("x",'+str(n)+')));'
    def publish(p,n,**extra):
        r=subprocess.run(['php','-n','-r',code(p,n)],env={**env,**extra},capture_output=True,text=True,timeout=5);assert r.returncode==0,r.stderr;return json.loads(r.stdout)
    assert publish(path(1),6);os.utime(path(1),(1,1));assert publish(path(2),4);assert publish(path(3),6);assert not path(1).exists() and path(2).stat().st_size+path(3).stat().st_size==10
    assert publish(path(3),5) and path(3).stat().st_size==5
    assert not publish(path(4),11) and not path(4).exists()
    assert not publish(path(4),0,CACHYMUSIC_COVER_CACHE_BYTES='0')
    assert not publish(legacy,3) and not publish(alias,3) and not publish(hard,3)
    assert authoritative.read_bytes()==b'protected' and legacy.read_bytes()==b'legacy' and unknown.read_bytes()==b'unknown' and alias.is_symlink()
    import fcntl
    with (covers/'cache-admission.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);assert not publish(path(4),4)
    # Competing writers either admit within the shared limits or bypass cache.
    ps=[subprocess.Popen(['php','-n','-r',code(path(i),5)],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for i in range(10,22)]
    for p in ps:
        out,err=p.communicate(timeout=10);assert p.returncode==0,(out,err);assert json.loads(out) in (True,False)
    safe=[p for p in covers.glob('*.img') if p.name!='tid_1.img' and not p.is_symlink() and p.stat().st_nlink==1]
    assert len(safe)<=2 and sum(p.stat().st_size for p in safe)<=10
    assert authoritative.read_bytes()==b'protected' and hard.stat().st_nlink==2
    print('PASS automatic byte/count budgets, deterministic oldest-write eviction, replacement, oversize/disabled admission, busy lock bypass, 12 concurrent writers and preservation of legacy/unknown/linked files')
