// CachyMusic - Music Library, Virtual Scroller, Playlists, Queue & Metadata Editor
import {
    escapeHtml,
    formatTime,
    popModalState,
    pushModalState,
    safeStorage,
    setScanStatus,
    showToast
} from './utils.js';
import { store } from './state.js';
import {
    activeListLabel,
    albumName,
    artistName,
    browseFolderBtn,
    coverArtPreview,
    currentPlaylistTitle,
    folderPathInput,
    hideTrackLoadingOverlay,
    libraryControls,
    lyricsArtistName,
    lyricsTrackName,
    miniArtist,
    miniTitle,
    modalNewPlaylistName,
    modalPlaylistList,
    modalTrackTitle,
    playlistBanner,
    playlistList,
    playlistModal,
    playlistsView,
    queueCountBadge,
    queueCountSummary,
    queueList,
    queueView,
    restoreTracksBtn,
    showTrackLoadingOverlay,
    statAlbum,
    statArtist,
    statBitDepth,
    statBitrate,
    statChannels,
    statFormat,
    statGenre,
    statPath,
    statSampleRate,
    statSize,
    statTitle,
    statTrack,
    statYear,
    switchWorkspace,
    tabLibrary,
    tabPlaylists,
    tabQueue,
    trackCount,
    trackList,
    trackName,
    upcomingLibraryList,
    updateEmptyPlayerState,
    updateTrackLoadingOverlay
} from './ui-elements.js';
import { updateLyricsDisplay } from './lyrics.js';
import { updateAmbientLighting } from './themes.js';
import { loadTrack, pauseAudio } from './player-core.js';
import { normalizeGenre, parseAudioFileMetadata } from './tag-parser.js';
import {
    collectAudioFilesFromDirectoryHandle,
    loadAllMetadataOverrides,
    loadLibraryFromLocalDb,
    loadLocalPlaylists,
    loadSavedDirectoryHandle,
    saveDirectoryHandle,
    saveLibraryToLocalDb,
    saveLocalPlaylists,
    saveMetadataOverride
} from './local-library.js';
import { getRuntime } from './runtime-capabilities.js';
import { mediaSessionController } from './media-session.js';

const AUDIO_EXT_RE = /\.(mp3|flac|wav|ogg|m4a|aac|opus|webm|alac|aiff)$/i;

function getTrackKey(track) {
    if (!track) return '';
    return String(track.tid || track.id || track.fullPath || track.filename || '');
}

function stableHashKey(input) {
    let h = 2166136261 >>> 0;
    const str = String(input || '');
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return `local_${h.toString(36)}`;
}

async function importLocalAudioFiles(rawFiles, dirLabel = 'Local Music', autoSelect = true) {
    const s = store.state;
    const items = [];
    for (const entry of Array.from(rawFiles || [])) {
        if (entry instanceof File) {
            if (AUDIO_EXT_RE.test(entry.name) || (entry.type && entry.type.startsWith('audio/'))) {
                items.push({ file: entry, relativePath: entry.webkitRelativePath || entry.name });
            }
        } else if (entry && entry.file instanceof File) {
            if (AUDIO_EXT_RE.test(entry.file.name) || (entry.file.type && entry.file.type.startsWith('audio/'))) {
                items.push({ file: entry.file, relativePath: entry.relativePath || entry.file.name });
            }
        }
    }

    if (items.length === 0) {
        setScanStatus('No supported audio files selected (.flac, .mp3, .wav, .m4a, .ogg, .opus, .aiff).', true);
        updateEmptyPlayerState();
        return [];
    }

    showTrackLoadingOverlay('IMPORTING AUDIO FILES...', `Indexing ${items.length} local audio file${items.length === 1 ? '' : 's'}...`, 0, items.length);
    setScanStatus(`Parsing metadata for ${items.length} audio file${items.length === 1 ? '' : 's'}...`, false);

    const overrides = await loadAllMetadataOverrides();
    const parsedTracks = [];
    for (let i = 0; i < items.length; i++) {
        if (s.isTrackLoadingCancelled) break;
        const { file, relativePath } = items[i];
        try {
            const meta = await parseAudioFileMetadata(file);
            const rel = relativePath || file.webkitRelativePath || file.name;
            const localId = stableHashKey(`${rel}:${file.size}:${file.lastModified}`);
            const ov = overrides.get(localId) || {};
            const track = {
                ...meta,
                id: localId,
                tid: localId,
                filename: file.name,
                fullPath: rel,
                src: URL.createObjectURL(file),
                _fileBlob: file,
                ...ov
            };
            parsedTracks.push(track);
        } catch (err) {
            console.warn('[LocalImport] Skipped file:', file?.name, err);
        }
        if ((i + 1) % 8 === 0 || i + 1 === items.length) {
            updateTrackLoadingOverlay(i + 1, items.length, `Parsed ${i + 1} / ${items.length}: ${file.name}`);
        }
    }

    hideTrackLoadingOverlay();
    if (parsedTracks.length === 0) {
        updateEmptyPlayerState();
        return [];
    }

    s.allTracks = s.dismissedTracksMap.size > 0
        ? parsedTracks.filter(t => !s.dismissedTracksMap.has(t.fullPath || t.filename || t.id))
        : parsedTracks;

    const label = dirLabel || 'Local Music';
    if (folderPathInput) folderPathInput.value = label;
    const settingsInput = document.getElementById('settingsTabFolderPathInput');
    if (settingsInput) settingsInput.value = label;

    try {
        safeStorage.setItem('cachymusic_last_directory', label);
        safeStorage.setItem('cachymusic_directory_mode', 'local');
    } catch (_) {}

    await saveLibraryToLocalDb(s.allTracks, label);
    setScanStatus(`Loaded ${s.allTracks.length} track${s.allTracks.length === 1 ? '' : 's'} from ${label}`, false);
    updateEmptyPlayerState();
    applySearchAndSort();

    if (autoSelect && s.allTracks.length > 0) {
        loadTrack(0, false);
        if (s.isLyricsView) updateLyricsDisplay(s.allTracks[0]);
    }
    return s.allTracks;
}

async function promptLocalDirectoryOrFiles() {
    if (typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function') {
        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
            await saveDirectoryHandle(dirHandle);
            showTrackLoadingOverlay('SCANNING LOCAL FOLDER...', `Reading "${dirHandle.name}"...`);
            const files = await collectAudioFilesFromDirectoryHandle(dirHandle);
            return await importLocalAudioFiles(files, dirHandle.name, true);
        } catch (err) {
            hideTrackLoadingOverlay();
            if (err && err.name === 'AbortError') return [];
        }
    }

    const mobileInput = document.getElementById('mobileAudioFilesInput');
    const folderInput = document.getElementById('folderPickerInput');
    const targetInput = mobileInput || folderInput;
    if (targetInput) {
        targetInput.click();
    } else {
        showToast('Use Choose Music Files to select local audio tracks.');
    }
    return [];
}

async function scanDirectory(path, autoSelectTrack = true, isSilentBoot = false) {
    const s = store.state;
    const rt = getRuntime();
    const cleanPath = (path || '').trim();
    let errorNotice = '';

    // Standalone PWA / Static Host / Offline mode: never call php/api/scan.php
    if (!rt.hasPhpBackend) {
        if (cleanPath === '__picker__') {
            return await promptLocalDirectoryOrFiles();
        }
        if (!isSilentBoot) {
            showTrackLoadingOverlay('RESTORING OFFLINE LIBRARY...', 'Loading cached local audio library...');
        }
        try {
            const cached = await loadLibraryFromLocalDb();
            if (cached && Array.isArray(cached.tracks) && cached.tracks.length > 0) {
                s.allTracks = s.dismissedTracksMap.size > 0
                    ? cached.tracks.filter(t => !s.dismissedTracksMap.has(t.fullPath || t.filename || t.id))
                    : cached.tracks;
                const label = cached.directoryName || 'Local Library';
                if (folderPathInput) folderPathInput.value = label;
                const settingsInput = document.getElementById('settingsTabFolderPathInput');
                if (settingsInput) settingsInput.value = label;
                setScanStatus(`Loaded ${s.allTracks.length} cached local track${s.allTracks.length === 1 ? '' : 's'}`, false);
            } else {
                // Check saved DirectoryHandle permission silently on boot
                const handle = await loadSavedDirectoryHandle();
                if (handle && typeof handle.queryPermission === 'function') {
                    const perm = await handle.queryPermission({ mode: 'read' }).catch(() => 'denied');
                    if (perm === 'granted') {
                        const files = await collectAudioFilesFromDirectoryHandle(handle);
                        if (files.length > 0) {
                            hideTrackLoadingOverlay();
                            await importLocalAudioFiles(files, handle.name, autoSelectTrack);
                            return;
                        }
                    }
                }
                setScanStatus('Standalone Mode Ready — Choose local folder or audio files to build your library.', false);
            }
        } catch (err) {
            console.warn('[StandaloneScan] Offline library restore warning:', err);
        } finally {
            hideTrackLoadingOverlay();
        }

        updateEmptyPlayerState('');
        applySearchAndSort();
        if (s.allTracks.length > 0 && autoSelectTrack) {
            const urlParams = new URLSearchParams(window.location.search);
            const reqTrack = urlParams.get('track');
            let targetIdx = 0;
            if (reqTrack !== null && !isNaN(parseInt(reqTrack, 10)) && s.allTracks[parseInt(reqTrack, 10)]) {
                targetIdx = parseInt(reqTrack, 10);
            } else if (s.currentTrackIndex >= 0 && s.allTracks[s.currentTrackIndex]) {
                targetIdx = s.currentTrackIndex;
            }
            loadTrack(targetIdx, false);
            if (s.isLyricsView) updateLyricsDisplay(s.allTracks[targetIdx]);
        }
        return;
    }

    // PHP Desktop / LAN Server Scan
    if (!isSilentBoot) {
        showTrackLoadingOverlay(
            'LOADING MUSIC LIBRARY...',
            cleanPath ? `Scanning "${cleanPath}" and indexing track metadata...` : 'Checking saved music directory...'
        );
    }
    setScanStatus(cleanPath ? `Scanning "${cleanPath}"...` : 'Checking saved music directory...', false);

    if (s.activeScanAbortController) {
        try { s.activeScanAbortController.abort(); } catch (_) {}
    }
    s.activeScanAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

    try {
        const endpoint = cleanPath ? `php/api/scan.php?directory=${encodeURIComponent(cleanPath)}` : 'php/api/scan.php';
        const res = await fetch(endpoint, s.activeScanAbortController ? { signal: s.activeScanAbortController.signal } : {});
        if (s.isTrackLoadingCancelled) {
            hideTrackLoadingOverlay();
            return;
        }
        if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.tracks) && data.tracks.length > 0) {
                s.allTracks = s.dismissedTracksMap.size > 0
                    ? data.tracks.filter(t => !s.dismissedTracksMap.has(t.fullPath || t.filename || t.id))
                    : data.tracks;
                const activeDir = data.directory || cleanPath;
                if (folderPathInput) folderPathInput.value = activeDir;
                const settingsTabFolderPathInput = document.getElementById('settingsTabFolderPathInput');
                if (settingsTabFolderPathInput) settingsTabFolderPathInput.value = activeDir;
                if (activeDir) {
                    try {
                        safeStorage.setItem('cachymusic_last_directory', activeDir);
                        safeStorage.setItem('cachymusic_directory_mode', 'server');
                    } catch (_) {}
                }
                await saveLibraryToLocalDb(s.allTracks, activeDir);
                setScanStatus(`Scanned ${data.count} audio tracks from ${activeDir}`, false);
            } else if (data.needsDirectory) {
                setScanStatus('No music directory selected yet. Choose a directory to load tracks.', false);
            } else if (!data.success) {
                errorNotice = data.message || 'Directory scan failed.';
                setScanStatus(`${errorNotice} Please configure the directory manually in Settings → Library & Folders.`, true);
            } else {
                errorNotice = cleanPath ? `No supported audio files found in "${cleanPath}".` : '';
                setScanStatus(
                    cleanPath
                        ? `No supported audio files found in "${cleanPath}". Please configure your folder manually in Settings → Library & Folders.`
                        : 'Choose a music directory to load tracks.',
                    Boolean(cleanPath)
                );
            }
        } else {
            errorNotice = `Could not read directory (HTTP ${res.status}).`;
            setScanStatus(`${errorNotice} Please configure it manually in Settings → Library & Folders.`, true);
        }
    } catch (err) {
        if (err && err.name === 'AbortError') {
            hideTrackLoadingOverlay();
            return;
        }
        console.warn('Scan API error:', err);
        if (!isSilentBoot) {
            errorNotice = 'Unable to scan directory.';
            setScanStatus('Unable to scan directory. Please configure it manually in Settings → Library & Folders.', true);
        }
    } finally {
        hideTrackLoadingOverlay();
    }

    updateEmptyPlayerState(errorNotice);
    applySearchAndSort();
    if (s.allTracks.length > 0 && autoSelectTrack) {
        let targetIdx = 0;
        const urlParams = new URLSearchParams(window.location.search);
        const reqTrack = urlParams.get('track');
        if (reqTrack !== null && !isNaN(parseInt(reqTrack, 10)) && s.allTracks[parseInt(reqTrack, 10)]) {
            targetIdx = parseInt(reqTrack, 10);
        } else if (s.currentTrackIndex >= 0 && s.allTracks[s.currentTrackIndex]) {
            targetIdx = s.currentTrackIndex;
        }
        loadTrack(targetIdx, false);
        if (s.isLyricsView) {
            updateLyricsDisplay(s.allTracks[targetIdx]);
        }
    }
}

