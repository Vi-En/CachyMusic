// UI-only limits; never cap the underlying network results or download queue.
export const SOULSEEK_RESULT_BATCH = 60;

export function resultPageWindow(total, requestedPage = 0) {
    const count = Number.isFinite(Number(total)) ? Math.max(0, Math.floor(Number(total))) : 0;
    const last = Math.max(0, Math.ceil(count / SOULSEEK_RESULT_BATCH) - 1);
    const page = Math.max(0, Math.min(last, Math.floor(Number(requestedPage) || 0)));
    const start = page * SOULSEEK_RESULT_BATCH;
    return {page, start, end: Math.min(count, start + SOULSEEK_RESULT_BATCH)};
}

export function clampTransferProgress(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(100, number));
}

export function transferActionSignature(item) {
    const progress = clampTransferProgress(item?.progress);
    // The backend can mark a transfer finished before changing its status text.
    // Actions must track completion as well as the status label.
    const finished = Boolean(item?.isFinished) || progress >= 100;
    return JSON.stringify([finished, item?.status || '', item?.localFile || '', item?.fileExists ?? null]);
}
