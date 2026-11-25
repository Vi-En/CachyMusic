import {playbackPool} from './playlist-playback.js';
// Android-only native transport. The ordinary PWA never sees a privileged URI.
import { sameTrack } from './pcm-transition.js';

// Keep the serialized intent extras well within Android's Binder budget.
const MAX_ORDER_TRACKS = 24;
const MAX_ORDER_LENGTH = 32000;
const MAX_CATALOG_TRACKS = 4096;
const MAX_CATALOG_LENGTH = 2000000;
const MAX_QUEUE_CATALOG_TRACKS = 512;

export function indexedSource(track) {
    try {
        const url = new URL(track?.src || '');
        if (url.origin !== 'https://appassets.androidplatform.net' || url.pathname !== '/android-media' || url.username || url.password) return '';
        const uri = url.searchParams.get('uri');
        return uri?.startsWith('content://') && uri.length <= 8192 ? uri : '';
    } catch (_) { return ''; }
}

function orderEntry(track) {
    const uri = indexedSource(track);
    if (!uri) return null;
    const cover = String(track._resolvedNotificationCover || track.cover || '');
    return {
        uri,
        title: String(track.title || track.filename || '').slice(0, 256),
        artist: String(track.artist || '').slice(0, 256),
        album: String(track.album || '').slice(0, 256),
        cover: cover.length <= 1536 && cover.startsWith('https://appassets.androidplatform.net/') ? cover : ''
    };
}

const queueTrackKey = track => {
    const uri = indexedSource(track);
    if (uri) return uri;
    if (track.tid) return `tid:${track.tid}`;
    if (track.id) return `id:${track.id}`;
    return track.fullPath ? `path:${track.fullPath}` : `filename:${track.filename || ''}`;
};

export function identifyQueueEntries(queue, id = () => crypto.randomUUID()) {
    const seen = new Set();
    return queue.map(track => {
        const queueId = track.nativeQueueId;
        if (queueId && !seen.has(queueId)) {
            seen.add(queueId);
            return track;
        }
        const newId = id();
        seen.add(newId);
        return { ...track, nativeQueueId: newId };
    });
}

export function saveNativeQueue(token, queue) {
    return JSON.stringify({ token, entries: queue.map(track => [track.nativeQueueId, queueTrackKey(track)]) });
}

export function restoreNativeQueue(saved, token, library) {
    try {
        const snapshot = JSON.parse(saved);
        if (snapshot?.token !== token || !Array.isArray(snapshot.entries) || !snapshot.entries.length) return [];
        const tracks = new Map(library.map(track => [queueTrackKey(track), track]));
        return snapshot.entries.flatMap(([nativeQueueId, key]) => {
            const track = tracks.get(key);
            return track ? [{ ...track, nativeQueueId }] : [];
        });
    } catch (_) { return []; }
}

export function removeConsumedQueueEntries(queue, consumed) {
    if (!Array.isArray(consumed) || !consumed.length) return queue;
    const ids = new Set(consumed);
    const remaining = queue.filter(track => !ids.has(track.nativeQueueId));
    return remaining.length === queue.length ? queue : remaining;
}

function shuffleWindow(pool, token, byteBudget, trackLimit = MAX_ORDER_TRACKS) {
    let hash = 2166136261;
    for (const char of token) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const count = pool.length;
    let index = count ? (hash >>> 0) % count : 0;
    // A coprime step visits the whole pool without a second library-sized array.
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    let step = Math.max(1, Math.floor(count * 0.618));
    while (count && gcd(step, count) !== 1) step++;
    const tracks = [];
    const seen = new Set();
    let complete = true;
    for (let visited = 0; visited < count; visited++, index = (index + step) % count) {
        const track = orderEntry(pool[index]);
        if (!track) {
            complete = false;
            continue;
        }
        if (seen.has(track.uri)) continue;
        byteBudget -= JSON.stringify(track).length + 1;
        if (tracks.length === trackLimit || byteBudget < 0) return { shuffleTracks: tracks, shuffleComplete: false };
        seen.add(track.uri);
        tracks.push(track);
    }
    return { shuffleTracks: tracks, shuffleComplete: complete };
}

