from pathlib import Path
import re,base64,mimetypes,io,json
from bs4 import BeautifulSoup
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright
import argparse, importlib.util
# Use the exact source renderer modules when showing a thematic frame.
spec=importlib.util.spec_from_file_location("renderer_fixture",Path(__file__).with_name("visualizer-browser.py"));renderer_fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer_fixture)
parser=argparse.ArgumentParser(description='Static Chromium fixture: requires Pillow, BeautifulSoup4, Playwright and Chromium')
parser.add_argument('--output',type=Path,default=Path('preview-layouts'))
parser.add_argument('--chromium',default='/usr/bin/chromium')
args=parser.parse_args()
root=Path(__file__).resolve().parent.parent; out=args.output;out.mkdir(parents=True,exist_ok=True)
def uri(p):
 return 'data:'+ (mimetypes.guess_type(str(p))[0] or 'application/octet-stream')+';base64,'+base64.b64encode(p.read_bytes()).decode()
def css(p):
 s=p.read_text();s=re.sub(r'@import\s+url\([\'\"]?([^\'\")]+)[\'\"]?\)\s*;',lambda m:css(p.parent/m[1]),s)
 def u(m):
  v=m[1].strip(' \"\'');f=p.parent/v
  if v.startswith(("data:","http:","https:")):return m[0]
  return 'url("'+uri(f)+'")' if f.is_file() else m[0]
 return re.sub(r'url\(([^)]+)\)',u,s)
s=BeautifulSoup((root/'index.html').read_text(),'html.parser')
for t in s.select('script,link,meta[http-equiv]'):t.decompose()
for t in s.select('[src]'):
 p=root/t['src'];
 if p.is_file():t['src']=uri(p)
style=s.new_tag('style');style.string=css(root/'stylesheets/homepage.css');s.head.append(style)
# A neutral, fabricated album-cover fixture, shared by every theme.
im=Image.new('RGB',(640,640),'#14202b');d=ImageDraw.Draw(im)
for y in range(640):
 k=y/640;d.line((0,y,640,y),fill=(int(17+38*k),int(30+28*k),int(43+40*k)))
for i in range(6):
 r=220-i*23;d.ellipse((320-r,300-r,320+r,300+r),outline='#b0bca9',width=2)
d.ellipse((238,218,402,382),fill='#ce9b6b');d.rectangle((0,464,640,640),fill='#15232e');f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',37);d.text((34,492),'NIGHT SIGNAL',font=f,fill='#f0e8d9');d.text((36,550),'S T U D I O   S E S S I O N S',font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17),fill='#a4b8be');b=io.BytesIO();im.save(b,format='PNG');art='data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()
for id in ('vinylArt','deckArtworkBackdrop','deckArtworkAmbient','coverArtPreview','miniArtPreview'):s.find(id=id)['src']=art
s.find(id='deckArtworkBackdrop')['style']='opacity:.24';s.select_one('.playerDeck')['class'].remove('empty-deck');s.find(id='playerEmptyPrompt')['style']='display:none';
for id,txt in {'trackName':'Night Signal','artistName':'The Meridian Sessions','albumName':'After Hours · 2026','trackBadge':'FLAC · 24-bit / 96 kHz','currentTime':'2:18','totalDuration':'5:42','statFormat':'FLAC','statChannels':'2 / Stereo','statSize':'68.4 MB','statPath':'Night Signal.flac','trackCount':'5 tracks','statTitle':'Night Signal','statArtist':'The Meridian Sessions','statAlbum':'After Hours','statYear':'2026','statSampleRate':'96000 Hz','statBitDepth':'24-bit','miniTitle':'Night Signal','miniArtist':'The Meridian Sessions','miniCurrentTime':'2:18','miniTotalDuration':'5:42','signalPathLabel':'Signal path'}.items():
 t=s.find(id=id)
 if t: t.string=txt;t.attrs.pop('style',None)
s.find(id='progressBar')['style']='width:40.35%';s.find(id='miniProgressBar')['style']='width:40.35%'
for id in ('progressCon','miniProgressCon'):
 s.find(id=id)['aria-disabled']='false';s.find(id=id)['aria-valuemax']='342';s.find(id=id)['aria-valuenow']='138'
for i,name in enumerate(['Night Signal','Blue Meridian','Fading Orbit','Soft Horizon','Last Light']):
 row=BeautifulSoup(f'<div class="trackItem {"active" if i==0 else ""}"><img class="trackThumb" src="{art}"><button type="button" class="trackDetails"><span class="trackTitle">{name}</span><span class="trackArtist">The Meridian Sessions · FLAC</span></button><span class="trackDuration">5:42</span><button class="trackMenuTriggerBtn" aria-label="Track options">⋮</button></div>','html.parser');s.find(id='trackList').append(row)
