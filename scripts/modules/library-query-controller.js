// One worker request at a time, with a bounded deadline and latest-only publication.
export function createLibraryQueryController({ createWorker, prepare, query, publish, isCurrent, timeoutMs = 10000, timers = globalThis }) {
    let worker = null, disabled = false, active = null, pending = null, deadline = null;
    function clearDeadline() {
        if (deadline !== null) timers.clearTimeout(deadline);
        deadline = null;
    }
    function local(job) {
        if (job && isCurrent(job)) publish(job, query(prepare(job), job.options));
    }
    function fail(owner) {
        if (owner !== worker) return;
        const latest = pending || active;
        clearDeadline();
        worker?.terminate();
        worker = null; disabled = true; active = pending = null;
        local(latest);
    }
    function dispatch() {
        if (active || !pending) return;
        active = pending; pending = null;
        const owner = worker, job = active;
        deadline = timers.setTimeout(() => fail(owner), timeoutMs);
        try { owner.postMessage({id:job.id, records:prepare(job), options:job.options}); }
        catch (_) { fail(owner); }
    }
    function submit(job, useWorker = true) {
        pending = null;
        if (!useWorker || disabled) { local(job); return; }
        if (!worker) {
            try { worker = createWorker(); }
            catch (_) { disabled = true; local(job); return; }
            const owner = worker;
            owner.onmessage = ({data}) => {
                if (worker !== owner || !active || data?.id !== active.id) return;
                const indices = data.indices;
                if (!Array.isArray(indices) || indices.some(i => !Number.isInteger(i) || i < 0 || i >= active.tracks.length) || new Set(indices).size !== indices.length) { fail(owner); return; }
                const completed = active;
                clearDeadline(); active = null;
                if (isCurrent(completed)) publish(completed, indices);
                dispatch();
            };
            owner.onerror = owner.onmessageerror = () => fail(owner);
        }
        pending = job;
        dispatch();
    }
    function cancelPending() { pending = null; }
    function dispose() {
        clearDeadline(); worker?.terminate(); worker = null; active = pending = null;
    }
    return {submit, cancelPending, dispose};
}
