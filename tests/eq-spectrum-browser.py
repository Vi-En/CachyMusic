"""Actual EQ module + Web Audio media graph, synthetic local WAV; no physical DAC."""
from pathlib import Path
import argparse, importlib.util, re
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('visualizer-browser.py'))
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
root=f.ROOT
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('eq-previews'));parser.add_argument('--chromium',default='/usr/bin/chromium');args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
def css(path):
    return re.sub(r'@import\s+url\([\'\"]?([^\'\")]+)[\'\"]?\)\s*;',lambda m:css(path.parent/m[1]),path.read_text())
shell=BeautifulSoup((root/'index.html').read_text(),'html.parser')
for t in shell.select('script,link,meta[http-equiv]'):t.decompose()
for t in shell.select('img'):t.attrs.pop('src',None)
style=shell.new_tag('style');style.string=css(root/'stylesheets/homepage.css');shell.head.append(style)
mods={n:f.module_url(root/'scripts/modules'/n) for n in ['state.js','audio-engine.js']}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=args.chromium,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(str(shell));page.evaluate('''async mods=>{
      window.st=(await import(mods['state.js'])).store;window.engine=await import(mods['audio-engine.js']);
      document.body.className='view-player mobile-tab-player';document.documentElement.dataset.presentation='artwork';document.documentElement.dataset.theme='default';document.querySelector('.playerDeck').classList.remove('empty-deck');
      document.querySelector('.playerDeck').classList.add('mobileActive');document.querySelector('#playerEmptyPrompt').style.display='none';
      engine.initPeqWorkstation();const firstFader=document.getElementById('peqSlider-0');engine.initPeqWorkstation();if(firstFader!==document.getElementById('peqSlider-0'))throw Error('duplicate EQ initialization');
      const first=engine.initAudioContext();await first.resume();
      const tasks=[engine.ensureAudioEngineForSampleRate(44100,true),engine.ensureAudioEngineForSampleRate(48000,true),engine.ensureAudioEngineForSampleRate()];
      if(engine.initAudioContext()!==null)throw Error('sync creation during rebuild');
      const [a,b,c]=await Promise.all(tasks);if(a!==b||a!==c||a===first||first.state!=='closed')throw Error('replacement ownership');
      if(st.state.audioSourceNode.context!==a||st.state.analyser.context!==a)throw Error('mixed context nodes');
      const sr=48000,n=sr*3,buf=new ArrayBuffer(44+n*2),v=new DataView(buf),txt=(i,t)=>[...t].forEach((c,k)=>v.setUint8(i+k,c.charCodeAt(0)));
      txt(0,'RIFF');v.setUint32(4,36+n*2,true);txt(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);txt(36,'data');v.setUint32(40,n*2,true);
      let seed=42;for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const t=i/sr;let x=.12*(seed/4294967296-.5);for(const [hz,amp] of [[70,.15],[140,.09],[440,.10],[880,.06],[1800,.045],[3600,.025],[8200,.014]])x+=amp*Math.sin(t*hz*2*Math.PI);v.setInt16(44+i*2,Math.round(x*32767),true);}
      window.testUrl=URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));const audio=st.state.audio;audio.src=testUrl;audio.loop=true;await audio.play();st.state.isPlaying=true;st.emit('audio:spectrum-refresh');
      for(const [i,g] of [[2,3],[6,-2.5],[8,2]]){const el=document.getElementById('peqSlider-'+i);el.value=g;el.dispatchEvent(new Event('input',{bubbles:true}));}window.reads=0;const an=st.state.analyser,read=an.getFloatFrequencyData.bind(an);an.getFloatFrequencyData=data=>{reads++;read(data);};
      window.hasPixels=id=>{const c=document.getElementById(id),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return d.some((v,i)=>i%4===3&&v>0)};
    }''',mods)
    page.wait_for_timeout(350)
    assert page.evaluate("hasPixels('desktopSpectrumCanvas')"),'desktop spectrum empty'
    page.evaluate('engine.openPeqModal()');page.wait_for_timeout(250)
    assert page.evaluate("hasPixels('peqSpectrumCanvas') && hasPixels('peqCurveCanvas')"),'EQ layers blank'
    checks=0
    for name,w,h in [('desktop',1440,900),('android',393,873),('narrow',320,640),('landscape',873,393)]:
      page.set_viewport_size({'width':w,'height':h})
      for theme in f.THEMES:
        page.evaluate('t=>{document.documentElement.dataset.theme=t;st.emit("theme:change")}',theme);page.wait_for_timeout(90)
        result=page.evaluate('''()=>{let c=document.querySelector('.peqModalCard'),g=document.querySelector('.peqCanvasContainer'),a=document.querySelector('#peqSpectrumCanvas'),b=document.querySelector('#peqCurveCanvas'),r=g.getBoundingClientRect(),cr=c.getBoundingClientRect();return {cardFits:cr.left>=-1&&cr.right<=innerWidth+1,graphFits:r.left>=cr.left-1&&r.right<=cr.right+1,aligned:a.clientWidth===b.clientWidth&&a.clientHeight===b.clientHeight,stripHidden:getComputedStyle(document.querySelector('#desktopSpectrumCanvas')).display==='none',pixels:hasPixels('peqSpectrumCanvas'),overflow:c.scrollWidth>c.clientWidth+1}}''')
        assert result['cardFits'] and result['graphFits'] and result['aligned'] and result['pixels'] and not result['overflow'],(name,theme,result)
        assert result['stripHidden']==(name!='desktop'),(name,theme,result)
        checks+=1
        if theme in ['default','sentinel','minimalist-light'] and name in ['android','desktop']:page.screenshot(path=str(args.output/f'{name}-{theme}-eq.png'),animations='disabled')
    page.set_viewport_size({'width':393,'height':873});page.evaluate('engine.closePeqModal()');page.wait_for_timeout(150);count=page.evaluate('reads');page.wait_for_timeout(250);assert page.evaluate('reads')==count,'hidden mobile EQ still sampling'
    page.evaluate('engine.openPeqModal()');page.wait_for_timeout(200);assert page.evaluate('reads')>count
    page.evaluate('''()=>{st.state.audio.pause();st.state.isPlaying=false;st.emit('audio:spectrum-refresh')}''');page.wait_for_timeout(120);count=page.evaluate('reads');page.wait_for_timeout(180);assert page.evaluate('reads')==count;assert not page.evaluate("hasPixels('peqSpectrumCanvas')")
    page.evaluate('''async()=>{st.state.audio.removeAttribute('src');st.state.audio.load();URL.revokeObjectURL(testUrl);const c=st.state.audioContext;await c.close();}''');page.wait_for_timeout(100);assert page.evaluate('st.state.audioContext===null && st.state.analyser===null && st.state.audioSourceNode===null')
    assert not errors,errors
    print(f'PASS {checks} EQ layouts; actual Web Audio media PCM spectrum, concurrent context rebuild, desktop spectrum, hidden mobile sampling stop, pause clears spectrum, external close releases graph references')
    browser.close()
