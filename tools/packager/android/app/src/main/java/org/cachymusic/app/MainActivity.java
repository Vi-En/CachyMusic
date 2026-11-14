package org.cachymusic.app;

import android.Manifest;
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
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Log;
import android.util.Size;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
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
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.channels.Channels;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import android.provider.OpenableColumns;

@SuppressWarnings("deprecation")
public class MainActivity extends Activity {
    private static final String TAG = "CachyMusic";
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
    private BroadcastReceiver mediaCommandReceiver;
    private AudioManager audioManager;
    private AudioDeviceCallback audioDeviceCallback;

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
        public String callSoulseekApi(String action, String bodyJson, String queryString) {
            return SoulseekClient.getInstance(getApplicationContext()).dispatchApi(action, bodyJson, queryString);
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
                payload.put("available", am != null);
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
                if (am == null) return false;
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

        @JavascriptInterface
        public void updateMediaNotification(String title, String artist, String album, String coverUrl, boolean isPlaying, long durationMs, long positionMs) {
            Intent svc = new Intent(MainActivity.this, MediaPlaybackService.class);
            svc.setAction(MediaPlaybackService.ACTION_UPDATE);
            svc.putExtra("title", title != null ? title : "CachyMusic");
            svc.putExtra("artist", artist != null ? artist : "Unknown Artist");
            svc.putExtra("album", album != null ? album : "");
            svc.putExtra("cover", coverUrl != null ? coverUrl : "");
            svc.putExtra("isPlaying", isPlaying);
            svc.putExtra("durationMs", durationMs);
            svc.putExtra("positionMs", positionMs);
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
            try {
                Intent svc = new Intent(MainActivity.this, MediaPlaybackService.class);
                svc.setAction(MediaPlaybackService.ACTION_STOP_SERVICE);
                stopService(svc);
            } catch (Exception e) {
                Log.w(TAG, "Failed to stop MediaPlaybackService: " + e.getMessage());
            }
        }
    }

