"""Aggregate cooperating writer admission, preservation and control headroom."""
import concurrent.futures, json, os, pathlib, subprocess, tempfile, sys, struct, zlib
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
if not __debug__:raise SystemExit('Assertions required')
checks=[]
def check(name,ok):
    checks.append(bool(ok));print(('PASS ' if ok else 'FAIL ')+name,flush=True)
def run(d,code,**limits):
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))};env.update(CACHYMUSIC_DATA_DIR=str(d),**limits)
    p=subprocess.run(['php','-n','-r','require "php/storage.php";'+code],cwd=root,env=env,capture_output=True,text=True,timeout=15)
    if p.returncode:raise RuntimeError(p.stderr)
    return json.loads(p.stdout)
def png():
    def c(t,b):return struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+c(b'IHDR',struct.pack('>IIBBBBB',2,2,8,2,0,0,0))+c(b'IDAT',zlib.compress((b'\0'+b'\xff\0\0'*2)*2))+c(b'IEND',b'')
def art(i):return f'cm_artwork_stage({i},hex2bin("{png().hex()}"))'
def setup(d):run(d,'echo json_encode(Storage::read());');return (d/'library.json').read_bytes()
with tempfile.TemporaryDirectory() as t:
    d=pathlib.Path(t);before=setup(d);p=d/'library.json';(d/'unrecognized').write_bytes(b'x'*4096)
    check('unrecognized bytes count against library admission',run(d,'echo json_encode(Storage::setDefaultDirectory("/new"));',CACHYMUSIC_PROFILE_MAX_BYTES='4096') is False and p.read_bytes()==before)
    # Re-establish the exact snapshot for independent baseline comparisons.
    p.write_bytes(before)
    check('existing target and new temporary bytes both counted',run(d,'echo json_encode(Storage::setDefaultDirectory("/new"));',CACHYMUSIC_PROFILE_MAX_BYTES=str(sum(x.stat().st_size for x in d.rglob('*') if x.is_file())+1)) is False and p.read_bytes()==before)
    p.write_bytes(before)
    check('file limit counts existing and new staging file',run(d,'echo json_encode(Storage::setDefaultDirectory("/new"));',CACHYMUSIC_PROFILE_MAX_FILES='1') is False and p.read_bytes()==before)
    p.write_bytes(before)
    check('invalid explicit limit refuses rather than disables admission',run(d,'echo json_encode(Storage::setDefaultDirectory("/new"));',CACHYMUSIC_PROFILE_MAX_BYTES='bad') is False and p.read_bytes()==before)
    p.write_bytes(before)
    check('valid headroom permits publication',run(d,'echo json_encode(Storage::setDefaultDirectory("/new"));',CACHYMUSIC_PROFILE_MAX_BYTES='65536') is True and p.read_bytes()!=before)
    check('read remains available at zero budget',run(d,'echo json_encode(Storage::read());',CACHYMUSIC_PROFILE_MAX_BYTES='0')['default_directory']=='/new')
    check('bounded control journal can release despite exhausted admission',run(d,'cm_recording_lease_renew(str_repeat("a",32),"/new/test.wav");cm_recording_lease_release(str_repeat("a",32));echo json_encode(!cm_recording_has_lease("/new/test.wav"));',CACHYMUSIC_PROFILE_MAX_BYTES='0') is True)
with tempfile.TemporaryDirectory() as t:
    d=pathlib.Path(t);setup(d);(d/'.cm-write-abandoned').write_bytes(b'x'*4096)
    check('abandoned stage prevents artwork admission',run(d,'echo json_encode('+art(1)+');',CACHYMUSIC_PROFILE_MAX_BYTES='4096') is None and (d/'.cm-write-abandoned').read_bytes()==b'x'*4096)
    if os.name=='posix':
        (d/'alias').symlink_to(d,target_is_directory=True)
        check('aliased profile entries refuse admission',run(d,'echo json_encode('+art(2)+');',CACHYMUSIC_PROFILE_MAX_BYTES='65536') is None and (d/'alias').is_symlink())
with tempfile.TemporaryDirectory() as t:
    d=pathlib.Path(t);before=setup(d);budget=str(sum(x.stat().st_size for x in d.rglob("*") if x.is_file())+len(png()))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results=list(pool.map(lambda i:run(d,'echo json_encode('+art(i+1)+');',CACHYMUSIC_PROFILE_MAX_BYTES=budget),range(8)))
    check('competing artwork writers share aggregate admission',sum(isinstance(x,str) for x in results)==1 and len(list(d.glob('artwork-*/*.img')))==1)
    if any(isinstance(x,str) for x in results):
        i=next(i for i,x in enumerate(results) if isinstance(x,str));check('already stored immutable artwork needs no admission',run(d,'echo json_encode('+art(i+1)+');',CACHYMUSIC_PROFILE_MAX_BYTES='0')==results[i])
    check('subsequent distinct artwork denied at exhausted shared budget',run(d,'echo json_encode('+art(99)+');',CACHYMUSIC_PROFILE_MAX_BYTES=budget) is None)
with tempfile.TemporaryDirectory() as t:
    d=pathlib.Path(t);setup(d);code='require "php/scan_resume.php";$r=new CachyScanResume("/music");$p=cachy_data_dir()."/scan-resume-v1.jsonl";rename($p,$p.".old");file_put_contents($p,"replacement");$r->complete();echo json_encode(is_file($p)&&file_get_contents($p)==="replacement");'
    if os.name=='posix':check('resume completion never removes replacement checkpoint',run(d,code) is True)
with tempfile.TemporaryDirectory() as t:
    d=pathlib.Path(t);setup(d);code='require "php/scan_resume.php";$r=new CachyScanResume("/music");$p=cachy_data_dir()."/scan-resume-v1.jsonl";file_put_contents($p,"foreign bytes",FILE_APPEND);$r->complete();echo json_encode(is_file($p)&&str_ends_with(file_get_contents($p),"foreign bytes"));'
    check('resume completion preserves externally extended checkpoint',run(d,code) is True)
# Preflight must not create a new library and must reject aliases or a
# structurally valid file above the configured limit before starting services.
with tempfile.TemporaryDirectory() as t:
    d=pathlib.Path(t);code='echo json_encode(method_exists("Storage","preflightLibrary")?Storage::preflightLibrary():false);'
    check('missing library preflight is non-mutating',run(d,code) is True and not (d/'library.json').exists())
    p=d/'library.json';p.write_text(json.dumps({'tracks':{},'playlists':[],'extra':'x'*2048}));before=p.read_bytes()
    check('valid existing library preflight',run(d,code) is True and p.read_bytes()==before)
    if os.name=='posix':
        # A positive-control check on the baseline (which lacks preflight) is
        # separate from the actual source launcher regression below.
        p.unlink();outside=d/'outside';outside.write_bytes(before);os.link(outside,p)
        check('hard-linked library preflight denied',run(d,code) is False and outside.read_bytes()==before)
        p.unlink();outside.unlink();p.write_bytes(before)
    check('oversized library preflight denied',run(d,code,CACHYMUSIC_LIBRARY_MAX_BYTES='1024') is False and p.read_bytes()==before)
print(f'{sum(checks)}/{len(checks)} passed');raise SystemExit(0 if all(checks) else 1)
