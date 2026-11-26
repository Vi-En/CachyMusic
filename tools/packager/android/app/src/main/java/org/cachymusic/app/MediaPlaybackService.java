package org.cachymusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.media.AudioManager;
import org.json.JSONArray;
import org.json.JSONObject;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Base64;
import android.util.Log;

import android.os.Handler;
import android.os.Looper;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import org.cachymusic.app.NativePlaybackOrder.CatalogKind;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * Foreground Media Playback Service for CachyMusic Android APK.
 * Maintains background audio playback, CPU partial WakeLock while playing,
 * lock-screen MediaSession metadata/transport controls, and Notification.MediaStyle.
 */
public class MediaPlaybackService extends Service {
    private static final String TAG = "CachyMusicMediaSvc";
    private static final String CHANNEL_ID = "cachymusic_playback";
    private static final int NOTIFICATION_ID = 4410;

    public static final String ACTION_UPDATE = "org.cachymusic.app.MEDIA_UPDATE";
    public static final String ACTION_STOP_SERVICE = "org.cachymusic.app.MEDIA_STOP_SERVICE";
    public static final String ACTION_THEME_UPDATE = "org.cachymusic.app.MEDIA_THEME_UPDATE";

    public static final String BROADCAST_MEDIA_COMMAND = "org.cachymusic.app.MEDIA_COMMAND";
    public static final String EXTRA_CMD = "cmd";
    public static final String MEDIA_COMMAND_PERMISSION = "org.cachymusic.app.permission.MEDIA_COMMAND";

    public static final String ACTION_CMD_PLAY = "org.cachymusic.app.CMD_PLAY";
    public static final String ACTION_CMD_PAUSE = "org.cachymusic.app.CMD_PAUSE";
    public static final String ACTION_CMD_NEXT = "org.cachymusic.app.CMD_NEXT";
    public static final String ACTION_CMD_PREV = "org.cachymusic.app.CMD_PREV";
    public static final String ACTION_CMD_STOP = "org.cachymusic.app.CMD_STOP";

    static final String ACTION_NATIVE_LOAD = "org.cachymusic.app.NATIVE_LOAD";
    static final String ACTION_NATIVE_COMMAND = "org.cachymusic.app.NATIVE_COMMAND";
    static final String ACTION_NATIVE_ORDER = "org.cachymusic.app.NATIVE_ORDER";
    private static volatile String nativeSnapshot = "{}";
    private static volatile boolean nativeOwned;
    private static volatile boolean serviceRunning;
    static String nativeStatus() { return nativeSnapshot; }
    static boolean ownsNative() { return nativeOwned; }
    static boolean isRunning() { return serviceRunning; }

    // The Activity and service share a process. Only the catalog ID crosses Binder.
    private static final class PlaybackCatalog {
        final String token, id;
        final List<NativePlaybackOrder.Track> tracks;
        final Map<String, Integer> positions;
        final boolean complete;

        PlaybackCatalog(String token, List<NativePlaybackOrder.Track> tracks, CatalogKind kind, boolean complete) {
            this.token = token;
            this.id = UUID.randomUUID().toString();
            this.tracks = Collections.unmodifiableList(tracks);
            this.complete = complete;
            positions = kind == CatalogKind.SHUFFLE ? Collections.emptyMap() : new HashMap<>();
            if (kind != CatalogKind.SHUFFLE) {
                for (int i = 0; i < tracks.size(); i++) {
                    NativePlaybackOrder.Track track = tracks.get(i);
                    positions.put(kind == CatalogKind.QUEUE ? track.queueId : track.uri, i);
                }
            }
        }

        boolean matches(String token, String id) {
            return this.token.equals(token) && this.id.equals(id);
        }
    }

    private static final Map<CatalogKind, PlaybackCatalog> pendingCatalogs = new EnumMap<>(CatalogKind.class);
    static synchronized String registerPlaybackCatalog(String token, List<NativePlaybackOrder.Track> tracks,
            CatalogKind kind, boolean complete) {
        PlaybackCatalog catalog = new PlaybackCatalog(token, tracks, kind, complete);
        pendingCatalogs.put(kind, catalog);
        return catalog.id;
    }

