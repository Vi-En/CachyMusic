"""Production control wiring and real track renderer in an isolated Chromium fixture.
AudioWorklet port is instrumented with a connectable GainNode; DSP math is tested
separately by dsp-regression.cjs. Does not certify physical output or native devices.
"""
from pathlib import Path
import argparse, importlib.util, re, base64, mimetypes
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('visualizer-browser.py')); fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('settings-interaction-results'));parser.add_argument('--chromium',default='/usr/bin/chromium');args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
root=fixture.ROOT
# Inline the identical production CSS and local assets.
def uri(p):return 'data:'+(mimetypes.guess_type(str(p))[0] or 'application/octet-stream')+';base64,'+base64.b64encode(p.read_bytes()).decode()
def css(p):
 s=re.sub(r'@import\s+url\([\'\"]?([^\'\")]+)[\'\"]?\)\s*;',lambda m:css(p.parent/m[1]),p.read_text())
 return re.sub(r'url\(([^)]+)\)',lambda m:'url("'+uri(p.parent/m[1].strip(' "\''))+'")' if len(m[1])<240 and not m[1].strip(' \"\'').startswith('data:') and (p.parent/m[1].strip(' "\'')).is_file() else m[0],s)
html=BeautifulSoup((root/'index.html').read_text(),'html.parser')
for t in html.select('script,link,meta[http-equiv]'):t.decompose()
for t in html.select('img'):
 p=root/t.get('src','');t['src']=uri(p) if p.is_file() else ''
