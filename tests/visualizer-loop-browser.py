"""Mobile visualizer loop smoke test with a synthetic analyser and real canvas."""
from pathlib import Path
import importlib.util, argparse
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('renderer',Path(__file__).with_name('visualizer-browser.py'))
renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
parser=argparse.ArgumentParser();parser.add_argument('--chromium',default='/usr/bin/chromium');args=parser.parse_args()
root=renderer.ROOT
shell=BeautifulSoup((root/'index.html').read_text(),'html.parser')
for tag in shell.select('script,link,meta[http-equiv],img'):tag.decompose()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=args.chromium,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':393,'height':873})
    errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
    page.set_content(str(shell))
    page.evaluate('''()=>{document.querySelector('.playerDeck').classList.add('mobileActive');const c=document.querySelector('#turntableCenterCanvas');c.style.width='220px';c.style.height='220px';document.querySelector('#turntableCenterVis').style.width='220px';document.querySelector('#turntableCenterVis').style.height='220px';}''')
    urls={name:renderer.module_url(root/'scripts/modules'/name) for name in ['state.js','visualizer.js']}
    page.evaluate('''async urls=>{window.fixture={};for(const [name,url] of Object.entries(urls))fixture[name]=await import(url);const st=fixture['state.js'].store.state;st.isPlaying=true;st.analyser={frequencyBinCount:1024,fftSize:2048,getByteFrequencyData(a){a.fill(100)},getFloatTimeDomainData(a){a.fill(.5)}};const v=fixture['visualizer.js'];v.setupCanvas();v.startVisualizerLoop();}''',urls)
    page.evaluate('''()=>{const v=fixture['visualizer.js'], st=fixture['state.js'].store.state;const resume=st.resumeVisualizerLoop;v.startVisualizerLoop();if(st.resumeVisualizerLoop!==resume)throw Error('duplicate loop owner');}''')
    for theme,mode in [('default','wave'),('default','dash'),('nms','thematic'),('minimalist-warm','thematic'),('minimalist-warm','artwork')]:
        page.evaluate('''([theme,mode])=>{document.documentElement.dataset.theme=theme;fixture['visualizer.js'].setVisualizerMode(mode)}''',[theme,mode]);page.wait_for_timeout(450)
        data=page.evaluate('''()=>{const st=fixture['state.js'].store.state;const c=document.querySelector('#turntableCenterCanvas');return {mode:st.activeVisualizerMode,visible:document.querySelector('#turntableCenterVis').style.display==='flex',painted:c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0),running:st.isVisualizerLoopRunning}}''')
        assert data['mode']==mode,(theme,mode,data)
        if mode=='artwork':assert not data['visible'] and not data['running'],data
        else:assert data['visible'] and data['painted'] and data['running'],data
        print('PASS',theme,mode,data,flush=True)
    page.evaluate('''()=>{const st=fixture['state.js'].store.state;st.analyser=null;fixture['visualizer.js'].setVisualizerMode('dash')}''');page.wait_for_timeout(1100)
    bands=page.evaluate('Math.max(...fixture["state.js"].store.state.smoothBands)')
    assert bands<.01,bands
    page.evaluate('''()=>{const {store}=fixture['state.js'];store.state.currentWorkspace='library';store.emit('workspace:change',{viewName:'library'});if(store.state.animFrameId!==null||store.state.isVisualizerLoopRunning)throw Error('frame retained after leaving player');store.state.resumeVisualizerLoop();if(store.state.animFrameId!==null)throw Error('offscreen restart');}''')
    assert not errors,errors
    print('PASS no-analyser spectrum decays to silence, no page errors')
    browser.close()