// =========================================================================
// Unified Playlist Persistence (PHP Server OR Offline IndexedDB)
// =========================================================================
async function loadPlaylists() {
    const s = store.state;
    const rt = getRuntime();

    if (rt.hasPhpBackend) {
        try {
            const res = await fetch('php/api/playlists.php');
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.playlists)) {
                    s.playlists = data.playlists;
                    try { safeStorage.setItem('cachymusic_cached_playlists', JSON.stringify(s.playlists)); } catch (_) {}
                    await saveLocalPlaylists(s.playlists);
                    renderPlaylistsView();
                    return s.playlists;
                }
            }
        } catch (e) {
            console.warn('Could not load playlists from backend, falling back to local DB:', e);
        }
    }

    const localPls = await loadLocalPlaylists();
    if (Array.isArray(localPls) && localPls.length > 0) {
        s.playlists = localPls;
        renderPlaylistsView();
        return s.playlists;
    }
    try {
        const cached = JSON.parse(safeStorage.getItem('cachymusic_cached_playlists') || '[]');
        if (Array.isArray(cached) && cached.length > 0) {
            s.playlists = cached;
        }
    } catch (_) {}
    renderPlaylistsView();
    return s.playlists;
}

async function createPlaylist(name) {
    const s = store.state;
    const cleanName = (name || '').trim();
    if (!cleanName) return null;

    if (getRuntime().hasPhpBackend) {
        try {
            const res = await fetch('php/api/playlists.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', name: cleanName })
            });
            const data = await res.json();
            if (data.success && data.playlist) {
                await loadPlaylists();
                return data.playlist;
            }
            if (data.message) showToast(data.message);
            return null;
        } catch (err) {
            console.warn('Create playlist PHP error, falling back to local:', err);
        }
    }

    const exists = s.playlists.some(p => (p.name || '').toLowerCase() === cleanName.toLowerCase());
    if (exists) {
        showToast(`Playlist "${cleanName}" already exists.`);
        return null;
    }
    const newPl = {
        plid: `local_pl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        tracks: [],
        track_count: 0
    };
    s.playlists.push(newPl);
    await saveLocalPlaylists(s.playlists);
    try { safeStorage.setItem('cachymusic_cached_playlists', JSON.stringify(s.playlists)); } catch (_) {}
    renderPlaylistsView();
    return newPl;
}

function getTrackSearchString(t) {
    if (t._searchStr !== undefined) return t._searchStr;
    const title = t.title || '';
    const artist = t.artist || '';
    const album = t.album || '';
    const rawGenre = t.genre || '';
    const normGenre = normalizeGenre(rawGenre);
    const genrePart = normGenre ? (rawGenre.toLowerCase() !== normGenre.toLowerCase() ? `${rawGenre} ${normGenre}` : rawGenre) : rawGenre;
    const filename = t.filename || '';
    t._searchStr = `${title} ${artist} ${album} ${genrePart} ${filename}`.toLowerCase();
    return t._searchStr;
}

// Search and Sort Engine with Dedicated Web Worker Offloading
let libraryWorker = null;
let libraryWorkerRequestId = 0;

function getLibraryWorker() {
    const s = store.state;
    if (!libraryWorker && typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
        try {
            const workerCode = `
                self.onmessage = function(e) {
                    const { requestId, tracks, query, sort, formatFilter, currentPlaylistId } = e.data;
                    let pool = tracks.slice();

                    if (currentPlaylistId !== null) {
                        pool = pool.filter(t => t.inCurrentPlaylist);
                    }

                    if (formatFilter && formatFilter !== 'all') {
                        pool = pool.filter(t => {
                            const fmt = (t.format || '').toLowerCase();
                            const ext = (t.filename || '').split('.').pop().toLowerCase();
                            const bd = t.bitDepth || ((t.sampleRate && t.sampleRate >= 88200) ? 24 : 16);
                            const sr = t.sampleRate || 0;

                            if (formatFilter === 'hires') {
                                return (bd >= 24) || (sr >= 88200) || ['dsd', 'dsf'].includes(fmt) || ['dsd', 'dsf'].includes(ext);
                            } else if (formatFilter === 'lossless') {
                                return ['flac', 'wav', 'alac', 'aiff', 'ape', 'wv', 'dsd', 'dsf'].includes(fmt) ||
                                       ['flac', 'wav', 'alac', 'aiff', 'ape', 'wv'].includes(ext);
                            } else if (formatFilter === 'lossy') {
                                return ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma'].includes(fmt) ||
                                       ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wma'].includes(ext);
                            }
                            return true;
                        });
                    }

                    if (query && query.trim() !== '') {
                        const rawQ = query.toLowerCase().trim();
                        const isGenre = rawQ.startsWith('genre:');
                        const q = isGenre ? rawQ.slice(6).trim() : rawQ;
                        const words = q.split(/\\s+/).filter(Boolean);

                        pool = pool.filter(t => {
                            if (isGenre) {
                                const g = (t.genre || '').toLowerCase();
                                return words.every(w => g.includes(w));
                            }
                            const str = (t.searchStr || '').toLowerCase();
                            return words.every(w => str.includes(w));
                        });
                    }

                    switch (sort) {
                        case 'title-asc':
                            pool.sort((a, b) => (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                            break;
                        case 'title-desc':
                            pool.sort((a, b) => (b.title || b.filename || '').localeCompare(a.title || a.filename || ''));
                            break;
                        case 'artist-asc':
                            pool.sort((a, b) => (a.artist || 'Unknown').localeCompare(b.artist || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                            break;
                        case 'artist-desc':
                            pool.sort((a, b) => (b.artist || 'Unknown').localeCompare(a.artist || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                            break;
                        case 'album-asc':
                            pool.sort((a, b) => (a.album || 'Unknown').localeCompare(b.album || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                            break;
                        case 'album-desc':
                            pool.sort((a, b) => (b.album || 'Unknown').localeCompare(a.album || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                            break;
                        case 'duration-asc':
                            pool.sort((a, b) => (a.duration || 0) - (b.duration || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                            break;
                        case 'duration-desc':
                            pool.sort((a, b) => (b.duration || 0) - (a.duration || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                            break;
                        case 'year-desc':
                            pool.sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                            break;
                        case 'year-asc':
                            pool.sort((a, b) => (parseInt(a.year, 10) || 0) - (parseInt(b.year, 10) || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
                            break;
                        case 'default':
                        default:
                            break;
                    }

                    const resultIndices = pool.map(t => t.origIdx);
                    self.postMessage({ requestId, resultIndices });
                };
            `;
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            libraryWorker = new Worker(URL.createObjectURL(blob));
            libraryWorker.onmessage = function(e) {
                if (e.data && e.data.requestId === libraryWorkerRequestId) {
                    const indices = e.data.resultIndices;
                    s.displayedTracks = indices.map(i => s.allTracks[i]).filter(Boolean);
                    renderTrackList();
                }
            };
        } catch (e) {
            console.warn('Worker creation failed, falling back to sync search', e);
            libraryWorker = null;
        }
    }
    return libraryWorker;
}

function applySearchAndSort() {
    const s = store.state;
    const worker = getLibraryWorker();
    if (worker && s.allTracks.length > 200) {
        const reqId = ++libraryWorkerRequestId;
        const lightweightTracks = s.allTracks.map((t, idx) => ({
            origIdx: idx,
            title: t.title,
            artist: t.artist,
            album: t.album,
            genre: normalizeGenre(t.genre) || t.genre,
            filename: t.filename,
            format: t.format,
            bitDepth: t.bitDepth,
            sampleRate: t.sampleRate,
            duration: t.duration,
            year: t.year,
            inCurrentPlaylist: Boolean(t.inCurrentPlaylist),
            searchStr: getTrackSearchString(t)
        }));
        worker.postMessage({
            requestId: reqId,
            tracks: lightweightTracks,
            query: s.searchQuery,
            sort: s.currentSort,
            formatFilter: s.currentFormatFilter,
            currentPlaylistId: s.currentPlaylistId
        });
        return;
    }

    let pool = [...s.allTracks];

    if (s.currentPlaylistId !== null) {
        pool = pool.filter(t => t.inCurrentPlaylist);
    }

    if (s.currentFormatFilter && s.currentFormatFilter !== 'all') {
        pool = pool.filter(t => {
            const fmt = (t.format || '').toLowerCase();
            const ext = (t.filename || '').split('.').pop().toLowerCase();
            const bd = t.bitDepth || ((t.sampleRate && t.sampleRate >= 88200) ? 24 : 16);
            const sr = t.sampleRate || 0;

            if (s.currentFormatFilter === 'hires') {
                return (bd >= 24) || (sr >= 88200) || ['dsd', 'dsf'].includes(fmt) || ['dsd', 'dsf'].includes(ext);
            } else if (s.currentFormatFilter === 'lossless') {
                return ['flac', 'wav', 'alac', 'aiff', 'ape', 'wv', 'dsd', 'dsf'].includes(fmt) ||
                       ['flac', 'wav', 'alac', 'aiff', 'ape', 'wv'].includes(ext);
            } else if (s.currentFormatFilter === 'lossy') {
                return ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma'].includes(fmt) ||
                       ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wma'].includes(ext);
            }
            return true;
        });
    }

    if (s.searchQuery.trim() !== '') {
        const rawQ = s.searchQuery.toLowerCase().trim();
        const isGenre = rawQ.startsWith('genre:');
        const q = isGenre ? rawQ.slice(6).trim() : rawQ;
        const words = q.split(/\s+/).filter(Boolean);

        pool = pool.filter(t => {
            if (isGenre) {
                const g = (t.genre ? `${t.genre} ${normalizeGenre(t.genre)}` : '').toLowerCase();
                return words.every(w => g.includes(w));
            }
            const searchStr = getTrackSearchString(t);
            return words.every(w => searchStr.includes(w));
        });
    }

    switch (s.currentSort) {
        case 'title-asc':
            pool.sort((a, b) => (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
            break;
        case 'title-desc':
            pool.sort((a, b) => (b.title || b.filename || '').localeCompare(a.title || a.filename || ''));
            break;
        case 'artist-asc':
            pool.sort((a, b) => (a.artist || 'Unknown').localeCompare(b.artist || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
            break;
        case 'artist-desc':
            pool.sort((a, b) => (b.artist || 'Unknown').localeCompare(a.artist || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
            break;
        case 'album-asc':
            pool.sort((a, b) => (a.album || 'Unknown').localeCompare(b.album || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
            break;
        case 'album-desc':
            pool.sort((a, b) => (b.album || 'Unknown').localeCompare(a.album || 'Unknown') || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
            break;
        case 'duration-asc':
            pool.sort((a, b) => (a.duration || 0) - (b.duration || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
            break;
        case 'duration-desc':
            pool.sort((a, b) => (b.duration || 0) - (a.duration || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
            break;
        case 'year-desc':
            pool.sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
            break;
        case 'year-asc':
            pool.sort((a, b) => (parseInt(a.year, 10) || 0) - (parseInt(b.year, 10) || 0) || (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
            break;
        case 'default':
        default:
            break;
    }

    s.displayedTracks = pool;
    renderTrackList();
}

function updateRestoreBtnUi() {
    const s = store.state;
    if (!restoreTracksBtn) return;
    if (s.dismissedTracksMap.size > 0) {
        restoreTracksBtn.style.display = 'inline-flex';
        restoreTracksBtn.textContent = `RESTORE (${s.dismissedTracksMap.size})`;
    } else {
        restoreTracksBtn.style.display = 'none';
    }
}

function removeTrackFromMainList(track) {
    const s = store.state;
    const key = track.fullPath || track.filename || track.id;
    const idxInAll = s.allTracks.findIndex(t => (track.tid && t.tid == track.tid) || (track.fullPath && t.fullPath === track.fullPath) || (t.id == track.id) || (t.filename === track.filename));
    if (idxInAll === -1) return;

    const removedTrack = s.allTracks[idxInAll];
    s.dismissedTracksMap.set(key, { track: removedTrack, originalIndex: idxInAll });
    s.allTracks.splice(idxInAll, 1);

    if (s.currentTrackIndex === idxInAll) {
        if (s.allTracks.length > 0) {
            const nextIdx = Math.min(idxInAll, s.allTracks.length - 1);
            loadTrack(nextIdx, s.audio ? !s.audio.paused : false);
        } else {
            if (s.audio) s.audio.src = '';
            pauseAudio();
            updateEmptyPlayerState();
        }
    } else if (s.currentTrackIndex > idxInAll) {
        s.currentTrackIndex--;
    }

    applySearchAndSort();
    updateRestoreBtnUi();

    const title = removedTrack.title || removedTrack.filename || 'Track';
    showToast(
        `Removed "${title}" from list (file remains safe on disk)`,
        'UNDO',
        () => {
            s.dismissedTracksMap.delete(key);
            const insertIdx = Math.min(idxInAll, s.allTracks.length);
            s.allTracks.splice(insertIdx, 0, removedTrack);
            updateEmptyPlayerState();
            applySearchAndSort();
            updateRestoreBtnUi();
            showToast(`Restored "${title}" to list`);
        }
    );
}

let isTrackListDelegated = false;
function initTrackListDelegation() {
    const s = store.state;
    if (isTrackListDelegated || !trackList) return;
    isTrackListDelegated = true;
    trackList.addEventListener('click', (e) => {
        const emptyChooseBtn = e.target.closest('#emptyTrackListChooseDirBtn');
        if (emptyChooseBtn) {
            const chooseTrigger = document.getElementById('playerChooseDirBtn') || document.getElementById('settingsChooseFolderBtn') || browseFolderBtn;
            if (chooseTrigger) chooseTrigger.click();
            return;
        }
        const emptySettingsBtn = e.target.closest('#emptyTrackListOpenSettingsBtn');
        if (emptySettingsBtn) {
            switchWorkspace('settings');
            const libCatBtn = document.querySelector('#settingsCategoryNav .settingsCatBtn[data-cat="library"]');
            if (libCatBtn) libCatBtn.click();
            return;
        }
        const emptyBrowseBtn = e.target.closest('#emptyBrowseTracksBtn');
        if (emptyBrowseBtn) {
            const plName = s.currentPlaylistName;
            backToAllTracks();
            showToast(`Browse library and click "+" on any song to add it to "${plName}".`);
            return;
        }

        const trackMenuTrigger = e.target.closest('.trackMenuTriggerBtn');
        if (trackMenuTrigger) {
            e.stopPropagation();
            const item = trackMenuTrigger.closest('.trackItem');
            const idx = item ? parseInt(item.dataset.index, 10) : -1;
            const track = s.displayedTracks[idx];
            if (track) openTrackActionMenu(track, idx);
            return;
        }

        const playNextBtn = e.target.closest('.playNextTrackBtn');
        if (playNextBtn) {
            e.stopPropagation();
            const item = playNextBtn.closest('.trackItem');
            const idx = item ? parseInt(item.dataset.index, 10) : -1;
            const track = s.displayedTracks[idx];
            if (track) addToQueue(track, true);
            return;
        }

        const enqueueBtn = e.target.closest('.enqueueTrackBtn');
        if (enqueueBtn) {
            e.stopPropagation();
            const item = enqueueBtn.closest('.trackItem');
            const idx = item ? parseInt(item.dataset.index, 10) : -1;
            const track = s.displayedTracks[idx];
            if (track) addToQueue(track, false);
            return;
        }

        const openAddModalBtn = e.target.closest('.openAddModalBtn');
        if (openAddModalBtn) {
            e.stopPropagation();
            const item = openAddModalBtn.closest('.trackItem');
            const idx = item ? parseInt(item.dataset.index, 10) : -1;
            const track = s.displayedTracks[idx];
            if (track) openAddToPlaylistModal(track);
            return;
        }

        const removeMainTrackBtn = e.target.closest('.removeMainTrackBtn');
        if (removeMainTrackBtn) {
            e.stopPropagation();
            const item = removeMainTrackBtn.closest('.trackItem');
            const idx = item ? parseInt(item.dataset.index, 10) : -1;
            const track = s.displayedTracks[idx];
            if (track) removeTrackFromMainList(track);
            return;
        }

        const removePlaylistBtn = e.target.closest('.removePlaylistBtn');
        if (removePlaylistBtn) {
            e.stopPropagation();
            const item = removePlaylistBtn.closest('.trackItem');
            const idx = item ? parseInt(item.dataset.index, 10) : -1;
            const track = s.displayedTracks[idx];
            if (track) removeTrackFromCurrentPlaylist(track);
            return;
        }

        const item = e.target.closest('.trackItem');
        if (item && !e.target.closest('.addPlaylistBtn') && !e.target.closest('.actionPillBtn') && !e.target.closest('.trackMenuTriggerBtn')) {
            const idx = parseInt(item.dataset.index, 10);
            const track = s.displayedTracks[idx];
            if (track) {
                const masterIdx = s.allTracks.findIndex(t => {
                    if (track.id && t.id) return t.id === track.id;
                    if (track.tid && t.tid) return t.tid === track.tid;
                    return t.filename === track.filename;
                });
                if (masterIdx !== -1) {
                    loadTrack(masterIdx, true);
                }
            }
        }
    });
}

// =========================================================================
// VIRTUAL SCROLLING ENGINE (O(1) Memory, 60/144 FPS with 10k-100k Tracks)
// =========================================================================
const VIRTUAL_ROW_HEIGHT = 65.2;
const VIRTUAL_BUFFER_ROWS = 8;
let isVirtualScrollBound = false;
let isVirtualScrollPending = false;
const virtualTrackState = {
    startIndex: -1,
    endIndex: -1
};

function renderVirtualTrackWindow(force = false) {
    const s = store.state;
    if (!trackList) return;
    const total = s.displayedTracks.length;
    if (total === 0) return;

    const viewportHeight = trackList.clientHeight || 600;
    const scrollTop = trackList.scrollTop || 0;
    const visibleCount = Math.ceil(viewportHeight / VIRTUAL_ROW_HEIGHT);
    const rawStart = Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT);
    const startIndex = Math.max(0, rawStart - VIRTUAL_BUFFER_ROWS);
    const endIndex = Math.min(total, rawStart + visibleCount + VIRTUAL_BUFFER_ROWS);

    if (!force && startIndex === virtualTrackState.startIndex && endIndex === virtualTrackState.endIndex) {
        return;
    }
    virtualTrackState.startIndex = startIndex;
    virtualTrackState.endIndex = endIndex;

    const spacerTop = document.getElementById('trackSpacerTop');
    const spacerBottom = document.getElementById('trackSpacerBottom');
    const container = document.getElementById('trackItemsContainer');

    if (spacerTop) spacerTop.style.height = `${startIndex * VIRTUAL_ROW_HEIGHT}px`;
    if (spacerBottom) spacerBottom.style.height = `${Math.max(0, (total - endIndex) * VIRTUAL_ROW_HEIGHT)}px`;

    if (!container) return;
    const cur = s.allTracks[s.currentTrackIndex];

    function buildTrackItemElement(track, idx, isCurrent) {
        const item = document.createElement('div');
        item.className = `trackItem ${isCurrent ? 'active' : ''}`;
        item.dataset.id = track.id || track.tid || track.filename || '';
        item.dataset.index = idx;

        const coverSrc = track.cover
            ? (track.cover.startsWith('data:') || track.cover.startsWith('blob:')
                ? track.cover
                : (track.cover + (track.cover.includes('?') ? '&thumb=1' : '?thumb=1')))
            : 'resources/images/default.svg';
        const displayTitle = track.title ? escapeHtml(track.title) : escapeHtml(track.filename || 'Unknown');
        const displayArtist = track.artist ? escapeHtml(track.artist) : 'Unknown';
        const displayAlbum = track.album ? ` • ${escapeHtml(track.album)}` : '';

        item.innerHTML = `
            <span class="trackIndex">${idx + 1 < 10 ? '0' : ''}${idx + 1}</span>
            <div class="miniEq">
                <span></span><span></span><span></span>
            </div>
            <img src="${escapeHtml(coverSrc)}" alt="Cover" class="trackThumb" width="40" height="40" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='resources/images/default.svg'">
            <div class="trackDetails">
                <div class="trackTitle">${displayTitle}</div>
                <div class="trackArtist">${displayArtist}${displayAlbum}</div>
            </div>
            <span class="trackDuration">${formatTime(track.duration)}</span>
            <div class="trackItemActions">
                <button type="button" class="trackActionIconBtn actionPillBtn playNextTrackBtn" title="Play Next" data-index="${idx}">⤹</button>
                <button type="button" class="trackActionIconBtn actionPillBtn enqueueTrackBtn" title="Add to Queue" data-index="${idx}">+Q</button>
                ${s.currentPlaylistId !== null ? `
                    <button type="button" class="trackActionIconBtn addPlaylistBtn danger removePlaylistBtn" title="Remove from playlist" data-id="${escapeHtml(track.id)}">✕</button>
                ` : `
                    <button type="button" class="trackActionIconBtn addPlaylistBtn openAddModalBtn" title="Add to playlist" data-id="${escapeHtml(track.id)}">+</button>
                    <button type="button" class="trackActionIconBtn addPlaylistBtn danger removeMainTrackBtn" title="Remove track from list (does not delete file)" data-id="${escapeHtml(track.id)}">✕</button>
                `}
            </div>
            <button type="button" class="trackMenuTriggerBtn" title="Track options" aria-label="Track options for ${displayTitle}" data-index="${idx}">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <circle cx="12" cy="5" r="2.2"></circle>
                    <circle cx="12" cy="12" r="2.2"></circle>
                    <circle cx="12" cy="19" r="2.2"></circle>
                </svg>
            </button>
        `;
        return item;
    }

    if (force) {
        container.innerHTML = '';
        const frag = document.createDocumentFragment();
        for (let idx = startIndex; idx < endIndex; idx++) {
            const track = s.displayedTracks[idx];
            if (!track) continue;
            const isCurrent = cur && (
                (cur.id && track.id) ? cur.id === track.id :
                ((cur.tid && track.tid) ? cur.tid === track.tid : cur.filename === track.filename)
            );
            frag.appendChild(buildTrackItemElement(track, idx, isCurrent));
        }
        container.appendChild(frag);
        return;
    }

    const existingRows = new Map();
    for (const child of Array.from(container.children)) {
        const rowIdx = parseInt(child.dataset.index, 10);
        if (!isNaN(rowIdx) && rowIdx >= startIndex && rowIdx < endIndex) {
            existingRows.set(rowIdx, child);
            const curTrack = s.displayedTracks[rowIdx];
            if (curTrack) {
                const isCurrent = cur && (
                    (cur.id && curTrack.id) ? cur.id === curTrack.id :
                    ((cur.tid && curTrack.tid) ? cur.tid === curTrack.tid : cur.filename === curTrack.filename)
                );
                child.classList.toggle('active', !!isCurrent);
            }
        } else {
            child.remove();
        }
    }

    for (let idx = startIndex; idx < endIndex; idx++) {
        if (existingRows.has(idx)) continue;
        const track = s.displayedTracks[idx];
        if (!track) continue;
        const isCurrent = cur && (
            (cur.id && track.id) ? cur.id === track.id :
            ((cur.tid && track.tid) ? cur.tid === track.tid : cur.filename === track.filename)
        );
        const newItem = buildTrackItemElement(track, idx, isCurrent);

        let inserted = false;
        for (let nextIdx = idx + 1; nextIdx < endIndex; nextIdx++) {
            const nextRow = existingRows.get(nextIdx);
            if (nextRow && nextRow.parentNode === container) {
                container.insertBefore(newItem, nextRow);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            container.appendChild(newItem);
        }
        existingRows.set(idx, newItem);
    }
}

function initVirtualScrollListener() {
    if (isVirtualScrollBound || !trackList) return;
    isVirtualScrollBound = true;
    trackList.style.overflowAnchor = 'none';
    trackList.addEventListener('scroll', () => {
        if (isVirtualScrollPending) return;
        isVirtualScrollPending = true;
        requestAnimationFrame(() => {
            isVirtualScrollPending = false;
            renderVirtualTrackWindow();
        });
    }, { passive: true });
}

function scrollToTrackIndex(index, smooth = false) {
    const s = store.state;
    if (!trackList || index < 0 || index >= s.displayedTracks.length) return;
    const targetTop = Math.max(0, (index * VIRTUAL_ROW_HEIGHT) - (trackList.clientHeight / 2 - VIRTUAL_ROW_HEIGHT / 2));
    if (smooth) {
        trackList.scrollTo({ top: targetTop, behavior: 'smooth' });
    } else {
        trackList.scrollTop = targetTop;
    }
    renderVirtualTrackWindow(true);
}

function renderTrackList(preserveScroll = false) {
    const s = store.state;
    initTrackListDelegation();
    initVirtualScrollListener();
    if (trackCount) {
        trackCount.textContent = `${s.displayedTracks.length} TRACK${s.displayedTracks.length === 1 ? '' : 'S'}`;
    }

    if (!trackList) return;
    if (s.displayedTracks.length === 0) {
        trackList.innerHTML = '';
        virtualTrackState.startIndex = -1;
        virtualTrackState.endIndex = -1;
        if (s.currentPlaylistId !== null) {
            trackList.innerHTML = `
                <div class="emptyPlaylistNotice">
                    <div class="emptyPlaylistIcon">🎵</div>
                    <h3 class="emptyPlaylistTitle">"${escapeHtml(s.currentPlaylistName)}" is empty</h3>
                    <p class="emptyPlaylistDesc">Add songs to this playlist from your library by clicking the "+" button next to any track in ALL TRACKS.</p>
                    <button type="button" class="actionBtn primaryBtn emptyBrowseBtn" id="emptyBrowseTracksBtn">
                        ← BROWSE ALL TRACKS
                    </button>
                </div>
            `;
        } else if (s.allTracks.length === 0) {
            trackList.innerHTML = `
                <div class="emptyLibraryNotice">
                    <h3 class="emptyPlaylistTitle">No Music Directory Loaded</h3>
                    <p class="emptyPlaylistDesc">Choose your music directory or local files first to load tracks. You can also configure folders in <strong>Settings &rarr; Library &amp; Folders</strong>.</p>
                    <div class="emptyLibraryActions">
                        <button type="button" class="actionBtn primaryBtn" id="emptyTrackListChooseDirBtn">CHOOSE MUSIC / FOLDER</button>
                        <button type="button" class="actionBtn" id="emptyTrackListOpenSettingsBtn">MANUAL SETTINGS</button>
                    </div>
                </div>
            `;
        } else {
            trackList.innerHTML = `
                <div style="padding: 2.5rem 1rem; text-align: center; color: #cbd5e1; font-size: 1.05rem;">
                    No tracks found matching your query.
                </div>
            `;
        }
        return;
    }

    if (!preserveScroll) {
        trackList.scrollTop = 0;
    }

    if (!document.getElementById('trackItemsContainer')) {
        trackList.innerHTML = `
            <div class="trackListSpacerTop" id="trackSpacerTop" style="height: 0px; overflow-anchor: none;"></div>
            <div class="trackListItemsContainer" id="trackItemsContainer" style="overflow-anchor: none;"></div>
            <div class="trackListSpacerBottom" id="trackSpacerBottom" style="height: 0px; overflow-anchor: none;"></div>
        `;
    }

    renderVirtualTrackWindow(true);
}

// =========================================================================
// Playlist Management Engine
// =========================================================================
function formatPlaylistEstDuration(totalSeconds) {
    if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '0 MINS';
    const mins = Math.floor(totalSeconds / 60);
    if (mins < 60) return `${mins} MIN${mins === 1 ? '' : 'S'}`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs} HR${hrs === 1 ? '' : 'S'} ${remMins} MIN${remMins === 1 ? '' : 'S'}`;
}

function renderPlaylistsView() {
    const s = store.state;
    if (!playlistList) return;
    playlistList.innerHTML = '';

    const summaryBadge = document.getElementById('playlistsSummaryBadge');
    if (summaryBadge) {
        const totalTracks = s.playlists.reduce((acc, p) => acc + (p.track_count || 0), 0);
        summaryBadge.textContent = `${s.playlists.length} Playlist${s.playlists.length === 1 ? '' : 's'} • ${totalTracks} Track${totalTracks === 1 ? '' : 's'}`;
    }

    if (s.playlists.length === 0) {
        playlistList.innerHTML = `
            <div class="playlistEmptyContainer">
                <div class="playlistEmptyIcon">📂</div>
                <div class="playlistEmptyTitle">No playlists yet</div>
                <div class="playlistEmptyDesc">Use the quick presets above or type a name to create your first high-fidelity playlist!</div>
            </div>
        `;
        return;
    }

    s.playlists.forEach(pl => {
        const count = pl.track_count || (Array.isArray(pl.tracks) ? pl.tracks.length : 0);
        const estMins = Math.round(count * 3.6);
        const estText = estMins > 0 ? (estMins >= 60 ? `~${Math.floor(estMins / 60)}h ${estMins % 60}m` : `~${estMins} mins`) : '0 mins';

        const card = document.createElement('div');
        card.className = 'playlistCardItem richPlaylistCard';
        card.dataset.plid = pl.plid;
        card.innerHTML = `
            <div class="playlistCardTopRow">
                <div class="playlistCardArtwork">
                    <span class="playlistIcon">🎵</span>
                </div>
                <div class="playlistCardMain">
                    <div class="playlistCardTitleRow">
                        <span class="playlistCardName">${escapeHtml(pl.name)}</span>
                    </div>
                    <div class="playlistCardMetaRow">
                        <span class="playlistMetaPill">${count} TRACK${count === 1 ? '' : 'S'}</span>
                        <span class="playlistMetaDuration">${estText}</span>
                    </div>
                </div>
                <button type="button" class="playlistCardDeleteBtn" title="Delete playlist" aria-label="Delete playlist ${escapeHtml(pl.name)}" data-plid="${pl.plid}">
                    ✕
                </button>
            </div>
            <div class="playlistCardQuickActions">
                <button type="button" class="playlistActionPlayBtn" title="Play entire playlist now" data-plid="${pl.plid}">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
                    <span>PLAY</span>
                </button>
                <button type="button" class="playlistActionShuffleBtn" title="Shuffle playlist" data-plid="${pl.plid}">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
                    <span>SHUFFLE</span>
                </button>
                <button type="button" class="playlistActionQueueBtn" title="Add all tracks to play queue" data-plid="${pl.plid}">
                    <span>+ QUEUE</span>
                </button>
            </div>
        `;

        const mainBody = card.querySelector('.playlistCardMain');
        const artBody = card.querySelector('.playlistCardArtwork');
        [mainBody, artBody].forEach(el => {
            if (el) el.addEventListener('click', () => openPlaylist(pl.plid, pl.name));
        });

        const playBtn = card.querySelector('.playlistActionPlayBtn');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playPlaylistDirectly(pl.plid, pl.name, false);
            });
        }

        const shufBtn = card.querySelector('.playlistActionShuffleBtn');
        if (shufBtn) {
            shufBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playPlaylistDirectly(pl.plid, pl.name, true);
            });
        }

        const qBtn = card.querySelector('.playlistActionQueueBtn');
        if (qBtn) {
            qBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                queuePlaylistTracks(pl.plid, pl.name);
            });
        }

        const delBtn = card.querySelector('.playlistCardDeleteBtn');
        if (delBtn) {
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm(`Delete playlist "${pl.name}"?`)) return;
                await deletePlaylistById(pl.plid, pl.name);
            });
        }

        playlistList.appendChild(card);
    });
}

async function deletePlaylistById(plid, plName = 'playlist') {
    const s = store.state;
    if (getRuntime().hasPhpBackend && !String(plid).startsWith('local_pl_')) {
        try {
            const res = await fetch('php/api/playlists.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', plid })
            });
            const data = await res.json();
            if (!data.success) return false;
        } catch (err) {
            console.warn('Delete playlist error:', err);
            return false;
        }
    }

    s.playlists = s.playlists.filter(p => String(p.plid) !== String(plid));
    await saveLocalPlaylists(s.playlists);
    try { safeStorage.setItem('cachymusic_cached_playlists', JSON.stringify(s.playlists)); } catch (_) {}
    if (String(s.currentPlaylistId) === String(plid)) {
        backToPlaylistsView();
    }
    renderPlaylistsView();
    showToast(`Deleted playlist "${plName}".`);
    return true;
}

async function resolvePlaylistTracks(plid) {
    const s = store.state;
    if (getRuntime().hasPhpBackend && !String(plid).startsWith('local_pl_')) {
        try {
            const res = await fetch(`php/api/playlists.php?plid=${encodeURIComponent(plid)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.tracks)) {
                    return data.tracks;
                }
            }
        } catch (err) {
            console.warn('Error fetching PHP playlist tracks:', err);
        }
    }
    const pl = s.playlists.find(p => String(p.plid) === String(plid));
    if (!pl || !Array.isArray(pl.tracks)) return [];
    const keySet = new Set(pl.tracks.map(String));
    return s.allTracks.filter(t => keySet.has(getTrackKey(t)) || (t.id && keySet.has(String(t.id))) || (t.tid && keySet.has(String(t.tid))));
}

async function playPlaylistDirectly(plid, name, shuffle = false) {
    const s = store.state;
    await openPlaylist(plid, name);
    const plTracks = s.displayedTracks.filter(t => t.inCurrentPlaylist);
    if (plTracks.length === 0) {
        showToast(`Playlist "${name}" is empty. Add songs first!`);
        return;
    }

    if (shuffle) {
        const shuffled = [...plTracks].sort(() => Math.random() - 0.5);
        const first = shuffled[0];
        const masterIdx = s.allTracks.findIndex(t => (first.id && t.id == first.id) || (first.tid && t.tid == first.tid) || t.filename === first.filename);
        if (masterIdx !== -1) {
            loadTrack(masterIdx, true);
            s.playQueue = shuffled.slice(1);
            updateQueueUi();
            showToast(`Shuffled "${name}" (${shuffled.length} tracks)`);
        }
    } else {
        const first = plTracks[0];
        const masterIdx = s.allTracks.findIndex(t => (first.id && t.id == first.id) || (first.tid && t.tid == first.tid) || t.filename === first.filename);
        if (masterIdx !== -1) {
            loadTrack(masterIdx, true);
            s.playQueue = plTracks.slice(1);
            updateQueueUi();
            showToast(`Playing playlist "${name}"`);
        }
    }
}

async function queuePlaylistTracks(plid, name) {
    const s = store.state;
    const plTracks = await resolvePlaylistTracks(plid);
    if (plTracks.length > 0) {
        plTracks.forEach(track => {
            let existing = s.allTracks.find(t => (track.id && t.id == track.id) || (track.tid && t.tid == track.tid) || t.filename === track.filename);
            if (!existing) {
                s.allTracks.push(track);
                existing = track;
            }
            s.playQueue.push(existing);
        });
        updateQueueUi();
        showToast(`Queued ${plTracks.length} tracks from "${name}"`);
        return;
    }
    showToast(`Could not queue tracks from "${name}"`);
}

async function openPlaylist(plid, name) {
    const s = store.state;
    s.currentPlaylistId = plid;
    s.currentPlaylistName = name || 'Playlist';
    if (activeListLabel) activeListLabel.textContent = `PLAYLIST: ${s.currentPlaylistName.toUpperCase()}`;
    if (currentPlaylistTitle) currentPlaylistTitle.textContent = s.currentPlaylistName;

    try {
        safeStorage.setItem('cachymusic_last_playlist_id', String(plid));
        safeStorage.setItem('cachymusic_last_playlist_name', s.currentPlaylistName);
    } catch (_) {}

    const quickFormatBar = document.getElementById('quickFormatFilterBar');
    if (tabPlaylists) tabPlaylists.classList.remove('active');
    if (tabLibrary) tabLibrary.classList.add('active');
    if (playlistsView) playlistsView.style.display = 'none';
    if (libraryControls) libraryControls.style.display = 'none';
    if (quickFormatBar) quickFormatBar.style.display = 'flex';
    if (playlistBanner) playlistBanner.style.display = 'flex';
    if (trackList) trackList.style.display = 'flex';

    const plTracks = await resolvePlaylistTracks(plid);
    const keySet = new Set();
    plTracks.forEach(plTrack => {
        let existing = s.allTracks.find(t => (plTrack.tid && t.tid == plTrack.tid) || (plTrack.fullPath && t.fullPath === plTrack.fullPath) || (plTrack.id && t.id == plTrack.id));
        if (!existing) {
            s.allTracks.push(plTrack);
            existing = plTrack;
        }
        existing.inCurrentPlaylist = true;
        keySet.add(getTrackKey(existing));
    });
    s.allTracks.forEach(t => {
        if (!keySet.has(getTrackKey(t))) {
            t.inCurrentPlaylist = false;
        }
    });

    const metaEl = document.getElementById('currentPlaylistMeta');
    if (metaEl) {
        const totalSecs = plTracks.reduce((sum, t) => sum + (t.duration || 210), 0);
        metaEl.textContent = `${plTracks.length} TRACK${plTracks.length === 1 ? '' : 'S'} • ${formatPlaylistEstDuration(totalSecs)}`;
    }

    applySearchAndSort();
}
store.state.openPlaylist = openPlaylist;

function backToPlaylistsView() {
    const s = store.state;
    s.currentPlaylistId = null;
    s.currentPlaylistName = '';
    if (activeListLabel) activeListLabel.textContent = 'ALL TRACKS';
    s.allTracks.forEach(t => { t.inCurrentPlaylist = false; });

    try {
        safeStorage.removeItem('cachymusic_last_playlist_id');
        safeStorage.removeItem('cachymusic_last_playlist_name');
    } catch (_) {}

    const quickFormatBar = document.getElementById('quickFormatFilterBar');
    if (playlistBanner) playlistBanner.style.display = 'none';
    if (trackList) trackList.style.display = 'none';
    if (queueView) queueView.style.display = 'none';
    if (libraryControls) libraryControls.style.display = 'none';
    if (quickFormatBar) quickFormatBar.style.display = 'none';
    if (tabLibrary) tabLibrary.classList.remove('active');
    if (tabQueue) tabQueue.classList.remove('active');
    if (tabPlaylists) tabPlaylists.classList.add('active');
    if (playlistsView) playlistsView.style.display = 'flex';
    renderPlaylistsView();
}

function backToAllTracks() {
    const s = store.state;
    s.currentPlaylistId = null;
    s.currentPlaylistName = '';
    if (activeListLabel) activeListLabel.textContent = 'ALL TRACKS';
    s.allTracks.forEach(t => { t.inCurrentPlaylist = false; });

    try {
        safeStorage.removeItem('cachymusic_last_playlist_id');
        safeStorage.removeItem('cachymusic_last_playlist_name');
    } catch (_) {}

    const quickFormatBar = document.getElementById('quickFormatFilterBar');
    if (playlistBanner) playlistBanner.style.display = 'none';
    if (libraryControls) libraryControls.style.display = 'flex';
    if (quickFormatBar) quickFormatBar.style.display = 'flex';
    applySearchAndSort();
}

// =========================================================================
// Modal History & State Navigation Engine (W3C PWA & Android Hardware Back)
// =========================================================================
if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
        const modalIds = [
            'themeModal',
            'peqModal',
            'playlistModal',
            'trackActionMenuModal',
            'signalPathModal',
            'sleepTimerModal',
            'slskAccountModal',
            'batchAddSongsModal',
            'metadataEditorModal'
        ];
        for (const id of modalIds) {
            const el = document.getElementById(id);
            if (el && (el.style.display === 'flex' || window.getComputedStyle(el).display === 'flex')) {
                el.style.display = 'none';
                return;
            }
        }
    });
}

function openSlskAccountModal() {
    const modal = document.getElementById('slskAccountModal');
    if (!modal) return;
    modal.style.display = 'flex';
    pushModalState('slskAccountModal');
}

function closeSlskAccountModal() {
    const modal = document.getElementById('slskAccountModal');
    if (!modal) return;
    modal.style.display = 'none';
    popModalState('slskAccountModal');
}

// =========================================================================
// Batch Add Songs Modal Engine
// =========================================================================
function openBatchAddModal() {
    const s = store.state;
    if (!s.currentPlaylistId) return;
    const modal = document.getElementById('batchAddSongsModal');
    const titleEl = document.getElementById('batchAddModalTitle');
    const listEl = document.getElementById('batchAddTracksList');
    const searchInput = document.getElementById('batchAddSearchInput');
    const summaryEl = document.getElementById('batchAddSummaryText');
    if (!modal || !listEl) return;

    if (titleEl) titleEl.textContent = `ADD SONGS TO "${(s.currentPlaylistName || 'PLAYLIST').toUpperCase()}"`;
    if (searchInput) searchInput.value = '';

    const renderBatchList = (filterStr = '') => {
        listEl.innerHTML = '';
        const f = filterStr.toLowerCase().trim();
        const filtered = s.allTracks.filter(t => {
            if (!f) return true;
            const target = `${t.title || t.filename || ''} ${t.artist || ''} ${t.album || ''}`.toLowerCase();
            return target.includes(f);
        });

        if (filtered.length === 0) {
            listEl.innerHTML = '<div class="batchAddEmpty">No tracks matched your search.</div>';
            return;
        }

        const currentCount = s.allTracks.filter(t => t.inCurrentPlaylist).length;
        if (summaryEl) summaryEl.textContent = `${currentCount} song${currentCount === 1 ? '' : 's'} in playlist`;

        filtered.slice(0, 150).forEach(track => {
            const row = document.createElement('div');
            row.className = 'batchAddRow';
            const isInPlaylist = Boolean(track.inCurrentPlaylist);
            row.innerHTML = `
                <img src="${escapeHtml(track.cover || 'resources/images/default.svg')}" alt="" class="batchAddThumb" width="40" height="40" loading="lazy" decoding="async">
                <div class="batchAddInfo">
                    <span class="batchAddTitle">${escapeHtml(track.title || track.filename || 'Unknown')}</span>
                    <span class="batchAddArtist">${escapeHtml(track.artist || 'Unknown')}${track.album ? ' • ' + escapeHtml(track.album) : ''}</span>
                </div>
                <span class="batchAddDuration">${formatTime(track.duration)}</span>
                <button type="button" class="batchAddToggleBtn ${isInPlaylist ? 'isAdded' : ''}">
                    ${isInPlaylist ? '✓ ADDED' : '+ ADD'}
                </button>
            `;

            const toggleBtn = row.querySelector('.batchAddToggleBtn');
            toggleBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (track.inCurrentPlaylist) {
                    await removeTrackFromCurrentPlaylist(track);
                    toggleBtn.classList.remove('isAdded');
                    toggleBtn.textContent = '+ ADD';
                } else {
                    toggleBtn.textContent = '...';
                    const ok = await addTrackToPlaylist(s.currentPlaylistId, track.tid || track.id, track);
                    if (ok) {
                        track.inCurrentPlaylist = true;
                        toggleBtn.classList.add('isAdded');
                        toggleBtn.textContent = '✓ ADDED';
                    } else {
                        toggleBtn.textContent = '+ ADD';
                    }
                }
                const updatedCount = s.allTracks.filter(t => t.inCurrentPlaylist).length;
                if (summaryEl) summaryEl.textContent = `${updatedCount} song${updatedCount === 1 ? '' : 's'} in playlist`;
                const metaEl = document.getElementById('currentPlaylistMeta');
                if (metaEl) metaEl.textContent = `${updatedCount} TRACK${updatedCount === 1 ? '' : 'S'}`;
            });

            listEl.appendChild(row);
        });
    };

    renderBatchList();

    let searchDebounceTimer = null;
    if (searchInput) {
        searchInput.oninput = () => {
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                renderBatchList(searchInput.value);
            }, 100);
        };
    }

    modal.style.display = 'flex';
    pushModalState('batchAddSongsModal');
    if (searchInput) setTimeout(() => searchInput.focus(), 60);
}

function closeBatchAddModal() {
    const modal = document.getElementById('batchAddSongsModal');
    if (modal) modal.style.display = 'none';
    popModalState('batchAddSongsModal');
    applySearchAndSort();
}

// =========================================================================
// Up Next / Dynamic Play Queue Engine
// =========================================================================
function addToQueue(track, playNext = false) {
    const s = store.state;
    if (!track) return;
    if (playNext) {
        s.playQueue.unshift(track);
        showToast(`Playing next: "${track.title || track.filename}"`);
    } else {
        s.playQueue.push(track);
        showToast(`Added to queue: "${track.title || track.filename}"`);
    }
    updateQueueUi();
}

function removeFromQueue(index) {
    const s = store.state;
    if (index >= 0 && index < s.playQueue.length) {
        const removed = s.playQueue.splice(index, 1)[0];
        updateQueueUi();
        showToast(`Removed "${removed.title || removed.filename}" from queue`);
    }
}

function moveQueueItem(fromIndex, toIndex) {
    const s = store.state;
    if (fromIndex < 0 || fromIndex >= s.playQueue.length || toIndex < 0 || toIndex >= s.playQueue.length) return;
    const [item] = s.playQueue.splice(fromIndex, 1);
    s.playQueue.splice(toIndex, 0, item);
    updateQueueUi();
}

function clearQueue() {
    const s = store.state;
    if (s.playQueue.length === 0) return;
    s.playQueue = [];
    updateQueueUi();
    showToast('Play queue cleared');
}

function updateQueueUi() {
    const s = store.state;
    if (queueCountBadge) {
        queueCountBadge.textContent = s.playQueue.length > 0 ? s.playQueue.length : '';
        queueCountBadge.style.display = s.playQueue.length > 0 ? 'inline-flex' : 'none';
    }
    if (queueCountSummary) {
        queueCountSummary.textContent = `${s.playQueue.length} song${s.playQueue.length === 1 ? '' : 's'} queued`;
    }
    if (queueView && queueView.style.display !== 'none') {
        renderQueueView();
    }
}

function renderQueueView() {
    const s = store.state;
    if (!queueList) return;
    if (s.playQueue.length === 0) {
        queueList.innerHTML = '<div class="queueEmpty">Your queue is empty. Click "+ Queue" or "⤹ Next" on any track.</div>';
    } else {
        const frag = document.createDocumentFragment();
        s.playQueue.forEach((track, idx) => {
            const item = document.createElement('div');
            item.className = 'queueItem';
            const coverSrc = track.cover || 'resources/images/default.svg';
            const displayTitle = track.title ? escapeHtml(track.title) : escapeHtml(track.filename || 'Unknown');
            const displayArtist = track.artist ? escapeHtml(track.artist) : 'Unknown';

            item.innerHTML = `
                <span class="queueIndex">#${idx + 1}</span>
                <img src="${escapeHtml(coverSrc)}" alt="Cover" class="queueThumb" width="40" height="40" loading="lazy" decoding="async">
                <div class="queueDetails">
                    <div class="queueTitle">${displayTitle}</div>
                    <div class="queueArtist">${displayArtist}</div>
                </div>
                <span class="queueDuration">${formatTime(track.duration)}</span>
                <div class="queueItemActions">
                    ${idx > 0 ? `<button type="button" class="queueMoveBtn moveUpBtn" data-idx="${idx}" title="Move up">▲</button>` : ''}
                    ${idx < s.playQueue.length - 1 ? `<button type="button" class="queueMoveBtn moveDownBtn" data-idx="${idx}" title="Move down">▼</button>` : ''}
                    <button type="button" class="queuePlayNowBtn" data-idx="${idx}" title="Play now">▶</button>
                    <button type="button" class="queueRemoveBtn" data-idx="${idx}" title="Remove from queue">✕</button>
                </div>
            `;
            frag.appendChild(item);
        });
        queueList.innerHTML = '';
        queueList.appendChild(frag);
    }

    if (upcomingLibraryList) {
        const pool = s.displayedTracks.length > 0 ? s.displayedTracks : s.allTracks;
        const curIdx = pool.findIndex(t => {
            const cur = s.allTracks[s.currentTrackIndex];
            if (!cur) return false;
            if (cur.id && t.id) return t.id === cur.id;
            if (cur.tid && t.tid) return t.tid === cur.tid;
            return t.filename === cur.filename;
        });

        const upcoming = [];
        if (pool.length > 0 && curIdx !== -1) {
            for (let i = 1; i <= Math.min(5, pool.length - 1); i++) {
                const nextIdx = (curIdx + i) % pool.length;
                upcoming.push(pool[nextIdx]);
            }
        }

        if (upcoming.length === 0) {
            upcomingLibraryList.innerHTML = '<div class="queueEmptyUpcoming">End of active track list reached</div>';
        } else {
            const uFrag = document.createDocumentFragment();
            upcoming.forEach((track) => {
                const uItem = document.createElement('div');
                uItem.className = 'queueItem upcomingItem';
                const coverSrc = track.cover || 'resources/images/default.svg';
                const displayTitle = track.title ? escapeHtml(track.title) : escapeHtml(track.filename || 'Unknown');
                const displayArtist = track.artist ? escapeHtml(track.artist) : 'Unknown';
                const tId = track.id || track.tid || track.filename;
                uItem.innerHTML = `
                    <span class="queueIndex libraryOrder">»</span>
                    <img src="${escapeHtml(coverSrc)}" alt="Cover" class="queueThumb" width="40" height="40" loading="lazy" decoding="async">
                    <div class="queueDetails">
                        <div class="queueTitle">${displayTitle}</div>
                        <div class="queueArtist">${displayArtist}</div>
                    </div>
                    <span class="queueDuration">${formatTime(track.duration)}</span>
                    <div class="queueItemActions">
                        <button type="button" class="actionPillBtn enqueueUpcomingBtn" data-id="${escapeHtml(tId)}" title="Pin to top of Queue">+ Queue</button>
                    </div>
                `;
                uFrag.appendChild(uItem);
            });
            upcomingLibraryList.innerHTML = '';
            upcomingLibraryList.appendChild(uFrag);
        }
    }
}

// =========================================================================
// Track Actions & Options Context Menu Engine
// =========================================================================
function openTrackActionMenu(track, idx) {
    const s = store.state;
    if (!track) return;
    s.selectedTrackForMenu = track;
    s.selectedTrackIndexForMenu = idx;

    const modal = document.getElementById('trackActionMenuModal');
    const thumb = document.getElementById('trackMenuThumb');
    const title = document.getElementById('trackMenuTitle');
    const artist = document.getElementById('trackMenuArtist');
    const formatPill = document.getElementById('trackMenuFormatPill');
    const durationPill = document.getElementById('trackMenuDurationPill');
    const removeLabel = document.getElementById('trackMenuRemoveLabel');
    const removeSub = document.getElementById('trackMenuRemoveSub');

    if (!modal) return;

    if (thumb) {
        thumb.src = track.cover
            ? (track.cover.startsWith('data:') || track.cover.startsWith('blob:')
                ? track.cover
                : (track.cover + (track.cover.includes('?') ? '&thumb=1' : '?thumb=1')))
            : 'resources/images/default.svg';
    }
    if (title) title.textContent = track.title || track.filename || 'Unknown Track';
    if (artist) {
        const art = track.artist || 'Unknown Artist';
        const alb = track.album ? ` • ${track.album}` : '';
        artist.textContent = `${art}${alb}`;
    }
    if (formatPill) formatPill.textContent = (track.format || 'AUDIO').toUpperCase();
    if (durationPill) durationPill.textContent = formatTime(track.duration);

    if (removeLabel && removeSub) {
        if (s.currentPlaylistId !== null) {
            removeLabel.textContent = 'Remove from Playlist';
            removeSub.textContent = `Remove from "${s.currentPlaylistName || 'Playlist'}"`;
        } else {
            removeLabel.textContent = 'Remove from Library List';
            removeSub.textContent = 'Hide from current list (does not delete file)';
        }
    }

    modal.style.display = 'flex';
    pushModalState('trackActionMenuModal');
}

function closeTrackActionMenu() {
    const s = store.state;
    const modal = document.getElementById('trackActionMenuModal');
    if (modal) modal.style.display = 'none';
    popModalState('trackActionMenuModal');
    s.selectedTrackForMenu = null;
    s.selectedTrackIndexForMenu = -1;
}

// =========================================================================
// Track Metadata & ID3 Tag Editor + Online Artwork Finder
// =========================================================================
let pendingMetadataPayload = null;
let pendingCover = null;
let originalTrackCover = null;

function updateTrackMetadataDisplay(track) {
    if (!track) return;
    store.state.currentInspectedTrack = track;
    if (statTitle) statTitle.textContent = track.title ? track.title : (track.filename || 'Unknown');
    if (statArtist) statArtist.textContent = track.artist ? track.artist : 'Unknown';
    if (statAlbum) statAlbum.textContent = track.album ? track.album : 'Unknown';
    if (statGenre) statGenre.textContent = normalizeGenre(track.genre) || 'N/A';
    if (statYear) statYear.textContent = track.year ? track.year.toString() : 'N/A';
    if (statTrack) statTrack.textContent = (track.track || track.track_num) ? (track.track || track.track_num).toString() : 'N/A';
    if (statBitrate) statBitrate.textContent = track.bitrate ? `${track.bitrate} kbps` : 'N/A';
    if (statSampleRate) statSampleRate.textContent = track.sampleRate ? `${track.sampleRate} Hz` : 'N/A';
    if (statBitDepth) {
        const bd = track.bitDepth || ((track.sampleRate && track.sampleRate >= 88200) ? 24 : 16);
        statBitDepth.textContent = bd ? `${bd}-Bit` : 'N/A';
    }
    if (statChannels) {
        statChannels.textContent = track.channels === 2 ? 'Stereo' : (track.channels === 1 ? 'Mono' : (track.channels ? `${track.channels} ch` : 'N/A'));
    }
    if (statFormat) statFormat.textContent = track.format ? track.format.toUpperCase() : 'N/A';
    if (statSize) statSize.textContent = track.size ? track.size : 'N/A';
    if (statPath) {
        statPath.textContent = track.filename ? track.filename : 'N/A';
        statPath.title = track.fullPath || track.filename || 'N/A';
    }
    if (coverArtPreview) {
        coverArtPreview.src = track.cover ? track.cover : 'resources/images/default.svg';
    }
}

async function convertImageUrlToDataUrl(url) {
    if (!url) return null;
    if (url.startsWith('data:image/')) return url;
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        const timer = setTimeout(() => {
            img.src = '';
            resolve(null);
        }, 6000);
        img.onload = () => {
            clearTimeout(timer);
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width || 600;
                canvas.height = img.naturalHeight || img.height || 600;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.92));
            } catch (_) {
                resolve(null);
            }
        };
        img.onerror = () => {
            clearTimeout(timer);
            resolve(null);
        };
        img.src = url;
    });
}

async function searchCoverOnline(query) {
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) return null;

    for (const entity of ['album', 'song']) {
        try {
            const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&entity=${entity}&limit=3`;
            const resp = await fetch(itunesUrl);
            if (resp.ok) {
                const data = await resp.json();
                if (data && Array.isArray(data.results) && data.results.length > 0) {
                    const match = data.results[0];
                    const rawArt = match.artworkUrl100 || match.artworkUrl60;
                    if (rawArt) {
                        const hdArt = rawArt.replace(/\/\d+x\d+bb\./, '/600x600bb.');
                        return {
                            source: 'iTunes Store HD',
                            artworkUrl: hdArt,
                            album: match.collectionName || match.trackName || cleanQuery,
                            artist: match.artistName || '',
                            resolution: '600×600'
                        };
                    }
                }
            }
        } catch (err) {
            console.warn(`iTunes ${entity} cover search error:`, err);
        }
    }
    return null;
}

function applyFoundCover(result) {
    if (!result) return;
    const thumb = document.getElementById('metaEditorThumb');
    const revertBtn = document.getElementById('metaEditorRevertCoverBtn');
    const statusEl = document.getElementById('metaEditorStatus');

    pendingCover = {
        source: result.source || 'online',
        url: result.artworkUrl || result.url,
        dataUrl: result.dataUrl || null,
        preview: result.artworkUrl || result.dataUrl
    };

    if (thumb) thumb.src = pendingCover.preview;
    if (revertBtn) revertBtn.style.display = 'inline-flex';
    if (statusEl) {
        statusEl.textContent = 'Artwork match applied! Confirm edits below to save.';
        statusEl.className = 'metaEditorStatus';
        statusEl.style.display = 'block';
    }
}

function revertCover() {
    const thumb = document.getElementById('metaEditorThumb');
    const revertBtn = document.getElementById('metaEditorRevertCoverBtn');
    pendingCover = null;
    if (thumb && originalTrackCover) thumb.src = originalTrackCover;
    if (revertBtn) revertBtn.style.display = 'none';
    showToast('Reverted to original cover artwork');
}

function handleCoverFileSelect(fileOrEvent) {
    const file = (fileOrEvent && fileOrEvent.target && fileOrEvent.target.files) ? fileOrEvent.target.files[0] : fileOrEvent;
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
        showToast('Selected file is not an image (PNG, JPG, WEBP supported).');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        const thumb = document.getElementById('metaEditorThumb');
        const revertBtn = document.getElementById('metaEditorRevertCoverBtn');
        const onlineCard = document.getElementById('metaEditorOnlineCard');

        pendingCover = {
            source: 'file',
            name: file.name,
            dataUrl,
            preview: dataUrl
        };

        if (thumb) thumb.src = dataUrl;
        if (revertBtn) revertBtn.style.display = 'inline-flex';
        if (onlineCard) onlineCard.style.display = 'none';
        showToast(`Loaded cover image: ${file.name}`);
    };
    reader.onerror = () => showToast('Failed to read image file.');
    reader.readAsDataURL(file);
}

async function autoFindCoverOnline(track, userInitiated = false, customQuery = null) {
    const s = store.state;
    if (!track) return;
    const onlineCard = document.getElementById('metaEditorOnlineCard');
    const onlineStatus = document.getElementById('metaEditorOnlineStatus');
    const onlineContent = document.getElementById('metaEditorOnlineContent');
    const onlineMessage = document.getElementById('metaEditorOnlineMessage');
    const onlinePreview = document.getElementById('metaEditorOnlinePreview');
    const onlineTitle = document.getElementById('metaEditorOnlineTitle');
    const onlineArtist = document.getElementById('metaEditorOnlineArtist');
    const onlineMeta = document.getElementById('metaEditorOnlineMeta');
    const onlineSearchInput = document.getElementById('metaEditorOnlineSearchInput');

    let query = customQuery;
    if (!query) {
        const inputArtist = document.getElementById('metaEditArtist');
        const inputAlbum = document.getElementById('metaEditAlbum');
        const inputTitle = document.getElementById('metaEditTitle');
        const queryArtist = (inputArtist && inputArtist.value ? inputArtist.value : track.artist || '').trim();
        const queryAlbum = (inputAlbum && inputAlbum.value ? inputAlbum.value : track.album || '').trim();
        const queryTitle = (inputTitle && inputTitle.value ? inputTitle.value : track.title || '').trim();
        query = [queryArtist, (queryAlbum || queryTitle)].filter(Boolean).join(' ');
    }

    if (!query) {
        if (userInitiated && onlineMessage) {
            onlineMessage.textContent = 'Please enter an artist or title to search online.';
            onlineMessage.style.display = 'block';
        }
        return;
    }

    if (onlineSearchInput) onlineSearchInput.value = query;
    if (onlineCard) onlineCard.style.display = 'flex';
    if (onlineStatus) onlineStatus.textContent = 'SEARCHING REPOSITORIES...';
    if (onlineMessage) {
        onlineMessage.textContent = `Searching high-resolution artwork for "${query}"...`;
        onlineMessage.style.display = 'block';
    }
    if (onlineContent) onlineContent.style.display = 'none';

    const result = await searchCoverOnline(query);
    if (!s.currentEditingTrack) return;

    if (result && result.artworkUrl) {
        if (onlineStatus) onlineStatus.textContent = 'ONLINE ARTWORK MATCH';
        if (onlineTitle) onlineTitle.textContent = result.album;
        if (onlineArtist) onlineArtist.textContent = result.artist;
        if (onlineMeta) onlineMeta.textContent = `${result.source} • ${result.resolution}`;
        if (onlinePreview) onlinePreview.src = result.artworkUrl;
        if (onlineContent) onlineContent.style.display = 'flex';
        if (onlineMessage) onlineMessage.style.display = 'none';

        const hasNoCover = !track.cover || track.cover.includes('default.svg');
        if (hasNoCover || userInitiated) {
            applyFoundCover(result);
        }
    } else {
        if (onlineStatus) onlineStatus.textContent = 'ONLINE ARTWORK FINDER';
        if (onlineContent) onlineContent.style.display = 'none';
        if (onlineMessage) {
            onlineMessage.textContent = `No matching artwork found for "${query}". Try searching with a custom query above.`;
            onlineMessage.style.display = 'block';
        }
    }
}

function openMetadataEditor(track) {
    const s = store.state;
    if (!track) {
        showToast('No track selected to edit metadata.');
        return;
    }
    s.currentEditingTrack = track;
    pendingMetadataPayload = null;
    pendingCover = null;
    originalTrackCover = track.cover
        ? (track.cover.startsWith('data:') || track.cover.startsWith('blob:')
            ? track.cover
            : (track.cover + (track.cover.includes('?') ? '&thumb=1' : '?thumb=1')))
        : 'resources/images/default.svg';

    const modal = document.getElementById('metadataEditorModal');
    const thumb = document.getElementById('metaEditorThumb');
    const fileTitle = document.getElementById('metaEditorFileTitle');
    const filePath = document.getElementById('metaEditorFilePath');
    const formatPill = document.getElementById('metaEditorFormatPill');
    const bitratePill = document.getElementById('metaEditorBitratePill');
    const sampleRatePill = document.getElementById('metaEditorSampleRatePill');
    const bitDepthPill = document.getElementById('metaEditorBitDepthPill');
    const statusEl = document.getElementById('metaEditorStatus');
    const form = document.getElementById('metaEditorForm');
    const confirmCard = document.getElementById('metaEditorConfirmCard');
    const saveBtn = document.getElementById('metaEditSaveBtn');
    const proceedBtn = document.getElementById('metaEditConfirmProceedBtn');
    const cancelConfirmBtn = document.getElementById('metaEditConfirmCancelBtn');
    const revertCoverBtn = document.getElementById('metaEditorRevertCoverBtn');
    const onlineCard = document.getElementById('metaEditorOnlineCard');

    const inputTitle = document.getElementById('metaEditTitle');
    const inputArtist = document.getElementById('metaEditArtist');
    const inputAlbum = document.getElementById('metaEditAlbum');
    const inputGenre = document.getElementById('metaEditGenre');
    const inputYear = document.getElementById('metaEditYear');
    const inputTrackNum = document.getElementById('metaEditTrackNum');
    const inputComment = document.getElementById('metaEditComment');

    if (!modal) return;

    if (confirmCard) confirmCard.style.display = 'none';
    if (form) form.style.display = 'block';
    if (revertCoverBtn) revertCoverBtn.style.display = 'none';
    if (onlineCard) onlineCard.style.display = 'none';

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'SAVE METADATA';
    }
    if (proceedBtn) {
        proceedBtn.disabled = false;
        proceedBtn.textContent = 'YES, WRITE & SAVE';
    }
    if (cancelConfirmBtn) cancelConfirmBtn.disabled = false;
    if (thumb) thumb.src = originalTrackCover;
    if (fileTitle) fileTitle.textContent = track.title || track.filename || 'Untitled Track';
    if (filePath) filePath.textContent = track.fullPath || track.filename || 'Local Audio Track';
    if (formatPill) formatPill.textContent = (track.format || 'AUDIO').toUpperCase();
    if (bitratePill) bitratePill.textContent = track.bitrate ? `${track.bitrate} kbps` : 'N/A';
    if (sampleRatePill) {
        const sr = track.sampleRate;
        sampleRatePill.textContent = sr ? (sr >= 1000 ? `${(sr / 1000).toFixed(1)} kHz` : `${sr} Hz`) : '44.1 kHz';
    }
    if (bitDepthPill) {
        const bd = track.bitDepth || ((track.sampleRate && track.sampleRate >= 88200) ? 24 : 16);
        bitDepthPill.textContent = `${bd}-Bit`;
    }
    if (statusEl) {
        statusEl.style.display = 'none';
        statusEl.textContent = '';
        statusEl.className = 'metaEditorStatus';
    }

    if (inputTitle) inputTitle.value = track.title || '';
    if (inputArtist) inputArtist.value = track.artist || '';
    if (inputAlbum) inputAlbum.value = track.album || '';
    if (inputGenre) inputGenre.value = track.genre || '';
    if (inputYear) inputYear.value = (track.year && track.year > 0) ? track.year : '';
    if (inputTrackNum) inputTrackNum.value = (track.track || track.track_num) ? (track.track || track.track_num) : '';
    if (inputComment) inputComment.value = track.comment || '';

    modal.style.display = 'flex';
    pushModalState('metadataEditorModal');

    if (window.innerWidth > 768 && inputTitle) {
        setTimeout(() => {
            try {
                inputTitle.focus();
                inputTitle.select();
            } catch (_) {}
        }, 60);
    }

    if (!track.cover || track.cover.includes('default.svg')) {
        setTimeout(() => {
            if (s.currentEditingTrack === track) {
                autoFindCoverOnline(track, false);
            }
        }, 120);
    }
}

function closeMetadataEditor() {
    const modal = document.getElementById('metadataEditorModal');
    if (modal) modal.style.display = 'none';
    const confirmCard = document.getElementById('metaEditorConfirmCard');
    const form = document.getElementById('metaEditorForm');
    const revertBtn = document.getElementById('metaEditorRevertCoverBtn');
    const onlineCard = document.getElementById('metaEditorOnlineCard');
    if (confirmCard) confirmCard.style.display = 'none';
    if (form) form.style.display = 'block';
    if (revertBtn) revertBtn.style.display = 'none';
    if (onlineCard) onlineCard.style.display = 'none';

    popModalState('metadataEditorModal');
    store.state.currentEditingTrack = null;
    pendingMetadataPayload = null;
    pendingCover = null;
    originalTrackCover = null;
}

function requestSaveMetadataConfirmation(e) {
    const s = store.state;
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!s.currentEditingTrack) return;

    const inputTitle = document.getElementById('metaEditTitle');
    const inputArtist = document.getElementById('metaEditArtist');
    const inputAlbum = document.getElementById('metaEditAlbum');
    const inputGenre = document.getElementById('metaEditGenre');
    const inputYear = document.getElementById('metaEditYear');
    const inputTrackNum = document.getElementById('metaEditTrackNum');
    const inputComment = document.getElementById('metaEditComment');
    const statusEl = document.getElementById('metaEditorStatus');
    const form = document.getElementById('metaEditorForm');
    const confirmCard = document.getElementById('metaEditorConfirmCard');
    const confirmSummary = document.getElementById('metaEditorConfirmSummary');
    const confirmDesc = document.getElementById('metaEditorConfirmDesc');

    const newTitle = (inputTitle ? inputTitle.value : '').trim();
    if (!newTitle) {
        if (statusEl) {
            statusEl.textContent = 'Track title cannot be empty.';
            statusEl.className = 'metaEditorStatus error';
            statusEl.style.display = 'block';
        }
        if (inputTitle) inputTitle.focus();
        return;
    }

    const newArtist = (inputArtist ? inputArtist.value : '').trim();
    const newAlbum = (inputAlbum ? inputAlbum.value : '').trim();
    const newGenre = (inputGenre ? inputGenre.value : '').trim();
    const newYear = inputYear && inputYear.value ? parseInt(inputYear.value, 10) : null;
    const newTrackNum = inputTrackNum && inputTrackNum.value ? parseInt(inputTrackNum.value, 10) : null;
    const newComment = (inputComment ? inputComment.value : '').trim();
    const track = s.currentEditingTrack;

    const changes = [];
    const origTitle = (track.title || '').trim();
    const origArtist = (track.artist || '').trim();
    const origAlbum = (track.album || '').trim();
    const origGenre = (track.genre || '').trim();
    const origYear = (track.year && track.year > 0) ? parseInt(track.year, 10) : null;
    const origTrackNum = (track.track || track.track_num) ? parseInt(track.track || track.track_num, 10) : null;
    const origComment = (track.comment || '').trim();

    if (newTitle !== origTitle) changes.push({ field: 'Title', from: origTitle || '(empty)', to: newTitle });
    if (newArtist !== origArtist) changes.push({ field: 'Artist', from: origArtist || '(empty)', to: newArtist || '(empty)' });
    if (newAlbum !== origAlbum) changes.push({ field: 'Album', from: origAlbum || '(empty)', to: newAlbum || '(empty)' });
    if (newGenre !== origGenre) changes.push({ field: 'Genre', from: origGenre || '(empty)', to: newGenre || '(empty)' });
    if (newYear !== origYear) changes.push({ field: 'Year', from: origYear ? String(origYear) : '(empty)', to: newYear ? String(newYear) : '(empty)' });
    if (newTrackNum !== origTrackNum) changes.push({ field: 'Track #', from: origTrackNum ? String(origTrackNum) : '(empty)', to: newTrackNum ? String(newTrackNum) : '(empty)' });
    if (newComment !== origComment) changes.push({ field: 'Comment', from: origComment || '(empty)', to: newComment || '(empty)' });

    if (pendingCover && pendingCover.preview && pendingCover.preview !== originalTrackCover) {
        changes.push({
            field: 'Cover Art',
            isCover: true,
            from: originalTrackCover || 'resources/images/default.svg',
            to: pendingCover.preview
        });
    }

    pendingMetadataPayload = {
        newTitle,
        newArtist,
        newAlbum,
        newGenre,
        newYear,
        newTrackNum,
        newComment,
        pendingCover,
        targetTrack: track
    };

    if (confirmDesc) {
        confirmDesc.textContent = `Save ${changes.length} tag change${changes.length === 1 ? '' : 's'} for "${origTitle || track.filename || 'track'}"?`;
    }

    if (confirmSummary) {
        if (changes.length === 0) {
            confirmSummary.innerHTML = '<div class="metaEditNoChanges">No fields were modified. File tags already match.</div>';
        } else {
            confirmSummary.innerHTML = changes.map(ch => {
                if (ch.isCover) {
                    return `
                        <div class="metaEditChangeRow metaEditCoverChangeRow">
                            <span class="metaEditChangeField">${escapeHtml(ch.field)}</span>
                            <span class="metaEditCoverPreviewCon">
                                <img id="metaEditMiniThumbOrig" src="${escapeHtml(ch.from)}" class="metaEditMiniThumb" alt="Original Cover">
                                <span class="metaEditChangeArrow" aria-hidden="true">➔</span>
                                <img id="metaEditMiniThumbNew" src="${escapeHtml(ch.to)}" class="metaEditMiniThumb" alt="New Cover">
                            </span>
                        </div>
                    `;
                }
                return `
                    <div class="metaEditChangeRow">
                        <span class="metaEditChangeField">${escapeHtml(ch.field)}</span>
                        <span class="metaEditChangeFrom" title="${escapeHtml(ch.from)}">${escapeHtml(ch.from)}</span>
                        <span class="metaEditChangeArrow" aria-hidden="true">➔</span>
                        <span class="metaEditChangeTo" title="${escapeHtml(ch.to)}">${escapeHtml(ch.to)}</span>
                    </div>
                `;
            }).join('');
        }
    }

    if (form) form.style.display = 'none';
    if (confirmCard) confirmCard.style.display = 'flex';
    const card = document.getElementById('metaEditorCard');
    if (card) card.scrollTop = 0;
}

function cancelMetadataConfirmation() {
    const form = document.getElementById('metaEditorForm');
    const confirmCard = document.getElementById('metaEditorConfirmCard');
    if (confirmCard) confirmCard.style.display = 'none';
    if (form) form.style.display = 'block';
}

async function executeSaveMetadata() {
    const s = store.state;
    if (!pendingMetadataPayload || !pendingMetadataPayload.targetTrack) {
        cancelMetadataConfirmation();
        return;
    }

    const {
        newTitle,
        newArtist,
        newAlbum,
        newGenre,
        newYear,
        newTrackNum,
        newComment,
        pendingCover: chosenCover,
        targetTrack
    } = pendingMetadataPayload;

    const proceedBtn = document.getElementById('metaEditConfirmProceedBtn');
    const cancelConfirmBtn = document.getElementById('metaEditConfirmCancelBtn');

    if (proceedBtn) {
        proceedBtn.disabled = true;
        proceedBtn.textContent = 'SAVING...';
    }
    if (cancelConfirmBtn) cancelConfirmBtn.disabled = true;

    let coverDataPayload = null;
    if (chosenCover) {
        if (chosenCover.dataUrl) {
            coverDataPayload = chosenCover.dataUrl;
        } else if (chosenCover.url) {
            try {
                coverDataPayload = await convertImageUrlToDataUrl(chosenCover.url);
            } catch (_) {}
            if (!coverDataPayload) coverDataPayload = chosenCover.url;
        }
    }

    const tid = targetTrack.tid || targetTrack.id || null;
    if (getRuntime().hasPhpBackend && tid && !String(tid).startsWith('local_') && typeof fetch === 'function') {
        try {
            const postPayload = {
                tid,
                title: newTitle,
                artist: newArtist,
                album: newAlbum,
                genre: newGenre,
                year: newYear,
                track_num: newTrackNum,
                comment: newComment
            };
            if (coverDataPayload && coverDataPayload.startsWith('data:image/')) {
                postPayload.cover_data = coverDataPayload;
            }
            const resp = await fetch('php/api/metadata.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(postPayload)
            });
            if (resp.ok) await resp.json().catch(() => null);
        } catch (netErr) {
            console.warn('Backend metadata persistence skipped or offline:', netErr);
        }
    }

    const updatedFields = {
        title: newTitle,
        artist: newArtist,
        album: newAlbum,
        genre: newGenre,
        year: newYear,
        track: newTrackNum,
        track_num: newTrackNum,
        comment: newComment
    };
    if (coverDataPayload) {
        updatedFields.cover = coverDataPayload;
        updatedFields.has_cover = 1;
        updatedFields.hasCover = true;
    }

    Object.assign(targetTrack, updatedFields);

    const updateInList = (list) => {
        if (!Array.isArray(list)) return;
        for (let i = 0; i < list.length; i++) {
            const t = list[i];
            if ((targetTrack.tid && t.tid === targetTrack.tid) ||
                (targetTrack.fullPath && t.fullPath === targetTrack.fullPath) ||
                (targetTrack.id && t.id === targetTrack.id)) {
                Object.assign(t, updatedFields);
            }
        }
    };

    updateInList(s.allTracks);
    updateInList(s.displayedTracks);
    updateInList(s.playQueue);

    await saveMetadataOverride(getTrackKey(targetTrack), updatedFields);
    if (Array.isArray(s.allTracks) && s.allTracks.length > 0) {
        await saveLibraryToLocalDb(s.allTracks, (folderPathInput && folderPathInput.value) || '');
    }

    const activeTrack = (Array.isArray(s.allTracks) && s.allTracks[s.currentTrackIndex]) || null;
    const isCurrentPlaying = activeTrack && (
        (targetTrack.tid && activeTrack.tid === targetTrack.tid) ||
        (targetTrack.fullPath && activeTrack.fullPath === targetTrack.fullPath) ||
        (targetTrack.id && activeTrack.id === targetTrack.id)
    );

    if (isCurrentPlaying) {
        if (trackName) trackName.textContent = newTitle;
        if (artistName) artistName.textContent = newArtist || 'Unknown Artist';
        if (albumName) albumName.textContent = newAlbum || 'Unknown Album';
        if (lyricsTrackName) lyricsTrackName.textContent = newTitle;
        if (lyricsArtistName) lyricsArtistName.textContent = newArtist || 'Unknown Artist';
        if (miniTitle) miniTitle.textContent = newTitle;
        if (miniArtist) miniArtist.textContent = newArtist || 'Unknown Artist';

        if (coverDataPayload) {
            const turntableCover = document.getElementById('turntableCover') || document.getElementById('currentCover');
            if (turntableCover) turntableCover.src = coverDataPayload;
            updateAmbientLighting(coverDataPayload);
        }
        mediaSessionController.updateMetadata(targetTrack);
    }

    updateTrackMetadataDisplay(targetTrack);
    renderVirtualTrackWindow(true);
    updateQueueUi();
    closeMetadataEditor();
    showToast(coverDataPayload ? `Metadata & cover saved: "${newTitle}"` : `Metadata saved: "${newTitle}"`);
}

