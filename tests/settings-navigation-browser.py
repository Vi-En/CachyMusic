"""Actual settings navigation module with production markup and CSS; not an installed PWA."""
import argparse, importlib.util, re, base64, mimetypes
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('visualizer-browser.py')); fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
parser=argparse.ArgumentParser();parser.add_argument('--chromium',default='/usr/bin/chromium');parser.add_argument('--output',type=Path,default=Path('settings-nav-results'));args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
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
    browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox']);checks=0
    for width,height in [(320,640),(393,873),(873,393),(1440,900)]:
        page=browser.new_page(viewport={'width':width,'height':height});page.set_content(str(html))
        page.evaluate('''async url=>{const {bindSettingsNavigation}=await import(url);document.body.className='view-settings';document.querySelector('.gridContainer').style.display='none';document.querySelector('#settingsWorkspace').style.display='flex';document.querySelector('#settingsRowHwGain').style.display='none';document.querySelector('#settingsRowHwGain').append('unique unavailable setting token');const storage={setItem(k,v){window.category=v}};window.cleanup=bindSettingsNavigation({storage,initialCategory:'privacy'});window.search=value=>{const e=document.querySelector('#settingsSearchInput');e.value=value;e.dispatchEvent(new Event('input'));};window.check=(v,m)=>{if(!v)throw Error(m)};check(document.querySelector('#settingsColSystem').style.display==='none','empty column visible');search('unique unavailable setting token');check(document.querySelector('#settingsSearchStatus').textContent==='No matching settings.','unsupported row matched');search('noise-shaped');check(document.querySelector('#settingsAdvancedAudio').open,'advanced disclosure not opened');check(document.querySelector('#settingsPanelAudioDsp').style.display!=='none','search did not expose result');check(!document.querySelector('#settingsCategoryNav [aria-current]'),'search marked category current');search('');check(!document.querySelector('#settingsAdvancedAudio').open,'temporary disclosure not restored');document.querySelector('[data-cat=audio]').click();check(window.category==='audio','category not persisted');check(document.querySelector('#settingsColSystem').style.display!=='none','second column not restored');}''',fixture.module_url(root/'scripts/modules/settings-navigation.js'))
        for theme in fixture.THEMES:
            page.evaluate('''theme=>{document.documentElement.dataset.theme=theme;document.documentElement.style.fontSize='200%';const nav=document.querySelector('#settingsCategoryNav'),r=nav.getBoundingClientRect(),buttons=[...nav.querySelectorAll('button')].map(b=>b.getBoundingClientRect());if(nav.scrollWidth>nav.clientWidth+1||buttons.some(b=>b.width<40||b.height<44||b.left<r.left-1||b.right>r.right+1))throw Error('settings category overflow '+theme+' '+innerWidth+' '+JSON.stringify(buttons));}''',theme);checks+=1
        page.evaluate("document.documentElement.style.removeProperty('font-size');document.documentElement.dataset.theme='default'")
        page.screenshot(path=str(args.output/f'settings-{width}.png'),animations='disabled');page.close()
    browser.close()
    print(f'PASS settings search, unavailable controls, disclosure restoration, column visibility, persistence; {checks} 200% text category layouts')
