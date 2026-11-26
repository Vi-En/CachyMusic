"""Actual disclosure and peer-result renderers against the production HTML/CSS.
Uses synthetic search data, never connects to Soulseek. Requires Playwright/Chromium.
"""
import argparse, base64, importlib.util, mimetypes, re
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('renderer',Path(__file__).with_name('visualizer-browser.py')); fixture=importlib.util.module_from_spec(spec); spec.loader.exec_module(fixture)
parser=argparse.ArgumentParser(); parser.add_argument('--output',type=Path,default=Path('design-browser-results')); parser.add_argument('--chromium',default='/usr/bin/chromium'); args=parser.parse_args(); args.output.mkdir(parents=True,exist_ok=True)
root=fixture.ROOT

def css(p):
    s=re.sub(r'@import\s+url\([\'\"]?([^\'\")]+)[\'\"]?\)\s*;',lambda m:css(p.parent/m[1]),p.read_text())
    def url(m):
        v=m[1].strip(' \"\'');
        if v.startswith(('data:','https:','http:')):return m[0]
        f=p.parent/v
        if f.is_file():return 'url("data:'+(mimetypes.guess_type(str(f))[0] or 'application/octet-stream')+';base64,'+base64.b64encode(f.read_bytes()).decode()+'")'
        return m[0]
    return re.sub(r'url\(([^)]+)\)',url,s)
html=BeautifulSoup((root/'index.html').read_text(),'html.parser')
for t in html.select('script,link,meta[http-equiv]'):t.decompose()
for t in html.select('img'):
    f=root/t.get('src','');
    if f.is_file():t['src']='data:'+(mimetypes.guess_type(str(f))[0] or 'application/octet-stream')+';base64,'+base64.b64encode(f.read_bytes()).decode()
    else:t.attrs.pop('src',None)
