#!/usr/bin/env python3
"""Host JVM + PHP regression tests for AndroidArtworkEngine and shared PHP cover extraction."""
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent


def make_minimal_png() -> bytes:
    # Valid 1x1 RGB PNG (exact fixed payload)
    import zlib
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
    idat = zlib.compress(b'\x00\xab\xcd\xef')
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')


def synchsafe(n: int) -> bytes:
    return bytes([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f])


def build_id3v2_mp3(png: bytes, version: int, with_ext_header: bool = False) -> bytes:
    apic_payload = b'\x00image/png\x00\x03\x00' + png
    if version == 4:
        frame = b'APIC' + synchsafe(len(apic_payload)) + b'\x00\x00' + apic_payload
    else:
        frame = b'APIC' + struct.pack('>I', len(apic_payload)) + b'\x00\x00' + apic_payload
    ext = b''
    flags = 0x40 if with_ext_header else 0x00
    if with_ext_header:
        if version == 4:
            # v2.4 synchsafe ext header length includes the 4 size bytes (>= 6)
            ext = synchsafe(6) + b'\x01\x00'
        else:
            # v2.3 ext header size excludes the 4 size bytes
            ext = struct.pack('>I', 6) + b'\x00\x00\x00\x00\x00\x00'
    body = ext + frame
    return b'ID3' + bytes([version, 0, flags]) + synchsafe(len(body)) + body + b'\xff\xfb\x90\x00' + (b'\x00' * 128)


def mp4_box(tag: bytes, payload: bytes) -> bytes:
    return struct.pack('>I', 8 + len(payload)) + tag + payload


def build_mp4_with_cover(png: bytes, moov_at_end: bool) -> bytes:
    ftyp = mp4_box(b'ftyp', b'M4A \x00\x00\x00\x00M4A mp42')
    data_box = mp4_box(b'data', struct.pack('>II', 14, 0) + png)
    covr_box = mp4_box(b'covr', data_box)
    ilst_box = mp4_box(b'ilst', covr_box)
    meta_box = mp4_box(b'meta', b'\x00\x00\x00\x00' + ilst_box)
    udta_box = mp4_box(b'udta', meta_box)
    moov_box = mp4_box(b'moov', udta_box)
    mdat_box = mp4_box(b'mdat', b'\x11\x22\x33\x44' * 64)
    return (ftyp + mdat_box + moov_box) if moov_at_end else (ftyp + moov_box + mdat_box)


def build_flac_with_cover(png: bytes, include_vorbis_first: bool = True) -> bytes:
    blocks = []
    if include_vorbis_first:
        streaminfo = b'\x00' * 34
        blocks.append((0, streaminfo))
    mime = b'image/png'
    desc = b'front'
    pic = (
        struct.pack('>II', 3, len(mime)) + mime +
        struct.pack('>I', len(desc)) + desc +
        struct.pack('>IIIII', 1, 1, 24, 0, len(png)) + png
    )
    blocks.append((6, pic))
    out = bytearray(b'fLaC')
    for idx, (btype, payload) in enumerate(blocks):
        last_bit = 0x80 if idx == len(blocks) - 1 else 0
        out.append(last_bit | btype)
        out.extend(len(payload).to_bytes(3, 'big'))
        out.extend(payload)
    out.extend(b'\xff\xf8\x00\x00' * 16)
    return bytes(out)


