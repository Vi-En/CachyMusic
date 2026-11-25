// Browser decoder compatibility for FLAC files with prepended ID3 tags.
export function stripId3ToFlacMagic(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 16) return null;
    const bytes = new Uint8Array(arrayBuffer);
    // Only scan when file begins with ID3v2 header ('I','D','3')
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;
    // Syncsafe ID3v2 tag size + 10-byte header
    let startOffset = 10 + ((bytes[6] & 0x7f) << 21) + ((bytes[7] & 0x7f) << 14) + ((bytes[8] & 0x7f) << 7) + (bytes[9] & 0x7f);
    if (startOffset + 4 <= bytes.length
        && bytes[startOffset] === 0x66 && bytes[startOffset + 1] === 0x4c
        && bytes[startOffset + 2] === 0x61 && bytes[startOffset + 3] === 0x43) {
        return arrayBuffer.slice(startOffset);
    }
    const scanLimit = Math.min(bytes.length - 4, 262144);
    for (let i = 10; i < scanLimit; i++) {
        if (bytes[i] === 0x66 && bytes[i + 1] === 0x4c && bytes[i + 2] === 0x61 && bytes[i + 3] === 0x43) {
            return arrayBuffer.slice(i);
        }
    }
    return null;
}

export async function decodeBufferWithAudioContext(ctx, rawArrayBuf, onStrip = () => {}) {
    const attemptDecode = (buf) => new Promise((resolve, reject) => {
        const p = ctx.decodeAudioData(
            buf,
            decoded => resolve(decoded),
            err => reject(err || new Error('decodeAudioData callback returned error'))
        );
        if (p && typeof p.then === 'function') {
            p.then(resolve, reject);
        }
    });
    const head = rawArrayBuf && rawArrayBuf.byteLength >= 16 ? new Uint8Array(rawArrayBuf, 0, 3) : null;
    const hasId3Header = Boolean(head && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33);
    if (hasId3Header) {
        const stripped = stripId3ToFlacMagic(rawArrayBuf);
        if (stripped) {
            onStrip();
            return await attemptDecode(stripped);
        }
    }
    // Zero-copy decode avoids duplicating large 50-90MB FLAC ArrayBuffers on 4GB devices
    return await attemptDecode(rawArrayBuf);
}

