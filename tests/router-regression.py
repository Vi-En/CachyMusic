from pathlib import Path
import subprocess,time,urllib.request,urllib.error,socket,os
root=Path(__file__).resolve().parents[1]
for packaged in [False,True]:
    env=os.environ.copy();env.pop('CACHYMUSIC_LOCAL_TOKEN',None)
    if packaged:env['CACHYMUSIC_LOCAL_TOKEN']='test-token-not-for-production'
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    p=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','index.php'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        time.sleep(.35)
        def status(path,headers={}):
            try:return urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}{path}',headers=headers),timeout=2).status
            except urllib.error.HTTPError as e:return e.code
        h={'X-Cachy-App-Token':'test-token-not-for-production'} if packaged else {}
        assert status('/',h)==200
        if packaged:assert status('/')==403 and status('/',{'X-Cachy-App-Token':'wrong'})==403
        assert status('/',{**h,'Host':'attacker.example'})==403
        assert status('/php/api/metadata.php',{**h,'Origin':'https://attacker.example'})==403
        assert status('/php/api/metadata.php',{**h,'Sec-Fetch-Site':'cross-site'})==403
        assert status('/php/flac_metadata.php',h)==404
    finally:p.terminate();p.wait()
print('PASS: local router, packaged secret, hostile Host and Origin, cross-site and non-public helper denial')
