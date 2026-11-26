"""Exercise standalone comparator controls with generated local media.
The DOM fixture omits CSP for script injection; file:// deployment and physical output are separate.
"""
import argparse,math,struct,tempfile,wave
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'tools/audio-diagnostics';p=argparse.ArgumentParser();p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
shell=BeautifulSoup((root/'compare.html').read_text(),'html.parser')
for node in shell.select('script,link,meta[http-equiv]'):node.decompose()
with tempfile.TemporaryDirectory() as d:
    f=Path(d)/'reference.wav';rate=44100
    with wave.open(str(f),'wb') as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes(b''.join(struct.pack('<hh',round(32767*.1*math.sin(i*2*math.pi*997/rate)),round(32767*.07*math.sin(i*2*math.pi*1511/rate))) for i in range(rate*3)))
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required']);page=b.new_page(accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_content(str(shell));page.add_script_tag(content=(root/'compare.js').read_text());page.locator('#file').set_input_files(str(f));page.locator('#plain').click();page.wait_for_function("document.querySelector('#route').textContent==='Regular media'");assert page.evaluate('owner.media.volume')==.1;page.locator('#graph').click();page.wait_for_function("document.querySelector('#route').textContent==='Direct Web Audio'");assert page.evaluate('owner.context.state')=='running';assert page.evaluate('owner.gain.gain.value')==1;assert page.evaluate('owner.media.volume')==.1;page.locator('#stop').click();page.wait_for_function('owner===null');assert page.locator('#stop').is_disabled();page.locator('#plainResult').select_option('Clean');page.locator('#graphResult').select_option('Distorted');with_download=None
        with page.expect_download() as download:page.locator('#export').click()
        import json
        report=json.loads(Path(download.value.path()).read_text());assert report['regularMedia']['$result']=='Clean' and report['directGraph']['$result']=='Distorted';assert 'reference.wav' not in str(report);assert not errors,errors;b.close()
print('PASS independent local comparison routes, single owner, attenuation, stop and private report export (DOM fixture)')
