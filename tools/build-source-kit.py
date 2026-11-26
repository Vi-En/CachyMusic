#!/usr/bin/env python3
"""Build a deterministic, policy-checked source ZIP from a clean checkout.
Reproducible within the same Python/zlib implementation; no runtime or user data.
"""
import argparse, json, sys, zipfile, stat, tempfile, os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'tests'))
from source_tree import source_files, zip_files, require, sha256
# Normalize known executable entry points, not incidental checkout modes.
EXECUTABLES=frozenset('''bin/cachymusic bin/cachymusic-tray.py bin/cachymusic-mac.command bin/cachymusic-mpris.py bin/desktop-launcher.py packaging/desktop/stage.py packaging/appimage/build-appimage.sh packaging/aur/prepare-source.sh packaging/debian/build-deb.sh install.sh tools/release-verify.py tools/packager/build-apk-local.sh tools/packager/package-mobile.sh tools/setup-nicotine.sh uninstall.sh'''.split())
def build(root, output):
    require(not output.is_symlink(),'Aliased output path')
    output=output.resolve();require(root!=output and root not in output.parents,'Output must be outside the checkout')
    files=source_files(root);version=json.loads((root/'package.json').read_text())['version']
    import re
    require(isinstance(version,str) and re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?',version),'Unsafe version')
    prefix='CachyMusic-'+version
    require(EXECUTABLES<=files.keys(),'Executable manifest incomplete')
    with tempfile.NamedTemporaryFile(dir=output.parent,prefix='.source-kit-',delete=False) as tmp:stage=Path(tmp.name)
    try:
        with zipfile.ZipFile(stage,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
            for name,path in sorted(files.items()):
                info=zipfile.ZipInfo(prefix+'/'+name,(1980,1,1,0,0,0));info.create_system=3
                info.external_attr=(stat.S_IFREG|(0o755 if name in EXECUTABLES else 0o644))<<16
                z.writestr(info,path.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
        with zipfile.ZipFile(stage) as z:
            entries=zip_files(z,prefix);require(entries.keys()==files.keys(),'Archive inventory mismatch')
            for name,item in entries.items():require(z.read(item)==files[name].read_bytes(),'Source changed during packaging: '+name)
        require(not output.exists() and not output.is_symlink(),'Refusing to overwrite an existing artifact')
        # Hard-link publication is atomic and never overwrites another artifact.
        os.link(stage,output)
        return len(files),sha256(output)
    finally:stage.unlink(missing_ok=True)
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output',type=Path);a=p.parse_args()
    try:count,digest=build(ROOT,a.output)
    except (OSError,ValueError,zipfile.BadZipFile) as e:print('REJECT:',e,file=sys.stderr);return 1
    print(f'PASS {count} normalized source files; SHA-256 {digest}');return 0
if __name__=='__main__':raise SystemExit(main())
