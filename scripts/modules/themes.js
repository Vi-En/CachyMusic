// CachyMusic theme selection, Custom Theme coordination, and browser colors.
import { popModalState, pushModalState, safeStorage } from './utils.js';
import { store } from './state.js';
import { SYSTEM_THEME_PAIR, THEMES, normalizeThemeId } from './theme-catalog.js';
import { themeModal, themeQuickBtns, themeSelectCards, topThemeLabel } from './ui-elements.js';

let enginePromise = null;
let storePromise = null;

async function loadCustomThemeEngine() {
    if (!enginePromise) {
        enginePromise = import('./custom-theme-engine.js').catch(err => {
            enginePromise = null;
            console.warn('[Themes] Failed to load custom theme engine:', err);
            return null;
        });
    }
    return enginePromise;
}

async function loadCustomThemeStore() {
    if (!storePromise) {
        storePromise = import('./custom-theme-store.js').catch(err => {
            storePromise = null;
            console.warn('[Themes] Failed to load custom theme store:', err);
            return null;
        });
    }
    return storePromise;
}

let themeTrigger;
let closingThemeHistory = false;
let queuedThemeOpen = false;
let studioModulePromise = null;
let systemSchemeQuery = null;
let systemSchemeListener = null;
let motionQuery = null;
let motionListener = null;

const THEME_MODE_KEY = 'cachymusic_theme_mode';

function syncBrowserThemeColor(themeName, customChromeHex = null) {
    if (typeof document === 'undefined') return;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) return;
    const color = customChromeHex || THEMES[themeName]?.chrome || THEMES.default.chrome;
    metaTheme.setAttribute('content', color);
    try { window.AndroidBridge?.setThemeChrome?.(color); } catch (_) {}
}

function updateActiveThemeIndicators(activeId, label) {
    for (const control of [...themeSelectCards, ...themeQuickBtns, ...document.querySelectorAll('#customThemeModalGrid .themeSelectCard')]) {
        const active = control.dataset.theme === activeId;
        control.classList.toggle('active', active);
        control.setAttribute('aria-pressed', String(active));
    }
    if (topThemeLabel) topThemeLabel.textContent = label;
    for (const id of ['settingsThemeCurrentLabel', 'settingsTabCurrentThemeBadge']) {
        const element = document.getElementById(id);
        if (element) element.textContent = label;
    }
}

async function applyTheme(themeName, options = {}) {
    const source = options === true
        ? 'explicit'
        : (options === false ? 'boot' : (options?.source || 'explicit'));

    if (source === 'explicit') {
        try { safeStorage.setItem(THEME_MODE_KEY, 'explicit'); } catch (_) {}
        const sysToggle = typeof document !== 'undefined' ? document.getElementById('themeSystemModeToggle') : null;
        if (sysToggle) sysToggle.checked = false;
    }

    if (typeof themeName === 'string' && themeName.startsWith('custom:')) {
        const [storeMod, engineMod] = await Promise.all([loadCustomThemeStore(), loadCustomThemeEngine()]);
        const saved = await storeMod?.getCustomTheme?.(themeName);
        if (saved && engineMod?.applyCustomTheme) {
            const applied = await engineMod.applyCustomTheme(saved, { persist: source !== 'system' });
            updateActiveThemeIndicators(applied.id, `${applied.name} (Custom)`);
            store.emit('ui:sync-signal-path');
            store.emit('ui:sync-dac-status');
            store.emit('peq:redraw');
            store.emit('visualizer:ensure-themes');
            store.emit('visualizer:resume');
            return applied;
        }
        themeName = 'default';
    }

    const hadCustom = typeof document !== 'undefined' && (
        document.documentElement.dataset.theme === 'custom' ||
        Boolean(store.state.activeCustomThemeMeta) ||
        Boolean(safeStorage.getItem('cachymusic_custom_theme_snapshot'))
    );
    if (hadCustom) {
        const engineMod = await loadCustomThemeEngine();
        engineMod?.clearCustomThemeOverrides?.({ clearStorage: source !== 'system' });
    }
    themeName = normalizeThemeId(themeName);
    document.documentElement.dataset.theme = themeName;
    document.body?.removeAttribute('data-theme');
    syncBrowserThemeColor(themeName);
    store.setState({ activeTheme: themeName }, ['theme:change']);
    if (source !== 'system') {
        try {
            safeStorage.setItem('cachymusic_active_theme', themeName);
        } catch (_) {}
        try { window.AndroidBridge?.saveTheme?.(themeName); } catch (_) {}
    }

    syncThemeUrl(themeName);
    updateActiveThemeIndicators(themeName, THEMES[themeName].name);

    store.emit('ui:sync-signal-path');
    store.emit('ui:sync-dac-status');
    store.emit('peq:redraw');
    store.emit('visualizer:ensure-themes');
    store.emit('visualizer:resume');
    return themeName;
}

