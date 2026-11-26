"""Actual Java parser on malformed and valid metadata chains, plus independent FLAC PCM equality."""
from pathlib import Path
import tempfile,subprocess,struct
root=Path(__file__).resolve().parents[1];java=root/'tools/packager/android/app/src/main/java/org/cachymusic/app'
with tempfile.TemporaryDirectory() as t:
 d=Path(t);p=d/'MaskTest.java';p.write_text('''package org.cachymusic.app;import java.io.*;import java.nio.file.*;import java.util.*;
 class MaskTest {public static void main(String[] args)throws Exception{byte[] raw=Files.readAllBytes(Path.of(args[0]));byte[] original=raw.clone();Map<Long,Byte> mask=FlacPictureMask.scan(new ByteArrayInputStream(raw));if(mask.size()!=1||!mask.containsKey(42L))throw new AssertionError(mask);for(var e:mask.entrySet())raw[e.getKey().intValue()]=e.getValue();Files.write(Path.of(args[1]),raw);for(int len=0;len<78;len++){if(!FlacPictureMask.scan(new ByteArrayInputStream(Arrays.copyOf(original,len))).isEmpty())throw new AssertionError("partial metadata accepted");}byte[] malformed=raw.clone();malformed[4]=6;if(!FlacPictureMask.scan(new ByteArrayInputStream(malformed)).isEmpty())throw new AssertionError("missing STREAMINFO accepted");}}''')
 subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i','sine=frequency=997:sample_rate=48000:duration=0.2','-c:a','flac',str(d/'base.flac')],check=True,timeout=20)
 raw=(d/'base.flac').read_bytes();assert raw[:4]==b'fLaC' and raw[4]&127==0 and raw[5:8]==b'\x00\x00\x22'
 # valid picture block, zero-length image data; decoding audio frames remains unchanged
 picture=struct.pack('>IIIIIIIII',3,0,0,0,0,0,0,0,0)[:-4]
 first=bytearray(raw[:42]);first[4]&=127;block=bytes([6])+len(picture).to_bytes(3,'big')+picture
 (d/'with-picture.flac').write_bytes(first+block+raw[42:]);subprocess.run(['javac','--release','17','-d',t,str(java/'FlacPictureMask.java'),str(p)],check=True,timeout=30);subprocess.run(['java','-cp',t,'org.cachymusic.app.MaskTest',str(d/'with-picture.flac'),str(d/'masked.flac')],check=True,timeout=20)
 patched=(d/'masked.flac').read_bytes();original=(d/'with-picture.flac').read_bytes();assert [i for i,(a,b) in enumerate(zip(original,patched)) if a!=b]==[42]
 def decode(path):return subprocess.check_output(['ffmpeg','-nostdin','-v','error','-i',str(path),'-f','s16le','-'],timeout=20)
 assert decode(d/'base.flac')==decode(d/'masked.flac')
print('PASS host Java FLAC metadata-only patch, truncation and invalid STREAMINFO rejection, independent decoded PCM equality')