    private static synchronized PlaybackCatalog takePlaybackCatalog(String token, String id, CatalogKind kind) {
        PlaybackCatalog catalog = pendingCatalogs.get(kind);
        return catalog != null && catalog.matches(token, id) ? pendingCatalogs.remove(kind) : null;
    }

    private static synchronized void discardPendingPlaybackCatalogs(String token) {
        pendingCatalogs.values().removeIf(catalog -> catalog.token.equals(token));
    }

    private NativePlayback nativePlayer;
    private NativePlaybackOrder nativeOrder;
    private NativePlaybackOrder.Track currentNativeTrack;
    private final NativeShuffle nativeShuffle = new NativeShuffle(new Random());
    private final Map<CatalogKind, PlaybackCatalog> playbackCatalogs = new EnumMap<>(CatalogKind.class);
    private boolean queueComplete;
    private int nativeRevision;
    private int acknowledgedRevision;
    private final LinkedHashMap<String, Integer> consumedQueue = new LinkedHashMap<>();
    private boolean destroying;
    private final NativeListeningCounter listeningCounter = new NativeListeningCounter();
    private String listeningVisit = "", listeningGeneration = null;
    private long listeningRetryAt;
    private void beginNativeListening(boolean continuation) {
        listeningVisit = "native-" + UUID.randomUUID();
        listeningGeneration = NativeListeningJournal.generation(this);
        listeningRetryAt = 0;
        listeningCounter.begin();
        // A mid-track handoff may already have qualified in the WebView.
        // Conservatively avoid a second count until the next native visit.
        if (continuation) listeningCounter.committed();
    }
    private void observeNativeListening() {
        if (nativePlayer == null) return;
        String generation = NativeListeningJournal.generation(this);
        if (generation == null || !generation.equals(listeningGeneration)) { listeningCounter.interrupt(); return; }
        long now = android.os.SystemClock.elapsedRealtime();
        if (listeningCounter.sample(now, nativePlayer.position, nativePlayer.duration, "playing".equals(nativePlayer.state)) && now >= listeningRetryAt) {
            if (NativeListeningJournal.append(this, generation, listeningVisit, nativePlayer.uri,
                    currentTitle, currentArtist, currentAlbum, nativePlayer.duration, currentNativeTrack == null ? "" : currentNativeTrack.historyKey)) listeningCounter.committed();
            else listeningRetryAt = now + 5000;
        }
    }
    private BroadcastReceiver noisyReceiver;
    private final Runnable nativeTick = new Runnable(){public void run(){
        if(nativePlayer!=null && nativePlayer.owns()&&"playing".equals(nativePlayer.state)){nativePlayer.refresh();observeNativeListening();publishNativeSnapshot();mainHandler.postDelayed(this,250);}
    }};
    private void publishNativeSnapshot(){
        if(nativePlayer==null)return;
        nativeOwned=nativePlayer.owns();
        try{nativeSnapshot=new JSONObject().put("token",nativePlayer.token).put("uri",nativePlayer.uri).put("revision",nativeRevision)
            .put("consumedQueueIds",new JSONArray(consumedQueue.keySet()))
            .put("shuffle",nativeShuffle.active())
            .put("shuffleExhausted","ended".equals(nativePlayer.state)
                    && nativeOrder != null && (!nativeOrder.queued || queueComplete)
                    && nativeShuffle.active() && nativeShuffle.exhausted())
            .put("state",nativePlayer.state).put("position",nativePlayer.position).put("duration",nativePlayer.duration).toString();}catch(Exception ignored){}
    }
    private void nativeChanged(){
        listeningCounter.interrupt();
        if (!destroying && "ended".equals(nativePlayer.state) && nativeOrder != null) {
            if (nativeOrder.repeatOne) {
                beginNativeListening(false);
                nativePlayer.play();
                return;
            }
            if (moveNative(1, false)) return;
        }
        if ("stopped".equals(nativePlayer.state)) {
            nativeOrder = null;
            nativeShuffle.clear();
            playbackCatalogs.clear();
            discardPendingPlaybackCatalogs(nativePlayer.token);
            currentNativeTrack = null;
        }
        publishNativeSnapshot();
        currentPositionMs=nativePlayer.position;currentDurationMs=nativePlayer.duration;
        currentIsPlaying="playing".equals(nativePlayer.state);
        mainHandler.removeCallbacks(nativeTick);
        if(!destroying){updateWakeLockState();publishNotification();if(currentIsPlaying)mainHandler.postDelayed(nativeTick,250);}
    }
    private boolean nativeCommand(String cmd,long ms){
        if(nativePlayer==null||!nativePlayer.owns())return false;
        switch (cmd) {
            case "play": if ("ended".equals(nativePlayer.state)) beginNativeListening(false); nativePlayer.play(); return true;
            case "pause": nativePlayer.pause(); return true;
            case "seek": nativePlayer.seek(ms); return true;
            case "stop": nativePlayer.stop(); return true;
            case "next": return moveNative(1, true);
            case "prev":
                nativePlayer.refresh();
                if (nativePlayer.position <= 3000 || "error".equals(nativePlayer.state)) {
                    if (moveNative(-1, true)) return true;
                    if (!nativeShuffle.active() || "error".equals(nativePlayer.state)) return false;
                }
                nativePlayer.seek(0);
                nativePlayer.play();
                return true;
            default: return false;
        }
    }

