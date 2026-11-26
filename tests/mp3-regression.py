from pathlib import Path
import tempfile, subprocess, json
root=Path(__file__).resolve().parents[1]
def run(*cmd):return subprocess.check_output(cmd,cwd=root,text=True,stderr=subprocess.STDOUT)
with tempfile.TemporaryDirectory() as tmp:
    for v in [3,4]:
        src=Path(tmp)/f'original-{v}.mp3';dst=Path(tmp)/f'new-{v}.mp3'
        run('ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:duration=2','-c:a','libmp3lame','-id3v2_version',str(v),'-metadata','title=Original','-metadata','CUSTOM=preserve',str(src))
        print(run('node','--experimental-default-type=module','tests/mp3-regression.mjs',str(src),str(dst),str(v)).strip())
        tags=json.loads(run('ffprobe','-v','error','-show_entries','format_tags','-of','json',str(dst)))['format']['tags'];tags={k.lower():v for k,v in tags.items()}
        assert tags['title']=='Revised title' and tags['artist']=='改 Artist' and tags['custom']=='preserve',tags
        assert '[00:01.00] example' in tags.values(),tags
        run('ffmpeg','-v','error','-i',str(dst),'-f','null','-')
        native=Path(tmp)/f'native-{v}.mp3';native.write_bytes(src.read_bytes())
        run('php','-r','require "php/mp3_metadata.php"; if(!cm_mp3_rewrite($argv[1],["title"=>"Revised title","artist"=>"改 Artist","lyrics"=>"[00:01.00] example"])) exit(1);',str(native))
        def payload(path):
            b=path.read_bytes();size=0
            for x in b[6:10]:size=(size<<7)|x
            return b[10+size:]
        assert payload(src)==payload(native)
        ntags=json.loads(run('ffprobe','-v','error','-show_entries','format_tags','-of','json',str(native)))['format']['tags'];ntags={k.lower():v for k,v in ntags.items()}
        assert ntags['title']=='Revised title' and ntags['artist']=='改 Artist' and ntags['custom']=='preserve' and '[00:01.00] example' in ntags.values(),ntags
        run('ffmpeg','-v','error','-i',str(native),'-f','null','-')
        print(f'PASS PHP atomic ID3v2.{v} rewrite preserves encoded payload and unrelated tags')
    bad=Path(tmp)/'bad.mp3';bad.write_bytes(b'ID3'+bytes([3,0,0])+bytes([127])*4+b'bad');old=bad.read_bytes()
    run('php','-r','require "php/mp3_metadata.php"; if(cm_mp3_rewrite($argv[1],["title"=>"No"])) exit(1);',str(bad));assert bad.read_bytes()==old
    print('PASS: FFmpeg successfully decoded both versions, Unicode tags, lyrics and unrelated frame preserved')
