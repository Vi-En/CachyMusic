// CachyMusic theme selection, Custom Theme coordination, and browser colors.
import { escapeHtml, popModalState, pushModalState, safeStorage } from './utils.js';
import { store } from './state.js';
import { THEMES, normalizeThemeId } from './theme-catalog.js';
import { themeModal, themeQuickBtns, themeSelectCards, topThemeLabel } from './ui-elements.js';
import {
    applyCustomTheme,
    clearCustomThemeOverrides,
    getActiveCustomTheme
} from './custom-theme-engine.js';
import { getCustomTheme, listCustomThemes } from './custom-theme-store.js';

let themeTrigger;
let closingThemeHistory = false;
let queuedThemeOpen = false;
let studioModulePromise = null;

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

async function applyTheme(themeName) {
    if (typeof themeName === 'string' && themeName.startsWith('custom:')) {
        const saved = await getCustomTheme(themeName);
        if (saved) {
            const applied = await applyCustomTheme(saved, { persist: true });
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

    clearCustomThemeOverrides({ clearStorage: true });
    themeName = normalizeThemeId(themeName);
    document.documentElement.dataset.theme = themeName;
    document.body?.removeAttribute('data-theme');
    syncBrowserThemeColor(themeName);
    store.setState({ activeTheme: themeName }, ['theme:change']);
    try {
        safeStorage.setItem('cachymusic_active_theme', themeName);
    } catch (_) {}
    try { window.AndroidBridge?.saveTheme?.(themeName); } catch (_) {}

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
    const themes = await listCustomThemes();
    const activeId = getActiveCustomTheme()?.id || store.state.activeTheme;

    if (themes.length === 0) {
        grid.innerHTML = '<p class="themeCardDesc">No custom themes saved yet. Click "Create / Customize Theme" to design one.</p>';
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
        selectBtn.innerHTML =
            `<span class="themeCardPreview" style="background:${escapeHtml(ct.colors.bgCanvas)};border-color:${escapeHtml(ct.colors.borderControl)};" aria-hidden="true">` +
            `<span class="previewDot" style="background:${escapeHtml(ct.colors.accent)};"></span>` +
            `<span class="previewDot" style="background:${escapeHtml(ct.colors.textPrimary)};"></span>` +
            `<span class="previewDot" style="background:${escapeHtml(ct.colors.surface2)};"></span>` +
            `</span>` +
            `<span class="themeCardContent">` +
            `<span class="themeCardHeading"><span class="themeCardTitle">${escapeHtml(ct.name)}</span><span class="themeActivePill">ACTIVE</span></span>` +
            `<span class="themeCardDesc">${escapeHtml(ct.mode === 'light' ? 'Light' : 'Dark')} · ${escapeHtml(ct.backgrounds.canvas.mode)} · ${escapeHtml(ct.notificationStyle)}</span>` +
            `</span>`;
        selectBtn.addEventListener('click', () => {
            void applyTheme(ct.id);
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
    await mod?.openCustomThemeStudio?.(themeIdOrBase);
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
