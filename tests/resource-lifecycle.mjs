// Regression checks for artwork in-flight deduplication, bounded retention,
// and independent native canvas blur state.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

globalThis.crypto ??= webcrypto;
let bitmapDecodes = 0;
let bitmapCloses = 0;
let thumbnailWrites = 0;
globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() { return { drawImage() {} }; }
    async convertToBlob() {
        thumbnailWrites++;
        await new Promise(resolve => setTimeout(resolve, 2));
        return new Blob([new Uint8Array([1, 2, 3, 4])], {type: 'image/webp'});
    }
};
globalThis.createImageBitmap = async () => {
    bitmapDecodes++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return {width: 16, height: 16, close() {bitmapCloses++;}};
};
// A minimal PNG header sufficient for safe preflight; the bitmap decoder is mocked.
const png = new Uint8Array(24);
png.set([137,80,78,71,13,10,26,10], 0);
png.set([73,72,68,82], 12);
png[19] = 16; png[23] = 16;
const data = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
const { optimizeTrackArtwork } = await import('../scripts/modules/artwork-cache.js');
const covers = await Promise.all(Array.from({length: 24}, (_, i) => optimizeTrackArtwork({cover:data, title:`Track ${i}`})));
assert.equal(bitmapDecodes, 1, 'Concurrent identical art must decode only once');
assert.equal(bitmapCloses, 1, 'Decoded bitmap must close');
assert.equal(thumbnailWrites, 2, 'Thumb and full size generated once');
assert(covers.every((c, i) => c.title === `Track ${i}` && c.coverKey === covers[0].coverKey && c.coverThumb.startsWith('data:image/webp;base64,')));
await optimizeTrackArtwork({cover:data});
assert.equal(bitmapDecodes, 1, 'Cached art must not decode twice');

// The visualizer blur policy must not mutate the native Canvas prototype.
class FakeContext {
    constructor() { this._blur = 0; this._stack = []; }
    save() { this._stack.push(this._blur); }
    restore() { this._blur = this._stack.pop(); }
}
Object.defineProperty(FakeContext.prototype, 'shadowBlur', {
    configurable:true, enumerable:true,
    get() { return this._blur; },
    set(value) { this._blur = value; }
});
globalThis.CanvasRenderingContext2D = FakeContext;
const {setCanvasShadowBlur} = await import('../scripts/modules/visualizers/canvas-shadow.js');
const a = new FakeContext(), b = new FakeContext();
a.shadowBlur = 15;
assert.equal(a.shadowBlur, 15, 'Native canvas property must remain unmodified');
setCanvasShadowBlur(a,15);
setCanvasShadowBlur(b,2);
assert.equal(a.shadowBlur, 3, 'Desktop blur should be bounded');
assert.equal(b.shadowBlur, 2, 'Canvas contexts must not share blur values');
a.save(); a.shadowBlur = 1; a.restore();
assert.equal(a.shadowBlur, 3, 'Getter should reflect native restore state');
console.log('PASS: concurrent cover dedup, decoded bitmap close, cache hits, local blur policy and native canvas state');

// Distinct artwork may be queued concurrently: never decode more than two
// potentially 16-megapixel image bitmaps at the same time.
let liveBitmaps = 0;
let peakLiveBitmaps = 0;
globalThis.createImageBitmap = async () => {
    bitmapDecodes++;
    liveBitmaps++;
    peakLiveBitmaps = Math.max(peakLiveBitmaps, liveBitmaps);
    await new Promise(resolve => setTimeout(resolve, 3));
    return {width: 16, height: 16, close() { liveBitmaps--; bitmapCloses++; }};
};
const unique = Array.from({length: 7}, (_, i) => {
    const b = new Uint8Array([...png, i + 1]);
    return `data:image/png;base64,${Buffer.from(b).toString('base64')}`;
});
await Promise.all(unique.map((cover, i) => optimizeTrackArtwork({cover, title:`Unique ${i}`})));
assert.equal(peakLiveBitmaps, 2, 'Bitmap decoding must use two bounded permits');
assert.equal(liveBitmaps, 0, 'Every live image bitmap must eventually close');
console.log('PASS: distinct-cover bitmap decode concurrency bounded to two');
