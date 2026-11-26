"""Verify exact staged source contents and produce a source-file inventory.
This is not a deployed-runtime SBOM or a license/vulnerability certification.
"""
from pathlib import Path
import argparse, hashlib, json, sys, zipfile
from source_tree import require, sha256, source_files, zip_files

root=Path(__file__).resolve().parents[1]

def inventory(checkout, archive):
    package=json.loads((checkout/'package.json').read_text())
    version=package['version'];prefix='CachyMusic-'+version
    staged=source_files(checkout);files=[]
    with zipfile.ZipFile(archive) as z:
        entries=zip_files(z,prefix)
        require(staged.keys()==entries.keys(),'Archive/staging file set mismatch; missing: '+', '.join(sorted(staged.keys()-entries.keys()))+'; extra: '+', '.join(sorted(entries.keys()-staged.keys())))
        for name,item in sorted(entries.items()):
            local=staged[name]
            require(local.stat().st_size==item.file_size,'Size mismatch: '+name)
            data=z.read(item)
            require(local.read_bytes()==data,'Content mismatch: '+name)
            files.append(dict(path=name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
    return {'version':version,'archive_sha256':sha256(archive),'scope':'source-kit file inventory only; external runtime dependencies not resolved','files':files,'declared_dependencies':package.get('dependencies',{}),'license_declared':'GPL-3.0-or-later','physical_audio_certified':False}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('archive',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    try:
        out=a.output.resolve()
        require(out!=root and root not in out.parents,'Inventory output must be outside the staging tree')
        require(out!=a.archive.resolve(),'Inventory output must not overwrite the source archive')
        report=inventory(root,a.archive)
        out.write_text(json.dumps(report,indent=2)+'\n')
    except (OSError,ValueError,zipfile.BadZipFile) as error:
        print('REJECT:',error,file=sys.stderr);return 1
    print(f'PASS {len(report["files"])} exact source files, archive CRC and required source paths')
    return 0
if __name__=='__main__':raise SystemExit(main())
