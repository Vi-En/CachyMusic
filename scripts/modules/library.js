// CachyMusic - Audio Library, ID3 Parser, Playlists & Queue
    // IndexedDB Persistence for Browser File/Directory Selection & Offline Tracks
    function openLibraryIdb() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
            const req = window.indexedDB.open('cachymusic_idb_v1', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('library')) {
                    db.createObjectStore('library', { keyPath: 'key' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveLibraryToIndexedDB(tracks, directoryName) {
        try {
            const db = await openLibraryIdb();
            const tx = db.transaction('library', 'readwrite');
            const store = tx.objectStore('library');
            const storableTracks = tracks.map(t => ({
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
                duration: t.duration,
                bitrate: t.bitrate,
                sampleRate: t.sampleRate,
                bitDepth: t.bitDepth,
                channels: t.channels,
                format: t.format,
                size: t.size,
                cover: t.cover,
                lyrics: t.lyrics || null,
                src: (t.src && !t.src.startsWith('blob:')) ? t.src : null,
                fileBlob: t._fileBlob || null
            }));
            store.put({
                key: 'saved_library',
                directory: directoryName || '',
                updatedAt: Date.now(),
                tracks: storableTracks
            });
        } catch (err) {
            console.warn('IndexedDB save warning:', err);
        }
    }

    async function loadLibraryFromIndexedDB() {
        try {
            const db = await openLibraryIdb();
            return await new Promise((resolve) => {
                const tx = db.transaction('library', 'readonly');
                const store = tx.objectStore('library');
                const req = store.get('saved_library');
                req.onsuccess = () => {
                    const res = req.result;
                    if (res && Array.isArray(res.tracks) && res.tracks.length > 0) {
                        const hydrated = res.tracks.map(t => {
                            let src = t.src;
                            if (!src && t.fileBlob instanceof Blob) {
                                src = URL.createObjectURL(t.fileBlob);
                            }
                            return {
                                ...t,
                                src: src || '',
                                _fileBlob: t.fileBlob || null
                            };
                        }).filter(t => Boolean(t.src));
                        resolve({ directory: res.directory || '', tracks: hydrated });
                    } else {
                        resolve(null);
                    }
                };
                req.onerror = () => resolve(null);
            });
        } catch (_) {
            return null;
        }
    }


    // Client-side Binary Audio Metadata Parser (FLAC, MP3, M4A)
    async function parseAudioFileMetadata(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const meta = {
            title: null,
            artist: null,
            album: null,
            genre: null,
            year: null,
            track: null,
            duration: 0,
            bitrate: null,
            sampleRate: null,
            channels: null,
            format: ext.toUpperCase(),
            size: formatFileSize(file.size),
            cover: null,
            lyrics: null
        };

        try {
            // Read first 2MB slice for headers and tag metadata
            const slice = file.slice(0, Math.min(file.size, 2 * 1024 * 1024));
            const arrayBuffer = await slice.arrayBuffer();
            const view = new DataView(arrayBuffer);
            const uint8 = new Uint8Array(arrayBuffer);

            // FLAC Tag Extraction
            if (ext === 'flac' || (uint8[0] === 0x66 && uint8[1] === 0x4C && uint8[2] === 0x61 && uint8[3] === 0x43)) {
                meta.format = 'FLAC';
                let pos = 4;
                let isLast = false;
                while (!isLast && pos + 4 <= uint8.length) {
                    const header = uint8[pos];
                    isLast = (header & 0x80) !== 0;
                    const type = header & 0x7F;
                    const len = (uint8[pos + 1] << 16) | (uint8[pos + 2] << 8) | uint8[pos + 3];
                    pos += 4;
                    if (pos + len > uint8.length) break;

                    if (type === 0 && len >= 34) { // STREAMINFO
                        const sr = (uint8[pos + 10] << 12) | (uint8[pos + 11] << 4) | (uint8[pos + 12] >> 4);
                        const ch = ((uint8[pos + 12] >> 1) & 0x07) + 1;
                        const bps = (((uint8[pos + 12] & 0x01) << 4) | (uint8[pos + 13] >> 4)) + 1;
                        const hi = uint8[pos + 13] & 0x0F;
                        const lo = view.getUint32(pos + 14, false);
                        const totalSamples = (hi * 4294967296) + lo;
                        meta.sampleRate = sr;
                        meta.channels = ch;
                        meta.bitDepth = bps;
                        if (sr > 0) {
                            meta.duration = Math.round((totalSamples / sr) * 100) / 100;
                            if (meta.duration > 0) {
                                meta.bitrate = Math.round((file.size * 8) / meta.duration / 1000);
                            }
                        }
                    } else if (type === 4) { // VORBIS_COMMENT
                        let cPos = pos;
                        if (cPos + 4 <= pos + len) {
                            const vendorLen = view.getUint32(cPos, true);
                            cPos += 4 + vendorLen;
                            if (cPos + 4 <= pos + len) {
                                const count = view.getUint32(cPos, true);
                                cPos += 4;
                                const decoder = new TextDecoder('utf-8');
                                for (let i = 0; i < count; i++) {
                                    if (cPos + 4 > pos + len) break;
                                    const cLen = view.getUint32(cPos, true);
                                    cPos += 4;
                                    if (cPos + cLen > pos + len) break;
                                    const comment = decoder.decode(uint8.subarray(cPos, cPos + cLen));
                                    cPos += cLen;
                                    const eq = comment.indexOf('=');
                                    if (eq !== -1) {
                                        const k = comment.substring(0, eq).toUpperCase();
                                        const v = comment.substring(eq + 1).trim();
                                        if (k === 'TITLE') meta.title = v;
                                        else if (k === 'ARTIST') meta.artist = v;
                                        else if (k === 'ALBUM_ARTIST' && !meta.artist) meta.artist = v;
                                        else if (k === 'ALBUM') meta.album = v;
                                        else if (k === 'GENRE') meta.genre = v;
                                        else if (k === 'DATE' || k === 'YEAR') {
                                            const m = v.match(/\d{4}/);
                                            if (m) meta.year = parseInt(m[0], 10);
                                        }
                                        else if (k === 'TRACKNUMBER' || k === 'TRACK') meta.track = v.replace(/\/\d+$/, '');
                                        else if (k === 'LYRICS' || k === 'UNSYNCEDLYRICS') meta.lyrics = v;
                                    }
                                }
                            }
                        }
                    } else if (type === 6) { // PICTURE
                        let pPos = pos;
                        pPos += 4;
                        if (pPos + 4 <= pos + len) {
                            const mimeLen = view.getUint32(pPos, false);
                            pPos += 4;
                            const decoder = new TextDecoder('ascii');
                            const mime = decoder.decode(uint8.subarray(pPos, pPos + mimeLen)) || 'image/jpeg';
                            pPos += mimeLen;
                            const descLen = view.getUint32(pPos, false);
                            pPos += 4 + descLen + 16;
                            const picLen = view.getUint32(pPos, false);
                            pPos += 4;
                            if (pPos + picLen <= uint8.length) {
                                let binary = '';
                                const picBytes = uint8.subarray(pPos, pPos + picLen);
                                const chunk = 8192;
                                for (let i = 0; i < picBytes.length; i += chunk) {
                                    binary += String.fromCharCode.apply(null, picBytes.subarray(i, i + chunk));
                                }
                                meta.cover = 'data:' + mime + ';base64,' + btoa(binary);
                            }
                        }
                    }
                    pos += len;
                }
            } else if (uint8[0] === 0x49 && uint8[1] === 0x44 && uint8[2] === 0x33) {
                // MP3 ID3v2 Tag Extraction
                meta.format = 'MP3';
                const version = uint8[3];
                const tagSize = ((uint8[6] & 0x7F) << 21) | ((uint8[7] & 0x7F) << 14) | ((uint8[8] & 0x7F) << 7) | (uint8[9] & 0x7F);
                let pos = 10;
                const end = Math.min(uint8.length, 10 + tagSize);

                function decodeId3Text(bytes) {
                    if (!bytes || bytes.length <= 1) return '';
                    const enc = bytes[0];
                    const raw = bytes.subarray(1);
                    try {
                        if (enc === 1) return new TextDecoder('utf-16le').decode(raw).replace(/^\uFEFF/, '').replace(/\0+$/, '');
                        if (enc === 2) return new TextDecoder('utf-16be').decode(raw).replace(/^\uFEFF/, '').replace(/\0+$/, '');
                        if (enc === 3) return new TextDecoder('utf-8').decode(raw).replace(/\0+$/, '');
                        return new TextDecoder('iso-8859-1').decode(raw).replace(/\0+$/, '');
                    } catch (_) {
                        return '';
                    }
                }

                const asciiDec = new TextDecoder('ascii');
                while (pos + 10 <= end) {
                    const frameId = asciiDec.decode(uint8.subarray(pos, pos + 4));
                    if (frameId.charCodeAt(0) === 0 || frameId.trim() === '') break;
                    const frameSize = (version >= 4)
                        ? (((uint8[pos + 4] & 0x7F) << 21) | ((uint8[pos + 5] & 0x7F) << 14) | ((uint8[pos + 6] & 0x7F) << 7) | (uint8[pos + 7] & 0x7F))
                        : view.getUint32(pos + 4, false);
                    pos += 10;
                    if (frameSize <= 0 || pos + frameSize > end) break;

                    const frameData = uint8.subarray(pos, pos + frameSize);
                    pos += frameSize;

                    if (frameId === 'TIT2') meta.title = decodeId3Text(frameData);
                    else if (frameId === 'TPE1') meta.artist = decodeId3Text(frameData);
                    else if (frameId === 'TALB') meta.album = decodeId3Text(frameData);
                    else if (frameId === 'TCON') meta.genre = decodeId3Text(frameData).replace(/^\((\d+)\)$/, '$1');
                    else if (frameId === 'TYER' || frameId === 'TDRC') {
                        const m = decodeId3Text(frameData).match(/\d{4}/);
                        if (m) meta.year = parseInt(m[0], 10);
                    }
                    else if (frameId === 'TRCK') meta.track = decodeId3Text(frameData).replace(/\/\d+$/, '');
                    else if ((frameId === 'USLT' || frameId === 'ULT') && frameData.length > 4) {
                        const enc = frameData[0];
                        let dStart = 4;
                        if (enc === 1 || enc === 2) {
                            while (dStart + 1 < frameData.length && !(frameData[dStart] === 0 && frameData[dStart + 1] === 0)) dStart += 2;
                            dStart += 2;
                        } else {
                            while (dStart < frameData.length && frameData[dStart] !== 0) dStart++;
                            dStart += 1;
                        }
                        const lyricBytes = frameData.subarray(dStart);
                        try {
                            if (enc === 1) meta.lyrics = new TextDecoder('utf-16le').decode(lyricBytes).replace(/^\uFEFF/, '').trim();
                            else if (enc === 2) meta.lyrics = new TextDecoder('utf-16be').decode(lyricBytes).replace(/^\uFEFF/, '').trim();
                            else if (enc === 3) meta.lyrics = new TextDecoder('utf-8').decode(lyricBytes).trim();
                            else meta.lyrics = new TextDecoder('iso-8859-1').decode(lyricBytes).trim();
                        } catch (_) {}
                    }
                    else if (frameId === 'APIC' && frameData.length > 10) {
                        const enc = frameData[0];
                        let mEnd = 1;
                        while (mEnd < frameData.length && frameData[mEnd] !== 0) mEnd++;
                        const mime = asciiDec.decode(frameData.subarray(1, mEnd)) || 'image/jpeg';
                        let dStart = mEnd + 2;
                        if (enc === 1 || enc === 2) {
                            while (dStart + 1 < frameData.length && !(frameData[dStart] === 0 && frameData[dStart + 1] === 0)) dStart += 2;
                            dStart += 2;
                        } else {
                            while (dStart < frameData.length && frameData[dStart] !== 0) dStart++;
                            dStart += 1;
                        }
                        const picBytes = frameData.subarray(dStart);
                        if (picBytes.length > 50) {
                            let binary = '';
                            const chunk = 8192;
                            for (let i = 0; i < picBytes.length; i += chunk) {
                                binary += String.fromCharCode.apply(null, picBytes.subarray(i, i + chunk));
                            }
                            meta.cover = 'data:' + mime + ';base64,' + btoa(binary);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Local tag parse error:', e);
        }

        return meta;
    }


    async function scanDirectory(path, autoSelectTrack = true, isSilentBoot = false) {
        const cleanPath = (path || '').trim();
        let errorNotice = '';
        if (!isSilentBoot) {
            showTrackLoadingOverlay(
                'LOADING MUSIC LIBRARY...',
                cleanPath ? `Scanning "${cleanPath}" and indexing track metadata...` : 'Checking saved music directory...'
            );
        }
        setScanStatus(cleanPath ? `Scanning "${cleanPath}"...` : 'Checking saved music directory...', false);

        if (activeScanAbortController) {
            try { activeScanAbortController.abort(); } catch (_) {}
        }
        activeScanAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

        try {
            const endpoint = cleanPath ? `php/api/scan.php?directory=${encodeURIComponent(cleanPath)}` : 'php/api/scan.php';
            const res = await fetch(endpoint, activeScanAbortController ? { signal: activeScanAbortController.signal } : {});
            if (isTrackLoadingCancelled) {
                hideTrackLoadingOverlay();
                return;
            }
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.tracks) && data.tracks.length > 0) {
                    if (dismissedTracksMap.size > 0) {
                        allTracks = data.tracks.filter(t => !dismissedTracksMap.has(t.fullPath || t.filename || t.id));
                    } else {
                        allTracks = data.tracks;
                    }
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
        if (allTracks.length > 0 && autoSelectTrack) {
            let targetIdx = 0;
            const urlParams = new URLSearchParams(window.location.search);
            const reqTrack = urlParams.get('track');
            if (reqTrack !== null && !isNaN(parseInt(reqTrack, 10)) && allTracks[parseInt(reqTrack, 10)]) {
                targetIdx = parseInt(reqTrack, 10);
            } else if (currentTrackIndex >= 0 && allTracks[currentTrackIndex]) {
                targetIdx = currentTrackIndex;
            }
            loadTrack(targetIdx, false);
            if (isLyricsView) {
                updateLyricsDisplay(allTracks[targetIdx]);
            }
        }
    }

    function setScanStatus(msg, isError) {
        if (scanStatus) {
            scanStatus.textContent = msg;
            scanStatus.style.color = isError ? '#ff4d4d' : '#888888';
        }
        const settingsTabScanStatus = document.getElementById('settingsTabScanStatus');
        if (settingsTabScanStatus) {
            settingsTabScanStatus.textContent = msg;
            settingsTabScanStatus.style.color = isError ? '#ff4d4d' : 'var(--accent-color, #00f0ff)';
        }
    }

    // Load User Playlists
    async function loadPlaylists() {
        try {
            const res = await fetch('php/api/playlists.php');
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.playlists)) {
                    playlists = data.playlists;
                    try { safeStorage.setItem('cachymusic_cached_playlists', JSON.stringify(playlists)); } catch (e) {}
                    renderPlaylistsView();
                    return;
                }
            }
        } catch (e) {
            console.warn('Could not load playlists from backend, attempting offline fallback:', e);
        }

        // Offline / client-side fallback
        try {
            const local = JSON.parse(safeStorage.getItem('cachymusic_cached_playlists') || '[]');
            if (Array.isArray(local) && local.length > 0) {
                playlists = local;
                renderPlaylistsView();
            }
        } catch (e) {}
    }

    // ID3 Genre Normalization Table & Multi-Field Search Engine
    const ID3_GENRE_MAP = {
        0: 'Blues', 1: 'Classic Rock', 2: 'Country', 3: 'Dance', 4: 'Disco', 5: 'Funk',
        6: 'Grunge', 7: 'Hip-Hop', 8: 'Jazz', 9: 'Metal', 10: 'New Age', 11: 'Oldies',
        12: 'Other', 13: 'Pop', 14: 'R&B', 15: 'Rap', 16: 'Reggae', 17: 'Rock',
        18: 'Techno', 19: 'Industrial', 20: 'Alternative', 21: 'Ska', 22: 'Death Metal',
        23: 'Pranks', 24: 'Soundtrack', 25: 'Euro-Techno', 26: 'Ambient', 27: 'Trip-Hop',
        28: 'Vocal', 29: 'Jazz+Funk', 30: 'Fusion', 31: 'Trance', 32: 'Classical',
        33: 'Instrumental', 34: 'Acid', 35: 'House', 36: 'Game', 37: 'Sound Clip',
        38: 'Gospel', 39: 'Noise', 40: 'AlternRock', 41: 'Bass', 42: 'Soul',
        43: 'Punk', 44: 'Space', 45: 'Meditative', 46: 'Instrumental Pop',
        47: 'Instrumental Rock', 48: 'Ethnic', 49: 'Gothic', 50: 'Darkwave',
        51: 'Techno-Industrial', 52: 'Electronic', 53: 'Pop-Folk', 54: 'Eurodance',
        55: 'Dream', 56: 'Southern Rock', 57: 'Comedy', 58: 'Cult', 59: 'Gangsta',
        60: 'Top 40', 61: 'Christian Rap', 62: 'Pop/Funk', 63: 'Jungle',
        64: 'Native American', 65: 'Cabaret', 66: 'New Wave', 67: 'Psychadelic',
        68: 'Rave', 69: 'Showtunes', 70: 'Trailer', 71: 'Lo-Fi', 72: 'Tribal',
        73: 'Acid Punk', 74: 'Acid Jazz', 75: 'Polka', 76: 'Retro', 77: 'Musical',
        78: 'Rock & Roll', 79: 'Hard Rock'
    };

    function normalizeGenre(rawGenre) {
        if (!rawGenre) return '';
        const str = String(rawGenre).trim();
        const match = str.match(/^\(?(\d+)\)?$/);
        if (match) {
            const id = parseInt(match[1], 10);
            if (ID3_GENRE_MAP[id]) return ID3_GENRE_MAP[id];
        }
        const combinedMatch = str.match(/^\((\d+)\)\s*(.*)$/);
        if (combinedMatch) {
            const id = parseInt(combinedMatch[1], 10);
            const rest = combinedMatch[2].trim();
            const mapped = ID3_GENRE_MAP[id];
            return mapped ? (rest ? `${mapped} ${rest}` : mapped) : (rest || str);
        }
        return str;
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
                        displayedTracks = indices.map(i => allTracks[i]).filter(Boolean);
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
        const worker = getLibraryWorker();
        if (worker && allTracks.length > 200) {
            const reqId = ++libraryWorkerRequestId;
            const lightweightTracks = allTracks.map((t, idx) => {
                return {
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
                };
            });
            worker.postMessage({
                requestId: reqId,
                tracks: lightweightTracks,
                query: searchQuery,
                sort: currentSort,
                formatFilter: currentFormatFilter,
                currentPlaylistId
            });
            return;
        }

        let pool = [...allTracks];

        // Filter by Current Playlist
        if (currentPlaylistId !== null) {
            pool = pool.filter(t => t.inCurrentPlaylist);
        }

        // Filter by Quality Format (ALL, HI-RES, LOSSLESS, MP3/AAC)
        if (currentFormatFilter && currentFormatFilter !== 'all') {
            pool = pool.filter(t => {
                const fmt = (t.format || '').toLowerCase();
                const ext = (t.filename || '').split('.').pop().toLowerCase();
                const bd = t.bitDepth || ((t.sampleRate && t.sampleRate >= 88200) ? 24 : 16);
                const sr = t.sampleRate || 0;

                if (currentFormatFilter === 'hires') {
                    return (bd >= 24) || (sr >= 88200) || ['dsd', 'dsf'].includes(fmt) || ['dsd', 'dsf'].includes(ext);
                } else if (currentFormatFilter === 'lossless') {
                    return ['flac', 'wav', 'alac', 'aiff', 'ape', 'wv', 'dsd', 'dsf'].includes(fmt) ||
                           ['flac', 'wav', 'alac', 'aiff', 'ape', 'wv'].includes(ext);
                } else if (currentFormatFilter === 'lossy') {
                    return ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma'].includes(fmt) ||
                           ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wma'].includes(ext);
                }
                return true;
            });
        }

        // Filter by Search Query (Title, Artist, Album, Genre, Filename)
        if (searchQuery.trim() !== '') {
            const rawQ = searchQuery.toLowerCase().trim();
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

        // Apply Sorting
        switch (currentSort) {
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

        displayedTracks = pool;
        renderTrackList();
    }

    // Interactive Floating Toast Notification System

    function updateRestoreBtnUi() {
        if (!restoreTracksBtn) return;
        if (dismissedTracksMap.size > 0) {
            restoreTracksBtn.style.display = 'inline-flex';
            restoreTracksBtn.textContent = `RESTORE (${dismissedTracksMap.size})`;
        } else {
            restoreTracksBtn.style.display = 'none';
        }
    }

    // Remove track from active main tracks list (NOT deleting the physical file)
    function removeTrackFromMainList(track) {
        const key = track.fullPath || track.filename || track.id;
        const idxInAll = allTracks.findIndex(t => (track.tid && t.tid == track.tid) || (track.fullPath && t.fullPath === track.fullPath) || (t.id == track.id) || (t.filename === track.filename));
        if (idxInAll === -1) return;

        const removedTrack = allTracks[idxInAll];
        dismissedTracksMap.set(key, { track: removedTrack, originalIndex: idxInAll });
        allTracks.splice(idxInAll, 1);

        // If the removed track is currently loaded/playing in the deck
        if (currentTrackIndex === idxInAll) {
            if (allTracks.length > 0) {
                const nextIdx = Math.min(idxInAll, allTracks.length - 1);
                loadTrack(nextIdx, !audio.paused);
            } else {
                audio.src = '';
                pauseAudio();
                updateEmptyPlayerState();
            }
        } else if (currentTrackIndex > idxInAll) {
            currentTrackIndex--;
        }

        applySearchAndSort();
        updateRestoreBtnUi();

        const trackTitle = removedTrack.title || removedTrack.filename || 'Track';
        showToast(
            `Removed "${trackTitle}" from list (file remains safe on disk)`,
            'UNDO',
            () => {
                dismissedTracksMap.delete(key);
                const insertIdx = Math.min(idxInAll, allTracks.length);
                allTracks.splice(insertIdx, 0, removedTrack);
                updateEmptyPlayerState();
                applySearchAndSort();
                updateRestoreBtnUi();
                showToast(`Restored "${trackTitle}" to list`);
            }
        );
    }

    // Delegated trackList interaction handler
    let isTrackListDelegated = false;
    function initTrackListDelegation() {
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
                const plName = currentPlaylistName;
                backToAllTracks();
                showToast(`Browse library and click "+" on any song to add it to "${plName}".`);
                return;
            }

            const trackMenuTrigger = e.target.closest('.trackMenuTriggerBtn');
            if (trackMenuTrigger) {
                e.stopPropagation();
                const item = trackMenuTrigger.closest('.trackItem');
                const idx = item ? parseInt(item.dataset.index, 10) : -1;
                const track = displayedTracks[idx];
                if (track) openTrackActionMenu(track, idx);
                return;
            }

            const playNextBtn = e.target.closest('.playNextTrackBtn');
            if (playNextBtn) {
                e.stopPropagation();
                const item = playNextBtn.closest('.trackItem');
                const idx = item ? parseInt(item.dataset.index, 10) : -1;
                const track = displayedTracks[idx];
                if (track) addToQueue(track, true);
                return;
            }

            const enqueueBtn = e.target.closest('.enqueueTrackBtn');
            if (enqueueBtn) {
                e.stopPropagation();
                const item = enqueueBtn.closest('.trackItem');
                const idx = item ? parseInt(item.dataset.index, 10) : -1;
                const track = displayedTracks[idx];
                if (track) addToQueue(track, false);
                return;
            }

            const openAddModalBtn = e.target.closest('.openAddModalBtn');
            if (openAddModalBtn) {
                e.stopPropagation();
                const item = openAddModalBtn.closest('.trackItem');
                const idx = item ? parseInt(item.dataset.index, 10) : -1;
                const track = displayedTracks[idx];
                if (track) openAddToPlaylistModal(track);
                return;
            }

            const removeMainTrackBtn = e.target.closest('.removeMainTrackBtn');
            if (removeMainTrackBtn) {
                e.stopPropagation();
                const item = removeMainTrackBtn.closest('.trackItem');
                const idx = item ? parseInt(item.dataset.index, 10) : -1;
                const track = displayedTracks[idx];
                if (track) removeTrackFromMainList(track);
                return;
            }

            const removePlaylistBtn = e.target.closest('.removePlaylistBtn');
            if (removePlaylistBtn) {
                e.stopPropagation();
                const item = removePlaylistBtn.closest('.trackItem');
                const idx = item ? parseInt(item.dataset.index, 10) : -1;
                const track = displayedTracks[idx];
                if (track) removeTrackFromCurrentPlaylist(track);
                return;
            }

            const item = e.target.closest('.trackItem');
            if (item && !e.target.closest('.addPlaylistBtn') && !e.target.closest('.actionPillBtn') && !e.target.closest('.trackMenuTriggerBtn')) {
                const idx = parseInt(item.dataset.index, 10);
                const track = displayedTracks[idx];
                if (track) {
                    const masterIdx = allTracks.findIndex(t => {
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
    const VIRTUAL_ROW_HEIGHT = 65.2; // 59.6px card + 5.6px gap
    const VIRTUAL_BUFFER_ROWS = 8;   // Render 8 buffer items above/below viewport
    let isVirtualScrollBound = false;
    let isVirtualScrollPending = false;
    let virtualTrackState = {
        startIndex: -1,
        endIndex: -1
    };

    function renderVirtualTrackWindow(force = false) {
        if (!trackList) return;
        const total = displayedTracks.length;
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

        const cur = allTracks[currentTrackIndex];

        function buildTrackItemElement(track, idx, isCurrent) {
            const item = document.createElement('div');
            item.className = `trackItem ${isCurrent ? 'active' : ''}`;
            item.dataset.id = track.id || track.tid || track.filename || '';
            item.dataset.index = idx;

            const coverSrc = track.cover ? (track.cover + (track.cover.includes('?') ? '&thumb=1' : '?thumb=1')) : 'resources/images/default.svg';
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
                    ${currentPlaylistId !== null ? `
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
                const track = displayedTracks[idx];
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

        // Keyed DOM reconciliation: Keep already-rendered rows intact so images do not flicker or re-download
        const existingRows = new Map();
        for (const child of Array.from(container.children)) {
            const rowIdx = parseInt(child.dataset.index, 10);
            if (!isNaN(rowIdx) && rowIdx >= startIndex && rowIdx < endIndex) {
                existingRows.set(rowIdx, child);
                const curTrack = displayedTracks[rowIdx];
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
            const track = displayedTracks[idx];
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
        if (!trackList || index < 0 || index >= displayedTracks.length) return;
        const targetTop = Math.max(0, (index * VIRTUAL_ROW_HEIGHT) - (trackList.clientHeight / 2 - VIRTUAL_ROW_HEIGHT / 2));
        if (smooth) {
            trackList.scrollTo({ top: targetTop, behavior: 'smooth' });
        } else {
            trackList.scrollTop = targetTop;
        }
        renderVirtualTrackWindow(true);
    }

    // Render Track List with Virtual Windowing
    function renderTrackList(preserveScroll = false) {
        initTrackListDelegation();
        initVirtualScrollListener();
        trackCount.textContent = `${displayedTracks.length} TRACK${displayedTracks.length === 1 ? '' : 'S'}`;

        if (displayedTracks.length === 0) {
            trackList.innerHTML = '';
            virtualTrackState.startIndex = -1;
            virtualTrackState.endIndex = -1;
            if (currentPlaylistId !== null) {
                trackList.innerHTML = `
                    <div class="emptyPlaylistNotice">
                        <div class="emptyPlaylistIcon">🎵</div>
                        <h3 class="emptyPlaylistTitle">"${escapeHtml(currentPlaylistName)}" is empty</h3>
                        <p class="emptyPlaylistDesc">Add songs to this playlist from your library by clicking the "+" button next to any track in ALL TRACKS.</p>
                        <button type="button" class="actionBtn primaryBtn emptyBrowseBtn" id="emptyBrowseTracksBtn">
                            ← BROWSE ALL TRACKS
                        </button>
                    </div>
                `;
            } else if (allTracks.length === 0) {
                trackList.innerHTML = `
                    <div class="emptyLibraryNotice">
                        <h3 class="emptyPlaylistTitle">No Music Directory Loaded</h3>
                        <p class="emptyPlaylistDesc">Choose your music directory first to load tracks. In case of error, configure the folder manually in <strong>Settings &rarr; Library &amp; Folders</strong>.</p>
                        <div class="emptyLibraryActions">
                            <button type="button" class="actionBtn primaryBtn" id="emptyTrackListChooseDirBtn">CHOOSE DIRECTORY</button>
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

        // Initialize Virtual Container Skeleton if not present
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
    // MusicBee & Musicolet Style Playlist Management Engine
    // Upfront cards with 1-tap play, shuffle, queue, and batch song management
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
        if (!playlistList) return;
        playlistList.innerHTML = '';

        const summaryBadge = document.getElementById('playlistsSummaryBadge');
        if (summaryBadge) {
            const totalTracks = playlists.reduce((acc, p) => acc + (p.track_count || 0), 0);
            summaryBadge.textContent = `${playlists.length} Playlist${playlists.length === 1 ? '' : 's'} • ${totalTracks} Track${totalTracks === 1 ? '' : 's'}`;
        }

        if (playlists.length === 0) {
            playlistList.innerHTML = `
                <div class="playlistEmptyContainer">
                    <div class="playlistEmptyIcon">📂</div>
                    <div class="playlistEmptyTitle">No playlists yet</div>
                    <div class="playlistEmptyDesc">Use the quick presets above or type a name to create your first high-fidelity playlist!</div>
                </div>
            `;
            return;
        }

        playlists.forEach(pl => {
            const count = pl.track_count || 0;
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

            // Card body opens playlist
            const mainBody = card.querySelector('.playlistCardMain');
            const artBody = card.querySelector('.playlistCardArtwork');
            [mainBody, artBody].forEach(el => {
                if (el) el.addEventListener('click', () => openPlaylist(pl.plid, pl.name));
            });

            // Action: 1-Tap Play
            const playBtn = card.querySelector('.playlistActionPlayBtn');
            if (playBtn) {
                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    playPlaylistDirectly(pl.plid, pl.name, false);
                });
            }

            // Action: 1-Tap Shuffle
            const shufBtn = card.querySelector('.playlistActionShuffleBtn');
            if (shufBtn) {
                shufBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    playPlaylistDirectly(pl.plid, pl.name, true);
                });
            }

            // Action: Add to Queue
            const qBtn = card.querySelector('.playlistActionQueueBtn');
            if (qBtn) {
                qBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    queuePlaylistTracks(pl.plid, pl.name);
                });
            }

            // Action: Delete Playlist
            const delBtn = card.querySelector('.playlistCardDeleteBtn');
            if (delBtn) {
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete playlist "${pl.name}"?`)) return;
                    try {
                        const res = await fetch('php/api/playlists.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'delete', plid: pl.plid })
                        });
                        const data = await res.json();
                        if (data.success) {
                            playlists = playlists.filter(p => p.plid != pl.plid);
                            if (currentPlaylistId == pl.plid) {
                                backToPlaylistsView();
                            }
                            renderPlaylistsView();
                            showToast(`Deleted playlist "${pl.name}".`);
                        }
                    } catch (err) {
                        console.warn('Delete playlist error:', err);
                    }
                });
            }

            playlistList.appendChild(card);
        });
    }

    // Play Entire Playlist Directly
    async function playPlaylistDirectly(plid, name, shuffle = false) {
        await openPlaylist(plid, name);
        const plTracks = displayedTracks.filter(t => t.inCurrentPlaylist);
        if (plTracks.length === 0) {
            showToast(`Playlist "${name}" is empty. Add songs first!`);
            return;
        }

        if (shuffle) {
            const shuffled = [...plTracks].sort(() => Math.random() - 0.5);
            const first = shuffled[0];
            const masterIdx = allTracks.findIndex(t => (first.id && t.id == first.id) || (first.tid && t.tid == first.tid) || t.filename === first.filename);
            if (masterIdx !== -1) {
                loadTrack(masterIdx, true);
                playQueue = shuffled.slice(1);
                updateQueueUi();
                showToast(`Shuffled "${name}" (${shuffled.length} tracks)`);
            }
        } else {
            const first = plTracks[0];
            const masterIdx = allTracks.findIndex(t => (first.id && t.id == first.id) || (first.tid && t.tid == first.tid) || t.filename === first.filename);
            if (masterIdx !== -1) {
                loadTrack(masterIdx, true);
                playQueue = plTracks.slice(1);
                updateQueueUi();
                showToast(`Playing playlist "${name}"`);
            }
        }
    }

    // Queue All Tracks in Playlist
    async function queuePlaylistTracks(plid, name) {
        try {
            const res = await fetch(`php/api/playlists.php?plid=${plid}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.tracks) && data.tracks.length > 0) {
                    data.tracks.forEach(track => {
                        let existing = allTracks.find(t => (track.id && t.id == track.id) || (track.tid && t.tid == track.tid) || t.filename === track.filename);
                        if (!existing) {
                            allTracks.push(track);
                            existing = track;
                        }
                        playQueue.push(existing);
                    });
                    updateQueueUi();
                    showToast(`Queued ${data.tracks.length} tracks from "${name}"`);
                    return;
                }
            }
        } catch (e) {
            console.warn('Queue playlist error:', e);
        }
        showToast(`Could not queue tracks from "${name}"`);
    }

    // Open Specific Playlist
    async function openPlaylist(plid, name) {
        currentPlaylistId = plid;
        currentPlaylistName = name;
        activeListLabel.textContent = `PLAYLIST: ${name.toUpperCase()}`;
        currentPlaylistTitle.textContent = name;

        try {
            safeStorage.setItem('cachymusic_last_playlist_id', plid.toString());
            safeStorage.setItem('cachymusic_last_playlist_name', name || '');
        } catch (_) {}

        const quickFormatBar = document.getElementById('quickFormatFilterBar');
        tabPlaylists.classList.remove('active');
        tabLibrary.classList.add('active');
        playlistsView.style.display = 'none';
        libraryControls.style.display = 'none';
        if (quickFormatBar) quickFormatBar.style.display = 'flex';
        playlistBanner.style.display = 'flex';
        trackList.style.display = 'flex';

        try {
            const res = await fetch(`php/api/playlists.php?plid=${plid}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.tracks)) {
                    data.tracks.forEach(plTrack => {
                        let existing = allTracks.find(t => t.tid == plTrack.tid || (t.fullPath && t.fullPath === plTrack.fullPath));
                        if (!existing) {
                            allTracks.push(plTrack);
                            existing = plTrack;
                        }
                        existing.inCurrentPlaylist = true;
                    });
                    const plTrackTids = data.tracks.map(t => parseInt(t.tid, 10));
                    allTracks.forEach(t => {
                        if (!plTrackTids.includes(parseInt(t.tid, 10)) && !plTrackTids.includes(parseInt(t.id, 10))) {
                            t.inCurrentPlaylist = false;
                        }
                    });

                    // Update playlist banner duration metadata
                    const metaEl = document.getElementById('currentPlaylistMeta');
                    if (metaEl) {
                        const totalSecs = data.tracks.reduce((sum, t) => sum + (t.duration || 210), 0);
                        metaEl.textContent = `${data.tracks.length} TRACK${data.tracks.length === 1 ? '' : 'S'} • ${formatPlaylistEstDuration(totalSecs)}`;
                    }
                }
            }
        } catch (e) {
            console.warn('Error fetching playlist tracks:', e);
        }

        applySearchAndSort();
    }

    // Return to All Playlists View (Musicolet & MusicBee Style)
    function backToPlaylistsView() {
        currentPlaylistId = null;
        currentPlaylistName = '';
        activeListLabel.textContent = 'ALL TRACKS';
        allTracks.forEach(t => t.inCurrentPlaylist = false);

        try {
            safeStorage.removeItem('cachymusic_last_playlist_id');
            safeStorage.removeItem('cachymusic_last_playlist_name');
        } catch (_) {}

        const quickFormatBar = document.getElementById('quickFormatFilterBar');
        playlistBanner.style.display = 'none';
        trackList.style.display = 'none';
        if (queueView) queueView.style.display = 'none';
        libraryControls.style.display = 'none';
        if (quickFormatBar) quickFormatBar.style.display = 'none';
        tabLibrary.classList.remove('active');
        if (tabQueue) tabQueue.classList.remove('active');
        tabPlaylists.classList.add('active');
        playlistsView.style.display = 'flex';
        renderPlaylistsView();
    }

    // Return to All Tracks Library View
    function backToAllTracks() {
        currentPlaylistId = null;
        currentPlaylistName = '';
        activeListLabel.textContent = 'ALL TRACKS';
        allTracks.forEach(t => t.inCurrentPlaylist = false);

        try {
            safeStorage.removeItem('cachymusic_last_playlist_id');
            safeStorage.removeItem('cachymusic_last_playlist_name');
        } catch (_) {}

        const quickFormatBar = document.getElementById('quickFormatFilterBar');
        playlistBanner.style.display = 'none';
        libraryControls.style.display = 'flex';
        if (quickFormatBar) quickFormatBar.style.display = 'flex';
        applySearchAndSort();
    }

    // =========================================================================
    // Modal History & State Navigation Engine (W3C PWA & Android Hardware Back)
    // =========================================================================
    function pushModalState(modalId) {
        try {
            history.pushState({ cachyModal: modalId }, '');
        } catch (_) {}
    }

    function popModalState(modalId) {
        try {
            if (history.state && history.state.cachyModal === modalId) {
                history.back();
            }
        } catch (_) {}
    }

    window.addEventListener('popstate', (e) => {
        // If a modal was open when user pressed back, dismiss it cleanly
        const themeModalEl = document.getElementById('themeModal');
        if (themeModalEl && (themeModalEl.style.display === 'flex' || window.getComputedStyle(themeModalEl).display === 'flex')) {
            themeModalEl.style.display = 'none';
            return;
        }
        const peqModalEl = document.getElementById('peqModal');
        if (peqModalEl && (peqModalEl.style.display === 'flex' || window.getComputedStyle(peqModalEl).display === 'flex')) {
            peqModalEl.style.display = 'none';
            return;
        }
        const playlistModalEl = document.getElementById('playlistModal');
        if (playlistModalEl && (playlistModalEl.style.display === 'flex' || window.getComputedStyle(playlistModalEl).display === 'flex')) {
            playlistModalEl.style.display = 'none';
            return;
        }
        const trackActionMenuModalEl = document.getElementById('trackActionMenuModal');
        if (trackActionMenuModalEl && (trackActionMenuModalEl.style.display === 'flex' || window.getComputedStyle(trackActionMenuModalEl).display === 'flex')) {
            trackActionMenuModalEl.style.display = 'none';
            return;
        }
        const signalPathModalEl = document.getElementById('signalPathModal');
        if (signalPathModalEl && (signalPathModalEl.style.display === 'flex' || window.getComputedStyle(signalPathModalEl).display === 'flex')) {
            signalPathModalEl.style.display = 'none';
            return;
        }
        const sleepTimerModalEl = document.getElementById('sleepTimerModal');
        if (sleepTimerModalEl && (sleepTimerModalEl.style.display === 'flex' || window.getComputedStyle(sleepTimerModalEl).display === 'flex')) {
            sleepTimerModalEl.style.display = 'none';
            return;
        }
        const slskAccountModalEl = document.getElementById('slskAccountModal');
        if (slskAccountModalEl && (slskAccountModalEl.style.display === 'flex' || window.getComputedStyle(slskAccountModalEl).display === 'flex')) {
            slskAccountModalEl.style.display = 'none';
            return;
        }
        const batchModalEl = document.getElementById('batchAddSongsModal');
        if (batchModalEl && (batchModalEl.style.display === 'flex' || window.getComputedStyle(batchModalEl).display === 'flex')) {
            batchModalEl.style.display = 'none';
            return;
        }
    });

    function openSlskAccountModal() {
        if (!slskAccountModal) return;
        const transfersDrawer = document.getElementById('slskTransfersDrawer');
        if (transfersDrawer && transfersDrawer.classList.contains('open')) {
            transfersDrawer.classList.remove('open');
        }
        slskAccountModal.style.display = 'flex';
        pushModalState('slskAccountModal');
    }

    function closeSlskAccountModal() {
        if (!slskAccountModal) return;
        slskAccountModal.style.display = 'none';
        popModalState('slskAccountModal');
    }

    // =========================================================================
    // Batch Add Songs Modal Engine (Musicolet & MusicBee Style)
    // =========================================================================
    function openBatchAddModal() {
        if (!currentPlaylistId) return;
        const modal = document.getElementById('batchAddSongsModal');
        const titleEl = document.getElementById('batchAddModalTitle');
        const listEl = document.getElementById('batchAddTracksList');
        const searchInput = document.getElementById('batchAddSearchInput');
        const summaryEl = document.getElementById('batchAddSummaryText');
        if (!modal || !listEl) return;

        if (titleEl) titleEl.textContent = `ADD SONGS TO "${(currentPlaylistName || 'PLAYLIST').toUpperCase()}"`;
        if (searchInput) searchInput.value = '';

        const renderBatchList = (filterStr = '') => {
            listEl.innerHTML = '';
            const f = filterStr.toLowerCase().trim();
            const filtered = allTracks.filter(t => {
                if (!f) return true;
                const target = `${t.title || t.filename || ''} ${t.artist || ''} ${t.album || ''}`.toLowerCase();
                return target.includes(f);
            });

            if (filtered.length === 0) {
                listEl.innerHTML = '<div class="batchAddEmpty">No tracks matched your search.</div>';
                return;
            }

            const currentCount = allTracks.filter(t => t.inCurrentPlaylist).length;
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
                        const ok = await addTrackToPlaylist(currentPlaylistId, track.tid || track.id, track);
                        if (ok) {
                            track.inCurrentPlaylist = true;
                            toggleBtn.classList.add('isAdded');
                            toggleBtn.textContent = '✓ ADDED';
                        } else {
                            toggleBtn.textContent = '+ ADD';
                        }
                    }
                    const updatedCount = allTracks.filter(t => t.inCurrentPlaylist).length;
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
    // Apple Music & Plexamp-grade intuitive queueing with drag/order control
    // =========================================================================
    function addToQueue(track, playNext = false) {
        if (!track) return;
        if (playNext) {
            playQueue.unshift(track);
            showToast(`Playing next: "${track.title || track.filename}"`);
        } else {
            playQueue.push(track);
            showToast(`Added to queue: "${track.title || track.filename}"`);
        }
        updateQueueUi();
    }

    function removeFromQueue(index) {
        if (index >= 0 && index < playQueue.length) {
            const removed = playQueue.splice(index, 1)[0];
            updateQueueUi();
            showToast(`Removed "${removed.title || removed.filename}" from queue`);
        }
    }

    function moveQueueItem(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= playQueue.length || toIndex < 0 || toIndex >= playQueue.length) return;
        const [item] = playQueue.splice(fromIndex, 1);
        playQueue.splice(toIndex, 0, item);
        updateQueueUi();
    }

    function clearQueue() {
        if (playQueue.length === 0) return;
        playQueue = [];
        updateQueueUi();
        showToast('Play queue cleared');
    }

    function updateQueueUi() {
        if (queueCountBadge) {
            queueCountBadge.textContent = playQueue.length > 0 ? playQueue.length : '';
            queueCountBadge.style.display = playQueue.length > 0 ? 'inline-flex' : 'none';
        }
        if (queueCountSummary) {
            queueCountSummary.textContent = `${playQueue.length} song${playQueue.length === 1 ? '' : 's'} queued`;
        }
        if (queueView && queueView.style.display !== 'none') {
            renderQueueView();
        }
    }

    function renderQueueView() {
        if (!queueList) return;
        if (playQueue.length === 0) {
            queueList.innerHTML = '<div class="queueEmpty">Your queue is empty. Click "+ Queue" or "⤹ Next" on any track.</div>';
        } else {
            const frag = document.createDocumentFragment();
            playQueue.forEach((track, idx) => {
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
                        ${idx < playQueue.length - 1 ? `<button type="button" class="queueMoveBtn moveDownBtn" data-idx="${idx}" title="Move down">▼</button>` : ''}
                        <button type="button" class="queuePlayNowBtn" data-idx="${idx}" title="Play now">▶</button>
                        <button type="button" class="queueRemoveBtn" data-idx="${idx}" title="Remove from queue">✕</button>
                    </div>
                `;
                frag.appendChild(item);
            });
            queueList.innerHTML = '';
            queueList.appendChild(frag);
        }

        // Render Continuing from Library Preview
        if (upcomingLibraryList) {
            const pool = displayedTracks.length > 0 ? displayedTracks : allTracks;
            let curIdx = pool.findIndex(t => {
                const cur = allTracks[currentTrackIndex];
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

    // Track Actions & Options Context Menu Engine (Mobile Bottom Sheet & Menu)
    // =========================================================================
    let selectedTrackForMenu = null;
    let selectedTrackIndexForMenu = -1;

    function openTrackActionMenu(track, idx) {
        if (!track) return;
        selectedTrackForMenu = track;
        selectedTrackIndexForMenu = idx;

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
            thumb.src = track.cover ? (track.cover + (track.cover.includes('?') ? '&thumb=1' : '?thumb=1')) : 'resources/images/default.svg';
        }
        if (title) {
            title.textContent = track.title || track.filename || 'Unknown Track';
        }
        if (artist) {
            const art = track.artist || 'Unknown Artist';
            const alb = track.album ? ` • ${track.album}` : '';
            artist.textContent = `${art}${alb}`;
        }
        if (formatPill) {
            formatPill.textContent = (track.format || 'AUDIO').toUpperCase();
        }
        if (durationPill) {
            durationPill.textContent = formatTime(track.duration);
        }

        if (removeLabel && removeSub) {
            if (currentPlaylistId !== null) {
                removeLabel.textContent = `Remove from Playlist`;
                removeSub.textContent = `Remove from "${currentPlaylistName || 'Playlist'}"`;
            } else {
                removeLabel.textContent = `Remove from Library List`;
                removeSub.textContent = `Hide from current list (does not delete file)`;
            }
        }

        modal.style.display = 'flex';
        pushModalState('trackActionMenuModal');
    }

    function closeTrackActionMenu() {
        const modal = document.getElementById('trackActionMenuModal');
        if (modal) modal.style.display = 'none';
        popModalState('trackActionMenuModal');
        selectedTrackForMenu = null;
        selectedTrackIndexForMenu = -1;
    }

    // Add Track to Playlist Modal
    function openAddToPlaylistModal(track) {
        selectedTrackForPlaylist = track;
        modalTrackTitle.textContent = `${track.title || track.filename} — ${track.artist || 'Unknown'}`;
        modalPlaylistList.innerHTML = '';

        // Quick Queue Actions (Ideal for mobile single-tap access & desktop)
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

        if (playlists.length === 0) {
            const emptyNotice = document.createElement('div');
            emptyNotice.className = 'modalPlaylistEmpty';
            emptyNotice.textContent = 'No playlists yet. Create your first one below:';
            modalPlaylistList.appendChild(emptyNotice);
        } else {
            playlists.forEach(pl => {
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

        playlistModal.style.display = 'flex';
        pushModalState('playlistModal');
        setTimeout(() => {
            if (modalNewPlaylistName) modalNewPlaylistName.focus();
        }, 100);
    }

    function closePlaylistModal() {
        playlistModal.style.display = 'none';
        popModalState('playlistModal');
        selectedTrackForPlaylist = null;
        modalNewPlaylistName.value = '';
    }

    async function addTrackToPlaylist(plid, tid, track = null) {
        try {
            const res = await fetch('php/api/playlists.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'add_track', plid, tid })
            });
            const data = await res.json();
            const p = playlists.find(x => x.plid == plid);
            const plName = p ? p.name : 'playlist';
            const trackName = track ? (track.title || track.filename) : 'Track';

            if (data.success) {
                if (p) p.track_count = (p.track_count || 0) + 1;
                renderPlaylistsView();
                showToast(`Added "${trackName}" to "${plName}".`);
                return true;
            } else {
                if (data.message === 'Track already in playlist.') {
                    showToast(`"${trackName}" is already in "${plName}".`);
                } else {
                    showToast(data.message || 'Could not add to playlist.');
                }
                return false;
            }
        } catch (e) {
            console.warn('Add track to playlist API error:', e);
            return false;
        }
    }

    async function removeTrackFromCurrentPlaylist(track) {
        if (!currentPlaylistId) return;
        try {
            await fetch('php/api/playlists.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove_track', plid: currentPlaylistId, tid: track.tid || track.id })
            });
            track.inCurrentPlaylist = false;
            const p = playlists.find(x => x.plid == currentPlaylistId);
            if (p && p.track_count > 0) p.track_count--;
            applySearchAndSort();
        } catch (e) {
            console.warn('Remove track API error:', e);
        }
    }

    // Attach library functions to window
    if (typeof window !== "undefined") {
        try { window.openLibraryIdb = openLibraryIdb; } catch (_) {}
        try { window.saveLibraryToIndexedDB = saveLibraryToIndexedDB; } catch (_) {}
        try { window.loadLibraryFromIndexedDB = loadLibraryFromIndexedDB; } catch (_) {}
        try { window.parseAudioFileMetadata = parseAudioFileMetadata; } catch (_) {}
        try { window.scanDirectory = scanDirectory; } catch (_) {}
        try { window.setScanStatus = setScanStatus; } catch (_) {}
        try { window.loadPlaylists = loadPlaylists; } catch (_) {}
        try { window.getLibraryWorker = getLibraryWorker; } catch (_) {}
        try { window.applySearchAndSort = applySearchAndSort; } catch (_) {}
        try { window.updateRestoreBtnUi = updateRestoreBtnUi; } catch (_) {}
        try { window.removeTrackFromMainList = removeTrackFromMainList; } catch (_) {}
        try { window.initTrackListDelegation = initTrackListDelegation; } catch (_) {}
        try { window.renderVirtualTrackWindow = renderVirtualTrackWindow; } catch (_) {}
        try { window.initVirtualScrollListener = initVirtualScrollListener; } catch (_) {}
        try { window.scrollToTrackIndex = scrollToTrackIndex; } catch (_) {}
        try { window.renderTrackList = renderTrackList; } catch (_) {}
        try { window.formatPlaylistEstDuration = formatPlaylistEstDuration; } catch (_) {}
        try { window.renderPlaylistsView = renderPlaylistsView; } catch (_) {}
        try { window.playPlaylistDirectly = playPlaylistDirectly; } catch (_) {}
        try { window.queuePlaylistTracks = queuePlaylistTracks; } catch (_) {}
        try { window.openPlaylist = openPlaylist; } catch (_) {}
        try { window.backToPlaylistsView = backToPlaylistsView; } catch (_) {}
        try { window.backToAllTracks = backToAllTracks; } catch (_) {}
        try { window.pushModalState = pushModalState; } catch (_) {}
        try { window.popModalState = popModalState; } catch (_) {}
        try { window.openSlskAccountModal = openSlskAccountModal; } catch (_) {}
        try { window.closeSlskAccountModal = closeSlskAccountModal; } catch (_) {}
        try { window.openBatchAddModal = openBatchAddModal; } catch (_) {}
        try { window.closeBatchAddModal = closeBatchAddModal; } catch (_) {}
        try { window.addToQueue = addToQueue; } catch (_) {}
        try { window.removeFromQueue = removeFromQueue; } catch (_) {}
        try { window.moveQueueItem = moveQueueItem; } catch (_) {}
        try { window.clearQueue = clearQueue; } catch (_) {}
        try { window.updateQueueUi = updateQueueUi; } catch (_) {}
        try { window.renderQueueView = renderQueueView; } catch (_) {}
        try { window.openTrackActionMenu = openTrackActionMenu; } catch (_) {}
        try { window.closeTrackActionMenu = closeTrackActionMenu; } catch (_) {}
        try { window.openAddToPlaylistModal = openAddToPlaylistModal; } catch (_) {}
        try { window.closePlaylistModal = closePlaylistModal; } catch (_) {}
        try { window.addTrackToPlaylist = addTrackToPlaylist; } catch (_) {}
        try { window.removeTrackFromCurrentPlaylist = removeTrackFromCurrentPlaylist; } catch (_) {}
    }

    export {
        openLibraryIdb,
        saveLibraryToIndexedDB,
        loadLibraryFromIndexedDB,
        parseAudioFileMetadata,
        scanDirectory,
        setScanStatus,
        loadPlaylists,
        getLibraryWorker,
        applySearchAndSort,
        updateRestoreBtnUi,
        removeTrackFromMainList,
        initTrackListDelegation,
        renderVirtualTrackWindow,
        initVirtualScrollListener,
        scrollToTrackIndex,
        renderTrackList,
        formatPlaylistEstDuration,
        renderPlaylistsView,
        playPlaylistDirectly,
        queuePlaylistTracks,
        openPlaylist,
        backToPlaylistsView,
        backToAllTracks,
        pushModalState,
        popModalState,
        openSlskAccountModal,
        closeSlskAccountModal,
        openBatchAddModal,
        closeBatchAddModal,
        addToQueue,
        removeFromQueue,
        moveQueueItem,
        clearQueue,
        updateQueueUi,
        renderQueueView,
        openTrackActionMenu,
        closeTrackActionMenu,
        openAddToPlaylistModal,
        closePlaylistModal,
        addTrackToPlaylist,
        removeTrackFromCurrentPlaylist,
        normalizeGenre,
        getTrackSearchString
    };
