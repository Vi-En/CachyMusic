package org.cachymusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Base64;
import android.util.Log;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

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

    public static final String BROADCAST_MEDIA_COMMAND = "org.cachymusic.app.MEDIA_COMMAND";
    public static final String EXTRA_CMD = "cmd";

    public static final String ACTION_CMD_PLAY = "org.cachymusic.app.CMD_PLAY";
    public static final String ACTION_CMD_PAUSE = "org.cachymusic.app.CMD_PAUSE";
    public static final String ACTION_CMD_NEXT = "org.cachymusic.app.CMD_NEXT";
    public static final String ACTION_CMD_PREV = "org.cachymusic.app.CMD_PREV";
    public static final String ACTION_CMD_STOP = "org.cachymusic.app.CMD_STOP";

    private MediaSession mediaSession;
    private PowerManager.WakeLock wakeLock;
    private String currentTitle = "CachyMusic";
    private String currentArtist = "CachyMusic Workstation";
    private String currentAlbum = "";
    private String currentCoverKey = "";
    private Bitmap cachedCoverBitmap = null;
    private boolean currentIsPlaying = false;
    private long currentDurationMs = 0L;
    private long currentPositionMs = 0L;

    @Override
    public void onCreate() {
        super.onCreate();
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
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_NOT_STICKY;
        }
        String action = intent.getAction();
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

        if (ACTION_UPDATE.equals(action)) {
            currentTitle = nonEmpty(intent.getStringExtra("title"), "CachyMusic");
            currentArtist = nonEmpty(intent.getStringExtra("artist"), "Unknown Artist");
            currentAlbum = intent.getStringExtra("album") != null ? intent.getStringExtra("album") : "";
            String cover = intent.getStringExtra("cover") != null ? intent.getStringExtra("cover") : "";
            currentIsPlaying = intent.getBooleanExtra("isPlaying", false);
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
        String key = coverUrl != null ? coverUrl : "";
        if (!key.equals(currentCoverKey)) {
            currentCoverKey = key;
            if (key.isEmpty()) {
                cachedCoverBitmap = getFallbackCoverBitmap();
                publishNotification();
            } else {
                if (cachedCoverBitmap == null) {
                    cachedCoverBitmap = getFallbackCoverBitmap();
                }
                publishNotification();
                new Thread(() -> {
                    Bitmap decoded = decodeCoverBitmap(key);
                    if (key.equals(currentCoverKey)) {
                        cachedCoverBitmap = (decoded != null) ? decoded : getFallbackCoverBitmap();
                        publishNotification();
                    }
                }, "CachyCoverDecode").start();
            }
        } else {
            publishNotification();
        }
    }

    private void publishNotification() {
        if (mediaSession == null) return;

        long actions = PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT
                | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                | PlaybackState.ACTION_SEEK_TO
                | PlaybackState.ACTION_STOP
                | (currentIsPlaying ? PlaybackState.ACTION_PAUSE : PlaybackState.ACTION_PLAY);

        PlaybackState state = new PlaybackState.Builder()
                .setActions(actions)
                .setState(
                        currentIsPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        currentPositionMs,
                        currentIsPlaying ? 1.0f : 0.0f
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

        PendingIntent prevPi = serviceActionIntent(ACTION_CMD_PREV, 1, piFlags);
        PendingIntent togglePi = serviceActionIntent(currentIsPlaying ? ACTION_CMD_PAUSE : ACTION_CMD_PLAY, 2, piFlags);
        PendingIntent nextPi = serviceActionIntent(ACTION_CMD_NEXT, 3, piFlags);
        PendingIntent stopPi = serviceActionIntent(ACTION_CMD_STOP, 4, piFlags);

        Notification.Builder builder = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setSubText(currentAlbum)
                .setContentIntent(contentIntent)
                .setDeleteIntent(stopPi)
                .setOngoing(currentIsPlaying)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(android.R.drawable.ic_media_previous, "Previous", prevPi)
                .addAction(
                        currentIsPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        currentIsPlaying ? "Pause" : "Play",
                        togglePi
                )
                .addAction(android.R.drawable.ic_media_next, "Next", nextPi)
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));

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
        Intent i = new Intent(BROADCAST_MEDIA_COMMAND);
        i.setPackage(getPackageName());
        i.putExtra(EXTRA_CMD, cmd);
        i.putExtra("seekMs", seekMs);
        sendBroadcast(i);
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
        try {
            Bitmap fallback = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
            return scaleBitmap(fallback, 256);
        } catch (Exception ignored) {
            return null;
        }
    }

    private Bitmap decodeCoverBitmap(String coverUrl) {
        if (coverUrl == null || coverUrl.isEmpty()) return getFallbackCoverBitmap();
        try {
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;

            if (coverUrl.startsWith("data:image/")) {
                int comma = coverUrl.indexOf(',');
                if (comma > 0) {
                    byte[] raw = Base64.decode(coverUrl.substring(comma + 1), Base64.DEFAULT);
                    Bitmap bmp = BitmapFactory.decodeByteArray(raw, 0, raw.length, opts);
                    if (bmp != null) return scaleBitmap(bmp, 256);
                }
            } else if (coverUrl.startsWith("https://appassets.androidplatform.net/") || coverUrl.startsWith("https://appassets.androidcache.net/")) {
                Uri parsed = Uri.parse(coverUrl);
                String path = parsed.getPath();
                if (path != null && path.startsWith("/android-media-art")) {
                    String uriParam = parsed.getQueryParameter("uri");
                    if (uriParam != null && !uriParam.isEmpty()) {
                        byte[] artBytes = MainActivity.resolveTrackArtworkBytes(this, Uri.parse(uriParam));
                        if (artBytes != null && artBytes.length > 0) {
                            Bitmap bmp = BitmapFactory.decodeByteArray(artBytes, 0, artBytes.length, opts);
                            if (bmp != null) return scaleBitmap(bmp, 256);
                        }
                    }
                } else if (path != null && path.length() > 1 && !path.toLowerCase(java.util.Locale.ROOT).endsWith(".svg")) {
                    try (InputStream is = getAssets().open(path.substring(1))) {
                        Bitmap bmp = BitmapFactory.decodeStream(is, null, opts);
                        if (bmp != null) return scaleBitmap(bmp, 256);
                    } catch (Exception ignored) {}
                }
            } else if (coverUrl.startsWith("content://") || coverUrl.startsWith("file://")) {
                Uri targetUri = Uri.parse(coverUrl);
                try (InputStream is = getContentResolver().openInputStream(targetUri)) {
                    if (is != null) {
                        Bitmap bmp = BitmapFactory.decodeStream(is, null, opts);
                        if (bmp != null) return scaleBitmap(bmp, 256);
                    }
                } catch (Exception ignored) {}
                byte[] artBytes = MainActivity.resolveTrackArtworkBytes(this, targetUri);
                if (artBytes != null && artBytes.length > 0) {
                    Bitmap bmp = BitmapFactory.decodeByteArray(artBytes, 0, artBytes.length, opts);
                    if (bmp != null) return scaleBitmap(bmp, 256);
                }
            } else if (coverUrl.startsWith("http://") || coverUrl.startsWith("https://")) {
                HttpURLConnection conn = (HttpURLConnection) new URL(coverUrl).openConnection();
                conn.setConnectTimeout(3000);
                conn.setReadTimeout(3000);
                try (InputStream is = conn.getInputStream()) {
                    Bitmap bmp = BitmapFactory.decodeStream(is, null, opts);
                    if (bmp != null) return scaleBitmap(bmp, 256);
                } finally {
                    conn.disconnect();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Cover decode skipped: " + e.getMessage());
        }
        return getFallbackCoverBitmap();
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
