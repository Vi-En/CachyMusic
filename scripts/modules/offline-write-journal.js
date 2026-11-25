// Only uncommitted, journaled copies are eligible for recovery. The lock is
// origin-wide; without Web Locks we deliberately do not reclaim abandoned files.
const LOCK = 'cachymusic-offline-library-v1';
const PREFIX = 'pending_audio:';
const KEY = /^audio-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function withOfflineWriteLock(run) {
    const locks = globalThis.navigator?.locks;
    if (!locks?.request) return run(false);
    return locks.request(LOCK, {mode:'exclusive'}, () => run(true));
}
export function pendingAudioRecord(key) {
    if (!KEY.test(key)) throw new Error('Invalid owned audio key');
    return {key:PREFIX+key, audioKey:key};
}
export function pendingAudioRecordKey(key) { return PREFIX+key; }
export function commitLibraryRecord(db, operation) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('library', 'readwrite');
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('Offline journal transaction failed'));
        try { operation(tx.objectStore('library')); }
        catch (error) { try { tx.abort(); } catch (_) {} reject(error); }
    });
}
// Caller must own the lock. A journal record is deleted atomically with the
// committed library reference, so a surviving marker cannot be a published copy.
// Additional reference checks defend against malformed/migrated records.
export async function recoverPendingAudio(db, remove, limit = 16) {
    const {library, tracks} = await new Promise((resolve,reject) => {
        const tx = db.transaction(['library','tracks'], 'readonly');
        const l = tx.objectStore('library').getAll(), t = tx.objectStore('tracks').getAll();
        tx.oncomplete = () => resolve({library:l.result, tracks:t.result});
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('Offline journal read failed'));
    });
    const refs = new Set(tracks.map(t=>t.opfsKey).filter(Boolean));
    for (const row of library) for (const t of row.tracks || []) if(t.opfsKey) refs.add(t.opfsKey);
    let attempted = 0, removed = 0;
    for (const record of library) {
        const key = record.audioKey;
        if (!KEY.test(key || '') || record.key !== PREFIX+key || refs.has(key)) continue;
        if (attempted++ >= limit) break;
        if (await remove(key)) {
            await commitLibraryRecord(db, store => store.delete(record.key));
            removed++;
        }
    }
    return removed;
}