html=str(s);themes=['default','nms','solar-eclipse','euclid-horizon','alien-paradise','abyssal-void','dissonance','sentinel','minimalist-light','minimalist-dark','minimalist-warm','minimalist-obsidian'];checks=[];tabchecks=[];craftchecks=[];interactionchecks=[];stresschecks=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
 for typ,w,h in [('android',393,873),('desktop',1440,900),('narrow',320,640),('landscape',873,393),('laptop',1366,768)]:
  page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
  page.set_content(html,wait_until='load');
  if typ in ('android','desktop'): page.evaluate('async url=>{window.themeRegistry=await import(url)}',renderer_fixture.module_url((root/'scripts/modules/visualizers/registry.js').resolve()))
  page.evaluate("mobile=>{document.getElementById('settingsRowAndroidNative').hidden=!mobile}",typ in ('android','narrow','landscape'));page.evaluate("()=>document.querySelector('#mobilePlayerTabBtn').classList.add('active')");page.evaluate("mobile=>{if(mobile){const b=document.querySelector('#metadataToggleBtn');b.classList.remove('active');b.setAttribute('aria-pressed','false')}}",typ in ('android','narrow','landscape'))
  for theme in themes:
   page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme);page.evaluate('document.fonts.ready')
   if typ=='android':
    craftchecks.append({'theme':theme,**page.evaluate("""()=>{const root=document.documentElement,cs=getComputedStyle(root),c=document.createElement('canvas').getContext('2d',{willReadFrequently:true});c.canvas.width=c.canvas.height=1;const color=n=>cs.getPropertyValue(n).trim();function rgb(fg,bg){c.clearRect(0,0,1,1);c.fillStyle=bg;c.fillRect(0,0,1,1);c.fillStyle=fg;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data].slice(0,3)}function lum(x){return x.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}function ratio(a,b){let x=lum(a),y=lum(b);return +((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)}const bg=color('--bg-canvas'),group=rgb(color('--group-fill'),bg),canvas=rgb(bg,bg),groupCSS='rgb('+group.join(',')+')';return {primary:ratio(rgb(color('--text-primary'),bg),canvas),secondary:ratio(rgb(color('--text-secondary'),bg),canvas),groupSecondary:ratio(rgb(color('--text-secondary'),groupCSS),group),accentButton:ratio(rgb(color('--text-on-accent'),color('--accent-color')),rgb(color('--accent-color'),bg)),transport:ratio(rgb(color('--play-ink'),bg),canvas),touchTargets:[...document.querySelectorAll('.mediaBtn,.mobileTabBtn')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({id:e.id,w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)})),hiddenRule:getComputedStyle(document.querySelector('#metaLookupCancelBtn')).display==='none'}}""")})
   for mode in ['artwork','thematic']:
    page.evaluate("m=>{document.documentElement.dataset.presentation=m;document.querySelector('#vinylLabel').style.opacity=m==='artwork'?'1':'0';document.querySelector('#turntableCenterVis').style.display=m==='artwork'?'none':'flex'}",mode)
    checks.append({'viewport':typ,'theme':theme,'mode':mode,**page.evaluate('''()=>{let d=document.querySelector('.playerDeck'),s=d.querySelector('.turntableStage'),a=d.querySelector('.turntableCon'),q=d.querySelector('.deckTopControls'),r=x=>x.getBoundingClientRect(),ar=r(a),sr=r(s),qr=r(q),dr=r(d),tol=1.5;let media=[...d.querySelectorAll('.mediaBtn')].map(r);let bad=media.some((x,i)=>i>0&&x.left<media[i-1].right-tol);return {pageOverflow:document.documentElement.scrollWidth>innerWidth+1,deckOverflowX:d.scrollWidth>d.clientWidth+1,scrollY:d.scrollHeight>d.clientHeight+1,stageHeight:s.clientHeight,artWidth:a.clientWidth,artHeight:a.clientHeight,centerError:Math.abs((ar.left+ar.right-dr.left-dr.right)/2),artFits:ar.left>=sr.left-tol&&ar.right<=sr.right+tol&&ar.top>=sr.top-tol&&ar.bottom<=sr.bottom+tol,quickFits:qr.left>=sr.left-tol&&qr.right<=sr.right+tol&&qr.bottom<=sr.bottom+tol,artControlGap:Math.round(qr.top-ar.bottom),transportOverlap:bad,usableArtwork:a.clientWidth>=100&&a.clientHeight>=100, tapHighlight:getComputedStyle(q.querySelector("button")).webkitTapHighlightColor,transportFits:media.every(x=>x.left>=dr.left-tol&&x.right<=dr.right+tol),mask:getComputedStyle(d.querySelector('.vinylTurntable')).clipPath,objectFit:getComputedStyle(d.querySelector('#vinylArt')).objectFit,needle:!!document.querySelector('#toneArm')}}''')})
    if typ in ('android','desktop'):
     if mode=='thematic':
      page.evaluate('''async theme=>{const renderer=await window.themeRegistry.loadCore(theme);const c=document.querySelector('#turntableCenterCanvas');c.width=c.clientWidth;c.height=c.clientHeight;const ctx=c.getContext('2d');const bands=Float32Array.from({length:60},(_,i)=>.2+.65*Math.abs(Math.sin(i*.19)));for(let i=0;i<6;i++){ctx.clearRect(0,0,c.width,c.height);renderer.drawCore(ctx,c.width,c.height,true,1000+i*33,1/30,.55,.35,.6,.45,.4,1,bands)}}''',theme)
     page.screenshot(path=str(out/f'{typ}-{theme}-{mode}.png'),animations='disabled')
   if typ in ('android','narrow'):
    page.evaluate("()=>{document.documentElement.style.fontSize='125%';document.querySelector('#trackName').textContent='A deliberately long track title for layout testing — 東京 — extended edition';document.querySelector('#artistName').textContent='An intentionally long artist and collaboration name';document.documentElement.dataset.presentation='artwork'}")
    stresschecks.append({'theme':theme,'viewport':typ,**page.evaluate("""()=>{const d=document.querySelector('.playerDeck'),r=d.getBoundingClientRect(),buttons=[...d.querySelectorAll('.mediaBtn')].map(e=>e.getBoundingClientRect());return {overflow:document.documentElement.scrollWidth>innerWidth+1||d.scrollWidth>d.clientWidth+1,buttonsFit:buttons.every(b=>b.left>=r.left-1&&b.right<=r.right+1),buttonsSeparate:buttons.every((b,i)=>!i||b.left>=buttons[i-1].right-1),artWidth:document.querySelector('.turntableCon').clientWidth}}""")})
    page.evaluate("()=>{document.documentElement.style.removeProperty('font-size');document.querySelector('#trackName').textContent='Night Signal';document.querySelector('#artistName').textContent='The Meridian Sessions'}")
  if typ in ('android','desktop','narrow'):
   for theme in themes:
    page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
    page.evaluate("()=>document.documentElement.dataset.presentation='artwork'")
    for tab in ['library','settings','soulseek','transfers','details']:
     if typ=='desktop' and tab in ('library','details'): continue
     page.evaluate('''tab=>{let b=document.body;let ws=tab==='transfers'?'soulseek':tab==='settings'||tab==='soulseek'?tab:'player';b.className='view-'+ws+(tab==='library'?' mobile-tab-tracks':tab==='details'?' mobile-tab-info':'');document.querySelector('.gridContainer').style.display=ws==='player'?'':'none';for(let [id,name] of [['settingsWorkspace','settings'],['soulseekWorkspace','soulseek']])document.getElementById(id).style.display=ws===name?'flex':'none';document.getElementById('soulseekWorkspace').dataset.slskSubview=tab==='transfers'?'transfers':'results';document.querySelector('.slskTransfersDrawer').classList.toggle('open',tab==='transfers');document.querySelectorAll('.panel').forEach(el=>el.classList.toggle('mobileActive',tab==='library'?el.classList.contains('trackListPanel'):tab==='details'?el.id==='infoPanel':el.classList.contains('playerDeck')));document.querySelector('.persistentMiniPlayer').style.display=ws==='player'&&tab!=='library'&&tab!=='details'?'none':'grid';document.querySelectorAll('.mobileTabBtn').forEach(el=>el.classList.toggle('active',el.dataset.target===(tab==='library'?'trackListPanel':tab==='details'?'playerDeck':ws==='settings'?'settingsWorkspace':'soulseekWorkspace')));}''',tab)
     tabchecks.append({'viewport':typ,'theme':theme,'tab':tab,**page.evaluate('''()=>{let e=document.body.classList.contains('view-settings')?document.getElementById('settingsWorkspace'):document.body.classList.contains('view-soulseek')?document.getElementById('soulseekWorkspace'):document.querySelector('.panel.mobileActive');return {pageOverflow:document.documentElement.scrollWidth>innerWidth+1,workspaceOverflowX:e.scrollWidth>e.clientWidth+1,width:e.clientWidth,height:e.clientHeight,playerVisible:document.querySelector('.playerDeck').getClientRects().length>0,searchVisible:getComputedStyle(document.querySelector('.slskControlsPanel')).display!=='none',resultsVisible:getComputedStyle(document.querySelector('.slskResultsCon')).display!=='none',transfersVisible:getComputedStyle(document.querySelector('.slskTransfersDrawer')).display!=='none'}}''')})
     if typ=='android' and theme in ('default','solar-eclipse','alien-paradise','minimalist-warm'):page.screenshot(path=str(out/f'{typ}-{theme}-{tab}.png'),animations='disabled')
     if typ=='android' and tab=='settings':
      ctl=page.locator('#continuousPcmMode');label=page.locator('label[for=continuousPcmMode]');label.click();checked=ctl.is_checked();ctl.press('Space');keyboard=not ctl.is_checked();focus=ctl.evaluate("e=>getComputedStyle(e).outlineStyle!=='none'");summary=page.locator('#settingsAdvancedAudio summary');summary.click();opened=page.locator('#settingsAdvancedAudio').evaluate('e=>e.open');summary.click();closed=not page.locator('#settingsAdvancedAudio').evaluate('e=>e.open');interactionchecks.append({'theme':theme,'labelToggle':checked,'keyboardToggle':keyboard,'keyboardFocus':focus,'disclosureOpened':opened,'disclosureClosed':closed})
  page.close()
 browser.close()
