// SPDX-License-Identifier: GPL-3.0-or-later
// Worker-side client for Android MediaCodec direct-to-Web-Audio PCM streaming.
import { getResampleKernel, resamplePlanarChannels } from './pcm-reader.js';

const ANDROID_ORIGIN = 'https://appassets.androidplatform.net';
const TAPS = 32;

function extractAndroidMediaUri(trackSrc, base = globalThis.location?.href) {
    if (!trackSrc || !base) return '';
    const u = new URL(trackSrc, base);
    if (u.origin !== ANDROID_ORIGIN || u.pathname !== '/android-media' || u.username || u.password) return '';
    const raw = u.searchParams.get('uri') || '';
    return raw.startsWith('content://') && raw.length <= 8192 ? raw : '';
}

/**
 * Opens an Android MediaCodec PCM decoding session for an indexed media URI.
 * Throws if unavailable or invalid so the caller can fall back safely.
 */
export async function openAndroidDirectPcm(trackSrc, knownDuration = 0) {
    const mediaUri = extractAndroidMediaUri(trackSrc);
    if (!mediaUri) throw Error('Invalid Android media source');
    const url = new URL('/android-pcm-open', ANDROID_ORIGIN);
    url.searchParams.set('uri', mediaUri);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
        const res = await fetch(url.href, {
            redirect: 'error',
            credentials: 'same-origin',
            cache: 'no-store',
            signal: ctrl.signal
        });
        if (!res.ok) throw Error(`Direct PCM open rejected (${res.status})`);
        const data = await res.json();
        if (!data?.ok || !data.sessionId || !Number.isInteger(data.sampleRate) || !Number.isInteger(data.channels)) {
            throw Error('Malformed direct PCM descriptor');
        }
        const rawDuration = Number(data.durationUs) > 0 ? Number(data.durationUs) / 1e6 : Number(knownDuration || 0);
        if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
            try { await closeAndroidDirectPcm(data.sessionId); } catch (_) {}
            throw Error('Unknown track duration for direct PCM');
        }
        const frames = Math.max(1, Math.round(rawDuration * data.sampleRate));
        return {
            codec: 'android-direct',
            kind: 'android-direct',
            streaming: true,
            sessionId: data.sessionId,
            trackSrc,
            sessionClosed: false,
            sampleRate: data.sampleRate,
            channels: data.channels,
            numberOfChannels: data.channels,
            isFloat: Boolean(data.isFloat),
            duration: rawDuration,
            frames,
            mime: data.mime || ''
        };
    } finally {
        clearTimeout(timer);
    }
}

export async function closeAndroidDirectPcm(sessionId) {
    if (!sessionId) return;
    const url = new URL('/android-pcm-close', ANDROID_ORIGIN);
    url.searchParams.set('session', sessionId);
    try {
        await fetch(url.href, { redirect: 'error', credentials: 'same-origin', cache: 'no-store' });
    } catch (_) {}
}

/**
 * Validates and deinterleaves a binary "CPCM" packet returned by AndroidDirectDecoder.
 */
