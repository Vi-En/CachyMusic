#!/usr/bin/env python3
"""Tests AndroidDirectDecoder native contract & Node worker CPCM packet/reader behavior."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent


def main():
    dec = (ROOT / 'tools/packager/android/app/src/main/java/org/cachymusic/app/AndroidDirectDecoder.java').read_text(encoding='utf-8')
    main_act = (ROOT / 'tools/packager/android/app/src/main/java/org/cachymusic/app/MainActivity.java').read_text(encoding='utf-8')
    core = (ROOT / 'scripts/modules/player-core.js').read_text(encoding='utf-8')

    # 1. Native Android decoder & bridge boundary checks
    assert 'Encoding' in dec or 'ENCODING_PCM_FLOAT' in dec
    assert 'configureAudioCodec(MediaExtractor extractor, int trackIndex, String mime)' in dec
    assert 'extractor.getTrackFormat(trackIndex)' in dec
    assert 'removePcmEncoding' not in dec, 'Fresh track formats avoid lossy key copying'
    assert "packet.put((byte) 'C').put((byte) 'P').put((byte) 'C').put((byte) 'M')" in dec

    for ep in ('"/android-pcm-open"', '"/android-pcm-read"', '"/android-pcm-close"'):
        assert ep in main_act, f'Missing endpoint {ep} in MainActivity.java'
    assert 'public boolean supportsDirectPcm()' in main_act
    assert 'sessionId.matches("[A-Za-z0-9-]{1,64}")' in main_act
    assert 'format?.codec !== \'android-direct\'' in core
    assert 'openAndroidDirectPcm(format.trackSrc, format.duration)' in core

    # 2. Worker client + CPCM parser + AndroidDirectPcmReader runtime checks in Node
    with tempfile.TemporaryDirectory() as td:
        mjs = Path(td) / 'direct_decoder_runtime.mjs'
        mod_url = (ROOT / 'scripts/modules/android-pcm-reader.js').as_uri()
        mjs.write_text(f'''import assert from 'node:assert/strict';
import {{ openAndroidDirectPcm, parseCpcmPacket, AndroidDirectPcmReader }} from '{mod_url}';

function makeCpcmPacket({{ sampleRate = 48000, channels = 2, isFloat = false, eof = false, frameCount = 512, phaseStart = 0 }}) {{
    const bps = isFloat ? 4 : 2;
    const ab = new ArrayBuffer(16 + frameCount * channels * bps);
    const v = new DataView(ab);
    v.setUint8(0, 0x43); v.setUint8(1, 0x50); v.setUint8(2, 0x43); v.setUint8(3, 0x4d);
    v.setUint32(4, sampleRate, true);
    v.setUint16(8, channels, true);
    v.setUint16(10, (isFloat ? 1 : 0) | (eof ? 2 : 0), true);
    v.setUint32(12, frameCount, true);
    for (let i = 0; i < frameCount; i++) {{
        const val = 0.5;
        for (let c = 0; c < channels; c++) {{
            const off = 16 + (i * channels + c) * bps;
            if (isFloat) v.setFloat32(off, val, true);
            else v.setInt16(off, 16384, true);
        }}
    }}
    return ab;
}}

// Packet parsing (16-bit & 32-bit float, invalid header rejection)
const pkt16 = parseCpcmPacket(makeCpcmPacket({{ sampleRate: 44100, channels: 2, isFloat: false, frameCount: 256 }}));
assert.equal(pkt16.sampleRate, 44100);
assert.equal(pkt16.channels, 2);
assert.equal(pkt16.frameCount, 256);
assert(Math.abs(pkt16.channelsData[0][10] - 0.5) < 1e-4);

const pktF = parseCpcmPacket(makeCpcmPacket({{ sampleRate: 96000, channels: 1, isFloat: true, eof: true, frameCount: 128 }}));
assert.equal(pktF.eof, true);
assert.equal(pktF.channels, 1);
assert(Math.abs(pktF.channelsData[0][10] - 0.5) < 1e-6);
assert.throws(() => parseCpcmPacket(new ArrayBuffer(8)), /Truncated/);

// openAndroidDirectPcm URL & descriptor validation
globalThis.location = {{ href: 'https://appassets.androidplatform.net/index.html' }};
const openCalls = [];
globalThis.fetch = async (url) => {{
    openCalls.push(url);
    return new Response(JSON.stringify({{ ok: true, sessionId: 'sess-1234', sampleRate: 48000, channels: 2, durationUs: 10_000_000, isFloat: true, mime: 'audio/mp4' }}));
}};
await assert.rejects(() => openAndroidDirectPcm('https://evil.example/a.mp3', 10), /Invalid Android media/);
await assert.rejects(() => openAndroidDirectPcm('https://appassets.androidplatform.net/android-media?uri=file:///etc/passwd', 10), /Invalid Android media/);
const trackSrc = 'https://appassets.androidplatform.net/android-media?uri=content%3A%2F%2Fmedia%2Fexternal%2Faudio%2Fmedia%2F42';
const fmt = await openAndroidDirectPcm(trackSrc, 10);
assert.equal(fmt.codec, 'android-direct');
assert.equal(fmt.sessionId, 'sess-1234');
assert.equal(fmt.trackSrc, trackSrc);
assert.equal(fmt.sessionClosed, false);

// Reader: 1:1 sequential, multi-chunk assembly, seek, and polyphase resample (48k -> 44.1k)
const mockCalls = [];
const mockFetch = async (url) => {{
    mockCalls.push(url);
    if (url.includes('/android-pcm-close')) return {{ ok: true, status: 200 }};
    const u = new URL(url);
    const reqFrames = Number(u.searchParams.get('frames'));
    const half = reqFrames <= 256 ? reqFrames : Math.max(128, Math.floor(reqFrames / 2));
    return new Response(makeCpcmPacket({{ sampleRate: 48000, channels: 2, isFloat: true, eof: false, frameCount: half }}));
}};
const reader = new AndroidDirectPcmReader(fmt, 48000, mockFetch);
const w1 = await reader.readFrames(0, 600);
assert.equal(w1[0].length, 600);
assert(mockCalls.length >= 2, 'Multi-chunk loop should complete requested window when codec delivers smaller chunk');
assert(Math.abs(w1[0][500] - 0.5) < 1e-5);
// Ring hit avoids network call
const callsBefore = mockCalls.length;
const w2 = await reader.readFrames(200, 128);
assert.equal(w2[0].length, 128);
assert.equal(mockCalls.length, callsBefore);
// Seek issues positive seekUs
await reader.readFrames(24000, 256);
assert(mockCalls.some(c => c.includes('seekUs=500000')));
reader.close();
assert(openCalls.some(c => c.includes('/android-pcm-close?session=sess-1234')));

// Polyphase sinc resample 48k -> 44.1k preserves DC interior precision
const rReader = new AndroidDirectPcmReader(fmt, 44100, async (url) => new Response(makeCpcmPacket({{ sampleRate: 48000, channels: 2, isFloat: true, frameCount: Number(new URL(url).searchParams.get('frames')) }})));
const resampled = await rReader.readFrames(100, 512);
assert.equal(resampled[0].length, 512);
assert(Math.abs(resampled[0][256] - 0.5) < 1e-3);
assert(Math.abs(resampled[1][256] - 0.5) < 1e-3);

// Strict WebIDL WorkerGlobalScope brand check: fetch fails with Illegal invocation if `this` is not globalThis
const brandFetch = function(url, init) {{
    if (this !== undefined && this !== globalThis) {{
        throw new TypeError("Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation");
    }}
    return new Response(makeCpcmPacket({{ sampleRate: 48000, channels: 2, isFloat: true, frameCount: Number(new URL(url).searchParams.get('frames')) }}));
}};
globalThis.fetch = brandFetch;
const strictDefaultReader = new AndroidDirectPcmReader(fmt, 48000);
const strictOut1 = await strictDefaultReader.readFrames(0, 256);
assert.equal(strictOut1[0].length, 256);
const strictExplicitReader = new AndroidDirectPcmReader(fmt, 48000, brandFetch);
const strictOut2 = await strictExplicitReader.readFrames(0, 256);
assert.equal(strictOut2[0].length, 256);

// Transport must reject changed geometry and malformed/oversize data, not reinterpret it.
const changed = new AndroidDirectPcmReader(fmt, 48000, async url => new Response(makeCpcmPacket({{sampleRate:44100,isFloat:true,frameCount:256}})));
await assert.rejects(()=>changed.readFrames(0,256), /format changed/);
const empty = new AndroidDirectPcmReader(fmt, 48000, async url => new Response(makeCpcmPacket({{isFloat:true,frameCount:0}})));
await assert.rejects(()=>empty.readFrames(0,256), /no data/);
const oversized = new AndroidDirectPcmReader(fmt,48000,async url=>new Response(makeCpcmPacket({{isFloat:true,frameCount:1024}})));
await assert.rejects(()=>oversized.readFrames(0,256),/exceeds request|memory limit/);
const badFloat=makeCpcmPacket({{isFloat:true,frameCount:1}}); new DataView(badFloat).setFloat32(16,NaN,true);
assert.throws(()=>parseCpcmPacket(badFloat),/non.?finite/i);
assert.throws(()=>parseCpcmPacket(makeCpcmPacket({{frameCount:1}}).slice(0,19)),/length|geometry|size|payload/i);
console.log('PASS AndroidDirectDecoder & AndroidDirectPcmReader: CPCM parse, open/close security, multi-chunk assembly, ring cache, seek, 48k->44.1k resample & WebIDL fetch brand check');
''', encoding='utf-8')
        out = subprocess.check_output(['node', str(mjs)], text=True)
        print(out.strip())


if __name__ == '__main__':
    main()