function queueWindow(queue, trackLimit, budget) {
    const tracks = [];
    for (const track of queue) {
        if (tracks.length >= trackLimit || !track.nativeQueueId) break;
        const candidate = orderEntry(track);
        if (!candidate) break;
        candidate.queueId = track.nativeQueueId;
        const length = JSON.stringify(candidate).length + 1;
        if (length > budget) break;
        budget -= length;
        tracks.push(candidate);
    }
    return { tracks, complete: tracks.length === queue.length, budget };
}

export function buildNativeOrder(state, supportsQueue = false, shuffleToken = '',
    { trackLimit = MAX_ORDER_TRACKS, lengthLimit = MAX_ORDER_LENGTH } = {}) {
    const current = state.allTracks[state.currentTrackIndex];
    const entry = orderEntry(current);
    if (!entry) return null;

    const repeatOne = state.repeatMode === 'one';
    const repeatAll = state.repeatMode === 'all';
    const pool = playbackPool(state);
    if(state.playlistPlayback?.historyIndex>=0 && (state.playlistPlayback.historyIndex<state.playlistPlayback.history.length-1 || !sameTrack(pool[state.playlistPlayback.cursor],current))) return {tracks:[entry],index:0,complete:false,repeatOne,repeatAll:false,sessionBoundary:true};
    const queued = supportsQueue && Boolean(state.playQueue?.length);
    const shuffle = !state.playlistPlayback && state.isShuffle && Boolean(shuffleToken);
    if (queued || shuffle) {
        const queue = queueWindow(queued ? state.playQueue : [], MAX_ORDER_TRACKS - 1,
            MAX_ORDER_LENGTH - JSON.stringify(entry).length - 256);
        const order = { tracks: [entry, ...queue.tracks], index: 0, queued, repeatOne, repeatAll };
        if (queued) order.queueComplete = queue.complete;
        if (shuffle) Object.assign(order, shuffleWindow(pool, shuffleToken, Math.max(0, queue.budget)));
        return order;
    }
    const position = (!state.isShuffle || state.playlistPlayback) && !state.playQueue?.length
        ? pool.findIndex(track => sameTrack(track, current)) : -1;
    if (position < 0) {
        return repeatOne ? { tracks: [entry], index: 0, complete: false, repeatOne } : null;
    }

    const seen = new Set([entry.uri]);
    let size = JSON.stringify(entry).length + 128;
    const nearbyTracks = (direction, limit) => {
        const tracks = [];
        for (let i = position + direction; i >= 0 && i < pool.length && tracks.length < limit; i += direction) {
            const candidate = orderEntry(pool[i]);
            if (!candidate || seen.has(candidate.uri)) break;
            const length = JSON.stringify(candidate).length + 1;
            if (size + length > lengthLimit) break;
            size += length;
            seen.add(candidate.uri);
            tracks.push(candidate);
        }
        return tracks;
    };

    const previousSlots = pool.length <= trackLimit ? position : Math.min(position, Math.floor(trackLimit / 6));
    const following = nearbyTracks(1, trackLimit - previousSlots - 1);
    const previous = nearbyTracks(-1, previousSlots);
    const tracks = [...previous.reverse(), entry, ...following];
    return { tracks, index: previous.length, complete: tracks.length === pool.length,
        repeatAll, repeatOne };
}

