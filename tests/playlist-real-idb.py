"""Run on an ordinary local browser origin; no mocked IndexedDB or storage.
An environment that denies loopback navigation must report this gate blocked.
"""
import argparse, functools, http.server, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--chromium',default='/usr/bin/chromium');args=parser.parse_args()
class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path=='/playlist-fixture':
            self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(b'<!doctype html><title>Disposable playlist fixture</title>');return
        super().do_GET()
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=root));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox']);ctx=b.new_context();a=ctx.new_page();c=ctx.new_page();url=f'http://127.0.0.1:{server.server_port}/playlist-fixture'
        for page in (a,c):page.goto(url,timeout=10000);page.evaluate("async()=>{window.lib=await import('/scripts/modules/local-library.js')}")
        original={'plid':'local_pl_shared','name':'Shared','tracks':[],'revision':0}
        assert a.evaluate('(record)=>lib.mutateLocalPlaylist(null,record)',original)
        for page in (a,c):page.evaluate('async()=>{window.original=(await lib.loadLocalPlaylists()).find(p=>p.plid==="local_pl_shared")}')
        a.evaluate("()=>{window.operation=lib.mutateLocalPlaylist(original,{...original,name:'First',revision:1})}")
        c.evaluate("()=>{window.operation=lib.mutateLocalPlaylist(original,{...original,name:'Second',revision:1})}")
        outcomes=[page.evaluate('()=>operation') for page in (a,c)];assert sum(outcomes)==1,outcomes
        a.evaluate("()=>{window.operation=lib.mutateLocalPlaylist(null,{plid:'local_pl_a',name:'A',tracks:[],revision:0})}")
        c.evaluate("()=>{window.operation=lib.mutateLocalPlaylist(null,{plid:'local_pl_c',name:'C',tracks:[],revision:0})}")
        assert all(page.evaluate('()=>operation') for page in (a,c))
        rows=a.evaluate('()=>lib.loadLocalPlaylists()');assert len(rows)==3 and sum(row['plid']=='local_pl_shared' and row['revision']==1 for row in rows)==1,rows
        b.close()
finally:server.shutdown();server.server_close()
print('PASS actual cross-tab IndexedDB: concurrent independent writes, same-record revision conflict, no lost records')
