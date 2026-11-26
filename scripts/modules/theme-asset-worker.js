/**
 * Dedicated Worker & Main-Thread Fallback for Custom Theme Image Processing:
 * - Magic-byte + pixel-budget preflight (PNG, JPEG, WebP <= 10 MB, <= 16 MP)
 * - Bounded OffscreenCanvas downscaling + optional pre-baked blur
 * - Fast 32x32 quantized dominant palette extraction
 */
const MAX_THEME_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_THEME_PIXELS = 16000000;

function readAscii(bytes, start, len) {
    let out = '';
    for (let i = 0; i < len && start + i < bytes.length; i++) {
        out += String.fromCharCode(bytes[start + i]);
    }
    return out;
}

export function inspectImageBytes(b) {
    if (!b || !b.length || b.length > MAX_THEME_IMAGE_BYTES) {
        throw new Error('Image must be non-empty and under 10 MB.');
    }
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (b.length >= 24 && readAscii(b, 0, 8) === '\x89PNG\r\n\x1a\n' && readAscii(b, 12, 4) === 'IHDR') {
        return checkDims({ mime: 'image/png', width: v.getUint32(16), height: v.getUint32(20) });
    }
    if (b.length >= 30 && readAscii(b, 0, 4) === 'RIFF' && readAscii(b, 8, 4) === 'WEBP') {
        const chunk = readAscii(b, 12, 4);
        if (chunk === 'VP8X') {
            return checkDims({
                mime: 'image/webp',
                width: 1 + b[24] + b[25] * 256 + b[26] * 65536,
                height: 1 + b[27] + b[28] * 256 + b[29] * 65536
            });
        }
        if (chunk === 'VP8 ' && b[23] === 157 && b[24] === 1 && b[25] === 42) {
            return checkDims({
                mime: 'image/webp',
                width: v.getUint16(26, true) & 16383,
                height: v.getUint16(28, true) & 16383
            });
        }
        if (chunk === 'VP8L' && b[20] === 47) {
            const x = v.getUint32(21, true);
            return checkDims({
                mime: 'image/webp',
                width: 1 + (x & 16383),
                height: 1 + ((x >>> 14) & 16383)
            });
        }
    }
    if (b.length >= 4 && b[0] === 255 && b[1] === 216) {
        let p = 2;
        while (p + 4 <= b.length && b[p] === 255) {
            while (p < b.length && b[p] === 255) p++;
            const m = b[p++];
            if (m === 217 || m === 218) break;
            if (m === 1 || (m >= 208 && m <= 215)) continue;
            if (p + 2 > b.length) break;
            const n = v.getUint16(p);
            if (n < 2 || p + n > b.length) break;
            if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(m) && n >= 8) {
                return checkDims({ mime: 'image/jpeg', height: v.getUint16(p + 3), width: v.getUint16(p + 5) });
            }
            p += n;
        }
    }
    throw new Error('Unsupported or malformed image. Use PNG, JPEG, or WebP.');
}

function checkDims(info) {
    if (!info.width || !info.height || info.width > 8192 || info.height > 8192 || info.width * info.height > MAX_THEME_PIXELS) {
        throw new Error('Image dimensions exceed the safe pixel limit (16 megapixels).');
    }
    return info;
}

function rgbToHex(r, g, b) {
    const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}

