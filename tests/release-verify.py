"""Test release verification using only disposable synthetic artifacts and keys."""
import importlib.util, tempfile, subprocess, shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('release_verify',root/'tools/release-verify.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
with tempfile.TemporaryDirectory(prefix='cachy-verify-') as tmp:
    d=Path(tmp);f=d/'test.zip';f.write_bytes(b'fixture');manifest=d/'SHA256SUMS.txt';original=mod.digest(f)+'  test.zip\n';manifest.write_text(original)
    assert mod.verify(manifest)==(1,False)
    def reject(**kw):
        try:mod.verify(manifest,**kw);raise AssertionError('Invalid release accepted')
        except ValueError:pass
    reject(require_signature=True)
    for text in [original*2,original.replace('test.zip','../test.zip'),'',original.replace('test.zip','missing.zip')]:manifest.write_text(text);reject()
    manifest.write_text(original);f.write_bytes(b'changed');reject();f.write_bytes(b'fixture')
    if shutil.which('openssl'):
        private=d/'ephemeral-test-private.pem';public=d/'test-public.pem';signature=d/'manifest.sig'
        subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(private)],check=True,capture_output=True,timeout=30)
        subprocess.run(['openssl','pkey','-in',str(private),'-pubout','-out',str(public)],check=True,capture_output=True,timeout=20)
        subprocess.run(['openssl','dgst','-sha256','-sign',str(private),'-out',str(signature),str(manifest)],check=True,capture_output=True,timeout=20)
        assert mod.verify(manifest,public,signature,True)==(1,True)
        manifest.write_text(original+'\n');reject(public_key=public,signature=signature,require_signature=True)
        print('PASS synthetic signed manifest, altered signature input, artifact mutation and required-signature gate')
    else:print('PASS unsigned integrity checks; optional signature fixture blocked (OpenSSL unavailable)')
