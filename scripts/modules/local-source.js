// Lazy track source resolution. Only selected audio receives object URLs.
import { readFileFromOpfs } from './local-library.js';
const owned = new Map();
export async function resolveLocalFile(track) {
    return track?._fileBlob || track?.fileBlob || (track?.opfsKey ? await readFileFromOpfs(track.opfsKey) : null);
}
export async function resolveTrackSource(track) {
    if (!track) return '';
    if (track.src) return track.src;
    const file = await resolveLocalFile(track);
    if (!file) return '';
    if (track.src) return track.src;
    const url=URL.createObjectURL(file);owned.set(url,track);track.src=url;return url;
}
// Call only after media elements have switched away from the released URLs.
export function releaseInactiveSources(...keep) {
    const retained=new Set(keep.filter(Boolean));
    for (const [url,track] of owned) {
        if(retained.has(url)) continue;
        URL.revokeObjectURL(url);if(track.src===url)track.src=null;owned.delete(url);
    }
}
