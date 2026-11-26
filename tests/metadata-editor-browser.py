"""Metadata editor integration and responsive dialog tests using production HTML/CSS."""
import argparse, importlib.util, re, base64, mimetypes
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('visualizer-browser.py')); fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
parser=argparse.ArgumentParser();parser.add_argument('--chromium',default='/usr/bin/chromium');parser.add_argument('--output',type=Path,default=Path('metadata-editor-results'));args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
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
        page=browser.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_content(str(html));urls=fixture.install_module_map(page,['metadata-editor.js','state.js'])
        page.evaluate('''async urls=>{const {createMetadataEditor}=await import(urls['metadata-editor.js']);const {store}=await import(urls['state.js']);window.st=store.state;window.check=(v,m)=>{if(!v)throw Error(m)};window.first={id:'first',filename:'one.flac',title:'Original',artist:'Artist',fullPath:'/local/'+ 'long-unbroken-path'.repeat(20)+'.flac'};window.second={id:'second',filename:'two.flac',title:'Other',cover:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2288%22 height=%2288%22%3E%3Crect width=%2288%22 height=%2288%22 fill=%22%23334b59%22/%3E%3C/svg%3E'};st.allTracks=[first,second];st.displayedTracks=st.allTracks;st.currentTrack=second;st.currentTrackIndex=1;st.currentInspectedTrack=second;window.writes=0;window.refreshes=0;window.editor=createMetadataEditor({getTrackKey:t=>t.id,refreshLibrary:()=>refreshes++,persistOverride:async()=>{writes++;await new Promise(r=>window.release=r);return true}});editor.bindMetadataEditor();editor.bindMetadataEditor();editor.openMetadataEditor(first);check(document.querySelector('#metaEditorSampleRatePill').textContent==='Not reported','invented sample rate');check(document.querySelector('#metaEditorBitDepthPill').textContent==='Not reported','invented bit depth');} ''',urls)
        for theme in fixture.THEMES:
            for scale in ['100%','200%']:
                page.evaluate('''([theme,scale])=>{document.documentElement.dataset.theme=theme;document.documentElement.style.fontSize=scale;const card=document.querySelector('#metaEditorCard');const r=card.getBoundingClientRect();if(r.width<=0||r.height<=0||card.scrollWidth>card.clientWidth+2||r.left<-.5||r.right>innerWidth+.5)throw Error('editor overflow '+theme+' '+innerWidth+' '+scale+' '+[card.scrollWidth,card.clientWidth]);document.querySelector('#metaEditTitle').value='العربية عنوان طويل للاختبار '+ 'x'.repeat(100);check(getComputedStyle(document.querySelector('#metaEditTitle')).direction==='rtl','title direction');} ''',[theme,scale]);checks+=1
        page.evaluate('''()=>{document.documentElement.style.removeProperty('font-size');document.documentElement.dataset.theme='default';document.querySelector('#metaEditYear').value='1800';editor.requestSaveMetadataConfirmation();check(getComputedStyle(document.querySelector('#metaEditorConfirmCard')).display==='none','invalid year accepted');document.querySelector('#metaEditYear').value='2024';document.querySelector('#metaEditSaveBtn').click();check(document.activeElement.id==='metaEditConfirmCancelBtn','confirm focus');document.querySelector('#metaEditConfirmCancelBtn').click();check(document.activeElement.id==='metaEditSaveBtn','restore focus');document.querySelector('#metaEditTitle').value='Updated title';editor.requestSaveMetadataConfirmation();window.pending=editor.executeSaveMetadata();} ''')
        page.wait_for_function('writes===1')
        page.evaluate('''async()=>{await editor.executeSaveMetadata();editor.closeMetadataEditor();editor.openMetadataEditor(second);check(st.currentEditingTrack===null,'reopened during save');check(writes===1,'duplicate save');release();await pending;check(first.title==='Updated title'&&second.title==='Other','wrong track edited');check(st.currentInspectedTrack===second,'stale inspector overwritten');check(refreshes===1,'refresh count');editor.openMetadataEditor(second);check(st.currentEditingTrack===second,'editor did not recover');} ''')
        page.wait_for_timeout(250);assert page.locator('#metadataEditorModal').is_visible(), 'reopened editor hidden';page.screenshot(path=str(args.output/f'editor-{width}.png'),animations='disabled');assert not errors,errors;page.close()
    browser.close()
    print(f'PASS {checks} editor layouts across 12 themes, 4 viewports and 2 text sizes; truthful diagnostics, bidi direction, invalid year, focus, duplicate save rejection, stale inspector ownership')
