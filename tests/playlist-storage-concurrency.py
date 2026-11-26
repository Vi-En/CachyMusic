"""Exercise actual PHP storage in disposable directories; no live account or MySQL."""
import json,os,subprocess,tempfile,pathlib,time
root=pathlib.Path(__file__).resolve().parents[1];storage=json.dumps(str(root/'php/storage.php'))
def cmd(body):return ['php','-n','-r',f'require_once {storage}; '+body]
def env(d):return {**os.environ,'CACHYMUSIC_DATA_DIR':d}
def php(body,d):return json.loads(subprocess.check_output(cmd(body),env=env(d),text=True))
with tempfile.TemporaryDirectory() as d:
 assert php('echo json_encode(Storage::createPlaylist("Base","tester"));',d)>0
 procs=[subprocess.Popen(cmd(f'echo json_encode(Storage::createPlaylist("P{i}","tester"));'),env=env(d),stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for i in range(12)]
 ids=[]
 for p in procs:
  out,err=p.communicate(timeout=10);assert p.returncode==0 and not err,(out,err);ids.append(json.loads(out))
 assert all(ids) and len(set(ids))==12,ids
 assert len(php('echo json_encode(Storage::getPlaylists("tester"));',d))==13
 # Stage a legacy scan snapshot, then commit an independent playlist write.
 code='''$d=Storage::read();$dir=getenv("CACHYMUSIC_DATA_DIR");file_put_contents($dir."/ready","1");$deadline=microtime(true)+5;while(!file_exists($dir."/go")&&microtime(true)<$deadline)usleep(1000);$d["tracks"][10]=["tid"=>10];echo json_encode(Storage::write($d));'''
 p=subprocess.Popen(cmd(code),env=env(d),stdout=subprocess.PIPE,text=True)
 try:
  deadline=time.monotonic()+5
  while not (pathlib.Path(d)/'ready').exists():
   if time.monotonic()>deadline:raise RuntimeError('barrier timeout')
   time.sleep(.01)
  assert php('echo json_encode(Storage::createPlaylist("Independent","tester"));',d)>0
  (pathlib.Path(d)/'go').touch();out,_=p.communicate(timeout=5);assert out=='true'
  data=php('echo json_encode(Storage::read());',d);assert len(data['playlists'])==14 and '10' in data['tracks']
 finally:
  if p.poll() is None:p.kill();p.wait()
 # Explicit same-field stale snapshot must fail rather than silently overwrite.
 code='''$d=Storage::read();$dir=getenv("CACHYMUSIC_DATA_DIR");file_put_contents($dir."/ready2","1");$deadline=microtime(true)+5;while(!file_exists($dir."/go2")&&microtime(true)<$deadline)usleep(1000);$d["playlists"]=[];echo json_encode(Storage::write($d));'''
 p=subprocess.Popen(cmd(code),env=env(d),stdout=subprocess.PIPE,text=True)
 try:
  deadline=time.monotonic()+5
  while not (pathlib.Path(d)/'ready2').exists():
   if time.monotonic()>deadline:raise RuntimeError('barrier timeout')
   time.sleep(.01)
  assert php('echo json_encode(Storage::createPlaylist("Later","tester"));',d)>0
  (pathlib.Path(d)/'go2').touch();out,_=p.communicate(timeout=5);assert out=='false';assert len(php('echo json_encode(Storage::getPlaylists("tester"));',d))==15
 finally:
  if p.poll() is None:p.kill();p.wait()
with tempfile.TemporaryDirectory() as d:
 result=php('''$id=Storage::createPlaylist("Original","tester");$p=getenv("CACHYMUSIC_DATA_DIR")."/library.json";rename($p,$p.".bak");mkdir($p);$a=Storage::createPlaylist("Not persisted","tester");$b=Storage::deletePlaylist($id,"tester",0);echo json_encode([$a,$b]);''',d)
 assert result==[False,False],result
 backup=json.loads((pathlib.Path(d)/'library.json.bak').read_text());assert [p['name'] for p in backup['playlists']]==['Original']
print('PASS 12 independent PHP process creates, stale scan merge, stale same-field rejection, failed destination preserves backup')
