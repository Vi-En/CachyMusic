"""Real Web Audio output-gate acceptance in the Chromium fixture.
The secure-origin worklet test is separate; no physical output claims.
"""
from pathlib import Path
import argparse,importlib.util
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('visualizer-browser.py'))
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
parser=argparse.ArgumentParser();parser.add_argument('--chromium',default='/usr/bin/chromium');args=parser.parse_args()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
    page=browser.new_page();page.set_content('<button id="start">Start test</button>');page.click('#start')
    result=page.evaluate('''async url=>{
      const {createOutputHold}=await import(url); const results=[];
      for(const rate of [44100,48000,96000,192000]){
        const ctx=new AudioContext({sampleRate:rate});await ctx.resume();
        const osc=ctx.createOscillator(),source=ctx.createGain(),gate=ctx.createGain(),meter=ctx.createAnalyser();meter.fftSize=2048;
        osc.frequency.value=1000;source.gain.value=.98;osc.connect(source).connect(gate).connect(meter).connect(ctx.destination);osc.start();
        const hold=createOutputHold(()=>({ctx,node:gate}));const delay=ms=>new Promise(r=>setTimeout(r,ms));
        const values=new Float32Array(meter.fftSize);const peak=()=>{meter.getFloatTimeDomainData(values);let m=0;for(const v of values)m=Math.max(m,Math.abs(v));return m};
        await delay(100);const before=peak();await hold.acquire();await delay(100);const silent=peak();hold.release();await delay(100);const after=peak();
        if(before<.85||before>1||silent>1e-5||after<.85||after>1)throw Error(JSON.stringify({rate,before,silent,after}));
        results.push({rate:ctx.sampleRate,before,silent,after});osc.stop();await ctx.close();
      }
      return results;
    }''',fixture.module_url(fixture.ROOT/'scripts/modules/audio-output-hold.js'))
    print('PASS actual Web Audio near-full-scale gain hold:',result);browser.close()