function syncThemeUrl(themeName) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('theme') && url.searchParams.get('theme') !== themeName) {
        url.searchParams.set('theme', themeName);
        history.replaceState(history.state, '', url);
    }
}

export async function renderCustomThemeCardsInModal() {
    if (typeof document === 'undefined') return;
    const grid = document.getElementById('customThemeModalGrid');
    if (!grid) return;
    const storeMod = await loadCustomThemeStore();
    const themes = (await storeMod?.listCustomThemes?.()) || [];
    const activeId = store.state.activeCustomThemeMeta?.id || store.state.activeTheme;

    if (themes.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'themeCardDesc';
        empty.textContent = 'No custom themes saved yet. Click "Create / Customize Theme" to design one.';
        grid.replaceChildren(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    for (const ct of themes) {
        const isActive = activeId === ct.id && document.documentElement.dataset.theme === 'custom';
        const card = document.createElement('div');
        card.className = `themeSelectCard${isActive ? ' active' : ''}`;
        card.dataset.theme = ct.id;
        card.setAttribute('role', 'group');

        const selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.className = 'themeSelectCard';
        selectBtn.style.cssText = 'border:0;background:transparent;padding:0;flex:1;min-width:0;';
        selectBtn.dataset.theme = ct.id;
        selectBtn.setAttribute('aria-pressed', String(isActive));

        const preview = document.createElement('span');
        preview.className = 'themeCardPreview';
        preview.setAttribute('aria-hidden', 'true');
        preview.style.background = String(ct.colors.bgCanvas || '');
        preview.style.borderColor = String(ct.colors.borderControl || '');
        for (const swatchColor of [ct.colors.accent, ct.colors.textPrimary, ct.colors.surface2]) {
            const dot = document.createElement('span');
            dot.className = 'previewDot';
            dot.style.background = String(swatchColor || '');
            preview.appendChild(dot);
        }

        const content = document.createElement('span');
        content.className = 'themeCardContent';
        const heading = document.createElement('span');
        heading.className = 'themeCardHeading';
        const titleEl = document.createElement('span');
        titleEl.className = 'themeCardTitle';
        titleEl.textContent = String(ct.name || 'Custom');
        const activePill = document.createElement('span');
        activePill.className = 'themeActivePill';
        activePill.textContent = 'ACTIVE';
        heading.append(titleEl, activePill);

        const descEl = document.createElement('span');
        descEl.className = 'themeCardDesc';
        const modeLabel = ct.mode === 'light' ? 'Light' : 'Dark';
        const bgMode = ct.backgrounds?.canvas?.mode || 'solid';
        const notifStyle = ct.notificationStyle || 'segmented';
        descEl.textContent = `${modeLabel} · ${bgMode} · ${notifStyle}`;
        content.append(heading, descEl);

        selectBtn.append(preview, content);
        selectBtn.addEventListener('click', () => {
            void applyTheme(ct.id, { source: 'explicit' });
            closeThemeModal();
        });

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'ctMiniCardBtn';
        editBtn.textContent = 'Edit';
        editBtn.setAttribute('aria-label', `Edit custom theme ${ct.name}`);
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeThemeModal();
            void openThemeStudio(ct.id);
        });

        card.append(selectBtn, editBtn);
        frag.appendChild(card);
    }
    grid.replaceChildren(frag);
}

