// Contextual Permission Preflight Dialog & Local Storage Controls (P08.4)
import { showToast } from './utils.js';
import { clearSavedDirectoryHandle } from './local-library.js';
import { store } from './state.js';

let activeHandlers = null;
let dialogTriggerEl = null;

function setDialogText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value || '');
}

/**
 * Show an accessible preflight dialog before triggering an OS/browser permission prompt.
 * `onContinue` MUST execute synchronously inside the Continue button click handler
 * so transient user activation is preserved for APIs like Notification.requestPermission().
 */
export function requestWithPreflight({
    title = 'Permission required',
    what = '',
    why = '',
    storageNote = '',
    revocationNote = '',
    onContinue,
    onCancel
} = {}) {
    if (typeof document === 'undefined') return false;
    const dialog = document.getElementById('permissionPreflightDialog');
    const continueBtn = document.getElementById('permPreflightContinueBtn');
    const cancelBtn = document.getElementById('permPreflightNotNowBtn');
    if (!dialog || !continueBtn || !cancelBtn) {
        if (typeof onContinue === 'function') onContinue();
        return false;
    }

    setDialogText('permissionPreflightTitle', title);
    setDialogText('permPreflightWhat', what);
    setDialogText('permPreflightWhy', why);
    setDialogText('permPreflightStorage', storageNote);
    setDialogText('permPreflightRevoke', revocationNote);

    if (activeHandlers) {
        continueBtn.removeEventListener('click', activeHandlers.onContinueClick);
        cancelBtn.removeEventListener('click', activeHandlers.onCancelClick);
        dialog.removeEventListener('close', activeHandlers.onClose);
    }

    const cleanup = () => {
        if (!activeHandlers) return;
        continueBtn.removeEventListener('click', activeHandlers.onContinueClick);
        cancelBtn.removeEventListener('click', activeHandlers.onCancelClick);
        dialog.removeEventListener('close', activeHandlers.onClose);
        activeHandlers = null;
    };

    const closeDialog = () => {
        if (typeof dialog.close === 'function' && dialog.open) dialog.close();
        else dialog.removeAttribute('open');
    };

    const onContinueClick = () => {
        // Invoke native permission API BEFORE any await or modal close tears down activation.
        try {
            if (typeof onContinue === 'function') onContinue();
        } finally {
            cleanup();
            closeDialog();
            dialogTriggerEl?.focus?.({ preventScroll: true });
            dialogTriggerEl = null;
        }
    };

    const onCancelClick = () => {
        cleanup();
        closeDialog();
        if (typeof onCancel === 'function') onCancel();
        dialogTriggerEl?.focus?.({ preventScroll: true });
        dialogTriggerEl = null;
    };

    const onClose = () => {
        cleanup();
        dialogTriggerEl?.focus?.({ preventScroll: true });
        dialogTriggerEl = null;
    };

    activeHandlers = { onContinueClick, onCancelClick, onClose };
    continueBtn.addEventListener('click', onContinueClick);
    cancelBtn.addEventListener('click', onCancelClick);
    dialog.addEventListener('close', onClose);

    dialogTriggerEl = document.activeElement;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
    continueBtn.focus({ preventScroll: true });
    return true;
}

export async function refreshStorageStatusUi() {
    if (typeof document === 'undefined') return;
    const statusEl = document.getElementById('settingsStorageStatus');
    const persistBtn = document.getElementById('settingsPersistStorageBtn');
    const navStorage = typeof navigator !== 'undefined' ? navigator.storage : null;
    if (!statusEl) return;

    if (!navStorage) {
        statusEl.textContent = 'Browser storage management unavailable in this context.';
        if (persistBtn) persistBtn.disabled = true;
        return;
    }

    try {
        const persisted = typeof navStorage.persisted === 'function'
            ? await navStorage.persisted()
            : false;
        let quotaText = '';
        if (typeof navStorage.estimate === 'function') {
            const est = await navStorage.estimate();
            if (est && Number.isFinite(est.quota) && est.quota > 0) {
                const usedMb = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
                const quotaMb = (est.quota / (1024 * 1024)).toFixed(0);
                quotaText = ` (${usedMb} MB of ~${quotaMb} MB available)`;
            }
        }
        statusEl.textContent = persisted
            ? `Persistent storage granted${quotaText}. Browser eviction is reduced, though OS disk cleanup can still apply.`
            : `Best-effort storage${quotaText}. Browser may evict cached data under storage pressure.`;
        if (persistBtn) {
            persistBtn.disabled = typeof navStorage.persist !== 'function';
            persistBtn.textContent = persisted ? 'Persistent storage active' : 'Request persistent storage';
        }
    } catch (_) {
        statusEl.textContent = 'Could not read storage quota status.';
    }
}

let storageControlsBound = false;
export function setupLibraryStorageControls() {
    if (typeof document === 'undefined' || storageControlsBound) return;
    storageControlsBound = true;

    const revokeBtn = document.getElementById('settingsRevokeFolderBtn');
    const persistBtn = document.getElementById('settingsPersistStorageBtn');

    if (revokeBtn) {
        revokeBtn.addEventListener('click', async () => {
            await clearSavedDirectoryHandle();
            store.emit('library:directory-revoked');
            showToast('Saved folder access removed. Your audio files on disk were not modified.');
        });
    }

    if (persistBtn) {
        persistBtn.addEventListener('click', () => {
            if (!navigator.storage?.persist) {
                showToast('Persistent storage request is not supported by this browser.');
                return;
            }
            requestWithPreflight({
                title: 'Keep local library & covers longer?',
                what: 'Request persistent browser storage for your saved CachyMusic index and offline database.',
                why: 'Reduces the chance your browser automatically evicts saved metadata or offline artwork when disk space gets low.',
                storageNote: 'Data stays strictly on this device. Persistent status depends on your browser policy and is never guaranteed.',
                revocationNote: 'You can clear site data at any time in browser settings without affecting original audio files.',
                onContinue: () => {
                    Promise.resolve(navigator.storage.persist())
                        .then(granted => {
                            showToast(granted
                                ? 'Persistent storage granted by browser.'
                                : 'Browser kept best-effort storage (it may still retain data normally).');
                            void refreshStorageStatusUi();
                        })
                        .catch(() => {
                            showToast('Persistent storage request could not complete.');
                        });
                }
            });
        });
    }

    void refreshStorageStatusUi();
}
