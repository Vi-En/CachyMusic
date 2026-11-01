package org.cachymusic.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentUris;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

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
                                return new WebResourceResponse("image/jpeg", "UTF-8", new ByteArrayInputStream(art));
                            }
                        } catch (Exception ignored) {}
                    }
                }

                if (path != null && path.startsWith("/android-media")) {
                    String uriParam = uri.getQueryParameter("uri");
                    if (uriParam != null) {
                        try {
                            Uri mediaUri = Uri.parse(uriParam);
                            String mime = getContentResolver().getType(mediaUri);
                            if (mime == null) mime = "audio/mpeg";
                            InputStream is = getContentResolver().openInputStream(mediaUri);
                            return new WebResourceResponse(mime, "UTF-8", is);
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

            String encodedUri = URLEncoder.encode(uri.toString(), "UTF-8");
            String streamUrl = "https://appassets.androidcache.net/android-media?uri=" + encodedUri;

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
                Uri musicUri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                String[] projection = new String[]{
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.SIZE,
                    MediaStore.Audio.Media.DISPLAY_NAME
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

                        while (cursor.moveToNext() && list.size() < 5000) {
                            if (isScanCancelled) break;
                            long id = cursor.getLong(idCol);
                            String title = cursor.getString(titleCol);
                            String artist = cursor.getString(artistCol);
                            String album = cursor.getString(albumCol);
                            long dur = cursor.getLong(durCol);
                            long size = cursor.getLong(sizeCol);
                            String name = cursor.getString(nameCol);

                            String resolvedFilename = name != null ? name : ((title != null ? title : "Track") + ".mp3");
                            String format = "MP3";
                            int dotIdx = resolvedFilename.lastIndexOf('.');
                            if (dotIdx > 0 && dotIdx < resolvedFilename.length() - 1) {
                                format = resolvedFilename.substring(dotIdx + 1).toUpperCase();
                            }

                            Uri trackUri = ContentUris.withAppendedId(musicUri, id);
                            String encodedUri = URLEncoder.encode(trackUri.toString(), "UTF-8");
                            String streamUrl = "https://appassets.androidcache.net/android-media?uri=" + encodedUri;

                            JSONObject obj = new JSONObject();
                            obj.put("id", "android_" + id);
                            obj.put("filename", resolvedFilename);
                            obj.put("fullPath", resolvedFilename);
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

                            if (list.size() % 10 == 0) {
                                final int count = list.size();
                                new Handler(Looper.getMainLooper()).post(() -> {
                                    String js = "if (window.onAndroidScanProgress) { window.onAndroidScanProgress(" + count + ", " + totalRows + ", 'Device Music Library'); }";
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