"""Repeated production library rendering and Chromium accessibility-tree audit. Synthetic local data only."""
import argparse, importlib.util, re, base64, mimetypes, json, time
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('visualizer-browser.py')); fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
parser=argparse.ArgumentParser();parser.add_argument('--chromium',default='/usr/bin/chromium');parser.add_argument('--output',type=Path,default=Path('library-profile-results'));parser.add_argument('--seconds',type=float,default=0);args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
root=fixture.ROOT

def css(path):
    s=re.sub(r'@import\s+url\([\'\"]?([^\'\")]+)[\'\"]?\)\s*;',lambda m:css(path.parent/m[1]),path.read_text())
    def local(m):
        p=path.parent/m[1].strip(' "\'')
        if len(m[1])<220 and p.is_file():return 'url("data:'+(mimetypes.guess_type(str(p))[0] or 'application/octet-stream')+';base64,'+base64.b64encode(p.read_bytes()).decode()+'")'
        return m[0]
    return re.sub(r'url\(([^)]+)\)',local,s)
html=BeautifulSoup((root/'index.html').read_text(),'html.parser')
for t in html.select('script,link,meta[http-equiv]'):t.decompose()
for t in html.select('img'):t.attrs.pop('src',None)
style=html.new_tag('style');style.string=css(root/'stylesheets/homepage.css');html.head.append(style)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox']);results=[]
    for width,height in [(393,873),(1440,900)]:
        page=browser.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_content(str(html));page.set_default_timeout(10000)
        urls=fixture.install_module_map(page,['library.js','state.js','ui-elements.js'])
        page.evaluate('''async urls=>{window.m={};for(const [name,url] of Object.entries(urls))m[name]=await import(url);const s=m['state.js'].store.state;const cover='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22%3E%3Crect width=%2240%22 height=%2240%22 fill=%22gray%22/%3E%3C/svg%3E';window.tracks=Array.from({length:10000},(_,i)=>({id:'id-'+i,fullPath:'/fixture/'+i+'.flac',filename:i+'.flac',title:'Track '+i,artist:'Artist '+i%300,duration:60+i%500,cover,coverThumb:cover}));s.allTracks=s.displayedTracks=tracks;s.currentTrackIndex=0;s.currentTrack=tracks[0];m['ui-elements.js'].switchWorkspace('player',innerWidth<=768?'trackListPanel':undefined);m['library.js'].renderTrackList();} ''',urls)
        session=page.context.new_cdp_session(page);session.send('Performance.enable');session.send('HeapProfiler.collectGarbage');before=session.send('Memory.getDOMCounters');mem0={x['name']:x['value'] for x in session.send('Performance.getMetrics')['metrics']};start=time.monotonic()
        data=page.evaluate('''async seconds=>{const start=performance.now();const lib=m['library.js'],list=document.querySelector('#trackList');const times=[];let peak=0;for(let i=0;i<240||performance.now()-start<seconds*1000;i++){const index=(i*1777)%tracks.length;const t=performance.now();lib.scrollToTrackIndex(index);const row=list.querySelector(`.trackItem[data-index="${index}"]`);if(!row||!row.querySelector('.trackTitle').textContent.includes('Track '+index))throw Error('stale virtual row '+index);peak=Math.max(peak,list.querySelectorAll('.trackItem').length);times.push(performance.now()-t);if(i%6===0)await new Promise(requestAnimationFrame);}times.sort((a,b)=>a-b);lib.scrollToTrackIndex(0);if(list.querySelector('.trackItem[data-index="0"] .trackDetails').getAttribute('aria-current')!=='true')throw Error('missing current state');return {iterations:times.length,peakRows:peak,p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1)};} ''',args.seconds)
        page.wait_for_timeout(250);session.send('HeapProfiler.collectGarbage');after=session.send('Memory.getDOMCounters');mem1={x['name']:x['value'] for x in session.send('Performance.getMetrics')['metrics']};ax=session.send('Accessibility.getFullAXTree')['nodes'];controls=[n for n in ax if not n.get('ignored') and n.get('role',{}).get('value') in ('button','textbox','combobox','slider','checkbox','switch','spinbutton')];unnamed=[n.get('role',{}).get('value') for n in controls if not n.get('name',{}).get('value')];assert not unnamed,unnamed;assert data['peakRows']<=50,data;assert not errors,errors
        results.append(dict(viewport=width,elapsedSeconds=round(time.monotonic()-start,2),namedControls=len(controls),domBefore=before,domAfter=after,heapBefore=mem0.get('JSHeapUsedSize'),heapAfter=mem1.get('JSHeapUsedSize'),**data));page.close()
    browser.close();print(json.dumps(results,indent=2));print('PASS repeated production virtual list rendering and accessible names in sampled library workspace')