export function parseCpcmPacket(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength < 16) {
        throw Error('Truncated CPCM packet');
    }
    const v = new DataView(arrayBuffer);
    if (v.getUint8(0) !== 0x43 || v.getUint8(1) !== 0x50 || v.getUint8(2) !== 0x43 || v.getUint8(3) !== 0x4d) {
        throw Error('Invalid CPCM magic header');
    }
    const sampleRate = v.getUint32(4, true);
    const channels = v.getUint16(8, true);
    const flags = v.getUint16(10, true);
    const frameCount = v.getUint32(12, true);
    const isFloat = Boolean(flags & 1);
    const eof = Boolean(flags & 2);
    if (channels < 1 || channels > 2 || sampleRate < 8000 || sampleRate > 384000) {
        throw Error('Invalid CPCM stream format');
    }
    const bytesPerSample = isFloat ? 4 : 2;
    const expectedBytes = 16 + frameCount * channels * bytesPerSample;
    if (arrayBuffer.byteLength < expectedBytes) {
        throw Error('Incomplete CPCM frame payload');
    }

    const planar = Array.from({ length: channels }, () => new Float32Array(frameCount));
    const ch0 = planar[0];
    const ch1 = channels === 2 ? planar[1] : null;
    if (isFloat) {
        if (channels === 2) {
            for (let i = 0, off = 16; i < frameCount; i++, off += 8) {
                const l = v.getFloat32(off, true);
                const r = v.getFloat32(off + 4, true);
                ch0[i] = Number.isFinite(l) ? l : 0;
                ch1[i] = Number.isFinite(r) ? r : 0;
            }
        } else {
            for (let i = 0, off = 16; i < frameCount; i++, off += 4) {
                const l = v.getFloat32(off, true);
                ch0[i] = Number.isFinite(l) ? l : 0;
            }
        }
    } else if (channels === 2) {
        const inv16 = 1 / 32768;
        for (let i = 0, off = 16; i < frameCount; i++, off += 4) {
            ch0[i] = v.getInt16(off, true) * inv16;
            ch1[i] = v.getInt16(off + 2, true) * inv16;
        }
    } else {
        const inv16 = 1 / 32768;
        for (let i = 0, off = 16; i < frameCount; i++, off += 2) {
            ch0[i] = v.getInt16(off, true) * inv16;
        }
    }
    return { sampleRate, channels, isFloat, eof, frameCount, channelsData: planar };
}

/**
 * Worker-side PCM reader backed by an open Android MediaCodec session.
 * Implements `outputFrames`, `readFrames(first, count)`, and `close()`.
 */
export class AndroidDirectPcmReader {
    constructor(format, outputRate, fetchFn = null) {
        if (!format?.sessionId) throw Error('Android direct PCM session missing');
        if (!Number.isInteger(outputRate) || outputRate < 8000 || outputRate > 384000) {
            throw Error('Unsupported output rate');
        }
        this.format = format;
        this.outputRate = outputRate;
        this.fetchFn = typeof fetchFn === 'function' ? fetchFn : null;
        this.activeAbort = null;
        this.ratio = format.sampleRate / outputRate;
        this.outputFrames = Math.max(1, Math.ceil(format.frames / this.ratio));
        this.kernel = this.ratio === 1 ? null : getResampleKernel(this.ratio);
        this.nativeCursor = 0;
        this.ring = Array.from({ length: format.channels }, () => new Float32Array(0));
        this.ringStart = 0;
        this.closed = false;
    }

    async fetchChunk(seekUs, maxFrames) {
        const url = new URL('/android-pcm-read', ANDROID_ORIGIN);
        url.searchParams.set('session', this.format.sessionId);
        url.searchParams.set('seekUs', String(seekUs));
        url.searchParams.set('frames', String(maxFrames));

        const ctrl = new AbortController();
        this.activeAbort = ctrl;
        const timer = setTimeout(() => ctrl.abort(), 5000);
        try {
            const init = {
                redirect: 'error',
                credentials: 'same-origin',
                cache: 'no-store',
                signal: ctrl.signal
            };
            const fn = this.fetchFn;
            // Call without binding `this` to the reader instance (WorkerGlobalScope WebIDL check).
            const res = await (fn ? fn.call(globalThis, url.href, init) : fetch(url.href, init));
            if (!res.ok) throw Error(`Direct PCM read failed (${res.status})`);
            return parseCpcmPacket(await res.arrayBuffer());
        } finally {
            clearTimeout(timer);
            if (this.activeAbort === ctrl) this.activeAbort = null;
        }
    }

