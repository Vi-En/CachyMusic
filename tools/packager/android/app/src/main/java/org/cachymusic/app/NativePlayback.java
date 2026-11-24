package org.cachymusic.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

/** Service-owned local playback. All methods/callbacks run on the service main looper.
 * No WebView, network URI, DSP or exclusive-output claims. */
final class NativePlayback {
    interface Listener { void changed(); }
    private final Context context;
    private final AudioManager manager;
    private final Listener listener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable loadDeadline;
    private final AudioAttributes attributes = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
    private MediaPlayer player;
    private AudioFocusRequest focusRequest;
    private AudioManager.OnAudioFocusChangeListener focusListener;
    private boolean focused, wanted, prepared;
    private long pendingSeek;
    private boolean seeking;
    private long issuedSeek;
    private float volume = 1f;
    String token = "", uri = "", state = "stopped";
    long position, duration;
    NativePlayback(Context context, Listener listener) {
        this.context = context; this.listener = listener;
        manager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    }
    boolean owns() { return !token.isEmpty() && !"stopped".equals(state); }
    boolean matches(String id) { return owns() && token.equals(id); }
    void load(String id, String raw, long offset, float gain) {
        release(); token=id; uri=raw; state="loading"; wanted=true; pendingSeek=Math.max(0,offset);
        position=pendingSeek; duration=0; volume=clamp(gain); listener.changed();
        try {
            Uri source=Uri.parse(raw);
            if (!"content".equals(source.getScheme())) throw new IllegalArgumentException("Local content required");
            final MediaPlayer p=new MediaPlayer(); player=p;
            p.setAudioAttributes(attributes);
            p.setWakeMode(context, android.os.PowerManager.PARTIAL_WAKE_LOCK);
            p.setDataSource(context,source);
            p.setVolume(volume,volume);
            p.setOnPreparedListener(mp->{
                if(player!=mp)return;
                clearDeadline();prepared=true; duration=Math.max(0,mp.getDuration());
                if(pendingSeek>0) seek(pendingSeek); else startIfWanted();
            });
            p.setOnSeekCompleteListener(mp->{if(player==mp){seeking=false;position=Math.max(0,mp.getCurrentPosition());if(pendingSeek!=issuedSeek)seek(pendingSeek);else startIfWanted();}});
            p.setOnCompletionListener(mp->{if(player==mp&&wanted&&"playing".equals(state)){wanted=false;position=duration;state="ended";abandonFocus();listener.changed();}});
            p.setOnErrorListener((mp,what,extra)->{if(player==mp) fail();return true;});
            loadDeadline=()->{if(player==p&&!prepared)fail();};handler.postDelayed(loadDeadline,20000);
            p.prepareAsync();
        } catch(Exception ex) { fail(); }
    }
    private static float clamp(float gain){return Float.isFinite(gain)?Math.max(0f,Math.min(1f,gain)):0f;}
    float gain(){return volume;}
    void gain(float v){volume=clamp(v);if(player!=null)try{player.setVolume(volume,volume);}catch(Exception ignored){}}
    void play(){if(player==null||"error".equals(state))return;wanted=true;if("ended".equals(state)){seek(0);return;}startIfWanted();}
    private boolean requestFocus(){
        if(focused)return true;if(manager==null)return false;
        final MediaPlayer owner=player;
        focusListener=change->{if(player!=owner||!focused)return;if(change==AudioManager.AUDIOFOCUS_LOSS||change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT||change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK)pause();};
        int result;
        if(Build.VERSION.SDK_INT>=26){focusRequest=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes).setWillPauseWhenDucked(true).setOnAudioFocusChangeListener(focusListener,new Handler(Looper.getMainLooper())).build();result=manager.requestAudioFocus(focusRequest);}
        else result=manager.requestAudioFocus(focusListener,AudioManager.STREAM_MUSIC,AudioManager.AUDIOFOCUS_GAIN);
        focused=result==AudioManager.AUDIOFOCUS_REQUEST_GRANTED;if(!focused)abandonFocus();return focused;
    }
    private void abandonFocus(){if(manager!=null&&focusListener!=null){if(Build.VERSION.SDK_INT>=26&&focusRequest!=null)manager.abandonAudioFocusRequest(focusRequest);else manager.abandonAudioFocus(focusListener);}focused=false;focusRequest=null;focusListener=null;}
    private void startIfWanted(){
        if(!prepared||seeking||player==null)return;
        try{if(wanted&&requestFocus()){player.start();state="playing";}else{wanted=false;state="paused";}listener.changed();}catch(Exception ex){fail();}
    }
    void pause(){wanted=false;try{if(prepared&&player!=null&&player.isPlaying())player.pause();}catch(Exception ex){fail();return;}refresh();abandonFocus();if(!"error".equals(state)&&!"ended".equals(state))state="paused";listener.changed();}
    void seek(long ms){
        pendingSeek=Math.max(0,Math.min(Integer.MAX_VALUE,ms));
        if(!prepared||player==null)return;
        try{pendingSeek=Math.min(pendingSeek,duration);if(seeking)return;issuedSeek=pendingSeek;seeking=true;position=pendingSeek;state="seeking";if(player.isPlaying())player.pause();
            if(Build.VERSION.SDK_INT>=26)player.seekTo(pendingSeek,MediaPlayer.SEEK_CLOSEST);else player.seekTo((int)pendingSeek);listener.changed();
        }catch(Exception ex){fail();}
    }
    void refresh(){if(prepared&&player!=null&&!seeking)try{position=Math.max(0,player.getCurrentPosition());duration=Math.max(0,player.getDuration());}catch(Exception ignored){}}
    void stop(){release();state="stopped";listener.changed();}
    private void fail(){release();state="error";listener.changed();}
    private void clearDeadline(){if(loadDeadline!=null){handler.removeCallbacks(loadDeadline);loadDeadline=null;}}
    private void release(){clearDeadline();MediaPlayer p=player;player=null;prepared=false;wanted=false;seeking=false;abandonFocus();if(p!=null)try{p.release();}catch(Exception ignored){}}
}