function luminance(r, g, b) {
    const lin = (c) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function saturationSq(r, g, b) {
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    return mx === 0 ? 0 : ((mx - mn) / mx);
}

/**
 * Extract dominant background, surface, and accent colors from a sampled 32x32 RGBA grid.
 */
export function extractPaletteFromPixels(rgba) {
    if (!rgba || rgba.length < 4) return null;
    const buckets = new Map();
    for (let i = 0; i + 3 < rgba.length; i += 4) {
        if (rgba[i + 3] < 96) continue;
        const r = rgba[i];
        const g = rgba[i + 1];
        const b = rgba[i + 2];
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const entry = buckets.get(key) || { count: 0, rSum: 0, gSum: 0, bSum: 0 };
        entry.count++;
        entry.rSum += r;
        entry.gSum += g;
        entry.bSum += b;
        buckets.set(key, entry);
    }
    const clusters = Array.from(buckets.values()).map(e => {
        const r = e.rSum / e.count;
        const g = e.gSum / e.count;
        const b = e.bSum / e.count;
        return {
            r, g, b,
            count: e.count,
            lum: luminance(r, g, b),
            sat: saturationSq(r, g, b),
            hex: rgbToHex(r, g, b)
        };
    }).sort((a, b) => b.count - a.count);

    if (clusters.length === 0) return null;
    const dominant = clusters[0];
    const isLight = dominant.lum > 0.36;

    // Pick vivid accent with hue presence
    const accentCand = clusters
        .slice()
        .sort((a, b) => (b.sat * (b.count ** 0.35)) - (a.sat * (a.count ** 0.35)))[0] || dominant;
    const secondaryCand = clusters.find(c => Math.abs(c.lum - accentCand.lum) > 0.1 || c.hex !== accentCand.hex) || accentCand;

    // Derive darkened or lightened background/middleground planes seeded from dominant hue
    const mixTo = (c, target, t) => rgbToHex(
        c.r + (target - c.r) * t,
        c.g + (target - c.g) * t,
        c.b + (target - c.b) * t
    );

    const bgCanvas = isLight ? mixTo(dominant, 248, 0.78) : mixTo(dominant, 8, 0.76);
    const surface1 = isLight ? mixTo(dominant, 255, 0.88) : mixTo(dominant, 18, 0.64);
    const surface2 = isLight ? mixTo(dominant, 232, 0.68) : mixTo(dominant, 28, 0.52);
    const surface3 = isLight ? mixTo(dominant, 218, 0.62) : mixTo(dominant, 40, 0.44);

    return {
        mode: isLight ? 'light' : 'dark',
        bgCanvas,
        surface1,
        surface2,
        surface3,
        accent: accentCand.hex,
        secondary: secondaryCand.hex
    };
}

function createCanvasSurface(width, height) {
    if (typeof OffscreenCanvas === 'function') {
        return new OffscreenCanvas(width, height);
    }
    if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        return c;
    }
    throw new Error('Canvas surface unavailable for image processing.');
}

async function encodeCanvasToBlob(canvas, mime, quality) {
    if (typeof canvas.convertToBlob === 'function') {
        try {
            return await canvas.convertToBlob({ type: 'image/webp', quality });
        } catch (_) {
            return await canvas.convertToBlob({ type: mime === 'image/jpeg' ? 'image/jpeg' : 'image/png', quality });
        }
    }
    return await new Promise((resolve) => {
        canvas.toBlob((out) => resolve(out), 'image/webp', quality);
    }) || await new Promise((resolve) => {
        canvas.toBlob((out) => resolve(out), mime === 'image/jpeg' ? 'image/jpeg' : 'image/png', quality);
    });
}

/**
 * Process an uploaded background/texture Blob into a bounded WebP Blob + palette sample.
 */
export async function processThemeImageBlob(blob, options = {}) {
    if (!(blob instanceof Blob) || !blob.size || blob.size > MAX_THEME_IMAGE_BYTES) {
        throw new Error('Background image must be under 10 MB.');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const info = inspectImageBytes(bytes);
    const scope = options.scope || 'canvas';
    const maxDim = options.maxDim || (scope === 'canvas' ? 1920 : options.fit === 'tile' ? 512 : 1024);

    const bitmap = await createImageBitmap(new Blob([bytes], { type: info.mime }));
    try {
        checkDims({ mime: info.mime, width: bitmap.width, height: bitmap.height });
        const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
        const targetW = Math.max(1, Math.round(bitmap.width * scale));
        const targetH = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = createCanvasSurface(targetW, targetH);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, targetW, targetH);

        const outBlob = await encodeCanvasToBlob(canvas, info.mime, 0.86);
        if (!outBlob || outBlob.size > MAX_THEME_IMAGE_BYTES) {
            throw new Error('Processed theme image exceeds size limit.');
        }

        // Fast 32x32 sample for palette extraction
        const sample = createCanvasSurface(32, 32);
        const sCtx = sample.getContext('2d');
        sCtx.drawImage(bitmap, 0, 0, 32, 32);
        const rgba = sCtx.getImageData(0, 0, 32, 32).data;
        const palette = extractPaletteFromPixels(rgba);

        return {
            blob: outBlob,
            width: targetW,
            height: targetH,
            palette
        };
    } finally {
        bitmap.close();
    }
}

// Execute worker message handler only when running inside a DedicatedWorkerGlobalScope
const inWorker = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;
if (inWorker) {
    self.onmessage = async (event) => {
        const { id, type, blob, options } = event.data || {};
        try {
            if (type === 'process-image') {
                const res = await processThemeImageBlob(blob, options || {});
                self.postMessage({ id, ok: true, result: res });
            } else {
                self.postMessage({ id, ok: false, error: 'Unsupported worker task.' });
            }
        } catch (err) {
            self.postMessage({ id, ok: false, error: err?.message || 'Image processing failed.' });
        }
    };
}
