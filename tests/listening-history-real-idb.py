"""Real-origin IDB acceptance. No storage mocks; loopback must be allowed."""
import argparse, functools, http.server, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path=='/history-fixture':
            self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(b'<!doctype html><title>History acceptance</title>');return
        super().do_GET()
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=root));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
    b=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox']);ctx=b.new_context();a=ctx.new_page();c=ctx.new_page();url=f'http://127.0.0.1:{server.server_port}/history-fixture'
    a.goto(url,timeout=10000)
    a.evaluate('''()=>new Promise((resolve,reject)=>{const r=indexedDB.open('cachymusic-listening-history',1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('days',{keyPath:['day','key']});s.put({day:'2026-01-01',key:'tid:1',title:'Legacy',artist:'Artist',count:3});s.put({day:'2026-01-02',key:'tid:1',title:'Legacy',artist:'Artist',count:4});};r.onerror=()=>reject(r.error);r.onsuccess=()=>{r.result.close();resolve();};})''')
    c.goto(url,timeout=10000)
    for page in (a,c):page.evaluate("async()=>{window.h=await import('/scripts/modules/listening-history.js');await h.openHistory();window.read=async name=>{const db=await h.openHistory();return new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});};}")
    old=a.evaluate("()=>read('totals')");assert len(old)==1 and old[0]['count']==7 and old[0]['legacy'],old
    e={'id':'visit-1','key':'recording:fixture','generation':'0','day':'2026-11-25','title':'New','artist':'Artist'}
    for page in (a,c):page.evaluate('(e)=>{window.write=h.persistListeningVisit(e)}',e)
    assert all(page.evaluate('()=>write') for page in (a,c))
    rows=a.evaluate("()=>read('totals')");assert sum(r['count'] for r in rows)==8,rows
    for page,i in [(a,2),(c,3)]:page.evaluate('(e)=>{window.write=h.persistListeningVisit(e)}',{**e,'id':f'visit-{i}'})
    assert all(page.evaluate('()=>write') for page in (a,c));assert sum(r['count'] for r in a.evaluate("()=>read('totals')"))==10
    a.evaluate('()=>h.clearListeningHistory()')
    assert not c.evaluate('(e)=>h.persistListeningVisit(e)',{**e,'id':'stale'})
    assert not a.evaluate("()=>read('days')") and not a.evaluate("()=>read('visits')")
    new_generation=a.evaluate("()=>localStorage.getItem('cachymusic_listening_generation')")
    assert c.evaluate('(e)=>h.persistListeningVisit(e)',{**e,'id':'new-visit','generation':new_generation})
    assert sum(r['count'] for r in a.evaluate("()=>read('totals')"))==1
    assert not a.evaluate('(e)=>h.persistListeningVisit(e)',{**e,'id':'new-visit','key':'recording:conflict','generation':new_generation})
    assert not c.evaluate('(e)=>h.persistListeningVisit(e)',{**e,'id':'bad-date','day':'2026-02-30','generation':new_generation})
    ahead=str(int(new_generation)+5)
    a.evaluate("g=>localStorage.setItem('cachymusic_listening_generation',g)",ahead)
    a.evaluate('()=>h.clearListeningHistory()')
    final_generation=a.evaluate("()=>localStorage.getItem('cachymusic_listening_generation')")
    assert int(final_generation)>int(ahead)
    assert c.evaluate('(e)=>h.persistListeningVisit(e)',{**e,'id':'after-cache-recovery','generation':final_generation})
    assert sum(r['count'] for r in a.evaluate("()=>read('totals')"))==1
    b.close()
finally:server.shutdown();server.server_close()
print('PASS real IDB migration, concurrent increments, idempotent visits, transactional clear and stale write rejection')
