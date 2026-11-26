"""Kill actual Storage writers and validate the resulting snapshots; no simulated power-loss claim."""
import json, os, pathlib, subprocess, tempfile, time
root=pathlib.Path(__file__).resolve().parents[1]
if not __debug__:raise SystemExit('Assertions required')
if os.name!='posix':raise SystemExit('Requires POSIX process termination')
with tempfile.TemporaryDirectory() as temp:
    data=pathlib.Path(temp);db=data/'library.json';env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))};env['CACHYMUSIC_DATA_DIR']=temp
    require='require '+json.dumps(str(root/'php/storage.php'))+'; '
    def run(code):
        return subprocess.check_output(['php','-n','-r',require+code],env=env,text=True,timeout=20)
    assert json.loads(run('echo json_encode(Storage::upsertTrack(["full_path"=>"/music/ref.wav","file_path"=>"ref.wav","title"=>"Original","mtime"=>1,"file_size"=>10]));'))==1
    assert json.loads(run('echo json_encode(Storage::createPlaylist("Keep","tester",[1]));'))
    initial=json.loads(db.read_bytes());assert initial['tracks']['1']['title']=='Original';playlists=initial['playlists']
    old_count=new_count=0;reads=0
    # Real large metadata mutations lengthen the file-replacement window.
    for i in range(12):
        before=db.read_bytes();prefix='update-'+str(i)+'-';expected=prefix+'x'*(8*1024*1024)
        code='echo json_encode(Storage::updateTrackMetadata(1,["title"=>'+json.dumps(prefix)+' . str_repeat("x",8388608)]));'
        writer=subprocess.Popen(['php','-n','-r',require+code],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        existing=set(data.glob('.cm-write-*'));deadline=time.monotonic()+10
        try:
            while writer.poll() is None and time.monotonic()<deadline:
                if set(data.glob('.cm-write-*'))-existing:
                    # Stop immediately after staging is observed, then kill. Rename may already have occurred.
                    writer.kill();break
                time.sleep(.0005)
            if writer.poll() is None:writer.kill()
            writer.communicate(timeout=10)
        finally:
            if writer.poll() is None:writer.kill();writer.wait()
        raw=db.read_bytes();row=json.loads(raw);reads+=1
        assert row['playlists']==playlists and row['tracks']['1']['full_path']=='/music/ref.wav'
        assert raw==before or row['tracks']['1']['title']==expected,'Torn or unexpected write'
        if raw==before:old_count+=1
        else:new_count+=1
        # A fresh writer must recover the stable sidecar lock and commit afterward.
        assert json.loads(run('echo json_encode(Storage::updateTrackMetadata(1,["title"=>"recovered-'+str(i)+'"]));')) is not False
        recovered=json.loads(db.read_bytes());assert recovered['tracks']['1']['title']=='recovered-'+str(i) and recovered['playlists']==playlists
    assert old_count>0,'Did not observe a pre-publication termination'
    # Kill a process immediately after it reports a successful actual commit.
    writer=subprocess.Popen(['php','-n','-r',require+'$r=Storage::updateTrackMetadata(1,["title"=>"confirmed"]);echo json_encode($r).PHP_EOL;fflush(STDOUT);sleep(60);'],env=env,text=True,stdout=subprocess.PIPE)
    try:
        assert json.loads(writer.stdout.readline())['title']=='confirmed'
    finally:writer.kill();writer.wait(timeout=5)
    assert json.loads(db.read_bytes())['tracks']['1']['title']=='confirmed'
    assert json.loads(run('echo json_encode(Storage::updateTrackMetadata(1,["title"=>"after-confirmed-kill"]));'))['title']=='after-confirmed-kill' 
    print(json.dumps({'kill_attempts':12,'old_snapshot':old_count,'new_snapshot':new_count,'valid_snapshots':reads,'successful_recovery_writes':13,'post_commit_kill':True,'abandoned_temporary_files':len(list(data.glob('.cm-write-*')))}))
    print('PASS abrupt process termination and lock recovery; no power-loss or SQL durability claim')
