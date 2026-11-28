// App Badge controller: strictly reflects authoritative actionable Soulseek transfer count.
export function clampBadgeCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(999, Math.floor(n));
}

export async function updateAppBadge(count, nav = (typeof navigator !== 'undefined' ? navigator : null)) {
    const clamped = clampBadgeCount(count);
    if (!nav) return false;
    try {
        if (clamped === 0) {
            if (typeof nav.clearAppBadge === 'function') {
                await nav.clearAppBadge();
                return true;
            }
            return false;
        }
        if (typeof nav.setAppBadge === 'function') {
            await nav.setAppBadge(clamped);
            return true;
        }
    } catch (_) {}
    return false;
}

export async function clearAppBadge(nav = (typeof navigator !== 'undefined' ? navigator : null)) {
    if (!nav || typeof nav.clearAppBadge !== 'function') return false;
    try {
        await nav.clearAppBadge();
        return true;
    } catch (_) {
        return false;
    }
}
