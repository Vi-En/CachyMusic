"""Authoritative storage admission, no automatic data deletion."""
import json,os,pathlib,struct,subprocess,tempfile,zlib,sys,concurrent.futures
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
if not __debug__:raise SystemExit('Assertions required')
checks=[]
def check(name,ok):
    checks.append(bool(ok));print(('PASS ' if ok else 'FAIL ')+name,flush=True)
def png(rgb):
    def chunk(t,b):return struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',2,2,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+rgb*2)*2))+chunk(b'IEND',b'')
red,blue=png(b'\xff\0\0'),png(b'\0\0\xff')
def run(data,code,**limits):
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))};env.update(CACHYMUSIC_DATA_DIR=str(data),**limits)
    p=subprocess.run(['php','-n','-r','require "php/storage.php";'+code],cwd=root,env=env,capture_output=True,text=True,timeout=15)
    assert p.returncode==0,p.stderr
    return json.loads(p.stdout)
def art(tid,raw):return f'cm_artwork_stage({tid},hex2bin("{raw.hex()}"))'
with tempfile.TemporaryDirectory() as tmp:
    d=pathlib.Path(tmp);p=d/'library.json';run(d,'echo json_encode(Storage::read());');before=p.read_bytes()
    limits={'CACHYMUSIC_LIBRARY_MAX_BYTES':'1024'}
    check('oversized JSON write rejects without replacing prior library',run(d,'$d=Storage::read();$d["extra"]=str_repeat("x",2048);echo json_encode(Storage::write($d));',**limits) is False and p.read_bytes()==before)
    p.write_text(json.dumps({'tracks':{},'playlists':[],'extra':'x'*2048}));oversize=p.read_bytes()
    check('oversized existing JSON read fails closed without truncation',run(d,'echo json_encode([Storage::read(),Storage::setDefaultDirectory("new")]);',**limits)==[[],False] and p.read_bytes()==oversize)
with tempfile.TemporaryDirectory() as tmp:
    d=pathlib.Path(tmp);limits={'CACHYMUSIC_ARTWORK_STORE_BYTES':str(len(red)+len(blue)-1),'CACHYMUSIC_ARTWORK_STORE_ENTRIES':'5'}
    a=run(d,'echo json_encode('+art(1,red)+');',**limits);p=d/'artwork-1'/f'{a}.img';check('initial immutable object admitted',isinstance(a,str) and p.read_bytes()==red)
    b=run(d,'echo json_encode('+art(2,blue)+');',**limits);check('aggregate byte budget refuses second object without deleting first',b is None and p.read_bytes()==red and not (d/'artwork-2').exists())
    check('deduplication still succeeds at zero admission budget',run(d,'echo json_encode('+art(1,red)+');',CACHYMUSIC_ARTWORK_STORE_BYTES='0')==a)
    (d/'artwork-1'/'.cm-write-abandoned').write_bytes(b'x'*40)
    check('abandoned staging bytes counted',run(d,'echo json_encode('+art(2,blue)+');',CACHYMUSIC_ARTWORK_STORE_BYTES=str(len(red)+len(blue)+30)) is None and (d/'artwork-1'/'.cm-write-abandoned').read_bytes()==b'x'*40)
with tempfile.TemporaryDirectory() as tmp:
    d=pathlib.Path(tmp);limits={'CACHYMUSIC_ARTWORK_STORE_ENTRIES':'1'}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results=list(pool.map(lambda i:run(d,'echo json_encode('+art(i+1,red)+');',**limits),range(8)))
    check('competing writers respect shared one-entry quota',sum(isinstance(x,str) for x in results)==1 and len(list(d.glob('artwork-*/*.img')))==1)
    if os.name=='posix':
        (d/'artwork-100').symlink_to(d,target_is_directory=True)
        check('unknown aliased artwork directory fails closed',run(d,'echo json_encode('+art(99,blue)+');') is None)
print(f'{sum(checks)}/{len(checks)} passed');raise SystemExit(0 if all(checks) else 1)
