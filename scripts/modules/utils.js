import {createNotificationCenter} from './notification-center.js';
import {createPreferenceStorage} from './preference-storage.js';
// CachyMusic - Utilities & Performance Shields

    // Cross-Browser Engine Optimization & Safe Storage Initialization
    const isFirefox = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);
    if (isFirefox && typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.add('is-firefox');
    }

    const safeStorage = createPreferenceStorage({
        local: () => globalThis.window?.localStorage,
        session: () => globalThis.window?.sessionStorage
    });

    const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '') ||
        (typeof window !== 'undefined' && 'ontouchstart' in window && window.innerWidth <= 768);

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hrs > 0) {
            return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function escapeHtml(str) {
        return (str || '').toString().replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    function escapeRegex(str) {
        return (str || '').toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function formatFileSize(bytes) {
        if (bytes === null || bytes === undefined || bytes === '') return 'N/A';
        if (typeof bytes === 'string' && /[a-zA-Z]/.test(bytes)) return bytes;
        const n = Number(bytes);
        if (!Number.isFinite(n) || n <= 0) return 'N/A';
        if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
        if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
        return (n / 1024).toFixed(1) + ' KB';
    }

    // Scan Directory via Server API

    let notify;
    function showToast(message, actionText = null, actionCallback = null, duration = 3200, level = 'info') {
        if (typeof document === 'undefined') return;
        notify ||= createNotificationCenter();
        return notify(message, actionText, actionCallback, duration, level);
    }

    function showCachyToast(title, message = '', level = 'info') {
        const text = message ? `${title}: ${message}` : String(title || '');
        showToast(text, null, null, 2800, level);
    }

    function setScanStatus(msg, isError = false) {
        if (typeof document === 'undefined') return;
        const scanStatusEl = document.getElementById('scanStatus');
        if (scanStatusEl) {
            scanStatusEl.textContent = msg;
            scanStatusEl.style.color = isError ? 'var(--status-danger)' : 'var(--text-secondary)';
        }
        const settingsTabScanStatus = document.getElementById('settingsTabScanStatus');
        if (settingsTabScanStatus) {
            settingsTabScanStatus.textContent = msg;
            settingsTabScanStatus.style.color = isError ? 'var(--status-danger)' : 'var(--text-accent)';
        }
    }

    let previousModalId = null;
    let explicitBackPending = false;
    let queuedModalId = null;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        window.addEventListener('popstate', () => {
            const leaving = previousModalId;
            previousModalId = history.state?.cachyModal || null;
            if (explicitBackPending) {
                // A close already ran its cleanup. A newly opened dialog must not
                // be closed by the earlier asynchronous history traversal.
                explicitBackPending = false;
                const queued = queuedModalId;
                queuedModalId = null;
                if (queued && document.getElementById(queued)?.getClientRects().length) pushModalState(queued);
                return;
            }
            if (!leaving || leaving === previousModalId || leaving === 'themeModal') return;
            const modal = document.getElementById(leaving);
            if (!modal?.getClientRects().length) return;
            const button = modal.querySelector('.closeModalBtn, .closeBtn');
            if (button) button.click();
            if(modal.getClientRects().length&&history.state?.cachyModal!==leaving)pushModalState(leaving);
        });
    }
    function pushModalState(modalId) {
        try {
            if (explicitBackPending) { queuedModalId = modalId; return; }
            if (typeof history !== 'undefined' && typeof history.pushState === 'function') {
                if (history.state?.cachyModal !== modalId) history.pushState({ cachyModal: modalId }, '');
                previousModalId = modalId;
            }
        } catch (_) {}
    }

    function popModalState(modalId) {
        try {
            if (explicitBackPending) {
                if (queuedModalId === modalId) queuedModalId = null;
                return;
            }
            if (typeof history !== 'undefined' && history.state && history.state.cachyModal === modalId) {
                explicitBackPending = true;
                history.back();
            }
        } catch (_) { explicitBackPending = false; }
    }

    function getValidSampleRate(rate) {
        const r = Number(rate);
        const validRates = [44100, 48000, 88200, 96000, 176400, 192000];
        if (validRates.includes(r)) return r;
        return 44100;
    }

    export {
        isFirefox,
        isMobileDevice,
        safeStorage,
        escapeHtml,
        escapeRegex,
        formatTime,
        formatFileSize,
        showToast,
        showCachyToast,
        setScanStatus,
        pushModalState,
        popModalState,
        getValidSampleRate
    };