function saveMetadata(e) {
    return requestSaveMetadataConfirmation(e);
}

// =========================================================================
// Add Track to Playlist Modal
// =========================================================================
function openAddToPlaylistModal(track) {
    const s = store.state;
    s.selectedTrackForPlaylist = track;
    if (modalTrackTitle) modalTrackTitle.textContent = `${track.title || track.filename} — ${track.artist || 'Unknown'}`;
    if (!modalPlaylistList) return;
    modalPlaylistList.innerHTML = '';

    const quickActions = document.createElement('div');
    quickActions.className = 'modalQuickQueueActions';
    quickActions.innerHTML = `
        <button type="button" class="modalQuickQueueBtn" id="modalPlayNextBtn">⤹ Play Next</button>
        <button type="button" class="modalQuickQueueBtn" id="modalAddQueueBtn">+ Add to Queue</button>
    `;
    quickActions.querySelector('#modalPlayNextBtn').addEventListener('click', () => {
        addToQueue(track, true);
        closePlaylistModal();
        showToast(`Added to Play Next: "${track.title || track.filename}"`);
    });
    quickActions.querySelector('#modalAddQueueBtn').addEventListener('click', () => {
        addToQueue(track, false);
        closePlaylistModal();
        showToast(`Added to Up Next Queue: "${track.title || track.filename}"`);
    });
    modalPlaylistList.appendChild(quickActions);

    if (s.playlists.length === 0) {
        const emptyNotice = document.createElement('div');
        emptyNotice.className = 'modalPlaylistEmpty';
        emptyNotice.textContent = 'No playlists yet. Create your first one below:';
        modalPlaylistList.appendChild(emptyNotice);
    } else {
        s.playlists.forEach(pl => {
            const item = document.createElement('div');
            item.className = 'modalPlaylistItem';
            item.innerHTML = `
                <span class="modalPlaylistInfo"><span class="modalPlaylistName">${escapeHtml(pl.name)}</span> <span class="modalPlaylistCount">(${pl.track_count || 0} tracks)</span></span>
                <button type="button" class="modalPlaylistAddBtn" data-plid="${pl.plid}">+ ADD</button>
            `;

            const btn = item.querySelector('.modalPlaylistAddBtn');
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.textContent = 'ADDING...';
                const success = await addTrackToPlaylist(pl.plid, track.tid || track.id, track);
                if (success) {
                    btn.textContent = '✓ ADDED';
                    btn.style.backgroundColor = '#00e676';
                    btn.style.color = '#000000';
                    setTimeout(() => closePlaylistModal(), 700);
                } else {
                    btn.textContent = 'ALREADY IN PLAYLIST';
                    btn.style.backgroundColor = '#fff3e0';
                    btn.style.color = '#e65100';
                    btn.style.fontSize = '0.75rem';
                    btn.disabled = false;
                }
            });

            modalPlaylistList.appendChild(item);
        });
    }

    if (playlistModal) playlistModal.style.display = 'flex';
    pushModalState('playlistModal');
    setTimeout(() => {
        if (modalNewPlaylistName) modalNewPlaylistName.focus();
    }, 100);
}