    private String getSavedSoulseekHost() {
        SharedPreferences sp = getSharedPreferences("cachymusic_prefs", MODE_PRIVATE);
        return sp.getString("slsk_host", "");
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
            if (!cacheFile.exists() || cacheFile.length() == 0) return "";
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);

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
                        jsCall = "window.__cachyMusic && window.__cachyMusic.player && window.__cachyMusic.player.nextTrack();";
                        break;
                    case "prev":
                        jsCall = "window.__cachyMusic && window.__cachyMusic.player && window.__cachyMusic.player.prevTrack();";
                        break;
                    case "seek":
                        double seekSec = seekMs / 1000.0;
                        jsCall = String.format(Locale.US, "window.__cachyMusic && window.__cachyMusic.player && window.__cachyMusic.player.seekAudio(%.3f);", seekSec);
                        break;
                    default:
                        return;
                }
                final String finalJs = jsCall;
                webView.post(() -> webView.evaluateJavascript(finalJs, null));
            }
        };
        IntentFilter filter = new IntentFilter(MediaPlaybackService.BROADCAST_MEDIA_COMMAND);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(mediaCommandReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(mediaCommandReceiver, filter);
        }

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
        webView.setBackgroundColor(0xFF0A0B0E);
        
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
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Register AndroidBridge for native folder directory picking and MediaStore queries
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            audioDeviceCallback = new AudioDeviceCallback() {
                private void notifyWebAudioDevicesChanged() {
                    if (webView != null) {
                        webView.post(() -> webView.evaluateJavascript(
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
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                        "audio/*",
                        "application/ogg",
                        "application/x-flac",
                        "audio/flac",
                        "audio/mp3",
                        "audio/wav",
                        "audio/m4a",
                        "audio/aac",
                        "audio/opus"
                    });
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(Intent.createChooser(intent, "Select Audio Tracks"), FILECHOOSER_RESULTCODE);
                } catch (ActivityNotFoundException e) {
                    uploadMessage = null;
                    return false;
                }
                return true;
            }
        });

        // WebViewClient intercepting local asset requests, local media streams, and mock API calls
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();

                // 1. Direct local audio streaming & artwork resolution via ContentResolver
                if (path != null && path.startsWith("/android-media-art")) {
                    String uriParam = uri.getQueryParameter("uri");
                    if (uriParam != null) {
                        byte[] art = resolveTrackArtworkBytes(MainActivity.this, Uri.parse(uriParam));
                        if (art != null && art.length > 0) {
                            return new WebResourceResponse("image/jpeg", null, new ByteArrayInputStream(art));
                        }
                    }
                }

                if (path != null && path.startsWith("/android-media")) {
                    if (request != null && "OPTIONS".equalsIgnoreCase(request.getMethod())) {
                        Map<String, String> corsHeaders = new HashMap<>();
                        corsHeaders.put("Access-Control-Allow-Origin", "*");
                        corsHeaders.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                        corsHeaders.put("Access-Control-Allow-Headers", "*");
                        return new WebResourceResponse("text/plain", "UTF-8", 200, "OK", corsHeaders,
                                new ByteArrayInputStream(new byte[0]));
                    }
                    String uriParam = uri.getQueryParameter("uri");
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
                        // 100% Standalone Native Android Soulseek Client
                        String action = uri.getQueryParameter("action");
                        String json = SoulseekClient.getInstance(getApplicationContext()).dispatchApi(action, "{}", uri.getQuery());
                        Map<String, String> respHeaders = new HashMap<>();
                        respHeaders.put("Access-Control-Allow-Origin", "*");
                        respHeaders.put("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                        respHeaders.put("Content-Type", "application/json; charset=utf-8");
                        return new WebResourceResponse("application/json", "UTF-8", 200, "OK", respHeaders,
                                new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
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
                return assetLoader.shouldInterceptRequest(uri);
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
        isScanCancelled = false;
        new Thread(() -> {
            try {
                DocumentFile pickedDir = DocumentFile.fromTreeUri(this, treeUri);
                if (pickedDir == null) return;

                String folderName = pickedDir.getName();
                if (folderName == null) folderName = "Selected Folder";
                final String fName = folderName;

                new Handler(Looper.getMainLooper()).post(() -> {
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
                    new Handler(Looper.getMainLooper()).post(() -> {
                        webView.evaluateJavascript("if (window.__cachyMusic && window.__cachyMusic.android && window.__cachyMusic.android.onScanCancelled) { window.__cachyMusic.android.onScanCancelled(); }", null);
                    });
                    return;
                }

                final int total = discovered.size();
                Map<String, JSONObject> mediaStoreMap = buildMediaStoreFastIndex();
                List<JSONObject> tracksList = new ArrayList<>(total);

                // Phase 2: Metadata mapping with live ETA and accurate percentage
                long procStartTime = System.currentTimeMillis();
                for (int i = 0; i < total; i++) {
                    if (isScanCancelled) break;
                    DiscoveredAudioItem item = discovered.get(i);
                    JSONObject track = createTrackMetadata(item.uri, item.name, item.album, item.size, mediaStoreMap);
                    if (track != null) {
                        tracksList.add(track);
                    }

                    if ((i + 1) % 5 == 0 || i == total - 1) {
                        final int count = i + 1;
                        long elapsed = System.currentTimeMillis() - procStartTime;
                        int etaSec = 0;
                        if (count > 0 && total > count && elapsed > 0) {
                            double rate = (double) count / elapsed;
                            etaSec = (int) Math.max(0, Math.ceil((total - count) / (rate * 1000.0)));
                        }
                        final int finalEta = etaSec;
                        new Handler(Looper.getMainLooper()).post(() -> {
                            String js = "if (window.__cachyMusic && window.__cachyMusic.android && window.__cachyMusic.android.onScanProgress) { window.__cachyMusic.android.onScanProgress("
                                    + count + ", " + total + ", " + JSONObject.quote(fName) + ", " + finalEta + "); }";
                            webView.evaluateJavascript(js, null);
                        });
                    }
                }

                if (isScanCancelled) {
                    new Handler(Looper.getMainLooper()).post(() -> {
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
                new Handler(Looper.getMainLooper()).post(() -> {
                    String js = "if (window.__cachyMusic && window.__cachyMusic.android && window.__cachyMusic.android.onTracksDiscovered) { window.__cachyMusic.android.onTracksDiscovered("
                            + jsonString + ", " + JSONObject.quote(fName) + "); }";
                    webView.evaluateJavascript(js, null);
                });
            } catch (Exception e) {
                Log.e(TAG, "Folder scan error: " + e.getMessage(), e);
            }
        }).start();
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

    private String detectMimeType(Uri uri, String filename, String defaultMime) {
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

        try {
            String mime = getContentResolver().getType(uri);
            if (mime != null && !mime.equals("application/octet-stream") && !mime.trim().isEmpty()) {
                return normalizeMimeType(mime);
            }
        } catch (Exception ignored) {}

        // Query MediaStore for exact MIME type and display name if available
        try (Cursor cursor = getContentResolver().query(uri, new String[]{
                MediaStore.Audio.Media.MIME_TYPE,
                MediaStore.Audio.Media.DISPLAY_NAME
        }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int mIdx = cursor.getColumnIndex(MediaStore.Audio.Media.MIME_TYPE);
                if (mIdx != -1) {
                    String m = cursor.getString(mIdx);
                    if (m != null && !m.trim().isEmpty() && !m.equals("application/octet-stream")) {
                        return normalizeMimeType(m);
                    }
                }
                int nIdx = cursor.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME);
                if (nIdx != -1) {
                    String n = cursor.getString(nIdx);
                    if (n != null && n.contains(".")) {
                        String lower = n.toLowerCase().trim();
                        if (lower.endsWith(".flac")) return "audio/flac";
                        if (lower.endsWith(".wav")) return "audio/wav";
                        if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
                        if (lower.endsWith(".opus")) return "audio/opus";
                        if (lower.endsWith(".m4a")) return "audio/mp4";
                        if (lower.endsWith(".aac")) return "audio/aac";
                        if (lower.endsWith(".mp3")) return "audio/mpeg";
                    }
                }
            }
        } catch (Exception ignored) {}

        String path = uri.getPath();
        if (path == null) path = uri.toString();
        try {
            path = URLDecoder.decode(path, "UTF-8");
        } catch (Exception ignored) {}
        String lower = path.toLowerCase();
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

        // Magic byte inspection (inspect first 16 bytes directly from stream)
        try (InputStream is = getContentResolver().openInputStream(uri)) {
            if (is != null) {
                byte[] magic = new byte[16];
                int read = is.read(magic);
                if (read >= 4) {
                    if (magic[0] == 'f' && magic[1] == 'L' && magic[2] == 'a' && magic[3] == 'C') {
                        return "audio/flac";
                    }
                    if (magic[0] == 'R' && magic[1] == 'I' && magic[2] == 'F' && magic[3] == 'F') {
                        return "audio/wav";
                    }
                    if (magic[0] == 'O' && magic[1] == 'g' && magic[2] == 'g' && magic[3] == 'S') {
                        return "audio/ogg";
                    }
                    if ((magic[0] & 0xFF) == 0xFF && (magic[1] & 0xE0) == 0xE0) {
                        return "audio/mpeg";
                    }
                }
                if (read >= 8) {
                    if (magic[4] == 'f' && magic[5] == 't' && magic[6] == 'y' && magic[7] == 'p') {
                        return "audio/mp4";
                    }
                }
                if (read >= 3 && magic[0] == 'I' && magic[1] == 'D' && magic[2] == '3') {
                    // ID3v2 container header found (commonly MP3, but can wrap FLAC/WAV/AAC)
                    return "audio/mpeg";
                }
            }
        } catch (Exception ignored) {}

        return normalizeMimeType(defaultMime != null ? defaultMime : "audio/mpeg");
    }

    private final Map<String, Map<Long, Byte>> flacPatchesCache = new java.util.concurrent.ConcurrentHashMap<>();
    private final Map<String, Long> mediaSizeCache = new java.util.concurrent.ConcurrentHashMap<>();

    public static byte[] resolveTrackArtworkBytes(Context ctx, Uri mediaUri) {
        if (ctx == null || mediaUri == null) return null;
        try (MediaMetadataRetriever mmr = new MediaMetadataRetriever()) {
            mmr.setDataSource(ctx, mediaUri);
            byte[] art = mmr.getEmbeddedPicture();
            if (art != null && art.length > 0) {
                return art;
            }
        } catch (Exception ignored) {}

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                Bitmap thumb = ctx.getContentResolver().loadThumbnail(mediaUri, new Size(256, 256), null);
                if (thumb != null) {
                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    thumb.compress(Bitmap.CompressFormat.JPEG, 88, baos);
                    thumb.recycle();
                    byte[] bytes = baos.toByteArray();
                    if (bytes.length > 0) return bytes;
                }
            } catch (Exception ignored) {}
        }

        try (Cursor cursor = ctx.getContentResolver().query(mediaUri, new String[]{MediaStore.MediaColumns.DATA}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int dataIdx = cursor.getColumnIndex(MediaStore.MediaColumns.DATA);
                if (dataIdx != -1) {
                    String filePath = cursor.getString(dataIdx);
                    if (filePath != null && !filePath.isEmpty()) {
                        File parent = new File(filePath).getParentFile();
                        if (parent != null && parent.isDirectory()) {
                            String[] coverNames = {"cover.jpg", "cover.png", "folder.jpg", "folder.png", "front.jpg", "album.jpg"};
                            for (String name : coverNames) {
                                File coverFile = new File(parent, name);
                                if (coverFile.isFile() && coverFile.canRead() && coverFile.length() > 0 && coverFile.length() < 8 * 1024 * 1024) {
                                    try (FileInputStream fis = new FileInputStream(coverFile);
                                         ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                                        byte[] buf = new byte[8192];
                                        int n;
                                        while ((n = fis.read(buf)) > 0) baos.write(buf, 0, n);
                                        return baos.toByteArray();
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {}

        return null;
    }

    private Map<Long, Byte> getFlacPatches(Uri uri) {
        if (uri == null) return java.util.Collections.emptyMap();
        String key = uri.toString();
        Map<Long, Byte> cached = flacPatchesCache.get(key);
        if (cached != null) return cached;

        Map<Long, Byte> patches = new HashMap<>();
        try (InputStream is = getContentResolver().openInputStream(uri)) {
            if (is != null) {
                byte[] magic = new byte[4];
                int r = is.read(magic);
                if (r == 4 && magic[0] == 'f' && magic[1] == 'L' && magic[2] == 'a' && magic[3] == 'C') {
                    long offset = 4;
                    byte[] hdr = new byte[4];
                    while (offset < 16 * 1024 * 1024) {
                        int hr = is.read(hdr);
                        if (hr < 4) break;
                        boolean isLast = (hdr[0] & 0x80) != 0;
                        int btype = hdr[0] & 0x7F;
                        long len = ((long)(hdr[1] & 0xFF) << 16) | ((long)(hdr[2] & 0xFF) << 8) | (hdr[3] & 0xFF);
                        if (btype == 6) { // PICTURE block: convert to PADDING so Chromium media demuxer does not choke on embedded mjpeg video stream
                            byte patched = (byte) ((isLast ? 0x80 : 0x00) | 0x01);
                            patches.put(offset, patched);
                        }
                        // Skip block data
                        long skipped = 0;
                        while (skipped < len) {
                            long s = is.skip(len - skipped);
                            if (s <= 0) {
                                int toRead = (int) Math.min(len - skipped, 16384);
                                int bRead = is.read(new byte[toRead]);
                                if (bRead <= 0) break;
                                s = bRead;
                            }
                            skipped += s;
                        }
                        offset += 4 + len;
                        if (isLast) break;
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "FLAC patch scan error for " + uri + ": " + e.getMessage());
        }

        flacPatchesCache.put(key, patches);
        return patches;
    }

    private static class LimitedInputStream extends FilterInputStream {
        private long remaining;
        private final ParcelFileDescriptor pfd;
        private final AssetFileDescriptor afd;
        private final RandomAccessFile raf;
        private final Map<Long, Byte> patches;
        private long currentPos;

        public LimitedInputStream(InputStream in, long limit, ParcelFileDescriptor pfd, AssetFileDescriptor afd, RandomAccessFile raf, long startPos, Map<Long, Byte> patches) {
            super(in);
            this.remaining = Math.max(0, limit);
            this.pfd = pfd;
            this.afd = afd;
            this.raf = raf;
            this.currentPos = startPos;
            this.patches = patches;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int b = super.read();
            if (b != -1) {
                if (patches != null && !patches.isEmpty()) {
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
                if (patches != null && !patches.isEmpty()) {
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
                if (raf != null) {
                    try { raf.close(); } catch (Exception ignored) {}
                }
                if (pfd != null) {
                    try { pfd.close(); } catch (Exception ignored) {}
                }
                if (afd != null) {
                    try { afd.close(); } catch (Exception ignored) {}
                }
            }
        }
    }

    private InputStream createSeekableStream(File directFile, ParcelFileDescriptor pfd, AssetFileDescriptor afd, Uri uri, long start, long length, Map<Long, Byte> patches) {
        if (directFile != null) {
            try {
                RandomAccessFile raf = new RandomAccessFile(directFile, "r");
                if (start > 0) {
                    raf.seek(start);
                }
                InputStream is = Channels.newInputStream(raf.getChannel());
                return new LimitedInputStream(is, length, null, null, raf, start, patches);
            } catch (Exception e) {
                Log.w(TAG, "directFile seek failed: " + e.getMessage());
            }
        }

        if (pfd != null) {
            try {
                if (start > 0) {
                    android.system.Os.lseek(pfd.getFileDescriptor(), start, android.system.OsConstants.SEEK_SET);
                }
                FileInputStream fis = new ParcelFileDescriptor.AutoCloseInputStream(pfd);
                return new LimitedInputStream(fis, length, pfd, null, null, start, patches);
            } catch (Throwable e) {
                Log.w(TAG, "pfd Os.lseek fallback: " + e.getMessage());
                try {
                    FileInputStream fis = new FileInputStream(pfd.getFileDescriptor());
                    if (start > 0) {
                        fis.getChannel().position(start);
                    }
                    return new LimitedInputStream(fis, length, pfd, null, null, start, patches);
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
                return new LimitedInputStream(fis, length, null, afd, null, start, patches);
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
                }
                return new LimitedInputStream(is, length, null, null, null, start, patches);
            }
        } catch (Exception e) {
            Log.e(TAG, "InputStream fallback failed: " + e.getMessage());
        }
        return null;
    }

    private WebResourceResponse handleAndroidMediaStream(Uri requestUri, Uri mediaUri, WebResourceRequest request) {
        try {
            if (request != null && "OPTIONS".equalsIgnoreCase(request.getMethod())) {
                Map<String, String> corsHeaders = new HashMap<>();
                corsHeaders.put("Access-Control-Allow-Origin", "*");
                corsHeaders.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                corsHeaders.put("Access-Control-Allow-Headers", "*");
                return new WebResourceResponse("text/plain", "UTF-8", 204, "No Content", corsHeaders, new ByteArrayInputStream(new byte[0]));
            }

            String nameParam = requestUri != null ? requestUri.getQueryParameter("name") : null;
            String mimeParam = requestUri != null ? requestUri.getQueryParameter("mime") : null;
            String sizeParam = requestUri != null ? requestUri.getQueryParameter("size") : null;
            String pathParam = requestUri != null ? requestUri.getQueryParameter("path") : null;

            long totalSize = -1;
            if (sizeParam != null && !sizeParam.isEmpty()) {
                try {
                    totalSize = Long.parseLong(sizeParam);
                } catch (NumberFormatException ignored) {}
            }
            String mediaKey = (mediaUri != null) ? mediaUri.toString() : (pathParam != null ? pathParam : "");
            if (totalSize <= 0 && !mediaKey.isEmpty()) {
                Long cachedSz = mediaSizeCache.get(mediaKey);
                if (cachedSz != null && cachedSz > 0) totalSize = cachedSz;
            }

            String mime = (mimeParam != null && !mimeParam.isEmpty() && !mimeParam.equals("application/octet-stream"))
                    ? mimeParam
                    : fastDetectMime(nameParam, null);
            mime = normalizeMimeType(mime);

            Map<String, String> requestHeaders = request != null ? request.getRequestHeaders() : null;
            String rangeHeader = requestHeaders != null ? requestHeaders.get("Range") : null;
            if (rangeHeader == null && requestHeaders != null) {
                rangeHeader = requestHeaders.get("range");
            }
            boolean isHead = request != null && "HEAD".equalsIgnoreCase(request.getMethod());

            File directFile = null;
            if (pathParam != null && !pathParam.trim().isEmpty()) {
                try {
                    File f = new File(pathParam.trim());
                    if (f.exists() && f.canRead()) {
                        directFile = f;
                        totalSize = f.length();
                    }
                } catch (Exception ignored) {}
            }

            ParcelFileDescriptor pfd = null;
            AssetFileDescriptor afd = null;

            if (directFile == null && (!isHead || totalSize <= 0)) {
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

            if (rangeHeader != null) rangeHeader = rangeHeader.trim();
            if (totalSize > 0 && rangeHeader != null && rangeHeader.toLowerCase(Locale.ROOT).startsWith("bytes=")) {
                String byteRange = rangeHeader.substring(rangeHeader.indexOf('=') + 1).trim();
                long start = 0;
                long end = totalSize - 1;

                int dash = byteRange.indexOf('-');
                if (dash >= 0) {
                    String startStr = byteRange.substring(0, dash).trim();
                    String endStr = byteRange.substring(dash + 1).trim();

                    if (startStr.isEmpty() && !endStr.isEmpty()) {
                        long suffix = Long.parseLong(endStr);
                        start = Math.max(0, totalSize - suffix);
                        end = totalSize - 1;
                    } else {
                        if (!startStr.isEmpty()) start = Long.parseLong(startStr);
                        if (!endStr.isEmpty()) end = Long.parseLong(endStr);
                    }
                }

                if (end >= totalSize) end = totalSize - 1;
                if (start > end || start >= totalSize) {
                    if (pfd != null) { try { pfd.close(); } catch (Exception ignored) {} }
                    if (afd != null) { try { afd.close(); } catch (Exception ignored) {} }
                    Map<String, String> errHeaders = new HashMap<>();
                    errHeaders.put("Content-Range", "bytes */" + totalSize);
                    errHeaders.put("Accept-Ranges", "bytes");
                    errHeaders.put("Access-Control-Allow-Origin", "*");
                    errHeaders.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                    errHeaders.put("Access-Control-Allow-Headers", "*");
                    return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", errHeaders,
                            new ByteArrayInputStream(new byte[0]));
                }

                long contentLength = end - start + 1;
                Map<String, String> headers = new HashMap<>();
                headers.put("Accept-Ranges", "bytes");
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + totalSize);
                headers.put("Content-Length", String.valueOf(contentLength));
                headers.put("Access-Control-Allow-Origin", "*");
                headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                headers.put("Access-Control-Allow-Headers", "*");
                headers.put("Cache-Control", "no-cache");

                if (isHead) {
                    if (pfd != null) { try { pfd.close(); } catch (Exception ignored) {} }
                    if (afd != null) { try { afd.close(); } catch (Exception ignored) {} }
                    return new WebResourceResponse(mime, null, 206, "Partial Content", headers,
                            new ByteArrayInputStream(new byte[0]));
                }

                Map<Long, Byte> patches = (mime != null && mime.contains("flac")) ? getFlacPatches(mediaUri) : java.util.Collections.emptyMap();
                InputStream is = createSeekableStream(directFile, pfd, afd, mediaUri, start, contentLength, patches);
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
            headers.put("Access-Control-Allow-Origin", "*");
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
            Map<Long, Byte> patches = (mime != null && mime.contains("flac")) ? getFlacPatches(mediaUri) : java.util.Collections.emptyMap();
            InputStream is = createSeekableStream(directFile, pfd, afd, mediaUri, 0, streamLength, patches);
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

    private JSONObject createTrackMetadata(Uri uri, String filename, String defaultAlbum, long size) {
        return createTrackMetadata(uri, filename, defaultAlbum, size, null);
    }

    private JSONObject createTrackMetadata(Uri uri, String filename, String defaultAlbum, long size, Map<String, JSONObject> mediaStoreMap) {
        JSONObject obj = new JSONObject();
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
            String encodedUri = URLEncoder.encode(uri.toString(), "UTF-8");
            String encodedName = URLEncoder.encode(filename, "UTF-8");
            String encodedMime = URLEncoder.encode(detectedMime, "UTF-8");
            String streamUrl = "https://appassets.androidplatform.net/android-media?uri=" + encodedUri
                    + "&name=" + encodedName
                    + "&mime=" + encodedMime
                    + "&size=" + size
                    + (rawPath != null && !rawPath.isEmpty() ? "&path=" + URLEncoder.encode(rawPath, "UTF-8") : "");

            obj.put("id", "android_" + System.currentTimeMillis() + "_" + Math.abs(uri.hashCode()));
            obj.put("filename", filename);
            obj.put("fullPath", (rawPath != null && !rawPath.isEmpty()) ? rawPath : filename);
            obj.put("title", title);
            obj.put("artist", artist);
            obj.put("album", album);
            obj.put("duration", durationMs > 0 ? (durationMs / 1000.0) : 0);
            obj.put("bitrate", bitrate > 0 ? bitrate : 320);
            obj.put("sampleRate", sampleRate);
            obj.put("channels", 2);
            obj.put("format", format);
            obj.put("size", size);
            obj.put("src", streamUrl);
            obj.put("cover", "https://appassets.androidplatform.net/android-media-art?uri=" + encodedUri);
            return obj;
        } catch (Exception e) {
            return null;
        }
    }

    private void scanMediaStoreAsync() {
        isScanCancelled = false;
        new Thread(() -> {
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
                            String encodedUri = URLEncoder.encode(trackUri.toString(), "UTF-8");
                            String encodedName = URLEncoder.encode(resolvedFilename, "UTF-8");
                            String encodedMime = URLEncoder.encode(detectedMime, "UTF-8");
                            String streamUrl = "https://appassets.androidplatform.net/android-media?uri=" + encodedUri
                                    + "&name=" + encodedName
                                    + "&mime=" + encodedMime
                                    + "&size=" + size
                                    + (rawPath != null && !rawPath.isEmpty() ? "&path=" + URLEncoder.encode(rawPath, "UTF-8") : "");

                            JSONObject obj = new JSONObject();
                            obj.put("id", "android_" + id);
                            obj.put("filename", resolvedFilename);
                            obj.put("fullPath", (rawPath != null && !rawPath.isEmpty()) ? rawPath : resolvedFilename);
                            obj.put("title", title != null ? title : "Unknown Title");
                            obj.put("artist", (artist != null && !artist.equals("<unknown>")) ? artist : "Unknown Artist");
                            obj.put("album", (album != null && !album.equals("<unknown>")) ? album : "Device Music");
                            obj.put("duration", dur > 0 ? (dur / 1000.0) : 0);
                            obj.put("bitrate", 320);
                            obj.put("sampleRate", 44100);
                            obj.put("channels", 2);
                            obj.put("format", format);
                            obj.put("size", size);
                            obj.put("src", streamUrl);
                            obj.put("cover", "https://appassets.androidplatform.net/android-media-art?uri=" + encodedUri);
                            list.add(obj);

                            if (list.size() % 25 == 0 || list.size() == totalRows) {
                                final int count = list.size();
                                long elapsed = System.currentTimeMillis() - scanStartTime;
                                int etaSec = 0;
                                if (count > 0 && totalRows > count) {
                                    double rate = (double) count / Math.max(1, elapsed);
                                    etaSec = (int) Math.ceil((totalRows - count) / (rate * 1000.0));
                                }
                                final int finalEta = etaSec;
                                new Handler(Looper.getMainLooper()).post(() -> {
                                    String js = "if (window.__cachyMusic && window.__cachyMusic.android && window.__cachyMusic.android.onScanProgress) { window.__cachyMusic.android.onScanProgress(" + count + ", " + totalRows + ", 'Device Music Library', " + finalEta + "); }";
                                    webView.evaluateJavascript(js, null);
                                });
                            }
                        }
                    }
                }

                if (isScanCancelled) {
                    new Handler(Looper.getMainLooper()).post(() -> {
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
                new Handler(Looper.getMainLooper()).post(() -> {
                    String js = "if (window.__cachyMusic && window.__cachyMusic.android && window.__cachyMusic.android.onTracksDiscovered) { window.__cachyMusic.android.onTracksDiscovered("
                            + jsonString + ", 'Device Music Library'); }";
                    webView.evaluateJavascript(js, null);
                });
            } catch (Exception e) {
                Log.e(TAG, "MediaStore scan error: " + e.getMessage(), e);
            }
        }).start();
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
            stopService(new Intent(this, MediaPlaybackService.class));
        } catch (Exception ignored) {}
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