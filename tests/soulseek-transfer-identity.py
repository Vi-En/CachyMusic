"""Exercise the shipped Node transfer service with local persisted transfers; no peer connections."""
import json, os, socket, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as d:
    tmp=Path(d); data=tmp/'data'; data.mkdir(); downloads=tmp/'downloads'; downloads.mkdir()
    (data/'soulseek-config.json').write_text(json.dumps({'downloads_dir':str(downloads),'shared_dir':''}))
    # All file operations are limited to disposable fixture files.
    a=downloads/'a.flac'; b=downloads/'b.flac'; a.write_bytes(b'a'*20);b.write_bytes(b'b'*20)
    vp=r'Album\Same.flac'
    entries=[dict(id=f'{peer}:{vp}',username=peer,virtual_path=vp,filename='Same.flac',size=20,status='Finished',progress_pct=100,local_file=str(file),part_file=str(file)+'.part') for peer,file in [('Alice',a),('Bob',b)]]
    (data/'soulseek-transfers.json').write_text(json.dumps(entries))
    module=tmp/'node_modules/slsk-client';module.mkdir(parents=True)
    (module/'index.js').write_text('module.exports={SlskClient: class {}};')
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env={**os.environ,'NODE_PATH':str(tmp/'node_modules'),'CACHYMUSIC_DATA_DIR':str(data),'CACHYMUSIC_SOULSEEK_PORT':str(port),'CACHYMUSIC_SOULSEEK_TOKEN':'test-token'}
    p=subprocess.Popen(['node','server/soulseek-service.js'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    def request(path,body=None):
        req=urllib.request.Request(f'http://127.0.0.1:{port}{path}',headers={'Content-Type':'application/json','X-Cachy-Local':'1','X-Cachy-Token':'test-token'},data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req,timeout=3) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
    try:
        for _ in range(60):
            try:
                if request('/health')[0]==200:break
            except OSError:time.sleep(.05)
        code,payload=request('/downloads'); assert code==200 and len(payload['items'])==2,payload
        assert request('/downloads/clear',{'id':'unknown','username':'Alice','virtual_path':vp})[0]==404
        assert request('/downloads/clear',{'virtual_path':vp})[0]==404
        assert len(request('/downloads')[1]['items'])==2
        assert request('/downloads/clear',{'id':entries[0]['id'],'username':'Alice','virtual_path':vp})[0]==200
        remaining=request('/downloads')[1]['items'];assert len(remaining)==1 and remaining[0]['id']==entries[1]['id'],remaining
        assert a.read_bytes()==b'a'*20 and b.read_bytes()==b'b'*20
    finally:p.terminate();p.wait(timeout=5)
print('PASS exact transfer identity: same-path peers, invalid ID rejected, path-only rejected, completed files preserved')

# Exercise the actual PHP desktop status endpoint without requiring PHP cURL or a live daemon.
with tempfile.TemporaryDirectory() as d:
    env={**os.environ,'CACHYMUSIC_DATA_DIR':d,'CACHYMUSIC_CACHE_DIR':d,'CACHYMUSIC_PACKAGED':'1','CACHYMUSIC_SOULSEEK_DISABLED':'1'}
    raw=subprocess.check_output(['php','-r','$_GET["action"]="status"; require "php/api/soulseek.php";'],cwd=root,env=env)
    status=json.loads(raw); assert status['standalone'] is False and status['daemon_running'] is False and status['connected'] is False,status
print('PASS actual PHP desktop status distinguishes an unavailable local service from unsupported PWA mode')
