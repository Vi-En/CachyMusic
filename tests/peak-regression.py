from pathlib import Path
import subprocess,tempfile,struct,math
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as d:
    src=Path(d)/'original.f32';out=Path(d)/'limited.f32'
    subprocess.run(['node','tests/peak-regression.mjs',str(src),str(out)],cwd=root,check=True)
    def peak(path):
        raw=subprocess.check_output(['ffmpeg','-v','error','-f','f32le','-ar','48000','-ac','2','-i',str(path),'-af','aresample=192000:filter_size=64','-f','f32le','-'])
        return max(abs(v[0]) for v in struct.iter_unpack('<f',raw))
    before,after=peak(src),peak(out)
    assert before>1.0 and after<=10**(-.6/20),(before,after)
    print(f'PASS independent FFmpeg 4x estimate: input {20*math.log10(before):+.3f} dBFS, limited {20*math.log10(after):+.3f} dBFS')
