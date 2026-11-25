import {startPlaylistSession, playbackPool, playlistNeighbor} from './playlist-playback.js';
import {buildPlaylistLookupIndex, buildPlaylistLookupIndexAsync, buildPlaylistMutationIndex, preparePlaylistEdit, trackKey, canonicalizeMembership, memberLookupKey, isServerPlaylist, resolvePlaylistMembers, playlistSummary, moveMember, replacementMember, rebasePlaylistDraft, createPlaylistPickerIndex, createPlaylistPickerIndexAsync, searchPlaylistTracksAsync, classifyPlaylistSelection} from './playlist-model.js';
import {createMetadataEditor} from './metadata-editor.js';
import {findTrackIndex, mergeTracks, dismissalKey} from './track-session.js';
import { createLibraryQueryController } from './library-query-controller.js';
import { queryLibrary } from './library-query.js';
import { uiIcon } from './icons.js';
import { createIndexer } from './indexing-client.js';
import { createArtworkPrefetcher, resolveTrackThumbUrl } from './artwork-loader.js';
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
    switchWorkspace,
    tabLibrary,
    setLibraryTabActive,
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
    mutateLocalPlaylist,
} from './local-library.js';
import { getRuntime } from './runtime-capabilities.js';

const AUDIO_EXT_RE = /\.(mp3|flac|wav|wave|ogg|oga|m4a|aac|opus|webm|alac|aif|aiff)$/i;

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

    showTrackLoadingOverlay('IMPORTING AUDIO FILES...', `Indexing ${items.length} local audio file${items.length === 1 ? '' : 's'}...`, 0);
    setScanStatus(`Parsing metadata for ${items.length} audio file${items.length === 1 ? '' : 's'}...`, false);

    const overrides = await loadAllMetadataOverrides();
    const parsedTracks = [];
    const indexer=createIndexer();
    for (let i = 0; i < items.length; i++) {
        if (s.isTrackLoadingCancelled) break;
        const { file, relativePath } = items[i];
        try {
            const meta = await indexer.parse(file);
            const rel = relativePath || file.webkitRelativePath || file.name;
            const localId = stableHashKey(`${rel}:${file.size}:${file.lastModified}`);
            const ov = overrides.get(localId) || {};
            const track = {
                ...meta,
                id: localId,
                tid: localId,
                filename: file.name,
                fullPath: rel,
                src: null,
                _fileBlob: file,
                ...ov
            };
            parsedTracks.push(track);
        } catch (err) {
            console.warn('[LocalImport] Skipped file:', file?.name, err);
        }
        if ((i + 1) % 8 === 0 || i + 1 === items.length) {
            updateTrackLoadingOverlay(`Processed ${i + 1} of ${items.length} files`, (i + 1) / items.length * 100);
        }
    }

    indexer.dispose();
    hideTrackLoadingOverlay();
    if (parsedTracks.length === 0) {
        setScanStatus(s.isTrackLoadingCancelled ? "Import cancelled; no files added." : "No files could be imported. Check that they are readable audio files.", !s.isTrackLoadingCancelled);
        updateEmptyPlayerState();
        return [];
    }

    // Imports add to an existing local library rather than replacing it.
    const active=s.currentTrack || s.allTracks[s.currentTrackIndex];
    s.allTracks=mergeTracks(s.allTracks, parsedTracks, t=>s.dismissedTracksMap.has(dismissalKey(t)));
    if(active){const i=findTrackIndex(s.allTracks,active);if(i>=0)s.currentTrackIndex=i;}

    const label = dirLabel || 'Local Music';
    if (folderPathInput) folderPathInput.value = label;
    const settingsInput = document.getElementById('settingsTabFolderPathInput');
    if (settingsInput) settingsInput.value = label;

    try {
        safeStorage.setItem('cachymusic_last_directory', label);
        safeStorage.setItem('cachymusic_directory_mode', 'local');
    } catch (_) {}

    const saved=await saveLibraryToLocalDb(s.allTracks,label);
    if(!saved)showToast("Library storage unavailable; files remain in this session only.");
    setScanStatus(`${s.isTrackLoadingCancelled ? "Import cancelled. " : "Import finished. "}${parsedTracks.length} files read; ${s.allTracks.length} tracks in library.${saved ? "" : " Changes are session-only."}`, false);
    updateEmptyPlayerState();
    applySearchAndSort();

    if (autoSelect && !active && s.allTracks.length > 0 && !s.isPlaying) {
        loadTrack(0, false);
        if (s.isLyricsView) updateLyricsDisplay(s.allTracks[0]);
    }
    return s.allTracks;
}

async function promptLocalDirectoryOrFiles() {
    if (typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function') {
        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
            const handlePersisted = await saveDirectoryHandle(dirHandle);
            if (!handlePersisted) showToast('Folder access cannot be saved for next launch; audio files will still import now.');
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
                    ? cached.tracks.filter(t => !s.dismissedTracksMap.has(dismissalKey(t)))
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
                    ? data.tracks.filter(t => !s.dismissedTracksMap.has(dismissalKey(t)))
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
async function loadPlaylists() { return serializePlaylist(loadPlaylistsInternal); }
async function loadPlaylistsInternal() {
    const s=store.state, local=await loadLocalPlaylists(null);
    // A failed local read is not an empty library. Keep previously loaded local records.
    const locals=(Array.isArray(local)?local:s.playlists).filter(p=>String(p.plid).startsWith('local_pl_'));
    let remote=[];
    if(getRuntime().hasPhpBackend) {
        try { const response=await playlistFetch('php/api/playlists.php',{cache:'no-store'}); if(!response.success||!Array.isArray(response.playlists))throw Error('Playlist read failed'); remote=response.playlists; }
        catch(e){showToast('Desktop playlists unavailable. Local playlists are preserved.');}
    }
    // Do not persist server records in a browser cache shared across accounts.
    // Keep legacy cached records on disk; never overwrite or migrate them implicitly.
    s.playlists=[...remote,...locals];if(s.currentPlaylistId!==null&&!s.playlists.some(p=>String(p.plid)===String(s.currentPlaylistId)))backToPlaylistsView();renderPlaylistsView();return s.playlists;
}

async function createPlaylist(name, initialTrack=null) {return serializePlaylist(()=>createPlaylistInternal(name,initialTrack));}
export function playlistNavigationToken(){return playlistOpenGeneration;}
async function createPlaylistInternal(name,initialTrack=null) {
    const s = store.state;
    const cleanName = (name || '').trim();
    if (!cleanName || cleanName.length>50) {showToast('Enter a playlist name (1–50 characters).');return null;}
    if(s.playlists.some(p=>String(p.name).toLowerCase()===cleanName.toLowerCase())){showToast('A playlist with that name already exists.');return null;}

    const key=trackKey(initialTrack);if(initialTrack&&(!key||buildPlaylistLookupIndex(s.allTracks,[key]).get(key)!==initialTrack))throw Error('Track is no longer available.');
    if (getRuntime().hasPhpBackend) {
        if(initialTrack&&!/^tid:[1-9]\d*$/.test(key))throw Error('This track is local-only.');
        try {
            const data=await playlistRequest('create',{name:cleanName,tracks:initialTrack?[initialTrack.tid]:[]});
            if (data.success && (data.playlist || data.plid)) {
                const created = data.playlist;if(!created)throw Error('Creation outcome needs a reload.');
                if(!s.playlists.some(p=>String(p.plid)===String(created.plid)))s.playlists.push(created);
                renderPlaylistsView();
                return created;
            }
            if (data.message) showToast(data.message);
            return null;
        } catch (err) {
            showToast('Could not create playlist. Check the desktop connection.');return null;
        }
    }

    const exists = s.playlists.some(p => (p.name || '').toLowerCase() === cleanName.toLowerCase());
    if (exists) {
        showToast(`Playlist "${cleanName}" already exists.`);
        return null;
    }
    const newPl = {
        plid: `local_pl_${globalThis.crypto?.randomUUID?.() || Date.now()+"_"+Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join("_")}`,
        revision: 0,
        name: cleanName,
        tracks: initialTrack?[key]:[],
        track_count: initialTrack?1:0
    };
    if(!await mutateLocalPlaylist(null,newPl)){showToast('Playlist could not be saved.');return null;}
    s.playlists.push(newPl);
    
    renderPlaylistsView();
    return newPl;
}

function getTrackSearchString(t) {
    const title = t.title || '';
    const artist = t.artist || '';
    const album = t.album || '';
    const rawGenre = t.genre || '';
    const normGenre = normalizeGenre(rawGenre);
    const genrePart = normGenre ? (rawGenre.toLowerCase() !== normGenre.toLowerCase() ? `${rawGenre} ${normGenre}` : rawGenre) : rawGenre;
    const filename = t.filename || '';
    return `${title} ${artist} ${album} ${genrePart} ${filename}`.toLowerCase();
}

let libraryWorkerRequestId = 0;
let displayedIndexMap = new WeakMap();
let cachedQuerySource = null;
let cachedQueryLength = -1;
let cachedQueryPlaylistId = null;
let cachedQueryRecords = null;

function rebuildDisplayedIndexMap(tracks) {
    const map = new WeakMap();
    if (Array.isArray(tracks)) {
        for (let i = 0; i < tracks.length; i++) {
            const t = tracks[i];
            if (t && typeof t === 'object' && !map.has(t)) map.set(t, i);
        }
    }
    displayedIndexMap = map;
}

function getDisplayedTrackIndex(track) {
    if (!track || typeof track !== 'object') return -1;
    const s = store.state;
    const mapped = displayedIndexMap.get(track);
    if (mapped !== undefined && s.displayedTracks[mapped] === track) return mapped;
    return findTrackIndex(s.displayedTracks, track);
}

function publishTrackQuery(tracks) {
    store.state.displayedTracks = tracks;
    rebuildDisplayedIndexMap(tracks);
    store.emit('playback:order-change');
    renderTrackList();
}

function queryTracks(tracks) {
    const plId = store.state.currentPlaylistId;
    if (tracks === cachedQuerySource && tracks.length === cachedQueryLength && plId === cachedQueryPlaylistId && cachedQueryRecords) {
        return cachedQueryRecords;
    }
    const records = tracks.map((track, index) => ({
        index,
        title: track.title || track.filename || '',
        artist: track.artist || 'Unknown',
        album: track.album || 'Unknown',
        genre: `${track.genre || ''} ${track.genre ? normalizeGenre(track.genre) || '' : ''}`.toLowerCase(),
        extension: (track.filename || '').split('.').pop().toLowerCase(),
        format: (track.format || '').toLowerCase(),
        sampleRate: Number(track.sampleRate) || 0,
        bitDepth: Number(track.bitDepth) || 0,
        duration: Number(track.duration) || 0,
        year: parseInt(track.year, 10) || 0,
        inCurrentPlaylist: Boolean(track.inCurrentPlaylist),
        search: getTrackSearchString(track)
    }));
    cachedQuerySource = tracks;
    cachedQueryLength = tracks.length;
    cachedQueryPlaylistId = plId;
    cachedQueryRecords = records;
    return records;
}

const libraryQueries = createLibraryQueryController({
    createWorker: () => new Worker(new URL('./library-query-worker.js', import.meta.url), {type:'module'}),
    prepare: job => queryTracks(job.tracks),
    query: queryLibrary,
    isCurrent: job => job.id === libraryWorkerRequestId && job.tracks === store.state.allTracks,
    publish: (job, indices) => publishTrackQuery(indices.map(index => job.tracks[index]))
});

function applySearchAndSort(index = null) {
    const s = store.state;
    const id = ++libraryWorkerRequestId;
    const pl=s.playlists.find(p=>String(p.plid)===String(s.currentPlaylistId));
    if(s.currentPlaylistId!==null && pl && Array.isArray(pl.tracks)) {
        const ordered=resolvePlaylistMembers(pl.tracks,index instanceof Map ? index : s.allTracks,serverPlaylist(pl.plid)), members=new Set(ordered);
        s.allTracks.forEach(t=>{t.inCurrentPlaylist=members.has(t);});
        libraryQueries.cancelPending();
        const indices=queryLibrary(queryTracks(ordered),{query:s.searchQuery,sort:'default',formatFilter:s.currentFormatFilter,playlist:false});
        publishTrackQuery(indices.map(i=>ordered[i]));return;
    }
    const tracks = s.allTracks;
    const options = {query:s.searchQuery, sort:s.currentSort, formatFilter:s.currentFormatFilter, playlist:s.currentPlaylistId !== null};
    if (!options.query.trim() && options.sort === 'default' && options.formatFilter === 'all' && !options.playlist) {
        libraryQueries.cancelPending();
        publishTrackQuery(tracks.slice());
        return;
    }
    libraryQueries.submit({id, tracks, options}, tracks.length > 200 && typeof Worker === 'function');
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
    const idxInAll = findTrackIndex(s.allTracks, track);
    if (idxInAll === -1) return;

    const removedTrack = s.allTracks[idxInAll];
    const key = dismissalKey(removedTrack);
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
            if (!s.dismissedTracksMap.delete(key)) return;
            if (findTrackIndex(s.allTracks, removedTrack) >= 0) return;
            const active = s.allTracks[s.currentTrackIndex];
            const insertIdx = Math.min(idxInAll, s.allTracks.length);
            s.allTracks.splice(insertIdx, 0, removedTrack);
            if (active) s.currentTrackIndex = findTrackIndex(s.allTracks, active);
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
        if (e.target.closest('#emptyTrackSearchResetBtn')) {
            s.searchQuery = ''; s.currentFormatFilter = 'all';
            const search = document.getElementById('trackSearch');
            if (search) { search.value = ''; search.dispatchEvent(new Event('input', {bubbles:true})); }
            document.querySelectorAll('.formatFilterPill').forEach(pill=>{
                const selected = pill.dataset.filter === 'all'; pill.classList.toggle('active',selected); pill.setAttribute('aria-pressed',String(selected));
            });
            applySearchAndSort(); search?.focus({preventScroll:true}); return;
        }
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
            openBatchAddModal();
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

        const item = e.target.closest('.trackItem');
        if (item && !e.target.closest('.trackMenuTriggerBtn')) {
            const idx = parseInt(item.dataset.index, 10);
            const track = s.displayedTracks[idx];
            if (track) {
                const masterIdx = findTrackIndex(s.allTracks, track);
                if (masterIdx !== -1) {
                    const proposed={};
                    if(s.currentPlaylistId!==null){const pl=s.playlists.find(p=>String(p.plid)===String(s.currentPlaylistId));if(!pl||!startPlaylistSession(proposed,pl.plid,resolvePlaylistMembers(pl.tracks,s.allTracks,serverPlaylist(pl.plid)),s.isShuffle,track))return;}
                    // Instant 0ms visual feedback on tap/click before async audio start.
                    const container = document.getElementById('trackItemsContainer');
                    if (container) {
                        for (const prev of container.querySelectorAll('.trackItem.active')) {
                            prev.classList.remove('active');
                            prev.querySelector('.trackDetails')?.removeAttribute('aria-current');
                        }
                    }
                    item.classList.add('active', 'is-selecting');
                    item.querySelector('.trackDetails')?.setAttribute('aria-current', 'true');
                    setTimeout(() => item.classList.remove('is-selecting'), 180);
                    if (miniTitle) miniTitle.textContent = track.title || track.filename || 'Unknown Track';
                    if (miniArtist) miniArtist.textContent = track.artist || 'Unknown Artist';
                    if (trackName) {
                        const span = trackName.querySelector('.marqueeContent');
                        if (span) span.textContent = track.title || track.filename || 'Unknown';
                        else trackName.textContent = track.title || track.filename || 'Unknown';
                    }
                    if (artistName) {
                        const span = artistName.querySelector('.marqueeContent');
                        if (span) span.textContent = track.artist || 'Unknown';
                        else artistName.textContent = track.artist || 'Unknown';
                    }
                    void loadTrack(masterIdx,true,0,null,false,false,proposed.playlistPlayback??null,null,{fromClick:true}).then(()=>store.emit('playback:order-change'));
                }
            }
        }
    });
}

