"""Production import controller with controlled worker completion and cancellation."""
import argparse, importlib.util, json
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('visualizer-browser.py'));fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
p=argparse.ArgumentParser();p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
shell=BeautifulSoup((fixture.ROOT/'index.html').read_text(),'html.parser')
for t in shell.select('script,link,meta[http-equiv]'):t.decompose()
for t in shell.select('img'):t.attrs.pop('src',None)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox']);page=browser.new_page();page.set_content(str(shell));errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    urls=fixture.install_module_map(page,['library.js','state.js','ui-elements.js'])
    report=page.evaluate('''async urls=>{
      const {store}=await import(urls['state.js']),L=await import(urls['library.js']),U=await import(urls['ui-elements.js']);const s=store.state;
      const NativeURL=window.URL;window.URL=class extends NativeURL{constructor(path,base){super(path==='./indexing-worker.js'&&String(base).startsWith('data:')?'https://fixture.invalid/indexing-worker.js':path,base&&String(base).startsWith('data:')?undefined:base);}};
      const workers=[];window.Worker=class {constructor(){workers.push(this);this.jobs=[];this.terminated=false;}postMessage(job){this.jobs.push(job);}terminate(){this.terminated=true;}reply(){const job=this.jobs.at(-1);this.onmessage?.({data:{id:job.id,meta:{title:job.file.name,duration:1,format:'WAV'}}});}};
      const delay=ms=>new Promise(r=>setTimeout(r,ms)),until=async f=>{const end=performance.now()+3000;while(!f()){if(performance.now()>end)throw Error('wait timeout');await delay(10);}};
      const file=name=>new File([new Uint8Array([1,2,3])],name,{type:'audio/wav',lastModified:1});
      const check=(x,msg)=>{if(!x)throw Error(msg)};
      const first=L.importLocalAudioFiles([file('cancelled.wav')],'cancel',false);await until(()=>workers[0]?.jobs.length);U.cancelActiveTrackLoading();workers[0].reply();await first;
      check(workers[0].terminated&&s.allTracks.length===0,'cancelled import published or worker retained');
      const a=L.importLocalAudioFiles([file('obsolete.wav')],'obsolete',false);await until(()=>workers[1]?.jobs.length);const b=L.importLocalAudioFiles([file('current.wav')],'current',false);await until(()=>workers[2]?.jobs.length);workers[1].reply();await a;
      check(workers[1].terminated&&s.allTracks.length===0&&document.getElementById('trackLoadingOverlay').style.display==='flex','obsolete import mutated new operation');
      workers[2].reply();await b;check(s.allTracks.length===1&&s.allTracks[0].filename==='current.wav'&&workers[2].terminated,'current import failed');
      return {cancelled:true,superseded:true,committed:s.allTracks.map(t=>t.filename)};
    }''',urls)
    assert not errors,errors
    print(json.dumps(report));print('PASS production local import cancellation and supersession with controlled worker');browser.close()
