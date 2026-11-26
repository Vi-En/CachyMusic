"""Invoke actual API script with disposable storage and CLI POST/GET request fixtures."""
import json, os, subprocess, tempfile, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
api=json.dumps(str(root/'php/api/playlists.php'));storage=json.dumps(str(root/'php/storage.php'))
with tempfile.TemporaryDirectory() as d:
 env={**os.environ,'CACHYMUSIC_DATA_DIR':d}
 def request(method,fields):
  body=json.dumps(json.dumps(fields));code=f'$_SERVER["REQUEST_METHOD"]="{method}"; '+('$_POST' if method=='POST' else '$_GET')+f'=json_decode({body},true);require {api};'
  result=subprocess.run(['php','-n','-r',code],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,check=True);return json.loads(result.stdout)
 row=request('POST',{'action':'create','name':'Test'});assert row['success'];plid=row['plid'];assert row['playlist']['revision']==0
 assert not request('POST',{'action':'add_track','plid':plid,'tid':999999})['success']
 subprocess.run(['php','-n','-r',f'require {storage};$d=Storage::read();$d["tracks"][1]=["tid"=>1];if(!Storage::write($d))exit(1);'],env=env,check=True)
 assert not request('POST',{'action':'create','name':'Invalid initial','tracks':[999]})['success'];assert not request('POST',{'action':'add_tracks','plid':plid,'tracks':[1,999],'revision':0})['success'];assert request('GET',{})['playlists'][0]['tracks']==[]
 row=request('POST',{'action':'add_tracks','plid':plid,'tracks':[1],'revision':0});assert row['success'] and row['playlist']['revision']==1 and row['playlist']['tracks']==[1]
 assert not request('POST',{'action':'edit','plid':plid,'name':'Stale','tracks':[1],'revision':0})['success']
 assert not request('POST',{'action':'delete','plid':str(plid)+'junk','revision':1})['success']
 assert not request('POST',{'action':'delete','plid':plid,'revision':'bad'})['success']
 row=request('POST',{'action':'edit','plid':plid,'name':'Updated','tracks':[1],'revision':1});assert row['success'] and row['playlist']['revision']==2
 # Repair membership is a separate explicit revision-checked operation.
 subprocess.run(['php','-n','-r',f'require {storage};$d=Storage::read();$d["tracks"][2]=["tid"=>2];if(!Storage::write($d))exit(1);'],env=env,check=True)
 assert not request('POST',{'action':'edit_members','plid':plid,'name':'Repair','tracks':[2,999],'revision':2})['success']
 assert not request('POST',{'action':'edit_members','plid':plid,'name':'Repair','tracks':[2,2],'revision':2})['success']
 assert not request('POST',{'action':'edit_members','plid':plid,'name':'Repair','tracks':[2],'revision':1})['success']
 assert request('GET',{})['playlists'][0]['tracks']==[1]
 row=request('POST',{'action':'edit_members','plid':plid,'name':'Repair','tracks':[2],'revision':2});assert row['success'] and row['playlist']['tracks']==[2] and row['playlist']['revision']==3
 row=request('POST',{'action':'edit_members','plid':plid,'name':'Repair','tracks':[],'revision':3});assert row['success'] and row['playlist']['tracks']==[] and row['playlist']['revision']==4
 assert request('POST',{'action':'delete','plid':plid,'revision':4})['success'];assert request('GET',{})['playlists']==[]
 row=request('POST',{'action':'create','name':'Atomic create and add','tracks':[1]});assert row['success'] and row['playlist']['tracks']==[1];assert request('POST',{'action':'delete','plid':row['plid'],'revision':0})['success']
 pathlib.Path(d,'library.json').write_text('broken json');assert not request('GET',{})['success']
print('PASS actual PHP playlist endpoint: authoritative revision, missing track, invalid identifiers, stale edit, delete and unreadable storage')
