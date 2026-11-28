// CachyMusic - Standalone PWA Offline Persistence (IndexedDB + OPFS + FileSystemDirectoryHandle)
import { getRuntime } from './runtime-capabilities.js';
import { withOfflineWriteLock, pendingAudioRecord, pendingAudioRecordKey, commitLibraryRecord, recoverPendingAudio } from './offline-write-journal.js';

const DB_NAME = 'cachymusic_idb_v2';
const LEGACY_DB_NAME = 'cachymusic_idb_v1';
const DB_VERSION = 2;
const OPFS_DIR_NAME = 'cachymusic-audio';

let activePwaDb = null;
let openingPwaDb = null;
function closePwaDb() {
    const opened = activePwaDb;
    activePwaDb = null;
    if (opened) opened.close();
    // A pagehide can arrive before an asynchronous open completes.
    if (openingPwaDb) void openingPwaDb.then(db => {
        if (db !== opened) db.close();
        if (activePwaDb === db) activePwaDb = null;
    }).catch(() => {});
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', closePwaDb);

function openPwaDb() {
    if (activePwaDb) return Promise.resolve(activePwaDb);
    if (openingPwaDb) return openingPwaDb;
    if (typeof window === 'undefined' || !window.indexedDB) return Promise.reject(new Error('IndexedDB unavailable'));
    const operation = new Promise((resolve, reject) => {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('library')) db.createObjectStore('library', { keyPath: 'key' });
            if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles', { keyPath: 'key' });
            if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'plid' });
            if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', {keyPath:'storageKey'});
            if (!db.objectStoreNames.contains('artwork')) db.createObjectStore('artwork', {keyPath:'key'});
            if (!db.objectStoreNames.contains('overrides')) db.createObjectStore('overrides', { keyPath: 'trackKey' });
        };
        req.onsuccess = () => {
            const db = req.result;
            db.onversionchange = () => {
                // An incoming schema upgrade must not be blocked by our idle page.
                db.close();
                if (activePwaDb === db) activePwaDb = null;
            };
            db.onclose = () => { if (activePwaDb === db) activePwaDb = null; };
            activePwaDb = db;
            resolve(db);
        };
        req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
    openingPwaDb = operation;
    void operation.finally(() => {
        if (openingPwaDb === operation) openingPwaDb = null;
    }).catch(() => {});
    return operation;
}

function openLegacyIdb() {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) return reject(new Error('IndexedDB unavailable'));
        const req = window.indexedDB.open(LEGACY_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('library')) db.createObjectStore('library', { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getOpfsRootDir() {
    if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.getDirectory !== 'function') {
        return null;
    }
    try {
        const root = await navigator.storage.getDirectory();
        return await root.getDirectoryHandle(OPFS_DIR_NAME, { create: true });
    } catch (_) {
        return null;
    }
}

export async function writeFileToOpfs(fileKey, fileOrBlob, journal = null) {
    const dir = await getOpfsRootDir();
    if (!dir || !fileOrBlob) return null;
    // A fresh UUID avoids destructive collisions, including duplicate file names.
    if (!globalThis.crypto?.randomUUID) return null;
    const safeKey = 'audio-' + crypto.randomUUID();
    let writable = null;
    // Record ownership before creating a file; never create an unjournaled copy
    // when cross-tab recovery is enabled.
    if (journal) await commitLibraryRecord(journal, store => store.put(pendingAudioRecord(safeKey)));
    try {
        const handle = await dir.getFileHandle(safeKey, { create: true });
        if (typeof handle.createWritable !== 'function') throw new Error('OPFS writable stream unavailable');
        writable = await handle.createWritable();
        await writable.write(fileOrBlob);
        await writable.close();
        return safeKey;
    } catch (e) {
        // A partially created file is ours, not the user's source audio. Never
        // leave it occupying offline storage after a failed import.
        try { await writable?.abort?.(); } catch (_) {}
        if (await removeCreatedOpfsKey(safeKey) && journal) {
            await commitLibraryRecord(journal, store => store.delete(pendingAudioRecordKey(safeKey))).catch(() => {});
        }
        console.warn('[OPFS] writeFileToOpfs failed, falling back to IDB blob:', e);
        return null;
    }
}

async function removeCreatedOpfsKey(key) {
    if (!key || !key.startsWith('audio-')) return false;
    try {
        const dir = await getOpfsRootDir();
        if (!dir) return false;
        await dir.removeEntry(key);
        return true;
    } catch (error) { return error?.name === 'NotFoundError'; }
}

export async function readFileFromOpfs(opfsKey) {
    if (!opfsKey) return null;
    const dir = await getOpfsRootDir();
    if (!dir) return null;
    try {
        const handle = await dir.getFileHandle(opfsKey, { create: false });
        return await handle.getFile();
    } catch (_) {
        return null;
    }
}

export async function saveDirectoryHandle(handle) {
    if (!handle) return false;
    try {
        const db = await openPwaDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction('handles', 'readwrite');
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error || new Error('Directory handle save failed'));
            tx.onabort = () => reject(tx.error || new Error('Directory handle save aborted'));
            tx.objectStore('handles').put({ key: 'active_dir', handle, savedAt: Date.now() });
        });
        return true;
    } catch (error) {
        console.warn('[LocalLibrary] Directory access could not be persisted:', error);
        return false;
    }
}

