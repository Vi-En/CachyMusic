"""Host JVM test of actual service transport class using fake Android media APIs.
This does not compile the real Android application or decode media.
"""
from pathlib import Path
import tempfile,subprocess
root=Path(__file__).resolve().parents[1]
source=root/'tools/packager/android/app/src/main/java/org/cachymusic/app/NativePlayback.java'
order_source=source.with_name('NativePlaybackOrder.java')
stubs={
'android/content/Context.java':'''package android.content; import android.media.AudioManager; public class Context {public final AudioManager am=new AudioManager(); public static final String AUDIO_SERVICE="audio"; public Object getSystemService(String n){return am;}}''',
'android/net/Uri.java':'''package android.net;public class Uri {String s; Uri(String s){this.s=s;}public static Uri parse(String s){return new Uri(s);}public String getScheme(){return s.split(":",2)[0];}}''',
'android/os/Build.java':'''package android.os;public class Build {public static class VERSION{public static int SDK_INT=34;}}''',
'android/os/Looper.java':'''package android.os;public class Looper{public static Looper getMainLooper(){return new Looper();}}''',
'android/os/Handler.java':'''package android.os;public class Handler{public static Runnable last;public Handler(Looper l){}public boolean postDelayed(Runnable r,long n){last=r;return true;}public void removeCallbacks(Runnable r){if(last==r)last=null;}}''',
'android/os/PowerManager.java':'''package android.os;public class PowerManager{public static final int PARTIAL_WAKE_LOCK=1;}''',
'android/media/AudioAttributes.java':'''package android.media;public class AudioAttributes {public static final int USAGE_MEDIA=1,CONTENT_TYPE_MUSIC=2;public static class Builder{public Builder setUsage(int i){return this;}public Builder setContentType(int i){return this;}public AudioAttributes build(){return new AudioAttributes();}}}''',
'android/media/AudioFocusRequest.java':'''package android.media;import android.os.Handler;public class AudioFocusRequest{AudioManager.OnAudioFocusChangeListener l;public static class Builder{private final AudioFocusRequest r=new AudioFocusRequest();public Builder(int i){}public Builder setAudioAttributes(AudioAttributes a){return this;}public Builder setWillPauseWhenDucked(boolean b){return this;}public Builder setOnAudioFocusChangeListener(AudioManager.OnAudioFocusChangeListener l,Handler h){r.l=l;return this;}public AudioFocusRequest build(){return r;}}}''',
'android/media/AudioManager.java':'''package android.media;public class AudioManager{public static final int AUDIOFOCUS_GAIN=1,AUDIOFOCUS_LOSS=-1,AUDIOFOCUS_LOSS_TRANSIENT=-2,AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK=-3,AUDIOFOCUS_REQUEST_GRANTED=1,STREAM_MUSIC=3;public interface OnAudioFocusChangeListener{void onAudioFocusChange(int c);}public OnAudioFocusChangeListener active;public boolean grants=true,failAbandon=false;public int requestAudioFocus(AudioFocusRequest r){active=r.l;return grants?1:0;}public int requestAudioFocus(OnAudioFocusChangeListener l,int s,int g){active=l;return grants?1:0;}public int abandonAudioFocusRequest(AudioFocusRequest r){if(failAbandon)throw new IllegalStateException("focus binder failed");active=null;return 1;}public int abandonAudioFocus(OnAudioFocusChangeListener l){if(failAbandon)throw new IllegalStateException("focus binder failed");active=null;return 1;}}''',
'android/media/MediaPlayer.java':'''package android.media;import android.content.Context;import android.net.Uri;public class MediaPlayer{
 public static final int SEEK_CLOSEST=3;public static MediaPlayer last;public boolean playing,released,failVolume;public int pos,seekCalls;public float volume;public MediaPlayer(){last=this;}
 public interface OnPreparedListener{void onPrepared(MediaPlayer p);}public interface OnSeekCompleteListener{void onSeekComplete(MediaPlayer p);}public interface OnCompletionListener{void onCompletion(MediaPlayer p);}public interface OnErrorListener{boolean onError(MediaPlayer p,int w,int e);}
 public OnPreparedListener prepared;public OnSeekCompleteListener sought;public OnCompletionListener complete;public OnErrorListener error;
 public void setAudioAttributes(AudioAttributes a){}public void setWakeMode(Context c,int m){}public void setDataSource(Context c,Uri u){}public void setVolume(float l,float r){if(failVolume)throw new IllegalStateException("volume failed");volume=l;}public void setOnPreparedListener(OnPreparedListener l){prepared=l;}public void setOnSeekCompleteListener(OnSeekCompleteListener l){sought=l;}public void setOnCompletionListener(OnCompletionListener l){complete=l;}public void setOnErrorListener(OnErrorListener l){error=l;}public void prepareAsync(){}public int getDuration(){return 10000;}public int getCurrentPosition(){return pos;}public void start(){if(released)throw new IllegalStateException();playing=true;}public void pause(){playing=false;}public boolean isPlaying(){return playing;}public void seekTo(long p,int m){pos=(int)p;seekCalls++;}public void seekTo(int p){pos=p;seekCalls++;}public void release(){released=true;playing=false;}
}''',
'org/cachymusic/app/NativeHostTest.java':'''package org.cachymusic.app;import android.content.Context;import android.media.*;import android.os.Handler;public class NativeHostTest{
 static void chk(boolean b,String m){if(!b)throw new AssertionError(m);}public static void main(String[] a){Context c=new Context();NativePlayback n=new NativePlayback(c,()->{});
 n.load("a","content://x",0,.5f);MediaPlayer old=MediaPlayer.last;n.pause();old.prepared.onPrepared(old);chk(!old.playing&&n.state.equals("paused"),"pause during preparation");n.play();chk(old.playing&&n.state.equals("playing"),"play");
 n.seek(1000);n.seek(3000);old.complete.onCompletion(old);chk(n.state.equals("seeking"),"completion during seek cannot advance");chk(old.seekCalls==1,"coalesce pending seek");old.sought.onSeekComplete(old);chk(old.seekCalls==2&&old.pos==3000,"latest seek");old.sought.onSeekComplete(old);chk(old.playing&&n.position==3000,"restart after seek");
 AudioManager.OnAudioFocusChangeListener prior=c.am.active;prior.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT);chk(!old.playing&&n.state.equals("paused"),"focus loss");n.play();prior.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT);chk(old.playing&&n.state.equals("playing"),"stale focus callback cannot pause reacquired focus");old.complete.onCompletion(old);chk(n.state.equals("ended"),"end");n.play();old.sought.onSeekComplete(old);chk(old.pos==0&&old.playing,"repeat");
 n.load("b","content://y",0,1);MediaPlayer newer=MediaPlayer.last;old.prepared.onPrepared(old);old.error.onError(old,1,0);chk(old.released&&n.state.equals("loading"),"stale callback");newer.prepared.onPrepared(newer);n.gain(0);chk(newer.volume==0,"mute");n.stop();chk(newer.released&&!n.owns()&&n.state.equals("stopped"),"release");
 n.load("bad","https://remote",0,1);chk(n.state.equals("error"),"reject remote source");n.stop();n.load("timeout","content://slow",0,1);Runnable timeout=Handler.last;timeout.run();chk(n.state.equals("error")&&MediaPlayer.last.released,"deadline");n.stop();
 n.load("seek-timeout","content://slow",0,.25f);MediaPlayer stalled=MediaPlayer.last;stalled.prepared.onPrepared(stalled);n.seek(5000);Runnable seekTimeout=Handler.last;chk(seekTimeout!=null,"seek deadline installed");seekTimeout.run();chk(n.state.equals("error")&&stalled.released,"seek deadline releases stalled decoder");n.stop();
 n.load("volume-failure","content://safe",0,1);MediaPlayer volumeFailure=MediaPlayer.last;volumeFailure.prepared.onPrepared(volumeFailure);volumeFailure.failVolume=true;n.gain(0);chk(volumeFailure.released&&!volumeFailure.playing&&n.state.equals("error"),"failed attenuation must stop playback");n.stop();
 n.load("focus-binder","content://safe",0,1);MediaPlayer focusBinder=MediaPlayer.last;focusBinder.prepared.onPrepared(focusBinder);c.am.failAbandon=true;n.stop();chk(focusBinder.released&&!focusBinder.playing,"focus binder failure cannot prevent decoder release");c.am.failAbandon=false;
 c.am.grants=false;n.load("focus","content://x",0,1);MediaPlayer.last.prepared.onPrepared(MediaPlayer.last);chk(n.state.equals("paused")&&!MediaPlayer.last.playing,"focus denied");n.stop();
 verifyOrder();
 verifyShuffle();
 System.out.println("PASS native Java controller mock, ordered playback, explicit queue and shuffle history");
 }
 static void verifyOrder(){
  var a = new NativePlaybackOrder.Track("content://a", "One", "", "", "", "");
  var b = new NativePlaybackOrder.Track("content://b", "Two", "", "", "", "");
  var c = new NativePlaybackOrder.Track("content://c", "Three", "", "", "", "");
  var tracks = java.util.List.of(a, b, c);
  var order = new NativePlaybackOrder(tracks, 0, true, false, false, false);
  chk(!order.matches(b.uri) && order.matches(a.uri), "order is anchored to its current source");
  chk(order.move(1, false) == b && order.move(1, false) == c, "automatic ordered advance");
  chk(order.move(1, false) == null && order.matches(c.uri), "repeat off stops at the end");
  chk(order.move(1, true) == a && order.move(-1, true) == c, "manual skips can wrap the full list");
  var repeat = new NativePlaybackOrder(tracks, 2, true, true, false, false);
  chk(repeat.move(1, false) == a, "repeat all wraps on completion");
  var partial = new NativePlaybackOrder(tracks, 1, false, true, false, false);
  chk(partial.move(1, false) == c && partial.move(1, false) == null && partial.move(1, true) == null,
      "a partial window never loops or skips its boundary");
  chk(partial.move(-1, true) == b && partial.move(-1, true) == a && partial.move(-1, true) == null,
      "previous is bounded by the supplied window");
  var first = new NativePlaybackOrder.Track(a.uri, a.title, "", "", "", "queue-1");
  var second = new NativePlaybackOrder.Track(a.uri, a.title, "", "", "", "queue-2");
  var queued = new NativePlaybackOrder(java.util.List.of(a, first, second), 0, false, false, false, true);
  chk(queued.move(1, false).queueId.equals("queue-1"), "completion consumes the first queued occurrence");
  chk(queued.move(-1, true) == null, "previous cannot replay a consumed queue entry");
  chk(queued.move(1, true).queueId.equals("queue-2"), "manual next consumes the next occurrence of the same URI");
  chk(queued.move(1, false) == null && queued.move(1, true) == null, "the explicit queue never wraps");
 }
 static void verifyShuffle(){
  var a = new NativePlaybackOrder.Track("content://a", "One", "", "", "", "");
  var b = new NativePlaybackOrder.Track("content://b", "Two", "", "", "", "");
  var c = new NativePlaybackOrder.Track("content://c", "Three", "", "", "", "");
  var tracks = java.util.List.of(a, b, c);
  var order = new NativePlaybackOrder(tracks, 0, true, false, false, false);
  var repeat = new NativePlaybackOrder(tracks, 0, true, true, false, false);
  var shuffle = new NativeShuffle(new java.util.Random(1));
  shuffle.update(tracks, true, a);
  chk(shuffle.previous() == null, "history starts at the current track");
  var first = shuffle.next(order, true, false);
  shuffle.update(tracks, true, first);
  var second = shuffle.next(order, true, false);
  chk(first != a && second != a && first != second, "shuffle visits candidates once per pass across refreshes");
  chk(shuffle.exhausted() && shuffle.next(order, true, false) == null, "repeat off completes one shuffle pass");
  chk(shuffle.previous().uri.equals(first.uri) && shuffle.previous().uri.equals(a.uri), "previous follows actual playback order");
  chk(shuffle.next(order, true, false).uri.equals(first.uri) && shuffle.next(order, true, false).uri.equals(second.uri),
      "next retraces history before selecting a new track");
  chk(!shuffle.next(repeat, true, false).uri.equals(second.uri), "repeat all starts a fresh pass without an immediate repeat");

  shuffle.clear();
  var queuedTrack = new NativePlaybackOrder.Track(b.uri, b.title, "", "", "", "queue-1");
  var queued = new NativePlaybackOrder(java.util.List.of(a, queuedTrack), 0, false, false, false, true);
  shuffle.update(tracks, true, a);
  chk(shuffle.next(queued, true, false) == queuedTrack, "the pending queue wins over shuffle");
  chk(shuffle.previous().uri.equals(a.uri), "previous can return before a consumed queue entry");
  var pending = new NativePlaybackOrder(java.util.List.of(a), 0, false, true, false, true);
  chk(shuffle.next(pending, false, true) == null, "a queue gap also takes priority over history");
  var replay = shuffle.next(queued, true, true);
  chk(replay.uri.equals(b.uri) && replay.queueId.isEmpty(), "replaying history never consumes a queue entry again");
  chk(shuffle.next(queued, true, false) == c, "a complete queue continues into shuffle");

  shuffle.clear();
  shuffle.update(java.util.List.of(a, b), false, a);
  chk(shuffle.next(repeat, true, false) == b, "a partial window still plays unchecked candidates");
  chk(shuffle.next(repeat, true, false) == null && shuffle.next(repeat, true, true) == null && !shuffle.exhausted(),
      "a partial window can hand off at its boundary");
  shuffle.update(tracks, true, b);
  chk(shuffle.next(order, true, false) == c, "an updated window preserves already played tracks");
  shuffle.clear();
  shuffle.update(java.util.List.of(a), true, a);
  chk(shuffle.next(order, true, false) == null && shuffle.next(repeat, true, false) == a, "single-track repeat");

  var largePool = new java.util.ArrayList<NativePlaybackOrder.Track>();
  for (int i = 0; i < 80; i++) largePool.add(new NativePlaybackOrder.Track("content://large/" + i, "Track " + i, "", "", "", ""));
  shuffle.clear();
  shuffle.update(largePool, true, largePool.get(0));
  var played = new java.util.HashSet<String>();
  played.add(largePool.get(0).uri);
  for (int i = 1; i < largePool.size(); i++) {
   var next = shuffle.next(order, true, false);
   chk(next != null && played.add(next.uri), "a large pass preserves played identities beyond the history limit");
  }
  chk(shuffle.exhausted() && shuffle.next(order, true, false) == null, "a large pass ends after the whole catalog");
 }
}
'''
}
with tempfile.TemporaryDirectory() as tmp:
    d=Path(tmp);files=[]
    for name,src in stubs.items():
        p=d/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(src);files.append(str(p))
    subprocess.run(['javac','--release','17','-d',str(d),str(source),str(order_source),
                    str(source.with_name('NativeShuffle.java')),*files],check=True,timeout=30)
    subprocess.run(['java','-cp',str(d),'org.cachymusic.app.NativeHostTest'],check=True,timeout=20)