(out/'interaction-checks.json').write_text(json.dumps(interactionchecks,indent=2))
(out/'stress-checks.json').write_text(json.dumps(stresschecks,indent=2))
(out/'craft-checks.json').write_text(json.dumps(craftchecks,indent=2))
(out/'layout-checks.json').write_text(json.dumps(checks,indent=2))
(out/'tab-checks.json').write_text(json.dumps(tabchecks,indent=2));print('Tab checks:',len(tabchecks),'failures:',[x for x in tabchecks if x['pageOverflow'] or x['workspaceOverflowX'] or (x['tab']=='transfers' and (x['searchVisible'] or x['resultsVisible'] or not x['transfersVisible'])) or (x['tab']=='soulseek' and (not x['searchVisible'] or not x['resultsVisible'] or x['transfersVisible']))]);print('Rendered',len(list(out.glob('*.png'))),'images;',len(checks),'checks')
failures=[]
for c in checks:
 if c['centerError']>1.5 or c['pageOverflow'] or c['deckOverflowX'] or not c['artFits'] or not c['quickFits'] or c['artControlGap']<0 or c['transportOverlap'] or not c['transportFits'] or not c['usableArtwork'] or c['tapHighlight']!='rgba(0, 0, 0, 0)' or c['needle'] or (c['mode']=='artwork' and (c['mask']!='none' or c['objectFit']!='contain')):
  failures.append(c);print('FAIL',c)

