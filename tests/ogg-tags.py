from pathlib import Path
import subprocess,tempfile,struct,json,hashlib,zlib
root=Path(__file__).resolve().parents[1]
def run(*args):return subprocess.check_output(args,cwd=root,stderr=subprocess.STDOUT)
def audio_pages(data,headers):
    p=0;count=0;out=[]
    while p<len(data):
        assert data[p:p+4]==b'OggS';n=data[p+26];laces=data[p+27:p+27+n];end=p+27+n+sum(laces)
        assert end<=len(data)
        if count>=headers:out.append(data[p:p+18]+data[p+26:end])
        count+=sum(x<255 for x in laces);p=end
    return out
with tempfile.TemporaryDirectory() as tmp:
    d=Path(tmp);pic=root/'resources/images/icon-192.png'
    for ext,codec,headers in [('ogg','libvorbis',3),('opus','libopus',2)]:
        src=d/('source.'+ext);browser=d/('browser.'+ext);desktop=d/('desktop.'+ext)
        run('ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=380:duration=3:sample_rate=48000','-c:a',codec,'-metadata','album=Keep Album',str(src));original=src.read_bytes();desktop.write_bytes(original)
        run('node','--experimental-default-type=module','tests/ogg-tags.mjs',str(src),str(browser),str(pic))
        code='require "php/platform.php"; require "php/flac_metadata.php";require "php/packet_metadata.php";exit(cm_packet_rewrite($argv[1],["title"=>"新曲","artist"=>"Test Artist","lyrics"=>"[00:01.00] A line"],file_get_contents($argv[2]),["mime"=>"image/png",192,192])?0:1);'
        run('php','-r',code,str(desktop),str(pic))
        reference=run('ffmpeg','-v','error','-i',str(src),'-map','0:a:0','-f','s32le','-')
        for path in [browser,desktop]:
            assert audio_pages(path.read_bytes(),headers)==audio_pages(original,headers)
            assert run('ffmpeg','-v','error','-i',str(path),'-map','0:a:0','-f','s32le','-')==reference
            probe=json.loads(run('ffprobe','-v','error','-show_streams','-of','json',str(path)))['streams'];tags={k.lower():v for k,v in probe[0]['tags'].items()};assert tags['title']=='新曲' and tags['album']=='Keep Album' and tags['lyrics']=='[00:01.00] A line',tags
            assert any(s.get('disposition',{}).get('attached_pic') for s in probe),probe
        bad=d/('bad.'+ext);bad.write_bytes(original[:-5]);assert subprocess.run(['php','-r',code,str(bad),str(pic)],cwd=root).returncode!=0;assert bad.read_bytes()==original[:-5]
        print(f'PASS {ext}: identical encoded audio pages and PCM, Unicode tags, lyrics, artwork, unrelated metadata, malformed file preserved')
