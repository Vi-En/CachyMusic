// SPDX-License-Identifier: GPL-3.0-or-later
// Bounded local RIFF/WAVE and AIFF integer PCM reader plus shared polyphase sinc resampler.
const text = (v, p, n) => String.fromCharCode(...new Uint8Array(v.buffer, v.byteOffset + p, n));
const MAX_HEADER_CHUNKS = 256;
const PHASES = 512;
const TAPS = 32;
const MAX_CACHED_KERNELS = 8;
const kernelCache = new Map();

async function read(blob, offset, length) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > blob.size) {
        throw Error('Truncated PCM container');
    }
    const bytes = await blob.slice(offset, offset + length).arrayBuffer();
    if (bytes.byteLength !== length) throw Error('Incomplete PCM read');
    return new DataView(bytes);
}

function extendedRate(v, p) {
    const exp = v.getUint16(p), hi = v.getUint32(p + 2), lo = v.getUint32(p + 6);
    if (exp & 0x8000 || exp === 0 || exp === 0x7fff || hi < 0x80000000) throw Error('Invalid AIFF sample rate');
    return (hi / 2 ** 31 + lo / 2 ** 63) * 2 ** (exp - 16383);
}

/**
 * Computes (or retrieves from a small LRU cache) a 512-phase, 32-tap Blackman-Harris
 * windowed-sinc resampling polyphase kernel table for `ratio = inputRate / outputRate`.
 */
export function getResampleKernel(ratio) {
    const key = Math.round(ratio * 1e9);
    if (kernelCache.has(key)) {
        const hit = kernelCache.get(key);
        kernelCache.delete(key);
        kernelCache.set(key, hit);
        return hit;
    }
    const kernel = new Float64Array(PHASES * TAPS);
    const cutoff = Math.min(1, 1 / ratio) * 0.94;
    for (let phase = 0; phase < PHASES; phase++) {
        let sum = 0;
        for (let j = 0; j < TAPS; j++) {
            const x = j - (TAPS / 2 - 1) - phase / PHASES;
            const y = x * cutoff;
            const sinc = (Math.abs(y) < 1e-12 ? 1 : Math.sin(Math.PI * y) / (Math.PI * y)) * cutoff;
            const w = Math.abs(x) >= TAPS / 2 ? 0 : 0.42 + 0.5 * Math.cos(2 * Math.PI * x / TAPS) + 0.08 * Math.cos(4 * Math.PI * x / TAPS);
            sum += kernel[phase * TAPS + j] = sinc * w;
        }
        for (let j = 0; j < TAPS; j++) kernel[phase * TAPS + j] /= sum;
    }
    if (kernelCache.size >= MAX_CACHED_KERNELS) {
        kernelCache.delete(kernelCache.keys().next().value);
    }
    kernelCache.set(key, kernel);
    return kernel;
}

/**
 * Resamples planar Float32 audio windows using a shared polyphase sinc table.
 */
export function resamplePlanarChannels(channels, first, count, start, ratio, kern) {
    const numCh = channels.length;
    const output = Array.from({ length: numCh }, () => new Float32Array(count));
    if (!count || !channels[0]) return output;
    const ch0 = channels[0], out0 = output[0], len = ch0.length;
    if (numCh === 2) {
        const ch1 = channels[1], out1 = output[1];
        for (let i = 0; i < count; i++) {
            const pos = (first + i) * ratio;
            const base = Math.floor(pos);
            const phase = Math.min(PHASES - 1, Math.floor((pos - base) * PHASES));
            const left = base - (TAPS / 2 - 1) - start;
            const kOff = phase * TAPS;
            let v0 = 0, v1 = 0;
            if (left >= 0 && left + TAPS <= len) {
                for (let j = 0; j < TAPS; j++) {
                    const c = kern[kOff + j], ix = left + j;
                    v0 += ch0[ix] * c;
                    v1 += ch1[ix] * c;
                }
            } else {
                for (let j = 0; j < TAPS; j++) {
                    const ix = left + j;
                    if (ix >= 0 && ix < len) {
                        const c = kern[kOff + j];
                        v0 += ch0[ix] * c;
                        v1 += ch1[ix] * c;
                    }
                }
            }
            out0[i] = v0;
            out1[i] = v1;
        }
    } else {
        for (let i = 0; i < count; i++) {
            const pos = (first + i) * ratio;
            const base = Math.floor(pos);
            const phase = Math.min(PHASES - 1, Math.floor((pos - base) * PHASES));
            const left = base - (TAPS / 2 - 1) - start;
            const kOff = phase * TAPS;
            let v0 = 0;
            if (left >= 0 && left + TAPS <= len) {
                for (let j = 0; j < TAPS; j++) v0 += ch0[left + j] * kern[kOff + j];
            } else {
                for (let j = 0; j < TAPS; j++) {
                    const ix = left + j;
                    if (ix >= 0 && ix < len) v0 += ch0[ix] * kern[kOff + j];
                }
            }
            out0[i] = v0;
        }
    }
    return output;
}