    private void setNativeOrder(Bundle order, String token, String currentUri, boolean rebaseQueue) {
        if (order == null) {
            nativeOrder = null;
            nativeShuffle.clear();
            return;
        }
        NativePlaybackOrder candidate = new NativePlaybackOrder(readNativeTracks(order.getParcelableArrayList("tracks")), order.getInt("index"),
                order.getBoolean("complete"), order.getBoolean("repeatAll"), order.getBoolean("repeatOne"), order.getBoolean("queued"));
        if (!candidate.matches(currentUri) && !(rebaseQueue && candidate.queued)) return;
        nativeOrder = candidate;
        queueComplete = order.getBoolean("queueComplete");
        if (candidate.queued && currentNativeTrack != null) {
            PlaybackCatalog catalog = resolvePlaybackCatalog(token, order.getString("queueCatalogId", ""), CatalogKind.QUEUE);
            Integer head = catalog == null ? null : catalog.positions.get(order.getString("queueCatalogHead"));
            if (head != null) {
                ArrayList<NativePlaybackOrder.Track> remaining = new ArrayList<>();
                remaining.add(currentNativeTrack);
                for (int i = head; i < catalog.tracks.size(); i++) {
                    NativePlaybackOrder.Track track = catalog.tracks.get(i);
                    if (!consumedQueue.containsKey(track.queueId)) remaining.add(track);
                }
                nativeOrder = new NativePlaybackOrder(remaining, 0, false, candidate.repeatAll, candidate.repeatOne, true);
                queueComplete = catalog.complete;
            }
        }
        ArrayList<Bundle> shuffleRows = order.getParcelableArrayList("shuffleTracks");
        if (shuffleRows != null && currentNativeTrack != null) {
            PlaybackCatalog catalog = resolvePlaybackCatalog(token, order.getString("shuffleCatalogId", ""), CatalogKind.SHUFFLE);
            if (catalog != null) {
                nativeShuffle.update(catalog.tracks, catalog.complete, currentNativeTrack);
            } else {
                nativeShuffle.update(readNativeTracks(shuffleRows), order.getBoolean("shuffleComplete"), currentNativeTrack);
            }
            return;
        }
        nativeShuffle.clear();
        if (!candidate.queued) {
            PlaybackCatalog catalog = resolvePlaybackCatalog(token, order.getString("orderedCatalogId", ""), CatalogKind.ORDERED);
            Integer index = catalog == null ? null : catalog.positions.get(currentUri);
            if (index != null) {
                nativeOrder = new NativePlaybackOrder(catalog.tracks, index, catalog.complete, candidate.repeatAll,
                        candidate.repeatOne, false);
            }
        }
    }