def write_android_stubs(src_root: Path):
    stubs = {
        'android/content/Context.java': 'package android.content; import android.content.res.AssetManager; import java.io.File; public class Context { public Context getApplicationContext(){return this;} public ContentResolver getContentResolver(){return new ContentResolver();} public File getCacheDir(){return new File(System.getProperty("java.io.tmpdir"));} public AssetManager getAssets(){return new AssetManager();} }',
        'android/content/ContentResolver.java': 'package android.content; import android.database.Cursor; import android.graphics.Bitmap; import android.net.Uri; import android.os.ParcelFileDescriptor; import android.util.Size; import java.io.InputStream; public class ContentResolver { public ParcelFileDescriptor openFileDescriptor(Uri u, String m){return null;} public InputStream openInputStream(Uri u){return null;} public Bitmap loadThumbnail(Uri u, Size s, Object c){return null;} public Cursor query(Uri u, String[] p, String s, String[] a, String o){return null;} }',
        'android/content/res/AssetManager.java': 'package android.content.res; import java.io.*; public class AssetManager { public InputStream open(String p) throws IOException { throw new IOException("stub"); } }',
        'android/database/Cursor.java': 'package android.database; import java.io.Closeable; public interface Cursor extends Closeable { boolean moveToFirst(); int getColumnIndex(String c); String getString(int i); void close(); }',
        'android/graphics/Bitmap.java': 'package android.graphics; import java.io.OutputStream; public class Bitmap { public enum CompressFormat { JPEG, WEBP, WEBP_LOSSY } public int getWidth(){return 1;} public int getHeight(){return 1;} public static Bitmap createScaledBitmap(Bitmap b,int w,int h,boolean f){return b;} public boolean compress(CompressFormat f,int q,OutputStream o){return true;} public void recycle(){} }',
        'android/graphics/BitmapFactory.java': 'package android.graphics; public class BitmapFactory { public static class Options { public boolean inJustDecodeBounds; public int outWidth, outHeight, inSampleSize; } public static Bitmap decodeByteArray(byte[] b,int o,int l,Options opt){return null;} }',
        'android/media/MediaMetadataRetriever.java': 'package android.media; import android.content.Context; import android.net.Uri; public class MediaMetadataRetriever { public void setDataSource(Context c, Uri u){} public byte[] getEmbeddedPicture(){return null;} public void release(){} }',
        'android/net/Uri.java': 'package android.net; public class Uri { public static Uri parse(String s){return new Uri();} }',
        'android/os/Build.java': 'package android.os; public class Build { public static class VERSION { public static final int SDK_INT = 34; } public static class VERSION_CODES { public static final int Q = 29; public static final int R = 30; } }',
        'android/os/ParcelFileDescriptor.java': 'package android.os; import java.io.*; public class ParcelFileDescriptor implements Closeable { public FileDescriptor getFileDescriptor(){return null;} public void close(){} }',
        'android/os/Process.java': 'package android.os; public class Process { public static final int THREAD_PRIORITY_BACKGROUND = 10; public static void setThreadPriority(int p){} }',
        'android/provider/MediaStore.java': 'package android.provider; public class MediaStore { public static class MediaColumns { public static final String DATA = "_data"; } }',
        'android/util/LruCache.java': 'package android.util; import java.util.*; public class LruCache<K,V> { private final Map<K,V> m = new LinkedHashMap<>(); public LruCache(int s){} protected int sizeOf(K k, V v){return 1;} public synchronized V get(K k){return m.get(k);} public synchronized V put(K k,V v){return m.put(k,v);} public synchronized V remove(K k){return m.remove(k);} }',
        'android/util/Size.java': 'package android.util; public class Size { public Size(int w, int h){} }',
    }
    for rel, code in stubs.items():
        p = src_root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(code, encoding='utf-8')