export async function inspectPcm(blob) {
    const header = await read(blob, 0, 12), kind = text(header, 0, 4);
    const wav = kind === 'RIFF' && text(header, 8, 4) === 'WAVE', aiff = kind === 'FORM' && text(header, 8, 4) === 'AIFF';
    if (!wav && !aiff) throw Error('Not supported PCM WAV or AIFF');
    const end = 8 + header.getUint32(4, wav); if (end > blob.size || end < 12) throw Error('Invalid PCM container size');
    let fmt = null, data = null, declaredFrames = null, p = 12, count = 0; const deadline = Date.now() + 5000;
    while (p + 8 <= end) {
        if (++count > MAX_HEADER_CHUNKS || Date.now() > deadline) throw Error('PCM header scan exceeded budget');
        const h = await read(blob, p, 8), id = text(h, 0, 4), n = h.getUint32(4, wav), start = p + 8;
        if (start + n > end) throw Error('Invalid PCM chunk size');
        if (wav && id === 'fmt ') {
            if (fmt || n < 16) throw Error('Invalid WAV format'); const v = await read(blob, start, 16);
            let code = v.getUint16(0, true); const channels = v.getUint16(2, true), sampleRate = v.getUint32(4, true), blockAlign = v.getUint16(12, true), bits = v.getUint16(14, true);
            if (code === 0xfffe) {
                if (n < 40) throw Error('Truncated extensible WAV'); const ext = await read(blob, start + 16, 24);
                const guidTail = [0, 0, 0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113];
                if (ext.getUint16(0, true) < 22 || ext.getUint16(2, true) !== bits || !guidTail.every((x, i) => ext.getUint8(10 + i) === x)) throw Error('Unsupported extensible WAV');
                code = ext.getUint16(8, true);
            }
            if (code !== 1 && !(code === 3 && bits === 32)) throw Error('Unsupported WAV encoding');
            fmt = { channels, sampleRate, bits, blockAlign, float: code === 3, little: true, unsigned8: true };
        } else if (aiff && id === 'COMM') {
            if (fmt || n < 18) throw Error('Invalid AIFF format'); const v = await read(blob, start, 18), channels = v.getUint16(0), bits = v.getUint16(6);
            declaredFrames = v.getUint32(2); fmt = { channels, bits, sampleRate: extendedRate(v, 8), blockAlign: channels * bits / 8, float: false, little: false, unsigned8: false };
        } else if (wav && id === 'data') {
            if (data) throw Error('Multiple PCM data chunks'); data = { offset: start, bytes: n };
        } else if (aiff && id === 'SSND') {
            if (data || n < 8) throw Error('Invalid AIFF sound chunk'); const v = await read(blob, start, 8), offset = v.getUint32(0);
            if (offset > n - 8) throw Error('Invalid AIFF sound offset'); data = { offset: start + 8 + offset, bytes: n - 8 - offset };
        }
        if (fmt && data) break;
        p = start + n + (n & 1);
    }
    if (!fmt || !data || ![1, 2].includes(fmt.channels) || ![8, 16, 24, 32].includes(fmt.bits) || !Number.isInteger(fmt.sampleRate) || fmt.sampleRate < 8000 || fmt.sampleRate > 384000 || fmt.blockAlign !== fmt.channels * fmt.bits / 8) throw Error('Unsupported PCM geometry');
    if (data.bytes % fmt.blockAlign) throw Error('Misaligned PCM payload');
    const frames = data.bytes / fmt.blockAlign; if (frames < 1 || (declaredFrames !== null && frames !== declaredFrames)) throw Error('Invalid PCM frame count');
    return { ...fmt, ...data, frames, numberOfChannels: fmt.channels, duration: frames / fmt.sampleRate, streaming: true };
}

export class PcmReader {
    constructor(blob, format, outputRate) {
        if (!Number.isInteger(outputRate) || outputRate < 8000 || outputRate > 384000) throw Error('Unsupported output rate');
        this.blob = blob;
        this.format = format;
        this.outputRate = outputRate;
        this.ratio = format.sampleRate / outputRate;
        this.outputFrames = Math.ceil(format.frames / this.ratio);
        this.kernel = this.ratio === 1 ? null : getResampleKernel(this.ratio);
    }

    async readFrames(first, count) {
        if (!Number.isSafeInteger(first) || first < 0 || !Number.isSafeInteger(count) || count < 1 || count > Math.ceil(this.outputRate / 2)) {
            throw Error('Invalid PCM read window');
        }
        count = Math.max(0, Math.min(count, this.outputFrames - first));
        const f = this.format;
        if (!count) return Array.from({ length: f.channels }, () => new Float32Array(0));
        const start = Math.max(0, Math.floor(first * this.ratio) - TAPS);
        const end = Math.min(f.frames, Math.ceil((first + count) * this.ratio) + TAPS);
        const channels = await this.readNative(start, end);
        if (this.ratio === 1) {
            return Array.from({ length: f.channels }, (_, c) => {
                const out = new Float32Array(count);
                out.set(channels[c].subarray(first - start, first - start + count));
                return out;
            });
        }
        return resamplePlanarChannels(channels, first, count, start, this.ratio, this.kernel);
    }

    async readNative(start, end) {
        const f = this.format;
        const v = await read(this.blob, f.offset + start * f.blockAlign, (end - start) * f.blockAlign);
        const channels = Array.from({ length: f.channels }, () => new Float32Array(end - start));
        for (let i = 0; i < end - start; i++) {
            for (let c = 0; c < f.channels; c++) {
                const p = i * f.blockAlign + c * f.bits / 8;
                let val;
                if (f.float) val = v.getFloat32(p, true);
                else if (f.bits === 8) val = (f.unsigned8 ? v.getUint8(p) - 128 : v.getInt8(p)) / 128;
                else if (f.bits === 16) val = v.getInt16(p, f.little) / 32768;
                else if (f.bits === 24) {
                    const a = v.getUint8(p), b = v.getUint8(p + 1), d = v.getUint8(p + 2);
                    const x = f.little ? a | b << 8 | d << 16 : d | b << 8 | a << 16;
                    val = (x << 8 >> 8) / 8388608;
                } else val = v.getInt32(p, f.little) / 2147483648;
                if(!Number.isFinite(val))throw Error('Nonfinite PCM sample');
                channels[c][i] = val;
            }
        }
        return channels;
    }
}