style=html.new_tag('style');style.string=css(root/'stylesheets/homepage.css');html.head.append(style)
names=['p2p.js','control-ui.js','ui-elements.js','soulseek-controls.js']
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
    total=0
    for width,height in [(320,640),(393,873),(1440,900)]:
        page=browser.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.set_content(str(html));urls=fixture.install_module_map(page,names);page.evaluate('''async urls=>{window.fixture={};for(const [name,url] of Object.entries(urls))fixture[name]=await import(url);fixture['control-ui.js'].bindDisclosure(document.querySelector('#libraryToolsToggleBtn'),document.querySelector('#libraryControls'));}''',urls)
        page.evaluate("""()=>{const e=document.createElement('div'),message='<img src=x onerror=alert(1)> response';fixture['soulseek-controls.js'].renderSlskDiagnosticAlert(e,{error:message});if(e.querySelector('img')||e.querySelector('.slskAlertBody').textContent!==message)throw Error('backend diagnostic is not literal text');}""")
        for theme in fixture.THEMES:
            page.evaluate('''theme=>{document.documentElement.dataset.theme=theme;fixture['ui-elements.js'].switchWorkspace('player',innerWidth<=768?'trackListPanel':undefined)}''',theme)
            page.evaluate('''()=>{const panel=document.querySelector('#libraryControls');panel.style.display='flex';panel.hidden=true;const button=document.querySelector('#libraryToolsToggleBtn');if(getComputedStyle(panel).display!=='none')throw Error('hidden inline override');button.click();if(panel.hidden||getComputedStyle(panel).display==='none'||button.getAttribute('aria-expanded')!=='true')throw Error('not opened');const r=panel.getBoundingClientRect();if(panel.scrollWidth>panel.clientWidth+1||r.left<0||r.right>innerWidth+1)throw Error('expanded library overflow');button.click();if(getComputedStyle(panel).display!=='none')throw Error('not hidden');}''')
            page.evaluate('''()=>{fixture['ui-elements.js'].switchWorkspace('soulseek');const c=fixture['p2p.js'].soulseekController;c.renderSearchingAnimation('<sample>');if(!document.querySelector('#slskResultsList').textContent.includes('<sample>')||document.querySelector('#slskResultsList .sampleTagBtn'))throw Error('search feedback');c.renderNoResultsFound('sample',true);if(!document.querySelector('#slskResultsList').textContent.includes('Search unavailable'))throw Error('failure state');c.renderNoResultsFound('sample');if(!document.querySelector('#slskResultsList').textContent.includes('No results returned'))throw Error('empty state');const common={username:'sample-peer',sizeFormatted:'32 MB',speedFormatted:'1 MB/s',queuePosition:0,freeSlots:false};c.renderRows([{...common,filename:'Unknown rate.flac',filePath:'Album/24bit 192kHz/Unknown rate.flac',extension:'FLAC',isLossless:true},{...common,filename:'Estimated bitrate.mp3',filePath:'Album/Estimated bitrate.mp3',extension:'MP3',size:4000000,duration:100},{...common,filename:'Reported quality.flac',filePath:'Album/Reported quality.flac',extension:'FLAC',isLossless:true,bitrate:1411,bitrateSource:'reported',sampleRate:44100,bitDepth:16}]);const values=[...document.querySelectorAll('.slskBitrateVal')].map(e=>e.textContent);if(values.join('|')!=='Not reported|≈ 320 kbps|1411 kbps')throw Error('wrong bitrate '+values);if(document.querySelector('.slskResultRow').querySelector('.slskSampleRateVal'))throw Error('fabricated rate');if(!document.querySelector('.slskResultRow .slskQueueVal').textContent.includes('Unknown'))throw Error('fabricated queue');document.querySelector('#slskResultCount').textContent='3 returned results';document.querySelector('#slskActiveSearchMeta').textContent='Sample search';const list=document.querySelector('#slskResultsList');if(list.scrollWidth>list.clientWidth+1)throw Error('result overflow');for(const row of list.querySelectorAll('.slskResultRow')){if(row.scrollWidth>row.clientWidth+1)throw Error('row overflow');const title=row.querySelector('.slskResultTitle'),path=row.querySelector('.slskResultPath');if(path.getBoundingClientRect().top<title.getBoundingClientRect().bottom-1)throw Error('title/path overlap');if(innerWidth<=768&&[...row.querySelectorAll('.slskBtn')].some(b=>b.getBoundingClientRect().height<44))throw Error('small action target');}}''')
            if theme=='default' and width in (393,1440):page.screenshot(path=str(args.output/f'soulseek-results-{width}.png'),animations='disabled')
            total+=1
        stats=page.evaluate("""async()=>{const c=fixture['p2p.js'].soulseekController;c.rawResults=Array.from({length:10000},(_,i)=>({filename:`Track ${i}.flac`,filePath:`Album/Track ${i}.flac`,username:'test',extension:'FLAC',isLossless:true,speed:i,freeSlots:i%2===0,sizeFormatted:'10 MB',speedFormatted:'1 MB/s'}));c.activeSortField='speed';c.activeSortDir='desc';c.includeFilterQuery='';c.excludeFilterQuery='';c.activeSubFilter=null;c.activeFilter='all';c.resultPage=0;const t=performance.now();const first=c.applyFilterAndRender();const handler=performance.now()-t;c.includeFilterQuery='Track 9999';const latest=c.applyFilterAndRender();await Promise.all([first,latest]);if(!document.querySelector('#slskResultCount').textContent.startsWith('1 of 10000'))throw Error('stale filter published');if(!document.querySelector('.slskResultTitle').textContent.includes('9999'))throw Error('wrong result');return {handler,ready:performance.now()-t};}""")
        print(f'PASS 10000-result cancellation, viewport {width}: {stats}',flush=True)
        assert not errors,errors
        page.close()
    browser.close()
print(f'PASS {total} theme/viewport sets: actual Library disclosure, search loading/error/empty feedback, unknown and estimated peer metadata, populated result containment')
