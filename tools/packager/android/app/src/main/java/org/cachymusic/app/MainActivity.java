package org.cachymusic.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.documentfile.provider.DocumentFile;
import androidx.webkit.WebViewAssetLoader;

import android.content.res.AssetFileDescriptor;
import android.os.ParcelFileDescriptor;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Set;
import android.provider.OpenableColumns;

@SuppressWarnings("deprecation")
public class MainActivity extends Activity {
    private static final String TAG = "CachyMusic";

    private static long parseRangeLimit(String value) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException overflow) {
            return Long.MAX_VALUE;
        }
    }
    private static final String PREFS_NAME = "cachymusic_prefs";
    private static final String CACHED_LIB_FILE = "cached_library.json";
    private static final String STANDALONE_URL = "https://appassets.androidplatform.net/index.html";
    private static final int FILECHOOSER_RESULTCODE = 1001;
    private static final int FOLDER_PICKER_RESULTCODE = 1002;

    private WebView webView;
    private SharedPreferences prefs;
    private ValueCallback<Uri[]> uploadMessage;
    private WebViewAssetLoader assetLoader;
    private String currentUrl = STANDALONE_URL;
    private volatile boolean isScanCancelled = false;
    private final Handler webViewHandler = new Handler(Looper.getMainLooper());
    private final java.util.concurrent.ExecutorService scanExecutor = java.util.concurrent.Executors.newSingleThreadExecutor();
    private final java.util.concurrent.atomic.AtomicBoolean scanInProgress = new java.util.concurrent.atomic.AtomicBoolean();
    private final AndroidDirectDecoder directDecoder = new AndroidDirectDecoder();
    private AndroidArtworkEngine artworkEngine;

    private void startLibraryScan(Runnable task) {
        if (activityDestroyed || !scanInProgress.compareAndSet(false, true)) return;
        isScanCancelled = false;
        try {
            scanExecutor.execute(() -> {
                try {
                    if (!activityDestroyed) task.run();
                } finally {
                    scanInProgress.set(false);
                }
            });
        } catch (java.util.concurrent.RejectedExecutionException closed) {
            scanInProgress.set(false);
        }
    }

    private void postToWebView(Runnable task) {
        if (activityDestroyed) return;
        webViewHandler.post(() -> {
            if (!activityDestroyed && webView != null) task.run();
        });
    }

    private BroadcastReceiver mediaCommandReceiver;
    private AudioManager audioManager;
    private AudioDeviceCallback audioDeviceCallback;

    private final java.util.concurrent.ThreadPoolExecutor soulseekRpcPool = new java.util.concurrent.ThreadPoolExecutor(2,4,15,java.util.concurrent.TimeUnit.SECONDS,new java.util.concurrent.ArrayBlockingQueue<>(16),new java.util.concurrent.ThreadPoolExecutor.AbortPolicy());
    private final java.util.concurrent.ThreadPoolExecutor soulseekControlPool = new java.util.concurrent.ThreadPoolExecutor(1,1,0,java.util.concurrent.TimeUnit.SECONDS,new java.util.concurrent.ArrayBlockingQueue<>(4),new java.util.concurrent.ThreadPoolExecutor.AbortPolicy());
    private volatile boolean activityDestroyed=false;
    private final java.util.concurrent.atomic.AtomicLong soulseekRpcEpoch=new java.util.concurrent.atomic.AtomicLong();
    private boolean validSoulseekRpc(String action,String body,String query){return action!=null&&action.matches("[a-z_]{1,32}")&&body!=null&&body.length()<=262144&&query!=null&&query.length()<=4096;}
    public class AndroidBridge {
        @JavascriptInterface
        public boolean isAndroid() {
            return true;
        }

        @JavascriptInterface
        public void openFolderPicker() {
            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION |
                                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                    startActivityForResult(intent, FOLDER_PICKER_RESULTCODE);
                } catch (Exception e) {
                    Log.e(TAG, "Cannot launch SAF folder picker: " + e.getMessage());
                }
            });
        }

        @JavascriptInterface
        public void scanDeviceMusic() {
            scanMediaStoreAsync();
        }

        @JavascriptInterface
        public void cancelScan() {
            isScanCancelled = true;
        }

        @JavascriptInterface
        public String getSavedLibraryJson() {
            return readLibraryCacheJson();
        }

        @JavascriptInterface
        public String getSavedTheme() {
            return getSharedPreferences("cachymusic_prefs", MODE_PRIVATE).getString("appearance_theme", "");
        }

        @JavascriptInterface
        public void saveTheme(String theme) {
            if (activityDestroyed || theme == null || !theme.matches("[a-z-]{1,32}")) return;
            SharedPreferences preferences = getSharedPreferences("cachymusic_prefs", MODE_PRIVATE);
            if (!theme.equals(preferences.getString("appearance_theme", ""))) {
                // Persist before returning from the WebView bridge so closing the app keeps the selection.
                preferences.edit().putString("appearance_theme", theme).commit();
            }
            if (MediaPlaybackService.isRunning()) {
                try {
                    Intent svc = new Intent(MainActivity.this, MediaPlaybackService.class);
                    svc.setAction(MediaPlaybackService.ACTION_THEME_UPDATE);
                    svc.putExtra("theme", theme);
                    startService(svc);
                } catch (Exception ignored) {}
            }
        }

        @JavascriptInterface
        public void setThemeChrome(String hex) {
            if (activityDestroyed || hex == null || !hex.matches("#[0-9a-fA-F]{6}")) return;
            int color = android.graphics.Color.parseColor(hex);
            boolean light = android.graphics.Color.luminance(color) > 0.5;
            runOnUiThread(() -> {
                if (activityDestroyed) return;
                getWindow().setStatusBarColor(color);
                getWindow().setNavigationBarColor(color);
                View decor = getWindow().getDecorView();
                int flags = decor.getSystemUiVisibility() & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (light) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= 26) {
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    if (light) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                }
                decor.setSystemUiVisibility(flags);
            });
        }

        @JavascriptInterface
        public void setSoulseekHost(String host) {
            SharedPreferences sp = getSharedPreferences("cachymusic_prefs", MODE_PRIVATE);
            sp.edit().putString("slsk_host", host != null ? host.trim() : "").apply();
        }

        @JavascriptInterface
        public String getSoulseekHost() {
            SharedPreferences sp = getSharedPreferences("cachymusic_prefs", MODE_PRIVATE);
            return sp.getString("slsk_host", "");
        }

        @JavascriptInterface
        public boolean enqueueSoulseekApi(String id,String action,String bodyJson,String queryString){
            if(activityDestroyed||id==null||!id.matches("[A-Za-z0-9-]{1,64}")||!validSoulseekRpc(action,bodyJson,queryString))return false;
            // Disconnect must remain available even while an authentication request blocks a worker.
            boolean control="logout".equals(action);
            if("power".equals(action))try{control="off".equals(new JSONObject(bodyJson).optString("state"));}catch(Exception ignored){}
            final boolean isControl=control;final long epoch=isControl?soulseekRpcEpoch.incrementAndGet():soulseekRpcEpoch.get();
            final java.util.concurrent.Executor executor=isControl?soulseekControlPool:soulseekRpcPool;
            try{executor.execute(()->{
                if(activityDestroyed)return;
                String result=!isControl&&epoch!=soulseekRpcEpoch.get()?"{\"ok\":false,\"error\":\"Request cancelled\"}":SoulseekClient.getInstance(getApplicationContext()).dispatchApi(action,bodyJson,queryString,()->!activityDestroyed&&epoch==soulseekRpcEpoch.get());
                final String response=result!=null&&result.length()<=2*1024*1024?result:"{\"ok\":false,\"error\":\"Response exceeds budget\"}";
                runOnUiThread(()->{
                    if(activityDestroyed||webView==null||!isTrustedPlaybackPage(webView.getUrl()))return;
                    webView.evaluateJavascript("window.__cachySoulseekResult && window.__cachySoulseekResult("+JSONObject.quote(id)+","+JSONObject.quote(response)+")",null);
                });
            });return true;}catch(java.util.concurrent.RejectedExecutionException busy){return false;}
        }

        @JavascriptInterface
        public String getAudioOutputDevicesJson() {
            return buildAudioDevicesPayload().toString();
        }

        @JavascriptInterface
        public String getHardwareVolumeStatusJson() {
            try {
                AudioManager am = audioManager != null ? audioManager : (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                JSONObject payload = buildAudioDevicesPayload();
                int maxVol = am != null ? Math.max(1, am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)) : 15;
                int curVol = am != null ? am.getStreamVolume(AudioManager.STREAM_MUSIC) : maxVol;
                boolean muted = am != null && am.isStreamMute(AudioManager.STREAM_MUSIC);
                payload.put("success", true);
                payload.put("available", am != null && !am.isVolumeFixed());
                payload.put("backend", payload.optBoolean("isUsbDac", false) ? "android-usb-dac" : "android-audiomanager");
                payload.put("volume", Math.max(0.0, Math.min(1.0, (double) curVol / (double) maxVol)));
                payload.put("muted", muted || curVol == 0);
                payload.put("streamIndex", curVol);
                payload.put("streamMax", maxVol);
                return payload.toString();
            } catch (Exception e) {
                return "{\"success\":false,\"available\":false,\"backend\":\"android-audiomanager\"}";
            }
        }

        @JavascriptInterface
        public boolean setHardwareStreamVolume(double normalizedVol) {
            try {
                AudioManager am = audioManager != null ? audioManager : (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (am == null || am.isVolumeFixed()) return false;
                int maxVol = Math.max(1, am.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
                double clamped = Math.max(0.0, Math.min(1.0, normalizedVol));
                int targetIdx = (int) Math.round(clamped * maxVol);
                am.setStreamVolume(AudioManager.STREAM_MUSIC, targetIdx, 0);
                return true;
            } catch (Exception e) {
                Log.w(TAG, "setHardwareStreamVolume error: " + e.getMessage());
                return false;
            }
        }

        @JavascriptInterface
        public boolean toggleHardwareStreamMute(boolean mute) {
            try {
                AudioManager am = audioManager != null ? audioManager : (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (am == null) return false;
                am.adjustStreamVolume(
                        AudioManager.STREAM_MUSIC,
                        mute ? AudioManager.ADJUST_MUTE : AudioManager.ADJUST_UNMUTE,
                        0
                );
                return true;
            } catch (Exception e) {
                Log.w(TAG, "toggleHardwareStreamMute error: " + e.getMessage());
                return false;
            }
        }

        // Native transport accepts only URI identities from the indexed local library.
        @JavascriptInterface public boolean supportsDirectPcm() { return true; }
        @JavascriptInterface public void prefetchArtwork(String urisJson) {
            if (activityDestroyed || artworkEngine == null || urisJson == null || urisJson.length() > 131072) return;
            try {
                JSONArray arr = new JSONArray(urisJson);
                int cap = Math.min(64, arr.length());
                List<String> valid = new ArrayList<>(cap);
                Map<String, String> indexSnapshot = indexedMedia;
                for (int i = 0; i < cap; i++) {
                    String u = arr.optString(i, "");
                    if (!u.isEmpty() && u.length() <= 8192 && indexSnapshot.containsKey(u)) {
                        valid.add(u);
                    }
                }
                if (!valid.isEmpty()) artworkEngine.prefetchHighPriority(valid);
            } catch (Exception ignored) {}
        }
        @JavascriptInterface public void invalidateArtwork(String uri) {
            if (activityDestroyed || artworkEngine == null || !isIndexedMedia(uri)) return;
            artworkEngine.invalidate(uri);
        }
        @JavascriptInterface public boolean nativeListeningConfigure(boolean enabled, String generation, boolean erase) {
            return !activityDestroyed && NativeListeningJournal.configure(MainActivity.this, enabled, generation, erase);
        }
        @JavascriptInterface public String nativeListeningWarning() { return NativeListeningJournal.warning(); }
        @JavascriptInterface public String nativeListeningPending() {
            return activityDestroyed ? "[]" : NativeListeningJournal.pending(MainActivity.this);
        }
        @JavascriptInterface public boolean nativeListeningAcknowledge(String id, String generation) {
            return !activityDestroyed && NativeListeningJournal.acknowledge(MainActivity.this, id, generation);
        }
        @JavascriptInterface public String nativePlaybackStatus(){return MediaPlaybackService.nativeStatus();}
        @JavascriptInterface public boolean nativePlaybackSupportsQueue() { return true; }
        @JavascriptInterface public boolean nativePlaybackSupportsShuffle() { return true; }
        @JavascriptInterface public String nativePlaybackRegisterShuffle(String token, String raw) {
            return registerPlaybackCatalog(token, raw, NativePlaybackOrder.CatalogKind.SHUFFLE);
        }
        @JavascriptInterface public String nativePlaybackRegisterOrdered(String token, String raw) {
            return registerPlaybackCatalog(token, raw, NativePlaybackOrder.CatalogKind.ORDERED);
        }
        @JavascriptInterface public String nativePlaybackRegisterQueue(String token, String raw) {
            return registerPlaybackCatalog(token, raw, NativePlaybackOrder.CatalogKind.QUEUE);
        }
        private String registerPlaybackCatalog(String token, String raw, NativePlaybackOrder.CatalogKind kind) {
            if (activityDestroyed || token == null || !token.matches("[A-Za-z0-9-]{1,64}")
                    || raw == null || raw.length() > NativePlaybackOrder.MAX_CATALOG_LENGTH) return "";
            try {
                JSONObject catalog = new JSONObject(raw);
                boolean shuffle = kind == NativePlaybackOrder.CatalogKind.SHUFFLE;
                boolean queued = kind == NativePlaybackOrder.CatalogKind.QUEUE;
                JSONArray items = catalog.getJSONArray(shuffle ? "shuffleTracks" : "tracks");
                int limit = queued ? NativePlaybackOrder.MAX_QUEUE_CATALOG_TRACKS : NativePlaybackOrder.MAX_CATALOG_TRACKS;
                if (items.length() > limit) return "";
                Map<String, String> indexSnapshot = indexedMedia;
                Set<String> seen = new HashSet<>();
                ArrayList<NativePlaybackOrder.Track> tracks = new ArrayList<>();
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.getJSONObject(i);
                    String uri = item.getString("uri");
                    String queueId = queued ? item.getString("queueId") : "";
                    if (queued && !queueId.matches("[A-Za-z0-9-]{1,64}")) return "";
                    if (uri.length() <= 8192 && indexSnapshot.containsKey(uri) && seen.add(queued ? queueId : uri)) {
                        tracks.add(new NativePlaybackOrder.Track(uri, boundedText(item.optString("title"), "CachyMusic"),
                                boundedText(item.optString("artist"), "Unknown Artist"), boundedText(item.optString("album"), ""),
                                safeNotificationCover(item.optString("cover")), queueId, approvedHistoryKey(item.optString("historyKey"),uri)));
                    } else if (!shuffle) return "";
                }
                if (activityDestroyed) return "";
                return MediaPlaybackService.registerPlaybackCatalog(token, tracks, kind,
                        catalog.optBoolean(shuffle ? "shuffleComplete" : "complete") && tracks.size() == items.length());
            } catch (JSONException ex) {
                return "";
            }
        }
        @JavascriptInterface public boolean nativePlaybackLoad(String token,String raw,String title,String artist,String album,String cover,long position,double gain){
            return nativePlaybackLoadWithOrder(token,raw,title,artist,album,cover,position,gain,"");
        }
        @JavascriptInterface public boolean nativePlaybackLoadWithOrder(String token,String raw,String title,String artist,String album,String cover,long position,double gain,String order){
            return nativePlaybackLoadWithHistory(token,raw,title,artist,album,cover,position,gain,order,"");
        }
        @JavascriptInterface public boolean nativePlaybackLoadWithHistory(String token,String raw,String title,String artist,String album,String cover,long position,double gain,String order,String historyKey){
            if(activityDestroyed||token==null||!token.matches("[A-Za-z0-9-]{1,64}")||raw==null||raw.length()>8192||!isIndexedMedia(raw)||!Double.isFinite(gain))return false;
            Intent i=new Intent(MainActivity.this,MediaPlaybackService.class).setAction(MediaPlaybackService.ACTION_NATIVE_LOAD);
            i.putExtra("token",token).putExtra("uri",raw).putExtra("title",boundedText(title,"CachyMusic")).putExtra("artist",boundedText(artist,"Unknown Artist")).putExtra("album",boundedText(album,"")).putExtra("cover",safeNotificationCover(cover)).putExtra("position",Math.max(0,position)).putExtra("gain",(float)Math.max(0,Math.min(1,gain)));
            i.putExtra("order", approvedPlaybackOrder(order));
            i.putExtra("historyKey", approvedHistoryKey(historyKey,raw));
            try{if(Build.VERSION.SDK_INT>=26)startForegroundService(i);else startService(i);return true;}catch(Exception ex){return false;}
        }
        @JavascriptInterface public boolean nativePlaybackSetOrder(String token, int revision, String order) {
            if (activityDestroyed || token == null || !token.matches("[A-Za-z0-9-]{1,64}") || revision < 0) return false;
            Intent intent = new Intent(MainActivity.this, MediaPlaybackService.class)
                    .setAction(MediaPlaybackService.ACTION_NATIVE_ORDER)
                    .putExtra("token", token).putExtra("revision", revision)
                    .putExtra("order", approvedPlaybackOrder(order));
            try { startService(intent); return true; } catch (Exception ex) { return false; }
        }
        @JavascriptInterface public boolean nativePlaybackCommand(String token,String cmd,long position,double gain){
            if(activityDestroyed||token==null||!token.matches("[A-Za-z0-9-]{1,64}")||cmd==null||!cmd.matches("play|pause|seek|stop|gain|next|prev")||!Double.isFinite(gain))return false;
            Intent i=new Intent(MainActivity.this,MediaPlaybackService.class).setAction(MediaPlaybackService.ACTION_NATIVE_COMMAND);
            i.putExtra("token",token).putExtra("cmd",cmd).putExtra("position",Math.max(0,position)).putExtra("gain",(float)Math.max(0,Math.min(1,gain)));
            try{startService(i);return true;}catch(Exception ex){return false;}
        }

        @JavascriptInterface
        public void updateMediaNotification(String title, String artist, String album, String coverUrl, boolean isPlaying, long durationMs, long positionMs) {
            updateMediaNotificationV2(title,artist,album,coverUrl,isPlaying,durationMs,positionMs,1.0);
        }

        @JavascriptInterface
        public void updateMediaNotificationV2(String title,String artist,String album,String coverUrl,boolean isPlaying,long durationMs,long positionMs,double speed) {
            if(MediaPlaybackService.ownsNative())return;
            Intent svc = new Intent(MainActivity.this, MediaPlaybackService.class);
            svc.setAction(MediaPlaybackService.ACTION_UPDATE);
            svc.putExtra("title", boundedText(title,"CachyMusic"));
            svc.putExtra("artist", boundedText(artist,"Unknown Artist"));
            svc.putExtra("album", boundedText(album,""));
            svc.putExtra("cover", safeNotificationCover(coverUrl));
            svc.putExtra("isPlaying", isPlaying);
            svc.putExtra("durationMs", durationMs);
            svc.putExtra("positionMs", positionMs);
            svc.putExtra("speed", Double.isFinite(speed)&&speed>0&&speed<=8?(float)speed:1.0f);
            svc.putExtra("theme", getSharedPreferences("cachymusic_prefs", MODE_PRIVATE).getString("appearance_theme", "default"));
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(svc);
                } else {
                    startService(svc);
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed to update MediaPlaybackService: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void stopMediaNotification() {
            if(MediaPlaybackService.ownsNative())return;
            try {
                Intent svc = new Intent(MainActivity.this, MediaPlaybackService.class);
                svc.setAction(MediaPlaybackService.ACTION_STOP_SERVICE);
                stopService(svc);
            } catch (Exception e) {
                Log.w(TAG, "Failed to stop MediaPlaybackService: " + e.getMessage());
            }
        }
    }

    private boolean isTrustedPlaybackPage(String raw){try{Uri u=Uri.parse(raw);return "https".equals(u.getScheme())&&"appassets.androidplatform.net".equals(u.getHost())&&u.getPort()==-1&&u.getUserInfo()==null&&"/index.html".equals(u.getPath());}catch(Exception e){return false;}}
    private static String boundedText(String value,String fallback){return value==null?fallback:value.substring(0,Math.min(1024,value.length()));}
    private Bundle approvedPlaybackOrder(String raw) {
        if (raw == null || raw.isEmpty() || raw.length() > NativePlaybackOrder.MAX_JSON_LENGTH) return null;
        try {
            JSONObject order = new JSONObject(raw);
            JSONArray items = order.getJSONArray("tracks");
            int index = order.getInt("index");
            if (index < 0 || index >= items.length() || items.length() > NativePlaybackOrder.MAX_TRACKS) return null;
            boolean queued = order.optBoolean("queued");
            if (queued && index != 0) return null;
            ArrayList<Bundle> tracks = new ArrayList<>();
            Map<String, String> indexSnapshot = indexedMedia;
            Set<String> seen = new HashSet<>();
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                String uri = item.getString("uri");
                if (uri.length() > 8192 || !indexSnapshot.containsKey(uri)) {
                    if (queued && i > 0) break;
                    return null;
                }
                String queueId = "";
                if (queued && i > 0) {
                    queueId = item.getString("queueId");
                    if (!queueId.matches("[A-Za-z0-9-]{1,64}") || !seen.add(queueId)) return null;
                } else if (!queued && !seen.add(uri)) {
                    return null;
                }
                tracks.add(playbackTrack(item, uri, queueId));
            }
            Bundle result = new Bundle();
            result.putParcelableArrayList("tracks", tracks);
            result.putInt("index", index);
            result.putBoolean("complete", order.optBoolean("complete"));
            result.putBoolean("repeatAll", order.optBoolean("repeatAll"));
            result.putBoolean("repeatOne", order.optBoolean("repeatOne"));
            result.putBoolean("queued", queued);
            result.putBoolean("queueComplete", order.optBoolean("queueComplete") && tracks.size() == items.length());
            String catalogId = order.optString("shuffleCatalogId");
            if (catalogId.matches("[a-f0-9-]{36}")) result.putString("shuffleCatalogId", catalogId);
            String orderedCatalogId = order.optString("orderedCatalogId");
            if (!queued && orderedCatalogId.matches("[a-f0-9-]{36}")) result.putString("orderedCatalogId", orderedCatalogId);
            String queueCatalogId = order.optString("queueCatalogId");
            if (queued && tracks.size() > 1 && queueCatalogId.matches("[a-f0-9-]{36}")) {
                result.putString("queueCatalogId", queueCatalogId);
                result.putString("queueCatalogHead", tracks.get(1).getString("queueId"));
            }
            JSONArray shuffleItems = order.optJSONArray("shuffleTracks");
            if (shuffleItems != null) {
                if (shuffleItems.length() > NativePlaybackOrder.MAX_TRACKS) return null;
                ArrayList<Bundle> shuffleTracks = new ArrayList<>();
                seen.clear();
                for (int i = 0; i < shuffleItems.length(); i++) {
                    JSONObject item = shuffleItems.getJSONObject(i);
                    String uri = item.getString("uri");
                    if (uri.length() <= 8192 && indexSnapshot.containsKey(uri) && seen.add(uri)) {
                        shuffleTracks.add(playbackTrack(item, uri, ""));
                    }
                }
                result.putParcelableArrayList("shuffleTracks", shuffleTracks);
                result.putBoolean("shuffleComplete", order.optBoolean("shuffleComplete")
                        && shuffleTracks.size() == shuffleItems.length());
            }
            return result;
        } catch (JSONException ex) {
            return null;
        }
    }
    private Bundle playbackTrack(JSONObject item, String uri, String queueId) {
        Bundle track = new Bundle();
        track.putString("uri", uri);
        track.putString("title", boundedText(item.optString("title"), "CachyMusic"));
        track.putString("artist", boundedText(item.optString("artist"), "Unknown Artist"));
        track.putString("album", boundedText(item.optString("album"), ""));
        track.putString("cover", safeNotificationCover(item.optString("cover")));
        track.putString("queueId", queueId);
        track.putString("historyKey",approvedHistoryKey(item.optString("historyKey"),uri));
        return track;
    }
    private String approvedHistoryKey(String key, String uri) {
        if (key == null || key.length() > 12000 || !key.startsWith("recording:")) return "";
        try {
            JSONArray fields = new JSONArray(key.substring("recording:".length()));
            if (fields.length() == 3 && "source".equals(fields.getString(0)) && uri.equals(fields.getString(1)) && fields.getJSONArray(2).length() > 0) return key;
        } catch (Exception ignored) {}
        return "";
    }
    private String safeNotificationCover(String raw){
        if(raw==null||raw.length()>256*1024)return "";
        if(raw.startsWith("data:image/jpeg;base64,")||raw.startsWith("data:image/png;base64,"))return raw;
        try{
            Uri u=Uri.parse(raw);
            if(!"https".equals(u.getScheme())||!"appassets.androidplatform.net".equals(u.getHost())||u.getPort()!=-1||u.getUserInfo()!=null)return "";
            String path=u.getPath();
            if("/android-media-art".equals(path)&&isIndexedMedia(u.getQueryParameter("uri")))return raw;
            if("/resources/images/icon-192.png".equals(path)||"/resources/images/icon-512.png".equals(path))return raw;
        }catch(Exception ignored){}
        return "";
    }

    // Only media explicitly indexed through MediaStore or SAF may be read by the UI.
    private volatile Map<String, String> indexedMedia = java.util.Collections.emptyMap();
    private void updateIndexedMedia(JSONArray tracks) {
        Map<String,String> next=new HashMap<>();
        if(tracks!=null) for(int i=0;i<tracks.length();i++) {
            JSONObject row=tracks.optJSONObject(i); if(row==null) continue;
            Uri source=Uri.parse(row.optString("src", ""));
            if(!source.isHierarchical())continue;
            String raw=source.getQueryParameter("uri");
            if(raw!=null && "content".equals(Uri.parse(raw).getScheme())) next.put(raw, source.getQueryParameter("mime"));
        }
        indexedMedia=java.util.Collections.unmodifiableMap(next);
        mediaSizeCache.evictAll();
        flacPatchesCache.evictAll();
        if (artworkEngine != null && !indexedMedia.isEmpty()) {
            artworkEngine.prewarmLibrary(indexedMedia.keySet());
        }
    }
    private boolean isIndexedMedia(String raw) { return raw!=null && indexedMedia.containsKey(raw); }
    private WebResourceResponse forbiddenMedia() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }
    private void saveLibraryCacheJson(JSONArray tracksArray, String directoryName) {
        try {
            JSONObject root = new JSONObject();
            root.put("success", true);
            root.put("directory", directoryName != null ? directoryName : "");
            root.put("count", tracksArray != null ? tracksArray.length() : 0);
            root.put("tracks", tracksArray != null ? tracksArray : new JSONArray());
            byte[] bytes = root.toString().getBytes(StandardCharsets.UTF_8);
            File cacheFile = new File(getFilesDir(), CACHED_LIB_FILE);
            try (FileOutputStream fos = new FileOutputStream(cacheFile)) {
                fos.write(bytes);
                fos.flush();
            }
            updateIndexedMedia(tracksArray);
            if (prefs != null) {
                prefs.edit().putString("last_directory", directoryName != null ? directoryName : "").apply();
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to save library cache: " + e.getMessage());
        }
    }

    private String readLibraryCacheJson() {
        try {
            File cacheFile = new File(getFilesDir(), CACHED_LIB_FILE);
            if (!cacheFile.exists() || cacheFile.length() == 0 || cacheFile.length()>64L*1024*1024) return "";
            byte[] buf = new byte[(int) cacheFile.length()];
            try (FileInputStream fis = new FileInputStream(cacheFile)) {
                int read = 0;
                while (read < buf.length) {
                    int r = fis.read(buf, read, buf.length - read);
                    if (r < 0) break;
                    read += r;
                }
            }
            return new String(buf, StandardCharsets.UTF_8);
        } catch (Exception e) {
            Log.e(TAG, "Failed to read library cache: " + e.getMessage());
            return "";
        }
    }

    @SuppressLint("UnspecifiedRegisterReceiverFlag")
    private void registerMediaCommandReceiver() {
        IntentFilter filter = new IntentFilter(MediaPlaybackService.BROADCAST_MEDIA_COMMAND);
        String permission = MediaPlaybackService.MEDIA_COMMAND_PERMISSION;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(mediaCommandReceiver, filter, permission, null, Context.RECEIVER_NOT_EXPORTED);
        } else {
            // Android 12 and older use the app's signature permission to restrict senders.
            registerReceiver(mediaCommandReceiver, filter, permission, null);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        artworkEngine = new AndroidArtworkEngine(this);
        try { String cached=readLibraryCacheJson(); if(!cached.isEmpty())updateIndexedMedia(new JSONObject(cached).optJSONArray("tracks")); }
        catch(Exception ignored) {}
        mediaCommandReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null || webView == null) return;
                String cmd = intent.getStringExtra(MediaPlaybackService.EXTRA_CMD);
                long seekMs = intent.getLongExtra("seekMs", 0L);
                if (cmd == null) return;
                String jsCall;
                switch (cmd) {
                    case "play":
                        jsCall = "window.__cachyMusic && window.__cachyMusic.player && window.__cachyMusic.player.playAudio(true);";
                        break;
                    case "pause":
                    case "stop":
                        jsCall = "window.__cachyMusic && window.__cachyMusic.player && window.__cachyMusic.player.pauseAudio();";
                        break;
                    case "next":
                        jsCall = "window.__cachyMusic && window.__cachyMusic.player && window.__cachyMusic.player.nextTrack(true, false);";
                        break;
                    case "prev":
                        jsCall = "window.__cachyMusic && window.__cachyMusic.player && window.__cachyMusic.player.prevTrack(false);";
                        break;
                    case "seek":
                        double seekSec = seekMs / 1000.0;
                        jsCall = String.format(Locale.US, "window.__cachyMusic && window.__cachyMusic.player && window.__cachyMusic.player.seekAudio(%.3f);", seekSec);
                        break;
                    default:
                        return;
                }
                final String finalJs = jsCall;
                postToWebView(() -> webView.evaluateJavascript(finalJs, null));
            }
        };
        registerMediaCommandReceiver();

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        // Ensure standalone mobile operation: no remote workstation host needed
        getSharedPreferences("cachymusic_prefs", MODE_PRIVATE).edit().remove("slsk_host").apply();

        // Ensure modern media and audio read permissions are granted on Android 13/14+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.READ_MEDIA_AUDIO}, 101);
            }
        } else {
            if (checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, 101);
            }
        }

        webView = new WebView(this);
        webView.setBackgroundColor(getColor(R.color.player_background));
        
        // Suppress native Android OS scrollbar overlays that cut across web contents
        webView.setHorizontalScrollBarEnabled(false);
        webView.setVerticalScrollBarEnabled(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        setContentView(webView);

        // Configure a native app origin isolated from browser-installed PWA workers.
        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // Register AndroidBridge for native folder directory picking and MediaStore queries
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            audioDeviceCallback = new AudioDeviceCallback() {
                private void notifyWebAudioDevicesChanged() {
                    if (webView != null) {
                        postToWebView(() -> webView.evaluateJavascript(
                                "if (window.__cachyMusic && window.__cachyMusic.engine && window.__cachyMusic.engine.checkDacCapabilities) { window.__cachyMusic.engine.checkDacCapabilities(); }",
                                null
                        ));
                    }
                }

                @Override
                public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
                    notifyWebAudioDevicesChanged();
                }

                @Override
                public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
                    notifyWebAudioDevicesChanged();
                }
            };
            audioManager.registerAudioDeviceCallback(audioDeviceCallback, new Handler(Looper.getMainLooper()));
        }

        // WebChromeClient with onShowFileChooser supporting multi-track file selection
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (uploadMessage != null) {
                    uploadMessage.onReceiveValue(null);
                }
                uploadMessage = filePathCallback;

                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    String[] requested = fileChooserParams.getAcceptTypes();
                    boolean image = false, text = false;
                    if (requested != null) for (String value : requested) {
                        if (value == null) continue;
                        for (String type : value.split(",")) {
                            type = type.trim().toLowerCase(java.util.Locale.ROOT);
                            if (type.startsWith("image/")) image = true;
                            if (type.startsWith("text/") || type.equals(".lrc") || type.equals(".txt")) text = true;
                        }
                    }
                    // Some providers label FLAC/AIFF and other valid audio as application/octet-stream.
                    // The frontend validates selected files; do not hide those files in the system picker.
                    intent.setType(image ? "image/*" : "*/*");
                    if (image) intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/png", "image/jpeg", "image/webp"});
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                    startActivityForResult(Intent.createChooser(intent, image ? "Select artwork" : text ? "Select lyrics" : "Select audio files"), FILECHOOSER_RESULTCODE);
                } catch (ActivityNotFoundException e) {
                    uploadMessage = null;
                    filePathCallback.onReceiveValue(null);
                    return true;
                }
                return true;
            }
        });

        // WebViewClient intercepting local asset requests, local media streams, and mock API calls
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                return !("https".equals(target.getScheme()) && "appassets.androidplatform.net".equals(target.getHost()));
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost()))) {
                    String host = uri.getHost(), endpoint = uri.getPath();
                    boolean allowed = "https".equals(uri.getScheme()) && uri.getPort() == -1 && "GET".equals(request.getMethod()) && !request.isForMainFrame() && host != null && endpoint != null && (
                        ("musicbrainz.org".equals(host) && endpoint.startsWith("/ws/2/recording")) ||
                        ("lrclib.net".equals(host) && "/api/search".equals(endpoint)) ||
                        ("coverartarchive.org".equals(host) && endpoint.startsWith("/release/")) ||
                        (("archive.org".equals(host) || host.endsWith(".archive.org")) && endpoint.contains("/items/")));
                    if (allowed) return null; // browser fetch still enforces CSP, TLS and CORS
                    return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
                }
                String path = uri.getPath();

                // 1. Direct artwork, direct native PCM decode, and local audio streaming via ContentResolver
                if ("/android-media-art".equals(path)) {
                    String uriParam = uri.getQueryParameter("uri");
                    if (!isIndexedMedia(uriParam) || !"GET".equals(request.getMethod())) return forbiddenMedia();
                    if (uriParam != null && artworkEngine != null) {
                        boolean isThumb = "1".equals(uri.getQueryParameter("thumb"));
                        byte[] art = artworkEngine.loadArtwork(uriParam, isThumb);
                        if (art != null && art.length > 0) {
                            Map<String, String> headers = new HashMap<>();
                            headers.put("Cache-Control", "public, max-age=31536000, immutable");
                            headers.put("Content-Length", String.valueOf(art.length));
                            headers.put("Access-Control-Allow-Origin", "https://appassets.androidplatform.net");
                            return new WebResourceResponse("image/webp", null, 200, "OK", headers, new ByteArrayInputStream(art));
                        }
                        byte[] fallbackSvg = artworkEngine.loadDefaultSvg();
                        if (fallbackSvg != null && fallbackSvg.length > 0) {
                            Map<String, String> headers = new HashMap<>();
                            headers.put("Cache-Control", "public, max-age=86400");
                            headers.put("Content-Length", String.valueOf(fallbackSvg.length));
                            return new WebResourceResponse("image/svg+xml", "UTF-8", 200, "OK", headers, new ByteArrayInputStream(fallbackSvg));
                        }
                    }
                }

                if ("/android-pcm-open".equals(path)) {
                    String uriParam = uri.getQueryParameter("uri");
                    if (!isIndexedMedia(uriParam) || !"GET".equals(request.getMethod())) return forbiddenMedia();
                    try {
                        AndroidDirectDecoder.OpenResult opened = directDecoder.open(MainActivity.this, Uri.parse(uriParam));
                        JSONObject payload = new JSONObject()
                                .put("ok", true)
                                .put("sessionId", opened.sessionId)
                                .put("sampleRate", opened.sampleRate)
                                .put("channels", opened.channels)
                                .put("durationUs", opened.durationUs)
                                .put("isFloat", opened.pcmEncoding == AudioFormat.ENCODING_PCM_FLOAT)
                                .put("mime", opened.mime);
                        Map<String, String> headers = new HashMap<>();
                        headers.put("Cache-Control", "no-store");
                        return new WebResourceResponse("application/json", "UTF-8", 200, "OK", headers,
                                new ByteArrayInputStream(payload.toString().getBytes(StandardCharsets.UTF_8)));
                    } catch (Exception e) {
                        Log.w(TAG, "Direct PCM open error: " + e.getMessage());
                        return forbiddenMedia();
                    }
                }

                if ("/android-pcm-read".equals(path)) {
                    if (!"GET".equals(request.getMethod())) return forbiddenMedia();
                    String sessionId = uri.getQueryParameter("session");
                    String seekStr = uri.getQueryParameter("seekUs");
                    String framesStr = uri.getQueryParameter("frames");
                    if (sessionId == null || !sessionId.matches("[A-Za-z0-9-]{1,64}")) return forbiddenMedia();
                    try {
                        long seekUs = seekStr != null ? Long.parseLong(seekStr) : -1L;
                        int frames = framesStr != null ? Integer.parseInt(framesStr) : 12000;
                        byte[] packet = directDecoder.readChunk(sessionId, seekUs, frames);
                        if (packet == null) return forbiddenMedia();
                        Map<String, String> headers = new HashMap<>();
                        headers.put("Cache-Control", "no-store");
                        headers.put("Content-Length", String.valueOf(packet.length));
                        return new WebResourceResponse("application/octet-stream", null, 200, "OK", headers,
                                new ByteArrayInputStream(packet));
                    } catch (Exception e) {
                        Log.w(TAG, "Direct PCM read error: " + e.getMessage());
                        return forbiddenMedia();
                    }
                }

                if ("/android-pcm-close".equals(path)) {
                    String sessionId = uri.getQueryParameter("session");
                    if (sessionId != null && sessionId.matches("[A-Za-z0-9-]{1,64}")) {
                        directDecoder.close(sessionId);
                    }
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Cache-Control", "no-store");
                    return new WebResourceResponse("application/json", "UTF-8", 200, "OK", headers,
                            new ByteArrayInputStream("{\"ok\":true}".getBytes(StandardCharsets.UTF_8)));
                }

                if ("/android-media".equals(path)) {
                    if (request != null && "OPTIONS".equalsIgnoreCase(request.getMethod())) {
                        Map<String, String> corsHeaders = new HashMap<>();
                        corsHeaders.put("Access-Control-Allow-Origin", "https://appassets.androidplatform.net");
                        corsHeaders.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                        corsHeaders.put("Access-Control-Allow-Headers", "*");
                        return new WebResourceResponse("text/plain", "UTF-8", 200, "OK", corsHeaders,
                                new ByteArrayInputStream(new byte[0]));
                    }
                    String uriParam = uri.getQueryParameter("uri");
                    if (!isIndexedMedia(uriParam) || !("GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod()))) return forbiddenMedia();
                    if (uriParam != null) {
                        try {
                            Uri mediaUri = Uri.parse(uriParam);
                            return handleAndroidMediaStream(uri, mediaUri, request);
                        } catch (Exception e) {
                            Log.e(TAG, "Audio stream intercept error: " + e.getMessage());
                        }
                    }
                }

                // 2. Mock PHP backend endpoints for 100% offline standalone operation
                if (path != null && path.contains("php/api/")) {
                    if (path.contains("playlists.php")) {
                        String json = "{\"success\": true, \"playlists\": []}";
                        return new WebResourceResponse("application/json", "UTF-8",
                                new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
                    }
                    if (path.contains("scan.php")) {
                        String cached = readLibraryCacheJson();
                        String json = (cached != null && !cached.isEmpty())
                                ? cached
                                : "{\"success\": true, \"tracks\": [], \"count\": 0, \"directory\": \"\", \"needsDirectory\": true}";
                        return new WebResourceResponse("application/json", "UTF-8",
                                new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
                    }
                    if (path.contains("soulseek.php")) {
                        return forbiddenMedia(); // native Soulseek RPC only; no actions via URL/query
                    }
                    if (path.contains("hardware_volume.php")) {
                        String json = "{\"success\": true, \"available\": false, \"supported\": false, \"backend\": \"android-unsupported\"}";
                        return new WebResourceResponse("application/json", "UTF-8",
                                new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
                    }
                    if (path.contains("mpris_state.php")) {
                        String json = "{\"success\": true, \"command\": null}";
                        return new WebResourceResponse("application/json", "UTF-8",
                                new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
                    }
                }

                // Default asset loader
                WebResourceResponse asset = assetLoader.shouldInterceptRequest(uri);
                return asset != null ? asset : new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                currentUrl = url;
            }
        });

        // Always boot directly into self-contained standalone workstation
        currentUrl = STANDALONE_URL;
        webView.loadUrl(STANDALONE_URL);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILECHOOSER_RESULTCODE) {
            if (uploadMessage != null) {
                Uri[] results = null;
                if (resultCode == Activity.RESULT_OK && data != null) {
                    ClipData clip = data.getClipData();
                    if (clip != null && clip.getItemCount() > 0) {
                        results = new Uri[clip.getItemCount()];
                        for (int i = 0; i < clip.getItemCount(); i++) {
                            results[i] = clip.getItemAt(i).getUri();
                        }
                    } else if (data.getData() != null) {
                        results = new Uri[]{ data.getData() };
                    } else {
                        results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                    }
                }
                uploadMessage.onReceiveValue(results);
                uploadMessage = null;
            }
        } else if (requestCode == FOLDER_PICKER_RESULTCODE) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                Uri treeUri = data.getData();
                if (treeUri != null) {
                    try {
                        getContentResolver().takePersistableUriPermission(
                            treeUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    } catch (Exception ignored) {}
                    scanDocumentFolderAsync(treeUri);
                }
            }
        }
    }

    private static class DiscoveredAudioItem {
        final Uri uri;
        final String name;
        final String album;
        final long size;
        DiscoveredAudioItem(Uri uri, String name, String album, long size) {
            this.uri = uri;
            this.name = name;
            this.album = album;
            this.size = size;
        }
    }

    private Map<String, JSONObject> buildMediaStoreFastIndex() {
        Map<String, JSONObject> map = new HashMap<>();
        try {
            Uri musicUri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            String[] projection = new String[]{
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.SIZE,
                MediaStore.Audio.Media.MIME_TYPE,
                MediaStore.Audio.Media.DATA
            };
            try (Cursor cursor = getContentResolver().query(musicUri, projection, null, null, null)) {
                if (cursor != null) {
                    int nameCol = cursor.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME);
                    int titleCol = cursor.getColumnIndex(MediaStore.Audio.Media.TITLE);
                    int artistCol = cursor.getColumnIndex(MediaStore.Audio.Media.ARTIST);
                    int albumCol = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM);
                    int durCol = cursor.getColumnIndex(MediaStore.Audio.Media.DURATION);
                    int sizeCol = cursor.getColumnIndex(MediaStore.Audio.Media.SIZE);
                    int mimeCol = cursor.getColumnIndex(MediaStore.Audio.Media.MIME_TYPE);
                    int dataCol = cursor.getColumnIndex(MediaStore.Audio.Media.DATA);

                    while (cursor.moveToNext()) {
                        String name = nameCol != -1 ? cursor.getString(nameCol) : null;
                        if (name == null || name.isEmpty()) continue;
                        long sz = sizeCol != -1 ? cursor.getLong(sizeCol) : 0;
                        JSONObject obj = new JSONObject();
                        if (titleCol != -1) obj.put("title", cursor.getString(titleCol));
                        if (artistCol != -1) obj.put("artist", cursor.getString(artistCol));
                        if (albumCol != -1) obj.put("album", cursor.getString(albumCol));
                        if (durCol != -1) obj.put("duration", cursor.getLong(durCol));
                        if (sizeCol != -1) obj.put("size", sz);
                        if (mimeCol != -1) obj.put("mime", cursor.getString(mimeCol));
                        if (dataCol != -1) obj.put("path", cursor.getString(dataCol));
                        map.put(name.toLowerCase(Locale.ROOT), obj);
                        if (sz > 0) {
                            map.put((name + "_" + sz).toLowerCase(Locale.ROOT), obj);
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "MediaStore fast index query skipped: " + e.getMessage());
        }
        return map;
    }

    private void scanDocumentFolderAsync(Uri treeUri) {
        startLibraryScan(() -> {
            try {
                DocumentFile pickedDir = DocumentFile.fromTreeUri(this, treeUri);
                if (pickedDir == null) return;

                String folderName = pickedDir.getName();
                if (folderName == null) folderName = "Selected Folder";
                final String fName = folderName;

                postToWebView(() -> {
                    String js = "if (window.__cachyMusic && window.__cachyMusic.android && window.__cachyMusic.android.onScanProgress) { window.__cachyMusic.android.onScanProgress(0, 0, " + JSONObject.quote(fName) + ", 0); }";
                    webView.evaluateJavascript(js, null);
                });

                // Phase 1: Rapid file discovery pass (using high-speed DocumentsContract cursor query)
                List<DiscoveredAudioItem> discovered = new ArrayList<>();
                try {
                    String rootDocId = DocumentsContract.getTreeDocumentId(treeUri);
                    discoverAudioFilesFast(treeUri, rootDocId, folderName, discovered, 0);
                } catch (Exception docEx) {
                    discoverAudioFilesRecursive(pickedDir, folderName, discovered, 0);
                }

                if (isScanCancelled) {
                    postToWebView(() -> {
                        webView.evaluateJavascript("if (window.__cachyMusic && window.__cachyMusic.android && window.__cachyMusic.android.onScanCancelled) { window.__cachyMusic.android.onScanCancelled(); }", null);
                    });
                    return;
                }

                final int total = discovered.size();
                Map<String, JSONObject> mediaStoreMap = buildMediaStoreFastIndex();
                List<JSONObject> tracksList = new ArrayList<>(total);

                // Phase 2: Metadata mapping with time-throttled progress and ETA updates
                long procStartTime = System.currentTimeMillis();
                long lastProgressTime = 0L;
                for (int i = 0; i < total; i++) {
                    if (isScanCancelled) break;
                    DiscoveredAudioItem item = discovered.get(i);
                    JSONObject track = createTrackMetadata(item.uri, item.name, item.album, item.size, mediaStoreMap);
                    if (track != null) {
                        tracksList.add(track);
                    }

                    long now = System.currentTimeMillis();
                    if (i == total - 1 || (now - lastProgressTime) >= 100L) {
                        lastProgressTime = now;
                        final int count = i + 1;
                        long elapsed = now - procStartTime;
                        int etaSec = 0;
                        if (count > 0 && total > count && elapsed > 0) {
                            double rate = (double) count / elapsed;
                            etaSec = (int) Math.max(0, Math.ceil((total - count) / (rate * 1000.0)));
                        }
                        final int finalEta = etaSec;
                        postToWebView(() -> {
                            String js = "if (window.__cachyMusic && window.__cachyMusic.android && window.__cachyMusic.android.onScanProgress) { window.__cachyMusic.android.onScanProgress("
                                    + count + ", " + total + ", " + JSONObject.quote(fName) + ", " + finalEta + "); }";
                            webView.evaluateJavascript(js, null);
                        });
                    }
                }

                if (isScanCancelled) {
                    postToWebView(() -> {
                        webView.evaluateJavascript("if (window.__cachyMusic && window.__cachyMusic.android && window.__cachyMusic.android.onScanCancelled) { window.__cachyMusic.android.onScanCancelled(); }", null);
                    });
                    return;
                }

                JSONArray tracksArray = new JSONArray();
                for (JSONObject obj : tracksList) {
                    tracksArray.put(obj);
                }

                if (tracksArray.length() > 0) {
                    saveLibraryCacheJson(tracksArray, fName);
                }

                final String jsonString = tracksArray.toString();
                postToWebView(() -> {
                    String js = "if (window.__cachyMusic && window.__cachyMusic.android && window.__cachyMusic.android.onTracksDiscovered) { window.__cachyMusic.android.onTracksDiscovered("
                            + jsonString + ", " + JSONObject.quote(fName) + "); }";
                    webView.evaluateJavascript(js, null);
                });
            } catch (Exception e) {
                Log.e(TAG, "Folder scan error: " + e.getMessage(), e);
            }
        });
    }

    private void discoverAudioFilesFast(Uri treeUri, String parentDocId, String albumDefault, List<DiscoveredAudioItem> items, int depth) {
        if (isScanCancelled || depth > 8 || items.size() > 10000) return;
        try {
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId);
            String[] projection = new String[]{
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE,
                    DocumentsContract.Document.COLUMN_SIZE
            };
            try (Cursor cursor = getContentResolver().query(childrenUri, projection, null, null, null)) {
                if (cursor != null) {
                    int idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID);
                    int nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
                    int mimeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE);
                    int sizeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE);

                    List<String> subdirs = new ArrayList<>();
                    List<String> subdirNames = new ArrayList<>();
                    while (cursor.moveToNext() && !isScanCancelled) {
                        String docId = idCol != -1 ? cursor.getString(idCol) : null;
                        String name = nameCol != -1 ? cursor.getString(nameCol) : null;
                        String mime = mimeCol != -1 ? cursor.getString(mimeCol) : null;
                        long size = sizeCol != -1 ? cursor.getLong(sizeCol) : 0;

                        if (docId == null || name == null) continue;

                        if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                            subdirs.add(docId);
                            subdirNames.add(name);
                        } else if (isAudioFile(name)) {
                            Uri docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
                            items.add(new DiscoveredAudioItem(docUri, name, albumDefault, size));
                        }
                    }

                    for (int i = 0; i < subdirs.size(); i++) {
                        if (isScanCancelled) break;
                        discoverAudioFilesFast(treeUri, subdirs.get(i), subdirNames.get(i), items, depth + 1);
                    }
                    return;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "DocumentsContract fast scan failed: " + e.getMessage());
        }

        DocumentFile pickedDir = DocumentFile.fromTreeUri(this, treeUri);
        if (pickedDir != null) {
            discoverAudioFilesRecursive(pickedDir, albumDefault, items, depth);
        }
    }

    private void discoverAudioFilesRecursive(DocumentFile dir, String albumDefault, List<DiscoveredAudioItem> items, int depth) {
        if (isScanCancelled || depth > 6 || dir == null || items.size() > 5000) return;
        DocumentFile[] files = dir.listFiles();
        if (files == null) return;

        for (DocumentFile file : files) {
            if (isScanCancelled) return;
            if (file.isDirectory()) {
                discoverAudioFilesRecursive(file, file.getName(), items, depth + 1);
            } else {
                String name = file.getName();
                if (name != null && isAudioFile(name)) {
                    items.add(new DiscoveredAudioItem(file.getUri(), name, albumDefault, file.length()));
                }
            }
        }
    }

    private String normalizeMimeType(String mime) {
        if (mime == null || mime.trim().isEmpty()) return "audio/mpeg";
        String lower = mime.toLowerCase().trim();
        if (lower.equals("audio/x-flac") || lower.equals("application/x-flac") || lower.equals("application/flac")) return "audio/flac";
        if (lower.equals("audio/x-wav") || lower.equals("audio/wave") || lower.equals("audio/vnd.wave")) return "audio/wav";
        if (lower.equals("audio/x-m4a") || lower.equals("audio/m4a")) return "audio/mp4";
        if (lower.equals("audio/mp3")) return "audio/mpeg";
        if (lower.equals("audio/x-ogg") || lower.equals("application/ogg") || lower.equals("audio/oga")) return "audio/ogg";
        if (lower.equals("audio/aacp")) return "audio/aac";
        return lower;
    }

    private String fastDetectMime(String filename, String mediaMime) {
        if (filename != null && !filename.trim().isEmpty()) {
            String lower = filename.toLowerCase().trim();
            if (lower.endsWith(".flac")) return "audio/flac";
            if (lower.endsWith(".wav")) return "audio/wav";
            if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
            if (lower.endsWith(".opus")) return "audio/opus";
            if (lower.endsWith(".m4a")) return "audio/mp4";
            if (lower.endsWith(".aac")) return "audio/aac";
            if (lower.endsWith(".mp3")) return "audio/mpeg";
            if (lower.endsWith(".wma")) return "audio/x-ms-wma";
            if (lower.endsWith(".alac")) return "audio/alac";
            if (lower.endsWith(".aiff") || lower.endsWith(".aif")) return "audio/aiff";
        }
        if (mediaMime != null && !mediaMime.trim().isEmpty() && !mediaMime.equals("application/octet-stream")) {
            return normalizeMimeType(mediaMime);
        }
        return "audio/mpeg";
    }

    private final android.util.LruCache<String, Map<Long, Byte>> flacPatchesCache = new android.util.LruCache<>(2048) {
        @Override protected int sizeOf(String key, Map<Long, Byte> value) { return Math.max(1, value.size()); }
    };
    private final android.util.LruCache<String, Long> mediaSizeCache = new android.util.LruCache<>(512);

    public static byte[] resolveTrackArtworkBytes(Context ctx, Uri mediaUri) {
        return AndroidArtworkEngine.resolveTrackArtworkBytes(ctx, mediaUri);
    }

    private static final class AudioHeaderInfo {
        int sampleRate = 44100;
        int bitDepth = 16;
        int channels = 2;
        int bitrateKbps = 0;
        long durationMs = 0;
    }

    private AudioHeaderInfo readFlacHeaderInfo(Uri uri, long fileSize, long knownDurationMs) {
        AudioHeaderInfo info = new AudioHeaderInfo();
        info.durationMs = knownDurationMs;
        if (uri == null) return info;
        try (InputStream is = getContentResolver().openInputStream(uri)) {
            if (is == null) return info;
            byte[] buf = new byte[42];
            int total = 0;
            while (total < buf.length) {
                int r = is.read(buf, total, buf.length - total);
                if (r <= 0) break;
                total += r;
            }
            if (total >= 26 && buf[0] == 'f' && buf[1] == 'L' && buf[2] == 'a' && buf[3] == 'C' && (buf[4] & 0x7F) == 0) {
                // STREAMINFO payload begins at byte 8; sample rate/ch/bps packed at bytes 18..21
                int sr = ((buf[18] & 0xFF) << 12) | ((buf[19] & 0xFF) << 4) | ((buf[20] & 0xF0) >>> 4);
                int ch = ((buf[20] & 0x0E) >>> 1) + 1;
                int bps = (((buf[20] & 0x01) << 4) | ((buf[21] & 0xF0) >>> 4)) + 1;
                if (sr >= 8000 && sr <= 384000) info.sampleRate = sr;
                if (ch >= 1 && ch <= 8) info.channels = ch;
                if (bps >= 8 && bps <= 32) info.bitDepth = bps;
                if (total >= 26 && info.durationMs <= 0 && info.sampleRate > 0) {
                    long totalSamples = ((long)(buf[21] & 0x0F) << 32)
                            | ((long)(buf[22] & 0xFF) << 24)
                            | ((long)(buf[23] & 0xFF) << 16)
                            | ((long)(buf[24] & 0xFF) << 8)
                            | (long)(buf[25] & 0xFF);
                    if (totalSamples > 0) {
                        info.durationMs = (totalSamples * 1000L) / info.sampleRate;
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "FLAC header parse skip: " + e.getMessage());
        }
        if (fileSize > 0 && info.durationMs > 0) {
            info.bitrateKbps = (int) Math.max(64L, (fileSize * 8L) / info.durationMs);
        }
        return info;
    }

    private Map<Long, Byte> getFlacPatches(Uri uri, ParcelFileDescriptor descriptor) {
        if (uri == null || descriptor == null) return java.util.Collections.emptyMap();
        try {
            android.system.StructStat stat = android.system.Os.fstat(descriptor.getFileDescriptor());
            if (!android.system.OsConstants.S_ISREG(stat.st_mode) || stat.st_size<=0) return java.util.Collections.emptyMap();
            String key=MediaRangeContract.version(uri.toString(),stat.st_dev,stat.st_ino,stat.st_size,stat.st_mtime,stat.st_ctime);
            Map<Long,Byte> cached=flacPatchesCache.get(key);
            if(cached!=null)return cached;
            Map<Long,Byte> patches;
            // dup shares the open-file position. Restore it even on malformed metadata.
            android.system.Os.lseek(descriptor.getFileDescriptor(),0,android.system.OsConstants.SEEK_SET);
            try(InputStream input=new ParcelFileDescriptor.AutoCloseInputStream(ParcelFileDescriptor.dup(descriptor.getFileDescriptor()))) {
                patches=FlacPictureMask.scan(input);
            } finally {
                try { android.system.Os.lseek(descriptor.getFileDescriptor(),0,android.system.OsConstants.SEEK_SET); }
                catch (Exception rewindFailure) { try {descriptor.close();} catch(Exception ignored) {} throw rewindFailure; }
            }
            flacPatchesCache.put(key,patches);return patches;
        } catch (Exception error) { return java.util.Collections.emptyMap(); }
    }

    private static class LimitedInputStream extends FilterInputStream {
        private long remaining;
        private final ParcelFileDescriptor pfd;
        private final AssetFileDescriptor afd;
        private final Map<Long, Byte> patches;
        private final long maxPatchPos;
        private long currentPos;

        public LimitedInputStream(InputStream in, long limit, ParcelFileDescriptor pfd, AssetFileDescriptor afd, long startPos, Map<Long, Byte> patches) {
            super(in);
            this.remaining = Math.max(0, limit);
            this.pfd = pfd;
            this.afd = afd;
            this.currentPos = startPos;
            this.patches = patches;
            long maxPos = -1L;
            if (patches != null && !patches.isEmpty()) {
                for (Long key : patches.keySet()) {
                    if (key != null && key > maxPos) maxPos = key;
                }
            }
            this.maxPatchPos = maxPos;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int b = super.read();
            if (b != -1) {
                if (currentPos <= maxPatchPos && patches != null) {
                    Byte p = patches.get(currentPos);
                    if (p != null) {
                        b = p.intValue() & 0xFF;
                    }
                }
                currentPos++;
                remaining--;
            }
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int toRead = (int) Math.min(len, remaining);
            int read = super.read(b, off, toRead);
            if (read > 0) {
                if (currentPos <= maxPatchPos && patches != null) {
                    for (Map.Entry<Long, Byte> entry : patches.entrySet()) {
                        long patchPos = entry.getKey();
                        if (patchPos >= currentPos && patchPos < currentPos + read) {
                            int bufIdx = off + (int)(patchPos - currentPos);
                            b[bufIdx] = entry.getValue();
                        }
                    }
                }
                currentPos += read;
                remaining -= read;
            }
            return read;
        }

        @Override
        public long skip(long n) throws IOException {
            if (remaining <= 0 || n <= 0) return 0;
            long toSkip = Math.min(n, remaining);
            long skipped = super.skip(toSkip);
            if (skipped > 0) {
                currentPos += skipped;
                remaining -= skipped;
            }
            return skipped;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(super.available(), remaining);
        }

        @Override
        public void close() throws IOException {
            try {
                super.close();
            } finally {
                if (pfd != null) {
                    try { pfd.close(); } catch (Exception ignored) {}
                }
                if (afd != null) {
                    try { afd.close(); } catch (Exception ignored) {}
                }
            }
        }
    }

    private InputStream createSeekableStream(ParcelFileDescriptor pfd, AssetFileDescriptor afd, Uri uri, long start, long length, Map<Long, Byte> patches) {
        if (pfd != null) {
            try {
                if (start > 0) {
                    android.system.Os.lseek(pfd.getFileDescriptor(), start, android.system.OsConstants.SEEK_SET);
                }
                FileInputStream fis = new ParcelFileDescriptor.AutoCloseInputStream(pfd);
                return new LimitedInputStream(new BufferedInputStream(fis, 65536), length, pfd, null, start, patches);
            } catch (Throwable e) {
                Log.w(TAG, "pfd Os.lseek fallback: " + e.getMessage());
                try {
                    FileInputStream fis = new FileInputStream(pfd.getFileDescriptor());
                    if (start > 0) {
                        fis.getChannel().position(start);
                    }
                    return new LimitedInputStream(new BufferedInputStream(fis, 65536), length, pfd, null, start, patches);
                } catch (Exception e2) {
                    try { pfd.close(); } catch (Exception ignored) {}
                }
            }
        }

        if (afd != null) {
            try {
                FileInputStream fis = afd.createInputStream();
                if (start > 0) {
                    fis.getChannel().position(afd.getStartOffset() + start);
                }
                return new LimitedInputStream(new BufferedInputStream(fis, 65536), length, null, afd, start, patches);
            } catch (Exception e) {
                Log.w(TAG, "afd seek failed: " + e.getMessage());
                try { afd.close(); } catch (Exception ignored) {}
            }
        }

        // Direct InputStream fallback
        try {
            InputStream is = getContentResolver().openInputStream(uri);
            if (is != null) {
                if (start > 0) {
                    long skipped = 0;
                    byte[] buf = new byte[32768];
                    while (skipped < start) {
                        long toSkip = start - skipped;
                        long s = is.skip(toSkip);
                        if (s <= 0) {
                            int r = is.read(buf, 0, (int) Math.min(buf.length, toSkip));
                            if (r <= 0) break;
                            s = r;
                        }
                        skipped += s;
                    }
                    if(skipped!=start){is.close();return null;}
                }
                return new LimitedInputStream(new BufferedInputStream(is, 65536), length, null, null, start, java.util.Collections.emptyMap());
            }
        } catch (Exception e) {
            Log.e(TAG, "InputStream fallback failed: " + e.getMessage());
        }
        return null;
    }

    // PCM ranges must be bound to the same seekable provider descriptor used to
    // compute the version. Never reopen a different provider stream after validation.
    private WebResourceResponse handleVersionedPcmRange(Uri requestUri, Uri mediaUri, WebResourceRequest request, String startRaw, String endRaw) {
        ParcelFileDescriptor descriptor = null;
        try {
            if (request == null || !"GET".equalsIgnoreCase(request.getMethod()) || startRaw == null || endRaw == null) return forbiddenMedia();
            for (String name : request.getRequestHeaders().keySet()) if ("Range".equalsIgnoreCase(name)) return forbiddenMedia();
            if (requestUri.getQueryParameters("pcmStart").size()!=1 || requestUri.getQueryParameters("pcmEnd").size()!=1 || requestUri.getQueryParameters("pcmVersion").size()>1) return forbiddenMedia();
            long start = MediaRangeContract.offset(startRaw), end = MediaRangeContract.offset(endRaw);
            if (!MediaRangeContract.valid(start,end)) return forbiddenMedia();
            descriptor = getContentResolver().openFileDescriptor(mediaUri,"r");
            if (descriptor == null) return forbiddenMedia();
            android.system.StructStat stat = android.system.Os.fstat(descriptor.getFileDescriptor());
            if (!android.system.OsConstants.S_ISREG(stat.st_mode) || stat.st_size <= 0) return forbiddenMedia();
            long size = stat.st_size;
            String version = MediaRangeContract.version(mediaUri.toString(),stat.st_dev,stat.st_ino,size,stat.st_mtime,stat.st_ctime);
            String expected = requestUri.getQueryParameter("pcmVersion");
            if (expected != null && !version.equals(expected)) return new WebResourceResponse("text/plain","UTF-8",412,"Precondition Failed",java.util.Collections.singletonMap("Cache-Control","no-store"),new ByteArrayInputStream(new byte[0]));
            if (start >= size) return new WebResourceResponse("application/octet-stream",null,416,"Range Not Satisfiable",java.util.Collections.singletonMap("Content-Range","bytes */"+size),new ByteArrayInputStream(new byte[0]));
            end=Math.min(end,size-1);
            long length=end-start+1;
            if (android.system.Os.lseek(descriptor.getFileDescriptor(),start,android.system.OsConstants.SEEK_SET)!=start) return forbiddenMedia();
            InputStream input = new LimitedInputStream(new BufferedInputStream(new ParcelFileDescriptor.AutoCloseInputStream(descriptor),65536),length,null,null,start,java.util.Collections.emptyMap());
            Map<String,String> headers=new HashMap<>();
            headers.put("Content-Range","bytes "+start+"-"+end+"/"+size);
            headers.put("Content-Length",String.valueOf(length));
            headers.put("X-Cachy-Media-Version",version);
            headers.put("Cache-Control","no-store");
            headers.put("Access-Control-Allow-Origin","https://appassets.androidplatform.net");
            headers.put("Access-Control-Expose-Headers","Content-Range, Content-Length, X-Cachy-Media-Version");
            String mime=indexedMedia.get(mediaUri.toString());
            WebResourceResponse response=new WebResourceResponse(mime!=null&&mime.startsWith("audio/")?normalizeMimeType(mime):"application/octet-stream",null,206,"Partial Content",headers,input);
            descriptor=null; // response stream owns the descriptor
            return response;
        } catch (Exception error) { return forbiddenMedia(); }
        finally { if (descriptor!=null) try { descriptor.close(); } catch(Exception ignored) {} }
    }

    private WebResourceResponse handleAndroidMediaStream(Uri requestUri, Uri mediaUri, WebResourceRequest request) {
        try {
            if (request != null && "OPTIONS".equalsIgnoreCase(request.getMethod())) {
                Map<String, String> corsHeaders = new HashMap<>();
                corsHeaders.put("Access-Control-Allow-Origin", "https://appassets.androidplatform.net");
                corsHeaders.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                corsHeaders.put("Access-Control-Allow-Headers", "*");
                return new WebResourceResponse("text/plain", "UTF-8", 204, "No Content", corsHeaders, new ByteArrayInputStream(new byte[0]));
            }

            long totalSize = -1;
            // Do not trust the query-string size; obtain real provider length below.
            String mediaKey = (mediaUri != null) ? mediaUri.toString() : "";
            if (!mediaKey.isEmpty()) {
                Long cachedSz = mediaSizeCache.get(mediaKey);
                if (cachedSz != null && cachedSz > 0) totalSize = cachedSz;
            }

            String mime = indexedMedia.get(mediaUri.toString());
            if(mime==null || !mime.startsWith("audio/"))mime="application/octet-stream";
            mime = normalizeMimeType(mime);

            Map<String, String> requestHeaders = request != null ? request.getRequestHeaders() : null;
            String rangeHeader = requestHeaders != null ? requestHeaders.get("Range") : null;
            if (rangeHeader == null && requestHeaders != null) {
                rangeHeader = requestHeaders.get("range");
            }
            String pcmStart = requestUri.getQueryParameter("pcmStart");
            String pcmEnd = requestUri.getQueryParameter("pcmEnd");
            if (pcmStart != null || pcmEnd != null || requestUri.getQueryParameter("pcmVersion") != null) return handleVersionedPcmRange(requestUri,mediaUri,request,pcmStart,pcmEnd);
            boolean pcmRead = false; // ordinary WebView media route only below
            boolean isHead = request != null && "HEAD".equalsIgnoreCase(request.getMethod());

            ParcelFileDescriptor pfd = null;
            AssetFileDescriptor afd = null;

            if (!isHead || totalSize <= 0) {
                totalSize = -1;
                try {
                    pfd = getContentResolver().openFileDescriptor(mediaUri, "r");
                } catch (Exception e) {
                    Log.w(TAG, "Cannot open ParcelFileDescriptor for " + mediaUri + ": " + e.getMessage());
                }

                if (pfd == null) {
                    try {
                        afd = getContentResolver().openAssetFileDescriptor(mediaUri, "r");
                    } catch (Exception e) {
                        Log.w(TAG, "Cannot open AssetFileDescriptor for " + mediaUri + ": " + e.getMessage());
                    }
                }

                if (pfd != null) {
                    long sz = pfd.getStatSize();
                    if (sz > 0) {
                        totalSize = sz;
                    } else {
                        try {
                            sz = android.system.Os.fstat(pfd.getFileDescriptor()).st_size;
                            if (sz > 0) totalSize = sz;
                        } catch (Exception ignored) {}
                    }
                } else if (afd != null && afd.getLength() > 0) {
                    totalSize = afd.getLength();
                }

                if (totalSize <= 0) {
                    try (Cursor cursor = getContentResolver().query(mediaUri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
                        if (cursor != null && cursor.moveToFirst()) {
                            int sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE);
                            if (sizeIdx != -1) {
                                long sz = cursor.getLong(sizeIdx);
                                if (sz > 0) totalSize = sz;
                            }
                        }
                    } catch (Exception ignored) {}
                }
            }
            if (totalSize > 0 && !mediaKey.isEmpty()) {
                mediaSizeCache.put(mediaKey, totalSize);
            }
            if (pcmRead && totalSize <= 0) {
                if (pfd != null) pfd.close();
                if (afd != null) afd.close();
                return forbiddenMedia();
            }

            if (rangeHeader != null) rangeHeader = rangeHeader.trim();
            if (rangeHeader != null && (!rangeHeader.matches("(?i)bytes=[0-9]*-[0-9]*") || rangeHeader.equalsIgnoreCase("bytes=-") || totalSize<=0)) {
                if (pfd!=null) try {pfd.close();} catch(Exception ignored) {}
                if (afd!=null) try {afd.close();} catch(Exception ignored) {}
                return new WebResourceResponse(mime,null,416,"Range Not Satisfiable",java.util.Collections.singletonMap("Cache-Control","no-store"),new ByteArrayInputStream(new byte[0]));
            }
            if (totalSize > 0 && rangeHeader != null && rangeHeader.matches("(?i)bytes=[0-9]*-[0-9]*") && !rangeHeader.equalsIgnoreCase("bytes=-")) {
                String byteRange = rangeHeader.substring(rangeHeader.indexOf('=') + 1).trim();
                long start = 0;
                long end = totalSize - 1;

                int dash = byteRange.indexOf('-');
                if (dash >= 0) {
                    String startStr = byteRange.substring(0, dash).trim();
                    String endStr = byteRange.substring(dash + 1).trim();

                    if (startStr.isEmpty()) {
                        long suffix = parseRangeLimit(endStr);
                        start = Math.max(0, totalSize - suffix);
                    } else {
                        start = parseRangeLimit(startStr);
                        if (!endStr.isEmpty()) end = parseRangeLimit(endStr);
                    }
                }

                if (end >= totalSize) end = totalSize - 1;
                if (start > end || start >= totalSize) {
                    if (pfd != null) { try { pfd.close(); } catch (Exception ignored) {} }
                    if (afd != null) { try { afd.close(); } catch (Exception ignored) {} }
                    Map<String, String> errHeaders = new HashMap<>();
                    errHeaders.put("Content-Range", "bytes */" + totalSize);
                    errHeaders.put("Accept-Ranges", "bytes");
                    errHeaders.put("Access-Control-Allow-Origin", "https://appassets.androidplatform.net");
                    errHeaders.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                    errHeaders.put("Access-Control-Allow-Headers", "*");
                    return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", errHeaders,
                            new ByteArrayInputStream(new byte[0]));
                }

                long contentLength = end - start + 1;
                Map<String, String> headers = new HashMap<>();
                headers.put("Accept-Ranges", "bytes");
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + totalSize);
                if (pcmRead || isHead) headers.put("Content-Length", String.valueOf(contentLength));
                headers.put("Access-Control-Allow-Origin", "https://appassets.androidplatform.net");
                headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                headers.put("Access-Control-Allow-Headers", "*");
                headers.put("Cache-Control", "no-cache");

                if (isHead) {
                    if (pfd != null) { try { pfd.close(); } catch (Exception ignored) {} }
                    if (afd != null) { try { afd.close(); } catch (Exception ignored) {} }
                    return new WebResourceResponse(mime, null, 206, "Partial Content", headers,
                            new ByteArrayInputStream(new byte[0]));
                }

                Map<Long, Byte> patches = (!pcmRead && mime != null && mime.contains("flac"))
                        ? getFlacPatches(mediaUri,pfd) : java.util.Collections.emptyMap();
                // WebView skips to the requested offset for an HTTP Range header.
                // Decoder reads carry offsets in the URL and need an explicit seek.
                InputStream is = createSeekableStream(pfd, afd, mediaUri,
                        pcmRead ? start : 0, pcmRead ? contentLength : end + 1, patches);
                if (is == null) {
                    Log.e(TAG, "Failed to create seekable stream for: " + mediaUri);
                    return null;
                }

                return new WebResourceResponse(mime, null, 206, "Partial Content", headers, is);
            }

            // Normal full stream response (or when totalSize unknown)
            Map<String, String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes");
            if (totalSize > 0) {
                headers.put("Content-Length", String.valueOf(totalSize));
            }
            headers.put("Access-Control-Allow-Origin", "https://appassets.androidplatform.net");
            headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
            headers.put("Access-Control-Allow-Headers", "*");
            headers.put("Cache-Control", "no-cache");

            if (isHead) {
                if (pfd != null) { try { pfd.close(); } catch (Exception ignored) {} }
                if (afd != null) { try { afd.close(); } catch (Exception ignored) {} }
                return new WebResourceResponse(mime, null, 200, "OK", headers,
                        new ByteArrayInputStream(new byte[0]));
            }

            long streamLength = totalSize > 0 ? totalSize : Long.MAX_VALUE;
            Map<Long, Byte> patches = (mime != null && mime.contains("flac")) ? getFlacPatches(mediaUri,pfd) : java.util.Collections.emptyMap();
            InputStream is = createSeekableStream(pfd, afd, mediaUri, 0, streamLength, patches);
            if (is == null) {
                Log.e(TAG, "Failed to create full stream for: " + mediaUri);
                return null;
            }

            return new WebResourceResponse(mime, null, 200, "OK", headers, is);
        } catch (Exception e) {
            Log.e(TAG, "Audio stream intercept error: " + e.getMessage(), e);
            return null;
        }
    }

    private boolean isAudioFile(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".mp3") || lower.endsWith(".flac") || lower.endsWith(".wav") ||
               lower.endsWith(".ogg") || lower.endsWith(".m4a") || lower.endsWith(".aac") ||
               lower.endsWith(".opus") || lower.endsWith(".alac") || lower.endsWith(".aiff");
    }

    private JSONObject buildTrackJson(String trackId, Uri uri, String filename, String rawPath, String title,
                                      String artist, String album, long durationMs, int bitrate, int sampleRate,
                                      int bitDepth, int channels, String format, long size, String detectedMime)
            throws Exception {
        String encodedUri = URLEncoder.encode(uri.toString(), "UTF-8");
        String encodedName = URLEncoder.encode(filename, "UTF-8");
        String encodedMime = URLEncoder.encode(detectedMime, "UTF-8");
        String streamUrl = "https://appassets.androidplatform.net/android-media?uri=" + encodedUri
                + "&name=" + encodedName
                + "&mime=" + encodedMime
                + "&size=" + size;
        JSONObject obj = new JSONObject();
        obj.put("id", trackId);
        obj.put("filename", filename);
        obj.put("fullPath", (rawPath != null && !rawPath.isEmpty()) ? rawPath : filename);
        obj.put("contentUri",uri.toString());
        obj.put("fileSize",size);
        obj.put("title", title);
        obj.put("artist", artist);
        obj.put("album", album);
        obj.put("duration", durationMs > 0 ? (durationMs / 1000.0) : 0);
        obj.put("bitrate", bitrate > 0 ? bitrate : 320);
        obj.put("sampleRate", sampleRate);
        obj.put("bitDepth", bitDepth);
        obj.put("channels", channels);
        obj.put("format", format);
        obj.put("size", size);
        obj.put("src", streamUrl);
        obj.put("cover", "https://appassets.androidplatform.net/android-media-art?uri=" + encodedUri);
        return obj;
    }

    private JSONObject createTrackMetadata(Uri uri, String filename, String defaultAlbum, long size, Map<String, JSONObject> mediaStoreMap) {
        try {
            String title = filename;
            String artist = "Unknown Artist";
            String album = defaultAlbum != null ? defaultAlbum : "Selected Folder";
            long durationMs = 0;
            int sampleRate = 44100;
            int bitrate = 320;
            String format = "MP3";
            String rawPath = null;
            String mediaMime = null;

            int dotIdx = filename.lastIndexOf('.');
            if (dotIdx > 0 && dotIdx < filename.length() - 1) {
                title = filename.substring(0, dotIdx);
                format = filename.substring(dotIdx + 1).toUpperCase(Locale.ROOT);
            }

            // 1. Instant check: match against MediaStore in-memory index
            JSONObject cached = null;
            if (mediaStoreMap != null && filename != null) {
                if (size > 0) {
                    cached = mediaStoreMap.get((filename + "_" + size).toLowerCase(Locale.ROOT));
                }
                if (cached == null) {
                    cached = mediaStoreMap.get(filename.toLowerCase(Locale.ROOT));
                }
            }
            if (cached != null) {
                String t = cached.optString("title", null);
                if (t != null && !t.isEmpty() && !t.equals("null")) title = t;
                String a = cached.optString("artist", null);
                if (a != null && !a.isEmpty() && !a.equals("null") && !a.equals("<unknown>")) artist = a;
                String alb = cached.optString("album", null);
                if (alb != null && !alb.isEmpty() && !alb.equals("null") && !alb.equals("<unknown>")) album = alb;
                durationMs = cached.optLong("duration", 0);
                rawPath = cached.optString("path", null);
                mediaMime = cached.optString("mime", null);
            } else {
                // 2. High-speed heuristic filename pattern parsing ("Artist - Title" or "01 - Artist - Title")
                if (title.contains(" - ")) {
                    String[] parts = title.split(" - ", 2);
                    if (parts.length == 2) {
                        String p0 = parts[0].replaceAll("^\\d+[\\.\\s_-]*", "").trim();
                        String p1 = parts[1].trim();
                        if (!p0.isEmpty() && !p1.isEmpty()) {
                            artist = p0;
                            title = p1;
                        }
                    }
                } else if (title.matches("^\\d+[\\.\\s_-]+.*")) {
                    title = title.replaceAll("^\\d+[\\.\\s_-]+", "").trim();
                }

                // 3. Fast estimation when duration is not in MediaStore (prevents slow MediaMetadataRetriever blocking)
                if (durationMs <= 0 && size > 0) {
                    String lower = filename.toLowerCase(Locale.ROOT);
                    int estBitrateKbps = 320;
                    if (lower.endsWith(".flac")) estBitrateKbps = 850;
                    else if (lower.endsWith(".wav")) estBitrateKbps = 1411;
                    else if (lower.endsWith(".mp3") || lower.endsWith(".m4a") || lower.endsWith(".aac")) estBitrateKbps = 256;
                    else if (lower.endsWith(".ogg") || lower.endsWith(".opus")) estBitrateKbps = 160;
                    durationMs = (size * 8L * 1000L) / (estBitrateKbps * 1000L);
                    bitrate = estBitrateKbps;
                }
            }

            String detectedMime = fastDetectMime(filename, mediaMime);
            int bitDepth = 16;
            int channels = 2;
            if ("FLAC".equals(format) || detectedMime.contains("flac")) {
                AudioHeaderInfo flacInfo = readFlacHeaderInfo(uri, size, durationMs);
                sampleRate = flacInfo.sampleRate;
                bitDepth = flacInfo.bitDepth;
                channels = flacInfo.channels;
                if (flacInfo.durationMs > 0) durationMs = flacInfo.durationMs;
                if (flacInfo.bitrateKbps > 0) bitrate = flacInfo.bitrateKbps;
            } else if (bitrate <= 0 && size > 0 && durationMs > 0) {
                bitrate = (int) Math.max(32L, (size * 8L) / durationMs);
            }
            String trackId = "android_" + System.currentTimeMillis() + "_" + Math.abs(uri.hashCode());
            return buildTrackJson(trackId, uri, filename, rawPath, title, artist, album,
                    durationMs, bitrate, sampleRate, bitDepth, channels, format, size, detectedMime);
        } catch (Exception e) {
            return null;
        }
    }

    private void scanMediaStoreAsync() {
        startLibraryScan(() -> {
            try {
                long scanStartTime = System.currentTimeMillis();
                Uri musicUri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                String[] projection = new String[]{
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.SIZE,
                    MediaStore.Audio.Media.DISPLAY_NAME,
                    MediaStore.Audio.Media.MIME_TYPE,
                    MediaStore.Audio.Media.DATA
                };
                String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
                String sortOrder = MediaStore.Audio.Media.TITLE + " ASC";

                List<JSONObject> list = new ArrayList<>();
                try (Cursor cursor = getContentResolver().query(musicUri, projection, selection, null, sortOrder)) {
                    if (cursor != null) {
                        final int totalRows = cursor.getCount();
                        int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                        int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                        int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                        int albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                        int durCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                        int sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE);
                        int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
                        int mimeCol = cursor.getColumnIndex(MediaStore.Audio.Media.MIME_TYPE);
                        int dataCol = cursor.getColumnIndex(MediaStore.Audio.Media.DATA);

                        long lastProgressTime = 0L;
                        while (cursor.moveToNext() && list.size() < 5000) {
                            if (isScanCancelled) break;
                            long id = cursor.getLong(idCol);
                            String title = cursor.getString(titleCol);
                            String artist = cursor.getString(artistCol);
                            String album = cursor.getString(albumCol);
                            long dur = cursor.getLong(durCol);
                            long size = cursor.getLong(sizeCol);
                            String name = cursor.getString(nameCol);
                            String mediaMime = mimeCol != -1 ? cursor.getString(mimeCol) : null;
                            String rawPath = dataCol != -1 ? cursor.getString(dataCol) : null;

                            String resolvedFilename = name != null ? name : ((title != null ? title : "Track") + ".mp3");
                            String format = "MP3";
                            int dotIdx = resolvedFilename.lastIndexOf('.');
                            if (dotIdx > 0 && dotIdx < resolvedFilename.length() - 1) {
                                format = resolvedFilename.substring(dotIdx + 1).toUpperCase();
                            }

                            Uri trackUri = ContentUris.withAppendedId(musicUri, id);
                            // Fast in-memory MIME detection prevents redundant SQLite queries per track
                            String detectedMime = fastDetectMime(resolvedFilename, mediaMime);
                            int trackSampleRate = 44100;
                            int trackBitDepth = 16;
                            int trackChannels = 2;
                            int trackBitrate = (size > 0 && dur > 0) ? (int) Math.max(32L, (size * 8L) / dur) : 320;
                            if ("FLAC".equals(format) || detectedMime.contains("flac")) {
                                AudioHeaderInfo flacInfo = readFlacHeaderInfo(trackUri, size, dur);
                                trackSampleRate = flacInfo.sampleRate;
                                trackBitDepth = flacInfo.bitDepth;
                                trackChannels = flacInfo.channels;
                                if (flacInfo.durationMs > 0) dur = flacInfo.durationMs;
                                if (flacInfo.bitrateKbps > 0) trackBitrate = flacInfo.bitrateKbps;
                            }
                            JSONObject obj = buildTrackJson(
                                    "android_" + id,
                                    trackUri,
                                    resolvedFilename,
                                    rawPath,
                                    title != null ? title : "Unknown Title",
                                    (artist != null && !artist.equals("<unknown>")) ? artist : "Unknown Artist",
                                    (album != null && !album.equals("<unknown>")) ? album : "Device Music",
                                    dur,
                                    trackBitrate,
                                    trackSampleRate,
                                    trackBitDepth,
                                    trackChannels,
                                    format,
                                    size,
                                    detectedMime);
                            list.add(obj);

                            long now = System.currentTimeMillis();
                            if (list.size() == totalRows || (now - lastProgressTime) >= 100L) {
                                lastProgressTime = now;
                                final int count = list.size();
                                long elapsed = now - scanStartTime;
                                int etaSec = 0;
                                if (count > 0 && totalRows > count) {
                                    double rate = (double) count / Math.max(1, elapsed);
                                    etaSec = (int) Math.ceil((totalRows - count) / (rate * 1000.0));
                                }
                                final int finalEta = etaSec;
                                postToWebView(() -> {
                                    String js = "if (window.__cachyMusic && window.__cachyMusic.android && window.__cachyMusic.android.onScanProgress) { window.__cachyMusic.android.onScanProgress(" + count + ", " + totalRows + ", 'Device Music Library', " + finalEta + "); }";
                                    webView.evaluateJavascript(js, null);
                                });
                            }
                        }
                    }
                }

                if (isScanCancelled) {
                    postToWebView(() -> {
                        webView.evaluateJavascript("if (window.__cachyMusic && window.__cachyMusic.android && window.__cachyMusic.android.onScanCancelled) { window.__cachyMusic.android.onScanCancelled(); }", null);
                    });
                    return;
                }

                JSONArray tracksArray = new JSONArray();
                for (JSONObject obj : list) {
                    tracksArray.put(obj);
                }
                if (tracksArray.length() > 0) {
                    saveLibraryCacheJson(tracksArray, "Device Music Library");
                }
                final String jsonString = tracksArray.toString();
                postToWebView(() -> {
                    String js = "if (window.__cachyMusic && window.__cachyMusic.android && window.__cachyMusic.android.onTracksDiscovered) { window.__cachyMusic.android.onTracksDiscovered("
                            + jsonString + ", 'Device Music Library'); }";
                    webView.evaluateJavascript(js, null);
                });
            } catch (Exception e) {
                Log.e(TAG, "MediaStore scan error: " + e.getMessage(), e);
            }
        });
    }

    private JSONObject buildAudioDevicesPayload() {
        JSONObject result = new JSONObject();
        JSONArray devicesArr = new JSONArray();
        boolean hasExternalDac = false;
        boolean isUsbDac = false;
        String activeLabel = Build.MODEL != null ? (Build.MODEL + " Speaker") : "Device Speaker";
        String activeCategory = "builtin";
        int activePriority = 0;

        // Collect USB Audio Class (UAC) product names (e.g., Moondrop May, FiiO, Topping, Apple Dongle)
        List<String> usbAudioLabels = new ArrayList<>();
        try {
            UsbManager usbMgr = (UsbManager) getSystemService(Context.USB_SERVICE);
            if (usbMgr != null) {
                Map<String, UsbDevice> usbMap = usbMgr.getDeviceList();
                if (usbMap != null) {
                    for (UsbDevice dev : usbMap.values()) {
                        if (dev == null) continue;
                        boolean isAudioClass = (dev.getDeviceClass() == UsbConstants.USB_CLASS_AUDIO);
                        if (!isAudioClass) {
                            int ifCount = dev.getInterfaceCount();
                            for (int idx = 0; idx < ifCount; idx++) {
                                UsbInterface iface = dev.getInterface(idx);
                                if (iface != null && iface.getInterfaceClass() == UsbConstants.USB_CLASS_AUDIO) {
                                    isAudioClass = true;
                                    break;
                                }
                            }
                        }
                        String mfg = dev.getManufacturerName() != null ? dev.getManufacturerName().trim() : "";
                        String prod = dev.getProductName() != null ? dev.getProductName().trim() : "";
                        String combined = (!mfg.isEmpty() && !prod.isEmpty() && !prod.toLowerCase(Locale.US).contains(mfg.toLowerCase(Locale.US)))
                                ? (mfg + " " + prod)
                                : (!prod.isEmpty() ? prod : mfg);
                        if (isAudioClass || combined.toLowerCase(Locale.US).matches(".*(dac|iem|moondrop|may|dongle|fiio|topping|audio|headphone|earphone|uac).*")) {
                            String label = combined.isEmpty() ? String.format(Locale.US, "USB DAC (%04X:%04X)", dev.getVendorId(), dev.getProductId()) : combined;
                            usbAudioLabels.add(label);
                        }
                    }
                }
            }
        } catch (Exception ignored) {}

        try {
            AudioManager am = audioManager != null ? audioManager : (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                AudioDeviceInfo[] outputs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
                if (outputs != null) {
                    for (AudioDeviceInfo info : outputs) {
                        if (info == null) continue;
                        int type = info.getType();
                        String category = "builtin";
                        boolean external = false;
                        int priority = 1;
                        if (type == AudioDeviceInfo.TYPE_USB_DEVICE || type == AudioDeviceInfo.TYPE_USB_HEADSET || type == AudioDeviceInfo.TYPE_USB_ACCESSORY) {
                            category = "usb-dac";
                            external = true;
                            priority = 100;
                            isUsbDac = true;
                        } else if (type == AudioDeviceInfo.TYPE_WIRED_HEADSET || type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                                || type == AudioDeviceInfo.TYPE_LINE_ANALOG || type == AudioDeviceInfo.TYPE_LINE_DIGITAL || type == AudioDeviceInfo.TYPE_AUX_LINE) {
                            category = "wired";
                            external = true;
                            priority = 80;
                        } else if (type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || type == 26 || type == 27) {
                            category = "bluetooth";
                            external = true;
                            priority = 60;
                        } else if (type == AudioDeviceInfo.TYPE_HDMI || type == AudioDeviceInfo.TYPE_HDMI_ARC || type == 29) {
                            category = "digital";
                            external = true;
                            priority = 50;
                        }

                        if (external) hasExternalDac = true;

                        String name = info.getProductName() != null ? info.getProductName().toString().trim() : "";
                        if ("usb-dac".equals(category) && !usbAudioLabels.isEmpty()) {
                            // Prefer exact USB descriptor name when Android OS returns generic phone model
                            if (name.isEmpty() || (Build.MODEL != null && name.equalsIgnoreCase(Build.MODEL)) || name.equalsIgnoreCase("USB-Audio")) {
                                name = usbAudioLabels.get(0);
                            }
                        }
                        if (name.isEmpty()) {
                            name = "usb-dac".equals(category) ? "USB-C DAC / IEM" : ("wired".equals(category) ? "Wired Headphones / IEM" : ("bluetooth".equals(category) ? "Bluetooth Audio" : "Device Speaker"));
                        }

                        int maxRate = 48000;
                        int[] rates = info.getSampleRates();
                        if (rates != null) {
                            for (int r : rates) {
                                if (r > maxRate) maxRate = r;
                            }
                        }

                        int maxBitDepth = 16;
                        int[] encs = info.getEncodings();
                        if (encs != null) {
                            for (int enc : encs) {
                                if (enc == AudioFormat.ENCODING_PCM_FLOAT || enc == 22) {
                                    maxBitDepth = Math.max(maxBitDepth, 32);
                                } else if (enc == 21) {
                                    maxBitDepth = Math.max(maxBitDepth, 24);
                                }
                            }
                        }

                        JSONObject devObj = new JSONObject();
                        devObj.put("id", info.getId());
                        devObj.put("name", name);
                        devObj.put("type", type);
                        devObj.put("category", category);
                        devObj.put("isExternalDac", external);
                        devObj.put("maxSampleRate", maxRate);
                        devObj.put("maxBitDepth", maxBitDepth);
                        devicesArr.put(devObj);

                        if (priority > activePriority) {
                            activePriority = priority;
                            activeLabel = name;
                            activeCategory = category;
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "buildAudioDevicesPayload warning: " + e.getMessage());
        }

        if (!isUsbDac && !usbAudioLabels.isEmpty()) {
            hasExternalDac = true;
            isUsbDac = true;
            activeLabel = usbAudioLabels.get(0);
            activeCategory = "usb-dac";
            try {
                JSONObject usbObj = new JSONObject();
                usbObj.put("id", -1);
                usbObj.put("name", usbAudioLabels.get(0));
                usbObj.put("category", "usb-dac");
                usbObj.put("isExternalDac", true);
                devicesArr.put(usbObj);
            } catch (Exception ignored) {}
        }

        try {
            result.put("hasExternalDac", hasExternalDac);
            result.put("isUsbDac", isUsbDac);
            result.put("activeDevice", activeLabel);
            result.put("activeCategory", activeCategory);
            result.put("devices", devicesArr);
        } catch (Exception ignored) {}
        return result;
    }

    @Override
    protected void onDestroy() {
        activityDestroyed = true;
        isScanCancelled = true;
        scanExecutor.shutdownNow();
        webViewHandler.removeCallbacksAndMessages(null);
        soulseekRpcEpoch.incrementAndGet();
        soulseekRpcPool.shutdownNow();
        soulseekControlPool.shutdownNow();
        if (audioManager != null && audioDeviceCallback != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                audioManager.unregisterAudioDeviceCallback(audioDeviceCallback);
            } catch (Exception ignored) {}
            audioDeviceCallback = null;
        }
        if (mediaCommandReceiver != null) {
            try {
                unregisterReceiver(mediaCommandReceiver);
            } catch (Exception ignored) {}
            mediaCommandReceiver = null;
        }
        try {
            if(!MediaPlaybackService.ownsNative())stopService(new Intent(this, MediaPlaybackService.class));
        } catch (Exception ignored) {}
        if (uploadMessage != null) {
            uploadMessage.onReceiveValue(null);
            uploadMessage = null;
        }
        WebView closingView = webView;
        webView = null;
        if (closingView != null) {
            closingView.stopLoading();
            closingView.removeJavascriptInterface("AndroidBridge");
            if (closingView.getParent() instanceof android.view.ViewGroup) {
                ((android.view.ViewGroup) closingView.getParent()).removeView(closingView);
            }
            closingView.destroy();
        }
        directDecoder.closeAll();
        if (artworkEngine != null) artworkEngine.close();
        mediaSizeCache.evictAll();
        flacPatchesCache.evictAll();
        super.onDestroy();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (webView.canGoBack()) {
                webView.goBack();
                return true;
            }
            showExitDialog();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void showExitDialog() {
        new AlertDialog.Builder(this)
                .setTitle("CachyMusic")
                .setMessage("Exit CachyMusic Workstation?")
                .setPositiveButton("Exit", (dialog, which) -> finish())
                .setNegativeButton("Cancel", null)
                .show();
    }
}
