// Track identity is not a filename. Legacy filename-only references are accepted
// only when unique; a strong identity must not silently select a different file.
const KEYS = ['fullPath', 'tid', 'id'];
const present = value => value !== undefined && value !== null && value !== '';
const localId = t => [t?.id, t?.tid].find(v => typeof v === 'string' && v.startsWith('local_'));
function identityKeys(t) {
    const local = localId(t);
    if (local) return [`local:${local}`];
    return KEYS.filter(k => present(t?.[k])).map(k => `${k}:${t[k]}`);
}
function uniqueIndex(pool, match) {
    let found = -1;
    for (let i = 0; i < pool.length; i++) {
        if (!match(pool[i])) continue;
        if (found !== -1) return -1;
        found = i;
    }
    return found;
}
export function findTrackIndex(pool, target) {
    if (!target || !pool?.length) return -1;
    const exact = pool.indexOf(target);
    if (exact >= 0) return exact;
    const local = localId(target);
    if (local) return uniqueIndex(pool, t => localId(t) === local);
    for (const key of KEYS) {
        if (!present(target[key])) continue;
        const match = uniqueIndex(pool, t => !localId(t) && present(t?.[key]) && String(t[key]) === String(target[key]) &&
            !KEYS.slice(0, KEYS.indexOf(key)).some(k => present(t[k]) && present(target[k]) && String(t[k]) !== String(target[k])));
        if (match >= 0) return match;
    }
    if (KEYS.some(key => present(target[key]))) return -1;
    return present(target.filename) ? uniqueIndex(pool, t => t?.filename === target.filename) : -1;
}
const PREFIX = 'cachymusic_last_track_';
const STORED_FIELDS = {tid:'tid', path:'fullPath', filename:'filename', id:'id', title:'title'};
export function rememberTrack(storage, track) {
    for (const [key, property] of Object.entries(STORED_FIELDS)) {
        if (present(track?.[property])) storage.setItem(PREFIX + key, String(track[property]));
        else storage.removeItem(PREFIX + key);
    }
    storage.removeItem(PREFIX + 'time');
}
export function findSavedTrackIndex(pool, storage) {
    const saved = Object.fromEntries(Object.entries(STORED_FIELDS).map(([key, prop]) => [prop, storage.getItem(PREFIX + key)]));
    const strong = findTrackIndex(pool, saved);
    if (strong >= 0 || KEYS.some(key => present(saved[key]))) return strong;
    for (const key of ['filename','title']) {
        if (!present(saved[key])) continue;
        const index = uniqueIndex(pool, t => present(t?.[key]) && String(t[key]).toLowerCase() === String(saved[key]).toLowerCase());
        if (index >= 0) return index;
    }
    return -1;
}

// Imports never use a filename as a deduplication key. Keep existing objects
// and their indices so the active transport and queue remain valid.
export function mergeTracks(existing, incoming, dismissed = () => false) {
    const result = [...existing];
    const objects = new Set(existing);
    const index = new Map();
    function add(track) {
        for (const key of identityKeys(track)) {
            if (!index.has(key)) index.set(key, []);
            index.get(key).push(track);
        }
    }
    existing.forEach(add);
    for (const track of incoming) {
        if (!track || dismissed(track) || objects.has(track)) continue;
        const candidates = [...new Set(identityKeys(track).flatMap(key => index.get(key) || []))];
        if (findTrackIndex(candidates, track) >= 0 && identityKeys(track).length) continue;
        result.push(track); objects.add(track); add(track);
    }
    return result;
}
export function dismissalKey(track) {
    const keys = identityKeys(track);
    if (keys.length) return keys[0];
    return track; // session-only object identity when no persistent key exists
}
