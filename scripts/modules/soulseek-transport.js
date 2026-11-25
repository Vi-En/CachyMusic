// The deadline includes the response body, not just HTTP headers. Aborting a
// request does not imply that a remote mutation was cancelled; never retry it automatically.
export async function fetchSoulseekJson(url, init = {}, {timeoutMs = 20000, fetcher = globalThis.fetch} = {}) {
    const controller = new AbortController();
    const parent = init.signal;
    let timer;
    let onParentAbort;
    const operation = async () => {
        const response = await fetcher(url, {...init, signal: controller.signal});
        const data = await response.json();
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid Soulseek response');
        if (!response.ok && data.ok !== false) throw new Error(`Soulseek HTTP ${response.status}`);
        return data;
    };
    try {
        return await Promise.race([
            new Promise((_, reject) => {
                onParentAbort = () => { controller.abort(); reject(new Error('Soulseek request cancelled')); };
                if (parent?.aborted) { onParentAbort(); return; }
                parent?.addEventListener('abort', onParentAbort, {once:true});
                timer = setTimeout(() => { controller.abort(); reject(new Error('Soulseek request timed out; check status before retrying')); }, timeoutMs);
            }),
            Promise.resolve().then(() => {
                if (controller.signal.aborted) throw new Error('Soulseek request cancelled');
                return operation();
            })
        ]);
    } finally {
        clearTimeout(timer);
        parent?.removeEventListener('abort', onParentAbort);
    }
}

export function requireSoulseekSuccess(data) {
    if (data?.ok !== true) throw new Error(String(data?.error || data?.message || 'Soulseek operation failed'));
    return data;
}

export function downloadTransferId(data) {
    if (data?.ok !== true) return null;
    const id = data.id ?? data.data?.id;
    return typeof id === 'string' && id.trim() ? id : (Number.isSafeInteger(id) ? String(id) : null);
}