export async function loadSavedDirectoryHandle() {
    try {
        const db = await openPwaDb();
        return await new Promise((resolve) => {
            const tx = db.transaction('handles', 'readonly');
            const req = tx.objectStore('handles').get('active_dir');
            req.onsuccess = () => resolve(req.result?.handle || null);
            req.onerror = () => resolve(null);
        });
    } catch (_) {
        return null;
    }
}

export async function clearSavedDirectoryHandle() {
    try {
        const db = await openPwaDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction('handles', 'readwrite');
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error || new Error('Directory handle clear failed'));
            tx.objectStore('handles').delete('active_dir');
        });
        return true;
    } catch (_) {
        return false;
    }
}

let librarySaveTail = Promise.resolve();
export function saveLibraryToLocalDb(tracks, directoryName) {
    const snapshot = [...tracks]; // Capture membership before waiting for older saves.
    const run = librarySaveTail.then(() => withOfflineWriteLock(locked => performLibrarySave(snapshot, directoryName, locked))).catch(error => {
        console.warn('[LocalLibrary] Offline write lock unavailable:', error);
        return false;
    });
    librarySaveTail = run.then(() => {}, () => {});
    return run;
}

async function performLibrarySave(tracks, directoryName, locked) {
    const newOpfsCopies = [];
    let db;
    try {
        db = await openPwaDb();
        if (locked) await recoverPendingAudio(db, removeCreatedOpfsKey).catch(error => console.warn('[LocalLibrary] Offline recovery deferred:', error));
        const storableTracks = [];
        for (const t of tracks) {
            const storable = {
                id: t.id,
                tid: t.tid || null,
                filename: t.filename,
                fullPath: t.fullPath,
                fileSize: t.fileSize ?? t._fileBlob?.size ?? t.fileBlob?.size,
                lastModified: t.lastModified ?? t._fileBlob?.lastModified ?? t.fileBlob?.lastModified,
                contentUri: t.contentUri || null,
                title: t.title,
                artist: t.artist,
                album: t.album,
                genre: t.genre,
                year: t.year,
                track: t.track,
                comment: t.comment || '',
                duration: t.duration,
                bitrate: t.bitrate,
                sampleRate: t.sampleRate,
                bitDepth: t.bitDepth,
                channels: t.channels,
                format: t.format,
                size: t.size,
                cover: t.cover,
                coverThumb:t.coverThumb || null,
                coverKey:t.coverKey || null,
                lyrics: t.lyrics || null,
                replayGain: t.replayGain ?? null,
                replayPeak: t.replayPeak ?? null,
                src: (t.src && !t.src.startsWith('blob:')) ? t.src : null,
                opfsKey: t.opfsKey || null,
                fileBlob: null
            };
            // Store Blob only if neither server stream nor OPFS key is present
            if (!storable.src && !storable.opfsKey && (t._fileBlob || t.fileBlob)) {
                const opfsKey = await writeFileToOpfs(t.fullPath || t.filename || t.id, t._fileBlob || t.fileBlob, locked ? db : null);
                if (opfsKey) {
                    storable.opfsKey = opfsKey;
                    newOpfsCopies.push({track:t,key:opfsKey});
                } else {
                    storable.fileBlob = t._fileBlob || t.fileBlob;
                }
            }
            storableTracks.push(storable);
        }

        await new Promise((resolve, reject) => {
            const tx=db.transaction(['library','tracks','artwork'],'readwrite');
            tx.oncomplete=resolve;
            // Wait for an actual abort, not a bubbling request error. A
            // synchronous put error must also abort the entire transaction.
            tx.onabort=()=>reject(tx.error || new Error('Library transaction aborted'));
            try {
                const records=tx.objectStore('tracks'), artwork=tx.objectStore('artwork');
                records.clear();artwork.clear();
                const seenArt=new Set();
                for(let i=0;i<storableTracks.length;i++) {
                    const t=storableTracks[i];
                    if(t.coverKey&&t.cover&&t.coverThumb){
                        if(!seenArt.has(t.coverKey)){artwork.put({key:t.coverKey,cover:t.cover,coverThumb:t.coverThumb});seenArt.add(t.coverKey);}
                        delete t.cover;delete t.coverThumb;
                    }
                    records.put({...t,storageKey:i});
                }
                tx.objectStore('library').put({key:'active_library_v2',directoryName:directoryName||'',count:storableTracks.length,updatedAt:Date.now()});
                if (locked) for (const {key} of newOpfsCopies) tx.objectStore('library').delete(pendingAudioRecordKey(key));
                // Preserve the previous-format record as a migration backup, never overwrite it.
            } catch (error) {
                tx.abort();
            }
        });
        for (const {track,key} of newOpfsCopies) track.opfsKey = key;
        return true;
    } catch (e) {
        // The DB transaction did not commit. Roll back only OPFS files created
        // by this attempt; preserve all pre-existing files and the old library.
        for (const {track,key} of newOpfsCopies) {
            if (!track.opfsKey) track.opfsKey = null;
            if (await removeCreatedOpfsKey(key) && locked && db) {
                await commitLibraryRecord(db, store => store.delete(pendingAudioRecordKey(key))).catch(() => {});
            }
        }
        console.warn('[LocalLibrary] IndexedDB save skipped:', e);
        return false;
    }
}