style=html.new_tag('style');style.string=css(root/'stylesheets/homepage.css');html.head.append(style)
names=['state.js','library.js','player-core.js','player-presentation.js','audio-engine.js','ui-elements.js','utils.js','visualizer.js','themes.js','audio-change-policy.js']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox']);total=0;coverage=0;dialogs=0
 for w,h in [(320,640),(393,873),(1440,900),(873,393)]:
  page=b.new_page(viewport={'width':w,'height':h});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(str(html));urls=fixture.install_module_map(page,names);page.evaluate('''async urls=>{window.m={};for(const [n,u] of Object.entries(urls))m[n]=await import(u);const s=m['state.js'].store.state;const cover=document.querySelector('#vinylArt').src;const tracks=[{id:'1',filename:'a.flac',title:'A very long track title with 日本語 and Arabic العربية '.repeat(5),artist:'A long artist name '.repeat(10),duration:3723,cover,coverThumb:cover},{id:'2',filename:'b.wav',title:'Short track',artist:'Artist',duration:12,cover,coverThumb:cover}];s.allTracks=tracks;s.displayedTracks=tracks;s.currentTrackIndex=0;s.currentTrack=tracks[0];document.querySelector('.playerDeck').classList.remove('empty-deck');m['player-presentation.js'].applyArtworkToDeck(cover,true);m['library.js'].renderTrackList();}''',urls)
  for theme in fixture.THEMES:
   page.evaluate('''theme=>{document.documentElement.dataset.theme=theme;m['ui-elements.js'].switchWorkspace('player',(innerWidth<=768||innerHeight<=500)?'trackListPanel':undefined)}''',theme)
   page.evaluate('''()=>{const rows=[...document.querySelectorAll('#trackItemsContainer .trackItem')];if(!rows.length)throw Error('no production track rows');for(const row of rows){const r=row.getBoundingClientRect(),[a,t,d,m]=[...row.children].map(e=>e.getBoundingClientRect());if(row.children.length!==4||a.right>t.left||t.right>d.left||d.right>m.left||Math.abs(m.right-r.right)>2||m.width<48||m.height<48||Math.abs(r.height-64)>1||row.scrollWidth>row.clientWidth+1)throw Error('row layout '+JSON.stringify({r:r.toJSON(),a:a.toJSON(),t:t.toJSON(),d:d.toJSON(),m:m.toJSON()}));}const menu=rows[0].querySelector('.trackMenuTriggerBtn');if(!getComputedStyle(menu).transitionTimingFunction.includes('cubic-bezier'))throw Error('motion missing');menu.click();if(document.querySelector('#trackMenuTitle').textContent!==m['state.js'].store.state.allTracks[0].title)throw Error('menu identity');m['library.js'].closeTrackActionMenu();}''')
   if theme=='default':page.screenshot(path=str(args.output/f'library-{w}.png'),animations='disabled')
   total+=1
   page.evaluate('''()=>m['ui-elements.js'].switchWorkspace('player','playerDeck')''')
   for mode in ['wave','dash','thematic','artwork']:
    page.evaluate('''async mode=>{m['visualizer.js'].setVisualizerMode(mode);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const d=document.querySelector('.playerDeck'),s=d.querySelector('.turntableStage'),w=s.querySelector('.deckArtworkWrapper'),i=s.querySelector('.deckArtworkBackdrop'),a=s.querySelector('.turntableCon');const r=e=>e.getBoundingClientRect();if(mode==='artwork'){if(getComputedStyle(w).display!=='none')throw Error('artwork background visible');}else{const dr=r(d),sr=r(s),wr=r(w),ir=r(i),ar=r(a);if(Math.abs(sr.left-dr.left)>1||Math.abs(sr.right-dr.right)>1||Math.abs(wr.width-sr.width)>1||Math.abs(wr.height-sr.height)>1||Math.abs(ir.width-wr.width)>1||Math.abs(ir.height-wr.height)>1||Math.abs((ar.left+ar.right-dr.left-dr.right)/2)>1||getComputedStyle(i).objectFit!=='cover'||Number(getComputedStyle(i).opacity)<.15||d.scrollWidth>d.clientWidth+1)throw Error('backdrop coverage '+mode+' '+JSON.stringify({dr:dr.toJSON(),sr:sr.toJSON(),wr:wr.toJSON(),ir:ir.toJSON(),ar:ar.toJSON(),theme:document.documentElement.dataset.theme,opacity:getComputedStyle(i).opacity,fit:getComputedStyle(i).objectFit,scrollWidth:d.scrollWidth,clientWidth:d.clientWidth}));}}''',mode);coverage+=1
  page.evaluate('''()=>{document.documentElement.dataset.theme='default';m['ui-elements.js'].switchWorkspace('player',(innerWidth<=768||innerHeight<=500)?'trackListPanel':undefined);document.documentElement.style.fontSize='200%';const s=m['state.js'].store.state;s.displayedTracks[0].title='العربية عنوان طويل للاختبار';m['library.js'].renderTrackList();const row=document.querySelector('#trackItemsContainer .trackItem'),title=row.querySelector('.trackTitle'),duration=row.querySelector('.trackDuration'),a=row.getBoundingClientRect(),t=title.getBoundingClientRect();if(a.height<128||t.bottom>a.bottom||t.top<a.top||getComputedStyle(title).direction!=='rtl'||getComputedStyle(duration).direction!=='ltr'||row.scrollWidth>row.clientWidth+1)throw Error('200% text / bidirectional metadata layout '+JSON.stringify({height:a.height,title:t.toJSON(),row:a.toJSON(),dir:getComputedStyle(title).direction}));document.documentElement.style.removeProperty('font-size');m['library.js'].renderTrackList();}''')
  page.evaluate('''()=>{const s=m['state.js'].store.state,L=m['library.js'],old=s.displayedTracks,oldAll=s.allTracks,list=document.querySelector('#trackList'),cover=old[0].cover;const tracks=Array.from({length:400},(_,i)=>({id:'virtual-'+i,filename:'same.flac',title:'Track '+i,artist:'Artist',duration:10,cover,coverThumb:cover}));s.allTracks=s.displayedTracks=tracks;L.renderTrackList();const btn=list.querySelector('.trackDetails');btn.focus();L.renderTrackList(true);if(document.activeElement!==list.querySelector('.trackDetails'))throw Error('lost focus on rebuild');document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));if(document.activeElement.closest('.trackItem')?.dataset.index!=='399')throw Error('End navigation');if(list.querySelectorAll('.trackItem').length>40)throw Error('unbounded DOM');document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));if(document.activeElement.closest('.trackItem')?.dataset.index!=='398')throw Error('ArrowUp navigation');s.allTracks=s.displayedTracks=old;L.renderTrackList();if(document.activeElement!==list)throw Error('focus not returned to list on eviction');s.allTracks=oldAll;list.blur();}''')
  page.evaluate('''()=>{m['ui-elements.js'].switchWorkspace('settings');document.querySelector('#settingsAdvancedAudio').open=true;}''')
  for theme in fixture.THEMES:
   page.evaluate('''theme=>{document.documentElement.dataset.theme=theme;window.confirmation=m['audio-change-policy.js'].confirmAudioChange('bufferLatencyTarget','interactive')}''',theme)
   page.wait_for_function("document.querySelector('#audioChangeDialog').open")
   page.evaluate('''()=>{const d=document.querySelector('#audioChangeDialog'),r=d.getBoundingClientRect();if(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1||d.scrollWidth>d.clientWidth+1)throw Error('dialog containment');const a=[...d.querySelectorAll('button')].map(b=>b.getBoundingClientRect());if(a.some(b=>b.height<44||b.width<44)||a[0].right>a[1].left)throw Error('dialog actions overlap');} ''')
   if w==393 and theme in ['default','sentinel','minimalist-light','alien-paradise']:page.screenshot(path=str(args.output/f'confirmation-{theme}.png'),animations='disabled')
   page.keyboard.press('Escape');page.wait_for_function("!document.querySelector('#audioChangeDialog').open")
   page.evaluate('''async()=>{if(await confirmation)throw Error('Escape approved setting')}''');dialogs+=1
  page.evaluate('''()=>{document.documentElement.dataset.theme='default';document.querySelector('#settingsAdvancedAudio').open=true;}''')
  # Instrument the worklet boundary with a connectable node, preserving actual routing.
  if w==393:
   page.evaluate('''async()=>{const e=m['audio-engine.js'],s=m['state.js'].store.state;const ctx=e.initAudioContext();if(!ctx)throw Error('missing Web Audio graph');window.messages=[];Object.defineProperty(ctx,'audioWorklet',{value:{addModule:async()=>{}}});window.AudioWorkletNode=function(context){const node=context.createGain();node.port={postMessage:p=>{messages.push(p);queueMicrotask(()=>node.port.onmessage?.({data:{type:'status',revision:p.revision}}));},close(){}};return node;};await e.loadDspWorklet();if(!s.dspWorkletNode)throw Error('instrumented worklet not installed');e.updateAudioRouting();e.setupNeutronSettingsControls();e.setupDspControls();window.wait=()=>new Promise(r=>setTimeout(r,170));window.check=(v,m)=>{if(!v)throw Error(m)};check(!document.querySelector('#settingsApplyAudioBtn'),'batch apply exists');s.isCrossfeed=true;document.querySelector('.enginePrecisionBtn[data-precision="32"]').click();await wait();check(s.mathPrecision==='32'&&!document.querySelector('#audioChangeDialog').open,'safe precision failed');} ''')
   page.evaluate('''()=>document.querySelector('.ditherModeBtn[data-dither="shaped"]').click()''')
   page.wait_for_function("document.querySelector('#audioChangeDialog').open")
   page.screenshot(path=str(args.output/'audio-confirm-393.png'),animations='disabled')
   page.evaluate('''()=>{check(m['state.js'].store.state.ditherMode!=='shaped','unapproved change leaked');document.querySelector('#audioChangeDialog button[value="cancel"]').click()}''')
   page.wait_for_timeout(170)
   page.evaluate('''()=>{check(m['state.js'].store.state.ditherMode!=='shaped','cancel changed state');document.querySelector('.ditherModeBtn[data-dither="shaped"]').click()}''')
   page.wait_for_function("document.querySelector('#audioChangeDialog').open")
   page.evaluate('''()=>document.querySelector('#audioChangeDialog button[value="allow"]').click()''')
   page.wait_for_timeout(170)
   page.evaluate('''()=>{const s=m['state.js'].store.state;check(s.ditherMode==='shaped'&&messages.at(-1).ditherMode==='shaped','approval not applied');check(m['utils.js'].safeStorage.getItem('cachymusic_dither_mode')==='shaped','not persisted');document.querySelector('#settingsAmbiToggleBtn').click();} ''')
   page.wait_for_function("document.querySelector('#audioChangeDialog').open")
   page.evaluate('''()=>document.querySelector('#audioChangeDialog button[value="allow"]').click()''')
   page.wait_for_timeout(170)
   page.evaluate('''()=>{const s=m['state.js'].store.state;check(s.isAmbiophonics&&!s.isCrossfeed&&messages.at(-1).ambiophonicsEnabled,'spatial conflict');document.querySelector('#settingsUltrasonicToggleBtn').click()}''')
   page.wait_for_function("document.querySelector('#audioChangeDialog').open")
   page.evaluate('''()=>document.querySelector('#audioChangeDialog button[value="allow"]').click()''')
   page.wait_for_timeout(170)
   page.evaluate('''async()=>{const e=m['audio-engine.js'],s=m['state.js'].store.state;const select=document.querySelector('#settingsUltrasonicCutoffSelect');select.value='24000';select.dispatchEvent(new Event('change'));await wait();check(messages.at(-1).ultrasonicCutoff===24000&&messages.at(-1).ultrasonicEnabled,'cutoff missing');const old=s.isAmpBoost;document.querySelector('[data-target="amp"]').click();await wait();check(s.isAmpBoost!==old&&!document.querySelector('#audioChangeDialog').open,'AMP did not apply');const committed=s.isAmpBoost,stored=m['utils.js'].safeStorage.getItem('cachymusic_amp_boost');let failed=false;const port=s.dspWorkletNode.port,send=port.postMessage;port.postMessage=p=>{if(!failed){failed=true;throw Error('injected port failure')}send(p)};document.querySelector('[data-target="amp"]').click();await wait();check(failed&&s.isAmpBoost===committed&&m['utils.js'].safeStorage.getItem('cachymusic_amp_boost')===stored,'AMP rollback failed');port.postMessage=send;e.setDspBoost('xfeed',true);check(!s.isAmbiophonics&&!messages.at(-1).ambiophonicsEnabled,'spatial exclusivity');s.dspWorkletNode=null;e.updateAudioRouting();check(document.querySelector('#settingsApplyAudioStatus').textContent.includes('AudioWorklet'),'fallback status');await s.audioContext.close()}''')
   page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(100);page.evaluate('''()=>{const b=document.querySelector('.enginePrecisionBtn');if(getComputedStyle(b).transitionDuration.split(',').some(v=>parseFloat(v)>.001))throw Error('reduced motion ignored')}''')
  assert not errors,errors
  page.close()
 b.close()
 print(f'PASS {total} production row layouts, {coverage} backdrop mode/layout checks; {dialogs} dialog layouts and Escape cancellation; per-change permission/cancellation, immediate safe controls, worklet parameter delivery, spatial exclusivity, fallback messaging, reduced motion; 4 enlarged-text/bidirectional track-row checks')
