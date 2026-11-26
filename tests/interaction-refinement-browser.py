"""Actual DOM, CSS, motion and compact-card controllers. Fake storage/analysis input.
Does not certify OEM notification rendering, live IndexedDB or audio hardware."""
from pathlib import Path
import importlib.util,re,argparse,json
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('visualizer-browser.py'));fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('interaction-results'));parser.add_argument('--chromium',default='/usr/bin/chromium');args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
root=fixture.ROOT
html=BeautifulSoup((root/'index.html').read_text(),'html.parser')
for t in html.select('script,link,meta[http-equiv]'):t.decompose()
for t in html.select('img'):t.attrs.pop('src',None)
def css(p):return re.sub(r'@import\s+url\([\'\"]?([^\'\")]+)[\'\"]?\)\s*;',lambda m:css(p.parent/m[1]),p.read_text())
style=html.new_tag('style');style.string=css(root/'stylesheets/homepage.css');html.head.append(style)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':393,'height':873});page.set_content(str(html));page.set_default_timeout(10000)
 page.evaluate(Path(__file__).with_name('listening-history-fixture.js').read_text())
 urls=fixture.install_module_map(page,['state.js','listening-history.js','media-session.js','ui-elements.js','p2p.js'])
 page.evaluate('''async urls=>{window.m={};for(const [k,v] of Object.entries(urls))m[k]=await import(v);window.s=m['state.js'].store.state;window.check=(v,m)=>{if(!v)throw Error(m)};window.rankedPlays=[];m['listening-history.js'].initListeningHistory({playTrack:i=>rankedPlays.push(i)});let ms=0;Object.defineProperty(performance,'now',{configurable:true,value:()=>ms});const track={tid:13,fullPath:'/music/night.flac',fileSize:100,lastModified:1,title:'Night Signal',artist:'The Meridian Sessions',duration:180};const track2={tid:14,fullPath:'/music/blue.flac',fileSize:101,lastModified:1,title:'Blue Meridian',artist:'The Meridian Sessions',duration:180};s.allTracks=[track,track2];s.currentTrackIndex=0;s.currentTrack=track;s.isPlaying=true;const h=m['listening-history.js'];for(const t of [track,track,track2]){h.finishListeningVisit();for(let i=0;i<=31;i++){ms+=1000;h.observeListening(t,i,180,true,1);}await new Promise(r=>setTimeout(r,30));};await new Promise(r=>setTimeout(r,50));check([...historyRows.values()].reduce((a,b)=>a+b.count,0)===3,'record count');document.querySelector('#listeningHistoryBtn').click();await new Promise(r=>setTimeout(r,30));check(document.querySelector('#listeningRows li').textContent.includes('2 plays'),'rank');document.querySelector('#listeningPeriod').value='all';document.querySelector('#listeningPeriod').dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,30));check(document.querySelectorAll('#listeningRows li').length===2,'all-time ranking');document.querySelector('#listeningHistoryDialog').close();check(!document.querySelector('#compactMediaBtn')&&!document.querySelector('#compactMediaDialog'),'media card removed');document.querySelector('#listeningHistoryBtn').click();const enabled=document.querySelector('#listeningEnabled');enabled.checked=false;enabled.dispatchEvent(new Event('change'));h.finishListeningVisit();for(let i=0;i<=32;i++){ms+=1000;h.observeListening(track,i,180,true,1)}await new Promise(r=>setTimeout(r,30));check([...historyRows.values()].reduce((a,b)=>a+b.count,0)===3,'opt out');enabled.checked=true;enabled.dispatchEvent(new Event('change'));h.finishListeningVisit();for(let i=0;i<=31;i++){ms+=1000;h.observeListening(track,i,180,true,1)}await new Promise(r=>setTimeout(r,30));enabled.checked=false;enabled.dispatchEvent(new Event('change'));enabled.checked=true;enabled.dispatchEvent(new Event('change'));for(let i=32;i<=70;i++){ms+=1000;h.observeListening(track,i,180,true,1)}await new Promise(r=>setTimeout(r,30));check([...historyRows.values()].reduce((a,b)=>a+b.count,0)===4,'same visit duplicate');h.finishListeningVisit();const reused={...track,fullPath:'/music/other.flac',title:'Other recording'};for(let i=0;i<=31;i++){ms+=1000;h.observeListening(reused,i,180,true,1)}await new Promise(r=>setTimeout(r,30));check(historyRows.size===3,'reused track ID merged');window.confirm=()=>true;document.querySelector('#listeningClear').click();await new Promise(r=>setTimeout(r,30));check(historyRows.size===0&&historyStores.totals.size===0&&historyStores.visits.size===0,'clear');check(!(await h.persistListeningVisit({id:'stale',key:'old',generation:'0',day:'2026-01-01',title:'Old',artist:'Old'})),'stale visit resurrected');document.querySelector('#listeningHistoryDialog').close();}''',urls)
 page.evaluate('''async()=>{const h=m['listening-history.js'],key='recording:fixture';const generation=localStorage.getItem('cachymusic_listening_generation');let ackAttempts=0;const event={id:'native-receipt-one',key,generation,day:'2026-11-25',title:'Native recording',artist:'Artist'};window.AndroidBridge={nativeListeningConfigure:()=>true,nativeListeningPending:()=>JSON.stringify([event]),nativeListeningAcknowledge:()=>++ackAttempts>1};await h.syncNativeHistory(true);await h.syncNativeHistory(true);check(ackAttempts===2,'ack not retried');check([...historyStores.totals.values()].reduce((a,b)=>a+b.count,0)===1,'native receipt counted twice');delete window.AndroidBridge;await h.clearListeningHistory();h.finishListeningVisit();const track=s.allTracks[0];let time=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>time});for(let i=0;i<=31;i++){time+=1000;h.observeListening(track,i,180,true,1);}await new Promise(r=>setTimeout(r,40));document.querySelector('#listeningHistoryBtn').click();await new Promise(r=>setTimeout(r,60));const play=document.querySelector('#listeningRows .listeningPlay');check(play,'unique playback action missing');play.click();check(rankedPlays.join(',')==='0','ranked action selected wrong track');await new Promise(r=>setTimeout(r,20));s.allTracks.push({...track});document.querySelector('#listeningHistoryBtn').click();await new Promise(r=>setTimeout(r,60));check(!document.querySelector('#listeningRows .listeningPlay'),'ambiguous track offered for play');document.querySelector('#listeningHistoryDialog').close();s.allTracks.pop();await new Promise(r=>setTimeout(r,30));}''')
 page.evaluate('''async()=>{
  const h=m['listening-history.js'],total=()=>[...historyStores.totals.values()].reduce((a,b)=>a+b.count,0);
  const event=(id)=>({id:'native-'+id,key:'recording:failure-fixture',generation:localStorage.getItem('cachymusic_listening_generation'),day:'2026-11-25',title:'Fixture',artist:'Fixture'});
  await h.clearListeningHistory();let attempts=0,queue=[event('failed-ack'),event('good')];
  window.AndroidBridge={nativeListeningConfigure:()=>true,nativeListeningPending:()=>JSON.stringify([{id:'bad'},...queue]),nativeListeningAcknowledge:id=>{if(id==='native-failed-ack'&&++attempts===1)return false;queue=queue.filter(e=>e.id!==id);return true;}};
  await h.syncNativeHistory(true);check(total()===2&&queue.length===1,'malformed/failed receipt blocked unrelated receipt');
  await h.syncNativeHistory(true);check(total()===2&&queue.length===0,'ack retry duplicated counts');
  await h.clearListeningHistory();queue=Array.from({length:160},(_,i)=>event('batch-'+i));let reads=0;
  window.AndroidBridge.nativeListeningPending=()=>{reads++;return JSON.stringify(queue.slice(0,32));};
  await h.syncNativeHistory(true);check(total()===128&&queue.length===32&&reads===4,'import budget exceeded or backlog stalled');
  await h.syncNativeHistory(true);check(total()===160&&queue.length===0,'backlog not drained');
  let allowErase=false;const config=[];window.AndroidBridge.nativeListeningConfigure=(enabled,generation,erase)=>{config.push({enabled,erase});return !erase||allowErase;};
  let rejected=false;try{await h.clearListeningHistory();}catch{rejected=true;}
  check(rejected&&localStorage.getItem('cachymusic_listening_clear_pending'),'failed clear not persisted');
  check(!(await h.persistListeningVisit({...event('blocked'),id:'blocked'})),'write accepted during incomplete clear');
  check(config.at(-1).enabled===false,'native tracking not stopped on failure');
  allowErase=true;await h.clearListeningHistory();check(!localStorage.getItem('cachymusic_listening_clear_pending')&&total()===0,'clear retry failed');
  check(await h.persistListeningVisit(event('after-clear')),'tracking did not recover');
  const receipt=event('after-clear');
  check(await h.persistListeningVisit(receipt),'same receipt retry rejected');
  check(!(await h.persistListeningVisit({...receipt,key:'recording:conflict'})),'conflicting receipt falsely accepted');
  check(!(await h.persistListeningVisit({...event('invalid-date'),day:'2026-02-30'})),'invalid date accepted');
  check(total()===1,'invalid or conflicting receipt incremented count');
  const ahead=String(Number(localStorage.getItem('cachymusic_listening_generation'))+5);
  localStorage.setItem('cachymusic_listening_generation',ahead);
  await h.clearListeningHistory();
  check(Number(localStorage.getItem('cachymusic_listening_generation'))>Number(ahead),'clear did not advance past cached generation');
  check(await h.persistListeningVisit(event('recovered-generation')),'generation recovery failed');
  delete window.AndroidBridge;await h.clearListeningHistory();
 }''')
 print('PASS malformed and failed receipt isolation, 128-receipt import budget, backlog recovery, persistent failed-clear barrier, conflicting receipt rejection and generation recovery (simulated storage/bridge)',flush=True)
 print('PASS native receipt retry/idempotency and unique versus ambiguous ranking actions (simulated storage and bridge)',flush=True)
 print('PASS simulated persistent daily counts, rankings, opt-out, clear and media card removal',flush=True)
 for control,svg in [('playPauseBtn','playPauseImg'),('miniPlayBtn','miniPlayImg')]:
  page.evaluate("""([control,svg])=>{const btn=document.getElementById(control);const node=document.getElementById(svg);window.testMorph={btn,node,parent:btn.parentNode,next:btn.nextSibling,style:btn.getAttribute('style')};btn.classList.remove('playing');document.body.appendChild(btn);btn.style.cssText='display:flex!important;position:fixed;top:10px;left:10px;z-index:9999';}""",[control,svg]);page.wait_for_timeout(250)
  for playing in (True,False):
   result=page.evaluate("""playing=>{const {btn,node}=testMorph;const path=node.querySelector('.morph-left');const before=getComputedStyle(path).clipPath;btn.classList.toggle('playing',playing);getComputedStyle(path).clipPath;const a=path.getAnimations().find(x=>x.transitionProperty==='clip-path');if(!a)return false;a.pause();a.currentTime=80;const mid=getComputedStyle(path).clipPath;a.finish();return before!==mid&&mid!==getComputedStyle(path).clipPath;}""",playing);assert result,(control,playing)
  page.evaluate("(()=>{const {btn,parent,next,style}=testMorph;parent.insertBefore(btn,next);if(style===null)btn.removeAttribute('style');else btn.setAttribute('style',style);})()")
 page.emulate_media(reduced_motion='reduce');page.evaluate("document.getElementById('playPauseBtn').classList.remove('playing')");assert page.evaluate("Math.max(...getComputedStyle(document.querySelector('#playPauseImg .morph-left')).transitionDuration.split(',').map(parseFloat))")<=0.001;page.emulate_media(reduced_motion='no-preference')
 print('PASS main and mini transport morph interpolation in both directions and reduced-motion preference',flush=True)
 checks=0
 for width,height in [(320,640),(393,873),(873,393),(1440,900)]:
  page.set_viewport_size({'width':width,'height':height})
  for theme in fixture.THEMES:
   page.evaluate('''theme=>{document.documentElement.dataset.theme=theme;document.documentElement.style.fontSize='200%';const d=document.getElementById('listeningHistoryDialog');d.showModal();const box=d.getBoundingClientRect();check(box.width<=innerWidth&&box.height<=innerHeight&&d.scrollWidth<=d.clientWidth+2,'dialog overflow listeningHistoryDialog '+theme+' '+innerWidth+' '+JSON.stringify(box.toJSON()));d.close();}''',theme);checks+=1
  if width==393:
   page.evaluate("document.documentElement.style.removeProperty('font-size');document.documentElement.dataset.theme='default';document.querySelector('#listeningHistoryBtn').click()")
   page.screenshot(path=str(args.output/'listening-history-393.png'),animations='disabled');page.evaluate("document.querySelector('#listeningHistoryDialog').close()")
 print(f'PASS {checks} listening history enlarged-text dialog checks',flush=True);b.close()
