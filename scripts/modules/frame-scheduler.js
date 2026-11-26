/**
 * Lightweight two-phase requestAnimationFrame read/write scheduler.
 * Prevents interleaved DOM layout reads and style mutations.
 */
const readQueue = new Map();
const writeQueue = new Map();
let scheduled = false;
let scheduledHandle = null;
let usesRaf = false;

const scheduleNext = (cb) => {
    if (typeof requestAnimationFrame === 'function') {
        usesRaf = true;
        return requestAnimationFrame(cb);
    }
    usesRaf = false;
    queueMicrotask(cb);
    return 1;
};

function flushFrame() {
    scheduled = false;
    scheduledHandle = null;

    if (readQueue.size > 0) {
        const reads = Array.from(readQueue.values());
        readQueue.clear();
        for (let i = 0; i < reads.length; i++) {
            try {
                reads[i]();
            } catch (err) {
                console.warn('[FrameScheduler] read error:', err);
            }
        }
    }

    if (writeQueue.size > 0) {
        const writes = Array.from(writeQueue.values());
        writeQueue.clear();
        for (let i = 0; i < writes.length; i++) {
            try {
                writes[i]();
            } catch (err) {
                console.warn('[FrameScheduler] write error:', err);
            }
        }
    }

    if ((readQueue.size > 0 || writeQueue.size > 0) && !scheduled) {
        scheduled = true;
        scheduledHandle = scheduleNext(flushFrame);
    }
}

function ensureScheduled() {
    if (scheduled) return;
    scheduled = true;
    scheduledHandle = scheduleNext(flushFrame);
}

/**
 * Schedule a DOM measurement phase callback deduplicated by key.
 * @param {string} key
 * @param {() => void} fn
 */
export function scheduleRead(key, fn) {
    if (typeof fn !== 'function') return;
    readQueue.set(String(key), fn);
    ensureScheduled();
}

/**
 * Schedule a DOM mutation phase callback deduplicated by key.
 * @param {string} key
 * @param {() => void} fn
 */
export function scheduleWrite(key, fn) {
    if (typeof fn !== 'function') return;
    writeQueue.set(String(key), fn);
    ensureScheduled();
}

/**
 * Cancel pending read/write callbacks registered under key.
 * @param {string} key
 */
export function cancelScheduled(key) {
    const k = String(key);
    readQueue.delete(k);
    writeQueue.delete(k);
    if (readQueue.size === 0 && writeQueue.size === 0 && scheduled && usesRaf && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(scheduledHandle);
        scheduled = false;
        scheduledHandle = null;
    }
}

/**
 * Flush queued reads and writes synchronously for deterministic unit tests.
 */
export function flushSyncForTest() {
    if (scheduled && usesRaf && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(scheduledHandle);
    }
    scheduled = false;
    scheduledHandle = null;
    while (readQueue.size > 0 || writeQueue.size > 0) {
        flushFrame();
    }
}