def main():
    main_act = (ROOT / 'tools/packager/android/app/src/main/java/org/cachymusic/app/MainActivity.java').read_text(encoding='utf-8')
    art_eng = (ROOT / 'tools/packager/android/app/src/main/java/org/cachymusic/app/AndroidArtworkEngine.java').read_text(encoding='utf-8')

    # Verify wiring & non-blocking batch enqueue contract
    assert '"/android-media-art"' in main_act
    assert 'artworkEngine.loadArtwork(uriParam, isThumb)' in main_act
    assert 'public void prefetchArtwork(String urisJson)' in main_act
    assert 'public void invalidateArtwork(String uri)' in main_act
    assert 'public static byte[] resolveTrackArtworkBytes(Context ctx, Uri mediaUri)' in main_act
    enqueue_slice = art_eng.split('private void enqueueBatch(')[1].split('void invalidate(')[0]
    assert 'readFileBytes(' not in enqueue_slice and 'isFile()' not in enqueue_slice, 'enqueueBatch must not do synchronous disk I/O'

    png = make_minimal_png()
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        fixtures = {
            'flac': tmp / 'sample.flac',
            'mp3_v23': tmp / 'v23.mp3',
            'mp3_v24': tmp / 'v24.mp3',
            'mp3_ext': tmp / 'ext.mp3',
            'm4a_fast': tmp / 'fast.m4a',
            'm4a_end': tmp / 'end.m4a',
            'empty': tmp / 'empty.mp3',
        }
        fixtures['flac'].write_bytes(build_flac_with_cover(png, True))
        fixtures['mp3_v23'].write_bytes(build_id3v2_mp3(png, 3, False))
        fixtures['mp3_v24'].write_bytes(build_id3v2_mp3(png, 4, False))
        fixtures['mp3_ext'].write_bytes(build_id3v2_mp3(png, 4, True))
        fixtures['m4a_fast'].write_bytes(build_mp4_with_cover(png, False))
        fixtures['m4a_end'].write_bytes(build_mp4_with_cover(png, True))
        fixtures['empty'].write_bytes(b'\xff\xfb\x90\x00' * 32)

        # 1. Host JVM compile & execute REAL AndroidArtworkEngine binary extractors
        java_dir = tmp / 'j'
        write_android_stubs(java_dir)
        pkg_dir = java_dir / 'org/cachymusic/app'
        pkg_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / 'tools/packager/android/app/src/main/java/org/cachymusic/app/AndroidArtworkEngine.java', pkg_dir / 'AndroidArtworkEngine.java')
        driver = '''package org.cachymusic.app;
import java.io.*;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.util.Arrays;
public class ArtDriver {
    public static void main(String[] args) throws Exception {
        byte[] expected = Files.readAllBytes(Path.of(args[0]));
        for (int i = 1; i < args.length - 1; i++) {
            Path p = Path.of(args[i]);
            try (FileChannel ch = FileChannel.open(p, StandardOpenOption.READ)) {
                byte[] got = AndroidArtworkEngine.extractFromSeekable(ch);
                if (!Arrays.equals(got, expected)) {
                    throw new AssertionError("Java seekable mismatch on " + p.getFileName() + ": got=" + (got == null ? -1 : got.length));
                }
            }
        }
        try (FileChannel emptyCh = FileChannel.open(Path.of(args[args.length - 1]), StandardOpenOption.READ)) {
            if (AndroidArtworkEngine.extractFromSeekable(emptyCh) != null) {
                throw new AssertionError("Expected null on coverless audio");
            }
        }
        System.out.println("PASS Java AndroidArtworkEngine exact extraction (FLAC, ID3v2.3, ID3v2.4, ID3v2.4+ext, M4A faststart & moov-end)");
    }
}
'''
        (pkg_dir / 'ArtDriver.java').write_text(driver, encoding='utf-8')
        classes = tmp / 'classes'
        classes.mkdir()
        java_files = [str(p) for p in java_dir.rglob('*.java')]
        subprocess.check_call(['javac', '-d', str(classes)] + java_files)
        expected_png = tmp / 'expected.png'
        expected_png.write_bytes(png)
        out = subprocess.check_output([
            'java', '-cp', str(classes), 'org.cachymusic.app.ArtDriver',
            str(expected_png),
            str(fixtures['flac']), str(fixtures['mp3_v23']), str(fixtures['mp3_v24']),
            str(fixtures['mp3_ext']), str(fixtures['m4a_fast']), str(fixtures['m4a_end']),
            str(fixtures['empty'])
        ], text=True)
        print(out.strip())

        # 2. PHP exact extraction verification against the actual shared module.
        php_test = tmp / 'test_cover.php'
        php_test.write_text(
            '<?php\nrequire_once $argv[1];\n'
            '$exp = file_get_contents($argv[2]);\n'
            'for ($i = 3; $i < count($argv) - 1; $i++) {\n'
            '  $got = extract_php_embedded_cover($argv[$i]);\n'
            '  if ($got !== $exp) { fwrite(STDERR, "PHP mismatch on {$argv[$i]} len=" . strlen((string)$got) . " exp=" . strlen($exp) . "\\n"); exit(1); }\n'
            '}\n'
            'if (extract_php_embedded_cover($argv[count($argv) - 1]) !== null) { fwrite(STDERR, "Expected null on coverless\\n"); exit(1); }\n'
            'echo "PASS PHP shared cover module exact container extraction & zero trailing garbage\\n";\n',
            encoding='utf-8'
        )
        php_out = subprocess.check_output([
            'php', '-n', str(php_test), str(ROOT / 'php/cover_extract.php'), str(expected_png),
            str(fixtures['flac']), str(fixtures['mp3_v23']), str(fixtures['mp3_v24']),
            str(fixtures['mp3_ext']), str(fixtures['m4a_fast']), str(fixtures['m4a_end']),
            str(fixtures['empty'])
        ], text=True)
        print(php_out.strip())


if __name__ == '__main__':
    main()
