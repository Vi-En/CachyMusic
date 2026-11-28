// Single-source PWA Install State Machine, Help Sheet, WCO & Desktop File Handling (P08)
import { store } from './state.js';
import { showCachyToast } from './utils.js';

export const INSTALL_STATES = Object.freeze([
    'standalone',
    'prompt-ready',
    'help-only',
    'unavailable',
    'prompt-in-flight',
    'dismissed'
]);

const AUDIO_EXTENSIONS = /\.(mp3|flac|wav|ogg|m4a|mp4|aac|opus|alac|webm|aif|aiff)$/i;

export function detectStandaloneDisplayMode(win = (typeof window !== 'undefined' ? window : null)) {
    if (!win) return false;
    try {
        if (win.matchMedia?.('(display-mode: standalone)')?.matches) return true;
        if (win.matchMedia?.('(display-mode: window-controls-overlay)')?.matches) return true;
    } catch (_) {}
    return win.navigator?.standalone === true;
}

export function createInstallController({
    win = (typeof window !== 'undefined' ? window : null),
    doc = (typeof document !== 'undefined' ? document : null),
    onLaunchFiles = null
} = {}) {
    let state = detectStandaloneDisplayMode(win) ? 'standalone' : 'help-only';
    let deferredPrompt = null;
    let wcoCleanup = null;
    let helpTriggerEl = null;
    let launchTriggerEl = null;

    function isNativeAndroid() {
        return Boolean(win?.AndroidBridge && typeof win.AndroidBridge.isAndroid === 'function' && win.AndroidBridge.isAndroid());
    }

    function syncUi() {
        if (!doc) return;
        const btn = doc.getElementById('installAppBtn');
        const statusPill = doc.getElementById('downloadPwaStatusPill');
        const hintEl = doc.getElementById('pwaInstallHint');

        if (isNativeAndroid()) {
            state = 'unavailable';
            if (btn) btn.style.display = 'none';
            return;
        }

        if (btn) {
            if (state === 'standalone' || state === 'unavailable') {
                btn.style.display = 'none';
            } else {
                btn.style.display = 'inline-flex';
                btn.disabled = state === 'prompt-in-flight';
                if (state === 'prompt-ready') {
                    btn.textContent = 'Install app';
                    btn.setAttribute('aria-label', 'Install CachyMusic');
                } else {
                    btn.textContent = 'Installation help';
                    btn.setAttribute('aria-label', 'Installation help');
                }
            }
        }

        if (statusPill) {
            statusPill.classList.toggle('active', state === 'standalone' || state === 'prompt-ready');
            if (state === 'standalone') statusPill.textContent = 'Installed (Standalone)';
            else if (state === 'prompt-ready') statusPill.textContent = 'Install Ready';
            else if (state === 'prompt-in-flight') statusPill.textContent = 'Waiting for confirmation…';
            else if (state === 'dismissed') statusPill.textContent = 'Install dismissed';
            else statusPill.textContent = 'Browser mode (Help available)';
        }

        if (hintEl) {
            if (state === 'standalone') {
                hintEl.textContent = 'CachyMusic is running as an installed standalone application.';
            } else if (state === 'prompt-ready') {
                hintEl.textContent = 'Your browser supports direct app installation.';
            } else {
                hintEl.textContent = 'Open Installation help for platform options, or keep using CachyMusic directly in your browser.';
            }
        }
    }

    function openInstallHelpDialog() {
        if (!doc) return false;
        const dialog = doc.getElementById('installHelpDialog');
        if (!dialog) {
            showCachyToast('Use your browser menu to install or add CachyMusic to Home Screen / Dock.');
            return false;
        }
        helpTriggerEl = doc.activeElement;
        if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
        else dialog.setAttribute('open', '');
        const closeBtn = doc.getElementById('installHelpCloseBtn');
        closeBtn?.focus?.({ preventScroll: true });
        return true;
    }

    async function promptInstall() {
        if (state === 'standalone') {
            showCachyToast('CachyMusic is already running in standalone mode.');
            return state;
        }
        if (state === 'prompt-in-flight') return state;
        if (!deferredPrompt) {
            openInstallHelpDialog();
            return state;
        }
        const promptEvent = deferredPrompt;
        deferredPrompt = null;
        store.state.deferredInstallPrompt = null;
        state = 'prompt-in-flight';
        syncUi();
        try {
            if (typeof promptEvent.prompt === 'function') await promptEvent.prompt();
            const choice = await promptEvent.userChoice;
            // Accepted prompt signals browser intent only; wait for appinstalled/standalone display-mode to claim installed.
            state = choice?.outcome === 'accepted' ? 'help-only' : 'dismissed';
        } catch (_) {
            state = 'help-only';
        }
        syncUi();
        return state;
    }

    function setupWindowControlsOverlay() {
        const nav = win?.navigator;
        const root = doc?.documentElement;
        if (!nav || !('windowControlsOverlay' in nav) || !nav.windowControlsOverlay || !root) return;
        const wco = nav.windowControlsOverlay;
        const handleWcoChange = () => {
            const visible = Boolean(wco.visible);
            doc.body?.classList?.toggle('wco-active', visible);
            if (visible && typeof wco.getTitlebarAreaRect === 'function') {
                const rect = wco.getTitlebarAreaRect();
                const height = rect && Number.isFinite(rect.height) && rect.height > 0 ? `${Math.round(rect.height)}px` : '0px';
                root.style.setProperty('--wco-titlebar-height', height);
            } else {
                root.style.setProperty('--wco-titlebar-height', '0px');
            }
        };
        wco.addEventListener?.('geometrychange', handleWcoChange);
        handleWcoChange();
        wcoCleanup = () => wco.removeEventListener?.('geometrychange', handleWcoChange);
    }

    function openFileLaunchPrompt(files) {
        if (!files.length) return false;
        const dialog = doc?.getElementById('fileLaunchDialog');
        const summary = doc?.getElementById('fileLaunchSummary');
        const playBtn = doc?.getElementById('fileLaunchPlayBtn');
        const queueBtn = doc?.getElementById('fileLaunchQueueBtn');
        if (!dialog || !playBtn || !queueBtn) {
            if (onLaunchFiles) void onLaunchFiles(files, 'queue');
            else store.emit('pwa:launch-files', { files, action: 'queue' });
            return false;
        }
        if (summary) {
            const first = files[0]?.name || 'Audio file';
            summary.textContent = files.length === 1
                ? `Open "${first}" in CachyMusic?`
                : `Open ${files.length} audio files (starting with "${first}")?`;
        }
        const closeLaunchDialog = () => {
            if (typeof dialog.close === 'function' && dialog.open) dialog.close();
            else dialog.removeAttribute('open');
            launchTriggerEl?.focus?.({ preventScroll: true });
            launchTriggerEl = null;
        };
        const dispatch = (action) => {
            closeLaunchDialog();
            if (onLaunchFiles) void onLaunchFiles(files, action);
            else store.emit('pwa:launch-files', { files, action });
        };
        playBtn.onclick = () => dispatch('play');
        queueBtn.onclick = () => dispatch('queue');
        launchTriggerEl = doc?.activeElement || null;
        if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
        else dialog.setAttribute('open', '');
        playBtn.focus({ preventScroll: true });
        return true;
    }

    function setupFileLaunchConsumer() {
        if (!win || !('launchQueue' in win) || !win.launchQueue || typeof win.launchQueue.setConsumer !== 'function') return;
        try {
            win.launchQueue.setConsumer(async (launchParams) => {
                const handles = Array.isArray(launchParams?.files) ? launchParams.files : [];
                if (handles.length === 0) return;
                const validFiles = [];
                for (const handle of handles) {
                    try {
                        if (!handle || typeof handle.getFile !== 'function') continue;
                        const file = await handle.getFile();
                        if (!file || (!file.type?.startsWith('audio/') && !AUDIO_EXTENSIONS.test(file.name || ''))) continue;
                        validFiles.push(file);
                    } catch (_) {}
                }
                if (validFiles.length > 0) {
                    openFileLaunchPrompt(validFiles);
                }
            });
        } catch (_) {}
    }

    function init() {
        setupWindowControlsOverlay();
        setupFileLaunchConsumer();

        if (!win || !doc) return;

        doc.getElementById('installHelpDialog')?.addEventListener('close', () => {
            helpTriggerEl?.focus?.({ preventScroll: true });
            helpTriggerEl = null;
        });

        const btn = doc.getElementById('installAppBtn');
        btn?.addEventListener('click', () => {
            void promptInstall();
        });

        win.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            store.state.deferredInstallPrompt = e;
            if (state !== 'standalone') {
                state = 'prompt-ready';
                syncUi();
            }
        });

        win.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            store.state.deferredInstallPrompt = null;
            state = 'standalone';
            syncUi();
        });

        const standaloneQuery = win.matchMedia?.('(display-mode: standalone)');
        standaloneQuery?.addEventListener?.('change', () => {
            if (detectStandaloneDisplayMode(win)) {
                state = 'standalone';
                syncUi();
            }
        });

        syncUi();
    }

    return {
        getState: () => state,
        setDeferredPrompt(e) {
            deferredPrompt = e;
            if (e && state !== 'standalone') state = 'prompt-ready';
            syncUi();
        },
        promptInstall,
        openInstallHelpDialog,
        setupWindowControlsOverlay,
        setupFileLaunchConsumer,
        init,
        destroy() {
            wcoCleanup?.();
            wcoCleanup = null;
        }
    };
}

let defaultController = null;

export function setupPwaInstallPrompt() {
    if (defaultController) return defaultController;
    defaultController = createInstallController();
    defaultController.init();
    return defaultController;
}

export async function triggerPwaInstallPrompt() {
    const ctrl = setupPwaInstallPrompt();
    return ctrl.promptInstall();
}
