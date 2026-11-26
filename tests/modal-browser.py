"""Exercise real modal focus and history helpers in Chromium's DOM."""
from pathlib import Path
import argparse, importlib.util
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('renderer',Path(__file__).with_name('visualizer-browser.py'))
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
p=argparse.ArgumentParser();p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path=args.chromium,args=['--no-sandbox'])
    page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content('''<button id="trigger">Open</button><button id="other">Outside</button>
    <div id="one" role="dialog" aria-modal="true" style="display:none"><button class="closeModalBtn" id="first">Close</button><button id="nested">Nested</button></div>
    <div id="two" role="dialog" aria-modal="true" style="display:none;z-index:2;position:relative"><button class="closeModalBtn" id="second">Close</button><input id="last"/></div>''')
    urls={n:f.module_url(f.ROOT/'scripts/modules'/n) for n in ['modal-focus.js','utils.js']}
    page.evaluate('''async urls=>{const m=await import(urls['modal-focus.js']),u=await import(urls['utils.js']);window.modal=m;window.u=u;m.installModalFocus();for(const id of ['one','two'])document.getElementById(id).querySelector('button').onclick=()=>{document.getElementById(id).style.display='none';u.popModalState(id);};window.openDialog=id=>{document.getElementById(id).style.display='block';u.pushModalState(id);};}''',urls)
    page.locator('#trigger').focus();page.evaluate('openDialog("one")');page.wait_for_function('document.activeElement.id==="first"')
    page.keyboard.press('Shift+Tab');assert page.evaluate('document.activeElement.id')=='nested'
    page.keyboard.press('Tab');assert page.evaluate('document.activeElement.id')=='first'
    page.locator('#other').focus();assert page.evaluate('document.activeElement.id')=='first'
    page.locator('#nested').focus();page.evaluate('openDialog("two")');page.wait_for_function('document.activeElement.id==="second"')
    page.keyboard.press('Shift+Tab');assert page.evaluate('document.activeElement.id')=='last'
    page.evaluate('history.back()');page.wait_for_function('document.getElementById("two").style.display==="none"');page.wait_for_function('document.activeElement.id==="nested"')
    assert page.locator('#one').is_visible()
    page.locator('#first').click();page.wait_for_function('document.activeElement.id==="trigger"');page.wait_for_function('!history.state?.cachyModal')
    page.evaluate('openDialog("one")');page.wait_for_function('document.activeElement.id==="first"')
    page.evaluate('document.getElementById("first").click();openDialog("one")')
    page.wait_for_timeout(250)
    assert page.locator('#one').is_visible(), 'prior explicit close hid reopened modal'
    assert page.evaluate('history.state?.cachyModal')=='one'
    page.evaluate('history.back()');page.wait_for_function('!history.state?.cachyModal');page.wait_for_function('document.getElementById("one").style.display==="none"')
    assert not errors,errors
    print('PASS modal focus entry, tab wrap, focus containment, nested back navigation, trigger restoration and immediate reopen')
    browser.close()
