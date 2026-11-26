"""Cross-platform framed subprocess contract; real Windows Job Object only on Windows."""
import os,pathlib,struct,subprocess,sys,time,json
root=pathlib.Path(__file__).resolve().parents[1];helper=root/'bin/cachymusic-process.py'
if not __debug__:raise SystemExit('Assertions required')
probe=subprocess.run([sys.executable,str(helper),'--probe'],capture_output=True,timeout=5)
assert probe.returncode==0 and probe.stdout.strip()==b'CMP1',probe

def run(code,cap=1024,timeout=4,input=b''):
    return subprocess.run([sys.executable,str(helper),str(cap),str(timeout),'--',sys.executable,'-c',code],input=input,capture_output=True,timeout=timeout+3)
def frame(p):
    assert p.returncode==0 and len(p.stdout)>=16,p
    magic,status,n,m=struct.unpack('!4sIII',p.stdout[:16]);assert magic==b'CMP1' and len(p.stdout)==16+n+m
    return status,p.stdout[16:16+n],p.stdout[16+n:]
assert frame(run('import sys;sys.stdout.buffer.write(b"a"*1024);sys.stderr.buffer.write(b"b"*1024)'))==(0,b'a'*1024,b'b'*1024)
assert frame(run('import sys;sys.stdout.buffer.write(sys.stdin.buffer.read());sys.exit(7)',input=b'raw input'))==(7,b'raw input',b'')
assert frame(run('pass',cap=0))==(0,b'',b'')
for code in ('import sys;sys.stdout.buffer.write(b"x"*65536)','import sys;sys.stderr.buffer.write(b"x"*65536)'):
    p=run(code,cap=512);assert p.returncode!=0 and p.stdout==b'',p
p=run('import time;time.sleep(5)',timeout=.4);assert p.returncode!=0 and not p.stdout,p
p=run('import subprocess,sys,time;subprocess.Popen([sys.executable,"-c","import time;time.sleep(5)"]);time.sleep(5)',timeout=.4);assert p.returncode!=0 and not p.stdout,p
# PHP validates framing independently, including corrupt lengths and surplus bytes.
valid=run('import sys;print("ok",end="");sys.stderr.write("err");sys.exit(9)').stdout
for raw,expected in [(valid,{'exitcode':9,'stdout':'ok','stderr':'err'}),(valid[:-1],None),(b'XXXX'+valid[4:],None),(valid+b'x',None)]:
    code='require "php/platform.php";echo json_encode(cachy_decode_supervisor_result(["exitcode"=>0,"stdout"=>hex2bin("'+raw.hex()+'")],1024));'
    p=subprocess.run(['php','-n','-r',code],cwd=root,capture_output=True,text=True,timeout=5);assert p.returncode==0 and json.loads(p.stdout)==expected,p.stderr
print('PASS bounded process framing, input, exact dual output caps, overflow, timeout, descendant fixture, malformed frame rejection; '+('Windows Job Object exercised' if os.name=='nt' else 'POSIX protocol only, Windows Job Object unverified'))

# Pure policy contract, independent of the host OS. Missing/partial helper
# configuration never silently downgrades a required managed source launch.
def policy(values):
    env={k:v for k,v in os.environ.items() if not k.startswith('CACHYMUSIC_WINDOWS_')};env.update(values)
    return subprocess.check_output(['php','-n','-r','require "php/platform.php";echo cachy_windows_process_policy();'],cwd=root,env=env,text=True,timeout=5)
assert policy({})=='compatibility'
assert policy({'CACHYMUSIC_WINDOWS_REQUIRE_SUPERVISOR':'1'})=='deny'
assert policy({'CACHYMUSIC_WINDOWS_PYTHON':sys.executable})=='deny'
assert policy({'CACHYMUSIC_WINDOWS_PYTHON':sys.executable,'CACHYMUSIC_WINDOWS_PROCESS_HELPER':str(helper),'CACHYMUSIC_WINDOWS_REQUIRE_SUPERVISOR':'1'})=='supervised'
assert policy({'CACHYMUSIC_WINDOWS_PYTHON':sys.executable,'CACHYMUSIC_WINDOWS_PROCESS_HELPER':str(helper)+'-missing'})=='deny'
print('PASS five Windows supervisor policy cases; actual Windows launch not exercised')
