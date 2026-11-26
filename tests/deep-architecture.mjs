import assert from 'node:assert/strict';
import { createPlaybackAudioContext } from '../scripts/modules/audio-context-policy.js';
import { visualizerFrameIntervalMs } from '../scripts/modules/visualizer-budget.js';
import { ultrasonicFilterPossible, ultrasonicFilterStatus } from '../scripts/modules/ultrasonic-status.js';

// Use the device's graph clock; never force a 192kHz processing tax on a
// 48kHz output and mistake it for real high-resolution DAC operation.
const calls = [];
class Clock {
    constructor(options) {
        calls.push(options);
        assert(!('sampleRate' in (options || {})), 'Track rate must not be forced');
        this.sampleRate = 48000;
    }
}
const ctx = createPlaybackAudioContext(Clock, 'playback');
assert.equal(ctx.sampleRate, 48000);
assert.deepEqual(calls[0], {latencyHint:'playback'});
class MinimalClock {
    constructor(options) { if (options) throw Error('No options'); this.sampleRate = 44100; }
}
assert.equal(createPlaybackAudioContext(MinimalClock, 'playback').sampleRate, 44100);

// Visualizer refresh policy does not alter audio engine scheduling.
assert(Math.abs(visualizerFrameIntervalMs() - 1000/60) < 1e-8);
assert(Math.abs(visualizerFrameIntervalMs({mobile:true}) - 1000/30) < 1e-8);
assert.equal(visualizerFrameIntervalMs({reducedMotion:true}), 1000/12);
assert.equal(visualizerFrameIntervalMs({saveData:true}), 1000/12);


// A 32 kHz filter cannot process ultrasonic energy at a 48 kHz graph clock;
// neither the settings surface nor the signal-path audit may call it ACTIVE.
assert.equal(ultrasonicFilterPossible(32000, 48000), false);
assert.equal(ultrasonicFilterPossible(32000, 96000), true);
assert.equal(ultrasonicFilterPossible(48000, 96000), false);
assert.equal(ultrasonicFilterStatus({enabled:true, cutoffHz:32000, contextRateHz:48000, workletReady:true}).code, 'unavailable');
assert.equal(ultrasonicFilterStatus({enabled:true, cutoffHz:32000, contextRateHz:96000, workletReady:true}).code, 'active');
assert.equal(ultrasonicFilterStatus({enabled:true, cutoffHz:32000, contextRateHz:96000}).code, 'configured');
assert.equal(ultrasonicFilterStatus({enabled:true, cutoffHz:32000}).code, 'pending');
assert.equal(ultrasonicFilterStatus({enabled:false}).code, 'off');

// Test the shared local database connection and upgrade/pagehide releases.
let opens = 0;
let closes = 0;
let mostRecentDb = null;
let commits = 0;
const listeners = {};
class DB {
    constructor() { this.closed = false; }
    close() { if (!this.closed) { this.closed = true; closes++; } }
    transaction(name, mode) {
        assert(!this.closed, 'Cannot create a transaction on a closed connection');
        const tx = {
            error: null,
            objectStore() { return {
                getAll() {
                    const r = {};
                    queueMicrotask(() => { r.result = []; r.onsuccess?.(); });
                    return r;
                },
                clear() {}, put() {}
            }; }
        };
        if (mode === 'readwrite') setTimeout(() => { commits++; tx.oncomplete?.(); }, 8);
        return tx;
    }
}
globalThis.window = {
    addEventListener(type, handler) { listeners[type] = handler; },
    indexedDB: { open(name, version) {
        opens++;
        const req = {};
        queueMicrotask(() => {
            req.result = new DB();
            mostRecentDb = req.result;
            req.onsuccess?.();
        });
        return req;
    }}
};
const {loadAllMetadataOverrides, mutateLocalPlaylist, writeFileToOpfs, saveLibraryToLocalDb} = await import('../scripts/modules/local-library.js');
const items = await Promise.all(Array.from({length:12}, () => loadAllMetadataOverrides()));
assert(items.every(item => item instanceof Map));
assert.equal(opens, 1, 'Parallel metadata lookups must share the open DB');
assert.equal(await mutateLocalPlaylist(null,{plid:'local_pl_test', name:'Test', tracks:[],revision:0}), true);
assert.equal(commits, 1, 'Save must resolve after a transaction commit');
await loadAllMetadataOverrides();
assert.equal(opens, 1, 'Connection reused across reads and writes');
// A schema upgrade must not remain blocked by this player tab.
mostRecentDb.onversionchange();
assert.equal(closes, 1, 'Versionchange must close cached connection');
await loadAllMetadataOverrides();
assert.equal(opens, 2, 'DB must reopen after a versionchange');
listeners.pagehide();
assert.equal(closes, 2, 'Pagehide must close cached connections');
await loadAllMetadataOverrides();
assert.equal(opens, 3, 'DB must reopen after pagehide');
listeners.pagehide();
assert.equal(closes, 3);
console.log('PASS: audio context fallback, visualizer budget, IDB reuse and page lifecycle');

// A failed OPFS write must abort its stream and remove the partial copy,
// preserving the user's original Blob and freeing offline storage.
let removedPartial = 0, abortedPartial = 0;
const appDir = {
    async getFileHandle(key) { assert(key.startsWith('audio-')); return {
        async createWritable() { return {
            async write() { throw Error('Simulated disk full'); },
            async close() {},
            async abort() { abortedPartial++; }
        }; }
    }; },
    async removeEntry(key) { assert(key.startsWith('audio-')); removedPartial++; }
};
Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {storage: {
    async getDirectory() { return {async getDirectoryHandle() { return appDir; }}; }
}}});
const originalWarn = console.warn;
console.warn = () => {};
try { assert.equal(await writeFileToOpfs('test', new Blob(['valid original audio bytes'])), null); }
finally { console.warn = originalWarn; }
assert.equal(abortedPartial, 1);
assert.equal(removedPartial, 1);
console.log('PASS: incomplete OPFS audio copy aborted and deleted');


// A failed library transaction must roll back only the new offline audio
// copy and restore the original track's in-memory reference.
let rollbackRemoved=0;
appDir.getFileHandle = async () => ({async createWritable() {return {
    async write() {}, async close() {}, async abort() { throw Error('Should not abort completed write'); }
};}});
appDir.removeEntry = async () => { rollbackRemoved++; };
await loadAllMetadataOverrides(); // acquire the currently active cached connection
const originalTransaction=mostRecentDb.transaction;
mostRecentDb.transaction = () => {
    const tx={ error: Error('Simulated IndexedDB quota failure'), objectStore() {return {clear() {},put() {}};} };
    queueMicrotask(() => tx.onabort?.());
    return tx;
};
const originalWarn2=console.warn;
console.warn=()=>{};
try {
    const track={id:'rollback-1',filename:'lossless.flac',_fileBlob:new Blob(['original flac content'])};
    assert.equal(await saveLibraryToLocalDb([track], 'Test'), false);
    assert.equal(track.opfsKey, null);
    assert.equal(rollbackRemoved,1);
} finally {
    console.warn=originalWarn2;
    mostRecentDb.transaction=originalTransaction;
}
console.log('PASS: failed library transaction rolls back new OPFS copy only');