assert not failures, f"{len(failures)} player layout failures"
assert not any((x["tab"] in ("library","details","settings","soulseek","transfers") and x["playerVisible"]) or x["pageOverflow"] or x["workspaceOverflowX"] or (x["tab"]=="transfers" and (x["searchVisible"] or x["resultsVisible"] or not x["transfersVisible"])) or (x["tab"]=="soulseek" and (not x["searchVisible"] or not x["resultsVisible"] or x["transfersVisible"])) for x in tabchecks), "Workspace layout failure"

assert all(all(c[k]>=4.5 for k in ('primary','secondary','groupSecondary','accentButton','transport')) and all(min(t['w'],t['h'])>=44 for t in c['touchTargets']) and c['hiddenRule'] for c in craftchecks), 'Sampled contrast/target/visibility failure'
assert all(all(v for k,v in c.items() if k!='theme') for c in interactionchecks), 'Native control interaction failure'
assert all(not c['overflow'] and c['buttonsFit'] and c['buttonsSeparate'] and c['artWidth']>=100 for c in stresschecks), f'Stress check failure: {stresschecks}'
print(f'PASS {len(craftchecks)} sampled theme contrast/touch-target sets, {len(interactionchecks)} native-control interaction sets, {len(stresschecks)} large-text/long-metadata layouts')
