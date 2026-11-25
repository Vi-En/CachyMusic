package org.cachymusic.app;

import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.os.Process;
import android.provider.MediaStore;
import android.util.LruCache;
import android.util.Size;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.PriorityBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * High-speed two-tier artwork engine (16 MB L1 RAM + persistent content-addressed
 * WebP L2 disk cache) with pure-Java binary cover extraction and priority prefetching.
 */
final class AndroidArtworkEngine {
    private static final int MEMORY_CACHE_BYTES = 16 * 1024 * 1024;
    private static final long DISK_CACHE_CAP_BYTES = 48L * 1024L * 1024L;
    private static final int MAX_EMBEDDED_IMAGE_BYTES = 10 * 1024 * 1024;
    private static final int MAX_TAG_READ_BYTES = 12 * 1024 * 1024;
    private static final String NO_ART_MARKER = "NONE";
    private static final String INDEX_FILE = "index.tsv";

    private static final String[] FOLDER_COVER_NAMES = {
        "cover.jpg", "cover.png", "folder.jpg", "folder.png", "front.jpg", "album.jpg"
    };

    private static final LruCache<String, String> dirCoverCache = new LruCache<>(256);

    private static final class WarmTask {
        final String uri;
        final int priority;
        final long seq;

        WarmTask(String uri, int priority, long seq) {
            this.uri = uri;
            this.priority = priority;
            this.seq = seq;
        }
    }

    private final Context appContext;
    private final File cacheDir;
    private final LruCache<String, byte[]> memCache = new LruCache<String, byte[]>(MEMORY_CACHE_BYTES) {
        @Override
        protected int sizeOf(String key, byte[] value) {
            return value != null ? value.length : 1;
        }
    };
    private final ConcurrentHashMap<String, String> uriToHash = new ConcurrentHashMap<>();
    private final Set<String> inFlightUris = ConcurrentHashMap.newKeySet();
    private final AtomicBoolean indexDirty = new AtomicBoolean(false);
    private final AtomicBoolean flushScheduled = new AtomicBoolean(false);
    private final AtomicBoolean shutdown = new AtomicBoolean(false);
    private final AtomicLong seqGen = new AtomicLong(0);
    private final ThreadPoolExecutor warmExecutor;
    private volatile byte[] cachedDefaultSvg;

