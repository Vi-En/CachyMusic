/**
 * Isolated IndexedDB persistence for user-created custom themes and background/texture assets.
 * Separate database (cachymusic_themes_v1) so music library upgrades never interfere with themes.
 */
import { safeStorage } from './utils.js';
import {
    buildPreloadSnapshot,
    validateAndNormalizeCustomTheme
} from './custom-theme-schema.js';

const THEME_DB_NAME = 'cachymusic_themes_v1';
const THEME_DB_VERSION = 1;
export const CUSTOM_SNAPSHOT_STORAGE_KEY = 'cachymusic_custom_theme_snapshot';

let activeThemeDb = null;
let openingThemeDb = null;
const objectUrlCache = new Map();

function closeThemeDb() {
    const db = activeThemeDb;
    activeThemeDb = null;
    if (db) {
        try { db.close(); } catch (_) {}
    }
}

export function revokeUnusedAssetUrls(keepIds = new Set()) {
    for (const [assetId, url] of objectUrlCache.entries()) {
        if (!keepIds.has(assetId)) {
            try { URL.revokeObjectURL(url); } catch (_) {}
            objectUrlCache.delete(assetId);
        }
    }
}

export function revokeAllAssetUrls() {
    for (const url of objectUrlCache.values()) {
        try { URL.revokeObjectURL(url); } catch (_) {}
    }
    objectUrlCache.clear();
}

if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
        revokeAllAssetUrls();
        closeThemeDb();
    });
}

function openThemeDb() {
    if (activeThemeDb) return Promise.resolve(activeThemeDb);
    if (openingThemeDb) return openingThemeDb;
    if (typeof window === 'undefined' || !window.indexedDB) {
        return Promise.reject(new Error('IndexedDB unavailable'));
    }
    openingThemeDb = new Promise((resolve, reject) => {
        const req = window.indexedDB.open(THEME_DB_NAME, THEME_DB_VERSION);
        req.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('themes')) {
                db.createObjectStore('themes', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('assets')) {
                db.createObjectStore('assets', { keyPath: 'id' });
            }
        };
        req.onsuccess = () => {
            const db = req.result;
            db.onversionchange = () => {
                db.close();
                if (activeThemeDb === db) activeThemeDb = null;
            };
            db.onclose = () => {
                if (activeThemeDb === db) activeThemeDb = null;
            };
            activeThemeDb = db;
            resolve(db);
        };
        req.onerror = () => reject(req.error || new Error('Failed to open custom theme store'));
    }).finally(() => {
        openingThemeDb = null;
    });
    return openingThemeDb;
}

export async function listCustomThemes() {
    try {
        const db = await openThemeDb();
        return await new Promise((resolve) => {
            const tx = db.transaction('themes', 'readonly');
            const req = tx.objectStore('themes').getAll();
            req.onsuccess = () => {
                const items = Array.isArray(req.result) ? req.result : [];
                resolve(items.map(validateAndNormalizeCustomTheme).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
            };
            req.onerror = () => resolve([]);
        });
    } catch (_) {
        return [];
    }
}

export async function getCustomTheme(id) {
    if (!id) return null;
    try {
        const db = await openThemeDb();
        return await new Promise((resolve) => {
            const tx = db.transaction('themes', 'readonly');
            const req = tx.objectStore('themes').get(id);
            req.onsuccess = () => resolve(req.result ? validateAndNormalizeCustomTheme(req.result) : null);
            req.onerror = () => resolve(null);
        });
    } catch (_) {
        return null;
    }
}

export async function saveCustomTheme(theme) {
    const clean = validateAndNormalizeCustomTheme({ ...theme, updatedAt: Date.now() });
    const db = await openThemeDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction('themes', 'readwrite');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Theme save failed'));
        tx.onabort = () => reject(tx.error || new Error('Theme save aborted'));
        tx.objectStore('themes').put(clean);
    });
    return clean;
}