    async readNativeWindow(winStart, winEnd) {
        const chCount = this.format.channels;
        const ringEnd = this.ringStart + this.ring[0].length;
        const canReuse = this.ring[0].length > 0 && winStart >= this.ringStart && winStart <= this.nativeCursor;

        if (canReuse && winEnd <= ringEnd) {
            const off = winStart - this.ringStart;
            const len = winEnd - winStart;
            return this.ring.map(ch => ch.subarray(off, off + len));
        }

        const neededTotal = winEnd - winStart;
        let prefix = null;
        let prefixLen = 0;
        let firstSeekUs = -1;
        if (canReuse) {
            const keepOffset = winStart - this.ringStart;
            prefixLen = Math.max(0, this.ring[0].length - keepOffset);
            prefix = this.ring.map(ch => ch.subarray(keepOffset));
        } else {
            firstSeekUs = winStart === this.nativeCursor
                ? -1
                : Math.round((winStart / this.format.sampleRate) * 1e6);
        }

        const chunks = [];
        let totalLen = prefixLen;
        let eof = false;
        for (let iter = 0; iter < 4 && !eof && totalLen < neededTotal; iter++) {
            const seekArg = iter === 0 ? firstSeekUs : -1;
            const remainingNeeded = neededTotal - totalLen;
            const fetchFrames = Math.min(65536, Math.max(256, remainingNeeded));
            const packet = await this.fetchChunk(seekArg, fetchFrames);
            if (packet.frameCount > 0) chunks.push(packet.channelsData);
            totalLen += packet.frameCount;
            eof = packet.eof || packet.frameCount === 0;
        }
        this.nativeCursor = winStart + totalLen;

        let channels;
        if (prefixLen === 0 && chunks.length === 1 && chunks[0].length >= chCount) {
            channels = chunks[0];
        } else {
            channels = Array.from({ length: chCount }, (_, c) => {
                const buf = new Float32Array(totalLen);
                let offset = 0;
                if (prefixLen > 0) {
                    const srcPrefix = prefix[Math.min(c, prefix.length - 1)];
                    buf.set(srcPrefix, 0);
                    offset = prefixLen;
                }
                for (const chData of chunks) {
                    const srcCh = chData[Math.min(c, chData.length - 1)];
                    buf.set(srcCh, offset);
                    offset += srcCh.length;
                }
                return buf;
            });
        }

        const retainFrom = Math.max(0, channels[0].length - Math.max(TAPS * 2, neededTotal));
        this.ringStart = winStart + retainFrom;
        for (let c = 0; c < chCount; c++) {
            this.ring[c] = channels[c].slice(retainFrom);
        }
        return channels;
    }

    async readFrames(first, count) {
        if (this.closed) throw Error('Direct PCM reader closed');
        if (!Number.isSafeInteger(first) || first < 0 || !Number.isSafeInteger(count) || count < 1) {
            throw Error('Invalid PCM read window');
        }
        count = Math.max(0, Math.min(count, this.outputFrames - first));
        const chCount = this.format.channels;
        if (!count) return Array.from({ length: chCount }, () => new Float32Array(0));

        if (this.ratio === 1) {
            const channels = await this.readNativeWindow(first, first + count);
            if (channels[0].length >= count) {
                return channels.map(ch => ch.slice(0, count));
            }
            const padded = Array.from({ length: chCount }, () => new Float32Array(count));
            for (let c = 0; c < chCount; c++) {
                padded[c].set(channels[c].subarray(0, count), 0);
            }
            return padded;
        }

        const winStart = Math.max(0, Math.floor(first * this.ratio) - TAPS);
        const winEnd = Math.min(this.format.frames, Math.ceil((first + count) * this.ratio) + TAPS);
        const channels = await this.readNativeWindow(winStart, winEnd);
        return resamplePlanarChannels(channels, first, count, winStart, this.ratio, this.kernel);
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        try { this.activeAbort?.abort(); } catch (_) {}
        this.activeAbort = null;
        this.ring = [new Float32Array(0), new Float32Array(0)];
        void closeAndroidDirectPcm(this.format.sessionId);
    }
}
