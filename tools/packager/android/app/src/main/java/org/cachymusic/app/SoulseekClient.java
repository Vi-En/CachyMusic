package org.cachymusic.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.MediaScannerConnection;
import android.os.Environment;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.Inflater;

/**
 * CachyMusic Embedded Native Soulseek Client for Android
 * Provides 100% standalone, zero-dependency peer-to-peer Soulseek connectivity:
 * - Direct connection to official Soulseek network (server.slsknet.org:2242)
 * - Distributed peer search querying & live Zlib-decompressed peer response streaming
 * - Direct & firewalled peer file downloads streaming straight to device storage
 * - Automatic Android MediaStore indexing so downloaded tracks appear instantly in the library
 */
public class SoulseekClient {
    private static final String TAG = "CachyMusic_Soulseek";
    private static final String PREFS_NAME = "cachymusic_slsk_prefs";
    private static final String SLSK_SERVER_HOST = "server.slsknet.org";
    private static final int SLSK_SERVER_PORT = 2242;
    private static final int MAX_RESULTS_PER_SEARCH = 1500;
    private static final Set<String> AUDIO_EXTENSIONS = new HashSet<>(Arrays.asList(
            "mp3", "flac", "wav", "ogg", "oga", "opus", "m4a", "aac",
            "alac", "aiff", "aif", "wma", "ape", "wv", "dsf", "dff"
    ));

    private static volatile SoulseekClient sInstance;

    private final Context mContext;
    private final SharedPreferences mPrefs;
    private final ExecutorService mExecutor = Executors.newCachedThreadPool();
    private final ThreadPoolExecutor mPeerPool;
    private final ScheduledExecutorService mScheduler = Executors.newSingleThreadScheduledExecutor();
    private final Random mRandom = new Random();

    // Connection state
    private volatile boolean mIsConnected = false;
    private volatile boolean mIsConnecting = false;
    private volatile String mLastError = null;
    private volatile String mCurrentUsername = "";
    private volatile String mCurrentPassword = "";

    // Server networking
    private Socket mServerSocket;
    private OutputStream mServerOut;
    private InputStream mServerIn;
    private final Object mServerWriteLock = new Object();

    // Local listening server socket for peer connections
    private ServerSocket mLocalListenServer;
    private int mLocalListenPort = 0;

    // Search state
    private final AtomicInteger mTokenGenerator = new AtomicInteger(1000 + (int)(System.currentTimeMillis() % 100000));
    private final ConcurrentHashMap<Integer, List<SlskResult>> mSearchResults = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Integer> mActiveSearchQueries = new ConcurrentHashMap<>();

    // Peer connections & address resolution
    private final ConcurrentHashMap<String, PeerAddr> mPeerAddresses = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, PeerConnection> mActivePeers = new ConcurrentHashMap<>();

    // Transfers
    private final ConcurrentHashMap<String, DownloadTransfer> mTransfers = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, DownloadTransfer> mTransfersByToken = new ConcurrentHashMap<>();

    public static class PeerAddr {
        public final String host;
        public final int port;
        public final long timestamp;

        public PeerAddr(String host, int port) {
            this.host = host;
            this.port = port;
            this.timestamp = System.currentTimeMillis();
        }
    }

    public static class SlskResult {
        public String username;
        public String filePath;
        public String filename;
        public String extension;
        public long size;
        public boolean freeSlots;
        public int queuePosition;
        public int speed;
        public Integer bitrate;
        public Integer duration;
        public Integer sampleRate;
        public Integer bitDepth;
        public String artistGuess;
        public String albumGuess;
        public boolean isLossless;
        public boolean isHighBitrate;
    }

    public static class DownloadTransfer {
        public String id;
        public String username;
        public String virtualPath;
        public String filename;
        public long size;
        public volatile long bytesDownloaded;
        public volatile int speed;
        public volatile int progressPct;
        public volatile String status = "Queued"; // Queued, Connecting, Transferring, Paused, Finished, Error
        public volatile int queuePosition;
        public String localFilePath;
        public String partFilePath;
        public volatile String transferToken;
        public volatile boolean userCancelled = false;
        public volatile boolean userPaused = false;
        public Socket fileSocket;
        public long startTime;
    }

    public static SoulseekClient getInstance(Context context) {
        if (sInstance == null) {
            synchronized (SoulseekClient.class) {
                if (sInstance == null) {
                    sInstance = new SoulseekClient(context.getApplicationContext());
                }
            }
        }
        return sInstance;
    }

    private SoulseekClient(Context context) {
        mContext = context;
        mPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        mPeerPool = new ThreadPoolExecutor(
                16,
                32,
                30L,
                TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(256),
                new ThreadPoolExecutor.DiscardOldestPolicy()
        );
        mPeerPool.allowCoreThreadTimeOut(true);

        mCurrentUsername = mPrefs.getString("slsk_username", "");
        mCurrentPassword = mPrefs.getString("slsk_password", "");

        startLocalListenServer();

        // Server keepalive scheduled task
        mScheduler.scheduleAtFixedRate(() -> {
            if (mIsConnected) {
                sendSetStatus(2); // 2 = online
            }
        }, 30, 30, TimeUnit.SECONDS);
    }

    public String getDownloadsDir() {
        String saved = mPrefs.getString("slsk_downloads_dir", "");
        if (saved != null && !saved.trim().isEmpty()) {
            File f = new File(saved.trim());
            if (f.exists() || f.mkdirs()) {
                return f.getAbsolutePath();
            }
        }
        try {
            File publicMusic = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "CachyMusic");
            if (publicMusic.exists() || publicMusic.mkdirs()) {
                return publicMusic.getAbsolutePath();
            }
        } catch (Exception ignored) {}