function closePlaylistModal() {
    if (playlistModal) playlistModal.style.display = 'none';
    popModalState('playlistModal');
    store.state.selectedTrackForPlaylist = null;
    if (modalNewPlaylistName) modalNewPlaylistName.value = '';
}

async function addTrackToPlaylist(plid, tid, track = null) {
    const s = store.state;
    const p = s.playlists.find(x => String(x.plid) === String(plid));
    const plName = p ? p.name : 'playlist';
    const trName = track ? (track.title || track.filename) : 'Track';

    if (getRuntime().hasPhpBackend && !String(plid).startsWith('local_pl_') && !String(tid).startsWith('local_')) {
        try {
            const res = await fetch('php/api/playlists.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'add_track', plid, tid })
            });
            const data = await res.json();
            if (data.success) {
                if (p) p.track_count = (p.track_count || 0) + 1;
                await saveLocalPlaylists(s.playlists);
                renderPlaylistsView();
                showToast(`Added "${trName}" to "${plName}".`);
                return true;
            }
            if (data.message === 'Track already in playlist.') {
                showToast(`"${trName}" is already in "${plName}".`);
            } else {
                showToast(data.message || 'Could not add to playlist.');
            }
            return false;
        } catch (e) {
            console.warn('Add track to playlist PHP API error:', e);
            return false;
        }
    }

    if (!p) return false;
    if (!Array.isArray(p.tracks)) p.tracks = [];
    const key = getTrackKey(track) || String(tid);
    if (p.tracks.includes(key)) {
        showToast(`"${trName}" is already in "${plName}".`);
        return false;
    }
    p.tracks.push(key);
    p.track_count = p.tracks.length;
    await saveLocalPlaylists(s.playlists);
    try { safeStorage.setItem('cachymusic_cached_playlists', JSON.stringify(s.playlists)); } catch (_) {}
    renderPlaylistsView();
    showToast(`Added "${trName}" to "${plName}".`);
    return true;
}

