from pathlib import Path
import subprocess,tempfile,struct,json
root=Path(__file__).resolve().parents[1]
def run(*args):return subprocess.check_output(args,cwd=root,stderr=subprocess.STDOUT)
def media(data):
    p=0;out=[]
    while p<len(data):
        n,t=struct.unpack_from('>I4s',data,p);assert n>=8 and p+n<=len(data)
        if t==b'mdat':out.append((p,data[p:p+n]))
        p+=n
    return out
with tempfile.TemporaryDirectory() as tmp:
    d=Path(tmp);pic=root/'resources/images/icon-192.png'
    for codec,fast in [('aac',False),('alac',True)]:
        src=d/('source-'+codec+'.m4a');browser=d/('browser-'+codec+'.m4a');desktop=d/('desktop-'+codec+'.m4a')
        run('ffmpeg','-v','error','-f','lavfi','-i','anoisesrc=duration=35:sample_rate=48000','-c:a',codec,'-metadata','album=Keep Album',*(['-movflags','+faststart'] if fast else []),str(src));original=src.read_bytes();desktop.write_bytes(original)
        try:run('node','tests/mp4-tags.mjs',str(src),str(browser),str(pic))
        except subprocess.CalledProcessError as e:print(e.output.decode());raise
        code='require "php/platform.php";require "php/flac_metadata.php";require "php/packet_metadata.php";exit(cm_packet_rewrite($argv[1],["title"=>"新曲","artist"=>"Test Artist","lyrics"=>"[00:01.00] A line","track_num"=>"3/12"],file_get_contents($argv[2]),["mime"=>"image/png",192,192])?0:1);'
        run('php','-r',code,str(desktop),str(pic))
        reference=run('ffmpeg','-v','error','-i',str(src),'-map','0:a:0','-f','s32le','-')
        for path in [browser,desktop]:
            assert media(path.read_bytes())==media(original)
            assert run('ffmpeg','-v','error','-i',str(path),'-map','0:a:0','-f','s32le','-')==reference
            probe=json.loads(run('ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)));tags=probe['format']['tags'];assert tags['title']=='新曲' and tags['album']=='Keep Album' and tags['lyrics']=='[00:01.00] A line',tags
            assert tags['track']=='3/12' and any(s.get('disposition',{}).get('attached_pic') for s in probe['streams']),probe
        bad=d/'bad.m4a';bad.write_bytes(original[:-5]);assert subprocess.run(['php','-r',code,str(bad),str(pic)],cwd=root).returncode!=0;assert bad.read_bytes()==original[:-5]
        print(f'PASS {codec} M4A (faststart={fast}): mdat bytes and offsets unchanged, identical PCM, Unicode/lyrics/cover/track number, failed write preserves original')
