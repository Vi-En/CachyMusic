"""Production media listener with controlled error events and injected transport.
This verifies error routing and delayed intent ownership, not a live network fault.
"""
import argparse,importlib.util
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('visualizer-browser.py'));fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
p=argparse.ArgumentParser();p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
html=BeautifulSoup((fixture.ROOT/'index.html').read_text(),'html.parser')
for tag in html.select('script,link,meta[http-equiv]'):tag.decompose()
for tag in html.select('img'):tag.attrs.pop('src',None)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox']);page=b.new_page();page.set_content(str(html));urls=fixture.install_module_map(page,['state.js','media-element-events.js'])
 page.evaluate('''async urls=>{const {store}=await import(urls['state.js']),{createMediaElementListener}=await import(urls['media-element-events.js']);const s=store.state;let generation=1,intent=0,errorCode=2,position=25,src='blob:fixture',direct=0,guarded=0,offset=null;const track={id:'fixture',title:'Reference',duration:120,src};s.allTracks=[track];s.currentTrackIndex=0;s.currentTrack=track;s.isSoftwareDecoding=false;s.userExplicitlyPaused=false;s.trackPlaybackRetryCount=0;const audio=new EventTarget();Object.assign(audio,{paused:true,readyState:4,get src(){return src;},getAttribute:()=>src,removeAttribute(){src='';},load(){position=0;},pause(){this.paused=true;},play(){direct++;return Promise.resolve();}});Object.defineProperties(audio,{error:{get:()=>({code:errorCode})},currentTime:{get:()=>position,set:v=>position=v},src:{get:()=>src,set:v=>src=v,configurable:true}});s.audio=audio;const attach=createMediaElementListener({nativeActive:()=>false,trackGeneration:()=>generation,playbackIntent:()=>intent,clearPendingPlay(){intent++;},syncPlayPauseUI(){},clearSeekStallTimer(){},clearNoDataStallTimer(){},rememberSoftwareDecoder(){},playWithSoftwareDecoder(_t,p){offset=p;},pauseAudio(){},nextTrack(){},playAudio(){guarded++;return Promise.resolve();},checkAndPreloadNextTrack(){},mprisSyncHook(){}});attach(audio);const delay=ms=>new Promise(r=>setTimeout(r,ms));audio.dispatchEvent(new Event('error'));await delay(1650);if(direct!==0||guarded!==1||position!==25)throw Error('network recovery bypassed controller or lost offset '+JSON.stringify({direct,guarded,position}));s.trackPlaybackRetryCount=0;audio.dispatchEvent(new Event('error'));intent++;await delay(1650);if(guarded!==1)throw Error('stale retry executed');errorCode=3;position=49;audio.dispatchEvent(new Event('error'));if(offset!==49)throw Error('fallback lost position '+offset);return true;}''',urls)
 print('PASS network recovery uses guarded controller, stale retry cancelled, decode fallback preserves pre-reset position');b.close()
