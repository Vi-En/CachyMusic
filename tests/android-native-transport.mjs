import assert from 'node:assert/strict';
import {
    NativeTransport, buildNativeOrder, identifyQueueEntries, indexedSource,
    removeConsumedQueueEntries, restoreNativeQueue, saveNativeQueue
} from '../scripts/modules/android-native-playback.js';
const uri='content://media/external/audio/media/1';
const track={src:`https://appassets.androidplatform.net/android-media?uri=${encodeURIComponent(uri)}`,title:'Local',duration:10};
assert.equal(indexedSource(track),uri);
for(const src of ['https://evil.test/android-media?uri=content://x','https://appassets.androidplatform.net/other?uri=content://x','https://appassets.androidplatform.net/android-media?uri=file:///secret','blob:abc'])assert.equal(indexedSource({src}),'');
let now=0,snapshot={},commands=[],ack=true,loadAccepted=true;
const bridge={nativePlaybackStatus:()=>JSON.stringify(snapshot),nativePlaybackLoad(token,u,t,a,b,c,p,g){commands.push(['load',token,u,p,g]);if(!loadAccepted)return false;return true;},nativePlaybackCommand(token,cmd,p,g){commands.push([cmd,token,p,g]);if(ack&&cmd==='stop')snapshot={token,state:'stopped'};return true;}};
const t=new NativeTransport(bridge,{clock:()=>now,wait:async ms=>{now+=ms;},id:()=>`token-${now}`});
assert(t.start(track,2,.5));assert.equal(t.read().state,'loading');assert(!t.start(track,0,1));
snapshot={token:'wrong',state:'playing'};assert.equal(t.read().state,'loading');
snapshot={token:t.token,state:'playing',position:2000};assert.equal(t.read().position,2000);
assert(t.command('seek',3));assert.deepEqual(commands.at(-1),['seek',t.token,3000,1]);
ack=false;assert.equal(await t.stop(),false);assert(t.active,'must not relinquish backend on timeout');
ack=true;assert(await t.stop());assert(!t.active);
loadAccepted=false;assert(!t.start(track,0,1));assert(!t.active);
loadAccepted=true;snapshot={token:'restored',state:'playing',uri,position:5000};assert(t.adopt(snapshot));assert.equal(t.read().position,5000);assert(await t.stop());
assert(t.start(track,0,1));now+=8100;assert.equal(t.read().state,'unconfirmed');assert(await t.stop());
console.log('PASS native transport: indexed URI filtering, single ownership, stale snapshots, stop acknowledgement/timeout, adoption, rejected start');

const indexedTrack = n => ({ ...track, id: n, src: track.src.replace('media%2F1', `media%2F${n}`) });
const library = Array.from({ length: 50 }, (_, i) => indexedTrack(i + 1));
const state = { allTracks: library, displayedTracks: library.slice(0, 3), currentTrackIndex: 1,
    repeatMode: 'all', playQueue: [], isShuffle: false };
const fullOrder = buildNativeOrder(state);
assert.deepEqual(fullOrder.tracks.map(t => t.uri), library.slice(0, 3).map(indexedSource));
assert.equal(fullOrder.index, 1);
assert(fullOrder.complete && fullOrder.repeatAll);

const partial = buildNativeOrder({ ...state, displayedTracks: [], currentTrackIndex: 20 });
assert.equal(partial.tracks.length, 24);
assert.equal(partial.tracks[partial.index].uri, indexedSource(library[20]));
assert(!partial.complete);
const mixed = buildNativeOrder({ ...state, displayedTracks: [library[1], { src: 'blob:local' }, library[2]] });
assert.equal(mixed.tracks.length, 1, 'ordered playback must stop before a non-native source');
assert(!mixed.complete);
const duplicate = buildNativeOrder({ ...state, displayedTracks: [library[1], { ...library[1], id: 'alias' }, library[2]] });
assert.equal(duplicate.tracks.length, 1, 'a source alias must not be skipped or create an ambiguous cursor');
const longTracks = library.map(item => ({ ...item, src: item.src + 'a'.repeat(8000) }));
const sizeLimited = buildNativeOrder({ ...state, allTracks: longTracks, displayedTracks: [], currentTrackIndex: 0 });
assert(JSON.stringify(sizeLimited).length <= 32000 && sizeLimited.tracks.length < 24);
assert.equal(buildNativeOrder({ ...state, isShuffle: true }), null);
assert.equal(buildNativeOrder({ ...state, playQueue: [library[3]] }), null);
const repeat = buildNativeOrder({ ...state, isShuffle: true, repeatMode: 'one' });
assert(repeat.repeatOne && !repeat.complete && repeat.tracks.length === 1);