export class NativeTransport {
    constructor(bridge, {clock=()=>Date.now(), wait=ms=>new Promise(r=>setTimeout(r,ms)), id=()=>crypto.randomUUID()}={}) {
        this.bridge=bridge; this.clock=clock; this.wait=wait; this.id=id; this.token=''; this.started=0; this.last=null;
        this.supportsOrder = typeof bridge?.nativePlaybackLoadWithOrder === 'function' && typeof bridge?.nativePlaybackSetOrder === 'function';
        this.supportsQueue = this.supportsOrder && typeof bridge?.nativePlaybackSupportsQueue === 'function';
        this.supportsShuffle = this.supportsQueue && typeof bridge?.nativePlaybackSupportsShuffle === 'function';
        this.supportsShuffleCatalog = this.supportsShuffle && typeof bridge?.nativePlaybackRegisterShuffle === 'function';
        this.supportsOrderedCatalog = this.supportsOrder && typeof bridge?.nativePlaybackRegisterOrdered === 'function';
        this.supportsQueueCatalog = this.supportsQueue && typeof bridge?.nativePlaybackRegisterQueue === 'function';
        this.catalog = null;
        this.queueCatalog = null;
    }
    extendQueue(order, queue, token, queueEdits) {
        if (!this.supportsQueueCatalog || !order.queued || order.queueComplete || order.tracks.length === 1) return;
        const head = queue[0].nativeQueueId;
        let catalog = this.queueCatalog;
        if (catalog?.token !== token || catalog.queueEdits !== queueEdits || !catalog.covered.has(head)) {
            const { tracks, complete } = queueWindow(queue, MAX_QUEUE_CATALOG_TRACKS, MAX_CATALOG_LENGTH - 64);
            if (tracks.length <= order.tracks.length - 1) return;
            try {
                const id = this.bridge.nativePlaybackRegisterQueue(token, JSON.stringify({ tracks, complete }));
                if (!id) return;
                // Leave time to replenish before reaching the end of a partial catalog.
                const covered = new Set((complete ? tracks : tracks.slice(0, -8)).map(track => track.queueId));
                catalog = { id, token, queueEdits, covered };
                this.queueCatalog = catalog;
            } catch (_) { return; }
        }
        order.queueCatalogId = catalog.id;
    }
    buildOrder(state, token, queueEdits) {
        const order = buildNativeOrder(state, this.supportsQueue, this.supportsShuffle ? token : '');
        if (!order) return null;
        if(order.sessionBoundary)return order;
        this.extendQueue(order, state.playQueue, token, queueEdits);
        const shuffle = Boolean(order.shuffleTracks);
        if (shuffle ? !this.supportsShuffleCatalog || order.shuffleComplete
            : !this.supportsOrderedCatalog || (state.isShuffle && !state.playlistPlayback) || state.playQueue?.length || order.complete) return order;
        const pool = playbackPool(state);
        const current = order.tracks[order.index].uri;
        let catalog = this.catalog;
        if (catalog?.token !== token || catalog.pool !== pool || catalog.length !== pool.length
            || catalog.shuffle !== shuffle || (!shuffle && !catalog.covered.has(current))) {
            catalog = null;
            try {
                const data = shuffle
                    ? shuffleWindow(pool, token, MAX_CATALOG_LENGTH - 64, MAX_CATALOG_TRACKS)
                    : buildNativeOrder(state, this.supportsQueue, '', {
                        trackLimit: MAX_CATALOG_TRACKS, lengthLimit: MAX_CATALOG_LENGTH
                    });
                if (shuffle || data.tracks.length > order.tracks.length) {
                    const raw = JSON.stringify(data);
                    const id = shuffle ? this.bridge.nativePlaybackRegisterShuffle(token, raw)
                        : this.bridge.nativePlaybackRegisterOrdered(token, raw);
                    if (id) {
                        // Refresh the large window when playback approaches either edge.
                        const covered = shuffle ? null : new Set(
                            (data.complete ? data.tracks : data.tracks.slice(1, -1)).map(track => track.uri));
                        catalog = { id, token, pool, length: pool.length, shuffle, covered };
                        this.catalog = catalog;
                    }
                }
            } catch (_) {}
        }
        if (catalog) order[shuffle ? 'shuffleCatalogId' : 'orderedCatalogId'] = catalog.id;
        return order;
    }
    snapshot() { try { const v=JSON.parse(this.bridge?.nativePlaybackStatus()||'{}'); return v&&typeof v.token==='string'?v:null; } catch (_) {return null;} }
    get active(){return Boolean(this.token);}
    adopt(v){if(!v?.token||v.state==='stopped')return false;this.token=v.token;this.last=v;this.started=this.clock();return true;}
    start(track,position,gain,order){
        if(this.active)return false;
        const uri=indexedSource(track);if(!uri)return false;
        const token=this.id(), cover=track._resolvedNotificationCover||track.cover||'';
        try{
            if (typeof order === 'function') order = order(token);
            const args = [token,uri,track.title||track.filename||'',track.artist||'',track.album||'',cover,Math.round(position*1000),gain];
            const started = this.supportsOrder
                ? this.bridge.nativePlaybackLoadWithOrder(...args, order ? JSON.stringify(order) : '')
                : this.bridge.nativePlaybackLoad(...args);
            if (!started) return false;
            this.token=token;this.started=this.clock();this.last={token,uri,revision:0,state:'loading',position:position*1000,duration:(track.duration||0)*1000};return true;
        }catch(_){return false;}
    }
    setOrder(status, order) {
        if (!this.supportsOrder || status?.token !== this.token || !Number.isInteger(status.revision)) return false;
        try { return this.bridge.nativePlaybackSetOrder(this.token, status.revision, order ? JSON.stringify(order) : ''); }
        catch (_) { return false; }
    }
    command(cmd,position=0,gain=1){try{return this.active&&this.bridge.nativePlaybackCommand(this.token,cmd,Math.round(position*1000),gain);}catch(_){return false;}}
    read(){
        if(!this.active)return null;
        const v=this.snapshot();if(v?.token===this.token){this.last=v;return v;}
        if(this.clock()-this.started>8000){return {...this.last,state:'unconfirmed'};}
        return this.last;
    }
    // Never hand playback to another backend until the service confirms release.
    async stop(){
        if(!this.active){const v=this.snapshot();if(!v||v.state==='stopped')return true;this.adopt(v);}
        const token=this.token;
        if(this.snapshot()?.token===token&&this.snapshot()?.state==='stopped'){this.token='';this.last=null;return true;}
        if(!this.command('stop'))return false;
        const deadline=this.clock()+3000;
        while(this.clock()<deadline){
            const v=this.snapshot();if(v?.token===token&&v.state==='stopped'){if(this.token===token){this.token='';this.last=null;}return true;}
            await this.wait(50);
        }
        return false;
    }
}

