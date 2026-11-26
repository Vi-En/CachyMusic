#!/usr/bin/env python3
"""Verify release artifacts using a manifest and optional detached signature.
Never downloads keys, signs a release, installs software or trusts an embedded key.
"""
import argparse, hashlib, re, subprocess, sys
from pathlib import Path

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def verify(manifest,public_key=None,signature=None,require_signature=False):
    if require_signature and not (public_key and signature):raise ValueError('A trusted public key and detached signature are required')
    if bool(public_key)!=bool(signature):raise ValueError('Supply both public key and detached signature')
    if manifest.is_symlink() or not manifest.is_file():raise ValueError('Invalid checksum manifest')
    if public_key:
        # Public key must be obtained through an independently trusted channel.
        r=subprocess.run(['openssl','dgst','-sha256','-verify',str(public_key),'-signature',str(signature),str(manifest)],capture_output=True,text=True,timeout=20)
        if r.returncode!=0:raise ValueError('Detached signature verification failed')
    names=set();root=manifest.parent
    for line in manifest.read_text(encoding='utf-8').splitlines():
        if not line.strip():continue
        m=re.fullmatch(r'([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._~+-]{0,239})',line)
        if not m:raise ValueError('Malformed or unsafe checksum line')
        expected,name=m.groups()
        if name in names or name==manifest.name:raise ValueError('Duplicate or self-referential manifest entry')
        names.add(name);file=root/name
        if file.is_symlink() or not file.is_file():raise ValueError('Missing or aliased artifact: '+name)
        if digest(file)!=expected:raise ValueError('Artifact checksum mismatch: '+name)
    if not names:raise ValueError('Empty checksum manifest')
    return len(names),bool(public_key)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('manifest',type=Path);p.add_argument('--public-key',type=Path);p.add_argument('--signature',type=Path);p.add_argument('--require-signature',action='store_true');a=p.parse_args()
    try:count,signed=verify(a.manifest,a.public_key,a.signature,a.require_signature)
    except (OSError,ValueError,subprocess.SubprocessError) as e:print('REJECT:',e,file=sys.stderr);return 1
    print(f'PASS {count} artifact checksums; '+('detached signature verified against supplied key' if signed else 'unsigned integrity verification only; publisher authenticity not established'))
    return 0
if __name__=='__main__':raise SystemExit(main())
