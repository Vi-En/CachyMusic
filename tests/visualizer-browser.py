"""Execute the real renderer modules in Chromium with deterministic sample bands.
The app shell is static; this is not a live audio or native-device test.
"""
from pathlib import Path
import argparse, base64, functools, json, re
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
MODULES = ROOT / 'scripts/modules'
THEMES = ['default','carbon-signal','paper-sonata','blue-note-console','copper-reel','orchid-matrix','nms','solar-eclipse','euclid-horizon','alien-paradise','abyssal-void','dissonance','sentinel','minimalist-light','minimalist-dark','minimalist-warm','minimalist-obsidian']

@functools.lru_cache(None)
def module_url(path):
    """Embed unchanged module bodies, replacing only relative import addresses.
    Allows the fixture to run without a network origin or extra build dependencies.
    """
    path = Path(path)
    source = path.read_text()
    def resolve(match):
        return match[1] + repr(module_url((path.parent / match[3]).resolve()))
    source = re.sub(r'((?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+))([\'\"])(\.[^\'\"]+)\2', resolve, source)
    return 'data:text/javascript;base64,' + base64.b64encode(source.encode()).decode()

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--output', type=Path,default=Path('visualizer-browser-results')); parser.add_argument('--chromium',default='/usr/bin/chromium'); args=parser.parse_args(); args.output.mkdir(parents=True,exist_ok=True)
    shell=BeautifulSoup((ROOT/'index.html').read_text(),'html.parser')
    for tag in shell.select('script,link,meta[http-equiv],img'): tag.decompose()
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True, executable_path=args.chromium,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1200,'height':900}); page.set_content(str(shell),wait_until='load')
        # Registry exercises the actual dynamic-import mapping. Existing state and UI helpers are imported too.
        modules={name:module_url((MODULES/name).resolve()) for name in ['theme-catalog.js','state.js','visualizers/registry.js','visualizers/themed-wave.js','visualizers/segmented-bars.js','visualizers/liquid-wave.js']}
        page.evaluate('''async urls=>{window.fixture={}; for(const [name,url] of Object.entries(urls))window.fixture[name]=await import(url); }''',modules)
        results=[]
        for theme in THEMES:
            data=page.evaluate('''async theme=>{
                document.documentElement.dataset.theme=theme;
                const st=fixture['state.js'].store.state;
                const core=await fixture['visualizers/registry.js'].loadCore(theme);
                const name=fixture['theme-catalog.js'].THEMES[theme].name;
                const c=document.createElement('canvas'), dock=document.createElement('canvas');
                c.width=c.height=320;dock.width=400;dock.height=110;
                const ctx=c.getContext('2d'), d=dock.getContext('2d');
                const bands=Float32Array.from({length:60},(_,i)=>.2+.65*Math.abs(Math.sin(i*.19)));
                let total=0, frameCount=0;
                function tracked(context){let depth=0;const save=context.save.bind(context), restore=context.restore.bind(context);context.save=()=>{depth++;save()};context.restore=()=>{depth--;restore()};return ()=>depth;}
                const depth=tracked(ctx),dockDepth=tracked(d);
                const snapshots=[];
                for(const size of [120,220,320,420]){
                    c.width=c.height=size;
                    for(const playing of [false,true]){
                        st.turntableShockwaves.length=0;st.shockwaveRings.length=0;
                        for(let i=0;i<6;i++){
                            ctx.clearRect(0,0,size,size);
                            const t=performance.now();
                            core.drawCore(ctx,size,size,playing,1000+i*33,1/30,playing?.55:0,playing?.35:0,playing?.6:0,playing?.45:0,playing?.4:0,1,bands);
                            total+=performance.now()-t;frameCount++;
                            if(depth()!==0) throw Error(theme+' unbalanced core canvas: '+depth());
                        }
                        if(size===320){snapshots.push(c.toDataURL());}
                    }
                }
                for (const width of [180,320,640]){
                    dock.width=width;dock.height=110;
                    for(let i=0;i<3;i++){
                        const args=[d,width,110,bands,true,1000+i*33,1/30,.55,.35,.6,.45,.4];
                        fixture['visualizers/themed-wave.js'].drawThematicWave(...args,core.drawDockScene);
                        if(dockDepth()!==0)throw Error(theme+' themed wave canvas stack '+dockDepth());
                        fixture['visualizers/liquid-wave.js'].drawSolidWave(...args);
                        if(dockDepth()!==0)throw Error(theme+' liquid wave canvas stack '+dockDepth());
                        fixture['visualizers/segmented-bars.js'].drawVerticalDash(d,width,110,bands,true,1/30,.55,.35,.6,.45,.4);
                        if(dockDepth()!==0)throw Error(theme+' segmented bars canvas stack '+dockDepth());
                    }
                }
                return {theme,name,frames:frameCount,meanCpuMs:total/frameCount,idle:snapshots[0],playing:snapshots[1],reacts:snapshots[0]!==snapshots[1]};
            }''',theme)
            for key in ('idle','playing'):
                (args.output/f'{theme}-{key}.png').write_bytes(base64.b64decode(data.pop(key).split(',')[1]))
            assert data['reacts'],data
            results.append(data); print('PASS',data,flush=True)
        browser.close()
    (args.output/'renderer-checks.json').write_text(json.dumps(results,indent=2))
    print(f'PASS {len(results)} themes, {sum(r["frames"] for r in results)} core frames, 324 dock draws; balanced Canvas save/restore and changing pixels')
if __name__=='__main__':main()

# Lightweight fixture import map. Encode each module exactly once rather than
# recursively embedding its complete transitive dependency tree into every import.
# No server, origin permissions, or security settings are changed.
def install_module_map(page, names):
    pattern = re.compile(r'((?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+))([\'\"])(\.[^\'\"]+)\2')
    modules = {}
    def visit(path):
        path = path.resolve()
        key = 'fixture/' + path.relative_to(MODULES).as_posix()
        if key in modules: return key
        modules[key] = None
        source = pattern.sub(lambda m: m[1]+repr(visit(path.parent/m[3])), path.read_text())
        modules[key] = 'data:text/javascript;base64,' + base64.b64encode(source.encode()).decode()
        return key
    roots = {name:visit(MODULES/name) for name in names}
    page.add_script_tag(type='importmap',content=json.dumps({'imports':modules}))
    return roots
