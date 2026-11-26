from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[1]
def run(*args):return subprocess.check_output(args,cwd=root,text=True,stderr=subprocess.STDOUT)
with tempfile.TemporaryDirectory() as d:
    for ext,codec,bits in [('wav','pcm_s16le',16),('wav','pcm_s24le',24),('wav','pcm_f32le',32),('aiff','pcm_s24be',24)]:
        path=Path(d)/(codec+'.'+ext);ref=Path(d)/(codec+'.f32')
        run('ffmpeg','-v','error','-f','lavfi','-i','aevalsrc=0.7*sin(2*PI*440*t)|0.3*sin(2*PI*997*t):s=44100:d=1','-c:a',codec,str(path));run('ffmpeg','-v','error','-i',str(path),'-f','f32le',str(ref))
        print(run('node','--experimental-default-type=module','tests/pcm-regression.mjs',str(path),str(bits),str(ref)).strip())