// =========================================================================
// Windowed track list: render a bounded viewport plus overscan.
// =========================================================================
const MIN_TRACK_ROW_HEIGHT = 64;
const VIRTUAL_BUFFER_ROWS = 4;
const renderedTrack = new WeakMap();
const artworkPrefetcher = createArtworkPrefetcher();
const rowPool = [];
const MAX_ROW_POOL = 48;
let cachedRootRowHeight = 0;
let trackListNeedsRender = false;
let playlistsDirty = false;
let lastTrackScrollPreserve = false;
let lastScrollTop = 0;
let lastScrollTime = 0;
let lastScrollDir = 1;
let lastScrollVelocity = 0;

function computeTrackRowHeight() {
    const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    cachedRootRowHeight = Math.max(MIN_TRACK_ROW_HEIGHT, Number.isFinite(rootSize) ? Math.ceil(rootSize * 4) : MIN_TRACK_ROW_HEIGHT);
    return cachedRootRowHeight;
}
function getTrackRowHeight() {
    return cachedRootRowHeight || computeTrackRowHeight();
}

function isTrackListViewportVisible() {
    if (!trackList || trackList.style.display === 'none') return false;
    return trackList.getClientRects().length > 0 && trackList.clientHeight > 0;
}

function syncActiveTrackHighlight() {
    const s = store.state;
    const container = document.getElementById('trackItemsContainer');
    if (!container) return;
    const cur = s.allTracks[s.currentTrackIndex];
    const currentDisplayedIndex = getDisplayedTrackIndex(cur);
    for (const child of Array.from(container.children)) {
        const rowIdx = parseInt(child.dataset.index, 10);
        const isCurrent = !isNaN(rowIdx) && rowIdx === currentDisplayedIndex;
        child.classList.toggle('active', isCurrent);
        const button = child.querySelector('.trackDetails');
        if (isCurrent) button?.setAttribute('aria-current', 'true');
        else button?.removeAttribute('aria-current');
    }
}
function captureTrackFocus(container) {
    const focused = document.activeElement;
    const row = focused?.closest('.trackItem');
    if (!row || !container.contains(row)) return null;
    return {track:renderedTrack.get(row), menu:focused.classList.contains('trackMenuTriggerBtn'), element:focused};
}
function restoreTrackFocus(container, snapshot) {
    if (!snapshot || snapshot.element.isConnected) return;
    const rows = Array.from(container.children);
    // Object identity avoids jumping to a different song with the same filename.
    const row = rows.find(element => renderedTrack.get(element) === snapshot.track);
    const target = row?.querySelector(snapshot.menu ? '.trackMenuTriggerBtn' : '.trackDetails') || trackList;
    target.focus({preventScroll:true});
}
function releaseTrackRow(row) {
    row.remove();
    if (rowPool.length < MAX_ROW_POOL) rowPool.push(row);
}
function acquireTrackRow() {
    if (rowPool.length > 0) return rowPool.pop();
    const item = document.createElement('div');
    item.className = 'trackItem';
    item.innerHTML = `
        <img src="resources/images/default.svg" alt="" class="trackThumb" width="40" height="40" decoding="async">
        <button type="button" class="trackDetails">
            <span class="trackTitle" dir="auto"></span>
            <span class="trackArtist" dir="auto"></span>
        </button>
        <span class="trackDuration" dir="ltr"></span>
        <button type="button" class="trackMenuTriggerBtn" title="Track options">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="2.2"></circle>
                <circle cx="12" cy="12" r="2.2"></circle>
                <circle cx="12" cy="19" r="2.2"></circle>
            </svg>
        </button>
    `;
    const thumb = item.firstElementChild;
    thumb.addEventListener('error', (e) => {
        if (e.target.dataset.fallbackApplied) return;
        e.target.dataset.fallbackApplied = '1';
        e.target.dataset.boundSrc = 'resources/images/default.svg';
        e.target.src = 'resources/images/default.svg';
    });
    return item;
}
function bindTrackRow(item, track, idx, isCurrent, highPriority) {
    item.className = isCurrent ? 'trackItem active' : 'trackItem';
    item.dataset.id = track.id || track.tid || track.filename || '';
    item.dataset.index = idx;
    renderedTrack.set(item, track);

    const thumbEl = item.children[0];
    const detailsBtn = item.children[1];
    const titleEl = detailsBtn.children[0];
    const artistEl = detailsBtn.children[1];
    const durationEl = item.children[2];
    const menuBtn = item.children[3];

    const rawTitle = track.title || track.filename || 'Unknown';
    const rawArtist = track.artist || 'Unknown';
    const albumSuffix = track.album ? ` • ${track.album}` : '';
    const coverSrc = resolveTrackThumbUrl(track);

    if (thumbEl.dataset.boundSrc !== coverSrc) {
        if (thumbEl.dataset.boundSrc && !artworkPrefetcher.has(coverSrc)) {
            thumbEl.removeAttribute('src');
        }
        thumbEl.dataset.fallbackApplied = '';
        thumbEl.dataset.boundSrc = coverSrc;
        if ('fetchPriority' in thumbEl) thumbEl.fetchPriority = highPriority ? 'high' : 'low';
        thumbEl.src = coverSrc;
    }
    titleEl.textContent = rawTitle;
    artistEl.textContent = `${rawArtist}${albumSuffix}`;
    durationEl.textContent = formatTime(track.duration);

    detailsBtn.setAttribute('aria-label', `Play ${rawTitle}`);
    if (isCurrent) detailsBtn.setAttribute('aria-current', 'true');
    else detailsBtn.removeAttribute('aria-current');

    menuBtn.dataset.index = idx;
    menuBtn.setAttribute('aria-label', `Track options for ${rawTitle}`);
    return item;
}

