from pathlib import Path
import subprocess, tempfile, hashlib, json, os, time, urllib.request, urllib.error, struct, zlib, binascii
root=Path(__file__).resolve().parents[1]
def run(*cmd): return subprocess.check_output(cmd,cwd=root,text=True,stderr=subprocess.STDOUT)
def payload(fp):
    b=fp.read_bytes(); assert b[:4]==b'fLaC'; p=4
    while True:
        end=b[p]&128; n=int.from_bytes(b[p+1:p+4],'big'); p+=4+n
        if end: return hashlib.sha256(b[p:]).hexdigest()
with tempfile.TemporaryDirectory() as d:
    d=Path(d); orig=d/'orig.flac'; js=d/'js.flac'; php=d/'php.flac'; bad=d/'bad.flac'; art=d/'cover.png'
    chunk=lambda t,b:struct.pack('>I',len(b))+t+b+struct.pack('>I',binascii.crc32(t+b)&0xffffffff)
    art.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',2,2,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0'+b'\x20\x80\xa0'*2+b'\0'+b'\x20\x80\xa0'*2))+chunk(b'IEND',b''))
    run('ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=1000:duration=2','-metadata','title=Original','-metadata','artist=Fixture','-metadata','CUSTOM=preserve-me','-c:a','flac',str(orig))
    print(run('node','tests/metadata-regression.mjs',str(orig),str(js),str(art)).strip())
    php.write_bytes(orig.read_bytes()); bad.write_bytes(b'fLaC'+bytes(50)); old=bad.read_bytes()
    print(run('php','-r', 'require "php/flac_metadata.php"; if(!cm_flac_rewrite($argv[1],["title"=>"PHP changed","lyrics"=>"[00:01.00] test"],file_get_contents($argv[3]),getimagesize($argv[3]))) exit(1); if(cm_flac_rewrite($argv[2],["title"=>"No"])) exit(2); echo "PASS: PHP rewrite and malformed-file rejection\\n";',str(php),str(bad),str(art)).strip())
    assert bad.read_bytes()==old
    for f in [js,php]:
        assert payload(orig)==payload(f)
        tags=run('metaflac','--export-tags-to=-',str(f)); assert 'CUSTOM=preserve-me' in tags and 'LYRICS=[00:01.00] test' in tags
        run('ffmpeg','-v','error','-i',str(f),'-f','null','-')
        exported=d/(f.stem+'.png');run('metaflac','--export-picture-to='+str(exported),str(f));assert exported.read_bytes()==art.read_bytes()
    print('PASS: both FLAC writers preserve exact encoded audio, retain unrelated tags, embed exact PNG artwork and decode successfully in FFmpeg')