export async function deleteCustomTheme(id) {
    if (!id) return false;
    const db = await openThemeDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction('themes', 'readwrite');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Theme delete failed'));
        tx.objectStore('themes').delete(id);
    });
    await pruneOrphanAssets().catch(() => {});
    return true;
}

export function generateThemeAssetId() {
    const rand = (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 14);
    return `asset_${rand}`;
}

export async function saveThemeAsset(id, blob, meta = {}) {
    if (!id || !(blob instanceof Blob)) throw new Error('Invalid theme asset');
    const db = await openThemeDb();
    const record = {
        id,
        blob,
        mime: blob.type || meta.mime || 'image/webp',
        width: Number(meta.width) || 0,
        height: Number(meta.height) || 0,
        palette: meta.palette || null,
        savedAt: Date.now()
    };
    await new Promise((resolve, reject) => {
        const tx = db.transaction('assets', 'readwrite');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Asset save failed'));
        tx.objectStore('assets').put(record);
    });
    if (objectUrlCache.has(id)) {
        try { URL.revokeObjectURL(objectUrlCache.get(id)); } catch (_) {}
        objectUrlCache.delete(id);
    }
    return record;
}

export async function getThemeAsset(id) {
    if (!id) return null;
    try {
        const db = await openThemeDb();
        return await new Promise((resolve) => {
            const tx = db.transaction('assets', 'readonly');
            const req = tx.objectStore('assets').get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (_) {
        return null;
    }
}

export async function deleteThemeAsset(id) {
    if (!id) return;
    if (objectUrlCache.has(id)) {
        try { URL.revokeObjectURL(objectUrlCache.get(id)); } catch (_) {}
        objectUrlCache.delete(id);
    }
    try {
        const db = await openThemeDb();
        await new Promise((resolve) => {
            const tx = db.transaction('assets', 'readwrite');
            tx.oncomplete = resolve;
            tx.onerror = resolve;
            tx.objectStore('assets').delete(id);
        });
    } catch (_) {}
}

export async function acquireAssetObjectUrl(id) {
    if (!id) return '';
    if (objectUrlCache.has(id)) return objectUrlCache.get(id);
    const rec = await getThemeAsset(id);
    if (!rec || !(rec.blob instanceof Blob)) return '';
    const url = URL.createObjectURL(rec.blob);
    objectUrlCache.set(id, url);
    return url;
}

export async function pruneOrphanAssets(extraProtectedIds = new Set()) {
    try {
        const themes = await listCustomThemes();
        const usedIds = new Set(extraProtectedIds);
        for (const t of themes) {
            for (const scope of ['canvas', 'panels', 'stage', 'chrome']) {
                const aid = t.backgrounds?.[scope]?.imageAssetId;
                if (aid) usedIds.add(aid);
            }
        }
        const db = await openThemeDb();
        const allKeys = await new Promise((resolve) => {
            const tx = db.transaction('assets', 'readonly');
            const req = tx.objectStore('assets').getAllKeys();
            req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
            req.onerror = () => resolve([]);
        });
        for (const key of allKeys) {
            if (!usedIds.has(key)) {
                await deleteThemeAsset(key);
            }
        }
        revokeUnusedAssetUrls(usedIds);
    } catch (_) {}
}

export async function blobToDataUrl(blob) {
    if (!(blob instanceof Blob)) return '';
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
        reader.readAsDataURL(blob);
    });
}

export async function dataUrlToBlob(dataUrl) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!match) throw new Error('Invalid image data URL');
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: match[1] });
}

export function saveCustomThemeSnapshot(theme) {
    try {
        const snapshot = buildPreloadSnapshot(theme);
        safeStorage.setItem(CUSTOM_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (_) {}
}

export function clearCustomThemeSnapshot() {
    try {
        safeStorage.removeItem(CUSTOM_SNAPSHOT_STORAGE_KEY);
    } catch (_) {}
}