const ordered = new NativeTransport({ ...bridge,
    nativePlaybackLoadWithOrder(...args) { commands.push(['load-order', ...args]); return true; },
    nativePlaybackSetOrder(...args) { commands.push(['set-order', ...args]); return true; }
}, { id: () => 'ordered' });
assert(ordered.start(library[1], 0, 1, fullOrder));
assert.deepEqual(JSON.parse(commands.at(-1).at(-1)), fullOrder);
snapshot = { token: ordered.token, uri: indexedSource(library[2]), revision: 1, state: 'playing' };
const advanced = ordered.read();
assert.equal(advanced.uri, indexedSource(library[2]));
assert(ordered.setOrder(advanced, null));
assert.deepEqual(commands.at(-1), ['set-order', 'ordered', 1, '']);
assert(!ordered.setOrder({ ...advanced, token: 'stale' }, fullOrder));
console.log('PASS native ordered playback: bounded window, repeat modes, unsupported sources, session continuity and order updates');

const unsupported = { id: 'local', src: 'blob:local', filename: 'Local file' };
let occurrence = 0;
const queue = identifyQueueEntries([library[1], library[1], unsupported, library[2]], () => `item-${++occurrence}`);
assert.equal(new Set(queue.map(item => item.nativeQueueId)).size, 4);
assert.equal(library[1].nativeQueueId, undefined, 'occurrence IDs belong to the queue');
const queuedOrder = buildNativeOrder({ ...state, isShuffle: true, playQueue: queue }, true);
assert(queuedOrder.queued);
assert.deepEqual(queuedOrder.tracks.slice(1).map(item => item.queueId), ['item-1', 'item-2']);
assert.deepEqual(queuedOrder.tracks.map(item => item.uri), Array(3).fill(indexedSource(library[1])));
assert(buildNativeOrder({ ...state, repeatMode: 'one', playQueue: queue }, true).repeatOne);
assert.equal(buildNativeOrder({ ...state, playQueue: queue.slice(2) }, true).tracks.length, 1,
    'a blocked head must not be bypassed');
const oversizedQueue = identifyQueueEntries(Array(50).fill(library[1]), () => `item-${++occurrence}`);
assert.equal(buildNativeOrder({ ...state, playQueue: oversizedQueue }, true).tracks.length, 24);

const edited = [queue[1], queue[3], queue[0], queue[2]];
const kept = removeConsumedQueueEntries(edited, ['item-1']);
assert.deepEqual(kept.map(item => item.nativeQueueId), ['item-2', 'item-4', 'item-3'],
    'applying service consumption preserves UI reorder and a duplicate occurrence');
assert.equal(removeConsumedQueueEntries(kept, ['item-1']), kept, 'repeated snapshots are idempotent');
const saved = saveNativeQueue('session', edited);
const restored = restoreNativeQueue(saved, 'session', [...library, unsupported]);
assert.deepEqual(removeConsumedQueueEntries(restored, ['item-1', 'item-2']).map(item => item.id), [library[2].id, 'local']);
assert.deepEqual(restoreNativeQueue(saved, 'different-session', library), []);
assert.deepEqual(restoreNativeQueue('malformed', 'session', library), []);
console.log('PASS native Play Queue: duplicates, limits, unsupported head, live reorder and reattachment');

const shuffleState = { ...state, isShuffle: true };
const shuffle = buildNativeOrder(shuffleState, true, 'shuffle');
assert(shuffle.shuffleComplete && shuffle.repeatAll);
assert.deepEqual(shuffle.shuffleTracks.map(t => t.uri).sort(), library.slice(0, 3).map(indexedSource));
assert.equal(shuffle.tracks[0].uri, indexedSource(library[1]));
const largeShuffle = { ...shuffleState, displayedTracks: [] };
const window = buildNativeOrder(largeShuffle, true, 'session');
assert(!window.shuffleComplete && window.shuffleTracks.length === 24);
assert.equal(new Set(window.shuffleTracks.map(t => t.uri)).size, 24);
assert.deepEqual(buildNativeOrder({ ...largeShuffle, currentTrackIndex: 20 }, true, 'session').shuffleTracks,
    window.shuffleTracks, 'a session refresh preserves the candidate window');
const mixedShuffle = buildNativeOrder({ ...shuffleState, displayedTracks: [library[1], unsupported, library[1], library[2]] },
    true, 'session');
assert(!mixedShuffle.shuffleComplete && mixedShuffle.shuffleTracks.length === 2);
const queueShuffle = buildNativeOrder({ ...shuffleState, playQueue: queue }, true, 'shuffle');
assert(queueShuffle.shuffleComplete && !queueShuffle.queueComplete);
assert.deepEqual(queueShuffle.shuffleTracks, shuffle.shuffleTracks);
assert(buildNativeOrder({ ...shuffleState, playQueue: queue.slice(0, 2) }, true, 'shuffle').queueComplete);
const longShuffle = buildNativeOrder({ ...largeShuffle, allTracks: longTracks }, true, 'session');
assert(JSON.stringify(longShuffle).length <= 32000 && !longShuffle.shuffleComplete);