    private PlaybackCatalog resolvePlaybackCatalog(String token, String id, CatalogKind kind) {
        if (id.isEmpty()) return null;
        PlaybackCatalog catalog = playbackCatalogs.get(kind);
        if (catalog != null && catalog.matches(token, id)) return catalog;
        catalog = takePlaybackCatalog(token, id, kind);
        if (catalog != null) playbackCatalogs.put(kind, catalog);
        return catalog;
    }

    private ArrayList<NativePlaybackOrder.Track> readNativeTracks(ArrayList<Bundle> rows) {
        ArrayList<NativePlaybackOrder.Track> tracks = new ArrayList<>();
        if (rows != null) {
            for (Bundle row : rows) {
                String queueId = row.getString("queueId", "");
                if (consumedQueue.containsKey(queueId)) continue;
                tracks.add(new NativePlaybackOrder.Track(row.getString("uri"), row.getString("title"),
                        row.getString("artist"), row.getString("album"), row.getString("cover"), queueId, row.getString("historyKey", "")));
            }
        }
        return tracks;
    }

    private void updateNativeOrder(Intent intent) {
        if (!nativePlayer.matches(intent.getStringExtra("token"))) return;
        int seenRevision = intent.getIntExtra("revision", -1);
        if (seenRevision < acknowledgedRevision || seenRevision > nativeRevision) return;
        Bundle order = intent.getBundleExtra("order");
        boolean rebaseQueue = seenRevision < nativeRevision;
        if (rebaseQueue && (order == null || !order.getBoolean("queued"))) {
            // A queue clear may race with a track change. Drop the old queue and let the
            // WebView send the ordered library again from the new track.
            if (nativeOrder != null && nativeOrder.queued) nativeOrder = null;
            return;
        }
        acknowledgedRevision = seenRevision;
        // Keep the IDs the WebView hasn't seen so rebasing cannot replay those entries.
        consumedQueue.values().removeIf(revision -> revision <= seenRevision);
        // Accept another bounded queue only while the journal has room for its receipts.
        if (consumedQueue.size() < NativePlaybackOrder.MAX_QUEUE_CATALOG_TRACKS) setNativeOrder(order, nativePlayer.token, nativePlayer.uri, rebaseQueue);
        else nativeOrder = null;
        publishNativeSnapshot();
    }

