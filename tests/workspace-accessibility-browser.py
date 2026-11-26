"""Production HTML/CSS and workspace navigation: sampled AX names and text reflow.
This is not screen-reader, translation, or physical-device certification."""
import argparse, importlib.util, re, json
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('visualizer-browser.py')); f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
parser=argparse.ArgumentParser();parser.add_argument('--chromium',default='/usr/bin/chromium');args=parser.parse_args();root=f.ROOT
def css(path):return re.sub(r'@import\s+url\([\'\"]?([^\'\")]+)[\'\"]?\)\s*;',lambda m:css(path.parent/m[1]),path.read_text())
html=BeautifulSoup((root/'index.html').read_text(),'html.parser')
for t in html.select('script,link,meta[http-equiv]'):t.decompose()
for t in html.select('img'):t.attrs.pop('src',None)
style=html.new_tag('style');style.string=css(root/'stylesheets/homepage.css');html.head.append(style)
urls={n:f.module_url(root/'scripts/modules'/n) for n in ['ui-elements.js','state.js','settings-navigation.js','audio-engine.js']}
roles={'button','textbox','searchbox','combobox','slider','checkbox','switch','spinbutton','radio'}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox']);results=[];unnamed=[];overflow=[]
 for width,height in [(320,640),(393,873),(1440,900)]:
  page=b.new_page(viewport={'width':width,'height':height});page.set_content(str(html));page.evaluate('''async urls=>{window.m={};for(const [n,u] of Object.entries(urls))m[n]=await import(u);m['settings-navigation.js'].bindSettingsNavigation();m['audio-engine.js'].initPeqWorkstation();}''',urls);session=page.context.new_cdp_session(page)
  for tab in ['player','library','details','settings','soulseek','transfers','eq']:
   page.evaluate('''tab=>{const ui=m['ui-elements.js'],e=m['audio-engine.js'];if(tab!=='eq')e.closePeqModal();ui.switchWorkspace(tab==='settings'?'settings':['soulseek','transfers'].includes(tab)?'soulseek':'player',tab==='library'?'trackListPanel':tab==='details'?'infoPanel':'playerDeck');document.querySelector('#soulseekWorkspace').dataset.slskSubview=tab==='transfers'?'transfers':'results';document.querySelector('.slskTransfersDrawer').classList.toggle('open',tab==='transfers');if(tab==='eq')e.openPeqModal();}''',tab)
   nodes=session.send('Accessibility.getFullAXTree')['nodes']; controls=[n for n in nodes if not n.get('ignored') and n.get('role',{}).get('value') in roles];bad=[n for n in controls if not n.get('name',{}).get('value')];
   for n in bad:
    try:
     dom=session.send('DOM.describeNode',{'backendNodeId':n['backendDOMNodeId']})['node'];attrs=dict(zip(dom.get('attributes',[])[::2],dom.get('attributes',[])[1::2]));ident=attrs.get('id',attrs.get('class',dom['nodeName']))
    except Exception:ident=n.get('role',{}).get('value')
    unnamed.append((width,tab,ident))
   results.append((width,tab,len(controls)))
   for theme in f.THEMES:
    page.evaluate('''t=>{document.documentElement.dataset.theme=t;document.documentElement.style.fontSize='200%'}''',theme)
    result=page.evaluate('''tab=>{const el=tab==='eq'?document.querySelector('.peqModalCard'):tab==='settings'?document.querySelector('#settingsWorkspace'):['soulseek','transfers'].includes(tab)?document.querySelector('#soulseekWorkspace'):innerWidth<=768?document.querySelector('.panel.mobileActive'):document.querySelector('.gridContainer');return {page:document.documentElement.scrollWidth>innerWidth+1,panel:el&&el.scrollWidth>el.clientWidth+1};}''',tab)
    if result['page'] or result['panel']:overflow.append((width,tab,theme,result))
   page.evaluate("document.documentElement.style.removeProperty('font-size')")
  page.close()
 b.close();print(json.dumps({'samples':results,'namedControls':sum(x[2] for x in results)-len(unnamed),'unnamed':unnamed,'reflowChecks':len(results)*len(f.THEMES),'overflow':overflow},indent=2));assert not unnamed,unnamed;assert not overflow,overflow;print('PASS sampled workspace AX names and 200% text reflow')
