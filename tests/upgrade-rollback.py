"""Actual prior archive -> new backend -> restored backup, disposable data only.
This is a backend upgrade test, not a real browser-profile migration.
"""
import argparse, json, os, pathlib, shutil, socket, subprocess, sys, tempfile, urllib.request, urllib.error, wave, zipfile, secrets, time
from source_tree import require, sha256, zip_files, LEGACY_REQUIRED
root=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('previous',type=pathlib.Path);p.add_argument('--sha256',required=True,help='Independently verified prior source digest');args=p.parse_args()
if not __debug__:p.error('Python optimization disables required test assertions')
require(sha256(args.previous)==args.sha256,'Prior source kit SHA-256 mismatch')
with tempfile.TemporaryDirectory(prefix='cachy-upgrade-') as t:
 t=pathlib.Path(t);previous=t/'previous';previous.mkdir()
 with zipfile.ZipFile(args.previous) as z:
  roots={pathlib.PurePosixPath(name).parts[0] for name in z.namelist() if name}
  require(len(roots)==1,'Expected one prior source root')
  prefix=next(iter(roots));require(prefix.startswith('CachyMusic-'),'Invalid prior source root')
  entries=zip_files(z,prefix,required=LEGACY_REQUIRED)
  old_package=json.loads(z.read(entries['package.json']))
  require(prefix=='CachyMusic-'+old_package['version'],'Prior archive version mismatch')
  require(old_package['version']!=json.loads((root/'package.json').read_text())['version'],'Prior kit must not be the current version')
  z.extractall(previous)
 old=previous/prefix;music=t/'music';music.mkdir();song=music/'Reference.wav'
 with wave.open(str(song),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(8000);f.writeframes(bytes(16000))
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 env={k:v for k,v in os.environ.items() if not k.startswith(('DB_','MYSQL_','CACHYMUSIC_','CACHY_'))};env.update(HOME=str(t),USERPROFILE=str(t),LOCALAPPDATA=str(t/'state'),XDG_STATE_HOME=str(t/'state'),CACHYMUSIC_DATA_DIR=str(t/'data'),CACHYMUSIC_CACHE_DIR=str(t/'cache'),CACHY_PORT=str(port),CACHYMUSIC_MPRIS='0')
 def launch(tree,action):
  r=subprocess.run([sys.executable,str(tree/'bin/desktop-launcher.py'),action],cwd=tree,env=env,text=True,capture_output=True,timeout=30);assert r.returncode==0,(action,r.stdout,r.stderr);return r.stdout
 http=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 def request(path,body=None):
  req=urllib.request.Request(f'http://127.0.0.1:{port}/php/api/{path}',data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'} if body is not None else {})
  with http.open(req,timeout=15) as response:return json.load(response)
 def scan_tracks(directory=''):
  try:cap=request('scan_jobs.php')
  except urllib.error.HTTPError as e:
   if e.code!=404:raise
   cap={'enabled':False}
  if not cap.get('enabled'):return request('scan.php',{'directory':directory}) if directory else request('tracks.php')
  deadline=time.monotonic()+20
  while not cap.get('ready'):
   assert time.monotonic()<deadline;time.sleep(.05);cap=request('scan_jobs.php')
  id=secrets.token_hex(16);state=request('scan_jobs.php',{'action':'start','id':id,'directory':directory,'preserveDirectory':False});assert state['id']==id
  while state['phase']!='done':
   assert state['phase'] in ('queued','running','committing') and time.monotonic()<deadline,state;time.sleep(.05);state=request('scan_jobs.php?id='+id)
  return request('scan_jobs.php?id='+id+'&result=1')
 active=None
 try:
  launch(old,'--background');active=old
  scan=scan_tracks(str(music));assert scan['success'] and scan['count']==1,scan
  tracks=scan_tracks();tid=tracks['tracks'][0]['tid'];p1=request('playlists.php',{'action':'create','name':'Before upgrade','tracks':[tid]});assert p1['success'],p1
  original=request('playlists.php')['playlists'];launch(old,'--stop');active=None;shutil.copytree(t/'data',t/'backup');original_bytes=(t/'backup'/'library.json').read_bytes()
  launch(root,'--background');active=root;assert request('playlists.php')['playlists']==original;assert scan_tracks()['tracks'][0]['tid']==tid
  p2=request('playlists.php',{'action':'edit','plid':p1['plid'],'revision':p1['playlist']['revision'],'name':'After upgrade','tracks':[tid]});assert p2['success'],p2
  stale=request('playlists.php',{'action':'edit','plid':p1['plid'],'revision':p1['playlist']['revision'],'name':'Stale','tracks':[tid]});assert not stale['success']
  launch(root,'--stop');active=None
  assert (t/'data'/'library.json').read_bytes()!=original_bytes
  # Previous launcher cannot necessarily reuse a TIME_WAIT port; restore
  # into an isolated backend/origin, as required by the rollback guide.
  shutil.copytree(t/'backup',t/'restored');env['CACHYMUSIC_DATA_DIR']=str(t/'restored')
  with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
  env['CACHY_PORT']=str(port);launch(old,'--background');active=old
  assert request('playlists.php')['playlists']==original;assert scan_tracks()['tracks'][0]['tid']==tid
  assert (t/'backup'/'library.json').read_bytes()==original_bytes
 finally:
  if active:launch(active,'--stop')
print('PASS actual old/new Linux backend upgrade, playlist identity/revision, stale write rejection, separate restored backup and rollback')