// Only adopt a snapshot belonging to the exact service token. A snapshot
// with missing/ambiguous catalog identities must not fall back to the library.
export function saveNativePlaylist(token, session) {
    if(!session)return JSON.stringify({token,session:null});
    const ordered=session.ordered.map(indexedSource),saved=session.saved.map(indexedSource);
    const history=(session.history||[]).map(e=>[indexedSource(e.track),e.cursor]);
    const value=JSON.stringify({token,session:{id:session.id,ordered,saved,cursor:session.cursor,shuffle:session.shuffle,history,historyIndex:session.historyIndex}});
    if(ordered.length>4096||ordered.some(u=>!u)||saved.some(u=>!u)||history.some(e=>!e[0])||value.length>256000)return JSON.stringify({token,unavailable:true});
    return value;
}
export function restoreNativePlaylist(raw,token,library) {
    let data;try{data=JSON.parse(raw);}catch(_){return {session:null,invalid:Boolean(raw)};}
    if(!data||data.token!==token)return {session:null,invalid:false};
    if(data.unavailable)return {session:null,invalid:true};
    if(!data.session)return {session:null,invalid:false};
    const s=data.session, map=new Map();
    for(const track of library){const uri=indexedSource(track);if(uri)map.set(uri,map.has(uri)?null:track);}
    if(!Array.isArray(s.ordered)||!Array.isArray(s.saved)||!Array.isArray(s.history)||!s.ordered.length||s.ordered.length>4096||s.history.length>512||!Number.isInteger(s.cursor)||s.cursor<0||s.cursor>=s.ordered.length||!Number.isInteger(s.historyIndex)||s.historyIndex< -1||s.historyIndex>=s.history.length)return {session:null,invalid:true};
    const ordered=s.ordered.map(u=>map.get(u)),saved=s.saved.map(u=>map.get(u));
    if(ordered.some(t=>!t)||saved.some(t=>!t)||new Set(ordered).size!==ordered.length||saved.length!==ordered.length||saved.some(t=>!ordered.includes(t)))return {session:null,invalid:true};
    const history=[];for(const entry of s.history){if(!Array.isArray(entry)||!map.get(entry[0])||!Number.isInteger(entry[1])||entry[1]<0||entry[1]>=ordered.length)return {session:null,invalid:true};history.push({track:map.get(entry[0]),cursor:entry[1]});}
    return {session:{id:s.id,ordered,saved,cursor:s.cursor,shuffle:Boolean(s.shuffle),history,historyIndex:s.historyIndex,historyTarget:null},invalid:false};
}
