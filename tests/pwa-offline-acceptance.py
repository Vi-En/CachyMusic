"""Real secure-origin service-worker acceptance. Requires loopback navigation.
Exercises shell caching and scope isolation, not OS-level PWA installation.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from urllib.parse import urlsplit
import argparse
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--chromium',default='/usr/bin/chromium')
args=parser.parse_args()
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def do_GET(self):
        path=urlsplit(self.path).path
        if path in ('/a/probe','/b/probe'):
            self.send_response(200)
            self.send_header('Content-Type','text/html')
            self.send_header('Cache-Control','no-store')
            self.end_headers()
            self.wfile.write(b'<!doctype html><title>Service worker acceptance</title>')
            return
        if not path.startswith(('/a/','/b/')):
            self.send_error(404);return
        self.path=self.path[2:]
        super().do_GET()
    def log_message(self,*args):pass

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
        context=browser.new_context(service_workers='allow')
        pages=[]
        for folder in ('a','b'):
            page=context.new_page();pages.append(page)
            page.goto(f'{origin}/{folder}/probe')
            page.evaluate('''async()=>{
                if(!isSecureContext||!navigator.serviceWorker)throw Error('Secure service worker context required');
                await navigator.serviceWorker.register('./sw.js');
                await navigator.serviceWorker.ready;
            }''')
            page.wait_for_function('!!navigator.serviceWorker.controller')
        keys=pages[0].evaluate('caches.keys()')
        assert len([k for k in keys if k.startswith('cachymusic-shell:')])==2,keys
        context.set_offline(True)
        for page in pages:
            result=page.evaluate('''async()=>{
                const assets=['./index.html','./stylesheets/homepage.css?version=offline','./scripts/modules/preference-storage.js','./resources/images/icon-192.png'];
                const response=await Promise.all(assets.map(async p=>{const r=await fetch(p);return [p,r.status,(await r.arrayBuffer()).byteLength]}));
                let denied=false;try{await fetch('./php/api/stream.php?file=private.flac')}catch{denied=true}
                return {response,denied};
            }''')
            assert all(status==200 and size>0 for _,status,size in result['response']),result
            assert result['denied'],result
            print('PASS offline scoped shell and excluded private API:',page.url,result)
        context.close();browser.close()
finally:
    server.shutdown();server.server_close()
