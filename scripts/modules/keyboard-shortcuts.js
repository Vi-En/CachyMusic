/**
 * Global keyboard shortcuts and modal Escape/Undo routing extracted from app.js.
 */
import { visibleDialog } from './modal-focus.js';

export function installKeyboardShortcuts({
    store,
    compactLayout,
    tabLibrary,
    tabQueue,
    queueView,
    muteBtn,
    switchWorkspace,
    nextTrack,
    prevTrack,
    togglePlayPause,
    seekAudio,
    setVolume,
    toggleLyricsView,
    toggleMetadataPanel,
    toggleTracklistPanel,
    getPosition,
    openPeqModal,
    closePeqModal,
    modalClosers
}) {
    if (typeof window === 'undefined') return () => {};

    const onKeyDown = (e) => {
        if (document.getElementById('audioChangeDialog')?.open) return;

        // Custom Theme Studio Undo / Redo shortcuts while editor is open (lazy module, zero static dep)
        const studioEl = document.getElementById('customThemeStudioModal');
        if (studioEl && studioEl.style.display === 'flex') {
            if (e.code === 'Escape') {
                e.preventDefault();
                void import('./custom-theme-studio-ui.js').then(m => m.closeCustomThemeStudio({ discardPreview: true }));
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
                const tag = document.activeElement?.tagName?.toLowerCase();
                if (tag !== 'input' && tag !== 'textarea') {
                    e.preventDefault();
                    void import('./custom-theme-studio-ui.js').then(m => (e.shiftKey ? m.redoThemeStudio() : m.undoThemeStudio()));
                    return;
                }
            }
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'y' || e.key === 'Y')) {
                e.preventDefault();
                void import('./custom-theme-studio-ui.js').then(m => m.redoThemeStudio());
                return;
            }
        }

        // Only the topmost dialog receives Escape.
        if (e.code === 'Escape') {
            const dialog = visibleDialog();
            if (dialog) {
                const close = modalClosers[dialog.id];
                if (close) {
                    e.preventDefault();
                    close();
                }
                return;
            }
            if (document.activeElement?.id === 'trackSearch') document.activeElement.blur();
            return;
        }

        if (e.defaultPrevented || visibleDialog()) return;

        const activeTag = document.activeElement?.tagName?.toLowerCase() || '';
        const isEditable = ['input', 'select', 'textarea'].includes(activeTag) || document.activeElement?.isContentEditable;

        // Quick Search Shortcut: '/' or 'Cmd+K' / 'Ctrl+K'
        const isSearchTrigger = (e.key === '/' || ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')));
        if (isSearchTrigger && !isEditable) {
            const searchEl = document.getElementById('trackSearch');
            if (searchEl) {
                e.preventDefault();
                if (compactLayout.matches) {
                    switchWorkspace('player', 'trackListPanel');
                    tabLibrary?.click();
                }
                searchEl.focus();
                searchEl.select();
                return;
            }
        }

        // Workspace Hotkeys (Alt+S, Alt+D, Alt+O, Alt+P)
        if (e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            switchWorkspace(store.state.currentWorkspace === 'soulseek' ? 'player' : 'soulseek');
            return;
        }
        if (e.altKey && (e.code === 'KeyD' || e.key === 'd' || e.key === 'D' || e.code === 'KeyO' || e.key === 'o' || e.key === 'O')) {
            e.preventDefault();
            switchWorkspace(store.state.currentWorkspace === 'settings' ? 'player' : 'settings');
            return;
        }
        if (e.altKey && (e.code === 'KeyP' || e.key === 'p' || e.key === 'P')) {
            e.preventDefault();
            switchWorkspace('player');
            return;
        }

        if (isEditable) return;

        // Quick Queue Hotkey: 'Q'
        if ((e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q') && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            if (tabQueue && queueView && queueView.style.display !== 'none') tabLibrary?.click();
            else if (tabQueue) tabQueue.click();
            return;
        }

        // Quick Equalizer Hotkey: 'E'
        if ((e.code === 'KeyE' || e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            const peqBtn = document.getElementById('playerPeqBtn');
            if (peqBtn) {
                peqBtn.click();
            } else {
                const peqModalEl = document.getElementById('peqModal');
                if (peqModalEl && (peqModalEl.style.display === 'flex' || window.getComputedStyle(peqModalEl).display === 'flex')) {
                    if (typeof closePeqModal === 'function') closePeqModal();
                    else peqModalEl.style.display = 'none';
                } else if (typeof openPeqModal === 'function') {
                    openPeqModal();
                }
            }
            return;
        }

        // Background Tab & Focus Protection
        if (document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus())) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (document.activeElement?.closest('button, a[href], summary, [role=button], [role=slider], [role=tab]') && ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) return;

        if (e.code === 'Space') {
            e.preventDefault();
            togglePlayPause();
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            if (e.shiftKey) nextTrack();
            else seekAudio(getPosition() + 5);
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            if (e.shiftKey) prevTrack();
            else seekAudio(Math.max(0, getPosition() - 5));
        } else if (e.code === 'ArrowUp') {
            e.preventDefault();
            setVolume(store.state.currentVolumeValue + 0.05, true);
        } else if (e.code === 'ArrowDown') {
            e.preventDefault();
            setVolume(store.state.currentVolumeValue - 0.05, true);
        } else if (e.code === 'KeyM') {
            e.preventDefault();
            muteBtn?.click();
        } else if (e.code === 'KeyL') {
            e.preventDefault();
            toggleLyricsView();
        } else if (e.code === 'KeyI' || e.key === 'i' || e.key === 'I') {
            e.preventDefault();
            toggleMetadataPanel();
        } else if (e.code === 'KeyT' || e.key === 't' || e.key === 'T') {
            e.preventDefault();
            toggleTracklistPanel();
        } else if (e.code === 'KeyN' || e.key === 'n') {
            e.preventDefault();
            nextTrack();
        } else if (e.code === 'KeyP' || e.key === 'p') {
            e.preventDefault();
            prevTrack();
        }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
}
