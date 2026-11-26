"""Counterexamples for false qualification: no real user data or signing keys."""
import importlib.util, json, os, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path
from source_tree import source_files, fingerprint, sha256
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('release_inventory',root/'tests/release-inventory.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
version=json.loads((root/'package.json').read_text())['version'];prefix='CachyMusic-'+version
with tempfile.TemporaryDirectory() as tmp:
    d=Path(tmp);stage=d/'stage';stage.mkdir()
    for name,path in source_files(root).items():
        target=stage/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
    archive=d/'test.zip'
    def write(omit=(),extra=(),replace=None):
        with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
            for name,path in source_files(stage).items():
                if name not in omit:z.writestr(prefix+'/'+name,replace[1] if replace and name==replace[0] else path.read_bytes())
            for name,content in extra:z.writestr(prefix+'/'+name,content)
    def reject():
        try:mod.inventory(stage,archive)
        except ValueError:return
        raise RuntimeError('Invalid inventory accepted')
    alias=stage/'scripts'/'hard-alias.js';os.link(stage/'schema.sql',alias)
    try:
        try:source_files(stage)
        except ValueError:pass
        else:raise AssertionError('Hard-linked source accepted')
    finally:alias.unlink()
    write();assert len(mod.inventory(stage,archive)['files'])==len(source_files(stage))
    for missing in ('schema.sql','install.sh','.gitignore','tools/setup-nicotine.sh','php/scan_worker.php'):
        write(omit=(missing,));reject()
    for alias in ('scripts//alias.js','scripts/./alias.js','scripts/../alias.js','scripts/CON.js','scripts/.env.local','scripts/AGENTS.md','scripts/a:stream.js','scripts/alias.js ','private.txt','tools/packager/android/app/src/main/assets/private.js'):
        write(extra=((alias,b'fixture'),));reject()
    write(extra=(('scripts/Case/a.js',b'x'),('scripts/case/b.js',b'y')));reject()
    write(replace=('schema.sql',b'changed'));reject()
    before=fingerprint(stage);target=stage/'tools/setup-nicotine.sh';target.write_bytes(target.read_bytes()+b'\n');assert fingerprint(stage)!=before
    # Optimization must not bypass CLI validation, independently of test asserts.
    with zipfile.ZipFile(archive,'w'):pass
    r=subprocess.run([sys.executable,'-O',str(root/'tests/release-inventory.py'),str(archive),'--output',str(d/'empty.json')],capture_output=True,text=True)
    assert r.returncode!=0 and not (d/'empty.json').exists(),r.stdout
    r=subprocess.run([sys.executable,'-O',str(root/'tests/beta-acceptance.py'),'--output',str(d/'optimized')],capture_output=True,text=True)
    assert r.returncode!=0 and 'optimization' in r.stderr
    r=subprocess.run([sys.executable,str(root/'tests/upgrade-rollback.py'),str(archive),'--sha256','0'*64],capture_output=True,text=True)
    assert r.returncode!=0 and 'SHA-256 mismatch' in r.stderr
print('PASS exact source set, 5 omissions, 10 unsafe paths, case-colliding parents, modified bytes, complete fingerprint, optimization and prior identity rejection')
