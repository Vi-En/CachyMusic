"""Paired, synthetic CLI benchmark; not Windows HTTP performance qualification."""
import tempfile, pathlib, os, json, subprocess, statistics
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as t:
 d=pathlib.Path(t); data=d/'data'; cache=d/'cache'; data.mkdir();cache.mkdir();lib=data/'library.json'
 rows={str(i):{'full_path':f'/music/folder/{i}.wav','file_path':f'{i}.wav','title':f'Synthetic recording {i}','artist':'Synthetic artist','album':'Synthetic album','lyrics':'x'*120,'duration':240,'sample_rate':48000} for i in range(1,25001)}
 lib.write_text(json.dumps({'tracks':rows,'playlists':[],'default_directory':'/music','soulseek':{'downloads_dir':'/downloads','shared_dir':'/share'}}))
 env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','MYSQL_','DB_'))};env.update(CACHYMUSIC_DATA_DIR=str(data),CACHYMUSIC_CACHE_DIR=str(cache),CACHYMUSIC_MANAGED_SERVICES='1',CACHYMUSIC_LOOKUP_KEY='03'*32)
 code='''require 'php/storage.php';require 'php/cover_index.php';if(cm_portable_lookup_key()===null)exit(4);$a=[];$b=[];cm_portable_lookup_snapshot(1);for($i=0;$i<30;$i++){ $t=hrtime(true);$x=Storage::read();$a[]=(hrtime(true)-$t)/1e6;if(($x['tracks'][1]['full_path']??null)!=='/music/folder/1.wav')exit(2);unset($x);$t=hrtime(true);$y=cm_portable_lookup_snapshot(1);$b[]=(hrtime(true)-$t)/1e6;if(($y['tracks'][1]['full_path']??null)!=='/music/folder/1.wav')exit(3);unset($y);}echo json_encode([$a,$b]);'''
 r=subprocess.check_output(['php','-r',code],env=env,cwd=root,text=True,timeout=60);a,b=json.loads(r);result={'library_bytes':lib.stat().st_size,'records':25000,'iterations':30,'full_decode_ms':a,'encrypted_lookup_ms':b,'full_median_ms':statistics.median(a),'lookup_median_ms':statistics.median(b),'scope':'Linux PHP CLI paired fixture; native Windows HTTP not tested'};print(json.dumps(result))
