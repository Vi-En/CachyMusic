/**
 * Custom Theme Runtime Engine:
 * - Compiles validated CustomThemeV1 objects into strict allowlisted CSS Custom Properties
 * - Hydrates local background/texture Blobs via bounded ObjectURLs & OffscreenCanvas Worker
 * - Coordinates View Transitions, reduced-motion safety, and Android notification palette sync
 */
import { safeStorage } from './utils.js';
import { store } from './state.js';
import {
    EASING_PRESETS,
    resolveFontFamilyCss,
    validateAndNormalizeCustomTheme
} from './custom-theme-schema.js';
import { buildProceduralTextureUrl } from './custom-theme-textures.js';
import { auditThemeContrast, parseColor } from './color-contrast.js';
import {
    acquireAssetObjectUrl,
    clearCustomThemeSnapshot,
    getCustomTheme,
    revokeUnusedAssetUrls,
    saveCustomThemeSnapshot
} from './custom-theme-store.js';

let activeCustomTheme = null;
let androidSyncTimer = null;
let pendingAndroidPayload = null;
let assetWorker = null;
let workerJobSeq = 0;
let applyGeneration = 0;
let redrawRafId = 0;
const workerJobs = new Map();

function ensureWorker() {
    if (assetWorker || typeof Worker !== 'function') return assetWorker;
    try {
        assetWorker = new Worker(new URL('./theme-asset-worker.js', import.meta.url), { type: 'module' });
        assetWorker.onmessage = (event) => {
            const { id, ok, result, error } = event.data || {};
            const job = workerJobs.get(id);
            if (!job) return;
            workerJobs.delete(id);
            if (ok) job.resolve(result);
            else job.reject(new Error(error || 'Image processing failed'));
        };
        assetWorker.onerror = () => {
            for (const job of workerJobs.values()) job.reject(new Error('Theme asset worker error'));
            workerJobs.clear();
            try { assetWorker.terminate(); } catch (_) {}
            assetWorker = null;
        };
    } catch (_) {
        assetWorker = null;
    }
    return assetWorker;
}

/**
 * Downscale, validate, and extract palette from an image File/Blob off the main thread.
 */
export async function processThemeBackgroundImage(blob, options = {}) {
    const worker = ensureWorker();
    if (worker) {
        try {
            return await new Promise((resolve, reject) => {
                const id = ++workerJobSeq;
                workerJobs.set(id, { resolve, reject });
                worker.postMessage({ id, type: 'process-image', blob, options });
            });
        } catch (_) {
            // Fall back to main thread if worker module execution is restricted
        }
    }
    const { processThemeImageBlob } = await import('./theme-asset-worker.js');
    return await processThemeImageBlob(blob, options);
}

function getManagedVarsStyleEl() {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById('cachyCustomThemeVars');
    if (!el && document.head) {
        el = document.createElement('style');
        el.id = 'cachyCustomThemeVars';
        document.head.appendChild(el);
    }
    return el;
}

