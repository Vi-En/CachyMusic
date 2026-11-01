package org.cachymusic.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentUris;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Log;
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
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.channels.Channels;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import android.provider.OpenableColumns;

public class MainActivity extends Activity {
    private static final String TAG = "CachyMusic";
    private static final String PREFS_NAME = "cachymusic_prefs";
    private static final String CACHED_LIB_FILE = "cached_library.json";
    private static final String STANDALONE_URL = "https://appassets.androidcache.net/index.html";
    private static final int FILECHOOSER_RESULTCODE = 1001;
    private static final int FOLDER_PICKER_RESULTCODE = 1002;

    private WebView webView;
    private SharedPreferences prefs;
    private ValueCallback<Uri[]> uploadMessage;
    private WebViewAssetLoader assetLoader;
    private String currentUrl = STANDALONE_URL;
    private volatile boolean isScanCancelled = false;

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
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

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

        // Configure modern offline asset loader (appassets.androidcache.net is a secure https context)
        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidcache.net")
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

                // 1. Direct local audio streaming via ContentResolver
                if (path != null && path.startsWith("/android-media-art")) {
                    String uriParam = uri.getQueryParameter("uri");
                    if (uriParam != null) {
                        try (MediaMetadataRetriever mmr = new MediaMetadataRetriever()) {
                            mmr.setDataSource(MainActivity.this, Uri.parse(uriParam));
                            byte[] art = mmr.getEmbeddedPicture();
                            if (art != null) {
                                return new WebResourceResponse("image/jpeg", null, new ByteArrayInputStream(art));
                            }
                        } catch (Exception ignored) {}
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
                        String json = "{\"success\": false, \"status\": \"offline\", \"message\": \"Standalone mode active\"}";
                        return new WebResourceResponse("application/json", "UTF-8",
                                new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
                    }
                    if (path.contains("hardware_volume.php")) {
                        String json = "{\"success\": true, \"supported\": false}";
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
                    String js = "if (window.onAndroidScanProgress) { window.onAndroidScanProgress(0, 0, " + JSONObject.quote(fName) + "); }";
                    webView.evaluateJavascript(js, null);
                });

                List<JSONObject> tracksList = new ArrayList<>();
                scanDirectoryRecursive(pickedDir, folderName, tracksList, 0);

                if (isScanCancelled) {
                    new Handler(Looper.getMainLooper()).post(() -> {
                        webView.evaluateJavascript("if (window.onAndroidScanCancelled) { window.onAndroidScanCancelled(); }", null);
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
                    String js = "if (window.onAndroidTracksDiscovered) { window.onAndroidTracksDiscovered("
                            + jsonString + ", " + JSONObject.quote(fName) + "); }";
                    webView.evaluateJavascript(js, null);
                });
            } catch (Exception e) {
                Log.e(TAG, "Folder scan error: " + e.getMessage(), e);
            }
        }).start();
    }

    private void scanDirectoryRecursive(DocumentFile dir, String albumDefault, List<JSONObject> results, int depth) {
        if (isScanCancelled || depth > 6 || dir == null || results.size() > 5000) return;
        DocumentFile[] files = dir.listFiles();
        if (files == null) return;

        for (DocumentFile file : files) {
            if (isScanCancelled) return;
            if (file.isDirectory()) {
                scanDirectoryRecursive(file, file.getName(), results, depth + 1);
            } else {
                String name = file.getName();
                if (name != null && isAudioFile(name)) {
                    try {
                        JSONObject track = createTrackMetadata(file.getUri(), name, albumDefault, file.length());
                        if (track != null) {
                            results.add(track);
                            if (results.size() % 5 == 0) {
                                final int count = results.size();
                                final String fLabel = albumDefault != null ? albumDefault : "Selected Folder";
                                new Handler(Looper.getMainLooper()).post(() -> {
                                    String js = "if (window.onAndroidScanProgress) { window.onAndroidScanProgress(" + count + ", 0, " + JSONObject.quote(fLabel) + "); }";
                                    webView.evaluateJavascript(js, null);
                                });
                            }
                        }
                    } catch (Exception ignored) {}
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

    private static class LimitedInputStream extends FilterInputStream {
        private long remaining;
        private final ParcelFileDescriptor pfd;
        private final AssetFileDescriptor afd;
        private final RandomAccessFile raf;

        public LimitedInputStream(InputStream in, long limit, ParcelFileDescriptor pfd, AssetFileDescriptor afd, RandomAccessFile raf) {
            super(in);
            this.remaining = Math.max(0, limit);
            this.pfd = pfd;
            this.afd = afd;
            this.raf = raf;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int b = super.read();
            if (b != -1) remaining--;
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int toRead = (int) Math.min(len, remaining);
            int read = super.read(b, off, toRead);
            if (read != -1) remaining -= read;
            return read;
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

    private InputStream createSeekableStream(File directFile, ParcelFileDescriptor pfd, AssetFileDescriptor afd, Uri uri, long start, long length) {
        if (directFile != null) {
            try {
                RandomAccessFile raf = new RandomAccessFile(directFile, "r");
                if (start > 0) {
                    raf.seek(start);
                }
                InputStream is = Channels.newInputStream(raf.getChannel());
                return new LimitedInputStream(is, length, null, null, raf);
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
                return new LimitedInputStream(fis, length, pfd, null, null);
            } catch (Throwable e) {
                Log.w(TAG, "pfd Os.lseek fallback: " + e.getMessage());
                try {
                    FileInputStream fis = new FileInputStream(pfd.getFileDescriptor());
                    if (start > 0) {
                        fis.getChannel().position(start);
                    }
                    return new LimitedInputStream(fis, length, pfd, null, null);
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
                return new LimitedInputStream(fis, length, null, afd, null);
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
                return new LimitedInputStream(is, length, null, null, null);
            }
        } catch (Exception e) {
            Log.e(TAG, "InputStream fallback failed: " + e.getMessage());
        }
        return null;
    }

    private WebResourceResponse handleAndroidMediaStream(Uri requestUri, Uri mediaUri, WebResourceRequest request) {
        try {
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

            String mime = (mimeParam != null && !mimeParam.isEmpty() && !mimeParam.equals("application/octet-stream"))
                    ? mimeParam
                    : fastDetectMime(nameParam, null);
            mime = normalizeMimeType(mime);

            Map<String, String> requestHeaders = request != null ? request.getRequestHeaders() : null;
            String rangeHeader = requestHeaders != null ? requestHeaders.get("Range") : null;
            if (rangeHeader == null && requestHeaders != null) {
                rangeHeader = requestHeaders.get("range");
            }

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

            if (directFile == null) {
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

            if (totalSize > 0 && rangeHeader != null && rangeHeader.startsWith("bytes=")) {
                String byteRange = rangeHeader.substring(6).trim();
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
                InputStream is = createSeekableStream(directFile, pfd, afd, mediaUri, start, contentLength);
                if (is == null) {
                    Log.e(TAG, "Failed to create seekable stream for: " + mediaUri);
                    return null;
                }

                Map<String, String> headers = new HashMap<>();
                headers.put("Content-Type", mime);
                headers.put("Accept-Ranges", "bytes");
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + totalSize);
                headers.put("Content-Length", String.valueOf(contentLength));
                headers.put("Access-Control-Allow-Origin", "*");
                headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                headers.put("Access-Control-Allow-Headers", "*");
                headers.put("Cache-Control", "no-cache");

                return new WebResourceResponse(mime, null, 206, "Partial Content", headers, is);
            }

            // Normal full stream response (or when totalSize unknown)
            long streamLength = totalSize > 0 ? totalSize : Long.MAX_VALUE;
            InputStream is = createSeekableStream(directFile, pfd, afd, mediaUri, 0, streamLength);
            if (is == null) {
                Log.e(TAG, "Failed to create full stream for: " + mediaUri);
                return null;
            }

            Map<String, String> headers = new HashMap<>();
            headers.put("Content-Type", mime);
            headers.put("Accept-Ranges", "bytes");
            if (totalSize > 0) {
                headers.put("Content-Length", String.valueOf(totalSize));
            }
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
            headers.put("Access-Control-Allow-Headers", "*");
            headers.put("Cache-Control", "no-cache");

            return new WebResourceResponse(mime, null, 200, "OK", headers, is);
        } catch (Exception e) {
            Log.e(TAG, "Audio stream intercept error: " + e.getMessage(), e);
            return null;
        }
    }

    private boolean isAudioFile(String name) {
        String lower = name.toLowerCase();
        return lower.endsWith(".mp3") || lower.endsWith(".flac") || lower.endsWith(".wav") ||
               lower.endsWith(".ogg") || lower.endsWith(".m4a") || lower.endsWith(".aac") ||
               lower.endsWith(".opus") || lower.endsWith(".alac") || lower.endsWith(".aiff");
    }

    private JSONObject createTrackMetadata(Uri uri, String filename, String defaultAlbum, long size) {
        JSONObject obj = new JSONObject();
        try {
            String title = filename;
            String artist = "Unknown Artist";
            String album = defaultAlbum != null ? defaultAlbum : "Unknown Album";
            long durationMs = 0;
            int sampleRate = 44100;
            int bitrate = 320;
            String format = "MP3";

            int dotIdx = filename.lastIndexOf('.');
            if (dotIdx > 0) {
                title = filename.substring(0, dotIdx);
                format = filename.substring(dotIdx + 1).toUpperCase();
            }

            try (MediaMetadataRetriever mmr = new MediaMetadataRetriever()) {
                mmr.setDataSource(this, uri);
                String t = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE);
                if (t != null && !t.trim().isEmpty()) title = t.trim();

                String a = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST);
                if (a != null && !a.trim().isEmpty()) artist = a.trim();

                String alb = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM);
                if (alb != null && !alb.trim().isEmpty()) album = alb.trim();

                String dur = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                if (dur != null) {
                    try { durationMs = Long.parseLong(dur); } catch (NumberFormatException ignored) {}
                }

                String br = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE);
                if (br != null) {
                    try { bitrate = (int) (Long.parseLong(br) / 1000); } catch (NumberFormatException ignored) {}
                }
            } catch (Exception ignored) {}

            String detectedMime = detectMimeType(uri, filename, "audio/mpeg");
            String encodedUri = URLEncoder.encode(uri.toString(), "UTF-8");
            String encodedName = URLEncoder.encode(filename, "UTF-8");
            String encodedMime = URLEncoder.encode(detectedMime, "UTF-8");
            String streamUrl = "https://appassets.androidcache.net/android-media?uri=" + encodedUri
                    + "&name=" + encodedName
                    + "&mime=" + encodedMime
                    + "&size=" + size;

            obj.put("id", "android_" + System.currentTimeMillis() + "_" + Math.abs(uri.hashCode()));
            obj.put("filename", filename);
            obj.put("fullPath", filename);
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
            obj.put("cover", "https://appassets.androidcache.net/android-media-art?uri=" + encodedUri);
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
                            String streamUrl = "https://appassets.androidcache.net/android-media?uri=" + encodedUri
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
                            obj.put("cover", "https://appassets.androidcache.net/android-media-art?uri=" + encodedUri);
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
                                    String js = "if (window.onAndroidScanProgress) { window.onAndroidScanProgress(" + count + ", " + totalRows + ", 'Device Music Library', " + finalEta + "); }";
                                    webView.evaluateJavascript(js, null);
                                });
                            }
                        }
                    }
                }

                if (isScanCancelled) {
                    new Handler(Looper.getMainLooper()).post(() -> {
                        webView.evaluateJavascript("if (window.onAndroidScanCancelled) { window.onAndroidScanCancelled(); }", null);
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
                    String js = "if (window.onAndroidTracksDiscovered) { window.onAndroidTracksDiscovered("
                            + jsonString + ", 'Device Music Library'); }";
                    webView.evaluateJavascript(js, null);
                });
            } catch (Exception e) {
                Log.e(TAG, "MediaStore scan error: " + e.getMessage(), e);
            }
        }).start();
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