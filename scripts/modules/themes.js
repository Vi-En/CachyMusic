// CachyMusic theme selection and browser colors.
import { popModalState, pushModalState, safeStorage } from './utils.js';
import { store } from './state.js';
import { THEMES, normalizeThemeId } from './theme-catalog.js';
import { themeModal, themeQuickBtns, themeSelectCards, topThemeLabel } from './ui-elements.js';

    let themeTrigger;
    let closingThemeHistory = false;
    let queuedThemeOpen = false;

    function syncBrowserThemeColor(themeName) {
        if (typeof document === 'undefined') return;
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (!metaTheme) return;
        const color = THEMES[themeName].chrome;
        metaTheme.setAttribute('content', color);
        try { window.AndroidBridge?.setThemeChrome?.(color); } catch (_) {}
    }

    function applyTheme(themeName) {
        themeName = normalizeThemeId(themeName);
        document.documentElement.dataset.theme = themeName;
        document.body.removeAttribute('data-theme');
        syncBrowserThemeColor(themeName);
        store.setState({ activeTheme: themeName }, ['theme:change']);
        try {
            safeStorage.setItem('cachymusic_active_theme', themeName);
        } catch (_) {}
        try { window.AndroidBridge?.saveTheme?.(themeName); } catch (_) {}

        syncThemeUrl(themeName);

        const label = THEMES[themeName].name;
        for (const control of [...themeSelectCards, ...themeQuickBtns]) {
            const active = control.dataset.theme === themeName;
            control.classList.toggle('active', active);
            control.setAttribute('aria-pressed', String(active));
        }
        if (topThemeLabel) topThemeLabel.textContent = label;
        for (const id of ['settingsThemeCurrentLabel', 'settingsTabCurrentThemeBadge']) {
            const element = document.getElementById(id);
            if (element) element.textContent = label;
        }

        store.emit('ui:sync-signal-path');
        store.emit('ui:sync-dac-status');
        store.emit('peq:redraw');
        store.emit('visualizer:ensure-themes');
        store.emit('visualizer:resume');
    }

    function syncThemeUrl(themeName) {
        const url = new URL(window.location.href);
        if (url.searchParams.has('theme') && url.searchParams.get('theme') !== themeName) {
            url.searchParams.set('theme', themeName);
            history.replaceState(history.state, '', url);
        }
    }

    function openThemeModal(event) {
        if (!themeModal || themeModal.style.display === 'flex') return;
        if (event?.currentTarget) themeTrigger = event.currentTarget;
        if (closingThemeHistory) {
            queuedThemeOpen = true;
            return;
        }
        themeModal.style.display = 'flex';
        pushModalState('themeModal');
        const activeCard = themeModal.querySelector('.themeSelectCard.active');
        activeCard?.focus({ preventScroll: true });
        activeCard?.scrollIntoView({ block: 'nearest' });
    }

    function closeThemeModal() {
        if (!themeModal || themeModal.style.display !== 'flex') return;
        themeModal.style.display = 'none';
        themeTrigger?.focus({ preventScroll: true });
        if (history.state?.cachyModal === 'themeModal') {
            closingThemeHistory = true;
            popModalState('themeModal');
        }
    }

    window.addEventListener('popstate', () => {
        if (history.state?.cachyModal === 'themeModal') return;
        if (closingThemeHistory) {
            closingThemeHistory = false;
            syncThemeUrl(store.state.activeTheme);
            if (queuedThemeOpen) {
                queuedThemeOpen = false;
                queueMicrotask(openThemeModal);
            }
        } else {
            closeThemeModal();
        }
    });

    export {
        applyTheme,
        openThemeModal,
        closeThemeModal
    };