let isVirtualScrollBound = false;
let isVirtualScrollPending = false;
const virtualTrackState = {
    startIndex: -1,
    endIndex: -1,
    rowHeight: MIN_TRACK_ROW_HEIGHT
};

function renderVirtualTrackWindow(force = false) {
    const s = store.state;
    if (!trackList) return;
    const total = s.displayedTracks.length;
    if (total === 0) return;

    const viewportHeight = trackList.clientHeight || 600;
    const rowHeight = getTrackRowHeight();
    const resized = rowHeight !== virtualTrackState.rowHeight;
    const scrollTop = (trackList.scrollTop || 0) * rowHeight / virtualTrackState.rowHeight;
    if (resized) {
        virtualTrackState.rowHeight = rowHeight;
        trackList.style.setProperty('--track-row-height', `${rowHeight}px`);
        force = true;
    }
    const visibleCount = Math.ceil(viewportHeight / rowHeight);
    const rawStart = Math.min(total - 1, Math.floor(scrollTop / rowHeight));
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

    if (spacerTop) spacerTop.style.height = `${startIndex * rowHeight}px`;
    if (spacerBottom) spacerBottom.style.height = `${Math.max(0, (total - endIndex) * rowHeight)}px`;

    if (!container) return;
    const cur = s.allTracks[s.currentTrackIndex];
    const currentDisplayedIndex = getDisplayedTrackIndex(cur);
    const focusSnapshot = captureTrackFocus(container);

    artworkPrefetcher.prefetchWindow(s.displayedTracks, startIndex, endIndex, lastScrollDir, lastScrollVelocity);

    if (force) {
        while (container.lastElementChild) {
            releaseTrackRow(container.lastElementChild);
        }
        const frag = document.createDocumentFragment();
        for (let idx = startIndex; idx < endIndex; idx++) {
            const track = s.displayedTracks[idx];
            if (!track) continue;
            const highPriority = idx >= rawStart && idx < rawStart + visibleCount;
            frag.appendChild(bindTrackRow(acquireTrackRow(), track, idx, idx === currentDisplayedIndex, highPriority));
        }
        container.appendChild(frag);
        if (resized) trackList.scrollTop = scrollTop;
        restoreTrackFocus(container, focusSnapshot);
        return;
    }

    const existingRows = new Map();
    for (const child of Array.from(container.children)) {
        const rowIdx = parseInt(child.dataset.index, 10);
        const expected = (!isNaN(rowIdx) && rowIdx >= startIndex && rowIdx < endIndex) ? s.displayedTracks[rowIdx] : null;
        if (expected && renderedTrack.get(child) === expected) {
            existingRows.set(rowIdx, child);
            const isCurrent = rowIdx === currentDisplayedIndex;
            child.classList.toggle('active', !!isCurrent);
            const button = child.children[1];
            if (isCurrent) button?.setAttribute('aria-current', 'true');
            else button?.removeAttribute('aria-current');
        } else {
            releaseTrackRow(child);
        }
    }

    for (let idx = startIndex; idx < endIndex; idx++) {
        if (existingRows.has(idx)) continue;
        const track = s.displayedTracks[idx];
        if (!track) continue;
        const highPriority = idx >= rawStart && idx < rawStart + visibleCount;
        const newItem = bindTrackRow(acquireTrackRow(), track, idx, idx === currentDisplayedIndex, highPriority);

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
    restoreTrackFocus(container, focusSnapshot);
}

function initVirtualScrollListener() {
    if (isVirtualScrollBound || !trackList) return;
    isVirtualScrollBound = true;
    trackList.style.overflowAnchor = 'none';
    computeTrackRowHeight();
    trackList.addEventListener('keydown', event => {
        if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const row = event.target.closest('.trackItem');
        if (!row && event.target !== trackList) return;
        const total = store.state.displayedTracks.length;
        if (!total) return;
        const current = row ? Number(row.dataset.index) : Math.floor(trackList.scrollTop / getTrackRowHeight());
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? total-1 : Math.max(0, Math.min(total-1, current + (row ? (event.key === 'ArrowDown' ? 1 : -1) : 0)));
        const selector = event.target.classList.contains('trackMenuTriggerBtn') ? '.trackMenuTriggerBtn' : '.trackDetails';
        event.preventDefault();
        scrollToTrackIndex(next);
        trackList.querySelector(`.trackItem[data-index="${next}"] ${selector}`)?.focus({preventScroll:true});
    });
    trackList.style.setProperty('--track-row-height', `${virtualTrackState.rowHeight}px`);
    trackList.addEventListener('scroll', () => {
        const now = performance.now();
        const top = trackList.scrollTop || 0;
        const dt = Math.max(1, now - (lastScrollTime || now));
        const delta = top - lastScrollTop;
        if (delta !== 0) lastScrollDir = delta > 0 ? 1 : -1;
        lastScrollVelocity = Math.min(8, Math.abs(delta) / dt);
        lastScrollTop = top;
        lastScrollTime = now;
        if (isVirtualScrollPending) return;
        isVirtualScrollPending = true;
        requestAnimationFrame(() => {
            isVirtualScrollPending = false;
            renderVirtualTrackWindow();
        });
    }, { passive: true });
    if (typeof ResizeObserver === 'function') {
        new ResizeObserver(() => {
            computeTrackRowHeight();
            if (isTrackListViewportVisible()) {
                const force = trackListNeedsRender;
                trackListNeedsRender = false;
                renderVirtualTrackWindow(force);
            }
        }).observe(trackList);
    }
}

function scrollToTrackIndex(index, smooth = false) {
    const s = store.state;
    if (!trackList || index < 0 || index >= s.displayedTracks.length) return;
    const rowHeight=getTrackRowHeight();
    if(rowHeight!==virtualTrackState.rowHeight)renderVirtualTrackWindow(true);
    const targetTop = Math.max(0, (index * rowHeight) - (trackList.clientHeight / 2 - rowHeight / 2));
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
        trackCount.textContent = `${s.displayedTracks.length} track${s.displayedTracks.length === 1 ? '' : 's'}`;
    }

    if (!trackList) return;
    if (s.displayedTracks.length === 0) {
        const hadFocus = trackList.contains(document.activeElement);
        trackList.innerHTML = '';
        virtualTrackState.startIndex = -1;
        virtualTrackState.endIndex = -1;
        const hasPlaylistTracks = s.currentPlaylistId !== null && s.allTracks.some(t=>t.inCurrentPlaylist);
        if (s.currentPlaylistId !== null && !hasPlaylistTracks) {
            trackList.innerHTML = `
                <div class="emptyPlaylistNotice">
                    <div class="emptyPlaylistIcon">${uiIcon('music')}</div>
                    <h3 class="emptyPlaylistTitle">${(s.playlists.find(p=>String(p.plid)===String(s.currentPlaylistId))?.tracks?.length||0)>0?'No available songs':`"${escapeHtml(s.currentPlaylistName)}" is empty`}</h3>
                    <p class="emptyPlaylistDesc">Choose songs from your library to start this playlist.</p>
                    <button type="button" class="actionBtn primaryBtn emptyBrowseBtn" id="emptyBrowseTracksBtn">
                        Add songs
                    </button>
                </div>
            `;
        } else if (s.allTracks.length === 0) {
            trackList.innerHTML = `
                <div class="emptyLibraryNotice">
                    <h3 class="emptyPlaylistTitle">Your library is empty</h3>
                    <p class="emptyPlaylistDesc">Choose your music directory or local files first to load tracks. You can also configure folders in <strong>Settings &rarr; Library &amp; Folders</strong>.</p>
                    <div class="emptyLibraryActions">
                        <button type="button" class="actionBtn primaryBtn" id="emptyTrackListChooseDirBtn">Choose music or folder</button>
                        <button type="button" class="actionBtn" id="emptyTrackListOpenSettingsBtn">Library settings</button>
                    </div>
                </div>
            `;
        } else {
            trackList.innerHTML = `
                <div class="emptyTrackSearchHint" style="padding: 2.5rem 1rem; text-align: center; color: var(--text-muted); font-size: var(--font-base);">
                    <h3 class="emptyPlaylistTitle">No matching tracks</h3>
                    <p>Try a different search or clear the format filter.</p>
                    <button type="button" class="actionBtn" id="emptyTrackSearchResetBtn">Clear search and filters</button>
                </div>
            `;
        }
        if (hadFocus) trackList.focus({preventScroll:true});
        return;
    }

    if (!isTrackListViewportVisible()) {
        trackListNeedsRender = true;
        lastTrackScrollPreserve = preserveScroll;
        return;
    }
    trackListNeedsRender = false;

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

function playlistViewIndex(library, playlists, extraKeys = []) {
    const keys=new Set(extraKeys);
    for(const p of playlists) for(const key of p.tracks||[]) keys.add(memberLookupKey(key,serverPlaylist(p.plid)));
    return buildPlaylistLookupIndex(library,keys);
}
function renderPlaylistsView(sharedIndex = null) {
    const s=store.state;if(!playlistList)return;
    if (playlistsView && playlistsView.style.display === 'none') {
        playlistsDirty = true;
        return;
    }
    playlistsDirty = false;
    const search=document.getElementById('playlistSearchInput');
    if(search)search.oninput=renderPlaylistsView;
    const clearSearch=document.getElementById('playlistSearchClear');if(clearSearch){clearSearch.hidden=!search?.value;clearSearch.onclick=()=>{search.value='';renderPlaylistsView();search.focus();};}
    const query=(search?.value||'').trim().toLowerCase();
    playlistList.replaceChildren();
    const summary=document.getElementById('playlistsSummaryBadge');if(summary)summary.textContent=`${s.playlists.length} ${s.playlists.length===1?'playlist':'playlists'}`;
    const visible=s.playlists.filter(p=>String(p.name).toLowerCase().includes(query));
    if(!visible.length){playlistList.textContent=s.playlists.length?'No matching playlists.':'Create a playlist above, then add music from your library.';return;}
    const index=sharedIndex instanceof Map ? sharedIndex : playlistViewIndex(s.allTracks,visible);
    for(const pl of visible){
        const stats=playlistSummary(pl,index), row=document.createElement('div');row.className='playlistBrowseRow';
        const open=document.createElement('button');open.type='button';open.className='playlistOpenBtn';
        open.innerHTML=`<span class="playlistCardArtwork" aria-hidden="true">${uiIcon('music')}</span><span class="playlistBrowseInfo"><strong dir="auto">${escapeHtml(pl.name)}</strong><small>${escapeHtml(stats.text)}</small></span><span aria-hidden="true">›</span>`;
        open.addEventListener('click',()=>void openPlaylist(pl.plid,pl.name));
        const play=document.createElement('button');play.type='button';play.className='actionBtn playlistRowPlay';play.textContent='Play';play.setAttribute('aria-label',`Play ${pl.name}`);play.disabled=stats.tracks.length===0;play.addEventListener('click',()=>void playPlaylistDirectly(pl.plid,pl.name));
        row.append(open,play);playlistList.append(row);
    }
}

async function deletePlaylistById(plid, plName = 'playlist') {return serializePlaylist(()=>deletePlaylistInternal(plid,plName));}
async function deletePlaylistInternal(plid, plName) {
    const s = store.state;
    const original=s.playlists.find(p=>String(p.plid)===String(plid));if(!original)return false;
    if (serverPlaylist(plid)) {
        if(!getRuntime().hasPhpBackend){showToast('Connect to the desktop service to delete this playlist.');return false;}
        try {
            const data=await playlistRequest('delete',{plid,revision:original.revision??0});
            if (!data.success) {showToast(data.message||'Could not delete playlist.');return false;}
        } catch (err) {
            showToast('Could not delete playlist.');
            return false;
        }
    }

    const remaining=s.playlists.filter(p=>String(p.plid)!==String(plid));
    const saved=serverPlaylist(plid)||await mutateLocalPlaylist(original,null);if(!saved){showToast('Playlist could not be deleted.');return false;}s.playlists=remaining;
    
    if (String(s.currentPlaylistId) === String(plid)) {
        backToPlaylistsView();
    }
    renderPlaylistsView();
    showToast(`Deleted playlist "${plName}".`);
    return true;
}

async function ensurePlaylistRecord(plid) {
    const s=store.state, pl=s.playlists.find(p=>String(p.plid)===String(plid));if(!pl)return null;
    if(!Array.isArray(pl.tracks)&&getRuntime().hasPhpBackend&&!String(plid).startsWith('local_pl_')){
        const data=await playlistFetch(`php/api/playlists.php?plid=${encodeURIComponent(plid)}`,{cache:'no-store'});
        if(!data.success||!Array.isArray(data.playlist?.tracks))throw Error('Could not read playlist.');
        pl.tracks=data.playlist.tracks.map(t=>String(t.tid));
    }
    return pl;
}
async function resolvePlaylistTracks(plid) {
    const pl=await ensurePlaylistRecord(plid);
    return pl?resolvePlaylistMembers(pl.tracks,store.state.allTracks,serverPlaylist(pl.plid)):[];
}

async function playPlaylistDirectly(plid, name, shuffle = false) {
    const s=store.state;
    if(!await openPlaylist(plid,name))return;
    const members=await resolvePlaylistTracks(plid);
    if(String(s.currentPlaylistId)!==String(plid))return;
    if(!members.length){showToast('No available tracks to play.');return;}
    const proposed={};if(!startPlaylistSession(proposed,plid,members,shuffle))return;
    const first=findTrackIndex(s.allTracks,proposed.playlistPlayback.ordered[0]);if(first<0)return;
    // Preserve the explicit queue; it is independent of the playlist snapshot.
    await loadTrack(first,true,0,null,false,false,proposed.playlistPlayback);
    store.emit('library:update-queue');store.emit('playback:order-change');
}

async function queuePlaylistTracks(plid, name) {
    const s = store.state;
    let plTracks;try{plTracks=await resolvePlaylistTracks(plid);}catch(e){showToast(e.message);return;}
    if (plTracks.length > 0) {
        plTracks.forEach(track => {
            let existing = s.allTracks[findTrackIndex(s.allTracks, track)];
            if (!existing) {
                s.allTracks.push(track);
                existing = track;
            }
            s.playQueue.push(existing);
        });
        store.emit('library:update-queue');
        showToast(`Queued ${plTracks.length} tracks from "${name}"`);
        return;
    }
    showToast(`Could not queue tracks from "${name}"`);
}

let playlistOpenGeneration=0;
let libraryBrowsePreferences=null;
const playlistBrowsePreferences=new Map();
function rememberBrowsePreferences(){const s=store.state;const prefs={query:s.searchQuery,format:s.currentFormatFilter};if(s.currentPlaylistId!==null){const key=String(s.currentPlaylistId);playlistBrowsePreferences.delete(key);playlistBrowsePreferences.set(key,prefs);if(playlistBrowsePreferences.size>32)playlistBrowsePreferences.delete(playlistBrowsePreferences.keys().next().value);}else if(document.getElementById('tabLibrary')?.getAttribute('aria-current')==='page')libraryBrowsePreferences=prefs;}
function restoreBrowsePreferences(prefs={query:'',format:'all'}){const s=store.state;s.searchQuery=prefs.query||'';s.currentFormatFilter=prefs.format||'all';const input=document.getElementById('trackSearch');if(input)input.value=s.searchQuery;document.getElementById('trackSearchClearBtn')?.style.setProperty('display',s.searchQuery?'':'none');document.querySelectorAll('.formatFilterPill').forEach(b=>{const on=b.dataset.filter===s.currentFormatFilter;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});}

function refreshPlaylistMeta(index = null){const s=store.state,p=s.playlists.find(p=>String(p.plid)===String(s.currentPlaylistId));const meta=document.getElementById('currentPlaylistMeta');if(p){const stats=playlistSummary(p,index instanceof Map ? index : s.allTracks);if(meta)meta.textContent=stats.text;for(const id of ['bannerPlayAllBtn','bannerShuffleBtn','bannerQueueBtn']){const el=document.getElementById(id);if(el)el.disabled=stats.tracks.length===0;}}}
async function openPlaylist(plid, name) {
    const s = store.state, generation=++playlistOpenGeneration;
    try{await ensurePlaylistRecord(plid);}catch(e){showToast(e.message);return false;}
    if(generation!==playlistOpenGeneration)return false;
    const p=s.playlists.find(p=>String(p.plid)===String(plid));if(!p)return false;
    const index=playlistViewIndex(s.allTracks,[p]);
    // Search and format filtering are view state, not playlist membership.
    if(String(s.currentPlaylistId)!==String(plid)){rememberBrowsePreferences();restoreBrowsePreferences(playlistBrowsePreferences.get(String(plid)));}

    s.currentPlaylistId = plid;
    s.currentPlaylistName = p.name || name || 'Playlist';
    if (activeListLabel) activeListLabel.textContent = s.currentPlaylistName;
    if (currentPlaylistTitle) currentPlaylistTitle.textContent = s.currentPlaylistName;

    try {
        safeStorage.setItem('cachymusic_last_playlist_id', String(plid));
        safeStorage.setItem('cachymusic_last_playlist_name', s.currentPlaylistName);
    } catch (_) {}

    const quickFormatBar = document.getElementById('quickFormatFilterBar');
    setLibraryTabActive('tabPlaylists');
    if(queueView)queueView.style.display='none';
    if (playlistsView) playlistsView.style.display = 'none';
    if (libraryControls) libraryControls.style.display = 'none';
    document.getElementById('libraryToolsToggleBtn')?.style.setProperty('display','none');
    if (quickFormatBar) quickFormatBar.style.display = 'flex';
    if (playlistBanner) playlistBanner.style.display = 'flex';
    if (trackList) trackList.style.display = 'flex';

    // The metadata and displayed sequence consume the same fresh membership
    // lookup. applySearchAndSort owns membership flags and query publication.
    refreshPlaylistMeta(index);
    applySearchAndSort(index);return true;
}
store.state.openPlaylist = openPlaylist;

function backToPlaylistsView() {
    rememberBrowsePreferences();
    playlistOpenGeneration++;libraryWorkerRequestId++;libraryQueries.cancelPending();
    const s = store.state;
    s.currentPlaylistId = null;
    s.currentPlaylistName = '';
    if (activeListLabel) activeListLabel.textContent = 'All tracks';
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
    setLibraryTabActive('tabPlaylists');
    if (playlistsView) playlistsView.style.display = 'flex';
    applySearchAndSort();renderPlaylistsView();
}

function backToAllTracks() {
    const wasPlaylist=store.state.currentPlaylistId!==null||document.getElementById('playlistsView')?.getClientRects().length||document.getElementById('queueView')?.getClientRects().length; if(store.state.currentPlaylistId!==null||!wasPlaylist)rememberBrowsePreferences();
    playlistOpenGeneration++;
    const s = store.state;
    s.currentPlaylistId = null;
    s.currentPlaylistName = '';
    if (activeListLabel) activeListLabel.textContent = 'All tracks';
    s.allTracks.forEach(t => { t.inCurrentPlaylist = false; });

    try {
        safeStorage.removeItem('cachymusic_last_playlist_id');
        safeStorage.removeItem('cachymusic_last_playlist_name');
    } catch (_) {}

    const quickFormatBar = document.getElementById('quickFormatFilterBar');
    if (playlistBanner) playlistBanner.style.display = 'none';
    if (libraryControls) libraryControls.style.display = 'flex';
    document.getElementById('libraryToolsToggleBtn')?.style.removeProperty('display');
    if (quickFormatBar) quickFormatBar.style.display = 'flex';
    if(playlistsView)playlistsView.style.display='none';if(queueView)queueView.style.display='none';if(trackList)trackList.style.display='flex';setLibraryTabActive('tabLibrary');
    if(wasPlaylist&&libraryBrowsePreferences)restoreBrowsePreferences(libraryBrowsePreferences);
    applySearchAndSort();
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
let pickerSession=null;
function openBatchAddModal(){
    const s=store.state,pl=s.playlists.find(p=>String(p.plid)===String(s.currentPlaylistId));if(!pl)return;
    const modal=document.getElementById('batchAddSongsModal'), list=document.getElementById('batchAddTracksList'), search=document.getElementById('batchAddSearchInput'), summary=document.getElementById('batchAddSummaryText'), done=document.getElementById('doneBatchAddBtn'), prev=document.getElementById('batchPrev'), next=document.getElementById('batchNext'), range=document.getElementById('batchRange');
    if(pickerSession)return;
    const session=pickerSession={plid:pl.plid,selected:new Map(),page:0,busy:false,review:false,discard:false,needsReload:false};
    let catalogRef=null,catalogSize=-1,catalog=null, catalogGeneration=0, loading=false, catalogFailed=false;
    let members=new Set(),memberRevision,memberTracks=null;
    let searchGeneration=0, searchJob=null, searchResult=null, searchFailed=false, searching=false, selectionRevision=0;
    const invalidateSearch=()=>{searchGeneration++;searchJob=null;searchResult=null;searchFailed=false;searching=false;};
    document.getElementById('batchAddModalTitle').textContent=`Add songs to ${pl.name}`;search.value='';
    const render=()=>{
        if(pickerSession!==session)return;
        if(catalogRef!==s.allTracks||catalogSize!==s.allTracks.length){
            invalidateSearch();catalogRef=s.allTracks;catalogSize=catalogRef.length;memberTracks=null;catalog=null;catalogFailed=false;
            const generation=++catalogGeneration,source=catalogRef,size=catalogSize;
            if(size<=20000){catalog=createPlaylistPickerIndex(source,getTrackSearchString);loading=false;}
            else{
                loading=true;
                const owned=()=>pickerSession===session&&catalogGeneration===generation;
                // Keep the modal responsive; do not publish until every identity has been checked.
                void createPlaylistPickerIndexAsync(source,getTrackSearchString,{isCurrent:owned}).then(built=>{
                    if(!owned())return;
                    loading=false;
                    if(s.allTracks!==source||s.allTracks.length!==size){render();return;}
                    catalog=built;render();
                }).catch(()=>{if(!owned())return;loading=false;catalogFailed=true;render();});
            }
        }
        list.setAttribute('aria-busy',String(loading));
        if(!catalog){
            list.textContent=catalogFailed?'Could not prepare songs. Close and reopen the picker to retry.':'Preparing your song library…';
            range.textContent=catalogFailed?'Library unavailable':'Preparing songs';
            prev.disabled=next.disabled=true;document.getElementById('batchPage').disabled=true;update();return;
        }
        const current=s.playlists.find(p=>String(p.plid)===String(session.plid));
        if(current&&(memberRevision!==current.revision||memberTracks!==current.tracks)){members=new Set(resolvePlaylistMembers(current.tracks,catalog.index,serverPlaylist(current.plid)));memberRevision=current.revision;memberTracks=current.tracks;}
        const index=catalog.index,query=search.value.trim().toLowerCase(),terms=query.split(/\s+/).filter(Boolean);
        const count=session.review?session.selected.size:catalog.tracks.length;
        let filtered;
        if(count>20000&&query){
            const key=JSON.stringify([session.review,session.review?selectionRevision:0,query]);
            if(searchResult?.key===key)filtered=searchResult.tracks;
            else{
                if(searchJob!==key){
                    invalidateSearch();searchJob=key;searching=true;
                    const generation=searchGeneration,source=catalog;
                    const owned=()=>pickerSession===session&&searchGeneration===generation&&catalog===source&&s.allTracks===catalogRef&&s.allTracks.length===catalogSize;
                    const task=session.review?searchPlaylistTracksAsync([...session.selected.values()],query,getTrackSearchString,{isCurrent:owned}):catalog.searchAsync(query,{isCurrent:owned});
                    void task.then(tracks=>{
                        if(pickerSession!==session||generation!==searchGeneration)return;
                        if(!owned()){render();return;}
                        if(!tracks)return;
                        searchResult={key,tracks};searching=false;render();
                    }).catch(()=>{if(pickerSession!==session||generation!==searchGeneration)return;searching=false;searchFailed=true;render();});
                }
                list.setAttribute('aria-busy',String(searching));list.textContent=searchFailed?'Search failed. Change the query to retry.':'Searching songs…';
                range.textContent=searchFailed?'Search unavailable':'Searching songs';prev.disabled=next.disabled=true;document.getElementById('batchPage').disabled=true;update();return;
            }
        }else{
            if(searchJob!==null)invalidateSearch();
            filtered=session.review?[...session.selected.values()].filter(t=>{if(!terms.length)return true;const text=getTrackSearchString(t);return terms.every(q=>text.includes(q));}):catalog.search(query);
        }
        list.setAttribute('aria-busy','false');
        const size=40;session.page=Math.max(0,Math.min(session.page,Math.ceil(filtered.length/size)-1));const start=session.page*size;
        list.replaceChildren();for(const track of filtered.slice(start,start+size)){
            const key=trackKey(track),added=members.has(track),unsupported=(serverPlaylist(pl.plid)&&!/^tid:[1-9]\d*$/.test(key))||index.get(key)!==track,label=document.createElement('label');label.className='batchAddRow playlistPickerRow';
            label.innerHTML=`<input type="checkbox" ${added||session.selected.has(key)?'checked':''} ${session.busy||(!session.review&&(added||!key||unsupported))?'disabled':''}><span class="batchAddInfo"><strong class="batchAddTitle" dir="auto">${escapeHtml(track.title||track.filename||'Untitled')}</strong><small class="batchAddArtist" dir="auto">${escapeHtml(track.artist||'Unknown artist')}${track.album?' · '+escapeHtml(track.album):''}${added?' · Already added':unsupported?' · Unavailable for this playlist':''}</small></span><span class="batchAddDuration">${formatTime(track.duration)}</span>`;
            const art=track.coverThumb||track.cover; if(typeof art==='string'&&art.length<4_000_000&&(/^(data:image\/(?:png|jpeg|webp|gif);base64,|blob:)/i.test(art)||(!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(art)&&!art.includes('default.svg')))){const img=document.createElement('img');img.className='playlistPickerArt';img.alt='';img.loading='lazy';img.decoding='async';img.src=art;img.onerror=()=>img.remove();label.querySelector('.batchAddInfo').before(img);label.classList.add('hasPickerArt');}
            label.dataset.memberKey=key;label.querySelector('input').onchange=e=>{if(e.target.checked)session.selected.set(key,track);else session.selected.delete(key);selectionRevision++;if(session.review){render();(list.querySelector('input:not(:disabled)')||search).focus();}else update();};list.append(label);
        }
        if(!filtered.length)list.textContent=session.review?'No selected songs.':'No matching songs.';
        const jump=document.getElementById('batchPage');jump.max=String(Math.max(1,Math.ceil(filtered.length/size)));jump.value=String(session.page+1);jump.disabled=session.busy||Number(jump.max)<=1;range.textContent=filtered.length?`${start+1}–${Math.min(start+size,filtered.length)} of ${filtered.length}`:'0 results';prev.disabled=session.busy||session.page===0;next.disabled=session.busy||start+size>=filtered.length;update();
    };
    const review=document.getElementById('batchReview'),selectPage=document.getElementById('batchSelectPage'),clear=document.getElementById('batchClearSelection'),result=document.getElementById('batchResult'),reload=document.getElementById('batchReload');result.textContent='';reload.hidden=true;
    const update=()=>{const blocked=session.busy||!catalog;const resultsBlocked=blocked||searching||searchFailed;session.discard=false;const close=document.getElementById('closeBatchAddModalBtn');close.setAttribute('aria-label','Close song picker');close.title='Close song picker';review.disabled=blocked||(!session.review&&!session.selected.size);review.textContent=session.review?'Show library':'Review selected';review.setAttribute('aria-pressed',String(session.review));clear.disabled=blocked||!session.selected.size;selectPage.disabled=resultsBlocked||session.review;search.disabled=blocked;summary.textContent=`${session.selected.size} selected`;done.textContent=loading?'Preparing…':session.busy?'Adding…':`Add ${session.selected.size||''} ${session.selected.size===1?'song':'songs'}`.replace(/ +/g,' ');done.disabled=resultsBlocked||session.needsReload||!session.selected.size;reload.hidden=!session.needsReload;reload.disabled=blocked;};
    document.getElementById('batchPage').onchange=e=>{session.page=Math.max(0,Math.min(Number(e.target.max)-1,Math.trunc(Number(e.target.value)||1)-1));render();list.scrollTop=0;};
    review.onclick=()=>{session.review=!session.review;search.value='';session.page=0;invalidateSearch();render();};clear.onclick=()=>{session.selected.clear();selectionRevision++;session.review=false;session.page=0;invalidateSearch();render();};selectPage.onclick=()=>{for(const el of list.querySelectorAll('input:not(:disabled):not(:checked)'))el.click();};
    search.oninput=()=>{session.page=0;invalidateSearch();render();};prev.onclick=()=>{session.page--;render();list.scrollTop=0;};next.onclick=()=>{session.page++;render();list.scrollTop=0;};
    done.onclick=async()=>{
        if(session.busy||!catalog||searching||searchFailed||session.needsReload||!session.selected.size)return;
        session.busy=true;render();let counts={added:0,already:0,unavailable:0,unsupported:0,notConfirmed:session.selected.size};
        const ok=await serializePlaylist(async()=>{
            const current=s.playlists.find(p=>String(p.plid)===String(session.plid));if(!current)throw Error('Playlist no longer exists.');
            const index=buildPlaylistMutationIndex(s.allTracks,[...current.tracks.map(k=>memberLookupKey(k,serverPlaylist(current.plid))),...session.selected.keys()]);
            const {valid,already,unavailable,unsupported}=classifyPlaylistSelection(session.selected,current,index);
            counts={...counts,already:already.length,unavailable:unavailable.length,unsupported:unsupported.length,notConfirmed:valid.length};
            for(const key of already)session.selected.delete(key);selectionRevision++;
            if(!valid.length)return true;
            if(serverPlaylist(current.plid)){
                const data=await playlistRequest('add_tracks',{plid:current.plid,tracks:valid.map(([,t])=>t.tid),revision:current.revision??0});applyServerPlaylist(current,data);
            }else await updatePlaylistRecord(current.plid,{tracks:[...current.tracks.map(String),...valid.map(([key])=>key)]},index);
            counts.added=valid.length;counts.notConfirmed=0;for(const [key] of valid)session.selected.delete(key);selectionRevision++;return true;
        });
        session.busy=false;if(pickerSession!==session)return;session.needsReload=!ok;
        const message=`${counts.added} added · ${counts.already} already present · ${counts.unavailable} unavailable · ${counts.unsupported} incompatible · ${counts.notConfirmed} not confirmed.`;
        if(ok&&!session.selected.size){closeBatchAddModal();showToast(counts.already?`${counts.added} added; ${counts.already} already present.`:`${counts.added} ${counts.added===1?'song':'songs'} added.`);}
        else{render();result.textContent=message+(!ok?' Reload before retrying; your selection is retained.':' Review or clear remaining selections.');}

    };
    reload.onclick=async()=>{if(session.busy)return;session.busy=true;render();const ok=await serializePlaylist(async()=>{const latest=await readLatestPlaylist(session.plid);const current=s.playlists.find(p=>String(p.plid)===String(session.plid));if(!current)throw Error('Playlist no longer exists.');Object.assign(current,latest);refreshPlaylistMeta();renderPlaylistsView();if(String(s.currentPlaylistId)===String(current.plid))applySearchAndSort();return true;});session.busy=false;if(pickerSession!==session)return;session.needsReload=!ok;render();result.textContent=ok?'Latest playlist loaded. Review your selection before adding.':'Reload failed. Your selection is retained.';};
    modal.style.display='flex';pushModalState('batchAddSongsModal');render();(search.disabled?document.getElementById('closeBatchAddModalBtn'):search).focus();
}
function closeBatchAddModal(){if(pickerSession?.busy){document.getElementById('batchResult').textContent='Saving songs. Wait for the result before closing.';return;}if(pickerSession?.selected.size&&!pickerSession.discard){pickerSession.discard=true;const close=document.getElementById('closeBatchAddModalBtn');close.setAttribute('aria-label','Discard selected songs');close.title='Discard selected songs';document.getElementById('batchResult').textContent='Unsaved song selection. Close again to discard, or continue selecting.';return;}pickerSession=null;for(const id of ['batchReview','batchClearSelection','batchSelectPage','batchPrev','batchNext','doneBatchAddBtn','batchReload'])document.getElementById(id).onclick=null;document.getElementById('batchPage').onchange=null;document.getElementById('batchAddSearchInput').oninput=null;const list=document.getElementById('batchAddTracksList');list.replaceChildren();list.removeAttribute('aria-busy');const modal=document.getElementById('batchAddSongsModal');if(modal)modal.style.display='none';popModalState('batchAddSongsModal');document.getElementById('bannerAddTracksBtn')?.focus();}

async function readLatestPlaylist(id){
    const records=serverPlaylist(id)?(await playlistFetch('php/api/playlists.php',{cache:'no-store'})).playlists:await loadLocalPlaylists(null);
    if(!Array.isArray(records))throw Error('Playlist storage could not be read.');
    const latest=records.find(x=>String(x.plid)===String(id));
    if(!latest||!Array.isArray(latest.tracks))throw Error('Playlist no longer exists. Your changes have not been discarded.');
    return latest;
}
let editSession=null;
export function openPlaylistEditor(){
    const s=store.state,p=s.playlists.find(p=>String(p.plid)===String(s.currentPlaylistId));
    if(!p||!Array.isArray(p.tracks))return;
    const byId=id=>document.getElementById(id);
    const d=byId('playlistEditDialog'),name=byId('playlistEditName'),list=byId('playlistEditRows'),save=byId('playlistEditSave'),status=byId('playlistEditStatus'),prev=byId('playlistEditPrev'),next=byId('playlistEditNext'),recovery=byId('playlistEditRecovery'),rebase=byId('playlistEditRebase'),reload=byId('playlistEditReload');
    if(d.open)return;
    const draft=editSession={id:p.plid,original:p.tracks.map(String),originalName:p.name,revision:p.revision??0,keys:p.tracks.map(String),page:0};
    const server=serverPlaylist(draft.id), cancel=d.querySelector('button[value=cancel]'), size=30;
    let discard=false,dragIndex=null,busy=false;
    let editorLookup=null, lookupSource=null,lookupSize=-1, lookupGeneration=0, lookupPending=false;
    function invalidateLookup(){lookupGeneration++;lookupPending=false;editorLookup=null;}
    name.value=p.name;status.textContent='';cancel.textContent='Cancel';recovery.hidden=true;
    const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const dirty=()=>name.value.trim()!==draft.originalName||!equal(draft.keys,draft.original);
    const changed=()=>{discard=false;cancel.textContent='Cancel';status.textContent=dirty()?'Unsaved changes':'';};
    name.oninput=changed;
    const close=()=>{if(busy)return;if(dirty()&&!discard){discard=true;cancel.textContent='Discard changes';status.textContent='Unsaved changes. Select Discard changes to close, or keep editing.';return;}d.close();};
    const freeze=async task=>{busy=true;const relinkPanel=list.querySelector('.playlistRelinkOptions');if(relinkPanel){relinkPanel.parentElement.querySelector('[aria-expanded]')?.setAttribute('aria-expanded','false');relinkPanel.remove();}const controls=[...d.querySelectorAll('button,input')],disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);try{return await task();}finally{busy=false;controls.forEach((el,i)=>el.disabled=disabled[i]);}};
    function render(focusIndex=null){
        draft.page=Math.max(0,Math.min(draft.page,Math.ceil(draft.keys.length/size)-1));
        const start=draft.page*size;
        if(lookupSource!==s.allTracks||lookupSize!==s.allTracks.length){invalidateLookup();lookupSource=s.allTracks;lookupSize=lookupSource.length;}
        if(!editorLookup){
            const keys=draft.keys.map(k=>memberLookupKey(k,server));
            if(lookupSize<=20000)editorLookup=buildPlaylistLookupIndex(lookupSource,keys);
            else{
                list.setAttribute('aria-busy','true');list.textContent='Preparing playlist tracks…';prev.disabled=next.disabled=save.disabled=true;
                if(lookupPending)return;
                lookupPending=true;const generation=++lookupGeneration,source=lookupSource,length=lookupSize;
                const owned=()=>editSession===draft&&d.open&&lookupGeneration===generation;
                void buildPlaylistLookupIndexAsync(source,keys,{isCurrent:()=>owned()&&s.allTracks===source&&s.allTracks.length===length}).then(index=>{
                    if(!owned())return;lookupPending=false;
                    if(!index){render(focusIndex);return;}editorLookup=index;render(focusIndex);
                }).catch(()=>{if(!owned())return;lookupPending=false;list.removeAttribute('aria-busy');list.textContent='Could not prepare tracks. Close and reopen the editor to retry.';});return;
            }
        }
        const found=editorLookup;list.removeAttribute('aria-busy');save.disabled=busy;
        list.replaceChildren();
        for(let i=start;i<Math.min(start+size,draft.keys.length);i++){
            const key=draft.keys[i],t=found.get(memberLookupKey(key,server)),row=document.createElement('div');row.className='playlistOrderRow';
            const title=document.createElement('span');title.textContent=`${i+1}. ${t?.title||t?.filename||'Unavailable track'}`;row.append(title);
            title.draggable=true;title.title='Drag to reorder on this page';
            title.ondragstart=e=>{if(busy){e.preventDefault();return;}dragIndex=i;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(i));};title.ondragend=()=>{dragIndex=null;};
            row.ondragover=e=>{if(dragIndex!==null&&!busy){e.preventDefault();e.dataTransfer.dropEffect='move';}};row.ondrop=e=>{if(dragIndex===null||busy)return;e.preventDefault();const from=dragIndex;dragIndex=null;draft.keys=moveMember(draft.keys,from,i);changed();render(i);};
            for(const [label,delta] of [['↑',-1],['↓',1]]){
                const b=document.createElement('button');b.type='button';b.className='actionBtn';b.textContent=label;b.dataset.move=String(i);b.dataset.delta=String(delta);b.setAttribute('aria-label',`Move ${t?.title||'track '+(i+1)} ${delta<0?'up':'down'}`);b.disabled=i+delta<0||i+delta>=draft.keys.length;
                b.onclick=()=>{draft.keys=moveMember(draft.keys,i,i+delta);draft.page=Math.floor((i+delta)/size);changed();render(i+delta);};row.append(b);
            }
            const position=document.createElement('input');position.type='number';position.min='1';position.max=String(draft.keys.length);position.value=String(i+1);position.title='New track position';position.setAttribute('aria-label',`New position for ${title.textContent}`);
            const move=document.createElement('button');move.type='button';move.className='actionBtn';move.textContent='Move';move.onclick=()=>{const to=Number(position.value)-1;if(!Number.isInteger(to)||to<0||to>=draft.keys.length){status.textContent='Enter a valid position.';return;}draft.keys=moveMember(draft.keys,i,to);draft.page=Math.floor(to/size);changed();render(to);};const direct=document.createElement('div');direct.className='playlistDirectMove';direct.append(position,move);row.append(direct);
            if(!t){
                const ref=document.createElement('small');ref.className='playlistMissingRef';ref.dir='auto';ref.textContent=`Saved reference: ${key}`;title.append(ref);
                const actions=document.createElement('div');actions.className='playlistMissingActions';
                const remove=document.createElement('button');remove.type='button';remove.className='actionBtn';remove.textContent='Remove entry';remove.setAttribute('aria-label',`Remove unavailable entry ${i+1}`);
                remove.onclick=()=>{
                    // The display index is a draft snapshot. Do not remove a now-resolved track
                    // under the "unavailable" affordance without refreshing its presentation.
                    const lookup=memberLookupKey(draft.keys[i],server),current=buildPlaylistLookupIndex(s.allTracks,[lookup]).get(lookup);
                    if(current){editorLookup?.set(lookup,current);status.textContent='This track is now available. Playlist refreshed.';render(i);return;}
                    draft.keys.splice(i,1);if(!draft.keys.some(k=>memberLookupKey(k,server)===lookup))editorLookup?.delete(lookup);changed();render(Math.min(i,draft.keys.length-1));
                };
                const relink=document.createElement('button');relink.type='button';relink.className='actionBtn';relink.textContent='Replace track';relink.setAttribute('aria-label',`Replace unavailable entry ${i+1}`);relink.setAttribute('aria-expanded','false');actions.append(remove,relink);row.append(actions);
                relink.onclick=()=>{
                    const existing=list.querySelector('.playlistRelinkOptions');if(existing){const owner=existing.parentElement;existing.remove();owner.querySelector('[aria-expanded]')?.setAttribute('aria-expanded','false');if(owner===row)return;}
                    const options=document.createElement('div');options.className='playlistRelinkOptions';const search=document.createElement('input');search.type='search';search.placeholder='Find replacement by title or artist';search.setAttribute('aria-label',`Find replacement for entry ${i+1}`);const results=document.createElement('div');results.className='playlistRelinkOptions';options.append(search,results);row.append(options);relink.setAttribute('aria-expanded','true');
                    // Replacement is a preview; never use a partial/stale catalog
                    // for a commit. Detaching this panel cancels its pending work.
                    let catalog=null,source=null,sourceSize=-1,preparing=false,queryGeneration=0;
                    const attached=()=>editSession===draft&&d.open&&options.isConnected&&!busy;
                    const sourceCurrent=()=>s.allTracks===source&&s.allTracks.length===sourceSize;
                    const message=(text,pending=false)=>{results.setAttribute('aria-busy',String(pending));results.textContent=text;};
                    const showMatches=matches=>{
                        results.setAttribute('aria-busy','false');results.replaceChildren();
                        const otherKeys=draft.keys.filter((_,j)=>j!==i),used=new Set(resolvePlaylistMembers(otherKeys,catalog.index,server)),rawKeys=new Set(otherKeys.map(String));let count=0;
                        for(const candidate of matches){const key=trackKey(candidate);if(!key||catalog.index.get(key)!==candidate||used.has(candidate)||rawKeys.has(server?String(candidate.tid):key)||(server&&!/^tid:[1-9]\d*$/.test(key)))continue;const choice=document.createElement('button');choice.type='button';choice.className='actionBtn';choice.textContent=[candidate.title||candidate.filename||'Untitled',candidate.artist,candidate.album,candidate.filename].filter(Boolean).join(' · ');
                            choice.onclick=()=>{if(!attached())return;const candidateKey=trackKey(candidate),currentIndex=buildPlaylistLookupIndex(s.allTracks,[...draft.keys.map(k=>memberLookupKey(k,server)),candidateKey]),selected=currentIndex.get(candidateKey),keys=replacementMember(draft.keys,i,selected,currentIndex,server);if(!keys){status.textContent='That replacement is no longer available or already belongs to this playlist.';return;}const oldLookup=memberLookupKey(draft.keys[i],server);if(!keys.some(k=>memberLookupKey(k,server)===oldLookup))editorLookup?.delete(oldLookup);draft.keys=keys;editorLookup?.set(memberLookupKey(keys[i],server),selected);changed();render(i);};results.append(choice);if(++count===20)break;}
                        if(!count)results.textContent='No eligible replacement found.';else if(count===20){const note=document.createElement('small');note.textContent='Showing up to 20 matches; refine your search.';results.append(note);}
                    };
                    const find=()=>{
                        if(!attached())return;
                        const generation=++queryGeneration,query=search.value.trim();
                        if(!query){message('Search for an available song. No automatic match will be made.');return;}
                        if(!sourceCurrent()){source=s.allTracks;sourceSize=source.length;catalog=null;preparing=false;}
                        if(!catalog){
                            if(sourceSize<=20000)catalog=createPlaylistPickerIndex(source,getTrackSearchString);
                            else{
                                message('Preparing replacement search…',true);
                                if(preparing)return;
                                preparing=true;const captured=source,size=sourceSize;
                                const owned=()=>attached()&&source===captured&&sourceSize===size&&sourceCurrent();
                                void createPlaylistPickerIndexAsync(captured,getTrackSearchString,{isCurrent:owned}).then(built=>{
                                    if(!attached()||source!==captured||sourceSize!==size)return;
                                    preparing=false;
                                    if(!sourceCurrent()){find();return;}
                                    catalog=built;find();
                                }).catch(()=>{if(!owned())return;preparing=false;message('Could not prepare replacement search. Change the query to retry.');});return;
                            }
                        }
                        if(sourceSize<=20000){showMatches(catalog.search(query));return;}
                        message('Searching for replacements…',true);
                        const owned=()=>attached()&&generation===queryGeneration&&sourceCurrent();
                        void catalog.searchAsync(query,{isCurrent:owned}).then(matches=>{
                            if(!attached()||generation!==queryGeneration)return;
                            if(!sourceCurrent()){find();return;}
                            if(matches)showMatches(matches);
                        }).catch(()=>{if(owned())message('Replacement search failed. Change the query to retry.');});
                    };
                    search.oninput=find;find();search.focus();
                };
            }
            list.append(row);
        }
        prev.disabled=start===0;next.disabled=start+size>=draft.keys.length;byId('playlistEditRange').textContent=draft.keys.length?`${start+1}–${Math.min(start+size,draft.keys.length)} of ${draft.keys.length}`:'No tracks';
        if(focusIndex!==null)(list.querySelector(`button[data-move="${focusIndex}"]:not(:disabled)`)||name).focus();
    }
    prev.onclick=()=>{draft.page--;render();};next.onclick=()=>{draft.page++;render();};
    // Fresh collection read, never interpreting a read failure as deletion.

    async function recover(discardDraft){if(busy)return;const recovered=await freeze(()=>serializePlaylist(async()=>{
        try{const latest=await readLatestPlaylist(draft.id);if(editSession!==draft||!d.open)return;
            const merged=discardDraft?{name:latest.name,tracks:latest.tracks.map(String),conflicts:[]}:rebasePlaylistDraft({name:draft.originalName,tracks:draft.original},{name:name.value.trim(),tracks:draft.keys},latest);
            if(merged.conflicts.length){status.textContent=`Concurrent changes to ${merged.conflicts.join(' and ')}. Draft retained. Load latest only if you intend to discard your edits.`;return false;}
            const current=s.playlists.find(x=>String(x.plid)===String(draft.id));if(current)Object.assign(current,latest);else s.playlists.push(latest);
            draft.originalName=latest.name;draft.original=latest.tracks.map(String);draft.revision=latest.revision??0;draft.keys=merged.tracks;invalidateLookup();name.value=merged.name;draft.page=0;changed();recovery.hidden=true;refreshPlaylistMeta();renderPlaylistsView();if(String(s.currentPlaylistId)===String(draft.id)){s.currentPlaylistName=latest.name;currentPlaylistTitle.textContent=latest.name;activeListLabel.textContent=latest.name;safeStorage.setItem('cachymusic_last_playlist_name',latest.name);applySearchAndSort();}return true;
        }catch(e){status.textContent=e.message||'Could not reload playlist. Your draft is retained.';return false;}
    }));if(recovered){render();status.textContent=dirty()?'Latest version loaded. Safe changes reapplied; review and save.':'Latest saved version loaded.';name.focus();}}
    rebase.onclick=()=>recover(false);reload.onclick=()=>recover(true);
    save.onclick=async()=>{if(busy||lookupPending||!editorLookup)return;const value=name.value.trim();if(!value||value.length>50){status.textContent='Enter a name (1–50 characters).';return;}if(s.playlists.some(x=>String(x.plid)!==String(draft.id)&&x.name.toLowerCase()===value.toLowerCase())){status.textContent='That name is already used.';return;}
        const submitted=draft.keys.slice();
        const ok=await freeze(()=>serializePlaylist(async()=>{
            const current=s.playlists.find(x=>String(x.plid)===String(draft.id));if(!current||current.name!==draft.originalName||(current.revision??0)!==draft.revision||!equal(current.tracks.map(String),draft.original))throw Error('Playlist changed. Reload before saving.');
            const index=preparePlaylistEdit(s.allTracks,draft.original,submitted,server);
            if(server){const data=await playlistRequest('edit_members',{plid:current.plid,name:value,tracks:submitted,revision:draft.revision});applyServerPlaylist(current,data);return true;}
            return updatePlaylistRecord(current.plid,{name:value,tracks:submitted},index);
        }));
        if(ok){const current=s.playlists.find(x=>String(x.plid)===String(draft.id));if(current&&String(s.currentPlaylistId)===String(draft.id)){s.currentPlaylistName=current.name;currentPlaylistTitle.textContent=current.name;activeListLabel.textContent=current.name;safeStorage.setItem('cachymusic_last_playlist_name',current.name);}d.close();showToast('Playlist updated.');}
        else{recovery.hidden=false;status.textContent='Save not confirmed. Your draft is retained. Reload and reapply safe changes, or discard the draft.';}
    };
    d.oncancel=e=>{e.preventDefault();if(busy)return;if(dirty()){discard=true;cancel.textContent='Discard changes';status.textContent='Unsaved changes. Select Discard changes to close.';cancel.focus();}else d.close();};d.querySelector('form').onsubmit=e=>{e.preventDefault();close();};d.onclose=()=>{if(editSession===draft&&!d.open){editSession=null;invalidateLookup();lookupSource=null;list.removeAttribute('aria-busy');list.replaceChildren();name.oninput=prev.onclick=next.onclick=save.onclick=rebase.onclick=reload.onclick=null;d.querySelector('form').onsubmit=null;d.oncancel=d.onclose=null;}};
    d.showModal();render();name.focus();
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
    store.emit('library:update-queue');
}

