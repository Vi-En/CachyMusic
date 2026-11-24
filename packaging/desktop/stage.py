#!/usr/bin/env python3
"""Build-time only: stage audited native distributions into a portable desktop folder.
Never downloads artifacts. Build machine must supply matching platform/arch binaries and notices.
"""
import argparse, json, shutil, sys
from pathlib import Path
p=argparse.ArgumentParser(); p.add_argument('--electron',type=Path,required=True);p.add_argument('--runtime',type=Path,required=True);p.add_argument('--node-modules',type=Path,required=True);p.add_argument('--notices',type=Path,required=True);p.add_argument('--platform',choices=['linux','windows'],required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];suffix='.exe' if a.platform=='windows' else ''
required=[a.electron/('electron'+suffix),a.electron/'resources',a.runtime/'php'/('php'+suffix),a.runtime/'node'/('node'+suffix),a.runtime/'tools'/('ffmpeg'+suffix),a.runtime/'tools'/('ffprobe'+suffix),a.node_modules/'slsk-client'/'package.json',a.notices/'DEPENDENCIES.json',a.notices/'LICENSES']
missing=[str(x) for x in required if not x.exists()];
if missing:sys.exit('Missing audited build inputs:\n'+'\n'.join(missing))
if a.output.exists():sys.exit('Output already exists; refusing to overwrite')
# All externally supplied runtime, codec and module versions must be captured in a reviewed manifest.
manifest=json.loads((a.notices/'DEPENDENCIES.json').read_text());
if not isinstance(manifest,list) or not manifest:sys.exit('Supply an actual dependency/provenance manifest')
shutil.copytree(a.electron,a.output,symlinks=True);resources=a.output/'resources';app=resources/'app';app.mkdir();player=app/'player';player.mkdir()
for f in ['main.cjs','package.json']:shutil.copy2(root/'packaging'/'desktop'/f, app/f)
for f in ['index.html','index.php','sw.js','manifest.json','schema.sql','LICENSE','package.json']:shutil.copy2(root/f,player/f)
for name in ['php','scripts','stylesheets','resources','server']:
 shutil.copytree(root/name,player/name,ignore=shutil.ignore_patterns('soulseek-config.json','soulseek-transfers.json','audio','*.log','node_modules'))
shutil.copytree(a.node_modules,player/'node_modules',symlinks=True);shutil.copytree(a.runtime,resources/'cachymusic-runtime',symlinks=True);shutil.copytree(a.notices,resources/'third-party-notices');
for f in [root/'README.md',root/'LICENSE'] : shutil.copy2(f,a.output/f.name)
print('Staged portable '+a.platform+' application at '+str(a.output));print('Run '+str(a.output/('electron'+suffix))+'; packaging is not a verified release until the clean-install tests pass.')
