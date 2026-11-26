"""Secure-origin integration: production AudioWorklet and actual rendered signal.
Run in browser CI or a developer machine with loopback HTTP available.
No access to a physical DAC is assumed.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import argparse
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--chromium',default='/usr/bin/chromium');args=parser.parse_args()
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path=='/acceptance':
            self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(b'<button id="start">Start</button>');return
        super().do_GET()
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(root)))
Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
        page=browser.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/acceptance');page.click('#start')
        result=page.evaluate('''async()=>{
          if(!isSecureContext)throw Error('Secure context required');
          const {createWorkletAcknowledgements}=await import('/scripts/modules/worklet-ack.js');
          const {createOutputHold}=await import('/scripts/modules/audio-output-hold.js');
          const out=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
          for(const rate of [44100,48000,96000,192000]){
            const ctx=new AudioContext({sampleRate:rate});try{
              await ctx.resume();await ctx.audioWorklet.addModule('/scripts/dsp-worklet-processor.js');
              const dsp=new AudioWorkletNode(ctx,'cachymusic-dsp-processor',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
              const ack=createWorkletAcknowledgements({timeout:1500});ack.register(dsp);dsp.port.onmessage=e=>ack.receive(dsp,e.data);
              const gate=ctx.createGain(),meter=ctx.createAnalyser();meter.fftSize=2048;dsp.connect(gate).connect(meter).connect(ctx.destination);
              const source=ctx.createOscillator(),level=ctx.createGain();source.frequency.value=1000;level.gain.value=.98;source.connect(level).connect(dsp);source.start();
              const hold=createOutputHold(()=>({ctx,node:gate}));
              const base={linearGainTarget:1,precision64:true,agpEnabled:false,limiterEnabled:true,subsonicEnabled:false,ultrasonicEnabled:false,ditherMode:'off',peqBypassed:true,peqGains:Array(10).fill(0),peqQs:Array(10).fill(1.41),bassBoost:false,vocalBoost:false,trebleBoost:false,crossfeedEnabled:false,ambiophonicsEnabled:false,phaseInvert:false,monoMix:false,stereoWidth:1,stereoBalance:0};
              ack.send(dsp,base);await ack.wait(dsp);await wait(100);
              const buffer=new Float32Array(meter.fftSize);const peak=()=>{meter.getFloatTimeDomainData(buffer);let v=0;for(const x of buffer){if(!Number.isFinite(x))throw Error('Nonfinite output');v=Math.max(v,Math.abs(x));}return v;};
              const before=peak();await hold.acquire();ack.send(dsp,{...base,linearGainTarget:2.2,peqBypassed:false,peqGains:Array(10).fill(10),bassBoost:true,trebleBoost:true});await ack.wait(dsp);await wait(120);const muted=peak();hold.release();await wait(160);const after=peak();
              if(before<.5||before>.94||muted>1e-5||after<.2||after>.94)throw Error(JSON.stringify({rate,before,muted,after}));
              out.push({rate:ctx.sampleRate,before,muted,after});ack.close(dsp);dsp.port.close();source.stop();
            }finally{await ctx.close()}
          }
          return out;
        }''')
        print('PASS real AudioWorklet revision acknowledgement and near-full-scale processing with output gate:',result);browser.close()
finally:
    server.shutdown();server.server_close()