    AndroidArtworkEngine(Context ctx) {
        this.appContext = ctx.getApplicationContext() != null ? ctx.getApplicationContext() : ctx;
        this.cacheDir = new File(this.appContext.getCacheDir(), "art_v2");
        if (!this.cacheDir.exists()) this.cacheDir.mkdirs();

        loadPersistedIndex();

        Comparator<Runnable> priorityOrder = (a, b) -> {
            if (a instanceof PrioritizedRunnable && b instanceof PrioritizedRunnable) {
                PrioritizedRunnable pa = (PrioritizedRunnable) a;
                PrioritizedRunnable pb = (PrioritizedRunnable) b;
                int cmp = Integer.compare(pa.task.priority, pb.task.priority);
                return cmp != 0 ? cmp : Long.compare(pa.task.seq, pb.task.seq);
            }
            return 0;
        };
        this.warmExecutor = new ThreadPoolExecutor(
            2, 2, 10L, TimeUnit.SECONDS,
            new PriorityBlockingQueue<>(64, priorityOrder),
            r -> {
                Thread t = new Thread(() -> {
                    try { Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND); } catch (Throwable ignored) {}
                    r.run();
                }, "CachyArtWarm");
                t.setDaemon(true);
                return t;
            }
        );
        this.warmExecutor.allowCoreThreadTimeOut(true);
    }

    private static final class PrioritizedRunnable implements Runnable {
        final WarmTask task;
        final Runnable body;

        PrioritizedRunnable(WarmTask task, Runnable body) {
            this.task = task;
            this.body = body;
        }

        @Override
        public void run() {
            body.run();
        }
    }

    byte[] loadDefaultSvg() {
        byte[] hit = cachedDefaultSvg;
        if (hit != null) return hit;
        try (InputStream is = appContext.getAssets().open("resources/images/default.svg");
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) > 0) out.write(buf, 0, n);
            hit = out.toByteArray();
            cachedDefaultSvg = hit;
            return hit;
        } catch (Exception ignored) {
            return null;
        }
    }

    /**
     * Loads compressed WebP artwork bytes (`96` or `768` px max edge) using RAM -> Disk -> Fast Binary Parse.
     */
    byte[] loadArtwork(String rawUri, boolean thumb) {
        if (rawUri == null || rawUri.isEmpty()) return null;
        String memKey = rawUri + (thumb ? ":96" : ":768");
        byte[] ramHit = memCache.get(memKey);
        if (ramHit != null) return ramHit.length == 0 ? null : ramHit;

        String existingHash = uriToHash.get(rawUri);
        if (NO_ART_MARKER.equals(existingHash)) {
            memCache.put(memKey, new byte[0]);
            return null;
        }
        if (existingHash != null) {
            File diskFile = diskFileFor(existingHash, thumb);
            byte[] diskHit = readFileBytes(diskFile);
            if (diskHit != null && diskHit.length > 0) {
                memCache.put(memKey, diskHit);
                return diskHit;
            }
        }

        byte[] rawBytes = resolveTrackArtworkBytes(appContext, Uri.parse(rawUri));
        if (rawBytes == null || rawBytes.length == 0 || rawBytes.length > MAX_EMBEDDED_IMAGE_BYTES) {
            recordHash(rawUri, NO_ART_MARKER);
            memCache.put(memKey, new byte[0]);
            return null;
        }

        String hash = shortSha256(rawBytes);
        byte[] encoded = transcodeWebp(rawBytes, thumb ? 96 : 768, thumb ? 80 : 85);
        if (encoded == null || encoded.length == 0) return null;

        recordHash(rawUri, hash);
        writeFileBytes(diskFileFor(hash, thumb), encoded);
        memCache.put(memKey, encoded);

        if (!thumb) {
            // Warm the sibling thumbnail alongside a full-size decode so grid rows hit immediately.
            File thumbFile = diskFileFor(hash, true);
            if (!thumbFile.exists()) {
                byte[] thumbBytes = transcodeWebp(rawBytes, 96, 80);
                if (thumbBytes != null && thumbBytes.length > 0) {
                    writeFileBytes(thumbFile, thumbBytes);
                    memCache.put(rawUri + ":96", thumbBytes);
                }
            }
        }
        scheduleFlush();
        return encoded;
    }

    void prefetchHighPriority(List<String> uris) {
        enqueueBatch(uris, 1);
    }

    void prewarmLibrary(Collection<String> uris) {
        enqueueBatch(uris, 10);
    }

    private void enqueueBatch(Collection<String> uris, int priority) {
        if (shutdown.get() || uris == null || uris.isEmpty()) return;
        for (String raw : uris) {
            if (raw == null || raw.isEmpty()) continue;
            if (memCache.get(raw + ":96") != null) continue;
            String hash = uriToHash.get(raw);
            if (NO_ART_MARKER.equals(hash)) continue;
            if (!inFlightUris.add(raw)) continue;
            WarmTask task = new WarmTask(raw, priority, seqGen.incrementAndGet());
            try {
                warmExecutor.execute(new PrioritizedRunnable(task, () -> {
                    try {
                        if (!shutdown.get()) loadArtwork(raw, true);
                    } finally {
                        inFlightUris.remove(raw);
                    }
                }));
            } catch (Exception rejected) {
                inFlightUris.remove(raw);
            }
        }
    }

    void invalidate(String rawUri) {
        if (rawUri == null || rawUri.isEmpty()) return;
        memCache.remove(rawUri + ":96");
        memCache.remove(rawUri + ":768");
        uriToHash.remove(rawUri);
        indexDirty.set(true);
        scheduleFlush();
    }

    void close() {
        shutdown.set(true);
        warmExecutor.shutdownNow();
        flushIndexSync();
    }

    private File diskFileFor(String hash, boolean thumb) {
        return new File(cacheDir, "c_" + hash + (thumb ? "_96.webp" : "_768.webp"));
    }

    private void recordHash(String rawUri, String hash) {
        String prev = uriToHash.put(rawUri, hash);
        if (!hash.equals(prev)) indexDirty.set(true);
    }

    private void scheduleFlush() {
        if (!flushScheduled.compareAndSet(false, true)) return;
        try {
            warmExecutor.execute(new PrioritizedRunnable(new WarmTask("", 50, seqGen.incrementAndGet()), () -> {
                try {
                    Thread.sleep(1500);
                } catch (InterruptedException ignored) {}
                flushScheduled.set(false);
                if (!shutdown.get()) {
                    flushIndexSync();
                    trimDiskCacheIfNeeded();
                }
            }));
        } catch (Exception ignored) {
            flushScheduled.set(false);
        }
    }

    private void loadPersistedIndex() {
        File idx = new File(cacheDir, INDEX_FILE);
        if (!idx.isFile()) return;
        try (BufferedReader br = new BufferedReader(new InputStreamReader(new FileInputStream(idx), StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                int tab = line.indexOf('\t');
                if (tab <= 0 || tab + 1 >= line.length()) continue;
                String uri = URLDecoder.decode(line.substring(0, tab), "UTF-8");
                String hash = line.substring(tab + 1).trim();
                if (!uri.isEmpty() && !hash.isEmpty()) {
                    uriToHash.put(uri, hash);
                }
            }
        } catch (Exception ignored) {}
    }

    synchronized void flushIndexSync() {
        if (!indexDirty.compareAndSet(true, false)) return;
        File tmp = new File(cacheDir, INDEX_FILE + ".tmp");
        File target = new File(cacheDir, INDEX_FILE);
        try (OutputStreamWriter writer = new OutputStreamWriter(new FileOutputStream(tmp), StandardCharsets.UTF_8)) {
            for (Map.Entry<String, String> entry : uriToHash.entrySet()) {
                writer.write(URLEncoder.encode(entry.getKey(), "UTF-8"));
                writer.write('\t');
                writer.write(entry.getValue());
                writer.write('\n');
            }
            writer.flush();
        } catch (Exception e) {
            tmp.delete();
            return;
        }
        tmp.renameTo(target);
    }

    private void trimDiskCacheIfNeeded() {
        File[] files = cacheDir.listFiles((dir, name) -> name.endsWith(".webp"));
        if (files == null || files.length == 0) return;
        long total = 0L;
        for (File f : files) total += f.length();
        if (total <= DISK_CACHE_CAP_BYTES) return;
        java.util.Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        long target = (DISK_CACHE_CAP_BYTES * 3L) / 4L;
        for (File f : files) {
            if (total <= target) break;
            long len = f.length();
            if (f.delete()) total -= len;
        }
    }

    @SuppressWarnings("deprecation")
    private static byte[] transcodeWebp(byte[] raw, int maxEdge, int quality) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(raw, 0, raw.length, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth > 8192 || bounds.outHeight > 8192
                || (long) bounds.outWidth * bounds.outHeight > 25_000_000L) {
            return null;
        }
        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / sample > maxEdge * 2) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap decoded = BitmapFactory.decodeByteArray(raw, 0, raw.length, opts);
        if (decoded == null) return null;

        Bitmap scaled = decoded;
        try {
            float ratio = Math.min(1f, (float) maxEdge / Math.max(decoded.getWidth(), decoded.getHeight()));
            if (ratio < 1f) {
                scaled = Bitmap.createScaledBitmap(
                    decoded,
                    Math.max(1, Math.round(decoded.getWidth() * ratio)),
                    Math.max(1, Math.round(decoded.getHeight() * ratio)),
                    true
                );
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream(maxEdge <= 128 ? 4096 : 32768);
            Bitmap.CompressFormat fmt = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                    ? Bitmap.CompressFormat.WEBP_LOSSY
                    : Bitmap.CompressFormat.WEBP;
            scaled.compress(fmt, quality, out);
            return out.toByteArray();
        } finally {
            if (scaled != decoded) scaled.recycle();
            decoded.recycle();
        }
    }

    /**
     * Resolves raw artwork bytes for an indexed URI using fast pure-Java container
     * parsing first, then OS thumbnail / cached folder cover / MediaMetadataRetriever.
     */
    static byte[] resolveTrackArtworkBytes(Context ctx, Uri mediaUri) {
        if (ctx == null || mediaUri == null) return null;

        byte[] fast = extractEmbeddedCoverFast(ctx, mediaUri);
        if (isValidArt(fast)) return fast;

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

        byte[] folderArt = loadFolderCoverCached(ctx, mediaUri);
        if (isValidArt(folderArt)) return folderArt;

        MediaMetadataRetriever mmr = null;
        try {
            mmr = new MediaMetadataRetriever();
            mmr.setDataSource(ctx, mediaUri);
            byte[] art = mmr.getEmbeddedPicture();
            if (isValidArt(art)) return art;
        } catch (Exception ignored) {
        } finally {
            if (mmr != null) try { mmr.release(); } catch (Exception ignored) {}
        }

        return null;
    }

    private static boolean isValidArt(byte[] art) {
        return art != null && art.length > 16 && art.length <= MAX_EMBEDDED_IMAGE_BYTES;
    }

    private static byte[] extractEmbeddedCoverFast(Context ctx, Uri uri) {
        try (ParcelFileDescriptor pfd = ctx.getContentResolver().openFileDescriptor(uri, "r")) {
            if (pfd != null) {
                try (FileInputStream fis = new FileInputStream(pfd.getFileDescriptor())) {
                    FileChannel ch = fis.getChannel();
                    return extractFromSeekable(ch);
                }
            }
        } catch (Exception ignored) {}

        try (InputStream is = ctx.getContentResolver().openInputStream(uri)) {
            if (is != null) return extractFromStream(is);
        } catch (Exception ignored) {}
        return null;
    }

    static byte[] extractFromSeekable(SeekableByteChannel ch) throws IOException {
        ch.position(0);
        ByteBuffer head = ByteBuffer.allocate(12);
        if (readFully(ch, head) < 12) return null;
        byte[] h = head.array();
        if (h[0] == 'f' && h[1] == 'L' && h[2] == 'a' && h[3] == 'C') {
            ch.position(4);
            return parseFlacPictureFromChannel(ch);
        }
        if (h[0] == 'I' && h[1] == 'D' && h[2] == '3') {
            ch.position(0);
            return parseId3Picture(new BufferedInputStream(new ChannelInputStream(ch), 32768));
        }
        if (h[4] == 'f' && h[5] == 't' && h[6] == 'y' && h[7] == 'p') {
            return parseMp4Cover(ch);
        }
        return null;
    }

    static byte[] extractFromStream(InputStream raw) throws IOException {
        BufferedInputStream in = new BufferedInputStream(raw, 65536);
        in.mark(16);
        byte[] h = new byte[12];
        int n = in.read(h);
        if (n < 12) return null;
        in.reset();
        if (h[0] == 'f' && h[1] == 'L' && h[2] == 'a' && h[3] == 'C') {
            skipFully(in, 4);
            return parseFlacPicture(in);
        }
        if (h[0] == 'I' && h[1] == 'D' && h[2] == '3') {
            return parseId3Picture(in);
        }
        return null;
    }

    private static byte[] parseFlacPictureFromChannel(SeekableByteChannel ch) throws IOException {
        ByteBuffer hdr = ByteBuffer.allocate(4);
        long pos = 4;
        for (int i = 0; i < 256 && pos < MAX_TAG_READ_BYTES; i++) {
            hdr.clear();
            if (readFully(ch, hdr) < 4) break;
            byte[] b = hdr.array();
            boolean last = (b[0] & 0x80) != 0;
            int type = b[0] & 0x7F;
            int len = ((b[1] & 0xFF) << 16) | ((b[2] & 0xFF) << 8) | (b[3] & 0xFF);
            pos += 4;
            if (type == 6 && len > 32 && len <= MAX_EMBEDDED_IMAGE_BYTES) {
                byte[] block = new byte[len];
                if (readFully(ch, ByteBuffer.wrap(block)) == len) {
                    byte[] pic = extractFlacPicturePayload(block);
                    if (pic != null) return pic;
                }
                pos += len;
            } else {
                pos += len;
                ch.position(pos);
            }
            if (last) break;
        }
        return null;
    }

    static byte[] parseFlacPicture(InputStream in) throws IOException {
        byte[] hdr = new byte[4];
        long pos = 4;
        for (int i = 0; i < 256 && pos < MAX_TAG_READ_BYTES; i++) {
            if (!readExact(in, hdr, 0, 4)) break;
            boolean last = (hdr[0] & 0x80) != 0;
            int type = hdr[0] & 0x7F;
            int len = ((hdr[1] & 0xFF) << 16) | ((hdr[2] & 0xFF) << 8) | (hdr[3] & 0xFF);
            pos += 4;
            if (type == 6 && len > 32 && len <= MAX_EMBEDDED_IMAGE_BYTES) {
                byte[] block = new byte[len];
                if (!readExact(in, block, 0, len)) break;
                byte[] pic = extractFlacPicturePayload(block);
                if (pic != null) return pic;
            } else {
                skipFully(in, len);
                pos += len;
            }
            if (last) break;
        }
        return null;
    }

    private static byte[] extractFlacPicturePayload(byte[] block) {
        if (block.length < 32) return null;
        int mimeLen = readIntBE(block, 4);
        int p = 8 + mimeLen;
        if (mimeLen < 0 || p + 4 > block.length) return null;
        int descLen = readIntBE(block, p);
        p += 4 + descLen + 16;
        if (descLen < 0 || p + 4 > block.length) return null;
        int picLen = readIntBE(block, p);
        p += 4;
        if (picLen <= 16 || p + picLen > block.length) return null;
        byte[] out = new byte[picLen];
        System.arraycopy(block, p, out, 0, picLen);
        return out;
    }

    static byte[] parseId3Picture(InputStream in) throws IOException {
        byte[] hdr = new byte[10];
        if (!readExact(in, hdr, 0, 10)) return null;
        if (hdr[0] != 'I' || hdr[1] != 'D' || hdr[2] != '3') return null;
        int version = hdr[3] & 0xFF;
        int tagSize = ((hdr[6] & 0x7F) << 21) | ((hdr[7] & 0x7F) << 14) | ((hdr[8] & 0x7F) << 7) | (hdr[9] & 0x7F);
        int readCap = Math.min(tagSize, MAX_TAG_READ_BYTES);
        if (readCap <= 10) return null;

        boolean isV2 = version == 2;
        int frameHdr = isV2 ? 6 : 10;
        byte[] fHdr = new byte[frameHdr];
        int pos = 0;

        if ((hdr[5] & 0x40) != 0 && (version == 3 || version == 4) && readCap >= 4) {
            byte[] ext = new byte[4];
            if (!readExact(in, ext, 0, 4)) return null;
            int extSize = version >= 4
                    ? (((ext[0] & 0x7F) << 21) | ((ext[1] & 0x7F) << 14) | ((ext[2] & 0x7F) << 7) | (ext[3] & 0x7F))
                    : readIntBE(ext, 0);
            if (extSize < 0 || extSize > readCap) return null;
            int skipBytes = version >= 4 ? Math.max(0, extSize - 4) : extSize;
            skipFully(in, skipBytes);
            pos += 4 + skipBytes;
        }

        while (pos + frameHdr <= readCap) {
            if (!readExact(in, fHdr, 0, frameHdr)) break;
            pos += frameHdr;
            if (fHdr[0] == 0) break;

            int frameSize;
            boolean isApic;
            if (isV2) {
                isApic = fHdr[0] == 'P' && fHdr[1] == 'I' && fHdr[2] == 'C';
                frameSize = ((fHdr[3] & 0xFF) << 16) | ((fHdr[4] & 0xFF) << 8) | (fHdr[5] & 0xFF);
            } else {
                isApic = fHdr[0] == 'A' && fHdr[1] == 'P' && fHdr[2] == 'I' && fHdr[3] == 'C';
                boolean syncSafe = version >= 4 && ((fHdr[4] & 0x80) | (fHdr[5] & 0x80) | (fHdr[6] & 0x80) | (fHdr[7] & 0x80)) == 0;
                frameSize = syncSafe
                        ? (((fHdr[4] & 0x7F) << 21) | ((fHdr[5] & 0x7F) << 14) | ((fHdr[6] & 0x7F) << 7) | (fHdr[7] & 0x7F))
                        : readIntBE(fHdr, 4);
            }
            if (frameSize <= 0 || pos + frameSize > readCap || frameSize > MAX_EMBEDDED_IMAGE_BYTES) break;

            if (isApic && frameSize > 16) {
                byte[] frame = new byte[frameSize];
                if (!readExact(in, frame, 0, frameSize)) break;
                byte[] pic = extractApicPayload(frame, isV2);
                if (pic != null) return pic;
            } else {
                skipFully(in, frameSize);
            }
            pos += frameSize;
        }
        return null;
    }

    private static byte[] extractApicPayload(byte[] data, boolean isV2) {
        int enc = data[0] & 0xFF;
        int dStart = 1;
        if (isV2) {
            dStart = 5;
        } else {
            while (dStart < data.length && data[dStart] != 0) dStart++;
            dStart += 2; // null + pictureType
        }
        if (dStart >= data.length) return null;
        if (enc == 1 || enc == 2) {
            while (dStart + 1 < data.length && !(data[dStart] == 0 && data[dStart + 1] == 0)) dStart += 2;
            dStart += 2;
        } else {
            while (dStart < data.length && data[dStart] != 0) dStart++;
            dStart += 1;
        }
        int picLen = data.length - dStart;
        if (picLen <= 16) return null;
        byte[] out = new byte[picLen];
        System.arraycopy(data, dStart, out, 0, picLen);
        return out;
    }

    static byte[] parseMp4Cover(SeekableByteChannel ch) throws IOException {
        long size = ch.size();
        long[] moov = findMp4Box(ch, 0L, size, "moov");
        if (moov == null) return null;
        long[] udta = findMp4Box(ch, moov[0], moov[1], "udta");
        if (udta == null) return null;
        long[] meta = findMp4Box(ch, udta[0], udta[1], "meta");
        if (meta == null || meta[0] + 4 > meta[1]) return null;
        long[] ilst = findMp4Box(ch, meta[0] + 4, meta[1], "ilst");
        if (ilst == null) return null;
        long[] covr = findMp4Box(ch, ilst[0], ilst[1], "covr");
        if (covr == null) return null;
        long[] data = findMp4Box(ch, covr[0], covr[1], "data");
        if (data == null || data[0] + 8 >= data[1]) return null;
        long picLen = data[1] - (data[0] + 8);
        if (picLen <= 16 || picLen > MAX_EMBEDDED_IMAGE_BYTES) return null;
        ch.position(data[0] + 8);
        byte[] out = new byte[(int) picLen];
        return readFully(ch, ByteBuffer.wrap(out)) == out.length ? out : null;
    }

    private static long[] findMp4Box(SeekableByteChannel ch, long start, long limit, String target) throws IOException {
        long pos = start;
        ByteBuffer hdr = ByteBuffer.allocate(8);
        ByteBuffer ext = ByteBuffer.allocate(8);
        for (int i = 0; i < 256 && pos + 8 <= limit; i++) {
            ch.position(pos);
            hdr.clear();
            if (readFully(ch, hdr) < 8) break;
            byte[] h = hdr.array();
            long boxSize = ((h[0] & 0xFFL) << 24) | ((h[1] & 0xFFL) << 16) | ((h[2] & 0xFFL) << 8) | (h[3] & 0xFFL);
            int headerLen = 8;
            if (boxSize == 1L && pos + 16 <= limit) {
                ext.clear();
                if (readFully(ch, ext) < 8) break;
                boxSize = ByteBuffer.wrap(ext.array()).getLong();
                headerLen = 16;
            } else if (boxSize == 0L) {
                boxSize = limit - pos;
            }
            if (boxSize < headerLen || pos + boxSize > limit) break;
            String type = new String(h, 4, 4, StandardCharsets.US_ASCII);
            if (target.equals(type)) {
                return new long[]{pos + headerLen, pos + boxSize};
            }
            pos += boxSize;
        }
        return null;
    }

    private static byte[] loadFolderCoverCached(Context ctx, Uri mediaUri) {
        try (Cursor cursor = ctx.getContentResolver().query(mediaUri, new String[]{MediaStore.MediaColumns.DATA}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(MediaStore.MediaColumns.DATA);
                if (idx == -1) return null;
                String filePath = cursor.getString(idx);
                if (filePath == null || filePath.isEmpty()) return null;
                File parent = new File(filePath).getParentFile();
                if (parent == null || !parent.isDirectory()) return null;
                String parentKey = parent.getAbsolutePath();
                String cachedPath = dirCoverCache.get(parentKey);
                if (cachedPath != null) {
                    return cachedPath.isEmpty() ? null : readFileBytes(new File(cachedPath));
                }
                for (String name : FOLDER_COVER_NAMES) {
                    File cover = new File(parent, name);
                    if (cover.isFile() && cover.canRead() && cover.length() > 16 && cover.length() < 8L * 1024L * 1024L) {
                        dirCoverCache.put(parentKey, cover.getAbsolutePath());
                        return readFileBytes(cover);
                    }
                }
                dirCoverCache.put(parentKey, "");
            }
        } catch (Exception ignored) {}
        return null;
    }

    private static int readIntBE(byte[] b, int o) {
        return ((b[o] & 0xFF) << 24) | ((b[o + 1] & 0xFF) << 16) | ((b[o + 2] & 0xFF) << 8) | (b[o + 3] & 0xFF);
    }

    private static boolean readExact(InputStream in, byte[] dst, int off, int len) throws IOException {
        int total = 0;
        while (total < len) {
            int n = in.read(dst, off + total, len - total);
            if (n <= 0) return false;
            total += n;
        }
        return true;
    }

    private static int readFully(SeekableByteChannel ch, ByteBuffer dst) throws IOException {
        int total = 0;
        while (dst.hasRemaining()) {
            int n = ch.read(dst);
            if (n < 0) break;
            total += n;
        }
        return total;
    }

    private static void skipFully(InputStream in, long n) throws IOException {
        long rem = n;
        byte[] scratch = new byte[4096];
        while (rem > 0) {
            long s = in.skip(rem);
            if (s <= 0) {
                int r = in.read(scratch, 0, (int) Math.min(scratch.length, rem));
                if (r < 0) throw new EOFException();
                s = r;
            }
            rem -= s;
        }
    }

    private static final class ChannelInputStream extends InputStream {
        private final SeekableByteChannel ch;
        ChannelInputStream(SeekableByteChannel ch) { this.ch = ch; }
        @Override public int read() throws IOException {
            ByteBuffer b = ByteBuffer.allocate(1);
            return ch.read(b) <= 0 ? -1 : (b.get(0) & 0xFF);
        }
        @Override public int read(byte[] b, int off, int len) throws IOException {
            return ch.read(ByteBuffer.wrap(b, off, len));
        }
    }

    private static byte[] readFileBytes(File f) {
        if (f == null || !f.isFile() || f.length() <= 0 || f.length() > MAX_EMBEDDED_IMAGE_BYTES) return null;
        byte[] data = new byte[(int) f.length()];
        try (FileInputStream fis = new FileInputStream(f)) {
            int pos = 0;
            while (pos < data.length) {
                int r = fis.read(data, pos, data.length - pos);
                if (r < 0) break;
                pos += r;
            }
            return pos == data.length ? data : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static void writeFileBytes(File f, byte[] data) {
        if (f == null || data == null || data.length == 0) return;
        File tmp = new File(f.getParentFile(), f.getName() + ".tmp");
        try (FileOutputStream fos = new FileOutputStream(tmp)) {
            fos.write(data);
        } catch (Exception ignored) {
            tmp.delete();
            return;
        }
        if (!tmp.renameTo(f)) tmp.delete();
    }

    private static String shortSha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder sb = new StringBuilder(16);
            for (int i = 0; i < 8; i++) {
                int v = digest[i] & 0xFF;
                if (v < 16) sb.append('0');
                sb.append(Integer.toHexString(v));
            }
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(java.util.Arrays.hashCode(bytes));
        }
    }
}
