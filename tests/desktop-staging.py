"""Exercise staging against the distributed tree using inert runtime fixtures."""
import tempfile, subprocess, sys, json, hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    d=Path(tmp)
    for platform,suffix in [('linux',''),('windows','.exe')]:
        base=d/platform;electron=base/'electron';runtime=base/'runtime';modules=base/'modules';notices=base/'notices';out=base/'output'
        for f in [electron/('electron'+suffix),runtime/'php'/('php'+suffix),runtime/'node'/('node'+suffix),runtime/'tools'/('ffmpeg'+suffix),runtime/'tools'/('ffprobe'+suffix),modules/'slsk-client'/'package.json',notices/'DEPENDENCIES.json']:
            f.parent.mkdir(parents=True,exist_ok=True);f.write_text('[]' if f.name=='package.json' else '[{"fixture":true}]' if f.name=='DEPENDENCIES.json' else 'inert fixture')
        if platform=='windows':
            (runtime/'python').mkdir();(runtime/'python'/'python.exe').write_text('inert supervisor runtime')
        (electron/'resources').mkdir();(notices/'LICENSES').mkdir();(notices/'LICENSES'/'fixture.txt').write_text('Inert test artifact; not a dependency approval.')
        def manifest(core=False):
            roots={'electron':electron,'runtime-core' if core else 'runtime':runtime}
            if not core:roots['node-modules']=modules
            entries=[]
            for name,tree in roots.items():
                files={f.relative_to(tree).as_posix():hashlib.sha256(f.read_bytes()).hexdigest() for f in tree.rglob('*') if f.is_file() and not (core and name=='runtime-core' and f.relative_to(tree).parts[0]=='node')}
                entries.append(dict(name=name,version='fixture',license='NOASSERTION',source='https://example.invalid/inert-fixture',tree=name,notices=['LICENSES/fixture.txt'],files=files))
            (notices/'DEPENDENCIES.json').write_text(json.dumps(entries))
        manifest()
        cmd=[sys.executable,str(root/'packaging/desktop/stage.py'),'--platform',platform,'--electron',str(electron),'--runtime',str(runtime),'--node-modules',str(modules),'--notices',str(notices),'--output',str(out)]
        bad=base/'bad';bad_cmd=cmd[:];bad_cmd[bad_cmd.index('--output')+1]=str(bad)
        (runtime/'php'/('php'+suffix)).write_text('changed input');assert subprocess.run(bad_cmd,timeout=30,capture_output=True).returncode!=0;assert not bad.exists()
        (runtime/'php'/('php'+suffix)).write_text('inert fixture')
        (notices/'extra.txt').write_text('unreviewed input');assert subprocess.run(bad_cmd,timeout=30,capture_output=True).returncode!=0;(notices/'extra.txt').unlink()
        (electron/'resources'/'app.asar').write_text('unexpected application');assert subprocess.run(bad_cmd,timeout=30,capture_output=True).returncode!=0;(electron/'resources'/'app.asar').unlink()
        subprocess.run(cmd,check=True,timeout=30,capture_output=True)
        assert (out/'resources/app/player/bin/cachymusic-process.py').read_bytes()==(root/'bin/cachymusic-process.py').read_bytes()
        if platform=='windows':assert (out/'resources/cachymusic-runtime/python/python.exe').is_file()
        assert (out/'README.md').read_bytes()==(root/'README.md').read_bytes()
        assert (out/'THIRD-PARTY-NOTICES.md').read_bytes()==(root/'THIRD-PARTY-NOTICES.md').read_bytes()
        assert not (out/'DEVELOPMENT.md').exists()
        assert (out/'resources/app/player/scripts/dsp-worklet-processor.js').read_bytes()==(root/'scripts/dsp-worklet-processor.js').read_bytes()
        assert subprocess.run(cmd,timeout=30,capture_output=True).returncode!=0
        core=base/'core';core_cmd=cmd[:];idx=core_cmd.index('--node-modules');del core_cmd[idx:idx+2];core_cmd[core_cmd.index('--output')+1]=str(core);core_cmd.append('--core-only')
        manifest(True);subprocess.run(core_cmd,check=True,timeout=30,capture_output=True)
        assert not (core/'resources/app/player/node_modules').exists()
        assert not (core/'resources/cachymusic-runtime/node').exists()
print('PASS Linux/Windows portable staging layout, public documentation, changed runtime rejection and overwrite refusal (inert inputs)')
