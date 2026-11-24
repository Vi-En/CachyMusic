// Peer metadata is not proof of decoded file quality. Never infer technical
// specifications from a filename, a format extension or a CD-audio default.
function positiveNumber(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}
export function peerBitrate(item) {
    const value = positiveNumber(item?.bitrate);
    if (value !== null) return {value, estimated: item.bitrateSource === 'estimated', provenance: item.bitrateSource || 'unspecified'};
    const size = positiveNumber(item?.size), duration = positiveNumber(item?.duration);
    const calculated = size !== null && duration !== null ? Math.round(size * 8 / (duration * 1000)) : 0;
    return calculated > 0 && calculated <= 9216 ? {value: calculated, estimated: true, provenance: 'estimated'} : {value: null, estimated: false, provenance: 'unknown'};
}
export function describePeerAudio(item) {
    const bitrate = peerBitrate(item);
    const rate = positiveNumber(item?.sampleRate), depth = positiveNumber(item?.bitDepth);
    const sample = rate !== null ? `${Number((rate / 1000).toFixed(3))} kHz` : '';
    return {bitrate: bitrate.value === null ? 'Not reported' : `${bitrate.estimated ? '≈ ' : ''}${bitrate.value} kbps`,
        bitrateTitle: bitrate.provenance === 'reported' ? 'Reported by peer; not verified against file contents' : bitrate.estimated ? 'Estimated from file size and duration; includes container overhead' : bitrate.value !== null ? 'Source did not specify how this value was obtained' : 'Bitrate not reported',
        sample: [depth !== null ? `${depth}-bit` : '', sample].filter(Boolean).join(' / ')};
}
// Unknown rates always sort last, in either direction.
export function comparePeerBitrate(a, b, direction) {
    const x = peerBitrate(a).value, y = peerBitrate(b).value;
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    return direction * (x - y);
}
