"""Build real Debian package, extract and run actual backend in disposable storage.
No installation, package-manager mutation, browser or physical output.
"""
import argparse,json,os,pathlib,shutil,socket,subprocess,sys,tempfile,urllib.request
root=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);args=p.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
if not shutil.which('dpkg-deb'):print('BLOCKED: dpkg-deb unavailable');raise SystemExit(2)
with tempfile.TemporaryDirectory(prefix='cachy-deb-') as t:
 t=pathlib.Path(t);tree=t/'source';shutil.copytree(root,tree,ignore=shutil.ignore_patterns('dist','__pycache__','.git','node_modules','*.log'))
 subprocess.run(['bash','packaging/debian/build-deb.sh'],cwd=tree,check=True,timeout=60)
 deb=next((tree/'dist').glob('*.deb'));assert subprocess.check_output(['dpkg-deb','-f',str(deb),'Version'],text=True).strip()==json.loads((root/'package.json').read_text())['version'].replace('-dev.','~dev')
 extract=t/'extract';subprocess.run(['dpkg-deb','-x',str(deb),str(extract)],check=True,timeout=60);app=extract/'usr/share/cachymusic'
 for rel in ('index.html','index.php','scripts/dsp-worklet-processor.js','scripts/modules/pcm-range.js','package.json','README.md','LICENSE','THIRD-PARTY-NOTICES.md'):
  assert (app/rel).read_bytes()==(root/rel).read_bytes(),rel
 assert not list(app.rglob('__pycache__')) and not (app/'resources/audio').exists()
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 env={k:v for k,v in os.environ.items() if not k.startswith(('DB_','MYSQL_','CACHYMUSIC_','CACHY_'))};env.update(HOME=str(t),XDG_STATE_HOME=str(t/'state'),CACHYMUSIC_DATA_DIR=str(t/'data'),CACHYMUSIC_CACHE_DIR=str(t/'cache'),CACHY_PORT=str(port),CACHYMUSIC_MPRIS='0')
 cmd=['bash',str(app/'bin/cachymusic')]
 subprocess.run(cmd+['--background'],env=env,check=True,timeout=30)
 try:
  http=urllib.request.build_opener(urllib.request.ProxyHandler({}));base=f'http://127.0.0.1:{port}'
  with http.open(base+'/php/api/launcher_health.php',timeout=5) as f:assert json.load(f)['app']=='CachyMusic'
  with http.open(base+'/scripts/dsp-worklet-processor.js',timeout=5) as f:assert f.read()==(root/'scripts/dsp-worklet-processor.js').read_bytes()
 finally:subprocess.run(cmd+['--stop'],env=env,check=True,timeout=30)
 shutil.copy2(deb,out/deb.name)
 print('PASS real Debian build, extracted file equality, private disposable backend startup, health and owned shutdown:',deb.name)
