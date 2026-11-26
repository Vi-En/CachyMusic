"""Host JVM version contract and source integration assertions (not Android SDK compilation)."""
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[1]
java=root/'tools/packager/android/app/src/main/java/org/cachymusic/app'
with tempfile.TemporaryDirectory() as t:
 d=Path(t);p=d/'Test.java';p.write_text('''package org.cachymusic.app;
 class Test { public static void main(String[] args) throws Exception {
 String a=MediaRangeContract.version("content://song",1,2,3,4,5);
 if(!a.matches("[a-f0-9]{64}")||!a.equals(MediaRangeContract.version("content://song",1,2,3,4,5)))throw new AssertionError();
 if(a.equals(MediaRangeContract.version("content://song",1,9,3,4,5))||a.equals(MediaRangeContract.version("content://song",1,2,3,5,5)))throw new AssertionError("replacement");
 if(!MediaRangeContract.valid(0,4194303)||MediaRangeContract.valid(0,4194304)||MediaRangeContract.valid(1,0))throw new AssertionError("range");
 for(String raw:new String[]{"-1","x","9999999999999999"}){try{MediaRangeContract.offset(raw);throw new AssertionError("invalid offset");}catch(IllegalArgumentException expected){}}
 }}''')
 subprocess.run(['javac','--release','17','-d',t,str(java/'MediaRangeContract.java'),str(p)],check=True,timeout=30)
 subprocess.run(['java','-cp',t,'org.cachymusic.app.Test'],check=True,timeout=20)
s=(java/'MainActivity.java').read_text();route=s[s.index('private WebResourceResponse handleVersionedPcmRange'):s.index('private WebResourceResponse handleAndroidMediaStream')];assert 'Os.fstat(descriptor.getFileDescriptor())' in route and 'Os.lseek(descriptor.getFileDescriptor()' in route and 'AutoCloseInputStream(descriptor)' in route and 'openInputStream' not in route and '412' in route and 'finally' in route
print('PASS host Android range version and bounds, strict descriptor ownership source contract')