export async function openThemeStudio(themeIdOrBase = null) {
    if (!studioModulePromise) {
        studioModulePromise = import('./custom-theme-studio-ui.js').catch(err => {
            studioModulePromise = null;
            console.warn('[ThemeStudio] Failed to load module:', err);
            return null;
        });
    }
    const mod = await studioModulePromise;
    await mod?.openCustomThemeStudio?.(themeIdOrBase, {
        applyTheme,
        renderCustomThemeCardsInModal,
        updateActiveThemeIndicators
    });
}

export function resolveSystemThemeId() {
    const prefersLight = typeof window !== 'undefined'
        && Boolean(window.matchMedia?.('(prefers-color-scheme: light)')?.matches);
    return prefersLight ? SYSTEM_THEME_PAIR.light : SYSTEM_THEME_PAIR.dark;
}

export function isSystemThemeModeEnabled() {
    return safeStorage.getItem(THEME_MODE_KEY) === 'system';
}

export async function setSystemThemeMode(enabled) {
    const useSystem = Boolean(enabled);
    try { safeStorage.setItem(THEME_MODE_KEY, useSystem ? 'system' : 'explicit'); } catch (_) {}
    const toggle = typeof document !== 'undefined' ? document.getElementById('themeSystemModeToggle') : null;
    if (toggle) toggle.checked = useSystem;
    if (useSystem) {
        return applyTheme(resolveSystemThemeId(), { source: 'system' });
    }
    const saved = safeStorage.getItem('cachymusic_active_theme') || 'default';
    return applyTheme(saved, { source: 'explicit' });
}

export function initSystemThemeMode() {
    if (typeof window === 'undefined') return;
    if (systemSchemeQuery && systemSchemeListener) {
        systemSchemeQuery.removeEventListener?.('change', systemSchemeListener);
    }
    systemSchemeQuery = typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: light)')
        : null;
    systemSchemeListener = () => {
        if (isSystemThemeModeEnabled()) {
            void applyTheme(resolveSystemThemeId(), { source: 'system' });
        }
    };
    systemSchemeQuery?.addEventListener?.('change', systemSchemeListener);

    const toggle = typeof document !== 'undefined' ? document.getElementById('themeSystemModeToggle') : null;
    if (toggle) {
        toggle.checked = isSystemThemeModeEnabled();
        if (!toggle.dataset.boundSystemTheme) {
            toggle.dataset.boundSystemTheme = 'true';
            toggle.addEventListener('change', () => {
                void setSystemThemeMode(toggle.checked);
            });
        }
    }
}

export function getMotionPreference() {
    return 'system';
}

export function setMotionPreference() {
    const sysReduce = typeof window !== 'undefined'
        && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    if (typeof document !== 'undefined') {
        document.documentElement.dataset.reducedMotion = sysReduce ? 'true' : 'false';
    }
    store.emit('motion:change', { mode: 'system', reduced: sysReduce });
    return sysReduce;
}

export function initMotionPreferences() {
    if (typeof window === 'undefined') return;
    try { safeStorage.removeItem?.('cachymusic_reduced_motion'); } catch (_) {}
    if (motionQuery && motionListener) {
        motionQuery.removeEventListener?.('change', motionListener);
    }
    motionQuery = typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    motionListener = () => setMotionPreference();
    motionQuery?.addEventListener?.('change', motionListener);
    setMotionPreference();
}

function openThemeModal(event) {
    if (!themeModal || themeModal.style.display === 'flex') return;
    if (event?.currentTarget) themeTrigger = event.currentTarget;
    if (closingThemeHistory) {
        queuedThemeOpen = true;
        return;
    }
    void renderCustomThemeCardsInModal();
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

if (typeof window !== 'undefined') {
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
}

export {
    applyTheme,
    openThemeModal,
    closeThemeModal,
    updateActiveThemeIndicators
};