function hexAlpha(hex, alpha) {
    const rgb = parseColor(hex) || { r: 0.5, g: 0.5, b: 0.5 };
    const r = Math.round(rgb.r * 255);
    const g = Math.round(rgb.g * 255);
    const b = Math.round(rgb.b * 255);
    const a = Math.max(0, Math.min(1, Number(alpha) || 0)).toFixed(3);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function compileGradient(grad) {
    if (!grad || grad.type === 'none' || !Array.isArray(grad.stops) || grad.stops.length < 2) {
        return 'none';
    }
    const stopsCss = grad.stops.map(s => `${s.color} ${s.pos}%`).join(', ');
    if (grad.type === 'radial') {
        return `radial-gradient(circle at 50% 45%, ${stopsCss})`;
    }
    if (grad.type === 'conic') {
        return `conic-gradient(from ${grad.angle}deg at 50% 50%, ${stopsCss})`;
    }
    return `linear-gradient(${grad.angle}deg, ${stopsCss})`;
}

function resolveFitCss(fit, scalePct) {
    switch (fit) {
        case 'contain': return { size: 'contain', repeat: 'no-repeat' };
        case 'tile': return { size: `${Math.round((scalePct || 100) * 2.2)}px`, repeat: 'repeat' };
        case 'center': return { size: 'auto', repeat: 'no-repeat' };
        case 'cover':
        default: return { size: scalePct && scalePct !== 100 ? `${scalePct}% auto` : 'cover', repeat: 'no-repeat' };
    }
}

function resolveMotionVars(motion) {
    const profileMap = {
        instant: { scale: 0.05, ease: 'linear' },
        snappy: { scale: 0.65, ease: EASING_PRESETS.crisp },
        fluid: { scale: 1.0, ease: EASING_PRESETS.emphasized },
        expressive: { scale: 1.35, ease: EASING_PRESETS['expo-out'] },
        spring: { scale: 1.2, ease: EASING_PRESETS.spring },
        reduced: { scale: 0.01, ease: 'linear' }
    };
    const base = profileMap[motion.profile] || profileMap.fluid;
    const scale = motion.profile === 'reduced' ? 0.01 : Number(motion.durationScale ?? base.scale);
    let ease = base.ease;
    if (motion.easing === 'custom' && Array.isArray(motion.customBezier)) {
        const [x1, y1, x2, y2] = motion.customBezier;
        ease = `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
    } else if (motion.easing in EASING_PRESETS) {
        ease = EASING_PRESETS[motion.easing];
    }
    const ms = (v) => `${Math.max(1, Math.round(v * scale))}ms`;
    return {
        scale,
        ease,
        fast: ms(135),
        base: ms(235),
        smooth: ms(360)
    };
}

function shadowCss(level, mode) {
    const isLight = mode === 'light';
    switch (level) {
        case 'none': return { card: 'none', modal: 'none' };
        case 'subtle': return {
            card: isLight ? '0 2px 8px rgba(0,0,0,0.06)' : '0 4px 12px rgba(0,0,0,0.22)',
            modal: isLight ? '0 10px 28px rgba(0,0,0,0.12)' : '0 14px 36px rgba(0,0,0,0.45)'
        };
        case 'crisp': return {
            card: isLight ? '4px 4px 0 rgba(0,0,0,0.18)' : '4px 4px 0 rgba(0,0,0,0.55)',
            modal: isLight ? '8px 8px 0 rgba(0,0,0,0.24)' : '8px 8px 0 rgba(0,0,0,0.72)'
        };
        case 'deep': return {
            card: isLight ? '0 12px 32px rgba(0,0,0,0.14)' : '0 16px 40px rgba(0,0,0,0.58)',
            modal: isLight ? '0 24px 64px rgba(0,0,0,0.24)' : '0 28px 72px rgba(0,0,0,0.82)'
        };
        case 'soft':
        default: return {
            card: isLight ? '0 6px 18px rgba(0,0,0,0.08)' : '0 10px 28px rgba(0,0,0,0.38)',
            modal: isLight ? '0 18px 46px rgba(0,0,0,0.18)' : '0 22px 58px rgba(0,0,0,0.65)'
        };
    }
}

/**
 * Compile validated CSS variable assignments from CustomThemeV1.
 */
export function buildCssVariableMap(theme, resolvedUrls = {}) {
    const t = validateAndNormalizeCustomTheme(theme);
    const c = t.colors;
    const g = t.geometry;
    const ty = t.typography;
    const mVars = resolveMotionVars(t.motion);
    const sh = shadowCss(g.shadowLevel, t.mode);

    const buildBgVars = (prefix, scopeObj, fallbackHex, applySurfaceAlpha = false) => {
        const assetUrl = scopeObj.mode === 'image' && scopeObj.imageAssetId && resolvedUrls[scopeObj.imageAssetId]
            ? `url("${resolvedUrls[scopeObj.imageAssetId]}")`
            : 'none';
        const textureUrl = scopeObj.mode === 'texture' && scopeObj.textureId !== 'none'
            ? buildProceduralTextureUrl(scopeObj.textureId, scopeObj.textureColor, scopeObj.textureOpacity, scopeObj.textureScale)
            : 'none';
        const bgColor = applySurfaceAlpha ? hexAlpha(scopeObj.color || fallbackHex, g.surfaceOpacity) : (scopeObj.color || fallbackHex);
        const bgImage = scopeObj.mode === 'gradient' ? compileGradient(scopeObj.gradient) : 'none';
        const fitCss = resolveFitCss(scopeObj.fit, scopeObj.scale);
        const scrim = scopeObj.scrimOpacity > 0
            ? hexAlpha(scopeObj.scrimColor || c.bgCanvas, scopeObj.scrimOpacity)
            : 'transparent';
        return {
            [`--ct-${prefix}-bg`]: bgColor,
            [`--ct-${prefix}-bg-image`]: bgImage,
            [`--ct-${prefix}-image`]: assetUrl,
            [`--ct-${prefix}-image-size`]: fitCss.size,
            [`--ct-${prefix}-image-repeat`]: fitCss.repeat,
            [`--ct-${prefix}-image-pos`]: `${scopeObj.posX}% ${scopeObj.posY}%`,
            [`--ct-${prefix}-image-opacity`]: String(scopeObj.opacity),
            [`--ct-${prefix}-image-blur`]: `${scopeObj.blurPx}px`,
            [`--ct-${prefix}-blend`]: scopeObj.blendMode,
            [`--ct-${prefix}-texture`]: textureUrl,
            [`--ct-${prefix}-texture-size`]: `${scopeObj.textureScale}px`,
            [`--ct-${prefix}-scrim`]: scrim
        };
    };

    const densityScale = g.density === 'compact' ? '0.84' : g.density === 'spacious' ? '1.22' : '1';
    const fontScale = Number(ty.scale || 1).toFixed(3);
    const panelBorder = g.panelBorderWidth > 0 && g.panelBorderStyle !== 'none'
        ? `${g.panelBorderWidth}px ${g.panelBorderStyle} ${c.borderSurface}`
        : '0 solid transparent';
    const controlBorder = g.controlBorderWidth > 0
        ? `${g.controlBorderWidth}px solid ${c.borderControl}`
        : '0 solid transparent';
    const dividerBorder = g.dividerWidth > 0 && g.dividerStyle !== 'none'
        ? `${g.dividerWidth}px ${g.dividerStyle} ${c.borderDivider}`
        : '0 solid transparent';

    return {
        'color-scheme': t.mode,
        '--bg-canvas': c.bgCanvas,
        '--workspace-canvas': 'transparent',
        '--ct-studio-surface': c.surface1,
        '--bg-surface-1': hexAlpha(c.surface1, g.surfaceOpacity),
        '--workspace-panel': hexAlpha(c.surface1, g.surfaceOpacity),
        '--bg-surface-2': hexAlpha(c.surface2, Math.min(1, g.surfaceOpacity + 0.04)),
        '--bg-surface-3': c.surface3,
        '--bg-chrome': hexAlpha(c.surface1, Math.min(1, g.surfaceOpacity + 0.03)),
        '--workspace-header': hexAlpha(c.surface1, Math.min(1, g.surfaceOpacity + 0.03)),
        '--bg-glass': hexAlpha(c.surface1, Math.min(0.96, g.surfaceOpacity)),

        '--text-primary': c.textPrimary,
        '--text-secondary': c.textSecondary,
        '--text-muted': c.textMuted,
        '--text-disabled': c.textMuted,
        '--text-accent': c.accent,
        '--text-on-accent': c.textOnAccent,
        '--accent-color': c.accent,
        '--accent-primary': c.accent,
        '--accent-hover': c.secondary,
        '--accent-surface': hexAlpha(c.accent, 0.16),
        '--accent-glow': hexAlpha(c.accent, 0.34),
        '--ambient-aura-1': hexAlpha(c.accent, 0.16),
        '--ambient-aura-2': hexAlpha(c.secondary, 0.08),

        '--border-surface': c.borderSurface,
        '--border-control': c.borderControl,
        '--border-divider': c.borderDivider,
        '--border-subtle': c.borderDivider,
        '--border-medium': c.borderControl,
        '--border-bold': c.accent,
        '--border-focus': c.borderFocus,
        '--quiet-line': c.borderDivider,
        '--quiet-fill': hexAlpha(c.surface2, 0.72),

        '--status-success': c.statusSuccess,
        '--status-warning': c.statusWarning,
        '--status-danger': c.statusDanger,

        '--identity-radius': `${g.panelRadius}px`,
        '--surface-radius': `${g.panelRadius}px`,
        '--group-radius': `${g.panelRadius}px`,
        '--chrome-radius': `${g.controlRadius}px`,
        '--control-radius': `${g.controlRadius}px`,
        '--nav-radius': `${g.controlRadius}px`,
        '--shape-field': `${g.controlRadius}px`,
        '--shape-action': `${g.controlRadius}px`,
        '--shape-nav': `${Math.min(g.controlRadius, 10)}px`,
        '--shape-dialog': `${Math.max(g.panelRadius, 8)}px`,
        '--shape-thumb': `${g.thumbRadius}px`,
        '--shape-primary': g.playRadius >= 50 ? '50%' : `${g.playRadius}%`,
        '--play-radius': g.playRadius >= 50 ? '50%' : `${g.playRadius}%`,
        '--album-radius': `${g.thumbRadius * 2}px`,
        '--play-ink': c.accent,
        '--play-ground': c.textOnAccent,
        '--nav-selected': hexAlpha(c.accent, 0.16),
        '--group-fill': hexAlpha(c.surface2, 0.56),
        '--group-edge': `${g.panelBorderWidth}px`,

        '--ct-panel-border': panelBorder,
        '--ct-panel-border-width': `${g.panelBorderWidth}px`,
        '--ct-panel-border-style': g.panelBorderStyle,
        '--ct-control-border': controlBorder,
        '--ct-control-border-width': `${g.controlBorderWidth}px`,
        '--ct-divider-border': dividerBorder,
        '--ct-glass-blur': g.glassBlurPx > 0 ? `${g.glassBlurPx}px` : '0px',
        '--ct-density-scale': densityScale,
        '--shadow-card': sh.card,
        '--shadow-modal': sh.modal,

        '--font-display': resolveFontFamilyCss(ty.displayFont, ty.displayCustomName),
        '--player-title-font': resolveFontFamilyCss(ty.displayFont, ty.displayCustomName),
        '--font-body': resolveFontFamilyCss(ty.bodyFont, ty.bodyCustomName),
        '--font-mono': resolveFontFamilyCss(ty.monoFont, ty.monoCustomName),
        '--ct-font-scale': fontScale,
        '--player-title-weight': String(ty.titleWeight),
        '--ct-body-weight': String(ty.bodyWeight),
        '--player-title-spacing': `${ty.titleTracking}em`,
        '--ct-heading-case': ty.headingCase === 'uppercase' ? 'uppercase' : 'none',
        '--ct-heading-variant': ty.headingCase === 'small-caps' ? 'small-caps' : 'normal',
        '--ct-line-height': String(ty.lineHeight),

        '--motion-scale': String(mVars.scale),
        '--motion-ease': mVars.ease,
        '--motion-feedback': mVars.ease,
        '--motion-short': mVars.fast,
        '--motion-standard': mVars.base,
        '--transition-fast': `${mVars.fast} ${mVars.ease}`,
        '--transition-base': `${mVars.base} ${mVars.ease}`,
        '--transition-smooth': `${mVars.smooth} ${mVars.ease}`,

        ...buildBgVars('canvas', t.backgrounds.canvas, c.bgCanvas, false),
        ...buildBgVars('panel', t.backgrounds.panels, c.surface1, true),
        ...buildBgVars('stage', t.backgrounds.stage, c.bgCanvas, true),
        ...buildBgVars('chrome', t.backgrounds.chrome, c.surface1, true)
    };
}

function writeCssVarsToDocument(varMap, theme) {
    if (typeof document === 'undefined') return;
    const styleEl = getManagedVarsStyleEl();
    if (!styleEl) return;

    const lines = [];
    for (const [k, v] of Object.entries(varMap)) {
        if (k === 'color-scheme') {
            lines.push(`color-scheme: ${v === 'light' ? 'light' : 'dark'};`);
            continue;
        }
        if (!k.startsWith('--')) continue;
        lines.push(`${k}: ${String(v)};`);
    }
    styleEl.textContent = `@layer custom-theme {\n  :root[data-theme="custom"] {\n    ${lines.join('\n    ')}\n  }\n}`;

    const root = document.documentElement;
    root.dataset.customThemeId = theme.id;
    root.dataset.motionView = theme.motion.viewTransition;
    root.dataset.motionModal = theme.motion.modalAnimation;
    root.dataset.motionBtn = theme.motion.buttonFeedback;
    root.dataset.motionTab = theme.motion.tabMorph;
    root.dataset.motionAmbient = theme.motion.ambientMotion;
    root.dataset.rowHoverLift = theme.motion.rowHoverLift ? '1' : '0';
    root.dataset.density = theme.geometry.density;
    root.dataset.hasCustomCanvasMedia = (theme.backgrounds.canvas.mode === 'image' || theme.backgrounds.canvas.mode === 'texture' || theme.backgrounds.canvas.mode === 'gradient') ? '1' : '0';
    root.dataset.hasCustomPanelMedia = (theme.backgrounds.panels.mode !== 'solid' || theme.backgrounds.panels.color !== theme.colors.surface1) ? '1' : '0';
}

function flushAndroidSyncNow() {
    if (androidSyncTimer) {
        clearTimeout(androidSyncTimer);
        androidSyncTimer = null;
    }
    if (!pendingAndroidPayload || typeof window === 'undefined') return;
    const { chrome, customJson } = pendingAndroidPayload;
    pendingAndroidPayload = null;
    try { window.AndroidBridge?.setThemeChrome?.(chrome); } catch (_) {}
    try { window.AndroidBridge?.saveCustomTheme?.(customJson); } catch (_) {}
}

if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushAndroidSyncNow);
}

function queueAndroidCustomSync(theme, immediate = false) {
    if (typeof document !== 'undefined') {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme.colors.bgCanvas);
    }
    const payloadJson = JSON.stringify({
        bg: theme.colors.bgCanvas,
        surface: theme.colors.surface1,
        accent: theme.colors.accent,
        secondary: theme.colors.secondary,
        liquid: theme.notificationStyle === 'liquid',
        light: theme.mode === 'light'
    });
    pendingAndroidPayload = { chrome: theme.colors.bgCanvas, customJson: payloadJson };
    if (immediate) {
        flushAndroidSyncNow();
        return;
    }
    if (androidSyncTimer) clearTimeout(androidSyncTimer);
    androidSyncTimer = setTimeout(flushAndroidSyncNow, 180);
}

/**
 * Apply a CustomThemeV1 cleanly to the DOM and optionally persist snapshot/Android state.
 */
export async function applyCustomTheme(rawTheme, { persist = true, previewOnly = false } = {}) {
    const myGen = ++applyGeneration;
    const theme = validateAndNormalizeCustomTheme(rawTheme);
    activeCustomTheme = theme;

    // Resolve any uploaded local background assets concurrently (skip async await when none needed)
    const neededAssetIds = new Set();
    const resolvedUrls = {};
    for (const scope of ['canvas', 'panels', 'stage', 'chrome']) {
        const aid = theme.backgrounds[scope]?.imageAssetId;
        if (theme.backgrounds[scope]?.mode === 'image' && aid) {
            neededAssetIds.add(aid);
        }
    }
    if (neededAssetIds.size > 0) {
        await Promise.all(Array.from(neededAssetIds).map(async (aid) => {
            const url = await acquireAssetObjectUrl(aid);
            if (url) resolvedUrls[aid] = url;
        }));
        if (myGen !== applyGeneration) return activeCustomTheme;
    }
    revokeUnusedAssetUrls(neededAssetIds);

    const varMap = buildCssVariableMap(theme, resolvedUrls);
    writeCssVarsToDocument(varMap, theme);

    if (typeof document !== 'undefined') {
        document.documentElement.dataset.theme = 'custom';
        document.body?.removeAttribute('data-theme');
    }
    store.setState({
        activeCustomThemeMeta: {
            id: theme.id,
            name: theme.name,
            viewTransition: theme.motion?.viewTransition || 'none',
            motionProfile: theme.motion?.profile || 'standard'
        }
    });

    if (persist && !previewOnly) {
        saveCustomThemeSnapshot(theme);
        try { safeStorage.setItem('cachymusic_active_theme', theme.id); } catch (_) {}
        store.setState({ activeTheme: theme.id }, ['theme:change']);
        queueAndroidCustomSync(theme, true);
    } else if (previewOnly) {
        queueAndroidCustomSync(theme, false);
        if (!redrawRafId) {
            const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
            redrawRafId = raf(() => {
                redrawRafId = 0;
                store.emit('visualizer:ensure-themes');
                store.emit('peq:redraw');
            });
        }
    }
    return theme;
}

/**
 * Remove custom theme runtime stylesheet & attributes when switching back to a built-in theme.
 */
export function clearCustomThemeOverrides({ clearStorage = true } = {}) {
    activeCustomTheme = null;
    store.setState({ activeCustomThemeMeta: null });
    if (typeof document !== 'undefined') {
        const styleEl = document.getElementById('cachyCustomThemeVars');
        if (styleEl) styleEl.textContent = '';
        const root = document.documentElement;
        const rootInlineVars = Array.from(root.style || []);
        for (const prop of rootInlineVars) {
            if (prop.startsWith('--')) root.style.removeProperty(prop);
        }
        for (const attr of ['customThemeId', 'motionView', 'motionModal', 'motionBtn', 'motionTab', 'motionAmbient', 'rowHoverLift', 'density', 'hasCustomCanvasMedia', 'hasCustomPanelMedia']) {
            delete root.dataset[attr];
        }
    }
    revokeUnusedAssetUrls(new Set());
    if (clearStorage) clearCustomThemeSnapshot();
}

export function getActiveCustomTheme() {
    return activeCustomTheme;
}

export function auditCustomTheme(theme) {
    const clean = validateAndNormalizeCustomTheme(theme);
    return auditThemeContrast({
        ...clean.colors,
        surfaceOpacity: clean.geometry.surfaceOpacity
    });
}

/**
 * Hydrate full IndexedDB background images & custom variables smoothly after initial boot.
 */
export async function hydrateActiveCustomThemeOnBoot() {
    if (typeof document === 'undefined') return null;
    const storedId = safeStorage.getItem('cachymusic_active_theme') || document.documentElement.dataset.customThemeId || '';
    if (!storedId.startsWith('custom:')) return null;
    const loaded = await getCustomTheme(storedId);
    if (!loaded) return null;
    return await applyCustomTheme(loaded, { persist: true });
}

/**
 * Execute a workspace DOM update wrapped in View Transitions when enabled by Custom Theme motion.
 */
export function runViewTransition(updateDomFn) {
    if (typeof updateDomFn !== 'function') return;
    if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
        updateDomFn();
        return;
    }
    const mode = activeCustomTheme?.motion?.viewTransition || 'none';
    const docMotion = typeof document !== 'undefined' ? document.documentElement?.dataset?.reducedMotion : undefined;
    const reduced = docMotion === 'true' || (docMotion !== 'false' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    if (mode === 'none' || reduced || activeCustomTheme?.motion?.profile === 'reduced') {
        updateDomFn();
        return;
    }
    try {
        document.startViewTransition(updateDomFn);
    } catch (_) {
        updateDomFn();
    }
}
