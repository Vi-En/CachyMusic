"""Independent MySQL connections; gated disposable fixture only. No credentials in output."""
import concurrent.futures
import json
import os
from pathlib import Path
import selectors
import subprocess
import time
import uuid

if os.environ.get('CACHYMUSIC_SQL_FIXTURE') != '1' or os.environ.get('DB_NAME') != 'MusicPlayer_fixture' or not os.environ.get('CACHYMUSIC_DATA_DIR'):
    raise SystemExit('Disposable fixture database and storage required')
worker = Path(__file__).with_name('playlist-mysql-worker.php')
user = 'race_' + uuid.uuid4().hex[:12]

def race(requests):
    children = []
    try:
        with selectors.DefaultSelector() as ready:
            for request in requests:
                child = subprocess.Popen(['php', str(worker)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                children.append(child)
                ready.register(child.stdout, selectors.EVENT_READ, child)
            deadline = time.monotonic() + 20
            while ready.get_map():
                if time.monotonic() >= deadline:
                    raise RuntimeError('SQL worker readiness timeout')
                for key, _ in ready.select(max(0, deadline-time.monotonic())):
                    if key.fileobj.readline().strip() != 'READY':
                        raise RuntimeError('SQL worker failed before barrier')
                    ready.unregister(key.fileobj)
        # All clients are connected before any mutation begins.
        def submit(pair):
            child, request = pair
            out, _ = child.communicate(json.dumps(dict(request, user=user))+'\n', timeout=30)
            if child.returncode:
                raise RuntimeError('SQL worker failed')
            return json.loads(out)
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(children)) as pool:
            return list(pool.map(submit, zip(children, requests)))
    finally:
        for child in children:
            if child.poll() is None:
                child.kill()
            child.communicate()

def call(action, **kwargs):
    return race([dict(action=action, **kwargs)])[0]

def owned():
    return [row for row in call('read') if row['username']==user]

try:
    ids = race([dict(action='create',name=f'{user}_{i}',tracks=[101]) for i in range(12)])
    assert all(type(i) is int and i > 0 for i in ids) and len(set(ids)) == 12, 'concurrent allocation failed'
    rows = owned()
    assert {r['plid'] for r in rows} == set(ids) and all(r['tracks']==[101] and r['revision']==0 for r in rows), 'lost or invalid creation'
    target = ids[0]
    # A malformed batch must not prevent the valid same-revision writer.
    outcomes = race([dict(action='add',id=target,tracks=[102,999],revision=0),dict(action='add',id=target,tracks=[102],revision=0)])
    assert outcomes == [False,True], 'atomic validation or rollback failed'
    names = [user+'_first',user+'_second']
    outcomes = race([dict(action='edit',id=target,name=name,tracks=[102,101],revision=1) for name in names])
    assert sum(result is True for result in outcomes)==1, 'same-revision edits must have one winner'
    row = call('detail',id=target)
    assert row['revision']==2 and row['name']==names[outcomes.index(True)] and [int(t['tid']) for t in row['tracks']]==[102,101], 'inconsistent detail read'
    assert call('delete',id=target,revision=2) is True
    new = call('create',name=user+'_replacement')
    assert type(new) is int and new>max(ids), 'allocator reused identity'
    print('PASS MySQL concurrency: 12 connected creators, atomic invalid/valid batch race, revision conflict, consistent detail, stable allocator')
finally:
    for row in owned():
        assert call('delete',id=row['plid'],revision=row['revision']) is True, 'fixture cleanup failed'