        File appMusic = mContext.getExternalFilesDir(Environment.DIRECTORY_MUSIC);
        if (appMusic != null && (appMusic.exists() || appMusic.mkdirs())) {
            return appMusic.getAbsolutePath();
        }
        return new File(mContext.getFilesDir(), "downloads").getAbsolutePath();
    }

    public String getSharedDir() {
        String saved = mPrefs.getString("slsk_shared_dir", "");
        if (saved != null && !saved.trim().isEmpty()) {
            return saved.trim();
        }
        return getDownloadsDir();
    }

    public void setDownloadsDir(String dir) {
        if (dir != null && !dir.trim().isEmpty()) {
            mPrefs.edit().putString("slsk_downloads_dir", dir.trim()).apply();
            try {
                new File(dir.trim()).mkdirs();
            } catch (Exception ignored) {}
        }
    }

    public void setSharedDir(String dir) {
        if (dir != null && !dir.trim().isEmpty()) {
            mPrefs.edit().putString("slsk_shared_dir", dir.trim()).apply();
        }
    }

    private void startLocalListenServer() {
        mExecutor.submit(() -> {
            try {
                // Listen on any available port (0 = ephemeral)
                mLocalListenServer = new ServerSocket(0);
                mLocalListenPort = mLocalListenServer.getLocalPort();
                Log.i(TAG, "Soulseek local peer listener bound to port " + mLocalListenPort);

                while (!mLocalListenServer.isClosed()) {
                    try {
                        Socket peerSocket = mLocalListenServer.accept();
                        mExecutor.submit(() -> handleIncomingPeerSocket(peerSocket));
                    } catch (Exception e) {
                        if (mLocalListenServer.isClosed()) break;
                        Log.w(TAG, "Listen server accept error: " + e.getMessage());
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to bind local listen server: " + e.getMessage());
            }
        });
    }

    private void handleIncomingPeerSocket(Socket socket) {
        try {
            InputStream in = socket.getInputStream();
            // Read initial message length (4 bytes LE)
            byte[] lenBuf = new byte[4];
            if (readExact(in, lenBuf) < 4) {
                socket.close();
                return;
            }
            int msgLen = ByteBuffer.wrap(lenBuf).order(ByteOrder.LITTLE_ENDIAN).getInt();
            if (msgLen < 1 || msgLen > 65536) {
                socket.close();
                return;
            }

            byte[] body = new byte[msgLen];
            if (readExact(in, body) < msgLen) {
                socket.close();
                return;
            }

            ByteBuffer buf = ByteBuffer.wrap(body).order(ByteOrder.LITTLE_ENDIAN);
            byte code = buf.get();

            if (code == 0) {
                // PierceFirewall
                byte[] tokenBytes = new byte[4];
                buf.get(tokenBytes);
                String tokenHex = bytesToHex(tokenBytes);
                Log.d(TAG, "Incoming PierceFirewall with token " + tokenHex);
            } else if (code == 1) {
                // PeerInit
                String username = readStr(buf);
                String type = readStr(buf);
                byte[] tokenBytes = new byte[4];
                if (buf.remaining() >= 4) {
                    buf.get(tokenBytes);
                }
                String tokenHex = bytesToHex(tokenBytes);
                Log.d(TAG, "Incoming PeerInit from " + username + " type=" + type + " token=" + tokenHex);

                if ("F".equalsIgnoreCase(type)) {
                    // Incoming file transfer stream!
                    handleIncomingFileTransfer(socket, in, username, tokenHex);
                    return;
                } else if ("P".equalsIgnoreCase(type)) {
                    // Incoming peer message stream
                    socket.setSoTimeout(15000);
                    PeerConnection peerConn = new PeerConnection(socket, username);
                    mActivePeers.put(username, peerConn);
                    flushPendingDownloadsForPeer(username, peerConn);
                    peerConn.readLoopInline();
                    return;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Incoming peer socket error: " + e.getMessage());
        }
    }

    private void handleIncomingFileTransfer(Socket socket, InputStream in, String username, String initTokenHex) {
        mExecutor.submit(() -> {
            try {
                socket.setSoTimeout(30000);
                // Read 4-byte FileTransferInit (uint32 transfer token, no length prefix)
                byte[] fileTokBytes = new byte[4];
                String fileTokenHex = initTokenHex;
                if (readExact(in, fileTokBytes) == 4) {
                    fileTokenHex = bytesToHex(fileTokBytes);
                }
                streamIncomingFile(socket, in, username, fileTokenHex);
            } catch (Exception e) {
                Log.w(TAG, "File transfer error: " + e.getMessage());
            } finally {
                try { socket.close(); } catch (Exception ignored) {}
            }
        });
    }

    private void streamIncomingFile(Socket socket, InputStream in, String username, String tokenHex) throws IOException {
        DownloadTransfer transfer = tokenHex != null ? mTransfersByToken.get(tokenHex) : null;
        if (transfer == null) {
            // Match by username
            for (DownloadTransfer d : mTransfers.values()) {
                if (d.username.equalsIgnoreCase(username) &&
                        ("Connecting".equals(d.status) || "Queued".equals(d.status))) {
                    transfer = d;
                    break;
                }
            }
        }

        if (transfer == null || transfer.userCancelled) {
            socket.close();
            return;
        }

        // Send 8-byte LE FileOffset (0 or existing .part bytes)
        long startOffset = 0;
        File partFile = new File(transfer.partFilePath);
        if (partFile.exists()) {
            startOffset = partFile.length();
        }
        transfer.bytesDownloaded = startOffset;
        OutputStream out = socket.getOutputStream();
        byte[] offsetBuf = new byte[8];
        ByteBuffer.wrap(offsetBuf).order(ByteOrder.LITTLE_ENDIAN).putLong(startOffset);
        out.write(offsetBuf);
        out.flush();

        transfer.status = "Transferring";
        transfer.fileSocket = socket;

        // Stream raw file bytes into .part file
        try (FileOutputStream fos = new FileOutputStream(partFile, startOffset > 0)) {
            byte[] buffer = new byte[32768];
            long lastTime = System.currentTimeMillis();
            long lastBytes = startOffset;

            while (!transfer.userCancelled && !transfer.userPaused) {
                int read = in.read(buffer);
                if (read == -1) break; // EOF
                if (read > 0) {
                    fos.write(buffer, 0, read);
                    transfer.bytesDownloaded += read;

                    if (transfer.size > 0) {
                        transfer.progressPct = (int) Math.min(99, (transfer.bytesDownloaded * 100) / transfer.size);
                    }

                    long now = System.currentTimeMillis();
                    if (now - lastTime >= 500) {
                        double dt = (now - lastTime) / 1000.0;
                        transfer.speed = (int) ((transfer.bytesDownloaded - lastBytes) / dt);
                        lastTime = now;
                        lastBytes = transfer.bytesDownloaded;
                    }

                    if (transfer.size > 0 && transfer.bytesDownloaded >= transfer.size) {
                        break;
                    }
                }
            }
            fos.flush();
        }

        finalizeTransfer(transfer, partFile);
    }

    private void finalizeTransfer(DownloadTransfer transfer, File partFile) {
        if (transfer.userCancelled || transfer.userPaused) return;

        if (transfer.size <= 0 || transfer.bytesDownloaded >= transfer.size) {
            File targetFile = new File(transfer.localFilePath);
            if (partFile.exists()) {
                if (targetFile.exists()) targetFile.delete();
                partFile.renameTo(targetFile);
            }
            transfer.status = "Finished";
            transfer.progressPct = 100;
            transfer.speed = 0;

            // Notify Android MediaStore so track appears immediately in device music library!
            try {
                MediaScannerConnection.scanFile(mContext, new String[]{targetFile.getAbsolutePath()}, null,
                        (path, uri) -> Log.i(TAG, "Scanned newly downloaded track into MediaStore: " + path));
            } catch (Exception e) {
                Log.w(TAG, "MediaScanner error: " + e.getMessage());
            }
        }
    }

    // =========================================================================
    // Soulseek Protocol Connection & Server Communication
    // =========================================================================

    public synchronized boolean connect(String username, String password) {
        if (mIsConnected && mCurrentUsername.equalsIgnoreCase(username)) {
            return true;
        }

        mIsConnecting = true;
        mLastError = null;
        mCurrentUsername = username != null ? username.trim() : "";
        mCurrentPassword = password != null ? password.trim() : "";

        // Save credentials
        mPrefs.edit()
                .putString("slsk_username", mCurrentUsername)
                .putString("slsk_password", mCurrentPassword)
                .apply();

        closeServerConnection();

        CountDownLatch loginLatch = new CountDownLatch(1);
        final AtomicBoolean successResult = new AtomicBoolean(false);

        mExecutor.submit(() -> {
            try {
                Log.i(TAG, "Connecting to Soulseek server " + SLSK_SERVER_HOST + ":" + SLSK_SERVER_PORT + "...");
                Socket socket = new Socket();
                socket.connect(new InetSocketAddress(SLSK_SERVER_HOST, SLSK_SERVER_PORT), 10000);
                socket.setTcpNoDelay(true);
                socket.setKeepAlive(true);

                mServerSocket = socket;
                mServerOut = socket.getOutputStream();
                mServerIn = socket.getInputStream();

                // Send Login Message (Code 1)
                sendLoginMessage(mCurrentUsername, mCurrentPassword);

                // Run server reader loop
                runServerReaderLoop(loginLatch, successResult);
            } catch (Exception e) {
                Log.e(TAG, "Soulseek server connection failed: " + e.getMessage());
                mLastError = e.getMessage();
                mIsConnected = false;
                mIsConnecting = false;
                loginLatch.countDown();
            }
        });

        try {
            boolean done = loginLatch.await(7, TimeUnit.SECONDS);
            if (!done) {
                mLastError = "Connection timeout reaching server.slsknet.org";
                return false;
            }
            return successResult.get();
        } catch (InterruptedException e) {
            return false;
        }
    }

    public synchronized void disconnect() {
        closeServerConnection();
        mIsConnected = false;
        mIsConnecting = false;
        mLastError = null;
    }

    public synchronized void logout() {
        disconnect();
        mCurrentUsername = "";
        mCurrentPassword = "";
        mPrefs.edit().remove("slsk_username").remove("slsk_password").apply();
    }

    private void closeServerConnection() {
        try {
            if (mServerSocket != null && !mServerSocket.isClosed()) {
                mServerSocket.close();
            }
        } catch (Exception ignored) {}
        mServerSocket = null;
        mServerOut = null;
        mServerIn = null;
        mIsConnected = false;
    }

    private void sendLoginMessage(String username, String password) throws Exception {
        MessageDigest md5 = MessageDigest.getInstance("MD5");
        byte[] hash = md5.digest((username + password).getBytes(StandardCharsets.UTF_8));
        StringBuilder hexHash = new StringBuilder();
        for (byte b : hash) hexHash.append(String.format("%02x", b & 0xFF));

        byte[] uBytes = username.getBytes(StandardCharsets.UTF_8);
        byte[] pBytes = password.getBytes(StandardCharsets.UTF_8);
        byte[] hBytes = hexHash.toString().getBytes(StandardCharsets.UTF_8);

        // Code 1 (4), uLen (4), uBytes, pLen (4), pBytes, version 160 (4), hLen (4), hBytes, minor 17 (4)
        int payloadLen = 4 + 4 + uBytes.length + 4 + pBytes.length + 4 + 4 + hBytes.length + 4;
        ByteBuffer buf = ByteBuffer.allocate(4 + payloadLen).order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(payloadLen);
        buf.putInt(1); // code 1
        buf.putInt(uBytes.length);
        buf.put(uBytes);
        buf.putInt(pBytes.length);
        buf.put(pBytes);
        buf.putInt(160); // version
        buf.putInt(hBytes.length);
        buf.put(hBytes);
        buf.putInt(17); // minor

        writeServer(buf.array());
    }

    private void sendSetStatus(int status) {
        try {
            ByteBuffer buf = ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN);
            buf.putInt(8); // payload len (code 4 + status 4)
            buf.putInt(28); // code 28
            buf.putInt(status); // 2 = online
            writeServer(buf.array());
        } catch (Exception e) {
            Log.w(TAG, "sendSetStatus failed: " + e.getMessage());
            mIsConnected = false;
        }
    }

    private void sendSetWaitPort(int port) {
        try {
            ByteBuffer buf = ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN);
            buf.putInt(8); // payload len (code 4 + port 4)
            buf.putInt(2); // code 2
            buf.putInt(port);
            writeServer(buf.array());
        } catch (Exception e) {
            Log.w(TAG, "sendSetWaitPort failed: " + e.getMessage());
        }
    }

    private void sendSharedFoldersFiles(int folders, int files) {
        try {
            ByteBuffer buf = ByteBuffer.allocate(16).order(ByteOrder.LITTLE_ENDIAN);
            buf.putInt(12); // payload len (code 4 + folders 4 + files 4)
            buf.putInt(35); // code 35
            buf.putInt(folders);
            buf.putInt(files);
            writeServer(buf.array());
        } catch (Exception e) {
            Log.w(TAG, "sendSharedFoldersFiles failed: " + e.getMessage());
        }
    }

    private void sendHaveNoParents(boolean flag) {
        try {
            ByteBuffer buf = ByteBuffer.allocate(9).order(ByteOrder.LITTLE_ENDIAN);
            buf.putInt(5); // payload len (code 4 + bool 1)
            buf.putInt(71); // code 71
            buf.put((byte)(flag ? 1 : 0));
            writeServer(buf.array());
        } catch (Exception e) {
            Log.w(TAG, "sendHaveNoParents failed: " + e.getMessage());
        }
    }

    private static String unpackIp(ByteBuffer buf) {
        byte[] ipBytes = new byte[4];
        buf.get(ipBytes);
        // Soulseek protocol packs IPv4 octets in reverse byte order
        return (ipBytes[3] & 0xFF) + "." + (ipBytes[2] & 0xFF) + "." +
               (ipBytes[1] & 0xFF) + "." + (ipBytes[0] & 0xFF);
    }

    private void writeServer(byte[] data) throws IOException {
        synchronized (mServerWriteLock) {
            if (mServerOut == null) {
                throw new IOException("Server output stream is closed");
            }
            mServerOut.write(data);
            mServerOut.flush();
        }
    }

    private void runServerReaderLoop(CountDownLatch loginLatch, AtomicBoolean successResult) {
        try {
            byte[] lenBuf = new byte[4];
            while (mServerSocket != null && !mServerSocket.isClosed()) {
                if (readExact(mServerIn, lenBuf) < 4) break;
                int msgLen = ByteBuffer.wrap(lenBuf).order(ByteOrder.LITTLE_ENDIAN).getInt();
                if (msgLen < 4 || msgLen > 5242880) break; // sanity check

                byte[] payload = new byte[msgLen];
                if (readExact(mServerIn, payload) < msgLen) break;

                ByteBuffer buf = ByteBuffer.wrap(payload).order(ByteOrder.LITTLE_ENDIAN);
                int code = buf.getInt();

                switch (code) {
                    case 1: { // Login response
                        byte success = buf.get();
                        if (success == 1) {
                            String greet = readStr(buf);
                            Log.i(TAG, "Soulseek login successful! " + greet);
                            mIsConnected = true;
                            mIsConnecting = false;
                            mLastError = null;
                            successResult.set(true);

                            // Announce port and status
                            if (mLocalListenPort > 0) {
                                sendSetWaitPort(mLocalListenPort);
                            }
                            sendSharedFoldersFiles(1, 1);
                            sendSetStatus(2); // online

                            loginLatch.countDown();
                        } else {
                            String reason = readStr(buf);
                            Log.w(TAG, "Soulseek login failed: " + reason);
                            mIsConnected = false;
                            mIsConnecting = false;
                            mLastError = reason;
                            successResult.set(false);
                            loginLatch.countDown();
                        }
                        break;
                    }

                    case 3: { // GetPeerAddress response
                        String user = readStr(buf);
                        String ipStr = unpackIp(buf);
                        int port = buf.getInt();
                        Log.d(TAG, "Got peer address for " + user + ": " + ipStr + ":" + port);
                        if (port > 0 && !"0.0.0.0".equals(ipStr)) {
                            mPeerAddresses.put(user, new PeerAddr(ipStr, port));
                        }
                        synchronized (mPeerAddresses) {
                            mPeerAddresses.notifyAll();
                        }
                        break;
                    }

                    case 18: { // ConnectToPeer request relayed from server
                        String user = readStr(buf);
                        String type = readStr(buf);
                        String ipStr = unpackIp(buf);
                        int port = buf.getInt();
                        byte[] tokenBytes = new byte[4];
                        buf.get(tokenBytes);

                        if (port <= 0 || "0.0.0.0".equals(ipStr)) {
                            break;
                        }
                        mPeerAddresses.put(user, new PeerAddr(ipStr, port));

                        if ("P".equalsIgnoreCase(type)) {
                            mPeerPool.execute(() -> piercePeerConnection(user, ipStr, port, tokenBytes));
                        } else if ("F".equalsIgnoreCase(type)) {
                            mExecutor.submit(() -> pierceFileConnection(user, ipStr, port, tokenBytes));
                        }
                        break;
                    }

                    case 22: { // Private message
                        int msgId = buf.getInt();
                        // Ack message so server doesn't repeat it
                        ByteBuffer ack = ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN);
                        ack.putInt(8);
                        ack.putInt(23); // code 23
                        ack.putInt(msgId);
                        writeServer(ack.array());
                        break;
                    }

                    default:
                        // Ignore other server codes
                        break;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Server reader loop terminated: " + e.getMessage());
        } finally {
            mIsConnected = false;
            mIsConnecting = false;
            loginLatch.countDown();
        }
    }

    // =========================================================================
    // Search Implementation
    // =========================================================================

    private static String normalizeSearchQuery(String query) {
        String[] parts = query.trim().split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if ("-".equals(part) || part.isEmpty()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(part);
        }
        return sb.length() > 0 ? sb.toString() : query.trim();
    }

    public int search(String query) {
        if (query == null || query.trim().isEmpty()) {
            return 0;
        }
        final String cleanQuery = normalizeSearchQuery(query);
        int token = mTokenGenerator.incrementAndGet();
        // Prune oldest search caches if > 8 stored
        if (mSearchResults.size() > 8) {
            Integer oldestKey = mSearchResults.keys().nextElement();
            if (oldestKey != null) mSearchResults.remove(oldestKey);
        }
        mSearchResults.put(token, Collections.synchronizedList(new ArrayList<>()));
        mActiveSearchQueries.put(cleanQuery.toLowerCase(Locale.ROOT), token);

        mExecutor.submit(() -> {
            try {
                if (!mIsConnected && !mCurrentUsername.isEmpty() && !mCurrentPassword.isEmpty()) {
                    connect(mCurrentUsername, mCurrentPassword);
                }
                if (!mIsConnected) {
                    Log.w(TAG, "Cannot search: Soulseek client offline");
                    return;
                }

                // FileSearch Message (Code 26): int32(26), int32(token), str(query)
                byte[] qBytes = cleanQuery.getBytes(StandardCharsets.UTF_8);
                int payloadLen = 4 + 4 + 4 + qBytes.length;
                ByteBuffer buf = ByteBuffer.allocate(4 + payloadLen).order(ByteOrder.LITTLE_ENDIAN);
                buf.putInt(payloadLen);
                buf.putInt(26); // code 26
                buf.putInt(token); // 4-byte token
                buf.putInt(qBytes.length);
                buf.put(qBytes);

                try {
                    writeServer(buf.array());
                } catch (IOException ioEx) {
                    Log.w(TAG, "Search write failed, reconnecting once: " + ioEx.getMessage());
                    mIsConnected = false;
                    if (!mCurrentUsername.isEmpty() && !mCurrentPassword.isEmpty() &&
                            connect(mCurrentUsername, mCurrentPassword)) {
                        writeServer(buf.array());
                    } else {
                        throw ioEx;
                    }
                }
                Log.i(TAG, "Broadcasted Soulseek search token=" + token + " query='" + cleanQuery + "'");
            } catch (Exception e) {
                Log.e(TAG, "Search broadcast error: " + e.getMessage());
            }
        });

        return token;
    }

    public JSONObject getResultsJson(int token, int limit, int offset) {
        JSONObject root = new JSONObject();
        try {
            List<SlskResult> allItems = mSearchResults.get(token);
            if (allItems == null) {
                allItems = Collections.emptyList();
            }

            int total = allItems.size();
            int start = Math.max(0, Math.min(offset, total));
            int end = Math.max(start, Math.min(start + limit, total));

            JSONArray arr = new JSONArray();
            synchronized (allItems) {
                for (int i = start; i < end; i++) {
                    SlskResult r = allItems.get(i);
                    JSONObject item = new JSONObject();
                    item.put("index", i);
                    item.put("username", r.username != null ? r.username : "");
                    item.put("filePath", r.filePath != null ? r.filePath : "");
                    item.put("filename", r.filename != null ? r.filename : "");
                    item.put("extension", r.extension != null ? r.extension.toUpperCase(Locale.ROOT) : "MP3");
                    item.put("size", r.size);
                    item.put("sizeFormatted", formatSizeHuman(r.size));
                    item.put("freeSlots", r.freeSlots);
                    item.put("queuePosition", r.queuePosition);
                    item.put("speed", r.speed);
                    item.put("speedFormatted", formatSpeedHuman(r.speed));
                    item.put("bitrate", r.bitrate != null ? r.bitrate : JSONObject.NULL);
                    item.put("duration", r.duration != null ? r.duration : JSONObject.NULL);
                    item.put("sampleRate", r.sampleRate != null ? r.sampleRate : 44100);
                    item.put("bitDepth", r.bitDepth != null ? r.bitDepth : 16);
                    item.put("artistGuess", r.artistGuess != null ? r.artistGuess : "");
                    item.put("albumGuess", r.albumGuess != null ? r.albumGuess : "");
                    item.put("isLossless", r.isLossless);
                    item.put("isHighBitrate", r.isHighBitrate);
                    arr.put(item);
                }
            }

            root.put("ok", true);
            root.put("token", token);
            root.put("total", total);
            root.put("count", arr.length());
            root.put("items", arr);
        } catch (Exception e) {
            try {
                root.put("ok", false);
                root.put("error", e.getMessage());
                root.put("items", new JSONArray());
            } catch (Exception ignored) {}
        }
        return root;
    }

    // =========================================================================
    // Peer Connections & Decompression
    // =========================================================================

    /**
     * Outbound response to a server-relayed ConnectToPeer (Code 18) for a "P" stream.
     * Must send PierceFireWall: [uint32 length = 5][uint8 code = 0][uint32 pierceToken].
     */
    private void piercePeerConnection(String username, String host, int port, byte[] tokenBytes) {
        Socket socket = null;
        try {
            socket = new Socket();
            socket.connect(new InetSocketAddress(host, port), 4500);
            socket.setTcpNoDelay(true);
            socket.setSoTimeout(15000);

            ByteBuffer buf = ByteBuffer.allocate(9).order(ByteOrder.LITTLE_ENDIAN);
            buf.putInt(5); // payload length: 1 byte code + 4 byte token
            buf.put((byte) 0); // code 0 = PierceFireWall
            buf.put(tokenBytes, 0, 4);

            OutputStream out = socket.getOutputStream();
            out.write(buf.array());
            out.flush();

            PeerConnection pc = new PeerConnection(socket, username);
            mActivePeers.put(username, pc);
            flushPendingDownloadsForPeer(username, pc);
            pc.readLoopInline();
        } catch (Exception e) {
            if (socket != null) {
                try { socket.close(); } catch (Exception ignored) {}
            }
        }
    }

    /**
     * Outbound response to a server-relayed ConnectToPeer (Code 18) for an "F" file transfer stream.
     * Sends PierceFireWall (Code 0 + pierceToken), reads 4-byte FileTransferInit (transferToken),
     * sends 8-byte FileOffset, and streams raw audio bytes to disk.
     */
    private void pierceFileConnection(String username, String host, int port, byte[] pierceTokenBytes) {
        Socket socket = null;
        try {
            socket = new Socket();
            socket.connect(new InetSocketAddress(host, port), 10000);
            socket.setTcpNoDelay(true);
            socket.setSoTimeout(30000);

            ByteBuffer buf = ByteBuffer.allocate(9).order(ByteOrder.LITTLE_ENDIAN);
            buf.putInt(5);
            buf.put((byte) 0); // PierceFireWall
            buf.put(pierceTokenBytes, 0, 4);

            OutputStream out = socket.getOutputStream();
            out.write(buf.array());
            out.flush();

            InputStream in = socket.getInputStream();
            byte[] fileTokBytes = new byte[4];
            String fileTokenHex = null;
            if (readExact(in, fileTokBytes) == 4) {
                fileTokenHex = bytesToHex(fileTokBytes);
            }
            streamIncomingFile(socket, in, username, fileTokenHex);
        } catch (Exception e) {
            Log.w(TAG, "Pierce file connection to " + username + " failed: " + e.getMessage());
        } finally {
            if (socket != null) {
                try { socket.close(); } catch (Exception ignored) {}
            }
        }
    }

    /**
     * Unsolicited direct outbound PeerInit (Code 1) connection initiated by us (e.g. for downloading).
     */
    private PeerConnection dialDirectPeerConnection(String username, String host, int port) {
        try {
            Socket socket = new Socket();
            socket.connect(new InetSocketAddress(host, port), 5000);
            socket.setTcpNoDelay(true);
            socket.setSoTimeout(30000);

            // Send PeerInit (code 1, ourUsername, 'P', uint32(0))
            byte[] uBytes = mCurrentUsername.getBytes(StandardCharsets.UTF_8);
            byte[] tBytes = "P".getBytes(StandardCharsets.UTF_8);

            int pLen = 1 + 4 + uBytes.length + 4 + tBytes.length + 4;
            ByteBuffer buf = ByteBuffer.allocate(4 + pLen).order(ByteOrder.LITTLE_ENDIAN);
            buf.putInt(pLen);
            buf.put((byte) 1); // code 1 = PeerInit
            buf.putInt(uBytes.length);
            buf.put(uBytes);
            buf.putInt(tBytes.length);
            buf.put(tBytes);
            buf.putInt(0); // 0 token for direct PeerInit

            OutputStream out = socket.getOutputStream();
            out.write(buf.array());
            out.flush();

            PeerConnection pc = new PeerConnection(socket, username);
            mActivePeers.put(username, pc);
            mExecutor.submit(pc::readLoopInline);
            return pc;
        } catch (Exception e) {
            Log.d(TAG, "Direct peer connection to " + username + " failed: " + e.getMessage());
            return null;
        }
    }

    private void flushPendingDownloadsForPeer(String username, PeerConnection peerConn) {
        if (username == null || peerConn == null) return;
        for (DownloadTransfer d : mTransfers.values()) {
            if (username.equalsIgnoreCase(d.username) && !d.userCancelled && !d.userPaused &&
                    ("Connecting".equals(d.status) || "Queued".equals(d.status))) {
                sendQueueUploadMessages(peerConn, d);
            }
        }
    }

    private void sendQueueUploadMessages(PeerConnection peerConn, DownloadTransfer transfer) {
        byte[] vBytes = transfer.virtualPath.getBytes(StandardCharsets.UTF_8);
        // Send QueueUpload (Code 43)
        ByteBuffer qUp = ByteBuffer.allocate(4 + 4 + vBytes.length).order(ByteOrder.LITTLE_ENDIAN);
        qUp.putInt(43);
        qUp.putInt(vBytes.length);
        qUp.put(vBytes);
        peerConn.send(qUp.array());

        // Send PlaceInQueueRequest (Code 51)
        ByteBuffer pInQ = ByteBuffer.allocate(4 + 4 + vBytes.length).order(ByteOrder.LITTLE_ENDIAN);
        pInQ.putInt(51);
        pInQ.putInt(vBytes.length);
        pInQ.put(vBytes);
        peerConn.send(pInQ.array());
        transfer.status = "Queued";
    }

    public class PeerConnection {
        public final Socket socket;
        public final String username;
        private final OutputStream out;
        private final InputStream in;

        public PeerConnection(Socket socket, String username) throws IOException {
            this.socket = socket;
            this.username = username;
            this.out = socket.getOutputStream();
            this.in = socket.getInputStream();
        }

        public void send(byte[] payload) {
            try {
                ByteBuffer buf = ByteBuffer.allocate(4 + payload.length).order(ByteOrder.LITTLE_ENDIAN);
                buf.putInt(payload.length);
                buf.put(payload);
                synchronized (out) {
                    out.write(buf.array());
                    out.flush();
                }
            } catch (Exception ignored) {}
        }

        public void readLoopInline() {
            try {
                byte[] lenBuf = new byte[4];
                while (!socket.isClosed()) {
                    if (readExact(in, lenBuf) < 4) break;
                    int msgLen = ByteBuffer.wrap(lenBuf).order(ByteOrder.LITTLE_ENDIAN).getInt();
                    if (msgLen < 4 || msgLen > 5242880) break;

                    byte[] payload = new byte[msgLen];
                    if (readExact(in, payload) < msgLen) break;

                    ByteBuffer buf = ByteBuffer.wrap(payload).order(ByteOrder.LITTLE_ENDIAN);
                    int code = buf.getInt();

                    handlePeerMessage(this, code, buf, payload);
                }
            } catch (Exception ignored) {
            } finally {
                try { socket.close(); } catch (Exception ignored) {}
                mActivePeers.remove(username, this);
            }
        }
    }

    private void handlePeerMessage(PeerConnection peer, int code, ByteBuffer buf, byte[] rawPayload) {
        switch (code) {
            case 9: { // FileSearchResult (Zlib Compressed)
                try {
                    int compressedOffset = 4; // after code 9
                    int compressedLen = rawPayload.length - compressedOffset;
                    byte[] decompressed = inflateZlib(rawPayload, compressedOffset, compressedLen);
                    if (decompressed != null && decompressed.length > 0) {
                        parseFileSearchResult(peer.username, decompressed);
                    }
                } catch (Exception e) {
                    Log.d(TAG, "Error decompressing search result: " + e.getMessage());
                }
                break;
            }

            case 40: { // TransferRequest
                int direction = buf.getInt();
                byte[] tokBytes = new byte[4];
                buf.get(tokBytes);
                String tokenHex = bytesToHex(tokBytes);
                String file = readStr(buf);

                if (direction == 1) {
                    long reportedSize = buf.remaining() >= 8 ? buf.getLong() : 0L;
                    // Peer is ready to upload the file we queued!
                    DownloadTransfer d = mTransfers.get(peer.username + ":" + file);
                    if (d != null && !d.userCancelled && !d.userPaused) {
                        if (reportedSize > 0 && d.size <= 0) {
                            d.size = reportedSize;
                        }
                        d.transferToken = tokenHex;
                        d.status = "Connecting";
                        mTransfersByToken.put(tokenHex, d);

                        // Send Code 41 TransferResponse (allowed = 1); uploader will open "F" connection
                        ByteBuffer resp = ByteBuffer.allocate(4 + 4 + 1).order(ByteOrder.LITTLE_ENDIAN);
                        resp.putInt(41); // code 41
                        resp.put(tokBytes);
                        resp.put((byte) 1); // allowed = 1
                        peer.send(resp.array());
                    }
                }
                break;
            }

            case 41: { // TransferResponse
                byte[] tokBytes = new byte[4];
                buf.get(tokBytes);
                String tokenHex = bytesToHex(tokBytes);
                boolean allowed = buf.get() == 1;

                if (allowed) {
                    DownloadTransfer d = mTransfersByToken.get(tokenHex);
                    if (d != null) {
                        PeerAddr addr = mPeerAddresses.get(d.username);
                        if (addr != null && addr.port > 0) {
                            mExecutor.submit(() -> startFileConnection(d, addr.host, addr.port, tokenHex));
                        }
                    }
                }
                break;
            }

            case 44: { // PlaceInQueue
                String file = readStr(buf);
                int place = buf.getInt();
                DownloadTransfer d = mTransfers.get(peer.username + ":" + file);
                if (d != null) {
                    d.queuePosition = place;
                    d.status = "Queued";
                }
                break;
            }

            case 50: { // UploadDenied
                String file = readStr(buf);
                String reason = readStr(buf);
                DownloadTransfer d = mTransfers.get(peer.username + ":" + file);
                if (d != null) {
                    d.status = "Denied: " + reason;
                }
                break;
            }
        }
    }

    private void parseFileSearchResult(String senderUsername, byte[] decompressed) {
        try {
            ByteBuffer buf = ByteBuffer.wrap(decompressed).order(ByteOrder.LITTLE_ENDIAN);
            String user = readStr(buf);
            if (user == null || user.isEmpty()) user = senderUsername;

            int token = buf.getInt();
            int nbFiles = buf.getInt();
            if (nbFiles <= 0 || nbFiles > 10000) return;

            List<SlskResult> targetList = mSearchResults.get(token);
            if (targetList == null || targetList.size() >= MAX_RESULTS_PER_SEARCH) {
                return;
            }

            List<SlskResult> batch = new ArrayList<>(Math.min(nbFiles, 128));

            for (int i = 0; i < nbFiles; i++) {
                if (buf.remaining() < 17) break;
                buf.get(); // code 1
                String filePath = readStr(buf);
                if (buf.remaining() < 12) break;
                long fileSize = buf.getLong();
                if ((fileSize >>> 32) == 0xFFFFFFFFL) {
                    fileSize &= 0xFFFFFFFFL;
                }
                String ext = readStr(buf); // ext (legacy)
                if (buf.remaining() < 4) break;
                int nbAttrib = buf.getInt();
                if (nbAttrib < 0 || nbAttrib > 64 || buf.remaining() < nbAttrib * 8) break;

                Map<Integer, Integer> attribs = new HashMap<>();
                for (int a = 0; a < nbAttrib; a++) {
                    int attrId = buf.getInt();
                    int attrVal = buf.getInt();
                    attribs.put(attrId, attrVal);
                }

                String normPath = filePath.replace('\\', '/');
                String[] parts = normPath.split("/");
                String filename = parts.length > 0 ? parts[parts.length - 1] : filePath;

                int dot = filename.lastIndexOf('.');
                String resolvedExt = (dot >= 0 && dot < filename.length() - 1)
                        ? filename.substring(dot + 1).toLowerCase(Locale.ROOT)
                        : (ext != null && !ext.isEmpty() ? ext.toLowerCase(Locale.ROOT) : "");

                if (!AUDIO_EXTENSIONS.contains(resolvedExt)) {
                    continue;
                }

                boolean isLossless = Arrays.asList("flac", "wav", "alac", "aiff", "aif", "ape", "wv", "dsf", "dff").contains(resolvedExt);

                // Soulseek FileAttribute IDs: 0=bitrate, 1=duration, 2=vbr, 4=sampleRate, 5=bitDepth
                Integer bitrate = attribs.get(0);
                Integer duration = attribs.get(1);
                Integer sampleRate = attribs.containsKey(4) ? attribs.get(4) : attribs.get(3);
                Integer bitDepth = attribs.containsKey(5) ? attribs.get(5) : null;

                if ((bitrate == null || bitrate <= 0) && fileSize > 0 && duration != null && duration > 0) {
                    int calc = (int) Math.round((fileSize * 8.0) / (duration * 1000.0));
                    if (calc >= 32 && calc <= 9216) {
                        bitrate = calc;
                    }
                }
                if (isLossless && (bitrate == null || bitrate <= 0)) {
                    bitrate = 1411;
                }

                String artistGuess = parts.length >= 3 ? parts[parts.length - 3] : (parts.length >= 2 ? parts[parts.length - 2] : "");
                String albumGuess = parts.length >= 2 ? parts[parts.length - 2] : "";

                SlskResult r = new SlskResult();
                r.username = user;
                r.filePath = filePath;
                r.filename = filename;
                r.extension = resolvedExt;
                r.size = fileSize;
                r.bitrate = bitrate;
                r.duration = duration;
                r.sampleRate = sampleRate;
                r.bitDepth = bitDepth;
                r.artistGuess = artistGuess;
                r.albumGuess = albumGuess;
                r.isLossless = isLossless;
                r.isHighBitrate = isLossless || (bitrate != null && bitrate >= 320);

                batch.add(r);
            }

            // Trailing peer state: uint8 freeulslots, uint32 ulspeed, uint32 inqueue
            int slots = buf.remaining() >= 1 ? (buf.get() & 0xFF) : 0;
            int speed = buf.remaining() >= 4 ? buf.getInt() : 0;
            int queueLength = buf.remaining() >= 4 ? buf.getInt() : 0;

            for (SlskResult r : batch) {
                r.freeSlots = slots >= 1;
                r.speed = Math.max(0, speed);
                r.queuePosition = Math.max(0, queueLength);
            }

            if (!batch.isEmpty()) {
                synchronized (targetList) {
                    int room = MAX_RESULTS_PER_SEARCH - targetList.size();
                    if (room > 0) {
                        if (batch.size() <= room) {
                            targetList.addAll(batch);
                        } else {
                            targetList.addAll(batch.subList(0, room));
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.d(TAG, "Parse search result error: " + e.getMessage());
        }
    }

    private byte[] inflateZlib(byte[] data, int offset, int length) {
        try {
            Inflater inflater = new Inflater();
            inflater.setInput(data, offset, length);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            while (!inflater.finished()) {
                int count = inflater.inflate(buf);
                if (count <= 0 && inflater.needsInput()) break;
                baos.write(buf, 0, count);
            }
            inflater.end();
            return baos.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    // =========================================================================
    // File Downloading Implementation
    // =========================================================================

    public DownloadTransfer enqueueDownload(String username, String virtualPath, long size) {
        final String transferId = username + ":" + virtualPath;
        DownloadTransfer existing = mTransfers.get(transferId);
        if (existing != null && ("Transferring".equals(existing.status) || "Finished".equals(existing.status))) {
            return existing;
        }

        String normPath = virtualPath.replace('\\', '/');
        String[] parts = normPath.split("/");
        String filename = parts.length > 0 ? parts[parts.length - 1] : "track.mp3";

        String downloadsDir = getDownloadsDir();
        File localFile = new File(downloadsDir, filename);
        File partFile = new File(downloadsDir, filename + ".part");

        DownloadTransfer transfer = new DownloadTransfer();
        transfer.id = transferId;
        transfer.username = username;
        transfer.virtualPath = virtualPath;
        transfer.filename = filename;
        transfer.size = size;
        transfer.localFilePath = localFile.getAbsolutePath();
        transfer.partFilePath = partFile.getAbsolutePath();
        transfer.status = "Queued";
        transfer.startTime = System.currentTimeMillis();

        mTransfers.put(transferId, transfer);

        mExecutor.submit(() -> initiatePeerDownload(transfer));
        return transfer;
    }

    private void initiatePeerDownload(DownloadTransfer transfer) {
        try {
            transfer.status = "Connecting";
            // 1. Resolve peer address
            PeerAddr addr = mPeerAddresses.get(transfer.username);
            if (addr == null || System.currentTimeMillis() - addr.timestamp > 300000) {
                requestPeerAddress(transfer.username);
                synchronized (mPeerAddresses) {
                    mPeerAddresses.wait(3000);
                }
                addr = mPeerAddresses.get(transfer.username);
            }

            // Generate transfer token
            byte[] tokBytes = new byte[4];
            mRandom.nextBytes(tokBytes);
            String tokenHex = bytesToHex(tokBytes);
            transfer.transferToken = tokenHex;
            mTransfersByToken.put(tokenHex, transfer);

            // Connect to peer directly if possible
            PeerConnection peerConn = mActivePeers.get(transfer.username);
            if (peerConn == null && addr != null && addr.port > 0) {
                peerConn = dialDirectPeerConnection(transfer.username, addr.host, addr.port);
            }

            if (peerConn != null) {
                sendQueueUploadMessages(peerConn, transfer);
            } else {
                // Ask server to relay ConnectToPeer (Code 18)
                sendServerConnectToPeer(transfer.username, tokenHex, "P");
                transfer.status = "Queued";
            }
        } catch (Exception e) {
            Log.w(TAG, "Initiate peer download error: " + e.getMessage());
            transfer.status = "Error: " + e.getMessage();
        }
    }

    private void startFileConnection(DownloadTransfer transfer, String host, int port, String tokenHex) {
        if (transfer.userCancelled || transfer.userPaused) return;

        mExecutor.submit(() -> {
            try {
                Log.i(TAG, "Opening file connection to " + host + ":" + port + " for " + transfer.filename);
                Socket fileSocket = new Socket();
                fileSocket.connect(new InetSocketAddress(host, port), 10000);
                fileSocket.setTcpNoDelay(true);
                transfer.fileSocket = fileSocket;

                OutputStream out = fileSocket.getOutputStream();
                InputStream in = fileSocket.getInputStream();

                // Send PeerInit (code 1, username, 'F', token)
                byte[] uBytes = mCurrentUsername.getBytes(StandardCharsets.UTF_8);
                byte[] fBytes = "F".getBytes(StandardCharsets.UTF_8);
                byte[] tokBytes = hexToBytes(tokenHex);

                int pLen = 1 + 4 + uBytes.length + 4 + fBytes.length + tokBytes.length;
                ByteBuffer initBuf = ByteBuffer.allocate(4 + pLen).order(ByteOrder.LITTLE_ENDIAN);
                initBuf.putInt(pLen);
                initBuf.put((byte) 1);
                initBuf.putInt(uBytes.length);
                initBuf.put(uBytes);
                initBuf.putInt(fBytes.length);
                initBuf.put(fBytes);
                initBuf.put(tokBytes);
                out.write(initBuf.array());
                out.flush();

                // Send 8-byte LE offset (0 or existing bytes)
                File partFile = new File(transfer.partFilePath);
                long startOffset = partFile.exists() ? partFile.length() : 0;
                transfer.bytesDownloaded = startOffset;

                byte[] offBuf = new byte[8];
                ByteBuffer.wrap(offBuf).order(ByteOrder.LITTLE_ENDIAN).putLong(startOffset);
                out.write(offBuf);
                out.flush();

                transfer.status = "Transferring";

                // Receive file bytes into .part file
                try (FileOutputStream fos = new FileOutputStream(partFile, startOffset > 0)) {
                    byte[] buffer = new byte[32768];
                    long lastTime = System.currentTimeMillis();
                    long lastBytes = startOffset;

                    while (!transfer.userCancelled && !transfer.userPaused) {
                        int read = in.read(buffer);
                        if (read == -1) break; // EOF
                        if (read > 0) {
                            fos.write(buffer, 0, read);
                            transfer.bytesDownloaded += read;

                            if (transfer.size > 0) {
                                transfer.progressPct = (int) Math.min(99, (transfer.bytesDownloaded * 100) / transfer.size);
                            }

                            long now = System.currentTimeMillis();
                            if (now - lastTime >= 500) {
                                double dt = (now - lastTime) / 1000.0;
                                transfer.speed = (int) ((transfer.bytesDownloaded - lastBytes) / dt);
                                lastTime = now;
                                lastBytes = transfer.bytesDownloaded;
                            }

                            if (transfer.size > 0 && transfer.bytesDownloaded >= transfer.size) {
                                break;
                            }
                        }
                    }
                    fos.flush();
                }

                finalizeTransfer(transfer, partFile);
            } catch (Exception e) {
                Log.w(TAG, "File connection error: " + e.getMessage());
                if (!"Finished".equals(transfer.status)) {
                    transfer.status = "Error: " + e.getMessage();
                }
            } finally {
                try {
                    if (transfer.fileSocket != null) transfer.fileSocket.close();
                } catch (Exception ignored) {}
            }
        });
    }

    private void requestPeerAddress(String username) {
        try {
            byte[] uBytes = username.getBytes(StandardCharsets.UTF_8);
            ByteBuffer buf = ByteBuffer.allocate(4 + 4 + 4 + uBytes.length).order(ByteOrder.LITTLE_ENDIAN);
            buf.putInt(4 + 4 + uBytes.length);
            buf.putInt(3); // code 3: GetPeerAddress
            buf.putInt(uBytes.length);
            buf.put(uBytes);
            writeServer(buf.array());
        } catch (Exception ignored) {}
    }

    private void sendServerConnectToPeer(String username, String tokenHex, String type) {
        try {
            byte[] tokBytes = hexToBytes(tokenHex);
            byte[] uBytes = username.getBytes(StandardCharsets.UTF_8);
            byte[] tBytes = type.getBytes(StandardCharsets.UTF_8);

            int pLen = 4 + 4 + 4 + uBytes.length + 4 + tBytes.length;
            ByteBuffer buf = ByteBuffer.allocate(4 + pLen).order(ByteOrder.LITTLE_ENDIAN);
            buf.putInt(pLen);
            buf.putInt(18); // code 18
            buf.put(tokBytes);
            buf.putInt(uBytes.length);
            buf.put(uBytes);
            buf.putInt(tBytes.length);
            buf.put(tBytes);
            writeServer(buf.array());
        } catch (Exception ignored) {}
    }

    public JSONObject getTransfersJson() {
        JSONObject root = new JSONObject();
        try {
            JSONArray arr = new JSONArray();
            for (DownloadTransfer d : mTransfers.values()) {
                JSONObject item = new JSONObject();
                item.put("id", d.id);
                item.put("username", d.username);
                item.put("virtualPath", d.virtualPath);
                item.put("filename", d.filename);
                item.put("size", d.size);
                item.put("sizeFormatted", formatSizeHuman(d.size));
                item.put("speed", d.speed);
                item.put("speedFormatted", formatSpeedHuman(d.speed));
                item.put("status", d.status);
                item.put("progress", (double) d.progressPct);
                item.put("queuePosition", d.queuePosition);
                item.put("isFinished", "Finished".equals(d.status));
                item.put("localFile", d.localFilePath);
                item.put("partFile", d.partFilePath);
                item.put("bytesDownloaded", d.bytesDownloaded);
                item.put("fileExists", new File(d.localFilePath).exists());
                arr.put(item);
            }
            root.put("ok", true);
            root.put("count", arr.length());
            root.put("items", arr);
        } catch (Exception e) {
            try {
                root.put("ok", false);
                root.put("items", new JSONArray());
            } catch (Exception ignored) {}
        }
        return root;
    }

    // =========================================================================
    // REST API Dispatcher (Serving WebView fetch calls)
    // =========================================================================

    public String dispatchApi(String action, String bodyJson, String queryString) {
        if (action == null) action = "status";
        Map<String, String> queryParams = parseQueryString(queryString);

        try {
            switch (action.toLowerCase(Locale.ROOT)) {
                case "status": {
                    JSONObject obj = new JSONObject();
                    obj.put("ok", true);
                    obj.put("status", mIsConnected ? "online" : "offline");
                    obj.put("connected", mIsConnected);
                    obj.put("connecting", mIsConnecting);
                    obj.put("powered_on", mIsConnected || mIsConnecting);
                    obj.put("login_username", !mCurrentUsername.isEmpty() ? mCurrentUsername : "Not logged in");
                    obj.put("login_status", mIsConnected ? 2 : (mIsConnecting ? 1 : 0));
                    obj.put("has_credentials", !mCurrentUsername.isEmpty() && !mCurrentPassword.isEmpty());
                    obj.put("downloads_dir", getDownloadsDir());
                    obj.put("shared_dir", getSharedDir());
                    obj.put("uploads_total", 0);
                    obj.put("downloads_total", mTransfers.size());
                    obj.put("error", mLastError);
                    obj.put("daemon_running", true);
                    obj.put("daemon_type", "embedded-native");
                    return obj.toString();
                }

                case "login": {
                    String user = "";
                    String pass = "";
                    String dDir = "";
                    String sDir = "";
                    if (bodyJson != null && !bodyJson.trim().isEmpty() && bodyJson.trim().startsWith("{")) {
                        JSONObject body = new JSONObject(bodyJson);
                        user = body.optString("username", "");
                        pass = body.optString("password", "");
                        dDir = body.optString("downloads_dir", "");
                        sDir = body.optString("shared_dir", "");
                    }
                    if (user.isEmpty() && queryParams.containsKey("username")) {
                        user = queryParams.get("username");
                        pass = queryParams.getOrDefault("password", "");
                    }
                    if (user.isEmpty()) {
                        user = mCurrentUsername;
                        pass = mCurrentPassword;
                    }
                    if (!dDir.isEmpty()) setDownloadsDir(dDir);
                    if (!sDir.isEmpty()) setSharedDir(sDir);

                    if (user.isEmpty()) {
                        return "{\"ok\": false, \"error\": \"Username and password are required.\"}";
                    }

                    boolean ok = connect(user.trim(), pass != null ? pass.trim() : "");
                    JSONObject resp = new JSONObject();
                    resp.put("ok", ok);
                    resp.put("success", ok);
                    resp.put("username", user);
                    resp.put("connected", ok);
                    if (!ok) {
                        resp.put("error", mLastError != null ? mLastError : "Authentication failed");
                        resp.put("reason", "auth_failed");
                    }
                    return resp.toString();
                }

                case "account": {
                    if (bodyJson != null && !bodyJson.trim().isEmpty() && bodyJson.trim().startsWith("{")) {
                        JSONObject body = new JSONObject(bodyJson);
                        String user = body.optString("username", "");
                        String pass = body.optString("password", "");
                        String dDir = body.optString("downloads_dir", "");
                        String sDir = body.optString("shared_dir", "");

                        if (!dDir.isEmpty()) setDownloadsDir(dDir);
                        if (!sDir.isEmpty()) setSharedDir(sDir);

                        if (!user.isEmpty()) {
                            boolean ok = connect(user.trim(), pass);
                            JSONObject resp = new JSONObject();
                            resp.put("ok", ok);
                            resp.put("success", ok);
                            resp.put("username", user);
                            resp.put("connected", ok);
                            if (!ok) {
                                resp.put("error", mLastError != null ? mLastError : "Authentication failed");
                                resp.put("reason", "auth_failed");
                            }
                            return resp.toString();
                        }
                    }

                    // GET account info
                    JSONObject acc = new JSONObject();
                    acc.put("ok", true);
                    acc.put("username", mCurrentUsername);
                    acc.put("hasPassword", !mCurrentPassword.isEmpty());
                    acc.put("connected", mIsConnected);
                    acc.put("connecting", mIsConnecting);
                    acc.put("powered_on", mIsConnected || mIsConnecting);
                    acc.put("downloads_dir", getDownloadsDir());
                    acc.put("shared_dir", getSharedDir());
                    acc.put("error", mLastError);
                    return acc.toString();
                }

                case "power": {
                    JSONObject body = new JSONObject(bodyJson != null && !bodyJson.isEmpty() ? bodyJson : "{}");
                    String state = body.optString("state", "").toLowerCase(Locale.ROOT);
                    JSONObject resp = new JSONObject();
                    if ("off".equals(state)) {
                        disconnect();
                        resp.put("ok", true);
                        resp.put("powered_on", false);
                        resp.put("connected", false);
                    } else {
                        boolean ok = connect(mCurrentUsername, mCurrentPassword);
                        resp.put("ok", ok);
                        resp.put("powered_on", ok);
                        resp.put("connected", ok);
                        resp.put("username", mCurrentUsername);
                    }
                    return resp.toString();
                }

                case "logout": {
                    logout();
                    return "{\"ok\": true, \"success\": true}";
                }

                case "directory":
                case "config/directory": {
                    JSONObject body = new JSONObject(bodyJson != null && !bodyJson.isEmpty() ? bodyJson : "{}");
                    String dir = body.optString("directory", body.optString("downloads_dir", ""));
                    setDownloadsDir(dir);
                    JSONObject resp = new JSONObject();
                    resp.put("ok", true);
                    resp.put("downloads_dir", getDownloadsDir());
                    return resp.toString();
                }

                case "shared_directory":
                case "config/shared_directory": {
                    JSONObject body = new JSONObject(bodyJson != null && !bodyJson.isEmpty() ? bodyJson : "{}");
                    String dir = body.optString("directory", body.optString("shared_dir", ""));
                    setSharedDir(dir);
                    JSONObject resp = new JSONObject();
                    resp.put("ok", true);
                    resp.put("shared_dir", getSharedDir());
                    return resp.toString();
                }

                case "search": {
                    JSONObject body = new JSONObject(bodyJson != null && !bodyJson.isEmpty() && bodyJson.trim().startsWith("{") ? bodyJson : "{}");
                    String q = body.optString("query", "");
                    if (q.isEmpty()) q = body.optString("req", "");
                    if (q.isEmpty()) q = body.optString("q", "");
                    if (q.isEmpty() && queryParams.containsKey("query")) q = queryParams.get("query");
                    if (q.isEmpty() && queryParams.containsKey("req")) q = queryParams.get("req");
                    if (q.isEmpty() && queryParams.containsKey("q")) q = queryParams.get("q");

                    JSONObject resp = new JSONObject();
                    if (q == null || q.trim().isEmpty()) {
                        resp.put("ok", false);
                        resp.put("message", "Search query is required.");
                        return resp.toString();
                    }
                    int token = search(q.trim());
                    resp.put("ok", true);
                    resp.put("token", token);
                    return resp.toString();
                }

                case "results": {
                    int token = 0;
                    try { token = Integer.parseInt(queryParams.get("token")); } catch (Exception ignored) {}
                    int limit = 150;
                    try { limit = Integer.parseInt(queryParams.get("limit")); } catch (Exception ignored) {}
                    int offset = 0;
                    try { offset = Integer.parseInt(queryParams.get("offset")); } catch (Exception ignored) {}

                    return getResultsJson(token, limit, offset).toString();
                }

                case "download": {
                    JSONObject body = new JSONObject(bodyJson != null && !bodyJson.isEmpty() ? bodyJson : "{}");
                    JSONObject resp = new JSONObject();
                    if (body.has("items")) {
                        JSONArray items = body.getJSONArray("items");
                        for (int i = 0; i < items.length(); i++) {
                            JSONObject it = items.getJSONObject(i);
                            enqueueDownload(it.optString("username"), it.optString("virtual_path"), it.optLong("size", 0));
                        }
                        resp.put("ok", true);
                        resp.put("queued", true);
                        resp.put("count", items.length());
                        return resp.toString();
                    } else {
                        String user = body.optString("username");
                        String vPath = body.optString("virtual_path");
                        long size = body.optLong("size", 0);
                        if (!user.isEmpty() && !vPath.isEmpty()) {
                            DownloadTransfer t = enqueueDownload(user, vPath, size);
                            resp.put("ok", true);
                            resp.put("queued", true);
                            resp.put("id", t.id);
                            resp.put("status", t.status);
                            return resp.toString();
                        }
                    }
                    resp.put("ok", false);
                    resp.put("message", "Missing username or virtual_path");
                    return resp.toString();
                }

                case "transfers": {
                    return getTransfersJson().toString();
                }

                case "pause_download": {
                    JSONObject body = new JSONObject(bodyJson != null && !bodyJson.isEmpty() ? bodyJson : "{}");
                    String id = body.optString("id");
                    DownloadTransfer d = mTransfers.get(id);
                    if (d != null) {
                        d.userPaused = true;
                        d.status = "Paused";
                        try { if (d.fileSocket != null) d.fileSocket.close(); } catch (Exception ignored) {}
                    }
                    return "{\"ok\": true}";
                }

                case "resume_download": {
                    JSONObject body = new JSONObject(bodyJson != null && !bodyJson.isEmpty() ? bodyJson : "{}");
                    String id = body.optString("id");
                    DownloadTransfer d = mTransfers.get(id);
                    if (d != null) {
                        d.userPaused = false;
                        d.status = "Queued";
                        mExecutor.submit(() -> initiatePeerDownload(d));
                    }
                    return "{\"ok\": true}";
                }

                case "cancel_download": {
                    JSONObject body = new JSONObject(bodyJson != null && !bodyJson.isEmpty() ? bodyJson : "{}");
                    String id = body.optString("id");
                    DownloadTransfer d = mTransfers.get(id);
                    if (d != null) {
                        d.userCancelled = true;
                        d.status = "Cancelled";
                        try { if (d.fileSocket != null) d.fileSocket.close(); } catch (Exception ignored) {}
                    }
                    return "{\"ok\": true}";
                }

                case "clear_download": {
                    JSONObject body = new JSONObject(bodyJson != null && !bodyJson.isEmpty() ? bodyJson : "{}");
                    String id = body.optString("id");
                    mTransfers.remove(id);
                    return "{\"ok\": true}";
                }

                case "uploads": {
                    return "{\"ok\": true, \"count\": 0, \"uploads\": []}";
                }

                case "start_daemon": {
                    if (!mIsConnected && !mCurrentUsername.isEmpty() && !mCurrentPassword.isEmpty()) {
                        mExecutor.submit(() -> connect(mCurrentUsername, mCurrentPassword));
                    }
                    return "{\"ok\": true, \"status\": \"running\"}";
                }

                default: {
                    JSONObject resp = new JSONObject();
                    resp.put("ok", false);
                    resp.put("message", "Unsupported action: " + action);
                    return resp.toString();
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "API error on action " + action + ": " + e.getMessage());
            try {
                JSONObject err = new JSONObject();
                err.put("ok", false);
                err.put("error", e.getMessage() != null ? e.getMessage() : "Internal Soulseek error");
                return err.toString();
            } catch (Exception ignored) {
                return "{\"ok\": false, \"error\": \"Internal Soulseek error\"}";
            }
        }
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    private static int readExact(InputStream in, byte[] target) throws IOException {
        int total = 0;
        while (total < target.length) {
            int r = in.read(target, total, target.length - total);
            if (r == -1) break;
            total += r;
        }
        return total;
    }

    private static String readStr(ByteBuffer buf) {
        if (buf.remaining() < 4) return "";
        int len = buf.getInt();
        if (len <= 0 || buf.remaining() < len) return "";
        byte[] bytes = new byte[len];
        buf.get(bytes);
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private static String bytesToHex(byte[] bytes) {
        if (bytes == null) return "";
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format("%02x", b & 0xFF));
        return sb.toString();
    }

    private static byte[] hexToBytes(String hex) {
        if (hex == null || hex.isEmpty()) return new byte[4];
        int len = hex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                                 + Character.digit(hex.charAt(i+1), 16));
        }
        return data;
    }

    private static Map<String, String> parseQueryString(String query) {
        Map<String, String> map = new HashMap<>();
        if (query == null || query.isEmpty()) return map;
        if (query.startsWith("?")) query = query.substring(1);
        String[] pairs = query.split("&");
        for (String pair : pairs) {
            int idx = pair.indexOf("=");
            try {
                if (idx > 0) {
                    map.put(java.net.URLDecoder.decode(pair.substring(0, idx), "UTF-8"),
                            java.net.URLDecoder.decode(pair.substring(idx + 1), "UTF-8"));
                } else if (!pair.isEmpty()) {
                    map.put(java.net.URLDecoder.decode(pair, "UTF-8"), "");
                }
            } catch (Exception ignored) {}
        }
        return map;
    }

    private static String formatSizeHuman(long bytes) {
        if (bytes < 1024) return bytes + " B";
        int exp = (int) (Math.log(bytes) / Math.log(1024));
        char pre = "KMGTPE".charAt(exp - 1);
        return String.format(Locale.ROOT, "%.1f %cB", bytes / Math.pow(1024, exp), pre);
    }

    private static String formatSpeedHuman(int bytesPerSec) {
        if (bytesPerSec <= 0) return "0 KB/s";
        if (bytesPerSec < 1024 * 1024) {
            return String.format(Locale.ROOT, "%.1f KB/s", bytesPerSec / 1024.0);
        }
        return String.format(Locale.ROOT, "%.1f MB/s", bytesPerSec / (1024.0 * 1024.0));
    }
}
