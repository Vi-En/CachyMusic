from pathlib import Path
import subprocess,tempfile,struct,base64,json
root=Path(__file__).resolve().parents[1]
def run(*args):return subprocess.check_output(args,cwd=root,stderr=subprocess.STDOUT)
def chunks(data):
    endian='<' if data[:4]==b'RIFF' else '>'; assert struct.unpack_from(endian+'I',data,4)[0]+8==len(data)
    p=12;out=[]
    while p<len(data):
        size=struct.unpack_from(endian+'I',data,p+4)[0];e=p+8+size+(size&1)
        assert e<=len(data)
        if data[p:p+4].lower()!=b'id3 ':out.append(data[p:e])
        p=e
    return out
with tempfile.TemporaryDirectory() as d:
    d=Path(d);pic=d/'cover.png';pic.write_bytes((root/'resources/images/icon-192.png').read_bytes())
    for ext,codec in [('wav','pcm_s16le'),('aiff','pcm_s24be')]:
        src=d/('source.'+ext);out=d/('browser.'+ext);desk=d/('desktop.'+ext)
        run('ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:duration=37:sample_rate=48000','-c:a',codec,str(src));original=src.read_bytes();desk.write_bytes(original)
        print(run('node','tests/container-tags.mjs',str(src),str(out),str(pic)).decode().strip())
        code='require "php/pcm_metadata.php"; exit(cm_pcm_tag_rewrite($argv[1],["title"=>"新曲","artist"=>"Test Artist","lyrics"=>"[00:01.00] A line"],file_get_contents($argv[2]),["mime"=>"image/png"])?0:1);'
        run('php','-r',code,str(desk),str(pic))
        reference=run('ffmpeg','-v','error','-i',str(src),'-map','0:a:0','-f','s32le','-')
        for path in [out,desk]:
            assert chunks(path.read_bytes())==chunks(original)
            assert run('ffmpeg','-v','error','-i',str(path),'-map','0:a:0','-f','s32le','-')==reference
            tags=json.loads(run('ffprobe','-v','error','-show_entries','format_tags','-of','json',str(path)))['format']['tags']
            assert tags.get('title')=='新曲',tags
            assert tags.get('artist')=='Test Artist',tags
            assert any('A line' in v for v in tags.values()),tags
        corrupt=d/('invalid.'+ext);corrupt.write_bytes(original[:20]);assert subprocess.run(['php','-r',code,str(corrupt),str(pic)],cwd=root).returncode!=0;assert corrupt.read_bytes()==original[:20]
        print(f'PASS {ext}: desktop and browser tag writers preserve every non-ID3 chunk, exact decoded PCM, Unicode/lyrics; failed write preserves original')