export async function loadLibraryFromLocalDb() {
    // Recovery is best-effort: a failed cleanup must not prevent playback.
    try { await withOfflineWriteLock(async locked => { if (locked) await recoverPendingAudio(await openPwaDb(), removeCreatedOpfsKey); }); }
    catch (error) { console.warn('[LocalLibrary] Offline recovery deferred:', error); }
    try {
        const db = await openPwaDb();
        const normalized=await new Promise((resolve,reject)=>{
            const tx=db.transaction(['library','tracks','artwork'],'readonly');
            const manifest=tx.objectStore('library').get('active_library_v2');
            const records=tx.objectStore('tracks').getAll();const art=tx.objectStore('artwork').getAll();
            tx.oncomplete=()=>{
                if(!manifest.result){resolve(null);return;}
                const map=new Map(art.result.map(a=>[a.key,a]));
                resolve({directoryName:manifest.result.directoryName,tracks:records.result.map(({storageKey,...t})=>({...t,...(map.has(t.coverKey)?{cover:map.get(t.coverKey).cover,coverThumb:map.get(t.coverKey).coverThumb}:{})}))});
            };tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
        });
        if(normalized)return hydrateLocalTracks(normalized);
        const data = await new Promise((resolve) => {
            const tx = db.transaction('library', 'readonly');
            const req = tx.objectStore('library').get('active_library');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
        if (data && Array.isArray(data.tracks) && data.tracks.length > 0) {
            const hydrated=await hydrateLocalTracks(data);
            // The old record remains untouched; failure leaves it available for the next launch.
            if(hydrated.tracks.length===data.tracks.length)await saveLibraryToLocalDb(hydrated.tracks, hydrated.directoryName);
            return hydrated;
        }

        // Legacy v1 DB migration read
        const legacyDb = await openLegacyIdb();
        let legacyData;
        try {
            legacyData = await new Promise((resolve) => {
                const tx = legacyDb.transaction('library', 'readonly');
                const req = tx.objectStore('library').get('active_library');
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } finally {
            legacyDb.close();
        }
        if (legacyData && Array.isArray(legacyData.tracks) && legacyData.tracks.length > 0) {
            const hydrated=await hydrateLocalTracks(legacyData);
            if(hydrated.tracks.length===legacyData.tracks.length)await saveLibraryToLocalDb(hydrated.tracks, hydrated.directoryName);
            return hydrated;
        }
        return null;
    } catch (_) {
        return null;
    }
}

async function hydrateLocalTracks(data) {
    const rt = getRuntime();
    const overrides = await loadAllMetadataOverrides();
    const restored = [];
    for (const t of data.tracks) {
        let src = t.src;
        if (src && !rt.hasPhpBackend && !rt.isAndroidNative && !/^(blob:|data:audio\/)/i.test(src)) src = null;
        if (src && !rt.hasPhpBackend && t.src.includes('php/api/stream.php')) src = null;
        // Do not open OPFS files or allocate object URLs until selected for playback.
        let fileBlob = t.fileBlob || null;
        // Do not restore unavailable backend tracks or request their old remote URLs.
        if (!src && !t.opfsKey && !fileBlob) continue;
        const key = String(t.tid || t.id || t.fullPath || t.filename);
        const ov = overrides.get(key);
        const restoredTrack = {...t, ...(ov || {})};
        if (!rt.hasPhpBackend && !rt.isAndroidNative && restoredTrack.cover && !/^(data:image\/|blob:|(?:\.\/)?resources\/images\/)/i.test(restoredTrack.cover)) {
            restoredTrack.cover = 'resources/images/default.svg';
        }
        restored.push({
            ...restoredTrack,
            src: src || null,
            _fileBlob: fileBlob
        });
    }
    return { directoryName: data.directoryName || '', directory: data.directoryName || '', tracks: restored };
}

export async function saveMetadataOverride(trackKey, fields) {
    if (!trackKey) return false;
    try {
        const db = await openPwaDb();
        await new Promise((resolve,reject)=>{
            const tx=db.transaction('overrides','readwrite'), object=tx.objectStore('overrides');
            const old=object.get(String(trackKey));
            old.onsuccess=()=>object.put({...old.result, trackKey:String(trackKey), ...fields, updatedAt:Date.now()});
            tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
        });
        return true;
    } catch (_) {return false;}
}

export async function loadAllMetadataOverrides() {
    const map = new Map();
    try {
        const db = await openPwaDb();
        const rows = await new Promise((resolve) => {
            const tx = db.transaction('overrides', 'readonly');
            const req = tx.objectStore('overrides').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
        for (const r of rows) {
            const { trackKey, updatedAt, ...fields } = r;
            map.set(trackKey, fields);
        }
    } catch (_) {}
    return map;
}

// Read and compare inside the same readwrite transaction as the mutation.
// IndexedDB serializes overlapping write transactions across tabs.
export async function mutateLocalPlaylist(expected, next) {
    const id = next?.plid ?? expected?.plid;
    if (!String(id || '').startsWith('local_pl_') || (expected && next && expected.plid !== next.plid)) return false;
    const snapshot = p => JSON.stringify([String(p.plid), p.name, (p.tracks || []).map(String), Number(p.revision || 0)]);
    try {
        const db = await openPwaDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('playlists','readwrite');
            const os = tx.objectStore('playlists');
            let accepted = false;
            tx.oncomplete = () => resolve(accepted);
            tx.onerror = tx.onabort = () => reject(tx.error || Error('Playlist transaction failed'));
            const request = os.getAll();
            request.onsuccess = () => {
                const records = request.result || [];
                const actual = records.find(p => String(p.plid) === String(id));
                if (expected ? !actual || snapshot(actual) !== snapshot(expected) : Boolean(actual)) return;
                if (next && records.some(p => String(p.plid).startsWith('local_pl_') && String(p.plid) !== String(id) && String(p.name).toLowerCase() === String(next.name).toLowerCase())) return;
                if (next) os.put(next); else os.delete(id);
                accepted = true;
            };
        });
    } catch (error) { console.warn('[LocalLibrary] Playlist mutation failed:',error); return false; }
}

export async function loadLocalPlaylists(failureValue = []) {
    try {
        const db = await openPwaDb();
        return await new Promise((resolve) => {
            const tx = db.transaction('playlists', 'readonly');
            const req = tx.objectStore('playlists').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve(failureValue);
        });
    } catch (_) {
        return failureValue;
    }
}

export async function collectAudioFilesFromDirectoryHandle(dirHandle, prefix = '') {
    const AUDIO_EXT_RE = /\.(mp3|flac|wav|ogg|m4a|aac|opus|webm|alac|aiff)$/i;
    const files = [];
    for await (const [name, entry] of dirHandle.entries()) {
        const rel = prefix ? `${prefix}/${name}` : name;
        if (entry.kind === 'file') {
            if (AUDIO_EXT_RE.test(name)) {
                const file = await entry.getFile();
                files.push({ file, relativePath: rel, fileHandle: entry });
            }
        } else if (entry.kind === 'directory') {
            const sub = await collectAudioFilesFromDirectoryHandle(entry, rel);
            files.push(...sub);
        }
    }
    return files;
}
