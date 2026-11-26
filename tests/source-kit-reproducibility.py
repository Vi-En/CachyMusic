"""Two exact builds and no-overwrite qualification."""
import pathlib,tempfile,subprocess,sys,hashlib
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    d=pathlib.Path(tmp);a=d/'a.zip';b=d/'b.zip';cmd=[sys.executable,str(root/'tools/build-source-kit.py')]
    subprocess.run(cmd+[str(a)],check=True,timeout=40);subprocess.run(cmd+[str(b)],check=True,timeout=40)
    assert a.read_bytes()==b.read_bytes()
    prior=hashlib.sha256(a.read_bytes()).hexdigest();r=subprocess.run(cmd+[str(a)],capture_output=True,timeout=40);assert r.returncode!=0 and hashlib.sha256(a.read_bytes()).hexdigest()==prior
print('PASS reproducible exact source ZIP and no-overwrite publication')
