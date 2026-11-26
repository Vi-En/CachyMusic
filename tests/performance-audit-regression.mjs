import assert from 'node:assert/strict';
import { resolveTrackThumbUrl, createArtworkPrefetcher } from '../scripts/modules/artwork-loader.js';
import { getResampleKernel, resamplePlanarChannels } from '../scripts/modules/pcm-reader.js';
import { PcmStream } from '../scripts/modules/pcm-stream.js';
import { createSoftClipCurve, createLinearCurve } from '../scripts/modules/audio-policies.js';

// 1. Artwork URL resolution & directional velocity-aware prefetcher
assert.equal(resolveTrackThumbUrl(null), 'resources/images/default.svg');
assert.equal(
    resolveTrackThumbUrl({ cover: 'https://appassets.androidplatform.net/android-media-art?uri=content%3A%2F%2F1' }),
    'https://appassets.androidplatform.net/android-media-art?uri=content%3A%2F%2F1&thumb=1'
);
assert.equal(resolveTrackThumbUrl({ cover: 'blob:https://app/123' }), 'blob:https://app/123');

class FakeImage {
    constructor() { this.decoding = ''; this._src = ''; }
    set src(v) { this._src = v; }
    decode() { return Promise.resolve(); }
}

const androidBatches = [];
const invalidated = [];
const prefetcher = createArtworkPrefetcher({
    maxEntries: 5,
    maxInFlight: 3,
    ImageCtor: FakeImage,
    bridge: {
        prefetchArtwork(json) { androidBatches.push(JSON.parse(json)); },
        invalidateArtwork(uri) { invalidated.push(uri); }
    }
});

const catalog = Array.from({ length: 80 }, (_, i) => ({
    cover: `https://appassets.androidplatform.net/android-media-art?uri=${encodeURIComponent(`content://media/external/audio/media/${i}`)}`
}));
prefetcher.prefetchWindow(catalog, 10, 20, 1, 2.0);
await new Promise(r => setTimeout(r, 15));
assert.equal(androidBatches.length, 1);
assert.equal(androidBatches[0][0], 'content://media/external/audio/media/10');
assert(androidBatches[0].length === 16);
assert.equal(prefetcher.cachedCount, 5, 'Decoded LRU must remain strictly bounded');
assert.equal(prefetcher.has(resolveTrackThumbUrl(catalog[14])), true);

prefetcher.invalidate(resolveTrackThumbUrl(catalog[14]));
assert.equal(prefetcher.has(resolveTrackThumbUrl(catalog[14])), false);
assert.deepEqual(invalidated, ['content://media/external/audio/media/14']);

// Reverse scroll prioritizes descending indices ahead of window top
androidBatches.length = 0;
prefetcher.prefetchWindow(catalog, 40, 50, -1, 0);
await new Promise(r => setTimeout(r, 15));
assert.equal(androidBatches[0][0], 'content://media/external/audio/media/49');

assert.equal(resolveTrackThumbUrl({cover:'https://cdn.example/art.png?signature=abc#cover'}),'https://cdn.example/art.png?signature=abc#cover');
assert.equal(resolveTrackThumbUrl({cover:'php/api/cover.php?tid=42#cover'}),'php/api/cover.php?tid=42&thumb=1#cover');
const deferred=[];
class SlowImage { decode(){return new Promise(r=>deferred.push(r));} }
const slow=createArtworkPrefetcher({maxInFlight:1,ImageCtor:SlowImage,bridge:null});
slow.prefetchWindow(catalog,0,1);await Promise.resolve();slow.clear();deferred.shift()();await new Promise(r=>setTimeout(r,0));assert.equal(slow.cachedCount,0);
slow.prefetchWindow(catalog,0,1);await Promise.resolve();slow.setPaused(true);deferred.shift()();await new Promise(r=>setTimeout(r,0));assert.equal(slow.cachedCount,0);
// 2. Resample kernel cache & shared planar resampler
const k1 = getResampleKernel(44100 / 48000);
const k2 = getResampleKernel(44100 / 48000);
assert.equal(k1, k2, 'Identical ratio must return cached kernel table');
for (let i = 1; i <= 10; i++) getResampleKernel((40000 + i * 100) / 48000);
const planar = [new Float32Array(4096).fill(0.5), new Float32Array(4096).fill(-0.25)];
const resampled = resamplePlanarChannels(planar, 64, 512, 0, 44100 / 48000, getResampleKernel(44100 / 48000));
assert.equal(resampled.length, 2);
assert(Math.abs(resampled[0][256] - 0.5) < 1e-3);
assert(Math.abs(resampled[1][256] + 0.25) < 1e-3);

