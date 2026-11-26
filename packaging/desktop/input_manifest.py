"""Verify reviewed, complete portable runtime inputs before copying them.
No network, execution of supplied binaries, or claim of license approval.
"""
from pathlib import Path, PurePosixPath
import hashlib, re
from urllib.parse import urlsplit

def sha256(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()

def enumerate_files(root):
    if root.is_symlink() or not root.is_dir():raise ValueError('Runtime input root must be a real directory')
    result={}
    for path in root.rglob('*'):
        rel=path.relative_to(root).as_posix()
        if path.is_symlink():raise ValueError('Runtime input symlinks must be resolved in the reviewed staging tree: '+rel)
        if path.is_dir():continue
        if not path.is_file():raise ValueError('Special runtime file: '+rel)
        result[rel]=sha256(path)
    return result

def verify_inputs(manifest, roots, notices):
    if not isinstance(manifest,list) or not manifest:raise ValueError('Dependency manifest must be a nonempty list')
    expected={name:{} for name in roots}
    identities=set();reviewed_notices=set()
    for entry in manifest:
        if not isinstance(entry,dict):raise ValueError('Malformed component entry')
        for field in ('name','version','license','source','tree'):
            if not isinstance(entry.get(field),str) or not entry[field].strip():raise ValueError('Missing component '+field)
        ident=(entry['name'],entry['version'],entry['tree'])
        if ident in identities:raise ValueError('Duplicate component identity')
        identities.add(ident)
        url=urlsplit(entry['source'])
        if url.scheme!='https' or not url.hostname or url.username or url.password or url.query or url.fragment:raise ValueError('Provide public HTTPS provenance URL without secrets')
        if entry['tree'] not in roots:raise ValueError('Unknown or omitted runtime tree')
        licenses=entry.get('notices');files=entry.get('files')
        if not isinstance(licenses,list) or not licenses or not isinstance(files,dict) or not files:raise ValueError('Component needs reviewed notices and files')
        for rel in licenses:
            if not isinstance(rel,str):raise ValueError('Invalid notice path')
            p=PurePosixPath(rel)
            if p.is_absolute() or '..' in p.parts or '\\' in rel or p.parts[:1]!=('LICENSES',):raise ValueError('Invalid notice path')
            reviewed_notices.add(rel)
            notice=notices/rel
            if not notice.is_file() or notice.is_symlink() or not notice.resolve().is_relative_to(notices.resolve()) or notice.stat().st_size==0:raise ValueError('Missing notice '+rel)
        tree=expected[entry['tree']]
        for rel,digest in files.items():
            if not isinstance(rel,str) or not isinstance(digest,str) or not re.fullmatch('[a-f0-9]{64}',digest):raise ValueError('Invalid file digest')
            p=PurePosixPath(rel)
            if p.is_absolute() or '..' in p.parts or '\\' in rel or p.as_posix()!=rel or rel in tree:raise ValueError('Invalid or duplicate runtime path')
            tree[rel]=digest
    if set(enumerate_files(notices)) != reviewed_notices | {"DEPENDENCIES.json"}:raise ValueError("Unreviewed or missing notice file")
    for name,root in roots.items():
        actual=enumerate_files(root)
        # Core-only builds omit the entire optional Node subtree.
        if name=='runtime-core':actual={k:v for k,v in actual.items() if not k.startswith('node/')}
        if expected[name]!=actual:
            missing=set(expected[name])-set(actual);extra=set(actual)-set(expected[name]);changed={k for k in expected[name].keys()&actual.keys() if expected[name][k]!=actual[k]}
            raise ValueError(f'Runtime manifest mismatch in {name}: {len(missing)} missing, {len(extra)} unlisted, {len(changed)} changed')
    return sum(map(len,expected.values()))
