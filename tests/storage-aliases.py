"""Reject linked library and lock aliases; never modify unrelated fixture files."""
import json,os,pathlib,subprocess,sys,tempfile
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
if not __debug__:raise SystemExit('Assertions required')
if os.name!='posix':print('SKIP POSIX link fixture');raise SystemExit(0)
checks=[]
def check(name,ok):checks.append(bool(ok));print(('PASS ' if ok else 'FAIL ')+name,flush=True)
with tempfile.TemporaryDirectory() as temp:
    t=pathlib.Path(temp);data=t/'data';data.mkdir();lib=data/'library.json';lock=data/'library.json.lock';outside=t/'outside.json';sentinel=t/'sentinel';sentinel.write_bytes(b'keep')
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))};env.update(HOME=temp,USERPROFILE=temp,CACHYMUSIC_DATA_DIR=str(data),CACHYMUSIC_CACHE_DIR=str(t/'cache'))
    def php(code):return json.loads(subprocess.check_output(['php','-n','-r','require "php/storage.php"; '+code],cwd=root,env=env,timeout=10))
    assert php('echo json_encode(Storage::setDefaultDirectory("/initial"));') is True
    original=lib.read_bytes();outside.write_bytes(original)
    lib.unlink();lib.symlink_to(outside)
    check('linked library cannot be read',php('echo json_encode(Storage::read());')==[])
    check('linked library cannot be replaced by metadata write',php('echo json_encode(Storage::setDefaultDirectory("/wrong"));') is False and lib.is_symlink() and outside.read_bytes()==original)
    lib.unlink();os.link(outside,lib)
    check('multiply linked library rejected',php('echo json_encode(Storage::read());')==[] and lib.stat().st_nlink==2)
    lib.unlink();lib.write_bytes(original)
    lock.unlink(missing_ok=True);lock.symlink_to(sentinel)
    check('symbolic lock alias rejected',php('echo json_encode(Storage::setDefaultDirectory("/wrong"));') is False and lib.read_bytes()==original and sentinel.read_bytes()==b'keep')
    lock.unlink();os.link(sentinel,lock)
    check('multiply linked lock rejected',php('echo json_encode(Storage::setDefaultDirectory("/wrong"));') is False and lib.read_bytes()==original and sentinel.read_bytes()==b'keep')
    lock.unlink()
    check('normal lock recreated and persistence recovers',php('echo json_encode(Storage::setDefaultDirectory("/recovered"));') is True and php('echo json_encode(Storage::getDefaultDirectory());')=='/recovered')
print(f'{sum(checks)}/{len(checks)} passed');raise SystemExit(0 if all(checks) else 1)
