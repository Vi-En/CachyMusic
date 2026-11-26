#!/usr/bin/env python3
"""Audit an externally resolved, public-registry npm lock without installing code.
This checks the reviewed lock, not the provenance of a separately supplied binary.
"""
import argparse, base64, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]


def validate_lock(package, lock):
    if lock.get('lockfileVersion') not in (2,3):raise ValueError('Lockfile v2/v3 required')
    packages=lock.get('packages')
    if not isinstance(packages,dict) or not isinstance(packages.get(''),dict):raise ValueError('Missing root package record')
    root=packages['']
    for k in ('name','version','dependencies'):
        if root.get(k)!=package.get(k):raise ValueError('Lock root does not match package.json: '+k)
    for name,version in package.get('dependencies',{}).items():
        if packages.get('node_modules/'+name,{}).get('version')!=version:raise ValueError('Direct dependency version mismatch: '+name)
    count=0
    # Each non-optional dependency declared in the lock must resolve to a
    # package entry through Node's nested node_modules ancestry. The lock
    # itself is not a proof that declarations match the published tarballs.
    def resolve_dependency(owner, name):
        if not re.fullmatch(r'(?:@[a-zA-Z0-9._-]+/)?[a-zA-Z0-9._-]+', name) or any(part in ('.','..') for part in name.split('/')):
            raise ValueError('Malformed dependency name')
        current=owner
        while True:
            candidate=(current+'/' if current else '')+'node_modules/'+name
            if candidate in packages:return True
            if not current:return False
            current=current.rsplit('/node_modules/',1)[0] if '/node_modules/' in current else ''
    for owner,entry in packages.items():
        if not isinstance(entry,dict):raise ValueError('Malformed dependency record')
        for key in ('dependencies','optionalDependencies','peerDependencies','peerDependenciesMeta'):
            if not isinstance(entry.get(key,{}),dict):raise ValueError('Malformed dependency declarations')
        optional=entry.get('optionalDependencies',{})
        for name,spec in entry.get('dependencies',{}).items():
            if not isinstance(spec,str) or not spec:raise ValueError('Malformed dependency specification')
            if name not in optional and not resolve_dependency(owner,name):raise ValueError('Missing mandatory dependency: '+name)
        for name,spec in entry.get('peerDependencies',{}).items():
            if not isinstance(spec,str) or not spec:raise ValueError('Malformed peer specification')
            meta=entry.get('peerDependenciesMeta',{}).get(name,{})
            if not isinstance(meta,dict):raise ValueError('Malformed peer metadata')
            if not meta.get('optional',False) and not resolve_dependency(owner,name):raise ValueError('Missing mandatory peer: '+name)
    for name,entry in packages.items():
        if name=='':continue
        if not isinstance(entry,dict) or not name.startswith('node_modules/') or '\\' in name or any(part in ('','.','..') for part in name.split('/')) or entry.get('link') or not entry.get('version'):
            raise ValueError('Non-registry or malformed package record')
        u=urlsplit(str(entry.get('resolved','')))
        if u.scheme!='https' or u.netloc!='registry.npmjs.org' or u.query or u.fragment or not u.path.endswith('.tgz'):
            raise ValueError('Non-public-registry resolution')
        integrity=entry.get('integrity','')
        if not isinstance(integrity,str) or not integrity.startswith('sha512-'):
            raise ValueError('Missing SHA-512 package integrity')
        try:raw=base64.b64decode(integrity[7:],validate=True)
        except Exception as ex:raise ValueError('Invalid package integrity') from ex
        if len(raw)!=64:raise ValueError('Invalid package integrity length')
        count+=1
    if not count:raise ValueError('Empty dependency tree')
    return count


def validate_report(result):
    if not isinstance(result,dict) or result.get('auditReportVersion') != 2:raise ValueError('Unsupported vulnerability report')
    metadata=result.get('metadata',{});counts=metadata.get('vulnerabilities',{}) if isinstance(metadata,dict) else {}
    advisories=result.get('vulnerabilities')
    levels=('info','low','moderate','high','critical')
    if not isinstance(counts,dict) or not isinstance(advisories,dict) or any(type(counts.get(k)) is not int or counts[k]<0 for k in (*levels,'total')):raise ValueError('Incomplete vulnerability report')
    actual={k:0 for k in levels}
    for entry in advisories.values():
        level=entry.get('severity') if isinstance(entry,dict) else None
        if level not in actual:raise ValueError('Invalid vulnerability severity')
        actual[level]+=1
    if any(counts[k]!=actual[k] for k in levels) or counts['total']!=len(advisories):raise ValueError('Inconsistent vulnerability totals')
    return counts


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('lockfile',type=Path);a=p.parse_args()
    try:
        package=json.loads((ROOT/'package.json').read_text());lock=json.loads(a.lockfile.read_text())
        print('Validated public-registry lock entries:',validate_lock(package,lock),flush=True)
    except (OSError,ValueError,TypeError) as e:print('Dependency lock rejected:',e);return 1
    npm=shutil.which('npm')
    if not npm:print('BLOCKED_DEPENDENCY_AUDIT: npm unavailable');return 2
    with tempfile.TemporaryDirectory(prefix='cachy-dependency-audit-') as temp:
        d=Path(temp);(d/'package.json').write_text(json.dumps(package));(d/'package-lock.json').write_text(json.dumps(lock));(d/'user.npmrc').touch();(d/'global.npmrc').touch()
        # Do not inherit private npm registries, tokens or user config.
        env={k:v for k,v in os.environ.items() if not k.lower().startswith(('npm_config_','npm_token','node_auth_token'))}
        env['NPM_CONFIG_USERCONFIG']=str(d/'user.npmrc');env['NPM_CONFIG_GLOBALCONFIG']=str(d/'global.npmrc');env['NPM_CONFIG_CACHE']=str(d/'cache')
        try:r=subprocess.run([npm,'audit','--package-lock-only','--omit=dev','--audit-level=high','--json','--ignore-scripts','--registry=https://registry.npmjs.org','--fetch-retries=0','--fetch-timeout=15000'],cwd=d,env=env,capture_output=True,text=True,timeout=60)
        except subprocess.TimeoutExpired:print('BLOCKED_DEPENDENCY_AUDIT: registry deadline');return 2
        try:result=json.loads(r.stdout)
        except ValueError:print('Dependency audit returned no valid JSON');return 1
        if not isinstance(result,dict):print('Invalid vulnerability report');return 1
        if result.get('error'):
            error=result['error'];code=str(error.get('code','')) if isinstance(error,dict) else ''
            if code in {'EAI_AGAIN','ENOTFOUND','ECONNREFUSED','ETIMEDOUT','ECONNRESET','E503','E502','E504'}:print('BLOCKED_DEPENDENCY_AUDIT:',code);return 2
            print('Dependency audit service error:',code or 'unknown');return 1
        try:severity=validate_report(result)
        except ValueError as e:print('Dependency audit rejected:',e);return 1
        print(json.dumps(result,indent=2))
        return 0 if r.returncode==0 and severity['high']==0 and severity['critical']==0 else 1
if __name__=='__main__':raise SystemExit(main())
