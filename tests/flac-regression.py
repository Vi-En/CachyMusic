from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[1]
def run(*args):return subprocess.check_output(args,cwd=root,text=True,stderr=subprocess.STDOUT)
with tempfile.TemporaryDirectory() as d:
    for name,signal,fmt,rate,opts in [
        ('s16-stereo','0.7*sin(2*PI*440*t)|0.3*sin(2*PI*997*t)','s16',44100,['-compression_level','5']),
        ('s24-stereo','0.95*sin(2*PI*550*t)|0.94*sin(2*PI*550*t)','s32',96000,['-compression_level','12']),
        ('mono','0.1*sin(2*PI*123*t)','s16',48000,['-compression_level','0']),
        ('silence','0|0','s16',44100,['-compression_level','5']),
        ('noise','random(0)*0.9|random(1)*0.9','s32',48000,['-compression_level','8'])]:
        path=Path(d)/(name+'.flac');ref=Path(d)/(name+'.f32')
        run('ffmpeg','-v','error','-f','lavfi','-i',f'aevalsrc={signal}:s={rate}:d=2','-c:a','flac','-sample_fmt',fmt,*opts,str(path));run('ffmpeg','-v','error','-i',str(path),'-f','f32le',str(ref))
        print(run('node','--experimental-default-type=module','tests/flac-regression.mjs',str(path),str(ref)).strip())
    # STREAMINFO with unknown maximum frame size is legal; exercise >1 MiB rolling reads.
    path=Path(d)/'long.flac';ref=Path(d)/'long.f32'
    run('ffmpeg','-v','error','-f','lavfi','-i','aevalsrc=random(0)*0.9|random(1)*0.9:s=48000:d=10','-c:a','flac','-sample_fmt','s32',str(path))
    data=bytearray(path.read_bytes()); assert len(data)>1048576; data[15:18]=b'\0\0\0'; path.write_bytes(data)
    run('ffmpeg','-v','error','-i',str(path),'-f','f32le',str(ref))
    print(run('node','--experimental-default-type=module','tests/flac-regression.mjs',str(path),str(ref)).strip())

    # libFLAC 1.4+ supports true 32-bit streams (FFmpeg's FLAC encoder often chooses 24-bit).
    # Use raw signed 32-bit PCM, including an anti-correlated stereo channel that needs 33-bit side data.
    import struct,math
    raw=Path(d)/'32bit.raw';path=Path(d)/'32bit.flac';ref=Path(d)/'32bit.f32'
    with raw.open('wb') as f:
        for i in range(96000):
            x=round(2147483647*math.sin(i*0.071));f.write(struct.pack('<ii',x,-x))
    run('flac','--silent','--force-raw-format','--endian=little','--sign=signed','--channels=2','--bps=32','--sample-rate=48000','-8','-o',str(path),str(raw))
    run('ffmpeg','-v','error','-i',str(path),'-f','f32le',str(ref))
    print(run('node','--experimental-default-type=module','tests/flac-regression.mjs',str(path),str(ref)).strip())
