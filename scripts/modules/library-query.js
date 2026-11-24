const lossless = new Set(['flac', 'wav', 'alac', 'aiff', 'ape', 'wv', 'dsd', 'dsf']);
const lossy = new Set(['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma']);
const dsd = new Set(['dsd', 'dsf']);

function matchFormat(track, filter) {
    if (filter === 'hires') {
        return track.bitDepth >= 24 || track.sampleRate >= 88200 || dsd.has(track.format) || dsd.has(track.extension);
    }
    if (filter === 'lossless') return lossless.has(track.format) || lossless.has(track.extension);
    if (filter === 'lossy') return lossy.has(track.format) || lossy.has(track.extension);
    return true;
}

export function queryLibrary(records, { query, sort, formatFilter, playlist }) {
    const normalizedQuery = query.toLowerCase().trim();
    const byGenre = normalizedQuery.startsWith('genre:');
    const terms = (byGenre ? normalizedQuery.slice(6) : normalizedQuery).split(/\s+/).filter(Boolean);
    const matches = records.filter(track =>
        (!playlist || track.inCurrentPlaylist) && matchFormat(track, formatFilter)
        && terms.every(term => (byGenre ? track.genre : track.search).includes(term)));
    if (sort !== 'default') {
        const [field, order] = sort.split('-');
        if (['title', 'album', 'artist', 'duration', 'year'].includes(field)) {
            const direction = order === 'desc' ? -1 : 1;
            matches.sort((a, b) => {
                const value = typeof a[field] === 'number' ? a[field] - b[field] : a[field].localeCompare(b[field]);
                return direction * value || a.title.localeCompare(b.title);
            });
        }
    }
    return matches.map(track => track.index);
}