const shuffling = new NativeTransport({
    ...ordered.bridge,
    nativePlaybackSupportsQueue: () => true,
    nativePlaybackSupportsShuffle: () => true
}, { id: () => 'session' });
assert(shuffling.supportsShuffle && !ordered.supportsShuffle);
assert(shuffling.start(library[1], 0, 1, token => buildNativeOrder(largeShuffle, true, token)));
assert.deepEqual(JSON.parse(commands.at(-1).at(-1)), window);
assert(shuffling.command('prev'));
assert.deepEqual(commands.at(-1), ['prev', 'session', 0, 1]);
console.log('PASS native shuffle: capability negotiation, bounded session window, mixed sources and Play Queue priority');

const catalogs = [];
const register = kind => (token, raw) => {
    catalogs.push({ kind, token, raw, data: JSON.parse(raw) });
    return `catalog-${catalogs.length}`;
};
const expanded = new NativeTransport({
    ...shuffling.bridge,
    nativePlaybackRegisterOrdered: register('ordered'),
    nativePlaybackRegisterShuffle: register('shuffle'),
    nativePlaybackRegisterQueue: register('queue')
});
const expansive = { ...state, allTracks: library, displayedTracks: [], currentTrackIndex: 0 };
const expandedOrder = expanded.buildOrder(expansive, 'expanded');
assert.equal(expandedOrder.orderedCatalogId, 'catalog-1');
assert.equal(expandedOrder.tracks.length, 24);
assert.deepEqual(catalogs[0].data.tracks.map(t => t.uri), library.map(indexedSource));
assert(catalogs[0].data.complete);
assert.equal(expanded.buildOrder({ ...expansive, currentTrackIndex: 30 }, 'expanded').orderedCatalogId, 'catalog-1');
const mixedOrder = expanded.buildOrder({ ...expansive, displayedTracks: [...library.slice(0, 30), unsupported, ...library.slice(30)] }, 'expanded');
assert.equal(mixedOrder.orderedCatalogId, 'catalog-2');
assert.equal(catalogs[1].data.tracks.length, 30);
assert(!catalogs[1].data.complete);

const extendedQueue = identifyQueueEntries([
    ...Array(50).fill(library[1]), unsupported, library[2]
], () => `expanded-${++occurrence}`);
const queuedState = { ...expansive, isShuffle: true, playQueue: extendedQueue };
const expandedQueued = expanded.buildOrder(queuedState, 'queued', 3);
assert.equal(expandedQueued.queueCatalogId, 'catalog-3');
assert.equal(expandedQueued.shuffleCatalogId, 'catalog-4');
assert.equal(catalogs[2].data.tracks.length, 50);
assert.equal(new Set(catalogs[2].data.tracks.map(t => t.queueId)).size, 50);
assert(!catalogs[2].data.complete);
assert(catalogs[3].data.shuffleComplete && catalogs[3].data.shuffleTracks.length === 50);
const consumed = expanded.buildOrder({ ...queuedState, playQueue: extendedQueue.slice(2) }, 'queued', 3);
assert.equal(consumed.queueCatalogId, 'catalog-3');
assert.equal(consumed.tracks[1].queueId, extendedQueue[2].nativeQueueId);
const reordered = [extendedQueue[2], extendedQueue[1], ...extendedQueue.slice(3)];
assert.equal(expanded.buildOrder({ ...queuedState, playQueue: reordered }, 'queued', 4).queueCatalogId, 'catalog-5');
assert.equal(catalogs[4].data.tracks[0].queueId, extendedQueue[2].nativeQueueId);

const hugeQueue = identifyQueueEntries(Array(530).fill(library[1]), () => `expanded-${++occurrence}`);
expanded.buildOrder({ ...expansive, playQueue: hugeQueue }, 'huge', 1);
assert.equal(catalogs.at(-1).data.tracks.length, 512);
assert(!catalogs.at(-1).data.complete);
expanded.buildOrder({ ...expansive, playQueue: hugeQueue.slice(505) }, 'huge', 1);
assert.equal(catalogs.at(-1).data.tracks.length, 25);
assert(catalogs.at(-1).data.complete);
const hugeLibrary = Array.from({ length: 4100 }, (_, i) => indexedTrack(i + 1));
for (const isShuffle of [false, true]) {
    expanded.buildOrder({ ...expansive, allTracks: hugeLibrary, isShuffle }, 'huge');
    const { data, raw } = catalogs.at(-1);
    assert.equal((data.tracks || data.shuffleTracks).length, 4096);
    assert(!(data.complete || data.shuffleComplete));
    assert(raw.length <= 2000000);
}
console.log('PASS expanded Android catalogs: separate queue and shuffle, limits, reuse, rollover, edits and unsupported sources');

// Unknown bridge status is not proof that a service has released the device.
const uncertain=new NativeTransport({nativePlaybackStatus:()=>{throw Error('bridge unavailable');}});
assert.equal(await uncertain.stop(),false);
const initialEmpty=new NativeTransport({nativePlaybackStatus:()=>"{}"});assert.equal(await initialEmpty.stop(),true);
const malformedState=new NativeTransport({nativePlaybackStatus:()=>'{"token":"old"}'});assert.equal(await malformedState.stop(),false);
console.log('PASS inaccessible/malformed native status cannot authorize a second backend; initial empty service allowed');