    private boolean moveNative(int direction, boolean manual) {
        NativePlaybackOrder.Track track;
        if (nativeShuffle.active()) {
            track = direction < 0 ? nativeShuffle.previous()
                    : nativeOrder == null ? null : nativeShuffle.next(nativeOrder, queueComplete, manual);
        } else {
            track = nativeOrder == null ? null : nativeOrder.move(direction, manual);
        }
        if (track == null) return false;
        nativeRevision++;
        if (!track.queueId.isEmpty()) consumedQueue.put(track.queueId, nativeRevision);
        currentNativeTrack = track;
        currentTitle = nonEmpty(track.title, "CachyMusic");
        currentArtist = nonEmpty(track.artist, "Unknown Artist");
        currentAlbum = nonEmpty(track.album, "");
        updateCover(track.cover);
        beginNativeListening(false);
        nativePlayer.load(nativePlayer.token, track.uri, 0, nativePlayer.gain());
        return true;
    }
    private MediaSession mediaSession;
    private PowerManager.WakeLock wakeLock;
    private String currentTitle = "CachyMusic";
    private String currentArtist = "CachyMusic";
    private String currentAlbum = "";
    private String currentCoverKey = "";
    private long coverGeneration = 0;
    private final Handler mainHandler=new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor coverExecutor=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(1),new ThreadPoolExecutor.DiscardOldestPolicy());
    private Bitmap cachedCoverBitmap = null;
    private Bitmap cachedFallbackBitmap = null;
    private String cachedFallbackThemeKey = "";
    private boolean usingFallbackCover = false;
    private String currentTheme = "default";
    private String currentCustomPaletteJson = "";
    private boolean currentIsPlaying = false;
    private float webPlaybackSpeed=1.0f;
    private long currentDurationMs = 0L;
    private long currentPositionMs = 0L;

    @Override
    public void onCreate() {
        super.onCreate();
        serviceRunning = true;
        String savedTheme = getSharedPreferences("cachymusic_prefs", MODE_PRIVATE).getString("appearance_theme", "default");
        currentCustomPaletteJson = getSharedPreferences("cachymusic_prefs", MODE_PRIVATE).getString("appearance_custom_palette", "");
        currentTheme = "custom".equals(savedTheme) ? "custom" : NotificationThemeArt.specFor(savedTheme).id;
        createNotificationChannel();

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CachyMusic:MediaPlaybackWakeLock");
            wakeLock.setReferenceCounted(false);
        }

        mediaSession = new MediaSession(this, "CachyMusicMediaSession");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                dispatchCommandToActivity("play", 0L);
            }

            @Override
            public void onPause() {
                dispatchCommandToActivity("pause", 0L);
            }

            @Override
            public void onSkipToNext() {
                dispatchCommandToActivity("next", 0L);
            }

            @Override
            public void onSkipToPrevious() {
                dispatchCommandToActivity("prev", 0L);
            }

            @Override
            public void onStop() {
                dispatchCommandToActivity("stop", 0L);
                stopServiceCleanly();
            }

            @Override
            public void onSeekTo(long pos) {
                dispatchCommandToActivity("seek", pos);
            }
        });
        mediaSession.setActive(true);
        nativePlayer=new NativePlayback(this,this::nativeChanged);
        noisyReceiver=new BroadcastReceiver(){@Override public void onReceive(Context context,Intent intent){if(AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())&&nativePlayer.owns())nativePlayer.pause();}};
        IntentFilter noisyFilter=new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if(Build.VERSION.SDK_INT>=33)registerReceiver(noisyReceiver,noisyFilter,Context.RECEIVER_NOT_EXPORTED);else registerReceiver(noisyReceiver,noisyFilter);

    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_NOT_STICKY;
        }
        String action = intent.getAction();
        if(ACTION_NATIVE_LOAD.equals(action)){
            String id=intent.getStringExtra("token"), raw=intent.getStringExtra("uri");
            if(id==null||!id.matches("[A-Za-z0-9-]{1,64}")||raw==null||raw.length()>8192||!"content".equals(Uri.parse(raw).getScheme())){stopSelf();return START_NOT_STICKY;}
            if (intent.hasExtra("theme")) {
                currentTheme = NotificationThemeArt.specFor(intent.getStringExtra("theme")).id;
            }
            currentTitle=nonEmpty(intent.getStringExtra("title"),"CachyMusic");currentArtist=nonEmpty(intent.getStringExtra("artist"),"Unknown Artist");currentAlbum=nonEmpty(intent.getStringExtra("album"),"");
            currentIsPlaying=false;currentPositionMs=0;currentDurationMs=0;
            nativeRevision = 0;
            acknowledgedRevision = 0;
            consumedQueue.clear();
            nativeOrder = null;
            nativeShuffle.clear();
            playbackCatalogs.clear();
            currentNativeTrack = new NativePlaybackOrder.Track(raw, currentTitle, currentArtist,
                    currentAlbum, intent.getStringExtra("cover"), "", intent.getStringExtra("historyKey"));
            setNativeOrder(intent.getBundleExtra("order"), id, raw, false);
            updateSessionAndNotification(intent.getStringExtra("cover")); // satisfy foreground-service deadline before opening media
            beginNativeListening(intent.getLongExtra("position",0)>0);
            nativePlayer.load(id,raw,intent.getLongExtra("position",0),intent.getFloatExtra("gain",1f));return START_NOT_STICKY;
        }
        if (ACTION_NATIVE_ORDER.equals(action)) {
            updateNativeOrder(intent);
            return START_NOT_STICKY;
        }
        if(ACTION_NATIVE_COMMAND.equals(action)){
            if (nativePlayer.matches(intent.getStringExtra("token"))) {
                String cmd = intent.getStringExtra("cmd");
                long position = intent.getLongExtra("position", 0);
                if ("gain".equals(cmd)) nativePlayer.gain(intent.getFloatExtra("gain", 1f));
                else if ("next".equals(cmd) || "prev".equals(cmd)) dispatchCommandToActivity(cmd, position);
                else if (cmd != null) nativeCommand(cmd, position);
            }
            return START_NOT_STICKY;
        }
        if (ACTION_STOP_SERVICE.equals(action)) {
            stopServiceCleanly();
            return START_NOT_STICKY;
        }
        if (ACTION_CMD_PLAY.equals(action)) {
            dispatchCommandToActivity("play", 0L);
            return START_NOT_STICKY;
        }
        if (ACTION_CMD_PAUSE.equals(action)) {
            dispatchCommandToActivity("pause", 0L);
            return START_NOT_STICKY;
        }
        if (ACTION_CMD_NEXT.equals(action)) {
            dispatchCommandToActivity("next", 0L);
            return START_NOT_STICKY;
        }
        if (ACTION_CMD_PREV.equals(action)) {
            dispatchCommandToActivity("prev", 0L);
            return START_NOT_STICKY;
        }
        if (ACTION_CMD_STOP.equals(action)) {
            dispatchCommandToActivity("stop", 0L);
            stopServiceCleanly();
            return START_NOT_STICKY;
        }

        if (ACTION_THEME_UPDATE.equals(action)) {
            String nextTheme = intent.getStringExtra("theme");
            if (intent.hasExtra("custom_palette")) {
                String pal = intent.getStringExtra("custom_palette");
                currentCustomPaletteJson = pal != null ? pal : "";
            }
            currentTheme = "custom".equals(nextTheme) ? "custom" : NotificationThemeArt.specFor(nextTheme).id;
            if (usingFallbackCover || cachedCoverBitmap == null) {
                cachedCoverBitmap = getFallbackCoverBitmap();
                usingFallbackCover = true;
            }
            publishNotification();
            return START_NOT_STICKY;
        }

        if (ACTION_UPDATE.equals(action)) {
            if(nativeOwned)return START_NOT_STICKY;
            if (intent.hasExtra("theme")) {
                currentTheme = NotificationThemeArt.specFor(intent.getStringExtra("theme")).id;
            }
            currentTitle = nonEmpty(intent.getStringExtra("title"), "CachyMusic");
            currentArtist = nonEmpty(intent.getStringExtra("artist"), "Unknown Artist");
            currentAlbum = intent.getStringExtra("album") != null ? intent.getStringExtra("album") : "";
            String cover = intent.getStringExtra("cover") != null ? intent.getStringExtra("cover") : "";
            currentIsPlaying = intent.getBooleanExtra("isPlaying", false);
            float speed=intent.getFloatExtra("speed",1.0f);
            webPlaybackSpeed=Float.isFinite(speed)&&speed>0&&speed<=8?speed:1.0f;
            currentDurationMs = Math.max(0L, intent.getLongExtra("durationMs", 0L));
            currentPositionMs = Math.max(0L, intent.getLongExtra("positionMs", 0L));

            updateWakeLockState();
            updateSessionAndNotification(cover);
        }
        return START_NOT_STICKY;
    }

    private void updateWakeLockState() {
        try {
            if (wakeLock == null) return;
            if (currentIsPlaying && !wakeLock.isHeld()) {
                wakeLock.acquire(4 * 60 * 60 * 1000L); // Safety cap 4h per continuous play session
            } else if (!currentIsPlaying && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception e) {
            Log.w(TAG, "WakeLock update error: " + e.getMessage());
        }
    }

    private void updateSessionAndNotification(final String coverUrl) {
        updateCover(coverUrl);
        publishNotification();
    }

    private void updateCover(String coverUrl) {
        String key=coverUrl==null?"":coverUrl;
        if(!key.equals(currentCoverKey)){
            currentCoverKey=key;final long generation=++coverGeneration;
            cachedCoverBitmap=getFallbackCoverBitmap();
            usingFallbackCover=true;
            if(!key.isEmpty())coverExecutor.execute(()->{
                Bitmap decoded=decodeCoverBitmap(key);
                mainHandler.post(()->{
                    if(mediaSession==null||generation!=coverGeneration){if(decoded!=null)decoded.recycle();return;}
                    usingFallbackCover=(decoded==null);
                    cachedCoverBitmap=decoded!=null?decoded:getFallbackCoverBitmap();
                    publishNotification();
                });
            });
        } else if (usingFallbackCover || cachedCoverBitmap == null) {
            cachedCoverBitmap = getFallbackCoverBitmap();
            usingFallbackCover = true;
        }
    }

    private void publishNotification() {
        if (mediaSession == null) return;

        if(nativePlayer!=null&&nativePlayer.owns()){nativePlayer.refresh();currentPositionMs=nativePlayer.position;currentDurationMs=nativePlayer.duration;}
        long actions = PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT
                | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                | PlaybackState.ACTION_SEEK_TO
                | PlaybackState.ACTION_STOP
                | (currentIsPlaying ? PlaybackState.ACTION_PAUSE : PlaybackState.ACTION_PLAY);

        PlaybackState state = new PlaybackState.Builder()
                .setActions(actions)
                .setState(
                        nativeOwned&&"loading".equals(nativePlayer.state)?PlaybackState.STATE_BUFFERING:(currentIsPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED),
                        currentPositionMs,
                        currentIsPlaying ? (nativeOwned?1.0f:webPlaybackSpeed) : 0.0f
                )
                .build();
        mediaSession.setPlaybackState(state);

        MediaMetadata.Builder meta = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, currentTitle)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, currentArtist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, currentAlbum)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, currentDurationMs);
        if (cachedCoverBitmap != null) {
            meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, cachedCoverBitmap);
            meta.putBitmap(MediaMetadata.METADATA_KEY_ART, cachedCoverBitmap);
        }
        mediaSession.setMetadata(meta.build());

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openIntent, piFlags);
        mediaSession.setSessionActivity(contentIntent);

        PendingIntent prevPi = serviceActionIntent(ACTION_CMD_PREV, 1, piFlags);
        PendingIntent togglePi = serviceActionIntent(currentIsPlaying ? ACTION_CMD_PAUSE : ACTION_CMD_PLAY, 2, piFlags);
        PendingIntent nextPi = serviceActionIntent(ACTION_CMD_NEXT, 3, piFlags);
        PendingIntent stopPi = serviceActionIntent(ACTION_CMD_STOP, 4, piFlags);

        Notification.Builder builder = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        NotificationThemeArt.ThemeSpec themeSpec = NotificationThemeArt.resolveSpec(currentTheme, currentCustomPaletteJson);
        builder.setSmallIcon(R.drawable.ic_stat_cachymusic)
                .setColor(themeSpec.surfaceColor)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setSubText(currentAlbum)
                .setContentIntent(contentIntent)
                .setDeleteIntent(stopPi)
                .setOngoing(currentIsPlaying)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(R.drawable.ic_notif_prev, "Previous", prevPi)
                .addAction(
                        currentIsPlaying ? R.drawable.ic_notif_pause : R.drawable.ic_notif_play,
                        currentIsPlaying ? "Pause" : "Play",
                        togglePi
                )
                .addAction(R.drawable.ic_notif_next, "Next", nextPi)
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder.setColorized(true);
        }

        if (cachedCoverBitmap != null) {
            builder.setLargeIcon(cachedCoverBitmap);
        }

        Notification notif = builder.build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notif);
        }
    }

    private PendingIntent serviceActionIntent(String action, int reqCode, int flags) {
        Intent i = new Intent(this, MediaPlaybackService.class);
        i.setAction(action);
        return PendingIntent.getService(this, reqCode, i, flags);
    }

    private void dispatchCommandToActivity(String cmd, long seekMs) {
        if(nativeCommand(cmd,seekMs))return;
        Intent i = new Intent(BROADCAST_MEDIA_COMMAND);
        i.setPackage(getPackageName());
        i.putExtra(EXTRA_CMD, cmd);
        i.putExtra("seekMs", seekMs);
        sendBroadcast(i, MEDIA_COMMAND_PERMISSION);
    }

    private void stopServiceCleanly() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception ignored) {}
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }

    private Bitmap getFallbackCoverBitmap() {
        String cacheKey = "custom".equals(currentTheme) ? ("custom:" + currentCustomPaletteJson) : currentTheme;
        if (cachedFallbackBitmap != null && !cachedFallbackBitmap.isRecycled() && cacheKey.equals(cachedFallbackThemeKey)) {
            return cachedFallbackBitmap;
        }
        try {
            NotificationThemeArt.ThemeSpec spec = NotificationThemeArt.resolveSpec(currentTheme, currentCustomPaletteJson);
            Bitmap rendered = NotificationThemeArt.renderFallbackCover(spec, 256);
            if (rendered != null) {
                cachedFallbackBitmap = rendered;
                cachedFallbackThemeKey = cacheKey;
                return rendered;
            }
        } catch (Exception ignored) {}
        try {
            Bitmap fallback = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
            Bitmap scaled = scaleBitmap(fallback, 256);
            if (scaled != fallback && fallback != null) fallback.recycle();
            cachedFallbackBitmap = scaled;
            cachedFallbackThemeKey = cacheKey;
            return scaled;
        } catch (Exception innerIgnored) {
            return null;
        }
    }

    private Bitmap decodeCoverBitmap(String coverUrl) {
        if(coverUrl==null||coverUrl.length()>256*1024)return null;
        try{
            byte[] raw=null;
            if(coverUrl.startsWith("data:image/jpeg;base64,")||coverUrl.startsWith("data:image/png;base64,")){
                raw=Base64.decode(coverUrl.substring(coverUrl.indexOf(',')+1),Base64.DEFAULT);
            }else{
                Uri parsed=Uri.parse(coverUrl);
                if(!"https".equals(parsed.getScheme())||!"appassets.androidplatform.net".equals(parsed.getHost())||parsed.getPort()!=-1||parsed.getUserInfo()!=null)return null;
                String path=parsed.getPath();
                if("/android-media-art".equals(path)){
                    String uriParam=parsed.getQueryParameter("uri");
                    if(uriParam!=null&&"content".equals(Uri.parse(uriParam).getScheme()))raw=MainActivity.resolveTrackArtworkBytes(this,Uri.parse(uriParam));
                }else if("/resources/images/icon-192.png".equals(path)||"/resources/images/icon-512.png".equals(path)){
                    return null;
                }
            }
            if(raw==null||raw.length==0||raw.length>10*1024*1024)return null;
            BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;
            BitmapFactory.decodeByteArray(raw,0,raw.length,bounds);
            if(bounds.outWidth<=0||bounds.outHeight<=0||bounds.outWidth>8192||bounds.outHeight>8192||(long)bounds.outWidth*bounds.outHeight>16000000L)return null;
            int sample=1;while(Math.max(bounds.outWidth,bounds.outHeight)/sample>512)sample*=2;
            BitmapFactory.Options opts=new BitmapFactory.Options();opts.inSampleSize=sample;
            Bitmap bitmap=BitmapFactory.decodeByteArray(raw,0,raw.length,opts);
            if(bitmap==null)return null;Bitmap scaled=scaleBitmap(bitmap,256);if(scaled!=bitmap)bitmap.recycle();return scaled;
        }catch(Exception ignored){return null;}
    }

    private static Bitmap scaleBitmap(Bitmap src, int maxPx) {
        if (src == null) return null;
        int w = src.getWidth();
        int h = src.getHeight();
        if (w <= maxPx && h <= maxPx) return src;
        float ratio = Math.min((float) maxPx / w, (float) maxPx / h);
        return Bitmap.createScaledBitmap(src, Math.max(1, Math.round(w * ratio)), Math.max(1, Math.round(h * ratio)), true);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "CachyMusic Playback",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Background audio playback controls");
            channel.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private static String nonEmpty(String val, String fallback) {
        return (val != null && !val.trim().isEmpty()) ? val : fallback;
    }

    @Override
    public void onDestroy() {
        serviceRunning = false;
        destroying=true;++coverGeneration;coverExecutor.shutdownNow();mainHandler.removeCallbacks(nativeTick);
        if(noisyReceiver!=null)unregisterReceiver(noisyReceiver);
        if(nativePlayer!=null){nativePlayer.stop();nativePlayer=null;} nativeOwned=false;
        stopServiceCleanly();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
