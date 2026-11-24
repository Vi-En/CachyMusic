// Context ownership: synchronous creation for gesture handlers, single-flight
// asynchronous replacement. A failed close must never create a second graph.
export function createGraphLifecycle({ current, create, clear, ready = () => true, onError = console.warn }) {
    let replacement = null;
    function init() {
        if (replacement) return null;
        const ctx = current();
        if (ctx && ctx.state !== 'closed') return ready(ctx) ? ctx : null;
        try { if (ctx) clear(ctx); const next = create(); return next && ready(next) ? next : null; }
        catch (error) { onError(error); return null; }
    }
    function ensure(force = false) {
        if (replacement) return replacement;
        const ctx = current();
        if ((!force && (!ctx || ready(ctx))) || !ctx || ctx.state === 'closed') return Promise.resolve(init());
        // Publish the transition before executing any teardown callbacks.
        replacement = Promise.resolve().then(async () => {
            try { await ctx.close(); }
            catch (error) {
                onError(error);
                if (ctx.state !== 'closed') return ready(ctx) ? ctx : null;
            }
            clear(ctx);
            const next = create(); return next && ready(next) ? next : null;
        }).catch(error => { onError(error); return null; })
          .finally(() => { replacement = null; });
        return replacement;
    }
    return { init, ensure, get replacing() { return replacement !== null; } };
}

// One load attempt per context, including failed attempts. Worklet failures
// use the fallback route until a new context is explicitly constructed.
export function createWorkletLoader({ current, isCurrent, install, failed }) {
    const attempts = new WeakMap();
    return function load() {
        const ctx = current();
        if (!ctx?.audioWorklet || ctx.state === 'closed') return Promise.resolve();
        if (attempts.has(ctx)) return attempts.get(ctx);
        const task = Promise.resolve().then(async () => {
            await ctx.audioWorklet.addModule('scripts/dsp-worklet-processor.js?v=3.0.0-dev.6.18');
            if (isCurrent(ctx)) install(ctx);
        }).catch(error => { if (isCurrent(ctx)) failed(error); });
        attempts.set(ctx, task);
        return task;
    };
}

// Explicitly release all graph-owned references, including inactive fallback
// nodes. Never leave a closed graph discoverable by readers of the store.
const NODE_KEYS = ['audioSourceNode', 'softwareSourceNode', 'softwareSourceGainNode',
    'analyser', 'subsonicFilter', 'replayGainNode', 'preAmpGainNode', 'bassFilter',
    'vocalFilter', 'trebleFilter', 'ampGainNode', 'dspLimiter', 'ceilingTrimGain', 'ampSoftClipper'];
export function clearGraphNodes(state) {
    const disconnect = node => { try { node?.disconnect(); } catch (_) {} };
    if (state.softwareSourceNode) {
        state.softwareSourceNode.onended = null;
        try { state.softwareSourceNode.stop(); } catch (_) {}
    }
    for (const key of NODE_KEYS) { disconnect(state[key]); state[key] = null; }
    for (const node of state.peqNodes || []) disconnect(node);
    state.peqNodes = [];
    for (const node of state.xfeedNetwork?.nodes || []) disconnect(node);
    state.xfeedNetwork = null;
    // Secondary/gapless media nodes also retain their creating context.
    for (const media of [state.audio, state.secondaryAudio]) {
        if (!media) continue;
        disconnect(media._mediaSourceNode);
        // Keep only a marker that the element was previously bound; it may
        // not be used with another context even after the old context closes.
        if (media._mediaSourceNode) media._wasGraphBound = true;
        media._mediaSourceNode = null;
        media._mediaSourceContext = null;
    }
}
