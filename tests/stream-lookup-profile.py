"""Disposable paired media-range lookup benchmark; exact byte verification, no speed threshold."""
import argparse,json,os,pathlib,socket,statistics,subprocess,tempfile,time,urllib.request,wave
p=argparse.ArgumentParser();p.add_argument('--baseline',type=pathlib.Path,required=True);p.add_argument('--candidate',type=pathlib.Path,required=True);p.add_argument('--records',type=int,default=25000);a=p.parse_args()
if a.records<9:p.error('Need at least nine rows')
def summary(values):
    values=sorted(values);return {'samples':len(values),'median_ms':round(statistics.median(values),2),'p95_ms':round(values[min(len(values)-1,int(.95*len(values)))],2),'max_ms':round(max(values),2)}
with tempfile.TemporaryDirectory() as tmp:
    t=pathlib.Path(tmp);music=t/'music';music.mkdir();song=music/'1.wav'
    with wave.open(str(song),'wb') as f:f.setparams((1,2,8000,8000,'NONE','none'));f.writeframes(bytes(16000))
    raw=song.read_bytes()
    for i in range(2,10):(music/f'{i}.wav').write_bytes(raw)
    tracks={str(i):{'tid':i,'full_path':str(music/f'{i}.wav'),'file_path':f'{i}.wav','title':f'Track {i}','artist':'Fixture','album':'Fixture album','duration':1,'file_size':16044,'mtime':1,'sample_rate':8000,'format':'WAV'} for i in range(1,a.records+1)}
    data=json.dumps({'tracks':tracks,'playlists':[],'default_directory':str(music),'soulseek':{}},indent=2).encode();procs=[];urls=[];client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def request(j,i):
        begin=time.perf_counter();req=urllib.request.Request(urls[j]+str(i),headers={'Range':'bytes=0-43'})
        with client.open(req,timeout=15) as f:
            if f.status!=206 or f.read()!=raw[:44] or not f.headers.get('X-Cachy-Media-Version'):raise RuntimeError('Invalid media range')
        return (time.perf_counter()-begin)*1000
    try:
        for j,root in enumerate([a.baseline.resolve(),a.candidate.resolve()]):
            profile=t/f'profile{j}';profile.mkdir();(profile/'library.json').write_bytes(data);cache=t/f'cache{j}';cache.mkdir();env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))};env.update(HOME=tmp,CACHYMUSIC_DATA_DIR=str(profile),CACHYMUSIC_CACHE_DIR=str(cache))
            with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
            procs.append(subprocess.Popen(['php','-S',f'127.0.0.1:{port}','-t',str(root),str(root/'index.php')],env=env,cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL));urls.append(f'http://127.0.0.1:{port}/php/api/stream.php?tid=')
            for _ in range(100):
                try:request(j,1);break
                except OSError:time.sleep(.03)
            else:raise RuntimeError('warmup failed')
        warm=[[],[]];cold=[[],[]]
        for i in range(30):
            for j in [i%2,1-i%2]:warm[j].append(request(j,1))
        for i in range(2,10):
            for j in [i%2,1-i%2]:cold[j].append(request(j,i))
        print(json.dumps({'records':a.records,'library_bytes':len(data),'baseline':{'warm':summary(warm[0]),'cold':summary(cold[0])},'candidate':{'warm':summary(warm[1]),'cold':summary(cold[1])},'scope':'Paired alternating loopback requests in normal PHP CLI configuration; exact 44-byte ranges verified, not physical performance qualification'},indent=2))
    finally:
        for proc in procs:proc.terminate();proc.wait(timeout=5)
