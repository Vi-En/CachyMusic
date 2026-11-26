"""Unmuted, real media decode through the actual default player graph (not a DAC test)."""
from pathlib import Path
import importlib.util, argparse, json
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('visualizer-browser.py'))
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
parser=argparse.ArgumentParser();parser.add_argument('--chromium',default='/usr/bin/chromium');parser.add_argument('--load-workers',type=int,choices=range(0,9),default=0);parser.add_argument('--suspend-probe',action='store_true');parser.add_argument('--main-thread-busy-ms',type=int,choices=range(0,41),default=0);args=parser.parse_args()
shell=BeautifulSoup((fixture.ROOT/'index.html').read_text(),'html.parser')
for tag in shell.select('script,link,meta[http-equiv]'):tag.decompose()
for tag in shell.select('img'):tag.attrs.pop('src',None)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page();page.set_content(str(shell)); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    urls=fixture.install_module_map(page,['audio-engine.js','state.js','player-core.js'])
    result=page.evaluate('''async ({urls,loadWorkers,suspendProbe,mainThreadBusyMs})=>{
      const engine=await import(urls['audio-engine.js']), {store}=await import(urls['state.js']); await import(urls['player-core.js']);
      const s=store.state, delay=ms=>new Promise(r=>setTimeout(r,ms));
      const defaults={precision:s.mathPrecision,volume:s.currentVolumeValue,shaping:engine.hasUserShapingDsp()};
      if(defaults.precision!=='native'||defaults.volume!==.8||defaults.shaping)throw Error('Not clean defaults: '+JSON.stringify(defaults));
      const ctx=engine.initAudioContext();await ctx.resume();
      if(engine.getConfirmedAudioRoute()!=='direct')throw Error('Default route not direct');
      const splitter=ctx.createChannelSplitter(2), meters=[ctx.createAnalyser(),ctx.createAnalyser()];
      s.outputGate.connect(splitter);meters.forEach((m,i)=>{m.fftSize=4096;splitter.connect(m,i)});
      const results=[], clockProbe={};
      const workers=[];const workerUrl=URL.createObjectURL(new Blob([`onmessage=()=>{let x=1;while(true){for(let i=0;i<500000;i++)x=Math.sin(x+i);}}`],{type:'text/javascript'}));
      for(let i=0;i<loadWorkers;i++){const w=new Worker(workerUrl);w.postMessage(1);workers.push(w);}
      const mainTimer=mainThreadBusyMs?setInterval(()=>{const until=performance.now()+mainThreadBusyMs;while(performance.now()<until){Math.sqrt(performance.now());}},100):null;
      async function settle(seconds){const start=performance.now(),a=ctx.currentTime,b=s.audio.currentTime;
        while(ctx.currentTime-a<seconds||s.audio.currentTime-b<seconds*.85){
          if(performance.now()-start>5000)throw Error('Audio/media clock stalled: '+JSON.stringify({audio:ctx.currentTime-a,media:s.audio.currentTime-b,state:ctx.state,paused:s.audio.paused}));
          await delay(15);
        }
        return {wallMs:performance.now()-start,audioSeconds:ctx.currentTime-a,mediaSeconds:s.audio.currentTime-b};
      }
      try {
      function measure(m,freq){const a=new Float32Array(m.fftSize);m.getFloatTimeDomainData(a);
        let ss=0,cc=0,sc=0,sy=0,cy=0,peak=0,power=0;
        for(let i=0;i<a.length;i++){const t=2*Math.PI*freq*i/ctx.sampleRate,x=Math.sin(t),y=Math.cos(t),v=a[i];ss+=x*x;cc+=y*y;sc+=x*y;sy+=x*v;cy+=y*v;peak=Math.max(peak,Math.abs(v));power+=v*v;}
        const den=ss*cc-sc*sc, b=(sy*cc-cy*sc)/den,c=(cy*ss-sy*sc)/den;
        return {amplitude:Math.hypot(b,c),peak,residual:Math.sqrt(Math.max(0,power-b*sy-c*cy)/Math.max(1e-20,power))};
      }
      for(const rate of [44100,48000,96000]){
        const frames=rate*12,bytes=new ArrayBuffer(44+frames*4),v=new DataView(bytes);
        const text=(o,x)=>{for(let i=0;i<x.length;i++)v.setUint8(o+i,x.charCodeAt(i));};
        text(0,'RIFF');v.setUint32(4,36+frames*4,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,frames*4,true);
        for(let i=0;i<frames;i++){v.setInt16(44+i*4,Math.round(32767*.98*Math.sin(i*2*Math.PI*997/rate)),true);v.setInt16(46+i*4,Math.round(32767*.47*Math.sin(i*2*Math.PI*1511/rate)),true);}
        const url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));s.audio.src=url;s.audio.muted=false;engine.setVolume(.8,true,false);await s.audio.play();
        for(const volume of [.8,.3,1]){
          const probe=suspendProbe&&rate===96000&&volume===.3;
          if(probe){await settle(.25);await ctx.suspend();}
          const startAudio=ctx.currentTime,startMedia=s.audio.currentTime,startWall=performance.now();
          engine.setVolume(volume,true,false);await delay(350);
          const old={audioSeconds:ctx.currentTime-startAudio,mediaSeconds:s.audio.currentTime-startMedia,wallMs:performance.now()-startWall,left:measure(meters[0],997),right:measure(meters[1],1511)};
          if(probe){clockProbe.wallOnly=old;if(old.audioSeconds>.02)throw Error('Suspension probe did not suspend');await ctx.resume();}
          const valid=(left,right)=>Math.abs(left.amplitude-.98*volume)<=.025&&Math.abs(right.amplitude-.47*volume)<=.025&&left.residual<=.025&&right.residual<=.025&&left.peak<=1.001&&right.peak<=1.001;
          const entry={rate,contextRate:ctx.sampleRate,volume,wallOnly:old,wallOnlyPass:valid(old.left,old.right),windows:[]};results.push(entry);
          for(let window=0;window<2;window++){
            const timing=await settle(window===0?.25:.12),left=measure(meters[0],997),right=measure(meters[1],1511);entry.windows.push({timing,left,right});
            if(!valid(left,right))throw Error('Signal integrity after render-clock advancement: '+JSON.stringify(entry));
          }
          if(probe&&entry.wallOnlyPass)throw Error('Suspension probe did not expose stale samples');
          if(!probe&&!entry.wallOnlyPass)throw Error('Legacy wall-clock signal failure (settled windows recorded): '+JSON.stringify(entry));
        }
        s.audio.muted=true;await settle(.3);const muted=measure(meters[0],997);if(muted.peak>1e-5)throw Error('Mute leaks: '+JSON.stringify(muted));
        s.audio.pause();s.audio.removeAttribute('src');s.audio.load();URL.revokeObjectURL(url);
      }
      return {defaults,results,clockProbe,loadWorkers,mainThreadBusyMs};
      } finally {if(mainTimer!==null)clearInterval(mainTimer);workers.forEach(w=>w.terminate());URL.revokeObjectURL(workerUrl);await ctx.close();}
    }''',{'urls':urls,'loadWorkers':args.load_workers,'suspendProbe':args.suspend_probe,'mainThreadBusyMs':args.main_thread_busy_ms})
    assert not errors,errors
    print(json.dumps(result,indent=2));print('PASS actual unmuted default media graph, stereo gain, near-full-scale input, resampling and mute');browser.close()
