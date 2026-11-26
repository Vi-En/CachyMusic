"""Production graph integration on a genuine loopback origin (no policy bypass).
Verifies actual worklet configuration/activation and incremental PCM worker output.
The physical output device is outside the scope of this test.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import argparse
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
shell=BeautifulSoup((root/'index.html').read_text(),'html.parser')
for tag in shell.select('script,link,meta[http-equiv],img'):tag.decompose()
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path=='/audio-production-acceptance':
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(str(shell).encode());return
        super().do_GET()
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(root)));Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/audio-production-acceptance',timeout=10000)
        result=page.evaluate('''async()=>{
            if(!isSecureContext)throw Error('Secure loopback origin required');
            const engine=await import('/scripts/modules/audio-engine.js'),{store}=await import('/scripts/modules/state.js'),core=await import('/scripts/modules/player-core.js'),{safeStorage}=await import('/scripts/modules/utils.js'),s=store.state;
            const delay=ms=>new Promise(r=>setTimeout(r,ms)),wait=async pred=>{for(let i=0;i<200&&!pred();i++)await delay(25);if(!pred())throw Error('Transport did not settle');};
            const rate=48000,frames=rate*8,bytes=new ArrayBuffer(44+frames*4),v=new DataView(bytes),text=(o,x)=>{for(let i=0;i<x.length;i++)v.setUint8(o+i,x.charCodeAt(i));};text(0,'RIFF');v.setUint32(4,36+frames*4,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,frames*4,true);for(let i=0;i<frames;i++){v.setInt16(44+i*4,Math.round(32767*.2*Math.sin(i*2*Math.PI*997/rate)),true);v.setInt16(46+i*4,Math.round(32767*.12*Math.sin(i*2*Math.PI*1511/rate)),true);}
            const file=new File([bytes],'reference.wav',{type:'audio/wav'}),url=URL.createObjectURL(file),track={id:'fixture',title:'Reference',filename:'reference.wav',src:url,_fileBlob:file,sampleRate:rate,channels:2,duration:8,size:file.size};s.allTracks=[track];s.displayedTracks=s.allTracks;s.repeatMode='off';engine.setVolume(.5,true,false);const ctx=engine.initAudioContext();await ctx.resume();const split=ctx.createChannelSplitter(2),meter=ctx.createAnalyser();meter.fftSize=4096;s.outputGate.connect(split);split.connect(meter,0);const a=new Float32Array(meter.fftSize);const peak=()=>{meter.getFloatTimeDomainData(a);let max=0;for(const x of a){if(!Number.isFinite(x))throw Error('Nonfinite output');max=Math.max(max,Math.abs(x));}return max;};
            await core.loadTrack(0,true);await wait(()=>!s.audio.paused);await delay(250);if(engine.getConfirmedAudioRoute()!=='direct'||Math.abs(peak()-.1)>.015)throw Error('Default direct route');
            await s.withAudioEdit(()=>engine.setDspBoost('amp',true));await wait(()=>!s.audio.paused&&engine.getConfirmedAudioRoute()==='worklet');await delay(350);const shaped=peak();if(shaped<.05||shaped>.95)throw Error('Shaped output out of range '+shaped);
            await s.withAudioEdit(()=>engine.setDspBoost('amp',false));await wait(()=>!s.audio.paused&&engine.getConfirmedAudioRoute()==='direct');await delay(250);if(Math.abs(peak()-.1)>.015)throw Error('Direct route restore');core.pauseAudio();
            safeStorage.setItem('cachymusic_continuous_pcm','true');await core.loadTrack(0,true);await wait(()=>s.isSoftwareDecoding&&s.activeDecodedBuffer?.streaming&&!s.isSoftwarePaused&&s.isPlaying);await delay(700);const pcm=peak();if(Math.abs(pcm-.1)>.015)throw Error('Incremental PCM gain '+pcm);core.seekAudio(2);await delay(1000);if(Math.abs(peak()-.1)>.015)throw Error('Incremental PCM seek output');s.audio.muted=true;engine.syncSoftwareVolume(true);await delay(250);if(peak()>1e-5)throw Error('Incremental PCM mute');core.pauseAudio();await ctx.close();URL.revokeObjectURL(url);return {shaped,pcm};
        }''');assert not errors,errors;print('PASS genuine-origin actual production direct/worklet/fallback ownership and incremental PCM worker playback',result);b.close()
finally:server.shutdown();server.server_close()
