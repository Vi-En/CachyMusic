"""Actual PHP queue HTTP, retry, exclusivity and bounded-receipt tests."""
import json, os, pathlib, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
checks=[]
def check(name,ok):
    checks.append(bool(ok));print(('PASS ' if ok else 'FAIL ')+name,flush=True)
with tempfile.TemporaryDirectory() as tmp:
    t=pathlib.Path(tmp);state=t/'state'/'cachymusic';state.mkdir(parents=True)
    env={k:v for k,v in os.environ.items() if not k.startswith(('CACHY','DB_','MYSQL_'))};env.update(HOME=tmp,USERPROFILE=tmp,XDG_STATE_HOME=str(t/'state'),CACHYMUSIC_DATA_DIR=str(t/'data'),CACHYMUSIC_CACHE_DIR=str(t/'cache'))
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    proc=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','-t',str(root),str(root/'index.php')],env=env,cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    base=f'http://127.0.0.1:{port}/php/api/mpris_state.php?action=';client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def req(action,body=None,headers=None):
        data=None if body is None else json.dumps(body).encode();r=urllib.request.Request(base+action,data=data,headers=headers or {'Content-Type':'application/json'})
        try:
            with client.open(r,timeout=5) as f:return f.status,json.loads(f.read())
        except urllib.error.HTTPError as e:
            try:return e.code,json.loads(e.read())
            except ValueError:return e.code,{}
        except (ValueError,OSError):return 0,{}
    ids=[f'{i:032x}' for i in range(1,80)];a='a'*32;b='b'*32
    def send(i,cmd='Next'):return req('send_command',{'id':ids[i],'command':cmd})
    def poll(owner):return req('get_command',{'client':owner})
    def ack(i,owner=a):return req('ack_command',{'id':ids[i],'client':owner,'outcome':'dispatched'})
    try:
        for _ in range(100):
            if req('get_state')[0]==200:break
            time.sleep(.03)
        legacy=state/'mpris_pending_command.json';legacy.write_text('{"command":"Pause"}')
        check('legacy pending mailbox is surfaced not silently replayed',req('command_status')[1].get('legacy_pending') is True)
        legacy.unlink(missing_ok=True)
        check('cross-origin mutation rejected',req('send_command',{'command':'Next'},{'Content-Type':'application/json','Origin':'https://untrusted.invalid'})[0]==403)
        check('non-JSON mutation rejected',req('send_command',{'command':'Next'},{'Content-Type':'text/plain'})[0]==415)
        check('two commands durably enqueued',send(0)[1].get('id')==ids[0] and send(1,'Pause')[1].get('id')==ids[1])
        check('duplicate sender ID is idempotent',send(0)[1].get('outcome')=='queued' and req('command_status')[1].get('pending')==2)
        check('same ID with different payload rejected',send(0,'Stop')[0]==409)
        c=poll(a)[1];check('FIFO claim does not overwrite earlier command',c.get('id')==ids[0] and c.get('command')=='Next')
        check('other consumer cannot claim head or later entry',poll(b)[1].get('command') is None)
        check('lost claim response can be retried by same consumer',poll(a)[1].get('id')==ids[0])
        check('wrong owner cannot acknowledge',ack(0,b)[0]==409)
        check('acknowledgement and lost response retry are idempotent',ack(0)[1].get('outcome')=='dispatched' and ack(0)[1].get('outcome')=='dispatched')
        check('next command only released after prior acknowledgement',poll(b)[1].get('id')==ids[1] and ack(1,b)[1].get('outcome')=='dispatched')
        check('sender replay after receipt never requeues command',send(0)[1].get('outcome')=='dispatched' and poll(a)[1].get('command') is None)
        q=state/'mpris_command_queue.json'
        if q.exists():
            # A float written through JSON must not change its deduplication identity.
            v={'id':'e'*32,'command':'SetVolume','volume':1.0}
            first=req('send_command',v);again=req('send_command',v)
            check('numeric command replay survives JSON serialization',first[1].get('id')==v['id'] and again[1].get('outcome')=='queued')
            c=poll(a)[1];req('ack_command',{'client':a,'id':v['id'],'outcome':'dispatched'})
            check('integral and floating representations deduplicate',req('send_command',{**v,'volume':1})[1].get('outcome')=='dispatched')
            # A structurally invalid persisted command is not returned to a consumer.
            j=json.loads(q.read_bytes());j['pending']=[{'id':'f'*32,'payload':{'command':'SetVolume','volume':999},'created':time.time(),'owner':None,'until':None}]
            raw=json.dumps(j).encode();q.write_bytes(raw)
            check('invalid persisted payload fails closed',poll(a)[0]==503 and q.read_bytes()==raw)
            j['pending']=[];q.write_text(json.dumps(j))
        else:
            for label in ['numeric retry','numeric canonicalization','invalid journal payload']:check(label,False)

        if q.exists():
            send(2);poll(a);j=json.loads(q.read_bytes());j['pending'][0]['until']=time.time()-1;q.write_text(json.dumps(j));send(3,'Play')
            check('expired claim marked uncertain without replay',poll(b)[1].get('id')==ids[3] and ack(2)[1].get('outcome')=='uncertain');ack(3,b)
            send(4);j=json.loads(q.read_bytes());j['pending'][0]['created']=time.time()-61;q.write_text(json.dumps(j))
            check('expired undelivered command not executed',poll(a)[1].get('command') is None and send(4)[1].get('outcome')=='expired')
            for i in range(5,69):send(i)
            check('full queue rejects additional commands instead of replacing',send(69)[0]==429 and req('command_status')[1].get('pending')==64)
            raw=b'{broken';q.write_bytes(raw)
            check('corrupt journal fails closed without truncation',send(70)[0]==503 and q.read_bytes()==raw)
        else:
            for label in ['expired claim recorded','expired queued command','queue capacity','corrupt journal protection']:check(label,False)
    finally:proc.terminate();proc.wait(timeout=5)
print(f'{sum(checks)}/{len(checks)} passed');raise SystemExit(0 if all(checks) else 1)