async function removeTrackFromCurrentPlaylist(track) {
    const s = store.state;
    if (!s.currentPlaylistId || !track) return;
    const plid = s.currentPlaylistId;
    const tid = track.tid || track.id;

    if (getRuntime().hasPhpBackend && !String(plid).startsWith('local_pl_') && !String(tid).startsWith('local_')) {
        try {
            await fetch('php/api/playlists.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove_track', plid, tid })
            });
        } catch (e) {
            console.warn('Remove track API error:', e);
        }
    }

    track.inCurrentPlaylist = false;
    const p = s.playlists.find(x => String(x.plid) === String(plid));
    if (p) {
        if (Array.isArray(p.tracks)) {
            const k = getTrackKey(track);
            p.tracks = p.tracks.filter(x => String(x) !== k && String(x) !== String(tid));
            p.track_count = p.tracks.length;
        } else if (p.track_count > 0) {
            p.track_count--;
        }
    }
    await saveLocalPlaylists(s.playlists);
    applySearchAndSort();
}

store.subscribe('library:render-window', (e) => renderVirtualTrackWindow(Boolean(e?.detail?.preserveScroll ?? true)));
store.subscribe('library:scroll-to-index', (e) => {
    if (e?.detail) scrollToTrackIndex(e.detail.index, Boolean(e.detail.active));
});
store.subscribe('library:update-queue', () => updateQueueUi());