function removeFromQueue(index) {
    const s = store.state;
    if (index >= 0 && index < s.playQueue.length) {
        const removed = s.playQueue.splice(index, 1)[0];
        store.emit('library:update-queue');
        showToast(`Removed "${removed.title || removed.filename}" from queue`);
    }
}

function moveQueueItem(fromIndex, toIndex) {
    const s = store.state;
    if (fromIndex < 0 || fromIndex >= s.playQueue.length || toIndex < 0 || toIndex >= s.playQueue.length) return;
    const [item] = s.playQueue.splice(fromIndex, 1);
    s.playQueue.splice(toIndex, 0, item);
    store.emit('library:update-queue');
}

function clearQueue() {
    const s = store.state;
    if (s.playQueue.length === 0) return;
    s.playQueue = [];
    store.emit('library:update-queue');
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
    if (!queueList || (queueView && queueView.style.display === 'none')) return;
    if (s.playQueue.length === 0) {
        queueList.innerHTML = '<div class="queueEmpty">Your queue is empty. Open a track’s menu to add it to the queue.</div>';
    } else {
        const frag = document.createDocumentFragment();
        s.playQueue.forEach((track, idx) => {
            const item = document.createElement('div');
            item.className = 'queueItem';
            const coverSrc = track.cover || 'resources/images/default.svg';
            const displayTitle = track.title ? escapeHtml(track.title) : escapeHtml(track.filename || 'Unknown');
            const displayArtist = track.artist ? escapeHtml(track.artist) : 'Unknown';

            item.innerHTML = `
                <img src="${escapeHtml(coverSrc)}" alt="Cover" class="queueThumb" width="40" height="40" loading="lazy" decoding="async">
                <div class="queueDetails">
                    <div class="queueTitle">${displayTitle}</div>
                    <div class="queueArtist">${displayArtist}</div>
                </div>
                <span class="queueDuration">${formatTime(track.duration)}</span>
                <div class="queueItemActions">
                    ${idx > 0 ? `<button type="button" class="queueMoveBtn moveUpBtn" data-idx="${idx}" title="Move up" aria-label="Move up">${uiIcon('up')}</button>` : ''}
                    ${idx < s.playQueue.length - 1 ? `<button type="button" class="queueMoveBtn moveDownBtn" data-idx="${idx}" title="Move down" aria-label="Move down">${uiIcon('down')}</button>` : ''}
                    <button type="button" class="queuePlayNowBtn" data-idx="${idx}" title="Play now" aria-label="Play now">${uiIcon('play')}</button>
                    <button type="button" class="queueRemoveBtn" data-idx="${idx}" title="Remove from queue" aria-label="Remove from queue">${uiIcon('close')}</button>
                </div>
            `;
            frag.appendChild(item);
        });
        queueList.innerHTML = '';
        queueList.appendChild(frag);
    }

    if (upcomingLibraryList) {
        const pool = playbackPool(s);
        const curIdx = s.playlistPlayback?.cursor ?? findTrackIndex(pool, s.allTracks[s.currentTrackIndex]);

        const upcoming = [];
        if (pool.length > 0 && curIdx !== -1) {
            for (let i = 1; i <= Math.min(5, pool.length - 1); i++) {
                if(curIdx+i>=pool.length&&s.repeatMode!=='all')break;
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
                uItem.innerHTML = `
                    <img src="${escapeHtml(coverSrc)}" alt="Cover" class="queueThumb" width="40" height="40" loading="lazy" decoding="async">
                    <div class="queueDetails">
                        <div class="queueTitle">${displayTitle}</div>
                        <div class="queueArtist">${displayArtist}</div>
                    </div>
                    <span class="queueDuration">${formatTime(track.duration)}</span>
                    <div class="queueItemActions">
                        <button type="button" class="actionPillBtn enqueueUpcomingBtn" title="Pin to top of Queue">+ Queue</button>
                    </div>
                `;
                uItem.querySelector('.enqueueUpcomingBtn').addEventListener('click', () => addToQueue(track, false));
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
const {bindMetadataEditor, setupMetadataLookup, updateTrackMetadataDisplay, revertCover, handleCoverFileSelect, openMetadataEditor, closeMetadataEditor, requestSaveMetadataConfirmation, cancelMetadataConfirmation, executeSaveMetadata, saveMetadata} = createMetadataEditor({getTrackKey, refreshLibrary: () => renderVirtualTrackWindow(true)});
export {bindMetadataEditor, setupMetadataLookup};

// =========================================================================
// Add Track to Playlist Modal
// =========================================================================
function openAddToPlaylistModal(track) {
    const s = store.state;
    s.selectedTrackForPlaylist = track;
    if (modalTrackTitle) modalTrackTitle.textContent = `${track.title || track.filename} — ${track.artist || 'Unknown'}`;
    if (!modalPlaylistList) return;
    modalPlaylistList.innerHTML = '';
    const filter=document.getElementById('modalPlaylistSearch');if(filter){filter.value='';filter.oninput=()=>{const q=filter.value.trim().toLowerCase();for(const row of modalPlaylistList.querySelectorAll('.modalPlaylistItem'))row.hidden=!row.querySelector('.modalPlaylistName').textContent.toLowerCase().includes(q);};}

    if (s.playlists.length === 0) {
        const emptyNotice = document.createElement('div');
        emptyNotice.className = 'modalPlaylistEmpty';
        emptyNotice.textContent = 'No playlists yet. Create your first one below:';
        modalPlaylistList.appendChild(emptyNotice);
    } else {
        const key = trackKey(track);
        const index = playlistViewIndex(s.allTracks,s.playlists,[key]);
        const uniquelyIdentified = Boolean(key && index.get(key) === track);
        s.playlists.forEach(pl => {
            const item = document.createElement('div');
            item.className = 'modalPlaylistItem';
            item.innerHTML = `
                <span class="modalPlaylistInfo"><span class="modalPlaylistName">${escapeHtml(pl.name)}</span> <span class="modalPlaylistCount">(${pl.track_count || 0} tracks)</span></span>
                <button type="button" class="modalPlaylistAddBtn" >Add</button>
            `;

            const btn = item.querySelector('.modalPlaylistAddBtn');
            const already=resolvePlaylistMembers(pl.tracks,index,serverPlaylist(pl.plid)).includes(track),unsupported=!uniquelyIdentified||(serverPlaylist(pl.plid)&&!/^tid:[1-9]\d*$/.test(key));btn.disabled=already||unsupported;if(already)btn.textContent='Added';else if(unsupported)btn.textContent='Unavailable';
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.textContent = 'ADDING...';
                const success = await addTrackToPlaylist(pl.plid, track.tid || track.id, track);
                if (success) {
                    btn.textContent = '✓ ADDED';
                    btn.style.backgroundColor = 'var(--accent-color)';
                    btn.style.color = 'var(--text-on-accent)';
                    btn.style.borderColor = 'var(--accent-color)';
                    // Keep chooser open for adding to additional playlists.
                } else {
                    btn.textContent = 'Retry';
                    btn.style.backgroundColor = 'var(--bg-surface-3)';
                    btn.style.color = 'var(--status-warning)';
                    btn.style.borderColor = 'var(--status-warning)';
                    btn.style.fontSize = 'var(--font-xs)';
                    btn.disabled = false;
                }
            });

            modalPlaylistList.appendChild(item);
        });
    }

    if (playlistModal) playlistModal.style.display = 'flex';
    pushModalState('playlistModal');
    (modalPlaylistList.querySelector('button:not(:disabled)')||modalNewPlaylistName)?.focus();
}

function closePlaylistModal() {
    if (playlistModal) playlistModal.style.display = 'none';
    popModalState('playlistModal');
    store.state.selectedTrackForPlaylist = null;
    modalPlaylistList?.replaceChildren();
    const filter=document.getElementById('modalPlaylistSearch');if(filter)filter.oninput=null;
    if (modalNewPlaylistName) modalNewPlaylistName.value = '';
}

let playlistMutationTail=Promise.resolve();
function serializePlaylist(fn){const job=playlistMutationTail.then(fn);playlistMutationTail=job.catch(()=>{});return job.catch(e=>{showToast(e.message||'Playlist change failed.');return false;});}
async function updatePlaylistRecord(plid, update, freshIndex=null){
    const s=store.state,p=s.playlists.find(p=>String(p.plid)===String(plid));if(!p)throw Error('Playlist no longer exists.');
    const next={...p,...update,revision:Number(p.revision||0)+1};next.tracks=canonicalizeMembership(next.tracks,freshIndex||s.allTracks);next.track_count=next.tracks.length;
    if(!await mutateLocalPlaylist(p,next))throw Error('Playlist changed elsewhere or could not be saved. Reload playlists before retrying.');
    Object.assign(p,next);
    refreshPlaylistViews(plid);return true;
}
const serverPlaylist=isServerPlaylist;
async function playlistFetch(url,options={}) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
    try {const r=await fetch(url,{...options,signal:controller.signal});const data=await r.json();if(!r.ok||!data.success)throw Error(data.message||'Playlist request failed.');return data;}
    catch(e){if(controller.signal.aborted)throw Error('Playlist request timed out. Reload playlists before retrying; the server may have committed it.');throw e;}
    finally{clearTimeout(timer);}
}
async function playlistRequest(action,payload){if(!getRuntime().hasPhpBackend)throw Error('Connect to the desktop service to change this playlist.');return playlistFetch('php/api/playlists.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});}
// All three synchronous views use the same fresh catalog after a confirmed commit.
// Do not retain an index across awaits or changes to library identity.
function refreshPlaylistViews(plid){
    const s=store.state,index=playlistViewIndex(s.allTracks,s.playlists);
    refreshPlaylistMeta(index);renderPlaylistsView(index);
    if(String(s.currentPlaylistId)===String(plid))applySearchAndSort(index);
}
function applyServerPlaylist(p,data){if(!data.playlist||String(data.playlist.plid)!==String(p.plid))throw Error('Server commit outcome needs a reload.');Object.assign(p,data.playlist);refreshPlaylistViews(p.plid);}
async function addTrackToPlaylist(plid,tid,track=null,quiet=false){return serializePlaylist(async()=>{
    const p=store.state.playlists.find(x=>String(x.plid)===String(plid));if(!p)return false;
    await ensurePlaylistRecord(plid);const key=trackKey(track)||String(tid||''),index=buildPlaylistMutationIndex(store.state.allTracks,[...p.tracks.map(k=>memberLookupKey(k,serverPlaylist(plid))),key]);if(!key||index.get(key)!==track)throw Error('Track has no persistent identity.');
    if((!serverPlaylist(plid)&&p.tracks.map(String).includes(key))||resolvePlaylistMembers(p.tracks,index,serverPlaylist(plid)).includes(track)){if(!quiet)showToast('Already in this playlist.');return true;}
    if(serverPlaylist(plid)){if(!/^[1-9]\d*$/.test(String(track?.tid))||String(tid)!==String(track.tid))throw Error('This local-only track cannot be added to a desktop playlist.');const data=await playlistRequest('add_track',{plid,tid});applyServerPlaylist(p,data);}
    else await updatePlaylistRecord(plid,{tracks:[...p.tracks,key]},index);
    if(!quiet)showToast(`Added to "${p.name}".`);return true;
});}
async function removeTrackFromCurrentPlaylist(track){const plid=store.state.currentPlaylistId;if(plid==null||!track)return false;return serializePlaylist(async()=>{
    const p=store.state.playlists.find(x=>String(x.plid)===String(plid));if(!p)return false;await ensurePlaylistRecord(plid);
    const server=serverPlaylist(plid), index=buildPlaylistMutationIndex(store.state.allTracks,p.tracks.map(k=>memberLookupKey(k,server)));
    const keys=p.tracks.filter(k=>index.get(memberLookupKey(k,server))!==track);
    if(keys.length===p.tracks.length){showToast('Track is no longer in this playlist.');return false;}
    if(serverPlaylist(plid)){const data=await playlistRequest('remove_track',{plid,tid:track.tid});applyServerPlaylist(p,data);}
    else {const original=p.tracks.slice();await updatePlaylistRecord(plid,{tracks:keys},index);showToast(`Removed from "${p.name}". Audio file kept.`,'Undo',()=>serializePlaylist(async()=>{const current=store.state.playlists.find(x=>String(x.plid)===String(plid));if(!current||JSON.stringify(current.tracks.map(String))!==JSON.stringify(canonicalizeMembership(keys,store.state.allTracks)))throw Error('Playlist changed; add the song again from your library.');return updatePlaylistRecord(plid,{tracks:original});}));return true;}
    showToast(`Removed from "${p.name}". Audio file kept.`);return true;
});}

store.subscribe('library:render-window', (e) => {
    if (e?.detail?.activeOnly) {
        if (isTrackListViewportVisible()) syncActiveTrackHighlight();
        else trackListNeedsRender = true;
        return;
    }
    if (isTrackListViewportVisible()) {
        renderVirtualTrackWindow(Boolean(e?.detail?.preserveScroll ?? true));
    } else {
        trackListNeedsRender = true;
    }
});
store.subscribe('workspace:change', () => {
    if (trackListNeedsRender && isTrackListViewportVisible()) {
        renderTrackList(lastTrackScrollPreserve);
    }
    if (playlistsDirty && playlistsView && playlistsView.style.display !== 'none') {
        renderPlaylistsView();
    }
});
store.subscribe('library:scroll-to-index', (e) => {
    if (e?.detail) scrollToTrackIndex(e.detail.index, Boolean(e.detail.active));
});
store.subscribe('library:update-queue', () => updateQueueUi());

export {
    addToQueue,
    addTrackToPlaylist,
    applySearchAndSort,
    backToAllTracks,
    backToPlaylistsView,
    cancelMetadataConfirmation,
    clearQueue,
    closeBatchAddModal,
    closeMetadataEditor,
    closePlaylistModal,
    closeSlskAccountModal,
    closeTrackActionMenu,
    createPlaylist,
    deletePlaylistById,
    executeSaveMetadata,
    formatPlaylistEstDuration,
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
    setScanStatus,
    updateQueueUi,
    updateRestoreBtnUi,
    updateTrackMetadataDisplay
};
