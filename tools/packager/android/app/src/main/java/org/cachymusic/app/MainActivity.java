package org.cachymusic.app;

import android.annotation.TargetApi;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.URI;
import java.util.Enumeration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class MainActivity extends Activity {
    private static final String PREFS_NAME = "cachymusic_prefs";
    private static final String PREF_SERVER_URL = "server_url";

    private WebView webView;
    private SharedPreferences prefs;
    private String currentUrl = "";
    private boolean isConnectScreen = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF0A0B0E);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);

        webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");
        webView.setWebChromeClient(new WebChromeClient());

        webView.setWebViewClient(new WebViewClient() {
            private boolean hasError = false;

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                hasError = false;
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                hasError = true;
                if (!isConnectScreen) {
                    showConnectionScreen(failingUrl, description);
                }
            }

            @TargetApi(Build.VERSION_CODES.M)
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    hasError = true;
                    if (!isConnectScreen) {
                        CharSequence desc = (error != null) ? error.getDescription() : "Connection failed";
                        showConnectionScreen(request.getUrl().toString(), desc.toString());
                    }
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (!hasError && !isConnectScreen && url != null && url.startsWith("http")) {
                    currentUrl = url;
                    prefs.edit().putString(PREF_SERVER_URL, url).apply();
                }
            }
        });

        String saved = prefs.getString(PREF_SERVER_URL, "").trim();
        if (!saved.isEmpty()) {
            currentUrl = saved;
            webView.loadUrl(saved);
        } else {
            showConnectionScreen("", null);
        }
    }

    public void showConnectionScreen(final String failingUrl, final String errorMsg) {
        runOnUiThread(() -> {
            isConnectScreen = true;
            String savedUrl = prefs.getString(PREF_SERVER_URL, "").trim();
            String defaultVal = savedUrl;
            if (defaultVal.isEmpty() && failingUrl != null && !failingUrl.isEmpty() && !failingUrl.startsWith("http://localhost")) {
                defaultVal = failingUrl;
            }
            String html = generateConnectHtml(defaultVal, failingUrl, errorMsg);
            webView.loadDataWithBaseURL("http://localhost", html, "text/html", "UTF-8", null);
        });
    }

    private void connectToServer(String input) {
        final String normalized = normalizeUrl(input);
        if (normalized.isEmpty()) return;

        runOnUiThread(() -> {
            isConnectScreen = false;
            currentUrl = normalized;
            webView.loadUrl(normalized);
        });
    }

    private String normalizeUrl(String input) {
        if (input == null) return "";
        String url = input.trim();
        if (url.isEmpty()) return "";

        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://" + url;
        }

        try {
            URI uri = new URI(url);
            if (uri.getPort() == -1 && uri.getHost() != null) {
                String host = uri.getHost();
                int idx = url.indexOf(host) + host.length();
                url = url.substring(0, idx) + ":8000" + url.substring(idx);
            }
        } catch (Exception ignored) {}

        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        return url;
    }

    private boolean isEmulator() {
        return (Build.FINGERPRINT.startsWith("generic")
                || Build.FINGERPRINT.startsWith("unknown")
                || Build.MODEL.contains("google_sdk")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK built for x86")
                || Build.MANUFACTURER.contains("Genymotion")
                || Build.HARDWARE.contains("goldfish")
                || Build.HARDWARE.contains("ranchu"));
    }

    private String getLocalSubnetPrefix() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();
                if (iface.isLoopback() || !iface.isUp()) continue;
                Enumeration<InetAddress> addrs = iface.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress addr = addrs.nextElement();
                    if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) {
                        String ip = addr.getHostAddress();
                        if (ip != null && !ip.startsWith("127.")) {
                            int lastDot = ip.lastIndexOf('.');
                            if (lastDot > 0) {
                                return ip.substring(0, lastDot + 1);
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {}
        return "192.168.1.";
    }

    private void scanSubnet() {
        new Thread(() -> {
            final String prefix = getLocalSubnetPrefix();
            runOnUiThread(() -> {
                String js = "if(window.onScanStatus) window.onScanStatus('Scanning Wi-Fi subnet " + prefix + "1-254 on port 8000...');";
                webView.evaluateJavascript(js, null);
            });

            ExecutorService executor = Executors.newFixedThreadPool(30);
            final AtomicInteger foundCount = new AtomicInteger(0);

            for (int i = 1; i <= 254; i++) {
                final String host = prefix + i;
                executor.execute(() -> {
                    try {
                        Socket socket = new Socket();
                        socket.connect(new InetSocketAddress(host, 8000), 300);
                        socket.close();
                        final String foundUrl = "http://" + host + ":8000";
                        foundCount.incrementAndGet();
                        runOnUiThread(() -> {
                            String js = "if(window.onServerDiscovered) window.onServerDiscovered('" + foundUrl + "');";
                            webView.evaluateJavascript(js, null);
                        });
                    } catch (Exception ignored) {}
                });
            }

            executor.shutdown();
            try {
                executor.awaitTermination(4, TimeUnit.SECONDS);
            } catch (InterruptedException ignored) {}

            runOnUiThread(() -> {
                int count = foundCount.get();
                String msg = (count > 0)
                        ? "Scan complete. Found " + count + " active CachyMusic server(s)."
                        : "Scan finished. No CachyMusic servers found on " + prefix + "0/24.";
                String js = "if(window.onScanComplete) window.onScanComplete('" + msg + "');";
                webView.evaluateJavascript(js, null);
            });
        }).start();
    }

    private class WebAppInterface {
        @JavascriptInterface
        public void connect(String url) {
            connectToServer(url);
        }

        @JavascriptInterface
        public void scanNetwork() {
            scanSubnet();
        }

        @JavascriptInterface
        public void openServerSettings() {
            showConnectionScreen(currentUrl, null);
        }
    }

    private String generateConnectHtml(String defaultVal, String failingUrl, String errorMsg) {
        String placeholder = "http://" + getLocalSubnetPrefix() + "xxx:8000";
        boolean hasError = (errorMsg != null && !errorMsg.isEmpty());

        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n")
          .append("<meta charset=\"utf-8\">\n")
          .append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no\">\n")
          .append("<title>CachyMusic Connect</title>\n")
          .append("<style>\n")
          .append(":root {\n")
          .append("  --bg-base: #0a0b0e;\n")
          .append("  --bg-card: #12141a;\n")
          .append("  --bg-input: #1a1e28;\n")
          .append("  --border-color: #242938;\n")
          .append("  --accent-cyan: #00e5ff;\n")
          .append("  --accent-cyan-glow: rgba(0, 229, 255, 0.25);\n")
          .append("  --accent-emerald: #10b981;\n")
          .append("  --accent-red: #ef4444;\n")
          .append("  --text-primary: #e2e8f0;\n")
          .append("  --text-muted: #8892b0;\n")
          .append("  --touch-min: 48px;\n")
          .append("}\n")
          .append("* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }\n")
          .append("body {\n")
          .append("  background-color: var(--bg-base);\n")
          .append("  color: var(--text-primary);\n")
          .append("  min-height: 100vh;\n")
          .append("  display: flex;\n")
          .append("  flex-direction: column;\n")
          .append("  align-items: center;\n")
          .append("  justify-content: center;\n")
          .append("  padding: 1.25rem;\n")
          .append("}\n")
          .append(".container {\n")
          .append("  width: 100%;\n")
          .append("  max-width: 440px;\n")
          .append("  background: var(--bg-card);\n")
          .append("  border: 1px solid var(--border-color);\n")
          .append("  border-radius: 14px;\n")
          .append("  padding: 1.5rem;\n")
          .append("  box-shadow: 0 12px 32px rgba(0,0,0,0.6);\n")
          .append("}\n")
          .append(".header {\n")
          .append("  text-align: center;\n")
          .append("  margin-bottom: 1.5rem;\n")
          .append("}\n")
          .append(".turntable-icon {\n")
          .append("  width: 64px;\n")
          .append("  height: 64px;\n")
          .append("  margin: 0 auto 0.75rem;\n")
          .append("  display: block;\n")
          .append("  animation: pulseGlow 3s infinite ease-in-out;\n")
          .append("}\n")
          .append("@keyframes pulseGlow {\n")
          .append("  0%, 100% { filter: drop-shadow(0 0 6px rgba(0, 229, 255, 0.4)); }\n")
          .append("  50% { filter: drop-shadow(0 0 16px rgba(0, 229, 255, 0.8)); }\n")
          .append("}\n")
          .append("h1 {\n")
          .append("  font-size: 1.5rem;\n")
          .append("  font-weight: 700;\n")
          .append("  letter-spacing: 0.05em;\n")
          .append("  color: #fff;\n")
          .append("  margin-bottom: 0.25rem;\n")
          .append("}\n")
          .append(".subtitle {\n")
          .append("  font-size: 0.8rem;\n")
          .append("  color: var(--accent-cyan);\n")
          .append("  text-transform: uppercase;\n")
          .append("  letter-spacing: 0.1em;\n")
          .append("  font-weight: 600;\n")
          .append("}\n")
          .append(".banner-error {\n")
          .append("  background: rgba(239, 68, 68, 0.12);\n")
          .append("  border: 1px solid rgba(239, 68, 68, 0.4);\n")
          .append("  border-radius: 8px;\n")
          .append("  padding: 0.75rem;\n")
          .append("  margin-bottom: 1.25rem;\n")
          .append("  font-size: 0.825rem;\n")
          .append("  color: #fca5a5;\n")
          .append("  line-height: 1.4;\n")
          .append("}\n")
          .append(".banner-error strong {\n")
          .append("  color: #f87171;\n")
          .append("  display: block;\n")
          .append("  margin-bottom: 0.2rem;\n")
          .append("}\n")
          .append(".form-group {\n")
          .append("  margin-bottom: 1.25rem;\n")
          .append("}\n")
          .append("label {\n")
          .append("  display: block;\n")
          .append("  font-size: 0.75rem;\n")
          .append("  font-weight: 600;\n")
          .append("  color: var(--text-muted);\n")
          .append("  letter-spacing: 0.08em;\n")
          .append("  text-transform: uppercase;\n")
          .append("  margin-bottom: 0.5rem;\n")
          .append("}\n")
          .append("input[type=\"text\"] {\n")
          .append("  width: 100%;\n")
          .append("  height: var(--touch-min);\n")
          .append("  background: var(--bg-input);\n")
          .append("  border: 1px solid var(--border-color);\n")
          .append("  border-radius: 8px;\n")
          .append("  padding: 0 1rem;\n")
          .append("  font-size: 0.95rem;\n")
          .append("  color: #fff;\n")
          .append("  outline: none;\n")
          .append("  transition: border-color 0.2s, box-shadow 0.2s;\n")
          .append("}\n")
          .append("input[type=\"text\"]:focus {\n")
          .append("  border-color: var(--accent-cyan);\n")
          .append("  box-shadow: 0 0 0 2px var(--accent-cyan-glow);\n")
          .append("}\n")
          .append(".btn-group {\n")
          .append("  display: flex;\n")
          .append("  flex-direction: column;\n")
          .append("  gap: 0.75rem;\n")
          .append("  margin-bottom: 1.25rem;\n")
          .append("}\n")
          .append("button {\n")
          .append("  height: var(--touch-min);\n")
          .append("  border-radius: 8px;\n")
          .append("  font-size: 0.9rem;\n")
          .append("  font-weight: 600;\n")
          .append("  letter-spacing: 0.05em;\n")
          .append("  cursor: pointer;\n")
          .append("  border: none;\n")
          .append("  transition: background 0.2s, transform 0.1s, box-shadow 0.2s;\n")
          .append("  display: flex;\n")
          .append("  align-items: center;\n")
          .append("  justify-content: center;\n")
          .append("  gap: 0.5rem;\n")
          .append("}\n")
          .append("button:active { transform: scale(0.98); }\n")
          .append(".btn-primary {\n")
          .append("  background: var(--accent-cyan);\n")
          .append("  color: #050608;\n")
          .append("  box-shadow: 0 4px 14px var(--accent-cyan-glow);\n")
          .append("}\n")
          .append(".btn-secondary {\n")
          .append("  background: #1a1e28;\n")
          .append("  color: var(--text-primary);\n")
          .append("  border: 1px solid var(--border-color);\n")
          .append("}\n")
          .append(".discovery-section {\n")
          .append("  border-top: 1px solid var(--border-color);\n")
          .append("  padding-top: 1rem;\n")
          .append("  margin-top: 1rem;\n")
          .append("}\n")
          .append(".discovery-title {\n")
          .append("  font-size: 0.75rem;\n")
          .append("  color: var(--text-muted);\n")
          .append("  text-transform: uppercase;\n")
          .append("  letter-spacing: 0.08em;\n")
          .append("  margin-bottom: 0.5rem;\n")
          .append("  display: flex;\n")
          .append("  justify-content: space-between;\n")
          .append("  align-items: center;\n")
          .append("}\n")
          .append(".spinner {\n")
          .append("  display: inline-block;\n")
          .append("  width: 14px;\n")
          .append("  height: 14px;\n")
          .append("  border: 2px solid rgba(0,229,255,0.3);\n")
          .append("  border-top-color: var(--accent-cyan);\n")
          .append("  border-radius: 50%;\n")
          .append("  animation: spin 0.8s linear infinite;\n")
          .append("}\n")
          .append("@keyframes spin { to { transform: rotate(360deg); } }\n")
          .append(".server-pill {\n")
          .append("  display: flex;\n")
          .append("  align-items: center;\n")
          .append("  justify-content: space-between;\n")
          .append("  background: #161b26;\n")
          .append("  border: 1px solid rgba(0, 229, 255, 0.3);\n")
          .append("  border-radius: 6px;\n")
          .append("  padding: 0.6rem 0.8rem;\n")
          .append("  margin-bottom: 0.5rem;\n")
          .append("  cursor: pointer;\n")
          .append("}\n")
          .append(".server-pill:hover { border-color: var(--accent-cyan); }\n")
          .append(".server-pill-name { font-size: 0.85rem; color: #fff; font-weight: 500; }\n")
          .append(".server-pill-btn { font-size: 0.75rem; color: var(--accent-cyan); font-weight: 600; }\n")
          .append(".instructions {\n")
          .append("  background: #0f1118;\n")
          .append("  border-radius: 8px;\n")
          .append("  padding: 0.8rem;\n")
          .append("  font-size: 0.78rem;\n")
          .append("  color: var(--text-muted);\n")
          .append("  line-height: 1.5;\n")
          .append("  margin-top: 1rem;\n")
          .append("}\n")
          .append(".instructions ol { padding-left: 1.2rem; margin-top: 0.3rem; }\n")
          .append(".instructions li { margin-bottom: 0.25rem; }\n")
          .append(".instructions code {\n")
          .append("  background: #1a1e28;\n")
          .append("  color: var(--accent-cyan);\n")
          .append("  padding: 0.1rem 0.3rem;\n")
          .append("  border-radius: 4px;\n")
          .append("  font-family: monospace;\n")
          .append("  font-size: 0.8rem;\n")
          .append("}\n")
          .append("</style>\n</head>\n<body>\n")
          .append("<div class=\"container\">\n")
          .append("  <div class=\"header\">\n")
          .append("    <svg class=\"turntable-icon\" viewBox=\"0 0 100 100\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n")
          .append("      <circle cx=\"50\" cy=\"50\" r=\"48\" fill=\"#12141a\" stroke=\"#00e5ff\" stroke-width=\"2\"/>\n")
          .append("      <circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"#0c0d12\" stroke=\"#242938\" stroke-width=\"1.5\"/>\n")
          .append("      <circle cx=\"50\" cy=\"50\" r=\"32\" stroke=\"#1f2433\" stroke-width=\"1\"/>\n")
          .append("      <circle cx=\"50\" cy=\"50\" r=\"24\" stroke=\"#1f2433\" stroke-width=\"1\"/>\n")
          .append("      <circle cx=\"50\" cy=\"50\" r=\"16\" fill=\"#00e5ff\" fill-opacity=\"0.2\" stroke=\"#00e5ff\" stroke-width=\"1.5\"/>\n")
          .append("      <circle cx=\"50\" cy=\"50\" r=\"4\" fill=\"#00e5ff\"/>\n")
          .append("      <path d=\"M78 22 L56 46\" stroke=\"#00e5ff\" stroke-width=\"2.5\" stroke-linecap=\"round\"/>\n")
          .append("      <circle cx=\"78\" cy=\"22\" r=\"5\" fill=\"#00e5ff\"/>\n")
          .append("    </svg>\n")
          .append("    <h1>CachyMusic</h1>\n")
          .append("    <div class=\"subtitle\">Lossless Streaming Client</div>\n")
          .append("  </div>\n");

        if (hasError) {
            sb.append("  <div class=\"banner-error\">\n")
              .append("    <strong>Connection Failed</strong>\n")
              .append("    Unable to reach: <code>").append(failingUrl != null ? escapeHtml(failingUrl) : "").append("</code><br>\n")
              .append("    Reason: ").append(escapeHtml(errorMsg)).append("\n")
              .append("  </div>\n");
        }

        sb.append("  <div class=\"form-group\">\n")
          .append("    <label for=\"serverUrl\">CachyMusic Server Address</label>\n")
          .append("    <input type=\"text\" id=\"serverUrl\" value=\"").append(escapeHtml(defaultVal)).append("\" placeholder=\"").append(escapeHtml(placeholder)).append("\" autocomplete=\"off\" autocorrect=\"off\" autocapitalize=\"off\" spellcheck=\"false\">\n")
          .append("  </div>\n")
          .append("  <div class=\"btn-group\">\n")
          .append("    <button type=\"button\" class=\"btn-primary\" onclick=\"connectUrl()\">")
          .append(hasError ? "RETRY CONNECTION" : "CONNECT")
          .append("</button>\n")
          .append("    <button type=\"button\" class=\"btn-secondary\" onclick=\"startScan()\">SCAN LOCAL WI-FI</button>\n");

        if (isEmulator()) {
            sb.append("    <button type=\"button\" class=\"btn-secondary\" onclick=\"connectUrl('http://10.0.2.2:8000')\" style=\"color:#00e5ff; font-size:0.8rem;\">EMULATOR HOST (10.0.2.2:8000)</button>\n");
        }

        sb.append("  </div>\n")
          .append("  <div class=\"discovery-section\">\n")
          .append("    <div class=\"discovery-title\">\n")
          .append("      <span id=\"scanStatus\">Ready to scan local Wi-Fi</span>\n")
          .append("      <span id=\"scanSpinner\" class=\"spinner\" style=\"display:none;\"></span>\n")
          .append("    </div>\n")
          .append("    <div id=\"discoveredList\"></div>\n")
          .append("  </div>\n")
          .append("  <div class=\"instructions\">\n")
          .append("    <strong>Setup Instructions:</strong>\n")
          .append("    <ol>\n")
          .append("      <li>Run CachyMusic on your computer (<code>npm start</code> or double-click launcher).</li>\n")
          .append("      <li>Connect your phone to the same Wi-Fi network.</li>\n")
          .append("      <li>Find your streaming IP in CachyMusic's Mobile tab and enter it above.</li>\n")
          .append("    </ol>\n")
          .append("  </div>\n")
          .append("</div>\n")
          .append("<script>\n")
          .append("function connectUrl(url) {\n")
          .append("  if (!url) url = document.getElementById('serverUrl').value;\n")
          .append("  if (!url || !url.trim()) return;\n")
          .append("  url = url.trim();\n")
          .append("  if (window.AndroidBridge && window.AndroidBridge.connect) {\n")
          .append("    window.AndroidBridge.connect(url);\n")
          .append("  } else {\n")
          .append("    window.location.href = url;\n")
          .append("  }\n")
          .append("}\n")
          .append("function startScan() {\n")
          .append("  const statusEl = document.getElementById('scanStatus');\n")
          .append("  const spinner = document.getElementById('scanSpinner');\n")
          .append("  if (statusEl) statusEl.textContent = 'Scanning Wi-Fi network...';\n")
          .append("  if (spinner) spinner.style.display = 'inline-block';\n")
          .append("  document.getElementById('discoveredList').innerHTML = '';\n")
          .append("  if (window.AndroidBridge && window.AndroidBridge.scanNetwork) {\n")
          .append("    window.AndroidBridge.scanNetwork();\n")
          .append("  }\n")
          .append("}\n")
          .append("window.onServerDiscovered = function(url) {\n")
          .append("  const input = document.getElementById('serverUrl');\n")
          .append("  if (input && (!input.value || input.value.trim() === '')) {\n")
          .append("    input.value = url;\n")
          .append("  }\n")
          .append("  const list = document.getElementById('discoveredList');\n")
          .append("  if (!list) return;\n")
          .append("  const pill = document.createElement('div');\n")
          .append("  pill.className = 'server-pill';\n")
          .append("  pill.innerHTML = '<span class=\"server-pill-name\">📡 ' + url + '</span><span class=\"server-pill-btn\">CONNECT &rarr;</span>';\n")
          .append("  pill.onclick = function() { connectUrl(url); };\n")
          .append("  list.appendChild(pill);\n")
          .append("};\n")
          .append("window.onScanStatus = function(msg) {\n")
          .append("  const el = document.getElementById('scanStatus');\n")
          .append("  if (el) el.textContent = msg;\n")
          .append("};\n")
          .append("window.onScanComplete = function(msg) {\n")
          .append("  const el = document.getElementById('scanStatus');\n")
          .append("  const spinner = document.getElementById('scanSpinner');\n")
          .append("  if (el) el.textContent = msg;\n")
          .append("  if (spinner) spinner.style.display = 'none';\n")
          .append("};\n")
          .append("document.getElementById('serverUrl').addEventListener('keydown', function(e) {\n")
          .append("  if (e.key === 'Enter') { connectUrl(); }\n")
          .append("});\n")
          .append("window.onload = function() { startScan(); };\n")
          .append("</script>\n</body>\n</html>");
        return sb.toString();
    }

    private static String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (webView.canGoBack()) {
                webView.goBack();
                return true;
            }
            if (!isConnectScreen && currentUrl != null && !currentUrl.isEmpty()) {
                showExitOrSwitchDialog();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    private void showExitOrSwitchDialog() {
        new AlertDialog.Builder(this)
                .setTitle("CachyMusic")
                .setMessage("Connected to:\n" + currentUrl + "\n\nWould you like to switch servers or exit?")
                .setPositiveButton("Change Server", (dialog, which) -> showConnectionScreen(currentUrl, null))
                .setNegativeButton("Exit", (dialog, which) -> finish())
                .setNeutralButton("Cancel", null)
                .show();
    }
}