// 3. Memoized waveshaper curves preserve exact Float32 output and instance identity
const scA = createSoftClipCurve(2048);
const scB = createSoftClipCurve(2048);
const lcA = createLinearCurve(2048);
const lcB = createLinearCurve(2048);
assert.equal(scA, scB);
assert.equal(lcA, lcB);
assert.equal(lcA[0], -1);
assert.equal(lcA[2047], 1);

// 4. PcmStream persistent worker reuse + live seek() without tearing down worker
class MockWorker {
    constructor() { this.messages = []; this.terminated = false; }
    postMessage(msg) {
        this.messages.push(msg);
        if (msg.type === 'close') return;
        queueMicrotask(() => {
            if (this.terminated || !this.onmessage) return;
            if (msg.type === 'init') {
                this.onmessage({ data: { id: msg.id, frames: 48000 * 10 } });
            } else if (msg.type === 'read') {
                this.onmessage({ data: { id: msg.id, channels: [new Float32Array(msg.count), new Float32Array(msg.count)] } });
            }
        });
    }
    terminate() { this.terminated = true; }
}

const startedOffsets = [];
const mockCtx = {
    sampleRate: 48000,
    currentTime: 10,
    createBuffer(ch, len, sr) { return { numberOfChannels: ch, length: len, sampleRate: sr, copyToChannel() {} }; },
    createBufferSource() {
        return { connect() {}, start() {}, stop() {}, disconnect() {}, onended: null };
    }
};
const sharedWorker = new MockWorker();
const stream = new PcmStream(mockCtx, {}, {}, { duration: 10, codec: 'flac', streaming: true }, {
    worker: sharedWorker,
    keepWorkerAlive: true,
    onStart: (_anchor, offset) => startedOffsets.push(offset),
    onEnd: () => {},
    onError: err => { throw err; }
});
await stream.start(0, true);
assert.equal(startedOffsets.length, 1);
assert.equal(startedOffsets[0], 0);
const seeked = await stream.seek(4.5);
assert.equal(seeked, true);
assert.equal(startedOffsets.length, 2);
assert.equal(startedOffsets[1], 4.5);
assert.equal(sharedWorker.terminated, false);
stream.stop();
assert.equal(sharedWorker.terminated, false, 'Persistent worker must not terminate on stop()');
assert(sharedWorker.messages.some(m => m.type === 'close'), 'stop() must notify persistent worker to close reader');

const stream2 = new PcmStream(mockCtx, {}, {}, { duration: 10, codec: 'flac', streaming: true }, {
    worker: sharedWorker,
    keepWorkerAlive: true,
    onStart: () => {},
    onEnd: () => {},
    onError: err => { throw err; }
});
await stream2.start(0, true);
const seqIds = sharedWorker.messages.filter(m => m.id != null).map(m => m.id);
assert.equal(new Set(seqIds).size, seqIds.length, 'Stream request IDs must be globally unique across persistent worker reuse');
stream2.stop();

console.log('PASS performance-audit regression: artwork prefetcher LRU/direction, kernel cache, curve memoization & PcmStream persistent worker + live seek');
