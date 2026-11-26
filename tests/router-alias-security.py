"""Real PHP server against a disposable checkout: public aliases must not expose private files."""
from pathlib import Path
import os, shutil, tempfile, socket, subprocess, time, urllib.request, urllib.error
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as t:
 d=Path(t)/'checkout';d.mkdir();shutil.copy2(root/'index.php',d);shutil.copytree(root/'php',d/'php');shutil.copy2(root/'index.html',d)
 (d/'scripts').mkdir();(d/'scripts'/'safe.js').write_text('safe');(d/'data').mkdir();(d/'data'/'private.json').write_text('{"private":"fixture"}');(d/'data'/'covers').mkdir();(d/'data'/'covers'/'unexpected.json').write_text('fixture');(d/'php'/'private.php').write_text('<?php echo "private fixture";')
 try:
  os.link(d/'data'/'private.json',d/'scripts'/'hard.json');os.link(d/'php'/'private.php',d/'php'/'api'/'hard.php')
  (d/'scripts'/'alias.json').symlink_to(d/'data'/'private.json');(d/'php'/'api'/'alias.php').symlink_to(d/'php'/'private.php')
 except OSError:
  if os.name=='nt':print('SKIP symlink fixture: Windows symlink permission unavailable');raise SystemExit(0)
  raise
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 p=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','index.php'],cwd=d,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  time.sleep(.35);http=urllib.request.build_opener(urllib.request.ProxyHandler({}))
  def status(path):
   try:return http.open(f'http://127.0.0.1:{port}{path}',timeout=3).status
   except urllib.error.HTTPError as e:return e.code
  assert status('/scripts/safe.js')==200
  for path in ['/scripts/alias.json','/php/api/alias.php','/data/covers/unexpected.json','/scripts/hard.json','/php/api/hard.php']:assert status(path)==404,path
 finally:p.terminate();p.wait(timeout=5)
print('PASS real router prevents public aliases into private data and private PHP; raw cache directory denied')
