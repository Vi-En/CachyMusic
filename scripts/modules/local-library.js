// CachyMusic - Standalone PWA Offline Persistence (IndexedDB + OPFS + FileSystemDirectoryHandle)
import { getRuntime } from './runtime-capabilities.js';

const DB_NAME = 'cachymusic_idb_v2';
const LEGACY_DB_NAME = 'cachymusic_idb_v1';
const DB_VERSION = 1;
const OPFS_DIR_NAME = 'cachymusic-audio';

function openPwaDb() {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            return reject(new Error('IndexedDB unavailable'));
        }
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('library')) db.createObjectStore('library', { keyPath: 'key' });
            if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles', { keyPath: 'key' });
            if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'plid' });
            if (!db.objectStoreNames.contains('overrides')) db.createObjectStore('overrides', { keyPath: 'trackKey' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
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

export async function writeFileToOpfs(fileKey, fileOrBlob) {
    const dir = await getOpfsRootDir();
    if (!dir || !fileOrBlob) return null;
    const safeKey = fileKey.replace(/[^A-Za-z0-9._-]/g, '_').slice(-180);
    try {
        const handle = await dir.getFileHandle(safeKey, { create: true });
        if (typeof handle.createWritable === 'function') {
            const writable = await handle.createWritable();
            await writable.write(fileOrBlob);
            await writable.close();
            return safeKey;
        }
    } catch (e) {
        console.warn('[OPFS] writeFileToOpfs failed, falling back to IDB blob:', e);
    }
    return null;
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
    if (!handle) return;
    try {
        const db = await openPwaDb();
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put({ key: 'active_dir', handle, savedAt: Date.now() });
    } catch (_) {}
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

export async function saveLibraryToLocalDb(tracks, directoryName) {
    try {
        const db = await openPwaDb();
        const storableTracks = [];
        for (const t of tracks) {
            const storable = {
                id: t.id,
                tid: t.tid || null,
                filename: t.filename,
                fullPath: t.fullPath,
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
                lyrics: t.lyrics || null,
                replayGain: t.replayGain ?? null,
                replayPeak: t.replayPeak ?? null,
                src: (t.src && !t.src.startsWith('blob:')) ? t.src : null,
                opfsKey: t.opfsKey || null,
                fileBlob: null
            };
            // Store Blob only if neither server stream nor OPFS key is present
            if (!storable.src && !storable.opfsKey && t._fileBlob) {
                const opfsKey = await writeFileToOpfs(t.fullPath || t.filename || t.id, t._fileBlob);
                if (opfsKey) {
                    storable.opfsKey = opfsKey;
                    t.opfsKey = opfsKey;
                } else {
                    storable.fileBlob = t._fileBlob;
                }
            }
            storableTracks.push(storable);
        }

        await new Promise((resolve, reject) => {
            const tx = db.transaction('library', 'readwrite');
            tx.objectStore('library').put({
                key: 'active_library',
                directoryName: directoryName || '',
                tracks: storableTracks,
                updatedAt: Date.now()
            });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn('[LocalLibrary] IndexedDB save skipped:', e);
    }
}

export async function loadLibraryFromLocalDb() {
    try {
        const db = await openPwaDb();
        const data = await new Promise((resolve) => {
            const tx = db.transaction('library', 'readonly');
            const req = tx.objectStore('library').get('active_library');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
        if (data && Array.isArray(data.tracks) && data.tracks.length > 0) {
            return await hydrateLocalTracks(data);
        }

        // Legacy v1 DB migration read
        const legacyDb = await openLegacyIdb();
        const legacyData = await new Promise((resolve) => {
            const tx = legacyDb.transaction('library', 'readonly');
            const req = tx.objectStore('library').get('active_library');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
        if (legacyData && Array.isArray(legacyData.tracks) && legacyData.tracks.length > 0) {
            return await hydrateLocalTracks(legacyData);
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
        let fileBlob = t.fileBlob || null;
        if (!src && t.opfsKey) {
            const opfsFile = await readFileFromOpfs(t.opfsKey);
            if (opfsFile) {
                fileBlob = opfsFile;
                src = URL.createObjectURL(opfsFile);
            }
        } else if (!src && fileBlob) {
            src = URL.createObjectURL(fileBlob);
        }
        // Only surface PHP stream tracks when PHP backend is active (or Android native/blob tracks)
        if (!src && t.src && t.src.includes('php/api/stream.php') && !rt.hasPhpBackend) {
            continue;
        }
        const key = String(t.tid || t.id || t.fullPath || t.filename);
        const ov = overrides.get(key);
        restored.push({
            ...t,
            ...(ov || {}),
            src: src || t.src || null,
            _fileBlob: fileBlob
        });
    }
    return restored.length > 0 ? { directoryName: data.directoryName || '', tracks: restored } : null;
}

export async function saveMetadataOverride(trackKey, fields) {
    if (!trackKey) return;
    try {
        const db = await openPwaDb();
        const tx = db.transaction('overrides', 'readwrite');
        tx.objectStore('overrides').put({ trackKey: String(trackKey), ...fields, updatedAt: Date.now() });
    } catch (_) {}
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

export async function saveLocalPlaylists(playlists) {
    try {
        const db = await openPwaDb();
        const tx = db.transaction('playlists', 'readwrite');
        const os = tx.objectStore('playlists');
        os.clear();
        for (const pl of playlists) {
            os.put(pl);
        }
    } catch (_) {}
}

export async function loadLocalPlaylists() {
    try {
        const db = await openPwaDb();
        return await new Promise((resolve) => {
            const tx = db.transaction('playlists', 'readonly');
            const req = tx.objectStore('playlists').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    } catch (_) {
        return [];
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