export {
    addToQueue,
    addTrackToPlaylist,
    applyFoundCover,
    applySearchAndSort,
    autoFindCoverOnline,
    backToAllTracks,
    backToPlaylistsView,
    cancelMetadataConfirmation,
    clearQueue,
    closeBatchAddModal,
    closeMetadataEditor,
    closePlaylistModal,
    closeSlskAccountModal,
    closeTrackActionMenu,
    convertImageUrlToDataUrl,
    createPlaylist,
    deletePlaylistById,
    executeSaveMetadata,
    formatPlaylistEstDuration,
    getLibraryWorker,
    getTrackSearchString,
    handleCoverFileSelect,
    importLocalAudioFiles,
    initTrackListDelegation,
    initVirtualScrollListener,
    loadLibraryFromLocalDb as loadLibraryFromIndexedDB,
    loadPlaylists,
    moveQueueItem,
    normalizeGenre,
    openAddToPlaylistModal,
    openBatchAddModal,
    openMetadataEditor,
    openPlaylist,
    openSlskAccountModal,
    openTrackActionMenu,
    parseAudioFileMetadata,
    playPlaylistDirectly,
    promptLocalDirectoryOrFiles,
    queuePlaylistTracks,
    removeFromQueue,
    removeTrackFromCurrentPlaylist,
    removeTrackFromMainList,
    renderPlaylistsView,
    renderQueueView,
    renderTrackList,
    renderVirtualTrackWindow,
    requestSaveMetadataConfirmation,
    revertCover,
    saveLibraryToLocalDb as saveLibraryToIndexedDB,
    saveMetadata,
    scanDirectory,
    scrollToTrackIndex,
    searchCoverOnline,
    setScanStatus,
    updateQueueUi,
    updateRestoreBtnUi,
    updateTrackMetadataDisplay
};
