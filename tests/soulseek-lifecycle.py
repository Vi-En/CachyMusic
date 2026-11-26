"""Local mock only: no live account, network peer, or installed slsk-client required."""
from pathlib import Path
import os, socket, subprocess, tempfile, time, urllib.request, urllib.error, json, concurrent.futures
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as d:
    d=Path(d);module=d/'node_modules/slsk-client';module.mkdir(parents=True)
    (module/'index.js').write_text("""const {EventEmitter}=require('events');class SlskClient extends EventEmitter { login(){return new Promise(r=>setTimeout(()=>{this.emit('server-reconnect');r()},500))} destroy(){} };module.exports={SlskClient};""")
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    env={**os.environ,'NODE_PATH':str(d/'node_modules'),'CACHYMUSIC_DATA_DIR':str(d/'data'),'CACHYMUSIC_SOULSEEK_PORT':str(port),'CACHYMUSIC_SOULSEEK_TOKEN':'test-token'}
    p=subprocess.Popen(['node','server/soulseek-service.js'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    def request(path,body=None,auth=True):
        headers={'Content-Type':'application/json'}
        if auth:headers.update({'X-Cachy-Local':'1','X-Cachy-Token':'test-token'})
        req=urllib.request.Request(f'http://127.0.0.1:{port}{path}',headers=headers,data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req,timeout=3) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:return e.code,{} if e.code==403 else json.loads(e.read())
    try:
        for i in range(30):
            try:
                if request('/health')[0]==200:break
            except OSError:time.sleep(.05)
        assert request('/status',auth=False)[0]==403
        assert not request('/status')[1]['powered_on']
        with concurrent.futures.ThreadPoolExecutor() as ex:
            login=ex.submit(request,'/power',{'state':'on','username':'mock','password':'not-a-real-password'})
            for i in range(30):
                if request('/status')[1]['connecting']:break
                time.sleep(.02)
            assert request('/power',{'state':'off'})[0]==200
            assert login.result()[0]==401
        time.sleep(.1);status=request('/status')[1];assert not status['connected'] and not status['connecting'] and not status['has_credentials']
        assert request('/power',{'state':'on','username':'mock','password':'not-a-real-password'})[0]==200
        assert request('/status')[1]['connected'];assert request('/logout',{})[0]==200
        assert not request('/account')[1]['hasPassword']
        assert not any(b'not-a-real-password' in f.read_bytes() for f in (d/'data').rglob('*') if f.is_file())
    finally:p.terminate();p.wait(timeout=5)
print('PASS mocked Soulseek lifecycle: disconnected startup, cancel pending login, stale event ignored, explicit login/logout, no password persisted')
