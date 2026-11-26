"""Compile and exercise actual SoulseekClient with minimal host-JVM Android/JSON stubs.
Not an Android compile or live Soulseek interoperability test. Only local fake server.
"""
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[1]
source=root/'tools/packager/android/app/src/main/java/org/cachymusic/app/SoulseekClient.java'
stubs={
'android/content/Context.java':'''package android.content; import java.io.File; public class Context {private final SharedPreferences p=new SharedPreferences(); public static final int MODE_PRIVATE=0; public Context getApplicationContext(){return this;} public SharedPreferences getSharedPreferences(String n,int m){return p;} public File getFilesDir(){return new File(System.getProperty("java.io.tmpdir"));} public File getExternalFilesDir(String s){return getFilesDir();}}''',
'android/content/SharedPreferences.java':'''package android.content; import java.util.concurrent.ConcurrentHashMap; public class SharedPreferences {private final ConcurrentHashMap<String,String> m=new ConcurrentHashMap<>(); public String getString(String k,String d){return m.getOrDefault(k,d);} public Editor edit(){return new Editor();} public class Editor{public Editor putString(String k,String v){m.put(k,v);return this;} public Editor remove(String k){m.remove(k);return this;} public void apply(){}}}''',
'android/os/Environment.java':'''package android.os; import java.io.File; public class Environment {public static final String DIRECTORY_MUSIC="Music";public static File getExternalStoragePublicDirectory(String s){return new File(System.getProperty("java.io.tmpdir"));}}''',
'android/media/MediaScannerConnection.java':'''package android.media; import android.content.Context; public class MediaScannerConnection {public interface OnScanCompletedListener{void onScanCompleted(String p,Object u);} public static void scanFile(Context c,String[] p,String[] m,OnScanCompletedListener l){}}''',
'android/util/Log.java':'''package android.util; public class Log {public static int d(String a,String b){return 0;}public static int i(String a,String b){return 0;}public static int w(String a,String b){return 0;}public static int e(String a,String b){return 0;}public static int e(String a,String b,Throwable t){return 0;}}''',
'org/json/JSONObject.java':'''package org.json; public class JSONObject {public static final Object NULL=new Object();public JSONObject(){}public JSONObject(String s){}private final java.util.Map<String,Object> vals=new java.util.HashMap<>();public JSONObject put(String k,Object v){vals.put(k,v);return this;}public String toString(){return "{\\\"ok\\\":"+vals.get("ok")+"}";}public String optString(String s){return "";}public String optString(String s,String d){return d;} public long optLong(String s,long d){return d;}public boolean has(String k){return false;}public JSONArray getJSONArray(String s){return new JSONArray();}}''',
'org/json/JSONArray.java':'''package org.json; public class JSONArray {public JSONArray put(Object v){return this;}public int length(){return 0;}public JSONObject getJSONObject(int i){return new JSONObject();}}''',
'org/cachymusic/app/HostTest.java':'''package org.cachymusic.app;
import android.content.Context;import java.net.*;import java.io.*;import java.nio.*;import java.util.concurrent.*;import java.lang.reflect.*;
public class HostTest {
 static void check(boolean v,String m){if(!v)throw new AssertionError(m);}
 static boolean flag(SoulseekClient c,String n)throws Exception{Field f=SoulseekClient.class.getDeclaredField(n);f.setAccessible(true);return f.getBoolean(c);}
 static void readLogin(Socket s)throws Exception{DataInputStream in=new DataInputStream(s.getInputStream());int n=Integer.reverseBytes(in.readInt());check(n>=20&&n<4096,"login packet size");byte[] b=new byte[n];in.readFully(b);check(ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).getInt()==1,"login packet code");}
 static void reply(Socket s,boolean success)throws Exception{ByteBuffer b=ByteBuffer.allocate(13).order(ByteOrder.LITTLE_ENDIAN);b.putInt(9).putInt(1).put((byte)(success?1:0)).putInt(0);s.getOutputStream().write(b.array());s.getOutputStream().flush();}
 public static void main(String[] args)throws Exception{
 for(String host:new String[]{"127.0.0.1","10.2.3.4","192.168.1.1","169.254.169.254","172.16.1.1","100.64.0.1","224.0.0.1","198.18.0.1","192.0.2.5","203.0.113.8","0.0.0.0","localhost","1.2.3.999","1.2.03.4"})check(!PeerAddressPolicy.permitted(host,80),"peer address policy accepted private or invalid endpoint");
 check(PeerAddressPolicy.permitted("8.8.8.8",2242)&&!PeerAddressPolicy.permitted("8.8.8.8",65536),"peer endpoint validation");
 System.out.println("PASS Android peer-address policy: numeric public IPv4 only, rejects private/special/invalid addresses and invalid port");
 try(ServerSocket server=new ServerSocket(0,8,InetAddress.getLoopbackAddress())){
 SoulseekClient c=new SoulseekClient(new Context(),new InetSocketAddress(InetAddress.getLoopbackAddress(),server.getLocalPort()));ExecutorService ex=Executors.newCachedThreadPool();
 try{Future<Boolean> pending=ex.submit(()->c.connect("mock","secret"));try(Socket old=server.accept()){old.setSoTimeout(3000);readLogin(old);check(flag(c,"mIsConnecting"),"pending login");c.disconnect();check(!pending.get(2,TimeUnit.SECONDS),"cancelled login returned success");try{reply(old,true);}catch(IOException expected){}Thread.sleep(80);check(!flag(c,"mIsConnected"),"late login resurrected session");}
 Future<Boolean> retry=ex.submit(()->c.connect("mock","secret"));try(Socket good=server.accept()){good.setSoTimeout(3000);readLogin(good);reply(good,true);check(retry.get(3,TimeUnit.SECONDS),"new login failed");check(flag(c,"mIsConnected"),"new session not online");c.logout();check(!flag(c,"mIsConnected"),"logout failed");}
 Future<Boolean> rejected=ex.submit(()->c.connect("mock","secret"));try(Socket bad=server.accept()){readLogin(bad);reply(bad,false);check(!rejected.get(3,TimeUnit.SECONDS),"denied login succeeded");}
 check(!flag(c,"mIsConnected"),"denied login online");
 check(!SoulseekClient.downloadIdentity("a:b","c.flac").equals(SoulseekClient.downloadIdentity("a","b:c.flac")),"ambiguous transfer identity");
 Field transfersField=SoulseekClient.class.getDeclaredField("mTransfers");transfersField.setAccessible(true);
 @SuppressWarnings("unchecked") java.util.Map<String,SoulseekClient.DownloadTransfer> transfers=(java.util.Map<String,SoulseekClient.DownloadTransfer>)transfersField.get(c);
 SoulseekClient.DownloadTransfer a=new SoulseekClient.DownloadTransfer(), b=new SoulseekClient.DownloadTransfer();a.id="alice:Album/Same.flac";b.id="bob:Album/Same.flac";a.status="Finished";b.status="Queued";
 File completed=File.createTempFile("cachy-native-",".flac");try{java.nio.file.Files.write(completed.toPath(),new byte[]{1,2,3});a.localFilePath=completed.getAbsolutePath();transfers.put(a.id,a);transfers.put(b.id,b);
 check(c.transferAction("pause_download","missing").contains("false"),"unknown pause acknowledged");check(c.transferAction("pause_download",a.id).contains("false"),"finished pause acknowledged");check(c.transferAction("resume_download",b.id).contains("false"),"offline resume acknowledged");check(c.transferAction("clear_download",b.id).contains("false"),"active clear acknowledged");
 check(c.transferAction("pause_download",b.id).contains("true")&&b.userPaused&&b.attemptGeneration==1&&b.status.equals("Paused"),"pause rejected");check(c.transferAction("cancel_download",a.id).contains("true")&&!transfers.containsKey(a.id)&&transfers.containsKey(b.id),"exact removal failed");check(java.util.Arrays.equals(java.nio.file.Files.readAllBytes(completed.toPath()),new byte[]{1,2,3}),"completed audio changed");check(c.transferAction("cancel_download",b.id).contains("true")&&b.userCancelled&&!transfers.containsKey(b.id),"cancel failed");
 System.out.println("PASS Android native transfer actions: unknown IDs, offline resume, active clear, exact pause and cancellation, completed file preserved");}finally{completed.delete();}
 System.out.println("PASS host-JVM Soulseek: actual Java client local-socket login, pending disconnect, late response rejection, reconnect, logout, denied authentication");
 }finally{c.disconnect();ex.shutdownNow();for(String name:new String[]{"mExecutor","mControlExecutor","mIncomingPool","mPeerPool","mScheduler"}){Field f=SoulseekClient.class.getDeclaredField(name);f.setAccessible(true);((ExecutorService)f.get(c)).shutdownNow();}}
 }} }'''
}
with tempfile.TemporaryDirectory() as tmp:
    d=Path(tmp);files=[]
    for name,body in stubs.items():
        p=d/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(body);files.append(str(p))
    subprocess.run(['javac','--release','17','-d',str(d),str(source),str(source.with_name("PeerAddressPolicy.java")),*files],check=True,timeout=30)
    subprocess.run(['java','-cp',str(d),'org.cachymusic.app.HostTest'],check=True,timeout=20)
