// Explicit, bounded, direct-to-provider requests. No analytics, proxy or automatic lookup.
const MAX_JSON = 1024 * 1024;
export const MAX_ART = 10 * 1024 * 1024;
export const MAX_LYRICS = 65536;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = s => String(s ?? '').trim().slice(0, 180);
const quoted = s => '"' + clean(s).replace(/[\\"]/g, '\\$&') + '"';
let lastMusicBrainz = 0;
export function lookupUrl(kind, fields) {
    const title = clean(fields.title), artist = clean(fields.artist), album = clean(fields.album);
    if (kind === 'metadata') {
        if (!title && !album) throw new Error('Enter a track title or album first.');
        const query = [title && `recording:${quoted(title)}`, artist && `artist:${quoted(artist)}`, album && `release:${quoted(album)}`].filter(Boolean).join(' AND ');
        return new URL('https://musicbrainz.org/ws/2/recording/?' + new URLSearchParams({query, fmt:'json', limit:'8'}));
    }
    if (kind === 'artwork') {
        if (!uuid.test(fields.releaseId || '')) throw new Error('Choose an identified release first.');
        return new URL(`https://coverartarchive.org/release/${fields.releaseId}/front-500`);
    }
    if (kind === 'lyrics') {
        if (!title || !artist) throw new Error('Enter the track title and artist first.');
        return new URL('https://lrclib.net/api/search?' + new URLSearchParams({track_name:title, artist_name:artist, ...(album ? {album_name:album} : {})}));
    }
    throw new Error('Unsupported provider');
}
export function isProviderResponse(url, kind) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
    if (kind === 'metadata') return u.hostname === 'musicbrainz.org' && u.pathname.startsWith('/ws/2/recording');
    if (kind === 'lyrics') return u.hostname === 'lrclib.net' && u.pathname === '/api/search';
    return u.hostname === 'coverartarchive.org' || u.hostname === 'archive.org' || u.hostname.endsWith('.archive.org');
}
async function readBounded(response, max) {
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
    if (Number(response.headers.get('content-length')) > max || !response.body) throw new Error('Response exceeds the supported size or cannot be streamed.');
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > max) { await reader.cancel(); throw new Error('Response exceeded the supported size.'); }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    return new Blob(chunks, {type: response.headers.get('content-type') || ''});
}
export async function requestProvider(kind, fields, signal, fetcher = fetch) {
    const url = lookupUrl(kind, fields);
    if (kind === 'metadata') {
        if (Date.now() - lastMusicBrainz < 1100) throw new Error('Please wait a moment before searching again.');
        lastMusicBrainz = Date.now();
    }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    signal?.addEventListener('abort', cancel, {once:true});
    const timer = setTimeout(cancel, 15000);
    try {
        const response = await fetcher(url.href, {method:'GET', credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store', redirect:kind === 'artwork' ? 'follow' : 'error', signal:controller.signal});
        if (!isProviderResponse(response.url, kind)) throw new Error('Unexpected provider response origin.');
        const blob = await readBounded(response, kind === 'artwork' ? MAX_ART : MAX_JSON);
        if (kind === 'artwork') return blob;
        if (!blob.type.toLowerCase().includes('json')) throw new Error('Expected a JSON response.');
        return JSON.parse(await blob.text());
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
export function metadataMatches(data) {
    const out = [];
    for (const r of (Array.isArray(data?.recordings) ? data.recordings : []).slice(0,8)) {
        for (const release of (Array.isArray(r?.releases) ? r.releases : []).slice(0,3)) {
            if (!uuid.test(release?.id || '')) continue;
            out.push({title:clean(r.title), artist:clean((Array.isArray(r['artist-credit']) ? r['artist-credit'] : []).map(a => (a?.name || '') + (a?.joinphrase || '')).join('')), album:clean(release.title), year:/^\d{4}/.test(release.date || '') ? release.date.slice(0,4) : '', releaseId:release.id, score:Number(r.score)||0});
        }
    }
    return out.slice(0,12);
}
export function lyricMatches(data) {
    return (Array.isArray(data) ? data : []).slice(0,10).map(r => ({title:clean(r?.trackName), artist:clean(r?.artistName), album:clean(r?.albumName), duration:Number(r?.duration)||0, lyrics:typeof r?.syncedLyrics === 'string' && r.syncedLyrics ? r.syncedLyrics : typeof r?.plainLyrics === 'string' ? r.plainLyrics : ''})).filter(r => r.lyrics && r.lyrics.length <= MAX_LYRICS);
}
