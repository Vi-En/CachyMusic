"""Explicit eviction is confined to aged, recognized disposable cover cache entries."""
import json,os,pathlib,tempfile,time,subprocess
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    d=pathlib.Path(tmp);c=d/'covers';c.mkdir();old=time.time()-8*86400
    a=c/('a'*64+'.img');b=c/('b'*64+'_thumb.jpg');fresh=c/('c'*64+'.img');legacy=c/'tid_1.img';author=d/'artwork-1';author.mkdir();obj=author/('d'*64+'.img')
    for p in (a,b,fresh,legacy,obj):p.write_bytes(b'fixture')
    for p in (a,b,legacy,obj):os.utime(p,(old,old))
    if os.name=='posix':(c/('e'*64+'.img')).symlink_to(obj);os.link(obj,c/('f'*64+'.img'))
    cmd=['php','-n',str(root/'bin/cachymusic-cover-cache.php'),'--cache-dir',tmp]
    def run(*args):
        p=subprocess.run(cmd+list(args),capture_output=True,text=True,timeout=10);return p.returncode,json.loads(p.stdout)
    code,r=run();assert code==0 and r['inspection_only'] and r['recognized_entries']==3 and r['recognized_bytes_before']==21 and a.exists() and b.exists()
    code,r=run('--prune-to-bytes','7');assert code==0 and r['target_met'] and r['removed_entries']==2 and r['recognized_bytes_after']==7
    assert not a.exists() and not b.exists() and fresh.exists() and legacy.read_bytes()==obj.read_bytes()==b'fixture'
    if os.name=='posix':assert (c/('e'*64+'.img')).is_symlink() and (c/('f'*64+'.img')).exists()
    code,r=run('--prune-to-bytes','0');assert code==3 and not r['target_met'] and r['removed_entries']==0 and fresh.exists()
print('PASS inspection, explicit age/budget eviction, recent/legacy/authoritative and unsafe-entry preservation, unmet target reporting')
